// _qSortKey/_qSortDir, sortQBy() y getSortedItems() viven en shared/quote-core.js.

/* Total de una opción. Poly no tiene garantías: son solo los productos. Lo
   consume la barra de opciones (shared/opciones.js), que no conoce los arrays de
   esta marca, y el propio renderQ para el pie de la tabla. */
function totalDeOpcion(n){
  var t = 0, its = cevenOpcFiltrar(items, n);
  for(var i=0;i<its.length;i++) t += (its[i].salePrice||0)*(its[i].qty||0);
  return t;
}

function renderQ() {
  // La grilla muestra SOLO la opción que se está editando. Las líneas de la otra
  // siguen en `items` y se guardan igual: lo que cambia es qué se ve y qué suma.
  var opc = cevenOpcActiva();
  cevenOpcPintarBarra({1: totalDeOpcion(1), 2: totalDeOpcion(2)});
  var visibles = cevenOpcFiltrar(items, opc);
  var gt=0; for(var i=0;i<visibles.length;i++) gt+=(visibles[i].salePrice||0)*visibles[i].qty;
  var list = cevenOpcFiltrar(getSortedItems(), opc);
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
    // SKU y descripción salen del catálogo, que se sincroniza desde Supabase:
    // van escapados sí o sí (una descripción de Excel con <img onerror=...> se
    // ejecutaba en la pantalla de todo el equipo).
    var idA = cevenEsc(it.id);
    html+='<tr>'
      +'<td style="font-weight:500">'+cevenEsc(it.sku)+'</td>'
      +'<td class="wrap">'+cevenEsc(it.description)+'</td>'
      /* Cantidad con − y +. El input queda: escribir 12 de una es más rápido que
         apretar doce veces, y los botones cubren el ajuste de a uno, que es el
         caso normal. Bajar de 1 no hace nada — para sacar la línea está la
         papelera, y que el − la borre de sorpresa sería otra cosa. */
      +'<td style="text-align:right;white-space:nowrap">'
        +'<span class="qstepper">'
          +'<button class="qstep" data-act="qmenos" data-id="'+idA+'" title="Restar uno">−</button>'
          +'<input class="si" type="number" min="1" value="'+cevenEsc(it.qty)+'" data-act="qty" data-id="'+idA+'">'
          +'<button class="qstep" data-act="qmas" data-id="'+idA+'" title="Sumar uno">+</button>'
        +'</span>'
      +'</td>'
      // Nivel de precio de esta línea (poly/js/tiers.js). Cada opción muestra su
      // precio: el orden de los niveles NO implica cuál es más caro.
      +'<td style="overflow:visible">'+tierSelectHTML(it)+'</td>'
      +'<td style="text-align:right;white-space:nowrap;overflow:visible">'
        +'<div style="display:inline-flex;align-items:center;gap:4px">'
          +'<span style="font-size:11px;color:#6e6e73">'+pricePfx+'</span>'
          +'<input class="si no-spin" type="text" inputmode="decimal" value="'+cevenEsc(priceRaw)+'" placeholder="0.00" style="width:96px;text-align:right;font-size:13px" data-act="price" data-id="'+idA+'">'
        +'</div>'
      +'</td>'
      +'<td style="text-align:right;font-weight:500">'+cevenEsc(dp(lineTotal))+'</td>'
      /* IVA de la línea. Se muestra, no se edita: sale del "Programa fiscal" del
         Excel del ERP (10,5 % si dice reducido, 21 % si no — ver
         poly/js/catalog.js) y por ahora no entra en ningún cálculo. */
      +'<td style="text-align:center;white-space:nowrap;font-size:12px;'
        +(cevenFormatoIVA(it.iva)===CEVEN_IVA_REDUCIDO?'color:#7a5800;font-weight:600':'color:#6e6e73')+'">'
        +cevenEsc(cevenFormatoIVA(it.iva)||'—')+'</td>'
      +'<td style="text-align:center"><input class="si" type="text" value="'+cevenEsc(it.stock||'')+'" placeholder="—" style="width:100%" data-act="nota" data-id="'+idA+'"></td>'
      /* Una sola acción: sacar la línea. Antes había además un ✎ que abría el
         modal de edición de ítem; se sacó porque en esta tabla ya se editan a
         mano la cantidad, el nivel, el precio y la nota, y lo único que quedaba
         detrás del lápiz era cambiarle el SKU y la descripción a una línea, que
         es raro y confundía con "editar el producto del catálogo". */
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

/* Aviso sobre la tabla cuando se está editando la opción que NO es la vigente.
   Sin esto, se carga media cotización en la B, se agrega al pipeline y el monto
   que ve el equipo es el de la A — sin ninguna pista en pantalla de por qué. */
function _pintarAvisoOpcion(opc){
  var box = document.getElementById('opc-aviso-box');
  if(!box) return;
  if(!cevenOpcHayB() || opc === cevenOpcEfectiva()){ box.innerHTML = ''; return; }
  box.innerHTML = '<div class="opc-aviso">Estás editando la <b>Opción '+cevenOpcLetra(opc)+'</b>, '
    + 'que no es la vigente: al pipeline sigue yendo la <b>Opción '+cevenOpcLetra(cevenOpcEfectiva())+'</b>.</div>';
}

// Los ids de ítem viajan en data-id y vuelven como string; upQty/rmItem/… ya
// comparan con String(...) === String(id), así que no hace falta convertirlos.
function _qBindDelegation(){
  cevenDelegate('qbody', 'click', function(ev){
    var el = cevenActEl(ev, this);
    if(!el) return;
    var act = el.getAttribute('data-act'), id = el.getAttribute('data-id');
    if(act === 'rm')  rmItem(id);
    /* Los pasos de cantidad leen del ítem y no del input: el valor del DOM
       puede estar a medio tipear, y un `parseInt` de "1" mientras alguien
       escribe "12" haría que el + salte a 2 en vez de a 13. */
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
  /* Escribir un precio a mano saca a la línea de cualquier nivel: si no, el
     próximo cambio del selector global le pisaría el número recién escrito.
     Ver poly/js/tiers.js. */
  if(typeof marcarManual === 'function') marcarManual(id);
  renderQ();
}

/* Acá vivía el modal de edición de ítem (openQuoteItemEdit / saveQuoteItemEdit
   + #qitem-edit-modal). Se sacó el 05/08/2026 junto con el botón ✎ de la fila:
   la cantidad, el nivel, el precio y la nota se editan en la propia tabla, y lo
   único que quedaba detrás del lápiz era cambiarle el SKU y la descripción a una
   línea suelta — raro, y se confundía con editar el producto del catálogo.
   Apple SÍ lo conserva: allá el ✎ sigue en la fila. */

// rmItem(), editItem(), openCat() y upField() viven en shared/quote-core.js.
