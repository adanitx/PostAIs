export type AppLanguage = 'es' | 'en' | 'gl' | 'ca';

export const APP_LANGUAGE_PREF_STORAGE_KEY = 'postais.language';

const TEXT_NODE_ORIGINALS = new WeakMap<Text, string>();
const ATTR_ORIGINALS = new WeakMap<Element, Map<string, string>>();

const NON_TRANSLATABLE_ANCESTOR_SELECTORS = [
  '.favorite-match-url',
  '.favorite-description-button',
  '.favorite-description-label',
  '.history-card-title input',
  '.history-card-title textarea',
].join(',');

const EXACT_EN: Record<string, string> = {
  PostAIS: 'PostAIS',
  'Aplicación para procesamiento de mensajería API REST': 'REST API messaging processing application',
  'Para mensajeria GET y POST': 'For GET and POST messaging',
  'Para mensajería GET y POST': 'For GET and POST messaging',
  Configuracion: 'Settings',
  'Modo claro': 'Light mode',
  'Modo oscuro': 'Dark mode',
  Estado: 'Status',
  STATUS: 'STATUS',
  Inicio: 'Home',
  Historial: 'History',
  Favoritos: 'Favorites',
  Vista: 'View',
  Basica: 'Basic',
  'Básica': 'Basic',
  Avanzada: 'Advanced',
  Variables: 'Variables',
  'Variables privadas': 'Private variables',
  'Guarda secretos para autenticacion sin dejarlos en el archivo importado.': 'Store secrets for authentication without leaving them in the imported file.',
  'Guarda secretos para autenticación sin dejarlos en el archivo importado.': 'Store secrets for authentication without leaving them in the imported file.',
  Nombre: 'Name',
  Persistencia: 'Persistence',
  'Valor privado': 'Private value',
  Temporal: 'Temporary',
  'Local segura': 'Secure local',
  'No hay secretos.': 'No secrets yet.',
  Guardar: 'Save',
  Cancelar: 'Cancel',
  Cerrar: 'Close',
  Eliminar: 'Delete',
  Quitar: 'Remove',
  Metodo: 'Method',
  'Método': 'Method',
  Endpoints: 'Endpoints',
  'Entorno favorito por defecto': 'Default favorite environment',
  'Tupla activa': 'Active tuple',
  Activar: 'Activate',
  'Agregar endpoint GET': 'Add GET endpoint',
  'Agregar endpoint POST': 'Add POST endpoint',
  'Constructor de Endpoint': 'Endpoint Builder',
  'Endpoint base': 'Base endpoint',
  Comando: 'Command',
  'Anadir a endpoint': 'Add endpoint',
  'Añadir a endpoint': 'Add endpoint',
  'Sustituir endpoint(s)': 'Replace endpoint(s)',
  'Lista para enviar': 'Ready to send',
  'La configuracion actual no muestra errores obvios antes del envio.': 'Current configuration shows no obvious errors before sending.',
  'La configuración actual no muestra errores obvios antes del envío.': 'Current configuration shows no obvious errors before sending.',
  'Validacion previa': 'Pre-send validation',
  'Validación previa': 'Pre-send validation',
  'Envio Mensajeria': 'Messaging Dispatch',
  'Envío Mensajeria': 'Messaging Dispatch',
  'Resultados detallados': 'Detailed results',
  'Historial de solicitudes': 'Request history',
  'History de solicitudes': 'Request history',
  'Copiar todo': 'Copy all',
  'Importacion y recorrido por filas': 'Import and row navigation',
  'Importación y recorrido por filas': 'Import and row navigation',
  'Errores o avisos de importacion': 'Import errors or warnings',
  'Errores o avisos de importación': 'Import errors or warnings',
  'Sin errores de importacion.': 'No import errors.',
  'Sin errores de importación.': 'No import errors.',
  'Fila anterior': 'Previous row',
  'Fila siguiente': 'Next row',
  Preview: 'Preview',
  'Tupla importada': 'Imported tuple',
  'Body resultante': 'Resulting body',
  'RAW construido': 'Built RAW',
  Request: 'Request',
  Response: 'Response',
  'Endpoint activo': 'Active endpoint',
  'Endpoint POST activo': 'Active POST endpoint',
  'Fila de prueba': 'Test row',
  'Enviar GET activo': 'Send active GET',
  'Enviar lote GET': 'Send GET batch',
  'Enviar fila actual': 'Send current row',
  'Enviar lote completo': 'Send full batch',
  'Detener despues de la actual': 'Stop after current',
  'Detener después de la actual': 'Stop after current',
  'Buscar por nombre, URL o estado': 'Search by name, URL, or status',
  'Buscar en el historial': 'Search in history',
  'Filtrar historial por metodo': 'Filter history by method',
  'Filtrar historial por método': 'Filter history by method',
  'Importar JSON': 'Import JSON',
  'Exportar JSON': 'Export JSON',
  'Vaciar historial': 'Clear history',
  'Consultas registradas': 'Saved queries',
  Importado: 'Imported',
  Enviado: 'Sent',
  Tiempo: 'Time',
  URL: 'URL',
  'Contexto guardado': 'Saved context',
  'No hay comandos favoritos que coincidan para este entorno.': 'No matching favorite commands found for this environment.',
  'No hay endpoints base favoritos que coincidan para este entorno.': 'No matching favorite base endpoints found for this environment.',
  'Los endpoints base se comparten entre GET y POST en el constructor.': 'Base endpoints are shared between GET and POST in the builder.',
  'Endpoints base favoritos': 'Favorite base endpoints',
  'Comandos favoritos': 'Favorite commands',
  'Importar endpoints base favoritos JSON': 'Import favorite base endpoints JSON',
  'Exportar endpoints base favoritos JSON': 'Export favorite base endpoints JSON',
  'Importar comandos favoritos JSON': 'Import favorite commands JSON',
  'Exportar comandos favoritos JSON': 'Export favorite commands JSON',
  'Importar peticiones favoritas JSON': 'Import favorite requests JSON',
  'Exportar peticiones favoritas JSON': 'Export favorite requests JSON',
  'Añadir endpoint base manualmente': 'Add base endpoint manually',
  'Anadir endpoint base manualmente': 'Add base endpoint manually',
  'Añadir comando manualmente': 'Add command manually',
  'Anadir comando manualmente': 'Add command manually',
  'Guardar endpoint base': 'Save base endpoint',
  'Guardar comando': 'Save command',
  'URL base': 'Base URL',
  'Endpoints favoritos': 'Favorite endpoints',
  'Peticiones favoritas completas': 'Full favorite requests',
  'Cargar en inicio': 'Load in home',
  'Usar como comando': 'Use as command',
  'Usar como base': 'Use as base',
  'RAW por defecto del comando': 'Default command RAW',
  'Script post-respuesta': 'Post-response script',
  'Buscar en endpoints base y comandos': 'Search in base endpoints and commands',
  'Filtrar por nombre, descripcion, URL, comando o metodo': 'Filter by name, description, URL, command, or method',
  'Filtrar por nombre, descripción, URL, comando o método': 'Filter by name, description, URL, command, or method',
  'Buscar en gestion de favoritos': 'Search in favorites management',
  'Buscar en gestión de favoritos': 'Search in favorites management',
  'Filtrar comandos por metodo': 'Filter commands by method',
  'Filtrar comandos por método': 'Filter commands by method',
  Todos: 'All',
  'No hay peticiones favoritas que coincidan.': 'No matching favorite requests found.',
  'No hay endpoints favoritos que coincidan.': 'No matching favorite endpoints found.',
  'Ajusta las preferencias globales de la aplicación.': 'Adjust global application preferences.',
  'Idioma de la aplicacion': 'Application language',
  'Idioma de la aplicación': 'Application language',
  Espanol: 'Spanish',
  Español: 'Spanish',
  English: 'English',
  'Resultado correcto': 'Successful result',
  'Resultado con redireccion o advertencia': 'Result with redirection or warning',
  'Resultado con redirección o advertencia': 'Result with redirection or warning',
  'Resultado con error': 'Result with error',
  'Visualización de respuesta': 'Response visualization',
  'Generar script de visualización': 'Generate visualization script',
  'Mostrar menos': 'Show less',
  'Copiar respuesta': 'Copy response',
  'Respuesta copiada al portapapeles.': 'Response copied to clipboard.',
  'No se pudo copiar la respuesta al portapapeles.': 'Could not copy response to clipboard.',
  'Panel colapsado. Pulsa "Expandir" para ver las filas importadas.': 'Panel collapsed. Click "Expand" to view imported rows.',
  'Panel colapsado. Pulsa "Expandir" para ver la preview de la fila seleccionada.': 'Panel collapsed. Click "Expand" to view the selected row preview.',
  'Todavia no hay filas importadas para recorrer.': 'No imported rows to browse yet.',
  'Todavía no hay filas importadas para recorrer.': 'No imported rows to browse yet.',
  'Todavia no se han ejecutado solicitudes.': 'No requests have been executed yet.',
  'Todavía no se han ejecutado solicitudes.': 'No requests have been executed yet.',
  'Sin datos': 'No data',
  Ocultar: 'Hide',
  Expandir: 'Expand',
  'No hay comandos favoritos para este metodo y entorno.': 'No favorite commands for this method and environment.',
  'No hay comandos favoritos para este método y entorno.': 'No favorite commands for this method and environment.',
  'No se encontraron campos.': 'No fields were found.',
  'Coincidencias del constructor': 'Builder matches',
  'Coincidencias comando': 'Command matches',
  Coincidencias: 'Matches',
  'Coincidencias endpoint base': 'Base endpoint matches',
  'No hay coincidencias con el texto actual.': 'No matches for current text.',
  'No hay coincidencias de endpoint base.': 'No base endpoint matches.',
  'No hay coincidencias de comando.': 'No command matches.',
  'Confirmar lote GET': 'Confirm GET batch',
  'Se van a lanzar todos los endpoints GET configurados.': 'All configured GET endpoints will be launched.',
  'Campos clave del body': 'Body key fields',
  'Body no estructurado o vacio.': 'Unstructured or empty body.',
  'Body no estructurado o vacío.': 'Unstructured or empty body.',
  'Headers de respuesta': 'Response headers',
  'Filtrar por columna': 'Filter by column',
  'Filtrar por valor': 'Filter by value',
  'Todas las columnas': 'All columns',
  'Todos los valores': 'All values',
  'Añadir filtro': 'Add filter',
  'Anadir filtro': 'Add filter',
  'Eliminar filtro': 'Remove filter',
  'Limpiar filtros': 'Clear filters',
  'Sin filas generadas por el script.': 'No rows generated by the script.',
  'No hay filas que coincidan con los filtros seleccionados.': 'No rows match the selected filters.',
  'Click para renombrar encabezado': 'Click to rename header',
  'Contraer': 'Collapse',
  'Sin fila seleccionada.': 'No row selected.',
  '(vacío)': '(empty)',
  '(vacio)': '(empty)',
  'No hay respuestas para copiar.': 'No responses to copy.',
  'Recoger desplegable': 'Collapse dropdown',
  'Este comando no tiene script post-respuesta. Puedes generar un sample o editarlo en Favoritos.': 'This command has no post-response script. You can generate a sample or edit it in Favorites.',
  'Anadir descripcion REST': 'Add REST description',
  'Añadir descripcion REST': 'Add REST description',
  'Añadir descripción REST': 'Add REST description',
  'Historial de solicitudes vaciado.': 'Request history cleared.',
  'No hay solicitudes en el historial para exportar.': 'No requests in history to export.',
  'No hay peticiones favoritas para exportar.': 'No favorite requests to export.',
  'No hay endpoints base favoritos para exportar.': 'No favorite base endpoints to export.',
  'No hay comandos favoritos para exportar.': 'No favorite commands to export.',
  'No hay endpoints GET configurados.': 'No configured GET endpoints.',
  'Agrega al menos un endpoint GET antes de enviar.': 'Add at least one GET endpoint before sending.',
  'Define una URL de destino antes de enviar.': 'Define a target URL before sending.',
  'Define al menos un endpoint de destino antes de enviar.': 'Define at least one target endpoint before sending.',
  'No se pudo validar el lote.': 'Could not validate the batch.',
  'No se pudo generar la vista previa.': 'Could not generate preview.',
  'Guardar peticion completa en favoritos': 'Save full request to favorites',
  'Guardar petición completa en favoritos': 'Save full request to favorites',
  'No hay una solicitud concreta lista para guardar como favorita.': 'No specific request is ready to save as favorite.',
  'No se pudo importar': 'Could not import',
  'No se pudo leer el CSV:': 'Could not read CSV:',
  'No se pudo leer el Excel:': 'Could not read Excel:',
  'Todavia no hay solicitudes guardadas. Ejecuta una consulta o importa una coleccion JSON.': 'No saved requests yet. Run a query or import a JSON collection.',
  'Todavía no hay solicitudes guardadas. Ejecuta una consulta o importa una colección JSON.': 'No saved requests yet. Run a query or import a JSON collection.',
  'Configurada manualmente.': 'Configured manually.',
  'Autodetectada desde variables privadas.': 'Auto-detected from private variables.',
  'Sin autenticacion': 'No authentication',
  'Sin autenticación': 'No authentication',
  Autenticacion: 'Authentication',
  'Autenticación': 'Authentication',
  Username: 'Username',
  Password: 'Password',
  'Sin variables privadas': 'No private variables',
  'Permitir TLS autofirmado (solo pruebas)': 'Allow self-signed TLS (testing only)',
  'Timeout por solicitud (ms)': 'Request timeout (ms)',
  'Delay entre filas (ms)': 'Delay between rows (ms)',
  'Archivo Excel o CSV': 'Excel or CSV file',
  'Body RAW manual': 'Manual RAW body',
  'Separador RAW': 'RAW separator',
  'Opcional. Vacio = sin separador': 'Optional. Empty = no separator',
  'Opcional. Vacío = sin separador': 'Optional. Empty = no separator',
  'Usar primera fila como nombres de campo': 'Use first row as field names',
  'Headers JSON': 'JSON headers',
  'Query params JSON': 'JSON query params',
  'Body template JSON': 'JSON body template',
  'Corrige estos puntos antes de enviar': 'Fix these points before sending',
  'Avisos detectados': 'Detected warnings',
  'Errores detectados en el envio': 'Errors detected during dispatch',
  'Errores detectados en el envío': 'Errors detected during dispatch',
  'No volver a preguntar durante esta sesion': 'Do not ask again during this session',
  'No volver a preguntar durante esta sesión': 'Do not ask again during this session',
  'Anadir relacion': 'Add relation',
  'Añadir relacion': 'Add relation',
  'Eliminar relacion': 'Delete relation',
  'Eliminar relación': 'Delete relation',
  'Por cada': 'For each',
  'Combinar con': 'Combine with',
  'Modo de generacion': 'Generation mode',
  'Modo de generación': 'Generation mode',
  'Bloque simple (1 parametro)': 'Simple block (1 parameter)',
  'Bloque simple (1 parámetro)': 'Simple block (1 parameter)',
  'Relacion parametros (producto cartesiano)': 'Parameter relation (cartesian product)',
  'Relación parámetros (producto cartesiano)': 'Parameter relation (cartesian product)',
  'Pega una lista (una linea por valor). Se creara una nueva tupla por cada valor para el mismo endpoint/comando.': 'Paste a list (one line per value). A new tuple will be created for each value for the same endpoint/command.',
  'Pega una lista (una línea por valor). Se creará una nueva tupla por cada valor para el mismo endpoint/comando.': 'Paste a list (one line per value). A new tuple will be created for each value for the same endpoint/command.',
  'Haz clic en los campos para expandir/contraer. Selecciona los que deseas mostrar en la tabla.': 'Click fields to expand/collapse. Select the ones you want to show in the table.',
  'Buscar campos (ej: destination, string, value)...': 'Search fields (e.g. destination, string, value)...',
  'Define una descripcion corta para agrupar este REST desde la pantalla de inicio.': 'Define a short description to group this REST from the home screen.',
  'Define una descripción corta para agrupar este REST desde la pantalla de inicio.': 'Define a short description to group this REST from the home screen.',
  'Tema de colores': 'Color theme',
  'Modo del tema': 'Theme mode',
  'Modo de interfaz': 'Interface mode',
  'Mostrar listado de comandos favoritos en constructor': 'Show favorite commands list in builder',
  'No se pudo copiar al portapapeles.': 'Could not copy to clipboard.',
  'No se pudo guardar el archivo JSON.': 'Could not save JSON file.',
  'No se pudo guardar la peticion favorita.': 'Could not save favorite request.',
  'No se pudo guardar la petición favorita.': 'Could not save favorite request.',
  'No se pudo guardar la variable privada.': 'Could not save private variable.',
  'Cuando está activo, si un endpoint nuevo reutiliza nombres de parámetro ya usados en otros endpoints, se generan variantes del tipo {{param}} > {{param1}} > {{param2}} para que cada tupla conserve sus valores propios sin sustituirse entre sí.': 'When enabled, if a new endpoint reuses parameter names already used in other endpoints, variants such as {{param}} > {{param1}} > {{param2}} are created so each tuple keeps its own values without overwriting the others.',
  'add new params': 'add new params',
  'No se pudo importar el JSON de solicitudes.': 'Could not import request JSON.',
  'No se detectaron peticiones favoritas validas en el archivo.': 'No valid favorite requests found in the file.',
  'No se detectaron peticiones favoritas válidas en el archivo.': 'No valid favorite requests found in the file.',
  'No se detectaron endpoints base favoritos validos en el archivo.': 'No valid favorite base endpoints found in the file.',
  'No se detectaron endpoints base favoritos válidos en el archivo.': 'No valid favorite base endpoints found in the file.',
  'No se detectaron comandos favoritos validos en el archivo.': 'No valid favorite commands found in the file.',
  'No se detectaron comandos favoritos válidos en el archivo.': 'No valid favorite commands found in the file.',
  'No se pudo clasificar el estado HTTP.': 'Could not classify HTTP status.',
  'El JSON no contiene solicitudes GET/POST importables.': 'JSON does not contain importable GET/POST requests.',
  'El archivo no corresponde al formato de comandos favoritos de PostAIS.': 'The file does not match the PostAIS favorite commands format.',
  'El archivo no corresponde al formato de endpoints base favoritos de PostAIS.': 'The file does not match the PostAIS favorite base endpoints format.',
  'El archivo no corresponde al formato de favoritos de peticiones de PostAIS.': 'The file does not match the PostAIS favorite requests format.',
  'Importa un Excel o CSV para comenzar.': 'Import an Excel or CSV file to start.',
  'Sin archivo cargado': 'No file loaded',
};

const EXACT_GL: Record<string, string> = {
  'Aplicación para procesamiento de mensajería API REST': 'Aplicación para procesamento de mensaxería API REST',
  'Para mensajeria GET y POST': 'Para mensaxería GET e POST',
  'Para mensajería GET y POST': 'Para mensaxería GET e POST',
  Configuracion: 'Configuración',
  'Modo claro': 'Modo claro',
  'Modo oscuro': 'Modo escuro',
  Estado: 'Estado',
  Inicio: 'Inicio',
  Historial: 'Historial',
  Favoritos: 'Favoritos',
  Vista: 'Vista',
  Basica: 'Básica',
  'Básica': 'Básica',
  Avanzada: 'Avanzada',
  Variables: 'Variables',
  'Variables privadas': 'Variables privadas',
  Nombre: 'Nome',
  Persistencia: 'Persistencia',
  'Valor privado': 'Valor privado',
  Temporal: 'Temporal',
  'Local segura': 'Local segura',
  'No hay secretos.': 'Non hai segredos.',
  Guardar: 'Gardar',
  Cancelar: 'Cancelar',
  Cerrar: 'Pechar',
  Eliminar: 'Eliminar',
  Quitar: 'Retirar',
  Metodo: 'Método',
  'Método': 'Método',
  Endpoints: 'Endpoints',
  'Entorno favorito por defecto': 'Contorno favorito por defecto',
  'Tupla activa': 'Tupla activa',
  Activar: 'Activar',
  'Agregar endpoint GET': 'Engadir endpoint GET',
  'Agregar endpoint POST': 'Engadir endpoint POST',
  'Constructor de Endpoint': 'Construtor de Endpoint',
  'Endpoint base': 'Endpoint base',
  Comando: 'Comando',
  'Anadir a endpoint': 'Engadir ao endpoint',
  'Añadir a endpoint': 'Engadir ao endpoint',
  'Sustituir endpoint(s)': 'Substituír endpoint(s)',
  'Lista para enviar': 'Lista para enviar',
  'Validacion previa': 'Validación previa',
  'Validación previa': 'Validación previa',
  'Resultados detallados': 'Resultados detallados',
  'Historial de solicitudes': 'Historial de solicitudes',
  'Copiar todo': 'Copiar todo',
  'Fila anterior': 'Fila anterior',
  'Fila siguiente': 'Fila seguinte',
  Importado: 'Importado',
  Enviado: 'Enviado',
  Tiempo: 'Tempo',
  Request: 'Request',
  Response: 'Response',
  'Endpoint activo': 'Endpoint activo',
  'Endpoint POST activo': 'Endpoint POST activo',
  'Fila de prueba': 'Fila de proba',
  'Enviar GET activo': 'Enviar GET activo',
  'Enviar lote GET': 'Enviar lote GET',
  'Enviar fila actual': 'Enviar fila actual',
  'Enviar lote completo': 'Enviar lote completo',
  'Detener despues de la actual': 'Deter despois da actual',
  'Detener después de la actual': 'Deter despois da actual',
  'Importar JSON': 'Importar JSON',
  'Exportar JSON': 'Exportar JSON',
  'Vaciar historial': 'Baleirar historial',
  'Consultas registradas': 'Consultas rexistradas',
  'Tema de colores': 'Tema de cores',
  'Modo del tema': 'Modo do tema',
  'Modo de interfaz': 'Modo de interface',
  'Mostrar listado de comandos favoritos en constructor': 'Mostrar a listaxe de comandos favoritos no construtor',
  'Idioma de la aplicacion': 'Idioma da aplicación',
  'Idioma de la aplicación': 'Idioma da aplicación',
  Espanol: 'Castelán',
  Español: 'Castelán',
  English: 'Inglés',
  'No hay datos': 'Non hai datos',
  'Guardar endpoint base': 'Gardar endpoint base',
  'Guardar comando': 'Gardar comando',
  'Endpoints favoritos': 'Endpoints favoritos',
  'Comandos favoritos': 'Comandos favoritos',
  'Peticiones favoritas completas': 'Peticions favoritas completas',
  'Cargar en inicio': 'Cargar no inicio',
  'Usar como comando': 'Usar como comando',
  'Usar como base': 'Usar como base',
  'Sin archivo cargado': 'Sen ficheiro cargado',
  'Importa un Excel o CSV para comenzar.': 'Importa un Excel ou CSV para comezar.',
  'Generar sample script': 'Xerar sample script',
  'Generar sample script de nuevo': 'Xerar sample script de novo',
  'Regenerar sample script': 'Rexerar sample script',
  'Editar script activo': 'Editar script activo',
  'Resultado correcto': 'Resultado correcto',
  'Resultado con redireccion o advertencia': 'Resultado con redirección ou advertencia',
  'Resultado con redirección o advertencia': 'Resultado con redirección ou advertencia',
  'Resultado con error': 'Resultado con erro',
  'Visualización de respuesta': 'Visualización da resposta',
  'Generar script de visualización': 'Xerar script de visualización',
  'Mostrar menos': 'Mostrar menos',
  'Copiar respuesta': 'Copiar resposta',
  'Respuesta copiada al portapapeles.': 'Resposta copiada ao portapapeis.',
  'No se pudo copiar la respuesta al portapapeles.': 'Non se puido copiar a resposta ao portapapeis.',
  'No se encontraron campos.': 'Non se atoparon campos.',
  'Coincidencias del constructor': 'Coincidencias do construtor',
  'Coincidencias comando': 'Coincidencias do comando',
  Coincidencias: 'Coincidencias',
  'No hay coincidencias con el texto actual.': 'Non hai coincidencias co texto actual.',
  'No hay coincidencias de endpoint base.': 'Non hai coincidencias de endpoint base.',
  'No hay coincidencias de comando.': 'Non hai coincidencias de comando.',
  'Campos clave del body': 'Campos clave do body',
  'Headers de respuesta': 'Headers da resposta',
  'Filtrar por columna': 'Filtrar por columna',
  'Filtrar por valor': 'Filtrar por valor',
  'Todas las columnas': 'Todas as columnas',
  'Todos los valores': 'Todos os valores',
  'Añadir filtro': 'Engadir filtro',
  'Anadir filtro': 'Engadir filtro',
  'Eliminar filtro': 'Eliminar filtro',
  'Limpiar filtros': 'Limpar filtros',
  'Sin filas generadas por el script.': 'Non se xeraron filas polo script.',
  'No hay filas que coincidan con los filtros seleccionados.': 'Non hai filas que coincidan cos filtros seleccionados.',
  'Sin fila seleccionada.': 'Non hai ningunha fila seleccionada.',
  'No hay respuestas para copiar.': 'Non hai respostas para copiar.',
  'Historial de solicitudes vaciado.': 'Historial de solicitudes baleirado.',
  'No hay solicitudes en el historial para exportar.': 'Non hai solicitudes no historial para exportar.',
  'No hay peticiones favoritas para exportar.': 'Non hai peticións favoritas para exportar.',
  'No hay endpoints base favoritos para exportar.': 'Non hai endpoints base favoritos para exportar.',
  'No hay comandos favoritos para exportar.': 'Non hai comandos favoritos para exportar.',
  'No hay endpoints GET configurados.': 'Non hai endpoints GET configurados.',
  'Agrega al menos un endpoint GET antes de enviar.': 'Engade polo menos un endpoint GET antes de enviar.',
  'Define una URL de destino antes de enviar.': 'Define unha URL de destino antes de enviar.',
  'No se pudo validar el lote.': 'Non se puido validar o lote.',
  'No se pudo generar la vista previa.': 'Non se puido xerar a vista previa.',
  'Sin autenticacion': 'Sen autenticación',
  'Sin autenticación': 'Sen autenticación',
  Autenticacion: 'Autenticación',
  'Autenticación': 'Autenticación',
  'Sin variables privadas': 'Sen variables privadas',
  'Permitir TLS autofirmado (solo pruebas)': 'Permitir TLS autofirmado (só probas)',
  'Timeout por solicitud (ms)': 'Tempo límite por solicitude (ms)',
  'Delay entre filas (ms)': 'Espera entre filas (ms)',
  'Archivo Excel o CSV': 'Ficheiro Excel ou CSV',
  'Body RAW manual': 'Body RAW manual',
  'Separador RAW': 'Separador RAW',
  'Usar primera fila como nombres de campo': 'Usar a primeira fila como nomes de campo',
  'Headers JSON': 'Headers JSON',
  'Query params JSON': 'Query params JSON',
  'Body template JSON': 'Modelo de body JSON',
  'Corrige estos puntos antes de enviar': 'Corrixe estes puntos antes de enviar',
  'Avisos detectados': 'Avisos detectados',
  'Errores detectados en el envio': 'Erros detectados no envío',
  'Errores detectados en el envío': 'Erros detectados no envío',
  'Anadir relacion': 'Engadir relación',
  'Añadir relacion': 'Engadir relación',
  'Eliminar relacion': 'Eliminar relación',
  'Eliminar relación': 'Eliminar relación',
  'Por cada': 'Por cada',
  'Combinar con': 'Combinar con',
  'Modo de generacion': 'Modo de xeración',
  'Modo de generación': 'Modo de xeración',
  'Bloque simple (1 parametro)': 'Bloque simple (1 parámetro)',
  'Bloque simple (1 parámetro)': 'Bloque simple (1 parámetro)',
  'Relacion parametros (producto cartesiano)': 'Relación de parámetros (produto cartesiano)',
  'Relación parámetros (producto cartesiano)': 'Relación de parámetros (produto cartesiano)',
  'No se pudo leer el CSV:': 'Non se puido ler o CSV:',
  'No se pudo leer el Excel:': 'Non se puido ler o Excel:',
  'Configurada manualmente.': 'Configurada manualmente.',
  'Autodetectada desde variables privadas.': 'Detectada automaticamente desde variables privadas.',
};

const PARTIAL_GL: Array<[RegExp, PatternReplacement]> = [
  [/\bConfiguracion\b/g, 'Configuración'],
  [/\bConfiguración\b/g, 'Configuración'],
  [/\bAplicacion\b/g, 'Aplicación'],
  [/\baplicación\b/g, 'aplicación'],
  [/\bAjusta\b/g, 'Axusta'],
  [/\bpreferencias\b/g, 'preferencias'],
  [/\bErrores\b/g, 'Erros'],
  [/\bError\b/g, 'Erro'],
  [/\bavisos\b/g, 'avisos'],
  [/\bsolicitudes\b/g, 'solicitudes'],
  [/\bpeticiones\b/g, 'peticións'],
  [/\bpeticións\b/g, 'peticións'],
  [/\bAñadir\b/g, 'Engadir'],
  [/\bAnadir\b/g, 'Engadir'],
  [/\bAgregar\b/g, 'Engadir'],
  [/\bSustituir\b/g, 'Substituír'],
  [/\bDescripcion\b/g, 'Descrición'],
  [/\bDescripción\b/g, 'Descrición'],
  [/\bMetodo\b/g, 'Método'],
  [/\bMétodo\b/g, 'Método'],
  [/\bEntorno\b/g, 'Contorno'],
  [/\bEntornos\b/g, 'Contornos'],
  [/\bMostrar\b/g, 'Mostrar'],
  [/\bOcultar\b/g, 'Agochar'],
  [/\bExpandir\b/g, 'Expandir'],
  [/\bCerrar\b/g, 'Pechar'],
  [/\bGuardar\b/g, 'Gardar'],
  [/\bEliminar\b/g, 'Eliminar'],
  [/\bCopiar\b/g, 'Copiar'],
  [/\bBuscar\b/g, 'Buscar'],
  [/\bFiltrar\b/g, 'Filtrar'],
  [/\bseleccionada\b/g, 'seleccionada'],
  [/\bseleccionado\b/g, 'seleccionado'],
  [/\bseleccionados\b/g, 'seleccionados'],
  [/\bNo hay\b/g, 'Non hai'],
  [/\bSin\b/g, 'Sen'],
  [/\bVacio\b/g, 'Baleiro'],
  [/\bVacío\b/g, 'Baleiro'],
  [/\bactual\b/g, 'actual'],
  [/\bcorrectamente\b/g, 'correctamente'],
  [/\bantes de\b/g, 'antes de'],
  [/\bpara\b/g, 'para'],
  [/\by\b/g, 'e'],
];

const EXACT_CA: Record<string, string> = {
  'Aplicación para procesamiento de mensajería API REST': 'Aplicació per al processament de missatgeria API REST',
  'Para mensajeria GET y POST': 'Per a missatgeria GET i POST',
  'Para mensajería GET y POST': 'Per a missatgeria GET i POST',
  Configuracion: 'Configuració',
  'Modo claro': 'Mode clar',
  'Modo oscuro': 'Mode fosc',
  Estado: 'Estat',
  Inicio: 'Inici',
  Historial: 'Historial',
  Favoritos: 'Preferits',
  Vista: 'Vista',
  Basica: 'Bàsica',
  'Básica': 'Bàsica',
  Avanzada: 'Avançada',
  Variables: 'Variables',
  'Variables privadas': 'Variables privades',
  Nombre: 'Nom',
  Persistencia: 'Persistència',
  'Valor privado': 'Valor privat',
  Temporal: 'Temporal',
  'Local segura': 'Local segura',
  'No hay secretos.': 'No hi ha secrets.',
  Guardar: 'Desar',
  Cancelar: 'Cancel·lar',
  Cerrar: 'Tancar',
  Eliminar: 'Eliminar',
  Quitar: 'Treure',
  Metodo: 'Mètode',
  'Método': 'Mètode',
  Endpoints: 'Endpoints',
  'Entorno favorito por defecto': 'Entorn preferit per defecte',
  'Tupla activa': 'Tupla activa',
  Activar: 'Activar',
  'Agregar endpoint GET': 'Afegir endpoint GET',
  'Agregar endpoint POST': 'Afegir endpoint POST',
  'Constructor de Endpoint': 'Constructor d’Endpoint',
  'Endpoint base': 'Endpoint base',
  Comando: 'Comanda',
  'Anadir a endpoint': 'Afegir a endpoint',
  'Añadir a endpoint': 'Afegir a endpoint',
  'Sustituir endpoint(s)': 'Substituir endpoint(s)',
  'Lista para enviar': 'Preparat per enviar',
  'Validacion previa': 'Validació prèvia',
  'Validación previa': 'Validació prèvia',
  'Resultados detallados': 'Resultats detallats',
  'Historial de solicitudes': 'Historial de sol·licituds',
  'Copiar todo': 'Copiar-ho tot',
  'Fila anterior': 'Fila anterior',
  'Fila siguiente': 'Fila següent',
  Importado: 'Importat',
  Enviado: 'Enviat',
  Tiempo: 'Temps',
  Request: 'Request',
  Response: 'Response',
  'Endpoint activo': 'Endpoint actiu',
  'Endpoint POST activo': 'Endpoint POST actiu',
  'Fila de prueba': 'Fila de prova',
  'Enviar GET activo': 'Enviar GET actiu',
  'Enviar lote GET': 'Enviar lot GET',
  'Enviar fila actual': 'Enviar la fila actual',
  'Enviar lote completo': 'Enviar el lot complet',
  'Detener despues de la actual': 'Aturar després de l’actual',
  'Detener después de la actual': 'Aturar després de l’actual',
  'Importar JSON': 'Importar JSON',
  'Exportar JSON': 'Exportar JSON',
  'Vaciar historial': 'Buidar l’historial',
  'Consultas registradas': 'Consultes registrades',
  'Tema de colores': 'Tema de colors',
  'Modo del tema': 'Mode del tema',
  'Modo de interfaz': 'Mode d’interfície',
  'Mostrar listado de comandos favoritos en constructor': 'Mostrar la llista de comandes preferides al constructor',
  'Idioma de la aplicacion': 'Idioma de l’aplicació',
  'Idioma de la aplicación': 'Idioma de l’aplicació',
  Espanol: 'Castellà',
  Español: 'Castellà',
  English: 'Anglès',
  'No hay datos': 'No hi ha dades',
  'Guardar endpoint base': 'Desar endpoint base',
  'Guardar comando': 'Desar comanda',
  'Endpoints favoritos': 'Endpoints preferits',
  'Comandos favoritos': 'Comandes preferides',
  'Cargar en inicio': 'Carregar a l’inici',
  'Usar como comando': 'Usar com a comanda',
  'Usar como base': 'Usar com a base',
  'Sin archivo cargado': 'Cap fitxer carregat',
  'Importa un Excel o CSV para comenzar.': 'Importa un Excel o CSV per començar.',
  'Generar sample script': 'Generar sample script',
  'Regenerar sample script': 'Regenerar sample script',
  'Editar script activo': 'Editar l’script actiu',
  'Resultado correcto': 'Resultat correcte',
  'Resultado con redireccion o advertencia': 'Resultat amb redirecció o advertiment',
  'Resultado con redirección o advertencia': 'Resultat amb redirecció o advertiment',
  'Resultado con error': 'Resultat amb error',
  'Visualización de respuesta': 'Visualització de la resposta',
  'Generar script de visualización': 'Generar script de visualització',
  'Mostrar menos': 'Mostrar menys',
  'Copiar respuesta': 'Copiar resposta',
  'No se encontraron campos.': 'No s’han trobat camps.',
  'No hay coincidencias con el texto actual.': 'No hi ha coincidències amb el text actual.',
  'Campos clave del body': 'Camps clau del body',
  'Headers de respuesta': 'Headers de resposta',
  'Filtrar por columna': 'Filtrar per columna',
  'Filtrar por valor': 'Filtrar per valor',
  'Todas las columnas': 'Totes les columnes',
  'Todos los valores': 'Tots els valors',
  'Añadir filtro': 'Afegir filtre',
  'Anadir filtro': 'Afegir filtre',
  'Eliminar filtro': 'Eliminar filtre',
  'Limpiar filtros': 'Netejar filtres',
  'Sin filas generadas por el script.': 'No s’han generat files amb l’script.',
  'No hay filas que coincidan con los filtros seleccionados.': 'No hi ha files que coincideixin amb els filtres seleccionats.',
  'Sin fila seleccionada.': 'No hi ha cap fila seleccionada.',
  'No hay respuestas para copiar.': 'No hi ha respostes per copiar.',
  'Sin autenticacion': 'Sense autenticació',
  'Sin autenticación': 'Sense autenticació',
  Autenticacion: 'Autenticació',
  'Autenticación': 'Autenticació',
  'Sin variables privadas': 'Sense variables privades',
  'Permitir TLS autofirmado (solo pruebas)': 'Permetre TLS autofirmat (només proves)',
  'Timeout por solicitud (ms)': 'Temps d’espera per sol·licitud (ms)',
  'Delay entre filas (ms)': 'Retard entre files (ms)',
  'Archivo Excel o CSV': 'Fitxer Excel o CSV',
  'Usar primera fila como nombres de campo': 'Usar la primera fila com a noms de camp',
  'Body template JSON': 'Plantilla de body JSON',
  'Corrige estos puntos antes de enviar': 'Corregeix aquests punts abans d’enviar',
  'Avisos detectados': 'Advertiments detectats',
  'Errores detectados en el envio': 'Errors detectats en l’enviament',
  'Errores detectados en el envío': 'Errors detectats en l’enviament',
  'Anadir relacion': 'Afegir relació',
  'Añadir relacion': 'Afegir relació',
  'Eliminar relacion': 'Eliminar relació',
  'Eliminar relación': 'Eliminar relació',
  'Por cada': 'Per cada',
  'Combinar con': 'Combinar amb',
  'Modo de generacion': 'Mode de generació',
  'Modo de generación': 'Mode de generació',
  'Bloque simple (1 parametro)': 'Bloc simple (1 paràmetre)',
  'Bloque simple (1 parámetro)': 'Bloc simple (1 paràmetre)',
  'Relacion parametros (producto cartesiano)': 'Relació de paràmetres (producte cartesià)',
  'Relación parámetros (producto cartesiano)': 'Relació de paràmetres (producte cartesià)',
  'No se pudo leer el CSV:': 'No s’ha pogut llegir el CSV:',
  'No se pudo leer el Excel:': 'No s’ha pogut llegir l’Excel:',
  'Configurada manualmente.': 'Configurada manualment.',
  'Autodetectada desde variables privadas.': 'Detectada automàticament des de variables privades.',
};

const PARTIAL_CA: Array<[RegExp, PatternReplacement]> = [
  [/\bConfiguracion\b/g, 'Configuració'],
  [/\bConfiguración\b/g, 'Configuració'],
  [/\bAplicacion\b/g, 'Aplicació'],
  [/\bAplicación\b/g, 'Aplicació'],
  [/\bAjusta\b/g, 'Ajusta'],
  [/\bErrores\b/g, 'Errors'],
  [/\bError\b/g, 'Error'],
  [/\bsolicitudes\b/g, 'sol·licituds'],
  [/\bpeticiones\b/g, 'peticions'],
  [/\bAñadir\b/g, 'Afegir'],
  [/\bAnadir\b/g, 'Afegir'],
  [/\bAgregar\b/g, 'Afegir'],
  [/\bSustituir\b/g, 'Substituir'],
  [/\bDescripcion\b/g, 'Descripció'],
  [/\bDescripción\b/g, 'Descripció'],
  [/\bMetodo\b/g, 'Mètode'],
  [/\bMétodo\b/g, 'Mètode'],
  [/\bEntorno\b/g, 'Entorn'],
  [/\bEntornos\b/g, 'Entorns'],
  [/\bOcultar\b/g, 'Amagar'],
  [/\bCerrar\b/g, 'Tancar'],
  [/\bGuardar\b/g, 'Desar'],
  [/\bCopiar\b/g, 'Copiar'],
  [/\bBuscar\b/g, 'Cercar'],
  [/\bFiltrar\b/g, 'Filtrar'],
  [/\bNo hay\b/g, 'No hi ha'],
  [/\bSin\b/g, 'Sense'],
  [/\bVacio\b/g, 'Buit'],
  [/\bVacío\b/g, 'Buit'],
  [/\by\b/g, 'i'],
];

type PatternReplacement = string | ((substring: string, ...groups: string[]) => string);

const PARTIAL_EN: Array<[RegExp, PatternReplacement]> = [
  [/^Historial \((\d+)\)$/g, (_s, count) => `History (${count})`],
  [/^Favoritos \(E:(\d+) y C:(\d+)\)$/g, (_s, endpoints, commands) => `Favorites (E:${endpoints} C:${commands})`],
  [/^Variables privadas \((\d+)\)$/g, (_s, count) => `Private variables (${count})`],
  [/^Archivo actual: (.+)$/g, (_s, filename) => `Current file: ${filename}`],
  [/^(\d+) filas importadas$/g, (_s, count) => `${count} imported rows`],
  [/^Fila (\d+)$/g, (_s, row) => `Row ${row}`],
  [/^(\d+) \/ (\d+)$/g, (_s, current, total) => `${current} / ${total}`],
  [/^GET completado\. (\d+)\/(\d+) solicitudes correctas\.$/g, (_s, ok, total) => `GET completed. ${ok}/${total} successful requests.`],
  [/^POST completado\. (\d+)\/(\d+) solicitudes correctas\.$/g, (_s, ok, total) => `POST completed. ${ok}/${total} successful requests.`],
  [/^GET (\d+): (.+)$/g, (_s, idx, endpoint) => `GET ${idx}: ${endpoint}`],
  [/^POST (\d+): (.+)$/g, (_s, idx, endpoint) => `POST ${idx}: ${endpoint}`],
  [/^(\d+) respuestas registradas$/g, (_s, count) => `${count} recorded responses`],
  [/^(\d+) respuesta\(s\) registradas$/g, (_s, count) => `${count} recorded response(s)`],
  [/^(\d+) respuesta\(s\) registrada\(s\)$/g, (_s, count) => `${count} recorded response(s)`],
  [/^(\d+) endpoint\(s\) GET listos para ejecutar\.$/g, (_s, count) => `${count} GET endpoint(s) ready to execute.`],
  [/^(\d+) endpoint\(s\) POST listos para ejecutar\.$/g, (_s, count) => `${count} POST endpoint(s) ready to execute.`],
  [/^(\d+) comando\(s\) favorito\(s\) (GET|POST) exportados\.$/g, (_s, count, method) => `${count} favorite ${method} command(s) exported.`],
  [/^(\d+) endpoint\(s\) base favorito\(s\) exportados\.$/g, (_s, count) => `${count} favorite base endpoint(s) exported.`],
  [/^(\d+) peticion\(es\) favorita\(s\) exportadas\.$/g, (_s, count) => `${count} favorite request(s) exported.`],
  [/^(\d+) petición\(es\) favorita\(s\) exportadas\.$/g, (_s, count) => `${count} favorite request(s) exported.`],
  [/^(\d+) filas disponibles\. Variables detectadas: (.+)\.$/g, (_s, rows, vars) => `${rows} rows available. Detected variables: ${vars}.`],
  [/^Sin CSV: se enviara una solicitud unica\.$/g, 'No CSV: a single request will be sent.'],
  [/^Sin CSV: se enviara una solicitud POST usando Body RAW manual vacio\.$/g, 'No CSV: a POST request will be sent using an empty manual RAW body.'],
  [/^Sin CSV: se enviara una solicitud POST usando Body RAW manual\.$/g, 'No CSV: a POST request will be sent using manual RAW body.'],
  [/^Carga un Excel o CSV para validar columnas y preparar el lote\.$/g, 'Load an Excel or CSV to validate columns and prepare the batch.'],
  [/^Endpoint: (.+)$/g, (_s, endpoint) => `Endpoint: ${endpoint}`],
  [/^Nombre: (.+)$/g, (_s, name) => `Name: ${name}`],
  [/^Metodo: (.+)$/g, (_s, method) => `Method: ${method}`],
  [/^Método: (.+)$/g, (_s, method) => `Method: ${method}`],
  [/^Filas: (.+)$/g, (_s, rows) => `Rows: ${rows}`],
  [/^Total endpoints: (.+)$/g, (_s, total) => `Total endpoints: ${total}`],
  [/^Endpoint base guardado en favoritos: (.+)$/g, (_s, endpoint) => `Base endpoint saved to favorites: ${endpoint}`],
  [/^Endpoint base eliminado de favoritos: (.+)$/g, (_s, endpoint) => `Base endpoint removed from favorites: ${endpoint}`],
  [/^Comando guardado en favoritos \((.+)\): (.+)$/g, (_s, scope, command) => `Command saved to favorites (${scope}): ${command}`],
  [/^Comando eliminado de favoritos \((.+)\): (.+)$/g, (_s, scope, command) => `Command removed from favorites (${scope}): ${command}`],
  [/^Endpoint guardado en favoritos: (.+)$/g, (_s, endpoint) => `Endpoint saved to favorites: ${endpoint}`],
  [/^Endpoint eliminado de favoritos: (.+)$/g, (_s, endpoint) => `Endpoint removed from favorites: ${endpoint}`],
  [/^Solicitud GET cargada desde historial: (.+)\.$/g, (_s, name) => `GET request loaded from history: ${name}.`],
  [/^Solicitud POST cargada desde historial: (.+)\.$/g, (_s, name) => `POST request loaded from history: ${name}.`],
  [/^No hay respuesta GET reciente asociada a (.+) para generar un sample\.$/g, (_s, cmd) => `No recent GET response associated with ${cmd} to generate a sample.`],
  [/^No hay respuesta GET reciente asociada a (.+) para editar el script\.$/g, (_s, cmd) => `No recent GET response associated with ${cmd} to edit the script.`],
  [/^No se encontraron campos estructurados para generar un sample de script\.$/g, 'No structured fields were found to generate a script sample.'],
  [/^Peticion del historial guardada en favoritos: (.+)$/g, (_s, name) => `History request saved to favorites: ${name}`],
  [/^Petición del historial guardada en favoritos: (.+)$/g, (_s, name) => `History request saved to favorites: ${name}`],
  [/^Error al copiar: (.+)$/g, (_s, detail) => `Copy error: ${detail}`],
  [/^No se pudo leer el CSV: (.+)$/g, (_s, detail) => `Could not read CSV: ${detail}`],
  [/^No se pudo leer el Excel: (.+)$/g, (_s, detail) => `Could not read Excel: ${detail}`],
  [/^El CSV contiene (\d+) error\(es\)\. Revisa el formato y vuelve a cargarlo\.$/g, (_s, count) => `CSV contains ${count} error(s). Check the format and reload.`],
  [/^No se pudo importar (.+): no hay filas con contenido\.$/g, (_s, fileName) => `Could not import ${fileName}: no rows with content.`],
  [/^No se pudo importar (.+)\.$/g, (_s, fileName) => `Could not import ${fileName}.`],
  [/^El archivo no corresponde al formato de (.+) de PostAIS\.$/g, (_s, target) => `The file does not match the PostAIS ${target} format.`],
  [/^El JSON no contiene solicitudes GET\/POST importables\.$/g, 'JSON does not contain importable GET/POST requests.'],
  [/^No se pudo abrir el grupo de parametros: tupla POST no valida\.$/g, 'Could not open parameter group: invalid POST tuple.'],
  [/^No se pudo abrir el grupo de parametros: tupla GET no valida\.$/g, 'Could not open parameter group: invalid GET tuple.'],
  [/^Proceso detenido por error en endpoint (\d+)\.$/g, (_s, endpoint) => `Process stopped due to error on endpoint ${endpoint}.`],
  [/^Proceso detenido por error en la fila (\d+)\.$/g, (_s, row) => `Process stopped due to error on row ${row}.`],
  [/^Se copiaron (\d+) respuesta\(s\) al portapapeles\.$/g, (_s, count) => `${count} response(s) copied to clipboard.`],
  [/^Solicitud GET cargada desde historial: (.+)\.$/g, (_s, name) => `GET request loaded from history: ${name}.`],
  [/^Solicitud POST cargada desde historial: (.+)\.$/g, (_s, name) => `POST request loaded from history: ${name}.`],
  [/^No hay comandos favoritos (GET|POST) para exportar\.$/g, (_s, method) => `No favorite ${method} commands to export.`],
  [/^(\d+) solicitud\(es\) exportadas a JSON\.$/g, (_s, count) => `${count} request(s) exported to JSON.`],
  [/^(\d+) solicitud\(es\) importadas desde (.+)\.$/g, (_s, count, file) => `${count} request(s) imported from ${file}.`],
  [/^Envio detenido\. (\d+) solicitudes procesadas\.$/g, (_s, count) => `Dispatch stopped. ${count} requests processed.`],
  [/^Enviando endpoint (\d+)\/(\d+) fila (\d+)\/(\d+)\.\.\.$/g, (_s, e1, e2, r1, r2) => `Sending endpoint ${e1}/${e2} row ${r1}/${r2}...`],
  [/^([A-Z]+) completado\. (\d+)\/(\d+) solicitudes correctas\.$/g, (_s, method, ok, total) => `${method} completed. ${ok}/${total} successful requests.`],
  [/^Todavia no hay solicitudes guardadas\. Ejecuta una consulta o importa una coleccion JSON\.$/g, 'No saved requests yet. Run a query or import a JSON collection.'],
  [/^Todavía no hay solicitudes guardadas\. Ejecuta una consulta o importa una colección JSON\.$/g, 'No saved requests yet. Run a query or import a JSON collection.'],
  [/\bConfiguracion\b/g, 'Settings'],
  [/\bEstado\b/g, 'Status'],
  [/\bInicio\b/g, 'Home'],
  [/\bHistorial\b/g, 'History'],
  [/\bFavoritos\b/g, 'Favorites'],
  [/\bVariables privadas\b/g, 'Private variables'],
  [/\bSin archivo cargado\b/g, 'No file loaded'],
  [/\bVista\b/g, 'View'],
  [/\bMétodo\b/g, 'Method'],
  [/\bMetodo\b/g, 'Method'],
  [/\bComando\b/g, 'Command'],
  [/\bEndpoint base\b/g, 'Base endpoint'],
  [/\bConstructor de Endpoint\b/g, 'Endpoint Builder'],
  [/\bValidacion previa\b/g, 'Pre-send validation'],
  [/\bValidación previa\b/g, 'Pre-send validation'],
  [/\bEnvio Mensajeria\b/g, 'Messaging Dispatch'],
  [/\bEnvío Mensajeria\b/g, 'Messaging Dispatch'],
  [/\bResultados detallados\b/g, 'Detailed results'],
  [/\bCoincidencias del constructor\b/g, 'Builder matches'],
  [/\bCoincidencias comando\b/g, 'Command matches'],
  [/\bAgregar\b/g, 'Add'],
  [/\bAñadir\b/g, 'Add'],
  [/\bAnadir\b/g, 'Add'],
  [/\bAvanzada\b/g, 'Advanced'],
  [/\bBasica\b/g, 'Basic'],
  [/\bBásica\b/g, 'Basic'],
  [/\bDescripción\b/g, 'Description'],
  [/\bDescripcion\b/g, 'Description'],
  [/\bEntorno\b/g, 'Environment'],
  [/\bImportacion\b/g, 'Import'],
  [/\bImportación\b/g, 'Import'],
  [/\bOcultar\b/g, 'Hide'],
  [/\bExpandir\b/g, 'Expand'],
  [/\bGuardar\b/g, 'Save'],
  [/\bEliminar\b/g, 'Delete'],
  [/\bQuitar\b/g, 'Remove'],
  [/\bCopiar\b/g, 'Copy'],
  [/\bCambiar a modo claro\b/g, 'Switch to light mode'],
  [/\bCambiar a modo oscuro\b/g, 'Switch to dark mode'],
  [/\bPaleta actual de PostAIS con variantes clara y oscura\./g, 'Current PostAIS palette with light and dark variants.'],
  [/\bClaro arena con acentos teal y oscuro grafito calido\./g, 'Sand light theme with teal accents and warm graphite dark theme.'],
  [/\bEscala azul monocromatica, enfoque tecnico y contraste consistente\./g, 'Monochrome blue scale, technical style, and consistent contrast.'],
  [/\bTema calido con tonos amarillos y rojizos para reducir luz azul, con alto contraste\./g, 'Warm theme with yellow and reddish tones to reduce blue light, with high contrast.'],
  [/\bBase gris pizarra con acentos menta, legibilidad alta en claro y oscuro\./g, 'Slate base with mint accents, high readability in light and dark.'],
  [/\bPor defecto\b/g, 'Default'],
];

const SKIP_PARENT_TAGS = new Set(['SCRIPT', 'STYLE', 'TEXTAREA']);

export function isSupportedLanguage(value: string | null | undefined): value is AppLanguage {
  return value === 'es' || value === 'en' || value === 'gl' || value === 'ca';
}

export function detectSystemLanguage(): AppLanguage {
  if (typeof navigator === 'undefined') {
    return 'es';
  }

  const localeCandidates = [
    ...(Array.isArray(navigator.languages) ? navigator.languages : []),
    navigator.language,
  ].filter((value): value is string => typeof value === 'string' && value.trim() !== '');

  const normalized = localeCandidates.map((value) => value.toLowerCase());

  if (normalized.some((value) => value.startsWith('en'))) {
    return 'en';
  }

  if (normalized.some((value) => value.startsWith('gl'))) {
    return 'gl';
  }

  if (normalized.some((value) => value.startsWith('ca'))) {
    return 'ca';
  }

  if (normalized.some((value) => value.startsWith('es'))) {
    return 'es';
  }

  return 'es';
}

export function resolveInitialLanguage(): AppLanguage {
  try {
    const stored = window.localStorage.getItem(APP_LANGUAGE_PREF_STORAGE_KEY);
    if (isSupportedLanguage(stored)) {
      return stored;
    }
  } catch {
    // Ignore storage errors and fall back to system language.
  }

  return detectSystemLanguage();
}

export function translateUiText(language: AppLanguage, text: string): string {
  if (language === 'es') {
    return text;
  }

  const trimmed = text.trim();
  if (!trimmed) {
    return text;
  }

  if (isLikelyTechnicalValue(trimmed)) {
    return text;
  }

  const direct = language === 'gl' ? EXACT_GL[trimmed] : language === 'ca' ? EXACT_CA[trimmed] : EXACT_EN[trimmed];
  if (direct) {
    return withOriginalSpacing(text, direct);
  }

  let translated = trimmed;
  const partialTranslations = language === 'gl' ? PARTIAL_GL : language === 'ca' ? PARTIAL_CA : PARTIAL_EN;
  for (const [pattern, replacement] of partialTranslations) {
    translated = typeof replacement === 'string'
      ? translated.replace(pattern, replacement)
      : translated.replace(pattern, replacement as (substring: string, ...groups: string[]) => string);
  }

  return withOriginalSpacing(text, translated);
}

export function listSupportedLanguages(): Array<{ id: AppLanguage; label: string }> {
  return [
    { id: 'es', label: 'Espanol' },
    { id: 'en', label: 'English' },
    { id: 'gl', label: 'Galego' },
    { id: 'ca', label: 'Català' },
  ];
}

export function getLanguageOptionLabel(language: AppLanguage, option: AppLanguage): string {
  if (language === 'en') {
    return option === 'es' ? 'Spanish' : option === 'gl' ? 'Galician' : option === 'ca' ? 'Catalan' : 'English';
  }

  if (language === 'gl') {
    return option === 'es' ? 'Castelán' : option === 'en' ? 'Inglés' : option === 'ca' ? 'Catalán' : 'Galego';
  }

  if (language === 'ca') {
    return option === 'es' ? 'Castellà' : option === 'en' ? 'Anglès' : option === 'gl' ? 'Gallec' : 'Català';
  }

  return option === 'es' ? 'Español' : option === 'en' ? 'Inglés' : option === 'gl' ? 'Galego' : 'Català';
}

export function applyTranslationsToSubtree(rootNode: Node, language: AppLanguage): void {
  processNode(rootNode, language, false);
}

export function applyTranslationsToMutation(node: Node, language: AppLanguage): void {
  processNode(node, language, false);
}

function processNode(node: Node, language: AppLanguage, refreshOriginal: boolean): void {
  if (node.nodeType === Node.TEXT_NODE) {
    processTextNode(node as Text, language, refreshOriginal);
    return;
  }

  if (node.nodeType !== Node.ELEMENT_NODE) {
    return;
  }

  const rootElement = node as Element;
  processElementAttributes(rootElement, language, refreshOriginal);

  const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
  let current = walker.nextNode();
  while (current) {
    processTextNode(current as Text, language, refreshOriginal);
    current = walker.nextNode();
  }

  const elements = rootElement.querySelectorAll('*');
  elements.forEach((element) => {
    processElementAttributes(element, language, refreshOriginal);
  });
}

function processTextNode(textNode: Text, language: AppLanguage, refreshOriginal: boolean): void {
  const parent = textNode.parentElement;
  if (!parent) {
    return;
  }

  if (SKIP_PARENT_TAGS.has(parent.tagName) || parent.closest('code, pre')) {
    return;
  }

  if (parent.closest(NON_TRANSLATABLE_ANCESTOR_SELECTORS)) {
    return;
  }

  if (language === 'es') {
    const original = TEXT_NODE_ORIGINALS.get(textNode);
    const currentValue = textNode.nodeValue ?? '';
    if (typeof original === 'string') {
      const translatedOriginal = translateUiText('en', original);
      const translatedGalician = translateUiText('gl', original);
      const translatedCatalan = translateUiText('ca', original);
      if ((currentValue === translatedOriginal || currentValue === translatedGalician || currentValue === translatedCatalan) && currentValue !== original) {
        textNode.nodeValue = original;
        return;
      }

      // React may have already rendered new Spanish source text.
      // In that case, keep it and adopt it as the new original baseline.
      if (currentValue.trim() && currentValue !== original) {
        TEXT_NODE_ORIGINALS.set(textNode, currentValue);
      }
    }
    return;
  }

  const currentValue = textNode.nodeValue ?? '';
  if (!currentValue.trim()) {
    return;
  }

  const existingOriginal = TEXT_NODE_ORIGINALS.get(textNode);
  if (refreshOriginal || !existingOriginal) {
    TEXT_NODE_ORIGINALS.set(textNode, currentValue);
  } else {
    const translatedFromOriginal = translateUiText(language, existingOriginal);
    // If React replaced content with a new Spanish phrase while EN mode is active,
    // refresh the source text. If this mutation came from our own translation,
    // this condition won't trigger.
    if (currentValue !== translatedFromOriginal) {
      TEXT_NODE_ORIGINALS.set(textNode, currentValue);
    }
  }

  const source = TEXT_NODE_ORIGINALS.get(textNode) ?? currentValue;
  const translated = translateUiText(language, source);
  if (translated !== currentValue) {
    textNode.nodeValue = translated;
  }
}

function processElementAttributes(element: Element, language: AppLanguage, refreshOriginal: boolean): void {
  const attributes = ['placeholder', 'title', 'aria-label'];

  for (const attributeName of attributes) {
    const value = element.getAttribute(attributeName);
    if (typeof value !== 'string') {
      continue;
    }

    let attrMap = ATTR_ORIGINALS.get(element);
    if (!attrMap) {
      attrMap = new Map<string, string>();
      ATTR_ORIGINALS.set(element, attrMap);
    }

    if (language === 'es') {
      const original = attrMap.get(attributeName);
      if (typeof original === 'string') {
        const translatedOriginal = translateUiText('en', original);
        const translatedGalician = translateUiText('gl', original);
        const translatedCatalan = translateUiText('ca', original);
        if ((value === translatedOriginal || value === translatedGalician || value === translatedCatalan) && value !== original) {
          element.setAttribute(attributeName, original);
          continue;
        }

        // If React already rendered updated Spanish text, do not overwrite it.
        // Store it as new baseline for future toggles.
        if (value.trim() && value !== original) {
          attrMap.set(attributeName, value);
        }
      }
      continue;
    }

    const existingOriginal = attrMap.get(attributeName);
    if (refreshOriginal || !existingOriginal) {
      attrMap.set(attributeName, value);
    } else {
      const translatedFromOriginal = translateUiText(language, existingOriginal);
      if (value !== translatedFromOriginal) {
        attrMap.set(attributeName, value);
      }
    }

    const source = attrMap.get(attributeName) ?? value;
    if (isLikelyTechnicalValue(source)) {
      continue;
    }

    const translated = translateUiText(language, source);
    if (translated !== value) {
      element.setAttribute(attributeName, translated);
    }
  }
}

function isLikelyTechnicalValue(value: string): boolean {
  const compact = value.trim();
  if (!compact) {
    return true;
  }

  if (/^(https?:\/\/|\/v\d+\/|\/?[\w-]+\/[\w\-./{}:]+)$/i.test(compact)) {
    return true;
  }

  if (/^\{\{[^}]+\}\}$/.test(compact) || compact.includes('://') || compact.includes('{') || compact.includes('}')) {
    return true;
  }

  if (/^[A-Z_]{2,}$/.test(compact) || /^\d+$/.test(compact)) {
    return true;
  }

  return false;
}

function withOriginalSpacing(original: string, translatedCore: string): string {
  const leading = original.match(/^\s*/)?.[0] ?? '';
  const trailing = original.match(/\s*$/)?.[0] ?? '';
  return `${leading}${translatedCore}${trailing}`;
}

export function getTranslatedThemePaletteLabel(language: AppLanguage, paletteId: string, fallbackLabel: string): string {
  if (language === 'es') {
    return fallbackLabel;
  }

  switch (paletteId) {
    case 'default':
      return language === 'gl' ? 'Predeterminada' : language === 'ca' ? 'Predeterminada' : 'Default';
    case 'slate-mint':
      return 'Slate Mint';
    case 'sand-teal':
      return 'Sand Teal';
    case 'mono-blue':
      return 'Mono Blue';
    case 'nocturno':
      return language === 'gl' ? 'Nocturno' : 'Nocturno';
    default:
      return fallbackLabel;
  }
}
