// ── PARSER DE IMPORTES ──
// Convierte a Number cualquier texto de un input/celda de plata distinguiendo el
// separador de miles del decimal. Regla: el ÚLTIMO separador ("." o ",") es el
// decimal solo si le siguen 1 o 2 dígitos; si le siguen 3 o más (o ninguno) es
// separador de miles y se descarta.
//   "1041,67" → 1041.67    "1041.67" → 1041.67    "1.041,67" → 1041.67
//   "1.041"   → 1041       "1,041"   → 1041       "1.250.000" → 1250000
// Antes, upSalePriceDirect borraba TODOS los puntos: al reeditar un precio ya
// guardado ("1041.67") lo convertía en 104167 (×100 silencioso).
// Devuelve NaN si no hay ningún número en la entrada.
// cevenParseMoney() vive en shared/safe.js — las dos marcas la usan.

// IDs de ítem de cotización: contador monótono. Date.now()+random colisionaba al
// agregar varios productos de una sola vez (rmItem borraba dos filas, upQty/upMargin
// actualizaban dos filas).
var _itemSeq = 0;
function _nextItemId(){ return 'it_' + Date.now() + '_' + (++_itemSeq); }

// ── PRICE LIST ──
// cevenLsJSON() devuelve el fallback cuando el JSON guardado está corrupto. Antes
// eso pasaba en silencio: la app arrancaba con el catálogo vacío y el usuario
// creía que nunca había importado nada, así que perdía tiempo buscando el Excel.
(function(){
  var raw = null;
  try{ raw = localStorage.getItem('cpl'); }catch(e){}
  var s = cevenLsJSON('cpl', null);
  if(s && s.length){ products = s; initCat(); return; }
  if(raw){
    // Había algo guardado y no se pudo usar (JSON inválido o forma inesperada).
    var aviso = '⚠ El price list guardado está corrupto y no se pudo leer. Volvé a importar el Excel.';
    showErr(aviso);
    if(typeof showToast === 'function') setTimeout(function(){ showToast(aviso); }, 400);
  }
})();

// El price list de Apple viene partido en DOS archivos ("APPLE Price list …" y
// su gemelo "… FTZ"), así que la carga acepta varios a la vez: uno por uno, el
// segundo reemplazaba al primero y el catálogo quedaba a la mitad.
function handlePL(files) {
  if(!files) return;
  // Admite tanto un File suelto (llamadas viejas) como el FileList del input.
  var list = files.name ? [files] : Array.prototype.slice.call(files);
  if(!list.length) return;
  var all = [], errores = [], pend = list.length;

  function terminar(){
    if(pend > 0) return;
    if(all.length) processRows(all);
    // Va DESPUÉS de processRows(), que en el camino feliz limpia el cartel de error.
    if(errores.length) showErr(errores.join(' · '));
    else if(!all.length) showErr('No se encontraron filas de datos.');
  }

  list.forEach(function(f){
    var isXL = /\.(xlsx|xls)$/i.test(f.name);
    var r = new FileReader();
    r.onload = function(e){
      try{
        if(isXL){
          var wb = XLSX.read(new Uint8Array(e.target.result), {type:'array'});
          var rows = _plWorkbookRows(wb);
          if(!rows) errores.push('No se encontraron encabezados ("Model #" / "Selling Price") en '+f.name+'.');
          else all = all.concat(rows);
        } else {
          all = all.concat(parseCSV(e.target.result));
        }
      }catch(er){ errores.push('Error leyendo '+f.name+': '+er.message); }
      pend--; terminar();
    };
    r.onerror = function(){ errores.push('No se pudo leer '+f.name+'.'); pend--; terminar(); };
    if(isXL) r.readAsArrayBuffer(f); else r.readAsText(f,'UTF-8');
  });
}

// parseCSV() y fk() viven en shared/catalog-core.js (eran identicos).

// ── DÓNDE EMPIEZA LA TABLA ──
// Los archivos de Apple traen cuatro filas de avisos ANTES del encabezado, así
// que sheet_to_json() con el header por defecto devolvía columnas "__EMPTY…" y
// la carga moría con "No se encontró Selling Price". Hay que ubicar la fila del
// encabezado a mano — la cuenta ya la hacía handlePriceUpdate() y ahora la
// comparten los dos caminos. Se piden DOS encabezados conocidos en la misma
// fila: una celda suelta que diga "SKU" en el texto de arriba no es la tabla.
var _PL_HEADERS = ['model #','model#','sku','selling price','sellingprice','price',
                   'model description','description','country','lob','model','status'];
function _plHeaderIdx(raw){
  for(var i=0;i<raw.length;i++){
    var row = raw[i];
    if(!row || !row.length) continue;
    var hits = 0;
    for(var j=0;j<row.length;j++){
      if(_PL_HEADERS.indexOf(String(row[j]).trim().toLowerCase()) !== -1) hits++;
    }
    if(hits >= 2) return i;
  }
  return -1;
}

// Filas de una hoja como objetos {encabezado: valor}, o null si la hoja no tiene
// encabezado reconocible (el archivo no-FTZ trae además una "Hoja1" vacía).
function _plSheetRows(sheet){
  var raw = XLSX.utils.sheet_to_json(sheet, {header:1, defval:''});
  var hi = _plHeaderIdx(raw);
  if(hi < 0) return null;
  var hdr = raw[hi].map(function(h){ return String(h).trim(); });
  var out = [];
  for(var j=hi+1;j<raw.length;j++){
    var row = raw[j];
    if(!row || !row.length) continue;
    var obj = {}, hasVal = false;
    for(var k=0;k<hdr.length;k++){
      if(!hdr[k]) continue;                       // columnas sin encabezado
      var v = (row[k]!==undefined) ? row[k] : '';
      obj[hdr[k]] = v;
      if(v !== '') hasVal = true;
    }
    if(hasVal) out.push(obj);
  }
  return out;
}

// La primera hoja del libro que tenga tabla.
function _plWorkbookRows(wb){
  for(var i=0;i<wb.SheetNames.length;i++){
    var rows = _plSheetRows(wb.Sheets[wb.SheetNames[i]]);
    if(rows && rows.length) return rows;
  }
  return null;
}

// Busca una columna por nombre EXACTO (case-insensitive, trim) — a diferencia de fk(),
// no le quita espacios/símbolos, porque en estos archivos "Model" y "Model #" colisionarían
// (ambos quedarían "model" si se normalizan igual que fk()).
function exactKey(obj, name){
  var target = name.trim().toLowerCase();
  var keys = Object.keys(obj);
  for(var i=0;i<keys.length;i++){ if(keys[i].trim().toLowerCase()===target) return keys[i]; }
  return null;
}

// ── LAS COLUMNAS QUE SE CARGAN, EN UN SOLO LUGAR ──
// El SKU nuestro es **"Model #"**: es el código que se cotiza, se factura y viaja
// al pipeline. La columna "SKU" del mismo archivo es un código interno corto de
// Apple ("321D38") que no matchea con nada, y era la que usaba la carga completa
// mientras la actualización de precios usaba "Model #": el mismo catálogo quedaba
// con SKU distintos según el botón que se hubiera apretado.
// La búsqueda de "Model #" y "Model" es EXACTA porque fk() normaliza y "Model"
// se comería a "Model #".
function _plCols(row){
  return {
    sku:     exactKey(row,'Model #') || exactKey(row,'Model#') || fk(row,'SKU'),
    price:   fk(row,'Selling Price','SellingPrice','Price','Precio'),
    country: fk(row,'Country','Model Country','Pais','País'),
    desc:    fk(row,'Model Description','Description','Descripcion','Desc'),
    lob:     fk(row,'LOB','lob'),
    model:   exactKey(row,'Model')
  };
}

// Pliega las filas leídas a un producto por SKU. Los dos archivos se pisan en 14
// SKU y en 4 de ellos el FTZ vale unos dólares más, así que ante el mismo
// "Model #" se conserva el precio MÁS ALTO: cotizar de menos sale plata.
function _plFold(rows){
  var c = _plCols(rows[0]);
  var bySku = {}, order = [], leidas = 0;
  if(!c.sku || !c.price) return {cols:c, order:order, bySku:bySku, leidas:leidas};
  for(var i=0;i<rows.length;i++){
    var r = rows[i];
    var sku = String(r[c.sku]||'').trim();
    if(!sku) continue;
    leidas++;
    var sp = cevenParseMoney(r[c.price]); if(isNaN(sp)) sp = 0;
    var prev = bySku[sku];
    if(prev && sp <= prev.sellingPrice) continue;
    if(!prev) order.push(sku);
    bySku[sku] = {
      sku: sku,
      lob:          c.lob     ? String(r[c.lob]||'')     : '',
      modelCol:     c.model   ? String(r[c.model]||'')   : '',
      country:      c.country ? String(r[c.country]||'') : '',
      description:  c.desc    ? String(r[c.desc]||'')    : '',
      sellingPrice: sp
    };
  }
  return {cols:c, order:order, bySku:bySku, leidas:leidas};
}

// Carga completa: REEMPLAZA el catálogo con lo que traigan el/los archivo(s).
// El camino que conserva lo que ya había (y los productos manuales) es
// handlePriceUpdate().
function processRows(rows) {
  if(!rows.length){ showErr('Archivo vacío.'); return; }
  var fold = _plFold(rows);
  if(!fold.cols.sku || !fold.cols.price){
    showErr('No se encontró "Model #" o "Selling Price". Columnas: '+Object.keys(rows[0]).join(', '));
    return;
  }
  products = fold.order.map(function(sku, i){
    var p = fold.bySku[sku];
    p.id = i;
    return p;
  });
  // El catálogo ya está en memoria: se muestra igual, pero si no se pudo persistir
  // hay que decirlo en vez de dejar el cartel de "OK".
  var okPL = cevenLsSet('cpl',JSON.stringify(products));
  showErr(okPL ? '' : '⚠ El price list se cargó en pantalla pero NO se pudo guardar: se pierde al recargar.');
  initCat();
  if(okPL && typeof showToast === 'function'){
    var plegadas = fold.leidas - products.length;
    showToast('✓ Price list cargado: '+products.length+' productos'
      + (plegadas>0 ? ' · '+plegadas+' fila(s) repetida(s), se conservó el precio más alto' : '') + '.');
  }
}

// ── Actualizar precios (merge): a diferencia de processRows(), NO reemplaza el catálogo.
// Solo actualiza el costo de los SKU que ya existen, agrega los nuevos, y conserva
// intactos los productos manuales y los que no aparecen en el/los archivo(s) nuevo(s).
function handlePriceUpdate(files){
  if(!files || !files.length) return;
  var fileList = Array.prototype.slice.call(files);
  var allRows = [];
  var pending = fileList.length;
  var hadError = false;

  fileList.forEach(function(f){
    var r = new FileReader();
    r.onload = function(e){
      try {
        var wb = XLSX.read(new Uint8Array(e.target.result), {type:'array'});
        var rows = _plWorkbookRows(wb);
        if(!rows){
          hadError = true;
          showErr('No se encontraron encabezados ("Model #" / "Selling Price") en '+f.name+'.');
        } else {
          allRows = allRows.concat(rows);
        }
      } catch(er){
        hadError = true;
        showErr('Error leyendo '+f.name+': '+er.message);
      }
      pending--;
      if(pending === 0) finishPriceUpdate(allRows, hadError);
    };
    r.readAsArrayBuffer(f);
  });
}

function finishPriceUpdate(rows, hadError){
  if(!rows.length){
    if(!hadError) showErr('No se encontraron filas de datos en los archivos.');
    return;
  }
  // Mismas columnas y mismo plegado por "Model #" que la carga completa: si los
  // dos caminos no coincidieran, actualizar precios inventaría SKU nuevos en vez
  // de actualizar los que ya están.
  var fold = _plFold(rows);
  if(!fold.cols.sku || !fold.cols.price){
    showErr('No se encontró "Selling Price" o "Model #" en el archivo. Columnas: '+Object.keys(rows[0]).join(', '));
    return;
  }
  var bySku = fold.bySku;

  var bySkuExisting = {};
  for(var x=0;x<products.length;x++){ if(products[x].sku) bySkuExisting[products[x].sku] = products[x]; }

  var updated = 0, added = 0, addedCounter = 0;
  Object.keys(bySku).forEach(function(sku){
    var nd = bySku[sku];
    var existing = bySkuExisting[sku];
    if(existing){
      // Solo se toca el costo — descripción/modelo/país/manual quedan intactos.
      if(existing.sellingPrice !== nd.sellingPrice){ existing.sellingPrice = nd.sellingPrice; updated++; }
      // El SKU apareció en la lista nueva → su precio queda confirmado, aunque no haya cambiado.
      delete existing.needsReview;
    } else {
      addedCounter++;
      var newProd = {id: Date.now()+addedCounter, sku: nd.sku, lob: nd.lob, modelCol: nd.modelCol, country: nd.country, description: nd.description, sellingPrice: nd.sellingPrice};
      products.push(newProd);
      bySkuExisting[sku] = newProd;
      added++;
    }
  });

  // Todo lo que no apareció en ningún archivo de esta actualización (incluidos los
  // manuales) queda marcado para revisar — su costo sigue siendo el de antes, sin verificar.
  var notReviewed = 0;
  for(var y=0;y<products.length;y++){
    if(!bySku[products[y].sku]){ products[y].needsReview = true; notReviewed++; }
  }

  var okUpd = cevenLsSet('cpl', JSON.stringify(products));
  initCat();
  showErr(okUpd ? '' : '⚠ Los precios se actualizaron en pantalla pero NO se pudieron guardar: se pierden al recargar.');
  if(okUpd) showToast('✓ Precios actualizados: '+updated+' actualizados, '+added+' nuevos agregados, '+notReviewed+' a revisar (no estaban en la lista nueva). Catálogo: '+products.length+' productos.');
}

// Si el catálogo quedó vacío hay que volver al estado "sin price list": initCat()
// se planta con products vacío y la tabla se quedaría con las filas ya borradas.
function _catRepintar(){
  if(products.length){ initCat(); return; }
  document.getElementById('catui').style.display='none';
  document.getElementById('nopl').style.display='block';
  var b=document.getElementById('plbadge'); b.className='bk bkw'; b.textContent='Sin price list';
}

/* Baja masiva del catálogo por sufijo de SKU. No se pregunta antes: se hace y el
   cartel ofrece deshacer, que es el criterio de toda la app (ver notify.js). No
   toca cotizaciones ni pipeline ya guardados, solo el catálogo de selección.

   Si el guardado falla se revierte en memoria: dejar la pantalla sin los SKU y
   el localStorage con ellos hacía que "se borraron" durara hasta el próximo
   reload. cevenLsSet() ya le avisa al usuario. */
function _catBajaMasiva(pred, etiqueta){
  var quitados = [], quedan = [];
  for(var i=0;i<products.length;i++){ (pred(products[i]) ? quitados : quedan).push(products[i]); }
  if(!quitados.length){ showToast('No hay SKU '+etiqueta+' en el catálogo.'); return; }
  var antes = products;
  products = quedan;
  if(!cevenLsSet('cpl', JSON.stringify(products))){ products = antes; return; }
  selIds = {};
  _catRepintar();
  notifyUndo('Eliminaste '+quitados.length+' SKU '+etiqueta+'. Catálogo: '+products.length+' productos.', function(){
    products = antes;
    if(!cevenLsSet('cpl', JSON.stringify(products))) return;
    _catRepintar();
  });
}

// Elimina del catálogo los SKU con sufijo de país "LL/A" (EE.UU./Canadá).
function deleteLLASkus(){
  _catBajaMasiva(function(p){ return (p.sku||'').toUpperCase().slice(-4) === 'LL/A'; }, 'terminados en "LL/A"');
}

// SKU termina en "E/A" con sufijo de país de UNA sola letra (ej. "MDH74E/A") — distinto
// de sufijos de país reales de 2 letras que también terminan en E, como "LE/A" o "BE/A".
function isExactEASuffix(sku){
  var s = (sku||'').toUpperCase();
  if(s.slice(-3) !== 'E/A') return false;
  var prevChar = s.charAt(s.length - 4);
  return !prevChar || !/[A-Z]/.test(prevChar);
}
function deleteEASkus(){
  _catBajaMasiva(function(p){ return isExactEASuffix(p.sku); }, 'con sufijo "E/A" (no toca "LE/A" ni "BE/A")');
}

function toggleCleanupMenu(ev){
  if(ev) ev.stopPropagation();
  var m = document.getElementById('cleanup-menu');
  if(!m) return;
  m.style.display = (m.style.display === 'block') ? 'none' : 'block';
}
function closeCleanupMenu(){
  var m = document.getElementById('cleanup-menu');
  if(m) m.style.display = 'none';
}
document.addEventListener('click', function(e){
  var m = document.getElementById('cleanup-menu');
  if(m && m.style.display === 'block' && !m.contains(e.target)) closeCleanupMenu();
});

function initCat() {
  if(!products.length) return;
  document.getElementById('nopl').style.display='none';
  document.getElementById('catui').style.display='block';
  var b=document.getElementById('plbadge'); b.className='bk bkok'; b.textContent='✓ '+products.length+' productos';
  selIds={};
  _catPintarFiltros(document.getElementById('fmodel'), document.getElementById('fcountry'));
  renderCat();
}

// ── CATALOG ──
// _pendingNewSKUs, handleSearchInput/Paste, processMultiSKUs y
// promptForNextPendingSKU viven en shared/catalog-core.js.

/* El filtrado recibe los ELEMENTOS y no lee los ids a mano: desde 08/2026 hay
   dos juegos de filtros vivos —la vista Catálogo y la subpantalla flotante— y
   cada uno filtra su propia tabla. */
function getFilteredCon(searchEl, modelEl, countryEl) {
  var s = searchEl ? searchEl.value.toLowerCase().trim() : '';
  var m = (modelEl   && modelEl.value)   || 'Todos';
  var c = (countryEl && countryEl.value) || 'Todos';
  // Dividir el texto en palabras (separadas por espacios), todas deben coincidir
  var terms = s ? s.split(/\s+/).filter(function(t){return t.length>0;}) : [];
  return products.filter(function(p){
    if(m!=='Todos'&&p.modelCol!==m) return false;
    if(c!=='Todos'&&p.country!==c) return false;
    if(terms.length){
      var hay = ((p.sku||'')+' '+(p.lob||'')+' '+(p.modelCol||'')+' '+(p.description||'')+' '+(p.country||'')).toLowerCase();
      for(var i=0;i<terms.length;i++){ if(hay.indexOf(terms[i])===-1) return false; }
    }
    return true;
  });
}

function getFiltered() {
  return getFilteredCon(document.getElementById('fsearch'),
                        document.getElementById('fmodel'),
                        document.getElementById('fcountry'));
}

/* Opciones de los selects Model/País a partir del catálogo. Conserva lo que
   estuviera elegido si sigue existiendo: rehacer el innerHTML a secas reseteaba
   el filtro a "Todos" cada vez que se daba de alta un artículo manual. */
function _catPintarFiltros(modelEl, countryEl){
  var models = uniq(products.map(function(p){return p.modelCol;}));
  var countries = uniq(products.map(function(p){return p.country;}));
  if(countries.indexOf('Uruguay')<0) countries.push('Uruguay');
  if(modelEl){
    var mv = modelEl.value;
    modelEl.innerHTML = optionsHTML(models);
    modelEl.value = (models.indexOf(mv) >= 0) ? mv : 'Todos';
  }
  if(countryEl){
    var cv = countryEl.value;
    countryEl.innerHTML = optionsHTML(countries);
    countryEl.value = (countries.indexOf(cv) >= 0) ? cv : 'Todos';
  }
}

/* Lo que hace falta para calcular los precios de una tanda de filas. Se resuelve
   UNA vez por render y no una vez por producto: getNac() recorre la tabla de
   tasas y el catálogo pasa las 500 filas.

   MISMO criterio que addToQuote(): si la cotización es FOB o el precio del
   producto ya viene nacionalizado (chapita NAC✓), no se vuelve a nacionalizar.
   Antes el catálogo mostraba USD 1.550 (costo 1000 + 24% nac + 20% mg) y la
   cotización cargaba USD 1.250 para el mismo producto. */
function _catCalc(){
  return {mg: getM(), fob: isCotizacionFOB()};
}

/* Las chapitas del producto. Van todas en la celda Descripción, que es la única
   que puede crecer: pegadas al SKU y con esa columna a 130px, el propio SKU
   salía cortado con puntos suspensivos para hacerles lugar. */
function _catChapitas(p){
  var ch = '';
  if(p.manual)      ch += ' <span style="font-size:10px;color:#0071e3;font-weight:600;background:#e8f4ff;padding:1px 6px;border-radius:8px;white-space:nowrap" title="Artículo cargado a mano, no vino del price list">manual</span>';
  if(p.nacIncluded) ch += ' <span style="font-size:10px;color:#6e36c8;font-weight:600;background:#f0e8ff;padding:1px 6px;border-radius:8px;white-space:nowrap" title="Precio ya nacionalizado">NAC✓</span>';
  if(p.needsReview) ch += ' <span style="font-size:10px;color:#c84e00;font-weight:600;background:#fff3e0;padding:1px 6px;border-radius:8px;white-space:nowrap" title="No apareció en la última actualización de precios — verificar costo">⚠ Revisar costo</span>';
  return ch;
}

/* Una fila del catálogo. La comparten la vista Catálogo y la subpantalla
   flotante (picker.js) para que las dos tablas no se despeguen.

   `opts.agregar` cambia la primera columna por el botón ＋/✓ (agregar o sacar de
   la cotización en el acto) y saca las acciones de administración; sin él, la
   fila es la de siempre: checkbox, selección en lote y ✎/×.

   El id del producto viaja por `data-pid` y lo resuelve el listener delegado:
   interpolarlo crudo en un onclick rompía con los productos manuales, cuyo id es
   un string ('pm_1730…_3') y quedaba como identificador JS suelto. Las dos
   tablas pueden usar el MISMO atributo porque direccionan por id de producto (no
   por índice de fila) y cada una tiene su propio listener. */
function _catRowHTML(p, calc, opts){
  opts = opts || {};
  var nac = (calc.fob || p.nacIncluded) ? 0 : getNac(p);
  var nt  = p.sellingPrice * (1 + nac/100);
  var sp  = calcP(p.sellingPrice, nac, calc.mg);
  var pidA = ' data-pid="'+cevenEsc(p.id)+'"';
  var sel = !opts.agregar && !!selIds[p.id];
  /* El verde de "ya está en la cotización" solo tiene sentido donde se puede
     agregar. En la vista Catálogo la cotización no es el tema. */
  var enq = !!opts.agregar && _enCotizacion(p.sku);
  return '<tr class="crow'+(opts.agregar?' pk-row':'')+(sel?' sel':'')+(enq?' enq':'')+'"'
      +(opts.agregar?'':' data-act="row"')+pidA+'>'
    +(opts.agregar
      ? '<td style="text-align:center;overflow:visible">'
        +'<button class="'+(enq?'bs cat-quitar':'bd cat-sumar')+'" data-act="'+(enq?'unq':'addone')+'"'+pidA
          +' title="'+(enq?'Sacar de la cotización':'Agregar a la cotización')+'"'
          +' style="padding:3px 10px;font-size:13px;line-height:1.2">'+(enq?'✓':'+')+'</button>'
      +'</td>'
      : '<td style="overflow:visible"><input type="checkbox"'+(sel?' checked':'')+' data-act="chk"'+pidA+'></td>')
    +'<td style="font-weight:500">'+cevenEsc(p.sku)+'</td>'
    +'<td class="wrap">'+cevenEsc(p.description)+_catChapitas(p)+'</td>'
    +'<td style="text-align:right;color:#6e6e73;white-space:nowrap">USD '+fD(p.sellingPrice)+'</td>'
    +'<td style="text-align:right;color:#6e6e73;white-space:nowrap">USD '+fD(nt)+'</td>'
    +'<td style="text-align:right;font-weight:500;white-space:nowrap">'+dp(sp)+'</td>'
    +(opts.agregar ? ''
      : '<td style="text-align:center;white-space:nowrap;overflow:visible">'
        +'<button class="bs" data-act="edit"'+pidA+' title="Editar" style="padding:2px 6px;font-size:12px">✎</button> '
        +'<button class="bsr" data-act="del"'+pidA+' title="Eliminar">×</button>'
      +'</td>')
    +'</tr>';
}

function renderCat() {
  var filtered=getFiltered(), calc=_catCalc(), html='';
  for(var i=0;i<filtered.length;i++) html += _catRowHTML(filtered[i], calc, null);
  document.getElementById('catbody').innerHTML = html || '<tr><td colspan="7" style="text-align:center;color:#aeaeb2;padding:24px">Sin resultados</td></tr>';
  _catBindDelegation();
  var cnt=Object.keys(selIds).length;
  document.getElementById('catcount').textContent = filtered.length+' productos · '+cnt+' seleccionados';
  var btn=document.getElementById('addbtn');
  btn.style.display = cnt>0 ? 'inline-block' : 'none';
  btn.textContent = editId!==null ? 'Confirmar cambio' : 'Agregar ('+cnt+')';
  var allSel=filtered.length>0; for(var j=0;j<filtered.length;j++){if(!selIds[filtered[j].id]){allSel=false;break;}}
  document.getElementById('chkall').checked=allSel;
  // La flotante puede estar mostrando la misma lista: si no se repinta, queda
  // con el estado viejo de los botones (renderCat se llama desde varios lados).
  if(typeof renderPicker === 'function') renderPicker();
}

// toggleRow() y toggleAll() viven en shared/catalog-core.js.

// Delegación de eventos del catálogo. Reemplaza los onclick inline que llevaban
// el id del producto concatenado: además del riesgo de inyección, ese formato no
// soportaba ids no numéricos (productos manuales).
// Se ata desde renderCat() y no desde una IIFE: si #catbody todavía no existiera
// cuando corre este <script>, la IIFE se rendía en silencio y el catálogo quedaba
// sin ningún handler. cevenDelegate() ata una sola vez aunque se llame en cada
// render (el contenedor sobrevive al innerHTML de sus hijos).
function _catBindDelegation(){
  cevenDelegate('catbody', 'click', function(ev){
    var el = cevenActEl(ev, this);
    if(!el) return;
    var pid = el.getAttribute('data-pid');
    if(pid === null) return;
    var act = el.getAttribute('data-act');
    if(act === 'edit')     editManualProduct(pid);
    else if(act === 'del') deleteManualProduct(pid);
    else                   toggleRow(pid);   // 'row' y 'chk'
  });
}

// ── QUOTE ──
// Cuando cambia el campo Observaciones, si aparece/desaparece FOB recalcular el Nac de todos los items
var _lastFOBState = false;
function onObsChange(){
  var fobNow = isCotizacionFOB();
  if(fobNow === _lastFOBState) return;
  _lastFOBState = fobNow;
  if(!items.length) return;
  for(var i=0;i<items.length;i++){
    var it = items[i];
    // Ítems con precio ya nacionalizado nunca suman nac, aunque se quite FOB
    var nac = (fobNow || it.nacIncluded) ? 0 : getNac({lob:it.lob||'', modelCol:it.lob||'', description:it.description||''});
    it.itemNac = nac;
    // Mantener precio, recalcular margen
    if(it.salePrice > 0 && it.sellingBase > 0){
      it.itemMargin = calcMargenFromPrice(it.sellingBase, nac, it.salePrice);
    }
  }
  renderQ();
  showToast(fobNow ? 'FOB detectado — Nac. seteado a 0% en todos los ítems' : 'FOB removido — Nac. restaurado por categoría');
}

function isCotizacionFOB(){
  var obs = document.getElementById('obs') ? document.getElementById('obs').value : '';
  return /\bfob\b/i.test(obs);
}

function addToQuote() {
  var mg=getM();
  var toAdd=[];
  for(var i=0;i<products.length;i++){ if(selIds[products[i].id]) toAdd.push(products[i]); }
  // Ordenar por el orden en que fueron seleccionados
  toAdd.sort(function(a,b){ return (selIds[a.id]||0) - (selIds[b.id]||0); });
  if(!toAdd.length) return;

  var fob = isCotizacionFOB(); // Si es FOB, nac = 0 para todos los ítems

  if(editId !== null) {
    var p=toAdd[0], nac=(fob||p.nacIncluded) ? 0 : getNac(p);
    for(var i=0;i<items.length;i++){
      if(String(items[i].id)===String(editId)){
        var mgEd = (typeof items[i].itemMargin==='number') ? items[i].itemMargin : mg;
        items[i].sku=p.sku; items[i].description=p.description;
        items[i].sellingBase=p.sellingPrice; items[i].lob=p.lob;
        items[i].itemNac=nac; items[i].salePrice=calcP(p.sellingPrice,nac,mgEd);
        // El flag viaja con el producto: "precio ya nacionalizado" es un dato del
        // artículo, no algo a deducir después de itemNac===0 (que también pasa con FOB).
        items[i].nacIncluded=!!p.nacIncluded;
        items[i].taxes=getIVA(p.lob);
      }
    }
    editId=null;
  } else {
    var calc = {mg: mg, fob: fob};
    for(var j=0;j<toAdd.length;j++) _sumarProductoAItems(toAdd[j], calc);
  }
  selIds={};
  // Resetear el sort para que los productos nuevos queden al final (sin reordenar)
  _qSortKey = null; _qSortDir = 1;
  renderQ();
  goTo('quote');
}

/* Una línea de cotización a partir de un producto del catálogo. Vive acá sola —y
   no duplicada en cada camino de alta— porque es donde se decide el precio: si
   el alta de a uno (la subpantalla flotante) y el alta en lote ("Agregar (N)")
   se desincronizaran, un producto valdría distinto según por dónde entró. */
function _sumarProductoAItems(p, calc){
  var nac = (calc.fob || p.nacIncluded) ? 0 : getNac(p);
  var newItem = {id:_nextItemId(), sku:p.sku, lob:p.lob, description:p.description,
                 sellingBase:p.sellingPrice, itemNac:nac, itemMargin:calc.mg,
                 salePrice:calcP(p.sellingPrice, nac, calc.mg), qty:1, stock:'',
                 taxes:getIVA(p.lob), nacIncluded:!!p.nacIncluded};
  items.push(newItem);
  // Sugerir garantía si es Mac
  if(typeof suggestMacWarranty==='function') suggestMacWarranty(newItem);
  return newItem;
}

/* Producto por id. El id viaja por `data-pid` y vuelve como string: los del
   price list son números (índice de fila) y los manuales strings, así que la
   comparación va siempre por String. */
function _prodPorId(pid){
  for(var i=0;i<products.length;i++){ if(String(products[i].id) === String(pid)) return products[i]; }
  return null;
}

// ¿Este SKU ya está en la cotización? Lo usan la fila del catálogo y la
// subpantalla flotante para saber si el botón va ＋ o ✓.
function _enCotizacion(sku){
  for(var i=0;i<items.length;i++){ if(String(items[i].sku) === String(sku)) return true; }
  return false;
}

/* Alta de UN producto, sin salir de donde estés. addToQuote() navega a la
   cotización porque cierra un alta en lote; acá el gesto es "voy marcando
   mientras recorro la lista", y sacarte de la pantalla en cada clic haría que
   volver sea el paso más repetido del flujo. */
function agregarUno(p){
  if(_enCotizacion(p.sku)) return;
  _sumarProductoAItems(p, _catCalc());
  _qSortKey = null; _qSortDir = 1;
  renderQ();
  if(typeof renderWarranties === 'function') renderWarranties();
  renderCat();
  showToast('Agregado: ' + p.sku + '.');
}

/* Saca de la cotización TODAS las líneas de ese SKU. Puede haber más de una (se
   agregó dos veces, o vino de una cotización copiada), y dejar una a medias
   contradiría el botón, que dice si el SKU está o no está. */
function quitarDeCotizacion(p){
  var antes = items.length;
  items = items.filter(function(it){ return String(it.sku) !== String(p.sku); });
  if(items.length === antes) return;
  renderQ();
  renderCat();
  showToast('Sacado de la cotización: ' + p.sku + '.');
}

// ── SORT DE COTIZACIÓN ──
// _qSortKey/_qSortDir viven en shared/quote-core.js.

var FAMILY_ORDER = ['MacBook Neo','MacBook Air','MacBook Pro','iMac','Mac mini','Mac Studio','Mac Pro','iPhone','iPad','Apple Watch','AirPods','Accesorios'];

function getProductFamily(it){
  var s = ((it.description||'')+' '+(it.lob||'')+' '+(it.modelCol||'')).toLowerCase();
  if(/macbook\s*neo|macbookneo/.test(s))      return 'MacBook Neo';
  if(/macbook\s*pro|mbp/.test(s))             return 'MacBook Pro';
  if(/macbook\s*air|mba/.test(s))             return 'MacBook Air';
  if(/imac/.test(s))                          return 'iMac';
  if(/mac\s*mini/.test(s))                    return 'Mac mini';
  if(/mac\s*studio/.test(s))                  return 'Mac Studio';
  if(/mac\s*pro/.test(s))                     return 'Mac Pro';
  if(/iphone/.test(s))                        return 'iPhone';
  if(/ipad/.test(s))                          return 'iPad';
  if(/watch/.test(s))                         return 'Apple Watch';
  if(/airpod/.test(s))                        return 'AirPods';
  return 'Accesorios';
}

