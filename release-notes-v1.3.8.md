# PostAIS v1.3.8

## Trazabilidad de mensajería en lotes

- Añadida la columna `FECHA` a la tabla de resultados procesados del historial de lotes.
- Cada request registra su instante de recepción de respuesta y lo muestra con fecha y hora local, con precisión de segundos.
- La marca temporal se guarda junto a cada resultado individual del lote.
- Los historiales existentes siguen siendo compatibles; al no disponer de una hora por request, muestran `-` en la nueva columna.
- La ayuda de variables privadas aclara que el almacenamiento puede ser temporal o persistente entre sesiones.

## Importación de Excel y CSV

- Al sustituir endpoints POST desde el constructor se descartan las filas importadas para el comando anterior, junto con su estado de preview y resultados.
- Añadir endpoints mantiene las filas importadas, ya que la ejecución sigue perteneciendo al mismo conjunto de datos.
- El selector de archivo muestra el nombre importado y el número de filas activas, en lugar del texto nativo ambiguo "Ningún archivo seleccionado".
- Al iniciar una nueva importación se limpia el archivo y las filas anteriores; solo se muestra el nuevo archivo después de una importación válida.

## Validación y distribución

- `npm run build` compila TypeScript y Vite y sincroniza `app.asar` con `PostAIS.exe`.
- El portable se distribuye como `PostAIs-portable.zip` en los assets de la release de GitHub.
- SHA-256 del portable actualizado: `286F6878AA8A31DD9CE795DA8BD6B55ED0FB6084ABD4A4D28448BBDD9FB53664`.