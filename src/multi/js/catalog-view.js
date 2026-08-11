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

   Depende de: js/catalogo-multi.js, js/marcas.js, js/quote.js
   (ctxPrecio), shared/catalog-core.js (busqueda).
   ============================================================ */

// Marca elegida en el filtro ('' = todas).
var _catMarcaFiltro = '';

/* Normalizacion de la busqueda: sin mayusculas, sin acentos y sin los signos
   que llevan los SKU. Asi "studio x72" encuentra "Studio X72" y "a4lz8aa"
   encuentra "A4LZ8AA#ABM", que es como los tipea el vendedor. */
function _catNorm(s){
  return String(s == null ? '' : s)
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

// Los productos que pasan el filtro de marca y el de texto.
function _catFiltrados(){
  var q = document.getElementById('fsearch');
  var texto = q ? (q.value || '').trim() : '';
  // Cada palabra por separado: "poly studio" tiene que encontrar el producto
  // aunque las dos palabras esten en campos distintos.
  var claves = texto ? texto.split(/\s+/).map(_catNorm).filter(Boolean) : null;
  var out = [];
  for(var i=0;i<products.length;i++){
    var p = products[i];
    if(_catMarcaFiltro && p.brand !== _catMarcaFiltro) continue;
    if(claves && !_catMatch(p, claves)) continue;
    out.push(p);
  }
  return out;
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

function _pintarFiltroMarcas(){
  var box = document.getElementById('fmarca');
  if(!box) return;
  var marcas = cevenMultiMarcasIds().filter(function(b){ return (catalogos[b] || []).length; });
  // data-act además de data-marca: cevenActEl() sube por el DOM buscando
  // data-act, así que sin él el clic no encuentra nada accionable.
  var h = '<button class="pk-rubro' + (_catMarcaFiltro === '' ? ' on' : '') + '" data-act="marca" data-marca="">Todas</button>';
  marcas.forEach(function(b){
    h += '<button class="pk-rubro' + (_catMarcaFiltro === b ? ' on' : '') + '" data-act="marca" data-marca="' + cevenEsc(b) + '">'
       + cevenEsc(cevenMultiMarcaLabel(b)) + '</button>';
  });
  box.innerHTML = h;
}

function filtrarPorMarca(b){
  _catMarcaFiltro = b || '';
  renderCat();
}

function renderCat(){
  var cuerpo = document.getElementById('catbody');
  if(!cuerpo) return;

  _pintarFiltroMarcas();
  _catPintarEstadoVacio();

  var lista = _catFiltrados();
  /* Tope de filas dibujadas. El price list de Apple tiene miles de SKUs y
     pintarlos todos congela la pantalla en cada tecla; el que busca un producto
     mira las primeras. El contador de abajo dice cuantos quedaron afuera para
     que nadie crea que no existen. */
  var TOPE = 300;
  var recortada = lista.slice(0, TOPE);

  var html = '';
  for(var i=0;i<recortada.length;i++){
    var p = recortada[i];
    var precio = _catPrecio(p);
    var yaEsta = _enPedido(p);
    html += '<tr>'
      + '<td><span class="mk mk-' + cevenEsc(p.brand) + '">' + cevenEsc(cevenMultiMarcaLabel(p.brand)) + '</span></td>'
      + '<td style="font-weight:500;font-size:12px;font-family:monospace">' + cevenEsc(p.sku) + '</td>'
      + '<td class="wrap">' + cevenEsc(p.description) + '</td>'
      + '<td style="text-align:right;white-space:nowrap">'
        + (precio === null
            ? '<span class="sub" title="Sin precio para el nivel elegido: se completa a mano en el pedido">—</span>'
            : cevenEsc(dp(precio)))
      + '</td>'
      + '<td style="text-align:center">'
        + (yaEsta
            ? '<span class="sub" title="Ya está en el pedido">✓</span>'
            : '<button class="bs" data-act="add" data-pid="' + cevenEsc(p.id) + '" title="Agregar al pedido">+</button>')
      + '</td>'
      + '</tr>';
  }
  cuerpo.innerHTML = html;

  var cont = document.getElementById('catcount');
  if(cont){
    cont.textContent = lista.length
      ? (lista.length + (lista.length === 1 ? ' producto' : ' productos')
         + (lista.length > TOPE ? (' · se muestran los primeros ' + TOPE + ', afiná la búsqueda') : ''))
      : 'Ningún producto coincide con la búsqueda';
  }
  _catBindDelegation();
}

/* Un SKU puede repetirse entre marcas, asi que "ya esta en el pedido" se
   pregunta por marca Y sku: agregar el mismo codigo de Poly no puede quedar
   bloqueado porque exista en Apple. */
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
  cevenDelegate('catbody', 'click', function(ev){
    var el = cevenActEl(ev, this);
    if(!el) return;
    if(el.getAttribute('data-act') === 'add') agregarAlPedido(el.getAttribute('data-pid'));
  });
  cevenDelegate('fmarca', 'click', function(ev){
    var el = cevenActEl(ev, this);
    if(el && el.getAttribute('data-act') === 'marca') filtrarPorMarca(el.getAttribute('data-marca'));
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

  var linea = reg.nuevaLinea(p, ctxPrecio());
  // El id tiene que ser unico dentro del pedido, no del catalogo: dos lineas
  // del mismo SKU en opciones distintas conviven.
  linea.id = Date.now() * 1000 + Math.floor(Math.random() * 1000);
  // La linea nace en la opcion que se esta editando (shared/opciones.js).
  linea.opc = cevenOpcActiva();
  items.push(linea);

  // Se vuelve al orden de insercion para que lo recien agregado quede al final
  // y no salte de lugar: mismo criterio que addToQuote() en las marcas.
  _qSortKey = null; _qSortDir = 1;
  renderCat();
  showToast('✓ ' + p.description + ' agregado al pedido.');
}

// Lo llama el buscador del catalogo (oninput).
function handleSearchInput(){ renderCat(); }

function limpiarFiltrosCat(){
  var q = document.getElementById('fsearch');
  if(q) q.value = '';
  _catMarcaFiltro = '';
  renderCat();
}
