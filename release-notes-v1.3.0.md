Version 1.3.0

Novedades principales:
- Importacion CSV robusta para archivos con una sola tupla por linea, sin requerir delimitadores "," o ";".
- Conservacion exacta del contenido importado desde CSV, incluyendo espacios finales relevantes para Body RAW.
- Fallback corregido en POST por tupla: si el RAW manual esta vacio, se envia la tupla importada sin modificar.
- Constructor de Endpoint reorganizado para mejorar la legibilidad de endpoint base y comando.
- Descripciones de favoritos editables inline con doble clic, guardado con Enter y cancelacion con Escape.

Artefactos:
- Portable Windows: PostAIs-portable.zip
