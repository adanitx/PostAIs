# PostAIS v1.3.8

## Trazabilidad de mensajería en lotes

- Añadida la columna `FECHA` a la tabla de resultados procesados del historial de lotes.
- Cada request registra su instante de recepción de respuesta y lo muestra con fecha y hora local, con precisión de segundos.
- La marca temporal se guarda junto a cada resultado individual del lote.
- Los historiales existentes siguen siendo compatibles; al no disponer de una hora por request, muestran `-` en la nueva columna.
- La ayuda de variables privadas aclara que el almacenamiento puede ser temporal o persistente entre sesiones.

## Validación y distribución

- `npm run build` compila TypeScript y Vite y sincroniza `app.asar` con `PostAIS.exe`.
- El portable se distribuye como `PostAIs-portable.zip` en los assets de la release de GitHub.
- SHA-256 del portable: `5DC4A20C60B6963C36776E19F8381164F6F18F9ED9C637E59E687EF554BA8966`.