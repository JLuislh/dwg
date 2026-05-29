# Prueba local sin NAS

Cuando se quiera probar un cambio sin estar en la red del cliente, montar una estructura de carpetas que imita al NAS.

## Setup en cualquier PC con Node

```bash
mkdir -p test_nas/DRAWINGS/TRANSFORMERS/DRAWINGS/240-2977
mkdir -p test_nas/DRAWINGS/TRANSFORMERS/DRAWINGS/1B010
mkdir -p test_nas/DRAWINGS/CHOKES/1R001
mkdir -p test_nas/DRAWINGS/TOROIDS/T-100
mkdir -p "test_nas/FOTOS/TRANSFORMERS/240-2977"
mkdir -p "test_nas/FOTOS/CHOKES/1R001"

# Crear archivos vacíos para que aparezcan en el índice
echo > test_nas/DRAWINGS/TRANSFORMERS/DRAWINGS/240-2977/plano-rev2.pdf
echo > test_nas/DRAWINGS/TRANSFORMERS/DRAWINGS/240-2977/plano-rev3.pdf
echo > test_nas/DRAWINGS/TRANSFORMERS/DRAWINGS/1B010/dwg.pdf
echo > test_nas/DRAWINGS/CHOKES/1R001/plano.pdf
echo > test_nas/DRAWINGS/TOROIDS/T-100/spec.pdf
echo > test_nas/FOTOS/TRANSFORMERS/240-2977/foto-frontal.jpg
echo > test_nas/FOTOS/TRANSFORMERS/240-2977/foto-lateral.jpg
echo > test_nas/FOTOS/CHOKES/1R001/montado.jpg
```

## Apuntar el server a esa carpeta

Editar temporalmente las constantes en `server.js`:

```js
const FUENTES = {
  drawings: './test_nas/DRAWINGS',
  fotos:    './test_nas/FOTOS'
};
```

O hacer una copia: `cp server.js server_test.js` y cambiar las rutas ahí. Recordar borrar `index-cache.json` entre cambios de configuración.

Arrancar y abrir `http://localhost:3000`.

## Qué verificar después de cualquier cambio

Casos mínimos a comprobar:

1. **Agrupación correcta:** `240-2977` debe aparecer una sola vez con sus 2 PDFs y 2 fotos juntos, aunque vengan de rutas diferentes.
2. **Salto de carpeta `DRAWINGS`:** el P/N debe ser `240-2977`, no `DRAWINGS`.
3. **Búsqueda parcial:** `?q=240` retorna el `240-2977`. `?q=trans` retorna todos los de TRANSFORMERS.
4. **Búsqueda case-insensitive:** `?q=240` y `?q=240` y `?q=240-` dan los mismos resultados.
5. **Reindex:** agregar un archivo nuevo a `test_nas`, llamar `/api/reindex`, debe aparecer sin reiniciar el server.
6. **Caché:** reiniciar el server con `index-cache.json` ya existente debe arrancar instantáneo y servir lo cacheado.
7. **Frontend:** seleccionar un P/N con solo fotos (sin planos) — la pestaña Planos debe deshabilitarse y abrir Fotos por defecto. Mismo caso a la inversa.

## Truco para probar grandes volúmenes

Para verificar que la UI sigue ágil con miles de P/N:

```bash
for i in {1..3000}; do
  mkdir -p "test_nas/DRAWINGS/CAT-$((i%10))/PN-$i"
  echo > "test_nas/DRAWINGS/CAT-$((i%10))/PN-$i/p.pdf"
done
```

Si la lista se siente lenta en el navegador, ahí confirmar si hay que paginar o virtualizar.
