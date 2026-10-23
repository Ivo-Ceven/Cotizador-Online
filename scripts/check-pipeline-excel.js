#!/usr/bin/env node
/* ============================================================================
   check-pipeline-excel.js · Cotizadores Ceven
   ----------------------------------------------------------------------------
   El "⬇ Excel" del pipeline (src/shared/pipeline-excel.js, 23/10/2026): el
   archivo que se le manda a la marca. Arma el libro de verdad con el ExcelJS
   de src/vendor/, lo escribe, lo vuelve a leer y verifica:

     · que NO viaje nada interno (Netsuite, N° de cotización, observaciones,
       ejecutivo, margen) — es lo que motivó el cambio;
     · las columnas por marca (Oportunidad solo donde existe el OPG);
     · la hoja Productos: solo la opción vigente y solo productos;
     · el formato: encabezado con el color de la marca, montos con separador,
       cierre como fecha, total con fórmula, filtros y encabezado fijo.

   Uso:  node scripts/check-pipeline-excel.js
   ========================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const ExcelJS = require(path.join(ROOT, 'src/vendor/exceljs.min.js'));

let fallos = 0, corridas = 0;
function ok(cond, nombre, detalle){
  corridas++;
  if(cond){ console.log('  ✓ ' + nombre); return; }
  fallos++;
  console.error('  ✗ ' + nombre + (detalle ? ('\n      ' + detalle) : ''));
}

function cargar(brand){
  const ctx = { console, Date, Math, JSON, Object, String, parseInt, parseFloat, isNaN, Promise };
  ctx.window = ctx; ctx.globalThis = ctx;
  ctx.CEVEN_BRAND = brand;
  ctx.ExcelJS = ExcelJS;
  vm.createContext(ctx);
  for(const f of ['src/shared/opciones.js', 'src/shared/pipeline-status.js', 'src/shared/pipeline-excel.js']){
    vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, {filename: f});
  }
  return ctx;
}

const POLY = { id: 'poly', label: 'Poly', pipeCols: ['qNum', 'cliente', 'proyecto', 'opg', 'factura'],
  theme: { accent: '#b35333', soft: '#f7ede9' } };
const APPLE = { id: 'apple', label: 'Apple', pipeCols: ['qNum', 'cliente', 'proyecto', 'margenPond', 'ovLink'],
  theme: { accent: '#2d1b4e', soft: '#ece7f5' } };

const FILAS = [
  { qNum: '0184', cliente: 'Novadata', proyecto: 'MAPFRE', opg: 'REGI-0005555397', mesCierre: '2026-11',
    estado: 'Negociacion', monto: 17342.04, factura: 'https://netsuite/SECRETO', ejecutivo: 'Rodrigo', margenPond: 18 },
  { qNum: '0185', cliente: 'Icap', proyecto: 'JP Morgan', opg: '—', mesCierre: '', estado: 'Cotizado', monto: 500 }
];
// cquotes: la #0184 tiene opción A (vigente) y B; la #0185 una sola línea más una garantía.
const DB = [
  { 'N° Cotización': '0184', 'Opción': 1, '_opcEf': 1, 'Tipo': 'producto', 'SKU': 'V72', 'Descripción': 'Poly Studio V72', 'Cantidad': 3, 'P. Venta Unitario': 5000, 'Observaciones': 'nota interna' },
  { 'N° Cotización': '0184', 'Opción': 1, '_opcEf': 1, 'Tipo': 'producto', 'SKU': 'TC10', 'Descripción': 'Poly TC10', 'Cantidad': 2, 'P. Venta Unitario': 1171.02 },
  { 'N° Cotización': '0184', 'Opción': 2, '_opcEf': 1, 'Tipo': 'producto', 'SKU': 'X52', 'Descripción': 'Opción B', 'Cantidad': 9, 'P. Venta Unitario': 1 },
  { 'N° Cotización': '0185', 'Tipo': 'producto', 'SKU': 'EDGE', 'Descripción': 'Edge E320', 'Cantidad': 1, 'P. Venta Unitario': 500 },
  { 'N° Cotización': '0185', 'Tipo': 'garantia', 'SKU': 'CC-1', 'Descripción': 'CevenCare', 'Cantidad': 1, 'P. Venta Unitario': 99 }
];

async function libro(ctx, filas, db){
  const datos = ctx.cevenPipelineExcelDatos(filas, db);
  const cols = ctx._cevenExcelColumnas();
  const wb = new ExcelJS.Workbook();
  ctx._cevenExcelHoja(wb, 'Pipeline', 'Pipeline ' + ctx.CEVEN_BRAND.label + ' · Ceven', cols.pipeline, datos.oportunidades, 'monto');
  if(datos.productos.length) ctx._cevenExcelHoja(wb, 'Productos', 'detalle', cols.productos, datos.productos, 'total');
  const buf = await wb.xlsx.writeBuffer();
  const back = new ExcelJS.Workbook();
  await back.xlsx.load(buf);
  return { back, datos, buf };
}

function textoDe(ws){
  const out = [];
  ws.eachRow(r => r.eachCell(c => out.push(String(c.value && c.value.formula ? '' : (c.value == null ? '' : c.value)))));
  return out.join(' | ');
}

(async function(){
  console.log('\nExcel del pipeline para la marca · src/shared/pipeline-excel.js\n');

  console.log('1 · Poly: columnas, datos y nada interno');
  {
    const ctx = cargar(POLY);
    const { back, datos, buf } = await libro(ctx, FILAS, DB);
    fs.writeFileSync(path.join(require('os').tmpdir(), 'ceven-check-pipeline.xlsx'), Buffer.from(buf));
    const ws = back.getWorksheet('Pipeline');
    const head = ws.getRow(3).values.slice(1);
    ok(JSON.stringify(head) === JSON.stringify(['Canal', 'Cliente final', 'Oportunidad', 'Cierre estimado', 'Estado', 'Monto USD']),
       'encabezado: Canal, Cliente final, Oportunidad, Cierre, Estado, Monto', JSON.stringify(head));
    const todo = textoDe(ws) + ' ' + textoDe(back.getWorksheet('Productos'));
    ok(!/SECRETO|netsuite|0184|Rodrigo|nota interna|Margen|Ejecutivo|Observaciones/i.test(todo),
       'no viaja Netsuite, N° de cotización, ejecutivo, observaciones ni margen', todo.slice(0, 300));
    ok(ws.getCell('A4').value === 'Novadata' && ws.getCell('B4').value === 'MAPFRE' && ws.getCell('C4').value === 'REGI-0005555397',
       'canal / cliente final / oportunidad en su lugar');
    ok(ws.getCell('C5').value === '' || ws.getCell('C5').value == null, 'un OPG "—" sale vacío, no como guion');
    const cierre = ws.getCell('D4').value;
    ok(cierre instanceof Date && cierre.getUTCFullYear() === 2026 && cierre.getUTCMonth() === 10,
       'el cierre es una FECHA (se ordena y filtra en Excel), no texto', String(cierre));
    ok(ws.getCell('D4').numFmt === 'mmm yyyy', 'y se muestra como "nov 2026"');
    ok(ws.getCell('E4').value === 'Negociación' || /Negoci/.test(ws.getCell('E4').value), 'el estado con su etiqueta de pantalla', ws.getCell('E4').value);

    console.log('\n2 · Formato');
    ok(ws.getCell('A3').fill && ws.getCell('A3').fill.fgColor.argb === 'FFB35333', 'encabezado con el color de la marca');
    ok(ws.getCell('A3').font.bold && ws.getCell('A3').font.color.argb === 'FFFFFFFF', 'en blanco y negrita');
    ok(ws.getCell('F4').numFmt === '#,##0.00', 'montos con separador de miles y 2 decimales');
    const tot = ws.getCell('F6').value;
    ok(tot && /SUBTOTAL\(9,F4:F5\)/.test(tot.formula) && Math.abs(tot.result - 17842.04) < 0.01,
       'fila de total con SUBTOTAL (respeta los filtros de Excel)', JSON.stringify(tot));
    ok(ws.views[0].state === 'frozen' && ws.views[0].ySplit === 3, 'título y encabezado quedan fijos al scrollear');
    ok(ws.autoFilter, 'con filtros en el encabezado');
    ok(String(ws.getCell('A1').value).indexOf('Pipeline Poly') === 0, 'título con la marca');

    console.log('\n3 · Hoja Productos');
    const p = back.getWorksheet('Productos');
    const skus = datos.productos.map(x => x.sku);
    ok(JSON.stringify(skus) === JSON.stringify(['V72', 'TC10', 'EDGE']),
       'solo la opción vigente y solo productos (sin la opción B ni la garantía CevenCare)', JSON.stringify(skus));
    ok(datos.productos[1].total === 2342.04, 'total de la línea = cantidad × precio', datos.productos[1].total);
    ok(p.getRow(3).values.slice(1).indexOf('SKU') !== -1 && p.getRow(3).values.slice(1).indexOf('Cantidad') !== -1,
       'con SKU, descripción y cantidad');
  }

  console.log('\n4 · Apple: sin columna Oportunidad (no tiene OPG)');
  {
    const ctx = cargar(APPLE);
    const { back } = await libro(ctx, FILAS, DB);
    const head = back.getWorksheet('Pipeline').getRow(3).values.slice(1);
    ok(head.indexOf('Oportunidad') === -1 && head.length === 5, 'cinco columnas, sin Oportunidad', JSON.stringify(head));
    ok(back.getWorksheet('Pipeline').getCell('A3').fill.fgColor.argb === 'FF2D1B4E', 'y con el color de Apple');
  }

  console.log('\n5 · Casos borde');
  {
    const ctx = cargar(POLY);
    const d = ctx.cevenPipelineExcelDatos([{ cliente: 'X', monto: '1.5' }], null);
    ok(d.oportunidades[0].monto === 1.5 && d.productos.length === 0, 'sin cotización ni base: la fila sale igual, sin productos');
    ok(d.oportunidades[0].cierre === null, 'sin mes de cierre: celda vacía, no "Invalid Date"');
  }

  console.log('\n' + (fallos ? ('✗ ' + fallos + ' de ' + corridas + ' fallaron\n') : ('✓ ' + corridas + '/' + corridas + ' OK\n')));
  process.exit(fallos ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
