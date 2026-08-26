
/* Agrega la cotización actual al pipeline como UN PROYECTO.

   Mismo modelo que Poly desde 08/2026: la identidad de la fila es el número de
   cotización, no un agrupador externo — una cotización, una fila, siempre.
   Sin campo OPG (ver brand.js: este catálogo no trae un número de precio
   especial de fábrica que documentar por proyecto). */
/* El monto de una fila del pipeline a partir de un juego de líneas. La cuenta
   vive en `pricing-core.js`, sin DOM: la usan también el cambio de opción
   vigente y la emisión del cotizador multimarca, y tienen que dar exactamente
   lo mismo o la fila muestra un total que la cotización no dice. */
function _pipeMontoDeItems(its){ return cevenLegamasterMonto(its); }

/* Cambia la opción vigente de una cotización desde su fila del pipeline, sin
   reabrirla. El monto de la fila se RECALCULA con las líneas de la opción nueva. */
function cambiarOpcionVigente(id){
  var pipe = getPipeline();
  var row = null;
  for(var i=0;i<pipe.length;i++){ if(pipe[i].id === id){ row = pipe[i]; break; } }
  if(!row) return;
  if(!cevenCanEditPipelineRow(row.ejecutivo)){ showToast('No tenés permiso para modificar este proyecto: es de otro ejecutivo.'); return; }

  var rows = getDB().filter(function(r){ return r['N° Cotización'] === row.qNum; });
  if(!rows.length){ showToast('No se encontró la cotización #'+row.qNum+' en el historial.'); return; }
  if(!cevenOpcHayBEnFilas(rows)){ showToast('La cotización #'+row.qNum+' tiene una sola opción.'); return; }

  var previa = cevenOpcEfectivaDeFilas(rows);
  var nueva  = (previa === 1) ? 2 : 1;
  var lineas = rows.filter(function(r){ return r['Tipo'] === 'producto' && cevenOpcDe(r) === nueva; })
                   .map(function(r){
                     return {qty: parseInt(r['Cantidad'],10)||1, salePrice: parseFloat(r['P. Venta Unitario'])||0};
                   });
  if(!lineas.length){ showToast('La Opción '+cevenOpcLetra(nueva)+' de la #'+row.qNum+' no tiene líneas.'); return; }
  if(!cevenOpcFijarEnDB(row.qNum, nueva)) return;

  if(typeof pushPipeUndo === 'function') pushPipeUndo(id);
  row.monto = _pipeMontoDeItems(lineas);
  savePipeline(pipe);
  renderPipeline();
  notifyUndo('Cotización #'+row.qNum+': ahora suma la Opción '+cevenOpcLetra(nueva)+' — USD '+fI(row.monto)+'.', function(){
    cevenOpcFijarEnDB(row.qNum, previa);
    if(typeof undoPipelineChange === 'function') undoPipelineChange();
  });
}

function addToPipeline(){
  if(!cevenCanUsePipeline()){ showToast('Tu rol no permite agregar al pipeline.'); return; }
  if(!items.length){ showToast('La cotización está vacía.'); return; }
  var _ef = cevenOpcEfectiva();
  if(!cevenOpcFiltrar(items, _ef).length){
    showToast('La Opción '+cevenOpcLetra(_ef)+' es la vigente y está vacía: cargale productos o marcá la otra como vigente.');
    return;
  }
  var client   = (document.getElementById('client').value||'').trim();
  var clienteId = (typeof cevenClienteIdParaNombre === 'function') ? cevenClienteIdParaNombre(client) : null;
  var proyecto = (document.getElementById('proyecto').value||'').trim();
  if(!client){ showToast('Cargá el nombre del cliente antes de agregar al pipeline.'); return; }
  if(!proyecto){ showToast('Cargá el proyecto (cliente final) antes de agregar al pipeline.'); return; }
  if(!cevenRequireExec()) return;

  var exec      = cevenExecActual();
  var mesCierre = getMesCierre();
  var estadoQ   = (document.getElementById('quote-estado') && document.getElementById('quote-estado').value) || 'Cotizado';
  var qn        = String(qNum).padStart(4,'0');

  var monto = _pipeMontoDeItems(cevenOpcFiltrar(items, _ef));

  var now = new Date();
  var fecha = now.toLocaleDateString('es-AR');

  var pipe = getPipeline();
  var idx = -1;
  for(var p=0;p<pipe.length;p++){ if(pipe[p].qNum === qn){ idx = p; break; } }

  var newRowId = null, warnMsg = null;

  if(idx < 0){
    newRowId = cevenNuevoIdFila();
    pipe.push({
      id: newRowId, fecha: fecha, fechaISO: now.toISOString(), qNum: qn,
      cliente: client, clienteId: clienteId, proyecto: proyecto,
      ejecutivo: exec || '—', mesCierre: mesCierre || '',
      estado: estadoQ, monto: monto, moneda: 'USD'
    });
  } else {
    var row = pipe[idx];
    if(typeof pushPipeUndo === 'function') pushPipeUndo(row.id);
    if((row.proyecto||'').trim().toLowerCase() !== proyecto.toLowerCase()){
      warnMsg = 'Actualizaste la cotización #'+qn+': el proyecto pasó de "'+(row.proyecto||'—')+'" a "'+proyecto+'". Si en realidad es un proyecto nuevo, deshacé y usá "＋ Nueva" antes de cargarlo.';
    }
    row.proyecto  = proyecto;
    row.cliente   = client;
    if(clienteId != null) row.clienteId = clienteId;
    row.monto     = monto;
    row.ejecutivo = exec || row.ejecutivo;
    row.mesCierre = mesCierre || row.mesCierre;
    // estado / id NO se pisan: son seguimiento del proyecto, no datos de la cotización.
  }

  savePipeline(pipe);
  doSave(true);
  if(newRowId !== null && typeof pushPipeUndoInsert === 'function') pushPipeUndoInsert(newRowId);

  var msg = warnMsg || ('✓ Agregado al pipeline: ' + proyecto);
  notifyUndo(msg, function(){ if(typeof undoPipelineChange === 'function') undoPipelineChange(); });
}

/* Id de fila de pipeline. `Date.now()` a secas colisiona entre dos usuarios que
   agregan en el mismo milisegundo, y la PK en Supabase es (brand, id). El sufijo
   aleatorio lo vuelve improbable — ver poly/js/pipeline-core.js. */
function cevenNuevoIdFila(){
  return Date.now() * 1000 + Math.floor(Math.random() * 1000);
}

function clearPipelineFilters(){
  var ids = ['pipe-search','pipe-exec','pipe-status','archive-month-sel'];
  ids.forEach(function(id){
    var el = document.getElementById(id);
    if(el) el.value = '';
  });
  window._pipeStatusFilters = [];
  window._pipeMonthFilter = '';
  renderPipeline();
}
