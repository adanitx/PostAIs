# PostAIS v1.3.7

## Historial de lotes

- El historial conserva el detalle de cada fila procesada en los lotes, con búsqueda por contenido, endpoint, estado y error.
- Se pueden descargar el archivo de origen reconstruido y, cuando existan, las filas que han fallado.
- La respuesta de cada fila se abre desde `Ver respuesta`, incluyendo estado HTTP, cabeceras y body almacenados.
- Las respuestas grandes se mantienen dentro de un límite de almacenamiento; si se supera, el historial conserva prioritariamente las filas con error.

## Visualización post-respuesta

- Las respuestas abiertas desde el historial reutilizan el script post-respuesta asociado al comando favorito, igual que las respuestas mostradas en Inicio.
- El panel de visualización permite aplicar filtros, ordenar columnas, renombrar encabezados y copiar la tabla resultante.
- Al hacer clic derecho dentro de una respuesta desplegada se muestra el menú contextual para recogerla.
- Al recoger una respuesta, la vista vuelve a la fila de `Resultados procesados` que la originó.

## Clasificación de solicitudes GET

- Un envío mediante `Enviar lote GET` que solo procesa una solicitud se registra en el historial como solicitud individual.
- Los envíos de dos o más solicitudes mantienen el formato de lote.

## Validación y distribución

- `npm run build` compila TypeScript y Vite, y sincroniza `app.asar` con `PostAIS.exe`.
- El portable se distribuye como `PostAIs-portable.zip`.
