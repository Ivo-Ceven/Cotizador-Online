/* ============================================================
   CATALOGO · NUCLEO GENERICO  ·  compartido por todas las marcas
   ------------------------------------------------------------
   Lo que NO depende de que columnas tiene el catalogo de cada
   marca: parsear un CSV, adivinar el nombre de una columna,
   pegar una lista de SKUs, seleccionar filas, limpiar filtros.

   Lo que SI depende y por eso queda en <marca>/js/catalog.js:
     · processRows()  — Apple necesita Selling Price/LOB/Country,
       Poly solo SKU + Descripcion y prefiere la hoja "POLY".
     · getFiltered()  — Apple filtra ademas por modelo y pais.
     · renderCat()    — columnas distintas (Apple muestra costo,
       nacionalizado y precio con margen; Poly, precio de lista
       de referencia y stock).
     · addToQuote()   — Apple calcula margen y nacionalizacion.

   Depende de: brand.js (plLabel), ui-core.js (goTo).
   Se carga DESPUES de ui-core.js y ANTES de <marca>/js/catalog.js.
   ============================================================ */

/* Parsea un CSV/TSV respetando comillas. El separador se detecta solo:
   tabulacion, punto y coma o coma, en ese orden (Excel es-AR exporta con ';'). */
function parseCSV(txt) {
  var sep = txt.indexOf('\t')!==-1 ? '\t' : (txt.split('\n')[0].indexOf(';')!==-1 ? ';' : ',');
  var lines = txt.trim().split('\n');
  if(lines.length < 2) return [];
  var hdr = lines[0].split(sep).map(function(h){ return h.trim().replace(/^"|"$/g,''); });
  var rows = [];
  for(var i=1;i<lines.length;i++) {
    var cols=[],cur='',inQ=false,line=lines[i];
    for(var j=0;j<line.length;j++) {
      var c=line[j];
      if(c==='"') inQ=!inQ;
      else if(c===sep && !inQ){ cols.push(cur.trim()); cur=''; }
      else cur+=c;
    }
    cols.push(cur.trim());
    var row={};
    for(var k=0;k<hdr.length;k++) row[hdr[k]]=(cols[k]||'').replace(/^"|"$/g,'').trim();
    var hasVal=false; for(var kk in row){ if(row[kk]){ hasVal=true; break; } }
    if(hasVal) rows.push(row);
  }
  return rows;
}

/* "Find key": busca en obj la primera columna que matchee alguno de los nombres
   que siguen, normalizando (minusculas, sin espacios ni simbolos) y aceptando
   coincidencia parcial. Los Excel que manda cada proveedor nunca traen el mismo
   encabezado exacto. Devuelve el nombre REAL de la clave, o null. */
function fk(obj) {
  var nk = function(s){ return s.toLowerCase().replace(/\s+/g,'').replace(/[^a-z0-9]/g,''); };
  var keys = Object.keys(obj);
  for(var c=1;c<arguments.length;c++) {
    var n = nk(arguments[c]);
    for(var k=0;k<keys.length;k++) { if(nk(keys[k])===n || nk(keys[k]).indexOf(n)!==-1) return keys[k]; }
  }
  return null;
}

// ── MULTI-SKU PASTE ──
// Pegar una columna de SKUs desde un mail o un Excel y que queden seleccionados.
var _pendingNewSKUs = []; // SKUs a crear manualmente (pegados pero no encontrados)

function handleSearchInput(){
  // Un solo termino (sin saltos/tabs/comas) = busqueda normal. Si hay varios
  // tokens, el que los procesa es el onpaste.
  renderCat();
}

/* `inputEl` es el campo desde el que se pegó. Se recibe en vez de buscar
   '#fsearch' a mano porque ahora hay dos: el de la vista Catalogo y el de la
   subpantalla flotante de Poly. Sin esto, pegar en la flotante limpiaba el otro
   campo y dejaba el propio con el texto adentro. */
function handleSearchPaste(e, inputEl){
  var text = (e.clipboardData || window.clipboardData).getData('text');
  if(!text) return;
  if(!/[\n\t,;]/.test(text.trim())){
    // Texto normal — dejar pegar y buscar
    setTimeout(renderCat, 0);
    return;
  }
  e.preventDefault();
  var tokens = text.split(/[\n\t,;]+/).map(function(s){return s.trim();}).filter(function(s){return s.length>0;});
  if(!tokens.length) return;
  processMultiSKUs(tokens, inputEl || (e.target || document.getElementById('fsearch')));
}

function processMultiSKUs(tokens, inputEl){
  var found = [];
  var notFound = [];
  for(var i=0;i<tokens.length;i++){
    var t = tokens[i].trim();
    if(!t) continue;
    var match = null;
    for(var j=0;j<products.length;j++){
      if((products[j].sku||'').toLowerCase() === t.toLowerCase()){ match = products[j]; break; }
    }
    if(match) found.push(match);
    else      notFound.push(t);
  }

  /* Que hacer con lo encontrado depende de la marca, y no es un detalle
     cosmetico: Poly ya no tiene checkbox ni boton de alta en lote, asi que si
     acá se siguiera tildando no pasaria absolutamente nada al pegar. La marca
     que sepa agregar directo define cevenAplicarSkusPegados(); la que no,
     conserva el camino de la seleccion. */
  var agregados = 0;
  if(typeof cevenAplicarSkusPegados === 'function'){
    agregados = cevenAplicarSkusPegados(found) || 0;
  } else {
    for(var k=0;k<found.length;k++) selIds[found[k].id] = _nextSel();
  }

  var el = inputEl || document.getElementById('fsearch');
  if(el) el.value = '';
  renderCat();

  var msg = '';
  if(found.length){
    msg += (typeof cevenAplicarSkusPegados === 'function')
      ? '✓ ' + agregados + ' SKU(s) agregados a la cotización'
        + (agregados < found.length ? ' · ' + (found.length-agregados) + ' ya estaban' : '')
      : '✓ ' + found.length + ' SKU(s) encontrados y seleccionados';
  }
  if(notFound.length){
    msg += (msg?' · ':'') + '⚠ ' + notFound.length + ' no encontrados';
  }
  if(msg) showToast(msg);

  // Si hay SKUs no encontrados, encolar y abrir el form para el primero
  if(notFound.length){
    _pendingNewSKUs = notFound.slice();
    setTimeout(function(){
      promptForNextPendingSKU();
    }, 600);
  }
}

// Titulo por defecto del formulario de alta. Apple le dice "price list" al
// listado de productos y Poly "catalogo" — sale de brand.plLabel.
function cevenAddProdTitle(){
  return 'Agregar artículo al ' + window.CEVEN_BRAND.plLabel;
}

function promptForNextPendingSKU(){
  if(!_pendingNewSKUs.length){
    document.getElementById('addprod-title').textContent = cevenAddProdTitle();
    return;
  }
  var nextSku = _pendingNewSKUs[0];

  /* La subpantalla flotante de productos tapa la pantalla entera: si se navega
     con ella abierta, la app cambia de vista DETRAS y el usuario sigue viendo
     el catalogo, sin ninguna pista de que ahora hay un formulario esperandolo. */
  if(typeof cerrarPicker === 'function') cerrarPicker();

  /* El goTo va PRIMERO, y recien despues se llenan los campos. Al reves —que es
     como estaba— no funcionaba: _navApply() llama a prepAddProd() al entrar a
     'addprod', que limpia #np-sku, o sea que borraba el SKU que se acababa de
     precargar. El formulario aparecia siempre vacio, justo en el flujo cuyo
     unico objetivo es no volver a tipear el SKU que falto. */
  goTo('addprod');

  var remaining = _pendingNewSKUs.length;
  document.getElementById('np-sku').value = nextSku;
  document.getElementById('addprod-title').textContent = 'Agregar SKU faltante (' + remaining + ' pendiente' + (remaining===1?'':'s') + ')';
  // Auto-foco en descripción para acelerar carga
  setTimeout(function(){
    var d = document.getElementById('np-desc');
    if(d) d.focus();
  }, 100);
}

// ── SELECCION ──
// selIds guarda {id: orden_de_seleccion}: el valor preserva en que orden se
// eligieron los productos, que es el orden en que entran a la cotizacion.
function toggleRow(pid) { if(selIds[pid]) delete selIds[pid]; else selIds[pid]=_nextSel(); renderCat(); }
function toggleAll(cb) { var f=getFiltered(); if(cb.checked){for(var i=0;i<f.length;i++){if(!selIds[f[i].id])selIds[f[i].id]=_nextSel();}}else{for(var i=0;i<f.length;i++)delete selIds[f[i].id];} renderCat(); }

// Los selects de modelo/pais existen solo en Apple: si no estan, no se tocan.
function clearCatalogFilters(){
  var el = document.getElementById('fsearch');   if(el) el.value='';
  var fm = document.getElementById('fmodel');    if(fm) fm.value='Todos';
  var fc = document.getElementById('fcountry');  if(fc) fc.value='Todos';
  // Categoría (solo Poly): '' es "Todas". Cada marca tiene sus filtros y los que
  // no existen se saltean solos — por eso cada uno va con su guarda.
  var fr = document.getElementById('frubro');    if(fr) fr.value='';
  renderCat();
}
