/* ============================================================
   PRICING · NÚCLEO  ·  Poly
   ------------------------------------------------------------
   El precio por NIVEL, sin pantalla: no lee el <select> global,
   no recorre `products` y no toca el DOM. Todo entra por
   parámetro.

   Existe por el cotizador MULTIMARCA (src/multi/), que cotiza
   SKUs de Poly sin ser la app de Poly y necesita exactamente el
   mismo precio. Si la fórmula estuviera escrita dos veces,
   tarde o temprano el mismo SKU saldría a dos precios distintos
   según por dónde se lo cotizó.

   `poly/js/tiers.js` es ahora el envoltorio que le pasa el
   catálogo (`products`) y el nivel del selector global.

   Depende de: nada. Se carga ANTES de poly/js/tiers.js.
   ============================================================ */

/* El valor GUARDADO de una línea con precio a mano sigue siendo 'MANUAL'
   aunque en pantalla diga "Custom": viaja a la columna `Nivel de precio` de
   `cquotes`, se sincroniza con todo el equipo y quedó escrito en las
   cotizaciones que ya existen. Cambiarlo obligaría a migrar esas filas para
   ganar cero. */
var CEVEN_TIER_MANUAL     = 'MANUAL';
var CEVEN_TIER_MANUAL_LBL = 'Custom';

/* El precio de un producto YA ENCONTRADO en un nivel. Devuelve null si ese
   nivel no tiene precio, que NO es lo mismo que 0: un 0 se cotiza y un null
   hay que completarlo a mano. */
function cevenPolyPrecioDe(prod, tier){
  if(!prod || !tier || tier === CEVEN_TIER_MANUAL) return null;
  var p = prod.precios && prod.precios[tier];
  return (typeof p === 'number' && !isNaN(p)) ? p : null;
}

// El producto del catálogo con ese SKU, o null.
function cevenPolyProducto(lista, sku){
  if(!sku || !lista) return null;
  for(var i=0;i<lista.length;i++){ if(lista[i].sku === sku) return lista[i]; }
  return null;
}

// Atajo: precio de un SKU en un nivel, buscando en el catálogo que se le pase.
function cevenPolyPrecioEnLista(lista, sku, tier){
  return cevenPolyPrecioDe(cevenPolyProducto(lista, sku), tier);
}

/* El nivel EFECTIVO de una línea: el suyo si lo tiene, si no el global.
   Una línea puede estar en tres estados:
     tier === ''         sigue al global (lo normal)
     tier === '<nivel>'  nivel propio, no la mueve el global
     tier === 'MANUAL'   precio escrito a mano, no lo mueve nada          */
function cevenPolyTierEfectivo(it, tierGlobal){
  if(!it) return '';
  if(it.tier === CEVEN_TIER_MANUAL) return CEVEN_TIER_MANUAL;
  return it.tier || (tierGlobal || '');
}

/* Recalcula el precio de una línea según su nivel efectivo. No toca las
   MANUAL ni las que quedaron sin precio de catálogo (se dejan como están para
   que el usuario las complete). Devuelve true si cambió algo. */
function cevenPolyRepricear(it, lista, tierGlobal){
  var t = cevenPolyTierEfectivo(it, tierGlobal);
  if(t === CEVEN_TIER_MANUAL || !t) return false;
  var p = cevenPolyPrecioEnLista(lista, it.sku, t);
  if(p === null) return false;
  if(it.salePrice === p) return false;
  it.salePrice = p;
  return true;
}

/* El monto de una fila del pipeline a partir de un juego de líneas.

   Lo llaman TRES caminos —agregar al pipeline, cambiar la opción vigente y la
   emisión del multimarca— y tienen que dar exactamente lo mismo: si se
   desincronizaran, la fila mostraría un total que la cotización no dice. */
function cevenPolyMonto(its){
  var monto = 0;
  its = its || [];
  for(var i=0;i<its.length;i++){ monto += (its[i].salePrice||0) * (its[i].qty||1); }
  return Math.round(monto);
}
