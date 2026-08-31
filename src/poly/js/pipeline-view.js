
// Los filtros (mes/cliente/pills) y el sort de columnas viven en
// shared/pipeline-ui.js: eran identicos salvo que columnas arrancan
// descendentes, que ahora sale de brand.pipeSortDescCols.

// No hay una lista fija de vendedores Poly todavía: se arma sola con los nombres
// que ya aparecieron en el pipeline (mismo criterio que los "Top clientes").
function _pipeExecList(pipe){
  var seen = {}, out = [];
  pipe.forEach(function(r){ var e=(r.ejecutivo||'').trim(); if(e && e!=='—' && !seen[e]){ seen[e]=1; out.push(e); } });
  out.sort();
  return out;
}

/* El orden del embudo, las etiquetas visibles, los colores y las clases de dark
   mode salen de shared/pipeline-status.js — antes estaban acá y en otros cinco
   lugares, y ya habían divergido ('Negociacion' sin tilde en la tabla y con
   tilde en los <select> del HTML). Ver el encabezado de ese archivo. */
var statusOrderPipe = cevenEstadoValores();

/* Escribe el texto de un rótulo del dashboard si el elemento existe.
   Los rótulos que cambian (Total, Forecast) los repinta también
   renderArchiveMonth() con los del mes archivado, así que renderPipeline()
   tiene que volver a poner los suyos en cada pasada — si no, al volver del
   archivo la tarjeta muestra un número del pipeline con el rótulo del mes. */
function _pipeSetLbl(id, txt){
  var el = document.getElementById(id);
  if(el) el.textContent = txt;
}

/* El direccionamiento por ÍNDICE (`window._pipeRows` + `data-i` + `_pipeRowAt`)
   se fue con la tabla agrupada: con filas de cliente intercaladas, el índice de
   un array plano ya no identifica una fila. Lo reemplaza el registro de nodos de
   shared/pipeline-group.js, que devuelve el objeto original —con su id numérico
   intacto— a partir de una clave opaca. */

function renderPipeline(){
  // El archivado automático NO va acá: lo hace _navApply('pipeline') en
  // shared/ui-core.js. Ver el comentario largo en apple/js/pipeline-view.js.

  // Poblar selector de meses archivados
  var archive = getArchive();
  var archiveSel = document.getElementById('archive-month-sel');
  if(archiveSel){
    var archiveMonths = Object.keys(archive).sort().reverse();
    var curArchiveVal = archiveSel.value;
    var meses = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
    // '__regi'/'__regi_stats' son valores fijos (no salen de `archive`, como
    // los meses): la segunda y tercera vista del pipeline, generadas del
    // Excel de Deal Registration de HP/Poly. Ver pipeline-regi.js.
    var newHtml = '<option value="">Pipeline actual</option>'
      + '<option value="__regi">🎯 Pipeline REGI</option>'
      + '<option value="__regi_stats">📊 Estadísticas REGI</option>';
    archiveMonths.forEach(function(m){
      var p = m.split('-');
      var lbl = p.length===2 ? (meses[parseInt(p[1])-1]+' '+p[0]) : m;
      newHtml += '<option value="'+cevenEsc(m)+'">📦 '+cevenEsc(lbl)+'</option>';
    });
    if(archiveSel.innerHTML !== newHtml) archiveSel.innerHTML = newHtml;
    if(curArchiveVal && (curArchiveVal === '__regi' || curArchiveVal === '__regi_stats' || archiveMonths.indexOf(curArchiveVal) !== -1)) archiveSel.value = curArchiveVal;
  }
  var selectedArchiveMonth = archiveSel ? archiveSel.value : '';

  // Muestra/oculta lo que solo tiene sentido en una de las vistas: la tabla y
  // sus columnas, los filtros de Ejecutivo/Estado (no existen en el Excel de
  // REGI ni en Estadísticas) y el export a Excel del pipeline normal
  // (exportPipeline() no sabe leer filas de REGI/Estadísticas). Un solo punto
  // de control, para que volver a "Pipeline actual" o a un mes archivado
  // siempre los deje como estaban.
  if(typeof cevenRegiToggleVista === 'function') cevenRegiToggleVista(selectedArchiveMonth);

  if(selectedArchiveMonth === '__regi'){ renderRegiPipeline(); return; }
  if(selectedArchiveMonth === '__regi_stats'){ if(typeof renderRegiStats === 'function') renderRegiStats(); return; }
  if(selectedArchiveMonth){
    renderArchiveMonth(selectedArchiveMonth, archive[selectedArchiveMonth] || []);
    return;
  }

  var pipe = getPipeline();

  // Poblar el filtro de Ejecutivo dinámicamente
  var execSel = document.getElementById('pipe-exec');
  if(execSel){
    var curExec = execSel.value;
    var execList = _pipeExecList(pipe);
    execSel.innerHTML = '<option value="">Todos</option>' + execList.map(function(e){ return '<option value="'+cevenEsc(e)+'"'+(e===curExec?' selected':'')+'>'+cevenEsc(e)+'</option>'; }).join('');
  }

  var q = (document.getElementById('pipe-search').value||'').toLowerCase().trim();
  var ex = document.getElementById('pipe-exec').value || '';
  /* Única fuente del filtro de estado. El <select> #pipe-status ya escribe acá
     en su onchange y togglePillFilter() lo sincroniza de vuelta, así que leerlo
     aparte solo servía para que las dos versiones se contradijeran. */
  var _stFilters = window._pipeStatusFilters || [];
  var monthFilter = window._pipeMonthFilter || '';

  /* Pastillas de Cierre estimado. Los meses y el "Sin fecha" salen de los datos:
     una pastilla que no puede dar ninguna fila no se pinta. Devuelve el filtro
     ya resuelto —vuelve a '' si lo que estaba filtrado dejó de existir—, y hay
     que filtrar con ESE valor y no con `window._pipeMonthFilter` leído antes.
     Vive en shared/pipeline-ui.js: era el mismo código que en Apple. */
  var mesesPresentes = {}, haySinFecha = false;
  pipe.forEach(function(r){
    if(r.mesCierre) mesesPresentes[r.mesCierre] = true;
    else haySinFecha = true;
  });
  monthFilter = cevenPintarPillsMes(Object.keys(mesesPresentes).sort(), haySinFecha);

  /* El filtro se aplica en DOS pasos, y el intermedio no es cosmético: las
     pastillas de "Top clientes" salen de `sinBuscar` —todo menos el texto del
     buscador— porque tocar una pastilla ESCRIBE el nombre del cliente en ese
     buscador. Si también respetaran la búsqueda, el primer clic dejaría una
     sola pastilla en pantalla y no habría forma de saltar a otro cliente. */
  var sinBuscar = pipe.filter(function(r){
    if(ex && r.ejecutivo !== ex) return false;
    if(_stFilters.length > 0 && _stFilters.indexOf(r.estado||'Cotizado') === -1) return false;
    if(monthFilter){
      if(monthFilter === 'sin-fecha'){ if(r.mesCierre) return false; }
      else if(r.mesCierre !== monthFilter) return false;
    }
    return true;
  });

  // Top clientes por monto. Vive en shared/pipeline-ui.js: era el mismo código
  // que en Apple, con los mismos errores. Ver el comentario largo de allá.
  cevenPintarTopClientes(sinBuscar);

  /* `.slice()` y no `sinBuscar` a secas: unas lineas mas abajo se hace
     `filtered.sort()`, que ordena EN EL LUGAR — sin la copia, ordenar la
     tabla reordenaria tambien el array del que salen las pastillas. */
  var filtered = !q ? sinBuscar.slice() : sinBuscar.filter(function(r){
    var hay = ((r.cliente||'')+' '+(r.opg||'')+' '+(r.proyecto||'')+' '+(r.qNum||'')).toLowerCase();
    return hay.indexOf(q) !== -1;
  });

  var sortCol = window._pipeSort.col, sortDir = window._pipeSort.dir;
  var numericCols = {monto:1, fechaISO:1};
  filtered.sort(function(a,b){
    var av = a[sortCol], bv = b[sortCol];
    if(av === undefined || av === null) av = numericCols[sortCol] ? 0 : '';
    if(bv === undefined || bv === null) bv = numericCols[sortCol] ? 0 : '';
    var cmp = numericCols[sortCol] ? ((parseFloat(av)||0) - (parseFloat(bv)||0)) : String(av).localeCompare(String(bv));
    return sortDir === 'asc' ? cmp : -cmp;
  });

  // ── DASHBOARD ──
  var sumMonto = 0;
  var byStatus = {};
  /* Clientes distintos, sin distinguir mayúsculas ni espacios: "ACME" y "acme "
     son el mismo cliente y contarlos dos veces sería peor que no contarlos. */
  var cliVistos = {}, nClientes = 0;
  statusOrderPipe.forEach(function(s){ byStatus[s] = {count:0, monto:0}; });
  filtered.forEach(function(r){
    var estado = r.estado || 'Cotizado';
    var monto = r.monto || 0;
    sumMonto += monto;
    var ck = (r.cliente||'').trim().toLowerCase();
    if(ck && ck !== '—' && !cliVistos[ck]){ cliVistos[ck] = 1; nClientes++; }
    if(!byStatus[estado]) byStatus[estado] = {count:0, monto:0};
    byStatus[estado].count++;
    byStatus[estado].monto += monto;
  });
  var facturadoData = byStatus['Facturado'] || {count:0, monto:0};
  var perdidoData   = byStatus['Perdido']   || {count:0, monto:0};

  /* La condición era `st`, que solo se completa con UN estado elegido. Con dos
     pastillas activas quedaba vacía y se restaban Facturado y Perdido de una
     suma que ya solo tenía eso: la tarjeta mostraba USD 0 sin explicación.
     Lo que se quería preguntar es "¿hay algún filtro de estado?". */
  var hayFiltroEstado = _stFilters.length > 0;
  var sumPipeline = hayFiltroEstado ? sumMonto : (sumMonto - facturadoData.monto - perdidoData.monto);

  var dash = document.getElementById('pipe-dashboard');
  /* Se pinta SIEMPRE, aunque el filtro no deje ninguna fila: antes se escondía
     entero y el usuario veía desaparecer los carteles en vez de leer 0, que es
     una respuesta ambigua. Los acumuladores ya arrancan en 0. */
  if(dash){
    dash.style.display = 'block';
    /* El KPI decía "OPGs" y contaba FILAS, incluidas las que no tienen ningún
       OPG (el campo siempre fue opcional). Ahora cada fila es un proyecto, así
       que las dos tarjetas dicen lo que cuentan: clientes y proyectos. */
    document.getElementById('dash-count').textContent = nClientes;
    document.getElementById('dash-proyectos').textContent = filtered.length;
    document.getElementById('dash-facturado').textContent = 'USD ' + fI(facturadoData.monto);

    /* Los rótulos se escriben en CADA pasada, no solo cuando cambian:
       renderArchiveMonth() los repinta para el mes archivado, y si acá no se
       restauran, al volver al pipeline activo quedan pegados los del archivo. */
    _pipeSetLbl('dash-facturado-lbl', 'Facturado');

    // Forecast = lo comprometido de acá al cierre. INCLUYE lo ya facturado: la
    // sub-línea lo dice para que nadie sume esta tarjeta con la de al lado.
    var proySt = ['Facturado','Autorizando','Con OC','Commit'];
    var pMonto = 0;
    proySt.forEach(function(ps){ pMonto += (byStatus[ps]||{monto:0}).monto; });
    _pipeSetLbl('dash-proy-lbl', 'Forecast del mes');
    document.getElementById('dash-proy').textContent = 'USD ' + fI(pMonto);
    _pipeSetLbl('dash-proy-sub', facturadoData.monto > 0
      ? ('incluye USD ' + fI(facturadoData.monto) + ' ya facturado')
      : 'Commit + Con OC + Autorizando + Facturado');

    // El Total cambia de fórmula según el filtro, así que también de rótulo.
    _pipeSetLbl('dash-total-lbl', hayFiltroEstado ? 'Total filtrado' : 'Total pipeline');
    document.getElementById('dash-total').textContent = 'USD ' + fI(sumPipeline);
    _pipeSetLbl('dash-total-sub', hayFiltroEstado
      ? _stFilters.map(cevenEstadoLabel).join(' + ')
      : 'sin Facturado ni Perdido');

    var pillsHtml = '<div style="font-size:11px;color:#6e6e73;text-transform:uppercase;letter-spacing:.4px;margin-bottom:8px">Por estado</div>'
      + '<div style="display:flex;flex-wrap:wrap;gap:6px;width:100%">';
    statusOrderPipe.forEach(function(s){
      var data = byStatus[s] || {count:0, monto:0};
      var c = cevenEstadoPill(s);
      var dim = data.count === 0 ? ';opacity:.45' : '';
      var isActive = window._pipeStatusFilters && window._pipeStatusFilters.indexOf(s) !== -1;
      var activeBorder = isActive ? ';outline:2px solid '+c.fg+';outline-offset:1px' : '';
      pillsHtml += '<div class="'+cevenSpillClass(s)+'" data-act="status" data-st="'+cevenEsc(s)+'" style="background:'+c.bg+';color:'+c.fg+';border-radius:980px;padding:6px 12px;font-size:12px;display:inline-flex;align-items:center;gap:6px;cursor:pointer'+activeBorder+dim+'">'
        +'<strong>'+cevenEsc(cevenEstadoLabel(s))+'</strong><span style="opacity:.85">· '+data.count+' proy · USD '+fI(data.monto)+'</span></div>';
    });
    pillsHtml += '</div>';
    document.getElementById('dash-by-status').innerHTML = pillsHtml;
  }

  // ── TABLA ──
  var html = _pipeTablaHTML(filtered, '', {
    /* Buscar un proyecto y ver el cliente colapsado no sirve de nada, así que el
       grupo se abre solo cuando el match NO fue por el nombre del cliente.
       Es un set derivado del render: NO se escribe en _pipeExpanded, para que al
       limpiar la búsqueda todo se vuelva a plegar sin dejar residuo. */
    abrirSiMatchea: q
  });

  // Vacío por filtro y vacío de verdad son dos cosas distintas: decir "cargá una
  // cotización" cuando el pipeline tiene filas y el filtro no matchea ninguna
  // manda a buscar el problema donde no está.
  var _hayFiltros = !!(q || ex || monthFilter || _stFilters.length);
  /* Las citas tienen que coincidir LETRA POR LETRA con los botones reales
     ("✕ Limpiar filtros" en la barra de acá, "Agregar al pipeline" en la vista
     de cotización): mandar a buscar un botón que no existe con ese nombre es
     peor que no nombrarlo. */
  var _vacio = _hayFiltros
    ? 'Ningún proyecto coincide con los filtros. Tocá "✕ Limpiar filtros".'
    : 'El pipeline está vacío. Cargá una cotización y tocá "Agregar al pipeline".';
  document.getElementById('pipe-body').innerHTML = html || '<tr><td colspan="9" style="text-align:center;color:#aeaeb2;padding:24px">'+_vacio+'</td></tr>';
  attachPipeSortHandlers();
  pipeBindDelegation();
}

/* Arma el cuerpo de la tabla agrupado por cliente. Lo usan renderPipeline() y
   renderArchiveMonth(), que solo se diferencian en el `scope` de las claves y en
   qué botón lleva la última columna.

   `scope` es '' para el pipeline activo y 'a:<mes>' para un mes archivado: eso
   mantiene separada la expansión de las dos vistas, que es lo que ya hacía la
   clave compuesta 'arch__<mes>__<id>'. */
function _pipeTablaHTML(filas, scope, opts){
  opts = opts || {};
  var esArchivo = !!scope;
  cevenPipeNodeReset();

  var grupos = cevenPipeSortGroups(
    cevenPipeGroupBy(filas),
    window._pipeSort.col, window._pipeSort.dir
  );

  /* getDB() hace JSON.parse de varios MB y el poll redibuja cada 15 s: se
     parsea UNA sola vez por render. Antes se hacía solo si había alguna fila
     abierta; desde que la fila muestra la chapita de opción A/B hace falta
     siempre, porque "esta cotización tiene dos opciones" es un dato de
     `cquotes`. Sigue siendo UN parse por render, no uno por fila. */
  var _db = null;
  function db(){ if(_db === null) _db = getDB(); return _db; }
  var q = (opts.abrirSiMatchea || '').toLowerCase().trim();
  var html = '';

  grupos.forEach(function(g, gi){
    var kGrupo = cevenPipeKey(scope, 'c', gi);
    cevenPipeNodeAdd(kGrupo, {kind:'c', grupo:g});

    /* Si la búsqueda matcheó algo que NO es el nombre del cliente, el grupo se
       abre solo: si no, el usuario busca un proyecto y ve una fila colapsada
       sin ninguna evidencia de que adentro está lo que pidió. */
    var abierto = cevenPipeAbierto(kGrupo);
    if(!abierto && q && g.clave.indexOf(q) === -1){
      abierto = g.rows.some(function(r){
        return ((r.proyecto||'') + ' ' + (r.opg||'') + ' ' + (r.qNum||'')).toLowerCase().indexOf(q) !== -1;
      });
    }

    html += cevenPipeGroupRow(g, kGrupo, abierto);
    if(!abierto) return;

    g.rows.forEach(function(r){
      var kFila = cevenPipeKey(scope, 'r', r.id);
      cevenPipeNodeAdd(kFila, {kind:'r', row:r});
      var kA = cevenEsc(kFila);
      var abiertaFila = cevenPipeAbierto(kFila);
      var estado = r.estado || 'Cotizado';
      var tint = cevenEstadoRow(estado);
      var rowStyle = '';
      if(tint.bg) rowStyle += 'background:'+tint.bg;
      if(tint.fg) rowStyle += (rowStyle?';':'') + 'color:'+tint.fg;

      /* El estado y el cierre se editan en el pipeline activo; en un mes ya
         cerrado se muestran de solo lectura (para cambiarlos hay que restaurar
         el proyecto primero, que es lo que hace el botón ↩). */
      var celdaMes, celdaEstado, celdaAcc;
      if(esArchivo){
        celdaMes = '<span style="font-size:12px">' + cevenEsc(opts.mesLabel || '—') + '</span>';
        var cSt = cevenEstadoPill(estado);
        celdaEstado = '<span class="'+cevenEsc(cevenSpillClass(estado))+'" style="border-radius:980px;padding:2px 10px;font-size:11px;font-weight:700;color:'+cSt.fg+';background:'+cSt.bg+'">'+cevenEsc(cevenEstadoLabel(estado))+'</span>'
          + (estado === 'Perdido'
            ? '<button class="bs" data-act="perdido-detalle" data-k="'+kA+'" style="display:block;margin:4px auto 0;padding:2px 7px;font-size:10px;color:#a80011;background:#fff0f0;border-color:#f3b7b7;white-space:nowrap">Ver motivo</button>'
            : '');
        celdaAcc = '<button class="bs" data-act="restore" data-k="'+kA+'" data-mk="'+cevenEsc(opts.monthKey||'')+'" title="Devolver este proyecto al pipeline actual" style="font-size:11px;padding:2px 8px">↩ Restaurar</button>';
      } else {
        celdaMes = cevenMonthField(r.mesCierre||'', ' data-act="mes" data-k="'+kA+'"', {cls:'mpk-sm'});
        celdaEstado = '<select data-act="est" data-k="'+kA+'" style="padding:3px 6px;border:0.5px solid #d2d2d7;border-radius:6px;font-size:11px;font-family:inherit;background:#fff;width:100%">'
          + cevenEstadoOptions(estado, false) + '</select>'
          + (estado === 'Perdido'
            ? '<button class="bs" data-act="perdido-detalle" data-k="'+kA+'" style="display:block;margin:4px auto 0;padding:2px 7px;font-size:10px;color:#a80011;background:#fff0f0;border-color:#f3b7b7;white-space:nowrap">Ver motivo</button>'
            : '');
        /* Netsuite. Con link cargado el botón ABRE Netsuite (verde, con la
           flechita de "sale de la app") y al lado aparece un ✎ amarillo chico
           para cambiarlo. Sin link, el botón es rojo y lo que hace es pedirlo:
           ahí el ✎ sobraría, porque el botón grande ya edita.

           El link entero no entra en la etiqueta —es una URL larga—, así que va
           en el `title`. El estado igual se distingue sin hover, por el color y
           por la flechita, que es lo que faltaba cuando acá iba el número de
           factura y solo se veía en el tooltip. */
        var nsUrl = (typeof cevenNetsuiteURL === 'function') ? cevenNetsuiteURL(r.factura) : '';
        celdaAcc = (nsUrl
            ? '<button class="bs" data-act="ns-open" data-k="'+kA+'" title="Abrir en Netsuite: '+cevenEsc(r.factura)+'" style="background:#34c759;color:#fff;border-color:#2aad4e;padding:2px 8px;font-size:11px;font-weight:600">Netsuite ↗</button>'
              + (cevenCanEditPipelineRow(r.ejecutivo)
                  ? ' <button class="bs" data-act="ns-edit" data-k="'+kA+'" title="Cambiar el link de Netsuite" style="background:#ffd60a;color:#5c4a00;border-color:#e0b800;padding:2px 5px;font-size:10px;font-weight:700;line-height:1.4">✎</button>'
                  : '')
              + ' '
            : '<button class="bs" data-act="ns-edit" data-k="'+kA+'" title="Cargar el link de Netsuite de este proyecto" style="background:#fde8e8;color:#d70015;border-color:#f5b1b1;padding:2px 8px;font-size:11px;font-weight:600">Netsuite —</button> ')
          + (cevenCanEditPipelineRow(r.ejecutivo) ? '<button class="bsr" data-act="rm" data-k="'+kA+'" title="Quitar este proyecto del pipeline">×</button>' : '');
      }

      // .stk-monto / .stk-act traen su propio background:#fff (lo necesitan para
      // quedar pegadas al hacer scroll horizontal) y tapaban el tinte del <tr>:
      // se re-aplica el color en cada celda, igual que hace Apple.
      html += '<tr class="'+cevenEsc(cevenRowStClass(estado))+'"'+(rowStyle?' style="'+rowStyle+'"':'')+'>'
        +'<td style="font-size:12px;white-space:nowrap;padding-left:22px">'
          +'<button class="bs" data-act="exp" data-k="'+kA+'" style="padding:0 5px;font-size:11px;line-height:1.4;margin-right:4px;min-width:20px">'+(abiertaFila?'▼':'▶')+'</button>'
          +cevenEsc(r.fecha)
        +'</td>'
        +'<td style="font-size:12px">'+cevenEsc(r.ejecutivo||'—')+'</td>'
        // El cliente ya está en el encabezado del grupo, con una fila entera de
        // ancho: acá se repetía truncado y con el nombre completo solo en un
        // tooltip, que en touch no existe. Se usa la columna para el OPG.
        //
        // El 🎯 es una pista barata de que el OPG cargado matchea AHORA MISMO
        // con una oportunidad REGI vigente (ver pipeline-regi.js): si después
        // de guardar no aparece, algo no calzó (typo, o el REGI todavía no
        // está aprobado del lado de HP). Se omite sin drama si el pipeline
        // REGI no se cargó todavía esta sesión — no vale la pena un fetch
        // solo para esto.
        +'<td style="font-size:12px;color:#6e6e73;white-space:nowrap">'
          +cevenEsc(r.opg||'—')
          +((r.opg && typeof _regiOpgMatcheaVigente === 'function' && _regiOpgMatcheaVigente(r.opg))
              ? ' <span title="Coincide con una oportunidad REGI vigente" style="cursor:default">🎯</span>' : '')
          // Un mes archivado es de solo lectura (para tocarlo hay que restaurar
          // el proyecto primero, igual que estado/mes/Netsuite): sin este
          // chequeo el botón llamaría a editOpgValue(), que busca la fila en
          // getPipeline() y no la encuentra —una fila archivada no vive ahí—,
          // así que el click no haría nada y nadie entendería por qué.
          +(!esArchivo && cevenCanEditPipelineRow(r.ejecutivo)
              ? ' <button class="bs" data-act="opg-edit" data-k="'+kA+'" title="Editar OPG / vincular con un código REGI" style="padding:0 5px;font-size:10px;line-height:1.3">✎</button>'
              : '')
        +'</td>'
        +'<td style="text-align:center;font-family:ui-monospace,Menlo,monospace;font-size:11px">'
          +(r.qNum ? '<span data-act="openq" data-qn="'+cevenEsc(r.qNum)+'" style="color:var(--acc,#0071e3);font-weight:600;cursor:pointer">#'+cevenEsc(r.qNum)+'</span>' : '—')
          /* Chapita de opción A/B: solo aparece si esa cotización tiene dos, y
             desde ahí se cambia cuál suma (shared/opciones.js). */
          +(r.qNum ? cevenOpcChipPipeHTML(db().filter(function(x){ return x['N° Cotización'] === r.qNum; }), ' data-act="opc" data-k="'+kA+'"') : '')
        +'</td>'
        +'<td style="cursor:pointer" data-act="exp" data-k="'+kA+'"><div style="max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'
          +cevenEsc(r.proyecto||'—')
          // Pedido que un cliente-canal mandó él mismo desde el portal (Fase 1).
          // El cliente ya se agrupa arriba (ver comentario de más arriba), así
          // que acá es donde va: junto al proyecto, que es lo propio de la fila.
          // origenPortalEstado/origenPortalMotivo son espejo de solo lectura de
          // lo que el cliente-canal carga sobre SU venta (trigger
          // trg_portal_sync_estado_cliente) — nunca el motivo interno de Ceven.
          +(r.origenPortalId ? '<span style="background:#eef2ff;color:#4338ca;font-size:9px;font-weight:600;padding:1px 5px;border-radius:5px;margin-left:6px" title="Pedido enviado por el cliente desde el portal">portal</span>'
            +(r.origenPortalEstado ? ' <span style="background:#f0f0f3;color:#6e6e73;font-size:9px;font-weight:600;padding:1px 5px;border-radius:5px;margin-left:2px" title="Estado propio del cliente-canal frente a su cliente final">'+cevenEsc(r.origenPortalEstado)+'</span>' : '')
            +(r.origenPortalEstado === 'Perdido' && r.origenPortalMotivo && r.origenPortalMotivo.motivo
                ? ' <span title="Motivo del cliente-canal: '+cevenEsc(r.origenPortalMotivo.motivo + (r.origenPortalMotivo.detalle ? ': '+r.origenPortalMotivo.detalle : ''))+'" style="cursor:help">💬</span>'
                : '')
            // regiCodigo: el pedido vino con un REGI (Deal Registration de
            // Poly) aprobado — es lo que puso el ejecutivo real en la fila
            // en vez del "—" de siempre. Solo Poly.
            +(r.regiCodigo ? ' <span style="background:#fef3c7;color:#92400e;font-size:9px;font-weight:600;padding:1px 5px;border-radius:5px;margin-left:2px" title="Código REGI aplicado a este pedido">🎯 '+cevenEsc(r.regiCodigo)+'</span>' : '')
            : '')
          +' <span style="color:#6e6e73;font-size:11px;white-space:nowrap">▸</span>'
        +'</div></td>'
        +'<td style="font-size:12px;white-space:nowrap">'+celdaMes+'</td>'
        +'<td style="text-align:center">'+celdaEstado+'</td>'
        +'<td class="stk-monto" style="text-align:right;font-weight:500;white-space:nowrap;min-width:110px'+(tint.bg?';background:'+tint.bg:'')+(tint.fg?';color:'+tint.fg:'')+'">USD '+fI(r.monto||0)+'</td>'
        +'<td class="stk-act" style="text-align:center;white-space:nowrap'+(tint.bg?';background:'+tint.bg:'')+'">'+celdaAcc+'</td>'
      +'</tr>';

      if(abiertaFila){
        html += renderPipelineDetailRow(r, kFila, db());
      }
    });
  });

  return html;
}

/* Un solo listener por contenedor, atado una vez (cevenDelegate se encarga).
   Lo llaman renderPipeline() y renderArchiveMonth(): las dos vistas escriben en
   #pipe-body y en #dash-by-status. */
function pipeBindDelegation(){
  cevenDelegate('pipe-body', 'click', function(ev){
    var el = cevenActEl(ev, this);
    if(!el) return;
    var act = el.getAttribute('data-act');

    // Abrir la cotización no necesita nodo: el número va en el propio data-*.
    if(act === 'openq'){ openPipelineQuote(el.getAttribute('data-qn')); return; }

    /* Todo lo demás resuelve la CLAVE contra el registro de nodos, que devuelve
       el objeto original: el id nunca se reconstruye desde un atributo (sería
       string y los === contra el id numérico fallarían en silencio). */
    var n = cevenPipeNodeAt(el.getAttribute('data-k'));
    if(!n) return;
    if(act === 'expcli'){ togglePipeNode(el.getAttribute('data-k')); return; }
    if(n.kind !== 'r') return;

    if(act === 'opc'){ cambiarOpcionVigente(n.row.id); return; }
    if(act === 'exp')          togglePipeNode(el.getAttribute('data-k'));
    // Abrir Netsuite lo puede hacer cualquiera (es de solo lectura); editar el
    // link lo frena cevenCanEditPipelineRow() adentro de editNetsuiteLink().
    else if(act === 'ns-open') abrirNetsuite(n.row.id);
    else if(act === 'ns-edit') editNetsuiteLink(n.row.id);
    else if(act === 'opg-edit') editOpgValue(n.row.id);
    else if(act === 'perdido-detalle') abrirDetalleMotivoPerdida(n.row.perdidoMotivo);
    else if(act === 'rm')      removePipeline(n.row.id);
    else if(act === 'restore') restoreFromArchive(el.getAttribute('data-mk'), n.row.id);
  });
  cevenDelegate('pipe-body', 'change', function(ev){
    var el = cevenActEl(ev, this);
    if(!el) return;
    var n = cevenPipeNodeAt(el.getAttribute('data-k'));
    if(!n || n.kind !== 'r') return;
    var act = el.getAttribute('data-act');
    if(act === 'mes')      updatePipelineMesCierreValue(n.row.id, el.value);
    else if(act === 'est') updatePipelineStatus(n.row.id, el.value);
  });
  cevenDelegate('pipe-month-pills', 'click', function(ev){
    var el = cevenActEl(ev, this);
    if(el && el.getAttribute('data-act') === 'month') setPipeMonth(el.getAttribute('data-val'));
  });
  cevenDelegate('pipe-topclients-pills', 'click', function(ev){
    var el = cevenActEl(ev, this);
    if(el && el.getAttribute('data-act') === 'client') setPipeClientFilter(el.getAttribute('data-cli'));
  });
  cevenDelegate('dash-by-status', 'click', function(ev){
    var el = cevenActEl(ev, this);
    if(el && el.getAttribute('data-act') === 'status') togglePillFilter(el.getAttribute('data-st'));
  });
}
