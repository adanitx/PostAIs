# PostAIs v2.2.0

## Favoritos REST y checks de seguridad

- Los favoritos de endpoints POST pueden guardar un body RAW por defecto. El body actual se captura al guardar el favorito, se puede editar en Favoritos y se restaura al cargarlo.
- Los checks de seguridad están desactivados por defecto. Configuración permite activarlos por método y cada favorito puede fijar su estado con el candado.
- Los favoritos con el check activo solicitan confirmación antes de cargarse en Inicio. Se puede definir un consejo personalizado; si queda vacío, se muestra una confirmación genérica junto con el endpoint o comando.
- Los favoritos anteriores siguen siendo compatibles y heredan el comportamiento configurado por método mientras no tengan un estado individual fijado.

## Constructor de endpoints

- Las coincidencias de endpoints completos aparecen junto a la fila que se está editando.
- El diálogo para añadir o modificar la descripción REST mantiene visible la coincidencia y devuelve el foco al editor del endpoint al cerrarse.

## Desarrollo y distribución

- Vite excluye `release/**` y `.packtmp/**` de la vigilancia de archivos para evitar fallos `EBUSY` con temporales del empaquetado.
- Portable Windows: `PostAIs-portable.zip`.
- SHA-256: `10251628675A410B8D1EC22B150094656B1D34681D6E9BB37C8D274942EFFCBD`.
