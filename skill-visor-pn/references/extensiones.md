# Plan para extensiones

Features que probablemente se van a pedir. Para cada una, aquí está el plan: qué tocar, qué evitar, cuánto trabajo es.

## Soportar archivos DWG nativos

**Plan:** No renderizar DWG en navegador (las librerías que lo hacen son pesadas y caras). En su lugar, listarlos como descarga directa con icono distintivo. Si el usuario tiene AutoCAD instalado, hace clic y abre local.

**Tocar:** agregar `.dwg` a `EXT_PDF` (renombrar a `EXT_PLANO` para que tenga sentido), y en el frontend mostrar un icono distinto y abrir con `<a href download>` en vez de iframe.

**Evitar:** intentar convertir DWG a PDF en el servidor. Es lentísimo y requiere licencia.

## Indexación incremental con watcher

**Plan:** usar `chokidar` (es la única forma confiable de watcher sobre SMB; `fs.watch` nativo no funciona bien en Windows con rutas UNC).

**Tocar:** instalar `chokidar`, al arrancar después de `construirIndice()` añadir un watcher por cada raíz; en eventos `add`/`unlink` actualizar el `cache` y reescribir `index-cache.json` (con throttle de 5-10s para no escribir miles de veces si están copiando muchos archivos).

**Evitar:** quitar el botón Reindexar. Sigue siendo el fallback si el watcher falla.

**Riesgo:** los watchers sobre SMB pueden generar miles de eventos en pocos segundos si el usuario hace una operación masiva. Throttle obligatorio.

## Filtro por categoría / tipo / fecha

**Plan en el frontend:** agregar un panel plegable encima de la lista con checkboxes de categorías (extraerlas del índice) y radios de "Solo planos", "Solo fotos", "Ambos". La fecha de modificación pide guardarla en el índice (hoy no se guarda).

**Tocar:** en `server.js`, agregar `fechaMod: fs.statSync(full).mtime` por archivo. En el frontend, agregar UI de filtros y aplicarlos antes de renderizar la lista.

**Evitar:** mandar todos los filtros al backend. Que el cliente filtre sobre el JSON que ya recibió, así la UI responde instantáneo.

**Costo del cambio:** un `statSync` extra por archivo encarece el escaneo un 30-50% sobre SMB. Probar primero si la mejora justifica.

## Exportar lista a Excel

**Plan:** botón "Exportar" que genera un CSV en el cliente (sin librería: construir string con `\n` y `,`, escapando comillas; ofrecerlo con `Blob` + `<a download>`). Columnas: P/N, categoría, n planos, n fotos.

**Evitar:** generar XLSX en el servidor con `exceljs` u `xlsx`. CSV resuelve el caso.

## Botón "Abrir carpeta en el Explorador"

**Plan:** **NO se puede** desde un navegador estándar por seguridad. Las opciones son:
- a) Mostrar la ruta UNC y un botón "Copiar ruta" para pegar en el Explorador.
- b) Si se mete a Electron, ahí sí `shell.openPath()`.

Elegir (a) salvo que se decida pasar a Electron.

## Vista de impresión

**Plan:** una página `/print/:pn` que renderiza HTML simple con todos los thumbnails y links a PDFs, lista para `Ctrl+P`. Sin CSS de la app principal, solo print-friendly.

## Login simple

**Plan:** si sigue siendo solo LAN, **no hacerlo**. Agrega complejidad y el caso es lectura de información ya compartida en `\\nas`.

**Si se vuelve necesario:** `express-session` con un usuario único hardcodeado o leyendo de un `users.json` local. NUNCA poner credenciales en código versionado.

## Modo "presentación" en planta

**Plan:** una pantalla grande en producción muestra el plano del P/N que se está trabajando. URL tipo `/show/<PN>` que abre directo el primer PDF a pantalla completa, sin navegación. Útil para tablets/TVs en celdas de trabajo.

**Tocar:** una ruta nueva en server, un HTML extra simple en `public/show.html`.

## Servicio de Windows con NSSM (alternativa a PM2)

**Plan:** PM2 en Windows funciona pero requiere sesión iniciada para algunos modos. NSSM (Non-Sucking Service Manager) lo convierte en servicio real de Windows que arranca con la máquina sin login.

```
nssm install VisorPN "C:\Program Files\nodejs\node.exe"
nssm set VisorPN AppDirectory C:\visor-pn
nssm set VisorPN AppParameters server.js
nssm start VisorPN
```

Documentar esto en `LEEME.txt` cuando se confirme el método final.

## Multi-NAS o múltiples raíces

**Plan:** convertir `FUENTES` de objeto a array y permitir N orígenes. La URL `/files/:tipo` se vuelve `/files/:fuenteId`. Cuidado de mantener compatibilidad del caché si ya hay uno generado.
