
// Toggle del filtro por estado al tocar una pill
window._pipeStatusFilters = window._pipeStatusFilters || [];
window._pipeMonthFilter = window._pipeMonthFilter || '';
function setPipeMonth(val){
  window._pipeMonthFilter = (window._pipeMonthFilter === val) ? '' : val;
  renderPipeline();
}
function setPipeClientFilter(cli){
  var box = document.getElementById('pipe-search');
  if(!box) return;
  if((box.value||'').trim().toLowerCase() === cli.toLowerCase()) box.value = '';
  else box.value = cli;
  renderPipeline();
}
function togglePillFilter(status){
  var idx = window._pipeStatusFilters.indexOf(status);
  if(idx !== -1) window._pipeStatusFilters.splice(idx, 1);
  else window._pipeStatusFilters.push(status);
  var sel = document.getElementById('pipe-status');
  if(sel) sel.value = window._pipeStatusFilters.length === 1 ? window._pipeStatusFilters[0] : '';
  renderPipeline();
}

// Sort state global
window._pipeSort = window._pipeSort || {col: 'fechaISO', dir: 'desc'};
function setPipeSort(col){
  if(window._pipeSort.col === col){
    window._pipeSort.dir = window._pipeSort.dir === 'asc' ? 'desc' : 'asc';
  } else {
    window._pipeSort.col = col;
    var numericCols = ['monto','fechaISO'];
    window._pipeSort.dir = numericCols.indexOf(col) !== -1 ? 'desc' : 'asc';
  }
  renderPipeline();
}
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

// No hay una lista fija de vendedores Poly todavía: se arma sola con los nombres
// que ya aparecieron en el pipeline (mismo criterio que los "Top clientes").
function _pipeExecList(pipe){
  var seen = {}, out = [];
  pipe.forEach(function(r){ var e=(r.ejecutivo||'').trim(); if(e && e!=='—' && !seen[e]){ seen[e]=1; out.push(e); } });
  out.sort();
  return out;
}

var rowStatusColors = {
  'Proyecto':    {bg:'', fg:''},
  'Cotizado':    {bg:'', fg:''},
  'Negociacion': {bg:'', fg:''},
  'Commit':      {bg:'#fff8e1', fg:''},
  'Con OC':      {bg:'#e8f6ee', fg:''},
  'Autorizando': {bg:'#d4f0de', fg:''},
  'Facturado':   {bg:'#b8e8cc', fg:''},
  'Perdido':     {bg:'#fbbebe', fg:''}
};
var statusColorsPill = {
  'Proyecto':    {bg:'#f2e8ff', fg:'#6e36c8'},
  'Cotizado':    {bg:'#e8f4ff', fg:'#0071e3'},
  'Negociacion': {bg:'#fff3e0', fg:'#c84e00'},
  'Commit':      {bg:'#fff8e1', fg:'#7a5800'},
  'Con OC':      {bg:'#e8f6ee', fg:'#15863a'},
  'Autorizando': {bg:'#d4f0de', fg:'#0e7a52'},
  'Facturado':   {bg:'#b8e8cc', fg:'#0a5c30'},
  'Perdido':     {bg:'#fbbebe', fg:'#a80011'}
};
var statusOrderPipe = ['Proyecto','Cotizado','Negociacion','Commit','Con OC','Autorizando','Facturado','Perdido'];

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
    var newHtml = '<option value="">Pipeline actual</option>';
    archiveMonths.forEach(function(m){
      var p = m.split('-');
      var lbl = p.length===2 ? (meses[parseInt(p[1])-1]+' '+p[0]) : m;
      newHtml += '<option value="'+m+'">📦 '+lbl+'</option>';
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

  // Poblar el filtro de Ejecutivo dinámicamente
  var execSel = document.getElementById('pipe-exec');
  if(execSel){
    var curExec = execSel.value;
    var execList = _pipeExecList(pipe);
    execSel.innerHTML = '<option value="">Todos</option>' + execList.map(function(e){ return '<option'+(e===curExec?' selected':'')+'>'+e+'</option>'; }).join('');
  }

  var q = (document.getElementById('pipe-search').value||'').toLowerCase().trim();
  var ex = document.getElementById('pipe-exec').value || '';
  var _stFilters = window._pipeStatusFilters || [];
  var st  = _stFilters.length === 1 ? _stFilters[0]
          : (_stFilters.length === 0 ? ((document.getElementById('pipe-status')||{}).value || '') : '');
  var monthFilter = window._pipeMonthFilter || '';

  // Pastillas de Cierre estimado
  var allMonthValues = {};
  pipe.forEach(function(r){ if(r.mesCierre) allMonthValues[r.mesCierre] = true; });
  var monthPills = document.getElementById('pipe-month-pills');
  if(monthPills){
    var sortedMonths = Object.keys(allMonthValues).sort();
    var meses2 = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
    var cur = monthFilter;
    function _mPill(val, label){
      var active = (cur === val) || (val==='' && !cur);
      var bg = active ? '#1d1d1f' : '#fff';
      var fg = active ? '#fff' : '#1d1d1f';
      var bd = active ? '#1d1d1f' : '#d2d2d7';
      return '<div class="pipe-mpill'+(active?' pipe-mpill-on':'')+'" onclick="setPipeMonth(\''+val+'\')" style="cursor:pointer;border:0.5px solid '+bd+';background:'+bg+';color:'+fg+';border-radius:980px;padding:5px 13px;font-size:12px;font-weight:'+(active?'600':'500')+';white-space:nowrap">'+label+'</div>';
    }
    var pillsH = _mPill('', 'Todos') + _mPill('sin-fecha', 'Sin fecha');
    sortedMonths.forEach(function(m){
      var p = m.split('-');
      var lbl = p.length===2 ? (meses2[parseInt(p[1])-1]+' '+p[0]) : m;
      pillsH += _mPill(m, lbl);
    });
    monthPills.innerHTML = pillsH;
  }

  // Top 3-5 clientes
  var topClientsBox = document.getElementById('pipe-topclients-pills');
  if(topClientsBox){
    var cliCount = {};
    pipe.forEach(function(r){ var cl=(r.cliente||'').trim(); if(!cl || cl==='—') return; cliCount[cl]=(cliCount[cl]||0)+1; });
    var topCli = Object.keys(cliCount).map(function(c){ return {cli:c, n:cliCount[c]}; });
    topCli.sort(function(a,b){ return b.n - a.n; });
    topCli = topCli.slice(0,5);
    var medals = ['🥇','🥈','🥉','4°','5°'];
    var curSearch = (document.getElementById('pipe-search').value||'').trim().toLowerCase();
    var tcH = '';
    topCli.forEach(function(t, i){
      var active = curSearch === t.cli.toLowerCase();
      var bg = active ? '#1d1d1f' : '#fff';
      var fg = active ? '#fff' : '#1d1d1f';
      var bd = active ? '#1d1d1f' : '#d2d2d7';
      var cEsc = t.cli.replace(/'/g,"\\'").replace(/"/g,'&quot;');
      tcH += '<div class="pipe-mpill'+(active?' pipe-mpill-on':'')+'" onclick="setPipeClientFilter(\''+cEsc+'\')" style="cursor:pointer;border:0.5px solid '+bd+';background:'+bg+';color:'+fg+';border-radius:980px;padding:5px 13px;font-size:12px;font-weight:'+(active?'600':'500')+';white-space:nowrap">'
        +medals[i]+' '+t.cli+' <span style="opacity:.7;font-weight:400">· '+t.n+' OPG</span></div>';
    });
    topClientsBox.innerHTML = tcH || '<span style="font-size:12px;color:#aeaeb2">Sin cotizaciones</span>';
  }

  var filtered = pipe.filter(function(r){
    if(ex && r.ejecutivo !== ex) return false;
    if(q){
      var salasTxt = (r.salas||[]).map(function(s){ return s.sala||''; }).join(' ');
      var hay = ((r.cliente||'')+' '+(r.opg||'')+' '+salasTxt).toLowerCase();
      if(hay.indexOf(q) === -1) return false;
    }
    if(_stFilters.length > 0 && _stFilters.indexOf(r.estado||'Cotizado') === -1) return false;
    if(monthFilter){
      if(monthFilter === 'sin-fecha'){ if(r.mesCierre) return false; }
      else if(r.mesCierre !== monthFilter) return false;
    }
    return true;
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
  var sumMonto = 0, sumSalas = 0;
  var byStatus = {};
  statusOrderPipe.forEach(function(s){ byStatus[s] = {count:0, monto:0}; });
  filtered.forEach(function(r){
    var estado = r.estado || 'Cotizado';
    var monto = r.monto || 0;
    sumMonto += monto;
    sumSalas += (r.salas||[]).length;
    if(!byStatus[estado]) byStatus[estado] = {count:0, monto:0};
    byStatus[estado].count++;
    byStatus[estado].monto += monto;
  });
  var facturadoData = byStatus['Facturado'] || {count:0, monto:0};
  var perdidoData   = byStatus['Perdido']   || {count:0, monto:0};
  var sumPipeline = st ? sumMonto : (sumMonto - facturadoData.monto - perdidoData.monto);

  var dash = document.getElementById('pipe-dashboard');
  if(filtered.length){
    dash.style.display = 'block';
    document.getElementById('dash-count').textContent = filtered.length;
    document.getElementById('dash-salas').textContent  = sumSalas;
    document.getElementById('dash-facturado').textContent = 'USD ' + fI(facturadoData.monto);
    var proySt = ['Facturado','Autorizando','Con OC','Commit'];
    var pMonto = 0;
    proySt.forEach(function(ps){ pMonto += (byStatus[ps]||{monto:0}).monto; });
    document.getElementById('dash-proy').textContent = 'USD ' + fI(pMonto);
    document.getElementById('dash-total').textContent = 'USD ' + fI(sumPipeline);

    var pillsHtml = '<div style="font-size:11px;color:#6e6e73;text-transform:uppercase;letter-spacing:.4px;margin-bottom:8px">Por estado</div>'
      + '<div style="display:flex;flex-wrap:wrap;gap:6px;width:100%">';
    statusOrderPipe.forEach(function(s){
      var data = byStatus[s] || {count:0, monto:0};
      var c = statusColorsPill[s] || {bg:'#f2f2f7', fg:'#1d1d1f'};
      var dim = data.count === 0 ? ';opacity:.45' : '';
      var isActive = window._pipeStatusFilters && window._pipeStatusFilters.indexOf(s) !== -1;
      var activeBorder = isActive ? ';outline:2px solid '+c.fg+';outline-offset:1px' : '';
      pillsHtml += '<div class="spill" onclick="togglePillFilter(\''+s+'\')" style="background:'+c.bg+';color:'+c.fg+';border-radius:980px;padding:6px 12px;font-size:12px;display:inline-flex;align-items:center;gap:6px;cursor:pointer'+activeBorder+dim+'">'
        +'<strong>'+s+'</strong><span style="opacity:.85">· '+data.count+' · USD '+fI(data.monto)+'</span></div>';
    });
    pillsHtml += '</div>';
    document.getElementById('dash-by-status').innerHTML = pillsHtml;
  } else {
    dash.style.display = 'none';
  }

  // ── TABLA ──
  var html = '';
  for(var i=0;i<filtered.length;i++){
    var r = filtered[i];
    var expanded = window._pipeExpanded && window._pipeExpanded[r.id];
    var salasCount = (r.salas||[]).length;
    var mesSel = '<select onchange="updatePipelineMesCierreValue('+r.id+',this.value)" style="padding:2px 4px;border:0.5px solid #d2d2d7;border-radius:5px;font-size:11px;font-family:inherit;background:#fff;min-width:110px">'
      + generateMesYearOptions(r.mesCierre||'') + '</select>';
    var estado = r.estado || 'Cotizado';
    var statusSel = '<select onchange="updatePipelineStatus('+r.id+',this.value)" style="padding:3px 6px;border:0.5px solid #d2d2d7;border-radius:6px;font-size:11px;font-family:inherit;background:#fff;width:100%">';
    statusOrderPipe.forEach(function(s){ statusSel += '<option value="'+s+'"'+(s===estado?' selected':'')+'>'+s+'</option>'; });
    statusSel += '</select>';
    var rowTintInfo = rowStatusColors[estado] || {bg:'', fg:''};
    var rowStyle = rowTintInfo.bg ? ' style="background:'+rowTintInfo.bg+'"' : '';

    html += '<tr'+rowStyle+'>'
      +'<td style="font-size:12px;white-space:nowrap">'
        +'<button class="bs" onclick="togglePipelineRow('+r.id+')" title="Ver Salas" style="padding:0 5px;font-size:11px;line-height:1.4;margin-right:4px;min-width:20px">'+(expanded?'▼':'▶')+'</button>'
        +r.fecha
      +'</td>'
      +'<td style="font-size:12px">'+(r.ejecutivo||'—')+'</td>'
      +'<td style="font-weight:500"><div title="'+(r.cliente||'').replace(/"/g,'&quot;')+'" style="max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+r.cliente+'</div></td>'
      +'<td><div title="'+(r.opg||'').replace(/"/g,'&quot;')+'" style="max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+(r.opg||'—')+'</div></td>'
      +'<td style="text-align:center;cursor:pointer" onclick="togglePipelineRow('+r.id+')" title="Ver Salas">'+salasCount+' sala'+(salasCount===1?'':'s')+'</td>'
      +'<td style="font-size:12px;white-space:nowrap">'+mesSel+'</td>'
      +'<td style="text-align:center">'+statusSel+'</td>'
      +'<td class="stk-monto" style="text-align:right;font-weight:500;white-space:nowrap;min-width:110px">USD '+fI(r.monto||0)+'</td>'
      +'<td class="stk-act" style="text-align:center;white-space:nowrap">'
        +(r.factura
          ? '<button class="bs" onclick="editFactura('+r.id+');event.stopPropagation()" title="Factura: '+String(r.factura).replace(/"/g,'&quot;')+' · clic para editar" style="background:#34c759;color:#fff;border-color:#2aad4e;padding:2px 8px;font-size:11px;font-weight:600">Fact.</button> '
          : '<button class="bs" onclick="editFactura('+r.id+');event.stopPropagation()" title="Cargar número de factura" style="background:#fde8e8;color:#d70015;border-color:#f5b1b1;padding:2px 8px;font-size:11px;font-weight:600">Fact.</button> ')
        +(cevenCanEditPipelineRow(r.ejecutivo) ? '<button class="bsr" onclick="removePipeline('+r.id+');event.stopPropagation()" title="Eliminar OPG del pipeline">×</button>' : '')
      +'</td>'
      +'</tr>';
    if(expanded) html += renderPipelineDetailRow(r);
  }

  document.getElementById('pipe-body').innerHTML = html || '<tr><td colspan="9" style="text-align:center;color:#aeaeb2;padding:24px">Sin entradas en pipeline. Cargá una cotización y tocá "Agregar a Pipeline".</td></tr>';
  attachPipeSortHandlers();
}
