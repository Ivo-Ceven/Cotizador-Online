// ── PRICE LIST ──
(function(){
  try { var s=localStorage.getItem('cpl'); if(s){ products=JSON.parse(s); initCat(); } } catch(e){}
})();

function handlePL(f) {
  if(!f) return;
  var isXL = /\.(xlsx|xls)$/i.test(f.name);
  if(isXL) {
    var r = new FileReader();
    r.onload = function(e) {
      try { var wb=XLSX.read(new Uint8Array(e.target.result),{type:'array'}); processRows(XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{defval:''})); }
      catch(er){ showErr('Error Excel: '+er.message); }
    };
    r.readAsArrayBuffer(f);
  } else {
    var r2 = new FileReader();
    r2.onload = function(e){ try{ processRows(parseCSV(e.target.result)); }catch(er){ showErr('Error: '+er.message); } };
    r2.readAsText(f,'UTF-8');
  }
}

function parseCSV(txt) {
  var sep = txt.indexOf('\t')!==-1 ? '\t' : (txt.split('\n')[0].indexOf(';')!==-1 ? ';' : ',');
  var lines = txt.trim().split('\n');
  if(lines.length < 2) return [];
  var hdr = lines[0].split(sep).map(function(h){ return h.trim().replace(/^"|"$/g,''); });
  var rows = [];
  for(var i=1;i<lines.length;i++) {
    var cols=[],cur='',inQ=false,line=lines[i];
    for(var j=0;j<line.length;j++) {
      var c=line[j];
      if(c==='"') inQ=!inQ;
      else if(c===sep && !inQ){ cols.push(cur.trim()); cur=''; }
      else cur+=c;
    }
    cols.push(cur.trim());
    var row={};
    for(var k=0;k<hdr.length;k++) row[hdr[k]]=(cols[k]||'').replace(/^"|"$/g,'').trim();
    var hasVal=false; for(var kk in row){ if(row[kk]){ hasVal=true; break; } }
    if(hasVal) rows.push(row);
  }
  return rows;
}

function fk(obj) {
  var nk = function(s){ return s.toLowerCase().replace(/\s+/g,'').replace(/[^a-z0-9]/g,''); };
  var keys = Object.keys(obj);
  for(var c=1;c<arguments.length;c++) {
    var n = nk(arguments[c]);
    for(var k=0;k<keys.length;k++) { if(nk(keys[k])===n || nk(keys[k]).indexOf(n)!==-1) return keys[k]; }
  }
  return null;
}

function processRows(rows) {
  if(!rows.length){ showErr('Archivo vacío.'); return; }
  var f=rows[0], keys=Object.keys(f);
  var pK=fk(f,'Selling Price','SellingPrice','Price','Precio');
  var sK=(function(){ for(var i=0;i<keys.length;i++){ if(keys[i].trim().toLowerCase()==='sku') return keys[i]; } return fk(f,'SKU','Model #','Model#'); })();
  var dK=fk(f,'Description','Descripcion','Desc');
  var lK=fk(f,'LOB','lob');
  var mK=keys[1];
  var cK=fk(f,'Country','Model Country','Pais','País');
  if(!pK){ showErr('No se encontró Selling Price. Columnas: '+keys.join(', ')); return; }
  products=[];
  for(var i=0;i<rows.length;i++) {
    var r=rows[i];
    var sp=parseFloat(String(r[pK]||'0').replace(/[^0-9,\.]/g,'').replace(/\.(?=\d{3})/g,'').replace(',','.'))||0;
    if(sp>0||r[sK]) products.push({id:i,sku:r[sK]||'',lob:r[lK]||'',modelCol:r[mK]||'',country:r[cK]||'',description:r[dK]||'',sellingPrice:sp});
  }
  try{ localStorage.setItem('cpl',JSON.stringify(products)); }catch(e){}
  showErr(''); initCat();
}

// ── Actualizar precios (merge): a diferencia de processRows(), NO reemplaza el catálogo.
// Solo actualiza el costo de los SKU que ya existen, agrega los nuevos, y conserva
// intactos los productos manuales y los que no aparecen en el/los archivo(s) nuevo(s).
function handlePriceUpdate(files){
  if(!files || !files.length) return;
  var fileList = Array.prototype.slice.call(files);
  var allRows = [];
  var pending = fileList.length;
  var hadError = false;

  fileList.forEach(function(f){
    var r = new FileReader();
    r.onload = function(e){
      try {
        var wb = XLSX.read(new Uint8Array(e.target.result), {type:'array'});
        var raw = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], {header:1, defval:''});
        var hdrIdx = -1;
        for(var i=0;i<raw.length;i++){
          if(raw[i].some(function(c){ return String(c).trim().toLowerCase()==='sku'; })){ hdrIdx = i; break; }
        }
        if(hdrIdx < 0){
          hadError = true;
          showErr('No se encontraron encabezados (columna "SKU") en '+f.name+'.');
        } else {
          var hdr = raw[hdrIdx];
          for(var j=hdrIdx+1;j<raw.length;j++){
            var row = raw[j];
            if(!row || !row.length) continue;
            var obj = {};
            for(var k=0;k<hdr.length;k++) obj[hdr[k]] = row[k]!==undefined ? row[k] : '';
            var hasVal = false; for(var kk in obj){ if(obj[kk]!==''){ hasVal=true; break; } }
            if(hasVal) allRows.push(obj);
          }
        }
      } catch(er){
        hadError = true;
        showErr('Error leyendo '+f.name+': '+er.message);
      }
      pending--;
      if(pending === 0) finishPriceUpdate(allRows, hadError);
    };
    r.readAsArrayBuffer(f);
  });
}

// Busca una columna por nombre EXACTO (case-insensitive, trim) — a diferencia de fk(),
// no le quita espacios/símbolos, porque en estos archivos "Model" y "Model #" colisionarían
// (ambos quedarían "model" si se normalizan igual que fk()).
function exactKey(obj, name){
  var target = name.trim().toLowerCase();
  var keys = Object.keys(obj);
  for(var i=0;i<keys.length;i++){ if(keys[i].trim().toLowerCase()===target) return keys[i]; }
  return null;
}

function finishPriceUpdate(rows, hadError){
  if(!rows.length){
    if(!hadError) showErr('No se encontraron filas de datos en los archivos.');
    return;
  }
  var f = rows[0];
  var pK   = fk(f,'Selling Price','SellingPrice','Price','Precio');
  // "Model #" es el SKU real (formato Apple); la columna "SKU" de estos price lists
  // es un código interno corto y no sirve para matchear contra el catálogo.
  var skuK = exactKey(f,'Model #') || exactKey(f,'Model#') || fk(f,'SKU');
  var mK   = exactKey(f,'Model');
  var lK   = fk(f,'LOB','lob');
  var cK   = fk(f,'Country','Model Country','Pais','País');
  var dK   = fk(f,'Description','Descripcion','Desc');
  if(!pK || !skuK){
    showErr('No se encontró "Selling Price" o "Model #" en el archivo. Columnas: '+Object.keys(f).join(', '));
    return;
  }

  // Combinar filas de todos los archivos por SKU real; si un mismo SKU aparece
  // más de una vez (p. ej. en ambos archivos), se conserva el precio más alto.
  var bySku = {};
  for(var i=0;i<rows.length;i++){
    var r = rows[i];
    var sku = String(r[skuK]||'').trim();
    if(!sku) continue;
    var sp = parseFloat(String(r[pK]||'0').replace(/[^0-9,\.]/g,'').replace(/\.(?=\d{3})/g,'').replace(',','.'))||0;
    if(!bySku[sku] || sp > bySku[sku].sellingPrice){
      bySku[sku] = {
        sku: sku,
        lob: lK ? (r[lK]||'') : '',
        modelCol: mK ? (r[mK]||'') : '',
        country: cK ? (r[cK]||'') : '',
        description: dK ? (r[dK]||'') : '',
        sellingPrice: sp
      };
    }
  }

  var bySkuExisting = {};
  for(var x=0;x<products.length;x++){ if(products[x].sku) bySkuExisting[products[x].sku] = products[x]; }

  var updated = 0, added = 0, addedCounter = 0;
  Object.keys(bySku).forEach(function(sku){
    var nd = bySku[sku];
    var existing = bySkuExisting[sku];
    if(existing){
      // Solo se toca el costo — descripción/modelo/país/manual quedan intactos.
      if(existing.sellingPrice !== nd.sellingPrice){ existing.sellingPrice = nd.sellingPrice; updated++; }
      // El SKU apareció en la lista nueva → su precio queda confirmado, aunque no haya cambiado.
      delete existing.needsReview;
    } else {
      addedCounter++;
      var newProd = {id: Date.now()+addedCounter, sku: nd.sku, lob: nd.lob, modelCol: nd.modelCol, country: nd.country, description: nd.description, sellingPrice: nd.sellingPrice};
      products.push(newProd);
      bySkuExisting[sku] = newProd;
      added++;
    }
  });

  // Todo lo que no apareció en ningún archivo de esta actualización (incluidos los
  // manuales) queda marcado para revisar — su costo sigue siendo el de antes, sin verificar.
  var notReviewed = 0;
  for(var y=0;y<products.length;y++){
    if(!bySku[products[y].sku]){ products[y].needsReview = true; notReviewed++; }
  }

  try{ localStorage.setItem('cpl', JSON.stringify(products)); }catch(e){}
  initCat();
  showErr('');
  showToast('✓ Precios actualizados: '+updated+' actualizados, '+added+' nuevos agregados, '+notReviewed+' a revisar (no estaban en la lista nueva). Catálogo: '+products.length+' productos.');
}

// Elimina del catálogo los SKU con sufijo de país "LL/A" (EE.UU./Canadá) — no eliminan
// nada de cotizaciones/pipeline ya guardadas, solo el catálogo de selección de productos.
function deleteLLASkus(){
  var toRemove = products.filter(function(p){ return (p.sku||'').toUpperCase().slice(-4) === 'LL/A'; });
  if(!toRemove.length){ alert('No hay SKU terminados en LL/A en el catálogo.'); return; }
  if(!confirm('¿Eliminar '+toRemove.length+' SKU terminados en "LL/A" del catálogo?\nNo afecta cotizaciones ni pipeline ya guardados.')) return;
  products = products.filter(function(p){ return (p.sku||'').toUpperCase().slice(-4) !== 'LL/A'; });
  try{ localStorage.setItem('cpl', JSON.stringify(products)); }catch(e){}
  if(products.length) initCat();
  else {
    document.getElementById('catui').style.display='none';
    document.getElementById('nopl').style.display='block';
    var b=document.getElementById('plbadge'); b.className='bk bkw'; b.textContent='Sin price list';
  }
  showToast('✓ '+toRemove.length+' SKU "LL/A" eliminados. Catálogo: '+products.length+' productos.');
}

// SKU termina en "E/A" con sufijo de país de UNA sola letra (ej. "MDH74E/A") — distinto
// de sufijos de país reales de 2 letras que también terminan en E, como "LE/A" o "BE/A".
function isExactEASuffix(sku){
  var s = (sku||'').toUpperCase();
  if(s.slice(-3) !== 'E/A') return false;
  var prevChar = s.charAt(s.length - 4);
  return !prevChar || !/[A-Z]/.test(prevChar);
}
function deleteEASkus(){
  var toRemove = products.filter(function(p){ return isExactEASuffix(p.sku); });
  if(!toRemove.length){ alert('No hay SKU con sufijo "E/A" (de una letra) en el catálogo.'); return; }
  if(!confirm('¿Eliminar '+toRemove.length+' SKU con sufijo "E/A" del catálogo?\nNo afecta "LE/A" ni "BE/A" (países reales), ni cotizaciones/pipeline ya guardados.')) return;
  products = products.filter(function(p){ return !isExactEASuffix(p.sku); });
  try{ localStorage.setItem('cpl', JSON.stringify(products)); }catch(e){}
  if(products.length) initCat();
  else {
    document.getElementById('catui').style.display='none';
    document.getElementById('nopl').style.display='block';
    var b=document.getElementById('plbadge'); b.className='bk bkw'; b.textContent='Sin price list';
  }
  showToast('✓ '+toRemove.length+' SKU "E/A" eliminados. Catálogo: '+products.length+' productos.');
}

function toggleCleanupMenu(ev){
  if(ev) ev.stopPropagation();
  var m = document.getElementById('cleanup-menu');
  if(!m) return;
  m.style.display = (m.style.display === 'block') ? 'none' : 'block';
}
function closeCleanupMenu(){
  var m = document.getElementById('cleanup-menu');
  if(m) m.style.display = 'none';
}
document.addEventListener('click', function(e){
  var m = document.getElementById('cleanup-menu');
  if(m && m.style.display === 'block' && !m.contains(e.target)) closeCleanupMenu();
});

function initCat() {
  if(!products.length) return;
  document.getElementById('nopl').style.display='none';
  document.getElementById('catui').style.display='block';
  var b=document.getElementById('plbadge'); b.className='bk bkok'; b.textContent='✓ '+products.length+' productos';
  selIds={};
  var models=uniq(products.map(function(p){return p.modelCol;}));
  var countries=uniq(products.map(function(p){return p.country;}));
  if(countries.indexOf('Uruguay')<0) countries.push('Uruguay');
  document.getElementById('fmodel').innerHTML=models.map(function(v){return '<option>'+v+'</option>';}).join('');
  document.getElementById('fcountry').innerHTML=countries.map(function(v){return '<option>'+v+'</option>';}).join('');
  renderCat();
}

// ── CATALOG ──
// ── MULTI-SKU PASTE ──
var _pendingNewSKUs = []; // SKUs a crear manualmente (pegados pero no encontrados)

function handleSearchInput(){
  // Si hay un solo término (sin saltos/tabs/commas), se usa como búsqueda normal
  var v = document.getElementById('fsearch').value;
  if(!/[\n\t,;]/.test(v)){
    renderCat();
    return;
  }
  // Si hay múltiples tokens detectados, esperar al onpaste o cuando el usuario presiona Enter
  renderCat();
}

function handleSearchPaste(e){
  // Capturar el texto pegado y procesarlo como múltiples SKUs si tiene separadores
  var text = (e.clipboardData || window.clipboardData).getData('text');
  if(!text) return;
  // Detectar si tiene múltiples líneas/tabs/comas (tokens delimitados)
  if(!/[\n\t,;]/.test(text.trim())){
    // Texto normal — dejar pegar y buscar
    setTimeout(renderCat, 0);
    return;
  }
  e.preventDefault();
  // Tokenizar
  var tokens = text.split(/[\n\t,;]+/).map(function(s){return s.trim();}).filter(function(s){return s.length>0;});
  if(!tokens.length) return;
  processMultiSKUs(tokens);
}

function processMultiSKUs(tokens){
  // Para cada token, intentar match exacto por SKU
  var found = [];
  var notFound = [];
  for(var i=0;i<tokens.length;i++){
    var t = tokens[i].trim();
    if(!t) continue;
    var match = null;
    for(var j=0;j<products.length;j++){
      if((products[j].sku||'').toLowerCase() === t.toLowerCase()){ match = products[j]; break; }
    }
    if(match){
      found.push(match);
      selIds[match.id] = _nextSel();
    } else {
      notFound.push(t);
    }
  }

  document.getElementById('fsearch').value = '';
  renderCat();

  var msg = '';
  if(found.length) msg += '✓ ' + found.length + ' SKU(s) encontrados y seleccionados';
  if(notFound.length){
    msg += (msg?' · ':'') + '⚠ ' + notFound.length + ' no encontrados';
  }
  if(msg) showToast(msg);

  // Si hay SKUs no encontrados, encolar y abrir el form para el primero
  if(notFound.length){
    _pendingNewSKUs = notFound.slice();
    setTimeout(function(){
      promptForNextPendingSKU();
    }, 600);
  }
}

function promptForNextPendingSKU(){
  if(!_pendingNewSKUs.length){
    document.getElementById('addprod-title').textContent = 'Agregar artículo al price list';
    return;
  }
  var nextSku = _pendingNewSKUs[0];
  prepAddProd();
  document.getElementById('np-sku').value = nextSku;
  var remaining = _pendingNewSKUs.length;
  document.getElementById('addprod-title').textContent = 'Agregar SKU faltante (' + remaining + ' pendiente' + (remaining===1?'':'s') + ')';
  // Auto-foco en descripción para acelerar carga
  goTo('addprod');
  setTimeout(function(){
    var d = document.getElementById('np-desc');
    if(d) d.focus();
  }, 100);
}

function getFiltered() {
  var s=document.getElementById('fsearch').value.toLowerCase().trim();
  var m=document.getElementById('fmodel').value;
  var c=document.getElementById('fcountry').value;
  // Dividir el texto en palabras (separadas por espacios), todas deben coincidir
  var terms = s ? s.split(/\s+/).filter(function(t){return t.length>0;}) : [];
  return products.filter(function(p){
    if(m!=='Todos'&&p.modelCol!==m) return false;
    if(c!=='Todos'&&p.country!==c) return false;
    if(terms.length){
      var hay = ((p.sku||'')+' '+(p.lob||'')+' '+(p.modelCol||'')+' '+(p.description||'')+' '+(p.country||'')).toLowerCase();
      for(var i=0;i<terms.length;i++){ if(hay.indexOf(terms[i])===-1) return false; }
    }
    return true;
  });
}

function renderCat() {
  var filtered=getFiltered(), mg=getM(), html='';
  for(var i=0;i<filtered.length;i++){
    var p=filtered[i], nac=getNac(p), nt=p.sellingPrice*(1+nac/100), sp=calcP(p.sellingPrice,nac,mg), sel=!!selIds[p.id];
    html+='<tr class="crow'+(sel?' sel':'')+'" onclick="toggleRow('+p.id+')">'
      +'<td style="overflow:visible"><input type="checkbox"'+(sel?' checked':'')+' onclick="event.stopPropagation();toggleRow('+p.id+')"></td>'
      +'<td style="font-weight:500">'+p.sku+(p.manual?' <span style="font-size:10px;color:#0071e3;font-weight:600;background:#e8f4ff;padding:1px 5px;border-radius:8px;margin-left:4px">manual</span>':'')+(p.nacIncluded?' <span style="font-size:10px;color:#6e36c8;font-weight:600;background:#f0e8ff;padding:1px 5px;border-radius:8px;margin-left:2px" title="Precio ya nacionalizado">NAC✓</span>':'')+(p.needsReview?' <span style="font-size:10px;color:#c84e00;font-weight:600;background:#fff3e0;padding:1px 5px;border-radius:8px;margin-left:2px" title="No apareció en la última actualización de precios — verificar costo">⚠ Revisar costo</span>':'')+'</td>'
      +'<td class="wrap">'+p.description+'</td>'
      +'<td style="text-align:right;color:#6e6e73">USD '+fD(p.sellingPrice)+'</td>'
      +'<td style="text-align:right;color:#6e6e73">USD '+fD(nt)+'</td>'
      +'<td style="text-align:right;font-weight:500">'+dp(sp)+'</td>'
      +'<td style="text-align:center;white-space:nowrap;overflow:visible">'
        +'<button class="bs" onclick="event.stopPropagation();editManualProduct('+p.id+')" title="Editar" style="padding:2px 6px;font-size:12px">✎</button> '
        +'<button class="bsr" onclick="event.stopPropagation();deleteManualProduct('+p.id+')" title="Eliminar">×</button>'
      +'</td>'
      +'</tr>';
  }
  document.getElementById('catbody').innerHTML = html || '<tr><td colspan="7" style="text-align:center;color:#aeaeb2;padding:24px">Sin resultados</td></tr>';
  var cnt=Object.keys(selIds).length;
  document.getElementById('catcount').textContent = filtered.length+' productos · '+cnt+' seleccionados';
  var btn=document.getElementById('addbtn');
  btn.style.display = cnt>0 ? 'inline-block' : 'none';
  btn.textContent = editId!==null ? 'Confirmar cambio' : 'Agregar ('+cnt+')';
  var allSel=filtered.length>0; for(var j=0;j<filtered.length;j++){if(!selIds[filtered[j].id]){allSel=false;break;}}
  document.getElementById('chkall').checked=allSel;
}

function toggleRow(pid) { if(selIds[pid]) delete selIds[pid]; else selIds[pid]=_nextSel(); renderCat(); }
function toggleAll(cb) { var f=getFiltered(); if(cb.checked){for(var i=0;i<f.length;i++){if(!selIds[f[i].id])selIds[f[i].id]=_nextSel();}}else{for(var i=0;i<f.length;i++)delete selIds[f[i].id];} renderCat(); }

// ── QUOTE ──
// Cuando cambia el campo Observaciones, si aparece/desaparece FOB recalcular el Nac de todos los items
var _lastFOBState = false;
function onObsChange(){
  var fobNow = isCotizacionFOB();
  if(fobNow === _lastFOBState) return;
  _lastFOBState = fobNow;
  if(!items.length) return;
  for(var i=0;i<items.length;i++){
    var it = items[i];
    // Ítems con precio ya nacionalizado nunca suman nac, aunque se quite FOB
    var nac = (fobNow || it.nacIncluded) ? 0 : getNac({lob:it.lob||'', modelCol:it.lob||'', description:it.description||''});
    it.itemNac = nac;
    // Mantener precio, recalcular margen
    if(it.salePrice > 0 && it.sellingBase > 0){
      it.itemMargin = calcMargenFromPrice(it.sellingBase, nac, it.salePrice);
    }
  }
  renderQ();
  showToast(fobNow ? 'FOB detectado — Nac. seteado a 0% en todos los ítems' : 'FOB removido — Nac. restaurado por categoría');
}

function isCotizacionFOB(){
  var obs = document.getElementById('obs') ? document.getElementById('obs').value : '';
  return /\bfob\b/i.test(obs);
}

function addToQuote() {
  var mg=getM();
  var toAdd=[];
  for(var i=0;i<products.length;i++){ if(selIds[products[i].id]) toAdd.push(products[i]); }
  // Ordenar por el orden en que fueron seleccionados
  toAdd.sort(function(a,b){ return (selIds[a.id]||0) - (selIds[b.id]||0); });
  if(!toAdd.length) return;

  var fob = isCotizacionFOB(); // Si es FOB, nac = 0 para todos los ítems

  if(editId !== null) {
    var p=toAdd[0], nac=fob||p.nacIncluded ? 0 : getNac(p);
    for(var i=0;i<items.length;i++){
      if(String(items[i].id)===String(editId)){
        items[i].sku=p.sku; items[i].description=p.description;
        items[i].sellingBase=p.sellingPrice; items[i].lob=p.lob;
        items[i].itemNac=nac; items[i].salePrice=calcP(p.sellingPrice,nac,items[i].itemMargin);
        items[i].taxes=getIVA(p.lob);
      }
    }
    editId=null;
  } else {
    for(var j=0;j<toAdd.length;j++){
      var p2=toAdd[j], nac2=fob||p2.nacIncluded ? 0 : getNac(p2);
      var newItem={id:Date.now()+j*13+Math.floor(Math.random()*1000),sku:p2.sku,lob:p2.lob,description:p2.description,sellingBase:p2.sellingPrice,itemNac:nac2,itemMargin:mg,salePrice:calcP(p2.sellingPrice,nac2,mg),qty:1,stock:'',taxes:getIVA(p2.lob)};
      items.push(newItem);
      // Sugerir garantía si es Mac
      if(typeof suggestMacWarranty==='function') suggestMacWarranty(newItem);
    }
  }
  selIds={};
  // Resetear el sort para que los productos nuevos queden al final (sin reordenar)
  _qSortKey = null; _qSortDir = 1;
  renderQ();
  goTo('quote');
}

// ── SORT DE COTIZACIÓN ──
var _qSortKey = null, _qSortDir = 1; // dir: 1=asc, -1=desc

var FAMILY_ORDER = ['MacBook Neo','MacBook Air','MacBook Pro','iMac','Mac mini','Mac Studio','Mac Pro','iPhone','iPad','Apple Watch','AirPods','Accesorios'];

function getProductFamily(it){
  var s = ((it.description||'')+' '+(it.lob||'')+' '+(it.modelCol||'')).toLowerCase();
  if(/macbook\s*neo|macbookneo/.test(s))      return 'MacBook Neo';
  if(/macbook\s*pro|mbp/.test(s))             return 'MacBook Pro';
  if(/macbook\s*air|mba/.test(s))             return 'MacBook Air';
  if(/imac/.test(s))                          return 'iMac';
  if(/mac\s*mini/.test(s))                    return 'Mac mini';
  if(/mac\s*studio/.test(s))                  return 'Mac Studio';
  if(/mac\s*pro/.test(s))                     return 'Mac Pro';
  if(/iphone/.test(s))                        return 'iPhone';
  if(/ipad/.test(s))                          return 'iPad';
  if(/watch/.test(s))                         return 'Apple Watch';
  if(/airpod/.test(s))                        return 'AirPods';
  return 'Accesorios';
}

