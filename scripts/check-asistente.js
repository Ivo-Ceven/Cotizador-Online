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
     · un JSON de argumentos inválido falla controlado, no con excepción;
     · armarPayloadGemini/parsearArgumentosGemini hablan el formato de la API
       de Interactions de Gemini (distinto al de OpenRouter/OpenAI) y caen
       controlado ante cualquier forma inesperada — Gemini es primario desde
       el 27/08/2026, con fallback a OpenRouter si falla o no da tool call;
     · elegirModelo() nunca escala sin OPENROUTER_MODEL_ESCALADO configurada;
     · _asisOrdenarPorRelevancia/_asisResolverListaSkus (src/shared/asistente.js,
       scope global de navegador) se cargan con vm — mismo patrón que
       check-poly-catalogo.js — porque no tienen module.exports.

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

/* ============================ 6b) Gemini (armado + parseo) ================= */
console.log('\narmarPayloadGemini / parsearArgumentosGemini\n');

const normGemini = core.normalizarCatalogoEntrada({mensaje: 'hola', catalogo: CATALOGO});
const payloadGemini = core.armarPayloadGemini(normGemini, 'modelo-de-prueba');
ok(payloadGemini.model === 'modelo-de-prueba', 'usa el modelo que se le pasa, no uno hardcodeado');
ok(payloadGemini.tools[0].name === 'proponer_items' && payloadGemini.tools[0].type === 'function',
  'declara la tool en formato Gemini (plana: type/name/description/parameters, no anidada bajo function como OpenAI)');
ok(payloadGemini.generation_config.tool_choice.allowed_tools.mode === 'any'
  && payloadGemini.generation_config.tool_choice.allowed_tools.tools.indexOf('proponer_items') !== -1,
  'fuerza la tool_choice a proponer_items siempre — nunca texto libre');
ok(typeof payloadGemini.system_instruction === 'string' && typeof payloadGemini.input === 'string',
  'system_instruction e input son texto plano — mismo construirSystemPrompt/construirMensajeUsuario que OpenRouter');
ok(payloadGemini.input.indexOf('235') !== -1, 'el price_ref SÍ viaja hacia el modelo (es contexto de presupuesto para él)');

const argsGeminiOk = core.parsearArgumentosGemini({
  steps: [{type: 'function_call', name: 'proponer_items', arguments: {items: [{id: 'X', cantidad: 1, motivo: 'x'}], nota: 'listo'}}]
});
ok(argsGeminiOk.ok && argsGeminiOk.items.length === 1 && argsGeminiOk.nota === 'listo',
  'function_call bien formada se parsea entera — arguments YA es objeto, no hace falta JSON.parse');

ok(core.parsearArgumentosGemini({}).ok === false, 'respuesta sin steps no rompe, falla controlado');
ok(core.parsearArgumentosGemini({steps: []}).ok === false, 'steps vacío falla controlado');
ok(core.parsearArgumentosGemini({steps: [{type: 'text', text: 'no llamé ninguna tool'}]}).ok === false,
  'un step que no es function_call (el modelo contestó texto en vez de forzar la tool) falla controlado');
ok(core.parsearArgumentosGemini({steps: [{type: 'function_call', name: 'otra_funcion', arguments: {items: []}}]}).ok === false,
  'una function_call de otra función (no proponer_items) se ignora');
ok(core.parsearArgumentosGemini({steps: [{type: 'function_call', name: 'proponer_items', arguments: {items: 'no es array'}}]}).ok === false,
  'arguments con items que no es array falla controlado');
ok(core.parsearArgumentosGemini(null).ok === false, 'null no tira excepción');

/* ====== 7) el recorte del catalogo: los dos topes y el aviso ================ */
console.log('\nRecorte del catálogo · el tope del cliente y el del server\n');

{
  const fsx = require('fs');
  const pathx = require('path');
  const ROOTx = pathx.resolve(__dirname, '..');
  const cliente = fsx.readFileSync(pathx.join(ROOTx, 'src/shared/asistente.js'), 'utf8');
  const m = /var CEVEN_ASIS_CATALOGO_MAX = (\d+);/.exec(cliente);
  ok(!!m, 'el cliente declara CEVEN_ASIS_CATALOGO_MAX');
  /* Duplicado a proposito (un modulo de navegador no puede require() uno de
     Node), asi que lo unico que lo sostiene es este chequeo: si se desfasan, el
     cliente manda de mas y el server lo tira SIN AVISAR — que es como se
     estuvieron perdiendo 203 productos de Poly. */
  ok(!!m && parseInt(m[1], 10) === core.CATALOGO_MAX,
     'y vale lo mismo que CATALOGO_MAX del server (' + core.CATALOGO_MAX + ')',
     m ? ('cliente ' + m[1] + ' vs server ' + core.CATALOGO_MAX) : '');
  ok(/catalogo_recortado/.test(cliente), 'el cliente lee cuántos productos quedaron afuera');

  const api = fsx.readFileSync(pathx.join(ROOTx, 'api/asistente.js'), 'utf8');
  ok(/catalogo_recortado: norm\.recortados/.test(api), 'y el server se lo manda en la respuesta');
  /* Las tres fallas de un proveedor tienen que distinguirse: con un solo
     mensaje no hay forma de saber desde la consola cuál pasó. Viven en
     llamarProveedor(), compartida entre Gemini y OpenRouter. */
  ok(/AbortError/.test(api) && /TIMEOUT/.test(api), 'el timeout se distingue de un fallo de red');
  ok(/504/.test(api), 'y se reporta como 504, no como 502');
  ok(/\.text\(\)\)\.slice\(0, 500\)/.test(api), 'un error de proveedor se loguea con su cuerpo, no solo el status');

  /* Gemini primario, OpenRouter fallback (27/08/2026): sin GEMINI_API_KEY
     tiene que seguir andando SOLO con OpenRouter, como antes. */
  ok(/GEMINI_API_KEY/.test(api), 'lee GEMINI_API_KEY de las env vars');
  ok(/x-goog-api-key/.test(api), 'llama a Gemini con su propio esquema de auth, no Bearer');
  ok(/if\(GEMINI_API_KEY\)/.test(api), 'Gemini se intenta primero, condicionado a que la key esté configurada');
  ok(/if\(!resultado\)/.test(api), 'OpenRouter corre solo si Gemini no dio un resultado usable — es el fallback, no una segunda opción en paralelo');
}

{
  // El recorte tiene que informarse, no solo aplicarse.
  const muchos = [];
  for(let i = 0; i < core.CATALOGO_MAX + 37; i++) muchos.push({id: 'SKU-' + i, description: 'p' + i});
  const n = core.normalizarCatalogoEntrada({mensaje: 'hola', catalogo: muchos});
  ok(n.catalogo.length === core.CATALOGO_MAX, 'el server sigue capeando en CATALOGO_MAX', String(n.catalogo.length));
  ok(n.recortados === 37, 'y ahora dice cuántos dejó afuera', String(n.recortados));
  const pocos = core.normalizarCatalogoEntrada({mensaje: 'hola', catalogo: [{id:'A', description:'a'}]});
  ok(pocos.recortados === 0, 'sin recorte informa 0, no undefined', String(pocos.recortados));
}


/* ====== 8) elegirModelo: escalado determinístico, apagado por default ====== */
console.log('\nelegirModelo · fail-safe y las dos condiciones necesarias\n');

function normPrueba(mensaje, catalogoLen, recortados){
  const catalogo = [];
  for(let i = 0; i < catalogoLen; i++) catalogo.push({id: 'X' + i, description: 'x'});
  return {mensaje: mensaje, catalogo: catalogo, recortados: recortados || 0};
}

ok(core.elegirModelo(normPrueba('pedido corto', 5, 0), 'default', '') === 'default',
  'sin OPENROUTER_MODEL_ESCALADO (string vacío), nunca escala aunque el resto de las señales digan que sí');

const mensajeLargo = new Array(core.PALABRAS_ESCALADO_MIN + 5).fill('palabra').join(' ');
ok(core.elegirModelo(normPrueba(mensajeLargo, 5, 0), 'default', 'potente') === 'default',
  'mensaje complejo pero catálogo chico y sin recorte: se queda en default');

ok(core.elegirModelo(normPrueba('pedido corto', core.CATALOGO_ESCALADO_MIN, 0), 'default', 'potente') === 'default',
  'catálogo grande pero mensaje simple: se queda en default (hacen falta las dos condiciones)');

ok(core.elegirModelo(normPrueba(mensajeLargo, core.CATALOGO_ESCALADO_MIN, 0), 'default', 'potente') === 'potente',
  'mensaje complejo por cantidad de palabras + catálogo grande: escala');

const mensajeConComas = 'auriculares, parlantes, monitores y bases';
ok(core.contarSeparadoresDeClausula(mensajeConComas) >= core.COMAS_ESCALADO_MIN,
  'mensaje de prueba tiene suficientes separadores de cláusula para el siguiente check');
ok(core.elegirModelo(normPrueba(mensajeConComas, core.CATALOGO_ESCALADO_MIN, 0), 'default', 'potente') === 'potente',
  'mensaje complejo por comas/conectores + catálogo grande: también escala');

ok(core.elegirModelo(normPrueba(mensajeLargo, 5, 3), 'default', 'potente') === 'potente',
  'mensaje complejo + el server tuvo que recortar de nuevo: escala aunque el catálogo recibido sea chico');

/* ====== 9) funciones de scope global en src/shared/asistente.js ============ */
console.log('\n_asisOrdenarPorRelevancia / _asisResolverListaSkus (scope global de navegador, vía vm)\n');

{
  const vm = require('vm');
  const fsx = require('fs');
  const pathx = require('path');
  const ROOTx = pathx.resolve(__dirname, '..');
  const src = fsx.readFileSync(pathx.join(ROOTx, 'src/shared/asistente.js'), 'utf8');
  const ctx = {console: console};
  vm.createContext(ctx);
  vm.runInContext(src, ctx);

  const CAT = [
    {id: '772D0AA', description: 'Sync 20+ auriculares con cancelacion de ruido', category: 'Audio', price_ref: 235},
    {id: 'A4LZ8AA', description: 'Studio X30 barra de video', category: 'Video', price_ref: 1899},
    {id: 'SVC-001', description: 'Instalacion tecnica', category: '', price_ref: null}
  ];

  const porRelevancia = ctx._asisOrdenarPorRelevancia('necesito auriculares para call center', CAT);
  ok(porRelevancia[0].id === '772D0AA', 'match de categoría/descripción trae el producto relevante primero',
    'quedó primero: ' + porRelevancia[0].id);

  const porSku = ctx._asisOrdenarPorRelevancia('quiero el A4LZ8AA', CAT);
  ok(porSku[0].id === 'A4LZ8AA', 'match exacto de SKU gana pase lo que pase, aunque no matchee ninguna palabra más');

  const sinTokens = ctx._asisOrdenarPorRelevancia('  ', CAT);
  ok(sinTokens === CAT, 'mensaje sin tokens útiles devuelve el MISMO array, intacto — no reordena por las dudas');

  const vago = ctx._asisOrdenarPorRelevancia('necesito para la oficina', CAT);
  ok(vago[0].price_ref !== null, 'mensaje vago (ningún token matchea nada) cae al criterio de siempre: precio disponible primero');

  const idsEntrada = CAT.map(p => p.id).slice().sort();
  const idsSalida = porRelevancia.map(p => p.id).slice().sort();
  ok(porRelevancia.length === CAT.length && JSON.stringify(idsEntrada) === JSON.stringify(idsSalida),
    'reordena, nunca filtra: mismo largo y mismo conjunto de ids que la entrada');

  const listaSkus = ctx._asisResolverListaSkus('772D0AA, A4LZ8AA', CAT);
  ok(!!listaSkus && listaSkus.items.length === 2, 'lista de 2+ SKUs pegados (separados por coma) se resuelve local, sin pasar por la IA');

  const noLista = ctx._asisResolverListaSkus('necesito auriculares para la sala de reuniones', CAT);
  ok(noLista === null, 'un pedido en lenguaje natural sin separadores de lista no se confunde con SKUs pegados');

  const listaParcial = ctx._asisResolverListaSkus('772D0AA, esto no es un sku', CAT);
  ok(listaParcial === null, 'si la mayoría de los tokens no matchea un SKU real, no se activa el atajo — sigue el camino normal');
}

console.log('\n' + (fallos ? '✗ ' + fallos + ' de ' + corridas + ' fallaron' : '✓ ' + corridas + ' chequeos OK') + '\n');
process.exit(fallos ? 1 : 0);
