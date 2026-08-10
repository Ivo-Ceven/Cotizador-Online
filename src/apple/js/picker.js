/* ============================================================================
   SUBPANTALLA DE PRODUCTOS  ·  src/apple/js/picker.js
   ----------------------------------------------------------------------------
   Antes, "+ Agregar producto" llamaba a openCat(), que hace goTo('catalog'): te
   sacaba de la cotización, elegías con checkboxes, apretabas "Agregar (N)" y
   recién al volver veías qué había quedado. Armar una cotización era ir y venir
   a ciegas entre dos pantallas.

   Ahora se abre una capa flotante ENCIMA de la cotización, partida en dos:

     · arriba, el catálogo con un botón `+` por producto (`✓` si ya está);
     · abajo, lo que la cotización ya lleva, con cantidades, total y `×`.

   La mitad de abajo es el punto del rediseño: se ve crecer la cotización sin
   cerrar nada. Es el mismo que estrenó Poly el 05/08/2026.

   ── QUÉ NO ESTÁ ACÁ ────────────────────────────────────────────────────────
   La vista Catálogo del menú NO se reemplaza: ahí se importan los price list, se
   crean/editan artículos a mano y se limpian los SKU por sufijo. Las dos tablas
   comparten `_catRowHTML()` (apple/js/catalog.js) para no despegarse.

   ── DIRECCIONAMIENTO DE FILAS ──────────────────────────────────────────────
   Las dos tablas direccionan por `data-pid` (el id del producto), así que no
   hace falta un registro propio de lo pintado: el id es único en `products` y
   sobrevive al round-trip por atributo, incluso el de un artículo manual, que es
   un string ('pm_1730…_3'). Cada tabla tiene su propio listener delegado.

   ── PRECIOS ────────────────────────────────────────────────────────────────
   La fila muestra costo, costo nacionalizado y precio de venta con el margen
   global del momento, igual que la vista Catálogo: los tres salen de
   `_catCalc()` + `_catRowHTML()`, así que no pueden discrepar con lo que después
   entra en la cotización.

   Depende de: apple/js/catalog.js (_catRowHTML, _catCalc, getFilteredCon,
   _catPintarFiltros, _prodPorId, agregarUno, quitarDeCotizacion),
   apple/js/quote.js (renderQ, upQty), shared/quote-core.js (rmItem),
   shared/nav.js.
   ========================================================================== */

var _pickerAbierto = false;

/* ── Abrir / cerrar ───────────────────────────────────────────────────────── */
function abrirPicker(){
  var m = document.getElementById('prod-picker');
  if(!m) return;

  if(!products.length){
    /* Sin price list cargado no hay nada que elegir. Se manda a la vista que sí
       sabe importarlo, en vez de abrir una capa vacía. */
    showToast('Todavía no hay price list cargado. Importá los Excel primero.');
    goTo('catalog');
    return;
  }

  _pickerAbierto = true;
  m.style.display = 'flex';
  // Los filtros se pintan al abrir: el catálogo pudo cambiar (import, alta a
  // mano, limpieza de SKU) desde la última vez que se abrió la flotante.
  _catPintarFiltros(document.getElementById('pk-model'), document.getElementById('pk-country'));
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

  var filtered = getFilteredCon(document.getElementById('pk-search'),
                                document.getElementById('pk-model'),
                                document.getElementById('pk-country'));
  var calc = _catCalc();
  var html = '';
  for(var i=0;i<filtered.length;i++) html += _catRowHTML(filtered[i], calc, {agregar:true});
  document.getElementById('pk-body').innerHTML = html
    || '<tr><td colspan="6" style="text-align:center;color:#aeaeb2;padding:22px">Sin resultados</td></tr>';

  var cnt = document.getElementById('pk-count');
  if(cnt) cnt.textContent = filtered.length + (filtered.length===1?' producto':' productos');

  _pintarCarrito();
}

/* La mitad de abajo: lo que la cotización ya lleva. Se arma de `items`, la misma
   fuente que la tabla de la cotización — no hay estado propio que se pueda
   desfasar. Las garantías CevenCare no se listan acá: se agregan desde su propia
   pantalla y se ven en la cotización. */
function _pintarCarrito(){
  var box = document.getElementById('pk-cart');
  if(!box) return;
  // Solo la opción que se está editando: el carrito tiene que ser lo mismo que
  // muestra la grilla de abajo, o el ＋/✓ de la lista diría una cosa y el
  // carrito otra.
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
        + '<button type="button" class="pk-step" data-pact="menos" data-pid="'+idA+'" title="Restar uno">−</button>'
        + '<b>'+cevenEsc(it.qty)+'</b>'
        + '<button type="button" class="pk-step" data-pact="mas" data-pid="'+idA+'" title="Sumar uno">+</button>'
      + '</span>'
      + '<span class="pk-line-imp">'+(sp ? cevenEsc(dp(sub)) : '<i>sin precio</i>')+'</span>'
      + '<button type="button" class="pk-del" data-pact="quitar" data-pid="'+idA+'" title="Sacar de la cotización">×</button>'
    + '</div>';
  }

  document.getElementById('pk-cart-n').textContent = enCarrito.length;
  box.innerHTML = html || '<div class="pk-vacio">Todavía no agregaste nada. Tocá <b>+</b> en un producto.</div>';
  document.getElementById('pk-total').textContent = enCarrito.length ? dp(total) : '—';
  // Con dos opciones abiertas hay que decir a cuál se está agregando.
  var rot = document.getElementById('pk-cart-opc');
  if(rot) rot.textContent = cevenOpcHayB() ? (' · Opción ' + cevenOpcLetra(cevenOpcActiva())) : '';
}

/* ── Cableado ─────────────────────────────────────────────────────────────────
   Los listeners se atan UNA vez al contenedor, que no se reemplaza: el que se
   repinta es su contenido.

   Acá NO se filtra por rol, y es a propósito. La regla de shared/auth.js es que
   un `lector` no puede tocar lo YA GUARDADO ni el pipeline, pero **sí puede
   armar y guardar una cotización nueva desde cero**, que es justamente lo que
   hace esta pantalla: todo pasa en memoria y el permiso se resuelve al guardar. */
(function(){
  function wire(){
    var m = document.getElementById('prod-picker');
    if(!m) return;

    // Cerrar: la ×, el botón Listo, o el fondo.
    m.addEventListener('click', function(ev){
      if(ev.target === m || (ev.target.closest && ev.target.closest('[data-pk-cerrar]'))) cerrarPicker();
    });

    // Lista de productos: el ＋/✓ agrega o saca en el acto.
    var body = document.getElementById('pk-body');
    if(body) body.addEventListener('click', function(ev){
      var el = ev.target.closest ? ev.target.closest('[data-act]') : null;
      if(!el || !body.contains(el)) return;
      var p = _prodPorId(el.getAttribute('data-pid'));
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
        else upQty(id, q);         // apple/js/quote.js — ya llama a renderQ()
      }
      renderPicker();
    });

    // Filtros propios de la flotante.
    var s = document.getElementById('pk-search');
    if(s){
      s.addEventListener('input', renderPicker);
      s.addEventListener('paste', function(ev){ handleSearchPaste(ev, s); });
    }
    var mo = document.getElementById('pk-model');   if(mo) mo.addEventListener('change', renderPicker);
    var co = document.getElementById('pk-country'); if(co) co.addEventListener('change', renderPicker);
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire);
  else wire();
})();
