
function exportSelectedPDF(){
  var keys=Object.keys(histSel);
  if(!keys.length) return;
  var db=getDB();
  var grouped={};
  for(var i=0;i<db.length;i++){var k=db[i]['N° Cotización'];if(histSel[k]){if(!grouped[k])grouped[k]=[];grouped[k].push(db[i]);}}
  // El HTML que se arma acá se descarga como archivo y se abre en un navegador:
  // un SKU o una descripción con <script> corría al abrirlo. Todo escapado.
  var logoTag=_logo?'<img src="'+cevenEsc(_logo)+'" style="height:40px;object-fit:contain;display:block;margin:0 auto 20px">':'';
  var allBlocks='';
  for(var ki=0;ki<keys.length;ki++){
    var qn=keys[ki], rows=grouped[qn]; if(!rows||!rows.length) continue;
    var first=rows[0], gt=0; for(var ri=0;ri<rows.length;ri++) gt+=parseFloat(rows[ri]['Total'])||0;
    var trows='';
    for(var ri=0;ri<rows.length;ri++){
      var r=rows[ri];
      trows+='<tr><td>'+cevenEsc(r['SKU'])+'</td><td class="wrap">'+cevenEsc(r['Descripción'])+'</td>'
        +'<td style="text-align:center">'+cevenEsc(r['Cantidad'])+'</td>'
        +'<td style="text-align:right">USD '+fI(parseFloat(r['P. Venta Unitario'])||0)+'</td>'
        +'<td style="text-align:right;font-weight:600">USD '+fI(parseFloat(r['Total'])||0)+'</td>'
        +'<td style="text-align:center">'+cevenEsc(r['Nota']||'—')+'</td></tr>';
    }
    var payMode = first['Condición de pago']||'';
    var effDate = first['Propuesta efectiva hasta']||'—';
    var delivery = first['Entrega']||'—';
    allBlocks+='<div class="qb">'
      +'<p class="qn">Cotización #'+cevenEsc(qn)+'</p>'
      +'<h1>Poly · Audio y video conferencia</h1>'
      +'<div class="cb">'
        +(first['Cliente']&&first['Cliente']!=='—'?'<p class="cn">'+cevenEsc(first['Cliente'])+'</p>':'')
        +(first['OPG']&&first['OPG']!=='—'?'<p class="cm">OPG: '+cevenEsc(first['OPG'])+'</p>':'')
        +(first['Sala']&&first['Sala']!=='—'?'<p class="cm">Proyecto: '+cevenEsc(first['Sala'])+'</p>':'')
        +(first['Ejecutivo']&&first['Ejecutivo']!=='—'?'<p class="cm">Ejecutivo: '+cevenEsc(first['Ejecutivo'])+'</p>':'')
        +(first['Observaciones']&&first['Observaciones']!=='—'?'<p class="cm">'+cevenEsc(first['Observaciones'])+'</p>':'')
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
        +(effDate!=='—'?'<p class="cd">Propuesta efectiva hasta: '+cevenEsc(effDate)+'</p>':'')
        +(payMode?'<p class="cd">Condición de pago: '+cevenEsc(payMode)+' – TC Dólar billete BNA del día del pago</p>':'')
        +'<p class="cd">Precios unitarios expresados en dólares estadounidenses</p>'
        +'<p class="cd">Los precios expresados NO incluyen Impuestos</p>'
        +(delivery!=='—'?'<p class="cd">Entrega: '+cevenEsc(delivery)+'</p>':'')
      :'')
    +'</div>';
  }
  var fname=keys.length===1?'Cotizacion_'+keys[0]:'Cotizaciones_'+keys.join('-');
  var html='<!DOCTYPE html><html><head><meta charset="UTF-8"><title>'+cevenEsc(fname)+'</title>'
    // Poly no tiene garantias ni separador de familia: la hoja base alcanza.
    +cevenPdfListCSS()
    +'</head><body>'
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
  // En ARS sin tipo de cambio, dp() no puede dar un importe: antes salía un PDF
  // con los números de USD rotulados como ARS (1:1).
  if(!cevenTCValido()){showToast('Cargá el tipo de cambio antes de exportar en ARS.');return;}
  // buildPDF() guarda además de exportar, y el PDF imprime "Ejecutivo:": si el
  // campo está vacío el guardado se rechaza, así que se corta acá y no se emite
  // un PDF que no quedó registrado en el historial.
  if(!cevenRequireExec()) return;
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
  // Este HTML no sólo se descarga: downloadQuotePDF() lo mete en el DOM vivo
  // (wrap.innerHTML) para que html2canvas lo fotografíe, así que un onerror en
  // una descripción del catálogo se ejecutaba en la propia app. Todo escapado.
  var logoTag=_logo?'<img src="'+cevenEsc(_logo)+'" style="height:40px;object-fit:contain;display:block;margin:0 auto 20px">':'';
  var sortedItems = getSortedItems();
  var rows='';
  for(var i=0;i<sortedItems.length;i++){
    var it=sortedItems[i];
    var sp = (it.salePrice===''||it.salePrice==null) ? 0 : it.salePrice;
    rows+='<tr><td class="nowrap" style="font-size:11px;font-family:monospace">'+cevenEsc(it.sku)+'</td><td>'+cevenEsc(it.description)+'</td>'
      +'<td class="nowrap" style="text-align:center">'+cevenEsc(it.qty)+'</td>'
      +'<td class="nowrap" style="text-align:right">'+cevenEsc(dp(sp))+'</td>'
      +'<td class="nowrap" style="text-align:right;font-weight:600">'+cevenEsc(dp(sp*it.qty))+'</td>'
      +'<td class="nowrap" style="text-align:center">'+cevenEsc(it.stock||'—')+'</td>'
      +'</tr>';
  }
  // Armar nombre de archivo: Cotizacion_XXXX_NombreCliente
  var clientSlug = client.trim()
    .replace(/[<>:"/\\|?*]/g,'')   // caracteres inválidos en nombres de archivo
    .replace(/\s+/g,'_')           // espacios → guión bajo
    .substring(0,40);              // máx 40 chars
  var docTitle = 'Cotizacion_' + qn + (clientSlug ? '_' + clientSlug : '');
  var html='<!DOCTYPE html><html><head><meta charset="UTF-8"><title>'+cevenEsc(docTitle)+'</title>'
    // El ':' de sobra en '.col-qty:' invalidaba el selector y Chrome descartaba
    // TODA la regla: la columna Qty quedaba sin ancho y el resto de la tabla se
    // corria. Apple no tenia el typo.
    +cevenPdfDocCSS('.col-sku{width:14%}.col-desc{width:42%}.col-qty{width:8%}.col-pv{width:14%}.col-tot{width:14%}.col-nota{width:12%}')
    +'</head><body>'
    +logoTag
    +'<p class="qn">Cotización #'+cevenEsc(qn)+'</p>'
    +'<h1>Poly · Audio y video conferencia</h1>'
    +'<div class="cb">'+(client?'<p class="cn">'+cevenEsc(client)+'</p>':'')+(opg?'<p class="cm">OPG: '+cevenEsc(opg)+'</p>':'')+(sala?'<p class="cm">Proyecto: '+cevenEsc(sala)+'</p>':'')+(exec?'<p class="cm">Ejecutivo: '+cevenEsc(exec)+'</p>':'')+(ob?'<p class="cm">'+cevenEsc(ob)+'</p>':'')+'</div>'
    +'<table><colgroup><col class="col-sku"><col class="col-desc"><col class="col-qty"><col class="col-pv"><col class="col-tot"><col class="col-nota"></colgroup><thead><tr>'
      +'<th>SKU</th><th>Descripción</th>'
      +'<th style="text-align:center">Qty</th>'
      +'<th style="text-align:right">P. Venta</th>'
      +'<th style="text-align:right">Total</th>'
      +'<th style="text-align:center">Nota</th>'
    +'</tr></thead>'
    +'<tbody>'+rows+'<tr class="tr"><td colspan="4" style="text-align:right">Total</td><td style="text-align:right">'+dp(gt)+'</td><td></td></tr></tbody></table>';

  html += '<p class="sec">Condiciones Comerciales</p>'
    +'<p class="cd">Propuesta efectiva hasta: '+cevenEsc(effDate)+'</p>'
    +'<p class="cd">Condición de pago: '+cevenEsc(payMode)+' – TC Dólar billete BNA del día del pago</p>'
    +'<p class="cd">'+curLabel+'</p>'
    +'<p class="cd">Los precios expresados NO incluyen Impuestos</p>'
    +'<p class="cd">Entrega: '+cevenEsc(delivery)+'</p>'
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

// downloadQuotePDF() vive en shared/pdf-core.js (era identico byte a byte).
