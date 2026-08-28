/* ============================================================
   PDF DEL PEDIDO  ·  Cotizador multimarca
   ------------------------------------------------------------
   IDÉNTICO al PDF que emite Poly (poly/js/pdf.js): misma hoja de
   estilos (shared/pdf-core.js), misma tabla, mismas columnas,
   misma tipografía, mismos colores, mismo total.

   La ÚNICA diferencia: el pedido multimarca lleva líneas de
   varias marcas, así que dentro de la tabla se hace un "salto"
   por marca — una fila fina de separación con el nombre de la
   marca, en el mismo gris tenue que los encabezados de columna
   (#6e6e73 / #d2d2d7). Sin colores nuevos, sin CSS propio.

   No es un documento por marca: para eso están los PDF de cada
   cotizador, que salen al emitir. Este es la vista única del
   pedido para el cliente.

   Dos documentos, igual que en Poly:
     buildPDF()          · el pedido en vivo → PDF A4 landscape
     exportSelectedPDF() · pedidos del historial → HTML para imprimir
     exportPedidoPDF(qn) · un pedido del historial (botón de la tarjeta)

   Depende de: shared/pdf-core.js, js/marcas.js (cevenMultiMarcas*),
   shared/opciones.js, shared/ui-core.js (dp / fI / _logo),
   js/quotes-db.js (doSave / getDB).
   ============================================================ */

/* El "salto" entre marcas: una fila de la tabla con el nombre de la marca,
   pintada EXACTAMENTE como un encabezado de columna del PDF de Poly
   (cevenPdfDocCSS: font-size 10, #6e6e73, mayúsculas, borde #d2d2d7). */
function _multiPdfSepMarca(label){
  return '<tr><td colspan="7" style="border-bottom:1.5px solid #d2d2d7;padding:7px 8px;'
    + 'font-size:10px;color:#6e6e73;font-weight:600;text-transform:uppercase;letter-spacing:.4px">'
    + cevenEsc(label) + '</td></tr>';
}

/* ── PDF DEL PEDIDO EN VIVO ─────────────────────────────────────────────────── */
function buildPDF(){
  if(!items.length){ showToast('El pedido está vacío.'); return; }
  // En ARS sin tipo de cambio, dp() no puede dar un importe.
  if(!cevenTCValido()){ showToast('Cargá el tipo de cambio antes de exportar en ARS.'); return; }
  // El PDF imprime "Ejecutivo:" y además guarda: sin ejecutivo el guardado se
  // rechaza, así que se corta acá.
  if(!cevenRequireExec()) return;
  // Igual que en las marcas: exportar también guarda.
  doSave(true);

  var client   = document.getElementById('client').value;
  var opg      = document.getElementById('opg').value;
  var proyecto = document.getElementById('proyecto').value;
  var exec     = document.getElementById('exec').value;
  var ob       = document.getElementById('obs').value;
  var qn = cevenQNumVisible(qNum);
  var logoTag = _logo ? '<img src="'+cevenEsc(_logo)+'" style="height:40px;object-fit:contain;display:block;margin:0 auto 20px">' : '';
  var sortedItems = getSortedItems();
  var hayOpcB = cevenOpcFiltrar(items, 2).length > 0;

  // La tabla de UNA opción, con su fila de total. Igual que _tablaOpcion() de
  // Poly, salvo que las líneas se agrupan por marca con una fila de separación.
  function _tablaOpcion(n){
    var lista = cevenOpcFiltrar(sortedItems, n);
    if(!lista.length) return '';
    var marcas = cevenMultiMarcasDe(lista);
    var rows='', gt=0;
    for(var mi=0; mi<marcas.length; mi++){
      var ls = cevenMultiLineasDe(lista, marcas[mi]);
      if(!ls.length) continue;
      rows += _multiPdfSepMarca(cevenMultiMarcaLabel(marcas[mi]));
      for(var i=0;i<ls.length;i++){
        var it=ls[i];
        var sp = (it.salePrice===''||it.salePrice==null) ? 0 : it.salePrice;
        gt += sp*it.qty;
        rows+='<tr><td class="nowrap" style="font-size:11px;font-family:monospace">'+cevenEsc(it.sku)+'</td><td>'+cevenEsc(it.description)+'</td>'
          +'<td class="nowrap" style="text-align:center">'+cevenEsc(it.qty)+'</td>'
          +'<td class="nowrap" style="text-align:right">'+cevenEsc(dp(sp))+'</td>'
          +'<td class="nowrap" style="text-align:right;font-weight:600">'+cevenEsc(dp(sp*it.qty))+'</td>'
          +'<td class="nowrap" style="text-align:center">'+cevenEsc(it.iva||it.taxes||'—')+'</td>'
          +'<td class="nowrap" style="text-align:center">'+cevenEsc(it.stock||'—')+'</td>'
          +'</tr>';
      }
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

  // "<cliente> - <proyecto> - Ceven - <validez>" (shared/pdf-core.js); si no hay
  // proyecto, el OPG — igual que Poly.
  var docTitle = cevenNombreDocumento(client, proyecto || opg, document.getElementById('eff-date').value);
  var html='<!DOCTYPE html><html><head><meta charset="UTF-8"><title>'+cevenEsc(docTitle)+'</title>'
    +cevenPdfDocCSS('.col-sku{width:14%}.col-desc{width:36%}.col-qty{width:7%}.col-pv{width:13%}.col-tot{width:13%}.col-iva{width:8%}.col-nota{width:9%}')
    +'</head><body>'
    +logoTag
    +'<p class="qn">Pedido '+cevenEsc(qn)+'</p>'
    +'<h1>Cotización Multimarca</h1>'
    +'<div class="cb">'+(client?'<p class="cn">'+cevenEsc(client)+'</p>':'')+(opg?'<p class="cm">OPG: '+cevenEsc(opg)+'</p>':'')+(proyecto?'<p class="cm">Proyecto: '+cevenEsc(proyecto)+'</p>':'')+(exec?'<p class="cm">Ejecutivo: '+cevenEsc(exec)+'</p>':'')+(ob?'<p class="cm">'+cevenEsc(ob)+'</p>':'')+'</div>'
    +(hayOpcB ? '<p class="opc-nota">'+cevenEsc(cevenOpcLeyenda())+'</p>' : '')
    +_tablaOpcion(1)
    +_tablaOpcion(2);

  html += cevenCondicionesHTML()
    +'<p class="ft">Ceven S.A.</p>'
    +'</body></html>';
  html = html.replace('</head>',
    '<style>tr,.cb,.sec{page-break-inside:avoid}thead{display:table-header-group}'
    +'@media print{@page{size:A4 landscape;margin:10mm}}</style>'
    +'</head>');

  downloadQuotePDF(html, docTitle);
}

/* ── PDF DE PEDIDOS DEL HISTORIAL ───────────────────────────────────────────── */
function exportSelectedPDF(){
  var keys = Object.keys(histSel);
  if(!keys.length) return;
  _multiHistExportarPDF(keys);
}

// El botón "📄 PDF" de cada tarjeta del historial.
function exportPedidoPDF(qn){
  _multiHistExportarPDF([qn]);
}

function _multiHistExportarPDF(keys){
  var db = getDB();
  var grouped = {};
  for(var i=0;i<db.length;i++){ var k=db[i]['N° Cotización']; if(keys.indexOf(k)>=0){ if(!grouped[k])grouped[k]=[]; grouped[k].push(db[i]); } }
  var orden = keys.filter(function(k){ return grouped[k] && grouped[k].length; });
  if(!orden.length){ showToast('No se encontró el pedido.'); return; }

  var logoTag = _logo ? '<img src="'+cevenEsc(_logo)+'" style="height:40px;object-fit:contain;display:block;margin:0 auto 20px">' : '';
  var allBlocks='';
  for(var ki=0;ki<orden.length;ki++){
    var qn=orden[ki], rows=grouped[qn]; if(!rows||!rows.length) continue;
    var first=rows[0];
    // El OPG puede estar en cualquier fila de Poly, no sólo en la primera.
    var opg='';
    for(var oi=0;oi<rows.length;oi++){ if(rows[oi]['OPG'] && rows[oi]['OPG']!=='—'){ opg=rows[oi]['OPG']; break; } }
    var hayOpcB = cevenOpcHayBEnFilas(rows);
    var bloquesOpc = '';
    for(var opn=1; opn<=2; opn++){
      var filasOpc = rows.filter(function(r){ return cevenOpcDe(r) === opn; });
      if(!filasOpc.length) continue;
      // Marcas presentes en esta opción, en el orden del registro (las
      // desconocidas al final, para poder verlas en vez de esconderlas).
      var ordenM = cevenMultiMarcasIds(), vistas = {}, marcas = [];
      ordenM.forEach(function(b){ if(filasOpc.some(function(f){ return f['Marca']===b; })){ vistas[b]=1; marcas.push(b); } });
      filasOpc.forEach(function(f){ var b=f['Marca']||''; if(b && !vistas[b]){ vistas[b]=1; marcas.push(b); } });

      var trows='', gt=0;
      for(var mi=0;mi<marcas.length;mi++){
        var ls = filasOpc.filter(function(f){ return (f['Marca']||'') === marcas[mi]; });
        if(!ls.length) continue;
        trows += _multiPdfSepMarca(cevenMultiMarcaLabel(marcas[mi]));
        for(var ri=0;ri<ls.length;ri++){
          var r=ls[ri];
          gt += parseFloat(r['Total'])||0;
          trows+='<tr><td>'+cevenEsc(r['SKU'])+'</td><td class="wrap">'+cevenEsc(r['Descripción'])+'</td>'
            +'<td style="text-align:center">'+cevenEsc(r['Cantidad'])+'</td>'
            +'<td style="text-align:right">USD '+fI(parseFloat(r['P. Venta Unitario'])||0)+'</td>'
            +'<td style="text-align:right;font-weight:600">USD '+fI(parseFloat(r['Total'])||0)+'</td>'
            +'<td style="text-align:center">'+cevenEsc(r['IVA']||'—')+'</td>'
            +'<td style="text-align:center">'+cevenEsc(r['Nota']||'—')+'</td></tr>';
        }
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
      +'<p class="qn">Pedido '+cevenEsc(CEVEN_BRAND.qNumPrefijo + qn)+'</p>'
      +'<h1>Cotización Multimarca</h1>'
      +'<div class="cb">'
        +(first['Cliente']&&first['Cliente']!=='—'?'<p class="cn">'+cevenEsc(first['Cliente'])+'</p>':'')
        +(opg?'<p class="cm">OPG: '+cevenEsc(opg)+'</p>':'')
        +(first['Proyecto']&&first['Proyecto']!=='—'?'<p class="cm">Proyecto: '+cevenEsc(first['Proyecto'])+'</p>':'')
        +(first['Ejecutivo']&&first['Ejecutivo']!=='—'?'<p class="cm">Ejecutivo: '+cevenEsc(first['Ejecutivo'])+'</p>':'')
        +(first['Observaciones']&&first['Observaciones']!=='—'?'<p class="cm">'+cevenEsc(first['Observaciones'])+'</p>':'')
      +'</div>'
      +(hayOpcB ? '<p class="opc-nota">'+cevenEsc(cevenOpcLeyenda())+'</p>' : '')
      +bloquesOpc
      +cevenCondicionesHTML(first)
    +'</div>';
  }
  var fname = orden.length===1 ? 'Pedido_'+orden[0] : 'Pedidos_'+orden.join('-');
  var html='<!DOCTYPE html><html><head><meta charset="UTF-8"><title>'+cevenEsc(fname)+'</title>'
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
