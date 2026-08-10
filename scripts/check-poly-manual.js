#!/usr/bin/env node
/* ============================================================================
   check-poly-manual.js · Cotizadores Ceven
   ----------------------------------------------------------------------------
   Un artículo del catálogo cargado a mano tenía SOLO sku + descripción: salía
   con "—" en precios y había que tipear el importe en CADA cotización. Ahora
   lleva lo mismo que uno del ERP (precios por nivel, categoría, stock e IVA).

   Lo que se verifica es el ida y vuelta del formulario, que tiene tres reglas
   fáciles de romper sin que nadie se entere:

     · un campo de precio VACÍO no es 0. Vacío = "ese nivel no aplica" y la
       línea se completa a mano; 0 = sin cargo y se cotiza en 0. Si el vacío se
       guardara como 0, un servicio quedaría cotizado en cero;
     · stock vacío (null, "sin dato") tampoco es 0 ("agotado"): el catálogo los
       muestra distinto y el importador ya respeta esa diferencia;
     · los precios se tipean en formato es-AR ("1.250,50"), no en el del input
       type=number.

   Uso:  node scripts/check-poly-manual.js
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

/* ---- Un DOM de mentira, con solo lo que toca el formulario ----------------- */
function nuevoCampo(val){
  return { value: val === undefined ? '' : String(val), style:{}, innerHTML:'', textContent:'',
           _attrs:{}, getAttribute(k){ return this._attrs[k] || null; } };
}

function cargar(campos){
  const els = {
    'np-sku':   nuevoCampo(campos.sku),
    'np-desc':  nuevoCampo(campos.desc),
    'np-rubro': nuevoCampo(campos.rubro),
    'np-stock': nuevoCampo(campos.stock),
    'np-iva':   nuevoCampo(campos.iva || 'IVA GENERAL'),
    'nperr':    nuevoCampo(''),
    'np-precios': nuevoCampo(''),
    'np-rubro-list': nuevoCampo(''),
    'addprod-title': nuevoCampo(''),
    'plbadge':  nuevoCampo('')
  };
  // Los inputs de precio los arma _npPintarPrecios() en el navegador; acá se
  // inyectan directo, que es lo que el DOM real le entrega a _npLeerForm().
  const inputsPrecio = (campos.precios || []).map(function(p){
    const el = nuevoCampo(p[1]);
    el._attrs['data-tier'] = p[0];
    return el;
  });

  /* localStorage de verdad (un objeto): shared/safe.js define el cevenLsSet
     REAL y pisa cualquier stub, así que sin esto saveNewProd() cortaba en el
     `if(!cevenLsSet(...)) return;` y no se ejercitaba nada de lo que viene
     después del guardado. */
  const store = {};
  const ctx = {
    console,
    localStorage: {
      getItem: k => (k in store ? store[k] : null),
      setItem: (k,v) => { store[k] = String(v); },
      removeItem: k => { delete store[k]; }
    },
    products: [],
    selIds: {}, _pendingNewSKUs: [],
    _nextSel: () => 1,
    document: {
      getElementById: id => els[id] || nuevoCampo(''),
      querySelectorAll: sel => (sel.indexOf('np-precio') !== -1 ? inputsPrecio : [])
    },
    cevenK: b => 'poly_' + b,
    cevenLsSet: (k,v) => { store[k] = String(v); return true; },
    cevenEsc: s => String(s),
    showToast(){}, notifyUndo(){}, goTo(){}, renderCat(){},
    cevenAddProdTitle: () => 'Agregar artículo al catálogo',
    cevenTierLabel: v => v,
    cevenTiers: () => [{v:'Ceven - Tier 1',lbl:'Tier 1'},{v:'Ceven - Tier 2',lbl:'Tier 2'},
                       {v:'Ceven - Tier 3',lbl:'Tier 3'},{v:'Negocios Especiales',lbl:'Neg. Especiales'}],
    _rubrosDelCatalogo: () => ['Audio','Video'],
    fD: n => Number(n).toLocaleString('es-AR',{minimumFractionDigits:2,maximumFractionDigits:2}),
    CEVEN_IVA_REDUCIDO: '10.5%',
    CEVEN_IVA_GENERAL: '21%',
    cevenIvaPct: pf => /reducid/i.test(String(pf||'')) ? '10.5%' : '21%'
  };
  ctx.window = ctx; ctx.globalThis = ctx;
  vm.createContext(ctx);
  // cevenParseMoney vive en shared/safe.js: se carga el de verdad, porque el
  // parseo del formato es-AR es justamente una de las cosas a verificar.
  vm.runInContext(fs.readFileSync(path.join(ROOT,'src/shared/safe.js'),'utf8'), ctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT,'src/poly/js/products.js'),'utf8'), ctx);
  ctx._els = els;
  return ctx;
}

console.log('\nArtículo manual del catálogo de Poly\n');

/* ---- Alta completa --------------------------------------------------------- */
let ctx = cargar({
  sku:'CEV-SERV-01', desc:'Servicio de instalación', rubro:'Servicios',
  stock:'0', iva:'IVA REDUCIDO',
  precios:[['Ceven - Tier 1','1.250,50'], ['Ceven - Tier 2','1200'],
           ['Ceven - Tier 3',''],          ['Negocios Especiales','0']]
});
ctx.saveNewProd();
let p = ctx.products[0];

ok(!!p, 'se dio de alta el artículo');
ok(p && p.manual === true, 'queda marcado como manual (el importador no lo pisa)');
ok(p && p.sku === 'CEV-SERV-01' && p.description === 'Servicio de instalación', 'sku y descripción');
ok(p && p.rubro === 'Servicios', 'categoría nueva, aunque no estuviera en el catálogo');
ok(p && p.precios['Ceven - Tier 1'] === 1250.5, '"1.250,50" se guarda como 1250.5 (formato es-AR)',
   p && p.precios['Ceven - Tier 1']);
ok(p && p.precios['Ceven - Tier 2'] === 1200, 'un número pelado también entra');
ok(p && !('Ceven - Tier 3' in p.precios), 'el nivel VACÍO no se guarda (≠ guardarlo en 0)',
   p && JSON.stringify(p.precios));
ok(p && p.precios['Negocios Especiales'] === 0, 'un 0 escrito a propósito SÍ se guarda (sin cargo)');
ok(p && p.stock === 0, 'stock 0 = agotado, y se guarda como 0', p && String(p.stock));
ok(p && p.iva === 'IVA REDUCIDO' && p.ivaPct === '10.5%', 'el IVA elegido se guarda con las dos formas');

/* ---- Stock vacío ≠ 0 ------------------------------------------------------- */
ctx = cargar({ sku:'X-1', desc:'Sin stock declarado', stock:'', precios:[] });
ctx.saveNewProd();
ok(ctx.products[0].stock === null, 'stock vacío se guarda como null ("—"), no como 0',
   String(ctx.products[0].stock));
ok(JSON.stringify(ctx.products[0].precios) === '{}', 'sin precios queda el objeto vacío, no undefined');

/* ---- Obligatorios ---------------------------------------------------------- */
ctx = cargar({ sku:'', desc:'Algo', precios:[] });
ctx.saveNewProd();
ok(ctx.products.length === 0, 'sin SKU no se guarda nada');
ok(/Complet/.test(ctx._els['nperr'].textContent), 'y se explica por qué', ctx._els['nperr'].textContent);

ctx = cargar({ sku:'X-2', desc:'Algo', precios:[['Ceven - Tier 1','no es un precio']] });
ctx.saveNewProd();
ok(ctx.products.length === 0, 'un precio no numérico frena el guardado');
ok(/no es un número válido/.test(ctx._els['nperr'].textContent),
   'y el cartel dice qué nivel está mal', ctx._els['nperr'].textContent);

/* ---- Edición: no se pierden los campos que el formulario no toca ----------- */
ctx = cargar({ sku:'X-3', desc:'Nuevo nombre', rubro:'Audio', stock:'7', iva:'IVA GENERAL',
               precios:[['Ceven - Tier 1','100']] });
ctx.products.push({ id:'m9', sku:'X-3', description:'Viejo', manual:true, needsReview:true });
ctx.editingManualId = 'm9';
ctx.saveNewProd();
const editado = ctx.products[0];
ok(ctx.products.length === 1, 'editar no duplica la fila');
ok(editado.description === 'Nuevo nombre' && editado.stock === 7, 'los campos editados se aplican');
ok(editado.needsReview === true, 'un campo que el formulario NO edita sobrevive a la edición');
ok(editado.manual === true, 'sigue siendo manual después de editar');

console.log('\n' + (fallos
  ? ('✗ ' + fallos + ' de ' + corridas + ' fallaron\n')
  : ('✓ ' + corridas + '/' + corridas + ' OK\n')));
process.exit(fallos ? 1 : 0);
