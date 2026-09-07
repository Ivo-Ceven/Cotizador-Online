/* ============================================================
   PDF · NUCLEO COMPARTIDO  ·  todas las marcas
   ------------------------------------------------------------
   El rasterizado a PDF con html2canvas (downloadQuotePDF/
   cevenPdfDocCSS/cevenPdfListCSS) que vivía acá lo usan HOY solo
   src/portal/js/pdf.js (el documento de reventa que el cliente-
   canal le manda a SU cliente) y exportSelectedPDF() de Poly/
   Apple/Legamaster desde el 07/09/2026 en adelante ya NO — ver
   docs/HISTORIAL.md, entrada "Todos los PDF con el mismo motor":
   el botón "📄 PDF" de la cotización en vivo y el "PDF
   seleccionadas" del historial pasaron al motor de
   shared/comprobante.js (jsPDF + autotable, nítido, sin rasterizar),
   igual que ya hacía Multi. La rasterización queda para el portal
   porque ahí el documento SIGUE siendo HTML armado con strings
   (dos logos superpuestos, precios de reventa) y no vale la pena
   reescribirlo con autotable para un solo lugar.

   Lo que SIGUE viviendo acá y usan TODOS los caminos (el rasterizado
   del portal Y el vectorial de comprobante.js): las condiciones
   comerciales (cevenCondiciones*), el nombre de archivo
   (cevenNombreDocumento) y descargar-y-abrir (cevenDescargarYAbrir).

   Depende de: vendor/html2canvas + vendor/jspdf, notify.js
   (showToast). Se carga ANTES de <marca>/js/pdf.js. shared/
   comprobante.js también depende de las funciones de acá (las
   condiciones comerciales, cevenNombreDocumento, cevenDescargarYAbrir),
   pero se carga ANTES que este archivo — no importa: son llamadas
   a función, no lecturas al cargar, así que el orden entre los dos
   no rompe nada.
   ============================================================ */

/* ── CONDICIONES COMERCIALES ────────────────────────────────────────────────
   Las lineas del bloque "Condiciones Comerciales", en el orden en que salen
   impresas. Un solo lugar las arma y las usan los CUATRO documentos que las
   muestran: el PDF de la cotizacion activa, el PDF del historial (una marca
   por vez), el comprobante y cualquiera que venga despues.

   Antes vivia copiado en los dos pdf.js, con cuatro copias que ya se habian
   despegado entre si:
     · el comprobante no tenia el bloque (solo un renglon "Forma de pago:" en
       blanco para completar a mano);
     · el PDF del historial omitia el bloque ENTERO cuando no habia fecha,
       condicion de pago ni entrega — incluidas las lineas fijas, que son
       ciertas siempre;
     · en Poly el bloque no salia nunca desde el historial, porque doSave() no
       guardaba esos tres campos (ver poly/js/quotes-db.js).

   `row` es una fila de `cquotes` (documento ya guardado) o null/undefined para
   leer los campos de la pantalla de cotizacion. Las lineas que dependen de un
   dato salen con "—" si no lo hay, en vez de desaparecer: un bloque que cambia
   de tamano segun lo que se cargo se lee como si faltara algo.

   Lo propio de cada marca va en `CEVEN_BRAND.condicionesFijas` — nunca un `if`
   por marca aca adentro. */
/* Devuelve las lineas con su formato: `{texto, destacar}`. `destacar` marca la
   entrega inmediata, que los documentos imprimen en verde (ver mas abajo).

   Existe aparte de cevenCondiciones() porque esa devuelve strings pelados y hay
   codigo que depende de eso (scripts/check-comprobante.js compara linea por
   linea). Los renderers que saben pintar usan esta; el resto sigue igual. */
function cevenCondicionesDetalle(row){
  var dato = function(clave, campoId){
    if(row){
      var v = row[clave];
      return (v === undefined || v === null || v === '—') ? '' : String(v).trim();
    }
    var el = (typeof document !== 'undefined') ? document.getElementById(campoId) : null;
    return el ? String(el.value || '').trim() : '';
  };

  var eff = dato('Propuesta efectiva hasta', 'eff-date');
  /* La entrega de la PANTALLA no se puede leer del `.value` del <select>: la
     opcion libre vale "__otra" y eso es lo que saldria impreso. cevenDelivery()
     resuelve el texto final (shared/ui-core.js), igual que cevenPayMode() con
     la condicion de pago. Desde un documento guardado se lee la columna. */
  var del = row ? dato('Entrega')
                : (typeof cevenDelivery === 'function' ? cevenDelivery()
                                                       : dato('Entrega', 'delivery'));
  var pay = row ? dato('Condición de pago')
                : (typeof cevenPayMode === 'function' ? cevenPayMode() : '');

  /* La moneda del documento guardado es SIEMPRE USD: `P. Venta Unitario` se
     persiste en dolares y el TC vive en un input de la pantalla, asi que
     reimprimir una cotizacion vieja con el TC de hoy daria otro numero. Solo el
     documento en vivo puede salir en pesos. */
  var moneda = (!row && typeof getCur === 'function' && getCur() === 'ARS')
    ? 'Precios unitarios expresados en pesos argentinos'
    : 'Precios unitarios expresados en dólares estadounidenses';

  var lineas = [
    'Propuesta efectiva hasta: ' + (eff || '—'),
    'Condición de pago: ' + (pay || '—') + ' – TC Dólar billete BNA del día del pago',
    moneda,
    'Los precios expresados NO incluyen Impuestos'
  ].map(function(t){ return { texto: t, destacar: false }; });

  var propias = (typeof window !== 'undefined' && window.CEVEN_BRAND && window.CEVEN_BRAND.condicionesFijas) || [];
  for(var i = 0; i < propias.length; i++) lineas.push({ texto: propias[i], destacar: false });

  lineas.push({
    texto: 'Entrega: ' + (del || '—'),
    /* Solo la entrega inmediata se destaca. El guard por typeof es para el
       contexto sin ui-core.js (los scripts de chequeo corren estos modulos
       sueltos en Node): ahi la linea sale igual, sin resaltar. */
    destacar: (typeof cevenEntregaEsInmediata === 'function') && cevenEntregaEsInmediata(del)
  });
  return lineas;
}

/* Las mismas lineas como strings pelados. Es la forma historica y la que usan
   los chequeos; cevenCondicionesDetalle() es la que sabe que hay que destacar. */
function cevenCondiciones(row){
  return cevenCondicionesDetalle(row).map(function(l){ return l.texto; });
}

/* El mismo bloque como HTML, para los documentos que se arman concatenando
   strings (los dos pdf.js). El comprobante lo dibuja con jsPDF y usa la lista.

   La entrega inmediata sale en verde (`.cd-ok`): es un argumento de venta y el
   cliente tiene que verlo sin leer las seis lineas del bloque. */
function cevenCondicionesHTML(row){
  var esc = (typeof cevenEsc === 'function') ? cevenEsc : function(s){ return String(s); };
  var lineas = cevenCondicionesDetalle(row);
  var h = '<p class="sec">Condiciones Comerciales</p>';
  for(var i = 0; i < lineas.length; i++){
    h += '<p class="cd' + (lineas[i].destacar ? ' cd-ok' : '') + '">' + esc(lineas[i].texto) + '</p>';
  }
  return h;
}

/* ── NOMBRE DE ARCHIVO ──────────────────────────────────────────────────────
   Los documentos que se le mandan al cliente se llaman

       <cliente> - <proyecto> - Ceven - <validez>

   La validez es la "Propuesta efectiva hasta" (formato YYYY-MM-DD, que además
   ordena bien por nombre en el explorador). Los tramos que no tienen dato se
   omiten enteros, para no terminar con "Vista Energy -  - Ceven - ".

   Un solo lugar lo arma: lo usan el PDF de la cotización de las dos marcas y el
   comprobante. Antes cada uno tenía su propio `clientSlug` copiado. */
function cevenLimpiarNombreArchivo(txt){
  var s = String(txt == null ? '' : txt).trim();
  // '—' es el marcador de "sin dato" en las filas guardadas de cquotes.
  if(!s || s === '—') return '';
  return s
    .replace(/[<>:"/\\|?*]/g, '')     // inválidos en un nombre de archivo Windows
    /* Los caracteres de control se cambian por un espacio y NO se borran: un
       tab pegado desde un Excel separa dos palabras ("Hospital\tItaliano"), y
       borrarlo daba "HospitalItaliano". El colapso va después, por eso. */
    .replace(/[\u0000-\u001f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, 60);
}

function cevenNombreDocumento(cliente, proyecto, validez){
  var partes = [cliente, proyecto, 'Ceven', validez]
    .map(cevenLimpiarNombreArchivo)
    .filter(function(p){ return !!p; });
  // Si no hay ni cliente ni proyecto ni validez queda solo "Ceven", que no
  // identifica nada: ahí conviene un nombre genérico antes que uno engañoso.
  return partes.length > 1 ? partes.join(' - ') : 'Cotizacion Ceven';
}

/* ── DESCARGAR + ABRIR ──────────────────────────────────────────────────────
   Un solo objectURL sirve para las dos cosas: se descarga con un <a download> y
   se abre en una pestana. Lo usan TODOS los caminos que terminan en un PDF:
   el del portal (rasterizado, más abajo) y el de comprobante.js (vectorial,
   Poly/Apple/Legamaster/Multi).

   ── EL PROBLEMA DE LA PESTANA ──────────────────────────────────────────────
   El navegador solo permite `window.open` DENTRO del gesto del usuario. El PDF
   del portal se arma con html2canvas, que es asincrono y tarda uno o dos
   segundos: para cuando termina, el gesto ya se consumio y Chrome bloquea la
   pestana — comprobado, incluso apretando el boton a mano.

   La salida es abrir la pestana ANTES de generar, todavia dentro del click, con
   un cartel de "generando", y recien mandarla al PDF cuando esta listo. Eso es
   cevenPestanaEnEspera(): el que la necesita la abre temprano y la pasa aca.

   El comprobante (y, desde 07/09/2026, el PDF de la cotización de las tres
   marcas y el pedido de Multi) no la necesita: se dibuja con jsPDF de forma
   sincronica y su `window.open` cae dentro del mismo gesto del click.

   Si igual no hay pestana (el usuario tiene los emergentes bloqueados del todo)
   NO se insiste: el archivo ya se descargo y el cartel ofrece un boton "Abrir",
   que si es un gesto y nunca lo bloquean.

   El objectURL NO se revoca. Revocarlo rompe la pestana que lo esta mostrando
   si el usuario la recarga, y son unos pocos cientos de KB por documento. */

/* Abre la pestana de destino mientras todavia vale el gesto del usuario y le
   deja un cartel para que no se vea una hoja en blanco sin explicacion.
   Devuelve la ventana, o null si el navegador la bloqueo igual. */
function cevenPestanaEnEspera(titulo){
  var w = null;
  try{ w = window.open('', '_blank'); }catch(e){}
  if(!w) return null;
  try{
    w.document.open();
    w.document.write('<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">'
      + '<title>' + cevenEsc(titulo || 'Generando PDF…') + '</title></head>'
      + '<body style="margin:0;height:100vh;display:flex;align-items:center;justify-content:center;'
      + 'font-family:-apple-system,BlinkMacSystemFont,sans-serif;color:#6e6e73;background:#f5f5f7">'
      + '<p>⏳ Generando el PDF…</p></body></html>');
    w.document.close();
  }catch(e){ /* la pestana existe igual; sin cartel, pero sirve */ }
  return w;
}

function cevenDescargarYAbrir(blob, fileName, ventana){
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);

  // Con pestaña ya abierta se la manda al PDF; si no, se intenta abrirla ahora
  // (es lo que hace el comprobante, que llega acá dentro del mismo gesto).
  var w = ventana || null;
  if(w){
    try{ w.location.replace(url); }catch(e){ w = null; }
  } else {
    try{ w = window.open(url, '_blank'); }catch(e){}
  }

  if(w){
    showToast('✓ ' + fileName + ' — descargado y abierto en otra pestaña.');
    return;
  }
  showToast('✓ ' + fileName + ' descargado. El navegador bloqueó la pestaña nueva.', {
    actionLabel: 'Abrir',
    onAction: function(){ window.open(url, '_blank'); }
  });
}

/* Hoja de estilos del documento rasterizado con html2canvas. Hoy la usa
   solo src/portal/js/pdf.js (Poly/Apple/Legamaster pasaron su buildPDF() al
   motor vectorial de shared/comprobante.js — ver el comentario de arriba).
   `cols`  = anchos de columna.
   `extra` = reglas extra que quiera agregar quien la llame. */
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
    /* Entrega inmediata. Es un chip y no solo texto verde porque este documento
       termina rasterizado por html2canvas y achicado para entrar en una hoja:
       un cambio de color solo se pierde a ese tamano, el recuadro no. */
    +'.cd-ok{color:#0f7a35;background:#e6f6ec;display:inline-block;padding:2px 9px;border-radius:5px}'
    /* Opciones A/B de una cotizacion (shared/opciones.js). El rotulo va en negro
       pleno para que sobreviva al achique de html2canvas, y el aviso de que son
       excluyentes en amarillo: el riesgo concreto es que el cliente lea las dos
       tablas como dos partes de la misma compra y sume los totales. */
    +'.opc-tit{background:#1d1d1f;color:#fff;font-size:11px;font-weight:700;letter-spacing:.6px;text-transform:uppercase;padding:6px 10px;border-radius:6px;margin:16px 0 9px}'
    +'.opc-nota{background:#fffbea;border:1px solid #f5c400;border-radius:6px;padding:7px 10px;font-size:11px;color:#5c4a00;margin-bottom:12px}'
    +(extra||'')
    +'.ft{margin-top:20px;font-size:10px;color:#aeaeb2;text-align:center}'
    +'@media print{body{padding:18px}}</style>';
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
  /* La pestaña se abre ACÁ y no al final: todavía estamos dentro del click que
     llamó a buildPDF(), y después de html2canvas el navegador ya la bloquea. */
  var pestana = cevenPestanaEnEspera(fileName);

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
      // Se descarga Y se abre. `output('blob')` en vez de `pdf.save()` para que
      // la descarga y la pestana compartan el mismo archivo generado una sola vez.
      cevenDescargarYAbrir(pdf.output('blob'), fileName + '.pdf', pestana);
    }).catch(function(err){
      stage.remove();
      // Se cierra la pestaña de espera: dejarla con el "⏳ Generando" para
      // siempre se lee como que el PDF sigue en camino.
      if(pestana){ try{ pestana.close(); }catch(e){} }
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
