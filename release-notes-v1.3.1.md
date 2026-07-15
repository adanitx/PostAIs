Version 1.3.1

Novedades principales:
- Agrupacion de parametros (producto cartesiano) ahora disponible tambien en metodo GET.
- Cada tupla GET tiene un ID propio para gestionar sus valores de parametro de forma independiente.
- Boton "Anadir grupo de parametros" visible en tuplas GET con placeholders {{token}}.
- Nuevo modo "Relacion parametros" en "Anadir grupo de parametros" para endpoints con 2 o mas placeholders {{token}}.
- Generacion de tuplas por producto cartesiano entre parametros relacionados (ej.: 1000x[4,5,6]).
- Soporte para varias relaciones en el mismo endpoint mediante boton de anadir (+) y eliminacion individual.
- Entradas de valores por token para construir combinaciones avanzadas sin perder control por parametro.
- Correccion de persistencia del Body RAW manual al usar "Sustituir endpoint(s)" con comandos no guardados.
- Panel de coincidencias del constructor extendido para evitar recortes y mejorar legibilidad.

Archivos clave:
- src/App.tsx
- src/styles.css
- README.md

Artefactos:
- Portable Windows: PostAIs-portable.zip
