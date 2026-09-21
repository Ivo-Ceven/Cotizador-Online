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

/* Columnas del Excel de cotizaciones. 'Condición de pago', 'Propuesta efectiva
   hasta' y 'Entrega' se agregaron cuando doSave() empezó a persistirlas: sin
   eso, el PDF regenerado desde el historial salía sin el bloque de Condiciones
   Comerciales (lo leía de estas claves, que nunca se escribían). 'IVA' llegó
   con la columna "Programa fiscal" del Excel del ERP. */
// 'Opción' (A/B) va antes del SKU: identifica a qué alternativa pertenece la
// línea. Una cotización de una sola opción tiene todas las filas en 1.
var COLS = ['N° Cotización','Fecha','Hora','Cliente','OPG','Proyecto','Ejecutivo','Observaciones',
            'Mes Cierre','Condición de pago','Propuesta efectiva hasta','Entrega',
            'Nivel de precio','Opción','SKU','Descripción','Cantidad','Nota','IVA','P. Venta Unitario','Total'];

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
