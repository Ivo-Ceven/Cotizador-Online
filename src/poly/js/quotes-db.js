// ── DB ──
// cevenLsJSON avisa por consola si el JSON esta corrupto en vez de devolver []
// en silencio (que se veia igual que "nunca guardaste nada"). El chequeo de
// Array es porque un valor guardado con otra forma tampoco sirve como DB.
function getDB(){
  var db = cevenLsJSON(cevenK('cquotes'), []);
  return Object.prototype.toString.call(db) === '[object Array]' ? db : [];
}
function saveDB(db){
  // Limpiar filas corruptas antes de guardar
  db = db.filter(function(r){ return r['SKU'] && r['SKU'] !== 'undefined' && r['Descripción'] && r['Descripción'] !== 'undefined'; });
  // Devuelve false si no se pudo guardar (cuota llena). Antes el setItem crudo
  // fallaba callado y la app seguia mostrando la cotizacion como guardada.
  var ok = cevenLsSet(cevenK('cquotes'), JSON.stringify(db));
  autoSnapshot();
  return ok;
}

// Guardar con el ejecutivo vacío deja la fila como Ejecutivo '—', y a partir de
// ahí cevenCanEditQuote('—') es false para todo el mundo menos un admin: ni el
// autor puede volver a tocar su cotización. Se rechaza antes de escribir.
function cevenExecActual(){
  var el = document.getElementById('exec');
  return el ? (el.value||'').trim() : '';
}
function cevenRequireExec(){
  if(cevenExecActual()) return true;
  showToast('Elegí el Ejecutivo antes de guardar.');
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
  var opg=document.getElementById('opg').value||'—';
  var sala=document.getElementById('sala').value||'—';
  var exec=cevenExecActual();
  var ob=document.getElementById('obs').value||'—';
  var mesC = getMesCierre();
  var estadoQ = (document.getElementById('quote-estado') && document.getElementById('quote-estado').value) || 'Cotizado';
  var qn=String(qNum).padStart(4,'0');
  var db=getDB();
  var already=false; for(var i=0;i<db.length;i++){if(db[i]['N° Cotización']===qn){already=true;break;}}
  if(already && !overwrite) return false;
  if(already && overwrite){
    db=db.filter(function(r){return r['N° Cotización']!==qn;});
  }
  for(var j=0;j<items.length;j++){
    var it=items[j];
    var sp = (it.salePrice===''||it.salePrice==null) ? 0 : it.salePrice;
    db.push({'N° Cotización':qn,'Fecha':date,'Hora':time,'Cliente':client,'OPG':opg,'Sala':sala,'Ejecutivo':exec,'Observaciones':ob,'Mes Cierre':mesC,'SKU':it.sku,'Descripción':it.description,'Cantidad':it.qty,'Nota':it.stock||'—','P. Venta Unitario':it.salePrice,'Total':sp*it.qty,'Tipo':'producto','_estado':estadoQ});
  }
  saveDB(db);
  return true;
}

function saveQuote(){
  if(!items.length){showToast('La cotización está vacía.');return;}
  if(!doSave(true)) return; // siempre sobreescribe al guardar manualmente
  showToast('✓ Cotización #'+String(qNum).padStart(4,'0')+' guardada.');
}

// Guarda todo lo necesario para volver a poner en pantalla la cotización que
// se está por reemplazar/descartar — usado por los botones que arrancan otra
// cotización sin pedir confirmación primero (se puede deshacer desde el cartel).
function _snapshotQuoteState(){
  return {
    qNum: qNum,
    items: JSON.parse(JSON.stringify(items)),
    client: document.getElementById('client').value,
    opg: document.getElementById('opg').value,
    sala: document.getElementById('sala').value,
    exec: document.getElementById('exec').value,
    mesCierre: getMesCierre(),
    estado: document.getElementById('quote-estado') ? document.getElementById('quote-estado').value : 'Cotizado',
    obs: document.getElementById('obs').value,
    effDate: document.getElementById('eff-date').value,
    payMode: document.getElementById('pay-mode').value,
    delivery: document.getElementById('delivery').value
  };
}
// Asigna un ejecutivo al <select>, agregando la opción si no está: sin esto,
// asignar un nombre que no figura en la lista deja el select en '' y el dato se
// pierde en silencio (cotización vieja de alguien que ya no aparece en la base).
function _setExecValue(nombre){
  var sel = document.getElementById('exec');
  if(!sel) return;
  if(nombre && typeof cevenEnsureExecOption === 'function') cevenEnsureExecOption(sel, nombre);
  sel.value = nombre || '';
}

function _restoreQuoteState(snap){
  qNum = snap.qNum;
  document.getElementById('qnum').textContent = 'Cotización #' + String(qNum).padStart(4,'0');
  items = snap.items;
  document.getElementById('client').value = snap.client;
  document.getElementById('opg').value    = snap.opg;
  document.getElementById('sala').value   = snap.sala;
  _setExecValue(snap.exec);
  if(document.getElementById('mes-cierre-mY')) setMesCierre(snap.mesCierre);
  if(document.getElementById('quote-estado')) document.getElementById('quote-estado').value = snap.estado;
  document.getElementById('obs').value = snap.obs;
  document.getElementById('eff-date').value = snap.effDate;
  document.getElementById('pay-mode').value = snap.payMode;
  document.getElementById('delivery').value = snap.delivery;
  _qSortKey = null; _qSortDir = 1;
  renderQ();
}

function nuevaCotizacion(){
  var hadItems = items.length > 0;
  var snap = hadItems ? _snapshotQuoteState() : null;
  // Incrementar número
  try { qNum = parseInt(localStorage.getItem('poly_cqc')||'0') + 1; localStorage.setItem('poly_cqc', qNum); } catch(e){}
  document.getElementById('qnum').textContent = 'Cotización #' + String(qNum).padStart(4,'0');
  // Limpiar todo
  items = [];
  document.getElementById('client').value = '';
  document.getElementById('opg').value = '';
  document.getElementById('sala').value = '';
  if(document.getElementById('mes-cierre-mY')) setMesCierre('');
  if(document.getElementById('quote-estado')) document.getElementById('quote-estado').value = 'Cotizado';
  // Refrescar la lista antes de limpiar: puede haber aparecido un ejecutivo
  // nuevo desde el último arranque (sync trae cotizaciones de otros vendedores).
  if(typeof refreshExecOptions === 'function') refreshExecOptions();
  _setExecValue('');
  document.getElementById('obs').value = '';
  // Resetear fecha efectiva a +15 días
  var d2 = new Date(); d2.setDate(d2.getDate()+15);
  var yyyy2=d2.getFullYear(), mm2=String(d2.getMonth()+1).padStart(2,'0'), dd2=String(d2.getDate()).padStart(2,'0');
  document.getElementById('eff-date').value = yyyy2+'-'+mm2+'-'+dd2;
  document.getElementById('delivery').value = '';
  cevenApplyVendorAutofill();
  renderQ();
  if(hadItems){
    notifyUndo('Empezaste una cotización nueva — se descartó lo que tenías sin guardar.', function(){ _restoreQuoteState(snap); });
  }
}

// Crea una cotización NUEVA copiando la que está cargada actualmente (mismos productos,
// cliente, OPG, ejecutivo, etc.) pero con un número de cotización nuevo. Útil para cargar
// otra Sala del mismo OPG partiendo de una lista de productos parecida.
function copiarCotizacion(){
  if(!items.length){ showToast('La cotización está vacía, no hay nada para copiar.'); return; }
  if(!cevenRequireExec()) return;
  var snap = _snapshotQuoteState();
  // Nuevo número de cotización
  try { qNum = parseInt(localStorage.getItem('poly_cqc')||'0') + 1; localStorage.setItem('poly_cqc', qNum); } catch(e){}
  document.getElementById('qnum').textContent = 'Cotización #' + String(qNum).padStart(4,'0');
  // Clonar productos (ids nuevos para los items)
  items = items.map(function(it){ return Object.assign({}, it, { id: Date.now() + Math.random() }); });
  // El resto de los campos (cliente, OPG, sala, ejecutivo, observaciones, mes, estado, fecha
  // efectiva, entrega) se mantienen tal cual están en pantalla → ya forman parte de la copia.
  renderQ();
  doSave(true); // persistir la copia como cotización nueva
  var copiaQn = String(qNum).padStart(4,'0');
  notifyUndo('✓ Copia creada como Cotización #' + copiaQn + '.', function(){
    // _restoreQuoteState() sólo repone la PANTALLA: sin este filtro la copia
    // quedaba guardada en poly_cquotes (y sincronizada al resto del equipo)
    // aunque el usuario tocara "Deshacer".
    saveDB(getDB().filter(function(r){ return r['N° Cotización'] !== copiaQn; }));
    _restoreQuoteState(snap);
  });
}

// Duplica una cotización del historial como una NUEVA (nuevo número, fecha de hoy)
// y la abre en el cotizador lista para editar.
function copiarCotizacionHist(qn){
  var db=getDB();
  var rows=db.filter(function(r){return r['N° Cotización']===qn;});
  if(!rows.length){ showToast('No se encontró la cotización #'+qn+'.'); return; }
  var snap = _snapshotQuoteState();
  var newNum;
  try { newNum = parseInt(localStorage.getItem('poly_cqc')||'0') + 1; localStorage.setItem('poly_cqc', newNum); } catch(e){ newNum = Date.now(); }
  var newQn = String(newNum).padStart(4,'0');
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
    if(!isAdmin && myNombre) c['Ejecutivo']=myNombre; /* la copia queda atribuida a quien la crea */
    db.push(c);
  });
  saveDB(db);
  // Abrir la copia en el cotizador (el propio editQuoteFromHistory no ofrece su
  // deshacer porque el snapshot de acá ya cubre toda la operación)
  editQuoteFromHistory(newQn, true);
  notifyUndo('✓ Copia creada como Cotización #'+newQn+'.', function(){
    // Mismo caso que copiarCotizacion(): hay que borrar la copia, no sólo
    // devolver la pantalla al estado anterior.
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
  qNum = parseInt(qn);
  document.getElementById('qnum').textContent = 'Cotización #'+qn;
  document.getElementById('client').value = first['Cliente']!=='—'?first['Cliente']:'';
  document.getElementById('opg').value    = first['OPG']!=='—'?(first['OPG']||''):'';
  document.getElementById('sala').value   = first['Sala']!=='—'?(first['Sala']||''):'';
  if(document.getElementById('mes-cierre-mY')) setMesCierre(first['Mes Cierre']||'');
  _setExecValue(first['Ejecutivo']!=='—'?first['Ejecutivo']:'');
  document.getElementById('obs').value    = first['Observaciones']!=='—'?first['Observaciones']:'';
  if(document.getElementById('quote-estado')){
    var _estLoad='Cotizado';
    for(var _ri=0;_ri<rows.length;_ri++){ if(rows[_ri]['_estado']){ _estLoad=rows[_ri]['_estado']; break; } }
    document.getElementById('quote-estado').value = _estLoad;
  }
  items=[];
  rows.forEach(function(r){
    var sp = r['P. Venta Unitario'];
    sp = (sp===''||sp===null||sp===undefined) ? '' : parseFloat(sp);
    items.push({
      id: Date.now() + Math.random(),
      sku: r['SKU'] || '',
      description: r['Descripción'] || '',
      salePrice: sp,
      qty: parseInt(r['Cantidad']) || 1,
      stock: r['Nota'] !== '—' ? (r['Nota']||'') : ''
    });
  });
  // Resetear sort para que los productos cargados queden en orden de importación
  _qSortKey = null; _qSortDir = 1;
  renderQ();
  goTo('quote');
  if(hadItems && !skipUndoToast){
    notifyUndo('Cargaste la cotización #'+qn+' — se reemplazó lo que tenías sin guardar.', function(){ _restoreQuoteState(snap); goTo('quote'); });
  }
}

function exportDB(){
  var db=getDB(); if(!db.length){showToast('No hay cotizaciones guardadas.');return;}
  // El Excel dice "Proyecto" donde el dato se guarda con la clave 'Sala'. La
  // clave viaja en `cquotes` y en los backups desde el día uno: renombrarla
  // obligaría a migrar todo lo guardado, así que se traduce solo el encabezado.
  var XLS_HD={'Sala':'Proyecto'};
  var heads=COLS.map(function(k){return XLS_HD[k]||k;});
  var data=db.map(function(r){var o={};for(var i=0;i<COLS.length;i++){var k=COLS[i];o[XLS_HD[k]||k]=r[k]!==undefined?r[k]:'';}return o;});
  var ws=XLSX.utils.json_to_sheet(data,{header:heads});
  ws['!cols']=[{wch:12},{wch:12},{wch:8},{wch:22},{wch:14},{wch:20},{wch:18},{wch:28},{wch:12},{wch:16},{wch:36},{wch:10},{wch:16},{wch:14},{wch:14}];
  var wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,'Cotizaciones');
  XLSX.writeFile(wb,'Ceven_Poly_Cotizaciones.xlsx');
}
