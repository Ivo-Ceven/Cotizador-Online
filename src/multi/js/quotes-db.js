/* ============================================================
   HISTORIAL DEL PEDIDO  ·  Cotizador multimarca
   ------------------------------------------------------------
   Guardar, reabrir y exportar los pedidos. Es el `quotes-db.js`
   de una marca, con dos cosas propias:

   · cada fila lleva su MARCA, que es lo que permite volver a
     armar un pedido mixto al reabrirlo;
   · cada fila lleva `_emitidas`, el mapa de que numero le toco a
     este pedido en cada marca. Es lo que hace que re-emitir
     PISE en vez de duplicar — sin eso, la segunda emision
     tomaria numeros nuevos y el pipeline de cada marca terminaria
     con dos filas por el mismo pedido.

   Depende de: js/state.js, js/marcas.js, shared/opciones.js,
   shared/quote-num.js, safe.js.
   ============================================================ */

function getDB(){
  var db = cevenLsJSON(cevenK('cquotes'), []);
  return Object.prototype.toString.call(db) === '[object Array]' ? db : [];
}

function saveDB(db){
  // Filas corruptas fuera antes de guardar, igual que en las marcas.
  db = db.filter(function(r){
    return r['SKU'] && r['SKU'] !== 'undefined' && r['Descripción'] && r['Descripción'] !== 'undefined';
  });
  var ok = cevenLsSet(cevenK('cquotes'), JSON.stringify(db));
  if(typeof autoSnapshot === 'function') autoSnapshot();
  return ok;
}

function cevenExecActual(){
  var el = document.getElementById('exec');
  return el ? (el.value || '').trim() : '';
}

/* El mensaje no nombra la accion: lo llaman tanto guardar como emitir. */
function cevenRequireExec(){
  if(cevenExecActual()) return true;
  showToast('Elegí el Ejecutivo para poder continuar.');
  return false;
}

/* Guarda el pedido. Devuelve true solo si se escribio de verdad: con la cuota
   de localStorage llena, anunciar un guardado que no ocurrio es peor que el
   error. */
function doSave(overwrite){
  if(!items.length) return false;
  if(!cevenRequireExec()) return false;

  var now = new Date();
  var date = now.toLocaleDateString('es-AR');
  var time = now.toLocaleTimeString('es-AR', {hour:'2-digit', minute:'2-digit'});
  var _v = function(id){ var e = document.getElementById(id); return e ? e.value : ''; };
  var client   = _v('client') || '—';
  var proyecto = _v('proyecto') || '—';
  var exec     = cevenExecActual();
  var ob       = _v('obs') || '—';
  var mesC     = getMesCierre();
  var estadoQ  = _v('quote-estado') || 'Cotizado';
  var payMode  = cevenPayMode();
  var effDate  = _v('eff-date');
  var delivery = cevenDelivery();
  var qn = cevenQNumFmt(qNum);

  var db = getDB();
  var already = false;
  for(var i=0;i<db.length;i++){ if(db[i]['N° Cotización'] === qn){ already = true; break; } }
  if(already && !overwrite) return false;
  if(already){
    if(cevenEsEdicionDe(qn)){
      db = db.filter(function(r){ return r['N° Cotización'] !== qn; });
    } else {
      /* El numero ya existe y NO es el que se estaba editando: alguien del
         equipo lo uso primero y llego por la sync. Sobreescribir borraria su
         pedido sin avisar, asi que este se guarda con el proximo libre. */
      qNum = cevenReservarQNum();
      var qnViejo = qn;
      qn = cevenQNumFmt(qNum);
      cevenPintarQNum();
      showToast('El número ' + CEVEN_BRAND.qNumPrefijo + qnViejo + ' ya lo usó otro pedido del equipo. Este se guardó como ' + cevenQNumVisible(qNum) + '.');
    }
  }
  cevenAnotarQNum(qNum);
  cevenEditandoQNum(qn);

  var emitidasJSON = JSON.stringify(emitidas || {});
  for(var j=0;j<items.length;j++){
    var it = items[j];
    var sp = (it.salePrice === '' || it.salePrice == null) ? 0 : it.salePrice;
    db.push(cevenOpcSellarFila({
      'N° Cotización': qn, 'Fecha': date, 'Hora': time,
      'Cliente': client, 'Proyecto': proyecto, 'Ejecutivo': exec,
      'Observaciones': ob, 'Mes Cierre': mesC,
      'Condición de pago': payMode, 'Propuesta efectiva hasta': effDate, 'Entrega': delivery,
      'Marca': it.brand,
      'SKU': it.sku, 'Descripción': it.description, 'Cantidad': it.qty,
      'Nota': it.stock || '—', 'IVA': cevenFormatoIVA(it.iva || it.taxes),
      // Cada marca llena la suya; la otra queda '—'. Ver COLS en state.js.
      'Nivel de precio': (it.brand === 'poly') ? cevenPolyTierEfectivo(it, tierGlobalMulti()) : '—',
      'Margen %': (it.brand === 'apple') ? it.itemMargin : '—',
      'P. Venta Unitario': it.salePrice, 'Total': sp * it.qty,
      'Tipo': 'producto', '_estado': estadoQ,
      // Lo que hace falta para reconstruir la linea al reabrir el pedido.
      '_lineaBase': JSON.stringify(_lineaGuardable(it)),
      // A que numero se emitio en cada marca. Va en TODAS las filas, igual que
      // `_opcEf`: asi no depende de filas "meta" que este historial no tiene.
      '_emitidas': emitidasJSON
    }, it));
  }
  var ok = saveDB(db);
  if(ok && typeof cevenClienteSet === 'function'){
    var t = tierGlobalMulti();
    if(t && client && client !== '—') cevenClienteSet(client, {tier: t});
  }
  return ok;
}

/* Lo que hay que guardar de una linea para poder rearmarla igual. Se guarda el
   objeto entero menos lo que se recalcula: es mas barato y mas seguro que
   enumerar campo por campo, porque cada marca tiene los suyos y agregar uno
   nuevo no puede obligar a acordarse de tocar esto. */
function _lineaGuardable(it){
  var copia = {};
  for(var k in it){
    if(!Object.prototype.hasOwnProperty.call(it, k)) continue;
    copia[k] = it[k];
  }
  return copia;
}

function saveQuote(){
  if(!items.length){ showToast('El pedido está vacío.'); return; }
  if(!doSave(true)) return;
  showToast('✓ Pedido ' + cevenQNumVisible(qNum) + ' guardado.');
}

/* ── Reabrir / nuevo / copiar ────────────────────────────────────────────── */

// Las filas de un pedido guardado, en orden.
function filasDePedido(qn){
  return getDB().filter(function(r){ return r['N° Cotización'] === qn; });
}

/* Rearma las lineas desde las filas guardadas. `_lineaBase` trae el objeto tal
   como estaba; si falta (fila vieja o tocada a mano) se reconstruye lo minimo
   para que el pedido siga siendo utilizable en vez de perder la linea. */
function _lineasDeFilas(filas){
  var out = [];
  for(var i=0;i<filas.length;i++){
    var r = filas[i], linea = null;
    if(r['_lineaBase']){
      try{ linea = JSON.parse(r['_lineaBase']); }catch(e){ linea = null; }
    }
    if(!linea){
      linea = {
        brand: r['Marca'] || '', sku: r['SKU'] || '', description: r['Descripción'] || '',
        qty: parseInt(r['Cantidad'], 10) || 1,
        salePrice: parseFloat(r['P. Venta Unitario']) || 0,
        stock: (r['Nota'] === '—') ? '' : (r['Nota'] || ''),
        iva: r['IVA'] || ''
      };
    }
    linea.id = Date.now() * 1000 + i * 13 + Math.floor(Math.random() * 1000);
    linea.opc = cevenOpcDe(r);
    out.push(linea);
  }
  return out;
}

// El mapa de emisiones guardado con el pedido.
function _emitidasDeFilas(filas){
  for(var i=0;i<filas.length;i++){
    if(!filas[i]['_emitidas']) continue;
    try{
      var m = JSON.parse(filas[i]['_emitidas']);
      if(m && typeof m === 'object') return m;
    }catch(e){}
  }
  return {};
}

function _limpiarPantalla(){
  ['client','proyecto','obs','opg'].forEach(function(id){
    var e = document.getElementById(id); if(e) e.value = '';
  });
  var est = document.getElementById('quote-estado'); if(est) est.value = 'Cotizado';
  setMesCierre('');
  items = [];
  emitidas = {};
  _margenGlobalValor = 0;
  _tierGlobalValor = '';
  cevenOpcReset();
  cevenEditandoQNum(null);
}

function nuevoPedido(){
  var snap = _snapshotPedido();
  _limpiarPantalla();
  qNum = cevenNextQNum();
  cevenPintarQNum();
  renderQ();
  notifyUndo('Empezaste un pedido nuevo.', function(){ _restaurarPedido(snap); });
}

/* Copia el pedido actual en uno nuevo: mismos productos, numero nuevo y SIN las
   emisiones del original — si se heredaran, emitir el duplicado pisaria las
   cotizaciones del pedido que se copio. */
function copiarPedido(){
  if(!items.length){ showToast('El pedido está vacío.'); return; }
  var snap = _snapshotPedido();
  emitidas = {};
  qNum = cevenNextQNum();
  cevenEditandoQNum(null);
  cevenPintarQNum();
  renderQ();
  notifyUndo('Copiado en el pedido ' + cevenQNumVisible(qNum) + '. Las cotizaciones ya emitidas quedaron con el pedido original.',
    function(){ _restaurarPedido(snap); });
}

/* Abre un pedido guardado. Trae tambien sus emisiones: es lo que hace que
   volver a emitirlo actualice las cotizaciones que ya existen. */
function editarPedido(qn){
  var filas = filasDePedido(qn);
  if(!filas.length){ showToast('No se encontró el pedido ' + qn + '.'); return; }
  var snap = _snapshotPedido();
  var primera = filas[0];
  var _s = function(id, v){ var e = document.getElementById(id); if(e) e.value = (v === '—' ? '' : (v || '')); };
  _s('client', primera['Cliente']);
  _s('proyecto', primera['Proyecto']);
  _s('obs', primera['Observaciones']);
  _s('eff-date', primera['Propuesta efectiva hasta']);
  var est = document.getElementById('quote-estado');
  if(est && primera['_estado']) est.value = primera['_estado'];
  setMesCierre(primera['Mes Cierre'] || '');
  if(typeof cevenSetPayMode === 'function') cevenSetPayMode(primera['Condición de pago'] || '');
  if(typeof cevenSetDelivery === 'function') cevenSetDelivery(primera['Entrega'] || '');
  _setExecValue(primera['Ejecutivo'] || '');

  items = _lineasDeFilas(filas);
  emitidas = _emitidasDeFilas(filas);
  cevenOpcCargarDeFilas(filas);
  // Los controles globales se derivan de las lineas: si el pedido tiene Poly,
  // el nivel es el de la primera linea que siga al global.
  _restaurarControlesDesdeLineas();

  qNum = parseInt(qn, 10) || 0;
  cevenEditandoQNum(qn);
  cevenPintarQNum();
  goTo('quote');
  renderQ();
  notifyUndo('Abriste el pedido ' + cevenQNumVisible(qNum) + '.', function(){ _restaurarPedido(snap); });
}

/* El margen y el nivel globales no se guardan como campos del pedido: se leen
   de las lineas al reabrirlo. Es una fuente menos que puede quedar
   desincronizada del precio que efectivamente tiene cada linea. */
function _restaurarControlesDesdeLineas(){
  var apple = cevenMultiLineasDe(items, 'apple');
  for(var i=0;i<apple.length;i++){
    if(!apple[i].manualMargin && typeof apple[i].itemMargin === 'number'){
      _margenGlobalValor = apple[i].itemMargin;
      break;
    }
  }
  var poly = cevenMultiLineasDe(items, 'poly');
  for(var j=0;j<poly.length;j++){
    if(!poly[j].tier) continue;               // sigue al global: no dice cual es
    if(poly[j].tier === CEVEN_TIER_MANUAL) continue;
    _tierGlobalValor = poly[j].tier;
    break;
  }
  // Si ninguna linea tiene nivel propio, el del cliente es la mejor pista.
  if(!_tierGlobalValor && typeof cevenClienteTier === 'function'){
    var cli = (document.getElementById('client').value || '').trim();
    if(cli) _tierGlobalValor = cevenClienteTier(cli) || '';
  }
}

function _setExecValue(nombre){
  var sel = document.getElementById('exec');
  if(!sel) return;
  if(nombre && typeof cevenEnsureExecOption === 'function') cevenEnsureExecOption(sel, nombre);
  sel.value = nombre || '';
}

/* ── Deshacer ────────────────────────────────────────────────────────────── */

function _snapshotPedido(){
  var _v = function(id){ var e = document.getElementById(id); return e ? e.value : ''; };
  return {
    qNum: qNum,
    editando: cevenEsEdicionDe(cevenQNumFmt(qNum)) ? cevenQNumFmt(qNum) : null,
    opc: cevenOpcEstado(),
    items: JSON.parse(JSON.stringify(items)),
    emitidas: JSON.parse(JSON.stringify(emitidas || {})),
    margen: _margenGlobalValor, tier: _tierGlobalValor,
    client: _v('client'), proyecto: _v('proyecto'), obs: _v('obs'),
    exec: _v('exec'), estado: _v('quote-estado'), effDate: _v('eff-date'),
    mesCierre: getMesCierre()
  };
}

function _restaurarPedido(s){
  if(!s) return;
  var _s = function(id, v){ var e = document.getElementById(id); if(e) e.value = v || ''; };
  qNum = s.qNum;
  items = s.items;
  emitidas = s.emitidas;
  _margenGlobalValor = s.margen;
  _tierGlobalValor = s.tier;
  cevenOpcEstadoSet(s.opc);
  _s('client', s.client); _s('proyecto', s.proyecto); _s('obs', s.obs);
  _s('estado', s.estado); _s('eff-date', s.effDate);
  _setExecValue(s.exec);
  var est = document.getElementById('quote-estado'); if(est) est.value = s.estado || 'Cotizado';
  setMesCierre(s.mesCierre || '');
  cevenEditandoQNum(s.editando);
  cevenPintarQNum();
  renderQ();
}

/* ── Excel ───────────────────────────────────────────────────────────────── */

/* Una fila por linea, con las columnas de COLS. Las claves internas (las que
   empiezan con `_`) no salen: son estado de la app, no datos del pedido. */
function exportDB(){
  var db = getDB();
  if(!db.length){ showToast('No hay pedidos guardados.'); return; }
  var filas = db.map(function(r){
    var out = {};
    COLS.forEach(function(c){
      out[c] = (c === 'Marca') ? cevenMultiMarcaLabel(r['Marca']) : (r[c] === undefined ? '' : r[c]);
    });
    return out;
  });
  var hoja = XLSX.utils.json_to_sheet(filas, {header: COLS});
  var libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, hoja, 'Pedidos');
  XLSX.writeFile(libro, CEVEN_BRAND.exportPrefix + new Date().toISOString().slice(0,10) + '.xlsx');
}
