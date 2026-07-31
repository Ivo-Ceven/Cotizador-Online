/* ============================================================
   PIPELINE · CONTROLES DE LA VISTA  ·  compartido
   ------------------------------------------------------------
   Filtros (mes, cliente, pills de estado) y orden de columnas.
   Todo esto solo lee/escribe estado y llama a renderPipeline():
   no sabe ni le importa como esta armada la tabla.

   renderPipeline() en si NO esta aca y no deberia estar: Poly
   agrupa por OPG con las salas anidadas adentro de cada fila, y
   Apple pinta una fila por cotizacion con las unidades abiertas
   por familia (Mac/iPhone/iPad/Serv/Acc) mas margen ponderado.
   No son la misma tabla con otras columnas.

   Depende de: brand.js (pipeSortDescCols).
   Se carga ANTES de <marca>/js/pipeline-view.js.
   ============================================================ */

// Filtros activos. Van en window porque los lee tambien renderPipeline().
window._pipeStatusFilters = window._pipeStatusFilters || [];
window._pipeMonthFilter   = window._pipeMonthFilter   || '';

// Tocar el mismo mes de nuevo limpia el filtro (es un toggle, no un select).
function setPipeMonth(val){
  window._pipeMonthFilter = (window._pipeMonthFilter === val) ? '' : val;
  renderPipeline();
}

// Click en un nombre de cliente del panel de totales: filtra por ese cliente,
// y si ya estaba filtrado por el mismo, limpia.
function setPipeClientFilter(cli){
  var box = document.getElementById('pipe-search');
  if(!box) return;
  if((box.value||'').trim().toLowerCase() === cli.toLowerCase()) box.value = '';
  else box.value = cli;
  renderPipeline();
}

// Las pills de estado son multi-seleccion (se pueden ver Cotizado + Ganado a la vez).
function togglePillFilter(status){
  var idx = window._pipeStatusFilters.indexOf(status);
  if(idx !== -1) window._pipeStatusFilters.splice(idx, 1);
  else window._pipeStatusFilters.push(status);
  // Sincronizar el <select> para el codigo que todavia lee pipe-status.
  // Con 0 o 2+ estados elegidos no hay un valor unico que representarlo: queda vacio.
  var sel = document.getElementById('pipe-status');
  if(sel) sel.value = window._pipeStatusFilters.length === 1 ? window._pipeStatusFilters[0] : '';
  renderPipeline();
}

// ── SORT ──
window._pipeSort = window._pipeSort || {col: 'fechaISO', dir: 'desc'};

function setPipeSort(col){
  if(window._pipeSort.col === col){
    window._pipeSort.dir = window._pipeSort.dir === 'asc' ? 'desc' : 'asc';
  } else {
    window._pipeSort.col = col;
    // Cuales son "numericas" depende de la marca: Apple tiene unidades por
    // familia y margen, Poly no. Sale de brand.js.
    var descCols = window.CEVEN_BRAND.pipeSortDescCols || [];
    window._pipeSort.dir = descCols.indexOf(col) !== -1 ? 'desc' : 'asc';
  }
  renderPipeline();
}

// Se llama en cada render: _sortBound evita reatar el listener al mismo <th>.
function attachPipeSortHandlers(){
  var ths = document.querySelectorAll('#p-pipeline th.srt');
  ths.forEach(function(th){
    th.classList.remove('asc','desc');
    if(th.dataset.sort === window._pipeSort.col) th.classList.add(window._pipeSort.dir);
    if(!th._sortBound){
      th._sortBound = true;
      th.addEventListener('click', function(){ setPipeSort(this.dataset.sort); });
    }
  });
}
