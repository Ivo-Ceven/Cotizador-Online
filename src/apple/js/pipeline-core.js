
function categorize(item){
  // 1. La descripción real del producto manda primero: es más confiable que "lob",
  //    que puede corromperse si se guarda el modal de edición con el modelo en blanco
  //    (el select cae a la primera opción del catálogo, p. ej. "AirTag").
  var desc = ((item.description || '') + ' ' + (item.modelCol || '')).toLowerCase();
  var isAccessoryWord = /keyboard|mouse|pencil|case|cover|cable|adapter|folio/i.test(desc);
  if(/\biphone\b/.test(desc) && !isAccessoryWord) return 'iphone';
  if(/\bipad\b/.test(desc)   && !isAccessoryWord) return 'ipad';
  if(/\bmacbook\b|\bimac\b|\bmac\s*(mini|studio|pro|neo)\b|\bmbp(ro)?\b|\bmba(ir)?\b/i.test(desc)) return 'mac';

  // 2. Sin pistas claras en la descripción: lookup exacto por Model (LOB)
  var lob = (item.lob || '').trim();
  if(MODEL_CATEGORY[lob]) return MODEL_CATEGORY[lob];
  return 'acc';
}

function addToPipeline(){
  if(!cevenCanUsePipeline()){ alert('Tu rol no permite agregar al pipeline.'); return; }
  if(!items.length && !warrantyItems.length){ alert('La cotización está vacía.'); return; }
  var client = (document.getElementById('client').value||'').trim();
  if(!client){ alert('Cargá el nombre del cliente antes de agregar al pipeline.'); return; }
  // El proyecto del pipeline = lo que esté en Observaciones de la cotización
  var proyecto = (document.getElementById('obs').value||'').trim();
  var exec = document.getElementById('exec').value || '';
  var mesCierre = getMesCierre();
  var qn = String(qNum).padStart(4,'0');

  // Contar categorías
  var qMac=0, qIph=0, qIpad=0, qAcc=0;
  var montoMac=0, montoIph=0, montoIpad=0, montoAcc=0;
  for(var i=0;i<items.length;i++){
    var c = categorize(items[i]);
    var q = items[i].qty || 1;
    var lm = (items[i].salePrice||0) * q;
    if(c==='mac'){ qMac += q; montoMac += lm; }
    else if(c==='iphone'){ qIph += q; montoIph += lm; }
    else if(c==='ipad'){ qIpad += q; montoIpad += lm; }
    else { qAcc += q; montoAcc += lm; } // accesorios = todo lo demás
  }
  // Servicios = cantidad total de líneas de garantías
  var qServ = 0, montoServ = 0;
  for(var j=0;j<warrantyItems.length;j++){
    qServ += (warrantyItems[j].cantidad||1);
    montoServ += (warrantyItems[j].precio||0) * (warrantyItems[j].cantidad||1);
  }

  // Monto total = productos en USD + garantías en USD
  var total = 0;
  for(var k=0;k<items.length;k++){ total += (items[k].salePrice||0) * (items[k].qty||1); }
  for(var w=0;w<warrantyItems.length;w++){ total += (warrantyItems[w].precio||0) * (warrantyItems[w].cantidad||1); }

  // Margen ponderado: suma(margen_línea * monto_línea) / suma(monto_línea) — siempre calculado
  var sumMargenMonto = 0;
  var sumMonto = 0;
  for(var m=0;m<items.length;m++){
    var it = items[m];
    var lineMonto = (it.salePrice||0) * (it.qty||1);
    var lineMargen = (typeof it.itemMargin === 'number') ? it.itemMargin : 0;
    sumMargenMonto += lineMargen * lineMonto;
    sumMonto += lineMonto;
  }
  var margenPonderado = sumMonto > 0 ? Math.round((sumMargenMonto / sumMonto) * 100) / 100 : null;

  var now = new Date();
  var fecha = now.toLocaleDateString('es-AR');

  var entry = {
    id: Date.now(),
    fecha: fecha,
    fechaISO: now.toISOString(),
    qNum: qn,
    cliente: client,
    proyecto: proyecto || '—',
    ejecutivo: exec || '—',
    mesCierre: mesCierre || '',
    estado: (document.getElementById('quote-estado') && document.getElementById('quote-estado').value) || 'Cotizado',
    qMac: qMac,
    qIph: qIph,
    qIpad: qIpad,
    qServ: qServ,
    qAcc: qAcc,
    montoMac: Math.round(montoMac),
    montoIph: Math.round(montoIph),
    montoIpad: Math.round(montoIpad),
    montoAcc: Math.round(montoAcc),
    montoServ: Math.round(montoServ),
    monto: Math.round(total),
    margenPond: margenPonderado,
    moneda: 'USD'
  };

  var pipe = getPipeline();
  var existingIdx = -1;
  for(var p=0;p<pipe.length;p++){ if(pipe[p].qNum === qn){ existingIdx = p; break; } }
  if(existingIdx >= 0){
    if(!confirm('La cotización #'+qn+' ya está en el pipeline. ¿Actualizar?')) return;
    // Preservar estado e id originales al actualizar
    entry.estado = pipe[existingIdx].estado || 'Cotizado';
    entry.id = pipe[existingIdx].id;
    pipe[existingIdx] = entry;
  } else {
    pipe.push(entry);
  }
  savePipeline(pipe);

  // doSave devuelve false si el localStorage está lleno: no anunciar un
  // guardado que no ocurrió (savePipeline ya corrió, es otra clave).
  if(!doSave(true)) return;

  showToast('✓ Agregada al pipeline: ' + client + (proyecto?' / '+proyecto:''));
}

// Detecta si una entrada del pipeline es FOB (busca "FOB" como palabra en el proyecto)
// Se chequea en tiempo real para cubrir entradas viejas sin el flag esFOB
function esFOBEntry(r){
  if(r.esFOB) return true; // flag guardado en entradas nuevas
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

function clearCatalogFilters(){
  var el = document.getElementById('fsearch'); if(el) el.value='';
  var fm = document.getElementById('fmodel'); if(fm) fm.value='Todos';
  var fc = document.getElementById('fcountry'); if(fc) fc.value='Todos';
  renderCat();
}

