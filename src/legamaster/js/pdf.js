/* ============================================================
   PDF · Legamaster
   ------------------------------------------------------------
   El MISMO documento que ya da el botón 🧾 del historial/pipeline
   (shared/comprobante.js: jsPDF + autotable, serif azul marino,
   nítido y con texto seleccionable) — nada de html2canvas. Antes
   este archivo armaba su propio HTML y lo rasterizaba: dos
   caminos que terminaban dando dos documentos distintos para la
   misma cotización.

   Un solo lugar arma los `opts` de la marca (la columna "Nota") y
   lo usan los TRES puntos de entrada, así los tres dan exactamente
   el mismo documento:
     buildPDF()          · la cotización en vivo → PDF (se guarda y se relee)
     exportSelectedPDF() · las tildadas del historial → un PDF, una página c/u
     cevenImprimirComprobante(qn, _legaComprobanteOpts()) · el 🧾 de cada
                            tarjeta (history.js / pipeline-view.js)

   Como el documento sale de las filas YA GUARDADAS en `cquotes` (siempre en
   USD — ver shared/pdf-core.js), el PDF de la cotización en vivo también sale
   siempre en dólares, aunque la pantalla esté mostrando ARS. Mismo criterio
   que ya aceptó Multi al migrar (src/multi/js/pdf.js).

   Depende de: shared/comprobante.js (cevenComprobanteDoc, cevenComprobanteNombre),
   shared/pdf-core.js (cevenDescargarYAbrir), js/quotes-db.js (doSave/getDB).
   ============================================================ */

/* jsPDF + autotable tienen que estar cargados. */
function _legaPdfListo(){
  var PDF = (window.jspdf && window.jspdf.jsPDF) || window.jsPDF || (window.jspdf && window.jspdf.default);
  if(!PDF){ showToast('Error: jsPDF no cargó. Verificá tu conexión a internet.'); return false; }
  if(!PDF.API || typeof PDF.API.autoTable !== 'function'){
    showToast('Error: el plugin autotable de jsPDF no cargó.'); return false;
  }
  return true;
}

/* Filas de `cquotes` sin las corruptas — mismo filtro que cevenComprobanteFilas(). */
function _legaPdfFilas(qn){
  return getDB().filter(function(r){
    return String(r['N° Cotización']) === String(qn)
      && r['SKU'] && r['SKU'] !== 'undefined'
      && r['Descripción'] && r['Descripción'] !== 'undefined';
  });
}

/* Lo único propio de Legamaster: la columna "Nota" (disponibilidad que tipea
   el vendedor por línea) — mismo campo que Poly. Objeto NUEVO en cada
   llamado — cevenComprobanteDoc() le cuelga `.doc` cuando encadena varias
   páginas y no puede ser compartido. */
function _legaComprobanteOpts(){
  return {
    extraCol: { header: 'Nota', get: function(r){ return r['Nota'] || '—'; }, width: 22 }
  };
}

/* ── PDF DE LA COTIZACIÓN EN VIVO ─────────────────────────────────────────── */
function buildPDF(){
  if(!items.length){ showToast('La cotización está vacía.'); return; }
  if(!cevenRequireExec()) return;
  if(!_legaPdfListo()) return;

  // Se guarda y se relee: el PDF sale de las MISMAS filas de `cquotes` que el
  // del historial, así que hay un solo camino que mantener.
  if(!doSave(true)){ showToast('No se pudo guardar la cotización para exportarla.'); return; }
  var qn = cevenQNumFmt(qNum);
  var filas = _legaPdfFilas(qn);
  if(!filas.length){ showToast('La cotización está vacía.'); return; }

  var doc = cevenComprobanteDoc(qn, filas, null, _legaComprobanteOpts());
  if(!doc) return;
  cevenDescargarYAbrir(doc.output('blob'), cevenComprobanteNombre(filas[0]));
}

/* ── PDF DE COTIZACIONES DEL HISTORIAL, TILDADAS ──────────────────────────── */
// Botón "PDF seleccionadas" de la barra: un archivo con una página por cotización.
function exportSelectedPDF(){
  var keys = Object.keys(histSel);
  if(!keys.length) return;
  if(!_legaPdfListo()) return;

  var doc = null, primera = null;
  keys.forEach(function(qn){
    var filas = _legaPdfFilas(qn);
    if(!filas.length) return;
    if(!primera) primera = filas[0];
    var opts = _legaComprobanteOpts();
    opts.doc = doc || undefined;
    doc = cevenComprobanteDoc(qn, filas, null, opts);
  });
  if(!doc){ showToast('No se encontró ninguna cotización.'); return; }

  var fname = keys.length === 1 ? 'Cotizacion_' + keys[0] : 'Cotizaciones_' + keys.join('-');
  cevenDescargarYAbrir(doc.output('blob'), fname + '.pdf');
}
