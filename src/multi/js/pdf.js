/* ============================================================
   PDF DEL PEDIDO  ·  Cotizador multimarca
   ------------------------------------------------------------
   El pedido multimarca se cotiza JUNTO y se le presenta al
   cliente como UNA sola propuesta, agrupada por marca con el
   subtotal de cada una — el mismo criterio que la grilla en
   pantalla (js/quote.js) y que el subtotal que después cae al
   pipeline de esa marca.

   Este NO es un documento por marca: para eso están los PDF de
   cada cotizador, que salen al emitir. Este es la vista única
   del pedido entero, antes o después de emitirlo.

   Dos documentos, igual que en las marcas:

     buildPDF()          · el pedido en vivo → PDF (una hoja A4
                           landscape, rasterizada con html2canvas)
     exportSelectedPDF() · varios pedidos del historial → un HTML
                           para imprimir (descarga, no captura)

   Ambos comparten el armado de las tablas por marca; solo
   cambia de dónde salen las líneas (pantalla vs. `cquotes`) y
   la moneda (el pedido en vivo puede estar en ARS; lo guardado
   es siempre USD — ver shared/pdf-core.js).

   Depende de: shared/pdf-core.js (cevenPdfDocCSS / cevenPdfListCSS
   / cevenCondicionesHTML / cevenNombreDocumento / downloadQuotePDF),
   js/marcas.js (cevenMultiMarcas*), shared/opciones.js,
   shared/ui-core.js (dp / fI / _logo), js/quotes-db.js (doSave / getDB).
   ============================================================ */

/* Estilos propios del documento multimarca. El rótulo de marca va en negro
   pleno —no un color de acento— porque este PDF termina rasterizado y achicado
   por html2canvas para entrar en una hoja, y a ese tamaño un color se pierde y
   un recuadro no (mismo criterio que `.opc-tit` en shared/pdf-core.js). */
var CEVEN_MULTI_PDF_CSS =
    '.mk-h{display:inline-block;background:#1d1d1f;color:#fff;font-size:11px;font-weight:700;'
  + 'letter-spacing:.6px;text-transform:uppercase;padding:6px 10px;border-radius:6px;margin:18px 0 9px}'
  + '.sr td{border-top:1px solid #d2d2d7;border-bottom:none;font-weight:600;font-size:12px;'
  + 'padding-top:8px;color:#424245}'
  + '.ptot{text-align:right;font-weight:700;font-size:14px;border-top:1.5px solid #d2d2d7;'
  + 'padding-top:9px;margin:2px 0 12px}';

/* La tabla de UNA marca: el rótulo, el encabezado y la fila de subtotal. Las
   filas ya vienen armadas (cada llamador las construye desde su fuente). */
function _multiPdfTablaMarca(label, filasHtml, subFmt){
  return '<p class="mk-h">' + cevenEsc(label) + '</p>'
    + '<table><colgroup><col class="col-sku"><col class="col-desc"><col class="col-qty">'
    +   '<col class="col-pv"><col class="col-tot"><col class="col-iva"><col class="col-nota"></colgroup>'
    + '<thead><tr>'
    +   '<th>SKU</th><th>Descripción</th>'
    +   '<th style="text-align:center">Qty</th>'
    +   '<th style="text-align:right">P. Venta</th>'
    +   '<th style="text-align:right">Total</th>'
    +   '<th style="text-align:center">IVA</th>'
    +   '<th style="text-align:center">Nota</th>'
    + '</tr></thead><tbody>' + filasHtml
    +   '<tr class="sr"><td colspan="4" style="text-align:right">Subtotal ' + cevenEsc(label) + '</td>'
    +     '<td style="text-align:right">' + subFmt + '</td><td></td><td></td></tr>'
    + '</tbody></table>';
}

/* Las tablas por marca de un juego de líneas EN VIVO (`items`), en el orden del
   registro. Devuelve {html, total}. `lineas` ya viene filtrada por opción. */
function _multiPdfTablasLive(lineas){
  var marcas = cevenMultiMarcasDe(lineas);
  var html = '', total = 0;
  for(var m = 0; m < marcas.length; m++){
    var ls = cevenMultiLineasDe(lineas, marcas[m]);
    if(!ls.length) continue;
    var rows = '', sub = 0;
    for(var i = 0; i < ls.length; i++){
      var it = ls[i];
      var sp = (it.salePrice === '' || it.salePrice == null) ? 0 : it.salePrice;
      sub += sp * it.qty;
      /* SKU y descripción salen de catálogos sincronizados desde Supabase: van
         escapados sí o sí, y encima este HTML lo mete downloadQuotePDF() en el
         DOM vivo para fotografiarlo (un onerror correría en la propia app). */
      rows += '<tr>'
        + '<td class="nowrap" style="font-size:11px;font-family:monospace">' + cevenEsc(it.sku) + '</td>'
        + '<td>' + cevenEsc(it.description) + '</td>'
        + '<td class="nowrap" style="text-align:center">' + cevenEsc(it.qty) + '</td>'
        + '<td class="nowrap" style="text-align:right">' + cevenEsc(dp(sp)) + '</td>'
        + '<td class="nowrap" style="text-align:right;font-weight:600">' + cevenEsc(dp(sp * it.qty)) + '</td>'
        + '<td class="nowrap" style="text-align:center">' + cevenEsc(it.iva || it.taxes || '—') + '</td>'
        + '<td class="nowrap" style="text-align:center">' + cevenEsc(it.stock || '—') + '</td>'
        + '</tr>';
    }
    total += sub;
    html += _multiPdfTablaMarca(cevenMultiMarcaLabel(marcas[m]), rows, dp(sub));
  }
  return { html: html, total: total };
}

/* Las tablas por marca de filas YA GUARDADAS de `cquotes`, en el orden del
   registro (las marcas desconocidas al final, para poder verlas en vez de
   esconderlas). Todo en USD: el `P. Venta Unitario` guardado es dólares. */
function _multiPdfTablasRows(filas){
  var orden = cevenMultiMarcasIds(), vistas = {}, marcas = [];
  orden.forEach(function(b){
    if(filas.some(function(f){ return f['Marca'] === b; })){ vistas[b] = 1; marcas.push(b); }
  });
  filas.forEach(function(f){
    var b = f['Marca'] || '';
    if(b && !vistas[b]){ vistas[b] = 1; marcas.push(b); }
  });

  var html = '', total = 0;
  marcas.forEach(function(brand){
    var ls = filas.filter(function(f){ return (f['Marca'] || '') === brand; });
    if(!ls.length) return;
    var rows = '', sub = 0;
    ls.forEach(function(r){
      var t = parseFloat(r['Total']) || 0;
      sub += t;
      rows += '<tr>'
        + '<td class="nowrap" style="font-size:11px;font-family:monospace">' + cevenEsc(r['SKU']) + '</td>'
        + '<td>' + cevenEsc(r['Descripción']) + '</td>'
        + '<td class="nowrap" style="text-align:center">' + cevenEsc(r['Cantidad']) + '</td>'
        + '<td class="nowrap" style="text-align:right">USD ' + fI(parseFloat(r['P. Venta Unitario']) || 0) + '</td>'
        + '<td class="nowrap" style="text-align:right;font-weight:600">USD ' + fI(t) + '</td>'
        + '<td class="nowrap" style="text-align:center">' + cevenEsc(r['IVA'] || '—') + '</td>'
        + '<td class="nowrap" style="text-align:center">' + cevenEsc(r['Nota'] || '—') + '</td>'
        + '</tr>';
    });
    total += sub;
    html += _multiPdfTablaMarca(cevenMultiMarcaLabel(brand), rows, 'USD ' + fI(sub));
  });
  return { html: html, total: total };
}

/* ── PDF DEL PEDIDO EN VIVO ─────────────────────────────────────────────────── */
function buildPDF(){
  if(!items.length){ showToast('El pedido está vacío.'); return; }
  // En ARS sin tipo de cambio, dp() no puede dar un importe: saldría un PDF con
  // los números de USD rotulados como ARS (1:1).
  if(!cevenTCValido()){ showToast('Cargá el tipo de cambio antes de exportar en ARS.'); return; }
  // El PDF imprime "Ejecutivo:" y buildPDF() además guarda: si el campo está
  // vacío el guardado se rechaza, así que se corta acá.
  if(!cevenRequireExec()) return;
  // Igual que en las marcas: exportar también guarda, para que el PDF que se le
  // manda al cliente quede registrado en el historial del equipo.
  doSave(true);

  var _v = function(id){ var e = document.getElementById(id); return e ? e.value : ''; };
  var client = _v('client'), proyecto = _v('proyecto'), opg = _v('opg');
  var exec = _v('exec'), ob = _v('obs');
  var qn = cevenQNumVisible(qNum);
  var logoTag = _logo
    ? '<img src="' + cevenEsc(_logo) + '" style="height:40px;object-fit:contain;display:block;margin:0 auto 20px">'
    : '';

  var sortedItems = getSortedItems();
  /* Con dos opciones el documento lleva un bloque por cada una, con su total, y
     arriba el aviso de que son excluyentes — mismo criterio que el PDF de Poly. */
  var hayOpcB = cevenOpcFiltrar(items, 2).length > 0;

  function _bloque(n){
    var lista = cevenOpcFiltrar(sortedItems, n);
    if(!lista.length) return '';
    var r = _multiPdfTablasLive(lista);
    return (hayOpcB ? '<p class="opc-tit">Opción ' + cevenOpcLetra(n) + '</p>' : '')
      + r.html
      + '<div class="ptot">Total del pedido' + (hayOpcB ? ' · Opción ' + cevenOpcLetra(n) : '')
      +   ': ' + dp(r.total) + '</div>';
  }

  // "<cliente> - <proyecto> - Ceven - <validez>" (shared/pdf-core.js); si no hay
  // proyecto se cae al OPG, igual que en Poly.
  var docTitle = cevenNombreDocumento(client, proyecto || opg, _v('eff-date'));
  var html = '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>' + cevenEsc(docTitle) + '</title>'
    + cevenPdfDocCSS(
        '.col-sku{width:14%}.col-desc{width:36%}.col-qty{width:7%}.col-pv{width:13%}'
        + '.col-tot{width:13%}.col-iva{width:8%}.col-nota{width:9%}',
        CEVEN_MULTI_PDF_CSS)
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

  // Sin argumento, cevenCondicionesHTML() lee los campos de la pantalla — que es
  // lo correcto acá: se está exportando el pedido que está en vivo.
  html += cevenCondicionesHTML()
    + '<p class="ft">Ceven S.A.</p>'
    + '</body></html>';
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
  var db = getDB(), grouped = {};
  for(var i = 0; i < db.length; i++){
    var k = db[i]['N° Cotización'];
    if(histSel[k]) (grouped[k] = grouped[k] || []).push(db[i]);
  }
  var logoTag = _logo
    ? '<img src="' + cevenEsc(_logo) + '" style="height:40px;object-fit:contain;display:block;margin:0 auto 20px">'
    : '';
  var allBlocks = '';
  for(var ki = 0; ki < keys.length; ki++){
    var qn = keys[ki], rows = grouped[qn];
    if(!rows || !rows.length) continue;
    var first = rows[0];
    var hayOpcB = cevenOpcHayBEnFilas(rows);
    var bloquesOpc = '';
    for(var opn = 1; opn <= 2; opn++){
      var filasOpc = rows.filter(function(r){ return cevenOpcDe(r) === opn; });
      if(!filasOpc.length) continue;
      var r = _multiPdfTablasRows(filasOpc);
      bloquesOpc += (hayOpcB ? '<p class="opc-tit">Opción ' + cevenOpcLetra(opn) + '</p>' : '')
        + r.html
        + '<div class="ptot">Total del pedido' + (hayOpcB ? ' · Opción ' + cevenOpcLetra(opn) : '')
        +   ': USD ' + fI(r.total) + '</div>';
    }
    allBlocks += '<div class="qb">'
      + '<p class="qn">Pedido ' + cevenEsc(CEVEN_BRAND.qNumPrefijo + qn) + '</p>'
      + '<h1>Cotización Multimarca</h1>'
      + '<div class="cb">'
      +   (first['Cliente'] && first['Cliente'] !== '—' ? '<p class="cn">' + cevenEsc(first['Cliente']) + '</p>' : '')
      +   (first['Proyecto'] && first['Proyecto'] !== '—' ? '<p class="cm">Proyecto: ' + cevenEsc(first['Proyecto']) + '</p>' : '')
      +   (first['Ejecutivo'] && first['Ejecutivo'] !== '—' ? '<p class="cm">Ejecutivo: ' + cevenEsc(first['Ejecutivo']) + '</p>' : '')
      +   (first['Observaciones'] && first['Observaciones'] !== '—' ? '<p class="cm">' + cevenEsc(first['Observaciones']) + '</p>' : '')
      + '</div>'
      + (hayOpcB ? '<p class="opc-nota">' + cevenEsc(cevenOpcLeyenda()) + '</p>' : '')
      + bloquesOpc
      // Las condiciones salen de lo que doSave() guardó junto al pedido.
      + cevenCondicionesHTML(first)
      + '</div>';
  }
  var fname = keys.length === 1 ? 'Pedido_' + keys[0] : 'Pedidos_' + keys.join('-');
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
