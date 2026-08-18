#!/usr/bin/env node
/* ============================================================================
   check-asistente.js · Cotizadores Ceven
   ----------------------------------------------------------------------------
   api/_lib/asistente-core.js es la lógica PURA del endpoint /api/asistente
   (sin red, sin req/res): normaliza lo que manda el cliente, arma el payload
   de OpenRouter y valida lo que devuelve el modelo antes de reenviarlo. Como
   ya nace en Node/CommonJS puro (a diferencia del resto del bundle, que corre
   en scope global de navegador), se testea con require() directo, sin vm.

   Lo que importa verificar acá, porque si se rompe no tira ninguna excepción
   visible — el endpoint sigue respondiendo 200 con datos mal formados:

     · un id se matchea sin importar mayúsculas/minúsculas, PERO la respuesta
       lleva el casing EXACTO del catálogo real (poly/js/catalog.js compara
       SKUs con === , case-sensitive: propagar el casing del modelo rompería
       el alta aguas abajo);
     · un id que no está en el catálogo recibido nunca llega a `items`;
     · la cantidad se clampea en vez de rechazar la línea;
     · no filtra contra items_actuales — es a propósito (instrucción de
       prompt, no un filtro server-side, para no bloquear "3 más de esto");
     · nunca aparece un precio en la salida, ni de entrada ni de vuelta;
     · el catálogo/mensaje se capean sin tirar el request entero;
     · un JSON de argumentos inválido falla controlado, no con excepción.

   Uso:  node scripts/check-asistente.js
   ========================================================================== */
'use strict';
const core = require('../api/_lib/asistente-core.js');

let fallos = 0, corridas = 0;
function ok(cond, nombre, detalle){
  corridas++;
  if(cond){ console.log('  ✓ ' + nombre); return; }
  fallos++;
  console.error('  ✗ ' + nombre + (detalle ? ('\n      ' + detalle) : ''));
}

const CATALOGO = [
  {id: '772D0AA', description: 'Sync 20+', category: 'Audio', price_ref: 235},
  {id: 'A4LZ8AA', description: 'Studio X30', category: 'Video', price_ref: 1899}
];

/* ============================ 1) normalizarCatalogoEntrada ================= */
console.log('\nnormalizarCatalogoEntrada · capea y descarta sin tirar el request\n');

let norm = core.normalizarCatalogoEntrada({mensaje: 'hola', catalogo: CATALOGO, items_actuales: [{id: 'A4LZ8AA', qty: 2}]});
ok(norm.mensaje === 'hola', 'mensaje pasa tal cual si está dentro del límite');
ok(norm.catalogo.length === 2, 'el catálogo válido pasa entero');
ok(norm.itemsActuales.length === 1 && norm.itemsActuales[0].qty === 2, 'items_actuales se normaliza');

norm = core.normalizarCatalogoEntrada({mensaje: 'x'.repeat(core.MENSAJE_MAX + 500)});
ok(norm.mensaje.length === core.MENSAJE_MAX, 'mensaje gigante se recorta al tope', 'largo: ' + norm.mensaje.length);

const catalogoGigante = [];
for(let i = 0; i < core.CATALOGO_MAX + 300; i++) catalogoGigante.push({id: 'SKU' + i, description: 'x'});
norm = core.normalizarCatalogoEntrada({mensaje: 'hola', catalogo: catalogoGigante});
ok(norm.catalogo.length === core.CATALOGO_MAX, 'catálogo gigante se capea al tope', 'largo: ' + norm.catalogo.length);

norm = core.normalizarCatalogoEntrada({
  mensaje: 'hola',
  catalogo: [{id: 'OK1', description: 'bien'}, {id: '', description: 'sin id'}, {description: 'falta id'}, null, {id: 'OK2', description: 'bien'}]
});
ok(norm.catalogo.length === 2 && norm.catalogo[0].id === 'OK1' && norm.catalogo[1].id === 'OK2',
  'entradas mal formadas del catálogo se descartan una por una, no tiran el request entero');

norm = core.normalizarCatalogoEntrada({});
ok(norm.mensaje === '' && norm.catalogo.length === 0 && norm.itemsActuales.length === 0,
  'body vacío no rompe, devuelve todo vacío');

/* ============================ 2) validarPropuestaModelo ==================== */
console.log('\nvalidarPropuestaModelo · nunca deja pasar un id inventado ni un precio\n');

let r = core.validarPropuestaModelo({items: [{id: '772d0aa', cantidad: 2, motivo: 'para la sala'}]}, CATALOGO);
ok(r.items.length === 1, 'id case-insensitive matchea contra el catálogo');
ok(r.items[0].id === '772D0AA', 'pero el resultado devuelve el CASING EXACTO del catálogo real, no el del modelo',
  'devolvió: ' + r.items[0].id);

r = core.validarPropuestaModelo({items: [{id: 'NO-EXISTE', cantidad: 1, motivo: 'x'}]}, CATALOGO);
ok(r.items.length === 0, 'id que no está en el catálogo nunca llega a items');
ok(r.no_encontrados.indexOf('NO-EXISTE') !== -1, 'y aparece en no_encontrados');

r = core.validarPropuestaModelo({items: [
  {id: '772D0AA', cantidad: 0, motivo: 'x'},
  {id: 'A4LZ8AA', cantidad: 99999, motivo: 'x'}
]}, CATALOGO);
ok(r.items[0].cantidad === core.CANTIDAD_MIN, 'cantidad 0 (o negativa) se clampea al mínimo, no se rechaza la línea',
  'quedó en: ' + r.items[0].cantidad);
ok(r.items[1].cantidad === core.CANTIDAD_MAX, 'cantidad enorme se clampea al máximo',
  'quedó en: ' + r.items[1].cantidad);

r = core.validarPropuestaModelo({items: [
  {id: '772D0AA', cantidad: 1, motivo: 'a'},
  {id: '772d0aa', cantidad: 5, motivo: 'b'}
]}, CATALOGO);
ok(r.items.length === 1, 'el mismo id repetido con distinto casing no duplica la línea');

r = core.validarPropuestaModelo({items: [{id: '772D0AA', cantidad: 1, motivo: 'la sala necesita esto'}]}, CATALOGO);
ok(Object.prototype.hasOwnProperty.call(r.items[0], 'description') && Object.prototype.hasOwnProperty.call(r.items[0], 'category'),
  'cada item se enriquece con description/category DEL CATÁLOGO VALIDADO');
ok(!('price' in r.items[0]) && !('price_ref' in r.items[0]) && !('salePrice' in r.items[0]),
  'ningún campo de precio aparece nunca en la salida — el asistente no calcula ni transporta precio');

r = core.validarPropuestaModelo({items: []}, CATALOGO);
ok(r.items.length === 0 && r.no_encontrados.length === 0, 'propuesta vacía no rompe');

/* ================= 3) NO filtra contra items_actuales, a propósito ========= */
console.log('\nNo filtra contra items_actuales — instrucción de prompt, no un filtro duro\n');

r = core.validarPropuestaModelo({items: [{id: '772D0AA', cantidad: 3, motivo: '3 más de este mismo'}]}, CATALOGO);
ok(r.items.length === 1,
  'un id que YA está en items_actuales igual pasa la validación: el filtro es instrucción de prompt (el vendedor puede pedir "3 más de este mismo"), no algo que el servidor bloquee — si esto empieza a fallar, alguien "arregló" el filtro por error');

/* ============================ 4) parsearArgumentosToolCall ================= */
console.log('\nparsearArgumentosToolCall · nunca tira excepción\n');

const argsToolCallOk = JSON.stringify({items: [{id: 'X', cantidad: 1, motivo: 'x'}], nota: 'listo'});
let p = core.parsearArgumentosToolCall({
  choices: [
    {message: {tool_calls: [
      {function: {arguments: argsToolCallOk}}
    ]}}
  ]
});
ok(p.ok && p.items.length === 1 && p.nota === 'listo', 'tool call bien formada se parsea entera');

ok(core.parsearArgumentosToolCall({}).ok === false, 'respuesta sin choices no rompe, falla controlado');
ok(core.parsearArgumentosToolCall({choices: [{message: {}}]}).ok === false, 'mensaje sin tool_calls falla controlado');
ok(core.parsearArgumentosToolCall({
  choices: [{message: {tool_calls: [{function: {arguments: '{esto no es json'}}]}}]
}).ok === false, 'JSON de argumentos inválido falla controlado, no tira excepción');
ok(core.parsearArgumentosToolCall({
  choices: [{message: {tool_calls: [{function: {arguments: JSON.stringify({items: 'no es array'})}}]}}]
}).ok === false, 'argumentos con items que no es array también falla controlado');

/* ============================ 5) TOOL_SCHEMA ================================ */
console.log('\nTOOL_SCHEMA · forma mínima esperada\n');

ok(core.TOOL_SCHEMA.type === 'function' && core.TOOL_SCHEMA.function.name === 'proponer_items',
  'la tool se llama proponer_items, forzable con tool_choice');
const propsTool = core.TOOL_SCHEMA.function.parameters.properties.items.items.properties;
ok(!!propsTool.id && !!propsTool.cantidad && !!propsTool.motivo,
  'el schema de cada item pide id + cantidad + motivo');

/* ============================ 6) armarPayloadOpenRouter ==================== */
console.log('\narmarPayloadOpenRouter\n');

const payload = core.armarPayloadOpenRouter(core.normalizarCatalogoEntrada({mensaje: 'hola', catalogo: CATALOGO}), 'modelo-de-prueba');
ok(payload.model === 'modelo-de-prueba', 'usa el modelo que se le pasa, no uno hardcodeado');
ok(payload.tool_choice && payload.tool_choice.function.name === 'proponer_items', 'tool_choice fuerza proponer_items siempre — nunca texto libre');
ok(JSON.stringify(payload).indexOf('235') !== -1, 'el price_ref SÍ viaja hacia el modelo (es contexto de presupuesto para él)');

console.log('\n' + (fallos ? '✗ ' + fallos + ' de ' + corridas + ' fallaron' : '✓ ' + corridas + ' chequeos OK') + '\n');
process.exit(fallos ? 1 : 0);
