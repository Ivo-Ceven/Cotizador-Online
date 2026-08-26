/* ============================================================================
   ALTA / EDICIÓN DE UN ARTÍCULO DEL CATÁLOGO
   ----------------------------------------------------------------------------
   Clonado de poly/js/products.js. Un artículo cargado a mano lleva lo mismo que
   uno del Excel del proveedor —precios por nivel, categoría, disponibilidad e
   IVA— así que se cotiza igual que cualquier otro.

   Los campos de precio los arma este archivo a partir de `CEVEN_BRAND.priceTiers`
   (legamaster/js/tiers.js), NO están en el HTML: agregar o sacar un nivel se
   hace en brand.js y esta pantalla lo sigue.

   Sin el nivel DEAL de Poly: acá no hay ninguno que excluir del formulario.
   ============================================================================ */

/* Un input por nivel de precio. Se rearman en cada entrada al formulario porque
   el juego de niveles sale de brand.js. */
function _npPintarPrecios(precios){
  var cont = document.getElementById('np-precios');
  if(!cont) return;
  var tiers = (typeof cevenTiers === 'function') ? cevenTiers() : [];
  var h = '';
  for(var i=0;i<tiers.length;i++){
    var v = precios && typeof precios[tiers[i].v] === 'number' ? precios[tiers[i].v] : '';
    h += '<div>'
       + '<label class="lbl" style="text-transform:none;letter-spacing:0;font-size:11px">'+cevenEsc(tiers[i].lbl)+'</label>'
       + '<input type="text" inputmode="decimal" class="np-precio" data-tier="'+cevenEsc(tiers[i].v)+'"'
       + ' placeholder="—" value="'+cevenEsc(v === '' ? '' : fD(v))+'">'
       + '</div>';
  }
  cont.innerHTML = h || '<p class="sub">Esta marca no cotiza por niveles de precio.</p>';
}

/* Las categorías que ya existen en el catálogo, para el datalist. */
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
  _npSet('np-disponibilidad', '');
  _npSet('np-iva', '0.21');   // 21% general es el caso normal
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
  _npSet('np-disponibilidad', p.disponibilidad || '');
  _npSet('np-iva', (p.ivaPct === null || p.ivaPct === undefined) ? '0.21' : String(p.ivaPct));
  _npPintarRubros();
  _npPintarPrecios(p.precios);
  document.getElementById('nperr').style.display = 'none';
  document.getElementById('addprod-title').textContent = 'Editar artículo';
  goTo('addprod');
}

function deleteManualProduct(pid){
  var p = null, pIdx = -1;
  for(var i=0;i<products.length;i++){ if(products[i].id===pid){ p=products[i]; pIdx=i; break; } }
  if(!p) return;
  products = products.filter(function(x){ return x.id!==pid; });
  delete selIds[pid];
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

  errEl.style.display = 'none';
  return {
    sku: sku,
    description: desc,
    rubro: document.getElementById('np-rubro').value.trim(),
    disponibilidad: document.getElementById('np-disponibilidad').value.trim(),
    precios: precios,
    ivaPct: parseFloat(document.getElementById('np-iva').value) || 0
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
        products[i].sku=sku; products[i].description=datos.description;
        products[i].rubro=datos.rubro; products[i].disponibilidad=datos.disponibilidad;
        products[i].precios=datos.precios; products[i].ivaPct=datos.ivaPct;
        break;
      }
    }
    editingManualId = null;
    document.getElementById('addprod-title').textContent = cevenAddProdTitle();
  } else {
    newId = Date.now();
    products.push({id:newId, sku:sku, description:datos.description, manual:true,
                   rubro:datos.rubro, disponibilidad:datos.disponibilidad, link:'',
                   precios:datos.precios, ivaPct:datos.ivaPct});
  }
  if(!cevenLsSet(cevenK('cpl'), JSON.stringify(products))) return;
  var b=document.getElementById('plbadge');b.className='bk bkok';b.textContent='✓ '+products.length+' productos';

  if(_pendingNewSKUs.length){
    if(newId !== null) selIds[newId] = _nextSel();
    _pendingNewSKUs.shift();
    if(_pendingNewSKUs.length){
      promptForNextPendingSKU();
      return;
    }
    document.getElementById('addprod-title').textContent = cevenAddProdTitle();
    showToast('✓ Todos los SKUs faltantes agregados y seleccionados');
  }
  goTo('catalog'); renderCat();
}
