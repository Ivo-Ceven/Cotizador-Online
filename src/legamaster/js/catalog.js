// ── CATÁLOGO (SKU + Descripción + 3 niveles de precio + IVA por fila) ──
// cevenLsJSON() devuelve el fallback cuando el JSON guardado está corrupto. Antes
// eso pasaba en silencio: la app arrancaba con el catálogo vacío y el usuario
// creía que nunca había importado nada, así que perdía tiempo buscando el Excel.
(function(){
  var raw = null;
  try{ raw = localStorage.getItem(cevenK('cpl')); }catch(e){}
  var s = cevenLsJSON(cevenK('cpl'), null);
  if(s && s.length){ products = s; initCat(); _ayudaExcelAuto(); return; }
  _ayudaExcelAuto();
  if(raw){
    var aviso = '⚠ El catálogo guardado está corrupto y no se pudo leer. Volvé a importar el Excel.';
    showErr(aviso);
    if(typeof showToast === 'function') setTimeout(function(){ showToast(aviso); }, 400);
  }
})();

/* La ayuda de "Qué Excel se puede cargar" (#excel-ayuda) arranca ABIERTA solo si
   todavía no hay catálogo: es el único momento en que alguien necesita leerla
   entera. Se llama desde la IIFE de arriba (declarada abajo pero hoisteada) y
   desde initCat(). */
function _ayudaExcelAuto(){
  var d = document.getElementById('excel-ayuda');
  if(d) d.open = !(products && products.length);
}

/* ── UN SOLO EXCEL ─────────────────────────────────────────────────────────────
   A diferencia de Poly (dos archivos, catálogo + deals), la lista de Legamaster
   viene en un único Excel con categoría, SKU, descripción, los 3 niveles de
   precio, IVA, link a la ficha del producto y disponibilidad — todo en la misma
   fila. No hay nada que detectar por contenido: siempre es processRows(). */

// parseCSV() y fk() viven en shared/catalog-core.js (compartidas por todas las marcas).

function _num(v){
  return parseFloat(String(v==null?'':v).replace(/[^0-9,\.]/g,'').replace(/\.(?=\d{3})/g,'').replace(',','.')) || 0;
}

/* ── ENCABEZADO CORRIDO ────────────────────────────────────────────────────────
   El Excel real de Legamaster trae 4 renglones de avisos ("Legamaster Pricelist
   Electronics 2026", "Los precios se encuentran en USD...") ANTES del encabezado
   real (fila 5). Mismo problema que el price list de Apple (ver
   apple/js/catalog.js, _plHeaderIdx()): hay que encontrar la fila de encabezado
   por contenido, no asumir que es la primera.

   Normaliza sin depender de fk() (que no saca acentos) porque "ARTICLE REF" y
   "DESCRIPCIÓN" son justamente las dos columnas que hay que encontrar para saber
   DÓNDE está el encabezado — antes de tener object rows sobre los que llamar fk(). */
var _LM_DIACRITICOS = new RegExp('[' + String.fromCharCode(0x0300) + '-' + String.fromCharCode(0x036f) + ']', 'g');
function _lmNorm(s){
  return String(s==null?'':s).toLowerCase()
    .normalize('NFD').replace(_LM_DIACRITICOS, '')   // saca acentos
    .replace(/[^a-z0-9]/g,'');
}

function _lmHeaderIdx(rows2d){
  var tope = Math.min(rows2d.length, 20);
  for(var i=0;i<tope;i++){
    var row = rows2d[i] || [];
    var hasSku = false, hasDesc = false;
    for(var c=0;c<row.length;c++){
      var n = _lmNorm(row[c]);
      if(!hasSku && (n === 'articleref' || n === 'sku')) hasSku = true;
      if(!hasDesc && n.indexOf('descripcion') !== -1) hasDesc = true;
    }
    if(hasSku && hasDesc) return i;
  }
  return -1;
}

function handlePL(f) {
  if(!f) return;
  var isXL = /\.(xlsx|xls)$/i.test(f.name);
  if(isXL) {
    var r = new FileReader();
    r.onload = function(e) {
      try {
        var wb = XLSX.read(new Uint8Array(e.target.result), {type:'array'});
        // Preferir una hoja llamada "LEGAMASTER" si existe (es el nombre del
        // archivo real); si no, la primera del libro.
        var sheetName = wb.SheetNames.find(function(n){ return n.trim().toLowerCase()==='legamaster'; }) || wb.SheetNames[0];
        var sheet = wb.Sheets[sheetName];
        var aoa = XLSX.utils.sheet_to_json(sheet, {header:1, defval:''});
        var hIdx = _lmHeaderIdx(aoa);
        if(hIdx < 0){ showErr('No se encontró el encabezado (columnas "ARTICLE REF" y "DESCRIPCIÓN") en las primeras filas del archivo.'); return; }
        var filas = XLSX.utils.sheet_to_json(sheet, {range: hIdx, defval:''});
        processRows(filas);
      }
      catch(er){ showErr('Error Excel: '+er.message); }
    };
    r.readAsArrayBuffer(f);
  } else {
    var r2 = new FileReader();
    r2.onload = function(e){
      try{ processRows(parseCSV(e.target.result)); }
      catch(er){ showErr('Error: '+er.message); }
    };
    r2.readAsText(f,'UTF-8');
  }
}

/* ── IVA ────────────────────────────────────────────────────────────────────
   A diferencia de Poly (dos alícuotas fijas resueltas por texto: "IVA GENERAL" /
   "IVA REDUCIDO"), acá el Excel trae la alícuota YA COMO NÚMERO por fila (0 /
   0.105 / 0.21): no hay nada que resolver, solo formatear para mostrar. */
function cevenProductoIva(p){
  return cevenLegamasterIvaTxt(p);
}

/* El importador. Cada fila del Excel ya trae los 3 niveles de precio y el IVA
   en la misma línea (a diferencia del formato largo de Poly, una fila por
   nivel) así que no hace falta plegar nada por SKU × nivel.

   Tres cosas propias de este catálogo:
     · la categoría "OPS" se excluye (decisión tomada con el usuario: duplica
       los mismos productos de "Computing" con otro código, sin precio web ni
       IVA — ver docs/HISTORIAL.md).
     · un SKU puede repetirse con un producto y precio DISTINTOS (3 pares
       conocidos en Mounting). Los dos productos son reales y se cargan los
       dos: al segundo (y siguientes) se le agrega un sufijo interno (-B, -C…)
       para que el catálogo no los confunda, y los dos quedan marcados con
       `skuDuplicado` para avisar en pantalla que hay que confirmar el código
       correcto con Legamaster.
     · una fila IDÉNTICA repetida (mismo SKU, misma descripción) no es un
       duplicado real — es la misma fila del Excel aparecida dos veces — y se
       pliega sin sufijo ni aviso. */
function processRows(rows) {
  if(!rows.length){ showErr('Archivo vacío.'); return; }
  var f = rows[0];
  var catK  = fk(f,'CATEGORÍA','CATEGORIA','Categoria','Rubro');
  var skuK  = fk(f,'ARTICLE REF','SKU','Codigo','Código');
  var descK = fk(f,'DESCRIPCIÓN','DESCRIPCION','Descripcion','Desc');
  if(!skuK || !descK){ showErr('No se encontraron las columnas SKU/Descripción. Columnas: '+Object.keys(f).join(', ')); return; }

  var regK   = fk(f,'PCIO VTA CON REGISTRO','Con Registro','PVP Con Registro');
  var canK   = fk(f,'PCIO VTA CANAL','Canal');
  var webK   = fk(f,'PCIO VTA WEB','Web');
  if(!regK && !canK && !webK){ showErr('No se encontró ninguna columna de precio (Con Registro / Canal / Web).'); return; }
  var ivaK   = fk(f,'IVA');
  var linkK  = fk(f,'Link','URL');
  var stockK = fk(f,'Stock','Disponibilidad','Entrega');

  var seen = {}, orden = [], primeraPorSku = {}, dupN = {};
  for(var i=0;i<rows.length;i++){
    var r = rows[i];
    var cat = catK ? String(r[catK]||'').trim() : '';
    if(cat.toLowerCase() === 'ops') continue;   // sección excluida, ver comentario de arriba
    var skuRaw = String(r[skuK]||'').trim();
    if(!skuRaw) continue;
    var desc = String(r[descK]||'').trim();

    var effSku = skuRaw;
    var esDup = false;
    var prim = primeraPorSku[skuRaw];
    if(prim){
      if(prim.description === desc) continue;   // misma fila repetida, no un duplicado real
      dupN[skuRaw] = (dupN[skuRaw] || 1) + 1;
      effSku = skuRaw + '-' + String.fromCharCode(64 + dupN[skuRaw]);  // -B, -C...
      prim.skuDuplicado = true;                 // el primero también se marca
      esDup = true;
    }

    var precios = {};
    if(regK && r[regK] !== '' && r[regK] != null) precios['Con Registro'] = _num(r[regK]);
    if(canK && r[canK] !== '' && r[canK] != null) precios['Canal'] = _num(r[canK]);
    if(webK && r[webK] !== '' && r[webK] != null) precios['Web'] = _num(r[webK]);

    var ivaRaw = ivaK ? r[ivaK] : '';
    var ivaPct = (ivaRaw === '' || ivaRaw == null) ? null : Number(ivaRaw);
    if(ivaPct !== null && isNaN(ivaPct)) ivaPct = null;

    var p = {
      id: effSku, sku: effSku, description: desc,
      precios: precios,
      ivaPct: ivaPct,
      rubro: cat,
      link: linkK ? String(r[linkK]||'').trim() : '',
      disponibilidad: stockK ? String(r[stockK]||'').trim() : '',
      skuDuplicado: esDup
    };
    seen[effSku] = p;
    orden.push(effSku);
    if(!prim) primeraPorSku[skuRaw] = p;
  }
  var nuevos = orden.map(function(k){ return seen[k]; });
  if(!nuevos.length){ showErr('El archivo no trajo ningún producto (¿la columna SKU está vacía en todas las filas?).'); return; }

  /* Los SKUs cargados a mano (p.manual) NO están en el Excel del proveedor: si se
     pisara la lista entera con lo importado, cada importación los borraría. */
  var conservar = (products||[]).filter(function(p){ return p.manual; });
  var enArchivo = {};
  nuevos.forEach(function(p){ enArchivo[p.sku] = 1; });
  products = nuevos.concat(conservar.filter(function(p){ return !enArchivo[p.sku]; }));

  var okPL = cevenLsSet(cevenK('cpl'), JSON.stringify(products));
  showErr(okPL ? '' : '⚠ El catálogo se cargó en pantalla pero NO se pudo guardar: se pierde al recargar.');
  initCat();

  var conDup = products.filter(function(p){ return p.skuDuplicado; }).length;
  var msg = '✓ ' + nuevos.length + ' productos';
  if(conDup) msg += ' · ⚠ ' + conDup + ' con SKU a confirmar con Legamaster (código repetido en la lista)';
  showToast(msg);
}

function initCat() {
  if(!products.length) return;
  document.getElementById('nopl').style.display='none';
  document.getElementById('catui').style.display='block';
  var b=document.getElementById('plbadge'); b.className='bk bkok'; b.textContent='✓ '+products.length+' productos';
  _ayudaExcelAuto();
  selIds={};
  renderCat();
}

// _pendingNewSKUs, handleSearchInput/Paste, processMultiSKUs y
// promptForNextPendingSKU viven en shared/catalog-core.js.

/* La categoría elegida. Hay dos formas de filtro conviviendo: el `<select>` de
   la vista Catálogo y los globitos de la flotante, que guardan lo elegido en un
   `data-rubro` del contenedor. Se lee acá, en un solo lugar. */
function _rubroElegido(el){
  if(!el) return '';
  return ('value' in el && el.tagName === 'SELECT') ? el.value : (el.getAttribute('data-rubro') || '');
}

function getFilteredCon(searchEl, rubroEl){
  var s = searchEl ? searchEl.value.toLowerCase().trim() : '';
  var terms = s ? s.split(/\s+/).filter(function(t){return t.length>0;}) : [];
  var rubV = _rubroElegido(rubroEl);
  return products.filter(function(p){
    if(rubV && String(p.rubro||'') !== rubV) return false;
    if(terms.length){
      var hay = ((p.sku||'')+' '+(p.description||'')).toLowerCase();
      for(var i=0;i<terms.length;i++){ if(hay.indexOf(terms[i])===-1) return false; }
    }
    return true;
  });
}

function getFiltered(){
  return getFilteredCon(document.getElementById('fsearch'), document.getElementById('frubro'));
}

/* Color pastel estable por categoría, derivado del nombre. */
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
    var caja = el.closest ? el.closest('.card') : null;
    if(caja) caja.style.display = rubros.length ? '' : 'none';
    return;
  }

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
// referencian la fila por ÍNDICE (data-i), no por p.id (ver poly/js/catalog.js
// para el porqué: el catálogo se sincroniza desde Supabase).
var _catRendered = [];
function _catRowAt(i){
  var n = parseInt(i, 10);
  return (isNaN(n) || !_catRendered[n]) ? null : _catRendered[n];
}

/* Los precios de un producto del catálogo, un nivel por renglón. Sin nivel DEAL
   (ver brand.js: este catálogo no lo tiene). */
function _catPreciosHTML(p){
  var tiers = (window.CEVEN_BRAND && window.CEVEN_BRAND.priceTiers) || [];
  var pr = p.precios || {};
  var h = '';
  for(var i=0;i<tiers.length;i++){
    var v = pr[tiers[i].v];
    if(typeof v !== 'number') continue;
    h += '<span class="cat-tier"><i>'+cevenEsc(tiers[i].lbl)+'</i><b>'+cevenEsc(fD(v))+'</b></span>';
  }
  return h ? '<div class="cat-tiers">'+h+'</div>' : '—';
}

/* ¿Este SKU ya está en la cotización? Solo mira la opción que se está editando
   (ver poly/js/catalog.js para el porqué). */
function _enCotizacion(sku){
  var its = cevenOpcFiltrar(items, cevenOpcActiva());
  for(var i=0;i<its.length;i++){ if(String(its[i].sku) === String(sku)) return true; }
  return false;
}

/* Una fila de producto. La usan las DOS tablas —la vista Catálogo y la
   subpantalla flotante— para que no se despeguen (ver poly/js/catalog.js).

   `opts.admin` agrega ✎/× (editar o borrar un artículo manual). `opts.agregar`
   agrega la columna del botón `+`. */
function _catRowHTML(p, idx, idAttr, opts){
  opts = opts || {};
  var enq = !!opts.agregar && _enCotizacion(p.sku);
  var ivaTxt = cevenProductoIva(p);
  var ref = ' '+idAttr+'="'+idx+'"';
  return '<tr class="crow pk-row'+(enq?' enq':'')+'"'+ref+'>'
    +(opts.agregar
      ? '<td style="text-align:center;overflow:visible">'
        +'<button class="'+(enq?'bs cat-quitar':'bd cat-sumar')+'" data-act="'+(enq?'unq':'addone')+'"'+ref
          +' title="'+(enq?'Sacar de la cotización':'Agregar a la cotización')+'"'
          +' style="padding:3px 10px;font-size:13px;line-height:1.2">'+(enq?'✓':'+')+'</button>'
      +'</td>'
      : '')
    +'<td style="font-weight:500">'+cevenEsc(p.sku)+'</td>'
    +'<td class="wrap">'+cevenEsc(p.description)
      +(p.link ? ' <a href="'+cevenEsc(p.link)+'" target="_blank" rel="noopener noreferrer" title="Ver ficha del producto" style="text-decoration:none">🔗</a>' : '')
      +(p.rubro ? ' <span style="font-size:10px;color:#6e6e73;background:#f0f0f3;padding:1px 6px;border-radius:8px;white-space:nowrap">'+cevenEsc(p.rubro)+'</span>' : '')
      +(p.manual ? ' <span style="font-size:10px;color:#0071e3;font-weight:600;background:#e8f4ff;padding:1px 6px;border-radius:8px;white-space:nowrap" title="Artículo cargado a mano, no vino del Excel del proveedor">manual</span>' : '')
      +(p.skuDuplicado ? ' <span style="font-size:10px;color:#b35333;font-weight:600;background:#fbe9e3;padding:1px 6px;border-radius:8px;white-space:nowrap" title="Este código se repite en la lista de precios de Legamaster con otro producto — confirmar el SKU correcto con la marca">⚠ SKU a confirmar</span>' : '')
    +'</td>'
    +'<td style="text-align:right;color:#6e6e73;white-space:nowrap">'+_catPreciosHTML(p)+'</td>'
    +'<td style="text-align:center;white-space:nowrap;color:#6e6e73">'+cevenEsc(ivaTxt)+'</td>'
    +'<td style="text-align:center;font-size:11px;color:#6e6e73;white-space:nowrap">'+(p.disponibilidad?cevenEsc(p.disponibilidad):'—')+'</td>'
    +(opts.admin
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
  for(var i=0;i<filtered.length;i++) html += _catRowHTML(filtered[i], i, 'data-i', {admin:true});
  document.getElementById('catbody').innerHTML = html || '<tr><td colspan="6" style="text-align:center;color:#aeaeb2;padding:24px">Sin resultados</td></tr>';
  _catBindDelegation();
  document.getElementById('catcount').textContent = filtered.length+' productos';
  if(typeof renderPicker === 'function') renderPicker();
}

function bindRubros(el, alCambiar){
  if(!el || el._rubBound) return;
  el._rubBound = true;
  el.addEventListener('click', function(ev){
    var b = ev.target.closest ? ev.target.closest('[data-rub]') : null;
    if(!b || !el.contains(b)) return;
    var val = b.getAttribute('data-rub');
    el.setAttribute('data-rubro', val === el.getAttribute('data-rubro') ? '' : val);
    alCambiar();
  });
}

function _catBindDelegation(){
  bindRubros(document.getElementById('frubro'), renderCat);
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

function agregarUno(p){
  if(_enCotizacion(p.sku)) return;
  items.push(_nuevoItemDeProducto(p, 0));
  renderQ();
  renderCat();
  if(typeof showToast === 'function') showToast('Agregado: ' + p.sku + '.');
}

function quitarDeCotizacion(p){
  var antes = items.length;
  var opc = cevenOpcActiva();
  items = items.filter(function(it){
    return !(String(it.sku) === String(p.sku) && cevenOpcDe(it) === opc);
  });
  if(items.length === antes) return;
  renderQ();
  renderCat();
  if(typeof showToast === 'function') showToast('Sacado de la cotización: ' + p.sku + '.');
}

// toggleRow(), toggleAll() y clearCatalogFilters() viven en shared/catalog-core.js.

/* Una línea de cotización a partir de un producto del catálogo (ver
   poly/js/catalog.js). El precio arranca del nivel global; `tier:''` significa
   "sigue al global". */
function _nuevoItemDeProducto(p, j){
  var it = {
    id: Date.now() + (j||0)*13 + Math.floor(Math.random()*1000),
    sku: p.sku, description: p.description,
    iva: cevenProductoIva(p),
    qty: 1, salePrice: '', stock: '', tier: '',
    opc: cevenOpcActiva()
  };
  if(typeof repricearLinea === 'function') repricearLinea(it);
  return it;
}

/* ── PEGADO MASIVO DE SKUs ──── (ver poly/js/catalog.js) */
function cevenAplicarSkusPegados(found){
  var sumados = 0;
  for(var i=0;i<found.length;i++){
    if(_enCotizacion(found[i].sku)) continue;
    items.push(_nuevoItemDeProducto(found[i], sumados));
    sumados++;
  }
  if(sumados){
    _qSortKey = null; _qSortDir = 1;
    renderQ();
  }
  return sumados;
}

/* ── ASISTENTE IA ── (ver poly/js/catalog.js para el porqué de estos tres hooks) */
function _asisCatalogoCompacto(){
  var tier = tierGlobal();
  var conPrecio = [], sinPrecio = [];
  for(var i=0;i<products.length;i++){
    var p = products[i];
    var ref = cevenLegamasterPrecioDe(p, tier);
    (ref === null ? sinPrecio : conPrecio).push({
      id: p.sku,
      description: p.description,
      category: p.rubro || '',
      price_ref: ref
    });
  }
  return conPrecio.concat(sinPrecio);
}

function _asisItemsActuales(){
  return cevenOpcFiltrar(items, cevenOpcActiva()).map(function(it){
    return {id: it.sku, qty: it.qty};
  });
}

function _asisAplicarSeleccion(seleccion){
  var sumados = 0;
  for(var i=0;i<seleccion.length;i++){
    var p = cevenLegamasterProducto(products, seleccion[i].id);
    if(!p || _enCotizacion(p.sku)) continue;
    var it = _nuevoItemDeProducto(p, sumados);
    it.qty = Math.max(1, Math.min(200, parseInt(seleccion[i].qty, 10) || 1));
    items.push(it);
    sumados++;
  }
  if(sumados) renderQ();
  return sumados;
}
