// Vista simple de un mes archivado: los proyectos Facturados/Perdidos de ese mes.
function renderArchiveMonth(monthKey, entries){
  var meses = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
  var p = monthKey.split('-');
  var lbl = p.length===2 ? (meses[parseInt(p[1])-1]+' '+p[0]) : monthKey;

  /* El buscador (#pipe-search) filtra también el mes archivado — tabla Y
     tarjetas del dashboard: todo lo de abajo trabaja sobre `entries`. Mismo
     matcher que el pipeline vivo (pipeline-view.js): cliente + proyecto + N°. */
  var _q = ((document.getElementById('pipe-search') || {}).value || '').toLowerCase().trim();
  if(_q){
    entries = entries.filter(function(r){
      return ((r.cliente||'')+' '+(r.proyecto||'')+' '+(r.qNum||'')).toLowerCase().indexOf(_q) !== -1;
    });
  }

  var dash = document.getElementById('pipe-dashboard');
  var sumMonto = 0;
  var cliVistos = {}, nClientes = 0;
  var byStatus = {};
  entries.forEach(function(r){
    var monto = r.monto || 0;
    sumMonto += monto;
    var ck = (r.cliente||'').trim().toLowerCase();
    if(ck && ck !== '—' && !cliVistos[ck]){ cliVistos[ck] = 1; nClientes++; }
    var est = r.estado || 'Cotizado';
    if(!byStatus[est]) byStatus[est] = {count:0, monto:0};
    byStatus[est].count++;
    byStatus[est].monto += monto;
  });
  var facturadoData = byStatus['Facturado'] || {count:0, monto:0};
  var perdidoData   = byStatus['Perdido']   || {count:0, monto:0};

  dash.style.display = 'block';
  document.getElementById('dash-count').textContent = nClientes;
  document.getElementById('dash-proyectos').textContent = entries.length;

  _pipeSetLbl('dash-facturado-lbl', 'Facturado en ' + lbl);
  document.getElementById('dash-facturado').textContent = 'USD ' + fI(facturadoData.monto);

  _pipeSetLbl('dash-proy-lbl', 'Proyectos facturados');
  document.getElementById('dash-proy').textContent = String(facturadoData.count);
  _pipeSetLbl('dash-proy-sub', 'de ' + entries.length + ' archivados');

  _pipeSetLbl('dash-total-lbl', 'Perdido en ' + lbl);
  var tv = document.getElementById('dash-total');
  if(tv) tv.textContent = 'USD ' + fI(perdidoData.monto);
  _pipeSetLbl('dash-total-sub', perdidoData.count
    ? (perdidoData.count + (perdidoData.count===1?' proyecto':' proyectos'))
    : 'ninguno');

  var pillsHtml = '<div style="font-size:11px;color:#6e6e73;text-transform:uppercase;letter-spacing:.4px;margin-bottom:8px">Por estado</div>'
    + '<div style="display:flex;flex-wrap:wrap;gap:6px;width:100%">';
  Object.keys(byStatus).forEach(function(s){
    var data = byStatus[s];
    var c = cevenEstadoPill(s);
    pillsHtml += '<div class="'+cevenSpillClass(s)+'" style="background:'+c.bg+';color:'+c.fg+';border-radius:980px;padding:6px 12px;font-size:12px;display:inline-flex;align-items:center;gap:6px">'
      +'<strong>'+cevenEsc(cevenEstadoLabel(s))+'</strong><span style="opacity:.85">· '+data.count+' proy · USD '+fI(data.monto)+'</span></div>';
  });
  pillsHtml += '</div>';
  document.getElementById('dash-by-status').innerHTML = pillsHtml;

  var html = _pipeTablaHTML(entries, 'a:' + monthKey, {monthKey: monthKey, mesLabel: lbl});
  document.getElementById('pipe-body').innerHTML = html || '<tr><td colspan="9" style="text-align:center;color:#aeaeb2;padding:24px">'
    + (_q ? 'Ningún proyecto archivado de '+cevenEsc(lbl)+' coincide con la búsqueda.'
          : 'No hay proyectos archivados en '+cevenEsc(lbl)+'. Elegí "Pipeline actual" en Vista para volver.')
    + '</td></tr>';
  attachPipeSortHandlers();
  pipeBindDelegation();
}

// Deja el <select> de meses archivados apuntando a `val`, creando la opción si
// hace falta.
function _selectArchiveMonth(val){
  var sel = document.getElementById('archive-month-sel');
  if(!sel) return;
  if(val){
    var found = false;
    for(var i=0;i<sel.options.length;i++){ if(sel.options[i].value === val){ found = true; break; } }
    if(!found){
      var o = document.createElement('option');
      o.value = val; o.textContent = val;
      sel.appendChild(o);
    }
  }
  sel.value = val || '';
}

function restoreFromArchive(monthKey, id){
  var archive = getArchive();
  var entries = archive[monthKey] || [];
  var toRestore = null;
  archive[monthKey] = entries.filter(function(r){ if(r.id===id){ toRestore=r; return false; } return true; });
  if(!archive[monthKey].length) delete archive[monthKey];
  if(!toRestore){ showToast('No se encontró ese proyecto en el archivo.'); return; }

  var restored = JSON.parse(JSON.stringify(toRestore));
  restored.mesCierre = currentMonthKey();
  delete restored.mesAutoRoll;   // decisión manual fresca: sin chapita "↪ auto"
  var pipe = getPipeline();
  pipe.push(restored);
  savePipeline(pipe);
  saveArchive(archive);

  _selectArchiveMonth('');
  renderPipeline();

  notifyUndo('↩ Restaurado al pipeline actual — el cierre estimado se movió a este mes.', function(){
    var archive2 = getArchive();
    var pipe2 = getPipeline().filter(function(r){ return r.id !== id; });
    savePipeline(pipe2);
    if(!archive2[monthKey]) archive2[monthKey] = [];
    var yaEsta = archive2[monthKey].some(function(x){ return x.id === id; });
    if(!yaEsta) archive2[monthKey].push(toRestore);
    saveArchive(archive2);
    _selectArchiveMonth(monthKey);
    renderPipeline();
  });
}
