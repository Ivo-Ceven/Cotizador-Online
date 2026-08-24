// ── CATÁLOGO (SKU + Descripción; precio de lista y stock son solo referencia) ──
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
    // Había algo guardado y no se pudo usar (JSON inválido o forma inesperada).
    var aviso = '⚠ El catálogo guardado está corrupto y no se pudo leer. Volvé a importar el Excel.';
    showErr(aviso);
    if(typeof showToast === 'function') setTimeout(function(){ showToast(aviso); }, 400);
  }
})();

/* La ayuda de "Qué Excel se pueden cargar" (#excel-ayuda) arranca ABIERTA solo
   si todavía no hay catálogo: es el único momento en que alguien necesita
   leerla entera. Después estorba, y el <details> se abre con un clic. Se llama
   desde la IIFE de arriba (declarada abajo pero hoisteada) y desde initCat().  */
function _ayudaExcelAuto(){
  var d = document.getElementById('excel-ayuda');
  if(d) d.open = !(products && products.length);
}

/* ── LOS DOS EXCEL DEL CATÁLOGO ───────────────────────────────────────────────
   Acá entran DOS archivos distintos, y cuál es cuál se decide por el CONTENIDO,
   no por el botón que lo abrió:

   1. Catálogo y precios por nivel — sale de NetSuite (búsqueda guardada
      "ResultadosPreviewCatalogDistri", el `ingresoPoly.xls`). Formato largo: una
      fila por (SKU × depósito × nivel de precio). REEMPLAZA el catálogo.
   2. Precios de deal — hoja "Promos" del BOM Calculator que manda HP/Poly
      (`BOM-Calculator-ARG-<mes>-HP-Poly*.xlsx`). Una fila por SKU en promoción,
      con su precio BDNet, su número de deal y hasta cuándo vale. NO reemplaza
      nada: se monta sobre el catálogo que ya está cargado.

   Por qué se detecta por contenido: el archivo de deals trae 24 hojas y la
   primera se llama "BOM". Cargarlo por el camino del catálogo no daba un error
   —daba un catálogo de basura, con los 77 SKU reales y sus cuatro precios
   borrados—. El costo de equivocarse era demasiado alto para dejarlo librado a
   qué botón apretó el usuario. El botón sigue existiendo porque es donde se
   explica qué archivo va en cada uno; si no coinciden, manda el archivo y el
   cartel del final dice qué se hizo de verdad. */

// La hoja de deals: la que se llama "Promos", si el archivo la trae.
function _hojaPromos(wb){
  return (wb.SheetNames || []).find(function(n){ return n.trim().toLowerCase() === 'promos'; }) || null;
}

/* ¿Estas filas son las de un archivo de deals? Se mira el juego de columnas y
   no solo el nombre de la hoja, para que un export recortado a mano —o pegado
   en un CSV— entre igual por el camino correcto. */
function _pareceDeals(rows){
  if(!rows || !rows.length) return false;
  var f = rows[0];
  return !!(fk(f,'BDNet') && fk(f,'Deal') && (fk(f,'Base SKU') || fk(f,'SKU')));
}

function handlePL(f) {
  if(!f) return;
  var isXL = /\.(xlsx|xls)$/i.test(f.name);
  if(isXL) {
    var r = new FileReader();
    r.onload = function(e) {
      try {
        var wb=XLSX.read(new Uint8Array(e.target.result),{type:'array'});
        // El archivo de deals se reconoce por su hoja "Promos": las otras 23
        // hojas del BOM Calculator no se miran.
        var promos = _hojaPromos(wb);
        if(promos){
          var fp = XLSX.utils.sheet_to_json(wb.Sheets[promos],{defval:''});
          if(_pareceDeals(fp)){ processDeals(fp); return; }
        }
        // Archivos como "LP y Stock" traen una hoja por marca (POLY/HP/HUAWEI...):
        // preferir la hoja llamada "POLY" si existe, si no, la primera del archivo.
        var sheetName = wb.SheetNames.find(function(n){ return n.trim().toLowerCase()==='poly'; }) || wb.SheetNames[0];
        var filas = XLSX.utils.sheet_to_json(wb.Sheets[sheetName],{defval:''});
        if(_pareceDeals(filas)) processDeals(filas);
        else processRows(filas);
      }
      catch(er){ showErr('Error Excel: '+er.message); }
    };
    r.readAsArrayBuffer(f);
  } else {
    var r2 = new FileReader();
    r2.onload = function(e){
      try{
        var filas = parseCSV(e.target.result);
        if(_pareceDeals(filas)) processDeals(filas);
        else processRows(filas);
      }catch(er){ showErr('Error: '+er.message); }
    };
    r2.readAsText(f,'UTF-8');
  }
}

// parseCSV() y fk() viven en shared/catalog-core.js (eran identicos).

function _num(v){
  return parseFloat(String(v==null?'':v).replace(/[^0-9,\.]/g,'').replace(/\.(?=\d{3})/g,'').replace(',','.')) || 0;
}

/* ── DEALS ───────────────────────────────────────────────────────────────────
   Un deal es un precio (BDNet) que HP/Poly le habilita a Ceven para un SKU,
   bajo un número de deal y hasta una fecha. Vive en el producto como un nivel
   de precio más —`precios['DEAL']`, ver el comentario de `priceTiers` en
   brand.js— porque así lo cotizan sin cambios el selector global, el selector
   por línea y `repricearLinea()`. Lo que un tier NO tiene, el número y el
   vencimiento, va aparte en `p.deal`.

   El precio NO se duplica en `p.deal`: si estuviera en los dos lados, un día
   uno de los dos quedaría viejo y no habría forma de saber cuál manda.        */
var CEVEN_TIER_DEAL = 'DEAL';

/* La fecha de "End Date" tal como la deja XLSX: un serial de Excel (46234,409
   = 31/07/2026 a las 09:49) porque `sheet_to_json` lee los valores crudos. Se
   normaliza a 'AAAA-MM-DD' —sin hora— porque una vigencia es una fecha de
   calendario, y porque así se compara y se ordena como string.

   El texto se acepta igual (dd/mm/aaaa, aaaa-mm-dd) por si alguna exportación
   viene con la columna formateada como texto o el archivo llega en CSV. */
function cevenDealFechaISO(v){
  if(v === null || v === undefined || v === '') return '';
  if(typeof v === 'number' && isFinite(v)){
    // Epoch de Excel: el día 1 es el 01/01/1900, y Excel cree que 1900 fue
    // bisiesto — por eso el origen es el 30/12/1899. Vale para toda fecha
    // posterior al 01/03/1900, que es cualquier vencimiento real.
    var d = new Date(Date.UTC(1899, 11, 30) + Math.floor(v) * 86400000);
    if(isNaN(d.getTime())) return '';
    return d.toISOString().slice(0, 10);
  }
  var s = String(v).trim();
  var iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if(iso) return iso[1] + '-' + iso[2] + '-' + iso[3];
  var dmy = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if(dmy){
    var yy = dmy[3].length === 2 ? ('20' + dmy[3]) : dmy[3];
    return yy + '-' + String(dmy[2]).padStart(2,'0') + '-' + String(dmy[1]).padStart(2,'0');
  }
  var libre = new Date(s);                     // "31-Jul-26" y compañía
  return isNaN(libre.getTime()) ? '' : libre.toISOString().slice(0, 10);
}

/* Hoy en 'AAAA-MM-DD' con la fecha LOCAL. Con `toISOString()` un deal que vence
   hoy se vería vencido desde las 21:00 hora argentina, que es medianoche UTC. */
function cevenHoyISO(){
  var d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0')
       + '-' + String(d.getDate()).padStart(2,'0');
}

/* ¿El deal ya venció? El día del vencimiento TODAVÍA vale (`<`, no `<=`): "End
   Date 31/07" se lee como "hasta el 31/07 inclusive". Un deal sin fecha nunca
   se da por vencido: no saber cuándo termina no es lo mismo que saber que
   terminó, y esconder un precio por una columna vacía sería peor. */
function cevenDealVencido(deal){
  return !!(deal && deal.fin && deal.fin < cevenHoyISO());
}

// 'AAAA-MM-DD' → '31/07/26', que es como se lee la vigencia en pantalla.
function cevenDealFechaTxt(fin){
  var m = String(fin||'').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? (m[3] + '/' + m[2] + '/' + m[1].slice(2)) : String(fin||'');
}

/* El texto que acompaña al precio de deal en todos lados (catálogo y selector
   de la línea): número + vigencia, y si venció lo dice. Una sola función porque
   si la pantalla y el selector dijeran cosas distintas sobre el mismo deal, el
   vendedor no sabría a cuál creerle. */
function cevenDealTxt(deal){
  if(!deal) return '';
  var t = 'Deal ' + (deal.nro || 's/n');
  if(deal.fin) t += ' · ' + (cevenDealVencido(deal) ? 'venció el ' : 'vence ') + cevenDealFechaTxt(deal.fin);
  return t;
}

/* ── IVA ────────────────────────────────────────────────────────────────────
   El Excel del ERP trae la columna "Programa fiscal" con dos valores:
   "IVA GENERAL" e "IVA REDUCIDO". Son las dos alícuotas argentinas: la general
   es 21 % y la reducida 10,5 %.

   La regla es la del negocio, tal cual: si dice "reducido" es 10,5 %; TODO lo
   demás —incluido un producto sin dato fiscal, como los que se cargan a mano—
   es 21 %, que es la alícuota general. Se compara con /reducid/i y no con el
   texto entero porque el ERP escribe "IVA REDUCIDO" pero nada garantiza que
   mañana no exporte "Reducido" o "IVA Reducido 10.5".

   Por ahora el porcentaje SOLO se muestra: no se suma a los precios ni se
   discrimina en un total. Los documentos siguen diciendo "Los precios
   expresados NO incluyen Impuestos". */
var CEVEN_IVA_REDUCIDO = '10.5%';
var CEVEN_IVA_GENERAL  = '21%';

function cevenIvaPct(programaFiscal){
  return /reducid/i.test(String(programaFiscal||'')) ? CEVEN_IVA_REDUCIDO : CEVEN_IVA_GENERAL;
}

/* El % de un producto del catálogo. `ivaPct` lo escribe el importador; el `||`
   cubre los productos guardados antes de que la columna existiera y los que se
   cargan a mano (que no tienen programa fiscal y caen en la general). */
function cevenProductoIva(p){
  return (p && p.ivaPct) || cevenIvaPct(p && p.iva);
}

/* El IVA de un SKU según el catálogo cargado. Lo usa quotes-db.js al reabrir
   una cotización guardada antes de que la columna `IVA` existiera. */
function cevenIvaDeCatalogo(sku){
  for(var i=0;i<products.length;i++){
    if(String(products[i].sku) === String(sku)) return cevenProductoIva(products[i]);
  }
  return CEVEN_IVA_GENERAL;
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
        // `iva` es el texto crudo del ERP ("IVA GENERAL"), que se muestra como
        // ayuda al pasar el mouse; `ivaPct` es la alícuota ya resuelta, que es
        // lo que viaja a la cotización y a los documentos.
        iva:    ivaK ? String(r[ivaK]||'').trim() : '',
        ivaPct: cevenIvaPct(ivaK ? r[ivaK] : ''),
        rubro:  rubK ? String(r[rubK]||'').trim() : ''
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

/* ── IMPORTADOR DE DEALS (hoja "Promos" del BOM Calculator) ───────────────────
   Del archivo se usan CINCO columnas y el resto se ignora a propósito: `List
   Price`, `NDP`, `Contractual Discount`, `FDA`, `Remaining Qty`… son la
   contabilidad de HP para llegar al BDNet, no un precio que Ceven cotice.

     Base SKU     → el SKU, el mismo que el `Nombre` del archivo de NetSuite
     Description  → la descripción, y SOLO si el SKU es nuevo (ver abajo)
     BDNet        → el precio del deal, en USD
     Deal         → el número de deal, que es lo que se pide para comprar
     End Date     → hasta cuándo vale

   Por qué la descripción no pisa a la existente: la de NetSuite es la que el
   equipo ya conoce y la que sale impresa en las cotizaciones ("ALTAVOZ MANOS
   LIBRES POLY SYNC 20+ CON USB-C"); la del BOM Calculator es la abreviatura
   interna de HP ("Poly Sync 40 -M SPKPHN"). Para un SKU que no está en el
   catálogo es lo único que hay, y es mejor que nada.

   Devuelve {sku: {precio, nro, fin, desc}} o null si faltan columnas.        */
function _leerFilasDeals(rows){
  var f = rows[0];
  var skuK  = fk(f,'Base SKU','SKU','Codigo','Código');
  var bdK   = fk(f,'BDNet','BD Net');
  var dealK = fk(f,'Deal','Deal Number','Nro Deal');
  var descK = fk(f,'Description','Descripcion','Descripción');
  var endK  = fk(f,'End Date','EndDate','Vencimiento','Vigencia');
  if(!skuK || !bdK || !dealK){
    showErr('El archivo parece de deals pero le falta alguna columna: se necesitan '
      + '"Base SKU", "BDNet" y "Deal". Columnas encontradas: ' + Object.keys(f).join(', '));
    return null;
  }

  var porSku = {};
  for(var i=0;i<rows.length;i++){
    var r = rows[i];
    var sku = String(r[skuK]||'').trim();
    if(!sku) continue;
    var nro = String(r[dealK]||'').trim();
    var precio = _num(r[bdK]);
    /* Sin número de deal o sin precio no hay deal que cargar. Esto es además lo
       que descarta el pie del archivo: la última fila trae en "Base SKU" el
       texto "Applied filters: Country is ARGENTINA…" y el resto vacío. */
    if(!nro || !(precio > 0)) continue;

    var fin = endK ? cevenDealFechaISO(r[endK]) : '';
    /* Un SKU puede estar en más de un deal. Gana el que vence MÁS TARDE: es el
       que va a seguir estando cuando el otro caduque. A igual fecha gana la
       última fila, que es el criterio del resto del importador. */
    var previo = porSku[sku];
    if(previo && previo.fin > fin) continue;

    porSku[sku] = {
      precio: precio,
      nro: nro,
      fin: fin,
      desc: descK ? String(r[descK]||'').trim() : ''
    };
  }
  return porSku;
}

/* Monta los deals del archivo sobre el catálogo que ya está cargado.

   REEMPLAZA todos los deals, no los acumula: el archivo nuevo es la verdad
   sobre qué está en promoción hoy. Si se fueran sumando, un SKU que salió de
   la promoción se seguiría cotizando al precio viejo para siempre, y nadie se
   enteraría hasta que Poly rechace la orden.

   Los SKU que existen SOLO por un deal (no están en NetSuite) y que el archivo
   nuevo ya no trae se van del catálogo: sin deal no les queda ningún precio, y
   una fila con "—" en todos los niveles no sirve para cotizar. Las cotizaciones
   ya guardadas no se tocan — llevan su propio sku/descripción/precio. */
function processDeals(rows){
  if(!rows.length){ showErr('Archivo vacío.'); return; }
  var porSku = _leerFilasDeals(rows);
  if(!porSku) return;

  var skus = Object.keys(porSku);
  if(!skus.length){
    showErr('La hoja "Promos" no tiene ninguna fila con SKU, número de deal y BDNet.');
    return;
  }

  // 1) Borrón: se van los deals anteriores, y con ellos los SKU que solo existían por un deal.
  var perdieron = 0, descartados = 0;
  products = (products||[]).filter(function(p){
    if(!p.deal) return true;
    if(porSku[p.sku]) return true;
    // Tenía deal y ya no lo tiene: se queda solo si le sobra algún otro precio.
    delete p.deal;
    if(p.precios) delete p.precios[CEVEN_TIER_DEAL];
    perdieron++;
    var leQueda = (p.precios && Object.keys(p.precios).length) || p.listPrice || p.manual;
    if(!leQueda) descartados++;
    return !!leQueda;
  });

  // 2) Los deals del archivo.
  var idx = {};
  for(var i=0;i<products.length;i++) idx[products[i].sku] = products[i];

  var nuevos = 0, sobreCatalogo = 0, vencidos = 0, dealsVistos = {}, finVencMax = '';
  for(var j=0;j<skus.length;j++){
    var sku = skus[j], d = porSku[sku], p = idx[sku];
    if(!p){
      /* Alta de un SKU que no está en NetSuite. No es `manual` —no lo cargó
         nadie a mano, lo trajo un archivo— pero se conserva igual cuando se
         reimporta el catálogo, porque `processRows()` respeta todo lo que tenga
         deal. Sin IVA ni rubro: el archivo de HP no los trae, y `cevenIvaPct('')`
         da la alícuota general, que es la regla del negocio. */
      p = {
        id: sku, sku: sku, description: d.desc, precios: {}, stock: null,
        iva: '', ivaPct: cevenIvaPct(''), rubro: ''
      };
      products.push(p);
      idx[sku] = p;
      nuevos++;
    } else {
      // La descripción de NetSuite no se pisa; la del archivo solo completa si falta.
      if(!p.description && d.desc) p.description = d.desc;
      sobreCatalogo++;
    }
    p.precios = p.precios || {};
    p.precios[CEVEN_TIER_DEAL] = d.precio;
    p.deal = {nro: d.nro, fin: d.fin};
    dealsVistos[d.nro] = 1;
    if(cevenDealVencido(p.deal)){
      vencidos++;
      if(d.fin > finVencMax) finVencMax = d.fin;
    }
  }

  var okPL = cevenLsSet(cevenK('cpl'), JSON.stringify(products));
  showErr(okPL ? '' : '⚠ Los deals se cargaron en pantalla pero NO se pudieron guardar: se pierden al recargar.');
  initCat();

  var nDeals = Object.keys(dealsVistos).length;
  var msg = '✓ ' + skus.length + ' precios de deal · ' + nDeals
          + (nDeals === 1 ? ' número de deal' : ' números de deal')
          + ' · ' + sobreCatalogo + ' sobre SKU del catálogo, ' + nuevos + ' SKU nuevos';
  if(perdieron) msg += ' · ' + perdieron + ' quedaron sin deal'
    + (descartados ? (', ' + descartados + ' se fueron del catálogo') : '');
  if(vencidos) msg += ' · ⚠ ' + vencidos + ' ya vencidos'
    + (finVencMax ? ' (el último, el ' + cevenDealFechaTxt(finVencMax) + ')' : '');
  showToast(msg);
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
    // Los archivos tipo "LP y Stock" no traen programa fiscal, pero si alguno
    // lo trae se aprovecha igual; sin la columna, cevenIvaPct('') da 21 %.
    var ivaK2=fk(f,'Programa fiscal','Programa Fiscal','IVA');
    var seen = {};
    for(var i=0;i<rows.length;i++) {
      var r=rows[i], sku=String(r[sK]||'').trim();
      if(!sku) continue;
      var stock = stK ? (parseInt(String(r[stK]||'').replace(/[^0-9]/g,''))||0) : null;
      var ivaRaw = ivaK2 ? String(r[ivaK2]||'').trim() : '';
      seen[sku] = {id:sku, sku:sku, description:r[dK]||'', precios:{}, listPrice: pK?_num(r[pK]):0, stock:stock, iva:ivaRaw, ivaPct:cevenIvaPct(ivaRaw), rubro:''}; // último duplicado gana
    }
    nuevos = Object.keys(seen).map(function(k){ return seen[k]; });
  }

  /* Los SKUs cargados a mano (p.manual) NO están en el archivo del ERP: si se
     pisara la lista entera con lo importado, cada importación los borraría.

     Lo mismo vale para los deals, que vienen del OTRO Excel (ver processDeals):
     un SKU que está en los dos archivos se queda con su precio de deal, y uno
     que existe solo por un deal sigue en el catálogo. Sin esto, reimportar el
     catálogo de NetSuite borraba todos los deals sin decir nada — y el archivo
     de NetSuite se reimporta seguido, así que el precio de deal habría durado
     hasta la próxima actualización de stock. */
  var conservar = (products||[]).filter(function(p){ return p.manual || p.deal; });
  var dealPrevio = {};
  conservar.forEach(function(p){ if(p.deal) dealPrevio[p.sku] = p; });

  var enArchivo = {};
  nuevos.forEach(function(p){
    enArchivo[p.sku] = 1;
    var viejo = dealPrevio[p.sku];
    var precioDeal = viejo && viejo.precios && viejo.precios[CEVEN_TIER_DEAL];
    if(typeof precioDeal !== 'number') return;
    p.precios = p.precios || {};
    p.precios[CEVEN_TIER_DEAL] = precioDeal;
    p.deal = viejo.deal;
  });
  products = nuevos.concat(conservar.filter(function(p){ return !enArchivo[p.sku]; }));

  // El catálogo ya está en memoria: se muestra igual, pero si no se pudo persistir
  // hay que decirlo en vez de dejar el cartel de "OK".
  var okPL = cevenLsSet(cevenK('cpl'), JSON.stringify(products));
  showErr(okPL ? '' : '⚠ El catálogo se cargó en pantalla pero NO se pudo guardar: se pierde al recargar.');
  initCat();
  if(nivelK){
    // Sin contar el DEAL, que no es un nivel del ERP y se acaba de reinyectar.
    var conTier = nuevos.filter(function(p){
      return Object.keys(p.precios).some(function(t){ return t !== CEVEN_TIER_DEAL; });
    }).length;
    var conDeal = products.filter(function(p){ return !!p.deal; }).length;
    showToast('✓ ' + nuevos.length + ' productos · ' + conTier + ' con precios por nivel'
      + (conDeal ? (' · ' + conDeal + ' con precio de deal, conservados') : ''));
  }
}

function initCat() {
  if(!products.length) return;
  document.getElementById('nopl').style.display='none';
  document.getElementById('catui').style.display='block';
  var b=document.getElementById('plbadge'); b.className='bk bkok'; b.textContent='✓ '+products.length+' productos';
  _ayudaExcelAuto();          // hay catálogo: la ayuda se pliega sola
  selIds={};
  renderCat();
}

/* Resumen de los deals cargados, al lado del contador de productos. Sin esto,
   saber si el archivo de promos está al día obligaba a recorrer el catálogo
   buscando renglones verdes. Dice cuántos SKU tienen deal, bajo cuántos números
   y hasta cuándo; si TODOS vencieron, la chapita se pone en amarillo — que es
   la única forma de enterarse de que hay que pedir el archivo nuevo. */
function _pintarBadgeDeals(){
  var el = document.getElementById('dealbadge');
  if(!el) return;
  var conDeal = 0, vigentes = 0, nros = {}, finMax = '';
  for(var i=0;i<products.length;i++){
    var d = products[i].deal;
    if(!d) continue;
    conDeal++;
    if(d.nro) nros[d.nro] = 1;
    if(!cevenDealVencido(d)){
      vigentes++;
      if(d.fin > finMax) finMax = d.fin;
    }
  }
  if(!conDeal){ el.style.display = 'none'; return; }
  var nDeals = Object.keys(nros).length;
  el.style.display = '';
  el.className = 'bk ' + (vigentes ? 'bkok' : 'bkw');
  el.textContent = '🎯 ' + conDeal + ' con deal · ' + nDeals + (nDeals === 1 ? ' número' : ' números')
    + (vigentes ? (finMax ? ' · hasta ' + cevenDealFechaTxt(finMax) : '') : ' · todos vencidos');
  el.title = vigentes && vigentes < conDeal
    ? (vigentes + ' vigentes y ' + (conDeal - vigentes) + ' vencidos')
    : (vigentes ? 'Precios de deal vigentes' : 'Ningún deal sigue vigente: pedí el BOM Calculator del mes');
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
  var h = '', deal = '';
  for(var i=0;i<tiers.length;i++){
    var v = pr[tiers[i].v];
    if(typeof v !== 'number') continue;
    /* El deal NO entra en la grilla de dos columnas: va en un renglón propio
       abajo, porque es lo único que además de un precio tiene un número y una
       fecha, y porque es el que hay que ver primero (es siempre el más barato
       y el que caduca). */
    if(tiers[i].deal){ deal = _catDealHTML(p, v); continue; }
    // Dos columnas (.cat-tiers en base.css): apilados verticalmente, los cuatro
    // niveles hacían una fila de ~83px y el catálogo no se podía recorrer.
    h += '<span class="cat-tier"><i>'+cevenEsc(tiers[i].lbl)+'</i><b>'+cevenEsc(fD(v))+'</b></span>';
  }
  if(h) h = '<div class="cat-tiers">'+h+'</div>';
  // fD() sobre un listPrice que llegó como string lo devuelve tal cual
  // (String.prototype.toLocaleString ignora los argumentos) → también escapa.
  else if(p.listPrice) h = cevenEsc('USD '+fD(p.listPrice));
  else if(!deal) h = '—';
  return h + deal;
}

/* El renglón del precio de deal: precio + número + vigencia. Un deal vencido no
   se esconde —el vendedor tiene que poder ver a cuánto estuvo y pedir la
   renovación— pero se pinta en rojo y tachado, para que nadie lo cotice de
   memoria creyendo que sigue vivo. */
function _catDealHTML(p, precio){
  var vencido = cevenDealVencido(p.deal);
  return '<div class="cat-deal'+(vencido?' venc':'')+'" title="'+cevenEsc(cevenDealTxt(p.deal))+'">'
    + '<i>Deal</i>'
    + '<b>'+cevenEsc(fD(precio))+'</b>'
    /* El separador va DENTRO del renglón gris y no como gap: con el precio
       tachado (deal vencido), "144,88" y el número de deal se leían pegados
       como si fueran un solo número. */
    + '<u>· '+cevenEsc((p.deal && p.deal.nro) || 's/n')
      + (p.deal && p.deal.fin ? (' · ' + (vencido ? '✕ ' : '') + cevenDealFechaTxt(p.deal.fin)) : '')
    + '</u></div>';
}

/* ¿Este SKU ya está en la cotización? Se compara por SKU y no por id de ítem
   porque el ítem de la cotización lleva un id propio generado al agregarlo, sin
   relación con el del catálogo. */
/* Mira SOLO la opción que se está editando: el mismo SKU puede (y suele) estar
   en las dos alternativas, y si acá se miraran las dos, agregarlo a la B quedaría
   bloqueado porque ya está en la A. */
function _enCotizacion(sku){
  var its = cevenOpcFiltrar(items, cevenOpcActiva());
  for(var i=0;i<its.length;i++){ if(String(its[i].sku) === String(sku)) return true; }
  return false;
}

/* Una fila de producto. La usan las DOS tablas —la vista Catálogo y la
   subpantalla flotante— para que no se despeguen: si cada una armara su fila,
   agregar una columna en un lado y olvidarse del otro no daría ningún error,
   solo una tabla desalineada.

   `idAttr` es cómo esa tabla direcciona sus filas (`data-i` en el catálogo,
   `data-pi` en la flotante): cada una tiene su propio registro de lo pintado, y
   mezclarlos agregaría el producto equivocado.

   `opts.admin` agrega ✎/× (editar o borrar un artículo manual). `opts.agregar`
   agrega la columna del botón `+`. Son excluyentes en la práctica: la vista
   Catálogo administra productos y la flotante elige qué cotizar. */
function _catRowHTML(p, idx, idAttr, opts){
  opts = opts || {};
  /* El verde de "ya está en la cotización" solo tiene sentido donde se puede
     agregar. En la vista Catálogo la cotización no es el tema, y pintar filas
     de verde ahí sería ruido. */
  var enq = !!opts.agregar && _enCotizacion(p.sku);
  var ivaPct = cevenProductoIva(p);
  var hasStock = p.stock!==null && p.stock!==undefined;
  var stockColor = hasStock ? (p.stock<=0 ? '#d70015' : (p.stock<5 ? '#c84e00' : '#15863a')) : '#aeaeb2';
  var ref = ' '+idAttr+'="'+idx+'"';
  /* `pk-row` apaga el cursor de mano de `.crow`: en Apple la fila entera
     selecciona, pero acá el unico objetivo de clic es el boton. */
  return '<tr class="crow pk-row'+(enq?' enq':'')+'"'+ref+'>'
    /* La columna del botón existe SOLO en la flotante. Antes acá había un
       checkbox y el alta pasaba por "Agregar (N)"; ahora se agrega de a uno y en
       el acto, y el mismo botón lo saca si ya está. */
    +(opts.agregar
      ? '<td style="text-align:center;overflow:visible">'
        +'<button class="'+(enq?'bs cat-quitar':'bd cat-sumar')+'" data-act="'+(enq?'unq':'addone')+'"'+ref
          +' title="'+(enq?'Sacar de la cotización':'Agregar a la cotización')+'"'
          +' style="padding:3px 10px;font-size:13px;line-height:1.2">'+(enq?'✓':'+')+'</button>'
      +'</td>'
      : '')
    +'<td style="font-weight:500">'+cevenEsc(p.sku)+'</td>'
    /* Las chapitas van todas en Descripción, que es la única celda que puede
       crecer. La de "manual" estaba pegada al SKU y, con la columna a 130px, el
       propio SKU quedaba cortado con puntos suspensivos para hacerle lugar. */
    +'<td class="wrap">'+cevenEsc(p.description)
      // El rubro viene de la columna RUBRO del archivo del ERP y es informativo.
      +(p.rubro ? ' <span style="font-size:10px;color:#6e6e73;background:#f0f0f3;padding:1px 6px;border-radius:8px;white-space:nowrap">'+cevenEsc(p.rubro)+'</span>' : '')
      +(p.manual ? ' <span style="font-size:10px;color:#0071e3;font-weight:600;background:#e8f4ff;padding:1px 6px;border-radius:8px;white-space:nowrap" title="Artículo cargado a mano, no vino del Excel del ERP">manual</span>' : '')
    +'</td>'
    /* Los 4 niveles, uno debajo del otro: es la única vista donde se pueden
       comparar. El selector de la cotización muestra el precio al lado de cada
       nivel, pero ahí ya elegiste el producto. */
    +'<td style="text-align:right;color:#6e6e73;white-space:nowrap">'+_catPreciosHTML(p)+'</td>'
    /* IVA: columna propia desde 08/2026. Antes era una pastilla "IVA reducido"
       metida al lado de la descripción, que solo aparecía en los 44 SKUs
       reducidos — no había forma de ver la alícuota del resto, y el dato tiene
       que llegar hasta la cotización. El reducido va resaltado porque es la
       excepción (44 de 564 filas del último archivo). */
    +'<td style="text-align:center;white-space:nowrap;'
      + (ivaPct === CEVEN_IVA_REDUCIDO ? 'color:#7a5800;font-weight:600' : 'color:#6e6e73') + '"'
      + (p.iva ? ' title="Programa fiscal: '+cevenEsc(p.iva)+'"' : '')
      + '>'+cevenEsc(ivaPct)+'</td>'
    +'<td style="text-align:center;font-weight:600;color:'+stockColor+'">'+(hasStock?cevenEsc(p.stock):'—')+'</td>'
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
  _pintarBadgeDeals();
  var filtered=getFiltered(), html='';
  _catRendered = filtered;
  for(var i=0;i<filtered.length;i++) html += _catRowHTML(filtered[i], i, 'data-i', {admin:true});
  document.getElementById('catbody').innerHTML = html || '<tr><td colspan="6" style="text-align:center;color:#aeaeb2;padding:24px">Sin resultados</td></tr>';
  _catBindDelegation();
  document.getElementById('catcount').textContent = filtered.length+' productos';
  // La flotante puede estar mostrando la misma lista: si no se repinta, queda
  // con el estado viejo de los botones (renderCat se llama desde varios lados).
  if(typeof renderPicker === 'function') renderPicker();
}

/* Cablea un contenedor de burbujas de categoría. Delegado y atado una sola vez,
   porque _pintarFiltroRubro() rehace los botones en cada render. Lo usan la
   vista Catálogo (#frubro) y la flotante (#pk-rubro), con su propio callback. */
function bindRubros(el, alCambiar){
  if(!el || el._rubBound) return;
  el._rubBound = true;
  el.addEventListener('click', function(ev){
    var b = ev.target.closest ? ev.target.closest('[data-rub]') : null;
    if(!b || !el.contains(b)) return;
    var val = b.getAttribute('data-rub');
    // Volver a tocar la activa saca el filtro: el mismo gesto para ida y vuelta.
    el.setAttribute('data-rubro', val === el.getAttribute('data-rubro') ? '' : val);
    alCambiar();
  });
}

// Un solo listener en #catbody: cevenActEl() devuelve el elemento accionable más
// cercano, así que el clic sobre un botón NO cae además en el handler de la fila.
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
  // Solo de la opción que se está editando: la otra alternativa no se toca.
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
    // La alícuota viaja con la línea, no se vuelve a buscar en el catálogo: el
    // catálogo se reimporta y una cotización guardada tiene que seguir diciendo
    // con qué IVA se cotizó.
    iva: cevenProductoIva(p),
    qty: 1, salePrice: '', stock: '', tier: '',
    // La línea nace en la opción que se está editando (shared/opciones.js).
    opc: cevenOpcActiva()
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

/* ── ASISTENTE IA ─────────────────────────────────────────────────────────────
   Los tres hooks que pide shared/asistente.js (ver el comentario de cabecera
   de ese archivo) — mismo patrón opcional que cevenAplicarSkusPegados de
   arriba: si una página no los define, el asistente avisa en vez de fallar
   en silencio. */

// El catálogo recortado que se le manda al modelo: sin los 4 precios por
// nivel enteros, solo una referencia de presupuesto al nivel vigente (el
// mismo que usa aplicarTierDelCliente()) — el asistente nunca debe decidir
// ni devolver un precio, price_ref es puro contexto para elegir mejor.
/* Los que SÍ tienen precio al nivel vigente van primero. Importa desde que el
   Excel de deals llevó el catálogo de 77 a 703 productos (24/08): shared/
   asistente.js recorta la lista antes de mandarla, y sin este orden el recorte
   se comía productos cotizables para dejar entrar SKUs de servicio que el
   asistente ni siquiera puede proponer con precio — si el modelo elige uno sin
   `price_ref`, la línea entra a la cotización con el importe vacío. */
function _asisCatalogoCompacto(){
  var tier = tierGlobal();
  var conPrecio = [], sinPrecio = [];
  for(var i=0;i<products.length;i++){
    var p = products[i];
    var ref = cevenPolyPrecioDe(p, tier);
    (ref === null ? sinPrecio : conPrecio).push({
      id: p.sku,
      description: p.description,
      category: p.rubro || '',
      price_ref: ref
    });
  }
  /* Los sin precio NO se descartan: sin nivel global elegido `ref` es null para
     todos, y devolver una lista vacía haría que el asistente conteste "todavía
     no hay catálogo cargado" con el catálogo cargado. */
  return conPrecio.concat(sinPrecio);
}

// Lo que la cotización ya lleva (solo la opción que se está editando), para
// que el asistente no lo vuelva a sugerir sin que el pedido lo justifique.
function _asisItemsActuales(){
  return cevenOpcFiltrar(items, cevenOpcActiva()).map(function(it){
    return {id: it.sku, qty: it.qty};
  });
}

// Alta real de lo que el usuario confirmó en el overlay del asistente. Mismo
// patrón que cevenAplicarSkusPegados: loop + un solo renderQ() al final, y el
// precio lo pone repricearLinea() dentro de _nuevoItemDeProducto() — el
// asistente nunca lo calcula ni lo transporta.
function _asisAplicarSeleccion(seleccion){
  var sumados = 0;
  for(var i=0;i<seleccion.length;i++){
    var p = cevenPolyProducto(products, seleccion[i].id);
    if(!p || _enCotizacion(p.sku)) continue;
    var it = _nuevoItemDeProducto(p, sumados);
    it.qty = Math.max(1, Math.min(200, parseInt(seleccion[i].qty, 10) || 1));
    items.push(it);
    sumados++;
  }
  if(sumados) renderQ();
  return sumados;
}
