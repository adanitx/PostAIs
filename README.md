# PostAIs

Aplicacion de escritorio basada en Electron + React para enviar lotes HTTP desde un CSV. Ahora soporta GET y POST, query params por plantilla, variables privadas de autenticacion y detalle completo de errores por fila.

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