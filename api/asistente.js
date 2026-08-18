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

var OPENROUTER_TIMEOUT_MS = 20000;
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

  var payload = core.armarPayloadOpenRouter(norm, process.env.OPENROUTER_MODEL || OPENROUTER_MODEL_DEFAULT);

  var controller = new AbortController();
  var timeout = setTimeout(function(){ controller.abort(); }, OPENROUTER_TIMEOUT_MS);
  var openRouterJson;
  try{
    var orRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
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
    if(!orRes.ok){
      console.warn('[asistente] OpenRouter respondió ' + orRes.status);
      return jsonError(res, 502, 'El proveedor de IA respondió con un error.');
    }
    openRouterJson = await orRes.json();
  }catch(e){
    console.warn('[asistente] fallo de red hacia OpenRouter:', e);
    return jsonError(res, 502, 'No se pudo contactar al proveedor de IA.');
  }finally{
    clearTimeout(timeout);
  }

  var args = core.parsearArgumentosToolCall(openRouterJson);
  if(!args.ok) return jsonError(res, 502, 'El modelo no devolvió una propuesta entendible.');

  var resultado = core.validarPropuestaModelo(args, norm.catalogo);

  registrarUso(token, user.id);

  res.status(200).json({
    ok: true,
    items: resultado.items,
    no_encontrados: resultado.no_encontrados,
    nota: args.nota || ''
  });
};
