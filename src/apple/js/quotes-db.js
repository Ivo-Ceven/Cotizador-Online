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

// El contador de cotizaciones se fue a shared/quote-num.js, que además mira el
// mayor número que existe de verdad: el contador solo ya no alcanzaba.

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
  // Condiciones comerciales: no se guardaban, así que el PDF regenerado desde el
  // historial (exportSelectedPDF) las leía como vacías y omitía el bloque entero
  // de "Condiciones Comerciales". Los nombres de clave son los que ese PDF espera.
  var _el = function(id){ var e=document.getElementById(id); return e ? e.value : ''; };
  var payMode  = cevenPayMode();   // resuelve la opcion "Otra" (shared/ui-core.js)
  var effDate  = _el('eff-date');
  var delivery = cevenDelivery();  // idem: el <select> vale "__otra", no el texto
  /* Proyecto y Observaciones son dos campos distintos desde 08/2026. Antes acá
     decía `var proyecto = ob`, con el comentario "campo unificado": las dos
     claves de cquotes guardaban el MISMO texto, así que el pipeline agrupado
     por proyecto mostraba notas sueltas de la cotización. */
  var proyecto = document.getElementById('proyecto').value||'—';
  var qn=cevenQNumFmt(qNum);
  var db=getDB();
  var already=false; for(var i=0;i<db.length;i++){if(db[i]['N° Cotización']===qn){already=true;break;}}
  if(already && !overwrite) return false;
  if(already){
    if(cevenEsEdicionDe(qn)){
      // Es la cotización que se abrió del historial: re-guardarla es lo esperado.
      db=db.filter(function(r){return r['N° Cotización']!==qn;});
    } else {
      /* El número ya existe y NO es el que se estaba editando: alguien del
         equipo lo usó primero y llegó por la sync. Sobreescribir borraría su
         cotización sin avisar, así que esta se guarda con el próximo libre. */
      qNum = cevenReservarQNum();
      var qnViejo = qn;
      qn = cevenQNumFmt(qNum);
      cevenPintarQNum();
      showToast('El número #'+qnViejo+' ya lo usó otra cotización del equipo. Esta se guardó como #'+qn+'.');
    }
  }
  // El número se consume recién acá (state.js ya no lo reserva al cargar).
  cevenAnotarQNum(qNum);
  cevenEditandoQNum(qn);
  for(var j=0;j<items.length;j++){
    var it=items[j];
    db.push(cevenOpcSellarFila({'N° Cotización':qn,'Fecha':date,'Hora':time,'Cliente':client,'Proyecto':proyecto,'Ejecutivo':exec,'Observaciones':ob,'Mes Cierre':mesC,'Condición de pago':payMode,'Propuesta efectiva hasta':effDate,'Entrega':delivery,'SKU':it.sku,'Descripción':it.description,'Cantidad':it.qty,'Disponibilidad':it.stock||'—','IVA':it.taxes||'','Margen %':it.itemMargin,'P. Venta Unitario':it.salePrice,'Total':it.salePrice*it.qty,'Tipo':'producto','_base':it.sellingBase,'_nac':it.itemNac,'_lob':it.lob||'','_taxes':it.taxes||'','_estado':estadoQ,'_nacIncluded':!!it.nacIncluded,'_manualMg':!!it.manualMargin}, it));
  }
  for(var k=0;k<warrantyItems.length;k++){
    var w=warrantyItems[k];
    var wp=Math.round((w.precio||0)*100)/100;
    db.push(cevenOpcSellarFila({'N° Cotización':qn,'Fecha':date,'Hora':time,'Cliente':client,'Proyecto':proyecto,'Ejecutivo':exec,'Observaciones':ob,'Mes Cierre':mesC,'Condición de pago':payMode,'Propuesta efectiva hasta':effDate,'Entrega':delivery,'SKU':w.sku,'Descripción':w.equipo+' — '+(w.canal==='CC'?'Complete Care':'Gta. Limitada Ext.')+' ('+w.años+(w.años===1?' año':' años')+')','Cantidad':w.cantidad,'Disponibilidad':'—','IVA':'21%','Margen %':'—','P. Venta Unitario':wp,'Total':wp*w.cantidad,'Tipo':'garantia','_wdata':JSON.stringify(w),'_estado':estadoQ}, w));
  }
  // Guardar overrides de Nac de la cotización si existen
  if(Object.keys(quoteNacOverrides).length){
    db.push(cevenOpcSellarFila({'N° Cotización':qn,'Fecha':date,'Hora':time,'Cliente':client,'Tipo':'meta_nac','_qnac':JSON.stringify(quoteNacOverrides)}, null));
  }
  return saveDB(db);
}

function saveQuote(){
  if(!items.length && !warrantyItems.length){showToast('La cotización está vacía.');return;}
  // El "✓ guardada" solo si se escribió de verdad: antes salía igual con la
  // cuota de localStorage llena y no se había guardado nada.
  if(doSave(true)) showToast('✓ Cotización #'+String(qNum).padStart(4,'0')+' guardada.');
}

/* Guarda todo lo necesario para volver a poner en pantalla la cotización que se
   está por reemplazar/descartar — lo usan los botones que arrancan otra
   cotización SIN preguntar primero: la acción se aplica y el cartel ofrece
   deshacerla. Es el criterio de toda la app desde 08/2026: ningún popup nativo
   bloquea antes de actuar (ver shared/notify.js).

   Apple guarda además garantías y overrides de nacionalización, que en Poly no
   existen: sin ellos "Deshacer" devolvía los productos pero no las CevenCare. */
function _snapshotQuoteState(){
  var _v = function(id){ var e=document.getElementById(id); return e ? e.value : ''; };
  return {
    qNum: qNum,
    opc: cevenOpcEstado(),          // qué opciones había y cuál era la vigente
    items: JSON.parse(JSON.stringify(items)),
    warrantyItems: JSON.parse(JSON.stringify(warrantyItems)),
    nacOv: JSON.parse(JSON.stringify(quoteNacOverrides)),
    clientMode: (typeof _currentClientMode !== 'undefined') ? _currentClientMode : null,
    client: _v('client'),
    proyecto: _v('proyecto'),
    exec: _v('exec'),
    mesCierre: getMesCierre(),
    estado: _v('quote-estado') || 'Cotizado',
    obs: _v('obs'),
    effDate: _v('eff-date'),
    payMode: cevenPayMode(),
    delivery: cevenDelivery()
  };
}

function _restoreQuoteState(snap){
  qNum = snap.qNum;
  cevenPintarQNum();
  items = snap.items;
  warrantyItems = snap.warrantyItems;
  quoteNacOverrides = snap.nacOv;
  cevenOpcEstadoSet(snap.opc);
  window._currentClientMode = snap.clientMode;
  document.getElementById('client').value = snap.client;
  document.getElementById('proyecto').value = snap.proyecto;
  document.getElementById('exec').value = snap.exec;
  if(document.getElementById('mes-cierre-mY')) setMesCierre(snap.mesCierre);
  if(document.getElementById('quote-estado')) document.getElementById('quote-estado').value = snap.estado;
  document.getElementById('obs').value = snap.obs;
  document.getElementById('eff-date').value = snap.effDate;
  cevenSetPayMode(snap.payMode);
  cevenSetDelivery(snap.delivery);
  _qSortKey = null; _qSortDir = 1;
  // El FOB se deduce de Observaciones, que acaba de volver a su valor anterior.
  _lastFOBState = isCotizacionFOB();
  renderQ();
  renderWarranties();
}

function nuevaCotizacion(){
  // Una cotización armada solo con garantías CevenCare es válida (saveQuote y
  // buildPDF la aceptan): también hay que poder deshacer si se descarta.
  var hadItems = !!(items.length || warrantyItems.length);
  var snap = hadItems ? _snapshotQuoteState() : null;
  // Incrementar número
  qNum = cevenReservarQNum();
  cevenPintarQNum();
  cevenEditandoQNum(null);   // arranca una cotización nueva: nada que re-guardar
  // Limpiar todo
  items = [];
  warrantyItems = [];
  quoteNacOverrides = {};
  cevenOpcReset();   // vuelve a una sola opción, vigente A
  if (typeof resetClientMode === 'function') resetClientMode();
  document.getElementById('client').value = '';
  if(document.getElementById('mes-cierre-mY')) setMesCierre('');
  if(document.getElementById('quote-estado')) document.getElementById('quote-estado').value = 'Cotizado';
  document.getElementById('exec').value = '';
  document.getElementById('proyecto').value = '';
  document.getElementById('obs').value = '';
  _lastFOBState = false; // nueva cotización sin FOB
  // Resetear fecha efectiva a +15 días
  var d2 = new Date(); d2.setDate(d2.getDate()+15);
  var yyyy2=d2.getFullYear(), mm2=String(d2.getMonth()+1).padStart(2,'0'), dd2=String(d2.getDate()).padStart(2,'0');
  document.getElementById('eff-date').value = yyyy2+'-'+mm2+'-'+dd2;
  cevenSetDelivery('');
  cevenApplyVendorAutofill();
  renderQ();
  renderWarranties();
  if(hadItems){
    notifyUndo('Empezaste una cotización nueva — se descartó lo que tenías sin guardar.', function(){ _restoreQuoteState(snap); });
  }
}

// Crea una cotización NUEVA copiando la que está cargada actualmente (mismos productos,
// garantías, cliente, ejecutivo, etc.) pero con un número de cotización nuevo.
function copiarCotizacion(){
  if(!items.length && !warrantyItems.length){ showToast('La cotización está vacía, no hay nada para copiar.'); return; }
  var snap = _snapshotQuoteState();
  // Nuevo número de cotización
  qNum = cevenReservarQNum();
  cevenPintarQNum();
  cevenEditandoQNum(null);   // es una copia nueva, no la original
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
  if(!doSave(true)) return;
  var copiaQn = String(qNum).padStart(4,'0');
  notifyUndo('✓ Copia creada como Cotización #' + copiaQn + '.', function(){
    /* _restoreQuoteState() sólo repone la PANTALLA: sin este filtro la copia
       quedaba guardada en cquotes (y sincronizada al resto del equipo) aunque
       el usuario tocara "Deshacer". */
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
  var newQn = cevenQNumFmt(cevenReservarQNum());
  /* Sin este filtro las filas se AGREGABAN sobre las que ya tuvieran ese
     número: era el único camino que metía dos cotizaciones distintas bajo el
     mismo número en el mismo array. renderHistory() las mostraba concatenadas
     en una sola tarjeta y deleteQ() borraba las dos. */
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
    if(!isAdmin && myNombre) c['Ejecutivo']=myNombre; /* la copia queda atribuida a quien la crea */
    db.push(c);
  });
  if(!saveDB(db)) return; // no se guardó: no abrir ni anunciar una copia inexistente
  /* Abrir la copia en el cotizador. El propio editQuoteFromHistory() no ofrece
     su deshacer porque el snapshot de acá ya cubre toda la operación. */
  editQuoteFromHistory(newQn, true);
  notifyUndo('✓ Copia creada como Cotización #'+newQn+'.', function(){
    // Igual que copiarCotizacion(): hay que borrar la copia, no solo devolver la pantalla.
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
  // Se carga siempre y se avisa con "Deshacer" — antes un confirm() nativo
  // bloqueaba la pantalla para preguntar si se podía pisar lo que había.
  var hadItems = !!(items.length || warrantyItems.length);
  var snap = hadItems ? _snapshotQuoteState() : null;
  qNum = parseInt(qn, 10);
  cevenPintarQNum();
  // Re-guardar ESTE número es una edición, no una colisión (ver doSave).
  cevenEditandoQNum(qn);
  document.getElementById('client').value = first['Cliente']!=='—'?first['Cliente']:'';
  if(document.getElementById('mes-cierre-mY')) setMesCierre(first['Mes Cierre']||'');
  document.getElementById('exec').value   = first['Ejecutivo']!=='—'?first['Ejecutivo']:'';
  document.getElementById('proyecto').value = first['Proyecto']!=='—'?(first['Proyecto']||''):'';
  document.getElementById('obs').value    = first['Observaciones']!=='—'?first['Observaciones']:'';
  // Condiciones comerciales guardadas con la cotización. Sin esto, reabrir una
  // cotización y volver a guardarla las pisaba con lo que hubiera en pantalla.
  (function(){
    if(first['Condición de pago']) cevenSetPayMode(first['Condición de pago']);
    var ed = document.getElementById('eff-date');
    if(ed && first['Propuesta efectiva hasta'] && first['Propuesta efectiva hasta'] !== '—') ed.value = first['Propuesta efectiva hasta'];
    // Una cotización guardada cuando esto era un campo de texto libre entra por
    // la opción "Otra…" con su texto intacto (ver cevenSetDelivery).
    cevenSetDelivery((first['Entrega'] && first['Entrega'] !== '—') ? first['Entrega'] : '');
  })();
  if(document.getElementById('quote-estado')){
    var _estLoad='Cotizado';
    for(var _ri=0;_ri<rows.length;_ri++){ if(rows[_ri]['_estado']){ _estLoad=rows[_ri]['_estado']; break; } }
    document.getElementById('quote-estado').value = _estLoad;
  }
  items=[];
  warrantyItems=[];
  quoteNacOverrides = {};
  // Opciones A/B: qué líneas son de cuál y cuál es la vigente (shared/opciones.js).
  cevenOpcCargarDeFilas(rows);
  rows.forEach(function(r){
    if(r['Tipo']==='meta_nac' && r['_qnac']){
      try{ quoteNacOverrides = JSON.parse(r['_qnac']); } catch(e){}
      return;
    }
    if(r['Tipo']==='garantia' && r['_wdata']){
      try{
        var _w = JSON.parse(r['_wdata']);
        // La opción manda desde la COLUMNA de la fila: `_wdata` de una cotización
        // guardada antes de 08/2026 no la trae.
        _w.opc = cevenOpcDe(r);
        warrantyItems.push(_w);
      } catch(e){}
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
    // solo si la cotización es vieja y nunca se guardó ese campo. La columna
    // visible 'IVA' es de 08/2026; '_taxes' es donde vivía antes.
    var savedTaxes = r['IVA'];
    if(savedTaxes === undefined || savedTaxes === null || savedTaxes === '') savedTaxes = r['_taxes'];
    var hasSavedTaxes = savedTaxes !== undefined && savedTaxes !== null && savedTaxes !== '';
    var taxesVal = hasSavedTaxes ? savedTaxes : (lob ? getIVA(lob) : '');
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
      manualMargin: isManualMg,
      opc: cevenOpcDe(r)
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
  if(hadItems && !skipUndoToast){
    notifyUndo('Cargaste la cotización #'+qn+' — se reemplazó lo que tenías sin guardar.', function(){ _restoreQuoteState(snap); goTo('quote'); });
  }
}

function exportDB(){
  var db=getDB(); if(!db.length){showToast('No hay cotizaciones guardadas.');return;}
  // Las filas meta_* no son líneas de cotización: no van al Excel.
  db=db.filter(function(r){ return !isQuoteMetaRow(r); });
  if(!db.length){showToast('No hay cotizaciones guardadas.');return;}
  var data=db.map(function(r){var o={};for(var i=0;i<COLS.length;i++)o[COLS[i]]=r[COLS[i]]!==undefined?r[COLS[i]]:'';return o;});
  var ws=XLSX.utils.json_to_sheet(data,{header:COLS});
  // Un ancho por columna de COLS (antes eran 13 para 15 columnas).
  ws['!cols']=[{wch:12},{wch:12},{wch:8},{wch:22},{wch:18},{wch:28},{wch:40},{wch:12},
               {wch:18},{wch:20},{wch:18},{wch:8},{wch:16},{wch:40},{wch:10},{wch:14},{wch:8},{wch:10},{wch:20},{wch:14}];
  var wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,'Cotizaciones');
  XLSX.writeFile(wb,'Ceven_Base_Cotizaciones.xlsx');
}
