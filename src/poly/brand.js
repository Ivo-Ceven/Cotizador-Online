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
  // `cpapelera` sincroniza como una mas: la papelera es del EQUIPO, no del
  // dispositivo donde se borro (ver shared/papelera.js).
  settingKeys: ['cquotes','cpl','carchive','cqc','cclientes','clogo','clogo_dark','cpapelera'],

  /* Listas que componen una cotizacion. shared/opciones.js las usa para borrar
     la Opcion B entera sin conocer los arrays de cada marca. Poly cotiza solo
     productos: las garantias CevenCare son de Apple. */
  quoteLists: [
    {nombre: 'items', get: function(){ return items; }, set: function(v){ items = v; }}
  ],

  /* Fila de pipeline = UN PROYECTO = UNA COTIZACION (08/2026). Antes era un OPG
     con un array `salas[]` adentro y el estado a nivel OPG; ahora el OPG es un
     dato informativo del proyecto y cada proyecto lleva su propio estado, mes de
     cierre y link de Netsuite (columna `factura`, ver mas abajo). `salas` ya no
     existe.

     Sin familias Apple (qMac/qIph/...) ni margen: eso sigue siendo de Apple.

     `skuStatus` (03/09/2026) es el estado propio de una linea de producto: el
     estado de la fila vale para todos sus articulos MENOS los que tengan uno
     configurado en particular (ver shared/pipeline-sku.js). La columna jsonb
     ya existia en la tabla `pipeline` desde 07/2026 —la usaba solo Apple—, asi
     que esto es declarativo: no hubo migracion. */
  pipeCols: ['id','fecha','fechaISO','qNum','cliente','clienteId','proyecto','opg',
    'ejecutivo','mesCierre','estado','monto','moneda','factura','perdidoMotivo','skuStatus'],

  numCols: ['id','qNum','clienteId','monto'],

  // skuStatus va aca ADEMAS de en pipeCols: sin esto pickPipe() lo emite como
  // string y el jsonb entra roto (ver shared/sync.js).
  objCols: ['perdidoMotivo','skuStatus'],

  /* Columnas numericas en Supabase que la app guarda como string con ceros a la
     izquierda (col -> ancho). `qNum` se guarda '0071' y la columna es bigint:
     SIN esto, coerce() devuelve 71, normPipe() compara '0071' !== 71, la fila
     queda marcada como cambiada PARA SIEMPRE y el poll re-renderiza la tabla
     cada 15s. Es la misma trampa documentada en apple/brand.js. */
  padCols: { qNum: 4 },

  // Escalares que aceptan NULL: hay que emitirlos explicitamente como null.
  // OJO con `factura`: la columna se llama asi por historia, pero desde 08/2026
  // guarda el LINK A NETSUITE del proyecto, no un numero de factura. Se renombro
  // solo lo que se lee en pantalla — igual que "sala" -> "Proyecto" — porque la
  // columna existe en Supabase y ya tiene datos. Ver poly/js/pipeline-detail.js.
  //
  // Es ademas el caso que motivo `nullableCols`: al vaciar el campo se seteaba null,
  // el upsert omitia la columna, PostgREST conservaba el numero viejo y el poll
  // lo revertia — re-renderizando la tabla cada 15s para siempre.
  nullableCols: ['opg','factura','mesCierre','proyecto','clienteId'],

  // Campos que existen SOLO en localStorage (no hay columna en Supabase).
  localOnlyCols: [],

  /* Claves cuyo valor solo puede SUBIR. El contador de cotizaciones es una:
     el poll escribia el valor del servidor sin comparar magnitud, asi que si
     otro equipo estaba atrasado el contador local RETROCEDIA y las proximas
     cotizaciones reusaban numeros ya emitidos. sync.js las resuelve con
     Math.max en vez de pisar, en el poll y en el bootstrap. */
  monotonicKeys: ['cqc'],

  /* --- Color de marca (shared/theme.js) ----------------------------- */

  // Naranja pizarra: el naranja del logo (#ff3900) bajado y desaturado. El puro
  // es un color de senal —sobre blanco da 3,6:1 y como texto no se lee—; este
  // llega a 5:1 y sigue siendo el naranja de Poly de reojo.
  //
  // `dk` no es el mismo tono sino uno mas claro: sobre el fondo #1c1c1e del modo
  // oscuro el pizarra queda apagado (ver shared/theme.js y dark.css).
  theme: { accent:'#b35333', hover:'#94422a', soft:'#f7ede9', dk:'#e08560' },

  /* --- Niveles de precio (catalogo con tiers) ----------------------- */

  /* El export del ERP trae 4 precios por SKU. `v` es el valor tal cual viene en
     la columna "Nivel de precio" del archivo y es lo que se guarda; `lbl` es lo
     que se lee en pantalla. El ORDEN de esta lista es el de presentacion, NO
     implica que uno sea mas caro que otro: hay 16 SKUs donde Tier 2 sale mas
     que Tier 1, o donde Negocios Especiales no es el mas barato. Por eso el
     selector muestra el precio al lado de cada nivel.

     El QUINTO nivel, `DEAL`, NO viene del ERP: lo carga el segundo Excel del
     catalogo (hoja "Promos" del BOM Calculator de HP/Poly, ver
     poly/js/catalog.js). Es el precio BDNet de un numero de deal, valido hasta
     una fecha; solo lo tienen los SKU que estan en ese archivo. Se modela como
     un nivel mas —y no como un mecanismo aparte— para que use el mismo selector
     global, el mismo selector por linea y el mismo repricear que los otros
     cuatro. `deal: true` es la marca para los pocos lugares donde SI hay que
     distinguirlo: el alta de un articulo a mano no lo ofrece (un precio de deal
     sin numero ni vencimiento no significa nada) y el catalogo lo pinta aparte,
     con su numero y su fecha. */
  priceTiers: [
    { v: 'Ceven - Tier 1',      lbl: 'Tier 1' },
    { v: 'Ceven - Tier 2',      lbl: 'Tier 2' },
    { v: 'Ceven - Tier 3',      lbl: 'Tier 3' },
    { v: 'Negocios Especiales', lbl: 'Neg. Especiales' },
    { v: 'DEAL',                lbl: 'Deal', deal: true }
  ],

  /* --- Condiciones comerciales (shared/pdf-core.js) ----------------- */

  /* Lineas FIJAS del bloque "Condiciones Comerciales" que son propias de esta
     marca. Van despues de "Los precios expresados NO incluyen Impuestos" y
     antes de "Entrega". Las otras cuatro lineas (fecha efectiva, condicion de
     pago, moneda e impuestos) son iguales en todas las marcas y las arma
     cevenCondiciones().

     Poly no tiene ninguna. Apple pone aca "Incluye enrolamiento en Apple
     Business Manager", que es un servicio de esa marca y no significa nada en
     una cotizacion de audio y video. Si Poly llega a tener una condicion propia
     (garantia del fabricante, plazo de RMA...), el lugar es esta lista: NO un
     `if` por marca adentro de shared/. */
  condicionesFijas: [],

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
  // Cuantas columnas tiene la tabla: el <tr> de encabezado de cada cliente lo
  // necesita para el colspan (shared/pipeline-group.js).
  pipeColCount: 9,

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
