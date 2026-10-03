# PostAIs

## Novedades v2.0.0

- Los grupos de parámetros GET y POST reutilizan parámetros cuando su valor coincide y omiten combinaciones ya presentes en la tupla origen.
- Al generar grupos, solo se crean nombres de parámetro nuevos para valores distintos; el modal no se cierra al pulsar fuera.
- Los endpoints favoritos gestionan su entorno de forma independiente; los comandos favoritos se comparten entre DEV, QA y PROD.
- Los filtros de entorno se muestran cuando hay varios disponibles y los endpoints existentes se migran a PROD la primera vez que se abre esta versión.
- La importación v1 sigue aceptando comandos con entorno y endpoints sin entorno; las exportaciones conservan el formato actual.

Consulta el detalle completo en [release-notes-v2.0.0.md](release-notes-v2.0.0.md).

## Novedades v1.3.8

- El historial de mensajería en lotes muestra la fecha y hora de recepción de la respuesta para cada request.
- Los historiales nuevos conservan la marca temporal individual; los historiales anteriores siguen cargándose y muestran `-` cuando no disponen de ella.
- Al sustituir un comando POST se descartan las filas importadas del comando anterior para evitar reutilizarlas en otra ejecución.
- El selector de Excel/CSV indica el nombre del archivo y el número de filas que siguen activos; se limpia al sustituir el comando o iniciar otra importación.

Consulta el detalle completo en [release-notes-v1.3.8.md](release-notes-v1.3.8.md).

## Novedades v1.3.7

- El historial de lotes conserva las respuestas por fila, permite buscarlas y descargar el archivo de origen o las filas fallidas.
- La respuesta abierta desde el historial ejecuta su visualización post-respuesta, igual que en Inicio.
- El menú contextual para recoger una respuesta está disponible dentro del detalle y devuelve la vista a la fila consultada.
- Un `GET` ejecutado como lote con una sola solicitud se registra como solicitud individual, no como lote.

Consulta el detalle completo en [release-notes-v1.3.7.md](release-notes-v1.3.7.md).

## Novedades v1.3.6

- Añadidos los métodos REST `PUT`, `PATCH` y `DELETE` junto a `GET` y `POST`.
- Las operaciones `PUT`, `PATCH` y `DELETE` requieren escribir `CONFIRMAR` antes de ejecutarse.
- Se puede omitir ese aviso durante la sesión después de una confirmación válida.
- Añadida configuración para ocultar métodos concretos en la vista Básica.
- Añadida expansión automática de resultados detallados con límite configurable.
- La librería `xlsx` se carga bajo demanda al seleccionar un archivo Excel, reduciendo el tamaño del bundle inicial.
- Corregidas y ampliadas las traducciones de español, English, Galego y Català.

Consulta el detalle completo en [release-notes-v1.3.6.md](release-notes-v1.3.6.md).

## Novedades v1.3.5

- Añadido Galego como idioma completo de la aplicación.
- Añadido Català como idioma completo de la aplicación.
- El selector de idioma, la detección regional y la persistencia admiten ahora español, inglés, galego y català.
- Ampliadas las traducciones para configuración, constructor de endpoints, favoritos, importación/exportación, autenticación, resultados, filtros, scripts de visualización y grupos de parámetros.
- Se mantienen las terminologías técnicas como GET, POST, Endpoint, Constructor, Body, Headers, JSON, RAW, TLS y API REST.

Consulta el detalle completo en [release-notes-v1.3.5.md](release-notes-v1.3.5.md).

## Novedades v1.3.4

- Los scripts de visualización se intentan ejecutar también con respuestas grandes; el tamaño del body ya no bloquea previamente la ejecución.
- Si un script devuelve una salida vacía aunque la respuesta contenga datos, la interfaz lo indica y ofrece regenerar el sample script para esa respuesta.
- Se mantienen las validaciones de seguridad de scripts: `return` obligatorio y bloqueo de acceso al DOM, contexto global, red, almacenamiento y temporizadores.
- Añadido flujo portable firmado con `scripts/sign-portable.ps1`, compatible con certificados PFX o certificados de firma instalados en Windows.
- Añadido `npm run portable:signed` para generar, firmar y comprimir el portable en un único flujo.

Consulta el detalle completo en [release-notes-v1.3.4.md](release-notes-v1.3.4.md).

Aplicacion de escritorio basada en Electron + React para enviar lotes HTTP desde un CSV. Soporta toda la mensajería REST, query params por plantilla, variables privadas de autenticacion y detalle completo de errores por fila.

## Novedades recientes (v1.3.1)

- Constructor de endpoints con relaciones de parametros para placeholders multiples.
- Nuevo modo Relacion parametros en Anadir grupo de parametros para generar combinaciones por producto cartesiano.
- Soporte de multiples relaciones con opcion de anadir (+) y eliminar por cada relacion.
- Bloques de valores separados por token para controlar combinaciones complejas por endpoint.
- Correccion de persistencia en Body RAW manual al sustituir endpoint(s) sin guardar en favoritos.
- Mejora visual de coincidencias en el constructor para evitar contenido cortado y mejorar lectura.

## Flujo principal

1. Importar un CSV con cabeceras.
2. Configurar metodo, endpoint, headers, query params y body JSON.
3. Referenciar columnas con `{{columna}}`.
4. Referenciar secretos con `{{secret:API_TOKEN}}`.
5. Probar una fila o ejecutar el lote completo de forma secuencial.

## Protecciones incluidas

- Timeout configurable por solicitud.
- Delay configurable entre filas.
- Opcion para detener el lote al primer error.
- Validacion previa de columnas requeridas en el CSV.
- Secretos mantenidos solo en memoria del proceso principal de Electron.

## Requisitos

- Node.js 20 o superior.
- npm 10 o superior.

## Puesta en marcha

```powershell
npm install
npm run dev
```

## Ejemplo de CSV

```csv
recipient,message,campaign,userId,region
34600000001,Hola Ana,lanzamiento,1001,ES
34600000002,Hola Luis,lanzamiento,1002,MX
```

## Ejemplo de headers con secreto

```json
{
  "Content-Type": "application/json",
  "Authorization": "Bearer {{secret:API_TOKEN}}"
}
```

## Ejemplo de query params

```json
{
  "campaign": "{{campaign}}",
  "source": "postais"
}
```

Aplicaci\u00f3n de escritorio ligera para importar un CSV y lanzar una solicitud POST por cada fila, usando placeholders por columna dentro de un body JSON.

## Flujo

1. Importa un CSV con cabeceras.
2. Configura el endpoint de destino.
3. Define cabeceras HTTP en formato JSON.
4. Define el body JSON con placeholders como `{{name}}`, `{{phone}}` o `{{orderId}}`.
5. Ejecuta el lote y revisa el resultado de cada fila.

## Ejemplo de CSV

```csv
name,phone,orderId
Ana,34600000001,A-100
Luis,34600000002,A-101
```

## Ejemplo de body

```json
{
  "recipient": "{{phone}}",
  "message": "Hola {{name}}, tu pedido {{orderId}} ya est\u00e1 listo."
}
```

## Puesta en marcha

```powershell
npm install
npm run dev
```

## Notas t\u00e9cnicas

- La UI est\u00e1 hecha con React + Vite.
- Los POST se ejecutan en Electron mediante IPC para evitar bloqueos por CORS t\u00edpicos del navegador.
- Las columnas del CSV se pueden usar como variables dentro del JSON.