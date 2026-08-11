#!/usr/bin/env node
/* ============================================================================
   check-emitir.js · Cotizadores Ceven
   ----------------------------------------------------------------------------
   La emisión es el paso del multimarca que ESCRIBE EN OTRAS MARCAS: crea la
   cotización en el historial de Apple o de Poly y su fila en el pipeline de esa
   marca. Es lo más caro de equivocarse, porque el error no se ve en la pantalla
   del multimarca sino en el pipeline de otro, dos días después.

   Lo que se verifica acá:

     · REPARTO      a cada marca solo sus líneas
     · NUMERACIÓN   nunca reusa un número que ya existe, ni retrocede el contador
     · RE-EMISIÓN   emitir dos veces no duplica, y NO pisa el seguimiento
                    (estado, mes de cierre, link de OV/Netsuite) que cargó la marca
     · TOTALES      el monto de la fila es el de sus líneas en cquotes

   Corre el planificador REAL (cevenEmitirPlan de src/multi/js/emitir.js), que es
   puro a propósito: recibe el estado remoto y devuelve exactamente lo que se va
   a escribir. La capa REST no se prueba acá — solo transporta.

   Uso:  node scripts/check-emitir.js
   ========================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const lee = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

let fallos = 0, corridas = 0;
function ok(cond, nombre, detalle){
  corridas++;
  if(cond){ console.log('  ✓ ' + nombre); return; }
  fallos++;
  console.error('  ✗ ' + nombre + (detalle ? ('\n      ' + detalle) : ''));
}

const T1 = 'Ceven - Tier 1', NE = 'Negocios Especiales';

const CAT_APPLE = [
  {sku:'MX2H3LE/A', description:'MacBook Pro 14', lob:'MacBook Pro 14', modelCol:'MacBook Pro 14', sellingPrice:1799},
  {sku:'MYD83LE/A', description:'iPhone 17 Pro',  lob:'iPhone 17 Pro',  modelCol:'iPhone 17 Pro',  sellingPrice:1099}
];
const CAT_POLY = [
  {sku:'772D0AA', description:'Sync 20+',   iva:'21%', precios:{[T1]:235, [NE]:190}},
  {sku:'A4LZ8AA', description:'Studio AIO', iva:'21%', precios:{[T1]:3983.85, [NE]:3912}}
];

/* El entorno del multimarca: los núcleos de precio de cada marca, el registro y
   el planificador. Nada de DOM — emitir.js separa el plan del transporte
   justamente para poder correrlo así. */
function entorno(){
  const ctx = { console, Date, Math, JSON, Object, parseInt, String, encodeURIComponent };
  ctx.window = ctx; ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(lee('src/apple/js/pricing-core.js'), ctx, {filename:'apple/pricing-core.js'});
  vm.runInContext(lee('src/poly/js/pricing-core.js'),  ctx, {filename:'poly/pricing-core.js'});
  vm.runInContext(lee('src/multi/js/marcas.js'), ctx, {filename:'marcas.js'});
  // De shared/quote-num.js el planificador solo usa el formateo del número.
  ctx.cevenQNumFmt = n => String(n).padStart(4, '0');
  vm.runInContext(lee('src/multi/js/emitir.js'), ctx, {filename:'emitir.js'});
  return ctx;
}

const E = entorno();

function ctxBase(extra){
  const base = {
    fecha:'11/08/2026', hora:'10:30', fechaISO:'2026-08-11T13:30:00.000Z',
    cliente:'ACME S.A.', proyecto:'Sala de reuniones', opg:'', ejecutivo:'Ivo',
    obs:'—', mesCierre:'2026-09', estado:'Cotizado',
    payMode:'30 días', effDate:'2026-08-31', delivery:'Inmediata',
    multiQNum:'M-0042', margen:12, fob:false, tierGlobal:T1,
    nacRates: JSON.parse(JSON.stringify(E.CEVEN_APPLE_NAC_DEF)),
    catalogos:{apple:CAT_APPLE, poly:CAT_POLY}
  };
  for(const k in (extra||{})) base[k] = extra[k];
  return base;
}

// Un pedido mixto: 2 líneas de Apple + 2 de Poly.
function pedidoMixto(ctx){
  return [
    E.CEVEN_MULTI_MARCAS.apple.nuevaLinea(CAT_APPLE[0], ctx),
    E.CEVEN_MULTI_MARCAS.poly.nuevaLinea(CAT_POLY[0], ctx),
    E.CEVEN_MULTI_MARCAS.apple.nuevaLinea(CAT_APPLE[1], ctx),
    E.CEVEN_MULTI_MARCAS.poly.nuevaLinea(CAT_POLY[1], ctx)
  ];
}

const VACIO = () => ({apple:{cqc:0, cquotes:[], pipeline:[]}, poly:{cqc:0, cquotes:[], pipeline:[]}});

console.log('\nEmisión del multimarca a cada marca\n');

/* ============================== 1) REPARTO ================================ */
console.log('1 · A cada marca solo lo suyo');
{
  const ctx = ctxBase();
  const planes = E.cevenEmitirPlan(pedidoMixto(ctx), ctx, VACIO(), {});
  ok(planes.length === 2, 'sale un plan por marca', 'dio ' + planes.length);

  const pA = planes.find(p => p.brand === 'apple');
  const pP = planes.find(p => p.brand === 'poly');
  ok(pA.cquotes.length === 2, 'Apple recibe 2 filas', 'dio ' + pA.cquotes.length);
  ok(pP.cquotes.length === 2, 'Poly recibe 2 filas',  'dio ' + pP.cquotes.length);
  ok(pA.cquotes.every(r => r['SKU'].indexOf('LE/A') > 0), 'y ninguna línea de Poly se cuela en Apple');
  ok(pP.cquotes.every(r => r['Nivel de precio'] === T1), 'las de Poly llevan su nivel de precio');
  ok(pA.cquotes.every(r => r['Margen %'] === 12), 'las de Apple llevan su margen');
  ok(pA.cquotes.every(r => r['_multi'] === 'M-0042') && pP.cquotes.every(r => r['_multi'] === 'M-0042'),
     'todas quedan linkeadas al pedido que las originó');
  ok(pA.pipeRow.brand === 'apple' && pP.pipeRow.brand === 'poly',
     'cada fila de pipeline lleva su marca (la PK es (brand,id))');
  ok(pA.pipeRow.id !== pP.pipeRow.id, 'y con ids distintos');
}

/* ============================= 2) NUMERACIÓN ============================== */
console.log('\n2 · Numeración: nunca pisar un número de la marca');
{
  const ctx = ctxBase();
  const remotos = VACIO();
  remotos.apple.cqc = 70;
  remotos.poly.cqc  = 12;
  let planes = E.cevenEmitirPlan(pedidoMixto(ctx), ctx, remotos, {});
  ok(planes.find(p => p.brand==='apple').qn === '0071', 'Apple toma el siguiente de SU contador (0071)',
     'dio ' + planes.find(p => p.brand==='apple').qn);
  ok(planes.find(p => p.brand==='poly').qn === '0013', 'Poly toma el suyo (0013), no el de Apple',
     'dio ' + planes.find(p => p.brand==='poly').qn);

  // Contador atrasado: hay cotizaciones con números más altos que `cqc`.
  const remotos2 = VACIO();
  remotos2.apple.cqc = 5;
  remotos2.apple.cquotes = [{'N° Cotización':'0088','SKU':'X'}];
  remotos2.apple.pipeline = [{qNum:'0091', id:1, estado:'Con OC'}];
  planes = E.cevenEmitirPlan(pedidoMixto(ctx), ctx, remotos2, {});
  const a = planes.find(p => p.brand==='apple');
  ok(a.qn === '0092', 'con el contador atrasado, igual sale por encima del mayor que existe de verdad',
     'dio ' + a.qn);
  ok(a.cqcNuevo === 92, 'y el contador de esa marca se deja en 92', 'dio ' + a.cqcNuevo);

  // El contador nunca baja.
  const remotos3 = VACIO();
  remotos3.apple.cqc = 500;
  planes = E.cevenEmitirPlan(pedidoMixto(ctx), ctx, remotos3, {apple:'0007'});
  ok(planes.find(p => p.brand==='apple').cqcNuevo === 500,
     're-emitir sobre un número viejo NO retrocede el contador',
     'dio ' + planes.find(p => p.brand==='apple').cqcNuevo);
}

/* ============================ 3) RE-EMISIÓN =============================== */
console.log('\n3 · Re-emitir pisa, no duplica');
{
  const ctx = ctxBase();
  const items = pedidoMixto(ctx);
  const remotos = VACIO();
  remotos.apple.cqc = 70; remotos.poly.cqc = 12;

  // Primera emisión: se aplica al estado remoto simulado.
  let planes = E.cevenEmitirPlan(items, ctx, remotos, {});
  const emitidas = {};
  planes.forEach(function(p){
    remotos[p.brand].cquotes = p.cquotes;
    remotos[p.brand].pipeline = [p.pipeRow];
    remotos[p.brand].cqc = p.cqcNuevo;
    emitidas[p.brand] = p.qn;
  });
  ok(remotos.apple.cquotes.length === 2, 'tras la primera emisión, Apple tiene 2 filas');

  // La marca hace su trabajo sobre esa fila: la mueve de estado y le carga la OV.
  remotos.apple.pipeline[0].estado    = 'Con OC';
  remotos.apple.pipeline[0].ovLink    = 'https://netsuite/ov/123';
  remotos.apple.pipeline[0].mesCierre = '2026-12';
  const idOriginal = remotos.apple.pipeline[0].id;
  remotos.poly.pipeline[0].factura = 'https://netsuite/proj/9';
  remotos.poly.pipeline[0].opg     = 'OPG-77';

  // En el multimarca cambia una cantidad y se re-emite.
  items[0].qty = 5;
  planes = E.cevenEmitirPlan(items, ctx, remotos, emitidas);
  const a2 = planes.find(p => p.brand === 'apple');
  const p2 = planes.find(p => p.brand === 'poly');

  ok(a2.qn === '0071', 'reusa el MISMO número de Apple', 'dio ' + a2.qn);
  ok(a2.reemision === true, 'y se sabe que es una re-emisión');
  ok(a2.cquotes.length === 2, 'el historial sigue con 2 filas, no 4', 'dio ' + a2.cquotes.length);
  ok(a2.cquotes.filter(r => r['N° Cotización'] === '0071').length === 2,
     'todas las filas son del mismo número');
  ok(a2.cquotes.find(r => r['SKU'] === 'MX2H3LE/A')['Cantidad'] === 5,
     'con la cantidad nueva', 'dio ' + a2.cquotes.find(r => r['SKU'] === 'MX2H3LE/A')['Cantidad']);

  ok(a2.pipeRow.id === idOriginal, 'la fila del pipeline es LA MISMA (mismo id), no una nueva');
  ok(a2.pipeRow.estado === 'Con OC',    'el estado que puso la marca NO se pisa', 'dio ' + a2.pipeRow.estado);
  ok(a2.pipeRow.ovLink === 'https://netsuite/ov/123', 'ni el link de la OV');
  ok(a2.pipeRow.mesCierre === '2026-12', 'ni el mes de cierre que corrigió la marca', 'dio ' + a2.pipeRow.mesCierre);
  ok(p2.pipeRow.factura === 'https://netsuite/proj/9', 'en Poly, ni el link de Netsuite');
  ok(p2.pipeRow.opg === 'OPG-77', 'ni el OPG que asignó la marca', 'dio ' + p2.pipeRow.opg);
  ok(a2.esNueva === false, 'y no se reporta como fila nueva');

  // Emitir dos veces seguidas sin cambiar nada deja todo igual: idempotente.
  const planes3 = E.cevenEmitirPlan(items, ctx, {
    apple: {cqc: a2.cqcNuevo, cquotes: a2.cquotes, pipeline: [a2.pipeRow]},
    poly:  {cqc: p2.cqcNuevo, cquotes: p2.cquotes, pipeline: [p2.pipeRow]}
  }, emitidas);
  const a3 = planes3.find(p => p.brand === 'apple');
  ok(a3.cquotes.length === 2, 'una tercera emisión sigue dejando 2 filas', 'dio ' + a3.cquotes.length);
  ok(a3.pipeRow.id === idOriginal, 'y la misma fila de pipeline');
  ok(JSON.stringify(a3.cquotes) === JSON.stringify(a2.cquotes),
     'el historial queda byte a byte igual: la emisión es idempotente');
}

/* ===================== 4) NO SE TOCA LO DE OTRAS COTIZACIONES ============= */
console.log('\n4 · El historial de la marca no se daña');
{
  const ctx = ctxBase();
  const remotos = VACIO();
  remotos.apple.cqc = 70;
  remotos.apple.cquotes = [
    {'N° Cotización':'0011','SKU':'VIEJA-1','Cliente':'Otro cliente'},
    {'N° Cotización':'0011','SKU':'VIEJA-2','Cliente':'Otro cliente'}
  ];
  const planes = E.cevenEmitirPlan(pedidoMixto(ctx), ctx, remotos, {});
  const a = planes.find(p => p.brand === 'apple');
  ok(a.cquotes.length === 4, 'las filas que ya estaban se conservan', 'dio ' + a.cquotes.length);
  ok(a.cquotes.filter(r => r['N° Cotización'] === '0011').length === 2,
     'la cotización de otro cliente queda intacta');
  ok(a.cquotes.filter(r => r['SKU'] === 'VIEJA-1')[0]['Cliente'] === 'Otro cliente',
     'con sus datos sin tocar');
}

/* ============================== 5) TOTALES ================================ */
console.log('\n5 · El monto de la fila es el de sus líneas');
{
  const ctx = ctxBase();
  const items = pedidoMixto(ctx);
  items[0].qty = 3;   // Apple
  items[1].qty = 4;   // Poly
  const planes = E.cevenEmitirPlan(items, ctx, VACIO(), {});

  planes.forEach(function(p){
    const suma = p.cquotes.reduce((t, r) => t + (parseFloat(r['Total']) || 0), 0);
    ok(p.pipeRow.monto === Math.round(suma),
       cevenLbl(p.brand) + ': fila ' + p.pipeRow.monto + ' = suma de líneas ' + Math.round(suma));
  });

  const a = planes.find(p => p.brand === 'apple');
  ok(a.pipeRow.qMac === 3, 'Apple abre por familia: 3 Mac', 'dio ' + a.pipeRow.qMac);
  ok(a.pipeRow.qIph === 1, 'y 1 iPhone', 'dio ' + a.pipeRow.qIph);
  ok(typeof a.pipeRow.margenPond === 'number', 'con margen ponderado');
  ok(a.pipeRow.esFOB === false, 'y el flag FOB, que Observaciones no lleva al pipeline');

  const p = planes.find(x => x.brand === 'poly');
  ok(p.pipeRow.qMac === undefined, 'Poly no lleva familias de Apple en su fila');
  ok(p.pipeRow.factura === null, 'y su columna de Netsuite arranca vacía');
}

function cevenLbl(b){ return E.cevenMultiMarcaLabel(b); }

/* ========================= 6) CASOS QUE NO SE EMITEN ====================== */
console.log('\n6 · Lo que no se puede emitir se dice, no se inventa');
{
  const ctx = ctxBase();
  const soloApple = [E.CEVEN_MULTI_MARCAS.apple.nuevaLinea(CAT_APPLE[0], ctx)];
  const planes = E.cevenEmitirPlan(soloApple, ctx, VACIO(), {});
  ok(planes.length === 1 && planes[0].brand === 'apple',
     'un pedido de una sola marca emite a esa sola marca');

  const conDesconocida = soloApple.concat([{brand:'hp', sku:'X', description:'Notebook', qty:1, salePrice:100}]);
  const planes2 = E.cevenEmitirPlan(conDesconocida, ctx, VACIO(), {});
  const hp = planes2.find(p => p.brand === 'hp');
  ok(hp && hp.error, 'una marca que el registro no conoce devuelve un error explícito, no una fila vacía',
     JSON.stringify(hp));
  ok(!hp.pipeRow, 'y no arma ninguna fila de pipeline para ella');
}

console.log('\n' + (fallos
  ? ('✗ ' + fallos + ' de ' + corridas + ' fallaron\n')
  : ('✓ ' + corridas + '/' + corridas + ' OK\n')));
process.exit(fallos ? 1 : 0);
