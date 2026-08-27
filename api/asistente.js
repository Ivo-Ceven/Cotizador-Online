'use strict';
/* ============================================================================
   /api/asistente  ·  gateway hacia Gemini (primario) con fallback a OpenRouter
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

   Desde el 27/08/2026 prueba Gemini primero (API directa de Google, no vía
   OpenRouter) y solo si falla o no da una function_call entendible, cae a
   OpenRouter — que sigue siendo el único proveedor si no hay GEMINI_API_KEY
   configurada. El porqué: el modelo gratuito de OpenRouter seguía dando
   FUNCTION_INVOCATION_TIMEOUT (el 504 de Vercel, no el nuestro) incluso
   después de bajar el catálogo a 150 ítems — ver docs/HISTORIAL.md, entrada
   del 27/08. Gemini no tiene el tope de 20 req/min · 50-1000 req/día que
   OpenRouter impone a los modelos ":free".

   CommonJS, sin dependencias npm — sigue la única convención de Node que ya
   existía en el repo (scripts/check-*.js).
   ============================================================================ */

var core = require('./_lib/asistente-core');

// Duplicados a propósito: son la misma publishable key pública de
// src/shared/config.js — un script de navegador no se puede `require` desde
// Node. Si el proyecto de Supabase cambia, tocar los dos lugares.
var SUPABASE_URL = 'https://iqewnebpdyctexavtpmt.supabase.co';
var SUPABASE_ANON_KEY = 'sb_publishable_Za9l64nzVBsaKHrSCgeu0w_x7Vhe7Aa';

/* Gemini directo (Google Generative Language API, endpoint "Interactions",
   confirmado contra ai.google.dev el 27/08/2026 — es una API nueva, no la
   generateContent clásica). Sin GEMINI_API_KEY seteada, este bloque entero
   se saltea y el flujo queda igual que antes (solo OpenRouter): fail-safe,
   no rompe nada para quien no la cargó.

   gemini-2.5-flash-lite y no un "3.x" más nuevo: los modelos recién
   lanzados suelen arrancar de pago o con tier gratuito muy chico, mientras
   que 2.5-flash-lite es una generación asentada con acceso gratuito
   confirmado (ai.google.dev/gemini-api/docs/pricing, 27/08/2026) y soporte
   de function calling. El límite EXACTO de ese tier gratis (RPM/RPD) es por
   cuenta/proyecto de Google y ya no se publica en una tabla fija — se ve en
   https://aistudio.google.com/rate-limit con la cuenta dueña de la key. Si
   en algún momento conviene otro, GEMINI_MODEL en las env vars lo pisa sin
   tocar código. */
var GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
var GEMINI_MODEL_DEFAULT = 'gemini-2.5-flash-lite';
var GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/interactions';

// Gratuito (":free") y soporta tool_choice forzado — confirmado contra
// GET https://openrouter.ai/api/v1/models el 18/08/2026. Si algún día deja de
// existir o de sostener tool-calling, OPENROUTER_MODEL en las env vars lo pisa
// sin tocar código; no hace falta que sea gratis, es solo el default.
var OPENROUTER_MODEL_DEFAULT = 'nvidia/nemotron-3.5-lightning:free';
var OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

// Modelo al que core.elegirModelo() escala para pedidos complejos contra un
// catálogo grande (ver api/_lib/asistente-core.js). Sin setear, el escalado
// queda apagado del todo — es a propósito: nadie paga de más sin que un
// operador lo configure explícitamente.
var OPENROUTER_MODEL_ESCALADO = process.env.OPENROUTER_MODEL_ESCALADO || '';

/* Presupuesto de tiempo repartido entre DOS proveedores posibles, dentro de
   los mismos 30 s de `maxDuration` (vercel.json). Antes OPENROUTER_TIMEOUT_MS
   era 25 s porque era la ÚNICA llamada de la función; ahora, si Gemini ya
   gastó su propio presupuesto y hay que caer a OpenRouter, dejarle otros 25 s
   volvería a pasarse de los 30 s de maxDuration — el mismo
   FUNCTION_INVOCATION_TIMEOUT que se está tratando de evitar, solo que más
   tarde. Cuenta: ~2-3 s se van en auth + rate-limit contra Supabase antes de
   llegar a llamar a un proveedor; 12 s a Gemini + 12 s de fallback a
   OpenRouter = 24 s, deja ~3-4 s de margen. */
var GEMINI_TIMEOUT_MS = 12000;
var OPENROUTER_TIMEOUT_MS = 12000;
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

/* Un solo lugar para "pedile a este proveedor, con este timeout, y contame
   por qué falló si falló" — Gemini y OpenRouter lo comparten (antes esta
   lógica vivía una sola vez, inline, porque OpenRouter era el único
   proveedor). Nunca tira excepción: devuelve {ok:true, json} o
   {ok:false, motivo, status}, motivo es 'timeout' | 'red' | 'json' | 'http'.
   `contexto` es solo para el log (qué modelo, cuántos productos, etc). */
async function llamarProveedor(etiqueta, url, headers, body, timeoutMs, contexto){
  var controller = new AbortController();
  var timeout = setTimeout(function(){ controller.abort(); }, timeoutMs);
  var t0 = Date.now();
  var r;
  try{
    r = await fetch(url, {method: 'POST', headers: headers, body: body, signal: controller.signal});
  }catch(e){
    /* Tres fallas MUY distintas caían en el mismo cartel "No se pudo contactar
       al proveedor de IA" antes del 24/08: que se agote el timeout, que falle
       la red, y que la respuesta no sea JSON. Con un solo mensaje no hay forma
       de saber cuál pasó mirando la consola del navegador — y las tres se
       arreglan distinto. Cada una se nombra. */
    var abortado = e && (e.name === 'AbortError' || controller.signal.aborted);
    console.warn('[' + etiqueta + '] ' + (abortado ? 'TIMEOUT' : 'FALLO DE RED') + ' tras ' + (Date.now() - t0)
      + 'ms' + (contexto ? ' · ' + contexto : ''), e);
    clearTimeout(timeout);
    return {ok: false, motivo: abortado ? 'timeout' : 'red'};
  }
  clearTimeout(timeout);

  if(!r.ok){
    /* El cuerpo del error dice POR QUÉ (modelo inexistente, créditos
       agotados, rate limit del tier gratuito, safety block de Gemini...).
       Loguearlo es la diferencia entre saberlo y adivinar; al usuario nunca
       se le muestra tal cual. */
    var detalle = '';
    try{ detalle = (await r.text()).slice(0, 500); }catch(e2){}
    console.warn('[' + etiqueta + '] respondió ' + r.status + ' en ' + (Date.now() - t0) + 'ms'
      + (contexto ? ' · ' + contexto : '') + ' · ' + detalle);
    return {ok: false, motivo: 'http', status: r.status};
  }

  try{
    return {ok: true, json: await r.json()};
  }catch(e3){
    console.warn('[' + etiqueta + '] 200 con un cuerpo que no es JSON:', e3);
    return {ok: false, motivo: 'json'};
  }
}

module.exports = async function handler(req, res){
  if(req.method !== 'POST') return jsonError(res, 405, 'Método no permitido.');
  if(!process.env.OPENROUTER_API_KEY && !GEMINI_API_KEY){
    return jsonError(res, 500, 'Falta configurar GEMINI_API_KEY u OPENROUTER_API_KEY.');
  }

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

  var resultado = null;   // {items, nota} ya extraído, sea cual sea el proveedor que contestó
  var proveedorUsado = '';

  if(GEMINI_API_KEY){
    var modeloGemini = process.env.GEMINI_MODEL || GEMINI_MODEL_DEFAULT;
    var payloadGemini = core.armarPayloadGemini(norm, modeloGemini);
    var rGemini = await llamarProveedor(
      'asistente/gemini', GEMINI_URL,
      {'x-goog-api-key': GEMINI_API_KEY, 'Content-Type': 'application/json'},
      JSON.stringify(payloadGemini), GEMINI_TIMEOUT_MS,
      'modelo=' + modeloGemini + ' · catalogo=' + norm.catalogo.length
    );

    if(rGemini.ok){
      var argsGemini = core.parsearArgumentosGemini(rGemini.json);
      if(argsGemini.ok){ resultado = argsGemini; proveedorUsado = 'gemini'; }
      else console.warn('[asistente/gemini] respondió 200 pero sin function_call entendible — cae a OpenRouter');
    }
    // Si rGemini.ok es false, llamarProveedor ya logueó el motivo — acá no
    // hace falta nada más: cae al fallback en silencio para el usuario.
  }

  if(!resultado){
    if(!process.env.OPENROUTER_API_KEY){
      return jsonError(res, 502, 'El proveedor de IA no respondió y no hay proveedor de respaldo configurado.');
    }

    var modeloDefault = process.env.OPENROUTER_MODEL || OPENROUTER_MODEL_DEFAULT;
    var modeloElegido = core.elegirModelo(norm, modeloDefault, OPENROUTER_MODEL_ESCALADO);
    if(modeloElegido !== modeloDefault){
      console.warn('[asistente] escalado a ' + modeloElegido + ' · palabras=' + core.contarPalabras(norm.mensaje)
        + ' · catalogo=' + norm.catalogo.length + ' · recortados=' + norm.recortados);
    }
    var payloadOR = core.armarPayloadOpenRouter(norm, modeloElegido);
    var rOR = await llamarProveedor(
      'asistente/openrouter', OPENROUTER_URL,
      {
        'Authorization': 'Bearer ' + process.env.OPENROUTER_API_KEY,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://cotizadores-ceven.vercel.app',
        'X-Title': 'Cotizadores Ceven - Asistente IA'
      },
      JSON.stringify(payloadOR), OPENROUTER_TIMEOUT_MS,
      'modelo=' + payloadOR.model + ' · catalogo=' + norm.catalogo.length + ' · payload=' + JSON.stringify(payloadOR).length + ' bytes'
    );

    if(!rOR.ok){
      /* Último recurso: si esto falla, no queda a qué más recurrir, así que
         el motivo se traduce a un mensaje real para el usuario (ver
         HISTORIAL 24/08 para el porqué de distinguir cada motivo). */
      if(rOR.motivo === 'timeout'){
        return jsonError(res, 504, 'El asistente tardó más de ' + Math.round(OPENROUTER_TIMEOUT_MS / 1000)
          + ' segundos y se cortó. Probá con un pedido más corto, o de nuevo en un rato.');
      }
      if(rOR.motivo === 'http' && rOR.status === 429){
        return jsonError(res, 502, 'El proveedor de IA está saturado en este momento. Probá de nuevo en un rato.');
      }
      if(rOR.motivo === 'json'){
        return jsonError(res, 502, 'El proveedor de IA devolvió una respuesta ilegible.');
      }
      return jsonError(res, 502, rOR.motivo === 'red'
        ? 'No se pudo contactar al proveedor de IA.'
        : 'El proveedor de IA respondió con un error.');
    }

    var argsOR = core.parsearArgumentosToolCall(rOR.json);
    if(!argsOR.ok) return jsonError(res, 502, 'El modelo no devolvió una propuesta entendible.');
    resultado = argsOR;
    proveedorUsado = 'openrouter';
  }

  var validado = core.validarPropuestaModelo(resultado, norm.catalogo);

  registrarUso(token, user.id);

  if(norm.recortados){
    console.warn('[asistente] catalogo recortado: llegaron ' + (norm.catalogo.length + norm.recortados)
      + ' productos y se usaron ' + norm.catalogo.length);
  }

  res.status(200).json({
    ok: true,
    items: validado.items,
    no_encontrados: validado.no_encontrados,
    nota: resultado.nota || '',
    /* Cuantos productos NO vio el modelo. Va en la respuesta y no solo en el
       log porque cambia como hay que leer un "no encontre nada": puede ser que
       el producto exista y nunca haya llegado. */
    catalogo_recortado: norm.recortados || 0,
    // Solo para debug (pestaña Network) — cuál de los dos proveedores contestó.
    proveedor: proveedorUsado
  });
};
