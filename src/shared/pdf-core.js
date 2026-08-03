/* ============================================================
   PDF · NUCLEO COMPARTIDO  ·  todas las marcas
   ------------------------------------------------------------
   Dos cosas que eran identicas byte a byte en las dos marcas:
   el rasterizado a PDF y la hoja de estilos base del documento.

   Lo que NO esta aca es el ARMADO del HTML: Apple imprime margen,
   IVA/Imp.Int., disponibilidad, separadores por familia y una
   tabla aparte de garantias CevenCare; Poly imprime OPG, Proyecto y
   una columna de Nota. Son documentos distintos para clientes
   distintos, no un template con banderitas.

   Depende de: vendor/html2canvas + vendor/jspdf, notify.js
   (showToast). Se carga ANTES de <marca>/js/pdf.js.
   ============================================================ */

/* Hoja de estilos del PDF de UNA cotizacion (buildPDF).
   `cols`  = anchos de columna, que dependen de cuantas tiene cada marca.
   `extra` = reglas propias de la marca (badges de garantia, separador de
             familia, nota al pie de Complete Care...). */
function cevenPdfDocCSS(cols, extra){
  return '<style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:-apple-system,sans-serif;padding:32px;color:#1d1d1f;font-size:13px}'
    +'.qn{font-size:11px;color:#aeaeb2;text-align:center;margin-bottom:4px}h1{font-size:17px;font-weight:600;text-align:center;margin-bottom:16px}'
    +'.cb{margin-bottom:14px}.cn{font-size:15px;font-weight:700;margin-bottom:3px}.cm{font-size:12px;color:#6e6e73;margin-bottom:2px}'
    +'table{width:100%;border-collapse:collapse;margin-bottom:12px;table-layout:fixed}'
    +(cols||'')
    +'th{text-align:left;border-bottom:1.5px solid #d2d2d7;padding:7px 8px;font-size:10px;color:#6e6e73;font-weight:600;text-transform:uppercase;letter-spacing:.4px}'
    +'td{padding:7px 8px;border-bottom:0.5px solid #f0f0f0;white-space:normal;word-wrap:break-word}'
    +'td.nowrap{white-space:nowrap}'
    +'.tr td{border-top:1.5px solid #d2d2d7;border-bottom:none;font-weight:700;font-size:14px;padding-top:9px}'
    +'.sec{font-size:13px;font-weight:700;margin:16px 0 8px;padding-top:14px;border-top:0.5px solid #d2d2d7}.cd{font-size:12px;font-weight:700;margin-bottom:6px}'
    +(extra||'')
    +'.ft{margin-top:20px;font-size:10px;color:#aeaeb2;text-align:center}'
    +'@media print{body{padding:18px}}</style>';
}

/* Hoja de estilos del PDF de VARIAS cotizaciones (exportSelectedPDF, desde el
   historial). No lleva anchos de columna: es una descarga HTML, no una captura
   a canvas, y ahi conviene que la tabla se acomode sola. */
function cevenPdfListCSS(extra){
  return '<style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:-apple-system,sans-serif;padding:32px;color:#1d1d1f;font-size:13px}'
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
    +(extra||'')
    +'.ft{margin-top:20px;font-size:10px;color:#aeaeb2;text-align:center}'
    +'@media print{.qb{page-break-after:always}.qb:last-child{page-break-after:avoid}body{padding:18px}}'
    +'</style>';
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
