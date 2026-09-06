# PostAIS v1.3.4

## Visualizacion de respuestas

- Los scripts post-respuesta de visualizacion ya no se bloquean solo porque el body serializado supere un limite de tamaño.
- Se siguen aplicando las validaciones de seguridad del script: `return` obligatorio y bloqueo de acceso al DOM, contexto global, red, almacenamiento del navegador y temporizadores.
- Cuando el script asociado devuelve una salida vacia pero la respuesta contiene un body con datos, la interfaz muestra un aviso explicativo.
- El aviso permite regenerar el sample script usando la respuesta concreta del endpoint, evitando que el usuario interprete la salida vacia como ausencia de datos.

## Distribucion y firma

- Añadido `scripts/sign-portable.ps1` para localizar automaticamente `signtool.exe` del Windows SDK.
- El script admite certificado PFX o certificado de firma instalado en el almacen de certificados de Windows.
- Añadido `npm run portable:signed` para construir, preparar, firmar y comprimir el portable.
- La firma usa SHA-256 y sellado temporal mediante `/tr` y `/td SHA256`.

## Validacion

- `npm run build` compila TypeScript, genera la build de Vite y sincroniza `app.asar` con el ejecutable de PostAIS.
- El portable generado se publica como `portable/PostAIs-portable.zip`.
