/* ============================================================
   VISTA DE CATALOGO  ·  Cotizador multimarca
   ------------------------------------------------------------
   El catalogo unificado en pantalla. Es de SOLO LECTURA: no hay
   "Cargar Excel", no hay alta de articulos y no se edita ningun
   precio. Eso se hace en el cotizador de cada marca, que es su
   duenio — y si se pudiera desde dos lados, uno de los dos
   quedaria viejo sin que nadie se entere.

   Lo que si hay es un filtro por MARCA, que es la unica columna
   nueva respecto del catalogo de una marca sola.

   El precio que se muestra es el que va a tener la linea si se
   la agrega: lo calcula el registro (js/marcas.js) con las
   formulas de esa marca. Mostrar otro numero —el costo, por
   ejemplo— seria peor que no mostrar ninguno.

   ── DOS TABLAS, UNA SOLA FILA ────────────────────────────────
   Desde 08/2026 la misma lista se pinta en DOS lados: esta vista
   y la subpantalla flotante que se abre con "+ Agregar producto"
   (js/picker.js), igual que en Poly. Por eso el filtrado
   (_catFiltradosCon), el recorte (_catRecortar) y la fila
   (_catRowHTML) reciben de donde leer en vez de ir a buscar
   '#fsearch' a mano: si cada tabla armara la suya, agregar una
   columna de un lado y olvidarse del otro no daria ningun error,
   solo dos tablas desalineadas.

   Depende de: js/catalogo-multi.js, js/marcas.js, js/quote.js
   (ctxPrecio), js/picker.js (renderPicker, si esta abierta).
   ============================================================ */

/* Normalizacion de la busqueda: sin mayusculas, sin acentos y sin los signos
   que llevan los SKU. Asi "studio x72" encuentra "Studio X72" y "a4lz8aa"
   encuentra "A4LZ8AA#ABM", que es como los tipea el vendedor. */
function _catNorm(s){
  return String(s == null ? '' : s)
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

/* La marca elegida en un juego de chips. Vive en el `data-marca` del CONTENEDOR
   y no en una variable del modulo porque hay dos juegos —el de esta vista y el
   de la flotante—: con un estado compartido, elegir marca en uno le movia el
   filtro al otro. Mismo criterio que _rubroElegido() en poly/js/catalog.js. */
function _marcaElegida(el){
  return (el && el.getAttribute && el.getAttribute('data-marca')) || '';
}

// Los productos que pasan el filtro de marca y el de texto de ESE juego de campos.
function _catFiltradosCon(searchEl, marcaEl){
  var texto = searchEl ? (searchEl.value || '').trim() : '';
  // Cada palabra por separado: "poly studio" tiene que encontrar el producto
  // aunque las dos palabras esten en campos distintos.
  var claves = texto ? texto.split(/\s+/).map(_catNorm).filter(Boolean) : null;
  var marca = _marcaElegida(marcaEl);
  var out = [];
  for(var i=0;i<products.length;i++){
    var p = products[i];
    if(marca && p.brand !== marca) continue;
    if(claves && !_catMatch(p, claves)) continue;
    out.push(p);
  }
  return out;
}

// Los filtros de esta vista. Conserva la firma sin argumentos porque la llaman
// renderCat() y el buscador del HTML.
function _catFiltrados(){
  return _catFiltradosCon(document.getElementById('fsearch'), document.getElementById('fmarca'));
}

// Todas las palabras buscadas tienen que estar en el SKU o la descripcion.
function _catMatch(p, claves){
  var heno = _catNorm((p.sku || '') + ' ' + (p.description || ''));
  for(var i=0;i<claves.length;i++){ if(heno.indexOf(claves[i]) === -1) return false; }
  return true;
}

/* El precio con el que entraria este producto al pedido. Se calcula con el
   registro para que sea EXACTAMENTE el que va a quedar en la linea: si acá se
   mostrara una cuenta propia, el numero cambiaria al agregarlo. */
function _catPrecio(p){
  var reg = cevenMultiMarca(p.brand);
  if(!reg) return null;
  var linea = reg.nuevaLinea(p, ctxPrecio());
  return (linea.salePrice === '' || linea.salePrice == null) ? null : linea.salePrice;
}

/* Los chips de marca. Se pintan TODAS las que el multimarca conoce, incluidas
   las que hoy no tienen ni un producto — esas quedan con "0" y sin poder
   apretarse.

   Antes se escondía la marca vacía, y eso convertía un problema de datos ("el
   catálogo de Poly no bajó") en lo que parecía una limitación del programa ("el
   multimarca no conoce Poly"). Mostrar el cero es lo que permite darse cuenta.

   El chip lleva `data-mk` y el contenedor `data-marca`: con el mismo nombre en
   los dos, el closest() del cableado matchearía además el contenedor y un clic
   en el borde cambiaría el filtro a "" sin que nadie tocara un chip. */
function _pintarFiltroMarcas(el){
  el = el || document.getElementById('fmarca');
  if(!el) return;
  var actual = _marcaElegida(el);
  // Si la marca elegida se quedó sin productos (catálogo que todavía no bajó),
  // se vuelve a "Todas" en vez de dejar la tabla vacía sin explicación.
  if(actual && !(catalogos[actual] || []).length) actual = '';
  el.setAttribute('data-marca', actual);

  var h = '<button type="button" class="pk-rub' + (actual === '' ? ' on' : '') + '" data-mk="">Todas</button>';
  cevenMultiMarcasIds().forEach(function(b){
    var n = (catalogos[b] || []).length;
    // `mkf-<marca>` lo pinta del color de esa marca (ver el <style> de
    // index.html, donde ya viven los colores de cada una).
    h += '<button type="button" class="pk-rub mkf-' + cevenEsc(b) + (actual === b ? ' on' : '') + '"'
       + (n ? '' : ' disabled title="Todavía no bajó el catálogo de esta marca"')
       + ' data-mk="' + cevenEsc(b) + '">'
       + cevenEsc(cevenMultiMarcaLabel(b))
       + (n ? '' : ' · 0') + '</button>';
  });
  el.innerHTML = h;
}

/* Cablea un juego de chips. Delegado y atado una sola vez, porque
   _pintarFiltroMarcas() rehace los botones en cada render. Lo usan esta vista
   (#fmarca) y la flotante (#pk-marca), cada una con su propio callback. */
function bindMarcas(el, alCambiar){
  if(!el || el._mkBound) return;
  el._mkBound = true;
  el.addEventListener('click', function(ev){
    var b = ev.target.closest ? ev.target.closest('[data-mk]') : null;
    if(!b || !el.contains(b)) return;
    var val = b.getAttribute('data-mk');
    // Volver a tocar la activa saca el filtro: el mismo gesto para ida y vuelta.
    el.setAttribute('data-marca', val === el.getAttribute('data-marca') ? '' : val);
    alCambiar();
  });
}

/* ── El recorte, POR MARCA ───────────────────────────────────────────────────
   Hay que limitar cuántas filas se dibujan: el price list de Apple tiene cientos
   de SKUs y pintarlos todos congela la pantalla en cada tecla.

   Pero el tope tiene que ser POR MARCA y no sobre la lista entera. `products` se
   arma marca por marca (Apple primero, ver _catRearmar()), así que un
   `slice(0, 300)` sobre el total devolvía 300 productos de Apple y CERO de Poly
   — la marca entera quedaba del otro lado del corte y la pantalla se leía como
   "el multimarca no conoce Poly". Un tope global es, en una lista ordenada por
   marca, un filtro por marca encubierto.

   Devuelve las filas y cuánto quedó afuera de cada marca, para poder decirlo. */
var CEVEN_CAT_TOPE_MARCA = 150;

function _catRecortar(lista){
  var porMarca = {}, i;
  for(i=0;i<lista.length;i++){
    var b = lista[i].brand || '';
    (porMarca[b] = porMarca[b] || []).push(lista[i]);
  }
  var filas = [], ocultos = [];
  // En el orden del registro, para que la tabla no dependa del orden del Excel.
  var marcas = cevenMultiMarcasIds().filter(function(b){ return porMarca[b]; });
  Object.keys(porMarca).forEach(function(b){ if(marcas.indexOf(b) < 0) marcas.push(b); });
  marcas.forEach(function(b){
    var todas = porMarca[b];
    filas = filas.concat(todas.slice(0, CEVEN_CAT_TOPE_MARCA));
    if(todas.length > CEVEN_CAT_TOPE_MARCA){
      ocultos.push({brand: b, n: todas.length - CEVEN_CAT_TOPE_MARCA});
    }
  });
  return {filas: filas, ocultos: ocultos};
}

/* El contador. Dice qué marca quedó recortada y cuánto: "613 productos · se
   muestran los primeros 300" era verdad pero no explicaba que faltaba una marca
   entera; con el detalle por marca, que falte algo se ve. */
function _catLeyenda(lista, recorte){
  if(!lista.length) return 'Ningún producto coincide con la búsqueda';
  var det = recorte.ocultos.map(function(o){
    return o.n + ' de ' + cevenMultiMarcaLabel(o.brand);
  }).join(' y ');
  return lista.length + (lista.length === 1 ? ' producto' : ' productos')
       + (det ? (' · no se muestran ' + det + ', afiná la búsqueda') : '');
}

/* Una fila de producto. La usan las DOS tablas —esta vista y la flotante— con
   las mismas columnas y el mismo botón, que es lo que las mantiene pegadas.

   El botón va PRIMERO y no al final: es el objetivo del clic, y en la flotante
   la columna de la derecha queda fuera de la vista en un teléfono.

   Las filas se direccionan por `data-pid`, que es el id de la lista unificada
   ('marca|sku'). Es un string, pero sobrevive al round-trip por atributo porque
   productoPorId() compara con String() de los dos lados — y cevenEsc() cubre las
   comillas de un SKU raro venido del Excel. */
function _catRowHTML(p){
  var precio = _catPrecio(p);
  var yaEsta = _enPedido(p);
  var pid = cevenEsc(p.id);
  /* `pk-row` apaga el cursor de mano de `.crow`: el único objetivo de clic es
     el botón. `enq` pinta de verde lo que ya está en el pedido. */
  return '<tr class="crow pk-row' + (yaEsta ? ' enq' : '') + '">'
    + '<td style="text-align:center;overflow:visible">'
      + '<button class="' + (yaEsta ? 'bs cat-quitar' : 'bd cat-sumar') + '"'
        + ' data-act="' + (yaEsta ? 'unq' : 'add') + '" data-pid="' + pid + '"'
        + ' title="' + (yaEsta ? 'Sacar del pedido' : 'Agregar al pedido') + '"'
        + ' style="padding:3px 10px;font-size:13px;line-height:1.2">' + (yaEsta ? '✓' : '+') + '</button>'
    + '</td>'
    + '<td><span class="mk mk-' + cevenEsc(p.brand) + '">' + cevenEsc(cevenMultiMarcaLabel(p.brand)) + '</span></td>'
    + '<td style="font-weight:500;font-size:12px;font-family:monospace">' + cevenEsc(p.sku) + '</td>'
    + '<td class="wrap">' + cevenEsc(p.description) + '</td>'
    + '<td style="text-align:right;white-space:nowrap">'
      + (precio === null
          ? '<span class="sub" title="Sin precio para el nivel elegido: se completa a mano en el pedido">—</span>'
          : cevenEsc(dp(precio)))
    + '</td>'
    + '</tr>';
}

// Lo que se pinta cuando ninguna fila pasa el filtro. Las dos tablas tienen las
// mismas 5 columnas, así que el colspan también es uno solo.
function _catSinResultadosHTML(){
  return '<tr><td colspan="5" style="text-align:center;color:var(--ct3);padding:22px">Sin resultados</td></tr>';
}

function renderCat(){
  var cuerpo = document.getElementById('catbody');
  if(!cuerpo) return;

  _pintarFiltroMarcas(document.getElementById('fmarca'));
  _catPintarEstadoVacio();

  var lista = _catFiltrados();
  var recorte = _catRecortar(lista);

  var html = '';
  for(var i=0;i<recorte.filas.length;i++) html += _catRowHTML(recorte.filas[i]);
  cuerpo.innerHTML = html || _catSinResultadosHTML();

  var cont = document.getElementById('catcount');
  if(cont) cont.textContent = _catLeyenda(lista, recorte);

  _catBindDelegation();

  // La flotante puede estar mostrando la misma lista: si no se repinta, queda
  // con el estado viejo de los botones (renderCat se llama desde varios lados).
  if(typeof renderPicker === 'function') renderPicker();
}

/* Un SKU puede repetirse entre marcas, asi que "ya esta en el pedido" se
   pregunta por marca Y sku: agregar el mismo codigo de Poly no puede quedar
   bloqueado porque exista en Apple.

   Mira SOLO la opcion que se esta editando: el mismo producto puede (y suele)
   estar en las dos alternativas. */
function _enPedido(p){
  var opc = cevenOpcActiva();
  for(var i=0;i<items.length;i++){
    if(items[i].brand === p.brand && items[i].sku === p.sku && cevenOpcDe(items[i]) === opc) return true;
  }
  return false;
}

function _catPintarEstadoVacio(){
  var vacio = document.getElementById('nocat');
  var ui = document.getElementById('catui');
  var hay = products.length > 0;
  if(vacio) vacio.style.display = hay ? 'none' : '';
  if(ui) ui.style.display = hay ? '' : 'none';
}

function _catBindDelegation(){
  bindMarcas(document.getElementById('fmarca'), renderCat);
  cevenDelegate('catbody', 'click', function(ev){
    var el = cevenActEl(ev, this);
    if(!el) return;
    var act = el.getAttribute('data-act'), pid = el.getAttribute('data-pid');
    if(act === 'add')      agregarAlPedido(pid);
    else if(act === 'unq') quitarDelPedido(pid);
  });
}

/* Agrega un producto al pedido. La linea la arma el registro de su marca: es el
   unico lugar donde se decide el precio, para que agregar desde el catalogo y
   agregar desde cualquier otro camino no puedan discrepar. */
function agregarAlPedido(pid){
  var p = productoPorId(pid);
  if(!p){ showToast('Ese producto ya no está en el catálogo.'); return; }
  var reg = cevenMultiMarca(p.brand);
  if(!reg){ showToast('El multimarca todavía no sabe cotizar ' + cevenMultiMarcaLabel(p.brand) + '.'); return; }
  if(_enPedido(p)){ showToast('Ese producto ya está en el pedido.'); return; }

  items.push(_nuevaLineaDeProducto(p));

  // Se vuelve al orden de insercion para que lo recien agregado quede al final
  // y no salte de lugar: mismo criterio que addToQuote() en las marcas.
  _qSortKey = null; _qSortDir = 1;
  renderCat();
  /* Y la grilla del pedido: cambiar de vista NO repinta (ver _navApply() en
     shared/ui-core.js), así que sin esto se agregaban productos desde el
     catálogo y la cotización seguía mostrando la lista vieja hasta que otra
     acción disparara un render. El equivalente de Poly repinta las dos. */
  renderQ();
  showToast('✓ ' + p.description + ' agregado al pedido.');
}

/* Una linea del pedido a partir de un producto del catalogo. Vive acá solo —y
   no duplicada en cada camino de alta— porque es donde se decide el precio: si
   el `+` de la lista y el pegado de SKUs se desincronizaran, un producto valdria
   distinto segun por donde entro. */
function _nuevaLineaDeProducto(p){
  var reg = cevenMultiMarca(p.brand);
  var linea = reg.nuevaLinea(p, ctxPrecio());
  // El id tiene que ser unico dentro del pedido, no del catalogo: dos lineas
  // del mismo SKU en opciones distintas conviven.
  linea.id = Date.now() * 1000 + Math.floor(Math.random() * 1000);
  // La linea nace en la opcion que se esta editando (shared/opciones.js).
  linea.opc = cevenOpcActiva();
  return linea;
}

/* Saca del pedido TODAS las lineas de ese producto. Puede haber mas de una (se
   agrego dos veces, o vino de un pedido copiado), y dejar una a medias
   contradiria el boton, que dice si el producto esta o no esta.

   Solo de la opcion que se esta editando: la otra alternativa no se toca. */
function quitarDelPedido(pid){
  var p = productoPorId(pid);
  if(!p) return;
  var opc = cevenOpcActiva(), antes = items.length;
  items = items.filter(function(it){
    return !(it.brand === p.brand && String(it.sku) === String(p.sku) && cevenOpcDe(it) === opc);
  });
  if(items.length === antes) return;
  renderQ();
  renderCat();
  showToast('Sacado del pedido: ' + p.sku + '.');
}

// Lo llama el buscador del catalogo (oninput).
function handleSearchInput(){ renderCat(); }

function limpiarFiltrosCat(){
  var q = document.getElementById('fsearch');
  if(q) q.value = '';
  var m = document.getElementById('fmarca');
  if(m) m.setAttribute('data-marca', '');
  renderCat();
}
