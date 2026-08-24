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

/* ── PASTILLAS DE "CIERRE ESTIMADO" ───────────────────────────────────────────
   La fila de meses del dashboard. Estaba escrita dos veces, igual que "Top
   clientes", y con el mismo criterio se unificó acá.

   Dos cosas que hace y la versión duplicada no hacía:

   1. "Sin fecha" solo aparece si hay ALGUNA fila sin mes de cierre. Antes se
      pintaba siempre: era un filtro que en la mayoría de los pipelines no
      podía dar más que la tabla vacía, ocupando lugar en una fila que además
      se recorta cuando no entra (overflow:hidden) y empuja a los meses reales.
      Los meses SÍ salen de los datos desde siempre — "Sin fecha" era la única
      pastilla escrita a mano.

   2. Si el filtro activo apunta a algo que ya no existe, vuelve a "Todos".
      Ese es el agujero que abre lo anterior y que ya existía con los meses:
      con "Sin fecha" activo, ponerle mes a la última fila sin fecha hacía
      desaparecer la pastilla PERO no el filtro — la tabla quedaba vacía, sin
      ninguna pastilla marcada que explicara por qué, y la única salida era
      "Limpiar filtros". Lo mismo pasaba al mover la última fila de un mes.

   Devuelve el filtro YA RESUELTO, y el llamador tiene que filtrar con ESE valor
   y no con el que leyó antes: si pintara una cosa y filtrara otra, volveríamos
   al mismo problema por otro camino.

   `meses` son las claves 'AAAA-MM' presentes, ordenadas. `haySinFecha` lo
   decide cada marca porque no significan lo mismo: en Poly es `!r.mesCierre`;
   en Apple, además, que la fila no tenga ningún `skuMesCierre`.             */
function cevenPintarPillsMes(meses, haySinFecha){
  meses = meses || [];
  var cur = window._pipeMonthFilter || '';

  // ¿Sigue existiendo lo que está filtrado?
  var vigente = !cur
    || (cur === 'sin-fecha' ? !!haySinFecha : meses.indexOf(cur) !== -1);
  if(!vigente){ cur = ''; window._pipeMonthFilter = ''; }

  var box = document.getElementById('pipe-month-pills');
  if(box){
    var MESES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
    /* `data-act` y `data-pill` son el MISMO dato: Poly delega los clicks por uno
       y Apple por el otro. Se emiten los dos para no tener que tocar las dos
       delegaciones, igual que en cevenPintarTopClientes(). */
    var pill = function(val, label){
      var on = (cur === val);
      return '<div class="pipe-mpill' + (on ? ' pipe-mpill-on' : '') + '"'
        + ' data-act="month" data-pill="month" data-val="' + cevenEsc(val) + '"'
        + ' style="cursor:pointer;border:0.5px solid ' + (on ? '#1d1d1f' : '#d2d2d7')
        + ';background:' + (on ? '#1d1d1f' : '#fff') + ';color:' + (on ? '#fff' : '#1d1d1f')
        + ';border-radius:980px;padding:5px 13px;font-size:12px;font-weight:' + (on ? '600' : '500')
        + ';white-space:nowrap;transition:transform .1s">' + cevenEsc(label) + '</div>';
    };

    var h = pill('', 'Todos');
    if(haySinFecha) h += pill('sin-fecha', 'Sin fecha');
    for(var i = 0; i < meses.length; i++){
      var p = String(meses[i]).split('-');
      var idx = parseInt(p[1], 10) - 1;
      h += pill(meses[i], (p.length === 2 && idx >= 0 && idx < 12) ? (MESES[idx] + ' ' + p[0]) : meses[i]);
    }
    box.innerHTML = h;
  }
  return cur;
}

/* ── TOP CLIENTES ─────────────────────────────────────────────────────────────
   Las pastillas de "Top clientes" del dashboard. Estaba escrito dos veces
   —apple/js/pipeline-view.js y poly/js/pipeline-view.js, casi identico— y las
   dos copias tenian los mismos cuatro errores, arreglados aca de una vez
   (24/08/2026):

   1. ORDENABA POR CANTIDAD DE FILAS, no por plata. Un cliente con cuatro
      proyectitos le ganaba a uno con un solo negocio de USD 200.000. En un
      pipeline "top clientes" es por monto: es la pregunta que el resto del
      dashboard —todas tarjetas en USD— viene contestando. Se sigue mostrando la
      cantidad de proyectos, pero como dato secundario.
   2. CONTABA LO PERDIDO. Un cliente al que se le perdieron los cinco negocios
      salia primero, con medalla. Se excluye 'Perdido'; lo 'Facturado' SI cuenta
      —es plata que entro, y quien la trajo es un cliente top—, que es distinto
      de la tarjeta "Total pipeline" (esa saca Facturado porque pregunta otra
      cosa: que queda abierto).
   3. IGNORABA LOS FILTROS. Se calculaba sobre el pipeline ENTERO mientras las
      tarjetas de al lado y la tabla de abajo respetaban mes/ejecutivo/estado.
      Filtrando por un mes, la pastilla podia decir "5 proyectos" de un cliente
      que abajo mostraba uno solo. Ahora sale de las filas filtradas, salvo por
      la BUSQUEDA de texto: hacer clic en una pastilla escribe el nombre en el
      buscador, asi que si tambien se respetara, el primer clic dejaria una sola
      pastilla y no se podria saltar a otro cliente.
   4. NO NORMALIZABA EL NOMBRE. "ACME" y "acme " eran dos clientes distintos acá
      y uno solo en el KPI "Clientes" y en el agrupado de la tabla. Ahora usa
      cevenPipeGroupBy(), el MISMO agrupador que la tabla, así que no pueden
      volver a discrepar (y de paso muestra la grafía más usada).

   Depende de: shared/pipeline-group.js (cevenPipeGroupBy) y shared/clientes.js.
   `rows` son las filas ya filtradas por todo menos la búsqueda de texto.       */
function cevenPintarTopClientes(rows){
  var box = document.getElementById('pipe-topclients-pills');
  if(!box) return;

  var vivos = (rows || []).filter(function(r){ return (r.estado || 'Cotizado') !== 'Perdido'; });
  var grupos = cevenPipeGroupBy(vivos).filter(function(g){ return g.clave !== '(sin cliente)'; });
  /* Por monto; a igual monto, el que tiene más proyectos; y a igual todo,
     alfabético, para que el orden no baile entre renders. */
  grupos.sort(function(a, b){
    return (b.monto - a.monto) || (b.n - a.n) || a.label.localeCompare(b.label, 'es');
  });
  var top = grupos.slice(0, 5);

  var medallas = ['🥇','🥈','🥉','4°','5°'];
  var busq = (document.getElementById('pipe-search') || {}).value || '';
  busq = cevenNormClient(busq);
  var h = '';
  top.forEach(function(g, i){
    var activo = busq === g.clave;
    var bg = activo ? '#1d1d1f' : '#fff';
    var fg = activo ? '#fff' : '#1d1d1f';
    var bd = activo ? '#1d1d1f' : '#d2d2d7';
    /* El nombre viaja en data-cli y lo lee un listener delegado. Cuando iba
       dentro de un onclick, el escapado (`\'` + &quot;) no cubría la barra
       invertida: un cliente llamado  \');alert(1);//  cerraba el string y
       ejecutaba código en la pantalla de todo el equipo.

       `data-pill` y `data-act` son el MISMO dato: Apple delega por uno y Poly
       por el otro. Se emiten los dos para no tener que tocar las dos
       delegaciones (que además difieren en el hover). */
    h += '<div class="pipe-mpill' + (activo ? ' pipe-mpill-on' : '') + '"'
      + ' data-pill="client" data-act="client" data-cli="' + cevenEsc(g.label) + '"'
      + ' title="' + cevenEsc(g.label + ' · USD ' + fI(g.monto) + ' en ' + g.n
          + (g.n === 1 ? ' proyecto' : ' proyectos') + ', sin contar lo perdido') + '"'
      + ' style="cursor:pointer;border:0.5px solid ' + bd + ';background:' + bg + ';color:' + fg
      + ';border-radius:980px;padding:5px 13px;font-size:12px;font-weight:' + (activo ? '600' : '500')
      + ';white-space:nowrap;transition:transform .1s">'
      + medallas[i] + ' ' + cevenEsc(g.label)
      + ' <span style="opacity:.7;font-weight:400">· USD ' + cevenEsc(fI(g.monto))
      + ' <span style="opacity:.75">(' + cevenEsc(g.n) + ')</span></span></div>';
  });

  box.innerHTML = h || '<span style="font-size:12px;color:#aeaeb2">Sin proyectos abiertos</span>';

  /* Achicar a UNA sola fila: se sacan los últimos si no entran (mínimo 3). El
     contenedor tiene overflow:hidden, así que sin esto el 4° y el 5° quedaban
     cortados a la mitad en vez de desaparecer. */
  var fila = document.getElementById('pipe-pills-row');
  if(!fila) return;
  var guard = 0;
  while(fila.scrollWidth > fila.clientWidth + 1 && box.children.length > 3 && guard < 8){
    box.removeChild(box.lastElementChild);
    guard++;
  }
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
