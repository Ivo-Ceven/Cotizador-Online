/* ============================================================
   PRICING · NÚCLEO  ·  Legamaster
   ------------------------------------------------------------
   El precio por NIVEL, sin pantalla: no lee el <select> global,
   no recorre `products` y no toca el DOM. Todo entra por
   parámetro.

   Existe por el cotizador MULTIMARCA (src/multi/), que cotiza
   SKUs de Legamaster sin ser la app de Legamaster y necesita
   exactamente el mismo precio. Si la fórmula estuviera escrita
   dos veces, tarde o temprano el mismo SKU saldría a dos precios
   distintos según por dónde se lo cotizó.

   `legamaster/js/tiers.js` es el envoltorio que le pasa el
   catálogo (`products`) y el nivel del selector global.

   Depende de: nada. Se carga ANTES de legamaster/js/tiers.js.
   Clonado de poly/js/pricing-core.js — sin el nivel DEAL, que
   acá no aplica.
   ============================================================ */

/* El valor GUARDADO de una línea con precio a mano sigue siendo 'MANUAL'
   aunque en pantalla diga "Custom": viaja a la columna `Nivel de precio` de
   `cquotes` y se sincroniza con todo el equipo. */
var CEVEN_TIER_MANUAL     = 'MANUAL';
var CEVEN_TIER_MANUAL_LBL = 'Custom';

/* El precio de un producto YA ENCONTRADO en un nivel. Devuelve null si ese
   nivel no tiene precio, que NO es lo mismo que 0: un 0 se cotiza y un null
   hay que completarlo a mano. */
function cevenLegamasterPrecioDe(prod, tier){
  if(!prod || !tier || tier === CEVEN_TIER_MANUAL) return null;
  var p = prod.precios && prod.precios[tier];
  return (typeof p === 'number' && !isNaN(p)) ? p : null;
}

// El producto del catálogo con ese SKU, o null.
function cevenLegamasterProducto(lista, sku){
  if(!sku || !lista) return null;
  for(var i=0;i<lista.length;i++){ if(lista[i].sku === sku) return lista[i]; }
  return null;
}

// Atajo: precio de un SKU en un nivel, buscando en el catálogo que se le pase.
function cevenLegamasterPrecioEnLista(lista, sku, tier){
  return cevenLegamasterPrecioDe(cevenLegamasterProducto(lista, sku), tier);
}

/* El nivel EFECTIVO de una línea: el suyo si lo tiene, si no el global.
   Una línea puede estar en tres estados:
     tier === ''         sigue al global (lo normal)
     tier === '<nivel>'  nivel propio, no la mueve el global
     tier === 'MANUAL'   precio escrito a mano, no lo mueve nada          */
function cevenLegamasterTierEfectivo(it, tierGlobal){
  if(!it) return '';
  if(it.tier === CEVEN_TIER_MANUAL) return CEVEN_TIER_MANUAL;
  return it.tier || (tierGlobal || '');
}

/* Recalcula el precio de una línea según su nivel efectivo. No toca las
   MANUAL ni las que quedaron sin precio de catálogo (se dejan como están para
   que el usuario las complete). Devuelve true si cambió algo. */
function cevenLegamasterRepricear(it, lista, tierGlobal){
  var t = cevenLegamasterTierEfectivo(it, tierGlobal);
  if(t === CEVEN_TIER_MANUAL || !t) return false;
  var p = cevenLegamasterPrecioEnLista(lista, it.sku, t);
  if(p === null) return false;
  if(it.salePrice === p) return false;
  it.salePrice = p;
  return true;
}

/* El texto de IVA de un producto ("21%", "10,5%"), a partir de `ivaPct` (0 /
   0.105 / 0.21, tal como lo deja el importador en legamaster/js/catalog.js).
   Vive acá, sin DOM, porque el cotizador multimarca también arma la columna
   IVA de una línea de Legamaster y no carga legamaster/js/catalog.js. */
function cevenLegamasterIvaTxt(p){
  var v = p && p.ivaPct;
  if(v === null || v === undefined || isNaN(v)) return '—';
  var pct = v * 100;
  var entero = Math.round(pct*10) % 10 === 0;
  var txt = entero ? String(Math.round(pct)) : String(Math.round(pct*10)/10).replace('.', ',');
  return txt + '%';
}

/* El monto de una fila del pipeline a partir de un juego de líneas.

   Lo llaman TRES caminos —agregar al pipeline, cambiar la opción vigente y la
   emisión del multimarca— y tienen que dar exactamente lo mismo: si se
   desincronizaran, la fila mostraría un total que la cotización no dice. */
function cevenLegamasterMonto(its){
  var monto = 0;
  its = its || [];
  for(var i=0;i<its.length;i++){ monto += (its[i].salePrice||0) * (its[i].qty||1); }
  return Math.round(monto);
}
