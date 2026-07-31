/* ============================================================
   CONFIGURACION DE MARCA  ·  Poly
   ------------------------------------------------------------
   Todo lo que distingue a este cotizador de los de otras marcas
   vive aca. Los modulos de src/shared/ leen este objeto y no
   tienen ni una sola constante hardcodeada por marca.

   Se carga ANTES que cualquier modulo compartido.

   Para sumar una marca nueva: copiar este archivo, ajustar los
   valores y cargar los mismos modulos de shared/. No se copia
   ni una linea de logica.
   ============================================================ */
window.CEVEN_BRAND = {
  id:     'poly',           // valor de la columna `brand` en Supabase
  label:  'Poly',
  prefix: 'poly_',          // prefijo de las claves de localStorage

  /* --- Sincronizacion (shared/sync.js) ------------------------------ */

  // Nombres BASE, sin prefijo: sync.js les antepone `prefix`.
  // Poly no tiene nacionalizacion ni target anual.
  settingKeys: ['cquotes','cpl','carchive','cqc','clogo','clogo_dark'],

  // Fila de pipeline por OPG (no por qNum — ver pipeline-core.js): sin familias
  // Apple (qMac/qIph/...), con opg/salas/factura en su lugar.
  pipeCols: ['id','fecha','fechaISO','cliente','ejecutivo','mesCierre','estado',
    'monto','moneda','opg','salas','factura'],

  numCols: ['id','monto'],

  // Columnas jsonb: viajan como objeto/array nativo, no como string.
  objCols: ['salas'],

  // Columnas numericas en Supabase que la app guarda como string con ceros a la
  // izquierda (col -> ancho). Poly numera por OPG, que es texto libre: ninguna.
  padCols: {},

  // Escalares que aceptan NULL: hay que emitirlos explicitamente como null.
  // `factura` es el caso que motivo esto: al vaciar el campo se seteaba null,
  // el upsert omitia la columna, PostgREST conservaba el numero viejo y el poll
  // lo revertia — re-renderizando la tabla cada 15s para siempre.
  nullableCols: ['opg','factura','mesCierre'],

  // Campos que existen SOLO en localStorage (no hay columna en Supabase).
  localOnlyCols: [],

  /* --- Navegacion (shared/navbar.js) -------------------------------- */

  // Vistas que aparecen en la barra superior, en orden. `alsoFor` son las
  // vistas que NO tienen item propio y marcan a esta como activa (se llega a
  // ellas desde adentro). `needsPipeline` esconde el item para el rol lector,
  // que no usa pipeline. Poly no tiene nacionalizacion: un item menos.
  navItems: [
    { view: 'quote',    label: 'Cotización' },
    { view: 'catalog',  label: 'Catálogo', alsoFor: ['addprod'] },
    { view: 'history',  label: 'Historial' },
    { view: 'pipeline', label: 'Pipeline', needsPipeline: true }
  ],

  /* --- Pipeline: vista (shared/pipeline-ui.js) ---------------------- */

  // Columnas cuyo orden por defecto es DESCENDENTE al tocar el encabezado
  // (numeros y fechas se leen "de mayor a menor"; el texto, alfabetico).
  // Poly no tiene las columnas de unidades por familia ni margen.
  pipeSortDescCols: ['monto','fechaISO'],

  /* --- Backup (shared/backup.js, shared/backup-folder.js) ----------- */

  idbKey:          'pipeFolder_poly',               // handle de carpeta en IndexedDB
  appTag:          'CevenCotizadorPoly',            // marca del archivo de backup
  backupVersion:   1,
  autoSnapVersion: 1,
  pipeFilePrefix:  'Ceven_Poly_Pipeline_Backup_',
  fullBackupFile:  'Ceven_Poly_Backup_Completo.json',
  exportPrefix:    'Ceven_Poly_Backup_',

  // Claves BASE que entran al backup pero NO a settingKeys (no sincronizan).
  // Poly no tiene flags de migracion todavia.
  backupExtraKeys: [],

  // Como se llama el listado de productos en los carteles al usuario.
  plLabel: 'catálogo'
};

/* Helper de claves: cevenK('cquotes') -> 'cquotes' en Apple, 'poly_cquotes' en Poly.
   Todo modulo compartido accede a localStorage a traves de esto. */
window.cevenK = function(base){ return window.CEVEN_BRAND.prefix + base; };
