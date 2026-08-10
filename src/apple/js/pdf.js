// Reglas CSS de la seccion de garantias CevenCare. Se usan en los dos PDF de
// Apple (el del historial y el de la cotizacion activa); el resto de la hoja
// sale de cevenPdfDocCSS()/cevenPdfListCSS() en shared/pdf-core.js.
var APPLE_PDF_CSS_WARRANTY =
   '.opt-sec{font-size:13px;font-weight:700;margin:20px 0 4px;padding-top:16px;border-top:1.5px dashed #d2d2d7}'
  +'.opt-sub{font-size:11px;color:#6e6e73;margin-bottom:10px}'
  +'.badge-cc{background:#fff0e8;color:#c84e00;border-radius:10px;padding:1px 7px;font-size:10px;font-weight:700}'
  +'.badge-gl{background:#e8f4ff;color:#0071e3;border-radius:10px;padding:1px 7px;font-size:10px;font-weight:700}';


function exportSelectedPDF(){
  var keys=Object.keys(histSel);
  if(!keys.length) return;
  var db=getDB();
  var grouped={};
  for(var i=0;i<db.length;i++){
    var k=db[i]['N° Cotización'];
    if(!histSel[k]) continue;
    // Las filas meta_* (overrides de % Nac por cotización) son metadata, no
    // productos: antes las filtraba el propio saveDB por no tener SKU, y ahora
    // que persisten hay que excluirlas acá o salen como una fila vacía.
    var tipo = db[i]['Tipo'];
    if(typeof tipo === 'string' && tipo.indexOf('meta') === 0) continue;
    if(!grouped[k])grouped[k]=[];
    grouped[k].push(db[i]);
  }
  var logoTag=_logo?'<img src="'+cevenEsc(_logo)+'" style="height:40px;object-fit:contain;display:block;margin:0 auto 20px">':'';
  var allBlocks='';
  for(var ki=0;ki<keys.length;ki++){
    var qn=keys[ki], rows=grouped[qn]; if(!rows||!rows.length) continue;
    var first=rows[0];
    // Las garantías van en su propia tabla, igual que en buildPDF() y en la
    // grilla: antes se mezclaban con los productos y el "Total" del PDF del
    // historial no coincidía con el de la cotización original.
    var trows='', wrows='', gtProd=0, gtWarr=0;
    for(var ri=0;ri<rows.length;ri++){
      var r=rows[ri];
      var lineTot = parseFloat(r['Total'])||0;
      if(r['Tipo']==='garantia'){
        gtWarr += lineTot;
        var wd=null; try{ wd=JSON.parse(r['_wdata']); }catch(e){}
        var wCanal = wd&&wd.canal ? wd.canal : 'GL';
        var wAnios = wd&&wd.años ? wd.años : 3;
        wrows+='<tr><td>'+cevenEsc(r['SKU'])+'</td><td class="wrap">'+cevenEsc(r['Descripción'])+'</td>'
          +'<td style="text-align:center">'+cevenEsc(r['Cantidad'])+'</td>'
          +'<td style="text-align:right">USD '+fI(parseFloat(r['P. Venta Unitario'])||0)+'</td>'
          +'<td style="text-align:right;font-weight:600">USD '+fI(lineTot)+'</td>'
          +'<td style="text-align:center">'+cevenEsc(r['IVA']||r['_taxes']||'21%')+'</td>'
          +'<td style="text-align:center"><span class="badge-'+(String(wCanal).toLowerCase()==='cc'?'cc':'gl')+'">'+cevenEsc(wCanal)+'</span> · '+cevenEsc(wAnios)+' '+(wAnios===1?'año':'años')+'</td></tr>';
        continue;
      }
      gtProd += lineTot;
      // El IVA está en la columna 'IVA' desde 08/2026; '_taxes' es donde lo
      // escribía doSave() antes y sigue estando en lo ya guardado. El modelo va
      // en '_lob' y sirve para recalcularlo si la cotización es más vieja que
      // las dos. Este bloque llegó a leer 'IVA/Imp.Int.' / 'taxes' / 'LOB',
      // claves que nunca existieron: la columna salía siempre en "—".
      trows+='<tr><td>'+cevenEsc(r['SKU'])+'</td><td class="wrap">'+cevenEsc(r['Descripción'])+'</td>'
        +'<td style="text-align:center">'+cevenEsc(r['Cantidad'])+'</td>'
        +'<td style="text-align:right">USD '+fI(parseFloat(r['P. Venta Unitario'])||0)+'</td>'
        +'<td style="text-align:right;font-weight:600">USD '+fI(lineTot)+'</td>'
        +'<td style="text-align:center">'+cevenEsc(r['IVA']||r['_taxes']||getIVA(r['_lob']||'')||'—')+'</td>'
        +'<td style="text-align:center">'+cevenEsc(r['Disponibilidad']||'—')+'</td></tr>';
    }
    allBlocks+='<div class="qb">'
      +'<p class="qn">Cotización #'+cevenEsc(qn)+'</p>'
      +'<h1>Productos recomendados para su operación</h1>'
      +'<div class="cb">'
        +(first['Cliente']&&first['Cliente']!=='—'?'<p class="cn">'+cevenEsc(first['Cliente'])+'</p>':'')
        +(first['Ejecutivo']&&first['Ejecutivo']!=='—'?'<p class="cm">Ejecutivo: '+cevenEsc(first['Ejecutivo'])+'</p>':'')
        +(first['Observaciones']&&first['Observaciones']!=='—'?'<p class="cm">'+cevenEsc(first['Observaciones'])+'</p>':'')
      +'</div>'
      +'<table><thead><tr>'
        +'<th>SKU</th><th>Descripción</th>'
        +'<th style="text-align:center">Qty</th>'
        +'<th style="text-align:right">P. Venta</th>'
        +'<th style="text-align:right">Total</th>'
        +'<th style="text-align:center">IVA/Imp.Int.</th>'
        +'<th style="text-align:center">Disponibilidad</th>'
      +'</tr></thead>'
      +'<tbody>'+trows
        +'<tr class="tr"><td colspan="4" style="text-align:right">Total</td><td style="text-align:right">USD '+fI(gtProd)+'</td><td></td><td></td></tr>'
      +'</tbody></table>'
      +(wrows?
        '<p class="opt-sec">🛡 Garantías Extendidas — CevenCare</p>'
        +'<p class="opt-sub">Las garantías a continuación son opcionales y se presentan separadas de la cotización principal</p>'
        +'<table><thead><tr>'
          +'<th>SKU</th><th>Descripción</th>'
          +'<th style="text-align:center">Qty</th>'
          +'<th style="text-align:right">P. Venta</th>'
          +'<th style="text-align:right">Total</th>'
          +'<th style="text-align:center">IVA/Imp.Int.</th>'
          +'<th style="text-align:center">Canal / Años</th>'
        +'</tr></thead><tbody>'+wrows
          +'<tr class="tr"><td colspan="4" style="text-align:right">Total garantías</td><td style="text-align:right">USD '+fI(gtWarr)+'</td><td></td><td></td></tr>'
        +'</tbody></table>'
      :'')
      /* Las condiciones se arman en shared/pdf-core.js, a partir de lo que
         doSave() guardó con la cotización. Antes estaban escritas acá y el
         bloque ENTERO se omitía cuando faltaban los tres campos editables —
         incluidas las líneas fijas, que son ciertas siempre. */
      +cevenCondicionesHTML(first)
    +'</div>';
  }
  var fname=keys.length===1?'Cotizacion_'+keys[0]:'Cotizaciones_'+keys.join('-');
  var html='<!DOCTYPE html><html><head><meta charset="UTF-8"><title>'+cevenEsc(fname)+'</title>'
    // Reglas propias de Apple: la seccion opcional de garantias CevenCare.
    +cevenPdfListCSS(APPLE_PDF_CSS_WARRANTY)
    +'</head><body>'
    +logoTag
    +allBlocks
    +'<p class="ft">Ceven S.A. · Apple Business Partner · Authorized Service Provider · Argentina &amp; Uruguay</p>'
    +'</body></html>';
  var blob=new Blob([html],{type:'text/html;charset=utf-8'});
  var url=URL.createObjectURL(blob);
  var a=document.createElement('a');a.href=url;a.download=fname+'.html';
  document.body.appendChild(a);a.click();document.body.removeChild(a);
  setTimeout(function(){URL.revokeObjectURL(url);},3000);
}

// ── PDF INDIVIDUAL ──
function buildPDF(){
  if(!items.length && !warrantyItems.length){showToast('La cotización está vacía.');return;}
  // En ARS sin tipo de cambio, dp() no puede dar un importe: antes salía un PDF
  // con los números de USD rotulados como ARS (1:1).
  if(!cevenTCValido()){showToast('Cargá el tipo de cambio antes de exportar en ARS.');return;}
  doSave();
  var client=document.getElementById('client').value;
  var exec=document.getElementById('exec').value;
  var ob=document.getElementById('obs').value;
  // Las condiciones comerciales (fecha efectiva, condición de pago, moneda y
  // entrega) las lee cevenCondicionesHTML() de los mismos campos, más abajo.
  var qn=String(qNum).padStart(4,'0');
  // ||0 para que un salePrice roto no imprima "NaN" como total en el PDF del cliente.
  var gt=0; for(var i=0;i<items.length;i++) gt+=(items[i].salePrice||0)*items[i].qty;
  var logoTag=_logo?'<img src="'+cevenEsc(_logo)+'" style="height:40px;object-fit:contain;display:block;margin:0 auto 20px">':'';
  // El mismo sort que está activo en pantalla. Este comparador estaba copiado
  // tres veces (acá, en renderQ y en getSortedItems): tres lugares donde tocar
  // el orden y dos donde olvidarse, y el PDF terminaba ordenado distinto que
  // la grilla que el vendedor acababa de mirar.
  var sortedItems = getSortedItems();
  // Agrupar por familia respetando el orden ya aplicado
  var familyGroups = {};
  for(var i=0;i<sortedItems.length;i++){
    var fam = getProductFamily(sortedItems[i]);
    if(!familyGroups[fam]) familyGroups[fam] = [];
    familyGroups[fam].push(sortedItems[i]);
  }
  var rows='';
  var usedFamilies = FAMILY_ORDER.filter(function(f){ return familyGroups[f]; });
  // Añadir familias no previstas al final
  for(var f in familyGroups){ if(FAMILY_ORDER.indexOf(f)<0) usedFamilies.push(f); }
  var showSep = usedFamilies.length > 1;
  for(var fi=0;fi<usedFamilies.length;fi++){
    var fName = usedFamilies[fi];
    if(showSep) rows+='<tr class="fam-sep"><td colspan="7">'+cevenEsc(fName)+'</td></tr>';
    var grp = familyGroups[fName];
    for(var gi=0;gi<grp.length;gi++){
      var it=grp[gi];
      // El HTML se inyecta en el DOM vivo (downloadQuotePDF → wrap.innerHTML) para
      // que html2canvas lo rasterice: sin escapar, un SKU o una descripción del
      // price list con <img onerror=…> se ejecuta al exportar.
      rows+='<tr><td class="nowrap" style="font-size:11px;font-family:monospace">'+cevenEsc(it.sku)+'</td><td>'+cevenEsc(it.description)+'</td>'
        +'<td class="nowrap" style="text-align:center">'+cevenEsc(it.qty)+'</td>'
        +'<td class="nowrap" style="text-align:right">'+dp(it.salePrice)+'</td>'
        +'<td class="nowrap" style="text-align:right;font-weight:600">'+dp(it.salePrice*it.qty)+'</td>'
        +'<td class="nowrap" style="text-align:center">'+cevenEsc(it.taxes||'—')+'</td>'
        +'<td class="nowrap" style="text-align:center">'+cevenEsc(it.stock||'—')+'</td>'
        +'</tr>';
    }
  }
  // "<cliente> - <proyecto> - Ceven - <validez>" (shared/pdf-core.js)
  var docTitle = cevenNombreDocumento(
    client,
    document.getElementById('proyecto').value,
    document.getElementById('eff-date').value
  );
  var html='<!DOCTYPE html><html><head><meta charset="UTF-8"><title>'+cevenEsc(docTitle)+'</title>'
    +cevenPdfDocCSS(
      '.col-sku{width:12%}.col-desc{width:35%}.col-qty{width:6%}.col-pv{width:13%}.col-tot{width:13%}.col-iva{width:10%}.col-disp{width:11%}',
      // Garantias CevenCare + separador de familia (MacBook Pro, iPhone, ...):
      // ninguna de las dos existe en el PDF de otra marca.
      APPLE_PDF_CSS_WARRANTY
      +'.fn{background:#fffbea;border:1px solid #f5c400;border-radius:6px;padding:8px 10px;font-size:11px;color:#5c4a00;margin-top:10px;line-height:1.5}'
      +'.fam-sep td{background:#f0f0f3;font-size:9px;font-weight:700;color:#3a3a3c;text-transform:uppercase;letter-spacing:.9px;padding:5px 8px;border-top:1.5px solid #c7c7cc;border-bottom:none}'
    )
    +'</head><body>'
    +logoTag
    +'<p class="qn">Cotización #'+cevenEsc(qn)+'</p>'
    +'<h1>Productos recomendados para su operación</h1>'
    +'<div class="cb">'+(client?'<p class="cn">'+cevenEsc(client)+'</p>':'')+(exec?'<p class="cm">Ejecutivo: '+cevenEsc(exec)+'</p>':'')+(ob?'<p class="cm">'+cevenEsc(ob)+'</p>':'')+'</div>'
    +'<table><colgroup><col class="col-sku"><col class="col-desc"><col class="col-qty"><col class="col-pv"><col class="col-tot"><col class="col-iva"><col class="col-disp"></colgroup><thead><tr>'
      +'<th>SKU</th><th>Descripción</th>'
      +'<th style="text-align:center">Qty</th>'
      +'<th style="text-align:right">P. Venta</th>'
      +'<th style="text-align:right">Total</th>'
      +'<th style="text-align:center">IVA/Imp.Int.</th>'
      +'<th style="text-align:center">Disponibilidad</th>'
    +'</tr></thead>'
    +'<tbody>'+rows+'<tr class="tr"><td colspan="4" style="text-align:right">Total</td><td style="text-align:right">'+dp(gt)+'</td><td></td><td></td></tr></tbody></table>';

  // Warranty section
  if (warrantyItems.length) {
    html += '<p class="opt-sec">🛡 Garantías Extendidas — CevenCare</p>'
      +'<p class="opt-sub">Las garantías a continuación son opcionales y se presentan separadas de la cotización principal</p>'
      +'<table><colgroup><col class="col-sku"><col class="col-desc"><col class="col-qty"><col class="col-pv"><col class="col-tot"><col class="col-iva"><col class="col-disp"></colgroup><thead><tr>'
        +'<th>SKU</th><th>Descripción</th>'
        +'<th style="text-align:center">Qty</th>'
        +'<th style="text-align:right">P. Venta</th>'
        +'<th style="text-align:right">Total</th>'
        +'<th style="text-align:center">IVA/Imp.Int.</th>'
        +'<th style="text-align:center">Canal / Años</th>'
      +'</tr></thead><tbody>';
    var sortedW = getSortedWarranties();
    var wTotal = 0;
    for (var wi=0; wi<sortedW.length; wi++) {
      var w = sortedW[wi].w;
      var wpUnit = Math.round((w.precio||0)*100)/100;
      var wsub = wpUnit * w.cantidad;
      wTotal += wsub;
      html += '<tr>'
        +'<td class="nowrap" style="font-size:11px;font-family:monospace">'+cevenEsc(w.sku)+'</td>'
        +'<td>'+cevenEsc(w.equipo)+' — '+(w.canal==='CC'?'Complete Care':'Gta. Limitada Ext.')+'</td>'
        +'<td class="nowrap" style="text-align:center">'+cevenEsc(w.cantidad)+'</td>'
        +'<td class="nowrap" style="text-align:right">USD '+wpUnit.toLocaleString('es-AR',{minimumFractionDigits: wpUnit%1===0?0:2, maximumFractionDigits:2})+'</td>'
        +'<td class="nowrap" style="text-align:right;font-weight:600">USD '+wsub.toLocaleString('es-AR',{minimumFractionDigits: wsub%1===0?0:2, maximumFractionDigits:2})+'</td>'
        +'<td class="nowrap" style="text-align:center;color:#6e6e73">21%</td>'
        +'<td class="nowrap" style="text-align:center"><span class="badge-'+(String(w.canal).toLowerCase()==='cc'?'cc':'gl')+'">'+cevenEsc(w.canal)+'</span> · '+cevenEsc(w.años)+' '+(w.años===1?'año':'años')+'</td>'
        +'</tr>';
    }
    var hasCC = warrantyItems.some(function(w){ return w.canal === 'CC'; });
    // wTotal se venía acumulando y nunca se imprimía: la tabla de garantías salía
    // sin fila de total, a diferencia de la de productos.
    html += '<tr class="tr"><td colspan="4" style="text-align:right">Total garantías</td>'
      +'<td style="text-align:right">USD '+wTotal.toLocaleString('es-AR',{minimumFractionDigits: wTotal%1===0?0:2, maximumFractionDigits:2})+'</td><td></td><td></td></tr>';
    html += '</tbody></table>';
    if (hasCC) {
      html += '<div class="fn"><strong style="text-transform:uppercase;font-size:10px;letter-spacing:.3px">Nota — Planes CC (Complete Care)</strong>'
        +'Los planes CC incluyen cobertura de daños accidentales (1 evento por contrato) con un cargo por servicio a cargo del cliente: pantalla USD 99 (SKU: DADIACC) · otros daños USD 249 / USD 149 para MacBook Neo (SKU: OTDAACC).</div>';
    }
  }

  // Sin argumento, cevenCondicionesHTML() lee los campos de la pantalla — que es
  // lo que corresponde acá: se está exportando la cotización que está en vivo.
  html += cevenCondicionesHTML()
    +'<p class="ft">Ceven S.A. · Apple Business Partner · Authorized Service Provider · Argentina &amp; Uruguay</p>'
    +'</body></html>';
  // Estilos de impresión / salto de página (landscape) + evitar cortar filas
  html = html.replace('</head>',
    '<style>tr,.cb,.sec,.opt-sec,.fn{page-break-inside:avoid}thead{display:table-header-group}'
    +'@media print{@page{size:A4 landscape;margin:10mm}}</style>'
    +'</head>');

  // Descargar como PDF real (horizontal, 1 sola hoja A4 landscape)
  downloadQuotePDF(html, docTitle);
}

// downloadQuotePDF() vive en shared/pdf-core.js (era identico byte a byte).
