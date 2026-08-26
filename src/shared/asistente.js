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

/* Tope de productos que se le mandan al modelo. Es el MISMO valor que
   CATALOGO_MAX en api/_lib/asistente-core.js, duplicado a propósito por la
   misma razón que SUPABASE_URL en api/asistente.js: un módulo de navegador no
   puede `require` uno de Node. Si cambia uno, cambiar el otro —
   scripts/check-asistente.js lo verifica.

   Bajado de 500 a 150 el 26/08/2026: con el catálogo de Poly en 703 productos
   (ver docs/HISTORIAL.md, "El asistente IA empieza a dar 502"), 500 seguía
   pesando ~57KB/~15k tokens contra un modelo del tier gratuito — el mismo
   tamaño de prompt que causó el timeout, solo que ahora ordenado por
   relevancia en vez de por orden de aparición (ver _asisOrdenarPorRelevancia
   más abajo). 150 vuelve a dejar el prompt en el orden de magnitud del
   catálogo viejo de 77 productos, que nunca dio timeout. */
var CEVEN_ASIS_CATALOGO_MAX = 150;

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

/* ── Relevancia del pedido y atajo por SKU ───────────────────────────────────
   Antes el cap de arriba era un `.slice(0, CAP)` ciego, que solo respetaba el
   orden que ya traía _asisCatalogoCompacto() (precio disponible primero) sin
   mirar para nada lo que pidió el vendedor. _asisOrdenarPorRelevancia
   reordena por coincidencia de palabras contra category/description ANTES de
   ese cap, así que lo que se corta es lo menos relevante al pedido puntual,
   no lo que quedó último en el catálogo. Si el mensaje no deja ninguna señal
   útil (vacío, todo stopwords, ningún match), el sort no cambia nada — todos
   los scores quedan en 0 y gana el desempate por precio, que es el
   comportamiento de siempre.

   _asisResolverListaSkus cubre un caso distinto: un vendedor que pega una
   lista de SKUs que ya conoce (mismo criterio que handleSearchPaste en
   catalog-core.js) no necesita que ninguna IA interprete nada — se resuelve
   local, sin red y sin gastar cuota de OpenRouter. */

var CEVEN_ASIS_STOPWORDS = {
  'de':1,'del':1,'la':1,'el':1,'los':1,'las':1,'un':1,'una':1,'unos':1,'unas':1,
  'para':1,'con':1,'por':1,'que':1,'en':1,'al':1,'y':1,'o':1,'se':1,'su':1,'sus':1,
  'le':1,'les':1,'lo':1,'mas':1,'pero':1,'como':1,'este':1,'esta':1,'estos':1,
  'estas':1,'necesito':1,'necesita':1,'quiero':1,'quiere':1,'cliente':1,'nos':1,
  'nuestro':1,'nuestra':1
};

// Tope duro de tokens del mensaje: protege el costo del scoring en el browser
// aunque el <textarea> no tenga maxlength (el único tope hoy es el
// MENSAJE_MAX=2000 del lado del server).
var CEVEN_ASIS_MSG_TOKENS_MAX = 25;

var CEVEN_ASIS_PESO_SKU_EXACTO        = 1000; // token === id real: gana siempre
var CEVEN_ASIS_PESO_CATEGORIA_EXACTA  = 5;    // rubro: corto y curado, señal fuerte
var CEVEN_ASIS_PESO_CATEGORIA_PARCIAL = 2;
var CEVEN_ASIS_PESO_DESC_EXACTA       = 3;    // descripción: texto libre del ERP, más ruido
var CEVEN_ASIS_PESO_DESC_PARCIAL      = 1;

// Rango Unicode de los diacríticos combinables (U+0300-U+036F) que deja
// String.normalize('NFD') como caracteres sueltos (é → e + ´). Armado con
// fromCharCode en vez de un literal \uXXXX en la regex para no depender de
// que el escape sobreviva intacto en el archivo fuente.
var CEVEN_ASIS_RE_DIACRITICOS = new RegExp('[' + String.fromCharCode(0x0300) + '-' + String.fromCharCode(0x036f) + ']', 'g');

function _asisNormalizarTexto(s){
  return String(s || '')
    .toLowerCase()
    .normalize('NFD').replace(CEVEN_ASIS_RE_DIACRITICOS, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Tokeniza texto de CATÁLOGO (category/description): no filtra stopwords —
// nunca calzarían contra un token del mensaje, que ya las filtra.
function _asisTokenizarTexto(texto, tope){
  var norm = _asisNormalizarTexto(texto);
  if(!norm) return [];
  var crudos = norm.split(' ');
  var out = [];
  for(var i=0; i<crudos.length && out.length<tope; i++){
    if(crudos[i].length > 1) out.push(crudos[i]);
  }
  return out;
}

// Tokeniza el MENSAJE del vendedor: filtra stopwords, tokens de 1-2 letras y
// duplicados, y capea a CEVEN_ASIS_MSG_TOKENS_MAX pase lo que pase.
function _asisTokenizarMensaje(mensaje){
  var norm = _asisNormalizarTexto(mensaje);
  if(!norm) return [];
  var crudos = norm.split(' ');
  var vistos = {}, out = [];
  for(var i=0; i<crudos.length && out.length<CEVEN_ASIS_MSG_TOKENS_MAX; i++){
    var t = crudos[i];
    if(t.length<=2 || CEVEN_ASIS_STOPWORDS[t] || vistos[t]) continue;
    vistos[t] = 1; out.push(t);
  }
  return out;
}

// 'exacta' | 'parcial' | null. 'parcial' es substring en cualquier dirección
// (cubre singular/plural con sufijos cortos, ej. "auricular"/"auriculares")
// sin necesidad de stemming real.
function _asisCoincide(tokensHaystack, token){
  var i;
  for(i=0;i<tokensHaystack.length;i++) if(tokensHaystack[i]===token) return 'exacta';
  for(i=0;i<tokensHaystack.length;i++){
    var h = tokensHaystack[i];
    if(h.indexOf(token)!==-1 || token.indexOf(h)!==-1) return 'parcial';
  }
  return null;
}

function _asisOrdenarPorRelevancia(mensaje, catalogo){
  var tokensMsg = _asisTokenizarMensaje(mensaje);
  if(!tokensMsg.length) return catalogo;

  var puntuados = new Array(catalogo.length);
  for(var i=0;i<catalogo.length;i++){
    var p = catalogo[i];
    var idUpper = String(p.id || '').toUpperCase();
    var tokensCat = _asisTokenizarTexto(p.category, 6);
    var tokensDesc = _asisTokenizarTexto(p.description, 10);
    var score = 0;

    for(var j=0;j<tokensMsg.length;j++){
      var t = tokensMsg[j];
      if(idUpper === t.toUpperCase()) score += CEVEN_ASIS_PESO_SKU_EXACTO;

      var mc = _asisCoincide(tokensCat, t);
      if(mc==='exacta') score += CEVEN_ASIS_PESO_CATEGORIA_EXACTA;
      else if(mc==='parcial') score += CEVEN_ASIS_PESO_CATEGORIA_PARCIAL;

      var md = _asisCoincide(tokensDesc, t);
      if(md==='exacta') score += CEVEN_ASIS_PESO_DESC_EXACTA;
      else if(md==='parcial') score += CEVEN_ASIS_PESO_DESC_PARCIAL;
    }
    puntuados[i] = {p:p, score:score, conPrecio: p.price_ref!==null, idx:i};
  }

  puntuados.sort(function(a,b){
    if(b.score !== a.score) return b.score - a.score;        // 1) relevancia
    if(a.conPrecio !== b.conPrecio) return a.conPrecio?-1:1;  // 2) desempate: precio (criterio de siempre)
    return a.idx - b.idx;                                      // 3) desempate final estable
  });

  var out = new Array(puntuados.length);
  for(var k=0;k<puntuados.length;k++) out[k] = puntuados[k].p;
  return out;
}

var CEVEN_ASIS_SEP_LISTA = /[\n\t,;]+/;   // mismos separadores que handleSearchPaste (catalog-core.js)
var CEVEN_ASIS_LISTA_MATCH_MIN = 0.8;     // fracción de tokens que tiene que matchear un id real

/* Si el mensaje es, en los hechos, una lista de SKUs pegada, resolverla local
   evita gastar una consulta de IA (y su cuota de 30/hora) en algo que no
   necesita interpretación. Devuelve null si no hay señal clara de lista
   (menos de 2 tokens, o la mayoría no matchea nada) — ahí sigue el camino
   normal (relevancia + IA). El resultado tiene la MISMA forma que devuelve
   /api/asistente para poder pasarlo directo a _asisRenderResultado(). */
function _asisResolverListaSkus(mensaje, catalogo){
  var tokens = mensaje.split(CEVEN_ASIS_SEP_LISTA)
    .map(function(s){ return s.trim(); })
    .filter(function(s){ return s.length>0; });
  if(tokens.length < 2) return null;

  var byId = {};
  for(var i=0;i<catalogo.length;i++) byId[String(catalogo[i].id).toUpperCase()] = catalogo[i];

  var items = [], noEncontrados = [], vistos = {}, matches = 0;
  for(var j=0;j<tokens.length;j++){
    var key = tokens[j].toUpperCase();
    var p = byId[key];
    if(!p){
      if(noEncontrados.indexOf(tokens[j])===-1) noEncontrados.push(tokens[j]);
      continue;
    }
    matches++;
    if(vistos[key]) continue;
    vistos[key] = true;
    items.push({id: p.id, cantidad: 1, motivo: 'Pegado directo por SKU', description: p.description, category: p.category});
  }

  if(matches / tokens.length < CEVEN_ASIS_LISTA_MATCH_MIN) return null;
  return {items: items, no_encontrados: noEncontrados, nota: '', catalogo_recortado: 0};
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

  // Atajo sin IA: si esto es una lista de SKUs pegada, resolverla local y
  // listo — ni relevancia ni red hacen falta (ver _asisResolverListaSkus).
  var directo = _asisResolverListaSkus(mensaje, catalogo);
  if(directo){
    _asisPropuesta = directo;
    _asisRenderResultado(directo);
    return;
  }

  // Reordena por relevancia al pedido ANTES de cortar, para que lo que se
  // cae con el cap sea lo menos relevante a ESTA consulta, no lo último del
  // catálogo (ver _asisOrdenarPorRelevancia).
  catalogo = _asisOrdenarPorRelevancia(mensaje, catalogo);

  /* El recorte se hace ACÁ y no solo en el server. api/_lib/asistente-core.js
     tiene el mismo tope (CATALOGO_MAX) y hasta el 24/08 recortaba en silencio:
     el catálogo de Poly pasó a 703 productos y se mandaban 203 al pedo, que el
     server tiraba sin avisar. Mandarlos igual solo agranda el prompt —y con
     eso el tiempo de respuesta, que es lo que empezó a dar timeout—.
     Los dos topes tienen que decir lo mismo: si cambia uno, cambiar el otro. */
  var recortados = 0;
  if(catalogo.length > CEVEN_ASIS_CATALOGO_MAX){
    recortados = catalogo.length - CEVEN_ASIS_CATALOGO_MAX;
    catalogo = catalogo.slice(0, CEVEN_ASIS_CATALOGO_MAX);
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
    /* El recorte del cliente y el del server son el mismo tope, así que en la
       práctica solo puede haber uno; se suman igual por si algún día difieren. */
    resp.catalogo_recortado = (resp.catalogo_recortado || 0) + recortados;
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

  /* Cuántos productos NO llegaron a verse. Sin esto, un "no encontró nada"
     sobre un producto que SÍ está en el catálogo no tiene explicación posible
     desde la pantalla: el recorte pasaba callado en el server. */
  var fuera = (resp && resp.catalogo_recortado) || 0;
  if(fuera){
    html += '<p class="as-noenc">Nota: el asistente vio los '
      + CEVEN_ASIS_CATALOGO_MAX + ' productos más relevantes para este pedido; ' + fuera
      + (fuera === 1 ? ' quedó afuera' : ' quedaron afuera')
      + '. Si buscabas uno de esos, agregalo desde el catálogo o escribí su SKU exacto en el pedido.</p>';
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
