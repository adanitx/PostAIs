# PostAIs v2.1.0

## Historial de solicitudes

- Las entradas individuales nuevas guardan el estado HTTP, las cabeceras recibidas y el cuerpo de respuesta.
- La respuesta original se puede consultar desde un desplegable independiente de la visualización generada por scripts.
- Los resúmenes de lote muestran los valores resueltos de los parámetros REST; si hay más de cinco, el resto queda disponible en un desplegable.
- En lotes con varios endpoints se puede elegir mediante casillas cuáles cargar en Inicio. Se restauran los parámetros por endpoint y las filas importadas asociadas.
- Las entradas antiguas siguen siendo compatibles; la respuesta original no está disponible en registros creados antes de guardar esos datos.

## Timeout y procesamiento por lotes

- El timeout predeterminado se puede configurar en Configuración y se conserva entre sesiones. El rango admitido es de 1.000 a 120.000 ms; si no hay una preferencia guardada, se mantienen 15.000 ms.
- Los timeouts de un lote que también contenga solicitudes correctas muestran una advertencia para comprobar el resultado en el servicio antes de reenviar, ya que el servidor podría haber procesado la solicitud sin que llegara la respuesta.

## Idiomas

- Las nuevas etiquetas, controles y advertencias están disponibles en español, inglés, gallego y catalán.