/* ============================================================
   PORTAL · asistente-hooks.js
   ------------------------------------------------------------
   Los tres hooks que pide shared/asistente.js — mismo patrón que
   ya usa poly/js/catalog.js. El chat en sí no se construye de
   nuevo: es shared/asistente.js tal cual, más estos tres puentes
   hacia el catálogo/carrito del portal (state.js, catalog.js).

   El catálogo que se manda ya viene con price_ref de
   portal-catalogo (precio Ceven→canal, la única referencia que
   el modelo necesita); nunca se manda costo ni margen interno.

   Depende de: state.js, catalog.js.
   ============================================================ */

function _asisCatalogoCompacto(){
  return _portalCatalogo.map(function(p){
    return {id: p.sku, description: p.description, category: p.category || '', price_ref: p.price};
  });
}

function _asisItemsActuales(){
  return _portalCarrito.map(function(it){ return {id: it.sku, qty: it.qty}; });
}

// Mismo criterio que poly/js/catalog.js: lo que ya está en el carrito se
// salta (no se suma cantidad), y solo lo NUEVO cuenta para el mensaje final.
function _asisAplicarSeleccion(seleccion){
  var sumados = 0;
  for(var i=0;i<seleccion.length;i++){
    var sel = seleccion[i];
    var p = _portalCatalogo.filter(function(x){ return x.sku === sel.id; })[0];
    if(!p || _portalCarritoBuscar(p.sku)) continue;
    _portalCarrito.push({
      sku: p.sku, description: p.description,
      qty: Math.max(1, Math.min(200, parseInt(sel.qty, 10) || 1)),
      precioCeven: p.price
    });
    sumados++;
  }
  if(sumados){ _portalCatRender(); _portalCarritoRender(); }
  return sumados;
}
