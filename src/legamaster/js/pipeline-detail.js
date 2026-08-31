/* togglePipelineRow(id) no existe: abrir y cerrar lo hace togglePipeNode(clave),
   en shared/pipeline-group.js, que sirve igual para un grupo de cliente que
   para una fila. */

function updatePipelineStatus(id, newStatus){
  var pipe = getPipeline();
  var row = pipe.find(function(r){ return r.id === id; });
  if(row && !cevenCanEditPipelineRow(row.ejecutivo)){ showToast('No tenés permiso para modificar este proyecto: es de otro ejecutivo.'); return; }
  if(newStatus === 'Perdido'){
    abrirModalMotivoPerdida(function(perdidoMotivo){
      _guardarEstadoPipeline(id, newStatus, perdidoMotivo);
    }, function(){
      renderPipeline();
    });
    return;
  }
  _guardarEstadoPipeline(id, newStatus, null);
}

function _guardarEstadoPipeline(id, newStatus, perdidoMotivo){
  var pipe = getPipeline();
  if(typeof pushPipeUndo === 'function') pushPipeUndo(id);
  for(var i=0;i<pipe.length;i++){
    if(pipe[i].id === id){
      pipe[i].estado = newStatus;
      if(newStatus === 'Perdido') pipe[i].perdidoMotivo = perdidoMotivo;
      else delete pipe[i].perdidoMotivo;
      break;
    }
  }
  savePipeline(pipe);
  renderPipeline();
}

function updatePipelineMesCierreValue(id, fullValue){
  var pipe = getPipeline();
  var row = pipe.find(function(r){ return r.id === id; });
  if(row && !cevenCanEditPipelineRow(row.ejecutivo)){ showToast('No tenés permiso para modificar este proyecto: es de otro ejecutivo.'); return; }
  if(typeof pushPipeUndo === 'function') pushPipeUndo(id);
  for(var i=0;i<pipe.length;i++){ if(pipe[i].id === id){ pipe[i].mesCierre = fullValue || ''; break; } }
  savePipeline(pipe);
  renderPipeline();
}

function removePipeline(id){
  var pipe = getPipeline();
  var row = pipe.find(function(r){ return r.id === id; });
  if(!row) return;
  if(!cevenCanEditPipelineRow(row.ejecutivo)){ showToast('No tenés permiso para eliminar este proyecto: es de otro ejecutivo.'); return; }
  if(typeof pushPipeUndoRemove === 'function') pushPipeUndoRemove(row);
  pipe = pipe.filter(function(r){ return r.id !== id; });
  savePipeline(pipe);
  renderPipeline();
  notifyUndo('Quitaste el proyecto "'+(row.proyecto||'—')+'" (cotización #'+(row.qNum||'—')+') del pipeline.', function(){ if(typeof undoPipelineChange==='function') undoPipelineChange(); });
}

function openPipelineQuote(qn){
  var db = getDB();
  var rows = db.filter(function(r){ return r['N° Cotización'] === qn; });
  if(!rows.length){ showToast('No se encontró la cotización #'+qn+' en el historial.'); return; }
  editQuoteFromHistory(qn);
}

/* Fila expandible: los ARTÍCULOS de la cotización del proyecto, con sus precios.

   `db` viene de renderPipeline(): getDB() hace JSON.parse de varios MB y el poll
   redibuja cada 15 s, así que se parsea UNA vez por render y se pasa hacia
   abajo. Si no viene, se lee acá (el archivo lo llama sin db). */
function renderPipelineDetailRow(r, idx, db){
  if(!db) db = getDB();
  var qn = r.qNum;
  var lines = cevenOpcFilasDeCotiz(db, qn);

  if(!lines.length){
    return '<tr class="pipe-detail"><td colspan="8" style="padding:14px 18px;background:#fafafa;color:#aeaeb2;font-size:12px">'
      + 'No se encontraron los artículos de la cotización #' + cevenEsc(qn||'—')
      + ' — puede haberse borrado del historial.</td></tr>';
  }

  var total = 0;
  var body = '';
  lines.forEach(function(ln){
    var precio = parseFloat(ln['P. Venta Unitario']) || 0;
    var cant   = parseInt(ln['Cantidad'], 10) || 1;
    var sub    = precio * cant;
    total += sub;
    body += '<tr style="border-top:0.5px solid #f0f0f0">'
      +'<td style="padding:6px 10px;font-family:ui-monospace,Menlo,monospace;font-size:11px">'+cevenEsc(ln['SKU']||'—')+'</td>'
      +'<td style="padding:6px 10px">'+cevenEsc(ln['Descripción']||'—')+'</td>'
      +'<td style="padding:6px 10px;text-align:center">'+cant+'</td>'
      +'<td style="padding:6px 10px;text-align:right">USD '+fI(precio)+'</td>'
      +'<td style="padding:6px 10px;text-align:right;font-weight:500">USD '+fI(sub)+'</td>'
      +'</tr>';
  });

  var qnA = cevenEsc(qn||'');
  var descuadre = Math.abs(Math.round(total) - Math.round(r.monto||0)) > 1
    ? '<span style="color:#c84e00;font-weight:500"> · la fila dice USD '+fI(r.monto||0)+': la cotización se editó después de agregarla</span>'
    : '';

  var inner = '<div style="padding:10px 14px 14px;background:#fafafa">'
    +'<div style="font-size:11px;color:#6e6e73;text-transform:uppercase;letter-spacing:.4px;margin-bottom:8px">'
      +'Artículos · cotización <span data-act="openq" data-qn="'+qnA+'" style="color:var(--acc,#0071e3);font-weight:700;cursor:pointer">#'+qnA+'</span>'
    +'</div>'
    +'<table style="width:100%;font-size:12px;border-collapse:collapse;background:#fff;border:0.5px solid #e5e5e7;border-radius:8px;overflow:hidden">'
    +'<thead><tr style="background:#f5f5f7">'
      +'<th style="text-align:left;padding:6px 10px;font-size:11px;color:#6e6e73">SKU</th>'
      +'<th style="text-align:left;padding:6px 10px;font-size:11px;color:#6e6e73">Descripción</th>'
      +'<th style="text-align:center;padding:6px 10px;font-size:11px;color:#6e6e73">Cant.</th>'
      +'<th style="text-align:right;padding:6px 10px;font-size:11px;color:#6e6e73">P. unitario</th>'
      +'<th style="text-align:right;padding:6px 10px;font-size:11px;color:#6e6e73">Subtotal</th>'
    +'</tr></thead><tbody>'+body+'</tbody>'
    +'<tfoot><tr style="background:#f5f5f7;border-top:0.5px solid #e5e5e7">'
      +'<td colspan="4" style="padding:6px 10px;text-align:right;font-size:11px;color:#6e6e73">Total de la cotización'+descuadre+'</td>'
      +'<td style="padding:6px 10px;text-align:right;font-weight:600">USD '+fI(total)+'</td>'
    +'</tr></tfoot></table></div>';
  return '<tr class="pipe-detail"><td colspan="8" style="padding:0;background:#fafafa">'+inner+'</td></tr>';
}

function buildPipelineWorkbook(){
  var pipe = cevenPipeFilasVisibles();
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
      'Ejecutivo': r.ejecutivo,
      'Cliente': r.cliente,
      'Proyecto': r.proyecto || '',
      'Cotización': r.qNum || '',
      'Cierre estimado': mesLabel,
      'Estado': cevenEstadoLabel(r.estado || 'Cotizado'),
      'Monto USD': r.monto
    };
  });
  var ws = XLSX.utils.json_to_sheet(data);
  ws['!cols'] = [{wch:11},{wch:18},{wch:24},{wch:26},{wch:12},{wch:14},{wch:13},{wch:14}];
  var wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Pipeline');
  return wb;
}

function exportPipeline(){
  var wb = buildPipelineWorkbook();
  if(!wb){ showToast('No hay proyectos para exportar con los filtros actuales.'); return; }
  XLSX.writeFile(wb, 'Ceven_Legamaster_Pipeline.xlsx');
}
