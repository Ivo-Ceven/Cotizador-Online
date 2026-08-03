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

function getFiltered() {
  var s=document.getElementById('fsearch').value.toLowerCase().trim();
  var terms = s ? s.split(/\s+/).filter(function(t){return t.length>0;}) : [];
  return products.filter(function(p){
    if(terms.length){
      var hay = ((p.sku||'')+' '+(p.description||'')).toLowerCase();
      for(var i=0;i<terms.length;i++){ if(hay.indexOf(terms[i])===-1) return false; }
    }
    return true;
  });
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

function renderCat() {
  var filtered=getFiltered(), html='';
  _catRendered = filtered;
  for(var i=0;i<filtered.length;i++){
    var p=filtered[i], sel=!!selIds[p.id];
    var hasStock = p.stock!==null && p.stock!==undefined;
    var stockColor = hasStock ? (p.stock<=0 ? '#d70015' : (p.stock<5 ? '#c84e00' : '#15863a')) : '#aeaeb2';
    html+='<tr class="crow'+(sel?' sel':'')+'" data-act="row" data-i="'+i+'">'
      +'<td style="overflow:visible"><input type="checkbox"'+(sel?' checked':'')+' data-act="chk" data-i="'+i+'"></td>'
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
      +'<td style="text-align:center;white-space:nowrap;overflow:visible">'
        +'<button class="bs" data-act="edit" data-i="'+i+'" title="Editar" style="padding:2px 6px;font-size:12px">✎</button> '
        +'<button class="bsr" data-act="del" data-i="'+i+'" title="Eliminar">×</button>'
      +'</td>'
      +'</tr>';
  }
  document.getElementById('catbody').innerHTML = html || '<tr><td colspan="6" style="text-align:center;color:#aeaeb2;padding:24px">Sin resultados</td></tr>';
  _catBindDelegation();
  var cnt=Object.keys(selIds).length;
  document.getElementById('catcount').textContent = filtered.length+' productos · '+cnt+' seleccionados';
  var btn=document.getElementById('addbtn');
  btn.style.display = cnt>0 ? 'inline-block' : 'none';
  btn.textContent = editId!==null ? 'Confirmar cambio' : 'Agregar ('+cnt+')';
  var allSel=filtered.length>0; for(var j=0;j<filtered.length;j++){if(!selIds[filtered[j].id]){allSel=false;break;}}
  document.getElementById('chkall').checked=allSel;
}

// Un solo listener en #catbody: cevenActEl() devuelve el elemento accionable más
// cercano, así que el clic sobre el checkbox o sobre un botón NO cae además en el
// handler de la fila (antes hacía falta un event.stopPropagation() en cada uno).
function _catBindDelegation(){
  cevenDelegate('catbody', 'click', function(ev){
    var el = cevenActEl(ev, this);
    if(!el) return;
    var p = _catRowAt(el.getAttribute('data-i'));
    if(!p) return;
    var act = el.getAttribute('data-act');
    if(act === 'edit')      editManualProduct(p.id);
    else if(act === 'del')  deleteManualProduct(p.id);
    else                    toggleRow(p.id);   // 'row' y 'chk'
  });
}

// toggleRow(), toggleAll() y clearCatalogFilters() viven en shared/catalog-core.js.

// ── AGREGAR A LA COTIZACIÓN (precio siempre en blanco: se tipea a mano) ──
function addToQuote() {
  var toAdd=[];
  for(var i=0;i<products.length;i++){ if(selIds[products[i].id]) toAdd.push(products[i]); }
  // Ordenar por el orden en que fueron seleccionados
  toAdd.sort(function(a,b){ return (selIds[a.id]||0) - (selIds[b.id]||0); });
  if(!toAdd.length) return;

  if(editId !== null) {
    var p=toAdd[0];
    for(var i=0;i<items.length;i++){
      if(String(items[i].id)===String(editId)){
        items[i].sku=p.sku; items[i].description=p.description;
      }
    }
    editId=null;
  } else {
    for(var j=0;j<toAdd.length;j++){
      var p2=toAdd[j];
      /* El precio ya NO arranca vacío: sale del nivel global (poly/js/tiers.js).
         `tier:''` significa "sigue al global", que es lo que se quiere para un
         producto recién agregado. Si el SKU no tiene ese nivel en el catálogo,
         repricearLinea() lo deja vacío para que se complete a mano, como antes. */
      var newItem={id:Date.now()+j*13+Math.floor(Math.random()*1000),sku:p2.sku,description:p2.description,qty:1,salePrice:'',stock:'',tier:''};
      if(typeof repricearLinea === 'function') repricearLinea(newItem);
      items.push(newItem);
    }
  }
  selIds={};
  _qSortKey = null; _qSortDir = 1;
  renderQ();
  goTo('quote');
}

// _qSortKey/_qSortDir viven en shared/quote-core.js.
