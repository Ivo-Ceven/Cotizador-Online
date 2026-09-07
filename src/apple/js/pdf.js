/* ============================================================
   PDF · Apple
   ------------------------------------------------------------
   El MISMO documento que ya da el botón 🧾 del historial/pipeline
   (shared/comprobante.js: jsPDF + autotable, serif azul marino,
   nítido y con texto seleccionable) — nada de html2canvas. Antes
   este archivo armaba su propio HTML y lo rasterizaba: dos
   caminos que terminaban dando dos documentos distintos para la
   misma cotización.

   Un solo lugar arma los `opts` de la marca y los usan los TRES
   puntos de entrada, así los tres dan exactamente el mismo documento:
     buildPDF()          · la cotización en vivo → PDF (se guarda y se relee)
     exportSelectedPDF() · las tildadas del historial → un PDF, una página c/u
     cevenImprimirComprobante(qn, _appleComprobanteOpts()) · el 🧾 de cada
                            tarjeta (history.js / pipeline-view.js)

   Lo propio de Apple, todo dentro de _appleComprobanteOpts() (ver
   shared/comprobante.js para lo que hace cada clave):
     · extraCol   columna "Disponibilidad" (lo que tipea el vendedor por línea).
     · familyOf   agrupa por familia (MacBook Pro, iPhone…) con un separador,
                  igual que la vista en pantalla.
     · warrantyOf saca las garantías CevenCare (Tipo==='garantia') de la tabla
                  de productos: van en su propia tabla con su propio total —
                  la Descripción ya trae el canal y los años ("MacBook Pro —
                  Complete Care (3 años)", ver doSave() en quotes-db.js), así
                  que no hace falta una columna aparte para eso.

   Como el documento sale de las filas YA GUARDADAS en `cquotes` (siempre en
   USD — ver shared/pdf-core.js), el PDF de la cotización en vivo también sale
   siempre en dólares, aunque la pantalla esté mostrando ARS. Mismo criterio
   que ya aceptó Multi al migrar (src/multi/js/pdf.js).

   Depende de: shared/comprobante.js (cevenComprobanteDoc, cevenComprobanteNombre),
   shared/pdf-core.js (cevenDescargarYAbrir), js/quotes-db.js (doSave/getDB),
   js/catalog.js (FAMILY_ORDER/getProductFamily).
   ============================================================ */

/* jsPDF + autotable tienen que estar cargados. */
function _applePdfListo(){
  var PDF = (window.jspdf && window.jspdf.jsPDF) || window.jsPDF || (window.jspdf && window.jspdf.default);
  if(!PDF){ showToast('Error: jsPDF no cargó. Verificá tu conexión a internet.'); return false; }
  if(!PDF.API || typeof PDF.API.autoTable !== 'function'){
    showToast('Error: el plugin autotable de jsPDF no cargó.'); return false;
  }
  return true;
}

/* Filas de `cquotes` sin las corruptas — mismo filtro que cevenComprobanteFilas(),
   más las filas meta_* (overrides de % Nac, sin SKU/Descripción: ya las saca
   ese mismo filtro por no tener esos dos campos). */
function _applePdfFilas(qn){
  return getDB().filter(function(r){
    return String(r['N° Cotización']) === String(qn)
      && r['SKU'] && r['SKU'] !== 'undefined'
      && r['Descripción'] && r['Descripción'] !== 'undefined';
  });
}

/* getProductFamily() (catalog.js) trabaja sobre un ítem EN PANTALLA
   (it.description/it.lob/it.modelCol); acá se arma desde una fila YA GUARDADA
   de cquotes, que no tiene modelCol. La descripción + el LOB alcanzan para
   todos los patrones reales (macbook, imac, iphone, ipad, watch, airpod). */
function _appleFamiliaDeFila(r){
  return getProductFamily({ description: r['Descripción'], lob: r['_lob'] || '', modelCol: '' });
}

/* Objeto NUEVO en cada llamado — cevenComprobanteDoc() le cuelga `.doc` cuando
   encadena varias páginas y no puede ser compartido. */
function _appleComprobanteOpts(){
  return {
    extraCol: { header: 'Disponibilidad', get: function(r){ return r['Disponibilidad'] || '—'; }, width: 24 },
    familyOf: _appleFamiliaDeFila,
    familyOrder: FAMILY_ORDER,
    warrantyOf: function(r){ return r['Tipo'] === 'garantia'; },
    warrantySectionTitle: '🛡 Garantías Extendidas — CevenCare',
    warrantySectionSub: 'Las garantías a continuación son opcionales y se presentan separadas de la cotización principal.'
  };
}

/* ── PDF DE LA COTIZACIÓN EN VIVO ─────────────────────────────────────────── */
function buildPDF(){
  if(!items.length && !warrantyItems.length){ showToast('La cotización está vacía.'); return; }
  if(!_applePdfListo()) return;

  // Se guarda y se relee: el PDF sale de las MISMAS filas de `cquotes` que el
  // del historial, así que hay un solo camino que mantener.
  if(!doSave(true)){ showToast('No se pudo guardar la cotización para exportarla.'); return; }
  var qn = cevenQNumFmt(qNum);
  var filas = _applePdfFilas(qn);
  if(!filas.length){ showToast('La cotización está vacía.'); return; }

  var doc = cevenComprobanteDoc(qn, filas, null, _appleComprobanteOpts());
  if(!doc) return;
  cevenDescargarYAbrir(doc.output('blob'), cevenComprobanteNombre(filas[0]));
}

/* ── PDF DE COTIZACIONES DEL HISTORIAL, TILDADAS ──────────────────────────── */
// Botón "PDF seleccionadas" de la barra: un archivo con una página por cotización.
function exportSelectedPDF(){
  var keys = Object.keys(histSel);
  if(!keys.length) return;
  if(!_applePdfListo()) return;

  var doc = null, primera = null;
  keys.forEach(function(qn){
    var filas = _applePdfFilas(qn);
    if(!filas.length) return;
    if(!primera) primera = filas[0];
    var opts = _appleComprobanteOpts();
    opts.doc = doc || undefined;
    doc = cevenComprobanteDoc(qn, filas, null, opts);
  });
  if(!doc){ showToast('No se encontró ninguna cotización.'); return; }

  var fname = keys.length === 1 ? 'Cotizacion_' + keys[0] : 'Cotizaciones_' + keys.join('-');
  cevenDescargarYAbrir(doc.output('blob'), fname + '.pdf');
}
