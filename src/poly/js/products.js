// ── AGREGAR/EDITAR PRODUCTO DEL CATÁLOGO (solo SKU + Descripción) ──
function prepAddProd(){
  document.getElementById('np-sku').value='';
  document.getElementById('np-desc').value='';
  document.getElementById('nperr').style.display='none';
}

var editingManualId = null;

function editManualProduct(pid){
  var p = null;
  for(var i=0;i<products.length;i++){ if(products[i].id===pid){ p=products[i]; break; } }
  if(!p) return;
  editingManualId = pid;
  document.getElementById('np-sku').value  = p.sku || '';
  document.getElementById('np-desc').value = p.description || '';
  document.getElementById('nperr').style.display = 'none';
  document.getElementById('addprod-title').textContent = 'Editar artículo';
  goTo('addprod');
}

function deleteManualProduct(pid){
  var p = null;
  for(var i=0;i<products.length;i++){ if(products[i].id===pid){ p=products[i]; break; } }
  if(!p) return;
  if(!confirm('¿Eliminar el producto "'+p.sku+'" del catálogo?')) return;
  products = products.filter(function(x){ return x.id!==pid; });
  delete selIds[pid];
  try{localStorage.setItem('poly_cpl',JSON.stringify(products));}catch(e){}
  var b=document.getElementById('plbadge');b.className='bk bkok';b.textContent='✓ '+products.length+' productos';
  renderCat();
}

function cancelEditManual(){
  editingManualId = null;
  document.getElementById('addprod-title').textContent = 'Agregar artículo al catálogo';
  // Si hay SKUs pendientes, preguntar si descartar
  if(_pendingNewSKUs.length){
    var remaining = _pendingNewSKUs.length;
    if(confirm('Hay '+remaining+' SKU(s) pendiente(s) por crear. ¿Descartar el resto?')){
      _pendingNewSKUs = [];
    } else {
      promptForNextPendingSKU();
      return;
    }
  }
  goTo('catalog');
}

function saveNewProd(){
  var sku=document.getElementById('np-sku').value.trim();
  var desc=document.getElementById('np-desc').value.trim();
  var errEl=document.getElementById('nperr');
  if(!sku||!desc){errEl.textContent='Completá SKU y Descripción.';errEl.style.display='block';return;}
  var newId = null;
  if(editingManualId !== null){
    for(var i=0;i<products.length;i++){
      if(products[i].id===editingManualId){
        products[i].sku=sku; products[i].description=desc;
        break;
      }
    }
    editingManualId = null;
    document.getElementById('addprod-title').textContent = 'Agregar artículo al catálogo';
  } else {
    newId = Date.now();
    products.push({id:newId,sku:sku,description:desc,manual:true});
  }
  try{localStorage.setItem('poly_cpl',JSON.stringify(products));}catch(e){}
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
    document.getElementById('addprod-title').textContent = 'Agregar artículo al catálogo';
    showToast('✓ Todos los SKUs faltantes agregados y seleccionados');
  }
  goTo('catalog'); renderCat();
}
