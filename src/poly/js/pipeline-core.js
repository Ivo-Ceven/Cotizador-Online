
// Actualiza el <datalist> del campo OPG con los valores ya usados en el pipeline,
// para reducir el riesgo de que un typo cree un OPG "duplicado" por error.
function refreshOpgDatalist(){
  var dl = document.getElementById('opg-datalist');
  if(!dl) return;
  var opgs = [], seen = {};
  getPipeline().forEach(function(r){
    var o = (r.opg||'').trim();
    if(o && !seen[o]){ seen[o]=1; opgs.push(o); }
  });
  dl.innerHTML = opgs.map(function(o){ return '<option value="'+cevenEsc(o)+'">'; }).join('');
}

/* Agrega la cotización actual al pipeline como UN PROYECTO.

   Hasta 07/2026 la fila era un OPG y varias cotizaciones del mismo OPG se
   mergeaban adentro, en un array `salas[]`. Eso traía dos problemas que el
   usuario veía: el estado y la factura eran del OPG entero (cambiarle el estado
   a un proyecto se lo cambiaba a todos sus hermanos), y como la fila destino se
   buscaba SOLO por OPG, la misma cotización podía quedar en dos filas distintas
   —su monto contado dos veces en los KPIs y repetido en el Excel—.

   Ahora el OPG es un dato informativo del proyecto y la identidad de la fila es
   el número de cotización: una cotización, una fila, siempre. */
function addToPipeline(){
  if(!cevenCanUsePipeline()){ showToast('Tu rol no permite agregar al pipeline.'); return; }
  if(!items.length){ showToast('La cotización está vacía.'); return; }
  var client   = (document.getElementById('client').value||'').trim();
  var opg      = (document.getElementById('opg').value||'').trim();
  var proyecto = (document.getElementById('proyecto').value||'').trim();
  if(!client){ showToast('Cargá el nombre del cliente antes de agregar al pipeline.'); return; }
  if(!proyecto){ showToast('Cargá el proyecto (cliente final) antes de agregar al pipeline.'); return; }
  // Sin ejecutivo la fila queda con ejecutivo '—' y cevenCanEditPipelineRow('—')
  // le niega la edición al propio autor. Se corta antes de tocar el pipeline.
  if(!cevenRequireExec()) return;

  var exec      = cevenExecActual();
  var mesCierre = getMesCierre();
  var estadoQ   = (document.getElementById('quote-estado') && document.getElementById('quote-estado').value) || 'Cotizado';
  var qn        = String(qNum).padStart(4,'0');

  var monto = 0;
  for(var i=0;i<items.length;i++){ monto += (items[i].salePrice||0) * (items[i].qty||1); }
  monto = Math.round(monto);

  var now = new Date();
  var fecha = now.toLocaleDateString('es-AR');

  var pipe = getPipeline();
  var idx = -1;
  for(var p=0;p<pipe.length;p++){ if(pipe[p].qNum === qn){ idx = p; break; } }

  // Nunca se bloquea con un confirm(): la acción se aplica siempre y, cuando el
  // caso es ambiguo, se avisa con un cartel que permite deshacer.
  var newRowId = null, warnMsg = null;

  if(idx < 0){
    newRowId = cevenNuevoIdFila();
    pipe.push({
      id: newRowId, fecha: fecha, fechaISO: now.toISOString(), qNum: qn,
      cliente: client, proyecto: proyecto, opg: opg || null,
      ejecutivo: exec || '—', mesCierre: mesCierre || '',
      estado: estadoQ, monto: monto, moneda: 'USD', factura: null
    });
  } else {
    var row = pipe[idx];
    if(typeof pushPipeUndo === 'function') pushPipeUndo(row.id); // snapshot antes de mutar
    /* Cambiar el nombre del proyecto sobre una cotización ya cargada suele
       significar que se empezó un proyecto nuevo SIN tocar "＋ Nueva": se aplica
       igual (nunca se pierde el clic), pero se avisa con opción de deshacer. */
    if((row.proyecto||'').trim().toLowerCase() !== proyecto.toLowerCase()){
      warnMsg = 'Actualizaste la cotización #'+qn+': el proyecto pasó de "'+(row.proyecto||'—')+'" a "'+proyecto+'". Si en realidad es un proyecto nuevo, deshacé y usá "＋ Nueva" antes de cargarlo.';
    }
    row.proyecto  = proyecto;
    row.cliente   = client;
    row.opg       = opg || null;
    row.monto     = monto;
    row.ejecutivo = exec || row.ejecutivo;
    row.mesCierre = mesCierre || row.mesCierre;
    // estado / id / factura (hoy el link de Netsuite) NO se pisan: son
    // seguimiento del proyecto, no datos de la cotización.
  }

  savePipeline(pipe);
  doSave(true);
  refreshOpgDatalist();
  if(newRowId !== null && typeof pushPipeUndoInsert === 'function') pushPipeUndoInsert(newRowId);

  var msg = warnMsg || ('✓ Agregado al pipeline: ' + proyecto + (opg ? (' (OPG '+opg+')') : ''));
  notifyUndo(msg, function(){ if(typeof undoPipelineChange === 'function') undoPipelineChange(); });
}

/* Id de fila de pipeline. `Date.now()` a secas colisiona entre dos usuarios que
   agregan en el mismo milisegundo, y la PK en Supabase es (brand, id): el upsert
   pisa una fila con la otra. El sufijo aleatorio lo vuelve improbable.

   Tiene que quedar ENTERO: la columna es bigint y `id` está en numCols, así que
   el `Date.now()+Math.random()` que usa catalog.js para ids locales no sirve
   acá. 1.7e15 queda holgado bajo Number.MAX_SAFE_INTEGER (9.0e15). */
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
