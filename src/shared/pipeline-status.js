/* ============================================================
   PIPELINE · ESTADOS  ·  compartido por todas las marcas
   ------------------------------------------------------------
   Fuente unica del embudo: orden, etiqueta visible y colores.
   Antes esta misma tabla estaba escrita A MANO en seis lugares
   (poly/js/pipeline-view.js, apple/js/pipeline-view.js x2,
   apple/js/archive-view.js, apple/js/pipeline-detail.js y
   apple/js/target.js) y ya habian divergido: 'Negociacion' se
   veia SIN tilde en las tablas y CON tilde en los <select> del
   HTML, para el mismo estado.

   REGLA QUE NO SE ROMPE: `v` es el valor GUARDADO (localStorage,
   columna `estado` de Supabase, Excel). No se toca nunca. Lo
   unico que cambia es `lbl`, que es lo que se lee en pantalla.
   Renombrar un `v` obligaria a migrar el pipeline, el archivo y
   los backups de las dos marcas.

   'Proyecto' se muestra como "En proyecto" porque en Poly
   "Proyecto" ya es el nombre de una columna y de un KPI: la
   pastilla "Proyecto · 3" y el KPI "3 Proyectos" no tienen nada
   que ver entre si y se leian como si lo tuvieran.

   Depende de: nada. Se carga ANTES de <marca>/js/pipeline-view.js.
   ============================================================ */

/* `card` es la tarjeta grande del dashboard de Apple, que se repinta con el
   color del estado filtrado (`bg` de fondo, `sub` para el rótulo y la línea
   chica encima). Poly no la usa hoy, pero la tabla es una sola: tener dos
   listas de colores es exactamente como se llegó al desfasaje de 'Negociacion'. */
var CEVEN_ESTADOS = [
  {v:'Proyecto',    lbl:'En proyecto', pill:{bg:'#f2e8ff', fg:'#6e36c8'}, row:{bg:'',        fg:''}, card:{bg:'#6e36c8', sub:'#c9a9f0'}},
  {v:'Cotizado',    lbl:'Cotizado',    pill:{bg:'#e8f4ff', fg:'#0071e3'}, row:{bg:'',        fg:''}, card:{bg:'#0071e3', sub:'#80b8f5'}},
  {v:'Negociacion', lbl:'Negociación', pill:{bg:'#fff3e0', fg:'#c84e00'}, row:{bg:'',        fg:''}, card:{bg:'#c84e00', sub:'#f0a070'}},
  {v:'Commit',      lbl:'Commit',      pill:{bg:'#fff8e1', fg:'#7a5800'}, row:{bg:'#fff8e1', fg:''}, card:{bg:'#7a5800', sub:'#c8a050'}},
  {v:'Con OC',      lbl:'Con OC',      pill:{bg:'#e8f6ee', fg:'#15863a'}, row:{bg:'#e8f6ee', fg:''}, card:{bg:'#15863a', sub:'#70c890'}},
  {v:'Autorizando', lbl:'Autorizando', pill:{bg:'#d4f0de', fg:'#0e7a52'}, row:{bg:'#d4f0de', fg:''}, card:{bg:'#169670', sub:'#8ccdb0'}},
  {v:'Facturado',   lbl:'Facturado',   pill:{bg:'#b8e8cc', fg:'#0a5c30'}, row:{bg:'#b8e8cc', fg:''}, card:{bg:'#17a589', sub:'#a5d6a7'}},
  {v:'Perdido',     lbl:'Perdido',     pill:{bg:'#fbbebe', fg:'#a80011'}, row:{bg:'#fbbebe', fg:''}, card:{bg:'#a80011', sub:'#f09090'}}
];

var _cevenEstIdx = {};
for(var _e = 0; _e < CEVEN_ESTADOS.length; _e++) _cevenEstIdx[CEVEN_ESTADOS[_e].v] = _e;

// Valores en orden de embudo. Reemplaza a los `statusOrderPipe` locales.
function cevenEstadoValores(){
  return CEVEN_ESTADOS.map(function(e){ return e.v; });
}

/* Un estado desconocido (dato viejo, import de Excel, marca futura) se devuelve
   tal cual en vez de caer a '' o a 'Cotizado': mostrar el valor crudo permite
   darse cuenta; mostrarlo como otro estado lo esconde. */
function _cevenEst(v){
  var i = _cevenEstIdx[v];
  return i === undefined ? null : CEVEN_ESTADOS[i];
}

// Lo que se lee en pantalla. SIEMPRE pasar por acá antes de pintar un estado.
function cevenEstadoLabel(v){
  var e = _cevenEst(v);
  return e ? e.lbl : String(v || '');
}

// Colores de la pastilla del dashboard.
function cevenEstadoPill(v){
  var e = _cevenEst(v);
  return e ? e.pill : {bg:'#f2f2f7', fg:'#1d1d1f'};
}

// Tinte de la fila de la tabla. Las tres primeras etapas no tiñen a propósito.
function cevenEstadoRow(v){
  var e = _cevenEst(v);
  return e ? e.row : {bg:'', fg:''};
}

// Tarjeta grande del dashboard (Apple). Cae a la de Facturado, que es el
// default histórico de esa tarjeta cuando no hay filtro de estado.
function cevenEstadoCard(v){
  var e = _cevenEst(v);
  return e ? e.card : {bg:'#17a589', sub:'#a5d6a7'};
}

/* Posición en el embudo. Un estado desconocido va al final (-1 lo pondría
   antes que 'Proyecto', o sea lo trataría como la etapa más temprana). */
function cevenEstadoRank(v){
  var i = _cevenEstIdx[v];
  return i === undefined ? CEVEN_ESTADOS.length : i;
}

/* Las <option> de un <select> de estado, con el value crudo y la etiqueta
   visible. `sel` es el valor actualmente elegido.

   Si `sel` no está en la lista (dato viejo, import de Excel, estado que se
   sacó), se agrega igual como última opción: sin eso el <select> se dibuja
   en la primera y el próximo change guarda un estado que nadie eligió. Apple
   ya lo hacía a mano; ahora vale para las dos marcas. */
function cevenEstadoOptions(sel, incluirTodos){
  var h = incluirTodos ? '<option value="">Todos</option>' : '';
  for(var i = 0; i < CEVEN_ESTADOS.length; i++){
    var e = CEVEN_ESTADOS[i];
    h += '<option value="' + cevenEsc(e.v) + '"' + (e.v === sel ? ' selected' : '') + '>'
       + cevenEsc(e.lbl) + '</option>';
  }
  if(sel && _cevenEstIdx[sel] === undefined){
    h += '<option value="' + cevenEsc(sel) + '" selected>' + cevenEsc(sel) + '</option>';
  }
  return h;
}

/* Clases de dark mode. El CSS de shared/css/dark.css matchea por CLASE, no por
   el style inline, y las dos NO usan la misma normalización:
     fila:     'Con OC' -> row-st-Con_OC   (espacio -> _)
     pastilla: 'Con OC' -> spill-ConOC     (espacio -> nada)
   Estaban en poly/js/pipeline-view.js; Apple las emitía inline. */
function cevenRowStClass(estado){ return 'row-st-' + String(estado||'').replace(/ /g,'_'); }
function cevenSpillClass(estado){ return 'spill spill-' + String(estado||'').replace(/ /g,''); }
