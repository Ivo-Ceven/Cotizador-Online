function sortQBy(key){
  if(_qSortKey === key) _qSortDir *= -1;
  else { _qSortKey = key; _qSortDir = 1; }
  renderQ();
  renderWarranties();
}

function getSortedItems(){
  var list = items.slice();
  if(_qSortKey){
    list.sort(function(a,b){
      var va, vb;
      if(_qSortKey==='desc'){ va=(a.description||'').toLowerCase(); vb=(b.description||'').toLowerCase(); return _qSortDir*(va<vb?-1:va>vb?1:0); }
      if(_qSortKey==='sku'){  va=(a.sku||'').toLowerCase();         vb=(b.sku||'').toLowerCase();         return _qSortDir*(va<vb?-1:va>vb?1:0); }
      if(_qSortKey==='price'){va=a.salePrice||0;                    vb=b.salePrice||0;                    return _qSortDir*(va-vb); }
      return 0;
    });
  }
  return list;
}

function getSortedWarranties(){
  // Construir mapa: _fromProduct → posición en lista ordenada
  var sorted = getSortedItems();
  var orderMap = {};
  for(var i=0;i<sorted.length;i++){
    var sig = sorted[i].sku + '|' + sorted[i].description;
    if(orderMap[sig] === undefined) orderMap[sig] = i;
  }
  // Devolver warrantyItems con índice original para que los handlers funcionen
  var indexed = warrantyItems.map(function(w, idx){ return {w:w, origIdx:idx}; });
  indexed.sort(function(a,b){
    var pa = orderMap[a.w._fromProduct] !== undefined ? orderMap[a.w._fromProduct] : 9999;
    var pb = orderMap[b.w._fromProduct] !== undefined ? orderMap[b.w._fromProduct] : 9999;
    return pa !== pb ? pa - pb : a.origIdx - b.origIdx;
  });
  return indexed;
}

function renderQ() {
  var gt=0; for(var i=0;i<items.length;i++) gt+=items[i].salePrice*items[i].qty;
  // Aplicar sort a una copia (no muta items originales)
  var list = items.slice();
  if(_qSortKey){
    list.sort(function(a,b){
      var va, vb;
      if(_qSortKey==='desc'){ va=(a.description||'').toLowerCase(); vb=(b.description||'').toLowerCase(); return _qSortDir*(va<vb?-1:va>vb?1:0); }
      if(_qSortKey==='sku'){  va=(a.sku||'').toLowerCase();         vb=(b.sku||'').toLowerCase();         return _qSortDir*(va<vb?-1:va>vb?1:0); }
      if(_qSortKey==='price'){va=a.salePrice||0;                    vb=b.salePrice||0;                    return _qSortDir*(va-vb); }
      return 0;
    });
  }
  // Actualizar indicadores visuales en headers
  var ths = document.querySelectorAll('#qbody-wrap th.qsrt');
  for(var t=0;t<ths.length;t++){
    ths[t].classList.remove('asc','desc');
    var k = ths[t].getAttribute('onclick').replace('sortQBy(\'','').replace('\')','');
    if(k===_qSortKey) ths[t].classList.add(_qSortDir===1?'asc':'desc');
  }
  var html='';
  for(var i=0;i<list.length;i++){
    var it=list[i];
    var priceRaw = getCur()==='ARS' ? Math.round(it.salePrice*getTC()) : it.salePrice;
    var pricePfx = getCur()==='ARS' ? 'ARS' : 'USD';
    html+='<tr>'
      +'<td style="font-weight:500">'+it.sku+'</td>'
      +'<td class="wrap">'+it.description+'</td>'
      +'<td style="text-align:right"><input class="si" type="number" min="1" value="'+it.qty+'" style="width:48px" onchange="upQty(\''+it.id+'\',this.value)"></td>'
      +'<td style="text-align:center"><input class="si" type="number" min="0" max="80" step="0.25" value="'+(typeof it.itemMargin==='number'?it.itemMargin.toFixed(2):(it.itemMargin||''))+'" style="width:64px" onchange="upMargin(\''+it.id+'\',this.value)"></td>'
      +'<td style="text-align:right;white-space:nowrap;overflow:visible">'
        +'<div style="display:inline-flex;align-items:center;gap:4px">'
          +'<span style="font-size:11px;color:#6e6e73">'+pricePfx+'</span>'
          +'<input class="si no-spin" type="text" inputmode="decimal" value="'+priceRaw+'" style="width:96px;text-align:right;font-size:13px" onchange="upSalePriceDirect(\''+it.id+'\',this.value)" onblur="renderQ()">'
        +'</div>'
      +'</td>'
      +'<td style="text-align:right;font-weight:500">'+dp(it.salePrice*it.qty)+'</td>'
      +'<td style="text-align:center"><input class="si" type="text" value="'+((it.taxes||'').replace(/(\d),(\d)/g,"$1.$2"))+'" placeholder="—" style="width:70px" onchange="upField(\''+it.id+'\',\'taxes\',this.value)"></td>'
      +'<td style="text-align:center"><input class="si" type="text" value="'+(it.stock||'')+'" placeholder="—" style="width:60px" onchange="upField(\''+it.id+'\',\'stock\',this.value)"></td>'
      +'<td style="text-align:center;white-space:nowrap">'
      +'<button class="bs" onclick="openQuoteItemEdit(\''+it.id+'\')" title="Editar SKU/descripción/precio (solo esta cotización)" style="padding:2px 6px;font-size:12px;margin-right:3px">✎</button>'
      +'<button class="bsr" onclick="rmItem(\''+it.id+'\')" title="Eliminar">×</button>'
      +'</td>'
      +'</tr>';
  }
  html+='<tr><td colspan="9" style="padding:9px 10px"><button class="al" onclick="openCat()"><span style="font-size:18px;line-height:1;font-weight:300">+</span> Agregar producto</button></td></tr>';
  if(items.length){
    html+='<tr>'
      +'<td colspan="4" style="text-align:right;color:#6e6e73;font-size:13px;font-weight:500;padding:11px 10px;background:#f5f5f7;border-top:1px solid #d2d2d7">Total</td>'
      +'<td style="text-align:right;font-size:15px;font-weight:600;padding:11px 10px;background:#f5f5f7;border-top:1px solid #d2d2d7">'+dp(gt)+'</td>'
      +'<td colspan="4" style="background:#f5f5f7;border-top:1px solid #d2d2d7"></td>'
      +'</tr>';
  }
  document.getElementById('qbody').innerHTML=html;
}

// Familia Mac de una descripción/equipo (para vincular garantías ↔ productos)
function _macFamilyOf(s){
  if(!s) return null;
  s = s.toLowerCase();
  if(s.includes('ipad')||s.includes('iphone')) return null;
  if(s.includes('macbook neo')||/\bneo\b/.test(s)) return 'neo';
  if(s.includes('mac studio')) return 'studio';
  if(s.includes('mac mini')) return 'mini';
  if(s.includes('imac')) return 'imac';
  var isMBP = s.includes('macbook pro')||/\bmbp(ro)?\b/.test(s);
  var isMBA = s.includes('macbook air')||/\bmba(ir)?\b/.test(s);
  function findSize(str){
    var m = str.match(/\b(\d{2})(?:\s*(?:in\b|-?\s*inch\b|"|”|pulg))/i);
    if(m) return m[1];
    m = str.match(/(\d{2})/);
    return m ? m[1] : null;
  }
  var size = findSize(s);
  if(isMBP){ if(size==='16') return 'mbp16'; if(size==='13') return 'mbp13'; return 'mbp14'; }
  if(isMBA){ if(size==='15') return 'mba15'; return 'mba13'; }
  return null;
}

function upQty(id,v){
  var changedItem = null;
  for(var i=0;i<items.length;i++){
    if(String(items[i].id)===String(id)){
      items[i].qty=Math.max(1,parseInt(v)||1);
      changedItem = items[i];
    }
  }
  // Sincronizar cantidad de las garantías vinculadas a este producto
  if(changedItem){
    var marker  = changedItem.sku + '|' + changedItem.description;
    var prodFam = _macFamilyOf(changedItem.description);
    var changedW = false;
    for(var k=0;k<warrantyItems.length;k++){
      var w = warrantyItems[k];
      // Vínculo directo (auto-sugerida) o por familia (CevenCare manual)
      var sameFam = prodFam && _macFamilyOf(w.equipo || w.equipo_desc || '') === prodFam;
      if(w._fromProduct === marker || sameFam){
        w.cantidad = changedItem.qty;
        changedW = true;
      }
    }
    if(changedW) renderWarranties();
  }
  renderQ();
}
function upMargin(id,v){ for(var i=0;i<items.length;i++){if(String(items[i].id)===String(id)){var m=Math.min(80,Math.max(0,parseFloat(v)||0));m=Math.round(m*100)/100;items[i].itemMargin=m;items[i].manualMargin=true;items[i].salePrice=calcP(items[i].sellingBase,items[i].itemNac,m);}} renderQ(); }

function upNac(id, v){
  // Modificar % Nacionalización solo para esta línea/cotización (no afecta el preset global)
  var nac = parseFloat(v);
  if(isNaN(nac) || nac < 0) nac = 0;
  if(nac > 100) nac = 100;
  for(var i=0;i<items.length;i++){
    if(String(items[i].id)===String(id)){
      items[i].itemNac = nac;
      items[i].nacOverride = true; // marca que fue editado manualmente en esta cotización
      // Si el item tiene margen manual, recalcular precio manteniendo el margen
      // Si no, recalcular precio normalmente con el margen actual
      var mg = (typeof items[i].itemMargin === 'number') ? items[i].itemMargin : getM();
      items[i].salePrice = calcP(items[i].sellingBase, nac, mg);
    }
  }
  renderQ();
}
function calcMargenFromPrice(base, nac, price){
  // Margen exacto a partir de un precio de venta dado. Fórmula inversa de calcP.
  if(!price || price <= 0) return 0;
  var costoNac = base * (1 + (nac||0)/100);
  if(costoNac <= 0) return 0;
  var mg = (1 - costoNac/price) * 100;
  if(mg < 0) mg = 0;
  if(mg > 99) mg = 99;
  return Math.round(mg * 100) / 100; // 2 decimales
}

function upSalePrice(id,delta){
  // +/- de a 1 USD; el margen se recalcula al valor exacto
  for(var i=0;i<items.length;i++){
    if(String(items[i].id)===String(id)){
      var newP = Math.max(0, Math.round(items[i].salePrice) + delta);
      items[i].salePrice = newP;
      items[i].itemMargin = calcMargenFromPrice(items[i].sellingBase, items[i].itemNac, newP);
      items[i].manualMargin = true;
    }
  }
  renderQ();
}

function upSalePriceDirect(id, v){
  // Carga manual del precio unitario; calcula margen exacto con 2 decimales
  // Limpiar separadores de miles (puntos en es-AR) y aceptar coma decimal
  var clean = String(v||'').replace(/\./g, '').replace(/,/g, '.');
  var newP = parseFloat(clean);
  if(isNaN(newP) || newP < 0) return;
  for(var i=0;i<items.length;i++){
    if(String(items[i].id)===String(id)){
      var priceUSD = newP;
      if(getCur()==='ARS'){
        var tc = getTC();
        if(tc>0) priceUSD = newP / tc;
      }
      priceUSD = Math.round(priceUSD * 100) / 100;
      items[i].salePrice = priceUSD;
      items[i].itemMargin = calcMargenFromPrice(items[i].sellingBase, items[i].itemNac, priceUSD);
      items[i].manualMargin = true;
    }
  }
  renderQ();
}
function upField(id,f,v){ for(var i=0;i<items.length;i++){if(String(items[i].id)===String(id)){items[i][f]=v;}} }

// ── Edición de ítem desde la cotización (no toca el price list) ──
var _qieEditId = null;

function openQuoteItemEdit(id){
  var it = null;
  for(var i=0;i<items.length;i++){ if(String(items[i].id)===String(id)){ it=items[i]; break; } }
  if(!it) return;
  _qieEditId = id;
  // Poblar modelos desde el price list
  var models = [];
  for(var j=0;j<products.length;j++){ if(products[j].modelCol && models.indexOf(products[j].modelCol)<0) models.push(products[j].modelCol); }
  // Preservar el modelo actual del ítem aunque no exista en el price list,
  // así no cae silenciosamente en la primera opción (p. ej. "AirTag").
  if(it.lob && models.indexOf(it.lob)<0) models.push(it.lob);
  models.sort();
  // Opción vacía al inicio: si it.lob está vacío o no calza con nada, el select
  // debe mostrar "Sin modelo" en vez de caer en la primera opción real del catálogo.
  var modelOptions = '<option value=""'+(!it.lob?' selected':'')+'>— Sin modelo —</option>'
    + models.map(function(v){ return '<option'+(v===it.lob?' selected':'')+'>'+v+'</option>'; }).join('');
  document.getElementById('qie-model').innerHTML = modelOptions;
  var isNacIncluded = !!(it.nacIncluded) || it.itemNac === 0;
  document.getElementById('qie-sku').value        = it.sku || '';
  document.getElementById('qie-desc').value       = it.description || '';
  document.getElementById('qie-price').value      = it.sellingBase || '';
  document.getElementById('qie-nac').value        = typeof it.itemNac === 'number' ? it.itemNac : '';
  document.getElementById('qie-nac').disabled     = isNacIncluded;
  document.getElementById('qie-nacincluded').checked = isNacIncluded;
  document.getElementById('qie-price-lbl').textContent = isNacIncluded ? 'Precio nacionalizado (USD)' : 'Precio de costo (USD)';
  document.getElementById('qie-err').style.display = 'none';
  var m = document.getElementById('qitem-edit-modal');
  var _wasOpen = m.style.display === 'flex';
  m.style.display = 'flex';
  if(window.cevenNav && !_wasOpen) cevenNav.openOverlay(closeQuoteItemEdit);
}

function closeQuoteItemEdit(){
  _qieEditId = null;
  document.getElementById('qitem-edit-modal').style.display = 'none';
  if(window.cevenNav) cevenNav.notifyClosed(closeQuoteItemEdit);
}

function saveQuoteItemEdit(){
  var sku   = document.getElementById('qie-sku').value.trim();
  var desc  = document.getElementById('qie-desc').value.trim();
  var price = parseFloat(document.getElementById('qie-price').value);
  var errEl = document.getElementById('qie-err');
  if(!sku || !desc || isNaN(price) || price <= 0){
    errEl.textContent = 'Completá SKU, Descripción y Precio.';
    errEl.style.display = 'block';
    return;
  }
  var model       = document.getElementById('qie-model').value;
  var nacIncluded = document.getElementById('qie-nacincluded').checked;
  var nacVal      = document.getElementById('qie-nac').value.trim();
  for(var i=0;i<items.length;i++){
    if(String(items[i].id)===String(_qieEditId)){
      // Si el select quedó en "Sin modelo" (model vacío), preservar el modelo
      // que ya tenía el ítem en vez de borrarlo — evita perder la familia/IVA
      // cuando el modelo guardado no coincide con ninguna opción del catálogo.
      var finalLob = model || items[i].lob;
      var nac = nacIncluded ? 0
              : nacVal !== '' ? Math.max(0, Math.min(100, parseFloat(nacVal)||0))
              : getNac({lob: finalLob, modelCol: finalLob, description: desc});
      items[i].sku         = sku;
      items[i].description = desc;
      items[i].sellingBase = price;
      items[i].lob         = finalLob;
      items[i].itemNac     = nac;
      items[i].nacIncluded = nacIncluded;
      items[i].salePrice   = calcP(price, nac, items[i].itemMargin);
      items[i].taxes       = finalLob ? getIVA(finalLob) : items[i].taxes;
      break;
    }
  }
  closeQuoteItemEdit();
  renderQ();
}
function rmItem(id){ items=items.filter(function(x){return String(x.id)!==String(id);}); renderQ(); }
function editItem(id){ editId=id; selIds={}; goTo('catalog'); if(products.length) renderCat(); }
function openCat(){ editId=null; selIds={}; goTo('catalog'); if(products.length) renderCat(); }

