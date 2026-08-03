/* ============================================================
   CONFIGURACION DE MARCA  ·  Apple
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
  id:     'apple',          // valor de la columna `brand` en Supabase
  label:  'Apple',
  prefix: '',               // prefijo de las claves de localStorage

  /* --- Sincronizacion (shared/sync.js) ------------------------------ */

  // Nombres BASE, sin prefijo: sync.js les antepone `prefix`.
  settingKeys: ['cquotes','cpl','carchive','cnac','cqc','cclientes','ctarget','ctarget_manual',
                'clogo','clogo_dark','cnac_mac24_v2'],

  pipeCols: ['id','fecha','fechaISO','qNum','cliente','proyecto','ejecutivo','mesCierre','estado',
    'qMac','qIph','qIpad','qServ','qAcc','montoMac','montoIph','montoIpad','montoAcc','montoServ',
    'monto','margenPond','moneda','skuStatus','skuMesCierre','skuPartialQty','skuPartialRemSt',
    'skuPartialRemMes','skuArchivedQty','ovLink','esFOB'],

  numCols: ['id','qNum','qMac','qIph','qIpad','qServ','qAcc','montoMac','montoIph','montoIpad',
    'montoAcc','montoServ','monto','margenPond'],

  // Columnas jsonb: viajan como objeto nativo, no como string.
  objCols: ['skuStatus','skuMesCierre','skuPartialQty','skuPartialRemSt','skuPartialRemMes',
    'skuArchivedQty'],

  // Columnas numericas en Supabase que la app guarda como string con ceros a la
  // izquierda. col -> ancho. qNum vuelve de la base como 71 (bigint) pero
  // cquotes lo tiene como '0071': sin re-rellenar, el match falla y el diff
  // marca la fila como cambiada para siempre.
  padCols: { qNum: 4 },

  // Escalares que aceptan NULL: hay que emitirlos explicitamente como null.
  // Si se omiten del payload, PostgREST conserva el valor viejo y el poll lo
  // vuelve a traer, dejando el pipeline en un ciclo de revert infinito.
  nullableCols: ['ovLink','proyecto','mesCierre'],

  // Campos que existen SOLO en localStorage (no hay columna en Supabase).
  // El poll tiene que preservarlos al mergear las filas del servidor.
  localOnlyCols: ['skuOvLinks'],

  /* Claves cuyo valor solo puede SUBIR. El contador de cotizaciones es una:
     el poll escribia el valor del servidor sin comparar magnitud, asi que si
     otro equipo estaba atrasado el contador local RETROCEDIA y las proximas
     cotizaciones reusaban numeros ya emitidos. sync.js las resuelve con
     Math.max en vez de pisar, en el poll y en el bootstrap. */
  monotonicKeys: ['cqc'],

  /* --- Color de marca (shared/theme.js) ----------------------------- */

  // Acento: filete de la barra superior, vista activa, boton Guardar, links y
  // foco. Es la senal de en que cotizador estas. `soft` es el fondo tenue.
  //
  // Violeta casi negro, para acompanar al logo negro de Apple. `dk` NO es una
  // variante apenas mas clara como en las otras marcas: sobre el #1c1c1e del
  // modo oscuro un violeta casi negro directamente no se ve, asi que ahi va uno
  // claro del mismo tono.
  //
  // OJO: esto pinta lo que pasa por --acc (ver shared/theme.js). El azul
  // #0071e3 sigue hardcodeado en la pagina de CevenCare, en los chips de estado
  // "Cotizado" y en varios botones sueltos: eso es el AZUL SEMANTICO (--cblue),
  // no el acento de marca, y no se mueve con este campo.
  theme: { accent:'#2d1b4e', hover:'#1e1235', soft:'#efeaf7', dk:'#a78bfa' },

  /* --- Niveles de precio ------------------------------------------- */

  // Apple no cotiza por niveles: el precio sale del costo + margen por item.
  priceTiers: [],

  /* --- Navegacion (shared/navbar.js) -------------------------------- */

  // Vistas que aparecen en la barra superior, en orden. `alsoFor` son las
  // vistas que NO tienen item propio y marcan a esta como activa (se llega a
  // ellas desde adentro). `needsPipeline` esconde el item para el rol lector,
  // que no usa pipeline.
  navItems: [
    { view: 'quote',    label: 'Cotización',      alsoFor: ['qnac'] },
    { view: 'catalog',  label: 'Price list',      alsoFor: ['addprod'] },
    { view: 'nac',      label: 'Nacionalización' },
    { view: 'history',  label: 'Historial' },
    { view: 'pipeline', label: 'Pipeline', needsPipeline: true }
  ],

  /* --- Pipeline: vista (shared/pipeline-ui.js) ---------------------- */

  // Columnas cuyo orden por defecto es DESCENDENTE al tocar el encabezado
  // (numeros y fechas se leen "de mayor a menor"; el texto, alfabetico).
  // Cuantas columnas tiene la tabla: el <tr> de encabezado de cada cliente lo
  // necesita para el colspan (shared/pipeline-group.js).
  pipeColCount: 14,

  pipeSortDescCols: ['monto','qMac','qIph','qIpad','qServ','qAcc','margenPond','fechaISO'],

  /* --- Backup (shared/backup.js, shared/backup-folder.js) ----------- */

  idbKey:          'pipeFolder',                    // handle de carpeta en IndexedDB
  appTag:          'CevenCotizador',                // marca del archivo de backup
  backupVersion:   4,
  autoSnapVersion: 2,
  pipeFilePrefix:  'Ceven_Pipeline_Backup_',
  fullBackupFile:  'Ceven_Backup_Completo.json',
  exportPrefix:    'Ceven_Backup_',

  // Claves BASE que entran al backup pero NO a settingKeys (no sincronizan).
  // Son los flags de migracion de las tasas NAC: si se pierden, la migracion
  // se vuelve a aplicar y pisa los porcentajes que el usuario haya tocado.
  // (cnac_mac24_v2 ya esta en settingKeys.)
  backupExtraKeys: ['cnac_neo25_v3'],

  // Como se llama el listado de productos en los carteles al usuario.
  plLabel: 'price list'
};

/* Helper de claves: cevenK('cquotes') -> 'cquotes' en Apple, 'poly_cquotes' en Poly.
   Todo modulo compartido accede a localStorage a traves de esto. */
window.cevenK = function(base){ return window.CEVEN_BRAND.prefix + base; };
