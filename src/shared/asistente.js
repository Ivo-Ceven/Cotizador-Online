/* ============================================================================
   ASISTENTE IA  ·  motor genérico, compartido por todas las páginas que lo usen
   ----------------------------------------------------------------------------
   El vendedor (o, más adelante, un cliente del portal multimarca) describe en
   lenguaje natural qué necesita, este módulo se lo manda a /api/asistente
   (ver api/asistente.js), y muestra la propuesta en un overlay con checkbox
   por línea para que la revise antes de agregar nada a la cotización.

   Este archivo NO sabe de marcas ni de cómo se agrega un producto: eso lo
   define cada página con dos funciones globales opcionales, mismo patrón que
   ya usa shared/catalog-core.js con cevenAplicarSkusPegados (se chequea con
   `typeof fn === 'function'` en vez de asumir que existen):

     _asisCatalogoCompacto()  → [{id, description, category, price_ref}]
                                 el catálogo de ESA página, recortado.
     _asisItemsActuales()     → [{id, qty}]                    (opcional)
                                 lo que ya está en la cotización, para que el
                                 asistente no lo vuelva a sugerir sin que el
                                 pedido lo justifique.
     _asisAplicarSeleccion(seleccion) → number
                                 seleccion es [{id, qty}] tildado y confirmado
                                 por el usuario. Cada página resuelve su alta
                                 real (Poly: agregarUno/_nuevoItemDeProducto;
                                 Multi, más adelante: cevenMultiMarca(brand)
                                 .nuevaLinea()) y devuelve cuántas líneas
                                 quedaron efectivamente agregadas.

   El overlay se inyecta con JS al primer abrirAsistente() (no vive duplicado
   en cada index.html, a diferencia de #prod-picker: nació antes de este
   criterio y no hace falta migrarlo).

   Depende de: shared/auth.js (cevenAuthedFetch), shared/notify.js
   (showToast), shared/safe.js (cevenEsc), shared/nav.js (cevenNav).
   ============================================================================ */

var _asisAbierto = false;
var _asisPropuesta = null;   // última respuesta válida del endpoint
var _asisPidiendo = false;

function _asisMarkup(){
  return ''
    + '<div id="asis-picker" style="display:none">'
    +   '<div class="pk-card" role="dialog" aria-modal="true" aria-label="Asistente IA">'
    +     '<div class="pk-hd">'
    +       '<div class="h3">✨ Asistente IA</div>'
    +       '<button type="button" class="pk-x" data-as-cerrar title="Cerrar">&times;</button>'
    +     '</div>'
    +     '<div class="as-body">'
    +       '<div class="as-form">'
    +         '<textarea id="as-mensaje" rows="3" placeholder="Contame qué necesita el cliente — ej: sala de conferencias para 12 personas, presupuesto medio"></textarea>'
    +         '<button type="button" class="bd" id="as-pedir">Sugerir productos</button>'
    +       '</div>'
    +       '<div id="as-resultado"></div>'
    +     '</div>'
    +     '<div class="pk-pie">'
    +       '<button type="button" class="bs" data-as-cerrar>Cancelar</button>'
    +       '<button type="button" class="bd" id="as-confirmar" disabled>Agregar seleccionados</button>'
    +     '</div>'
    +   '</div>'
    + '</div>';
}

function _asisAsegurarMarkup(){
  if(document.getElementById('asis-picker')) return;
  var wrap = document.createElement('div');
  wrap.innerHTML = _asisMarkup();
  document.body.appendChild(wrap.firstElementChild);
  _asisWire();
}

/* ── Abrir / cerrar ───────────────────────────────────────────────────────── */
function abrirAsistente(){
  if(typeof _asisCatalogoCompacto !== 'function'){
    if(typeof showToast === 'function') showToast('Esta pantalla todavía no tiene el asistente disponible.');
    return;
  }
  _asisAsegurarMarkup();
  var m = document.getElementById('asis-picker');
  if(!m) return;

  _asisPropuesta = null;
  document.getElementById('as-resultado').innerHTML = '';
  document.getElementById('as-confirmar').disabled = true;
  var ta = document.getElementById('as-mensaje');
  if(ta) ta.value = '';

  _asisAbierto = true;
  m.style.display = 'flex';
  if(window.cevenNav) cevenNav.openOverlay(cerrarAsistente);
  setTimeout(function(){ if(ta) ta.focus(); }, 30);
}

function cerrarAsistente(){
  var m = document.getElementById('asis-picker');
  if(!m) return;
  _asisAbierto = false;
  m.style.display = 'none';
  if(window.cevenNav) cevenNav.notifyClosed(cerrarAsistente);
}

/* ── Pedido al endpoint ───────────────────────────────────────────────────── */
function _asisItemsActualesSeguro(){
  return (typeof _asisItemsActuales === 'function') ? (_asisItemsActuales() || []) : [];
}

function _asisPedirPropuesta(){
  if(_asisPidiendo) return;
  var ta = document.getElementById('as-mensaje');
  var mensaje = ta ? ta.value.trim() : '';
  if(!mensaje){
    if(typeof showToast === 'function') showToast('Escribí qué necesita el cliente.');
    return;
  }

  var catalogo = _asisCatalogoCompacto() || [];
  if(!catalogo.length){
    if(typeof showToast === 'function') showToast('Todavía no hay catálogo cargado.');
    return;
  }

  _asisPidiendo = true;
  var resBox = document.getElementById('as-resultado');
  resBox.innerHTML = '<div class="as-cargando">Pensando…</div>';
  document.getElementById('as-confirmar').disabled = true;

  cevenAuthedFetch('/api/asistente', {
    method: 'POST',
    body: JSON.stringify({
      mensaje: mensaje,
      catalogo: catalogo,
      items_actuales: _asisItemsActualesSeguro()
    })
  }).then(function(resp){
    _asisPidiendo = false;
    _asisPropuesta = resp;
    _asisRenderResultado(resp);
  }).catch(function(err){
    _asisPidiendo = false;
    var msg = (err && err.error) || 'No se pudo conectar con el asistente. Probá de nuevo.';
    console.warn('[asistente] error al pedir propuesta:', err);
    resBox.innerHTML = '';
    if(typeof showToast === 'function') showToast(msg);
  });
}

/* ── Render de la propuesta ───────────────────────────────────────────────── */
function _asisRenderResultado(resp){
  var resBox = document.getElementById('as-resultado');
  var items = (resp && resp.items) || [];
  var noEnc = (resp && resp.no_encontrados) || [];
  var html = '';

  if(resp && resp.nota) html += '<p class="as-nota">' + cevenEsc(resp.nota) + '</p>';

  if(!items.length){
    html += '<p class="as-vacio">El asistente no encontró productos para sugerir.</p>';
  } else {
    html += '<div class="as-lista">';
    for(var i=0;i<items.length;i++){
      var it = items[i];
      html += '<label class="as-row">'
        + '<input type="checkbox" class="as-check" data-as-i="' + i + '" checked>'
        + '<span class="as-desc"><b>' + cevenEsc(it.description || it.id) + '</b>'
          + (it.category ? ' <span class="as-cat">' + cevenEsc(it.category) + '</span>' : '')
          + (it.motivo ? '<br><span class="as-motivo">' + cevenEsc(it.motivo) + '</span>' : '')
        + '</span>'
        + '<input type="number" class="as-qty" min="1" max="200" value="' + cevenEsc(it.cantidad) + '" data-as-i="' + i + '">'
      + '</label>';
    }
    html += '</div>';
  }

  if(noEnc.length){
    html += '<p class="as-noenc">No encontrado en el catálogo: ' + cevenEsc(noEnc.join(', ')) + '</p>';
  }

  resBox.innerHTML = html;
  document.getElementById('as-confirmar').disabled = !items.length;
}

/* ── Confirmar selección ──────────────────────────────────────────────────── */
function _asisConfirmarSeleccion(){
  if(!_asisPropuesta || !_asisPropuesta.items) return;
  var body = document.getElementById('as-resultado');
  var seleccion = [];
  var checks = body.querySelectorAll('.as-check');
  for(var i=0;i<checks.length;i++){
    if(!checks[i].checked) continue;
    var idx = parseInt(checks[i].getAttribute('data-as-i'), 10);
    var it = _asisPropuesta.items[idx];
    if(!it) continue;
    var qtyEl = body.querySelector('.as-qty[data-as-i="' + idx + '"]');
    var qty = qtyEl ? parseInt(qtyEl.value, 10) : it.cantidad;
    seleccion.push({id: it.id, qty: (isFinite(qty) && qty > 0) ? qty : it.cantidad});
  }
  if(!seleccion.length) return;

  if(typeof _asisAplicarSeleccion !== 'function'){
    if(typeof showToast === 'function') showToast('Esta pantalla todavía no sabe agregar la selección del asistente.');
    return;
  }

  var agregados = _asisAplicarSeleccion(seleccion) || 0;
  cerrarAsistente();
  var msg = '✓ ' + agregados + (agregados === 1 ? ' producto agregado' : ' productos agregados');
  if(agregados < seleccion.length) msg += ' · ' + (seleccion.length - agregados) + ' ya estaban en la cotización';
  if(typeof showToast === 'function') showToast(msg);
}

/* ── Cableado (una sola vez, al crear el markup) ─────────────────────────── */
function _asisWire(){
  var m = document.getElementById('asis-picker');
  if(!m) return;

  m.addEventListener('click', function(ev){
    if(ev.target === m || (ev.target.closest && ev.target.closest('[data-as-cerrar]'))) cerrarAsistente();
  });

  var pedirBtn = document.getElementById('as-pedir');
  if(pedirBtn) pedirBtn.addEventListener('click', _asisPedirPropuesta);

  var confirmarBtn = document.getElementById('as-confirmar');
  if(confirmarBtn) confirmarBtn.addEventListener('click', _asisConfirmarSeleccion);

  var ta = document.getElementById('as-mensaje');
  if(ta) ta.addEventListener('keydown', function(ev){
    if(ev.key === 'Enter' && (ev.metaKey || ev.ctrlKey)){ ev.preventDefault(); _asisPedirPropuesta(); }
  });
}
