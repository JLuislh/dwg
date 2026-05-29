---
name: visor-pn
description: Mantener y extender el Visor de Planos y Fotos por P/N, una web local en Node.js + Express que escanea \\nas\Compartida Produccion\DRAWINGS y \\nas\Compartida Produccion\FOTO DE PIEZAS (desde 2019), agrupa PDFs y fotos por número de parte (P/N), y los sirve con un buscador, visor PDF y galería con lightbox. Usa esta skill SIEMPRE que el usuario mencione el "visor de P/N", "visor de planos", "buscador de DWG/PDF/fotos", el servidor en `\\nas`, los archivos `server.js` o `public/index.html` de este proyecto, agregar filtros (por categoría, fecha, tipo de archivo), exportar/imprimir listas, soportar formatos nuevos (DWG nativo, TIFF, vídeo), mejorar el escaneo (paralelismo, watcher, indexación incremental), arreglar problemas de red/UNC/permisos en Windows, dejarlo como servicio con PM2 o NSSM, o cualquier cambio al backend Node o frontend HTML/JS del proyecto. Respondes en español, en tono directo y paso a paso, como espera Guicho.
---

# Visor de Planos y Fotos por P/N — Skill

Este proyecto es una web local que el equipo de planta usa para buscar planos (PDF) y fotos por número de parte. Corre en una PC con acceso al NAS y la abren desde la red.

## Arquitectura en una pantalla

```
[\\nas\Compartida Produccion\DRAWINGS\...]          ← PDFs por P/N
[\\nas\Compartida Produccion\FOTO DE PIEZAS\...]    ← imágenes por P/N
                  │
                  ▼
        server.js (Node + Express, puerto 3000)
          ├─ escanea recursivo ambas raíces
          ├─ agrupa archivos por carpeta contenedora = P/N
          ├─ cachea el índice en  index-cache.json
          ├─ GET  /api/index?q=...   → JSON filtrado
          ├─ GET  /api/reindex       → reescanea
          ├─ /files/drawings/*       → static (NAS, solo lectura)
          ├─ /files/fotos/*          → static (NAS, solo lectura)
          └─ /                       → public/index.html
                  │
                  ▼
        public/index.html (HTML+CSS+JS vanilla, sin build)
          ├─ buscador con debounce 220ms
          ├─ lista lateral de P/N con tags de categoría
          ├─ pestañas Planos / Fotos
          ├─ visor PDF en <iframe> (PDF.js del navegador)
          └─ galería + lightbox con flechas y Escape
```

Sin frameworks, sin bundler, sin base de datos. Es a propósito: tiene que correr en cualquier PC de oficina con solo `node` instalado.

## Reglas innegociables

1. **Read-only sobre el NAS.** Nunca escribir, mover, renombrar o borrar nada en `\\nas`. El servidor solo lee y sirve. Cualquier feature que requiera escribir va a una base local (SQLite, JSON local), nunca al NAS.
2. **Sin build step.** No agregar webpack, vite, React, TypeScript ni `npm run build`. El frontend es un solo `public/index.html` editable a mano. Si una feature pide librería, importarla por CDN dentro del HTML.
3. **Cero dependencias nuevas si se puede evitar.** Solo `express` está justificado. Antes de agregar otra dependencia, intentar resolverlo con stdlib de Node.
4. **Rutas UNC en Windows.** Dentro de strings JS van con doble backslash: `'\\\\nas\\Compartida Produccion\\DRAWINGS'`. Si el usuario reporta `ENOENT` al arrancar, revisar esto primero.
5. **Respuestas en español, directas, paso a paso.** Sin relleno. Si hay una decisión de diseño que afecta varias cosas, preguntar antes de ejecutarla.
6. **El P/N siempre es la carpeta contenedora del archivo**, con la regla especial de subir un nivel si esa carpeta se llama `DRAWINGS`, `FOTOS`, `FOTO`, `PHOTOS`, `IMAGENES`, `IMAGES`. Si el usuario pide soportar otra carpeta genérica, agregarla a esa lista en `server.js` (variable `genericas`).
7. **La clave de agrupación es `pn.toUpperCase()`** para no duplicar P/N por diferencias de mayúsculas. El campo `pn` mostrado al usuario conserva la capitalización original del filesystem.

## Convenciones del código

**Backend (`server.js`)**:
- Comentarios y variables en español (`escanear`, `construirIndice`, `FUENTES`).
- Nada async en el escaneo (es I/O sobre SMB; `readdirSync` está bien y simplifica el flujo).
- El caché en `index-cache.json` se guarda con `JSON.stringify` plano, sin pretty-print (suele ser grande).
- Logs cortos en consola: arranque, escaneo, errores de lectura. Nada de niveles ni librerías de logging.

**Frontend (`public/index.html`)**:
- Todo en un solo archivo (HTML + `<style>` + `<script>`), JS vanilla.
- Estilo: oscuro, paleta industrial (ámbar `#ffb000` como acento). Fuente mono (JetBrains Mono o fallback) para todo lo que sea P/N y nombre de archivo. Esto es deliberado, no cambiarlo a algo "más bonito" sin pedir.
- Función `esc()` para escapar todo lo que venga del filesystem antes de meterlo al DOM.
- Lista limitada a `slice(0, 500)` para que no se cuelgue el navegador con miles de resultados. Si crece el catálogo, agregar paginación o virtual scroll.

## Flujo cuando el usuario pide un cambio

1. **Leer `references/decisiones.md`** si la solicitud toca arquitectura, formato de datos, rendimiento o despliegue. Tiene el porqué de varias decisiones que parecen raras pero existen por algo.
2. **Confirmar el efecto sobre el caché.** Si el cambio toca cómo se construye el índice (nuevas extensiones, nuevo campo en cada item, nueva forma de detectar P/N), avisar al usuario que tiene que ejecutar `Reindexar` después de actualizar el código, e invalidar el `index-cache.json` viejo si el shape cambió.
3. **No tocar las dos rutas `express.static` de los archivos del NAS** sin una razón concreta. Si necesitan caching headers, agregar opciones al `static`, no reemplazarlo.
4. **Probar con la estructura simulada antes de prometer que funciona.** Hay un script de prueba en `references/prueba-local.md` que crea carpetas falsas que imitan al NAS para verificar cambios sin necesidad de conectarse.
5. **Si el cambio agrega config, ponerla en una sección `CONFIG` al inicio de `server.js`**, no en `.env` ni archivos externos. El usuario despliega copiando una carpeta; menos archivos = menos cosas que olvidar mover.

## Cosas que se han pedido o se van a pedir

Cuando pidan estas extensiones, ya hay un plan pensado — leer la sección correspondiente en `references/extensiones.md`:

- Soportar archivos DWG nativos (no solo PDF de DWG).
- Indexación incremental con watcher (`fs.watch` o `chokidar`) para no reindexar todo.
- Filtro por fecha de modificación, por categoría, por tipo de archivo.
- Vista de impresión / exportar lista a Excel o PDF.
- Acceso con login simple (no se sugiere mientras siga siendo solo LAN interna).
- Dejarlo como servicio de Windows con NSSM (alternativa a PM2 para que sobreviva reinicios sin sesión iniciada).

## Errores comunes y diagnóstico rápido

- `ENOENT` con `package.json` → el usuario está en la carpeta equivocada (descomprimir el zip y `cd visor-pn`).
- `EACCES` o `EPERM` al leer NAS → la sesión Windows no tiene permisos al recurso. Probar abrir `\\nas\Compartida Produccion` en el Explorador con esa misma cuenta.
- Primer arranque tarda mucho → es normal sobre SMB. Después queda cacheado. Si no, revisar si la red está saturada.
- PDF no carga en el iframe → algunos navegadores bloquean PDFs locales con extensiones raras o nombres con caracteres no-ASCII. Verificar `encodeURIComponent` en la URL.
- Puerto 3000 ocupado → cambiar `PORT` al inicio de `server.js`.

## Archivos del proyecto

```
visor-pn/
├── server.js              ← backend, ~100 líneas
├── package.json           ← solo express
├── public/
│   └── index.html         ← frontend completo
├── index-cache.json       ← se genera solo en primer escaneo
└── LEEME.txt              ← instrucciones para el usuario final (no devs)
```

Cuando el usuario diga "actualiza el visor para que…" estos son los dos archivos a tocar. Casi nunca hay que abrir `package.json`.

## Referencias

- `references/decisiones.md` — Por qué está hecho así (no es accidente).
- `references/extensiones.md` — Plan para features futuras.
- `references/prueba-local.md` — Cómo probar cambios sin conectarse al NAS.
- `references/despliegue.md` — PM2, NSSM, firewall, IP estática, todo lo de producción.
