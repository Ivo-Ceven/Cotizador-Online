
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
  dl.innerHTML = opgs.map(function(o){ return '<option value="'+o.replace(/"/g,'&quot;')+'">'; }).join('');
}

// Agrega la cotización actual (una Sala) al pipeline. A diferencia de Apple (1 cotización =
// 1 fila), acá la fila de pipeline es por OPG: varias Salas del mismo OPG se mergean en una
// sola fila (decisión explícita del usuario — un OPG es un único deal con precio especial).
function addToPipeline(){
  if(!cevenCanUsePipeline()){ alert('Tu rol no permite agregar al pipeline.'); return; }
  if(!items.length){ alert('La cotización está vacía.'); return; }
  var client = (document.getElementById('client').value||'').trim();
  var opg    = (document.getElementById('opg').value||'').trim();
  var sala   = (document.getElementById('sala').value||'').trim();
  if(!client){ alert('Cargá el nombre del cliente antes de agregar al pipeline.'); return; }
  if(!opg){ alert('Cargá el número de OPG antes de agregar al pipeline.'); return; }
  if(!sala){ alert('Cargá la Sala/ubicación antes de agregar al pipeline.'); return; }

  var exec      = document.getElementById('exec').value || '';
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
  var key = _normOpg(opg);
  var idx = -1;
  for(var p=0;p<pipe.length;p++){ if(_normOpg(pipe[p].opg) === key){ idx = p; break; } }

  if(idx < 0){
    pipe.push({
      id: Date.now(), fecha: fecha, fechaISO: now.toISOString(),
      opg: opg, cliente: client, ejecutivo: exec || '—', mesCierre: mesCierre || '',
      estado: estadoQ, monto: monto, moneda: 'USD',
      salas: [salaEntry], factura: null
    });
  } else {
    var row = pipe[idx];
    if(!row.salas) row.salas = [];
    var salaIdxByQn = -1, salaIdxByName = -1;
    for(var s=0;s<row.salas.length;s++){
      if(row.salas[s].qNum === qn) salaIdxByQn = s;
      if(_normOpg(row.salas[s].sala) === _normOpg(sala)) salaIdxByName = s;
    }
    if(salaIdxByQn >= 0){
      // Misma cotización que ya estaba: actualizar in-place (no duplica).
      row.salas[salaIdxByQn] = salaEntry;
    } else if(salaIdxByName >= 0){
      // Nombre de Sala repetido pero cotización distinta: probablemente se
      // duplicó en vez de editar — confirmar para no sumar el monto dos veces.
      var otherQn = row.salas[salaIdxByName].qNum;
      if(confirm('Ya existe una Sala llamada "'+sala+'" en el OPG "'+row.opg+'" (cotización #'+otherQn+').\n\n¿Reemplazarla por esta cotización #'+qn+'?\n\nAceptar = reemplazar · Cancelar = agregar como entrada nueva (si son Salas distintas con el mismo nombre)')){
        row.salas[salaIdxByName] = salaEntry;
      } else {
        row.salas.push(salaEntry);
      }
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
  showToast('✓ Agregada al pipeline: OPG ' + opg + ' / ' + sala);
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
