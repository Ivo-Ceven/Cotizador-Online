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

var COLS = ['N° Cotización','Fecha','Hora','Cliente','OPG','Sala','Ejecutivo','Observaciones',
            'Mes Cierre','SKU','Descripción','Cantidad','Nota','P. Venta Unitario','Total'];

// cevenDelegate()/cevenActEl() viven en shared/ui-core.js y _checkRecovery() en
// shared/recovery.js: los tres eran identicos (o casi) en las dos marcas.

try { qNum = parseInt(localStorage.getItem('poly_cqc')||'0') + 1; localStorage.setItem('poly_cqc', qNum); } catch(e) {}
document.getElementById('qnum').textContent = 'Cotización #' + String(qNum).padStart(4,'0');
