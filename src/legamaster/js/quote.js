// _qSortKey/_qSortDir, sortQBy() y getSortedItems() viven en shared/quote-core.js.

/* Total de una opción. Legamaster no tiene garantías: son solo los productos.
   Lo consume la barra de opciones (shared/opciones.js) y el pie de la tabla. */
function totalDeOpcion(n){
  var t = 0, its = cevenOpcFiltrar(items, n);
  for(var i=0;i<its.length;i++) t += (its[i].salePrice||0)*(its[i].qty||0);
  return t;
}

function renderQ() {
  var opc = cevenOpcActiva();
  cevenOpcPintarBarra({1: totalDeOpcion(1), 2: totalDeOpcion(2)});
  var visibles = cevenOpcFiltrar(items, opc);
  var gt=0; for(var i=0;i<visibles.length;i++) gt+=(visibles[i].salePrice||0)*visibles[i].qty;
  var list = cevenOpcFiltrar(getSortedItems(), opc);
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
    var idA = cevenEsc(it.id);
    html+='<tr>'
      +'<td style="font-weight:500">'+cevenEsc(it.sku)+'</td>'
      +'<td class="wrap">'+cevenEsc(it.description)+'</td>'
      +'<td style="text-align:right;white-space:nowrap">'
        +'<span class="qstepper">'
          +'<button class="qstep" data-act="qmenos" data-id="'+idA+'" title="Restar uno">−</button>'
          +'<input class="si" type="number" min="1" value="'+cevenEsc(it.qty)+'" data-act="qty" data-id="'+idA+'">'
          +'<button class="qstep" data-act="qmas" data-id="'+idA+'" title="Sumar uno">+</button>'
        +'</span>'
      +'</td>'
      +'<td style="overflow:visible">'+tierSelectHTML(it)+'</td>'
      +'<td style="text-align:right;white-space:nowrap;overflow:visible">'
        +'<div style="display:inline-flex;align-items:center;gap:4px">'
          +'<span style="font-size:11px;color:#6e6e73">'+pricePfx+'</span>'
          +'<input class="si no-spin" type="text" inputmode="decimal" value="'+cevenEsc(priceRaw)+'" placeholder="0.00" style="width:96px;text-align:right;font-size:13px" data-act="price" data-id="'+idA+'">'
        +'</div>'
      +'</td>'
      +'<td style="text-align:right;font-weight:500">'+cevenEsc(dp(lineTotal))+'</td>'
      /* IVA de la línea: sale directo de la columna IVA del Excel del proveedor
         (legamaster/js/catalog.js). Se muestra, no se edita, y por ahora no
         entra en ningún cálculo. */
      +'<td style="text-align:center;white-space:nowrap;font-size:12px;color:#6e6e73">'+cevenEsc(cevenFormatoIVA(it.iva)||'—')+'</td>'
      +'<td style="text-align:center"><input class="si" type="text" value="'+cevenEsc(it.stock||'')+'" placeholder="—" style="width:100%" data-act="nota" data-id="'+idA+'"></td>'
      +'<td style="text-align:center;white-space:nowrap">'
      +'<button class="q-del" data-act="rm" data-id="'+idA+'" title="Eliminar de la cotización">🗑</button>'
      +'</td>'
      +'</tr>';
  }
  html+='<tr><td colspan="9" style="padding:9px 10px 9px 10px;display:flex;gap:8px;flex-wrap:wrap">'
    +'<button class="al" onclick="abrirPicker()"><span style="font-size:18px;line-height:1;font-weight:300">+</span> Agregar producto</button>'
    +'<button class="al" onclick="abrirAsistente()">✨ Asistente IA</button>'
    +'</td></tr>';
  if(visibles.length){
    html+='<tr>'
      +'<td colspan="5" style="text-align:right;color:#6e6e73;font-size:13px;font-weight:500;padding:11px 10px;background:#f5f5f7;border-top:1px solid #d2d2d7">Total</td>'
      +'<td style="text-align:right;font-size:15px;font-weight:600;padding:11px 10px;background:#f5f5f7;border-top:1px solid #d2d2d7">'+dp(gt)+'</td>'
      +'<td colspan="3" style="background:#f5f5f7;border-top:1px solid #d2d2d7"></td>'
      +'</tr>';
  }
  document.getElementById('qbody').innerHTML=html;
  pintarTierGlobal();
  _qBindDelegation();
  _pintarAvisoOpcion(opc);
}

/* Aviso sobre la tabla cuando se está editando la opción que NO es la vigente. */
function _pintarAvisoOpcion(opc){
  var box = document.getElementById('opc-aviso-box');
  if(!box) return;
  if(!cevenOpcHayB() || opc === cevenOpcEfectiva()){ box.innerHTML = ''; return; }
  box.innerHTML = '<div class="opc-aviso">Estás editando la <b>Opción '+cevenOpcLetra(opc)+'</b>, '
    + 'que no es la vigente: al pipeline sigue yendo la <b>Opción '+cevenOpcLetra(cevenOpcEfectiva())+'</b>.</div>';
}

function _qBindDelegation(){
  cevenDelegate('qbody', 'click', function(ev){
    var el = cevenActEl(ev, this);
    if(!el) return;
    var act = el.getAttribute('data-act'), id = el.getAttribute('data-id');
    if(act === 'rm')  rmItem(id);
    else if(act === 'qmas' || act === 'qmenos'){
      for(var i=0;i<items.length;i++){
        if(String(items[i].id) === String(id)){
          upQty(id, items[i].qty + (act === 'qmas' ? 1 : -1));
          break;
        }
      }
    }
  });
  cevenDelegate('qbody', 'change', function(ev){
    var el = cevenActEl(ev, this);
    if(!el) return;
    var act = el.getAttribute('data-act'), id = el.getAttribute('data-id');
    if(act === 'qty')        upQty(id, el.value);
    else if(act === 'price') upUnitPrice(id, el.value);
    else if(act === 'tier')  onTierLineaChange(id, el.value);
    else if(act === 'nota')  upField(id, 'stock', el.value);
  });
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
  var newP = cevenParseMoney(v);
  if(isNaN(newP) || newP < 0){ renderQ(); return; }
  var priceUSD = newP;
  if(getCur()==='ARS'){
    var tc = getTC();
    if(tc <= 0){ showErr('Cargá el tipo de cambio antes de tipear precios en ARS.'); renderQ(); return; }
    priceUSD = newP / tc;
  }
  for(var i=0;i<items.length;i++){
    if(String(items[i].id)===String(id)) items[i].salePrice = Math.round(priceUSD * 100) / 100;
  }
  if(typeof marcarManual === 'function') marcarManual(id);
  renderQ();
}

// rmItem(), editItem(), openCat() y upField() viven en shared/quote-core.js.
