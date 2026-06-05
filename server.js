// ============================================================
//  Visor de DRAWINGS y Fotos por P/N  -  web local
//  Corre en una PC con acceso a \\nas
// ============================================================
const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 3000;
const HOST = '0.0.0.0';            // accesible desde otras PCs de la red

// ---- Rutas del servidor de archivos --------------------------------
// Usa rutas UNC. En Windows van con doble backslash dentro del string.
// Rutas: variable de entorno > auto-detección por SO > rutas por defecto
const isWin = process.platform === 'win32';
const FUENTES = {
  drawings: process.env.PATH_DRAWINGS || (isWin
    ? path.normalize('\\\\nas\\Compartida Produccion\\DRAWINGS')
    : '/mnt/nas/drawings'),
  fotos: process.env.PATH_FOTOS || (isWin
    ? path.normalize('\\\\nas\\Compartida Produccion\\FOTO DE PIEZAS (desde 2019)')
    : '/mnt/nas/fotos')
};

const ARCHIVO_CACHE = path.join(__dirname, 'index-cache.json');

const EXT_PLANO = ['.pdf', '.dwg'];
const EXT_IMG = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.tif', '.tiff'];

// --------------------------------------------------------------------
// Escaneo recursivo: junta archivos por carpeta contenedora (= P/N)
// --------------------------------------------------------------------
function escanear(base, tipo, index, nivel = 0) {
  let entradas;
  try {
    entradas = fs.readdirSync(base, { withFileTypes: true });
  } catch (err) {
    console.warn('No se pudo leer:', base, '-', err.code);
    return;
  }

  if (nivel === 1) console.log(`    [${tipo}] Leyendo: ${path.basename(base)}...`);

  for (const e of entradas) {
    const full = path.join(base, e.name);
    if (e.isDirectory()) {
      escanear(full, tipo, index, nivel + 1);
    } else {
      const ext = path.extname(e.name).toLowerCase();
      const esPlano = EXT_PLANO.includes(ext);
      const esImg = EXT_IMG.includes(ext);
      if (!esPlano && !esImg) continue;

      const rel = path.relative(FUENTES[tipo], full);
      const partes = rel.split(path.sep);

      // partes: [cat?, pn, sub?..., archivo]
      // Depth 1 (pn/archivo): pn = partes[0]
      // Depth 2+ (cat/pn/[sub/]archivo): pn = partes[1]
      let pn, subOffset;
      if (partes.length === 1) continue;           // archivo en raíz, ignorar
      if (partes.length === 2) { pn = partes[0]; subOffset = 1; }  // pn/archivo
      else                     { pn = partes[1]; subOffset = 2; }  // cat/pn/[sub/]archivo

      const clave = pn.toUpperCase();
      if (!index[clave]) {
        index[clave] = { pn, pdfs: [], fotos: [], categorias: new Set() };
      }

      // Categoría = partes[0] cuando hay profundidad ≥ 3
      if (partes.length >= 3) index[clave].categorias.add(partes[0]);

      // Subcarpeta = carpetas entre el P/N y el archivo (si las hay)
      const subcarpeta = partes.length > subOffset + 1
        ? partes.slice(subOffset, -1).join('/')
        : null;

      const url = '/files/' + tipo + '/' + partes.map(encodeURIComponent).join('/');
      (esPlano ? index[clave].pdfs : index[clave].fotos)
        .push({ nombre: e.name, url, subcarpeta });
    }
  }
}

function construirIndice() {
  console.log('--- Iniciando escaneo del NAS ---');
  const t0 = Date.now();

  // Verificar acceso a las rutas antes de empezar
  for (const [key, ruta] of Object.entries(FUENTES)) {
    try {
      fs.accessSync(ruta, fs.constants.R_OK);
      console.log(`[OK] Ruta accesible: ${key} -> ${ruta}`);
    } catch (err) {
      console.warn(`¡ADVERTENCIA!: La ruta de ${key} no es accesible: ${ruta}`);
    }
  }

  const index = {};
  escanear(FUENTES.drawings, 'drawings', index);
  escanear(FUENTES.fotos, 'fotos', index);

  let nArchivos = 0;
  const lista = Object.values(index)
    .map(o => ({
      pn: o.pn,
      pdfs: o.pdfs,
      fotos: o.fotos,
      categorias: [...o.categorias],
      nPdf: o.pdfs.length,
      nFoto: o.fotos.length,
      totalArchivos: o.pdfs.length + o.fotos.length
    }))
    .filter(it => {
      nArchivos += it.totalArchivos;
      return it.totalArchivos > 0;
    })
    .sort((a, b) => a.pn.localeCompare(b.pn, undefined, { numeric: true }));

  const datos = { generado: new Date().toISOString(), total: lista.length, items: lista };
  try {
    fs.writeFileSync(ARCHIVO_CACHE, JSON.stringify(datos));
  } catch (e) {
    console.warn('¡ERROR! No se pudo escribir index-cache.json:', e.message);
  }
  console.log(`Escaneo completado: ${lista.length} P/N encontrados (${nArchivos} archivos) en ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  return datos;
}

function cargarCache() {
  try {
    if (fs.existsSync(ARCHIVO_CACHE)) {
      const raw = fs.readFileSync(ARCHIVO_CACHE, 'utf8');
      if (!raw) return null;
      const data = JSON.parse(raw);
      // Validar formato y que no esté vacío (si está vacío, preferimos reindexar)
      if (data && Array.isArray(data.items) && data.items.length > 0) {
        console.log(`Caché cargado: ${data.items.length} P/N desde index-cache.json`);
        return data;
      }
    }
  } catch (e) {
    console.warn('Caché inválido o corrupto, se reindexará.');
  }
  return null;
}

// Forzar carga inicial
let CACHE = cargarCache() || construirIndice();

// --------------------------------------------------------------------
//  Endpoints
// --------------------------------------------------------------------
app.get('/api/index', (req, res) => {
  const q = (req.query.q || '').trim().toUpperCase();
  
  if (!CACHE) {
    return res.json({ generado: null, total: 0, items: [], error: "Caché no disponible" });
  }

  if (!q) return res.json(CACHE);

  const items = CACHE.items.filter(it =>
    it.pn.toUpperCase().includes(q) ||
    it.categorias.some(c => c.toUpperCase().includes(q))
  );
  res.json({ generado: CACHE.generado, total: items.length, items });
});

app.get('/api/reindex', (req, res) => {
  CACHE = construirIndice();
  res.json({ ok: true, total: CACHE.total, generado: CACHE.generado });
});

// Diagnóstico: ver archivos crudos de un P/N
app.get('/api/debug/:pn', (req, res) => {
  const pn = req.params.pn.toUpperCase();
  const item = CACHE && CACHE.items.find(i => i.pn.toUpperCase() === pn);
  if (!item) return res.json({ error: 'P/N no encontrado' });
  res.json({ pn: item.pn, categorias: item.categorias, pdfs: item.pdfs, fotos: item.fotos.map(f=>f.nombre) });
});

// Diagnóstico: listar todos los P/N que tienen PDFs
app.get('/api/debug-pdfs', (req, res) => {
  if (!CACHE) return res.json({ error: 'Sin caché' });
  const conPdfs = CACHE.items
    .filter(i => i.nPdf > 0)
    .map(i => ({ pn: i.pn, nPdf: i.nPdf, categorias: i.categorias, pdfs: i.pdfs.map(f => f.nombre + (f.subcarpeta ? ' ['+f.subcarpeta+']' : '')) }));
  res.json({ total: conPdfs.length, items: conPdfs });
});

// Diagnóstico: buscar en qué P/N cayó un archivo por nombre parcial
app.get('/api/debug-find', (req, res) => {
  const q = (req.query.q || '').toUpperCase();
  if (!q || !CACHE) return res.json({ error: 'Falta ?q=nombre' });
  const resultados = [];
  for (const item of CACHE.items) {
    for (const f of item.pdfs) {
      if (f.nombre.toUpperCase().includes(q))
        resultados.push({ pn: item.pn, categorias: item.categorias, archivo: f.nombre, subcarpeta: f.subcarpeta, url: f.url });
    }
  }
  res.json({ encontrados: resultados.length, resultados });
});

// Servir los archivos reales del NAS
app.use('/files/drawings', express.static(FUENTES.drawings));
app.use('/files/fotos', express.static(FUENTES.fotos));

// Frontend
app.use(express.static(path.join(__dirname, 'public')));

app.listen(PORT, HOST, () => {
  console.log('\n  Visor P/N corriendo:');
  console.log('  - En esta PC:        http://localhost:' + PORT);
  console.log('  - Desde la red:      http://<IP-DE-ESTA-PC>:' + PORT);
  console.log('\n  Reindexar:           http://localhost:' + PORT + '/api/reindex\n');
});
