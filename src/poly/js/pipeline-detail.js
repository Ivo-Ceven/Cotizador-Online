function togglePipelineRow(id){
  window._pipeExpanded = window._pipeExpanded || {};
  window._pipeExpanded[id] = !window._pipeExpanded[id];
  renderPipeline();
}

// ── Factura (a nivel de OPG, se completa post-hoc — análogo al OV Link de Apple) ──
function editFactura(id){
  var pipe = getPipeline();
  var idx = -1;
  for(var i=0;i<pipe.length;i++){ if(pipe[i].id === id){ idx = i; break; } }
  if(idx < 0) return;
  if(!cevenCanEditPipelineRow(pipe[idx].ejecutivo)){ alert('No tenés permiso para modificar esta línea del pipeline.'); return; }
  var current = pipe[idx].factura || '';
  var msg = current
    ? 'Número de factura actual:\n' + current + '\n\nDejá vacío para quitarlo, o escribí uno nuevo:'
    : 'Número de factura para este OPG:';
  var val = prompt(msg, current);
  if(val === null) return; // cancelado
  val = val.trim();
  pipe[idx].factura = val === '' ? null : val;
  savePipeline(pipe);
  renderPipeline();
}

function updatePipelineStatus(id, newStatus){
  var pipe = getPipeline();
  var row = pipe.find(function(r){ return r.id === id; });
  if(row && !cevenCanEditPipelineRow(row.ejecutivo)){ alert('No tenés permiso para modificar esta línea del pipeline.'); return; }
  if(typeof pushPipeUndo === 'function') pushPipeUndo(id);
  for(var i=0;i<pipe.length;i++){ if(pipe[i].id === id){ pipe[i].estado = newStatus; break; } }
  savePipeline(pipe);
  renderPipeline();
}

function updatePipelineMesCierreValue(id, fullValue){
  var pipe = getPipeline();
  var row = pipe.find(function(r){ return r.id === id; });
  if(row && !cevenCanEditPipelineRow(row.ejecutivo)){ alert('No tenés permiso para modificar esta línea del pipeline.'); return; }
  if(typeof pushPipeUndo === 'function') pushPipeUndo(id);
  for(var i=0;i<pipe.length;i++){ if(pipe[i].id === id){ pipe[i].mesCierre = fullValue || ''; break; } }
  savePipeline(pipe);
  renderPipeline();
}

function removePipeline(id){
  var pipe = getPipeline();
  var row = pipe.find(function(r){ return r.id === id; });
  if(row && !cevenCanEditPipelineRow(row.ejecutivo)){ alert('No tenés permiso para eliminar esta línea del pipeline.'); return; }
  if(!confirm('¿Eliminar este OPG completo del pipeline (todas sus Salas)?')) return;
  pipe = pipe.filter(function(r){ return r.id !== id; });
  savePipeline(pipe);
  renderPipeline();
}

// Quita una Sala puntual de un OPG. Si era la última, se borra el OPG entero.
function removeSalaFromPipeline(pipeId, qn){
  var pipe = getPipeline();
  var row = pipe.find(function(r){ return r.id === pipeId; });
  if(!row) return;
  if(!cevenCanEditPipelineRow(row.ejecutivo)){ alert('No tenés permiso para modificar esta línea del pipeline.'); return; }
  var sala = (row.salas||[]).find(function(s){ return s.qNum === qn; });
  if(!confirm('¿Quitar la Sala "'+(sala?sala.sala:qn)+'" (cotización #'+qn+') de este OPG?')) return;
  row.salas = (row.salas||[]).filter(function(s){ return s.qNum !== qn; });
  if(!row.salas.length){
    pipe = pipe.filter(function(r){ return r.id !== pipeId; });
    showToast('OPG eliminado (sin Salas restantes).');
  } else {
    row.monto = Math.round(row.salas.reduce(function(acc,x){ return acc + (x.monto||0); }, 0));
  }
  savePipeline(pipe);
  renderPipeline();
}

function openPipelineQuote(qn){
  var db = getDB();
  var rows = db.filter(function(r){ return r['N° Cotización'] === qn; });
  if(!rows.length){ alert('No se encontró la cotización #'+qn+' en el historial.'); return; }
  editQuoteFromHistory(qn);
}

// Fila expandible: lista las Salas agrupadas bajo este OPG.
function renderPipelineDetailRow(r){
  var salas = r.salas || [];
  if(!salas.length){
    return '<tr class="pipe-detail"><td colspan="9" style="padding:14px 18px;background:#fafafa;color:#aeaeb2;font-size:12px">Sin Salas cargadas.</td></tr>';
  }
  var inner = '<div style="padding:10px 14px 14px;background:#fafafa">'
    +'<div style="font-size:11px;color:#6e6e73;text-transform:uppercase;letter-spacing:.4px;margin-bottom:8px">Salas · OPG '+(r.opg||'—')+'</div>'
    +'<table style="width:100%;font-size:12px;border-collapse:collapse;background:#fff;border:0.5px solid #e5e5e7;border-radius:8px;overflow:hidden">'
    +'<thead><tr style="background:#f5f5f7">'
      +'<th style="text-align:left;padding:6px 10px;font-size:11px;color:#6e6e73">Sala</th>'
      +'<th style="text-align:center;padding:6px 10px;font-size:11px;color:#6e6e73">Cotización</th>'
      +'<th style="text-align:right;padding:6px 10px;font-size:11px;color:#6e6e73">Monto</th>'
      +'<th style="text-align:center;padding:6px 10px;font-size:11px;color:#6e6e73"></th>'
    +'</tr></thead><tbody>';
  salas.forEach(function(s){
    inner += '<tr style="border-top:0.5px solid #f0f0f0">'
      +'<td style="padding:6px 10px">'+(s.sala||'—')+'</td>'
      +'<td style="padding:6px 10px;text-align:center"><a href="javascript:void(0)" onclick="openPipelineQuote(\''+s.qNum+'\')" style="color:#0071e3;text-decoration:none;font-weight:600">#'+s.qNum+'</a></td>'
      +'<td style="padding:6px 10px;text-align:right;font-weight:500">USD '+fI(s.monto||0)+'</td>'
      +'<td style="padding:6px 10px;text-align:center">'+(cevenCanEditPipelineRow(r.ejecutivo) ? '<button class="bsr" onclick="removeSalaFromPipeline('+r.id+',\''+s.qNum+'\')" title="Quitar esta Sala">×</button>' : '')+'</td>'
      +'</tr>';
  });
  inner += '</tbody></table></div>';
  return '<tr class="pipe-detail"><td colspan="9" style="padding:0;background:#fafafa">'+inner+'</td></tr>';
}

function buildPipelineWorkbook(){
  var pipe = getPipeline();
  if(!pipe.length) return null;
  var meses = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
  var data = pipe.map(function(r){
    var mesLabel = '';
    if(r.mesCierre){
      var parts = r.mesCierre.split('-');
      if(parts.length === 2){
        var mIdx = parseInt(parts[1]) - 1;
        if(mIdx >= 0 && mIdx < 12) mesLabel = meses[mIdx] + ' ' + parts[0];
      }
    }
    return {
      'Fecha': r.fecha,
      'OPG': r.opg || '',
      'Estado': r.estado || 'Cotizado',
      'Ejecutivo': r.ejecutivo,
      'Cliente': r.cliente,
      'Cierre estimado': mesLabel,
      'Cantidad de Salas': (r.salas||[]).length,
      'Monto USD': r.monto,
      'Factura': r.factura || ''
    };
  });
  var ws = XLSX.utils.json_to_sheet(data);
  ws['!cols'] = [{wch:11},{wch:16},{wch:13},{wch:18},{wch:24},{wch:14},{wch:14},{wch:14},{wch:16}];
  var wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Pipeline');
  return wb;
}

function exportPipeline(){
  var wb = buildPipelineWorkbook();
  if(!wb){ alert('Pipeline vacío.'); return; }
  XLSX.writeFile(wb, 'Ceven_Poly_Pipeline.xlsx');
}
