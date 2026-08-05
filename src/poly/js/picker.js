/* ============================================================================
   SUBPANTALLA DE PRODUCTOS  ·  src/poly/js/picker.js
   ----------------------------------------------------------------------------
   Antes, "+ Agregar producto" llamaba a openCat(), que hace goTo('catalog'): te
   sacaba de la cotización, elegías con checkboxes, apretabas "Agregar (N)" y
   recién al volver veías qué había quedado. Armar una cotización era ir y venir
   a ciegas entre dos pantallas.

   Ahora se abre una capa flotante ENCIMA de la cotización, partida en dos:

     · arriba, el catálogo con un botón `+` por producto (`✓` si ya está);
     · abajo, lo que la cotización ya lleva, con cantidades, total y `×`.

   La mitad de abajo es el punto del rediseño: se ve crecer la cotización sin
   cerrar nada.

   ── QUÉ NO ESTÁ ACÁ ────────────────────────────────────────────────────────
   La vista Catálogo del menú NO se reemplaza: ahí se importa el Excel y se
   crean/editan artículos a mano. Las dos tablas comparten `_catRowHTML()`
   (poly/js/catalog.js) para no despegarse.

   ── DIRECCIONAMIENTO DE FILAS ──────────────────────────────────────────────
   El catálogo referencia sus filas por índice contra `_catRendered` a propósito
   (el id de un producto manual es un string y no sobrevive al round-trip por
   atributo). Con dos tablas vivas hacen falta dos registros: acá es
   `_pickRendered`, direccionado con `data-pi`. Mezclarlos agregaría el producto
   equivocado.

   Depende de: poly/js/catalog.js (_catRowHTML, getFilteredCon,
   _pintarFiltroRubro, agregarUno, quitarDeCotizacion), poly/js/quote.js
   (renderQ, upQty), shared/quote-core.js (rmItem), shared/nav.js.
   ========================================================================== */

var _pickRendered = [];
var _pickerAbierto = false;

function _pickRowAt(i){
  var n = parseInt(i, 10);
  return (isNaN(n) || !_pickRendered[n]) ? null : _pickRendered[n];
}

/* Acá NO se filtra por rol, y es a propósito. La regla de shared/auth.js es que
   un `lector` no puede tocar lo YA GUARDADO ni el pipeline, pero **sí puede
   armar y guardar una cotización nueva desde cero**. Armar la cotización es
   justamente lo que hace esta pantalla, y todo pasa en memoria: el permiso se
   resuelve al guardar, no al elegir productos.

   Estuvo un rato gateado y quedaba incoherente: el `+` de la lista agregaba
   igual (no lo miraba) y el carrito de abajo aparecía sin los controles, así
   que se podía sumar un producto pero no cambiarle la cantidad ni sacarlo. */

/* ── Abrir / cerrar ───────────────────────────────────────────────────────── */
function abrirPicker(){
  var m = document.getElementById('prod-picker');
  if(!m) return;

  if(!products.length){
    /* Sin catálogo cargado no hay nada que elegir. Se manda a la vista que sí
       sabe importarlo, en vez de abrir una capa vacía. */
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

/* ── Render ───────────────────────────────────────────────────────────────── */
function renderPicker(){
  var m = document.getElementById('prod-picker');
  if(!m || !_pickerAbierto) return;   // cerrada: renderCat() igual nos llama

  _pintarFiltroRubro(document.getElementById('pk-rubro'));

  var filtered = getFilteredCon(document.getElementById('pk-search'),
                                document.getElementById('pk-rubro'));
  _pickRendered = filtered;

  var html = '';
  for(var i=0;i<filtered.length;i++) html += _catRowHTML(filtered[i], i, 'data-pi', false);
  document.getElementById('pk-body').innerHTML = html
    || '<tr><td colspan="5" style="text-align:center;color:#aeaeb2;padding:22px">Sin resultados</td></tr>';

  var cnt = document.getElementById('pk-count');
  if(cnt) cnt.textContent = filtered.length + (filtered.length===1?' producto':' productos');

  _pintarCarrito();
}

/* La mitad de abajo: lo que la cotización ya lleva. Se arma de `items`, la misma
   fuente que la tabla de la cotización — no hay estado propio que se pueda
   desfasar. */
function _pintarCarrito(){
  var box = document.getElementById('pk-cart');
  if(!box) return;
  var total = 0, html = '';
  for(var i=0;i<items.length;i++){
    var it = items[i];
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
      /* Sin precio cargado se dice, en vez de mostrar un 0 que parece un precio
         real. Poly deja líneas sin precio a propósito (se tipean a mano). */
      + '<span class="pk-line-imp">'+(sp ? cevenEsc(dp(sub)) : '<i>sin precio</i>')+'</span>'
      + '<button class="pk-del" data-pact="quitar" data-pid="'+idA+'" title="Sacar de la cotización">×</button>'
    + '</div>';
  }

  document.getElementById('pk-cart-n').textContent = items.length;
  box.innerHTML = html || '<div class="pk-vacio">Todavía no agregaste nada. Tocá <b>+</b> en un producto.</div>';
  document.getElementById('pk-total').textContent = items.length ? dp(total) : '—';
}

/* ── Cableado ─────────────────────────────────────────────────────────────────
   Los listeners se atan UNA vez al contenedor, que no se reemplaza: el que se
   repinta es su contenido. */
(function(){
  function wire(){
    var m = document.getElementById('prod-picker');
    if(!m) return;

    // Cerrar: la ×, el botón Listo, o el fondo.
    m.addEventListener('click', function(ev){
      if(ev.target === m || (ev.target.closest && ev.target.closest('[data-pk-cerrar]'))) cerrarPicker();
    });

    // Lista de productos: mismo juego de acciones que el catálogo, pero
    // resolviendo contra _pickRendered.
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

    // Carrito: cantidades y baja.
    var cart = document.getElementById('pk-cart');
    if(cart) cart.addEventListener('click', function(ev){
      var el = ev.target.closest ? ev.target.closest('[data-pact]') : null;
      if(!el || !cart.contains(el)) return;
      var id = el.getAttribute('data-pid');
      var act = el.getAttribute('data-pact');
      if(act === 'quitar'){
        rmItem(id);            // shared/quote-core.js — ya llama a renderQ()
      } else {
        var it = null;
        for(var i=0;i<items.length;i++){ if(String(items[i].id)===String(id)){ it = items[i]; break; } }
        if(!it) return;
        var q = it.qty + (act === 'mas' ? 1 : -1);
        if(q < 1){ rmItem(id); }   // bajar de 1 saca la línea: es lo que se espera
        else upQty(id, q);         // poly/js/quote.js — ya llama a renderQ()
      }
      renderPicker();
    });

    // Filtros propios de la flotante.
    var s = document.getElementById('pk-search');
    if(s){
      s.addEventListener('input', renderPicker);
      s.addEventListener('paste', function(ev){ handleSearchPaste(ev, s); });
    }
    /* Globitos de categoría: el elegido se guarda en el contenedor. Delegado
       porque _pintarFiltroRubro() rehace los botones en cada render. */
    var r = document.getElementById('pk-rubro');
    if(r) r.addEventListener('click', function(ev){
      var b = ev.target.closest ? ev.target.closest('[data-rub]') : null;
      if(!b || !r.contains(b)) return;
      var val = b.getAttribute('data-rub');
      // Volver a tocar el activo saca el filtro: el mismo gesto para ida y vuelta.
      r.setAttribute('data-rubro', val === r.getAttribute('data-rubro') ? '' : val);
      renderPicker();
    });
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire);
  else wire();
})();
