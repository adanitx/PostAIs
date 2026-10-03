# PostAIs v2.0.0

## Constructor de endpoints y grupos de parámetros

- Los grupos de parámetros funcionan en GET y POST y mantienen las tuplas correctamente asociadas a sus identificadores.
- Las combinaciones cartesianas que ya están representadas en la tupla origen no se duplican.
- Los parámetros con valores coincidentes reutilizan el mismo placeholder; cada valor distinto obtiene un nombre independiente.
- Al añadir endpoints compuestos, los placeholders con nombres compartidos muestran y sincronizan el valor existente en tiempo real, salvo que se active la creación de parámetros nuevos.
- El diálogo de grupos solo se cierra mediante sus acciones explícitas, no al pulsar fuera.

## Favoritos y entornos

- Los entornos DEV, QA y PROD pertenecen a los endpoints favoritos; los comandos son globales y se comparten entre entornos.
- Las etiquetas de entorno de endpoints se pueden cambiar directamente desde Favoritos.
- Los filtros de entorno aparecen cuando hay más de un entorno entre los favoritos y permiten ver todos o uno concreto.
- La primera apertura migra a PROD los endpoints y peticiones favoritas existentes, y selecciona PROD para mantenerlos visibles.
- La importación sigue leyendo archivos v1; acepta comandos antiguos con entorno y endpoints sin entorno. La exportación mantiene los esquemas v1 compatibles.

## Distribución

- Portable Windows: `PostAIs-portable.zip`.
- SHA-256 del portable: `7FF6D239D4966149A8250827A438D583B7EAE33FFF07CF244F50E1B2447471C2`.
