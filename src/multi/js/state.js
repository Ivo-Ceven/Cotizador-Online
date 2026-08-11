// ── GLOBALS ──
// Catálogo unificado de todas las marcas. Lo llena js/catalogo-multi.js; acá
// solo se declara para que exista antes de cualquier render.
var products = [];

// Líneas del pedido. Cada una lleva su `brand`: es lo que permite repartirlas
// después (ver js/marcas.js y js/emitir.js).
var items = [];

var selIds = {};       // {id: orden_de_seleccion} — el valor preserva el orden
var _selSeq = 0;
function _nextSel(){ return ++_selSeq; }

var histSel = {};
var editId = null;

/* Columnas del Excel del historial del multimarca. Son las de Poly (la marca
   más simple) MÁS 'Marca', que acá no es un dato de contexto sino la clave del
   pedido: sin ella, un Excel de un pedido multimarca no se puede leer.

   'Nivel de precio' y 'Margen %' conviven aunque cada una sea de una marca
   distinta: en un pedido mixto las dos columnas tienen sentido, cada fila llena
   la suya y la otra queda '—'. Partir el Excel en dos tablas sería peor.

   El orden es el de lectura: primero de quién es el pedido, después qué lleva. */
var COLS = ['N° Cotización','Fecha','Hora','Cliente','Proyecto','Ejecutivo','Observaciones',
  'Mes Cierre','Condición de pago','Propuesta efectiva hasta','Entrega','Opción',
  'Marca','SKU','Descripción','Cantidad','Nota','IVA','Nivel de precio','Margen %',
  'P. Venta Unitario','Total'];

/* Las cotizaciones que este pedido ya emitió a cada marca: {apple:'0123'}. Se
   guarda en las filas de `cquotes` del pedido (clave `_emitidas`) para que
   re-emitir sepa qué número pisar en vez de tomar uno nuevo — que dejaría dos
   cotizaciones de la misma cosa en el pipeline de esa marca. */
var emitidas = {};

// Dark mode (_darkMode/toggleDark) y logo (_logo) viven en shared/ui-core.js.
