'use strict';
/* ============================================================================
   /api/asistente  ·  gateway propio hacia OpenRouter
   ----------------------------------------------------------------------------
   Primera función serverless del proyecto (hoy todo lo demás es estático +
   Supabase REST directo desde el cliente). No sabe de marcas: recibe un
   catálogo compacto {id, description, category, price_ref} + un mensaje en
   lenguaje natural, y devuelve qué `id` propone agregar. Nunca calcula ni
   devuelve precio — eso lo sigue haciendo el código determinístico de cada
   marca al aplicar la selección (ver src/shared/asistente.js).

   Sirve igual para un vendedor interno que para un cliente del portal
   multimarca que se está por construir: los dos tienen un JWT real de
   Supabase, así que el gate de auth no distingue quién llama.

   CommonJS, sin dependencias npm — sigue la única convención de Node que ya
   existía en el repo (scripts/check-*.js).
   ============================================================================ */

var core = require('./_lib/asistente-core');

// Duplicados a propósito: son la misma publishable key pública de
// src/shared/config.js — un script de navegador no se puede `require` desde
// Node. Si el proyecto de Supabase cambia, tocar los dos lugares.
var SUPABASE_URL = 'https://iqewnebpdyctexavtpmt.supabase.co';
var SUPABASE_ANON_KEY = 'sb_publishable_Za9l64nzVBsaKHrSCgeu0w_x7Vhe7Aa';

// Gratuito (":free") y soporta tool_choice forzado — confirmado contra
// GET https://openrouter.ai/api/v1/models el 18/08/2026. Si algún día deja de
// existir o de sostener tool-calling, OPENROUTER_MODEL en las env vars lo pisa
// sin tocar código; no hace falta que sea gratis, es solo el default.
var OPENROUTER_MODEL_DEFAULT = 'nvidia/nemotron-3.5-lightning:free';

// Modelo al que core.elegirModelo() escala para pedidos complejos contra un
// catálogo grande (ver api/_lib/asistente-core.js). Sin setear, el escalado
// queda apagado del todo — es a propósito: nadie paga de más sin que un
// operador lo configure explícitamente.
var OPENROUTER_MODEL_ESCALADO = process.env.OPENROUTER_MODEL_ESCALADO || '';

/* 25 s y no 20: la función tiene `maxDuration: 30` en vercel.json, así que
   había 10 s de margen sin usar. Se subió el 24/08, cuando el catálogo de Poly
   pasó de 77 a 703 productos por el Excel de deals y el prompt se hizo ~5 veces
   más grande: con un modelo del tier gratuito, 20 s dejaron de alcanzar.
   El techo sigue siendo `maxDuration`; pasarse de ahí lo corta Vercel con un
   504 propio y el usuario ve un error sin explicación en vez del nuestro. */
var OPENROUTER_TIMEOUT_MS = 25000;
var RATE_LIMIT_POR_HORA = 30;

function jsonError(res, status, msg){
  res.status(status).json({ok: false, error: msg});
}

async function verificarSesion(token){
  if(!token) return null;
  try{
    var r = await fetch(SUPABASE_URL + '/auth/v1/user', {
      headers: {'Authorization': 'Bearer ' + token, 'apikey': SUPABASE_ANON_KEY}
    });
    if(!r.ok) return null;
    var j = await r.json();
    return (j && j.id) ? j : null;
  }catch(e){
    return null;
  }
}

/* Cuántas veces usó el asistente este usuario en la última hora. Cuenta
   contra Supabase con el JWT que ya reenvía el cliente (RLS: cada uno ve
   solo sus propias filas de asistente_usage) — sin sumar Redis/KV nuevo.
   Si el conteo falla por lo que sea, no se bloquea al usuario por un
   problema nuestro: se deja pasar. */
async function contarUsosRecientes(token, userId){
  try{
    var desde = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    var url = SUPABASE_URL + '/rest/v1/asistente_usage'
      + '?user_id=eq.' + encodeURIComponent(userId)
      + '&ts=gte.' + encodeURIComponent(desde)
      + '&select=id';
    var r = await fetch(url, {
      headers: {
        'Authorization': 'Bearer ' + token, 'apikey': SUPABASE_ANON_KEY,
        'Prefer': 'count=exact', 'Range-Unit': 'items', 'Range': '0-0'
      }
    });
    if(!r.ok) return 0;
    var contentRange = r.headers.get('content-range') || '';
    var m = /\/(\d+)$/.exec(contentRange);
    return m ? parseInt(m[1], 10) : 0;
  }catch(e){
    return 0;
  }
}

/* Fire-and-forget: si el insert de auditoría falla no debe tumbar la
   respuesta que ya se le va a dar al usuario. */
function registrarUso(token, userId){
  fetch(SUPABASE_URL + '/rest/v1/asistente_usage', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + token, 'apikey': SUPABASE_ANON_KEY,
      'Content-Type': 'application/json', 'Prefer': 'return=minimal'
    },
    body: JSON.stringify({user_id: userId})
  }).catch(function(){});
}

module.exports = async function handler(req, res){
  if(req.method !== 'POST') return jsonError(res, 405, 'Método no permitido.');
  if(!process.env.OPENROUTER_API_KEY) return jsonError(res, 500, 'Falta configurar OPENROUTER_API_KEY.');

  var authHeader = req.headers['authorization'] || '';
  var token = authHeader.indexOf('Bearer ') === 0 ? authHeader.slice(7) : '';
  var user = await verificarSesion(token);
  if(!user) return jsonError(res, 401, 'No autenticado.');

  var usos = await contarUsosRecientes(token, user.id);
  if(usos >= RATE_LIMIT_POR_HORA){
    return jsonError(res, 429, 'Superaste el límite de consultas al asistente por hora. Probá de nuevo más tarde.');
  }

  var norm = core.normalizarCatalogoEntrada(req.body);
  if(!norm.mensaje) return jsonError(res, 400, 'Falta el mensaje.');
  if(!norm.catalogo.length) return jsonError(res, 400, 'El catálogo recibido está vacío.');

  var modeloDefault = process.env.OPENROUTER_MODEL || OPENROUTER_MODEL_DEFAULT;
  var modeloElegido = core.elegirModelo(norm, modeloDefault, OPENROUTER_MODEL_ESCALADO);
  if(modeloElegido !== modeloDefault){
    console.warn('[asistente] escalado a ' + modeloElegido + ' · palabras=' + core.contarPalabras(norm.mensaje)
      + ' · catalogo=' + norm.catalogo.length + ' · recortados=' + norm.recortados);
  }
  var payload = core.armarPayloadOpenRouter(norm, modeloElegido);

  var controller = new AbortController();
  var timeout = setTimeout(function(){ controller.abort(); }, OPENROUTER_TIMEOUT_MS);
  var t0 = Date.now();
  var orRes;
  try{
    orRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + process.env.OPENROUTER_API_KEY,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://cotizadores-ceven.vercel.app',
        'X-Title': 'Cotizadores Ceven - Asistente IA'
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
  }catch(e){
    /* Tres fallas MUY distintas caían en el mismo cartel "No se pudo contactar
       al proveedor de IA": que se agote el timeout, que falle la red, y que la
       respuesta no sea JSON. Con un solo mensaje no hay forma de saber cuál
       pasó mirando la consola del navegador — que es de donde salió el reporte
       del 24/08 — y las tres se arreglan distinto. Ahora cada una se nombra. */
    var abortado = e && (e.name === 'AbortError' || controller.signal.aborted);
    console.warn('[asistente] ' + (abortado ? 'TIMEOUT' : 'FALLO DE RED') + ' hacia OpenRouter'
      + ' tras ' + (Date.now() - t0) + 'ms · modelo=' + payload.model
      + ' · catalogo=' + norm.catalogo.length + ' productos'
      + ' · payload=' + JSON.stringify(payload).length + ' bytes', e);
    clearTimeout(timeout);
    return abortado
      ? jsonError(res, 504, 'El asistente tardó más de ' + Math.round(OPENROUTER_TIMEOUT_MS/1000)
          + ' segundos y se cortó. Probá con un pedido más corto, o de nuevo en un rato.')
      : jsonError(res, 502, 'No se pudo contactar al proveedor de IA.');
  }
  clearTimeout(timeout);

  if(!orRes.ok){
    /* El cuerpo del error de OpenRouter dice POR QUÉ (modelo inexistente,
       créditos agotados, rate limit del tier gratuito...). Loguearlo es la
       diferencia entre saberlo y adivinar; al usuario no se le muestra. */
    var detalle = '';
    try{ detalle = (await orRes.text()).slice(0, 500); }catch(e2){}
    console.warn('[asistente] OpenRouter respondió ' + orRes.status + ' en ' + (Date.now() - t0)
      + 'ms · modelo=' + payload.model + ' · ' + detalle);
    return jsonError(res, 502, orRes.status === 429
      ? 'El proveedor de IA está saturado en este momento. Probá de nuevo en un rato.'
      : 'El proveedor de IA respondió con un error.');
  }

  var openRouterJson;
  try{
    openRouterJson = await orRes.json();
  }catch(e3){
    console.warn('[asistente] OpenRouter devolvió 200 con un cuerpo que no es JSON:', e3);
    return jsonError(res, 502, 'El proveedor de IA devolvió una respuesta ilegible.');
  }

  var args = core.parsearArgumentosToolCall(openRouterJson);
  if(!args.ok) return jsonError(res, 502, 'El modelo no devolvió una propuesta entendible.');

  var resultado = core.validarPropuestaModelo(args, norm.catalogo);

  registrarUso(token, user.id);

  if(norm.recortados){
    console.warn('[asistente] catalogo recortado: llegaron ' + (norm.catalogo.length + norm.recortados)
      + ' productos y se usaron ' + norm.catalogo.length);
  }

  res.status(200).json({
    ok: true,
    items: resultado.items,
    no_encontrados: resultado.no_encontrados,
    nota: args.nota || '',
    /* Cuantos productos NO vio el modelo. Va en la respuesta y no solo en el
       log porque cambia como hay que leer un "no encontre nada": puede ser que
       el producto exista y nunca haya llegado. */
    catalogo_recortado: norm.recortados || 0
  });
};
