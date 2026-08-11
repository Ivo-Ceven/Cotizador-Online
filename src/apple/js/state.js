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

/* Las tres tablas de pricing (NAC por defecto, familia por LOB e IVA) viven en
   `pricing-core.js`, que se carga justo antes que este archivo: el cotizador
   multimarca las necesita sin cargar todo el estado de la app de Apple. Acá
   quedan con los nombres de siempre para no tocar los lugares que ya las usan. */
var NAC_DEF = CEVEN_APPLE_NAC_DEF;
var MODEL_CATEGORY = CEVEN_APPLE_MODEL_CATEGORY;
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

var IVA_MAP = CEVEN_APPLE_IVA_MAP;

// Columnas del Excel de cotizaciones. 'Condición de pago', 'Propuesta efectiva
// hasta' y 'Entrega' se agregaron cuando doSave() empezó a persistirlas (sin eso,
// el PDF regenerado desde el historial perdía el bloque de Condiciones Comerciales).
// 'IVA' se agregó en 08/2026: el dato ya se guardaba, pero en la clave interna
// '_taxes', que no sale al Excel ni la puede leer un módulo compartido sin saber
// que es de Apple. Ahora las dos marcas escriben la misma columna visible.
// 'Opción' (A/B) va antes del SKU: identifica a qué alternativa pertenece la
// línea. Una cotización de una sola opción tiene todas las filas en 1.
var COLS = ['N° Cotización','Fecha','Hora','Cliente','Proyecto','Ejecutivo','Observaciones','Mes Cierre','Condición de pago','Propuesta efectiva hasta','Entrega','Opción','SKU','Descripción','Cantidad','Disponibilidad','IVA','Margen %','P. Venta Unitario','Total'];

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

