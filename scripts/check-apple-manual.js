#!/usr/bin/env node
/* ============================================================================
   check-apple-manual.js · Cotizadores Ceven
   ----------------------------------------------------------------------------
   Alta, edición y baja de un artículo del price list cargado a mano
   (src/apple/js/products.js). Tres reglas que se rompen sin que nadie se entere:

     · el precio se tipea en formato es-AR ("1.250,50"). Con el `type=number` y
       el parseFloat viejos, ese texto se cortaba en el primer punto y el
       artículo quedaba con un costo de 1,25 en vez de 1.250,50 — o el campo
       quedaba vacío directamente, según el teclado;
     · reeditar tiene que mostrar el precio guardado en el mismo formato en el
       que se lee, o el ida y vuelta lo va deformando;
     · borrar NO pregunta con un confirm(): borra y ofrece deshacer, y el
       deshacer tiene que reponer el artículo en su lugar. Un artículo que vino
       del price list importado no se borra desde ahí.

   Uso:  node scripts/check-apple-manual.js
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

function campo(val){
  return { value: val === undefined ? '' : String(val), style:{}, innerHTML:'',
           textContent:'', checked:false };
}

function cargar(){
  const store = {};
  const els = {};
  ['np-sku','np-desc','np-price','np-price-lbl','np-model','np-country','np-nacincluded',
   'nperr','addprod-title','plbadge','fmodel','fcountry','catui','nopl','catbody',
   'catcount','addbtn','chkall','fsearch','obs','msl','msl-input'].forEach(function(id){ els[id] = campo(''); });
  els['fmodel'].value = 'Todos';
  els['fcountry'].value = 'Todos';
  els['msl'].value = '20';

  const ctx = {
    console,
    products: [], items: [], warrantyItems: [], selIds: {}, editId: null,
    nacRates: {}, quoteNacOverrides: {}, IVA_MAP: {}, _pendingNewSKUs: [],
    _nextSel: () => 1,
    localStorage: {
      getItem: k => (k in store ? store[k] : null),
      setItem: (k,v) => { store[k] = String(v); },
      removeItem: k => { delete store[k]; }
    },
    document: {
      getElementById: id => els[id] || null,
      addEventListener(){}, querySelectorAll: () => []
    },
    cevenK: b => b,
    // brand.js real en miniatura: catalog-core.js lee CEVEN_BRAND.plLabel.
    CEVEN_BRAND: {id:'apple', prefix:'', plLabel:'price list'},
    showErr(){}, showToast(m){ ctx._toast = m; },
    // notifyUndo se guarda para poder ejecutar el "Deshacer" desde el banco.
    notifyUndo(msg, fn){ ctx._undoMsg = msg; ctx._undo = fn; },
    goTo(g){ ctx._goto = g; }, renderQ(){}, renderWarranties(){}, renderCat(){}, initCat(){},
    cevenDelegate(){}, cevenActEl: () => null,
    cevenAddProdTitle: () => 'Agregar artículo al price list',
    promptForNextPendingSKU(){ ctx._prompted = true; },
    getCur: () => 'USD', getTC: () => 0,
    fI: n => Math.round(n).toLocaleString('es-AR'),
    fD: n => Number(n).toLocaleString('es-AR',{minimumFractionDigits:2,maximumFractionDigits:2}),
    dp: u => 'USD ' + Math.round(u).toLocaleString('es-AR'),
    uniq: function(arr){ var seen={}, out=['Todos']; arr.forEach(function(v){ if(v && !seen[v]){ seen[v]=1; out.push(v); } }); return out; },
    optionsHTML: vals => vals.map(v => '<option>'+v+'</option>').join(''),
    XLSX: {}
  };
  ctx.window = ctx; ctx.globalThis = ctx;
  vm.createContext(ctx);
  // opciones.js: el catálogo y la cotización filtran por opción A/B
  // (cevenOpcFiltrar/cevenOpcActiva). En el navegador se carga antes.
  for(const f of ['src/shared/safe.js', 'src/shared/opciones.js', 'src/shared/catalog-core.js', 'src/shared/quote-core.js',
                  'src/apple/js/pricing-core.js', 'src/apple/js/pricing.js', 'src/apple/js/catalog.js', 'src/apple/js/products.js']){
    vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, {filename: f});
  }
  ctx._els = els;
  return ctx;
}

console.log('\nArtículo manual del price list de Apple\n');

/* ---- Alta con el precio tipeado en es-AR ---------------------------------- */
let ctx = cargar();
ctx._els['np-sku'].value  = 'CEV-ACC-01';
ctx._els['np-desc'].value = 'Adaptador USB-C';
ctx._els['np-price'].value = '1.250,50';
ctx.saveNewProd();

let p = ctx.products[0];
ok(!!p, 'se dio de alta el artículo');
ok(p && p.sellingPrice === 1250.5, 'el precio "1.250,50" se guarda como 1250.5',
   'dio ' + (p && p.sellingPrice));
ok(p && p.manual === true, 'queda marcado como manual (la carga del price list lo distingue)');
ok(ctx._els['nperr'].style.display !== 'block', 'no queda ningún cartel de error puesto');

/* El formato en-US también tiene que entrar: es como lo copia y pega alguien
   desde el Excel de Apple. */
let ctxUs = cargar();
ctxUs._els['np-sku'].value = 'CEV-ACC-02';
ctxUs._els['np-desc'].value = 'Cable';
ctxUs._els['np-price'].value = '1250.50';
ctxUs.saveNewProd();
ok(ctxUs.products[0] && ctxUs.products[0].sellingPrice === 1250.5,
   'el mismo importe en formato en-US ("1250.50") da lo mismo',
   'dio ' + (ctxUs.products[0]||{}).sellingPrice);

/* ---- Validaciones --------------------------------------------------------- */
let ctxMal = cargar();
ctxMal._els['np-sku'].value = 'X';
ctxMal._els['np-desc'].value = 'Y';
ctxMal._els['np-price'].value = 'gratis';
ctxMal.saveNewProd();
ok(ctxMal.products.length === 0, 'un precio que no es número NO da de alta nada');
ok(ctxMal._els['nperr'].style.display === 'block', 'y deja el cartel de error a la vista');

let ctxCero = cargar();
ctxCero._els['np-sku'].value = 'X';
ctxCero._els['np-desc'].value = 'Y';
ctxCero._els['np-price'].value = '0';
ctxCero.saveNewProd();
ok(ctxCero.products.length === 0, 'un costo 0 tampoco: el precio de venta saldría 0',
   'se dieron de alta ' + ctxCero.products.length);

/* ---- Reedición: el precio vuelve al campo en el mismo formato ------------- */
ctx.editManualProduct(p.id);
ok(ctx._els['np-price'].value === '1.250,50',
   'al editar, el campo muestra "1.250,50" (el formato que el parser entiende)',
   'dio "' + ctx._els['np-price'].value + '"');
ctx._els['np-price'].value = '1.300';        // sin decimales, separador de miles
ctx.saveNewProd();
ok(ctx.products.length === 1, 'editar no crea un artículo nuevo', 'hay ' + ctx.products.length);
ok(ctx.products[0].sellingPrice === 1300, '"1.300" se guarda como 1300, no como 1,3',
   'dio ' + ctx.products[0].sellingPrice);

/* ---- Baja: sin confirm(), con Deshacer ------------------------------------ */
ctx._undo = null;
ctx.deleteManualProduct(p.id);
ok(ctx.products.length === 0, 'borrar saca el artículo del price list');
ok(typeof ctx._undo === 'function', 'y ofrece "Deshacer" en vez de preguntar antes', ctx._undoMsg);
ctx._undo();
ok(ctx.products.length === 1 && ctx.products[0].sku === 'CEV-ACC-01',
   'el Deshacer repone el artículo', 'quedaron ' + ctx.products.length);

/* Un producto importado del price list no se borra desde el catálogo: se
   actualiza reimportando. */
let ctxImp = cargar();
ctxImp.products = [{id: 7, sku:'MD4P4LE/A', description:'iPad', sellingPrice: 496.64}];
ctxImp._undo = null;
ctxImp.deleteManualProduct(7);
ok(ctxImp.products.length === 1, 'un artículo que vino del price list NO se borra desde ahí');
ok(!ctxImp._undo, 'y no se ofrece ningún deshacer de algo que no pasó');
ok(/Solo se pueden eliminar/.test(ctxImp._toast||''), 'se explica por qué con un cartel', ctxImp._toast);

console.log('\n' + (fallos ? '✗ ' + fallos + ' de ' + corridas + ' fallaron' : '✓ ' + corridas + ' chequeos OK') + '\n');
process.exit(fallos ? 1 : 0);
