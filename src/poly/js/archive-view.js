// Vista simple de un mes archivado: tabla de OPGs Facturados/Perdidos de ese mes.
function renderArchiveMonth(monthKey, entries){
  var meses = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
  var p = monthKey.split('-');
  var lbl = p.length===2 ? (meses[parseInt(p[1])-1]+' '+p[0]) : monthKey;

  var dash = document.getElementById('pipe-dashboard');
  var sumMonto = 0, sumSalas = 0;
  var byStatus = {};
  entries.forEach(function(r){
    var monto = r.monto || 0;
    sumMonto += monto;
    sumSalas += (r.salas||[]).length;
    var est = r.estado || 'Cotizado';
    if(!byStatus[est]) byStatus[est] = {count:0, monto:0};
    byStatus[est].count++;
    byStatus[est].monto += monto;
  });
  var facturadoData = byStatus['Facturado'] || {count:0, monto:0};
  var perdidoData   = byStatus['Perdido']   || {count:0, monto:0};

  dash.style.display = 'block';
  document.getElementById('dash-count').textContent = entries.length;
  document.getElementById('dash-salas').textContent  = sumSalas;
  document.getElementById('dash-facturado').textContent = 'USD ' + fI(facturadoData.monto) + (facturadoData.count?' ('+facturadoData.count+' OPG)':'');
  document.getElementById('dash-proy').textContent = 'USD ' + fI(facturadoData.monto);
  var tv = document.getElementById('dash-total');
  if(tv) tv.textContent = perdidoData.count ? ('USD ' + fI(perdidoData.monto) + ' perdido (' + perdidoData.count + ')') : 'USD 0 perdido';

  var pillsHtml = '<div style="display:flex;flex-wrap:wrap;gap:6px;width:100%">';
  Object.keys(byStatus).forEach(function(s){
    var data = byStatus[s];
    // spill-<Estado> además de .spill: sin esa clase el dark mode de
    // shared/css/dark.css no matchea y la pastilla queda ilegible.
    pillsHtml += '<div class="'+_spillClass(s)+'" style="background:#f2f2f7;color:#1d1d1f;border-radius:980px;padding:6px 12px;font-size:12px;display:inline-flex;align-items:center;gap:6px">'
      +'<strong>'+cevenEsc(s)+'</strong><span style="opacity:.85">· '+data.count+' · USD '+fI(data.monto)+'</span></div>';
  });
  pillsHtml += '</div>';
  document.getElementById('dash-by-status').innerHTML = pillsHtml;

  // Las filas archivadas también viajan por Supabase: mismo tratamiento que el
  // pipeline activo (todo escapado, los handlers por data-* + delegación).
  window._pipeRows = entries;
  var html = '';
  entries.forEach(function(r, i){
    var salasCount = (r.salas||[]).length;
    var expandKey = 'arch__'+monthKey+'__'+r.id;
    var expanded = window._pipeExpanded && window._pipeExpanded[expandKey];
    var estado = r.estado || 'Cotizado';
    html += '<tr class="'+cevenEsc(_rowStClass(estado))+'">'
      +'<td style="font-size:12px;white-space:nowrap">'
        +'<button class="bs" data-act="exp" data-key="'+cevenEsc(expandKey)+'" title="Ver Salas" style="padding:0 5px;font-size:11px;line-height:1.4;margin-right:4px;min-width:20px">'+(expanded?'▼':'▶')+'</button>'
        +cevenEsc(r.fecha)
      +'</td>'
      +'<td style="font-size:12px">'+cevenEsc(r.ejecutivo||'—')+'</td>'
      +'<td style="font-weight:500">'+cevenEsc(r.cliente||'—')+'</td>'
      +'<td>'+cevenEsc(r.opg||'—')+'</td>'
      +'<td style="text-align:center">'+salasCount+' sala'+(salasCount===1?'':'s')+'</td>'
      +'<td style="font-size:12px">'+cevenEsc(lbl)+'</td>'
      +'<td style="text-align:center"><span class="'+cevenEsc(_spillClass(estado))+'" style="border-radius:980px;padding:2px 10px;font-size:11px;font-weight:700;color:'+(estado==='Facturado'?'#0a5c30':'#a80011')+';background:'+(estado==='Facturado'?'#e0f5f1':'#fbbebe')+'">'+cevenEsc(estado)+'</span></td>'
      +'<td class="stk-monto" style="text-align:right;font-weight:500">USD '+fI(r.monto||0)+'</td>'
      +'<td class="stk-act" style="text-align:center">'
        +'<button class="bs" data-act="restore" data-i="'+i+'" data-mk="'+cevenEsc(monthKey)+'" title="Restaurar al pipeline activo" style="font-size:11px;padding:2px 8px">↩</button>'
      +'</td>'
    +'</tr>';
    if(expanded) html += renderPipelineDetailRow(r, i);
  });
  document.getElementById('pipe-body').innerHTML = html || '<tr><td colspan="9" style="text-align:center;color:#aeaeb2;padding:24px">No hay entradas para '+cevenEsc(lbl)+'</td></tr>';
  attachPipeSortHandlers();
  pipeBindDelegation();
}

// Deja el <select> de meses archivados apuntando a `val`, creando la opción si
// hace falta. renderPipeline() lee el valor ANTES de repoblar el select, así que
// asignar un valor sin opción lo dejaría en '' y se perdería la selección.
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
  if(!toRestore){ showToast('No se encontró esa entrada en el archivo.'); return; }

  // La fila vuelve al pipeline con el mes de cierre movido al mes ACTUAL. Con el
  // mes viejo, archiveOldEntries() —que corre al entrar al pipeline desde
  // _navApply(), en shared/ui-core.js— la archivaba de nuevo en el acto: el
  // botón "Restaurar" parecía no hacer nada. Se restaura una COPIA para que el
  // snapshot original (con su mesCierre) quede intacto para el deshacer.
  var restored = JSON.parse(JSON.stringify(toRestore));
  restored.mesCierre = currentMonthKey();
  var pipe = getPipeline();
  pipe.push(restored);
  savePipeline(pipe);
  saveArchive(archive);

  // Y volver a "Pipeline actual": si el selector seguía en el mes archivado, la
  // fila restaurada no se veía en ninguna de las dos vistas.
  _selectArchiveMonth('');
  renderPipeline();

  notifyUndo('↩ OPG restaurado al pipeline (cierre movido al mes actual).', function(){
    var archive2 = getArchive();
    var pipe2 = getPipeline().filter(function(r){ return r.id !== id; });
    savePipeline(pipe2);
    if(!archive2[monthKey]) archive2[monthKey] = [];
    // Sin este chequeo la fila se DUPLICABA en el archivo: undoPipelineChange()
    // (u otra restauración) podía haberla devuelto ya, y el push era ciego.
    var yaEsta = archive2[monthKey].some(function(x){ return x.id === id; });
    if(!yaEsta) archive2[monthKey].push(toRestore);
    saveArchive(archive2);
    _selectArchiveMonth(monthKey);
    renderPipeline();
  });
}
