/* ============================================================
   PORTAL · pricing-client.js
   ------------------------------------------------------------
   El markup del cliente-canal sobre el precio que le da Ceven.
   Pura, sin DOM: a diferencia de apple|poly/js/pricing-core.js
   esto NO es plata de Ceven — es una regla de negocio propia del
   canal, así que no hace falta que viva en el server ni que sea
   "la misma cuenta en todos lados". El servidor (portal-emitir)
   igual la recalcula al emitir, con el % que confirma el cliente
   en ese momento — esto es solo la vista previa mientras arma el
   carrito.

   Depende de: nada.
   ============================================================ */

function cevenPortalPrecioReventa(precioCeven, markupPct){
  return Math.round((Number(precioCeven) || 0) * (1 + (Number(markupPct) || 0) / 100));
}
