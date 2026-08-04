/* ============================================================================
   COMPROBANTE  ·  documento imprimible por cotización
   ----------------------------------------------------------------------------
   Un botón en cada tarjeta del historial abre este documento listo para
   imprimir. El diseño replica el recibo modelo que trajo el equipo (serif azul
   marino, filete bajo el emisor, caja de N° + Fecha, tabla con cabecera navy y
   fila TOTAL destacada, y los renglones de Forma de pago / Observaciones).

   ── POR QUÉ SE IMPRIME Y NO SE ARMA UN PDF ────────────────────────────────
   El PDF de la cotización (shared/pdf-core.js) pasa por html2canvas: rasteriza
   la pantalla y la mete en un jsPDF. Sirve ahí porque tiene que reproducir una
   vista compleja, pero el resultado es una IMAGEN — el texto no se puede
   seleccionar ni buscar, y en impresora se ve blando.

   Este documento es texto y una tabla, así que va por la impresión nativa del
   navegador: sale nítido a cualquier tamaño, y el diálogo de imprimir ya trae
   "Guardar como PDF" para quien quiera el archivo. Cero librerías.

   ── POR QUÉ EN UNA VENTANA APARTE ─────────────────────────────────────────
   Un contenedor `@media print` dentro de la app obligaría a esconder TODO lo
   demás y a pelear con los estilos heredados de base.css en cada regla. La
   ventana nueva arranca sin nada: lo único que hay adentro es este documento.

   Ojo con las rutas: la ventana se abre en `about:blank`, donde una URL
   relativa no resuelve contra la página que la abrió. El logo va con URL
   absoluta (ver logoURL()).

   ── NO ES UNA FACTURA ─────────────────────────────────────────────────────
   El título es COMPROBANTE a propósito. Una factura argentina necesita CAE de
   AFIP, punto de venta y tipo (A/B/C): nada de eso sale de una cotización, y un
   papel que diga "FACTURA" sin CAE no es válido. Si algún día se emite de
   verdad, es integrar la API de AFIP, no cambiarle el título a este archivo.

   Lo comparten las dos marcas: usa solo campos que existen en las dos
   (`cquotes` con Cliente / Ejecutivo / Fecha / SKU / Descripción / Cantidad /
   P. Venta Unitario / Total), así que acá no hay ningún `if` por marca.
   ============================================================================ */

/* Paleta del modelo: el azul de Word "Azul oscuro, Texto 2, Oscuro 25%" y su
   relleno claro para las filas. Van acá y no en un CSS aparte porque el
   documento viaja entero como un string a otra ventana. */
var CEVEN_COMP_NAVY  = '#1f3864';
var CEVEN_COMP_TINT  = '#d9e2f3';

/* URL absoluta del logo. La ventana nueva no tiene base para resolver rutas
   relativas, y las páginas que llaman a esto cuelgan un nivel abajo de la raíz
   (apple/index.html, poly/index.html), igual que supone la navbar. */
function cevenComprobanteLogoURL(){
  try{ return new URL('../icons/ceven.png', location.href).href; }
  catch(e){ return ''; }
}

/* Un renglón del encabezado del emisor. Si el dato está vacío devuelve '': un
   rótulo suelto ("Contacto:" sin nada al lado) queda peor que no estar. */
function cevenComprobanteRenglon(rotulo, valor){
  valor = String(valor == null ? '' : valor).trim();
  if(!valor) return '';
  return '<p>' + cevenEsc(rotulo) + ': ' + cevenEsc(valor) + '</p>';
}

/* Filas de una cotización del historial. getDB() lo define cada marca. */
function cevenComprobanteFilas(qn){
  if(typeof getDB !== 'function') return [];
  return getDB().filter(function(r){
    return String(r['N° Cotización']) === String(qn)
        && r['SKU'] && r['SKU'] !== 'undefined'
        && r['Descripción'] && r['Descripción'] !== 'undefined';
  });
}

function cevenComprobanteHTML(qn){
  var filas = cevenComprobanteFilas(qn);
  if(!filas.length) return null;

  var esc = cevenEsc;
  var p   = filas[0];
  var emisor = window.CEVEN_EMISOR || {};

  /* Los importes salen en USD, tal como se guardaron. No se convierten a pesos
     a propósito: el TC vive en un input de la pantalla de cotización y cambia
     todos los días, así que convertir haría que dos impresiones del mismo
     comprobante den totales distintos según el día. */
  var total = 0, cuerpo = '';
  filas.forEach(function(r){
    var qty  = parseFloat(r['Cantidad']) || 0;
    var unit = parseFloat(r['P. Venta Unitario']) || 0;
    var sub  = parseFloat(r['Total']) || 0;
    total += sub;
    cuerpo += '<tr>'
      + '<td class="c-sku">' + esc(r['SKU']) + '</td>'
      + '<td>' + esc(r['Descripción']) + '</td>'
      + '<td class="c-num">' + esc(qty) + '</td>'
      + '<td class="c-money">USD ' + fD(unit) + '</td>'
      + '<td class="c-money">USD ' + fD(sub) + '</td>'
      + '</tr>';
  });

  /* "Organización" del modelo: en Poly el proyecto/OPG es lo que identifica al
     trabajo; en Apple no existe ese campo y queda el guión. Se leen los dos sin
     preguntar por la marca — el que no aplica viene undefined. */
  var organizacion = p['Proyecto'] || p['OPG'] || '—';

  var logo = cevenComprobanteLogoURL();
  var titulo = 'Comprobante ' + (qn || '') + (p['Cliente'] ? ' — ' + p['Cliente'] : '');

  return '<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">'
  + '<title>' + esc(titulo) + '</title>'
  + '<style>'
  /* A4 con márgenes de documento. El navegador respeta @page al imprimir; en
     pantalla se simula con el ancho del .hoja para que lo que se ve sea lo que
     sale. */
  + '@page{size:A4;margin:18mm 16mm}'
  + '*{box-sizing:border-box;margin:0;padding:0}'
  + 'body{font-family:"Times New Roman",Times,serif;font-size:11pt;color:#000;background:#f0f0f0;padding:24px}'
  + '.hoja{background:#fff;max-width:190mm;margin:0 auto;padding:16mm 14mm;box-shadow:0 4px 18px rgba(0,0,0,.18)}'

  + '.emisor{display:flex;align-items:flex-start;gap:16px}'
  /* El logo es el wordmark "ceven" (250×100). Va a 44px de alto — al lado de la
     razón social, que NO se agranda como en el modelo justamente por eso: el
     modelo no tenía logo y el nombre hacía de marca; acá repetir "ceven" en
     cuerpo 17 al lado del mismo wordmark quedaba redundante y desbalanceado.
     Si el archivo no está, el <img> se esconde solo (onerror) y el nombre queda
     como única identificación — el documento nunca sale con el ícono roto. */
  + '.emisor img{height:44px;width:auto;object-fit:contain;flex-shrink:0}'
  + '.emisor h1{font-size:13pt;font-weight:bold;color:' + CEVEN_COMP_NAVY + ';letter-spacing:.2px;line-height:1.25;margin-bottom:2px}'
  + '.emisor p{font-size:9.5pt;color:#333;line-height:1.4}'
  + '.regla{border:0;border-top:2.5px solid ' + CEVEN_COMP_NAVY + ';margin:7px 0 16px}'

  + '.titulo{font-size:20pt;font-weight:bold;color:' + CEVEN_COMP_NAVY + ';margin-bottom:10px}'

  + '.caja{width:100%;border-collapse:collapse;margin-bottom:16px}'
  + '.caja td{border:1px solid #000;padding:5px 9px;font-size:10.5pt}'
  + '.caja .der{text-align:right}'
  + '.relleno{border-bottom:1px solid #666;display:inline-block;min-width:150px;padding:0 6px;color:#333}'

  + 'h2{font-size:11pt;font-weight:bold;color:' + CEVEN_COMP_NAVY + ';margin:0 0 5px}'
  + '.datos{margin-bottom:15px;font-size:10.5pt;line-height:1.55}'
  + '.datos b{font-weight:bold}'
  + '.datos span{color:#333}'

  + 'table.det{width:100%;border-collapse:collapse;margin-bottom:16px;font-size:10pt}'
  + 'table.det th{background:' + CEVEN_COMP_NAVY + ';color:#fff;font-weight:bold;padding:6px 8px;border:1px solid ' + CEVEN_COMP_NAVY + ';text-align:left}'
  + 'table.det td{border:1px solid #b7c4dd;padding:5px 8px;vertical-align:top}'
  /* Cebra tenue, como el modelo. nth-child sobre las filas de datos. */
  + 'table.det tbody tr:nth-child(odd) td{background:#eef2f9}'
  + 'table.det th.c-num,table.det td.c-num{text-align:center;width:62px}'
  + 'table.det th.c-money,table.det td.c-money{text-align:right;width:98px;white-space:nowrap}'
  + 'table.det th.c-sku,table.det td.c-sku{width:96px;white-space:nowrap}'
  + 'tr.total td{background:' + CEVEN_COMP_NAVY + ';color:#fff;font-weight:bold;border-color:' + CEVEN_COMP_NAVY + '}'
  + 'tr.total td.vacio{background:#fff;border-color:#fff}'

  + '.renglones{font-size:10.5pt;line-height:2.1;margin-bottom:18px}'
  + '.pie{border-top:1px solid #999;padding-top:8px;font-size:9pt;color:#444}'

  /* La barra de acciones es de pantalla: no se imprime. */
  + '.barra{max-width:190mm;margin:0 auto 14px;display:flex;gap:8px;justify-content:flex-end}'
  + '.barra button{font-family:inherit;font-size:11pt;padding:7px 18px;border-radius:6px;cursor:pointer;border:1px solid ' + CEVEN_COMP_NAVY + ';background:' + CEVEN_COMP_NAVY + ';color:#fff}'
  + '.barra button.sec{background:#fff;color:' + CEVEN_COMP_NAVY + '}'
  + '@media print{body{background:#fff;padding:0}.hoja{box-shadow:none;max-width:none;margin:0;padding:0}.barra{display:none}}'
  + '</style></head><body>'

  + '<div class="barra">'
  +   '<button class="sec" onclick="window.close()">Cerrar</button>'
  +   '<button onclick="window.print()">Imprimir</button>'
  + '</div>'

  + '<div class="hoja">'
  +   '<div class="emisor">'
  +     (logo ? '<img src="' + esc(logo) + '" alt="" onerror="this.style.display=\'none\'">' : '')
  +     '<div>'
  +       '<h1>' + esc(emisor.razonSocial || 'Ceven') + '</h1>'
  +       cevenComprobanteRenglon('Domicilio', emisor.domicilio)
  +       cevenComprobanteRenglon('Contacto', emisor.contacto)
  +       cevenComprobanteRenglon('CUIT', emisor.cuit)
  +     '</div>'
  +   '</div>'
  +   '<hr class="regla">'

  +   '<div class="titulo">COMPROBANTE</div>'

  +   '<table class="caja"><tr>'
  +     '<td><b>Comprobante N°:</b> ' + esc(qn) + '</td>'
  +     '<td class="der"><b>Fecha:</b> <span class="relleno">' + esc(p['Fecha'] || '') + '</span></td>'
  +   '</tr></table>'

  +   '<h2>Datos del cliente</h2>'
  +   '<div class="datos">'
  +     '<div><b>Recibe:</b> <span>' + esc(p['Cliente'] || '—') + '</span></div>'
  +     '<div><b>Organización:</b> <span>' + esc(organizacion) + '</span></div>'
  +     '<div><b>CUIT / DNI:</b> <span class="relleno">&nbsp;</span></div>'
  +   '</div>'

  +   '<h2>Detalle</h2>'
  +   '<table class="det">'
  +     '<thead><tr>'
  +       '<th class="c-sku">SKU</th><th>Descripción</th>'
  +       '<th class="c-num">Cantidad</th><th class="c-money">Precio unitario</th><th class="c-money">Subtotal</th>'
  +     '</tr></thead>'
  +     '<tbody>' + cuerpo + '</tbody>'
  +     '<tfoot><tr class="total">'
  +       '<td class="vacio" colspan="2"></td>'
  +       '<td colspan="2" style="text-align:right">TOTAL</td>'
  +       '<td class="c-money">USD ' + fD(total) + '</td>'
  +     '</tr></tfoot>'
  +   '</table>'

  +   '<div class="renglones">'
  +     '<div><b>Forma de pago:</b> <span class="relleno" style="min-width:280px">&nbsp;</span></div>'
  +     '<div><b>Observaciones:</b> <span class="relleno" style="min-width:280px">' + esc(p['Observaciones'] || '') + '</span></div>'
  +   '</div>'

  +   '<div class="pie">Cotización N° ' + esc(qn) + ' · Ejecutivo: ' + esc(p['Ejecutivo'] || '—') + '</div>'
  + '</div></body></html>';
}

/* Punto de entrada del botón del historial. */
function cevenImprimirComprobante(qn){
  var html = cevenComprobanteHTML(qn);
  if(!html){
    if(typeof showToast === 'function') showToast('No se encontraron líneas para la cotización #' + qn + '.');
    return;
  }
  var w = window.open('', '_blank');
  if(!w){
    if(typeof showToast === 'function') showToast('El navegador bloqueó la ventana del comprobante. Permití las ventanas emergentes para este sitio.');
    return;
  }
  w.document.open();
  w.document.write(html);
  w.document.close();
  /* El print va después del load: si se dispara con el documento a medio
     parsear, Chrome imprime una hoja en blanco — y encima el logo todavía no
     bajó, así que saldría sin él. */
  w.onload = function(){ try{ w.focus(); w.print(); }catch(e){} };
}
