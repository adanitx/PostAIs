# PostAIS v1.3.5

## Idiomas

- Añadido Galego como idioma disponible en Configuración.
- Añadido Català como idioma disponible en Configuración.
- La aplicación detecta variantes regionales `gl-*` y `ca-*` cuando no existe una preferencia guardada.
- La preferencia de idioma se conserva en localStorage y se puede cambiar sin reiniciar la aplicación.
- El selector muestra los nombres de los idiomas adaptados al idioma actualmente seleccionado.

## Cobertura de traducción

- Navegación, estado y configuración.
- Constructor de endpoints, GET, POST, favoritos e importación/exportación.
- Autenticación, validación, filtros y resultados.
- Scripts de visualización y grupos de parámetros.
- Temas y opciones de interfaz.

Las terminologías técnicas GET, POST, Endpoint, Constructor, Body, Headers, JSON, RAW, TLS y API REST se conservan.

## Validación

- `npm run build` compila TypeScript y Vite.
- El paso `postbuild` sincroniza `app.asar` y el ejecutable de PostAIS.
- El portable se publica como `portable/PostAIs-portable.zip`.