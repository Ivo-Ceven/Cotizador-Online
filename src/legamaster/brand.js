/* ============================================================
   CONFIGURACION DE MARCA  ·  Legamaster
   ------------------------------------------------------------
   Todo lo que distingue a este cotizador de los de otras marcas
   vive aca. Los modulos de src/shared/ leen este objeto y no
   tienen ni una sola constante hardcodeada por marca.

   Se carga ANTES que cualquier modulo compartido.

   Clonado de poly/brand.js (mismo modelo de pipeline por proyecto,
   mismo esquema de niveles de precio) — ver docs/ARQUITECTURA.md,
   "Multi-marca: cómo enchufar HP" para la receta general.
   ============================================================ */
window.CEVEN_BRAND = {
  id:     'legamaster',           // valor de la columna `brand` en Supabase
  label:  'Legamaster',
  prefix: 'legamaster_',          // prefijo de las claves de localStorage

  /* --- Sincronizacion (shared/sync.js) ------------------------------ */

  // Nombres BASE, sin prefijo: sync.js les antepone `prefix`.
  // Legamaster no tiene nacionalizacion ni target anual (igual que Poly).
  settingKeys: ['cquotes','cpl','carchive','cqc','cclientes','clogo','clogo_dark','cpapelera'],

  /* Listas que componen una cotizacion. shared/opciones.js las usa para borrar
     la Opcion B entera sin conocer los arrays de cada marca. Legamaster
     cotiza solo productos, sin garantías ni listas adicionales. */
  quoteLists: [
    {nombre: 'items', get: function(){ return items; }, set: function(v){ items = v; }}
  ],

  /* Fila de pipeline = UN PROYECTO = UNA COTIZACION, mismo modelo que Poly
     desde 08/2026 (ver poly/js/pipeline-core.js): la identidad de la fila es
     el número de cotización, no un agrupador externo.

     Sin `opg` ni `factura`: este Excel no trae un número de precio especial
     de fábrica ni un sistema de seguimiento de venta equivalente al Netsuite
     de Poly. Son columnas ADITIVAS — se pueden sumar después sin migrar nada
     si aparece un programa de registro de proyecto o un link de seguimiento
     de venta que valga la pena guardar. */
  pipeCols: ['id','fecha','fechaISO','qNum','cliente','clienteId','proyecto',
    'ejecutivo','mesCierre','estado','monto','moneda'],

  numCols: ['id','qNum','clienteId','monto'],

  // Columnas jsonb: ninguna, mismo criterio que Poly.
  objCols: [],

  /* Columnas numericas en Supabase que la app guarda como string con ceros a
     la izquierda (col -> ancho). Misma trampa documentada en apple/brand.js
     y poly/brand.js: sin esto, `qNum` queda marcado como cambiado para
     siempre y el poll re-renderiza la tabla cada 15s. */
  padCols: { qNum: 4 },

  // Escalares que aceptan NULL: hay que emitirlos explicitamente como null.
  nullableCols: ['mesCierre','proyecto','clienteId'],

  // Campos que existen SOLO en localStorage (no hay columna en Supabase).
  localOnlyCols: [],

  /* Claves cuyo valor solo puede SUBIR (ver poly/brand.js para el porqué:
     sin esto el contador de cotizaciones podía retroceder con el poll y
     las próximas cotizaciones reusaban números ya emitidos). */
  monotonicKeys: ['cqc'],

  /* --- Color de marca (shared/theme.js) ----------------------------- */

  // Verde Legamaster desaturado — distinto de Apple (violeta), Poly (naranja)
  // y HP (azul): el criterio es distinguirse entre marcas, no imitar el logo
  // al pixel. Ajustar el hex cuando llegue el logo real de la marca.
  theme: { accent:'#5a8f3c', hover:'#4a7530', soft:'#eef5e8', dk:'#8fc26a' },

  /* --- Niveles de precio (catalogo con tiers) ----------------------- */

  /* La lista de precios de Legamaster trae 3 precios por SKU en la MISMA
     fila (a diferencia de Poly, que trae 4 en filas separadas por nivel):
     "PCIO VTA CON REGISTRO", "PCIO VTA CANAL" y "PCIO VTA WEB". `v` es la
     clave bajo la que se guarda en `producto.precios`; `lbl` es lo que se
     lee en pantalla. El ORDEN es de presentación, no implica precio.

     Sin nivel `deal:true`: este Excel no trae una segunda lista de
     promociones como el BOM Calculator de HP/Poly, así que no aplica el
     mecanismo de DEAL de Poly (ver poly/js/catalog.js y poly/js/tiers.js). */
  priceTiers: [
    { v: 'Con Registro', lbl: 'Con Registro' },
    { v: 'Canal',        lbl: 'Canal' },
    { v: 'Web',          lbl: 'Web' }
  ],

  /* --- Condiciones comerciales (shared/pdf-core.js) ----------------- */

  // Sin condiciones fijas propias, igual que Poly. Si Legamaster llega a
  // tener una (garantía de fábrica, plazo de RMA...), el lugar es esta
  // lista — nunca un `if` por marca adentro de shared/.
  condicionesFijas: [],

  /* --- Navegacion (shared/navbar.js) -------------------------------- */

  navItems: [
    { view: 'quote',    label: 'Cotización' },
    { view: 'catalog',  label: 'Catálogo', alsoFor: ['addprod'] },
    { view: 'history',  label: 'Historial' },
    { view: 'pipeline', label: 'Pipeline', needsPipeline: true }
  ],

  /* --- Pipeline: vista (shared/pipeline-ui.js) ---------------------- */

  // Una columna menos que Poly (sin OPG): Fecha/Ejecutivo/Cotiz./Proyecto/
  // Cierre estimado/Estado/Monto/Acciones = 8.
  pipeColCount: 8,

  pipeSortDescCols: ['monto','fechaISO'],

  /* --- Backup (shared/backup.js, shared/backup-folder.js) ----------- */

  idbKey:          'pipeFolder_legamaster',
  appTag:          'CevenCotizadorLegamaster',
  backupVersion:   1,
  autoSnapVersion: 1,
  pipeFilePrefix:  'Ceven_Legamaster_Pipeline_Backup_',
  fullBackupFile:  'Ceven_Legamaster_Backup_Completo.json',
  exportPrefix:    'Ceven_Legamaster_Backup_',

  // Claves BASE que entran al backup pero NO a settingKeys (no sincronizan).
  backupExtraKeys: [],

  // Como se llama el listado de productos en los carteles al usuario.
  plLabel: 'catálogo'
};

/* Helper de claves: cevenK('cquotes') -> 'legamaster_cquotes'.
   Todo modulo compartido accede a localStorage a traves de esto. */
window.cevenK = function(base){ return window.CEVEN_BRAND.prefix + base; };
