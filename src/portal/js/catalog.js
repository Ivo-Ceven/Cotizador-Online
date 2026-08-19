/* ============================================================
   PORTAL · catalog.js
   ------------------------------------------------------------
   El catálogo de la marca activa (ya con precio, calculado por
   portal-catalogo con el tier/margen del cliente) y el carrito
   del pedido en curso.

   El precio que se ve y se guarda en el carrito es SIEMPRE
   "precioCeven" — lo que Ceven le cotiza al canal. El markup de
   reventa se aplica solo como PREVIEW (pricing-client.js) al
   mostrar el total; nunca se manda al servidor como si fuera el
   precio real: portal-emitir vuelve a calcular precioCeven server
   -side y el markup se manda como % aparte.

   Depende de: state.js, session.js (cevenAuthedFetch), shared/
   safe.js (cevenEsc), shared/notify.js (showToast).
   ============================================================ */

function _portalCatNorm(s){
  return String(s == null ? '' : s)
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

function _portalCatFiltrados(){
  var el = document.getElementById('pcat-search');
  var texto = el ? (el.value || '').trim() : '';
  var claves = texto ? texto.split(/\s+/).map(_portalCatNorm).filter(Boolean) : null;
  if(!claves) return _portalCatalogo;
  return _portalCatalogo.filter(function(p){
    var hay = _portalCatNorm((p.sku || '') + ' ' + (p.description || '') + ' ' + (p.category || ''));
    for(var i=0;i<claves.length;i++){ if(hay.indexOf(claves[i]) === -1) return false; }
    return true;
  });
}

var CEVEN_PORTAL_CAT_TOPE = 200;

function _portalCatRowHTML(p){
  var enCarrito = _portalCarritoBuscar(p.sku);
  var pid = cevenEsc(p.sku);
  return '<tr class="crow' + (enCarrito ? ' enq' : '') + '">'
    + '<td style="text-align:center">'
      + (enCarrito
          ? '<button class="bs" data-act="quitar" data-sku="' + pid + '" style="padding:3px 10px;font-size:13px">✓</button>'
          : '<button class="bd" data-act="agregar" data-sku="' + pid + '" style="padding:3px 10px;font-size:13px">+</button>')
    + '</td>'
    + '<td style="font-weight:500;font-size:12px;font-family:monospace">' + pid + '</td>'
    + '<td class="wrap">' + cevenEsc(p.description) + (p.category ? ' <span class="sub">· ' + cevenEsc(p.category) + '</span>' : '') + '</td>'
    + '<td style="text-align:right;white-space:nowrap">' + cevenEsc(_portalFmt(p.price)) + '</td>'
    + '</tr>';
}

function _portalCatRender(){
  var cuerpo = document.getElementById('pcat-body');
  if(!cuerpo) return;
  var lista = _portalCatFiltrados();
  var recortada = lista.slice(0, CEVEN_PORTAL_CAT_TOPE);
  var html = '';
  for(var i=0;i<recortada.length;i++) html += _portalCatRowHTML(recortada[i]);
  cuerpo.innerHTML = html || '<tr><td colspan="4" style="text-align:center;color:var(--ct3);padding:22px">Sin resultados</td></tr>';

  var cont = document.getElementById('pcat-count');
  if(cont){
    var extra = lista.length > recortada.length ? (' · se muestran los primeros ' + CEVEN_PORTAL_CAT_TOPE + ', afiná la búsqueda') : '';
    cont.textContent = lista.length + (lista.length === 1 ? ' producto' : ' productos') + extra;
  }
}

function _portalCatAgregar(sku){
  var p = _portalCatalogo.filter(function(x){ return x.sku === sku; })[0];
  if(!p) return;
  var linea = _portalCarritoBuscar(sku);
  if(linea){ linea.qty += 1; } else {
    _portalCarrito.push({sku: p.sku, description: p.description, qty: 1, precioCeven: p.price});
  }
  _portalCatRender();
  _portalCarritoRender();
}

function _portalCatQuitar(sku){
  _portalCarrito = _portalCarrito.filter(function(it){ return it.sku !== sku; });
  _portalCatRender();
  _portalCarritoRender();
}

function _portalCarritoSetQty(sku, qty){
  var linea = _portalCarritoBuscar(sku);
  if(!linea) return;
  qty = parseInt(qty, 10);
  linea.qty = (isFinite(qty) && qty > 0) ? Math.min(qty, 500) : 1;
  _portalCarritoRender();
}

function _portalCarritoRender(){
  var cuerpo = document.getElementById('pcarrito-body');
  if(!cuerpo) return;
  var markup = _portalMarkupActivo();
  if(!_portalCarrito.length){
    cuerpo.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--ct3);padding:16px">Todavía no agregaste productos</td></tr>';
  } else {
    cuerpo.innerHTML = _portalCarrito.map(function(it){
      var reventa = cevenPortalPrecioReventa(it.precioCeven, markup);
      return '<tr>'
        + '<td class="wrap">' + cevenEsc(it.description) + '<div class="sub" style="font-family:monospace">' + cevenEsc(it.sku) + '</div></td>'
        + '<td style="text-align:center"><input type="number" min="1" max="500" value="' + it.qty + '" data-sku="' + cevenEsc(it.sku) + '" class="pcarrito-qty" style="width:56px;text-align:center"></td>'
        + '<td style="text-align:right;white-space:nowrap">' + cevenEsc(_portalFmt(it.precioCeven)) + '</td>'
        + '<td style="text-align:right;white-space:nowrap;font-weight:600">' + cevenEsc(_portalFmt(reventa * it.qty)) + '</td>'
        + '<td style="text-align:center"><button class="bs" data-act="quitar-carrito" data-sku="' + cevenEsc(it.sku) + '" style="padding:2px 8px">×</button></td>'
        + '</tr>';
    }).join('');
  }

  var totalCeven = _portalCarritoTotal();
  var totalReventa = cevenPortalPrecioReventa(totalCeven, markup);
  var elCeven = document.getElementById('pcarrito-total-ceven');
  var elReventa = document.getElementById('pcarrito-total-reventa');
  var elMarkup = document.getElementById('pcarrito-markup');
  if(elCeven) elCeven.textContent = _portalFmt(totalCeven);
  if(elReventa) elReventa.textContent = _portalFmt(totalReventa);
  if(elMarkup) elMarkup.textContent = markup ? ('+' + markup + '%') : 'sin margen configurado';

  var btnEmitir = document.getElementById('pbtn-emitir');
  if(btnEmitir) btnEmitir.disabled = !_portalCarrito.length;
}

/* ── Cambiar de marca ─────────────────────────────────────────────────── */
function _portalElegirMarca(brand){
  if(_portalCarrito.length && brand !== _portalMarca){
    if(!confirm('Cambiar de marca vacía el carrito actual (no se mezclan pedidos de dos marcas). ¿Seguir?')) return;
  }
  _portalMarca = brand;
  _portalCarrito = [];
  var titulo = document.getElementById('pcat-marca-actual');
  if(titulo) titulo.textContent = brand === 'apple' ? 'Apple' : 'Poly';
  _portalGoTo('catalogo');
  _portalCatCargar();
}

function _portalCatCargar(){
  var cuerpo = document.getElementById('pcat-body');
  if(cuerpo) cuerpo.innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--ct3);padding:22px">Cargando catálogo…</td></tr>';
  cevenAuthedFetch(SUPABASE_URL + '/functions/v1/portal-catalogo', {
    method: 'POST',
    body: JSON.stringify({brand: _portalMarca})
  }).then(function(resp){
    _portalCatalogo = (resp && resp.products) || [];
    _portalCatRender();
    _portalCarritoRender();
    if(resp && resp.aviso) showToast(resp.aviso);
  }).catch(function(err){
    var msg = (err && err.message) || 'No se pudo cargar el catálogo.';
    if(cuerpo) cuerpo.innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--ct3);padding:22px">' + cevenEsc(msg) + '</td></tr>';
    showToast(msg);
  });
}

function _portalCatBind(){
  cevenDelegate('pcat-body', 'click', function(ev){
    var el = cevenActEl(ev, this);
    if(!el) return;
    var act = el.getAttribute('data-act'), sku = el.getAttribute('data-sku');
    if(act === 'agregar') _portalCatAgregar(sku);
    else if(act === 'quitar') _portalCatQuitar(sku);
  });
  cevenDelegate('pcarrito-body', 'click', function(ev){
    var el = cevenActEl(ev, this);
    if(!el) return;
    if(el.getAttribute('data-act') === 'quitar-carrito') _portalCatQuitar(el.getAttribute('data-sku'));
  });
  var carritoBody = document.getElementById('pcarrito-body');
  if(carritoBody){
    carritoBody.addEventListener('change', function(ev){
      if(ev.target.classList.contains('pcarrito-qty')) _portalCarritoSetQty(ev.target.getAttribute('data-sku'), ev.target.value);
    });
  }
  var buscador = document.getElementById('pcat-search');
  if(buscador) buscador.addEventListener('input', _portalCatRender);
}
