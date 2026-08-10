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
  // Formateado en es-AR, que es como se tipea y como lo lee cevenParseMoney().
  document.getElementById('np-price').value = (typeof p.sellingPrice === 'number') ? fD(p.sellingPrice) : '';
  document.getElementById('np-nacincluded').checked = !!p.nacIncluded;
  document.getElementById('np-price-lbl').textContent = p.nacIncluded ? 'Precio nacionalizado (USD) *' : 'Precio de costo (USD) *';
  document.getElementById('nperr').style.display = 'none';
  document.getElementById('addprod-title').textContent = 'Editar artículo';
  goTo('addprod');
}

function deleteManualProduct(pid){
  var p = null, pIdx = -1;
  for(var i=0;i<products.length;i++){ if(String(products[i].id)===String(pid)){ p=products[i]; pIdx=i; break; } }
  if(!p) return;
  // Se llama "deleteManualProduct" pero borraba cualquier fila del catálogo: un
  // producto importado del Excel desaparecía hasta la próxima importación, sin
  // forma de recuperarlo desde la UI. Los importados se limpian con las acciones
  // de mantenimiento del catálogo (LL/A, E/A) o reimportando el price list.
  if(!p.manual){
    showToast('Solo se pueden eliminar los artículos cargados a mano. "'+p.sku+'" viene del price list importado: se actualiza reimportando el Excel.');
    return;
  }
  products = products.filter(function(x){ return String(x.id)!==String(pid); });
  delete selIds[pid];
  // Si el guardado falla no se sigue: ofrecer "deshacer" sobre un borrado que en
  // disco nunca ocurrió deja la pantalla y el localStorage diciendo cosas
  // distintas. cevenLsSet ya le avisa al usuario.
  if(!cevenLsSet(cevenK('cpl'), JSON.stringify(products))) return;
  var b=document.getElementById('plbadge');b.className='bk bkok';b.textContent='✓ '+products.length+' productos';
  renderCat();
  notifyUndo('Eliminaste "'+p.sku+'" del price list.', function(){
    products.splice(Math.min(pIdx, products.length), 0, p);
    cevenLsSet(cevenK('cpl'), JSON.stringify(products));
    var b2=document.getElementById('plbadge'); if(b2){ b2.className='bk bkok'; b2.textContent='✓ '+products.length+' productos'; }
    renderCat();
  });
}

function cancelEditManual(){
  editingManualId = null;
  document.getElementById('addprod-title').textContent = cevenAddProdTitle();
  // Si hay SKUs pendientes, se descartan directamente (con opción de deshacer):
  // preguntar con un confirm() dejaba la pantalla bloqueada justo cuando el
  // usuario ya decidió salir.
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

function saveNewProd(){
  var sku=document.getElementById('np-sku').value.trim();
  var desc=document.getElementById('np-desc').value.trim();
  // cevenParseMoney() y no parseFloat(): el precio se tipea en formato es-AR
  // ("1.250,50") y parseFloat cortaba en el primer punto → 1,25 en vez de 1250,50.
  var price=cevenParseMoney(document.getElementById('np-price').value);
  var errEl=document.getElementById('nperr');
  if(!sku||!desc){errEl.textContent='Completá SKU y Descripción.';errEl.style.display='block';return;}
  if(isNaN(price)||price<=0){errEl.textContent='El precio tiene que ser un número mayor a 0 (ej: 1.250,50).';errEl.style.display='block';return;}
  price = Math.round(price*100)/100;
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
    document.getElementById('addprod-title').textContent = cevenAddProdTitle();
  } else {
    // Date.now() solo colisiona si se crean dos productos en el mismo ms.
    newId = 'pm_' + Date.now() + '_' + (++_manualProdSeq);
    products.push({id:newId,sku:sku,description:desc,sellingPrice:price,lob:mc,modelCol:mc,country:country,manual:true,nacIncluded:nacIncluded});
  }
  if(!cevenLsSet(cevenK('cpl'), JSON.stringify(products))) return;
  // Conserva el filtro elegido (antes lo reseteaba a "Todos" en cada alta).
  _catPintarFiltros(document.getElementById('fmodel'), document.getElementById('fcountry'));
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

