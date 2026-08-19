
/* La familia de un ítem (mac / iphone / ipad / acc) y los agregados de una fila
   de pipeline viven en `pricing-core.js`, sin DOM ni globales: los calcula
   también el cotizador MULTIMARCA al emitir una cotización de Apple, y si
   fueran dos implementaciones distintas la fila diría un total y la cotización
   otro. Acá quedan los envoltorios que les pasan la tabla de esta marca. */
function categorize(item){
  return cevenAppleCategoria(item, MODEL_CATEGORY);
}

function _pipeAgregados(its, wrs){
  return cevenAppleAgregados(its, wrs, MODEL_CATEGORY);
}

/* Campos derivados del ESTADO ACTUAL de la cotización en pantalla — todo lo
   que antes armaba `entry` inline en addToPipeline(). Separado de
   applyPipeFields() para poder recalcular sin tocar identidad ni
   seguimiento comercial al actualizar una fila que ya existe. */
function computeQuotePipeFields(){
  /* SOLO la opción vigente. Si sumaran las dos, el pipeline del equipo quedaría
     inflado con plata que nunca se va a facturar — y no se nota mirando la
     pantalla, se nota a fin de mes cuando el total no cierra. */
  var _ef = cevenOpcEfectiva();
  var ag = _pipeAgregados(cevenOpcFiltrar(items, _ef), cevenOpcFiltrar(warrantyItems, _ef));
  return {
    cliente: (document.getElementById('client').value||'').trim(),
    proyecto: (document.getElementById('proyecto').value||'').trim() || '—',
    ejecutivo: document.getElementById('exec').value || '—',
    mesCierre: getMesCierre() || '',
    qMac: ag.qMac,
    qIph: ag.qIph,
    qIpad: ag.qIpad,
    qServ: ag.qServ,
    qAcc: ag.qAcc,
    montoMac: ag.montoMac,
    montoIph: ag.montoIph,
    montoIpad: ag.montoIpad,
    montoAcc: ag.montoAcc,
    montoServ: ag.montoServ,
    monto: ag.monto,
    margenPond: ag.margenPond,
    moneda: 'USD',
    /* El marcador FOB se escribe en Observaciones, que NO viaja al pipeline:
       antes se detectaba de rebote porque `proyecto` era el mismo texto. Ahora
       el flag se guarda acá y se sincroniza (está en pipeCols). Ver esFOBEntry(). */
    esFOB: (typeof isCotizacionFOB === 'function') ? isCotizacionFOB() : false
  };
}

/* Aplica los campos derivados sobre una entrada EXISTENTE del pipeline sin
   tocar su identidad ni el seguimiento comercial ya cargado.

   Antes addToPipeline() reemplazaba el objeto entero al re-agregar una
   cotización que ya estaba en el pipeline, y con eso se perdían fecha/
   fechaISO (se recalculaban con `now`) y TODOS los overrides por SKU
   (skuStatus, skuMesCierre, skuPartialQty, skuPartialRemSt,
   skuPartialRemMes, skuArchivedQty) más ovLink — el objeto nuevo no los
   incluía. La única red era pushPipeUndo(), frágil: se pierde si el
   vendedor sigue trabajando después. */
function applyPipeFields(existing, fields){
  var out = Object.assign({}, existing, fields);
  out.id = existing.id;
  out.fecha = existing.fecha;
  out.fechaISO = existing.fechaISO;
  out.qNum = existing.qNum;
  out.estado = existing.estado || 'Cotizado';
  out.skuStatus = existing.skuStatus;
  out.skuMesCierre = existing.skuMesCierre;
  out.skuPartialQty = existing.skuPartialQty;
  out.skuPartialRemSt = existing.skuPartialRemSt;
  out.skuPartialRemMes = existing.skuPartialRemMes;
  out.skuArchivedQty = existing.skuArchivedQty;
  out.ovLink = existing.ovLink;
  return out;
}

function addToPipeline(){
  if(!cevenCanUsePipeline()){ showToast('Tu rol no permite agregar al pipeline.'); return; }
  if(!items.length && !warrantyItems.length){ showToast('La cotización está vacía.'); return; }
  /* Con dos opciones, la que va al pipeline es la vigente: si está vacía la fila
     entraría en 0 y nadie entendería por qué. */
  var _ef = cevenOpcEfectiva();
  if(!cevenOpcFiltrar(items, _ef).length && !cevenOpcFiltrar(warrantyItems, _ef).length){
    showToast('La Opción '+cevenOpcLetra(_ef)+' es la vigente y está vacía: cargale productos o marcá la otra como vigente.');
    return;
  }
  var fields = computeQuotePipeFields();
  if(!fields.cliente){ showToast('Cargá el nombre del cliente antes de agregar al pipeline.'); return; }
  var qn = String(qNum).padStart(4,'0');

  var pipe = getPipeline();
  var existingIdx = -1;
  for(var p=0;p<pipe.length;p++){ if(pipe[p].qNum === qn){ existingIdx = p; break; } }

  // Nunca se bloquea con un confirm(): la acción se aplica siempre y, cuando el
  // caso es ambiguo, se avisa con un cartel que permite deshacer.
  var warnMsg = null;
  var entry;
  if(existingIdx >= 0){
    if(typeof pushPipeUndo === 'function') pushPipeUndo(pipe[existingIdx].id); // snapshot antes de mutar
    warnMsg = 'Actualizaste la cotización #'+qn+', que ya estaba en el pipeline.';
    entry = applyPipeFields(pipe[existingIdx], fields);
    pipe[existingIdx] = entry;
  } else {
    var now = new Date();
    entry = Object.assign({
      /* `Date.now()` a secas colisiona entre dos usuarios que agregan en el mismo
         milisegundo, y la PK en Supabase es (brand, id): el upsert pisa una fila
         con la otra. Tiene que quedar ENTERO — la columna es bigint. */
      id: Date.now() * 1000 + Math.floor(Math.random() * 1000),
      fecha: now.toLocaleDateString('es-AR'),
      fechaISO: now.toISOString(),
      qNum: qn,
      estado: (document.getElementById('quote-estado') && document.getElementById('quote-estado').value) || 'Cotizado'
    }, fields);
    pipe.push(entry);
  }
  savePipeline(pipe);
  if(existingIdx < 0 && typeof pushPipeUndoInsert === 'function') pushPipeUndoInsert(entry.id);

  // doSave devuelve false si el localStorage está lleno: no anunciar un
  // guardado que no ocurrió (savePipeline ya corrió, es otra clave).
  if(!doSave(true)) return;

  var msg = warnMsg || ('✓ Agregada al pipeline: ' + fields.cliente + (fields.proyecto!=='—'?' / '+fields.proyecto:''));
  notifyUndo(msg, function(){ if(typeof undoPipelineChange === 'function') undoPipelineChange(); });
}

/* Reconstruye líneas de cotización a partir de las filas guardadas en `cquotes`,
   quedándose con las de UNA opción. Solo se rehidrata lo que necesita
   _pipeAgregados(): cantidades, precios, familia y margen. */
function _pipeLineasDeFilas(rows, opc){
  var its = [], wrs = [];
  for(var i=0;i<rows.length;i++){
    var r = rows[i];
    if(cevenOpcDe(r) !== opc) continue;
    if(r['Tipo'] === 'garantia'){
      wrs.push({precio: parseFloat(r['P. Venta Unitario'])||0, cantidad: parseInt(r['Cantidad'],10)||1});
    } else if(r['Tipo'] === 'producto'){
      var mg = parseFloat(r['Margen %']);
      its.push({sku: r['SKU']||'', description: r['Descripción']||'', lob: r['_lob']||'',
                qty: parseInt(r['Cantidad'],10)||1,
                salePrice: parseFloat(r['P. Venta Unitario'])||0,
                itemMargin: isNaN(mg) ? 0 : mg});
    }
  }
  return {items: its, warranties: wrs};
}

/* Cambia la opción vigente de una cotización desde su fila del pipeline, sin
   reabrirla. Es el momento en que el cliente define cuál de las dos compra.

   El monto de la fila se RECALCULA con las líneas de la opción nueva: dejarlo
   como estaba sería peor que no tener la funcionalidad, porque la fila diría
   "Opción B" con la plata de la A. */
function cambiarOpcionVigente(id){
  var pipe = getPipeline();
  var row = null;
  for(var i=0;i<pipe.length;i++){ if(pipe[i].id === id){ row = pipe[i]; break; } }
  if(!row) return;
  if(!cevenCanEditPipelineRow(row.ejecutivo)){ showToast('No tenés permiso para modificar esta línea del pipeline.'); return; }

  var rows = getDB().filter(function(r){ return r['N° Cotización'] === row.qNum; });
  if(!rows.length){ showToast('No se encontró la cotización #'+row.qNum+' en el historial.'); return; }
  if(!cevenOpcHayBEnFilas(rows)){ showToast('La cotización #'+row.qNum+' tiene una sola opción.'); return; }

  var previa = cevenOpcEfectivaDeFilas(rows);
  var nueva  = (previa === 1) ? 2 : 1;
  var lineas = _pipeLineasDeFilas(rows, nueva);
  if(!lineas.items.length && !lineas.warranties.length){
    showToast('La Opción '+cevenOpcLetra(nueva)+' de la #'+row.qNum+' no tiene líneas.');
    return;
  }
  if(!cevenOpcFijarEnDB(row.qNum, nueva)) return;   // no se guardó: no se toca el pipeline

  if(typeof pushPipeUndo === 'function') pushPipeUndo(id);
  var ag = _pipeAgregados(lineas.items, lineas.warranties);
  for(var k in ag){ if(Object.prototype.hasOwnProperty.call(ag, k)) row[k] = ag[k]; }
  savePipeline(pipe);
  renderPipeline();
  notifyUndo('Cotización #'+row.qNum+': ahora suma la Opción '+cevenOpcLetra(nueva)+' — USD '+fI(ag.monto)+'.', function(){
    cevenOpcFijarEnDB(row.qNum, previa);
    if(typeof undoPipelineChange === 'function') undoPipelineChange();
  });
}

/* Detecta si una entrada del pipeline es FOB.

   Antes esto leía `r.proyecto`, que era literalmente el campo Observaciones —y
   ahí es donde se escribe "FOB"—. Al separar los dos campos (08/2026) esa
   detección se caía, y con ella la nacionalización al 0%: por eso la fila ahora
   guarda el flag `esFOB`, que addToPipeline() toma de isCotizacionFOB().

   El fallback por texto se conserva por si el flag falta. */
function esFOBEntry(r){
  if(r.esFOB) return true;
  return /\bfob\b/i.test(r.proyecto || '');
}

// Mapa global para que los botones de filas virtuales accedan a los lineKeys sin pasar JSON en onclick
window._pipeLineKeysMap = window._pipeLineKeysMap || {};

function clearPipelineFilters(){
  var ids = ['pipe-search','pipe-exec','pipe-family','pipe-status','archive-month-sel'];
  ids.forEach(function(id){
    var el = document.getElementById(id);
    if(el) el.value = '';
  });
  window._pipeStatusFilters = [];
  window._pipeMonthFilter = '';
  renderPipeline();
}

// clearCatalogFilters() vive en shared/catalog-core.js (Poly tenia su propia
// copia; los selects de modelo/pais se limpian solo si existen).

