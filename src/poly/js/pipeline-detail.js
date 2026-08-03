/* togglePipelineRow(id) se fue con el direccionamiento por índice: ahora abrir y
   cerrar lo hace togglePipeNode(clave), en shared/pipeline-group.js, que sirve
   igual para un grupo de cliente que para una fila. */

// ── Factura del proyecto, se completa post-hoc (análogo al OV Link de Apple) ──
function editFactura(id){
  var pipe = getPipeline();
  var idx = -1;
  for(var i=0;i<pipe.length;i++){ if(pipe[i].id === id){ idx = i; break; } }
  if(idx < 0) return;
  if(!cevenCanEditPipelineRow(pipe[idx].ejecutivo)){ showToast('No tenés permiso para modificar este proyecto: es de otro ejecutivo.'); return; }
  var current = pipe[idx].factura || '';
  promptModal(current ? 'Editar número de factura' : 'Número de factura de este proyecto', current, function(val){
    val = (val||'').trim();
    if(val === current) return;
    if(typeof pushPipeUndo === 'function') pushPipeUndo(id);
    var pipe2 = getPipeline();
    for(var i=0;i<pipe2.length;i++){ if(pipe2[i].id === id){ pipe2[i].factura = val === '' ? null : val; break; } }
    savePipeline(pipe2);
    renderPipeline();
    notifyUndo(val ? ('✓ Factura actualizada: '+val) : '✓ Factura quitada', function(){ if(typeof undoPipelineChange==='function') undoPipelineChange(); });
  }, {okLabel:'Guardar'});
}

function updatePipelineStatus(id, newStatus){
  var pipe = getPipeline();
  var row = pipe.find(function(r){ return r.id === id; });
  if(row && !cevenCanEditPipelineRow(row.ejecutivo)){ showToast('No tenés permiso para modificar este proyecto: es de otro ejecutivo.'); return; }
  if(typeof pushPipeUndo === 'function') pushPipeUndo(id);
  for(var i=0;i<pipe.length;i++){ if(pipe[i].id === id){ pipe[i].estado = newStatus; break; } }
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

/* removeSalaFromPipeline() vivía acá y se fue con el modelo de OPG: no hay más
   sub-filas que quitar, así que quitar un proyecto es removePipeline(id). */

function openPipelineQuote(qn){
  var db = getDB();
  var rows = db.filter(function(r){ return r['N° Cotización'] === qn; });
  if(!rows.length){ showToast('No se encontró la cotización #'+qn+' en el historial.'); return; }
  editQuoteFromHistory(qn);
}

/* Fila expandible: los ARTÍCULOS de la cotización del proyecto, con sus precios.

   Antes listaba las salas del OPG; con el modelo por proyecto eso ya no existe y
   el nivel que falta es el de abajo, que es el que nadie podía ver desde el
   pipeline (había que abrir el historial).

   `db` viene de renderPipeline(): getDB() hace JSON.parse de varios MB y el poll
   redibuja cada 15 s, así que se parsea UNA vez por render y se pasa hacia
   abajo. Si no viene, se lee acá (el archivo lo llama sin db). */
function renderPipelineDetailRow(r, idx, db){
  if(!db) db = getDB();
  var qn = r.qNum;
  var lines = db.filter(function(x){ return x['N° Cotización'] === qn; });

  if(!lines.length){
    /* La cotización puede haberse borrado del historial y la fila del pipeline
       sobrevive: decirlo es mejor que mostrar una tabla vacía. */
    return '<tr class="pipe-detail"><td colspan="9" style="padding:14px 18px;background:#fafafa;color:#aeaeb2;font-size:12px">'
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
  /* El total de los artículos puede no coincidir con el monto de la fila: el
     monto es una foto del momento de agregar al pipeline y la cotización pudo
     editarse después. Cuando difieren se avisa, en vez de dejar dos números
     distintos en pantalla sin explicación. */
  var descuadre = Math.abs(Math.round(total) - Math.round(r.monto||0)) > 1
    ? '<span style="color:#c84e00;font-weight:500"> · la fila dice USD '+fI(r.monto||0)+': la cotización se editó después de agregarla</span>'
    : '';

  var inner = '<div style="padding:10px 14px 14px;background:#fafafa">'
    +'<div style="font-size:11px;color:#6e6e73;text-transform:uppercase;letter-spacing:.4px;margin-bottom:8px">'
      +'Artículos · cotización <span data-act="openq" data-qn="'+qnA+'" style="color:var(--acc,#0071e3);font-weight:700;cursor:pointer">#'+qnA+'</span>'
      +(r.opg ? ' · OPG '+cevenEsc(r.opg) : '')
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
  return '<tr class="pipe-detail"><td colspan="9" style="padding:0;background:#fafafa">'+inner+'</td></tr>';
}

function buildPipelineWorkbook(){
  /* Exporta LO QUE ESTÁ EN PANTALLA, no `getPipeline()` entero: antes ignoraba
     los filtros y la vista de mes archivado, así que "⬇ Excel" sobre un pipeline
     filtrado bajaba igual todo. Las filas son las que dejó el último render
     (window._pipeNodes), en el mismo orden y agrupadas por cliente. */
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
    /* Mismo orden que la tabla en pantalla. La columna se llamaba "Proyectos" y
       traía un NÚMERO (cuántas salas tenía el OPG) mientras la tabla mostraba un
       NOMBRE bajo el encabezado "Proyecto": el mismo concepto con dos contenidos
       incompatibles. Ahora es el nombre, como en pantalla. */
    return {
      'Fecha': r.fecha,
      'Ejecutivo': r.ejecutivo,
      'Cliente': r.cliente,
      'OPG': r.opg || '',
      'Proyecto': r.proyecto || '',
      'Cotización': r.qNum || '',
      'Cierre estimado': mesLabel,
      'Estado': cevenEstadoLabel(r.estado || 'Cotizado'),
      'Monto USD': r.monto,
      'Factura': r.factura || ''
    };
  });
  var ws = XLSX.utils.json_to_sheet(data);
  ws['!cols'] = [{wch:11},{wch:18},{wch:24},{wch:14},{wch:26},{wch:12},{wch:14},{wch:13},{wch:14},{wch:16}];
  var wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Pipeline');
  return wb;
}

function exportPipeline(){
  var wb = buildPipelineWorkbook();
  if(!wb){ showToast('No hay proyectos para exportar con los filtros actuales.'); return; }
  XLSX.writeFile(wb, 'Ceven_Poly_Pipeline.xlsx');
}
