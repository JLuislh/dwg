# Decisiones de arquitectura

Por qué el proyecto está hecho así. Leer esto antes de proponer un rediseño grande.

## Por qué Node + Express y no Python/FastAPI o .NET

- La PC servidor es una máquina de oficina con Windows. Node tiene instalador de un clic.
- Express sirve estáticos sobre rutas UNC sin configurar nada raro.
- Una sola dependencia, un solo `npm install`, un solo proceso.
- Guicho ya tiene experiencia previa con Node (POS-ElRey, APIs de inventario, bot de Angels).

## Por qué frontend vanilla y no React

- El usuario que lo despliega copia una carpeta y corre `npm install && npm start`. Eso es todo. Sin build, sin `dist/`, sin variables de entorno.
- El frontend es ~300 líneas. No necesita componentes ni estado complejo.
- Editar el HTML directamente es más rápido que rebuilds en cada cambio.
- Si algún día crece a algo con muchas vistas, ahí sí Vue/Svelte tendría sentido. Aún no.

## Por qué escaneo síncrono recursivo y no streaming

- SMB sobre Windows ya es bastante lento; el paralelismo con muchos `readdir` simultáneos no ayuda y a veces empeora.
- El escaneo solo corre dos veces: al arrancar (si no hay caché) y al pedir reindex.
- `readdirSync` deja el código lineal y fácil de leer.

## Por qué cachear el índice en disco

- Sobre SMB, escanear miles de carpetas puede tardar minutos. Hacerlo en cada arranque del servidor sería inaceptable.
- El catálogo cambia poco en el día. Reindexar bajo demanda con un botón es lo correcto para este caso.
- `index-cache.json` no se versiona (gitignore). Se regenera solo.

## Por qué el P/N es la carpeta contenedora

- Es la única convención que se mantiene a través de todas las categorías y subniveles del NAS.
- Los nombres de archivo no son confiables (suelen tener sufijos `_REV2`, `_old`, `Copia de`, etc.).
- La carpeta intermedia `DRAWINGS` dentro de algunas categorías (vista en `TRANSFORMERS\DRAWINGS\1B010`) se salta con la lista `genericas` en `server.js`. Si aparece otra convención del mismo estilo, agregarla a esa lista.

## Por qué visor PDF nativo del navegador y no PDF.js explícito

- Chrome y Edge tienen visor PDF integrado decente.
- Embeber PDF.js agrega ~3MB de assets y complica el visor con su propia toolbar.
- Si el cliente pide anotaciones, zoom programático o thumbnails, ahí sí se pasa a PDF.js. Hoy no es necesario.

## Por qué la galería usa `<img loading="lazy">` y no virtualización

- La cantidad de fotos por P/N raramente pasa de 30-50.
- `loading="lazy"` ya evita cargar las que no están visibles.
- Si algún P/N tiene cientos de fotos, ahí evaluar virtualización.

## Por qué la búsqueda es del lado del servidor y no del cliente

- El JSON completo del índice puede ser grande (decenas de MB con miles de P/N y muchas fotos).
- Mandarlo entero al navegador y filtrar en JS funciona, pero la carga inicial se siente lenta.
- Filtrar en servidor mantiene la primera carga rápida y la búsqueda igual de instantánea (en RAM).
- Si el catálogo crece mucho más, considerar paginación.

## Por qué no hay base de datos

- No hay datos que persistir: el filesystem es la fuente de verdad.
- El caché es derivado y se puede borrar sin perder nada.
- Agregar SQLite/Postgres complica el despliegue y no aporta nada para el caso actual.
- Cuando se agreguen features de "favoritos", "vistos por usuario", "comentarios", ahí sí justifica SQLite (file-based, sigue el principio de "copia carpeta y corre").

## Por qué solo Express y no Fastify/Koa/Hapi

- Express es la opción más conocida y documentada. Cualquier dev que herede esto la entiende sin leer manuales.
- El rendimiento no es un cuello de botella aquí (las peticiones son pocas y los archivos los sirve el SO).
