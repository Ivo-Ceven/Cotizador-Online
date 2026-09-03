
// Los filtros (mes/cliente/pills) y el sort de columnas viven en
// shared/pipeline-ui.js: eran identicos salvo que columnas arrancan
// descendentes, que ahora sale de brand.pipeSortDescCols.

// No hay una lista fija de vendedores Legamaster todavía: se arma sola con los
// nombres que ya aparecieron en el pipeline (mismo criterio que los "Top clientes").
function _pipeExecList(pipe){
  var seen = {}, out = [];
  pipe.forEach(function(r){ var e=(r.ejecutivo||'').trim(); if(e && e!=='—' && !seen[e]){ seen[e]=1; out.push(e); } });
  out.sort();
  return out;
}

/* El orden del embudo, las etiquetas visibles, los colores y las clases de dark
   mode salen de shared/pipeline-status.js. */
var statusOrderPipe = cevenEstadoValores();

function _pipeSetLbl(id, txt){
  var el = document.getElementById(id);
  if(el) el.textContent = txt;
}

function renderPipeline(){
  // El archivado automático NO va acá: lo hace _navApply('pipeline') en
  // shared/ui-core.js.

  var archive = getArchive();
  var archiveSel = document.getElementById('archive-month-sel');
  if(archiveSel){
    var archiveMonths = Object.keys(archive).sort().reverse();
    var curArchiveVal = archiveSel.value;
    var meses = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
    var newHtml = '<option value="">Pipeline actual</option>';
    archiveMonths.forEach(function(m){
      var p = m.split('-');
      var lbl = p.length===2 ? (meses[parseInt(p[1])-1]+' '+p[0]) : m;
      newHtml += '<option value="'+cevenEsc(m)+'">📦 '+cevenEsc(lbl)+'</option>';
    });
    if(archiveSel.innerHTML !== newHtml) archiveSel.innerHTML = newHtml;
    if(curArchiveVal && archiveMonths.indexOf(curArchiveVal) !== -1) archiveSel.value = curArchiveVal;
  }
  var selectedArchiveMonth = archiveSel ? archiveSel.value : '';

  if(selectedArchiveMonth){
    renderArchiveMonth(selectedArchiveMonth, archive[selectedArchiveMonth] || []);
    return;
  }

  var pipe = getPipeline();

  var execSel = document.getElementById('pipe-exec');
  if(execSel){
    var curExec = execSel.value;
    var execList = _pipeExecList(pipe);
    execSel.innerHTML = '<option value="">Todos</option>' + execList.map(function(e){ return '<option value="'+cevenEsc(e)+'"'+(e===curExec?' selected':'')+'>'+cevenEsc(e)+'</option>'; }).join('');
  }

  /* getDB() hace JSON.parse de varios MB y el poll redibuja cada 15 s: se
     parsea UNA vez por render, y SOLO si alguna fila tiene estados por linea
     (shared/pipeline-sku.js). El mismo array se le pasa despues a
     _pipeTablaHTML() para que no vuelva a parsear. */
  var _dbCache = null;
  function _dbP(){ if(_dbCache === null) _dbCache = getDB(); return _dbCache; }
  function _lineasDe(r){
    return cevenSkuTieneOverrides(r) ? cevenOpcFilasDeCotiz(_dbP(), r.qNum) : null;
  }

  var q = (document.getElementById('pipe-search').value||'').toLowerCase().trim();
  var ex = document.getElementById('pipe-exec').value || '';
  var _stFilters = window._pipeStatusFilters || [];
  var monthFilter = window._pipeMonthFilter || '';

  var mesesPresentes = {}, haySinFecha = false;
  pipe.forEach(function(r){
    if(r.mesCierre) mesesPresentes[r.mesCierre] = true;
    else haySinFecha = true;
  });
  monthFilter = cevenPintarPillsMes(Object.keys(mesesPresentes).sort(), haySinFecha);

  var sinBuscar = pipe.filter(function(r){
    if(ex && r.ejecutivo !== ex) return false;
    /* Una fila con estados por item esta en VARIOS estados a la vez: entra si
       alguno matchea. Sin esto, filtrar por "Facturado" esconderia el proyecto
       que tiene la mitad facturada, y su plata desapareceria del KPI. */
    if(_stFilters.length > 0){
      var _ests = cevenSkuEstadosDe(r, _lineasDe(r));
      var _hay = false;
      for(var _i = 0; _i < _ests.length; _i++){ if(_stFilters.indexOf(_ests[_i]) !== -1){ _hay = true; break; } }
      if(!_hay) return false;
    }
    if(monthFilter){
      if(monthFilter === 'sin-fecha'){ if(r.mesCierre) return false; }
      else if(r.mesCierre !== monthFilter) return false;
    }
    return true;
  });

  cevenPintarTopClientes(sinBuscar);

  var filtered = !q ? sinBuscar.slice() : sinBuscar.filter(function(r){
    var hay = ((r.cliente||'')+' '+(r.proyecto||'')+' '+(r.qNum||'')).toLowerCase();
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
  var cliVistos = {}, nClientes = 0;
  statusOrderPipe.forEach(function(s){ byStatus[s] = {count:0, monto:0}; });
  filtered.forEach(function(r){
    sumMonto += r.monto || 0;
    var ck = (r.cliente||'').trim().toLowerCase();
    if(ck && ck !== '—' && !cliVistos[ck]){ cliVistos[ck] = 1; nClientes++; }
    /* El monto de la fila se REPARTE entre los estados de sus articulos: un
       proyecto con la mitad facturada suma esa mitad a "Facturado" y el resto
       a donde este. Sin overrides el reparto devuelve un solo estado con el
       monto entero, o sea exactamente lo de antes.

       El reparto suma siempre `r.monto` exacto (shared/pipeline-sku.js), asi
       que `sumMonto` sigue siendo la suma de byStatus y el "Total pipeline" de
       mas abajo no cambia de formula. El CONTEO si cuenta la fila una vez por
       cada estado en el que tiene plata. */
    var reparto = cevenSkuRepartoPorEstado(r, _lineasDe(r));
    Object.keys(reparto).forEach(function(st){
      if(!byStatus[st]) byStatus[st] = {count:0, monto:0};
      byStatus[st].count++;
      byStatus[st].monto += reparto[st];
    });
  });
  var facturadoData = byStatus['Facturado'] || {count:0, monto:0};
  var perdidoData   = byStatus['Perdido']   || {count:0, monto:0};

  var hayFiltroEstado = _stFilters.length > 0;
  var sumPipeline = hayFiltroEstado ? sumMonto : (sumMonto - facturadoData.monto - perdidoData.monto);

  var dash = document.getElementById('pipe-dashboard');
  if(dash){
    dash.style.display = 'block';
    document.getElementById('dash-count').textContent = nClientes;
    document.getElementById('dash-proyectos').textContent = filtered.length;
    document.getElementById('dash-facturado').textContent = 'USD ' + fI(facturadoData.monto);

    _pipeSetLbl('dash-facturado-lbl', 'Facturado');

    var proySt = ['Facturado','Autorizando','Con OC','Commit'];
    var pMonto = 0;
    proySt.forEach(function(ps){ pMonto += (byStatus[ps]||{monto:0}).monto; });
    _pipeSetLbl('dash-proy-lbl', 'Forecast del mes');
    document.getElementById('dash-proy').textContent = 'USD ' + fI(pMonto);
    _pipeSetLbl('dash-proy-sub', facturadoData.monto > 0
      ? ('incluye USD ' + fI(facturadoData.monto) + ' ya facturado')
      : 'Commit + Con OC + Autorizando + Facturado');

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
  var html = _pipeTablaHTML(filtered, '', { abrirSiMatchea: q, db: _dbCache });

  var _hayFiltros = !!(q || ex || monthFilter || _stFilters.length);
  var _vacio = _hayFiltros
    ? 'Ningún proyecto coincide con los filtros. Tocá "✕ Limpiar filtros".'
    : 'El pipeline está vacío. Cargá una cotización y tocá "Agregar al pipeline".';
  document.getElementById('pipe-body').innerHTML = html || '<tr><td colspan="8" style="text-align:center;color:#aeaeb2;padding:24px">'+_vacio+'</td></tr>';
  attachPipeSortHandlers();
  pipeBindDelegation();
}

/* Los dos botones que operan sobre la COTIZACION de la fila, no sobre la fila:
   abrirla para editarla e imprimir su comprobante. Antes lo unico que llevaba
   ahi era el numero azul de la columna "Cotiz.", que no parece un boton, y
   para el PDF habia que ir al historial y buscarla.

   Ninguno de los dos necesita `data-k`: viajan con el numero de cotizacion,
   que es string y es la clave real contra `cquotes` (ver openPipelineQuote).
   El comprobante no lleva gate de permiso (es de solo lectura); editar si, con
   el mismo criterio que el historial. */
function _pipeBotonesCotiz(r){
  if(!r.qNum) return '';
  var qnA = cevenEsc(r.qNum);
  var h = '';
  if(cevenCanEditQuote(r.ejecutivo)){
    h += '<button class="bs" data-act="openq" data-qn="'+qnA+'" title="Editar la cotización #'+qnA+'" style="padding:1px 5px;font-size:11px;color:#0071e3;border-color:#0071e3">📝</button> ';
  }
  h += '<button class="bs" data-act="comp" data-qn="'+qnA+'" title="Descargar el comprobante de la cotización #'+qnA+' en PDF y abrirlo" style="padding:1px 5px;font-size:11px;color:#1f3864;border-color:#1f3864">🧾</button> ';
  return h;
}

/* Arma el cuerpo de la tabla agrupado por cliente. Lo usan renderPipeline() y
   renderArchiveMonth(). `scope` es '' para el pipeline activo y 'a:<mes>' para
   un mes archivado. */
function _pipeTablaHTML(filas, scope, opts){
  opts = opts || {};
  var esArchivo = !!scope;
  cevenPipeNodeReset();

  var grupos = cevenPipeSortGroups(
    cevenPipeGroupBy(filas),
    window._pipeSort.col, window._pipeSort.dir
  );

  var _db = opts.db || null;
  function db(){ if(_db === null) _db = getDB(); return _db; }
  var q = (opts.abrirSiMatchea || '').toLowerCase().trim();
  var html = '';

  grupos.forEach(function(g, gi){
    var kGrupo = cevenPipeKey(scope, 'c', gi);
    cevenPipeNodeAdd(kGrupo, {kind:'c', grupo:g});

    var abierto = cevenPipeAbierto(kGrupo);
    if(!abierto && q && g.clave.indexOf(q) === -1){
      abierto = g.rows.some(function(r){
        return ((r.proyecto||'') + ' ' + (r.qNum||'')).toLowerCase().indexOf(q) !== -1;
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

      /* Cuantos articulos tienen HOY un estado distinto al del proyecto: sin
         este aviso, el <select> de arriba dice "Cotizado" mientras la mitad de
         la plata ya esta en "Facturado" en las pastillas. */
      var _lnsFila = cevenSkuTieneOverrides(r) ? cevenOpcFilasDeCotiz(db(), r.qNum) : null;
      var nPropios = cevenSkuCuantosPropios(r, _lnsFila);
      var chipPropios = nPropios
        ? '<div style="font-size:9px;color:#6e6e73;margin-top:3px;white-space:nowrap" title="El estado del proyecto no se aplica a esos artículos: tienen uno propio">'
            + nPropios + (nPropios === 1 ? ' ítem propio' : ' ítems propios') + '</div>'
        : '';

      var celdaMes, celdaEstado, celdaAcc;
      if(esArchivo){
        celdaMes = '<span style="font-size:12px">' + cevenEsc(opts.mesLabel || '—') + '</span>';
        var cSt = cevenEstadoPill(estado);
        celdaEstado = '<span class="'+cevenEsc(cevenSpillClass(estado))+'" style="border-radius:980px;padding:2px 10px;font-size:11px;font-weight:700;color:'+cSt.fg+';background:'+cSt.bg+'">'+cevenEsc(cevenEstadoLabel(estado))+'</span>'
          + chipPropios
          + (estado === 'Perdido'
            ? '<button class="bs" data-act="perdido-detalle" data-k="'+kA+'" style="display:block;margin:4px auto 0;padding:2px 7px;font-size:10px;color:#a80011;background:#fff0f0;border-color:#f3b7b7;white-space:nowrap">Ver motivo</button>'
            : '');
        /* `cquotes` NO se archiva (solo `cpipeline`), asi que la cotizacion de
           un mes cerrado se sigue pudiendo abrir e imprimir: los dos botones
           van tambien aca. Lo que no va es el x, que escribe sobre una fila
           que getPipeline() ya no tiene. */
        celdaAcc = _pipeBotonesCotiz(r)
          + '<button class="bs" data-act="restore" data-k="'+kA+'" data-mk="'+cevenEsc(opts.monthKey||'')+'" title="Devolver este proyecto al pipeline actual" style="font-size:11px;padding:2px 8px">↩ Restaurar</button>';
      } else {
        celdaMes = cevenMonthField(r.mesCierre||'', ' data-act="mes" data-k="'+kA+'"', {cls:'mpk-sm'});
        celdaEstado = '<select data-act="est" data-k="'+kA+'" title="Cambia el estado de todos los artículos, menos los que tengan uno propio" style="padding:3px 6px;border:0.5px solid #d2d2d7;border-radius:6px;font-size:11px;font-family:inherit;background:#fff;width:100%">'
          + cevenEstadoOptions(estado, false) + '</select>'
          + chipPropios
          + (estado === 'Perdido'
            ? '<button class="bs" data-act="perdido-detalle" data-k="'+kA+'" style="display:block;margin:4px auto 0;padding:2px 7px;font-size:10px;color:#a80011;background:#fff0f0;border-color:#f3b7b7;white-space:nowrap">Ver motivo</button>'
            : '');
        celdaAcc = _pipeBotonesCotiz(r)
          + (cevenCanEditPipelineRow(r.ejecutivo) ? '<button class="bsr" data-act="rm" data-k="'+kA+'" title="Quitar este proyecto del pipeline">×</button>' : '');
      }

      html += '<tr class="'+cevenEsc(cevenRowStClass(estado))+'"'+(rowStyle?' style="'+rowStyle+'"':'')+'>'
        +'<td style="font-size:12px;white-space:nowrap;padding-left:22px">'
          +'<button class="bs" data-act="exp" data-k="'+kA+'" style="padding:0 5px;font-size:11px;line-height:1.4;margin-right:4px;min-width:20px">'+(abiertaFila?'▼':'▶')+'</button>'
          +cevenEsc(r.fecha)
        +'</td>'
        +'<td style="font-size:12px">'+cevenEsc(r.ejecutivo||'—')+'</td>'
        +'<td style="text-align:center;font-family:ui-monospace,Menlo,monospace;font-size:11px">'
          +(r.qNum ? '<span data-act="openq" data-qn="'+cevenEsc(r.qNum)+'" style="color:var(--acc,#0071e3);font-weight:600;cursor:pointer">#'+cevenEsc(r.qNum)+'</span>' : '—')
          +(r.qNum ? cevenOpcChipPipeHTML(db().filter(function(x){ return x['N° Cotización'] === r.qNum; }), ' data-act="opc" data-k="'+kA+'"') : '')
        +'</td>'
        +'<td style="cursor:pointer" data-act="exp" data-k="'+kA+'"><div style="max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'
          +cevenEsc(r.proyecto||'—')
          +' <span style="color:#6e6e73;font-size:11px;white-space:nowrap">▸</span>'
        +'</div></td>'
        +'<td style="font-size:12px;white-space:nowrap">'+celdaMes+'</td>'
        +'<td style="text-align:center">'+celdaEstado+'</td>'
        +'<td class="stk-monto" style="text-align:right;font-weight:500;white-space:nowrap;min-width:110px'+(tint.bg?';background:'+tint.bg:'')+(tint.fg?';color:'+tint.fg:'')+'">USD '+fI(r.monto||0)+'</td>'
        +'<td class="stk-act" style="text-align:center;white-space:nowrap'+(tint.bg?';background:'+tint.bg:'')+'">'+celdaAcc+'</td>'
      +'</tr>';

      if(abiertaFila){
        // esArchivo: en un mes cerrado el detalle es de SOLO LECTURA. La fila no
        // vive en getPipeline(), asi que un <select> de estado o la tijera no
        // encontrarian nada y el clic quedaria mudo.
        html += renderPipelineDetailRow(r, esArchivo, db());
      }
    });
  });

  return html;
}

function pipeBindDelegation(){
  cevenDelegate('pipe-body', 'click', function(ev){
    /* Las acciones POR LINEA del detalle usan data-dact/data-did/data-lk, un
       namespace propio: el detalle vive adentro de #pipe-body y con data-act
       chocarian con las acciones de fila, que resuelven data-k contra el
       registro de nodos. Se chequean primero y cortan. */
    var dEl = cevenSkuActEl(ev, this);
    if(dEl){
      var dact = dEl.getAttribute('data-dact');
      var did = Number(dEl.getAttribute('data-did'));
      var dlk = dEl.getAttribute('data-lk');
      if(dact === 'sku-est-clear') clearSkuEstadoPipe(did, dlk);
      else if(dact === 'sku-rm')   quitarLineaDeCotizacion(did, dlk);
      return;
    }

    var el = cevenActEl(ev, this);
    if(!el) return;
    var act = el.getAttribute('data-act');

    if(act === 'openq'){ openPipelineQuote(el.getAttribute('data-qn')); return; }
    if(act === 'comp'){ cevenImprimirComprobante(el.getAttribute('data-qn')); return; }

    var n = cevenPipeNodeAt(el.getAttribute('data-k'));
    if(!n) return;
    if(act === 'expcli'){ togglePipeNode(el.getAttribute('data-k')); return; }
    if(n.kind !== 'r') return;

    if(act === 'opc'){ cambiarOpcionVigente(n.row.id); return; }
    if(act === 'exp')          togglePipeNode(el.getAttribute('data-k'));
    else if(act === 'perdido-detalle') abrirDetalleMotivoPerdida(n.row.perdidoMotivo);
    else if(act === 'rm')      removePipeline(n.row.id);
    else if(act === 'restore') restoreFromArchive(el.getAttribute('data-mk'), n.row.id);
  });
  cevenDelegate('pipe-body', 'change', function(ev){
    // Mismo criterio que el click: primero el namespace por linea del detalle.
    var dEl = cevenSkuActEl(ev, this);
    if(dEl){
      if(dEl.getAttribute('data-dact') === 'sku-est'){
        updateSkuEstadoPipe(Number(dEl.getAttribute('data-did')), dEl.getAttribute('data-lk'), dEl.value);
      }
      return;
    }
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
