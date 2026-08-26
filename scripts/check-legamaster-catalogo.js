#!/usr/bin/env node
/* ============================================================================
   check-legamaster-catalogo.js · Cotizadores Ceven
   ----------------------------------------------------------------------------
   Corre el importador REAL de Legamaster (processRows / _lmHeaderIdx de
   src/legamaster/js/catalog.js) contra la lista de precios oficial y verifica:
     · el encabezado corrido (4 renglones de aviso antes de la fila 5) se
       encuentra solo;
     · la sección "OPS" se excluye;
     · los 3 pares de SKU duplicados quedan como 6 productos, el segundo de
       cada par con sufijo "-B" y los dos marcados `skuDuplicado`;
     · el IVA por fila (0 / 0.105 / 0.21) llega intacto, sin pasar por el
       parser de plata (que rompería 0.105 al confundir el punto con un
       separador de miles);
     · link y disponibilidad quedan poblados;
     · un artículo manual sobrevive a un reimport.

   Uso:  node scripts/check-legamaster-catalogo.js [ruta.xlsx]
         (por defecto "./Lista Legamaster unico.xlsx", en la raíz del repo)
   ========================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const ARCHIVO = process.argv[2] || path.join(ROOT, 'Lista Legamaster unico.xlsx');

let fallos = 0, corridas = 0;
function ok(cond, nombre, detalle){
  corridas++;
  if(cond){ console.log('  ✓ ' + nombre); return; }
  fallos++;
  console.error('  ✗ ' + nombre + (detalle ? ('\n      ' + detalle) : ''));
}

if(!fs.existsSync(ARCHIVO)){
  console.error('No se encontró el archivo: ' + ARCHIVO);
  console.error('Este chequeo necesita la lista de precios real (no se versiona en el repo).');
  process.exit(1);
}

/* ---- Cargar el importador real, con lo justo del entorno del navegador ----- */
function cargarCatalogo(){
  const xlsx  = fs.readFileSync(path.join(ROOT, 'src/vendor/xlsx.full.min.js'), 'utf8');
  const brand = fs.readFileSync(path.join(ROOT, 'src/legamaster/brand.js'), 'utf8');
  const opc   = fs.readFileSync(path.join(ROOT, 'src/shared/opciones.js'), 'utf8');
  const core  = fs.readFileSync(path.join(ROOT, 'src/shared/catalog-core.js'), 'utf8');
  const pric  = fs.readFileSync(path.join(ROOT, 'src/legamaster/js/pricing-core.js'), 'utf8');
  const cat   = fs.readFileSync(path.join(ROOT, 'src/legamaster/js/catalog.js'), 'utf8');
  const store = {};
  const ctx = {
    console,
    products: [],
    selIds: {},
    editId: null,
    items: [],
    _pendingNewSKUs: [],
    localStorage: {
      getItem: k => (k in store ? store[k] : null),
      setItem: (k,v) => { store[k] = String(v); },
      removeItem: k => { delete store[k]; }
    },
    document: {
      getElementById: () => ({
        style: {}, classList: { add(){}, remove(){} },
        value: '', textContent: '', innerHTML: '', checked: false,
        tagName: 'DIV', _attrs: {}, open: false,
        getAttribute(k){ return this._attrs[k] !== undefined ? this._attrs[k] : null; },
        setAttribute(k, v){ this._attrs[k] = String(v); },
        closest: () => null,
        appendChild(){}, addEventListener(){}, querySelectorAll: () => []
      }),
      querySelectorAll: () => []
    },
    cevenLsSet: (k,v) => { store[k] = String(v); return true; },
    cevenLsJSON: (k,d) => { try{ return JSON.parse(store[k]); }catch(e){ return d; } },
    cevenEsc: s => String(s),
    cevenOpcFiltrar: (arr) => arr,
    cevenOpcActiva: () => 1,
    showErr: m => { if(m) ctx._err = m; },
    showToast: m => { ctx._toast = m; },
    cevenDelegate: () => {},
    cevenActEl: () => null,
    cevenParseMoney: s => parseFloat(String(s).replace(',', '.')),
    fD: n => String(n)
  };
  ctx.window = ctx;
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(xlsx, ctx);
  vm.runInContext(brand, ctx);
  vm.runInContext(opc, ctx);
  vm.runInContext(core, ctx);
  vm.runInContext(pric, ctx);
  vm.runInContext(cat, ctx);
  return ctx;
}

const ctx = cargarCatalogo();

console.log('\nImportador de Legamaster · ' + path.basename(ARCHIVO));

const buf = fs.readFileSync(ARCHIVO);
const wb = ctx.XLSX.read(buf, {type:'buffer'});
const sheetName = wb.SheetNames.find(n => n.trim().toLowerCase() === 'legamaster') || wb.SheetNames[0];
const sheet = wb.Sheets[sheetName];
const aoa = ctx.XLSX.utils.sheet_to_json(sheet, {header:1, defval:''});
const hIdx = ctx._lmHeaderIdx(aoa);
ok(hIdx >= 0, 'encuentra la fila de encabezado corrido (saltea los avisos de arriba)', 'hIdx=' + hIdx);

const filas = ctx.XLSX.utils.sheet_to_json(sheet, {range: hIdx, defval:''});
console.log('  fila de encabezado: ' + (hIdx+1) + ' · ' + filas.length + ' filas de datos\n');

ctx.processRows(filas);
ok(!ctx._err, 'el importador no reportó error', ctx._err);

const prods = ctx.products;
const porSku = {};
prods.forEach(p => { porSku[p.sku] = p; });
ok(Object.keys(porSku).length === prods.length, 'no hay SKUs repetidos en el resultado (los duplicados ya llevan sufijo)');

ok(prods.every(p => String(p.rubro||'').toLowerCase() !== 'ops'), 'ningún producto quedó con categoría "OPS"');
ok(prods.length === 94, '100 filas − 6 de OPS = 94 productos', 'dio ' + prods.length);

/* ---- Los 3 pares de SKU duplicados ------------------------------------- */
[
  {sku: '7-818111', descA: /VESA 200x200-400x400/, descB: /VESA 200x200-600x800/},
  {sku: '7-811541', descA: /fixed height$/, descB: /Dynamic column system/},
  {sku: '7-811961', descA: /accessory shelf small/, descB: /Dynamic mobile stand/}
].forEach(function(caso){
  var a = porSku[caso.sku];
  var b = porSku[caso.sku + '-B'];
  ok(!!a && !!b, 'el par ' + caso.sku + ' quedó como dos productos (base + "-B")',
     'a=' + (a && a.description) + ' · b=' + (b && b.description));
  if(a && b){
    ok(caso.descA.test(a.description), caso.sku + ' (base) tiene la primera descripción', a.description);
    ok(caso.descB.test(b.description), caso.sku + '-B tiene la segunda descripción', b.description);
    ok(a.skuDuplicado === true && b.skuDuplicado === true, caso.sku + ' y ' + caso.sku + '-B quedan marcados skuDuplicado');
  }
});

/* ---- IVA por fila, sin pasar por el parser de plata --------------------- */
var monitor = porSku['7-805120-43-AR'];
ok(!!monitor, 'existe el SKU 7-805120-43-AR (DISCOVER 3 DIS-4320)');
if(monitor){
  ok(monitor.ivaPct === 0.21, '7-805120-43-AR · IVA 21% = 0.21 exacto', 'dio ' + monitor.ivaPct);
  ok(monitor.precios['Con Registro'] === 1034.8, '7-805120-43-AR · Con Registro = 1034.8', 'dio ' + monitor.precios['Con Registro']);
  ok(monitor.precios['Canal'] === 1085.9,         '7-805120-43-AR · Canal = 1085.9',        'dio ' + monitor.precios['Canal']);
  ok(monitor.precios['Web'] === 1172.77,          '7-805120-43-AR · Web = 1172.77',         'dio ' + monitor.precios['Web']);
  ok(monitor.link && monitor.link.indexOf('pidb.legamaster.com') !== -1, '7-805120-43-AR · trae el link a la ficha', monitor.link);
  ok(monitor.disponibilidad === 'Entrega 7 dias de PO', '7-805120-43-AR · disponibilidad = "Entrega 7 dias de PO"', 'dio "' + monitor.disponibilidad + '"');
}

var reducido = prods.filter(p => p.ivaPct === 0.105);
ok(reducido.length > 0, 'hay productos con IVA 10,5% (0.105 exacto, no 105 — la trampa del parser de miles)', 'dio ' + reducido.length);

var exento = prods.filter(p => p.ivaPct === 0);
ok(exento.length > 0, 'hay productos con IVA 0%', 'dio ' + exento.length);

var general = prods.filter(p => p.ivaPct === 0.21);
ok(reducido.length + exento.length + general.length === prods.length,
   'todos los productos cayeron en una de las 3 alícuotas (0 / 0.105 / 0.21)');

/* ---- cevenLegamasterIvaTxt() formatea bien las 3 alícuotas -------------- */
ok(ctx.cevenLegamasterIvaTxt({ivaPct:0.21}) === '21%', 'cevenLegamasterIvaTxt(0.21) → "21%"', ctx.cevenLegamasterIvaTxt({ivaPct:0.21}));
ok(ctx.cevenLegamasterIvaTxt({ivaPct:0.105}) === '10,5%', 'cevenLegamasterIvaTxt(0.105) → "10,5%"', ctx.cevenLegamasterIvaTxt({ivaPct:0.105}));
ok(ctx.cevenLegamasterIvaTxt({ivaPct:0}) === '0%', 'cevenLegamasterIvaTxt(0) → "0%"', ctx.cevenLegamasterIvaTxt({ivaPct:0}));
ok(ctx.cevenLegamasterIvaTxt({ivaPct:null}) === '—', 'cevenLegamasterIvaTxt(null) → "—"', ctx.cevenLegamasterIvaTxt({ivaPct:null}));

/* ---- Preservar un artículo manual en un reimport ------------------------ */
ctx.products.push({id:'MANUAL-1', sku:'MANUAL-1', description:'Cable a medida', manual:true, precios:{}, ivaPct:0.21, rubro:'', link:'', disponibilidad:''});
ctx.processRows(filas);
ok(!!ctx.products.find(p => p.sku === 'MANUAL-1'), 'un artículo manual sobrevive a un reimport del Excel');
ok(ctx.products.length === 95, 'el reimport no duplica los 94 del Excel (94 + 1 manual)', 'dio ' + ctx.products.length);

console.log('\n' + (fallos
  ? ('✗ ' + fallos + ' de ' + corridas + ' fallaron\n')
  : ('✓ ' + corridas + '/' + corridas + ' OK\n')));
process.exit(fallos ? 1 : 0);
