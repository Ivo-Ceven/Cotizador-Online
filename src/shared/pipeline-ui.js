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
// Queda para cualquier llamador viejo; el control de la vista es un <select>
// (ver cevenPintarPillsMes) que usa pipeSetMonthFilter(), sin toggle.
function setPipeMonth(val){
  window._pipeMonthFilter = (window._pipeMonthFilter === val) ? '' : val;
  renderPipeline();
}

// El <select> de meses: el valor elegido ES el filtro, sin toggle (para eso
// está la opción "Todos los meses").
function pipeSetMonthFilter(val){
  window._pipeMonthFilter = val || '';
  renderPipeline();
}

/* Chapita "↪ auto" para una fila del pipeline cuyo cierre estimado vencido lo
   movió el sistema al mes actual (rollOverdueEntries() en pipeline-data.js).
   Se pinta al lado del selector de mes; el tooltip dice de qué mes venía y qué
   hacer si en realidad ya cerró. Devuelve '' si la fila no fue auto-movida. */
function cevenMesAutoRollBadge(r){
  if(!r || !r.mesAutoRoll) return '';
  var m = (typeof cevenMesLabel === 'function') ? cevenMesLabel(r.mesAutoRoll) : r.mesAutoRoll;
  return ' <span title="El sistema movió este cierre estimado: venció en ' + cevenEsc(m)
    + '. Si el negocio ya cerró, poné el mes real y marcá Facturado."'
    + ' style="background:#fff4e5;color:#c86400;font-size:9px;font-weight:600;'
    + 'padding:1px 5px;border-radius:5px;margin-left:4px;cursor:help;white-space:nowrap">↪ auto</span>';
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

/* ── SELECTOR DE "CIERRE ESTIMADO" ────────────────────────────────────────────
   Antes era una fila de pastillas (una por mes); desde 08/09/2026 es un
   <select>. Cada opción muestra info "de top": cuántos proyectos cierran ese
   mes y por cuánto (de `rows`, el pipeline SIN filtrar por mes), y el mes con
   más plata lleva un 🔝. La función sigue devolviendo el filtro YA RESUELTO.

   Nota histórica: la fila de meses estaba escrita dos veces, igual que "Top
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
   en Apple, además, que la fila no tenga ningún `skuMesCierre`. `rows` es
   opcional: el pipeline SIN filtrar por mes, para la info por opción.        */
function cevenPintarPillsMes(meses, haySinFecha, rows){
  meses = meses || [];
  var cur = window._pipeMonthFilter || '';

  // ¿Sigue existiendo lo que está filtrado?
  var vigente = !cur
    || (cur === 'sin-fecha' ? !!haySinFecha : meses.indexOf(cur) !== -1);
  if(!vigente){ cur = ''; window._pipeMonthFilter = ''; }

  var box = document.getElementById('pipe-month-pills');
  if(box){
    var MESES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

    /* Info por mes: cuántas filas cierran ese mes y por cuánto. Se arma del
       `rows` que pasa el llamador (el pipeline sin filtrar por mes). El monto
       de una fila va entero a su `mesCierre` — no se reparte por skuMesCierre,
       que para un texto de opción no aporta. */
    var info = null, topKey = null;
    if(rows && rows.length){
      info = { __total:{n:0,m:0}, __sin:{n:0,m:0} };
      rows.forEach(function(r){
        var k = r.mesCierre || '';
        var b = k ? (info[k] || (info[k] = {n:0,m:0})) : info.__sin;
        var mm = +r.monto || 0;
        b.n++; b.m += mm; info.__total.n++; info.__total.m += mm;
      });
      if(meses.length > 1){
        var topM = -1;
        for(var kk = 0; kk < meses.length; kk++){
          var bb = info[meses[kk]];
          if(bb && bb.m > topM){ topM = bb.m; topKey = meses[kk]; }
        }
      }
    }
    var suf = function(b){ return (info && b) ? (' · ' + b.n + ' proy · USD ' + fI(b.m)) : ''; };
    var opt = function(val, label){
      return '<option value="' + cevenEsc(val) + '"' + (cur === val ? ' selected' : '') + '>'
        + cevenEsc(label) + '</option>';
    };

    var h = opt('', 'Todos los meses' + suf(info && info.__total));
    if(haySinFecha) h += opt('sin-fecha', 'Sin fecha' + suf(info && info.__sin));
    for(var i = 0; i < meses.length; i++){
      var p = String(meses[i]).split('-');
      var idx = parseInt(p[1], 10) - 1;
      var nom = (p.length === 2 && idx >= 0 && idx < 12) ? (MESES[idx] + ' ' + p[0]) : meses[i];
      h += opt(meses[i], (meses[i] === topKey ? '🔝 ' : '') + nom + suf(info && info[meses[i]]));
    }
    box.innerHTML = '<select id="pipe-month-sel" class="pipe-flt-sel" '
      + 'onchange="pipeSetMonthFilter(this.value)" '
      + 'title="Filtrar el pipeline por mes de cierre estimado">' + h + '</select>';
  }
  return cur;
}

/* ── SELECTOR DE "TOP CANALES" ────────────────────────────────────────────────
   Antes eran las pastillas "Top clientes" (top 5 por monto); desde 08/09/2026
   es un <select> con TODOS los canales del pipeline filtrado, ordenados por
   monto abierto. Cada opción trae la info que antes vivía en la pastilla:
   medalla o puesto, cantidad de proyectos y monto. Elegir uno escribe su
   nombre en el buscador (setPipeClientFilter), igual que el clic en la pastilla.

   Nota histórica: estaba escrito dos veces
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
  grupos = grupos.slice(0, 60);   // un <select> con cientos de opciones no ayuda

  var medallas = ['🥇','🥈','🥉'];
  var busq = cevenNormClient((document.getElementById('pipe-search') || {}).value || '');
  var elegido = grupos.some(function(g){ return g.clave === busq; });

  var h = '<option value=""' + (elegido ? '' : ' selected') + '>'
    + 'Todos los canales' + (grupos.length ? (' · ' + grupos.length + (grupos.length === 1 ? ' canal' : ' canales')) : '')
    + '</option>';
  grupos.forEach(function(g, i){
    var puesto = i < 3 ? (medallas[i] + ' ') : ((i + 1) + '. ');
    var lbl = puesto + g.label + ' · ' + g.n + ' proy · USD ' + fI(g.monto);
    h += '<option value="' + cevenEsc(g.label) + '"' + (busq === g.clave ? ' selected' : '') + '>'
      + cevenEsc(lbl) + '</option>';
  });

  box.innerHTML = '<select id="pipe-client-sel" class="pipe-flt-sel"' + (grupos.length ? '' : ' disabled')
    + ' onchange="setPipeClientFilter(this.value)"'
    + ' title="Filtrar el pipeline por canal (ordenados por monto abierto, sin contar lo perdido)">'
    + h + '</select>';
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
