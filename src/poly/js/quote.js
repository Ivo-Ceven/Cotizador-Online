function sortQBy(key){
  if(_qSortKey === key) _qSortDir *= -1;
  else { _qSortKey = key; _qSortDir = 1; }
  renderQ();
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

function renderQ() {
  var gt=0; for(var i=0;i<items.length;i++) gt+=(items[i].salePrice||0)*items[i].qty;
  var list = getSortedItems();
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
    var sp = (it.salePrice===''||it.salePrice==null) ? '' : it.salePrice;
    var priceRaw = (getCur()==='ARS' && sp!=='') ? Math.round(sp*getTC()) : sp;
    var pricePfx = getCur()==='ARS' ? 'ARS' : 'USD';
    var lineTotal = (sp===''?0:sp) * it.qty;
    html+='<tr>'
      +'<td style="font-weight:500">'+it.sku+'</td>'
      +'<td class="wrap">'+it.description+'</td>'
      +'<td style="text-align:right"><input class="si" type="number" min="1" value="'+it.qty+'" style="width:48px" onchange="upQty(\''+it.id+'\',this.value)"></td>'
      +'<td style="text-align:right;white-space:nowrap;overflow:visible">'
        +'<div style="display:inline-flex;align-items:center;gap:4px">'
          +'<span style="font-size:11px;color:#6e6e73">'+pricePfx+'</span>'
          +'<input class="si no-spin" type="text" inputmode="decimal" value="'+priceRaw+'" placeholder="0.00" style="width:96px;text-align:right;font-size:13px" onchange="upUnitPrice(\''+it.id+'\',this.value)">'
        +'</div>'
      +'</td>'
      +'<td style="text-align:right;font-weight:500">'+dp(lineTotal)+'</td>'
      +'<td style="text-align:center"><input class="si" type="text" value="'+(it.stock||'')+'" placeholder="—" style="width:100%" onchange="upField(\''+it.id+'\',\'stock\',this.value)"></td>'
      +'<td style="text-align:center;white-space:nowrap">'
      +'<button class="bs" onclick="openQuoteItemEdit(\''+it.id+'\')" title="Editar SKU/descripción/precio (solo esta cotización)" style="padding:2px 6px;font-size:12px;margin-right:3px">✎</button>'
      +'<button class="bsr" onclick="rmItem(\''+it.id+'\')" title="Eliminar">×</button>'
      +'</td>'
      +'</tr>';
  }
  html+='<tr><td colspan="7" style="padding:9px 10px"><button class="al" onclick="openCat()"><span style="font-size:18px;line-height:1;font-weight:300">+</span> Agregar producto</button></td></tr>';
  if(items.length){
    html+='<tr>'
      +'<td colspan="4" style="text-align:right;color:#6e6e73;font-size:13px;font-weight:500;padding:11px 10px;background:#f5f5f7;border-top:1px solid #d2d2d7">Total</td>'
      +'<td style="text-align:right;font-size:15px;font-weight:600;padding:11px 10px;background:#f5f5f7;border-top:1px solid #d2d2d7">'+dp(gt)+'</td>'
      +'<td colspan="2" style="background:#f5f5f7;border-top:1px solid #d2d2d7"></td>'
      +'</tr>';
  }
  document.getElementById('qbody').innerHTML=html;
}

function upQty(id,v){
  for(var i=0;i<items.length;i++){
    if(String(items[i].id)===String(id)){ items[i].qty=Math.max(1,parseInt(v)||1); }
  }
  renderQ();
}

// Carga manual del precio unitario — sin fórmula, sin margen: el valor tipeado ES el precio.
function upUnitPrice(id, v){
  if(String(v||'').trim()===''){
    for(var j=0;j<items.length;j++){ if(String(items[j].id)===String(id)) items[j].salePrice=''; }
    renderQ(); return;
  }
  // cevenParseMoney (shared/safe.js): antes se borraban TODOS los puntos, así que
  // reeditar un precio con decimales lo multiplicaba por 100.
  var newP = cevenParseMoney(v);
  if(isNaN(newP) || newP < 0){ renderQ(); return; }
  var priceUSD = newP;
  if(getCur()==='ARS'){
    var tc = getTC();
    // TC inválido: guardar el número ARS como si fueran USD sería un ×1200 mudo.
    if(tc <= 0){ showErr('Cargá el tipo de cambio antes de tipear precios en ARS.'); renderQ(); return; }
    priceUSD = newP / tc;
  }
  for(var i=0;i<items.length;i++){
    if(String(items[i].id)===String(id)) items[i].salePrice = Math.round(priceUSD * 100) / 100;
  }
  renderQ();
}
function upField(id,f,v){ for(var i=0;i<items.length;i++){if(String(items[i].id)===String(id)){items[i][f]=v;}} }

// ── Edición de ítem desde la cotización (no toca el catálogo) ──
var _qieEditId = null;

function openQuoteItemEdit(id){
  var it = null;
  for(var i=0;i<items.length;i++){ if(String(items[i].id)===String(id)){ it=items[i]; break; } }
  if(!it) return;
  _qieEditId = id;
  document.getElementById('qie-sku').value   = it.sku || '';
  document.getElementById('qie-desc').value  = it.description || '';
  document.getElementById('qie-price').value = (it.salePrice===''||it.salePrice==null) ? '' : it.salePrice;
  document.getElementById('qie-nota').value  = it.stock || '';
  document.getElementById('qie-err').style.display = 'none';
  var _m = document.getElementById('qitem-edit-modal');
  var _wasOpen = _m.style.display === 'flex';
  _m.style.display = 'flex';
  if(window.cevenNav && !_wasOpen) cevenNav.openOverlay(closeQuoteItemEdit);
}

function closeQuoteItemEdit(){
  _qieEditId = null;
  document.getElementById('qitem-edit-modal').style.display = 'none';
  if(window.cevenNav) cevenNav.notifyClosed(closeQuoteItemEdit);
}

function saveQuoteItemEdit(){
  var sku      = document.getElementById('qie-sku').value.trim();
  var desc     = document.getElementById('qie-desc').value.trim();
  var priceStr = document.getElementById('qie-price').value.trim();
  var nota     = document.getElementById('qie-nota').value.trim();
  var errEl    = document.getElementById('qie-err');
  if(!sku || !desc){
    errEl.textContent = 'Completá SKU y Descripción.';
    errEl.style.display = 'block';
    return;
  }
  var price = priceStr === '' ? '' : parseFloat(priceStr);
  if(priceStr !== '' && (isNaN(price) || price < 0)){
    errEl.textContent = 'El precio debe ser un número válido.';
    errEl.style.display = 'block';
    return;
  }
  for(var i=0;i<items.length;i++){
    if(String(items[i].id)===String(_qieEditId)){
      items[i].sku         = sku;
      items[i].description = desc;
      items[i].salePrice   = price;
      items[i].stock       = nota;
      break;
    }
  }
  closeQuoteItemEdit();
  renderQ();
}

function rmItem(id){ items=items.filter(function(x){return String(x.id)!==String(id);}); renderQ(); }
function editItem(id){ editId=id; selIds={}; goTo('catalog'); if(products.length) renderCat(); }
function openCat(){ editId=null; selIds={}; goTo('catalog'); if(products.length) renderCat(); }
