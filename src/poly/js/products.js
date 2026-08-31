/* ============================================================================
   ALTA / EDICIÓN DE UN ARTÍCULO DEL CATÁLOGO
   ----------------------------------------------------------------------------
   Hasta 08/2026 un artículo cargado a mano tenía SOLO sku + descripción: salía
   con "—" en la columna de precios y había que tipear el importe en CADA
   cotización, todas las veces. Ahora lleva lo mismo que uno del ERP —precios por
   nivel, categoría, stock e IVA— así que se cotiza igual que cualquier otro.

   Los campos de precio los arma este archivo a partir de `CEVEN_BRAND.priceTiers`
   (poly/js/tiers.js), NO están en el HTML: agregar o sacar un nivel se hace en
   brand.js y esta pantalla lo sigue.
   ============================================================================ */

/* Un input por nivel de precio. Se rearman en cada entrada al formulario porque
   el juego de niveles sale de brand.js y la pantalla no puede quedar pegada a
   un layout de cuatro.

   El nivel DEAL queda afuera (`tiers[i].deal`): un precio de deal sin número de
   deal ni fecha de vencimiento no es nada que se pueda cotizar, y esos dos
   datos solo salen del Excel de promos. Editar a mano un SKU que tiene deal no
   se lo saca: saveNewProd() lo vuelve a poner después de reemplazar `precios`. */
function _npPintarPrecios(precios){
  var cont = document.getElementById('np-precios');
  if(!cont) return;
  var tiers = (typeof cevenTiers === 'function') ? cevenTiers() : [];
  var h = '';
  for(var i=0;i<tiers.length;i++){
    if(tiers[i].deal) continue;
    var v = precios && typeof precios[tiers[i].v] === 'number' ? precios[tiers[i].v] : '';
    h += '<div>'
       + '<label class="lbl" style="text-transform:none;letter-spacing:0;font-size:11px">'+cevenEsc(tiers[i].lbl)+'</label>'
       // inputmode decimal y type text: un type=number rechaza "3.983,85" en un
       // teclado es-AR. Lo parsea cevenParseMoney(), igual que el precio de la
       // cotización.
       + '<input type="text" inputmode="decimal" class="np-precio" data-tier="'+cevenEsc(tiers[i].v)+'"'
       + ' placeholder="—" value="'+cevenEsc(v === '' ? '' : fD(v))+'">'
       + '</div>';
  }
  cont.innerHTML = h || '<p class="sub">Esta marca no cotiza por niveles de precio.</p>';
}

/* Las categorías que ya existen en el catálogo, para el datalist. Se puede
   escribir una nueva igual: la lista sale del Excel del ERP y cambia. */
function _npPintarRubros(){
  var dl = document.getElementById('np-rubro-list');
  if(!dl || typeof _rubrosDelCatalogo !== 'function') return;
  var rubros = _rubrosDelCatalogo(), h = '';
  for(var i=0;i<rubros.length;i++) h += '<option value="'+cevenEsc(rubros[i])+'"></option>';
  dl.innerHTML = h;
}

function _npSet(id, val){
  var el = document.getElementById(id);
  if(el) el.value = (val === null || val === undefined) ? '' : val;
}

function prepAddProd(){
  _npSet('np-sku', '');
  _npSet('np-desc', '');
  _npSet('np-rubro', '');
  _npSet('np-stock', '');
  _npSet('np-iva', CEVEN_IVA_GENERAL);
  _npPintarRubros();
  _npPintarPrecios(null);
  document.getElementById('nperr').style.display='none';
}

var editingManualId = null;

function editManualProduct(pid){
  var p = null;
  for(var i=0;i<products.length;i++){ if(products[i].id===pid){ p=products[i]; break; } }
  if(!p) return;
  editingManualId = pid;
  _npSet('np-sku',   p.sku || '');
  _npSet('np-desc',  p.description || '');
  _npSet('np-rubro', p.rubro || '');
  // null = sin dato y 0 = agotado son cosas distintas y se muestran distinto en
  // el catálogo: el campo queda vacío solo cuando de verdad no hay dato.
  _npSet('np-stock', (p.stock === null || p.stock === undefined) ? '' : p.stock);
  _npSet('np-iva', cevenProductoIva(p));
  _npPintarRubros();
  _npPintarPrecios(p.precios);
  document.getElementById('nperr').style.display = 'none';
  document.getElementById('addprod-title').textContent = 'Editar artículo';
  /* El goTo va AL FINAL y funciona porque _navApply() solo llama a
     prepAddProd() cuando editingManualId es null (ver shared/ui-core.js): si
     no, limpiaría todo lo que se acaba de cargar. */
  goTo('addprod');
}

function deleteManualProduct(pid){
  var p = null, pIdx = -1;
  for(var i=0;i<products.length;i++){ if(products[i].id===pid){ p=products[i]; pIdx=i; break; } }
  if(!p) return;
  products = products.filter(function(x){ return x.id!==pid; });
  delete selIds[pid];
  // Si el guardado falla no se sigue: ofrecer "deshacer" sobre un borrado que
  // en disco nunca ocurrio deja la pantalla y el localStorage diciendo cosas
  // distintas. cevenLsSet ya le avisa al usuario.
  if(!cevenLsSet(cevenK('cpl'), JSON.stringify(products))) return;
  var b=document.getElementById('plbadge');b.className='bk bkok';b.textContent='✓ '+products.length+' productos';
  renderCat();
  notifyUndo('Eliminaste "'+p.sku+'" del catálogo.', function(){
    products.splice(Math.min(pIdx, products.length), 0, p);
    cevenLsSet(cevenK('cpl'), JSON.stringify(products));
    var b2=document.getElementById('plbadge'); if(b2){ b2.className='bk bkok'; b2.textContent='✓ '+products.length+' productos'; }
    renderCat();
  });
}

function cancelEditManual(){
  editingManualId = null;
  document.getElementById('addprod-title').textContent = cevenAddProdTitle();
  // Si hay SKUs pendientes, se descartan directamente (con opción de deshacer)
  if(_pendingNewSKUs.length){
    var discarded = _pendingNewSKUs.slice();
    _pendingNewSKUs = [];
    goTo('catalog');
    notifyUndo('Descartaste '+discarded.length+' SKU(s) pendiente(s) por crear.', function(){
      _pendingNewSKUs = discarded;
      promptForNextPendingSKU();
    });
    return;
  }
  goTo('catalog');
}

/* Lee los campos del formulario y devuelve los datos del artículo, o null si
   falta algo obligatorio (dejando el cartel de error puesto). */
function _npLeerForm(){
  var errEl = document.getElementById('nperr');
  var sku  = document.getElementById('np-sku').value.trim();
  var desc = document.getElementById('np-desc').value.trim();
  if(!sku || !desc){ errEl.textContent='Completá SKU y Descripción.'; errEl.style.display='block'; return null; }

  /* Precios: el campo VACÍO significa "este nivel no aplica" y no se guarda —
     así `precioDeCatalogo()` devuelve null y la línea queda para completar a
     mano, en vez de cotizarse en 0. Un 0 escrito a propósito SÍ se guarda: un
     accesorio sin cargo es un precio válido. */
  var precios = {}, malo = null;
  var inputs = document.querySelectorAll('#np-precios .np-precio');
  for(var i=0;i<inputs.length;i++){
    var txt = String(inputs[i].value || '').trim();
    if(!txt) continue;
    var v = cevenParseMoney(txt);
    if(isNaN(v) || v < 0){ malo = inputs[i].getAttribute('data-tier'); break; }
    precios[inputs[i].getAttribute('data-tier')] = Math.round(v * 100) / 100;
  }
  if(malo){
    errEl.textContent = 'El precio de "' + (typeof cevenTierLabel==='function' ? cevenTierLabel(malo) : malo) + '" no es un número válido.';
    errEl.style.display = 'block';
    return null;
  }

  var stockTxt = String(document.getElementById('np-stock').value || '').trim();
  var iva = document.getElementById('np-iva').value;

  errEl.style.display = 'none';
  return {
    sku: sku,
    description: desc,
    rubro: document.getElementById('np-rubro').value.trim(),
    // Vacío = sin dato (se muestra "—"); 0 = agotado. No son lo mismo.
    stock: stockTxt === '' ? null : (parseInt(stockTxt.replace(/[^0-9-]/g,''), 10) || 0),
    precios: precios,
    // Se guarda con el mismo vocabulario que el Excel del ERP, así el catálogo
    // y cevenIvaPct() no tienen que distinguir de dónde vino el producto.
    iva: iva,
    ivaPct: cevenIvaPct(iva)
  };
}

function saveNewProd(){
  var datos = _npLeerForm();
  if(!datos) return;
  var sku = datos.sku;
  var newId = null;
  if(editingManualId !== null){
    for(var i=0;i<products.length;i++){
      if(products[i].id===editingManualId){
        // Se asignan campo por campo y no con un objeto nuevo: la fila puede
        // traer cosas que este formulario no edita (p.ej. `manual`, o algo que
        // agregue el importador más adelante) y reemplazarla las perdería.
        products[i].sku=sku; products[i].description=datos.description;
        products[i].rubro=datos.rubro; products[i].stock=datos.stock;
        /* `precios` SÍ se reemplaza entero (así se borra un nivel dejando el
           campo vacío), y el formulario no muestra el nivel DEAL — así que el
           precio de deal hay que volver a ponerlo a mano o se perdería al
           corregirle una coma a la descripción. `p.deal` (número y vigencia)
           no se toca: no es un campo de `precios`. */
        var dealPrevio = products[i].precios && products[i].precios[CEVEN_TIER_DEAL];
        products[i].precios=datos.precios;
        if(typeof dealPrevio === 'number') products[i].precios[CEVEN_TIER_DEAL] = dealPrevio;
        products[i].iva=datos.iva; products[i].ivaPct=datos.ivaPct;
        break;
      }
    }
    editingManualId = null;
    document.getElementById('addprod-title').textContent = cevenAddProdTitle();
  } else {
    newId = Date.now();
    products.push({id:newId, sku:sku, description:datos.description, manual:true,
                   rubro:datos.rubro, stock:datos.stock, precios:datos.precios,
                   iva:datos.iva, ivaPct:datos.ivaPct});
  }
  if(!cevenLsSet(cevenK('cpl'), JSON.stringify(products))) return;
  var b=document.getElementById('plbadge');b.className='bk bkok';b.textContent='✓ '+products.length+' productos';

  // Si veníamos de la cola de SKUs faltantes:
  if(_pendingNewSKUs.length){
    // Auto-seleccionar el producto recién creado
    if(newId !== null) selIds[newId] = _nextSel();
    // Quitar el SKU de la cola
    _pendingNewSKUs.shift();
    if(_pendingNewSKUs.length){
      // Continuar con el siguiente
      promptForNextPendingSKU();
      return;
    }
    // Cola vacía → volver al catálogo con todos los SKUs seleccionados
    document.getElementById('addprod-title').textContent = cevenAddProdTitle();
    showToast('✓ Todos los SKUs faltantes agregados y seleccionados');
  }
  goTo('catalog'); renderCat();
}
