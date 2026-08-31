
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
    var first=rows[0];
    /* Una cotización puede llevar dos opciones alternativas: cada una va con su
       tabla y su total. Sin separarlas, las líneas de las dos caían en la misma
       tabla y el total era la suma de algo que nunca se va a facturar junto. */
    var hayOpcB = cevenOpcHayBEnFilas(rows);
    var bloquesOpc = '';
    for(var opn=1; opn<=2; opn++){
      var filasOpc = rows.filter(function(r){ return cevenOpcDe(r) === opn; });
      if(!filasOpc.length) continue;
      var trows='', gt=0;
      for(var ri=0;ri<filasOpc.length;ri++){
        var r=filasOpc[ri];
        gt += parseFloat(r['Total'])||0;
        trows+='<tr><td>'+cevenEsc(r['SKU'])+'</td><td class="wrap">'+cevenEsc(r['Descripción'])+'</td>'
          +'<td style="text-align:center">'+cevenEsc(r['Cantidad'])+'</td>'
          +'<td style="text-align:right">USD '+fI(parseFloat(r['P. Venta Unitario'])||0)+'</td>'
          +'<td style="text-align:right;font-weight:600">USD '+fI(parseFloat(r['Total'])||0)+'</td>'
          +'<td style="text-align:center">'+cevenEsc(cevenFormatoIVA(r['IVA'])||'—')+'</td>'
          +'<td style="text-align:center">'+cevenEsc(r['Nota']||'—')+'</td></tr>';
      }
      bloquesOpc += (hayOpcB ? '<p class="opc-tit">Opción '+cevenOpcLetra(opn)+'</p>' : '')
        +'<table><thead><tr>'
          +'<th>SKU</th><th>Descripción</th>'
          +'<th style="text-align:center">Qty</th>'
          +'<th style="text-align:right">P. Venta</th>'
          +'<th style="text-align:right">Total</th>'
          +'<th style="text-align:center">IVA</th>'
          +'<th style="text-align:center">Nota</th>'
        +'</tr></thead>'
        +'<tbody>'+trows
          +'<tr class="tr"><td colspan="4" style="text-align:right">Total'+(hayOpcB?' Opción '+cevenOpcLetra(opn):'')+'</td><td style="text-align:right">USD '+fI(gt)+'</td><td></td><td></td></tr>'
        +'</tbody></table>';
    }
    allBlocks+='<div class="qb">'
      +'<p class="qn">Cotización #'+cevenEsc(qn)+'</p>'
      +'<h1>Poly · Audio y video conferencia</h1>'
      +'<div class="cb">'
        +(first['Cliente']&&first['Cliente']!=='—'?'<p class="cn">'+cevenEsc(first['Cliente'])+'</p>':'')
        +(first['OPG']&&first['OPG']!=='—'?'<p class="cm">OPG: '+cevenEsc(first['OPG'])+'</p>':'')
        +(first['Proyecto']&&first['Proyecto']!=='—'?'<p class="cm">Proyecto: '+cevenEsc(first['Proyecto'])+'</p>':'')
        +(first['Ejecutivo']&&first['Ejecutivo']!=='—'?'<p class="cm">Ejecutivo: '+cevenEsc(first['Ejecutivo'])+'</p>':'')
        +(first['Observaciones']&&first['Observaciones']!=='—'?'<p class="cm">'+cevenEsc(first['Observaciones'])+'</p>':'')
      +'</div>'
      +(hayOpcB ? '<p class="opc-nota">'+cevenEsc(cevenOpcLeyenda())+'</p>' : '')
      +bloquesOpc
      /* Las condiciones salen de shared/pdf-core.js, con lo que doSave() guardó
         junto a la cotización. Hasta 08/2026 Poly NO guardaba esos tres campos,
         así que este bloque estaba siempre vacío y el PDF regenerado desde el
         historial salía sin condiciones comerciales — a diferencia del PDF de
         la cotización en vivo, que sí las imprimía. */
      +cevenCondicionesHTML(first)
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
  var proyecto=document.getElementById('proyecto').value;
  var exec=document.getElementById('exec').value;
  var ob=document.getElementById('obs').value;
  // Las condiciones comerciales (fecha efectiva, condición de pago, moneda y
  // entrega) las lee cevenCondicionesHTML() de los mismos campos, más abajo.
  var qn=String(qNum).padStart(4,'0');
  // Este HTML no sólo se descarga: downloadQuotePDF() lo mete en el DOM vivo
  // (wrap.innerHTML) para que html2canvas lo fotografíe, así que un onerror en
  // una descripción del catálogo se ejecutaba en la propia app. Todo escapado.
  var logoTag=_logo?'<img src="'+cevenEsc(_logo)+'" style="height:40px;object-fit:contain;display:block;margin:0 auto 20px">':'';
  var sortedItems = getSortedItems();
  /* Con dos opciones el documento lleva DOS tablas, cada una con su total, y
     arriba el aviso de que son excluyentes. Sin ese aviso, el cliente puede leer
     las dos tablas como dos partes de la misma compra y sumar los totales. */
  var hayOpcB = cevenOpcFiltrar(items, 2).length > 0;

  // La tabla de UNA opción, con su fila de total.
  function _tablaOpcion(n){
    var lista = cevenOpcFiltrar(sortedItems, n);
    if(!lista.length) return '';
    var rows='', gt=0;
    for(var i=0;i<lista.length;i++){
      var it=lista[i];
      var sp = (it.salePrice===''||it.salePrice==null) ? 0 : it.salePrice;
      gt += sp*it.qty;
      rows+='<tr><td class="nowrap" style="font-size:11px;font-family:monospace">'+cevenEsc(it.sku)+'</td><td>'+cevenEsc(it.description)+'</td>'
        +'<td class="nowrap" style="text-align:center">'+cevenEsc(it.qty)+'</td>'
        +'<td class="nowrap" style="text-align:right">'+cevenEsc(dp(sp))+'</td>'
        +'<td class="nowrap" style="text-align:right;font-weight:600">'+cevenEsc(dp(sp*it.qty))+'</td>'
        // El % de IVA sale de la columna "Programa fiscal" del Excel del ERP
        // (ver poly/js/catalog.js). Es informativo: no entra en ningún cálculo.
        +'<td class="nowrap" style="text-align:center">'+cevenEsc(cevenFormatoIVA(it.iva)||'—')+'</td>'
        +'<td class="nowrap" style="text-align:center">'+cevenEsc(it.stock||'—')+'</td>'
        +'</tr>';
    }
    return (hayOpcB ? '<p class="opc-tit">Opción '+cevenOpcLetra(n)+'</p>' : '')
      +'<table><colgroup><col class="col-sku"><col class="col-desc"><col class="col-qty"><col class="col-pv"><col class="col-tot"><col class="col-iva"><col class="col-nota"></colgroup><thead><tr>'
        +'<th>SKU</th><th>Descripción</th>'
        +'<th style="text-align:center">Qty</th>'
        +'<th style="text-align:right">P. Venta</th>'
        +'<th style="text-align:right">Total</th>'
        +'<th style="text-align:center">IVA</th>'
        +'<th style="text-align:center">Nota</th>'
      +'</tr></thead>'
      +'<tbody>'+rows
        +'<tr class="tr"><td colspan="4" style="text-align:right">Total'+(hayOpcB?' Opción '+cevenOpcLetra(n):'')+'</td>'
        +'<td style="text-align:right">'+dp(gt)+'</td><td></td><td></td></tr></tbody></table>';
  }
  // "<cliente> - <proyecto> - Ceven - <validez>" (shared/pdf-core.js). En Poly
  // el proyecto es el cliente final; si está vacío se cae al OPG.
  var docTitle = cevenNombreDocumento(
    client,
    proyecto || opg,
    document.getElementById('eff-date').value
  );
  var html='<!DOCTYPE html><html><head><meta charset="UTF-8"><title>'+cevenEsc(docTitle)+'</title>'
    // El ':' de sobra en '.col-qty:' invalidaba el selector y Chrome descartaba
    // TODA la regla: la columna Qty quedaba sin ancho y el resto de la tabla se
    // corria. Apple no tenia el typo.
    +cevenPdfDocCSS('.col-sku{width:14%}.col-desc{width:36%}.col-qty{width:7%}.col-pv{width:13%}.col-tot{width:13%}.col-iva{width:8%}.col-nota{width:9%}')
    +'</head><body>'
    +logoTag
    +'<p class="qn">Cotización #'+cevenEsc(qn)+'</p>'
    +'<h1>Poly · Audio y video conferencia</h1>'
    +'<div class="cb">'+(client?'<p class="cn">'+cevenEsc(client)+'</p>':'')+(opg?'<p class="cm">OPG: '+cevenEsc(opg)+'</p>':'')+(proyecto?'<p class="cm">Proyecto: '+cevenEsc(proyecto)+'</p>':'')+(exec?'<p class="cm">Ejecutivo: '+cevenEsc(exec)+'</p>':'')+(ob?'<p class="cm">'+cevenEsc(ob)+'</p>':'')+'</div>'
    +(hayOpcB ? '<p class="opc-nota">'+cevenEsc(cevenOpcLeyenda())+'</p>' : '')
    +_tablaOpcion(1)
    +_tablaOpcion(2);

  // Sin argumento, cevenCondicionesHTML() lee los campos de la pantalla — que es
  // lo que corresponde acá: se está exportando la cotización que está en vivo.
  html += cevenCondicionesHTML()
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
