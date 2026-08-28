/* ============================================================
   PDF DEL PEDIDO  ·  Cotizador multimarca
   ------------------------------------------------------------
   El MISMO comprobante que emite cada marca desde el historial
   (shared/comprobante.js: jsPDF + autotable, serif azul marino,
   filete bajo el emisor, caja de N° + Fecha + Ejecutivo, tabla
   con cabecera navy y barra de TOTAL). Misma tipografía, mismos
   colores.

   La ÚNICA diferencia: el detalle se divide en UN cuadro por
   marca — cada uno con su cabecera navy y su barra de TOTAL —, y
   debajo de todos una barra "TOTAL GENERAL". Eso lo hace
   `cevenComprobanteDoc(..., {grupoDeFila, grupoLabel})`.

   No es un documento por marca: para eso están los comprobantes
   de cada cotizador, que salen al emitir. Este es la vista única
   del pedido para el cliente.

   Tres puntos de entrada:
     buildPDF()          · el pedido en vivo → PDF (se guarda y se relee)
     exportPedidoPDF(qn) · un pedido del historial (botón de la tarjeta)
     exportSelectedPDF() · los pedidos tildados → un PDF, una página cada uno

   Depende de: shared/comprobante.js (cevenComprobanteDoc), shared/pdf-core.js
   (cevenNombreDocumento / cevenDescargarYAbrir), js/marcas.js
   (cevenMultiMarcaLabel), js/quotes-db.js (doSave / getDB / filasDePedido).
   ============================================================ */

/* jsPDF + autotable tienen que estar cargados. */
function _multiPdfListo(){
  var PDF = (window.jspdf && window.jspdf.jsPDF) || window.jsPDF || (window.jspdf && window.jspdf.default);
  if(!PDF){ showToast('Error: jsPDF no cargó. Verificá tu conexión a internet.'); return false; }
  if(!PDF.API || typeof PDF.API.autoTable !== 'function'){
    showToast('Error: el plugin autotable de jsPDF no cargó.'); return false;
  }
  return true;
}

/* Filas de `cquotes` sin las corruptas — mismo filtro que cevenComprobanteFilas(). */
function _multiPdfFilas(qn){
  return getDB().filter(function(r){
    return String(r['N° Cotización']) === String(qn)
      && r['SKU'] && r['SKU'] !== 'undefined'
      && r['Descripción'] && r['Descripción'] !== 'undefined';
  });
}

/* Genera el comprobante multimarca a partir de filas de `cquotes` y lo
   descarga + abre. `numeroVisible` es 'M-0042' (cevenQNumVisible). Si `docPrevio`
   viene, se le agrega una página en vez de crear un archivo nuevo. Devuelve el
   doc para poder encadenar varios. */
function _multiPdfComprobante(filas, numeroVisible, docPrevio){
  return cevenComprobanteDoc(numeroVisible, filas, null, {
    doc: docPrevio || undefined,
    // El multimarca es un PEDIDO, no una cotización: baja a N cotizaciones al emitir.
    numeroLabel: 'Pedido N°: ',
    grupoDeFila: function(r){ return r['Marca'] || ''; },
    grupoLabel:  function(k){ return cevenMultiMarcaLabel(k); }
  });
}

function _multiPdfNombre(fila){
  fila = fila || {};
  return cevenNombreDocumento(
    fila['Cliente'],
    fila['Proyecto'] || fila['OPG'],
    fila['Propuesta efectiva hasta']
  ) + '.pdf';
}

/* ── PDF DEL PEDIDO EN VIVO ─────────────────────────────────────────────────── */
function buildPDF(){
  if(!items.length){ showToast('El pedido está vacío.'); return; }
  // El comprobante imprime "Ejecutivo:" y buildPDF() además guarda: sin
  // ejecutivo el guardado se rechaza, así que se corta acá.
  if(!cevenRequireExec()) return;
  if(!_multiPdfListo()) return;

  // Se guarda y se relee: el PDF sale de las MISMAS filas de `cquotes` que el
  // del historial, así que hay un solo camino que mantener.
  if(!doSave(true)){ showToast('No se pudo guardar el pedido para exportarlo.'); return; }
  var qn = cevenQNumFmt(qNum);
  var filas = _multiPdfFilas(qn);
  if(!filas.length){ showToast('El pedido está vacío.'); return; }

  var doc = _multiPdfComprobante(filas, cevenQNumVisible(qNum));
  if(!doc) return;
  cevenDescargarYAbrir(doc.output('blob'), _multiPdfNombre(filas[0]));
}

/* ── PDF DE PEDIDOS DEL HISTORIAL ───────────────────────────────────────────── */

// Botón "📄 PDF" de cada tarjeta del historial.
function exportPedidoPDF(qn){
  if(!_multiPdfListo()) return;
  var filas = _multiPdfFilas(qn);
  if(!filas.length){ showToast('No se encontró el pedido ' + qn + '.'); return; }
  var doc = _multiPdfComprobante(filas, (CEVEN_BRAND.qNumPrefijo || '') + qn);
  if(!doc) return;
  cevenDescargarYAbrir(doc.output('blob'), _multiPdfNombre(filas[0]));
}

// Botón "PDF seleccionados" de la barra: un archivo con una página por pedido.
function exportSelectedPDF(){
  var keys = Object.keys(histSel);
  if(!keys.length) return;
  if(!_multiPdfListo()) return;

  var doc = null, primera = null;
  keys.forEach(function(qn){
    var filas = _multiPdfFilas(qn);
    if(!filas.length) return;
    if(!primera) primera = filas[0];
    doc = _multiPdfComprobante(filas, (CEVEN_BRAND.qNumPrefijo || '') + qn, doc);
  });
  if(!doc){ showToast('No se encontró ningún pedido.'); return; }

  var fname = keys.length === 1 ? 'Pedido_' + keys[0] : 'Pedidos_' + keys.join('-');
  cevenDescargarYAbrir(doc.output('blob'), fname + '.pdf');
}
