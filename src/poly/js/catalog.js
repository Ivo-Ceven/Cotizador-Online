// ── CATÁLOGO (SKU + Descripción; precio de lista y stock son solo referencia) ──
// cevenLsJSON() devuelve el fallback cuando el JSON guardado está corrupto. Antes
// eso pasaba en silencio: la app arrancaba con el catálogo vacío y el usuario
// creía que nunca había importado nada, así que perdía tiempo buscando el Excel.
(function(){
  var raw = null;
  try{ raw = localStorage.getItem(cevenK('cpl')); }catch(e){}
  var s = cevenLsJSON(cevenK('cpl'), null);
  if(s && s.length){ products = s; initCat(); return; }
  if(raw){
    // Había algo guardado y no se pudo usar (JSON inválido o forma inesperada).
    var aviso = '⚠ El catálogo guardado está corrupto y no se pudo leer. Volvé a importar el Excel.';
    showErr(aviso);
    if(typeof showToast === 'function') setTimeout(function(){ showToast(aviso); }, 400);
  }
})();

function handlePL(f) {
  if(!f) return;
  var isXL = /\.(xlsx|xls)$/i.test(f.name);
  if(isXL) {
    var r = new FileReader();
    r.onload = function(e) {
      try {
        var wb=XLSX.read(new Uint8Array(e.target.result),{type:'array'});
        // Archivos como "LP y Stock" traen una hoja por marca (POLY/HP/HUAWEI...):
        // preferir la hoja llamada "POLY" si existe, si no, la primera del archivo.
        var sheetName = wb.SheetNames.find(function(n){ return n.trim().toLowerCase()==='poly'; }) || wb.SheetNames[0];
        processRows(XLSX.utils.sheet_to_json(wb.Sheets[sheetName],{defval:''}));
      }
      catch(er){ showErr('Error Excel: '+er.message); }
    };
    r.readAsArrayBuffer(f);
  } else {
    var r2 = new FileReader();
    r2.onload = function(e){ try{ processRows(parseCSV(e.target.result)); }catch(er){ showErr('Error: '+er.message); } };
    r2.readAsText(f,'UTF-8');
  }
}

// parseCSV() y fk() viven en shared/catalog-core.js (eran identicos).

function _num(v){
  return parseFloat(String(v==null?'':v).replace(/[^0-9,\.]/g,'').replace(/\.(?=\d{3})/g,'').replace(',','.')) || 0;
}

/* El export nuevo del ERP viene en formato LARGO: una fila por
   (SKU, ubicación, nivel de precio). 564 filas = 141 combos × 4 niveles, para 77
   SKUs reales. Acá se pliega a un producto por SKU.

   Dos cosas verificadas sobre el archivo, que es lo que permite este plegado:
     · el precio NO depende de la ubicación (los 40 SKUs que están en más de un
       depósito tienen el mismo precio en todos), así que el precio es función de
       (SKU, nivel) y la ubicación solo aporta stock;
     · `Programa fiscal` y `RUBRO` son consistentes entre las filas de un SKU.

   El stock se SUMA entre depósitos (`LocAvailable`). Hoy solo un SKU tiene
   existencias en dos a la vez, pero sumar es lo correcto igual. */
function _processRowsTiers(rows, sK, dK, nivelK){
  var ubiK   = fk(rows[0],'Ubicacion del inventario','Ubicación del inventario','Ubicacion','Ubicación');
  var precK  = fk(rows[0],'Precio unitario','Precio Unitario','Precio','Price');
  var stK    = fk(rows[0],'LocAvailable','Loc Available','Disponible','Stock');
  var ivaK   = fk(rows[0],'Programa fiscal','Programa Fiscal','IVA');
  var rubK   = fk(rows[0],'RUBRO','Rubro','Categoria','Categoría');
  if(!precK){ showErr('El archivo trae "Nivel de precio" pero no se encontró la columna de precio unitario.'); return null; }

  var seen = {}, orden = [], ubiVistas = {};
  for(var i=0;i<rows.length;i++){
    var r = rows[i], sku = String(r[sK]||'').trim();
    if(!sku) continue;
    var nivel = String(r[nivelK]||'').trim();
    if(!seen[sku]){
      seen[sku] = {
        id: sku,                      // el SKU YA es único acá: sirve de id estable
        sku: sku,
        description: String(r[dK]||'').trim(),
        precios: {},
        stock: null,
        iva:   ivaK ? String(r[ivaK]||'').trim() : '',
        rubro: rubK ? String(r[rubK]||'').trim() : ''
      };
      orden.push(sku);
      ubiVistas[sku] = {};
    }
    var p = seen[sku];
    if(nivel) p.precios[nivel] = _num(r[precK]);

    /* El stock se cuenta UNA vez por (SKU, ubicación): el archivo repite el
       mismo LocAvailable en las 4 filas de niveles de ese depósito, así que
       sumar sin deduplicar lo cuadruplicaba. */
    if(stK){
      var ubi = ubiK ? String(r[ubiK]||'').trim() : '(única)';
      if(!ubiVistas[sku][ubi]){
        ubiVistas[sku][ubi] = 1;
        var s = String(r[stK]||'').trim();
        if(s !== ''){ p.stock = (p.stock||0) + (parseInt(s.replace(/[^0-9-]/g,''),10)||0); }
      }
    }
  }
  return orden.map(function(k){ return seen[k]; });
}

/* Detección genérica por nombre de columna: no asume un layout fijo. Si el
   archivo trae "Nivel de precio" se pliega el formato largo; si no, sigue el
   camino de siempre (una fila por SKU, sin tiers), que es el que necesitan los
   archivos tipo "LP y Stock". */
function processRows(rows) {
  if(!rows.length){ showErr('Archivo vacío.'); return; }
  var f=rows[0], keys=Object.keys(f);
  var sK=(function(){ for(var i=0;i<keys.length;i++){ if(keys[i].trim().toLowerCase()==='sku') return keys[i]; } return fk(f,'SKU','Nombre','Model #','Model#','Código','Code'); })();
  var dK=fk(f,'Nombre para mostrar','Producto','Description','Descripcion','Descripción','Desc');
  if(!sK){ showErr('No se encontró columna SKU. Columnas: '+keys.join(', ')); return; }

  var nivelK = fk(f,'Nivel de precio','Nivel de Precio','Price Level');
  var nuevos;
  if(nivelK){
    nuevos = _processRowsTiers(rows, sK, dK, nivelK);
    if(!nuevos) return;
  } else {
    var pK=fk(f,'Precio Unitario','Precio','Selling Price','Price');
    var stK=fk(f,'Stock','Existencia');
    var seen = {};
    for(var i=0;i<rows.length;i++) {
      var r=rows[i], sku=String(r[sK]||'').trim();
      if(!sku) continue;
      var stock = stK ? (parseInt(String(r[stK]||'').replace(/[^0-9]/g,''))||0) : null;
      seen[sku] = {id:sku, sku:sku, description:r[dK]||'', precios:{}, listPrice: pK?_num(r[pK]):0, stock:stock, iva:'', rubro:''}; // último duplicado gana
    }
    nuevos = Object.keys(seen).map(function(k){ return seen[k]; });
  }

  /* Los SKUs cargados a mano (p.manual) NO están en el archivo del ERP: si se
     pisara la lista entera con lo importado, cada importación los borraría. */
  var manuales = (products||[]).filter(function(p){ return p.manual; });
  var enArchivo = {};
  nuevos.forEach(function(p){ enArchivo[p.sku] = 1; });
  products = nuevos.concat(manuales.filter(function(p){ return !enArchivo[p.sku]; }));

  // El catálogo ya está en memoria: se muestra igual, pero si no se pudo persistir
  // hay que decirlo en vez de dejar el cartel de "OK".
  var okPL = cevenLsSet(cevenK('cpl'), JSON.stringify(products));
  showErr(okPL ? '' : '⚠ El catálogo se cargó en pantalla pero NO se pudo guardar: se pierde al recargar.');
  initCat();
  if(nivelK){
    var conTier = nuevos.filter(function(p){ return Object.keys(p.precios).length; }).length;
    showToast('✓ ' + nuevos.length + ' productos · ' + conTier + ' con precios por nivel');
  }
}

function initCat() {
  if(!products.length) return;
  document.getElementById('nopl').style.display='none';
  document.getElementById('catui').style.display='block';
  var b=document.getElementById('plbadge'); b.className='bk bkok'; b.textContent='✓ '+products.length+' productos';
  selIds={};
  renderCat();
}

// _pendingNewSKUs, handleSearchInput/Paste, processMultiSKUs y
// promptForNextPendingSKU viven en shared/catalog-core.js.

/* El filtrado real. Recibe los campos porque hay DOS juegos: los de la vista
   Catálogo (#fsearch/#frubro) y los de la subpantalla flotante (#pk-search /
   #pk-rubro). La lógica es una sola; lo único que cambia es de dónde lee. */
/* La categoría elegida. Hay dos formas de filtro conviviendo: el `<select>` de
   la vista Catálogo y los globitos de la flotante, que guardan lo elegido en un
   `data-rubro` del contenedor. Se lee acá, en un solo lugar, en vez de que cada
   llamador sepa con cuál está hablando. */
function _rubroElegido(el){
  if(!el) return '';
  return ('value' in el && el.tagName === 'SELECT') ? el.value : (el.getAttribute('data-rubro') || '');
}

function getFilteredCon(searchEl, rubroEl){
  var s = searchEl ? searchEl.value.toLowerCase().trim() : '';
  var terms = s ? s.split(/\s+/).filter(function(t){return t.length>0;}) : [];
  var rubV = _rubroElegido(rubroEl);
  return products.filter(function(p){
    // El rubro se compara exacto: las opciones salen de los propios productos,
    // así que un "contiene" solo agregaría falsos positivos entre categorías con
    // nombres parecidos.
    if(rubV && String(p.rubro||'') !== rubV) return false;
    if(terms.length){
      var hay = ((p.sku||'')+' '+(p.description||'')).toLowerCase();
      for(var i=0;i<terms.length;i++){ if(hay.indexOf(terms[i])===-1) return false; }
    }
    return true;
  });
}

/* Los filtros de la vista Catálogo. Conserva la firma sin argumentos porque
   shared/catalog-core.js la llama así. */
function getFiltered(){
  return getFilteredCon(document.getElementById('fsearch'), document.getElementById('frubro'));
}

/* Opciones del filtro de categoría, sacadas del catálogo cargado. Se repuebla en
   cada render porque importar un Excel nuevo cambia el juego de rubros.

   Conserva la selección: renderCat() corre también al agregar un producto a la
   cotización, y perder el filtro en ese momento —justo cuando estás recorriendo
   una categoría— sería insufrible. Si el rubro elegido ya no existe (catálogo
   nuevo), se cae a "Todas" en vez de dejar la tabla vacía sin explicación. */
/* Color pastel estable por categoría, derivado del nombre. Estable importa: si
   "AUDIO" cambiara de color entre importaciones, dejaría de servir como señal.
   Saturación y luminosidad fijas para que todos empasten entre sí y el texto
   —el mismo tono pero oscuro— se lea sobre cualquiera de ellos. */
function _tonoRubro(nombre){
  var h = 0, s = String(nombre || '');
  for(var i=0;i<s.length;i++) h = (h * 31 + s.charCodeAt(i)) % 360;
  return h;
}

function _rubrosDelCatalogo(){
  var vistos = {}, rubros = [];
  for(var i=0;i<products.length;i++){
    var r = String(products[i].rubro||'').trim();
    if(r && !vistos[r]){ vistos[r] = 1; rubros.push(r); }
  }
  rubros.sort(function(a,b){ return a.localeCompare(b,'es'); });
  return rubros;
}

/* Pinta el filtro de categoría, en cualquiera de sus dos formas: el `<select>`
   de la vista Catálogo o los globitos de la flotante. Se repuebla en cada
   render porque importar un Excel nuevo cambia el juego de rubros.

   Conserva la selección: renderCat() corre también al agregar un producto a la
   cotización, y perder el filtro en ese momento —justo cuando estás recorriendo
   una categoría— sería insufrible. Si el rubro elegido ya no existe (catálogo
   nuevo), se cae a "Todas" en vez de dejar la tabla vacía sin explicación. */
function _pintarFiltroRubro(el){
  el = el || document.getElementById('frubro');
  if(!el) return;
  var rubros = _rubrosDelCatalogo();
  var actual = _rubroElegido(el);
  if(actual && rubros.indexOf(actual) < 0) actual = '';

  if(el.tagName === 'SELECT'){
    var h = '<option value="">Todas</option>';
    for(var j=0;j<rubros.length;j++){
      h += '<option value="'+cevenEsc(rubros[j])+'"'+(rubros[j]===actual?' selected':'')+'>'+cevenEsc(rubros[j])+'</option>';
    }
    el.innerHTML = h;
    el.value = actual;
    // Sin rubros en el catálogo (archivo viejo sin la columna) el filtro sobra.
    var caja = el.closest ? el.closest('.card') : null;
    if(caja) caja.style.display = rubros.length ? '' : 'none';
    return;
  }

  // Globitos. El elegido se guarda en el contenedor, no en un estado aparte:
  // así _rubroElegido() lo lee igual que el value de un <select>.
  el.setAttribute('data-rubro', actual);
  var g = '<button type="button" class="pk-rub' + (actual ? '' : ' on') + '" data-rub="">Todas</button>';
  for(var k=0;k<rubros.length;k++){
    var n = rubros[k], t = _tonoRubro(n);
    g += '<button type="button" class="pk-rub' + (n===actual?' on':'') + '" data-rub="'+cevenEsc(n)+'"'
       + ' style="background:hsl('+t+',72%,91%);color:hsl('+t+',48%,30%);border-color:hsl('+t+',52%,80%)">'
       + cevenEsc(n) + '</button>';
  }
  el.innerHTML = g;
  el.style.display = rubros.length ? '' : 'none';
}

// Filas realmente pintadas en la última pasada de renderCat(). Los handlers
// referencian la fila por ÍNDICE (data-i) en vez de interpolar p.id: el catálogo
// se sincroniza desde Supabase, así que ni el id es necesariamente un número
// (interpolarlo en un onclick era inyección de JS directa) ni sobrevive al
// round-trip por atributo con su tipo original — y editManualProduct() compara
// con === contra products[i].id.
var _catRendered = [];
function _catRowAt(i){
  var n = parseInt(i, 10);
  return (isNaN(n) || !_catRendered[n]) ? null : _catRendered[n];
}

/* Los precios de un producto del catálogo, un nivel por renglón. Si el producto
   no tiene niveles (cargado a mano, o vino de un archivo sin la columna) cae al
   listPrice de siempre. */
function _catPreciosHTML(p){
  var tiers = (window.CEVEN_BRAND && window.CEVEN_BRAND.priceTiers) || [];
  var pr = p.precios || {};
  var h = '';
  for(var i=0;i<tiers.length;i++){
    var v = pr[tiers[i].v];
    if(typeof v !== 'number') continue;
    h += '<div style="font-size:11px;line-height:1.45">'
       + '<span style="color:#aeaeb2">'+cevenEsc(tiers[i].lbl)+'</span> '
       + '<strong style="color:#1d1d1f;font-weight:600">'+cevenEsc(fD(v))+'</strong></div>';
  }
  if(h) return h;
  // fD() sobre un listPrice que llegó como string lo devuelve tal cual
  // (String.prototype.toLocaleString ignora los argumentos) → también escapa.
  return p.listPrice ? cevenEsc('USD '+fD(p.listPrice)) : '—';
}

/* ¿Este SKU ya está en la cotización? Se compara por SKU y no por id de ítem
   porque el ítem de la cotización lleva un id propio generado al agregarlo, sin
   relación con el del catálogo. */
function _enCotizacion(sku){
  for(var i=0;i<items.length;i++){ if(String(items[i].sku) === String(sku)) return true; }
  return false;
}

/* Una fila de producto. La usan las DOS tablas —la vista Catálogo y la
   subpantalla flotante— para que no se despeguen: si cada una armara su fila,
   agregar una columna en un lado y olvidarse del otro no daría ningún error,
   solo una tabla desalineada.

   `idAttr` es cómo esa tabla direcciona sus filas (`data-i` en el catálogo,
   `data-pi` en la flotante): cada una tiene su propio registro de lo pintado, y
   mezclarlos agregaría el producto equivocado.

   `admin` agrega ✎/× (editar o borrar un artículo manual del catálogo). En la
   flotante no van: ahí se elige qué cotizar, no se administra el catálogo. */
function _catRowHTML(p, idx, idAttr, admin){
  var enq = _enCotizacion(p.sku);
  var hasStock = p.stock!==null && p.stock!==undefined;
  var stockColor = hasStock ? (p.stock<=0 ? '#d70015' : (p.stock<5 ? '#c84e00' : '#15863a')) : '#aeaeb2';
  var ref = ' '+idAttr+'="'+idx+'"';
  /* `pk-row` apaga el cursor de mano de `.crow`: en Apple la fila entera
     selecciona, pero acá el unico objetivo de clic es el boton. */
  return '<tr class="crow pk-row'+(enq?' enq':'')+'"'+ref+'>'
    /* Primera columna: el botón. Antes acá había un checkbox y el alta pasaba
       por "Agregar (N)"; ahora se agrega de a uno y en el acto. Si ya está en la
       cotización, el mismo botón lo saca. */
    +'<td style="text-align:center;overflow:visible">'
      +'<button class="'+(enq?'bs cat-quitar':'bd cat-sumar')+'" data-act="'+(enq?'unq':'addone')+'"'+ref
        +' title="'+(enq?'Sacar de la cotización':'Agregar a la cotización')+'"'
        +' style="padding:3px 10px;font-size:13px;line-height:1.2">'+(enq?'✓':'+')+'</button>'
    +'</td>'
    +'<td style="font-weight:500">'+cevenEsc(p.sku)+(p.manual?' <span style="font-size:10px;color:#0071e3;font-weight:600;background:#e8f4ff;padding:1px 5px;border-radius:8px;margin-left:4px">manual</span>':'')+'</td>'
    +'<td class="wrap">'+cevenEsc(p.description)
      // Rubro e IVA vienen del archivo del ERP (RUBRO y Programa fiscal). Son
      // informativos: el IVA no entra en ningún cálculo de la cotización.
      +(p.rubro ? ' <span style="font-size:10px;color:#6e6e73;background:#f0f0f3;padding:1px 6px;border-radius:8px;white-space:nowrap">'+cevenEsc(p.rubro)+'</span>' : '')
      +(p.iva && /reducid/i.test(p.iva) ? ' <span style="font-size:10px;color:#7a5800;background:#fff8e1;padding:1px 6px;border-radius:8px;white-space:nowrap" title="Programa fiscal: '+cevenEsc(p.iva)+'">IVA reducido</span>' : '')
    +'</td>'
    /* Los 4 niveles, uno debajo del otro: es la única vista donde se pueden
       comparar. El selector de la cotización muestra el precio al lado de cada
       nivel, pero ahí ya elegiste el producto. */
    +'<td style="text-align:right;color:#6e6e73;white-space:nowrap">'+_catPreciosHTML(p)+'</td>'
    +'<td style="text-align:center;font-weight:600;color:'+stockColor+'">'+(hasStock?cevenEsc(p.stock):'—')+'</td>'
    +(admin
      ? '<td style="text-align:center;white-space:nowrap;overflow:visible">'
        +'<button class="bs" data-act="edit"'+ref+' title="Editar" style="padding:2px 6px;font-size:12px">✎</button> '
        +'<button class="bsr" data-act="del"'+ref+' title="Eliminar del catálogo">×</button>'
      +'</td>'
      : '')
    +'</tr>';
}

function renderCat() {
  _pintarFiltroRubro();
  var filtered=getFiltered(), html='';
  _catRendered = filtered;
  for(var i=0;i<filtered.length;i++) html += _catRowHTML(filtered[i], i, 'data-i', true);
  document.getElementById('catbody').innerHTML = html || '<tr><td colspan="6" style="text-align:center;color:#aeaeb2;padding:24px">Sin resultados</td></tr>';
  _catBindDelegation();
  document.getElementById('catcount').textContent = filtered.length+' productos';
  // La flotante puede estar mostrando la misma lista: si no se repinta, queda
  // con el estado viejo de los botones (renderCat se llama desde varios lados).
  if(typeof renderPicker === 'function') renderPicker();
}

// Un solo listener en #catbody: cevenActEl() devuelve el elemento accionable más
// cercano, así que el clic sobre un botón NO cae además en el handler de la fila.
function _catBindDelegation(){
  cevenDelegate('catbody', 'click', function(ev){
    var el = cevenActEl(ev, this);
    if(!el) return;
    var p = _catRowAt(el.getAttribute('data-i'));
    if(!p) return;
    var act = el.getAttribute('data-act');
    if(act === 'edit')        editManualProduct(p.id);
    else if(act === 'del')    deleteManualProduct(p.id);
    else if(act === 'addone') agregarUno(p);
    else if(act === 'unq')    quitarDeCotizacion(p);
  });
}

/* Alta de UN producto, sin salir del catálogo. `addToQuote()` navega a la
   cotización porque cierra un alta en lote; acá el gesto es "voy marcando
   mientras recorro la lista", y sacarte de la pantalla en cada clic haría que
   volver al catálogo sea el paso más repetido del flujo. */
function agregarUno(p){
  if(_enCotizacion(p.sku)) return;
  items.push(_nuevoItemDeProducto(p, 0));
  renderQ();
  renderCat();
  if(typeof showToast === 'function') showToast('Agregado: ' + p.sku + '.');
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
  if(typeof showToast === 'function') showToast('Sacado de la cotización: ' + p.sku + '.');
}

// toggleRow(), toggleAll() y clearCatalogFilters() viven en shared/catalog-core.js.

/* Una línea de cotización a partir de un producto del catálogo. Vive acá solo
   —y no duplicada en cada camino de alta— porque es donde se decide el precio:
   si el alta de a uno y el alta en lote se desincronizaran, un producto valdría
   distinto según por dónde entró.

   El precio NO arranca vacío: sale del nivel global (poly/js/tiers.js).
   `tier:''` significa "sigue al global", que es lo que se quiere para un
   producto recién agregado. Si el SKU no tiene ese nivel en el catálogo,
   repricearLinea() lo deja vacío para completar a mano.

   `j` desplaza el id cuando se agregan varios en el mismo milisegundo. */
function _nuevoItemDeProducto(p, j){
  var it = {
    id: Date.now() + (j||0)*13 + Math.floor(Math.random()*1000),
    sku: p.sku, description: p.description,
    qty: 1, salePrice: '', stock: '', tier: ''
  };
  if(typeof repricearLinea === 'function') repricearLinea(it);
  return it;
}

/* ── PEGADO MASIVO DE SKUs ────────────────────────────────────────────────────
   Lo llama processMultiSKUs() de shared/catalog-core.js con los productos que
   encontró. Antes ese código los dejaba TILDADOS y había que rematar con
   "Agregar (N)"; sin checkbox ni botón de lote, pegar una columna de SKUs
   habría dejado de agregar nada —sin error, sin aviso—, así que acá se agregan
   derecho.

   Apple no define esta función y sigue con el camino de la selección: por eso
   shared/ pregunta si existe en vez de asumir. */
function cevenAplicarSkusPegados(found){
  var sumados = 0;
  for(var i=0;i<found.length;i++){
    if(_enCotizacion(found[i].sku)) continue;   // ya estaba: no se duplica
    items.push(_nuevoItemDeProducto(found[i], sumados));
    sumados++;
  }
  if(sumados){
    _qSortKey = null; _qSortDir = 1;   // que entren en el orden en que se pegaron
    renderQ();
  }
  return sumados;
}

// _qSortKey/_qSortDir viven en shared/quote-core.js.
