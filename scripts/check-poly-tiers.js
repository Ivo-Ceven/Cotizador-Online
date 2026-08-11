#!/usr/bin/env node
/* ============================================================================
   check-poly-tiers.js · Cotizadores Ceven
   ----------------------------------------------------------------------------
   Verifica la semantica de los dos selectores de nivel de precio de Poly
   (src/poly/js/tiers.js), que es la parte del feature que no se ve hasta que
   sale mal: cambiar el nivel global tiene que repricear SOLO las lineas que lo
   siguen, y dejar intactas las que tienen nivel propio o precio a mano.

   Corre el modulo REAL contra un catalogo y unos items simulados.

   Uso:  node scripts/check-poly-tiers.js
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

const T1 = 'Ceven - Tier 1', T2 = 'Ceven - Tier 2', T3 = 'Ceven - Tier 3', NE = 'Negocios Especiales';

/* Catalogo de prueba con los precios REALES del archivo del ERP, incluido el
   SKU cuyo Tier 2 sale mas caro que el Tier 1 — para que ningun chequeo asuma
   que los niveles estan ordenados. */
const CATALOGO = [
  {sku:'772D0AA', description:'Sync 20+', precios:{[T1]:235, [T2]:230, [T3]:225, [NE]:190}},
  {sku:'A4LZ8AA', description:'Studio AIO', precios:{[T1]:3983.85, [T2]:4346, [T3]:4346, [NE]:3912}},
  {sku:'SIN-TIER', description:'Cargado a mano', precios:{}}
];

function nuevoEntorno(tierGlobalVal){
  const brand = { priceTiers: [
    {v:T1, lbl:'Tier 1'}, {v:T2, lbl:'Tier 2'},
    {v:T3, lbl:'Tier 3'}, {v:NE, lbl:'Neg. Especiales'}
  ]};
  const selGlobal = { value: tierGlobalVal || '' };
  const ctx = {
    console,
    products: CATALOGO.map(p => JSON.parse(JSON.stringify(p))),
    items: [],
    CEVEN_BRAND: brand,
    document: {
      getElementById: id => {
        if(id === 'tier-global') return selGlobal;
        if(id === 'client') return { value: ctx._cliente || '' };
        return null;
      }
    },
    cevenEsc: s => String(s),
    fD: n => String(n),
    showToast: m => { ctx._toast = m; },
    renderQ: () => { ctx._renders = (ctx._renders||0) + 1; },
    cevenClienteSet: (n, c) => { ctx._fichas = ctx._fichas || {}; ctx._fichas[n] = c; },
    cevenClienteTier: n => (ctx._fichas && ctx._fichas[n] && ctx._fichas[n].tier) || '',
    cevenNormClient: s => String(s||'').trim().toLowerCase().replace(/\s+/g,' ')
  };
  ctx.window = ctx;
  ctx.globalThis = ctx;
  ctx._sel = selGlobal;
  vm.createContext(ctx);
  // pricing-core.js primero: tiers.js es el envoltorio con DOM de esas cuentas.
  for(const f of ['src/poly/js/pricing-core.js', 'src/poly/js/tiers.js']){
    vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, {filename: f});
  }
  return ctx;
}

console.log('\nNiveles de precio de Poly · selector global + por línea\n');

console.log('1 · Un producto recién agregado toma el nivel global');
{
  const e = nuevoEntorno(T3);
  const it = {id:1, sku:'772D0AA', qty:1, salePrice:'', tier:''};
  e.repricearLinea(it);
  ok(it.salePrice === 225, 'con global Tier 3, la línea sale 225', 'dio ' + it.salePrice);
}

console.log('\n2 · Cambiar el global repricea SOLO las que lo siguen');
{
  const e = nuevoEntorno(T3);
  e.items = [
    {id:1, sku:'772D0AA', qty:1, salePrice:225, tier:''},          // sigue al global
    {id:2, sku:'772D0AA', qty:1, salePrice:190, tier:NE},          // nivel propio
    {id:3, sku:'772D0AA', qty:1, salePrice:900, tier:'MANUAL'}     // precio a mano
  ];
  e._sel.value = T1;                     // el usuario cambia el global a Tier 1
  const n = e.repricearPorGlobal();
  ok(n === 1,                   'informa 1 línea actualizada', 'dio ' + n);
  ok(e.items[0].salePrice === 235, 'la que seguía al global pasa a 235', 'dio ' + e.items[0].salePrice);
  ok(e.items[1].salePrice === 190, 'la de nivel propio queda en 190',    'dio ' + e.items[1].salePrice);
  ok(e.items[2].salePrice === 900, 'la MANUAL queda en 900',             'dio ' + e.items[2].salePrice);
}

console.log('\n3 · Escribir un precio a mano saca la línea del nivel');
{
  const e = nuevoEntorno(T3);
  e.items = [{id:1, sku:'772D0AA', qty:1, salePrice:225, tier:''}];
  e.marcarManual(1);
  ok(e.items[0].tier === 'MANUAL', 'la línea queda marcada como MANUAL');
  e._sel.value = T1;
  e.repricearPorGlobal();
  ok(e.items[0].salePrice === 225, 'y el global ya no la mueve', 'dio ' + e.items[0].salePrice);
}

console.log('\n4 · Elegir en la línea el MISMO nivel que el global la deja siguiéndolo');
{
  const e = nuevoEntorno(T3);
  e.items = [{id:1, sku:'772D0AA', qty:1, salePrice:190, tier:NE}];
  e.onTierLineaChange(1, T3);           // el usuario la vuelve al nivel global
  ok(e.items[0].tier === '', 'queda con tier vacío (sigue al global), no clavada en Tier 3');
  e._sel.value = T1;
  e.repricearPorGlobal();
  ok(e.items[0].salePrice === 235, 'así que el próximo cambio del global sí la mueve', 'dio ' + e.items[0].salePrice);
}

console.log('\n5 · Un SKU sin ese nivel no se pisa con 0');
{
  const e = nuevoEntorno(T1);
  const it = {id:1, sku:'SIN-TIER', qty:1, salePrice:'', tier:''};
  const cambio = e.repricearLinea(it);
  ok(cambio === false,      'repricearLinea() no toca nada');
  ok(it.salePrice === '',   'el precio queda vacío para completarlo a mano', 'dio ' + JSON.stringify(it.salePrice));
  ok(e.precioDeCatalogo('SIN-TIER', T1) === null, 'precioDeCatalogo() devuelve null, no 0');
}

console.log('\n6 · No se asume que los niveles estén ordenados');
{
  const e = nuevoEntorno(T2);
  const it = {id:1, sku:'A4LZ8AA', qty:1, salePrice:'', tier:''};
  e.repricearLinea(it);
  ok(it.salePrice === 4346, 'A4LZ8AA en Tier 2 sale 4346, más caro que su Tier 1 (3983,85)', 'dio ' + it.salePrice);
  ok(e.precioDeCatalogo('A4LZ8AA', T1) === 3983.85, 'y su Tier 1 sigue siendo 3983,85');
}

console.log('\n7 · El selector de línea muestra el precio de cada nivel');
{
  const e = nuevoEntorno(T3);
  const h = e.tierSelectHTML({id:1, sku:'772D0AA', qty:1, salePrice:225, tier:''});
  ok(/Tier 1 · 235/.test(h),          'la opción Tier 1 muestra 235');
  ok(/Neg\. Especiales · 190/.test(h),'la opción Neg. Especiales muestra 190');
  /* El valor guardado sigue siendo 'MANUAL' (viaja a `Nivel de precio` en
     cquotes) pero en pantalla dice "Custom" desde que se separaron los dos
     — ver TIER_MANUAL_LBL en poly/js/tiers.js. Este chequeo seguía buscando la
     etiqueta vieja y fallaba con el código correcto. */
  ok(/value="MANUAL"/.test(h),        'existe la opción de precio manual, guardada como MANUAL');
  ok(/>Custom</.test(h),              'la opción manual se lee "Custom" en pantalla');
  const h2 = e.tierSelectHTML({id:2, sku:'SIN-TIER', qty:1, salePrice:'', tier:''});
  ok(/Tier 1 · —/.test(h2),           'un SKU sin precios muestra "—" en vez de 0');
}

console.log('\n8 · El nivel se recuerda por cliente');
{
  const e = nuevoEntorno('');
  e._cliente = 'ACME S.A.';
  e._fichas = { 'ACME S.A.': { tier: NE } };
  e.aplicarTierDelCliente();
  ok(e._sel.value === NE, 'al elegir el cliente se propone su último nivel', 'dio ' + e._sel.value);

  const e2 = nuevoEntorno(T1);          // el usuario YA eligió uno a mano
  e2._cliente = 'ACME S.A.';
  e2._fichas = { 'ACME S.A.': { tier: NE } };
  e2.aplicarTierDelCliente();
  ok(e2._sel.value === T1, 'si ya había un nivel elegido, no se lo pisa', 'dio ' + e2._sel.value);
}

console.log('\n' + (fallos
  ? ('✗ ' + fallos + ' de ' + corridas + ' fallaron\n')
  : ('✓ ' + corridas + '/' + corridas + ' OK\n')));
process.exit(fallos ? 1 : 0);
