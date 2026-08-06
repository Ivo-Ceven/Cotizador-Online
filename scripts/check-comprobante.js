#!/usr/bin/env node
/* ============================================================================
   check-comprobante.js · Cotizadores Ceven
   ----------------------------------------------------------------------------
   Genera un comprobante REAL (shared/comprobante.js + jsPDF + autotable) con
   filas de `cquotes` de mentira y verifica el PDF resultante.

   Existe porque el comprobante dejó de ser un HTML que se lee de un vistazo:
   ahora se dibuja con jsPDF, y un error de dibujo no tira excepción — sale un
   PDF con una columna corrida o sin las condiciones comerciales, y eso lo ve
   recién el cliente. Acá se comprueba que el texto esperado ESTÉ en el archivo.

   Se apoya en que jsPDF escribe los content streams sin comprimir: el texto se
   puede leer del PDF con una expresión regular, sin ninguna dependencia.

   Uso:  node scripts/check-comprobante.js [--guardar]
         (--guardar deja el PDF en el directorio actual para mirarlo)
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

/* ---- Filas de prueba: la forma que tiene una cotización en `cquotes` -------
   Se usan las claves de Poly (con `IVA` y `OPG`) más una fila al estilo viejo
   de Apple, que guardaba el IVA en `_taxes`: el comprobante tiene que leer las
   dos. */
const FILAS = [
  {
    'N° Cotización': '0563', 'Fecha': '06/08/2026', 'Cliente': 'Vista Energy',
    'Proyecto': 'Sala Directorio', 'Ejecutivo': 'Tsu Rivas',
    'Observaciones': 'Entrega en dos etapas — coordinar con el cliente final',
    'Condición de pago': '30 días FF', 'Propuesta efectiva hasta': '2026-08-20',
    'Entrega': '5 a 7 días hábiles',
    'SKU': 'A4LZ8AA#ABM', 'Descripción': 'Poly Studio X72 All-in-One Video Bar Latin America - (120V) Spanish local',
    'Cantidad': 3, 'IVA': '10.5%', 'P. Venta Unitario': 3700, 'Total': 11100
  },
  {
    'N° Cotización': '0563', 'Fecha': '06/08/2026', 'Cliente': 'Vista Energy',
    'Proyecto': 'Sala Directorio', 'Ejecutivo': 'Tsu Rivas',
    'Observaciones': 'Entrega en dos etapas — coordinar con el cliente final',
    'Condición de pago': '30 días FF', 'Propuesta efectiva hasta': '2026-08-20',
    'Entrega': '5 a 7 días hábiles',
    'SKU': '875K5AA', 'Descripción': 'Poly TC10 Touch Controller Black',
    'Cantidad': 1, '_taxes': '21%', 'P. Venta Unitario': 720, 'Total': 720
  }
];

/* ---- Entorno mínimo de navegador ------------------------------------------
   No hay `Image`, así que la IIFE que precarga el logo se corta sola y el
   documento sale sin él: es exactamente el camino de respaldo que tiene que
   funcionar cuando el PNG no está. */
function cargar(){
  const ctx = {
    console,
    location: { href: 'https://cotizadores-ceven.vercel.app/poly/index.html' },
    URL: URL,
    navigator: { userAgent: 'node' },
    btoa: s => Buffer.from(s, 'binary').toString('base64'),
    atob: s => Buffer.from(s, 'base64').toString('binary'),
    CEVEN_EMISOR: {
      razonSocial: 'Ceven S.A', domicilio: 'Manuel Garcia 352',
      contacto: '', cuit: '30-69669295-1'
    },
    CEVEN_BRAND: { id: 'poly', condicionesFijas: [] },
    getDB: () => FILAS,
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
  vm.runInContext(lee('src/shared/pdf-core.js'), ctx);
  vm.runInContext(lee('src/shared/comprobante.js'), ctx);
  return ctx;
}

console.log('\nComprobante · generación del PDF\n');

const ctx = cargar();

ok(!!(ctx.window.jspdf && ctx.window.jspdf.jsPDF), 'jsPDF se cargó en el contexto');
const JS = ctx.window.jspdf && ctx.window.jspdf.jsPDF;
ok(!!(JS && JS.API && typeof JS.API.autoTable === 'function'), 'el plugin autotable se enganchó a jsPDF');

/* ---- Las condiciones comerciales, antes de dibujar nada ------------------- */
const cond = ctx.cevenCondiciones(FILAS[0]);
ok(cond.length === 5, 'la cotización guardada da 5 condiciones (Poly, sin líneas propias)', 'dio ' + cond.length);
ok(cond[0] === 'Propuesta efectiva hasta: 2026-08-20', 'condición 1 · fecha efectiva', cond[0]);
ok(/^Condición de pago: 30 días FF – TC Dólar billete BNA/.test(cond[1]), 'condición 2 · pago + TC', cond[1]);
ok(cond[2] === 'Precios unitarios expresados en dólares estadounidenses', 'condición 3 · moneda', cond[2]);
ok(cond[3] === 'Los precios expresados NO incluyen Impuestos', 'condición 4 · impuestos', cond[3]);
ok(cond[4] === 'Entrega: 5 a 7 días hábiles', 'condición 5 · entrega', cond[4]);

/* Sin los tres campos guardados el bloque NO desaparece: sale con guiones. Era
   el bug del PDF del historial (y de Poly, que ni siquiera los guardaba). */
const condVacia = ctx.cevenCondiciones({ 'Cliente': 'X' });
ok(condVacia.length === 5, 'sin datos guardados el bloque igual sale completo', 'dio ' + condVacia.length);
ok(condVacia[0] === 'Propuesta efectiva hasta: —', 'sin fecha efectiva sale "—"', condVacia[0]);

/* Las líneas propias de la marca entran donde corresponde (Apple). */
ctx.window.CEVEN_BRAND = { id: 'apple', condicionesFijas: ['Incluye enrolamiento en Apple Business Manager'] };
const condApple = ctx.cevenCondiciones(FILAS[0]);
ok(condApple.length === 6 && condApple[4] === 'Incluye enrolamiento en Apple Business Manager',
   'las condiciones propias de la marca salen antes de "Entrega"', condApple.join(' | '));
ok(condApple[5] === 'Entrega: 5 a 7 días hábiles', '"Entrega" sigue siendo la última línea', condApple[5]);
ctx.window.CEVEN_BRAND = { id: 'poly', condicionesFijas: [] };

/* ---- El IVA por línea ----------------------------------------------------- */
ok(ctx.cevenComprobanteIVA(FILAS[0]) === '10.5%', 'lee el IVA de la columna `IVA`');
ok(ctx.cevenComprobanteIVA(FILAS[1]) === '21%', 'cae a `_taxes` en cotizaciones viejas de Apple');
ok(ctx.cevenComprobanteIVA({}) === '—', 'sin ningún IVA guardado muestra "—"');

/* ---- El nombre del archivo: "<cliente> - <proyecto> - Ceven - <validez>" --- */
ok(ctx.cevenComprobanteNombre(FILAS[0]) === 'Vista Energy - Sala Directorio - Ceven - 2026-08-20.pdf',
   'cliente, proyecto, Ceven y validez, en ese orden', ctx.cevenComprobanteNombre(FILAS[0]));
// Los espacios del nombre SÍ se conservan (son válidos y el formato ya los usa);
// lo que se saca es < > : " / \ | ? * y los caracteres de control.
ok(ctx.cevenNombreDocumento('A/B: "C"', 'D|E', '2026-01-02') === 'AB C - DE - Ceven - 2026-01-02',
   'saca los caracteres que Windows no acepta en un nombre de archivo',
   ctx.cevenNombreDocumento('A/B: "C"', 'D|E', '2026-01-02'));
ok(ctx.cevenNombreDocumento('Hospital  Italiano\tSA', 'Sala 1', '2026-01-02')
     === 'Hospital Italiano SA - Sala 1 - Ceven - 2026-01-02',
   'los espacios de más y los tabs de un Excel quedan en un solo espacio',
   ctx.cevenNombreDocumento('Hospital  Italiano\tSA', 'Sala 1', '2026-01-02'));
/* Los tramos sin dato se omiten enteros: si no, quedaba "Vista Energy -  - Ceven - ". */
ok(ctx.cevenNombreDocumento('Vista Energy', '', '') === 'Vista Energy - Ceven',
   'sin proyecto ni validez no quedan separadores colgando',
   ctx.cevenNombreDocumento('Vista Energy', '', ''));
ok(ctx.cevenNombreDocumento('Vista Energy', '—', '2026-08-20') === 'Vista Energy - Ceven - 2026-08-20',
   'el "—" de "sin dato" de cquotes no entra en el nombre',
   ctx.cevenNombreDocumento('Vista Energy', '—', '2026-08-20'));
ok(ctx.cevenNombreDocumento('', '', '') === 'Cotizacion Ceven',
   'sin ningún dato cae a un nombre genérico y no a "Ceven" a secas',
   ctx.cevenNombreDocumento('', '', ''));
/* En Poly el proyecto es el cliente final; sin él se usa el OPG. */
ok(ctx.cevenComprobanteNombre({'Cliente':'Vista Energy','OPG':'OPG-77','Propuesta efectiva hasta':'2026-08-20'})
     === 'Vista Energy - OPG-77 - Ceven - 2026-08-20.pdf',
   'sin proyecto se usa el OPG');

/* ---- Generar el PDF ------------------------------------------------------- */
let doc = null, err = null;
try{ doc = ctx.cevenComprobanteDoc('0563', FILAS); }catch(e){ err = e; }
ok(!err, 'el documento se genera sin excepción', err && (err.message + '\n' + err.stack));

if(doc){
  const buf = Buffer.from(doc.output('arraybuffer'));
  ok(buf.length > 2000, 'el PDF pesa algo razonable', buf.length + ' bytes');
  ok(buf.slice(0, 5).toString('latin1') === '%PDF-', 'arranca con la firma %PDF-');

  /* jsPDF no comprime los content streams: el texto se puede leer del archivo.
     Se junta todo lo que va entre paréntesis (los operandos de Tj/TJ) y se
     deshacen los escapes de PDF. */
  const crudo = buf.toString('latin1');
  const texto = (crudo.match(/\(((?:\\.|[^\\()])*)\)/g) || [])
    .map(s => s.slice(1, -1).replace(/\\([()\\])/g, '$1'))
    .join(' ');

  /* El PDF guarda los acentos en WinAnsi (un byte), así que 'Cotización' llega
     como latin1: se compara contra la misma codificación. */
  const tiene = s => texto.indexOf(Buffer.from(s, 'utf8').toString('latin1')) !== -1
                  || texto.indexOf(s) !== -1;

  /* Las fuentes estándar del PDF no dibujan los caracteres CP1252 0x80–0x9F:
     el «–» de la condición de pago se perdía sin aviso. cevenCompSan() los
     baja a ASCII antes de dibujar. */
  ok(!/–|—|“|”|…/.test(ctx.cevenCompSan('a–b—c“d”e…f')),
     'cevenCompSan() saca los caracteres que la fuente no tiene',
     ctx.cevenCompSan('a–b—c“d”e…f'));
  ok(ctx.cevenCompSan('Descripción · N° ñ á') === 'Descripción · N° ñ á',
     'cevenCompSan() NO toca acentos, ñ, «°» ni «·»', ctx.cevenCompSan('Descripción · N° ñ á'));

  ok(tiene('COTIZACIÓN'), 'el título dice COTIZACIÓN');
  ok(!tiene('COMPROBANTE'), 'ya no dice COMPROBANTE en ningún lado');
  ok(tiene('Ceven S.A'), 'la razón social del emisor está');
  ok(tiene('30-69669295-1'), 'el CUIT del EMISOR sigue en el encabezado');
  // El renglón en blanco de CUIT/DNI del cliente se sacó: es de un comprobante
  // fiscal, no de una propuesta.
  ok(!tiene('CUIT / DNI'), 'no queda el renglón de CUIT/DNI del cliente');
  ok(tiene('0563'), 'el número de cotización está');
  ok(tiene('Vista Energy'), 'el cliente está');
  ok(tiene('Sala Directorio'), 'el proyecto está debajo del cliente');
  // Entero y en un solo renglón: con la columna a 26 mm salía "A4LZ8AA#AB" + "M".
  ok(tiene('A4LZ8AA#ABM'), 'el SKU más largo entra sin partirse en dos renglones');
  ok(tiene('875K5AA'), 'el SKU de la segunda línea está');
  ok(tiene('10.5%') && tiene('21%'), 'las dos alícuotas de IVA están en la tabla');

  /* El IVA va ÚLTIMO, después del subtotal. Los encabezados se dibujan en orden,
     así que alcanza con comparar dónde aparece cada uno; ninguna de las dos
     palabras vuelve a salir en el resto del documento. */
  const iSub = texto.indexOf('Subtotal'), iIva = texto.indexOf('IVA');
  ok(iSub !== -1 && iIva !== -1 && iIva > iSub,
     'la columna IVA es la última, después de Subtotal',
     'Subtotal en ' + iSub + ', IVA en ' + iIva);

  // El ejecutivo pasó del pie a la caja del encabezado, junto al N° y la fecha.
  const iEjec = texto.indexOf('Ejecutivo'), iDetalle = texto.indexOf('Detalle');
  ok(iEjec !== -1 && iDetalle !== -1 && iEjec < iDetalle,
     'el ejecutivo está arriba, antes del detalle', 'Ejecutivo en ' + iEjec + ', Detalle en ' + iDetalle);

  ok(tiene('TOTAL'), 'la fila de TOTAL está');
  ok(tiene('11.820,00'), 'el total suma las dos líneas (11.100 + 720)');
  ok(tiene('Condiciones Comerciales'), 'el bloque de condiciones comerciales está');
  ok(tiene('30 días FF - TC Dólar billete BNA del día del pago'),
     'la condición de pago sale completa, con el guión antes del TC');
  ok(tiene('2026-08-20'), 'la fecha efectiva guardada está');
  ok(tiene('NO incluyen Impuestos'), 'la línea de impuestos está');
  ok(tiene('Tsu Rivas'), 'el nombre del ejecutivo está impreso');
  ok(!tiene('Forma de pago'), 'ya no queda el renglón en blanco de "Forma de pago"');

  if(process.argv.indexOf('--guardar') !== -1){
    const dest = path.join(ROOT, 'comprobante-prueba.pdf');
    fs.writeFileSync(dest, buf);
    console.log('\n  → guardado en ' + dest);
  }
}

console.log('\n' + (fallos
  ? ('✗ ' + fallos + ' de ' + corridas + ' fallaron\n')
  : ('✓ ' + corridas + '/' + corridas + ' OK\n')));
process.exit(fallos ? 1 : 0);
