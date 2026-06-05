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

      // Subir desde la carpeta del archivo hasta encontrar la carpeta P/N.
      // Una carpeta P/N empieza con dígito (30316, 34563…).
      // Las categorías son palabras sin dígito inicial (TRANSFORMERS, DRAWINGS…).
      let pnDir = path.dirname(full);
      while (pnDir !== FUENTES[tipo] && !/^\d/.test(path.basename(pnDir))) {
        pnDir = path.dirname(pnDir);
      }
      if (pnDir === FUENTES[tipo]) continue;

      const pn = path.basename(pnDir);
      const clave = pn.toUpperCase();
      if (!index[clave]) {
        index[clave] = { pn, pdfs: [], fotos: [], categorias: new Set(), drawingsDirs: new Set() };
      }

      // Categoría = primera carpeta entre la raíz y el P/N
      const relPnDir = path.relative(FUENTES[tipo], pnDir);
      const partesPn = relPnDir.split(path.sep);
      if (partesPn.length > 1) index[clave].categorias.add(partesPn[0]);

      // Guardar la ruta relativa de la carpeta P/N (para el navegador de carpetas)
      if (tipo === 'drawings') {
        index[clave].drawingsDirs.add(relPnDir.split(path.sep).join('/'));
      }

      // Subcarpeta = ruta entre el P/N y el directorio del archivo
      const relSub = path.relative(pnDir, path.dirname(full));
      const subcarpeta = relSub ? relSub.split(path.sep).join('/') : null;

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
      drawingsDirs: [...(o.drawingsDirs || [])],
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

let CACHE = cargarCache() || construirIndice();

// --------------------------------------------------------------------
//  Endpoints
// --------------------------------------------------------------------
app.get('/api/index', (req, res) => {
  const q = (req.query.q || '').trim().toUpperCase();
  if (!CACHE) return res.json({ generado: null, total: 0, items: [], error: 'Caché no disponible' });
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

// Navegador de carpetas: lista archivos y subcarpetas de una ruta del NAS
app.get('/api/browse', (req, res) => {
  const source = req.query.source;
  if (!source || !FUENTES[source]) return res.status(400).json({ error: 'source inválido' });

  const base = path.resolve(FUENTES[source]);
  // Sanitizar: no permitir .. para salir del directorio base
  const relRaw = (req.query.path || '').replace(/\.\./g, '').replace(/^\/+/, '');
  const relNorm = relRaw.split('/').join(path.sep);
  const fullPath = relNorm ? path.resolve(path.join(FUENTES[source], relNorm)) : base;

  if (!fullPath.startsWith(base)) return res.status(403).json({ error: 'Acceso denegado' });

  let entries;
  try {
    entries = fs.readdirSync(fullPath, { withFileTypes: true });
  } catch (e) {
    return res.status(404).json({ error: 'No se pudo leer: ' + e.message });
  }

  const archivos = [], subcarpetas = [];
  for (const e of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (e.isDirectory()) {
      subcarpetas.push(e.name);
    } else {
      const ext = path.extname(e.name).toLowerCase();
      if (EXT_PLANO.includes(ext)) {
        const parts = relRaw ? relRaw.split('/').concat(e.name) : [e.name];
        const url = '/files/' + source + '/' + parts.map(encodeURIComponent).join('/');
        archivos.push({ nombre: e.name, url });
      }
    }
  }

  res.json({ path: relRaw, archivos, subcarpetas });
});

// Diagnóstico: ver archivos crudos de un P/N
app.get('/api/debug/:pn', (req, res) => {
  const pn = req.params.pn.toUpperCase();
  const item = CACHE && CACHE.items.find(i => i.pn.toUpperCase() === pn);
  if (!item) return res.json({ error: 'P/N no encontrado' });
  res.json({ pn: item.pn, categorias: item.categorias, drawingsDirs: item.drawingsDirs, pdfs: item.pdfs, fotos: item.fotos.map(f => f.nombre) });
});

// Diagnóstico: buscar en qué P/N cayó un archivo
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
// Forzar Content-Disposition:inline para PDFs (evita el cuadro "Guardar como")
const pdfHeaders = {
  setHeaders(res, filePath) {
    if (path.extname(filePath).toLowerCase() === '.pdf') {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'inline');
    }
  }
};
app.use('/files/drawings', express.static(FUENTES.drawings, pdfHeaders));
app.use('/files/fotos',    express.static(FUENTES.fotos));

// Frontend
app.use(express.static(path.join(__dirname, 'public')));

app.listen(PORT, HOST, () => {
  console.log('\n  Visor P/N corriendo:');
  console.log('  - En esta PC:        http://localhost:' + PORT);
  console.log('  - Desde la red:      http://<IP-DE-ESTA-PC>:' + PORT);
  console.log('\n  Reindexar:           http://localhost:' + PORT + '/api/reindex\n');
});
