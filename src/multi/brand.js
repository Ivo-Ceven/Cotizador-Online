/* ============================================================
   CONFIGURACION DE MARCA  ·  Multimarca
   ------------------------------------------------------------
   El cotizador multimarca NO es una marca: es un cotizador que
   las cruza. Pero para todo src/shared/ es una marca mas —tiene
   su prefijo de localStorage, su contador, su historial y su
   pipeline— y por eso declara el mismo contrato que Apple y
   Poly. Asi reusa sync.js, auth.js, navbar.js, opciones.js,
   quote-num.js, papelera.js y el resto sin una sola rama nueva
   adentro de shared/.

   Lo que distingue a este cotizador (que sabe de VARIAS marcas)
   no vive aca sino en `js/marcas.js`: el registro con las reglas
   de precio y de emision de cada una.

   DOS COSAS QUE NO TIENE, a proposito:

   · `cpl` no esta en settingKeys. El catalogo no es suyo: lo lee
     de las otras marcas (js/catalogo-multi.js) y no lo edita. Si
     sincronizara un `cpl` propio habria dos catalogos que
     mantener y uno de los dos quedaria viejo.
   · `priceTiers` vacio. Los niveles son de Poly y salen del
     brand.js de Poly a traves del registro de marcas.
   ============================================================ */
window.CEVEN_BRAND = {
  id:     'multi',          // valor de la columna `brand` en Supabase
  label:  'Multimarca',
  prefix: 'multi_',         // prefijo de las claves de localStorage

  /* --- Sincronizacion (shared/sync.js) ------------------------------ */

  // Nombres BASE, sin prefijo. Sin `cpl`: ver el encabezado.
  settingKeys: ['cquotes','carchive','cqc','cclientes','clogo','clogo_dark','cpapelera'],

  quoteLists: [
    {nombre: 'items', get: function(){ return items; }, set: function(v){ items = v; }}
  ],

  /* Fila de pipeline = UN PEDIDO multimarca. Lleva el total del pedido entero,
     sin abrir por familia (eso es de Apple) ni por nivel (eso es de Poly): el
     detalle por marca vive en las filas que la emision crea en el pipeline de
     CADA marca, que son las que cuentan para el forecast.

     ⚠ NO hay columnas nuevas en Supabase. El link entre el pedido y las
     cotizaciones que genero viaja en `cquotes` (la clave `_multi` de cada
     fila), igual que las opciones A/B resolvieron su chapita sin agregar una
     columna: el dato ya se sincroniza y una migracion para algo que ya viaja
     es trabajo y riesgo de mas. */
  pipeCols: ['id','fecha','fechaISO','qNum','cliente','clienteId','proyecto','ejecutivo',
    'mesCierre','estado','monto','moneda'],

  numCols: ['id','qNum','clienteId','monto'],

  objCols: [],

  /* qNum se guarda '0042' y la columna es bigint: sin re-rellenar, el diff
     marca la fila como cambiada PARA SIEMPRE y el poll re-renderiza la tabla
     cada 15s. Misma trampa documentada en apple/brand.js y poly/brand.js. */
  padCols: { qNum: 4 },

  nullableCols: ['proyecto','mesCierre','clienteId'],

  localOnlyCols: [],

  // El contador solo puede subir (ver shared/quote-num.js y sync.js).
  monotonicKeys: ['cqc'],

  /* El numero del pedido se LEE 'M-0042' pero se GUARDA 0042, como en todas las
     marcas: la columna qNum de Supabase es bigint y `cquotes` compara strings
     con ceros a la izquierda. El prefijo es solo presentacion — lo aplica
     cevenPintarQNum() en shared/quote-num.js — y existe para que nadie
     confunda el numero de un pedido con el de una cotizacion de Apple. */
  qNumPrefijo: 'M-',

  // Y no es "una cotizacion": es un PEDIDO que se reparte en cotizaciones.
  qNumTitulo: 'Pedido',

  /* --- Color de marca (shared/theme.js) ----------------------------- */

  /* Verde azulado. El criterio de siempre es DISTINGUIRSE entre cotizadores, y
     aca importa el doble: el multimarca escribe en el pipeline de las otras
     marcas, asi que saber en cual estas parado no es un detalle estetico.
     No se parece ni al violeta de Apple, ni al naranja de Poly, ni al azul
     reservado para HP. */
  theme: { accent:'#0f6b62', hover:'#0a544d', soft:'#e6f2f1', dk:'#5ec9bd' },

  // El multimarca no cotiza por niveles propios: los de Poly salen del registro
  // de marcas (js/marcas.js), que lee el catalogo de esa marca.
  priceTiers: [],

  /* --- Condiciones comerciales (shared/pdf-core.js) ----------------- */

  /* Un pedido multimarca no puede prometer el enrolamiento en Apple Business
     Manager (es de Apple y solo aplica si hay equipos de Apple), asi que aca no
     hay lineas fijas: quedan las cuatro que arma cevenCondiciones() para todas
     las marcas. Lo especifico de cada marca se agrega en su cotizacion. */
  condicionesFijas: [],

  /* --- Navegacion (shared/navbar.js) -------------------------------- */

  /* Sin item de Nacionalizacion (es de Apple) ni de alta de productos: el
     catalogo aca es de solo lectura.

     TODAVIA SIN PIPELINE PROPIO. La plata de un pedido se sigue en el pipeline
     de CADA MARCA, que es donde se factura y lo que decidimos que mande para el
     forecast; el pipeline del pedido completo es una vista de seguimiento que
     todavia no existe. Poner el item antes que la vista mostraria una pantalla
     en blanco, que se lee como un bug. */
  navItems: [
    { view: 'quote',    label: 'Pedido' },
    { view: 'catalog',  label: 'Catálogo' },
    { view: 'history',  label: 'Historial' }
  ],

  /* --- Pipeline: vista (shared/pipeline-ui.js) ---------------------- */

  // Fecha, Nº, Cliente, Proyecto, Ejecutivo, Marcas, Monto, Mes, Estado, Acciones
  pipeColCount: 10,

  pipeSortDescCols: ['monto','fechaISO'],

  /* --- Backup (shared/backup.js, shared/backup-folder.js) ----------- */

  idbKey:          'pipeFolder_multi',
  appTag:          'CevenCotizadorMulti',
  backupVersion:   1,
  autoSnapVersion: 1,
  pipeFilePrefix:  'Ceven_Multi_Pipeline_Backup_',
  fullBackupFile:  'Ceven_Multi_Backup_Completo.json',
  exportPrefix:    'Ceven_Multi_Backup_',

  backupExtraKeys: [],

  plLabel: 'catálogo'
};

/* Helper de claves: cevenK('cquotes') -> 'multi_cquotes'. */
window.cevenK = function(base){ return window.CEVEN_BRAND.prefix + base; };
