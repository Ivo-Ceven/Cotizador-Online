// ── ADD PRODUCT ──
// Contador para los ids de productos manuales: Date.now() solo colisionaba
// creando dos en el mismo milisegundo, pero el id es la clave de borrado.
var _manualProdSeq = 0;

function prepAddProd(){
  document.getElementById('np-sku').value='';
  document.getElementById('np-desc').value='';
  document.getElementById('np-price').value='';
  document.getElementById('np-nacincluded').checked=false;
  document.getElementById('np-price-lbl').textContent='Precio de costo (USD) *';
  document.getElementById('nperr').style.display='none';
  var models=uniq(products.map(function(p){return p.modelCol;}).filter(function(v){return v;}));
  var countries=uniq(products.map(function(p){return p.country;}).filter(function(v){return v;}));
  if(countries.indexOf('Uruguay')<0) countries.push('Uruguay');
  document.getElementById('np-model').innerHTML=optionsHTML(models.filter(function(v){return v!=='Todos';}));
  document.getElementById('np-country').innerHTML=optionsHTML(countries.filter(function(v){return v!=='Todos';}));
}

var editingManualId = null;

function editManualProduct(pid){
  var p = null;
  // Los ids conviven como número (índice de fila del Excel) y como string
  // ('pm_<ts>_<n>' para los manuales): la comparación va siempre por String.
  for(var i=0;i<products.length;i++){ if(String(products[i].id)===String(pid)){ p=products[i]; break; } }
  if(!p) return;
  editingManualId = p.id;
  // Poblar los selects con todas las opciones disponibles
  var models = uniq(products.map(function(x){return x.modelCol;}).filter(function(v){return v && v!=='Todos';}));
  var countries = uniq(products.map(function(x){return x.country;}).filter(function(v){return v && v!=='Todos';}));
  if(countries.indexOf('Uruguay')<0) countries.push('Uruguay');
  document.getElementById('np-model').innerHTML = optionsHTML(models);
  document.getElementById('np-country').innerHTML = optionsHTML(countries);
  // Seleccionar los valores actuales
  document.getElementById('np-model').value   = p.modelCol || '';
  document.getElementById('np-country').value = p.country  || '';
  document.getElementById('np-sku').value   = p.sku || '';
  document.getElementById('np-desc').value  = p.description || '';
  document.getElementById('np-price').value = p.sellingPrice || '';
  document.getElementById('np-nacincluded').checked = !!p.nacIncluded;
  document.getElementById('np-price-lbl').textContent = p.nacIncluded ? 'Precio nacionalizado (USD) *' : 'Precio de costo (USD) *';
  document.getElementById('nperr').style.display = 'none';
  document.getElementById('addprod-title').textContent = 'Editar artículo';
  goTo('addprod');
}

function deleteManualProduct(pid){
  var p = null;
  for(var i=0;i<products.length;i++){ if(String(products[i].id)===String(pid)){ p=products[i]; break; } }
  if(!p) return;
  // Se llama "deleteManualProduct" pero borraba cualquier fila del catálogo: un
  // producto importado del Excel desaparecía hasta la próxima importación, sin
  // forma de recuperarlo desde la UI. Los importados se limpian con las acciones
  // de mantenimiento del catálogo (LL/A, E/A) o reimportando el price list.
  if(!p.manual){
    alert('Solo se pueden eliminar los artículos cargados a mano.\n\n"'+p.sku+'" viene del price list importado: se actualiza reimportando el Excel.');
    return;
  }
  if(!confirm('¿Eliminar el producto "'+p.sku+'" del price list?')) return;
  products = products.filter(function(x){ return String(x.id)!==String(pid); });
  delete selIds[pid];
  if(!cevenLsSet(cevenK('cpl'), JSON.stringify(products))) return;
  var b=document.getElementById('plbadge');b.className='bk bkok';b.textContent='✓ '+products.length+' productos';
  renderCat();
}

function cancelEditManual(){
  editingManualId = null;
  document.getElementById('addprod-title').textContent = 'Agregar artículo al price list';
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
  var price=parseFloat(document.getElementById('np-price').value);
  var errEl=document.getElementById('nperr');
  if(!sku||!desc||!price||price<=0){errEl.textContent='Completá SKU, Descripción y Precio.';errEl.style.display='block';return;}
  var mc=document.getElementById('np-model').value;
  var country=document.getElementById('np-country').value;
  var nacIncluded=document.getElementById('np-nacincluded').checked;
  var newId = null;
  if(editingManualId !== null){
    for(var i=0;i<products.length;i++){
      if(products[i].id===editingManualId){
        products[i].sku=sku; products[i].description=desc; products[i].sellingPrice=price;
        products[i].lob=mc; products[i].modelCol=mc; products[i].country=country;
        products[i].nacIncluded = nacIncluded;
        delete products[i].needsReview; // precio confirmado a mano
        break;
      }
    }
    editingManualId = null;
    document.getElementById('addprod-title').textContent = 'Agregar artículo al price list';
  } else {
    // Date.now() solo colisiona si se crean dos productos en el mismo ms.
    newId = 'pm_' + Date.now() + '_' + (++_manualProdSeq);
    products.push({id:newId,sku:sku,description:desc,sellingPrice:price,lob:mc,modelCol:mc,country:country,manual:true,nacIncluded:nacIncluded});
  }
  if(!cevenLsSet(cevenK('cpl'), JSON.stringify(products))) return;
  var models=uniq(products.map(function(p){return p.modelCol;}));
  var countries=uniq(products.map(function(p){return p.country;}));
  if(countries.indexOf('Uruguay')<0) countries.push('Uruguay');
  document.getElementById('fmodel').innerHTML=optionsHTML(models);
  document.getElementById('fcountry').innerHTML=optionsHTML(countries);
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
    document.getElementById('addprod-title').textContent = 'Agregar artículo al price list';
    showToast('✓ Todos los SKUs faltantes agregados y seleccionados');
  }
  goTo('catalog'); renderCat();
}

