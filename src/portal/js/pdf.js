/* ============================================================
   PORTAL · pdf.js
   ------------------------------------------------------------
   El documento que el cliente-canal le manda a SU cliente final:
   dos logos (el suyo, si cargó uno, y el de Ceven — SIEMPRE
   presente, no configurable) y los precios de REVENTA, nunca los
   que Ceven le cotiza a él.

   Se arma con la RESPUESTA confirmada de portal-emitir, no con el
   carrito local: son los números que de verdad quedaron
   registrados.

   Depende de: shared/pdf-core.js (downloadQuotePDF,
   cevenPdfDocCSS, cevenLimpiarNombreArchivo), logo.js
   (_portalLogoListar/_portalLogoUrl).
   ============================================================ */

function _portalLogoCevenUrl(){
  return new URL('../icons/ceven.png', location.href).toString();
}

function _portalPdfFilas(items){
  return items.map(function(it){
    return '<tr>'
      + '<td style="font-family:monospace;font-size:11px">' + cevenEsc(it.sku) + '</td>'
      + '<td class="wrap">' + cevenEsc(it.description) + '</td>'
      + '<td class="nowrap" style="text-align:center">' + it.qty + '</td>'
      + '<td class="nowrap" style="text-align:right">' + cevenEsc(_portalFmt(it.precioReventa)) + '</td>'
      + '<td class="nowrap" style="text-align:right">' + cevenEsc(_portalFmt(it.precioReventa * it.qty)) + '</td>'
      + '</tr>';
  }).join('');
}

function _portalPdfHTML(resp, logoCanalUrl){
  var razon = (_portalPerfil && _portalPerfil.razon_social) || cevenPortalEmail();
  var logoCanalTag = logoCanalUrl
    ? '<img src="' + cevenEsc(logoCanalUrl) + '" style="height:44px;object-fit:contain">'
    : '';
  var cols = 'table col{width:auto}'; // el layout fijo lo da <colgroup> abajo

  return '<!DOCTYPE html><html><head><meta charset="UTF-8">'
    + cevenPdfDocCSS(cols, '')
    + '</head><body>'
    + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:18px">'
      + '<div>' + logoCanalTag + '</div>'
      + '<img src="' + cevenEsc(_portalLogoCevenUrl()) + '" style="height:34px;object-fit:contain">'
    + '</div>'
    + '<h1>COTIZACIÓN</h1>'
    + '<div class="cb">'
      + '<p class="cn">' + cevenEsc(razon) + '</p>'
      + '<p class="cm">Proyecto: ' + cevenEsc(resp.proyecto) + '</p>'
      + '<p class="cm">Cotización N° ' + cevenEsc(resp.qNum) + ' · ' + new Date().toLocaleDateString('es-AR') + '</p>'
    + '</div>'
    + '<table><colgroup><col style="width:14%"><col><col style="width:10%"><col style="width:14%"><col style="width:14%"></colgroup>'
      + '<thead><tr><th>SKU</th><th>Descripción</th><th style="text-align:center">Cant.</th><th style="text-align:right">P. Unitario</th><th style="text-align:right">Total</th></tr></thead>'
      + '<tbody>' + _portalPdfFilas(resp.items) + '</tbody>'
      + '<tfoot><tr class="tr"><td colspan="4" style="text-align:right">TOTAL</td><td style="text-align:right">' + cevenEsc(_portalFmt(resp.totalReventa)) + '</td></tr></tfoot>'
    + '</table>'
    + '<p class="ft">Cotización generada por ' + cevenEsc(razon) + ' — powered by Ceven.</p>'
    + '</body></html>';
}

function _portalPdfGenerarYAbrir(resp){
  _portalLogoListar().then(function(path){
    return path ? _portalLogoUrl(path) : null;
  }).then(function(logoCanalUrl){
    var html = _portalPdfHTML(resp, logoCanalUrl);
    var nombre = cevenLimpiarNombreArchivo(resp.proyecto) + ' - Cotizacion ' + resp.qNum;
    downloadQuotePDF(html, nombre || ('Cotizacion ' + resp.qNum));
  });
}
