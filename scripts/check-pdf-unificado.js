#!/usr/bin/env node
/* ============================================================================
   check-pdf-unificado.js · Cotizadores Ceven
   ----------------------------------------------------------------------------
   El botón "📄 PDF" de la cotización en vivo (Poly/Apple/Legamaster) dejó de
   armar su propio HTML y rasterizarlo con html2canvas: ahora pasa por el MISMO
   motor que el comprobante del historial (shared/comprobante.js, jsPDF +
   autotable). Ver la entrada correspondiente en docs/HISTORIAL.md.

   Eso significó extender cevenComprobanteDoc()/_compTablaDetalle() con tres
   cosas que antes NO existían ahí: una columna opcional (`extraCol`, la Nota
   de Poly/Legamaster y la Disponibilidad de Apple), el agrupamiento por
   familia de producto (`familyOf`, solo Apple) y una tabla aparte para las
   garantías CevenCare con su propio total (`warrantyOf`, solo Apple).

   check-comprobante.js ya prueba el documento SIN esos opts (el camino de
   siempre). Esto prueba el documento CON ellos — el camino nuevo — generando
   un PDF real y leyendo su texto, igual que ahí.

   Uso:  node scripts/check-pdf-unificado.js
   ========================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');

let fallos = 0, corridas = 0;
function ok(cond, nombre, detalle){
  corridas++;
  if(cond){ console.log('  ✓ ' + nombre); return; }
  fallos++;
  console.error('  ✗ ' + nombre + (detalle ? ('\n      ' + detalle) : ''));
}

function cargar(brandId){
  const ctx = {
    console,
    location: { href: 'https://cotizadores-ceven.vercel.app/' + brandId + '/index.html' },
    URL: URL,
    navigator: { userAgent: 'node' },
    btoa: s => Buffer.from(s, 'binary').toString('base64'),
    atob: s => Buffer.from(s, 'base64').toString('binary'),
    CEVEN_EMISOR: { razonSocial: 'Ceven S.A', domicilio: 'Manuel Garcia 352', contacto: '', cuit: '30-69669295-1' },
    CEVEN_BRAND: { id: brandId, condicionesFijas: [] },
    getDB: () => [],
    fD: n => Number(n).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    showToast: m => { ctx._toast = m; }
  };
  ctx.window = ctx;
  ctx.self = ctx;
  ctx.globalThis = ctx;
  vm.createContext(ctx);

  const lee = p => fs.readFileSync(path.join(ROOT, p), 'utf8');
  vm.runInContext(lee('src/vendor/jspdf.umd.min.js'), ctx);
  vm.runInContext(lee('src/vendor/jspdf.plugin.autotable.min.js'), ctx);
  vm.runInContext(lee('src/shared/safe.js'), ctx);
  vm.runInContext(lee('src/shared/pdf-core.js'), ctx);
  vm.runInContext(lee('src/shared/opciones.js'), ctx);
  vm.runInContext(lee('src/shared/comprobante.js'), ctx);
  return ctx;
}

/* Texto plano del PDF, igual que check-comprobante.js: jsPDF no comprime los
   content streams, así que los operandos de Tj/TJ se leen con una regex. */
function textoDe(doc){
  const buf = Buffer.from(doc.output('arraybuffer'));
  const crudo = buf.toString('latin1');
  return (crudo.match(/\(((?:\\.|[^\\()])*)\)/g) || [])
    .map(s => s.slice(1, -1).replace(/\\([()\\])/g, '$1'))
    .join(' ');
}
function contiene(texto, s){
  return texto.indexOf(Buffer.from(s, 'utf8').toString('latin1')) !== -1 || texto.indexOf(s) !== -1;
}

/* ============================================================================
   1) extraCol sola — el caso de Poly/Legamaster (columna "Nota")
   ========================================================================== */
console.log('\n1 · extraCol · la columna "Nota" de Poly/Legamaster\n');
{
  const ctx = cargar('poly');
  const FILAS = [
    { 'N° Cotización': '0900', 'Cliente': 'Acme', 'Proyecto': 'Sala 1', 'Ejecutivo': 'Tsu Rivas',
      'SKU': 'SKU-A', 'Descripción': 'Cámara de video', 'Cantidad': 1, 'IVA': '21%',
      'P. Venta Unitario': 1000, 'Total': 1000, 'Nota': 'Stock inmediato' },
    { 'N° Cotización': '0900', 'Cliente': 'Acme', 'Proyecto': 'Sala 1', 'Ejecutivo': 'Tsu Rivas',
      'SKU': 'SKU-B', 'Descripción': 'Micrófono', 'Cantidad': 2, 'IVA': '21%',
      'P. Venta Unitario': 200, 'Total': 400 } // sin Nota: tiene que caer a '—'
  ];
  const opts = { extraCol: { header: 'Nota', get: r => r['Nota'] || '—', width: 22 } };
  let doc = null, err = null;
  try{ doc = ctx.cevenComprobanteDoc('0900', FILAS, null, opts); }catch(e){ err = e; }
  ok(!err, 'se genera sin excepción', err && (err.message + '\n' + err.stack));
  if(doc){
    const t = textoDe(doc);
    ok(contiene(t, 'Nota'), 'el encabezado "Nota" está');
    ok(contiene(t, 'Stock inmediato'), 'el valor de la fila que sí tiene Nota está');
    ok(contiene(t, 'TOTAL'), 'sigue la fila de TOTAL');
    ok(contiene(t, '1.400,00'), 'el total suma las dos líneas (1000 + 400) aunque haya columna nueva');
    ok(contiene(t, 'SKU-A') && contiene(t, 'SKU-B'), 'los dos SKU siguen estando');
  }
}

/* ============================================================================
   2) extraCol + familyOf + warrantyOf — el caso de Apple
   ========================================================================== */
console.log('\n2 · familyOf + warrantyOf · productos por familia y garantías aparte (Apple)\n');
{
  const ctx = cargar('apple');
  const FILAS = [
    { 'N° Cotización': '0901', 'Cliente': 'Acme', 'Proyecto': 'Renovación', 'Ejecutivo': 'Tsu Rivas',
      'SKU': 'MBP-1', 'Descripción': 'MacBook Pro 14"', 'Cantidad': 1, 'IVA': '21%',
      'P. Venta Unitario': 2000, 'Total': 2000, 'Disponibilidad': 'Stock', 'Tipo': 'producto' },
    { 'N° Cotización': '0901', 'Cliente': 'Acme', 'Proyecto': 'Renovación', 'Ejecutivo': 'Tsu Rivas',
      'SKU': 'IPH-1', 'Descripción': 'iPhone 17', 'Cantidad': 2, 'IVA': '21%',
      'P. Venta Unitario': 900, 'Total': 1800, 'Disponibilidad': '—', 'Tipo': 'producto' },
    { 'N° Cotización': '0901', 'Cliente': 'Acme', 'Proyecto': 'Renovación', 'Ejecutivo': 'Tsu Rivas',
      'SKU': 'CC-MBP-1', 'Descripción': 'MacBook Pro 14" — Complete Care (3 años)', 'Cantidad': 1,
      'IVA': '21%', 'P. Venta Unitario': 300, 'Total': 300, 'Disponibilidad': '—', 'Tipo': 'garantia' }
  ];
  const opts = {
    extraCol: { header: 'Disponibilidad', get: r => r['Disponibilidad'] || '—', width: 24 },
    familyOf: r => (r['Descripción'] || '').indexOf('MacBook') === 0 ? 'Mac' : 'iPhone',
    familyOrder: ['Mac', 'iPhone'],
    warrantyOf: r => r['Tipo'] === 'garantia',
    warrantySectionTitle: 'Garantías Extendidas — CevenCare',
    warrantySectionSub: 'Las garantías a continuación son opcionales.'
  };
  let doc = null, err = null;
  try{ doc = ctx.cevenComprobanteDoc('0901', FILAS, null, opts); }catch(e){ err = e; }
  ok(!err, 'se genera sin excepción', err && (err.message + '\n' + err.stack));
  if(doc){
    const t = textoDe(doc);
    // jsPDF puede partir una palabra larga del encabezado en más de un
    // fragmento de texto por kerning (se ve perfecto en el PDF real, solo
    // cambia cómo queda codificado el content stream) — se busca un pedazo
    // largo y sin ambigüedad en vez de la palabra completa.
    ok(contiene(t, 'Disponibilida'), 'el encabezado "Disponibilidad" está');
    ok(contiene(t, 'Stock'), 'el valor de Disponibilidad de la primera línea está');
    ok(contiene(t, 'Mac') && contiene(t, 'iPhone'), 'los separadores de familia están');
    // El total de PRODUCTOS no debe incluir la garantía (2000+1800=3800, no 4100).
    ok(contiene(t, '3.800,00'), 'el total de productos NO incluye la garantía (2000+1800)');
    ok(contiene(t, '300,00'), 'el total de garantías está (300) y aparece por separado');
    ok(contiene(t, 'Garantías Extendidas'), 'el título de la sección de garantías está');
    ok(contiene(t, 'CevenCare'), 'y menciona CevenCare');
    ok(contiene(t, 'GARANT') , 'hay una fila de total específica para garantías (contiene "GARANT")');
    ok(contiene(t, 'MBP-1') && contiene(t, 'IPH-1') && contiene(t, 'CC-MBP-1'), 'los tres SKU están');
  }
}

/* ============================================================================
   3) Multi (grupoDeFila) sigue andando con la tabla generalizada
   ========================================================================== */
console.log('\n3 · grupoDeFila (Multi) no se rompió con la generalización\n');
{
  const ctx = cargar('multi');
  const FILAS = [
    { 'N° Cotización': '0902', 'Cliente': 'Acme', 'Proyecto': 'Pedido mixto', 'Ejecutivo': 'Tsu Rivas',
      'SKU': 'A-1', 'Descripción': 'Producto Apple', 'Cantidad': 1, 'IVA': '21%',
      'P. Venta Unitario': 500, 'Total': 500, 'Marca': 'apple' },
    { 'N° Cotización': '0902', 'Cliente': 'Acme', 'Proyecto': 'Pedido mixto', 'Ejecutivo': 'Tsu Rivas',
      'SKU': 'P-1', 'Descripción': 'Producto Poly', 'Cantidad': 1, 'IVA': '21%',
      'P. Venta Unitario': 300, 'Total': 300, 'Marca': 'poly' }
  ];
  const opts = {
    grupoDeFila: r => r['Marca'] || '',
    grupoLabel: k => k === 'apple' ? 'Apple' : 'Poly'
  };
  let doc = null, err = null;
  try{ doc = ctx.cevenComprobanteDoc('0902', FILAS, null, opts); }catch(e){ err = e; }
  ok(!err, 'se genera sin excepción', err && (err.message + '\n' + err.stack));
  if(doc){
    const t = textoDe(doc);
    ok(contiene(t, 'Apple') && contiene(t, 'Poly'), 'los dos rótulos de marca están');
    ok(contiene(t, 'TOTAL GENERAL'), 'sigue la barra de TOTAL GENERAL');
    ok(contiene(t, '800,00'), 'el total general suma las dos marcas (500 + 300)');
  }
}

console.log('\n' + (fallos
  ? ('✗ ' + fallos + ' de ' + corridas + ' fallaron\n')
  : ('✓ ' + corridas + '/' + corridas + ' OK\n')));
process.exit(fallos ? 1 : 0);
