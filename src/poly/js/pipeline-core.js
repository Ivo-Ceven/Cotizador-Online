
function _normOpg(s){ return (s||'').trim().toLowerCase(); }

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

// Agrega la cotización actual (una Sala) al pipeline. Si tiene OPG, la fila de
// pipeline es por OPG: varias Salas del mismo OPG se mergean en una sola fila
// (decisión explícita del usuario — un OPG es un único deal con precio especial).
// El OPG es OPCIONAL (no todas las cotizaciones tienen uno asignado por la marca):
// sin OPG, cada cotización es su propia fila, igual que en Apple.
function addToPipeline(){
  if(!cevenCanUsePipeline()){ showToast('Tu rol no permite agregar al pipeline.'); return; }
  if(!items.length){ showToast('La cotización está vacía.'); return; }
  var client = (document.getElementById('client').value||'').trim();
  var opg    = (document.getElementById('opg').value||'').trim();
  var sala   = (document.getElementById('sala').value||'').trim();
  if(!client){ showToast('Cargá el nombre del cliente antes de agregar al pipeline.'); return; }
  if(!sala){ showToast('Cargá el proyecto (cliente final) antes de agregar al pipeline.'); return; }
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
  var salaEntry = {qNum: qn, sala: sala, monto: monto, fecha: fecha};

  var pipe = getPipeline();
  var key = opg ? _normOpg(opg) : null;
  var idx = -1;
  if(key){
    for(var p=0;p<pipe.length;p++){ if(_normOpg(pipe[p].opg) === key){ idx = p; break; } }
  } else {
    // Sin OPG: no hay merge — buscar si ESTA MISMA cotización (mismo qNum) ya
    // está cargada como fila propia, para actualizarla en vez de duplicarla.
    for(var p2=0;p2<pipe.length;p2++){
      if(!pipe[p2].opg && (pipe[p2].salas||[]).some(function(s){ return s.qNum===qn; })){ idx = p2; break; }
    }
  }

  // Nunca se bloquea con un confirm(): la acción se aplica siempre, y para los
  // casos ambiguos (¿renombraste la Sala o te olvidaste de "Nueva cotización"?)
  // se avisa con un cartel que permite deshacer, en vez de preguntar antes.
  var newRowId = null, warnMsg = null;

  if(idx < 0){
    newRowId = Date.now();
    pipe.push({
      id: newRowId, fecha: fecha, fechaISO: now.toISOString(),
      opg: opg || null, cliente: client, ejecutivo: exec || '—', mesCierre: mesCierre || '',
      estado: estadoQ, monto: monto, moneda: 'USD',
      salas: [salaEntry], factura: null
    });
  } else {
    var row = pipe[idx];
    if(!row.salas) row.salas = [];
    if(typeof pushPipeUndo === 'function') pushPipeUndo(row.id); // snapshot antes de mutar
    var salaIdxByQn = -1, salaIdxByName = -1;
    for(var s=0;s<row.salas.length;s++){
      if(row.salas[s].qNum === qn) salaIdxByQn = s;
      if(_normOpg(row.salas[s].sala) === _normOpg(sala)) salaIdxByName = s;
    }
    if(salaIdxByQn >= 0){
      var prevSala = row.salas[salaIdxByQn];
      if(_normOpg(prevSala.sala) !== _normOpg(sala)){
        // Misma cotización (#qn) pero el nombre de Sala cambió desde la última vez
        // que se agregó — lo más probable es que se haya empezado una Sala nueva
        // SIN tocar "➕ Nueva cotización" primero. Se actualiza igual (nunca se
        // pierde el clic), pero se avisa con opción de deshacer.
        warnMsg = 'Actualizaste la cotización #'+qn+': el proyecto pasó de "'+prevSala.sala+'" a "'+sala+'". Si en realidad es un proyecto nuevo, deshacé y usá "＋ Nueva" antes de cargarlo.';
      }
      row.salas[salaIdxByQn] = salaEntry;
    } else if(salaIdxByName >= 0){
      // Nombre de Sala repetido pero cotización distinta: se agrega igual como
      // entrada aparte (nunca se descarta un clic) — solo se avisa por las dudas.
      var otherQn = row.salas[salaIdxByName].qNum;
      warnMsg = 'Ojo: ya había un proyecto llamado "'+sala+'" en este OPG (cotización #'+otherQn+') — se agregó como entrada aparte.';
      row.salas.push(salaEntry);
    } else {
      row.salas.push(salaEntry);
    }
    row.monto = Math.round(row.salas.reduce(function(acc,x){ return acc + (x.monto||0); }, 0));
    row.cliente   = client;
    row.ejecutivo = exec || row.ejecutivo;
    row.mesCierre = mesCierre || row.mesCierre;
    // estado / id / factura de la fila NO se pisan al mergear una Sala nueva.
  }

  savePipeline(pipe);
  doSave(true);
  refreshOpgDatalist();
  if(newRowId !== null && typeof pushPipeUndoInsert === 'function') pushPipeUndoInsert(newRowId);

  var msg = warnMsg || ('✓ Agregada al pipeline: ' + (opg ? ('OPG '+opg+' / ') : '') + sala);
  notifyUndo(msg, function(){ if(typeof undoPipelineChange === 'function') undoPipelineChange(); });
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
