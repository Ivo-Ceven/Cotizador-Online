// ── GLOBALS ──
var products = [];
var items = [];
var warrantyItems = []; // garantías desde CevenCare
var selIds = {};       // {id: orden_de_seleccion} — el valor (número) preserva el orden de selección
var _selSeq = 0;
function _nextSel(){ return ++_selSeq; }

// Dark mode (_darkMode/toggleDark) y logo (_logo/_logoDark) viven en
// shared/ui-core.js: eran identicos en las dos marcas.
var histSel = {};
var editId = null;

var NAC_DEF = {"AirTag":29,"Apple TV":29,"Apple TV Accessories":29,"Creativity":33,"Displays & Mounts":33,"Headphones & Speakers":48,"iMac":24,"iPad":19,"iPad Air":19,"iPad Air 11":19,"iPad Air 13":19,"iPad mini":19,"iPad Pro 11":19,"iPad Pro 13":19,"iPhone":6,"Mac English":24,"Mac Spanish":24,"Mac mini":6,"Mac Studio":24,"MacBook Air 13":24,"MacBook Air 15":24,"MacBook Neo":25,"MacBook Pro 14":24,"MacBook Pro 16":24,"Mice & Keyboards":33,"Power & Cables":40,"Watch":40,"Watch SE 3":40,"Watch Series 11":40,"Watch Ultra 3":40};

// Tabla de categorías por Model (LOB) — fuente de verdad para pipeline
var MODEL_CATEGORY = {
  'AirTag':'acc','Apple TV':'acc','Apple TV Accessories':'acc',
  'Creativity':'acc','Displays & Mounts':'acc','Headphones & Speakers':'acc',
  'Mice & Keyboards':'acc','Power & Cables':'acc',
  'Watch':'acc','Watch SE 3':'acc','Watch Series 11':'acc','Watch Ultra 3':'acc',
  // 'Mac English' y 'Mac Spanish' NO están aquí: se usan tanto para Macs con
  // teclado en español/inglés como para accesorios → el fallback por descripción
  // los distingue correctamente (un MacBook tiene "MacBook" en el nombre; un
  // Magic Keyboard/Mouse/Trackpad no).
  'iMac':'mac','Mac mini':'mac','Mac Studio':'mac',
  'MacBook Air 13':'mac','MacBook Air 15':'mac','MacBook Neo':'mac',
  'MacBook Pro 14':'mac','MacBook Pro 16':'mac',
  'iPad':'ipad','iPad Air':'ipad','iPad Air 11':'ipad','iPad Air 13':'ipad',
  'iPad mini':'ipad','iPad Pro 11':'ipad','iPad Pro 13':'ipad',
  'iPhone 15':'iphone','iPhone 16':'iphone','iPhone 16 Plus':'iphone',
  'iPhone 16e':'iphone','iPhone 17':'iphone','iPhone 17 Pro':'iphone',
  'iPhone 17 Pro Max':'iphone','iPhone 17e':'iphone',
  'iPhone Air':'iphone'
};
var nacRates = JSON.parse(JSON.stringify(NAC_DEF));
var quoteNacOverrides = {}; // {LOB: %} aplica solo a la cotización activa
try {
  var _ns = localStorage.getItem('cnac');
  if(_ns) {
    nacRates = JSON.parse(_ns);
    var migrationDone = false;
    // Migración 1: limpiar entradas iPhone específicas y unificar en "iPhone": 6
    Object.keys(nacRates).forEach(function(k){
      if(k.toLowerCase().indexOf('iphone') === 0 && k.length > 6){ delete nacRates[k]; migrationDone = true; }
    });
    if(nacRates['iPhone'] === undefined){ nacRates['iPhone'] = 6; migrationDone = true; }
    // Migración 2: actualizar familia Mac al nuevo preset (24% excepto Mac mini = 6%)
    var nacMigrationKey = 'cnac_mac24_v2';
    if(!localStorage.getItem(nacMigrationKey)){
      var macKeys = ['iMac','Mac Studio','MacBook Air 13','MacBook Air 15','MacBook Neo','MacBook Pro 14','MacBook Pro 16','Mac English','Mac Spanish'];
      macKeys.forEach(function(k){ nacRates[k] = 24; });
      nacRates['Mac mini'] = 6;
      try{ localStorage.setItem(nacMigrationKey, '1'); }catch(e){}
      migrationDone = true;
    }
    // Migración 3: MacBook Neo sube de 24% a 25%
    if(!localStorage.getItem('cnac_neo25_v3')){
      nacRates['MacBook Neo'] = 25;
      try{ localStorage.setItem('cnac_neo25_v3','1'); }catch(e){}
      migrationDone = true;
    }
    if(migrationDone) localStorage.setItem('cnac', JSON.stringify(nacRates));
  }
} catch(e) {}

var IVA_MAP = {"Accessories":"21%","TV & Home":"21%","Mac":"10.5%","Mac English":"10.5%","Mac Spanish":"10.5%","iPad":"10.5%","iPhone":"10.5% + 21%","Watch":"21%"};

// Columnas del Excel de cotizaciones. 'Condición de pago', 'Propuesta efectiva
// hasta' y 'Entrega' se agregaron cuando doSave() empezó a persistirlas (sin eso,
// el PDF regenerado desde el historial perdía el bloque de Condiciones Comerciales).
var COLS = ['N° Cotización','Fecha','Hora','Cliente','Proyecto','Ejecutivo','Observaciones','Mes Cierre','Condición de pago','Propuesta efectiva hasta','Entrega','SKU','Descripción','Cantidad','Disponibilidad','Margen %','P. Venta Unitario','Total'];

// _checkRecovery() vive en shared/recovery.js: era la misma funcion en las dos
// marcas, con la lista de claves a restaurar escrita a mano y desincronizada de
// backup.js. Ver el comentario de ese modulo.

/* El numero SE MUESTRA, no se reserva: reservarlo acá quemaba un número en cada
   F5 y, peor, dejaba la clave `cqc` sucia antes de que terminara el bootstrap de
   sync, con lo cual el contador local le ganaba al del equipo en cada carga.
   Se reserva recién al guardar. Ver shared/quote-num.js.

   Acá solo se puede leer el contador: getDB()/getPipeline() todavía no existen
   (este archivo se carga antes que quotes-db.js). shared/init.js llama después a
   cevenRefrescarQNum(), que ya mira todas las fuentes. */
qNum = cevenLeerContador() + 1;
cevenPintarQNum();

