// ── PARSER DE IMPORTES ──
// Convierte a Number cualquier texto de un input/celda de plata distinguiendo el
// separador de miles del decimal. Regla: el ÚLTIMO separador ("." o ",") es el
// decimal solo si le siguen 1 o 2 dígitos; si le siguen 3 o más (o ninguno) es
// separador de miles y se descarta.
//   "1041,67" → 1041.67    "1041.67" → 1041.67    "1.041,67" → 1041.67
//   "1.041"   → 1041       "1,041"   → 1041       "1.250.000" → 1250000
// Antes, upSalePriceDirect borraba TODOS los puntos: al reeditar un precio ya
// guardado ("1041.67") lo convertía en 104167 (×100 silencioso).
// Devuelve NaN si no hay ningún número en la entrada.
// cevenParseMoney() vive en shared/safe.js — las dos marcas la usan.

// IDs de ítem de cotización: contador monótono. Date.now()+random colisionaba al
// agregar varios productos de una sola vez (rmItem borraba dos filas, upQty/upMargin
// actualizaban dos filas).
var _itemSeq = 0;
function _nextItemId(){ return 'it_' + Date.now() + '_' + (++_itemSeq); }

// ── PRICE LIST ──
// cevenLsJSON() devuelve el fallback cuando el JSON guardado está corrupto. Antes
// eso pasaba en silencio: la app arrancaba con el catálogo vacío y el usuario
// creía que nunca había importado nada, así que perdía tiempo buscando el Excel.
(function(){
  var raw = null;
  try{ raw = localStorage.getItem('cpl'); }catch(e){}
  var s = cevenLsJSON('cpl', null);
  if(s && s.length){ products = s; initCat(); return; }
  if(raw){
    // Había algo guardado y no se pudo usar (JSON inválido o forma inesperada).
    var aviso = '⚠ El price list guardado está corrupto y no se pudo leer. Volvé a importar el Excel.';
    showErr(aviso);
    if(typeof showToast === 'function') setTimeout(function(){ showToast(aviso); }, 400);
  }
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

// parseCSV() y fk() viven en shared/catalog-core.js (eran identicos).

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
    var sp=cevenParseMoney(r[pK]); if(isNaN(sp)) sp=0;
    if(sp>0||r[sK]) products.push({id:i,sku:r[sK]||'',lob:r[lK]||'',modelCol:r[mK]||'',country:r[cK]||'',description:r[dK]||'',sellingPrice:sp});
  }
  // El catálogo ya está en memoria: se muestra igual, pero si no se pudo persistir
  // hay que decirlo en vez de dejar el cartel de "OK".
  var okPL = cevenLsSet('cpl',JSON.stringify(products));
  showErr(okPL ? '' : '⚠ El price list se cargó en pantalla pero NO se pudo guardar: se pierde al recargar.');
  initCat();
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
    var sp = cevenParseMoney(r[pK]); if(isNaN(sp)) sp = 0;
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

  var okUpd = cevenLsSet('cpl', JSON.stringify(products));
  initCat();
  showErr(okUpd ? '' : '⚠ Los precios se actualizaron en pantalla pero NO se pudieron guardar: se pierden al recargar.');
  if(okUpd) showToast('✓ Precios actualizados: '+updated+' actualizados, '+added+' nuevos agregados, '+notReviewed+' a revisar (no estaban en la lista nueva). Catálogo: '+products.length+' productos.');
}

// Elimina del catálogo los SKU con sufijo de país "LL/A" (EE.UU./Canadá) — no eliminan
// nada de cotizaciones/pipeline ya guardadas, solo el catálogo de selección de productos.
function deleteLLASkus(){
  var toRemove = products.filter(function(p){ return (p.sku||'').toUpperCase().slice(-4) === 'LL/A'; });
  if(!toRemove.length){ alert('No hay SKU terminados en LL/A en el catálogo.'); return; }
  if(!confirm('¿Eliminar '+toRemove.length+' SKU terminados en "LL/A" del catálogo?\nNo afecta cotizaciones ni pipeline ya guardados.')) return;
  products = products.filter(function(p){ return (p.sku||'').toUpperCase().slice(-4) !== 'LL/A'; });
  var okDel = cevenLsSet('cpl', JSON.stringify(products));
  if(products.length) initCat();
  else {
    document.getElementById('catui').style.display='none';
    document.getElementById('nopl').style.display='block';
    var b=document.getElementById('plbadge'); b.className='bk bkw'; b.textContent='Sin price list';
  }
  if(okDel) showToast('✓ '+toRemove.length+' SKU "LL/A" eliminados. Catálogo: '+products.length+' productos.');
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
  var okDelEA = cevenLsSet('cpl', JSON.stringify(products));
  if(products.length) initCat();
  else {
    document.getElementById('catui').style.display='none';
    document.getElementById('nopl').style.display='block';
    var b=document.getElementById('plbadge'); b.className='bk bkw'; b.textContent='Sin price list';
  }
  if(okDelEA) showToast('✓ '+toRemove.length+' SKU "E/A" eliminados. Catálogo: '+products.length+' productos.');
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
  document.getElementById('fmodel').innerHTML=optionsHTML(models);
  document.getElementById('fcountry').innerHTML=optionsHTML(countries);
  renderCat();
}

// ── CATALOG ──
// _pendingNewSKUs, handleSearchInput/Paste, processMultiSKUs y
// promptForNextPendingSKU viven en shared/catalog-core.js.

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
  // MISMO criterio que addToQuote(): si la cotización es FOB o el precio del
  // producto ya viene nacionalizado (badge NAC✓), no se vuelve a nacionalizar.
  // Antes el catálogo mostraba USD 1.550 (costo 1000 + 24% nac + 20% mg) y la
  // cotización cargaba USD 1.250 para el mismo producto.
  var fobCat = isCotizacionFOB();
  for(var i=0;i<filtered.length;i++){
    var p=filtered[i], nac=(fobCat||p.nacIncluded)?0:getNac(p), nt=p.sellingPrice*(1+nac/100), sp=calcP(p.sellingPrice,nac,mg), sel=!!selIds[p.id];
    // El id se pasa por data-* y lo resuelve el listener delegado: interpolarlo
    // crudo en onclick rompía con los productos manuales, cuyo id es un string
    // ('pm_1730…_3') y quedaba como identificador JS suelto → ReferenceError.
    var pidA = ' data-pid="'+cevenEsc(p.id)+'"';
    html+='<tr class="crow'+(sel?' sel':'')+'" data-act="row"'+pidA+'>'
      +'<td style="overflow:visible"><input type="checkbox"'+(sel?' checked':'')+' data-act="chk"'+pidA+'></td>'
      +'<td style="font-weight:500">'+cevenEsc(p.sku)+(p.manual?' <span style="font-size:10px;color:#0071e3;font-weight:600;background:#e8f4ff;padding:1px 5px;border-radius:8px;margin-left:4px">manual</span>':'')+(p.nacIncluded?' <span style="font-size:10px;color:#6e36c8;font-weight:600;background:#f0e8ff;padding:1px 5px;border-radius:8px;margin-left:2px" title="Precio ya nacionalizado">NAC✓</span>':'')+(p.needsReview?' <span style="font-size:10px;color:#c84e00;font-weight:600;background:#fff3e0;padding:1px 5px;border-radius:8px;margin-left:2px" title="No apareció en la última actualización de precios — verificar costo">⚠ Revisar costo</span>':'')+'</td>'
      +'<td class="wrap">'+cevenEsc(p.description)+'</td>'
      +'<td style="text-align:right;color:#6e6e73">USD '+fD(p.sellingPrice)+'</td>'
      +'<td style="text-align:right;color:#6e6e73">USD '+fD(nt)+'</td>'
      +'<td style="text-align:right;font-weight:500">'+dp(sp)+'</td>'
      +'<td style="text-align:center;white-space:nowrap;overflow:visible">'
        +'<button class="bs" data-act="edit"'+pidA+' title="Editar" style="padding:2px 6px;font-size:12px">✎</button> '
        +'<button class="bsr" data-act="del"'+pidA+' title="Eliminar">×</button>'
      +'</td>'
      +'</tr>';
  }
  document.getElementById('catbody').innerHTML = html || '<tr><td colspan="7" style="text-align:center;color:#aeaeb2;padding:24px">Sin resultados</td></tr>';
  _catBindDelegation();
  var cnt=Object.keys(selIds).length;
  document.getElementById('catcount').textContent = filtered.length+' productos · '+cnt+' seleccionados';
  var btn=document.getElementById('addbtn');
  btn.style.display = cnt>0 ? 'inline-block' : 'none';
  btn.textContent = editId!==null ? 'Confirmar cambio' : 'Agregar ('+cnt+')';
  var allSel=filtered.length>0; for(var j=0;j<filtered.length;j++){if(!selIds[filtered[j].id]){allSel=false;break;}}
  document.getElementById('chkall').checked=allSel;
}

// toggleRow() y toggleAll() viven en shared/catalog-core.js.

// Delegación de eventos del catálogo. Reemplaza los onclick inline que llevaban
// el id del producto concatenado: además del riesgo de inyección, ese formato no
// soportaba ids no numéricos (productos manuales).
// Se ata desde renderCat() y no desde una IIFE: si #catbody todavía no existiera
// cuando corre este <script>, la IIFE se rendía en silencio y el catálogo quedaba
// sin ningún handler. cevenDelegate() ata una sola vez aunque se llame en cada
// render (el contenedor sobrevive al innerHTML de sus hijos).
function _catBindDelegation(){
  cevenDelegate('catbody', 'click', function(ev){
    var el = cevenActEl(ev, this);
    if(!el) return;
    var pid = el.getAttribute('data-pid');
    if(pid === null) return;
    var act = el.getAttribute('data-act');
    if(act === 'edit')     editManualProduct(pid);
    else if(act === 'del') deleteManualProduct(pid);
    else                   toggleRow(pid);   // 'row' y 'chk'
  });
}

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
    var p=toAdd[0], nac=(fob||p.nacIncluded) ? 0 : getNac(p);
    for(var i=0;i<items.length;i++){
      if(String(items[i].id)===String(editId)){
        var mgEd = (typeof items[i].itemMargin==='number') ? items[i].itemMargin : mg;
        items[i].sku=p.sku; items[i].description=p.description;
        items[i].sellingBase=p.sellingPrice; items[i].lob=p.lob;
        items[i].itemNac=nac; items[i].salePrice=calcP(p.sellingPrice,nac,mgEd);
        // El flag viaja con el producto: "precio ya nacionalizado" es un dato del
        // artículo, no algo a deducir después de itemNac===0 (que también pasa con FOB).
        items[i].nacIncluded=!!p.nacIncluded;
        items[i].taxes=getIVA(p.lob);
      }
    }
    editId=null;
  } else {
    for(var j=0;j<toAdd.length;j++){
      var p2=toAdd[j], nac2=(fob||p2.nacIncluded) ? 0 : getNac(p2);
      var newItem={id:_nextItemId(),sku:p2.sku,lob:p2.lob,description:p2.description,sellingBase:p2.sellingPrice,itemNac:nac2,itemMargin:mg,salePrice:calcP(p2.sellingPrice,nac2,mg),qty:1,stock:'',taxes:getIVA(p2.lob),nacIncluded:!!p2.nacIncluded};
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
// _qSortKey/_qSortDir viven en shared/quote-core.js.

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

