// ── GLOBALS ──
var products = [];
var items = [];
var selIds = {};       // {id: orden_de_seleccion} — el valor (número) preserva el orden de selección
var _selSeq = 0;
function _nextSel(){ return ++_selSeq; }

// Dark mode (_darkMode/toggleDark) y logo (_logo/_logoDark) viven en
// shared/ui-core.js: eran identicos en las dos marcas.
var histSel = {};
var editId = null;

var COLS = ['N° Cotización','Fecha','Hora','Cliente','OPG','Proyecto','Ejecutivo','Observaciones',
            'Mes Cierre','Nivel de precio','SKU','Descripción','Cantidad','Nota','P. Venta Unitario','Total'];

// cevenDelegate()/cevenActEl() viven en shared/ui-core.js y _checkRecovery() en
// shared/recovery.js: los tres eran identicos (o casi) en las dos marcas.

/* El numero SE MUESTRA, no se reserva: reservarlo acá quemaba un número en cada
   F5 y, peor, dejaba la clave `cqc` sucia antes de que terminara el bootstrap de
   sync, con lo cual el contador local le ganaba al del equipo en cada carga.
   Se reserva recién al guardar. Ver shared/quote-num.js.

   Acá solo se puede leer el contador: getDB()/getPipeline() todavía no existen
   (este archivo se carga antes que quotes-db.js). shared/init.js llama después a
   cevenRefrescarQNum(), que ya mira todas las fuentes. */
qNum = cevenLeerContador() + 1;
cevenPintarQNum();
