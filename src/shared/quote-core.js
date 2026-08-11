/* ============================================================
   COTIZACION · NUCLEO GENERICO  ·  compartido
   ------------------------------------------------------------
   El orden de la grilla y las operaciones sobre un item que no
   dependen de como se calcula el precio.

   Lo que NO esta aca, porque es logica de negocio propia:
     · renderQ()        — Apple tiene columnas de margen e IVA.
     · upQty()          — en Apple ademas sincroniza la cantidad
       de las garantias CevenCare vinculadas al producto.
     · upMargin/upNac/calcMargenFromPrice/upSalePriceDirect —
       Poly no tiene margen ni nacionalizacion: el precio se
       tipea a mano por OPG.
     · openQuoteItemEdit/saveQuoteItemEdit — el modal de Apple
       edita costo, modelo, % nac y el flag "ya nacionalizado".

   Depende de: ui-core.js (goTo).
   Se carga DESPUES de ui-core.js y ANTES de <marca>/js/catalog.js
   (addToQuote resetea _qSortKey).
   ============================================================ */

// Estado del sort de la grilla. dir: 1=asc, -1=desc.
// null = orden de insercion, que es el que deja addToQuote() para que los
// productos recien agregados queden al final y no salten de lugar.
var _qSortKey = null, _qSortDir = 1;

function sortQBy(key){
  if(_qSortKey === key) _qSortDir *= -1;
  else { _qSortKey = key; _qSortDir = 1; }
  renderQ();
  // La tabla de garantias se ordena siguiendo a la de productos: existe en Apple.
  if(typeof renderWarranties === 'function') renderWarranties();
}

/* Copia ordenada de items. Trabaja sobre una copia a proposito: el orden de
   `items` es el orden en que se agregaron y el PDF, la grilla y el guardado
   tienen que poder verlo sin que un click en un encabezado lo mute. */
function getSortedItems(){
  var list = items.slice();
  if(_qSortKey){
    list.sort(function(a,b){
      var va, vb;
      if(_qSortKey==='desc'){ va=(a.description||'').toLowerCase(); vb=(b.description||'').toLowerCase(); return _qSortDir*(va<vb?-1:va>vb?1:0); }
      if(_qSortKey==='sku'){  va=(a.sku||'').toLowerCase();         vb=(b.sku||'').toLowerCase();         return _qSortDir*(va<vb?-1:va>vb?1:0); }
      if(_qSortKey==='price'){va=a.salePrice||0;                    vb=b.salePrice||0;                    return _qSortDir*(va-vb); }
      /* Solo el multimarca tiene lineas de marcas distintas. En Apple y Poly
         ningun item trae `brand`, asi que todas comparan iguales y el orden no
         se mueve: es un no-op, no una rama por marca. */
      if(_qSortKey==='brand'){va=(a.brand||'').toLowerCase();       vb=(b.brand||'').toLowerCase();       return _qSortDir*(va<vb?-1:va>vb?1:0); }
      return 0;
    });
  }
  return list;
}

function rmItem(id){ items=items.filter(function(x){return String(x.id)!==String(id);}); renderQ(); }
function editItem(id){ editId=id; selIds={}; goTo('catalog'); if(products.length) renderCat(); }
function openCat(){ editId=null; selIds={}; goTo('catalog'); if(products.length) renderCat(); }

// Campos de texto libre del item (stock/disponibilidad, nota). No re-renderiza:
// el valor ya esta en el input que lo disparo y un render en cada tecla le roba
// el foco al usuario.
function upField(id,f,v){ for(var i=0;i<items.length;i++){if(String(items[i].id)===String(id)){items[i][f]=v;}} }
