/* ============================================================
   PDF DEL PEDIDO  ·  Cotizador multimarca
   ------------------------------------------------------------
   Mismo documento que emite Poly (shared/pdf-core.js + el
   patrón de poly/js/pdf.js): una tabla por opción, con las
   columnas SKU / Descripción / Qty / P. Venta / Total / IVA /
   Nota y una fila de Total. La única diferencia es que el
   pedido multimarca lleva líneas de varias marcas, así que
   dentro de la tabla va una banda por marca —con su subtotal—
   antes de sus líneas (mismo recurso que el separador de
   opción en el historial de Poly). No es un documento por
   marca: para eso están los PDF de cada cotizador, que salen
   al emitir.

   Dos documentos, igual que en las marcas:
     buildPDF()          · el pedido en vivo → PDF A4 landscape
     exportSelectedPDF() · pedidos del historial → HTML para imprimir
     exportPedidoPDF(qn) · un pedido del historial (botón de la tarjeta)

   Depende de: shared/pdf-core.js (cevenPdfDocCSS / cevenPdfListCSS /
   cevenCondicionesHTML / cevenNombreDocumento / downloadQuotePDF),
   js/marcas.js (cevenMultiMarcas*), shared/opciones.js,
   shared/ui-core.js (dp / fI / _logo), js/quotes-db.js (doSave / getDB).
   ============================================================ */

/* Anchos de columna: los mismos que el PDF de Poly. */
var CEVEN_MULTI_PDF_COLS =
    '.col-sku{width:14%}.col-desc{width:36%}.col-qty{width:7%}.col-pv{width:13%}'
  + '.col-tot{width:13%}.col-iva{width:8%}.col-nota{width:9%}';

/* Lo único propio del multimarca: la banda que separa las marcas dentro de la
   tabla. Mismo estilo que el separador de opción del historial de Poly. */
var CEVEN_MULTI_PDF_CSS =
    '.mk-row td{background:#f0f0f3;font-weight:700;font-size:11px;text-transform:uppercase;'
  + 'letter-spacing:.4px;color:#3a3a3c;padding:6px 8px}';

/* La fila-banda de una marca, con su subtotal ya formateado. */
function _multiPdfBandaMarca(label, subTxt){
  return '<tr class="mk-row"><td colspan="7">' + cevenEsc(label)
    + ' <span style="font-weight:400;text-transform:none;letter-spacing:0;color:#6e6e73">— '
    + subTxt + '</span></td></tr>';
}

/* El armazón de la tabla de UNA opción: encabezado, cuerpo (bandas + líneas, ya
   armado por el llamador) y la fila de Total. `tituloOpc` es '' o 'Opción A'. */
function _multiPdfTabla(cuerpo, totalTxt, tituloOpc){
  return (tituloOpc ? '<p class="opc-tit">' + cevenEsc(tituloOpc) + '</p>' : '')
    + '<table><colgroup><col class="col-sku"><col class="col-desc"><col class="col-qty">'
    +   '<col class="col-pv"><col class="col-tot"><col class="col-iva"><col class="col-nota"></colgroup>'
    + '<thead><tr>'
    +   '<th>SKU</th><th>Descripción</th>'
    +   '<th style="text-align:center">Qty</th>'
    +   '<th style="text-align:right">P. Venta</th>'
    +   '<th style="text-align:right">Total</th>'
    +   '<th style="text-align:center">IVA</th>'
    +   '<th style="text-align:center">Nota</th>'
    + '</tr></thead>'
    + '<tbody>' + cuerpo
    +   '<tr class="tr"><td colspan="4" style="text-align:right">Total'
    +     (tituloOpc ? ' ' + cevenEsc(tituloOpc) : '') + '</td>'
    +   '<td style="text-align:right">' + totalTxt + '</td><td></td><td></td></tr>'
    + '</tbody></table>';
}

/* Cuerpo de la tabla desde líneas EN VIVO (`items`): una banda por marca y sus
   líneas, en el orden del registro. Devuelve {cuerpo, total}. Los importes con
   dp() (respeta el toggle ARS de la pantalla), igual que el PDF de Poly. */
function _multiPdfCuerpoLive(lista){
  var marcas = cevenMultiMarcasDe(lista);
  var cuerpo = '', total = 0;
  for(var m = 0; m < marcas.length; m++){
    var ls = cevenMultiLineasDe(lista, marcas[m]);
    if(!ls.length) continue;
    var sub = 0;
    for(var s = 0; s < ls.length; s++){
      var v = (ls[s].salePrice === '' || ls[s].salePrice == null) ? 0 : ls[s].salePrice;
      sub += v * ls[s].qty;
    }
    total += sub;
    cuerpo += _multiPdfBandaMarca(cevenMultiMarcaLabel(marcas[m]), dp(sub));
    for(var i = 0; i < ls.length; i++){
      var it = ls[i];
      var sp = (it.salePrice === '' || it.salePrice == null) ? 0 : it.salePrice;
      /* SKU y descripción salen de catálogos sincronizados de Supabase: van
         escapados sí o sí, y downloadQuotePDF() mete este HTML en el DOM vivo
         para fotografiarlo (un onerror correría en la propia app). */
      cuerpo += '<tr>'
        + '<td class="nowrap" style="font-size:11px;font-family:monospace">' + cevenEsc(it.sku) + '</td>'
        + '<td>' + cevenEsc(it.description) + '</td>'
        + '<td class="nowrap" style="text-align:center">' + cevenEsc(it.qty) + '</td>'
        + '<td class="nowrap" style="text-align:right">' + cevenEsc(dp(sp)) + '</td>'
        + '<td class="nowrap" style="text-align:right;font-weight:600">' + cevenEsc(dp(sp * it.qty)) + '</td>'
        + '<td class="nowrap" style="text-align:center">' + cevenEsc(it.iva || it.taxes || '—') + '</td>'
        + '<td class="nowrap" style="text-align:center">' + cevenEsc(it.stock || '—') + '</td>'
        + '</tr>';
    }
  }
  return { cuerpo: cuerpo, total: total };
}

/* Cuerpo de la tabla desde filas YA GUARDADAS de `cquotes`. Todo en USD: el
   `P. Venta Unitario` guardado es dólares. Marcas desconocidas al final, para
   poder verlas en vez de esconderlas. */
function _multiPdfCuerpoRows(filas){
  var orden = cevenMultiMarcasIds(), vistas = {}, marcas = [];
  orden.forEach(function(b){
    if(filas.some(function(f){ return f['Marca'] === b; })){ vistas[b] = 1; marcas.push(b); }
  });
  filas.forEach(function(f){
    var b = f['Marca'] || '';
    if(b && !vistas[b]){ vistas[b] = 1; marcas.push(b); }
  });

  var cuerpo = '', total = 0;
  marcas.forEach(function(brand){
    var ls = filas.filter(function(f){ return (f['Marca'] || '') === brand; });
    if(!ls.length) return;
    var sub = 0;
    ls.forEach(function(r){ sub += parseFloat(r['Total']) || 0; });
    total += sub;
    cuerpo += _multiPdfBandaMarca(cevenMultiMarcaLabel(brand), 'USD ' + fI(sub));
    ls.forEach(function(r){
      cuerpo += '<tr>'
        + '<td class="nowrap" style="font-size:11px;font-family:monospace">' + cevenEsc(r['SKU']) + '</td>'
        + '<td>' + cevenEsc(r['Descripción']) + '</td>'
        + '<td class="nowrap" style="text-align:center">' + cevenEsc(r['Cantidad']) + '</td>'
        + '<td class="nowrap" style="text-align:right">USD ' + fI(parseFloat(r['P. Venta Unitario']) || 0) + '</td>'
        + '<td class="nowrap" style="text-align:right;font-weight:600">USD ' + fI(parseFloat(r['Total']) || 0) + '</td>'
        + '<td class="nowrap" style="text-align:center">' + cevenEsc(r['IVA'] || '—') + '</td>'
        + '<td class="nowrap" style="text-align:center">' + cevenEsc(r['Nota'] || '—') + '</td>'
        + '</tr>';
    });
  });
  return { cuerpo: cuerpo, total: total };
}

/* ── PDF DEL PEDIDO EN VIVO ─────────────────────────────────────────────────── */
function buildPDF(){
  if(!items.length){ showToast('El pedido está vacío.'); return; }
  // En ARS sin tipo de cambio, dp() no puede dar un importe.
  if(!cevenTCValido()){ showToast('Cargá el tipo de cambio antes de exportar en ARS.'); return; }
  // El PDF imprime "Ejecutivo:" y además guarda: sin ejecutivo el guardado se
  // rechaza, así que se corta acá.
  if(!cevenRequireExec()) return;
  // Igual que en las marcas: exportar también guarda, para que el PDF que se le
  // manda al cliente quede registrado en el historial del equipo.
  doSave(true);

  var _v = function(id){ var e = document.getElementById(id); return e ? e.value : ''; };
  var client = _v('client'), opg = _v('opg'), proyecto = _v('proyecto');
  var exec = _v('exec'), ob = _v('obs');
  var qn = cevenQNumVisible(qNum);
  var logoTag = _logo
    ? '<img src="' + cevenEsc(_logo) + '" style="height:40px;object-fit:contain;display:block;margin:0 auto 20px">'
    : '';

  var sortedItems = getSortedItems();
  // Con dos opciones el documento lleva una tabla por cada una, con su total, y
  // arriba el aviso de que son excluyentes — igual que el PDF de Poly.
  var hayOpcB = cevenOpcFiltrar(items, 2).length > 0;

  function _bloque(n){
    var lista = cevenOpcFiltrar(sortedItems, n);
    if(!lista.length) return '';
    var c = _multiPdfCuerpoLive(lista);
    return _multiPdfTabla(c.cuerpo, dp(c.total), hayOpcB ? 'Opción ' + cevenOpcLetra(n) : '');
  }

  // "<cliente> - <proyecto> - Ceven - <validez>"; si no hay proyecto, el OPG.
  var docTitle = cevenNombreDocumento(client, proyecto || opg, _v('eff-date'));
  var html = '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>' + cevenEsc(docTitle) + '</title>'
    + cevenPdfDocCSS(CEVEN_MULTI_PDF_COLS, CEVEN_MULTI_PDF_CSS)
    + '</head><body>'
    + logoTag
    + '<p class="qn">Pedido ' + cevenEsc(qn) + '</p>'
    + '<h1>Cotización Multimarca</h1>'
    + '<div class="cb">'
    +   (client ? '<p class="cn">' + cevenEsc(client) + '</p>' : '')
    +   (opg ? '<p class="cm">OPG: ' + cevenEsc(opg) + '</p>' : '')
    +   (proyecto ? '<p class="cm">Proyecto: ' + cevenEsc(proyecto) + '</p>' : '')
    +   (exec ? '<p class="cm">Ejecutivo: ' + cevenEsc(exec) + '</p>' : '')
    +   (ob ? '<p class="cm">' + cevenEsc(ob) + '</p>' : '')
    + '</div>'
    + (hayOpcB ? '<p class="opc-nota">' + cevenEsc(cevenOpcLeyenda()) + '</p>' : '')
    + _bloque(1)
    + _bloque(2);

  // Sin argumento, cevenCondicionesHTML() lee los campos de la pantalla.
  html += cevenCondicionesHTML()
    + '<p class="ft">Ceven S.A.</p>'
    + '</body></html>';
  // Salto de página / landscape + no cortar filas, igual que Poly.
  html = html.replace('</head>',
    '<style>tr,.cb,.sec{page-break-inside:avoid}thead{display:table-header-group}'
    + '@media print{@page{size:A4 landscape;margin:10mm}}</style>'
    + '</head>');

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
  var db = getDB(), grouped = {};
  for(var i = 0; i < db.length; i++){
    var k = db[i]['N° Cotización'];
    if(keys.indexOf(k) >= 0) (grouped[k] = grouped[k] || []).push(db[i]);
  }
  var orden = keys.filter(function(k){ return grouped[k] && grouped[k].length; });
  if(!orden.length){ showToast('No se encontró el pedido.'); return; }

  var logoTag = _logo
    ? '<img src="' + cevenEsc(_logo) + '" style="height:40px;object-fit:contain;display:block;margin:0 auto 20px">'
    : '';
  var allBlocks = '';
  for(var ki = 0; ki < orden.length; ki++){
    var qn = orden[ki], rows = grouped[qn], first = rows[0];
    // El OPG puede estar en cualquier fila de Poly, no necesariamente en la 1ª.
    var opg = '';
    for(var oi = 0; oi < rows.length; oi++){
      if(rows[oi]['OPG'] && rows[oi]['OPG'] !== '—'){ opg = rows[oi]['OPG']; break; }
    }
    var hayOpcB = cevenOpcHayBEnFilas(rows);
    var bloques = '';
    for(var opn = 1; opn <= 2; opn++){
      var filasOpc = rows.filter(function(r){ return cevenOpcDe(r) === opn; });
      if(!filasOpc.length) continue;
      var c = _multiPdfCuerpoRows(filasOpc);
      bloques += _multiPdfTabla(c.cuerpo, 'USD ' + fI(c.total), hayOpcB ? 'Opción ' + cevenOpcLetra(opn) : '');
    }
    allBlocks += '<div class="qb">'
      + '<p class="qn">Pedido ' + cevenEsc(CEVEN_BRAND.qNumPrefijo + qn) + '</p>'
      + '<h1>Cotización Multimarca</h1>'
      + '<div class="cb">'
      +   (first['Cliente'] && first['Cliente'] !== '—' ? '<p class="cn">' + cevenEsc(first['Cliente']) + '</p>' : '')
      +   (opg ? '<p class="cm">OPG: ' + cevenEsc(opg) + '</p>' : '')
      +   (first['Proyecto'] && first['Proyecto'] !== '—' ? '<p class="cm">Proyecto: ' + cevenEsc(first['Proyecto']) + '</p>' : '')
      +   (first['Ejecutivo'] && first['Ejecutivo'] !== '—' ? '<p class="cm">Ejecutivo: ' + cevenEsc(first['Ejecutivo']) + '</p>' : '')
      +   (first['Observaciones'] && first['Observaciones'] !== '—' ? '<p class="cm">' + cevenEsc(first['Observaciones']) + '</p>' : '')
      + '</div>'
      + (hayOpcB ? '<p class="opc-nota">' + cevenEsc(cevenOpcLeyenda()) + '</p>' : '')
      + bloques
      // Las condiciones salen de lo que doSave() guardó junto al pedido.
      + cevenCondicionesHTML(first)
      + '</div>';
  }
  var fname = orden.length === 1 ? 'Pedido_' + orden[0] : 'Pedidos_' + orden.join('-');
  var html = '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>' + cevenEsc(fname) + '</title>'
    + cevenPdfListCSS(CEVEN_MULTI_PDF_CSS)
    + '</head><body>'
    + logoTag
    + allBlocks
    + '<p class="ft">Ceven S.A.</p>'
    + '</body></html>';
  var blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = fname + '.html';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(function(){ URL.revokeObjectURL(url); }, 3000);
}
