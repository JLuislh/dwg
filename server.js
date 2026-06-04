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
// pnFolder: ruta absoluta de la carpeta que actúa como P/N (null hasta que se identifica)
function escanear(base, tipo, index, nivel = 0, pnFolder = null) {
  let entradas;
  try {
    entradas = fs.readdirSync(base, { withFileTypes: true });
  } catch (err) {
    console.warn('No se pudo leer:', base, '-', err.code);
    return;
  }

  if (nivel === 1) console.log(`    [${tipo}] Leyendo: ${path.basename(base)}...`);

  // Determinar si esta carpeta es el P/N:
  // - Si ya tenemos pnFolder, lo mantenemos (estamos dentro de un P/N).
  // - En nivel 1 (bajo la raíz): si tiene archivos directos → es el P/N;
  //   si solo tiene subcarpetas → es una categoría, seguimos sin P/N.
  // - En nivel >= 2 sin P/N aún: esta carpeta ES el P/N (directo o sin categoría).
  let myPnFolder = pnFolder;
  if (myPnFolder === null && nivel > 0) {
    const tieneArchivosDirect = entradas.some(e => {
      if (e.isDirectory()) return false;
      const ext = path.extname(e.name).toLowerCase();
      return EXT_PLANO.includes(ext) || EXT_IMG.includes(ext);
    });
    if (tieneArchivosDirect || nivel >= 2) {
      myPnFolder = base;
    }
  }

  for (const e of entradas) {
    const full = path.join(base, e.name);
    if (e.isDirectory()) {
      escanear(full, tipo, index, nivel + 1, myPnFolder);
    } else {
      const ext = path.extname(e.name).toLowerCase();
      const esPlano = EXT_PLANO.includes(ext);
      const esImg = EXT_IMG.includes(ext);
      if (!esPlano && !esImg) continue;
      if (!myPnFolder) continue;

      const pn = path.basename(myPnFolder);
      const clave = pn.toUpperCase();
      if (!index[clave]) {
        index[clave] = { pn, pdfs: [], fotos: [], categorias: new Set() };
      }

      // Categoría = primera carpeta entre la raíz y el P/N
      const relPn = path.relative(FUENTES[tipo], myPnFolder);
      const partesPn = relPn.split(path.sep);
      if (partesPn.length > 1) index[clave].categorias.add(partesPn[0]);

      // Subcarpeta = ruta entre la carpeta P/N y el archivo
      const relFromPn = path.relative(myPnFolder, path.dirname(full));
      const subcarpeta = relFromPn || null;

      const rel = path.relative(FUENTES[tipo], full);
      const url = '/files/' + tipo + '/' + rel.split(path.sep).map(encodeURIComponent).join('/');
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
