/* ============================================================
   PORTAL · state.js
   ------------------------------------------------------------
   Estado en memoria del portal: marca activa, catálogo bajado,
   carrito, cliente final elegido. Nada de esto persiste en
   localStorage a propósito — el portal no es offline-first como
   los cotizadores internos, y el catálogo/precio siempre se pide
   fresco al entrar (viene de una Edge Function, no del cliente).

   Depende de: nada. Se carga primero (después de session.js).
   ============================================================ */

var _portalMarca = '';            // 'apple' | 'poly' | ''
var _portalCatalogo = [];         // [{sku, description, category, price}]
var _portalCarrito = [];          // [{sku, description, qty, precioCeven}]
var _portalClientesFinales = [];  // cache de portal_clientes_finales propios
var _portalClienteFinalId = '';   // '' = sin elegir (usa proyecto libre + markup default)
var _portalProyectoLibre = '';
var _portalPerfil = null;         // fila de portal_perfiles, o null hasta que se carga

/* REGI (Deal Registration de Poly, ver js/regi.js): {id, codigo, estado,
   ejecutivo} o null. "Por cotización" — se resetea al cambiar de marca,
   nunca persiste entre pedidos (a propósito, ver plan de diseño). */
var _portalRegi = null;

/* Delegación de eventos, copiadas tal cual de shared/ui-core.js (no se carga
   ese archivo acá: sus IIFEs de arranque dependen de brand.js/state.js de los
   cotizadores internos, que el portal no tiene). Genéricas, sin nada de
   marca. */
function cevenDelegate(containerId, evName, handler){
  var el = document.getElementById(containerId);
  if(!el) return;
  var flag = '_cevenDeleg_' + evName;
  if(el[flag]) return;
  el[flag] = true;
  el.addEventListener(evName, handler);
}
function cevenActEl(ev, container){
  var el = ev.target;
  while(el && el !== container){
    if(el.getAttribute && el.getAttribute('data-act')) return el;
    el = el.parentNode;
  }
  return null;
}

function _portalFmt(n){
  n = Math.round(Number(n) || 0);
  return 'USD ' + n.toLocaleString('es-AR');
}

function _portalCarritoTotal(){
  return _portalCarrito.reduce(function(s, it){ return s + it.precioCeven * it.qty; }, 0);
}

/* El % de markup que aplica AHORA: el del cliente final elegido si tiene uno
   propio, si no el default de la cuenta. Nunca del catálogo ni de Ceven. */
function _portalMarkupActivo(){
  if(_portalClienteFinalId){
    var cf = _portalClientesFinales.filter(function(c){ return String(c.id) === String(_portalClienteFinalId); })[0];
    if(cf && cf.markup_pct != null && cf.markup_pct !== '') return Number(cf.markup_pct);
  }
  return _portalPerfil ? (Number(_portalPerfil.markup_default_pct) || 0) : 0;
}

function _portalCarritoBuscar(sku){
  for(var i=0;i<_portalCarrito.length;i++){ if(_portalCarrito[i].sku === sku) return _portalCarrito[i]; }
  return null;
}

/* Vistas de primer nivel del portal — mucho más chico que goTo()/_navApply()
   de shared/ui-core.js, que están pensados para los cotizadores internos con
   sus propias vistas y permisos por rol. Acá alcanza con mostrar/ocultar. */
function _portalGoTo(vista){
  ['marca', 'catalogo', 'clientes', 'historial'].forEach(function(v){
    var el = document.getElementById('pgv-' + v);
    if(el) el.style.display = (v === vista) ? '' : 'none';
    var tab = document.getElementById('pgt-' + v);
    if(tab) tab.classList.toggle('on', v === vista);
  });
  if(vista === 'clientes' && typeof _portalClientesFinalesRender === 'function') _portalClientesFinalesRender();
  if(vista === 'historial' && typeof _portalHistorialCargar === 'function') _portalHistorialCargar();
}
