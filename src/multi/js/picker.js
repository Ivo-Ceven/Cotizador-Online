/* ============================================================================
   SUBPANTALLA DE PRODUCTOS  ·  src/multi/js/picker.js
   ----------------------------------------------------------------------------
   Antes, "+ Agregar producto" llamaba a openCat(), que hace goTo('catalog'): te
   sacaba del pedido, elegías en otra pantalla y recién al volver veías qué había
   quedado. Armar un pedido multimarca era ir y venir a ciegas entre dos
   pantallas — y acá duele más que en una marca sola, porque un pedido mixto se
   arma salteando entre marcas.

   Ahora se abre una capa flotante ENCIMA del pedido, partida en dos, igual que
   en Poly y en Apple:

     · arriba, el catálogo unificado con un `+` por producto (`✓` si ya está),
       con el filtro por MARCA que es lo propio del multimarca;
     · abajo, lo que el pedido ya lleva, con su marca, cantidades, total y `×`.

   La mitad de abajo es el punto del rediseño: se ve crecer el pedido sin cerrar
   nada, y con el chip de marca en cada línea se ve además cómo se va a repartir
   al emitir.

   ── QUÉ NO ESTÁ ACÁ ────────────────────────────────────────────────────────
   La vista Catálogo del menú NO se reemplaza: ahí se ve el catálogo entero, se
   lo actualiza contra Supabase y se ve de cuándo es. Las dos tablas comparten
   _catRowHTML(), _catFiltradosCon() y _catRecortar() (js/catalog-view.js) para
   no despegarse.

   Depende de: js/catalog-view.js, js/quote.js (renderQ, upQty),
   js/catalogo-multi.js (productoPorId), shared/quote-core.js (rmItem),
   shared/opciones.js, shared/nav.js.
   ========================================================================== */

var _pickerAbierto = false;

/* ── Abrir / cerrar ───────────────────────────────────────────────────────── */
function abrirPicker(){
  var m = document.getElementById('prod-picker');
  if(!m) return;

  if(!products.length){
    /* Sin catálogo no hay nada que elegir. Se manda a la vista Catálogo, que es
       la que explica de dónde sale (de cada marca) y tiene el botón para volver
       a bajarlo — abrir una capa vacía no diría ninguna de las dos cosas. */
    if(typeof showToast === 'function') showToast('Todavía no hay catálogo: abrí el cotizador de cada marca al menos una vez para que se sincronice.');
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

  var chips = document.getElementById('pk-marca');
  _pintarFiltroMarcas(chips);

  var lista = _catFiltradosCon(document.getElementById('pk-search'), chips);
  var recorte = _catRecortar(lista);

  var html = '';
  for(var i=0;i<recorte.filas.length;i++) html += _catRowHTML(recorte.filas[i]);
  document.getElementById('pk-body').innerHTML = html || _catSinResultadosHTML();

  var cnt = document.getElementById('pk-count');
  if(cnt) cnt.textContent = _catLeyenda(lista, recorte);

  _pintarCarrito();
}

/* La mitad de abajo: lo que el pedido ya lleva. Se arma de `items`, la misma
   fuente que la grilla del pedido — no hay estado propio que se pueda desfasar.

   Cada línea lleva su chip de marca. En una marca sola sobraría; acá es el dato
   que dice a qué cotización va a bajar esa línea al emitir. */
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
    total += sp * it.qty;
    var idA = cevenEsc(it.id);
    html += '<div class="pk-line">'
      + '<span class="mk mk-'+cevenEsc(it.brand)+'">'+cevenEsc(cevenMultiMarcaLabel(it.brand))+'</span>'
      + '<span class="pk-line-sku" title="'+cevenEsc(it.description)+'">'+cevenEsc(it.sku)+'</span>'
      + '<span class="pk-qty">'
        + '<button class="pk-step" data-pact="menos" data-pid="'+idA+'" title="Restar uno">−</button>'
        + '<b>'+cevenEsc(it.qty)+'</b>'
        + '<button class="pk-step" data-pact="mas" data-pid="'+idA+'" title="Sumar uno">+</button>'
      + '</span>'
      /* Sin precio cargado se dice, en vez de mostrar un 0 que parece un precio
         real. Poly deja líneas sin precio a propósito (se tipean a mano) y esas
         líneas llegan tal cual al pedido multimarca. */
      + '<span class="pk-line-imp">'+(sp ? cevenEsc(dp(sp * it.qty)) : '<i>sin precio</i>')+'</span>'
      + '<button class="pk-del" data-pact="quitar" data-pid="'+idA+'" title="Sacar del pedido">×</button>'
    + '</div>';
  }

  document.getElementById('pk-cart-n').textContent = enCarrito.length;
  box.innerHTML = html || '<div class="pk-vacio">Todavía no agregaste nada. Tocá <b>+</b> en un producto.</div>';
  document.getElementById('pk-total').textContent = enCarrito.length ? dp(total) : '—';
  // Con dos opciones abiertas hay que decir a cuál se está agregando.
  var rot = document.getElementById('pk-cart-opc');
  if(rot) rot.textContent = cevenOpcHayB() ? (' · Opción ' + cevenOpcLetra(cevenOpcActiva())) : '';
}

/* ── PEGADO MASIVO DE SKUs ────────────────────────────────────────────────────
   Pegar una columna de SKUs desde un mail o un Excel y que entren al pedido de
   una. En una marca sola esto vive en shared/catalog-core.js, que el multimarca
   no carga: ese archivo arrastra la selección con checkboxes y el alta manual de
   artículos, dos cosas que acá no existen (el catálogo es de solo lectura).

   Lo propio del multimarca es la AMBIGÜEDAD: el mismo SKU podría existir en dos
   marcas. Con el filtro de marca puesto se resuelve solo; sin filtro se toma la
   primera en el orden del registro y se avisa cuál, porque agregar la línea de
   la marca equivocada la manda a la cotización equivocada al emitir. */
function _pickPaste(ev, inputEl){
  var texto = (ev.clipboardData || window.clipboardData).getData('text');
  if(!texto) return;
  // Un solo término: es una búsqueda normal, se deja pegar y se filtra.
  if(!/[\n\t,;]/.test(texto.trim())){ setTimeout(renderPicker, 0); return; }
  ev.preventDefault();

  var tokens = texto.split(/[\n\t,;]+/)
    .map(function(s){ return s.trim(); })
    .filter(function(s){ return s.length > 0; });
  if(!tokens.length) return;

  var marca = _marcaElegida(document.getElementById('pk-marca'));
  var agregados = 0, yaEstaban = 0, noEncontrados = [], ambiguos = [];

  for(var i=0;i<tokens.length;i++){
    var candidatos = _pickPorSku(tokens[i], marca);
    if(!candidatos.length){ noEncontrados.push(tokens[i]); continue; }
    var p = candidatos[0];
    if(candidatos.length > 1) ambiguos.push(p.sku + ' → ' + cevenMultiMarcaLabel(p.brand));
    if(_enPedido(p)){ yaEstaban++; continue; }
    if(!cevenMultiMarca(p.brand)) continue;   // marca que el registro no sabe cotizar
    items.push(_nuevaLineaDeProducto(p));
    agregados++;
  }

  if(inputEl) inputEl.value = '';
  if(agregados){
    _qSortKey = null; _qSortDir = 1;   // que entren en el orden en que se pegaron
    renderQ();
  }
  renderPicker();

  var msg = [];
  if(agregados)          msg.push('✓ ' + agregados + ' agregados al pedido');
  if(yaEstaban)          msg.push(yaEstaban + ' ya estaban');
  if(noEncontrados.length) msg.push('⚠ ' + noEncontrados.length + ' no encontrados');
  if(ambiguos.length)    msg.push('en 2 marcas: ' + ambiguos.join(', '));
  if(msg.length && typeof showToast === 'function') showToast(msg.join(' · '));
}

// Los productos con ese SKU exacto. Con marca elegida, solo los de esa marca.
function _pickPorSku(sku, marca){
  var t = String(sku || '').trim().toLowerCase(), out = [];
  for(var i=0;i<products.length;i++){
    if(marca && products[i].brand !== marca) continue;
    if(String(products[i].sku || '').toLowerCase() === t) out.push(products[i]);
  }
  return out;
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

    // Lista de productos: el mismo juego de acciones que la vista Catálogo,
    // porque es la misma fila (_catRowHTML).
    var body = document.getElementById('pk-body');
    if(body) body.addEventListener('click', function(ev){
      var el = ev.target.closest ? ev.target.closest('[data-act]') : null;
      if(!el || !body.contains(el)) return;
      var act = el.getAttribute('data-act'), pid = el.getAttribute('data-pid');
      if(act === 'add')      agregarAlPedido(pid);
      else if(act === 'unq') quitarDelPedido(pid);
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
        else upQty(id, q);         // multi/js/quote.js — ya llama a renderQ()
      }
      renderPicker();
    });

    // Filtros propios de la flotante.
    var s = document.getElementById('pk-search');
    if(s){
      s.addEventListener('input', renderPicker);
      s.addEventListener('paste', function(ev){ _pickPaste(ev, s); });
    }
    // Chips de marca (el cableado es compartido, ver js/catalog-view.js).
    bindMarcas(document.getElementById('pk-marca'), renderPicker);
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire);
  else wire();
})();
