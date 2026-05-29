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
const FUENTES = {
   drawings: path.normalize('\\\\nas\\Compartida Produccion\\DRAWINGS'),
   fotos:    path.normalize('\\\\nas\\Compartida Produccion\\FOTO DE PIEZAS (desde 2019)')
  //drawings: './test_nas/DRAWINGS',
  //fotos:    './test_nas/FOTOS'
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

  // Log de progreso para categorías principales
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

      // El P/N es el nombre de la carpeta que contiene el archivo.
      // Pero si esa carpeta se llama "DRAWINGS" o "FOTOS", subimos una más.
      let carpeta = path.dirname(full);
      let pn = path.basename(carpeta);
      const genericas = ['drawings', 'fotos', 'foto', 'photos', 'imagenes', 'images'];
      if (genericas.includes(pn.toLowerCase())) {
        pn = path.basename(path.dirname(carpeta));
      }

      const clave = pn.toUpperCase();
      if (!index[clave]) {
        index[clave] = { pn, pdfs: [], fotos: [], categorias: new Set() };
      }

      // categoría = primer nivel debajo de la fuente (TRANSFORMERS, CHOKES, ...)
      const rel = path.relative(FUENTES[tipo], full);
      const partes = rel.split(path.sep);
      // La categoría es el primer nivel de carpeta
      if (partes.length > 1) {
        index[clave].categorias.add(partes[0]);
      }

      const url = '/files/' + tipo + '/' + partes.map(encodeURIComponent).join('/');
      (esPlano ? index[clave].pdfs : index[clave].fotos)
        .push({ nombre: e.name, url });
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
