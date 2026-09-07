/* ============================================================================
   COMPROBANTE  ·  documento por cotización
   ----------------------------------------------------------------------------
   Un botón en cada tarjeta del historial genera este documento, lo DESCARGA y
   lo abre en otra pestaña. El diseño replica el recibo modelo que trajo el
   equipo (serif azul marino, filete bajo el emisor, caja de N° + Fecha, tabla
   con cabecera navy y fila TOTAL destacada).

   ── POR QUÉ jsPDF Y NO html2canvas ────────────────────────────────────────
   El PDF de la cotización (shared/pdf-core.js) pasa por html2canvas: rasteriza
   la pantalla y la mete en un jsPDF. Sirve ahí porque tiene que reproducir una
   vista compleja, pero el resultado es una IMAGEN — el texto no se puede
   seleccionar ni buscar, y en impresora se ve blando.

   Este documento es texto y una tabla, así que se dibuja con jsPDF + autotable:
   sale nítido a cualquier tamaño, el texto se selecciona y busca, y el archivo
   pesa una fracción de lo que pesaría la captura.

   ── POR QUÉ YA NO ES UNA VENTANA QUE SE IMPRIME ───────────────────────────
   Hasta el 06/08/2026 esto armaba un HTML, lo escribía en una ventana nueva y
   disparaba window.print(): el usuario tenía que elegir "Guardar como PDF" en
   el diálogo para quedarse con el archivo. Ahora el archivo se descarga solo y
   se abre; imprimir sigue estando, en el visor de PDF del navegador.

   Efecto lateral bueno: todo el armado es SÍNCRONO (no hay html2canvas de por
   medio), así que el window.open cae dentro del gesto del click y el navegador
   no lo bloquea. Ver cevenDescargarYAbrir() en shared/pdf-core.js.

   Otro efecto: acá ya no se escapa nada. El escapado con cevenEsc() estaba
   porque el documento era HTML inyectado en otra ventana — un SKU con
   `<img onerror=…>` corría. Un PDF no tiene ese sink.

   ── NO ES UNA FACTURA ─────────────────────────────────────────────────────
   El título dice COTIZACIÓN (antes decía COMPROBANTE) y eso NO es cosmético:
   una factura argentina necesita CAE de AFIP, punto de venta y tipo (A/B/C).
   Nada de eso sale de una cotización, y un papel que diga "FACTURA" sin CAE no
   es válido. Si algún día se emite de verdad, es integrar la API de AFIP, no
   cambiarle el título a este archivo.

   Por la misma razón el documento no lleva renglón de CUIT/DNI del cliente:
   ese dato es de un comprobante fiscal, no de una propuesta.

   El archivo se llama "<cliente> - <proyecto> - Ceven - <validez>.pdf", igual
   que el PDF de la cotización (ver cevenNombreDocumento en shared/pdf-core.js).

   Lo comparten las dos marcas: usa solo campos que existen en las dos
   (`cquotes` con Cliente / Ejecutivo / Fecha / SKU / Descripción / Cantidad /
   IVA / P. Venta Unitario / Total), así que acá no hay ningún `if` por marca.

   Depende de: vendor/jspdf + vendor/jspdf.plugin.autotable, shared/pdf-core.js
   (cevenCondiciones, cevenDescargarYAbrir), shared/ui-core.js (fD),
   shared/config.js (CEVEN_EMISOR), notify.js (showToast) y el getDB() de la marca.
   ============================================================================ */

/* Paleta del modelo: el azul de Word "Azul oscuro, Texto 2, Oscuro 25%" (#1f3864)
   y su relleno claro para las filas, en RGB porque jsPDF no toma hex. */
var CEVEN_COMP_NAVY  = [31, 56, 100];
var CEVEN_COMP_TINT  = [238, 242, 249];
var CEVEN_COMP_GRIS  = [51, 51, 51];
var CEVEN_COMP_LINEA = [153, 153, 153];

/* Entrega inmediata. Es el mismo par de verdes que usa el PDF de la cotización
   (`.cd-ok` en shared/pdf-core.js): el documento cambia, el código de color no. */
var CEVEN_COMP_VERDE    = [15, 122, 53];
var CEVEN_COMP_VERDE_BG = [230, 246, 236];

/* Márgenes y ancho útil de la hoja A4 vertical, en mm. */
var CEVEN_COMP_M  = 16;
var CEVEN_COMP_W  = 210;
var CEVEN_COMP_H  = 297;
var CEVEN_COMP_AU = CEVEN_COMP_W - CEVEN_COMP_M * 2;   // ancho útil: 178 mm

/* El wordmark de Ceven, precargado a dataURL apenas carga la página.
   jsPDF necesita los bytes de la imagen en el momento de dibujar, y bajarla
   recién al hacer click volvería asíncrono todo el armado — que es justamente
   lo que mantiene al window.open dentro del gesto del usuario.

   Si no llegó a cargar (o el archivo no está), el documento sale sin logo y con
   la razón social como única identificación: nunca con un ícono roto. */
var _cevenCompLogo = null;

function cevenComprobanteLogoURL(){
  try{ return new URL('../icons/ceven.png', location.href).href; }
  catch(e){ return ''; }
}

(function(){
  if(typeof document === 'undefined' || typeof Image === 'undefined') return;
  var url = cevenComprobanteLogoURL();
  if(!url) return;
  var img = new Image();
  img.onload = function(){
    try{
      var c = document.createElement('canvas');
      c.width  = img.naturalWidth;
      c.height = img.naturalHeight;
      c.getContext('2d').drawImage(img, 0, 0);
      _cevenCompLogo = { data: c.toDataURL('image/png'), w: img.naturalWidth, h: img.naturalHeight };
    }catch(e){ /* canvas no disponible: se sigue sin logo */ }
  };
  img.src = url;
})();

/* Filas de una cotización del historial. getDB() lo define cada marca. */
function cevenComprobanteFilas(qn){
  if(typeof getDB !== 'function') return [];
  return getDB().filter(function(r){
    return String(r['N° Cotización']) === String(qn)
        && r['SKU'] && r['SKU'] !== 'undefined'
        && r['Descripción'] && r['Descripción'] !== 'undefined';
  });
}

/* El IVA de una línea. Las dos marcas lo guardan hoy en la columna `IVA`;
   `_taxes` es donde lo escribía Apple antes de que fuera una columna visible y
   sigue estando en las cotizaciones ya guardadas. */
function cevenComprobanteIVA(r){
  var v = r['IVA'];
  if(v === undefined || v === null || v === '') v = r['_taxes'];
  return cevenFormatoIVA(v) || '—';
}

/* ── CARACTERES QUE LAS FUENTES ESTÁNDAR NO TIENEN ──────────────────────────
   jsPDF dibuja con las 14 fuentes base del PDF, que codifican WinAnsi. Los
   caracteres del bloque 0x80–0x9F de CP1252 (– — “ ” … •) NO se dibujan: se
   pierden sin ningún aviso. Se vio con la condición de pago, que salía
   "30 días FF  TC Dólar billete BNA…" — con el guión comido y dos espacios.

   Se normaliza TODO lo que se dibuja y no solo los textos fijos: las
   descripciones vienen de un Excel del ERP y pueden traer cualquier cosa.
   Lo que no entra en Latin-1 (emojis, alfabetos no latinos) se descarta: mejor
   que salga sin ese carácter y no un cuadradito o un corrimiento.

   Los acentos, la ñ, el «°» y el «·» SÍ están en Latin-1 y salen bien. */
var CEVEN_COMP_MAP = {
  '–': '-',  '—': '-',  '‘': "'", '’': "'",
  '“': '"',  '”': '"',  '…': '...', '•': '*',
  '→': '->', ' ': ' ',  '‹': '<', '›': '>',
  '€': 'EUR', '™': '(TM)'
};

function cevenCompSan(txt){
  var s = String(txt == null ? '' : txt), out = '';
  for(var i = 0; i < s.length; i++){
    var c = s.charAt(i);
    if(CEVEN_COMP_MAP[c] !== undefined){ out += CEVEN_COMP_MAP[c]; continue; }
    if(s.charCodeAt(i) <= 0xFF) out += c;
  }
  return out;
}

function _compTxt(doc, txt, x, y, opts){
  var t = (Object.prototype.toString.call(txt) === '[object Array]')
    ? txt.map(cevenCompSan)
    : cevenCompSan(txt);
  doc.text(t, x, y, opts || undefined);
}

/* Deja lugar para `alto` mm: si no entra en la hoja, abre una nueva y devuelve
   la `y` de arriba. Lo que va después de la tabla (condiciones, observaciones,
   pie) es corto pero no cabe siempre — depende de cuántas líneas tenga el detalle. */
function _compEspacio(doc, y, alto){
  if(y + alto <= CEVEN_COMP_H - CEVEN_COMP_M) return y;
  doc.addPage();
  return CEVEN_COMP_M;
}

/* Estilos de columna de la tabla del detalle. Un solo lugar los define: los usan
   la tabla completa y la barra de TOTAL GENERAL del multimarca, y tienen que
   coincidir al milímetro o el "USD …" de la barra no cae debajo de la columna. */
var CEVEN_COMP_COLS = {
  0: { cellWidth: 30 },
  2: { cellWidth: 17, halign: 'center' },
  3: { cellWidth: 29, halign: 'right' },
  4: { cellWidth: 29, halign: 'right' },
  5: { cellWidth: 16, halign: 'center' }
};

// El pie navy es sólo "TOTAL" + importe (columnas 3 y 4, SIEMPRE esas dos: el
// footLabel/total se arman así más abajo pase lo que pase con las demás
// columnas). Las otras van en blanco, o la barra terminaría en un bloque de
// color sin nada adentro.
function _compPieBlanco(data){
  if(data.section === 'foot' && data.column.index !== 3 && data.column.index !== 4){
    data.cell.styles.fillColor = [255, 255, 255];
    data.cell.styles.lineColor = [255, 255, 255];
  }
}

/* Ancho/alineación de la columna opcional (7ma) que algunas marcas agregan:
   Nota/Disponibilidad en Poly/Legamaster/Apple. Sin `opts.extraCol` la tabla
   sale exactamente igual que siempre (6 columnas). */
function _compColsConExtra(extraCol){
  if(!extraCol) return CEVEN_COMP_COLS;
  var c = {};
  for(var k in CEVEN_COMP_COLS) c[k] = CEVEN_COMP_COLS[k];
  c[6] = { cellWidth: extraCol.width || 24, halign: extraCol.halign || 'center' };
  return c;
}

/* La tabla del detalle: cabecera navy, filas con el IVA al final y la barra de
   TOTAL abajo. Es el "cuadro" del modelo. Devuelve {total, finalY}.

   Extraída para que el multimarca pueda dibujar UN cuadro por marca sin
   duplicar ni un color: el comprobante de una sola marca la llama una vez por
   opción, exactamente igual que antes.

   `opts` (todos opcionales, sin ellos sale la tabla de siempre):
     · extraCol    {header, get(r), width?} — 7ma columna (Nota/Disponibilidad).
     · familyOf    r -> nombre de familia; agrupa las filas con un separador
                   entre grupos (como la vista en pantalla de Apple). Con un
                   solo grupo no se dibuja separador.
     · familyOrder orden preferido de las familias (las que no están al final).
     · sectionTitle/sectionSub  título (y subtítulo) arriba de la tabla, para
                   una sección aparte dentro del mismo documento (las
                   garantías CevenCare de Apple). */
function _compTablaDetalle(doc, filasGrupo, startY, footLabel, opts){
  opts = opts || {};
  var y = startY;

  if(opts.sectionTitle){
    y = _compEspacio(doc, y + 4, 20);
    doc.setFont('times', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(CEVEN_COMP_NAVY[0], CEVEN_COMP_NAVY[1], CEVEN_COMP_NAVY[2]);
    _compTxt(doc, opts.sectionTitle, CEVEN_COMP_M, y);
    y += 4.5;
    if(opts.sectionSub){
      doc.setFont('times', 'italic');
      doc.setFontSize(8.5);
      doc.setTextColor(CEVEN_COMP_GRIS[0], CEVEN_COMP_GRIS[1], CEVEN_COMP_GRIS[2]);
      var subLineas = doc.splitTextToSize(cevenCompSan(opts.sectionSub), CEVEN_COMP_AU);
      _compTxt(doc, subLineas, CEVEN_COMP_M, y);
      y += subLineas.length * 4 + 2;
    }
    doc.setTextColor(0, 0, 0);
  }

  var head = ['SKU', 'Descripción', 'Cantidad', 'Precio unitario', 'Subtotal', 'IVA'];
  if(opts.extraCol) head.push(opts.extraCol.header);

  var total = 0;
  var cuerpo = [];
  function _fila(r){
    var qty  = parseFloat(r['Cantidad']) || 0;
    var unit = parseFloat(r['P. Venta Unitario']) || 0;
    var sub  = parseFloat(r['Total']) || 0;
    total += sub;
    /* El IVA va ÚLTIMO, después del subtotal: es informativo y no tiene por qué
       separar la cantidad del precio, que es lo que se lee junto. */
    var fila = [
      cevenCompSan(r['SKU'] || ''),
      cevenCompSan(r['Descripción'] || ''),
      String(qty),
      'USD ' + fD(unit),
      'USD ' + fD(sub),
      cevenCompSan(cevenComprobanteIVA(r))
    ];
    if(opts.extraCol) fila.push(cevenCompSan(opts.extraCol.get(r) || '—'));
    cuerpo.push(fila);
  }

  if(typeof opts.familyOf === 'function'){
    var orden = opts.familyOrder || [];
    var grupos = {}, claves = [];
    filasGrupo.forEach(function(r){
      var f = opts.familyOf(r) || '';
      if(!grupos[f]){ grupos[f] = []; claves.push(f); }
      grupos[f].push(r);
    });
    var usadas = orden.filter(function(f){ return grupos[f]; });
    for(var f in grupos){ if(usadas.indexOf(f) < 0) usadas.push(f); }
    var mostrarSep = usadas.length > 1;
    usadas.forEach(function(fam){
      if(mostrarSep){
        cuerpo.push([{
          content: cevenCompSan(fam), colSpan: head.length,
          styles: { fillColor: [240, 240, 243], textColor: [58, 58, 60], fontStyle: 'bold', fontSize: 8 }
        }]);
      }
      grupos[fam].forEach(_fila);
    });
  } else {
    filasGrupo.forEach(_fila);
  }

  var pie = new Array(head.length).fill('');
  pie[3] = footLabel;
  pie[4] = 'USD ' + fD(total);

  doc.autoTable({
    startY: y,
    head: [head],
    body: cuerpo,
    foot: [pie],
    margin: { left: CEVEN_COMP_M, right: CEVEN_COMP_M },
    styles: { font: 'times', fontSize: 9.5, cellPadding: 2, lineColor: [183, 196, 221], lineWidth: 0.1 },
    headStyles: {
      font: 'times', fontStyle: 'bold', fontSize: 9.5,
      fillColor: CEVEN_COMP_NAVY, textColor: [255, 255, 255], lineColor: CEVEN_COMP_NAVY
    },
    footStyles: {
      font: 'times', fontStyle: 'bold', fontSize: 10.5,
      fillColor: CEVEN_COMP_NAVY, textColor: [255, 255, 255], lineColor: CEVEN_COMP_NAVY,
      halign: 'right'
    },
    alternateRowStyles: { fillColor: CEVEN_COMP_TINT },
    columnStyles: _compColsConExtra(opts.extraCol),
    didParseCell: _compPieBlanco
  });

  return { total: total, finalY: doc.lastAutoTable.finalY };
}

/* Sólo la barra navy de TOTAL, sin filas. Es el "TOTAL GENERAL" del multimarca,
   debajo de los cuadros de cada marca. Devuelve la y de abajo. */
function _compBarraTotal(doc, startY, label, total){
  doc.autoTable({
    startY: startY,
    body: [],
    foot: [['', '', '', label, 'USD ' + fD(total), '']],
    margin: { left: CEVEN_COMP_M, right: CEVEN_COMP_M },
    styles: { font: 'times', fontSize: 9.5, cellPadding: 2, lineColor: [255, 255, 255], lineWidth: 0.1 },
    footStyles: {
      font: 'times', fontStyle: 'bold', fontSize: 10.5,
      fillColor: CEVEN_COMP_NAVY, textColor: [255, 255, 255], lineColor: CEVEN_COMP_NAVY,
      halign: 'right'
    },
    columnStyles: CEVEN_COMP_COLS,
    didParseCell: _compPieBlanco
  });
  return doc.lastAutoTable.finalY;
}

/* Arma el documento. Separado del botón para poder generarlo sin DOM ni
   navegador — lo usa scripts/check-comprobante.js.

   `opts` es opcional. Lo usa el multimarca (src/multi/js/pdf.js):
     · numeroLabel   rótulo del N° en la caja ('Cotización N°: ' por defecto)
     · grupoDeFila   fila -> clave de grupo; activa "un cuadro por marca"
     · grupoLabel    clave -> texto del rótulo del cuadro
     · doc           jsPDF ya empezado: se le agrega una página en vez de crear
                     uno nuevo (para meter varios pedidos en un archivo)

   Y lo usan Poly/Legamaster/Apple (cada uno arma el suyo una sola vez, en su
   propio pdf.js, y lo pasa TANTO a buildPDF() como al botón 🧾 del historial
   — mismo documento en los dos lugares):
     · extraCol      {header, get(r), width?} — 7ma columna (Nota en Poly y
                     Legamaster, Disponibilidad en Apple).
     · familyOf      fila -> familia de producto (Apple: agrupa MacBook Pro,
                     iPhone... con un separador, como en pantalla).
     · familyOrder   orden preferido de esas familias.
     · warrantyOf    fila -> true si es una garantía CevenCare (Apple): esas
                     filas se sacan de la tabla de productos y salen en su
                     propia tabla, con su propio total — igual que en pantalla,
                     para no mezclar un total que nunca se factura junto.
     · warrantySectionTitle/warrantySectionSub  título y bajada de esa tabla.
   Sin `opts`, el documento sale exactamente igual que antes. */
function cevenComprobanteDoc(qn, filas, emisor, opts){
  var PDF = (window.jspdf && window.jspdf.jsPDF) || window.jsPDF || (window.jspdf && window.jspdf.default);
  if(!PDF) return null;

  opts   = opts || {};
  emisor = emisor || window.CEVEN_EMISOR || {};
  var p   = filas[0];
  var doc = opts.doc || new PDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  if(opts.doc) doc.addPage();
  var M   = CEVEN_COMP_M;
  var y   = 18;

  /* ── EMISOR ──────────────────────────────────────────────────────────────
     El logo va a 11 mm de alto al lado de la razón social, que NO se agranda
     como en el modelo justamente por eso: el modelo no tenía logo y el nombre
     hacía de marca; repetir "ceven" en cuerpo grande al lado del mismo
     wordmark quedaba redundante. */
  var xTexto = M;
  if(_cevenCompLogo){
    var hLogo = 11;
    var wLogo = hLogo * (_cevenCompLogo.w / _cevenCompLogo.h);
    try{
      doc.addImage(_cevenCompLogo.data, 'PNG', M, y - 3, wLogo, hLogo);
      xTexto = M + wLogo + 6;
    }catch(e){ /* imagen inválida: el documento sale sin ella */ }
  }

  doc.setFont('times', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(CEVEN_COMP_NAVY[0], CEVEN_COMP_NAVY[1], CEVEN_COMP_NAVY[2]);
  _compTxt(doc, emisor.razonSocial || 'Ceven', xTexto, y + 2);
  y += 6;

  /* Los campos vacíos no se imprimen: un rótulo suelto ("Contacto:" sin nada al
     lado) queda peor que no estar. */
  doc.setFont('times', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(CEVEN_COMP_GRIS[0], CEVEN_COMP_GRIS[1], CEVEN_COMP_GRIS[2]);
  [['Domicilio', emisor.domicilio], ['Contacto', emisor.contacto], ['CUIT', emisor.cuit]]
    .forEach(function(par){
      var v = String(par[1] == null ? '' : par[1]).trim();
      if(!v) return;
      _compTxt(doc, par[0] + ': ' + v, xTexto, y);
      y += 4.4;
    });

  y = Math.max(y, 18 + 11) + 2;
  doc.setDrawColor(CEVEN_COMP_NAVY[0], CEVEN_COMP_NAVY[1], CEVEN_COMP_NAVY[2]);
  doc.setLineWidth(0.8);
  doc.line(M, y, CEVEN_COMP_W - M, y);
  y += 10;

  /* ── TÍTULO ─────────────────────────────────────────────────────────────── */
  doc.setFont('times', 'bold');
  doc.setFontSize(20);
  doc.setTextColor(CEVEN_COMP_NAVY[0], CEVEN_COMP_NAVY[1], CEVEN_COMP_NAVY[2]);
  _compTxt(doc, 'COTIZACIÓN', M, y);
  y += 7;

  /* ── CAJA DE ENCABEZADO ───────────────────────────────────────────────────
     Una sola tabla con el número de cotización Y los datos del cliente.

     Hasta 08/2026 eran dos bloques separados: esta caja (N° | Fecha |
     Ejecutivo) y, más abajo, una sección "Datos del cliente" con el nombre en
     cuerpo 16 y el proyecto debajo. Separados, los cinco datos que identifican
     el documento se leían en dos lugares distintos, y el nombre suelto en
     cuerpo grande competía con el título COTIZACIÓN. Juntos son lo que son: el
     encabezado del documento.

     (Lo que NO volvió es el renglón "CUIT / DNI" en blanco que había acá: ese
     dato es de un comprobante fiscal, y esto no lo es — ver el encabezado.)

     Las filas se miden ANTES de dibujar. Un cliente o un proyecto largo se
     parte en varios renglones y la fila crece con él: recortar al ancho de la
     caja dejaría afuera parte de un dato que identifica el trabajo. */
  var wCelda = CEVEN_COMP_AU / 3;
  var xVal   = M + 3;

  doc.setFont('times', 'bold');
  doc.setFontSize(10.5);
  var wLblCli = doc.getTextWidth('Cliente: ');
  var wLblPro = doc.getTextWidth('Proyecto: ');

  // splitTextToSize mide con la fuente ACTIVA: cada uno se parte con la misma
  // con la que después se dibuja, o el corte queda en el lugar equivocado.
  doc.setFontSize(13);
  var lineasCli = doc.splitTextToSize(cevenCompSan(String(p['Cliente'] || '—')),
                                      CEVEN_COMP_AU - 6 - wLblCli);

  /* En Poly el proyecto (cliente final) es lo que identifica al trabajo, con el
     OPG como respaldo; en Apple hay Proyecto pero no OPG. Se leen los dos sin
     preguntar por la marca — el que no aplica viene undefined. Si no hay
     ninguno, la fila no se dibuja: un rótulo con un guión al lado no aporta. */
  var proyecto = String(p['Proyecto'] || p['OPG'] || '').trim();
  if(proyecto === '—') proyecto = '';
  doc.setFont('times', 'normal');
  doc.setFontSize(11);
  var lineasPro = proyecto
    ? doc.splitTextToSize(cevenCompSan(proyecto), CEVEN_COMP_AU - 6 - wLblPro)
    : [];

  var hF1 = 8;
  var hF2 = 3.5 + lineasCli.length * 5.6;
  var hF3 = lineasPro.length ? 3 + lineasPro.length * 5 : 0;

  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.2);
  doc.rect(M, y, CEVEN_COMP_AU, hF1 + hF2 + hF3);
  doc.line(M + wCelda,     y, M + wCelda,     y + hF1);   // divisiones de la fila 1
  doc.line(M + wCelda * 2, y, M + wCelda * 2, y + hF1);
  doc.line(M, y + hF1, CEVEN_COMP_W - M, y + hF1);        // fila 1 / cliente
  if(hF3) doc.line(M, y + hF1 + hF2, CEVEN_COMP_W - M, y + hF1 + hF2);

  /* Fila 1. Los anchos se miden con la fuente EN NEGRITA, que es con la que se
     dibuja el rótulo. Medirlos después del setFont('normal') dejaba el valor
     pegado al rótulo ("Fecha:06/08/2026"), porque la negrita es más ancha. */
  doc.setFontSize(10.5);
  doc.setTextColor(0, 0, 0);
  doc.setFont('times', 'bold');
  var celdas = [
    [opts.numeroLabel || 'Cotización N°: ', String(qn || ''),   M + 3],
    ['Fecha: ',         String(p['Fecha'] || '—'),      M + wCelda + 3],
    ['Ejecutivo: ',     String(p['Ejecutivo'] || '—'),  M + wCelda * 2 + 3]
  ];
  var anchos = celdas.map(function(c){ return doc.getTextWidth(c[0]); });
  celdas.forEach(function(c){ _compTxt(doc, c[0].trim(), c[2], y + 5.4); });
  doc.setFont('times', 'normal');
  celdas.forEach(function(c, i){ _compTxt(doc, c[1], c[2] + anchos[i], y + 5.4); });

  /* Fila 2: el cliente. Rótulo chico en navy y el nombre en cuerpo grande — es
     lo que se busca de un vistazo, junto con el número de arriba. */
  var yCli = y + hF1 + 6;
  doc.setFont('times', 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(CEVEN_COMP_NAVY[0], CEVEN_COMP_NAVY[1], CEVEN_COMP_NAVY[2]);
  _compTxt(doc, 'Cliente:', xVal, yCli);
  doc.setFontSize(13);
  doc.setTextColor(0, 0, 0);
  _compTxt(doc, lineasCli, xVal + wLblCli, yCli);

  // Fila 3: el proyecto, solo si hay.
  if(hF3){
    var yPro = y + hF1 + hF2 + 5;
    doc.setFont('times', 'bold');
    doc.setFontSize(10.5);
    doc.setTextColor(CEVEN_COMP_NAVY[0], CEVEN_COMP_NAVY[1], CEVEN_COMP_NAVY[2]);
    _compTxt(doc, 'Proyecto:', xVal, yPro);
    doc.setFont('times', 'normal');
    doc.setFontSize(11);
    doc.setTextColor(CEVEN_COMP_GRIS[0], CEVEN_COMP_GRIS[1], CEVEN_COMP_GRIS[2]);
    _compTxt(doc, lineasPro, xVal + wLblPro, yPro);
  }

  y += hF1 + hF2 + hF3 + 9;

  /* ── DETALLE ────────────────────────────────────────────────────────────── */
  doc.setFont('times', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(CEVEN_COMP_NAVY[0], CEVEN_COMP_NAVY[1], CEVEN_COMP_NAVY[2]);
  _compTxt(doc, 'Detalle', M, y);
  y += 3;

  /* Una cotización puede llevar dos opciones alternativas (shared/opciones.js).
     Va una tabla por opción, cada una con su TOTAL, y arriba el aviso de que son
     excluyentes: sin él, el cliente puede leer las dos como dos partes de la
     misma compra y sumar los totales. Con una sola opción —el caso normal y todo
     lo guardado hasta 08/2026— sale exactamente el mismo documento de siempre. */
  var opcs = [1, 2].filter(function(n){
    return filas.some(function(r){ return cevenOpcDe(r) === n; });
  });
  var hayOpcB = opcs.length > 1;

  if(hayOpcB){
    doc.setFont('times', 'italic');
    doc.setFontSize(9.5);
    doc.setTextColor(CEVEN_COMP_GRIS[0], CEVEN_COMP_GRIS[1], CEVEN_COMP_GRIS[2]);
    _compTxt(doc, cevenOpcLeyenda(), M, y + 3);
    y += 6;
  }

  /* Multimarca: `opts.grupoDeFila` parte el detalle en un cuadro por marca.
     Cada cuadro es la MISMA tabla navy de siempre (_compTablaDetalle); debajo
     de todos va una barra "TOTAL GENERAL". Sin `opts.grupoDeFila` se dibuja una
     sola tabla por opción, exactamente como antes.

     Los importes salen en USD, tal como se guardaron. No se convierten a pesos:
     el TC vive en un input de la pantalla y cambia todos los días, así que
     convertir haría que dos impresiones del mismo documento den totales
     distintos según el día. */
  var agrupar = typeof opts.grupoDeFila === 'function';
  var etiquetaGrupo = (typeof opts.grupoLabel === 'function')
    ? opts.grupoLabel : function(k){ return String(k == null ? '' : k); };

  // Garantías CevenCare (Apple): se separan ANTES de armar la tabla de
  // productos, para que ni la agrupación por familia ni el total de la tabla
  // principal las vean — llevan su propia tabla y su propio total, más abajo.
  var hayGarantias = typeof opts.warrantyOf === 'function';

  opcs.forEach(function(nOpc){
    var deOpc = filas.filter(function(r){ return cevenOpcDe(r) === nOpc; });
    var warrOpc = [];
    if(hayGarantias){
      warrOpc = deOpc.filter(opts.warrantyOf);
      deOpc = deOpc.filter(function(r){ return !opts.warrantyOf(r); });
    }
    if(hayOpcB){
      y = _compEspacio(doc, y + 4, 30);
      doc.setFont('times', 'bold');
      doc.setFontSize(10.5);
      doc.setTextColor(CEVEN_COMP_NAVY[0], CEVEN_COMP_NAVY[1], CEVEN_COMP_NAVY[2]);
      _compTxt(doc, 'Opción ' + cevenOpcLetra(nOpc), M, y);
      y += 2;
    }

    if(!agrupar){
      y = _compTablaDetalle(doc, deOpc, y, hayOpcB ? 'TOTAL ' + cevenOpcLetra(nOpc) : 'TOTAL', {
        extraCol: opts.extraCol,
        familyOf: opts.familyOf,
        familyOrder: opts.familyOrder
      }).finalY;
      if(warrOpc.length){
        y = _compTablaDetalle(doc, warrOpc, y,
          hayOpcB ? 'TOTAL GARANTÍAS ' + cevenOpcLetra(nOpc) : 'TOTAL GARANTÍAS', {
            sectionTitle: opts.warrantySectionTitle || 'Garantías Extendidas',
            sectionSub: opts.warrantySectionSub
          }).finalY;
      }
      return;
    }

    var claves = [], porClave = {};
    deOpc.forEach(function(r){
      var g = opts.grupoDeFila(r);
      if(!porClave[g]){ porClave[g] = []; claves.push(g); }
      porClave[g].push(r);
    });

    var totalGeneral = 0;
    claves.forEach(function(g){
      y = _compEspacio(doc, y + 4, 34);
      /* El nombre de la marca es el rótulo del cuadro, navy y en negrita, igual
         que "Opción A/B". La barra de abajo dice sólo "TOTAL", como el modelo:
         el contexto lo da este rótulo, y "TOTAL LEGAMASTER" no entra en la
         columna sin partirse. */
      doc.setFont('times', 'bold');
      doc.setFontSize(10.5);
      doc.setTextColor(CEVEN_COMP_NAVY[0], CEVEN_COMP_NAVY[1], CEVEN_COMP_NAVY[2]);
      _compTxt(doc, etiquetaGrupo(g), M, y);
      y += 2;
      var res = _compTablaDetalle(doc, porClave[g], y,
        hayOpcB ? 'TOTAL ' + cevenOpcLetra(nOpc) : 'TOTAL');
      totalGeneral += res.total;
      y = res.finalY;
    });

    if(claves.length > 1){
      y = _compEspacio(doc, y + 3, 16);
      y = _compBarraTotal(doc, y, hayOpcB ? 'TOTAL GENERAL ' + cevenOpcLetra(nOpc) : 'TOTAL GENERAL', totalGeneral);
    }
  });

  y += 9;

  /* ── CONDICIONES COMERCIALES ────────────────────────────────────────────────
     Las mismas líneas que imprime el PDF de la cotización, armadas en un solo
     lugar (shared/pdf-core.js) a partir de lo que se guardó con el documento.
     Acá antes había un renglón "Forma de pago: ____" en blanco. */
  var cond = (typeof cevenCondicionesDetalle === 'function') ? cevenCondicionesDetalle(p) : [];
  y = _compEspacio(doc, y, 8 + cond.length * 5.4 + 22);

  doc.setFont('times', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(CEVEN_COMP_NAVY[0], CEVEN_COMP_NAVY[1], CEVEN_COMP_NAVY[2]);
  _compTxt(doc, 'Condiciones Comerciales', M, y);
  y += 5.5;

  doc.setFontSize(10);
  cond.forEach(function(linea){
    y = _compEspacio(doc, y, 6);
    doc.setFont('times', 'bold');
    // splitTextToSize por si una condición escrita a mano no entra en el ancho.
    // Se normaliza ANTES de partir: si no, el ancho se mide con caracteres que
    // después no se dibujan y el corte queda en el lugar equivocado.
    var partes = doc.splitTextToSize(cevenCompSan(linea.texto), CEVEN_COMP_AU);

    /* La entrega inmediata va destacada. El recuadro solo se dibuja cuando la
       línea entró en un renglón: en dos o más habría que pintar un bloque
       irregular detrás del texto, y ahí el color de la letra ya alcanza. */
    if(linea.destacar){
      if(partes.length === 1){
        var wTxt = doc.getTextWidth(partes[0]);
        doc.setFillColor(CEVEN_COMP_VERDE_BG[0], CEVEN_COMP_VERDE_BG[1], CEVEN_COMP_VERDE_BG[2]);
        doc.roundedRect(M - 2, y - 4, wTxt + 6, 6.4, 1.2, 1.2, 'F');
      }
      doc.setTextColor(CEVEN_COMP_VERDE[0], CEVEN_COMP_VERDE[1], CEVEN_COMP_VERDE[2]);
    } else {
      doc.setTextColor(0, 0, 0);
    }

    _compTxt(doc, partes, M, y);
    y += partes.length * 5.4;
  });
  doc.setTextColor(0, 0, 0);
  y += 3;

  /* ── OBSERVACIONES ──────────────────────────────────────────────────────── */
  var obs = String(p['Observaciones'] == null ? '' : p['Observaciones']).trim();
  if(obs && obs !== '—'){
    y = _compEspacio(doc, y, 12);
    doc.setFont('times', 'bold');
    doc.setFontSize(10);
    _compTxt(doc, 'Observaciones:', M, y);
    var wObs = doc.getTextWidth('Observaciones: ');
    doc.setFont('times', 'normal');
    doc.setTextColor(CEVEN_COMP_GRIS[0], CEVEN_COMP_GRIS[1], CEVEN_COMP_GRIS[2]);
    var lineasObs = doc.splitTextToSize(cevenCompSan(obs), CEVEN_COMP_AU - wObs);
    _compTxt(doc, lineasObs, M + wObs, y);
    y += lineasObs.length * 5 + 4;
  }

  /* ── PIE ──────────────────────────────────────────────────────────────────
     Acá decía "Cotización N° X · Ejecutivo: Y". Quedó redundante cuando esos
     dos datos subieron a la caja del encabezado, así que ahora el pie es la
     identificación del emisor y nada más. */
  y = _compEspacio(doc, y, 12);
  doc.setDrawColor(CEVEN_COMP_LINEA[0], CEVEN_COMP_LINEA[1], CEVEN_COMP_LINEA[2]);
  doc.setLineWidth(0.2);
  doc.line(M, y, CEVEN_COMP_W - M, y);
  y += 5;
  doc.setFont('times', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(68, 68, 68);
  _compTxt(doc, String(emisor.razonSocial || 'Ceven'), M, y);

  return doc;
}

/* Nombre del archivo: "<cliente> - <proyecto> - Ceven - <validez>.pdf", igual
   que el PDF de la cotización. Lo arma cevenNombreDocumento() en
   shared/pdf-core.js — acá solo se eligen los campos de la fila guardada. */
function cevenComprobanteNombre(fila){
  fila = fila || {};
  return cevenNombreDocumento(
    fila['Cliente'],
    fila['Proyecto'] || fila['OPG'],
    fila['Propuesta efectiva hasta']
  ) + '.pdf';
}

/* Punto de entrada del botón del historial. `opts` es el mismo que toma
   cevenComprobanteDoc() — cada marca pasa el suyo (extraCol/familyOf/
   warrantyOf) para que ESTE botón y el "📄 PDF" de la cotización en vivo den
   exactamente el mismo documento. Sin `opts` sale el comprobante genérico de
   siempre. */
function cevenImprimirComprobante(qn, opts){
  var filas = cevenComprobanteFilas(qn);
  if(!filas.length){
    if(typeof showToast === 'function') showToast('No se encontraron líneas para la cotización #' + qn + '.');
    return;
  }
  var PDF = (window.jspdf && window.jspdf.jsPDF) || window.jsPDF || (window.jspdf && window.jspdf.default);
  if(!PDF){
    if(typeof showToast === 'function') showToast('Error: jsPDF no cargó. Verificá tu conexión a internet.');
    return;
  }
  if(typeof PDF.API === 'undefined' || typeof PDF.API.autoTable === 'undefined'){
    if(typeof showToast === 'function') showToast('Error: el plugin autotable de jsPDF no cargó.');
    return;
  }
  var doc = cevenComprobanteDoc(qn, filas, null, opts);
  if(!doc) return;
  cevenDescargarYAbrir(doc.output('blob'), cevenComprobanteNombre(filas[0]));
}
