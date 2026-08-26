/* ============================================================================
   SUBPANTALLA DE PRODUCTOS  ·  src/legamaster/js/picker.js
   ----------------------------------------------------------------------------
   Capa flotante ENCIMA de la cotización, partida en dos:

     · arriba, el catálogo con un botón `+` por producto (`✓` si ya está);
     · abajo, lo que la cotización ya lleva, con cantidades, total y `×`.

   Clonado de poly/js/picker.js — sin cambios de diseño, es brand-agnóstico
   salvo por las funciones que llama (`_catRowHTML`, `agregarUno`, etc., que
   viven en legamaster/js/catalog.js).

   Depende de: legamaster/js/catalog.js (_catRowHTML, getFilteredCon,
   _pintarFiltroRubro, agregarUno, quitarDeCotizacion), legamaster/js/quote.js
   (renderQ, upQty), shared/quote-core.js (rmItem), shared/nav.js.
   ========================================================================== */

var _pickRendered = [];
var _pickerAbierto = false;

function _pickRowAt(i){
  var n = parseInt(i, 10);
  return (isNaN(n) || !_pickRendered[n]) ? null : _pickRendered[n];
}

/* Acá NO se filtra por rol, a propósito: un `lector` puede armar y guardar una
   cotización nueva desde cero (ver shared/auth.js), y todo pasa en memoria. */

function abrirPicker(){
  var m = document.getElementById('prod-picker');
  if(!m) return;

  if(!products.length){
    if(typeof showToast === 'function') showToast('Todavía no hay catálogo cargado. Importá el Excel primero.');
    goTo('catalog');
    return;
  }

  _pickerAbierto = true;
  m.style.display = 'flex';
  renderPicker();
  if(window.cevenNav) cevenNav.openOverlay(cerrarPicker);
  var s = document.getElementById('pk-search');
  if(s) setTimeout(function(){ s.focus(); }, 30);
}

function cerrarPicker(){
  var m = document.getElementById('prod-picker');
  if(!m) return;
  _pickerAbierto = false;
  m.style.display = 'none';
  if(window.cevenNav) cevenNav.notifyClosed(cerrarPicker);
}

function renderPicker(){
  var m = document.getElementById('prod-picker');
  if(!m || !_pickerAbierto) return;

  _pintarFiltroRubro(document.getElementById('pk-rubro'));

  var filtered = getFilteredCon(document.getElementById('pk-search'),
                                document.getElementById('pk-rubro'));
  _pickRendered = filtered;

  var html = '';
  for(var i=0;i<filtered.length;i++) html += _catRowHTML(filtered[i], i, 'data-pi', {agregar:true});
  document.getElementById('pk-body').innerHTML = html
    || '<tr><td colspan="6" style="text-align:center;color:#aeaeb2;padding:22px">Sin resultados</td></tr>';

  var cnt = document.getElementById('pk-count');
  if(cnt) cnt.textContent = filtered.length + (filtered.length===1?' producto':' productos');

  _pintarCarrito();
}

function _pintarCarrito(){
  var box = document.getElementById('pk-cart');
  if(!box) return;
  var enCarrito = cevenOpcFiltrar(items, cevenOpcActiva());
  var total = 0, html = '';
  for(var i=0;i<enCarrito.length;i++){
    var it = enCarrito[i];
    var sp = (it.salePrice==='' || it.salePrice==null) ? 0 : it.salePrice;
    var sub = sp * it.qty;
    total += sub;
    var idA = cevenEsc(it.id);
    html += '<div class="pk-line">'
      + '<span class="pk-line-sku" title="'+cevenEsc(it.description)+'">'+cevenEsc(it.sku)+'</span>'
      + '<span class="pk-qty">'
        + '<button class="pk-step" data-pact="menos" data-pid="'+idA+'" title="Restar uno">−</button>'
        + '<b>'+cevenEsc(it.qty)+'</b>'
        + '<button class="pk-step" data-pact="mas" data-pid="'+idA+'" title="Sumar uno">+</button>'
      + '</span>'
      + '<span class="pk-line-imp">'+(sp ? cevenEsc(dp(sub)) : '<i>sin precio</i>')+'</span>'
      + '<button class="pk-del" data-pact="quitar" data-pid="'+idA+'" title="Sacar de la cotización">×</button>'
    + '</div>';
  }

  document.getElementById('pk-cart-n').textContent = enCarrito.length;
  box.innerHTML = html || '<div class="pk-vacio">Todavía no agregaste nada. Tocá <b>+</b> en un producto.</div>';
  document.getElementById('pk-total').textContent = enCarrito.length ? dp(total) : '—';
  var rot = document.getElementById('pk-cart-opc');
  if(rot) rot.textContent = cevenOpcHayB() ? (' · Opción ' + cevenOpcLetra(cevenOpcActiva())) : '';
}

(function(){
  function wire(){
    var m = document.getElementById('prod-picker');
    if(!m) return;

    m.addEventListener('click', function(ev){
      if(ev.target === m || (ev.target.closest && ev.target.closest('[data-pk-cerrar]'))) cerrarPicker();
    });

    var body = document.getElementById('pk-body');
    if(body) body.addEventListener('click', function(ev){
      var el = ev.target.closest ? ev.target.closest('[data-act]') : null;
      if(!el || !body.contains(el)) return;
      var p = _pickRowAt(el.getAttribute('data-pi'));
      if(!p) return;
      var act = el.getAttribute('data-act');
      if(act === 'addone')   agregarUno(p);
      else if(act === 'unq') quitarDeCotizacion(p);
    });

    var cart = document.getElementById('pk-cart');
    if(cart) cart.addEventListener('click', function(ev){
      var el = ev.target.closest ? ev.target.closest('[data-pact]') : null;
      if(!el || !cart.contains(el)) return;
      var id = el.getAttribute('data-pid');
      var act = el.getAttribute('data-pact');
      if(act === 'quitar'){
        rmItem(id);
      } else {
        var it = null;
        for(var i=0;i<items.length;i++){ if(String(items[i].id)===String(id)){ it = items[i]; break; } }
        if(!it) return;
        var q = it.qty + (act === 'mas' ? 1 : -1);
        if(q < 1){ rmItem(id); }
        else upQty(id, q);
      }
      renderPicker();
    });

    var s = document.getElementById('pk-search');
    if(s){
      s.addEventListener('input', renderPicker);
      s.addEventListener('paste', function(ev){ handleSearchPaste(ev, s); });
    }
    bindRubros(document.getElementById('pk-rubro'), renderPicker);
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire);
  else wire();
})();
