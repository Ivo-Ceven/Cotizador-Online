/* ============================================================
   NIVELES DE PRECIO (TIERS)  ·  Poly
   ------------------------------------------------------------
   El catalogo de Poly trae 4 precios por SKU (ver el importador
   en catalog.js). Se eligen con DOS selectores:

     · uno GLOBAL, en el encabezado de la cotizacion, que es el
       nivel con el que se cotiza por defecto;
     · uno POR LINEA, para la excepcion.

   Una linea puede estar en tres estados:
     tier === ''         sigue al global (lo normal)
     tier === '<nivel>'  nivel propio, no la mueve el global
     tier === 'MANUAL'   precio escrito a mano, no lo mueve nada

   Cambiar el global repricea SOLO las que siguen al global. Esa
   es la razon de ser de los dos selectores: si el global pisara
   todo, el de linea no serviria para nada.

   El orden de brand.priceTiers es de PRESENTACION y no implica
   precio: hay 16 SKUs donde Tier 2 sale mas que Tier 1, o donde
   Negocios Especiales no es el mas barato. Por eso cada opcion
   del selector muestra su precio al lado — sin eso, elegir
   "Tier 1" es elegir a ciegas.

   Depende de: brand.js (priceTiers), shared/clientes.js.
   ============================================================ */

/* El valor GUARDADO sigue siendo 'MANUAL' aunque en pantalla diga "Custom".
   Se muestra distinto de como se guarda a proposito: la clave viaja a la
   columna `Nivel de precio` de `cquotes`, se sincroniza con todo el equipo y
   quedo escrita en las cotizaciones que ya existen. Cambiarla obligaria a
   migrar esas filas para ganar cero — la etiqueta se resuelve en un solo lugar
   (cevenTierLabel) y es lo unico que ve el usuario.

   Las constantes y las cuentas viven en `pricing-core.js`, sin DOM, porque el
   cotizador multimarca cotiza SKUs de Poly y tiene que dar el mismo precio. */
var TIER_MANUAL = CEVEN_TIER_MANUAL;
var TIER_MANUAL_LBL = CEVEN_TIER_MANUAL_LBL;

function cevenTiers(){ return (window.CEVEN_BRAND && window.CEVEN_BRAND.priceTiers) || []; }

function cevenTierLabel(v){
  var t = cevenTiers();
  for(var i=0;i<t.length;i++){ if(t[i].v === v) return t[i].lbl; }
  return v === TIER_MANUAL ? TIER_MANUAL_LBL : (v || '');
}

// El nivel elegido en el selector global ('' si no hay ninguno).
function tierGlobal(){
  var el = document.getElementById('tier-global');
  return el ? (el.value || '') : '';
}

// El nivel EFECTIVO de una linea: el suyo si lo tiene, si no el global.
function tierDeLinea(it){ return cevenPolyTierEfectivo(it, tierGlobal()); }

/* Precio de catalogo de un SKU en un nivel. Devuelve null si el SKU no esta en
   el catalogo o no tiene ese nivel — que NO es lo mismo que 0: un 0 se cotiza
   y un null hay que completarlo a mano. */
function precioDeCatalogo(sku, tier){
  return cevenPolyPrecioEnLista(products, sku, tier);
}

// Los 4 precios de un SKU, para poder mostrarlos en el selector.
function preciosDeCatalogo(sku){
  var p = cevenPolyProducto(products, sku);
  return (p && p.precios) || {};
}

/* Recalcula el precio de una linea segun su nivel efectivo. No toca las
   MANUAL, ni las que quedaron sin precio de catalogo (se dejan como estan para
   que el usuario las complete). Devuelve true si cambio algo. */
function repricearLinea(it){
  return cevenPolyRepricear(it, products, tierGlobal());
}

/* Repricea las lineas que SIGUEN al global (tier vacio). Las que tienen nivel
   propio y las MANUAL no se tocan: esa es la decision de diseno. */
function repricearPorGlobal(){
  var n = 0;
  for(var i=0;i<items.length;i++){
    if(items[i].tier) continue;               // nivel propio o MANUAL: intacta
    if(repricearLinea(items[i])) n++;
  }
  return n;
}

// Cambio del selector global.
function onTierGlobalChange(){
  var t = tierGlobal();
  var n = repricearPorGlobal();
  renderQ();
  // Recordar el nivel en la ficha del cliente (ver shared/clientes.js).
  var cli = (document.getElementById('client').value||'').trim();
  if(cli && t) cevenClienteSet(cli, {tier: t});
  if(n) showToast('✓ ' + n + (n===1?' línea actualizada a ':' líneas actualizadas a ') + cevenTierLabel(t));
}

// Cambio del selector de una linea.
function onTierLineaChange(id, val){
  for(var i=0;i<items.length;i++){
    if(String(items[i].id) !== String(id)) continue;
    /* Elegir el mismo nivel que el global deja la linea SIGUIENDO al global
       (tier ''), no clavada en ese nivel: si no, cambiar el global despues no
       la movería y el usuario no entendería por qué. */
    items[i].tier = (val === tierGlobal()) ? '' : val;
    repricearLinea(items[i]);
    break;
  }
  renderQ();
}

/* Al escribir un precio a mano la linea pasa a MANUAL. Lo llama upUnitPrice()
   en quote.js: sin esto, el proximo cambio del global le pisaba el precio que
   el usuario acababa de escribir. */
function marcarManual(id){
  for(var i=0;i<items.length;i++){
    if(String(items[i].id) === String(id)){ items[i].tier = TIER_MANUAL; break; }
  }
}

// El <select> de una linea, con el precio de cada nivel al lado.
function tierSelectHTML(it){
  var tiers = cevenTiers();
  if(!tiers.length) return '';
  var pr = preciosDeCatalogo(it.sku);
  var actual = tierDeLinea(it);
  var propio = !!it.tier && it.tier !== TIER_MANUAL;
  var h = '<select class="si" data-act="tier" data-id="'+cevenEsc(it.id)+'" '
        + 'style="width:100%;font-size:11px;padding:2px 4px'
        + (propio ? ';border-color:var(--acc,#0071e3);font-weight:600' : '') + '">';
  for(var i=0;i<tiers.length;i++){
    var v = tiers[i].v, p = pr[v];
    var txt = tiers[i].lbl + (typeof p === 'number' ? ' · ' + fD(p) : ' · —');
    h += '<option value="'+cevenEsc(v)+'"'+(v===actual?' selected':'')+'>'+cevenEsc(txt)+'</option>';
  }
  h += '<option value="'+TIER_MANUAL+'"'+(actual===TIER_MANUAL?' selected':'')+'>'+cevenEsc(TIER_MANUAL_LBL)+'</option>';
  h += '</select>';
  return h;
}

// El <select> global. Se repuebla en cada render por si cambió el catálogo.
function pintarTierGlobal(){
  var el = document.getElementById('tier-global');
  if(!el) return;
  var tiers = cevenTiers();
  var cur = el.value;
  var h = '<option value="">— Elegir nivel —</option>';
  for(var i=0;i<tiers.length;i++){
    h += '<option value="'+cevenEsc(tiers[i].v)+'">'+cevenEsc(tiers[i].lbl)+'</option>';
  }
  if(el.innerHTML !== h) el.innerHTML = h;
  if(cur) el.value = cur;
}

/* Al elegir/escribir el cliente se propone SU nivel (el de su ficha). Solo si
   el selector global todavía está vacío: si el usuario ya eligió uno a mano
   para esta cotización, cambiárselo por atrás sería peor que no ayudar. */
function aplicarTierDelCliente(){
  var el = document.getElementById('tier-global');
  if(!el || el.value) return;
  var cli = (document.getElementById('client').value||'').trim();
  if(!cli) return;
  var t = cevenClienteTier(cli);
  if(!t) return;
  el.value = t;
  var n = repricearPorGlobal();
  renderQ();
  showToast('Nivel ' + cevenTierLabel(t) + ' — el último que usaste con ' + cli
    + (n ? (' · ' + n + (n===1?' línea actualizada':' líneas actualizadas')) : ''));
}
