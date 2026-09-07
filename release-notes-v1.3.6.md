# PostAIS v1.3.6

## Métodos REST

- PostAIS admite `GET`, `POST`, `PATCH`, `PUT` y `DELETE`.
- Los métodos de modificación `PUT`, `PATCH` y `DELETE` muestran una defensa adicional antes del lanzamiento.
- El usuario debe escribir exactamente `CONFIRMAR` para ejecutar la operación.
- La opción de no volver a mostrar el aviso se aplica durante la sesión y solo después de una confirmación válida.
- La protección también se aplica a la repetición de favoritos de esos métodos.

## Configuración de vista Básica

- Nueva opción para deshabilitar métodos en la vista Básica.
- El usuario puede marcar individualmente `GET`, `POST`, `PATCH`, `PUT` y `DELETE`.
- Los métodos marcados se ocultan del selector en vista Básica.
- La vista Avanzada continúa mostrando todos los métodos.
- Las preferencias se guardan entre sesiones y siempre se conserva al menos un método disponible.

## Resultados y rendimiento

- Se puede activar la expansión automática de resultados detallados.
- El usuario puede configurar el máximo de resultados que se abrirán automáticamente.
- Si se supera el límite, no se abre ningún resultado automáticamente.
- La librería `xlsx` se carga de forma dinámica únicamente al importar Excel.
- El bundle inicial se reduce y Excel queda en un chunk independiente.

## Traducciones

- Corregidas inconsistencias de Català en navegación, configuración, estados y mensajes dinámicos.
- Se mantienen sin traducir las terminologías técnicas REST como `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `Endpoint`, `Body`, `Headers`, `JSON`, `RAW` y `API REST`.

## Validación

- `npm run build` compila TypeScript y Vite.
- `postbuild` sincroniza `app.asar` y `PostAIS.exe`.
- El portable se genera como `portable/PostAIs-portable.zip`.