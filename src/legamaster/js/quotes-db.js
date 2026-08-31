// ── DB ──
// cevenLsJSON avisa por consola si el JSON esta corrupto en vez de devolver []
// en silencio. El chequeo de Array es porque un valor guardado con otra forma
// tampoco sirve como DB.
function getDB(){
  var db = cevenLsJSON(cevenK('cquotes'), []);
  return Object.prototype.toString.call(db) === '[object Array]' ? db : [];
}
function saveDB(db){
  db = db.filter(function(r){ return r['SKU'] && r['SKU'] !== 'undefined' && r['Descripción'] && r['Descripción'] !== 'undefined'; });
  var ok = cevenLsSet(cevenK('cquotes'), JSON.stringify(db));
  autoSnapshot();
  return ok;
}

// Guardar con el ejecutivo vacío deja la fila como Ejecutivo '—', y a partir de
// ahí cevenCanEditQuote('—') es false para todo el mundo menos un admin.
function cevenExecActual(){
  var el = document.getElementById('exec');
  return el ? (el.value||'').trim() : '';
}
function cevenRequireExec(){
  if(cevenExecActual()) return true;
  showToast('Elegí el Ejecutivo para poder continuar.');
  return false;
}

// Devuelve true si escribió, false si se rechazó (ejecutivo vacío / sin ítems).
function doSave(overwrite){
  if(!items.length) return false;
  if(!cevenRequireExec()) return false;
  var now=new Date();
  var date=now.toLocaleDateString('es-AR');
  var time=now.toLocaleTimeString('es-AR',{hour:'2-digit',minute:'2-digit'});
  var client=document.getElementById('client').value||'—';
  var proyecto=document.getElementById('proyecto').value||'—';
  var exec=cevenExecActual();
  var ob=document.getElementById('obs').value||'—';
  var mesC = getMesCierre();
  var estadoQ = (document.getElementById('quote-estado') && document.getElementById('quote-estado').value) || 'Cotizado';
  var _el = function(id){ var e=document.getElementById(id); return e ? e.value : ''; };
  var payMode  = cevenPayMode();
  var effDate  = _el('eff-date');
  var delivery = cevenDelivery();
  var qn=cevenQNumFmt(qNum);
  var db=getDB();
  var already=false; for(var i=0;i<db.length;i++){if(db[i]['N° Cotización']===qn){already=true;break;}}
  if(already && !overwrite) return false;
  if(already){
    if(cevenEsEdicionDe(qn)){
      db=db.filter(function(r){return r['N° Cotización']!==qn;});
    } else {
      qNum = cevenReservarQNum();
      var qnViejo = qn;
      qn = cevenQNumFmt(qNum);
      cevenPintarQNum();
      showToast('El número #'+qnViejo+' ya lo usó otra cotización del equipo. Esta se guardó como #'+qn+'.');
    }
  }
  cevenAnotarQNum(qNum);
  cevenEditandoQNum(qn);
  for(var j=0;j<items.length;j++){
    var it=items[j];
    var sp = (it.salePrice===''||it.salePrice==null) ? 0 : it.salePrice;
    db.push(cevenOpcSellarFila({'N° Cotización':qn,'Fecha':date,'Hora':time,'Cliente':client,'Proyecto':proyecto,'Ejecutivo':exec,'Observaciones':ob,'Mes Cierre':mesC,'Condición de pago':payMode,'Propuesta efectiva hasta':effDate,'Entrega':delivery,'Nivel de precio':(typeof tierDeLinea==='function'?tierDeLinea(it):''),'SKU':it.sku,'Descripción':it.description,'Cantidad':it.qty,'Nota':it.stock||'—','IVA':cevenFormatoIVA(it.iva),'P. Venta Unitario':it.salePrice,'Total':sp*it.qty,'Tipo':'producto','_estado':estadoQ}, it));
  }
  saveDB(db);
  if(typeof cevenClienteSet === 'function'){
    var _tg2 = document.getElementById('tier-global');
    if(_tg2 && _tg2.value && client && client !== '—') cevenClienteSet(client, {tier: _tg2.value});
  }
  return true;
}

function saveQuote(){
  if(!items.length){showToast('La cotización está vacía.');return;}
  if(!doSave(true)) return;
  showToast('✓ Cotización #'+String(qNum).padStart(4,'0')+' guardada.');
}

function _snapshotQuoteState(){
  return {
    qNum: qNum,
    opc: cevenOpcEstado(),
    items: JSON.parse(JSON.stringify(items)),
    client: document.getElementById('client').value,
    proyecto: document.getElementById('proyecto').value,
    tier: (document.getElementById('tier-global')||{}).value,
    exec: document.getElementById('exec').value,
    mesCierre: getMesCierre(),
    estado: document.getElementById('quote-estado') ? document.getElementById('quote-estado').value : 'Cotizado',
    obs: document.getElementById('obs').value,
    effDate: document.getElementById('eff-date').value,
    payMode: cevenPayMode(),
    delivery: cevenDelivery()
  };
}
function _setExecValue(nombre){
  var sel = document.getElementById('exec');
  if(!sel) return;
  if(nombre && typeof cevenEnsureExecOption === 'function') cevenEnsureExecOption(sel, nombre);
  sel.value = nombre || '';
}

function _restoreQuoteState(snap){
  qNum = snap.qNum;
  cevenPintarQNum();
  items = snap.items;
  cevenOpcEstadoSet(snap.opc);
  document.getElementById('client').value = snap.client;
  document.getElementById('proyecto').value = snap.proyecto;
  if(document.getElementById('tier-global')) document.getElementById('tier-global').value = snap.tier||'';
  _setExecValue(snap.exec);
  if(document.getElementById('mes-cierre-mY')) setMesCierre(snap.mesCierre);
  if(document.getElementById('quote-estado')) document.getElementById('quote-estado').value = snap.estado;
  document.getElementById('obs').value = snap.obs;
  document.getElementById('eff-date').value = snap.effDate;
  cevenSetPayMode(snap.payMode);
  cevenSetDelivery(snap.delivery);
  _qSortKey = null; _qSortDir = 1;
  renderQ();
}

function nuevaCotizacion(){
  var hadItems = items.length > 0;
  var snap = hadItems ? _snapshotQuoteState() : null;
  qNum = cevenReservarQNum();
  cevenPintarQNum();
  cevenEditandoQNum(null);
  items = [];
  cevenOpcReset();
  document.getElementById('client').value = '';
  document.getElementById('proyecto').value = '';
  if(document.getElementById('tier-global')) document.getElementById('tier-global').value = '';
  if(document.getElementById('mes-cierre-mY')) setMesCierre('');
  if(document.getElementById('quote-estado')) document.getElementById('quote-estado').value = 'Cotizado';
  if(typeof refreshExecOptions === 'function') refreshExecOptions();
  _setExecValue('');
  document.getElementById('obs').value = '';
  var d2 = new Date(); d2.setDate(d2.getDate()+15);
  var yyyy2=d2.getFullYear(), mm2=String(d2.getMonth()+1).padStart(2,'0'), dd2=String(d2.getDate()).padStart(2,'0');
  document.getElementById('eff-date').value = yyyy2+'-'+mm2+'-'+dd2;
  cevenSetDelivery('');
  cevenApplyVendorAutofill();
  renderQ();
  if(hadItems){
    notifyUndo('Empezaste una cotización nueva — se descartó lo que tenías sin guardar.', function(){ _restoreQuoteState(snap); });
  }
}

// Crea una cotización NUEVA copiando la que está cargada actualmente.
function copiarCotizacion(){
  if(!items.length){ showToast('La cotización está vacía, no hay nada para copiar.'); return; }
  if(!cevenRequireExec()) return;
  var snap = _snapshotQuoteState();
  qNum = cevenReservarQNum();
  cevenPintarQNum();
  cevenEditandoQNum(null);
  items = items.map(function(it){ return Object.assign({}, it, { id: Date.now() + Math.random() }); });
  renderQ();
  doSave(true);
  var copiaQn = String(qNum).padStart(4,'0');
  notifyUndo('✓ Copia creada como Cotización #' + copiaQn + '.', function(){
    saveDB(getDB().filter(function(r){ return r['N° Cotización'] !== copiaQn; }));
    _restoreQuoteState(snap);
  });
}

// Duplica una cotización del historial como una NUEVA (nuevo número, fecha de hoy).
function copiarCotizacionHist(qn){
  var db=getDB();
  var rows=db.filter(function(r){return r['N° Cotización']===qn;});
  if(!rows.length){ showToast('No se encontró la cotización #'+qn+'.'); return; }
  var snap = _snapshotQuoteState();
  var newQn = cevenQNumFmt(cevenReservarQNum());
  db = db.filter(function(r){ return r['N° Cotización'] !== newQn; });
  var now=new Date();
  var date=now.toLocaleDateString('es-AR');
  var time=now.toLocaleTimeString('es-AR',{hour:'2-digit',minute:'2-digit'});
  var myNombre = cevenMyNombre();
  var isAdmin = cevenIsAdmin();
  rows.forEach(function(r){
    var c=Object.assign({}, r);
    c['N° Cotización']=newQn;
    c['Fecha']=date;
    c['Hora']=time;
    if(!isAdmin && myNombre) c['Ejecutivo']=myNombre;
    db.push(c);
  });
  saveDB(db);
  editQuoteFromHistory(newQn, true);
  notifyUndo('✓ Copia creada como Cotización #'+newQn+'.', function(){
    saveDB(getDB().filter(function(r){ return r['N° Cotización'] !== newQn; }));
    _restoreQuoteState(snap);
    if(typeof renderHistory === 'function') renderHistory();
  });
}

function editQuoteFromHistory(qn, skipUndoToast){
  var db=getDB();
  var rows=db.filter(function(r){return r['N° Cotización']===qn;});
  if(!rows.length) return;
  var first=rows[0];
  if(!cevenCanEditQuote(first['Ejecutivo'])){ showToast('No tenés permiso para editar esta cotización.'); return; }
  var hadItems = items.length > 0;
  var snap = hadItems ? _snapshotQuoteState() : null;
  qNum = parseInt(qn, 10);
  cevenPintarQNum();
  cevenEditandoQNum(qn);
  document.getElementById('client').value = first['Cliente']!=='—'?first['Cliente']:'';
  document.getElementById('proyecto').value = first['Proyecto']!=='—'?(first['Proyecto']||''):'';
  if(document.getElementById('mes-cierre-mY')) setMesCierre(first['Mes Cierre']||'');
  _setExecValue(first['Ejecutivo']!=='—'?first['Ejecutivo']:'');
  document.getElementById('obs').value    = first['Observaciones']!=='—'?first['Observaciones']:'';
  (function(){
    if(first['Condición de pago']) cevenSetPayMode(first['Condición de pago']);
    var ed = document.getElementById('eff-date');
    if(ed && first['Propuesta efectiva hasta'] && first['Propuesta efectiva hasta'] !== '—') ed.value = first['Propuesta efectiva hasta'];
    cevenSetDelivery((first['Entrega'] && first['Entrega'] !== '—') ? first['Entrega'] : '');
  })();
  /* El nivel global de la cotizacion guardada: el mas frecuente entre sus
     lineas. No se guarda aparte a proposito. */
  var _tg = document.getElementById('tier-global');
  if(_tg){
    var _cnt = {}, _mejor = '', _max = 0;
    rows.forEach(function(r){
      var t = r['Nivel de precio'];
      if(!t || t === 'MANUAL') return;
      _cnt[t] = (_cnt[t]||0) + 1;
      if(_cnt[t] > _max){ _max = _cnt[t]; _mejor = t; }
    });
    _tg.value = _mejor;
  }
  if(document.getElementById('quote-estado')){
    var _estLoad='Cotizado';
    for(var _ri=0;_ri<rows.length;_ri++){ if(rows[_ri]['_estado']){ _estLoad=rows[_ri]['_estado']; break; } }
    document.getElementById('quote-estado').value = _estLoad;
  }
  items=[];
  cevenOpcCargarDeFilas(rows);
  rows.forEach(function(r){
    var sp = r['P. Venta Unitario'];
    sp = (sp===''||sp===null||sp===undefined) ? '' : parseFloat(sp);
    items.push({
      id: Date.now() + Math.random(),
      sku: r['SKU'] || '',
      description: r['Descripción'] || '',
      salePrice: sp,
      qty: parseInt(r['Cantidad']) || 1,
      stock: r['Nota'] !== '—' ? (r['Nota']||'') : '',
      iva: r['IVA'] || '',
      tier: (function(){
        var t = r['Nivel de precio'] || '';
        return (t && _tg && t === _tg.value) ? '' : t;
      })(),
      opc: cevenOpcDe(r)
    });
  });
  _qSortKey = null; _qSortDir = 1;
  renderQ();
  goTo('quote');
  if(hadItems && !skipUndoToast){
    notifyUndo('Cargaste la cotización #'+qn+' — se reemplazó lo que tenías sin guardar.', function(){ _restoreQuoteState(snap); goTo('quote'); });
  }
}

function exportDB(){
  var db=getDB(); if(!db.length){showToast('No hay cotizaciones guardadas.');return;}
  var heads=COLS.slice();
  var data=db.map(function(r){var o={};for(var i=0;i<COLS.length;i++){var k=COLS[i];o[k]=r[k]!==undefined?r[k]:'';}return o;});
  var ws=XLSX.utils.json_to_sheet(data,{header:heads});
  // Un ancho por columna de COLS, en el mismo orden (una menos que Poly: sin OPG).
  ws['!cols']=[{wch:12},{wch:12},{wch:8},{wch:22},{wch:20},{wch:18},{wch:28},{wch:12},
               {wch:18},{wch:20},{wch:18},{wch:18},{wch:8},{wch:16},{wch:36},{wch:10},{wch:16},{wch:8},{wch:14},{wch:14}];
  var wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,'Cotizaciones');
  XLSX.writeFile(wb,'Ceven_Legamaster_Cotizaciones.xlsx');
}
