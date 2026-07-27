
function exportSelectedPDF(){
  var keys=Object.keys(histSel);
  if(!keys.length) return;
  var db=getDB();
  var grouped={};
  for(var i=0;i<db.length;i++){var k=db[i]['N° Cotización'];if(histSel[k]){if(!grouped[k])grouped[k]=[];grouped[k].push(db[i]);}}
  var logoTag=_logo?'<img src="'+_logo+'" style="height:40px;object-fit:contain;display:block;margin:0 auto 20px">':'';
  var allBlocks='';
  for(var ki=0;ki<keys.length;ki++){
    var qn=keys[ki], rows=grouped[qn]; if(!rows||!rows.length) continue;
    var first=rows[0], gt=0; for(var ri=0;ri<rows.length;ri++) gt+=parseFloat(rows[ri]['Total'])||0;
    var trows='';
    for(var ri=0;ri<rows.length;ri++){
      var r=rows[ri];
      trows+='<tr><td>'+r['SKU']+'</td><td class="wrap">'+r['Descripción']+'</td>'
        +'<td style="text-align:center">'+r['Cantidad']+'</td>'
        +'<td style="text-align:right">USD '+fI(parseFloat(r['P. Venta Unitario'])||0)+'</td>'
        +'<td style="text-align:right;font-weight:600">USD '+fI(parseFloat(r['Total'])||0)+'</td>'
        +'<td style="text-align:center">'+(r['Nota']||'—')+'</td></tr>';
    }
    var payMode = first['Condición de pago']||'';
    var effDate = first['Propuesta efectiva hasta']||'—';
    var delivery = first['Entrega']||'—';
    allBlocks+='<div class="qb">'
      +'<p class="qn">Cotización #'+qn+'</p>'
      +'<h1>Poly · Audio y video conferencia</h1>'
      +'<div class="cb">'
        +(first['Cliente']&&first['Cliente']!=='—'?'<p class="cn">'+first['Cliente']+'</p>':'')
        +(first['OPG']&&first['OPG']!=='—'?'<p class="cm">OPG: '+first['OPG']+'</p>':'')
        +(first['Sala']&&first['Sala']!=='—'?'<p class="cm">Sala: '+first['Sala']+'</p>':'')
        +(first['Ejecutivo']&&first['Ejecutivo']!=='—'?'<p class="cm">Ejecutivo: '+first['Ejecutivo']+'</p>':'')
        +(first['Observaciones']&&first['Observaciones']!=='—'?'<p class="cm">'+first['Observaciones']+'</p>':'')
      +'</div>'
      +'<table><thead><tr>'
        +'<th>SKU</th><th>Descripción</th>'
        +'<th style="text-align:center">Qty</th>'
        +'<th style="text-align:right">P. Venta</th>'
        +'<th style="text-align:right">Total</th>'
        +'<th style="text-align:center">Nota</th>'
      +'</tr></thead>'
      +'<tbody>'+trows
        +'<tr class="tr"><td colspan="4" style="text-align:right">Total</td><td style="text-align:right">USD '+fI(gt)+'</td><td></td></tr>'
      +'</tbody></table>'
      +(payMode||effDate!=='—'||delivery!=='—'?
        '<p class="sec">Condiciones Comerciales</p>'
        +(effDate!=='—'?'<p class="cd">Propuesta efectiva hasta: '+effDate+'</p>':'')
        +(payMode?'<p class="cd">Condición de pago: '+payMode+' – TC Dólar billete BNA del día del pago</p>':'')
        +'<p class="cd">Precios unitarios expresados en dólares estadounidenses</p>'
        +'<p class="cd">Los precios expresados NO incluyen Impuestos</p>'
        +(delivery!=='—'?'<p class="cd">Entrega: '+delivery+'</p>':'')
      :'')
    +'</div>';
  }
  var fname=keys.length===1?'Cotizacion_'+keys[0]:'Cotizaciones_'+keys.join('-');
  var html='<!DOCTYPE html><html><head><meta charset="UTF-8"><title>'+fname+'</title>'
    +'<style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:-apple-system,sans-serif;padding:32px;color:#1d1d1f;font-size:13px}'
    +'.qb{margin-bottom:40px;page-break-inside:avoid}'
    +'.qn{font-size:11px;color:#aeaeb2;text-align:center;margin-bottom:4px}'
    +'h1{font-size:17px;font-weight:600;text-align:center;margin-bottom:16px}'
    +'.cb{margin-bottom:14px}.cn{font-size:15px;font-weight:700;margin-bottom:3px}.cm{font-size:12px;color:#6e6e73;margin-bottom:2px}'
    +'table{width:100%;border-collapse:collapse;margin-bottom:12px}'
    +'th{text-align:left;border-bottom:1.5px solid #d2d2d7;padding:7px 8px;font-size:10px;color:#6e6e73;font-weight:600;text-transform:uppercase;letter-spacing:.4px}'
    +'td{padding:7px 8px;border-bottom:0.5px solid #f0f0f0}'
    +'.tr td{border-top:1.5px solid #d2d2d7;border-bottom:none;font-weight:700;font-size:14px;padding-top:9px}'
    +'.sec{font-size:13px;font-weight:700;margin:16px 0 8px;padding-top:14px;border-top:0.5px solid #d2d2d7}'
    +'.cd{font-size:12px;font-weight:700;margin-bottom:6px}'
    +'.ft{margin-top:20px;font-size:10px;color:#aeaeb2;text-align:center}'
    +'@media print{.qb{page-break-after:always}.qb:last-child{page-break-after:avoid}body{padding:18px}}'
    +'</style></head><body>'
    +logoTag
    +allBlocks
    +'<p class="ft">Ceven S.A.</p>'
    +'</body></html>';
  var blob=new Blob([html],{type:'text/html;charset=utf-8'});
  var url=URL.createObjectURL(blob);
  var a=document.createElement('a');a.href=url;a.download=fname+'.html';
  document.body.appendChild(a);a.click();document.body.removeChild(a);
  setTimeout(function(){URL.revokeObjectURL(url);},3000);
}

// ── PDF INDIVIDUAL ──
function buildPDF(){
  if(!items.length){showToast('La cotización está vacía.');return;}
  doSave();
  var client=document.getElementById('client').value;
  var opg=document.getElementById('opg').value;
  var sala=document.getElementById('sala').value;
  var exec=document.getElementById('exec').value;
  var ob=document.getElementById('obs').value;
  var effDate=document.getElementById('eff-date').value||'—';
  var payMode=document.getElementById('pay-mode').value;
  var delivery=document.getElementById('delivery').value||'—';
  var qn=String(qNum).padStart(4,'0');
  var gt=0; for(var i=0;i<items.length;i++) gt+=(items[i].salePrice||0)*items[i].qty;
  var curLabel=getCur()==='ARS'?'Precios unitarios expresados en pesos argentinos':'Precios unitarios expresados en dólares estadounidenses';
  var logoTag=_logo?'<img src="'+_logo+'" style="height:40px;object-fit:contain;display:block;margin:0 auto 20px">':'';
  var sortedItems = getSortedItems();
  var rows='';
  for(var i=0;i<sortedItems.length;i++){
    var it=sortedItems[i];
    var sp = (it.salePrice===''||it.salePrice==null) ? 0 : it.salePrice;
    rows+='<tr><td class="nowrap" style="font-size:11px;font-family:monospace">'+it.sku+'</td><td>'+it.description+'</td>'
      +'<td class="nowrap" style="text-align:center">'+it.qty+'</td>'
      +'<td class="nowrap" style="text-align:right">'+dp(sp)+'</td>'
      +'<td class="nowrap" style="text-align:right;font-weight:600">'+dp(sp*it.qty)+'</td>'
      +'<td class="nowrap" style="text-align:center">'+(it.stock||'—')+'</td>'
      +'</tr>';
  }
  // Armar nombre de archivo: Cotizacion_XXXX_NombreCliente
  var clientSlug = client.trim()
    .replace(/[<>:"/\\|?*]/g,'')   // caracteres inválidos en nombres de archivo
    .replace(/\s+/g,'_')           // espacios → guión bajo
    .substring(0,40);              // máx 40 chars
  var docTitle = 'Cotizacion_' + qn + (clientSlug ? '_' + clientSlug : '');
  var html='<!DOCTYPE html><html><head><meta charset="UTF-8"><title>'+docTitle+'</title>'
    +'<style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:-apple-system,sans-serif;padding:32px;color:#1d1d1f;font-size:13px}'
    +'.qn{font-size:11px;color:#aeaeb2;text-align:center;margin-bottom:4px}h1{font-size:17px;font-weight:600;text-align:center;margin-bottom:16px}'
    +'.cb{margin-bottom:14px}.cn{font-size:15px;font-weight:700;margin-bottom:3px}.cm{font-size:12px;color:#6e6e73;margin-bottom:2px}'
    +'table{width:100%;border-collapse:collapse;margin-bottom:12px;table-layout:fixed}'
    +'.col-sku{width:14%}.col-desc{width:42%}.col-qty:{width:8%}.col-pv{width:14%}.col-tot{width:14%}.col-nota{width:12%}'
    +'th{text-align:left;border-bottom:1.5px solid #d2d2d7;padding:7px 8px;font-size:10px;color:#6e6e73;font-weight:600;text-transform:uppercase;letter-spacing:.4px}'
    +'td{padding:7px 8px;border-bottom:0.5px solid #f0f0f0;white-space:normal;word-wrap:break-word}'
    +'td.nowrap{white-space:nowrap}'
    +'.tr td{border-top:1.5px solid #d2d2d7;border-bottom:none;font-weight:700;font-size:14px;padding-top:9px}'
    +'.sec{font-size:13px;font-weight:700;margin:16px 0 8px;padding-top:14px;border-top:0.5px solid #d2d2d7}.cd{font-size:12px;font-weight:700;margin-bottom:6px}'
    +'.ft{margin-top:20px;font-size:10px;color:#aeaeb2;text-align:center}'
    +'@media print{body{padding:18px}}</style>'
    +'</head><body>'
    +logoTag
    +'<p class="qn">Cotización #'+qn+'</p>'
    +'<h1>Poly · Audio y video conferencia</h1>'
    +'<div class="cb">'+(client?'<p class="cn">'+client+'</p>':'')+(opg?'<p class="cm">OPG: '+opg+'</p>':'')+(sala?'<p class="cm">Sala: '+sala+'</p>':'')+(exec?'<p class="cm">Ejecutivo: '+exec+'</p>':'')+(ob?'<p class="cm">'+ob+'</p>':'')+'</div>'
    +'<table><colgroup><col class="col-sku"><col class="col-desc"><col class="col-qty"><col class="col-pv"><col class="col-tot"><col class="col-nota"></colgroup><thead><tr>'
      +'<th>SKU</th><th>Descripción</th>'
      +'<th style="text-align:center">Qty</th>'
      +'<th style="text-align:right">P. Venta</th>'
      +'<th style="text-align:right">Total</th>'
      +'<th style="text-align:center">Nota</th>'
    +'</tr></thead>'
    +'<tbody>'+rows+'<tr class="tr"><td colspan="4" style="text-align:right">Total</td><td style="text-align:right">'+dp(gt)+'</td><td></td></tr></tbody></table>';

  html += '<p class="sec">Condiciones Comerciales</p>'
    +'<p class="cd">Propuesta efectiva hasta: '+effDate+'</p>'
    +'<p class="cd">Condición de pago: '+payMode+' – TC Dólar billete BNA del día del pago</p>'
    +'<p class="cd">'+curLabel+'</p>'
    +'<p class="cd">Los precios expresados NO incluyen Impuestos</p>'
    +'<p class="cd">Entrega: '+delivery+'</p>'
    +'<p class="ft">Ceven S.A.</p>'
    +'</body></html>';
  // Estilos de impresión / salto de página (landscape) + evitar cortar filas
  html = html.replace('</head>',
    '<style>tr,.cb,.sec{page-break-inside:avoid}thead{display:table-header-group}'
    +'@media print{@page{size:A4 landscape;margin:10mm}}</style>'
    +'</head>');

  // Descargar como PDF real (horizontal, 1 sola hoja A4 landscape)
  downloadQuotePDF(html, docTitle);
}

// Genera y descarga el PDF de la cotización en HORIZONTAL (A4 landscape, 1 sola hoja)
function downloadQuotePDF(fullHtml, fileName){
  if(typeof html2canvas === 'undefined'){
    showToast('Error: html2canvas no cargó. Verificá tu conexión a internet.');
    return;
  }
  var PDF = (window.jspdf && window.jspdf.jsPDF) || window.jsPDF || (window.jspdf && window.jspdf.default);
  if(!PDF){
    showToast('Error: jsPDF no cargó. Verificá tu conexión a internet.');
    return;
  }
  var doc = new DOMParser().parseFromString(fullHtml, 'text/html');
  var stage = document.createElement('div');
  // Render a ~A4 landscape width (1060px ≈ 280mm @ 96dpi) fuera de pantalla
  stage.style.cssText = 'position:absolute;left:-9999px;top:0;width:1060px;background:#fff;'
    + 'font-family:-apple-system,BlinkMacSystemFont,sans-serif;color:#1d1d1f;font-size:11.5px;'
    + 'padding:16px;box-sizing:border-box';
  doc.querySelectorAll('style').forEach(function(s){ stage.appendChild(s.cloneNode(true)); });
  var wrap = document.createElement('div');
  wrap.innerHTML = doc.body.innerHTML;
  stage.appendChild(wrap);
  document.body.appendChild(stage);

  showToast('⏳ Generando PDF…');

  function go(){
    html2canvas(stage, {
      scale: 2,
      useCORS: true,
      backgroundColor: '#ffffff',
      logging: false,
      scrollX: 0,
      scrollY: 0
    }).then(function(canvas){
      stage.remove();
      // Obtener jsPDF desde el UMD bundle
      var PDF = (window.jspdf && window.jspdf.jsPDF) || window.jsPDF || (window.jspdf && window.jspdf.default);
      var pdf = new PDF({ unit:'mm', format:'a4', orientation:'landscape' });
      var mL=7, mR=7, mT=7, mB=7;
      var pW = pdf.internal.pageSize.getWidth()  - mL - mR; // ~283mm
      var pH = pdf.internal.pageSize.getHeight() - mT - mB; // ~196mm
      // canvas px → mm: a 2x scale, 1 canvas px = 0.5 CSS px = 25.4/96/2 mm
      var PX_MM = 25.4 / 96 / 2;
      var cW = canvas.width  * PX_MM;
      var cH = canvas.height * PX_MM;
      // Escalar para que entre todo en una hoja (solo achicar, nunca agrandar)
      var s = Math.min(1, pW / cW, pH / cH);
      var iW = cW * s, iH = cH * s;
      var x = mL + (pW - iW) / 2;
      var y = mT + (pH - iH) / 2;
      pdf.addImage(canvas.toDataURL('image/jpeg', 0.97), 'JPEG', x, y, iW, iH);
      pdf.save(fileName + '.pdf');
      showToast('✓ PDF descargado');
    }).catch(function(err){
      stage.remove();
      showToast('Error generando PDF: ' + (err && err.message ? err.message : err));
    });
  }

  var imgs = stage.querySelectorAll('img');
  var pending = imgs.length;
  if(pending === 0){ setTimeout(go, 200); return; }
  imgs.forEach(function(im){
    if(im.complete){ if(--pending===0) setTimeout(go, 200); }
    else { im.onload = im.onerror = function(){ if(--pending===0) setTimeout(go, 200); }; }
  });
}
