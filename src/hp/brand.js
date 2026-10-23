/* ============================================================
   CONFIGURACION DE MARCA  ·  HP
   ------------------------------------------------------------
   Todo lo que distingue a este cotizador de los de otras marcas
   vive aca. Los modulos de src/shared/ leen este objeto y no
   tienen ni una sola constante hardcodeada por marca.

   Se carga ANTES que cualquier modulo compartido.

   Para sumar una marca nueva: copiar este archivo, ajustar los
   valores y cargar los mismos modulos de shared/. No se copia
   ni una linea de logica.

   Alta: 23/10/2026. Salio de copiar src/huawei/ (que a su vez es
   Poly sin el REGI ni el nivel DEAL): mismo modelo de negocio
   —fila de pipeline = un proyecto, precio por nivel de catalogo,
   sin margen ni nacionalizacion ni garantias—. Los SKUs los carga
   el equipo a mano ("+ Nuevo artículo" en el Catalogo) hasta que
   haya un export del ERP; el importador ya prefiere la hoja "HP".

   El REGI y el nivel DEAL SI son de HP (el Deal Registration y la
   hoja "Promos" del BOM Calculator), pero arrancan afuera: el REGI
   hoy vive en una tabla exclusiva de Poly (poly_regi_pipeline, sin
   columna brand) y sumarlo aca es un trabajo aparte.
   ============================================================ */
window.CEVEN_BRAND = {
  id:     'hp',           // valor de la columna `brand` en Supabase
  label:  'HP',
  prefix: 'hp_',          // prefijo de las claves de localStorage

  /* --- Sincronizacion (shared/sync.js) ------------------------------ */

  // Nombres BASE, sin prefijo: sync.js les antepone `prefix`.
  // HP no tiene nacionalizacion ni target anual.
  // `cpapelera` sincroniza como una mas: la papelera es del EQUIPO, no del
  // dispositivo donde se borro (ver shared/papelera.js).
  settingKeys: ['cquotes','cpl','carchive','cqc','cclientes','clogo','clogo_dark','cpapelera'],

  /* Listas que componen una cotizacion. shared/opciones.js las usa para borrar
     la Opcion B entera sin conocer los arrays de cada marca. HP cotiza solo
     productos: las garantias CevenCare son de Apple. */
  quoteLists: [
    {nombre: 'items', get: function(){ return items; }, set: function(v){ items = v; }}
  ],

  /* Fila de pipeline = UN PROYECTO = UNA COTIZACION, el modelo de Poly. El OPG
     es un dato informativo del proyecto y cada proyecto lleva su propio estado,
     mes de cierre y link de Netsuite (columna `factura`, ver mas abajo).

     `opg` se conservo con ese nombre: es el numero de precio especial que
     asigna HP, igual que en Poly. La columna
     en Supabase se llama asi y la comparten todas las marcas, asi que se reusa
     en vez de agregar una columna nueva — mismo criterio que `factura`, que
     guarda el link a Netsuite. Si molesta, se renombra la ETIQUETA en pantalla
     y no la columna.

     Sin familias Apple (qMac/qIph/...) ni margen: eso sigue siendo de Apple.

     `skuStatus` es el estado propio de una linea de producto: el
     estado de la fila vale para todos sus articulos MENOS los que tengan uno
     configurado en particular (ver shared/pipeline-sku.js). La columna jsonb
     ya existia en la tabla `pipeline` desde 07/2026 —la usaba solo Apple—, asi
     que esto es declarativo: no hubo migracion. */
  // `fechaMod`: ISO de la ultima modificacion real de la fila, la sella
  //   savePipeline() (shared).
  // `mesAutoRoll`: mes de cierre ORIGINAL de una fila que el sistema movio al
  //   mes actual por estar vencida y abierta.
  //
  // Las dos columnas YA EXISTEN en la tabla `pipeline` (migraciones
  // 20260819121117 y 20260908120000, hechas para Apple y Poly). Declararlas aca
  // no pide ninguna migracion nueva: la tabla es compartida y separa por la
  // columna `brand`, asi que HP no toca el esquema.
  // `mesFact`,`fechaFact`,`skuMesFact`,`mesCierreAntes` (06/10/2026): mes en que se
  //   FACTURO la fila (shared/pipeline-facturacion.js). Columnas nuevas: migracion
  //   20261006120000, aplicar ANTES de deployar esto.
  pipeCols: ['id','fecha','fechaISO','qNum','cliente','clienteId','proyecto','opg',
    'ejecutivo','mesCierre','estado','monto','moneda','factura','perdidoMotivo','skuStatus',
    'fechaMod','mesAutoRoll','mesFact','fechaFact','skuMesFact','mesCierreAntes'],

  numCols: ['id','qNum','clienteId','monto'],

  // skuStatus va aca ADEMAS de en pipeCols: sin esto pickPipe() lo emite como
  // string y el jsonb entra roto (ver shared/sync.js).
  objCols: ['perdidoMotivo','skuStatus','skuMesFact'],

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
  // columna existe en Supabase y ya tiene datos. Ver hp/js/pipeline-detail.js.
  //
  // Es ademas el caso que motivo `nullableCols`: al vaciar el campo se seteaba null,
  // el upsert omitia la columna, PostgREST conservaba el numero viejo y el poll
  // lo revertia — re-renderizando la tabla cada 15s para siempre.
  // `mesAutoRoll` se limpia (delete) cuando el vendedor edita el mes a mano o
  // restaura de la cajita: hay que emitirlo como null explicito o el poll lo
  // revierte. `fechaMod` NO va aca: nunca se vacia, siempre es un ISO.
  nullableCols: ['opg','factura','mesCierre','proyecto','clienteId','mesAutoRoll',
    'mesFact','fechaFact','mesCierreAntes'],

  // Campos que existen SOLO en localStorage (no hay columna en Supabase).
  localOnlyCols: [],

  /* Claves cuyo valor solo puede SUBIR. El contador de cotizaciones es una:
     el poll escribia el valor del servidor sin comparar magnitud, asi que si
     otro equipo estaba atrasado el contador local RETROCEDIA y las proximas
     cotizaciones reusaban numeros ya emitidos. sync.js las resuelve con
     Math.max en vez de pisar, en el poll y en el bootstrap. */
  monotonicKeys: ['cqc'],

  /* --- Color de marca (shared/theme.js) ----------------------------- */

  // Azul HP oscurecido. El azul del logo (#0096d6) da 3,32:1 sobre blanco: no
  // alcanza para texto ni botones. #006ba6 da 5,75:1 y sigue siendo el azul de
  // HP. Es la unica marca azul, asi que no se confunde con ninguna otra (Apple
  // violeta, Poly terracota, Legamaster verde, Huawei vino).
  //
  // `dk` es uno mas claro para el modo oscuro: #4cb8ec da 7,6:1 contra #1c1c1e.
  //
  // ⚠ Si se cambia, hay que tocar tambien `.mcard[data-brand="hp"]` en
  // src/index.html: el shell no carga ningun brand.js.
  theme: { accent:'#006ba6', hover:'#005585', soft:'#e6f2f8', dk:'#4cb8ec' },

  /* --- Niveles de precio (catalogo con tiers) ----------------------- */

  /* El export del ERP trae 4 precios por SKU. `v` es el valor tal cual viene en
     la columna "Nivel de precio" del archivo y es lo que se guarda; `lbl` es lo
     que se lee en pantalla. El ORDEN de esta lista es el de presentacion, NO
     implica que uno sea mas caro que otro —en Poly hay 16 SKUs donde Tier 2 sale
     mas que Tier 1—, por eso el selector muestra el precio al lado de cada nivel.

     Son los MISMOS cuatro valores que Poly porque salen del mismo lugar: el
     export de NetSuite "LP y Stock" trae una hoja por marca y la columna "Nivel
     de precio" con el mismo juego de valores en todas. Si el archivo de HP
     terminara trayendo otros, se cambian aca y en ningun otro lado: catalog.js
     lee los niveles del archivo y tiers.js arma los dos selectores desde esta
     lista.

     Todavia sin el quinto nivel `DEAL` de Poly (precio BDNet de la hoja
     "Promos" del BOM Calculator de HP): el importador de ese archivo vive en
     poly/js/catalog.js y no se trajo. Cuando haga falta, el lugar es un nivel
     mas en esta lista con `deal: true` — el mismo modelo que Poly, para que lo
     coticen sin cambios el selector global, el de linea y repricearLinea(). */
  priceTiers: [
    { v: 'Ceven - Tier 1',      lbl: 'Tier 1' },
    { v: 'Ceven - Tier 2',      lbl: 'Tier 2' },
    { v: 'Ceven - Tier 3',      lbl: 'Tier 3' },
    { v: 'Negocios Especiales', lbl: 'Neg. Especiales' }
  ],

  /* --- Condiciones comerciales (shared/pdf-core.js) ----------------- */

  /* Lineas FIJAS del bloque "Condiciones Comerciales" que son propias de esta
     marca. Van despues de "Los precios expresados NO incluyen Impuestos" y
     antes de "Entrega". Las otras cuatro lineas (fecha efectiva, condicion de
     pago, moneda e impuestos) son iguales en todas las marcas y las arma
     cevenCondiciones().

     HP no tiene ninguna. Apple pone aca "Incluye enrolamiento en Apple
     Business Manager", que es un servicio de esa marca y no significa nada en
     una cotizacion de HP. Si HP llega a tener una condicion propia
     (garantia del fabricante, plazo de RMA...), el lugar es esta lista: NO un
     `if` por marca adentro de shared/. */
  condicionesFijas: [],

  /* --- Navegacion (shared/navbar.js) -------------------------------- */

  // Vistas que aparecen en la barra superior, en orden. `alsoFor` son las
  // vistas que NO tienen item propio y marcan a esta como activa (se llega a
  // ellas desde adentro). `needsPipeline` esconde el item para el rol lector,
  // que no usa pipeline.
  //
  // Dos items menos que Apple y uno menos que Poly: HP no tiene
  // nacionalizacion (eso es de Apple) ni, por ahora, la vista "📊 Estadisticas",
  // que en Poly es el tablero del REGI.
  navItems: [
    { view: 'quote',    label: 'Cotización' },
    { view: 'catalog',  label: 'Catálogo', alsoFor: ['addprod'] },
    { view: 'history',  label: 'Historial' },
    { view: 'pipeline', label: 'Pipeline', needsPipeline: true }
  ],

  /* --- Pipeline: vista (shared/pipeline-ui.js) ---------------------- */

  // Columnas cuyo orden por defecto es DESCENDENTE al tocar el encabezado
  // (numeros y fechas se leen "de mayor a menor"; el texto, alfabetico).
  // HP no tiene las columnas de unidades por familia ni margen.
  // Cuantas columnas tiene la tabla: el <tr> de encabezado de cada cliente lo
  // necesita para el colspan (shared/pipeline-group.js). Si se agrega o saca un
  // <th> de #pipe-table-normal, este numero va con el.
  // Las 10: Fecha, Ejecutivo, Oportunidad, Cotiz., Cliente final,
  // Proyecto/observaciones, Cierre estimado, Estado, Monto, Acciones.
  pipeColCount: 10,

  pipeSortDescCols: ['monto','fechaISO'],

  /* --- Backup (shared/backup.js, shared/backup-folder.js) ----------- */

  idbKey:          'pipeFolder_hp',               // handle de carpeta en IndexedDB
  appTag:          'CevenCotizadorHp',            // marca del archivo de backup
  backupVersion:   1,
  autoSnapVersion: 1,
  pipeFilePrefix:  'Ceven_HP_Pipeline_Backup_',
  fullBackupFile:  'Ceven_HP_Backup_Completo.json',
  exportPrefix:    'Ceven_HP_Backup_',

  // Claves BASE que entran al backup pero NO a settingKeys (no sincronizan).
  // HP no tiene flags de migracion todavia.
  backupExtraKeys: [],

  // Como se llama el listado de productos en los carteles al usuario.
  plLabel: 'catálogo'
};

/* Helper de claves: cevenK('cquotes') -> 'cquotes' en Apple, 'hp_cquotes' en HP.
   Todo modulo compartido accede a localStorage a traves de esto. */
window.cevenK = function(base){ return window.CEVEN_BRAND.prefix + base; };
