// ── DB ──
function getDB(){
  var db = cevenLsJSON('cquotes', []);
  return Object.prototype.toString.call(db) === '[object Array]' ? db : [];
}

// Filas "meta_*": guardan datos de la COTIZACIÓN (no líneas de producto), por eso
// no tienen SKU ni Descripción. Hoy la única es meta_nac (overrides de % Nac).
// Cualquier consumidor que recorra las filas de una cotización tiene que
// excluirlas — los .filter(Tipo==='producto'||'garantia') ya lo hacen.
function isQuoteMetaRow(r){
  return !!(r && typeof r['Tipo'] === 'string' && r['Tipo'].indexOf('meta') === 0);
}

// Contador de cotizaciones. Se lee crudo (no es JSON) y tolera cualquier formato
// guardado; solo el getItem puede tirar excepción (localStorage deshabilitado).
function _readQCounter(){
  var raw = null;
  try{ raw = localStorage.getItem('cqc'); }catch(e){}
  return parseInt(raw || '0', 10) || 0;
}

// Devuelve true solo si se escribió de verdad en localStorage.
function saveDB(db){
  // Limpiar filas corruptas antes de guardar (las meta no tienen SKU/Descripción
  // por diseño: si no se las exceptúa, los overrides de Nac se descartan siempre).
  db = db.filter(function(r){
    if(isQuoteMetaRow(r)) return true;
    return r['SKU'] && r['SKU'] !== 'undefined' && r['Descripción'] && r['Descripción'] !== 'undefined';
  });
  var ok = cevenLsSet('cquotes',JSON.stringify(db));
  autoSnapshot();
  return ok;
}

function doSave(overwrite){
  var now=new Date();
  var date=now.toLocaleDateString('es-AR');
  var time=now.toLocaleTimeString('es-AR',{hour:'2-digit',minute:'2-digit'});
  var client=document.getElementById('client').value||'—';
  var exec=document.getElementById('exec').value||'—';
  var ob=document.getElementById('obs').value||'—';
  var mesC = getMesCierre();
  var estadoQ = (document.getElementById('quote-estado') && document.getElementById('quote-estado').value) || 'Cotizado';
  // Proyecto = observaciones (campo unificado)
  var proyecto = ob;
  var qn=String(qNum).padStart(4,'0');
  var db=getDB();
  var already=false; for(var i=0;i<db.length;i++){if(db[i]['N° Cotización']===qn){already=true;break;}}
  if(already && !overwrite) return false;
  if(already && overwrite){
    db=db.filter(function(r){return r['N° Cotización']!==qn;});
  }
  for(var j=0;j<items.length;j++){
    var it=items[j];
    db.push({'N° Cotización':qn,'Fecha':date,'Hora':time,'Cliente':client,'Proyecto':proyecto,'Ejecutivo':exec,'Observaciones':ob,'Mes Cierre':mesC,'SKU':it.sku,'Descripción':it.description,'Cantidad':it.qty,'Disponibilidad':it.stock||'—','Margen %':it.itemMargin,'P. Venta Unitario':it.salePrice,'Total':it.salePrice*it.qty,'Tipo':'producto','_base':it.sellingBase,'_nac':it.itemNac,'_lob':it.lob||'','_taxes':it.taxes||'','_estado':estadoQ,'_nacIncluded':!!it.nacIncluded,'_manualMg':!!it.manualMargin});
  }
  for(var k=0;k<warrantyItems.length;k++){
    var w=warrantyItems[k];
    var wp=Math.round((w.precio||0)*100)/100;
    db.push({'N° Cotización':qn,'Fecha':date,'Hora':time,'Cliente':client,'Proyecto':proyecto,'Ejecutivo':exec,'Observaciones':ob,'Mes Cierre':mesC,'SKU':w.sku,'Descripción':w.equipo+' — '+(w.canal==='CC'?'Complete Care':'Gta. Limitada Ext.')+' ('+w.años+(w.años===1?' año':' años')+')','Cantidad':w.cantidad,'Disponibilidad':'—','Margen %':'—','P. Venta Unitario':wp,'Total':wp*w.cantidad,'Tipo':'garantia','_wdata':JSON.stringify(w),'_estado':estadoQ});
  }
  // Guardar overrides de Nac de la cotización si existen
  if(Object.keys(quoteNacOverrides).length){
    db.push({'N° Cotización':qn,'Fecha':date,'Hora':time,'Cliente':client,'Tipo':'meta_nac','_qnac':JSON.stringify(quoteNacOverrides)});
  }
  return saveDB(db);
}

function saveQuote(){
  if(!items.length && !warrantyItems.length){alert('La cotización está vacía.');return;}
  // El "✓ guardada" solo si se escribió de verdad: antes salía igual con la
  // cuota de localStorage llena y no se había guardado nada.
  if(doSave(true)) alert('✓ Cotización #'+String(qNum).padStart(4,'0')+' guardada.');
}

function nuevaCotizacion(){
  // Una cotización armada solo con garantías CevenCare es válida (saveQuote y
  // buildPDF la aceptan): también hay que avisar antes de borrarla.
  if((items.length || warrantyItems.length) && !confirm('¿Empezar una cotización nueva? Se perderán los productos y las garantías actuales si no guardaste.')){return;}
  // Incrementar número
  qNum = _readQCounter() + 1;
  cevenLsSet('cqc', qNum);
  document.getElementById('qnum').textContent = 'Cotización #' + String(qNum).padStart(4,'0');
  // Limpiar todo
  items = [];
  warrantyItems = [];
  quoteNacOverrides = {};
  if (typeof resetClientMode === 'function') resetClientMode();
  document.getElementById('client').value = '';
  if(document.getElementById('mes-cierre-mY')) setMesCierre('');
  if(document.getElementById('quote-estado')) document.getElementById('quote-estado').value = 'Cotizado';
  document.getElementById('exec').value = '';
  document.getElementById('obs').value = '';
  _lastFOBState = false; // nueva cotización sin FOB
  // Resetear fecha efectiva a +15 días
  var d2 = new Date(); d2.setDate(d2.getDate()+15);
  var yyyy2=d2.getFullYear(), mm2=String(d2.getMonth()+1).padStart(2,'0'), dd2=String(d2.getDate()).padStart(2,'0');
  document.getElementById('eff-date').value = yyyy2+'-'+mm2+'-'+dd2;
  document.getElementById('delivery').value = '';
  cevenApplyVendorAutofill();
  renderQ();
  renderWarranties();
}

// Crea una cotización NUEVA copiando la que está cargada actualmente (mismos productos,
// garantías, cliente, ejecutivo, etc.) pero con un número de cotización nuevo.
function copiarCotizacion(){
  if(!items.length && !warrantyItems.length){ alert('La cotización está vacía, no hay nada para copiar.'); return; }
  if(!confirm('¿Crear una nueva cotización copiando la actual?')) return;
  // Nuevo número de cotización
  qNum = _readQCounter() + 1;
  cevenLsSet('cqc', qNum);
  document.getElementById('qnum').textContent = 'Cotización #' + String(qNum).padStart(4,'0');
  // Clonar productos y garantías (ids nuevos y únicos para los items)
  items = items.map(function(it){ return Object.assign({}, it, { id: _nextItemId() }); });
  warrantyItems = warrantyItems.map(function(w){ return Object.assign({}, w); });
  // Clonar overrides de Nac de la cotización
  quoteNacOverrides = Object.assign({}, quoteNacOverrides);
  // El resto de los campos (cliente, ejecutivo, observaciones, mes, estado, fecha efectiva,
  // entrega) se mantienen tal cual están en pantalla → ya forman parte de la copia.
  renderQ();
  renderWarranties();
  // Solo confirmar la copia si realmente se persistió.
  if(doSave(true)) showToast('✓ Copia creada como Cotización #' + String(qNum).padStart(4,'0'));
}

// Duplica una cotización del historial como una NUEVA (nuevo número, fecha de hoy)
// y la abre en el cotizador lista para editar.
function copiarCotizacionHist(qn){
  var db=getDB();
  var rows=db.filter(function(r){return r['N° Cotización']===qn;});
  if(!rows.length){ alert('No se encontró la cotización #'+qn+'.'); return; }
  if(!confirm('¿Crear una copia de la cotización #'+qn+' y abrirla para editar?')) return;
  var newNum = _readQCounter() + 1;
  cevenLsSet('cqc', newNum);
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
  if(!saveDB(db)) return; // no se guardó: no abrir ni anunciar una copia inexistente
  // Abrir la copia en el cotizador (sin pedir confirmación, ya confirmamos arriba)
  editQuoteFromHistory(newQn, true);
  showToast('✓ Copia creada como Cotización #'+newQn);
}

function editQuoteFromHistory(qn, skipConfirm){
  var db=getDB();
  var rows=db.filter(function(r){return r['N° Cotización']===qn;});
  if(!rows.length) return;
  var first=rows[0];
  if(!cevenCanEditQuote(first['Ejecutivo'])){ alert('No tenés permiso para editar esta cotización.'); return; }
  if(!skipConfirm && items.length && !confirm('¿Cargar la cotización #'+qn+'? Se reemplazará la cotización actual.')){return;}
  qNum = parseInt(qn);
  document.getElementById('qnum').textContent = 'Cotización #'+qn;
  document.getElementById('client').value = first['Cliente']!=='—'?first['Cliente']:'';
  if(document.getElementById('mes-cierre-mY')) setMesCierre(first['Mes Cierre']||'');
  document.getElementById('exec').value   = first['Ejecutivo']!=='—'?first['Ejecutivo']:'';
  document.getElementById('obs').value    = first['Observaciones']!=='—'?first['Observaciones']:'';
  if(document.getElementById('quote-estado')){
    var _estLoad='Cotizado';
    for(var _ri=0;_ri<rows.length;_ri++){ if(rows[_ri]['_estado']){ _estLoad=rows[_ri]['_estado']; break; } }
    document.getElementById('quote-estado').value = _estLoad;
  }
  items=[];
  warrantyItems=[];
  quoteNacOverrides = {};
  rows.forEach(function(r){
    if(r['Tipo']==='meta_nac' && r['_qnac']){
      try{ quoteNacOverrides = JSON.parse(r['_qnac']); } catch(e){}
      return;
    }
    if(r['Tipo']==='garantia' && r['_wdata']){
      try{ warrantyItems.push(JSON.parse(r['_wdata'])); } catch(e){}
      return;
    }
    var sp = parseFloat(r['P. Venta Unitario']) || 0;
    var mg = r['Margen %'];
    var margen = (mg !== null && mg !== '—' && mg !== undefined) ? parseFloat(mg) : '—';
    // Si se guardaron los valores originales, usarlos para que el margen funcione bien
    var hasBase = r['_base'] !== undefined && r['_base'] !== null && r['_base'] !== '';
    var base = hasBase ? parseFloat(r['_base']) : sp;
    var nac  = (r['_nac'] !== undefined && r['_nac'] !== null && r['_nac'] !== '') ? parseFloat(r['_nac']) : 0;
    var lob  = r['_lob'] || '';
    // Preferir el IVA guardado con la cotización; recalcular desde el modelo
    // solo si la cotización es vieja y nunca se guardó ese campo.
    var hasSavedTaxes = r['_taxes'] !== undefined && r['_taxes'] !== null && r['_taxes'] !== '';
    var taxesVal = hasSavedTaxes ? r['_taxes'] : (lob ? getIVA(lob) : '');
    // Restaurar si el margen fue negociado a mano. Sin esto toda cotización
    // recuperada quedaba como "margen automático" y el primer toque al slider
    // global le pisaba el precio negociado a todos los ítems.
    var mgFlag = r['_manualMg'];
    var hasMgFlag = mgFlag !== undefined && mgFlag !== null && mgFlag !== '';
    var isManualMg;
    if(hasMgFlag){
      isManualMg = (mgFlag === true || mgFlag === 'true' || mgFlag === 1 || mgFlag === '1');
    } else {
      // Cotizaciones viejas (guardadas antes de que existiera el flag): si el
      // margen guardado no es el global de hoy, fue tocado a mano → no pisarlo.
      isManualMg = (typeof margen === 'number' && !isNaN(margen) && Math.abs(margen - getM()) > 0.005);
    }
    items.push({
      id: _nextItemId(),
      sku: r['SKU'] || '',
      description: r['Descripción'] || '',
      sellingBase: base,
      itemNac: nac,
      lob: lob,
      itemMargin: margen,
      salePrice: sp,
      qty: parseInt(r['Cantidad']) || 1,
      stock: r['Disponibilidad'] !== '—' ? r['Disponibilidad'] : '',
      taxes: taxesVal,
      nacIncluded: r['_nacIncluded'] === true || r['_nacIncluded'] === 'true' || r['_nacIncluded'] === 1,
      manualMargin: isManualMg
    });
  });
  // Resetear sort para que los productos cargados queden en orden de importación
  _qSortKey = null; _qSortDir = 1;
  // Sincronizar el estado FOB con la cotización cargada para que onObsChange detecte
  // correctamente cuando se agrega/quita "FOB" después (recalcula nacionalización).
  _lastFOBState = isCotizacionFOB();
  renderQ();
  renderWarranties();
  goTo('quote');
}

function exportDB(){
  var db=getDB(); if(!db.length){alert('No hay cotizaciones guardadas.');return;}
  // Las filas meta_* no son líneas de cotización: no van al Excel.
  db=db.filter(function(r){ return !isQuoteMetaRow(r); });
  if(!db.length){alert('No hay cotizaciones guardadas.');return;}
  var data=db.map(function(r){var o={};for(var i=0;i<COLS.length;i++)o[COLS[i]]=r[COLS[i]]!==undefined?r[COLS[i]]:'';return o;});
  var ws=XLSX.utils.json_to_sheet(data,{header:COLS});
  ws['!cols']=[{wch:12},{wch:12},{wch:8},{wch:22},{wch:18},{wch:28},{wch:16},{wch:40},{wch:10},{wch:14},{wch:10},{wch:20},{wch:14}];
  var wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,'Cotizaciones');
  XLSX.writeFile(wb,'Ceven_Base_Cotizaciones.xlsx');
}
