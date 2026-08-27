'use strict';
/* ============================================================================
   ASISTENTE IA · lógica pura (sin req/res, sin red)
   ----------------------------------------------------------------------------
   Separado de api/asistente.js para poder testearlo con require() directo
   (scripts/check-asistente.js) sin pegarle a OpenRouter ni a Supabase.

   No sabe de marcas: solo entiende {id, description, category, price_ref}.
   Cada página arma esa lista compacta a su manera (ver src/shared/asistente.js
   y los hooks _asisCatalogoCompacto/_asisAplicarSeleccion de cada marca).

   Reglas duras que sostiene esta capa (no la política de negocio, la mecánica):
     - nunca deja pasar un `id` que no esté en el catálogo recibido;
     - el `id` devuelto tiene el casing EXACTO del catálogo real, no el que
       mandó el modelo — los matches aguas abajo (poly/js/catalog.js) son
       case-sensitive;
     - el precio nunca viaja en la respuesta, ni de entrada ni de salida.
   ============================================================================ */

var MENSAJE_MAX = 2000;
/* Bajado de 500 a 150 el 26/08/2026 junto con CEVEN_ASIS_CATALOGO_MAX en
   src/shared/asistente.js: con el catálogo ordenado por relevancia (no por
   orden de aparición) antes de llegar acá, 150 alcanza para los candidatos
   reales de un pedido puntual y deja el prompt en el orden de magnitud del
   catálogo viejo de 77 productos que nunca dio timeout (ver
   docs/HISTORIAL.md, "El asistente IA empieza a dar 502"). */
var CATALOGO_MAX = 150;
var ITEMS_ACTUALES_MAX = 500;
var MOTIVO_MAX = 300;
var CANTIDAD_MIN = 1;
var CANTIDAD_MAX = 200;

/* Body crudo del request → forma normalizada y capeada. Entradas mal
   formadas se descartan una por una: no tira el request entero por un solo
   producto corrupto en el catálogo que mandó el cliente. */
function normalizarCatalogoEntrada(body){
  body = body || {};

  var mensaje = (typeof body.mensaje === 'string') ? body.mensaje.trim().slice(0, MENSAJE_MAX) : '';

  /* El recorte a CATALOGO_MAX era MUDO, y desde el 24/08 dejó de ser teórico:
     el catálogo de Poly pasó a 703 productos (el Excel de deals) y se estaban
     descartando 203 sin que nadie se enterara. El síntoma es de los peores:
     el asistente contesta "no encontré nada así" sobre un producto que SÍ está
     en el catálogo, solo que nunca le llegó. Se informa cuántos quedaron
     afuera para que quien llama pueda decirlo. */
  var catalogoEntero = Array.isArray(body.catalogo) ? body.catalogo : [];
  var recortados = Math.max(0, catalogoEntero.length - CATALOGO_MAX);
  var catalogoCrudo = catalogoEntero.slice(0, CATALOGO_MAX);
  var catalogo = [];
  for(var i=0;i<catalogoCrudo.length;i++){
    var p = catalogoCrudo[i];
    if(!p || typeof p.id !== 'string' || !p.id.trim()) continue;
    if(typeof p.description !== 'string') continue;
    catalogo.push({
      id: p.id.trim(),
      description: p.description.trim(),
      category: (typeof p.category === 'string') ? p.category.trim() : '',
      price_ref: (typeof p.price_ref === 'number' && isFinite(p.price_ref)) ? p.price_ref : null
    });
  }

  var itemsCrudo = Array.isArray(body.items_actuales) ? body.items_actuales.slice(0, ITEMS_ACTUALES_MAX) : [];
  var itemsActuales = [];
  for(var j=0;j<itemsCrudo.length;j++){
    var it = itemsCrudo[j];
    if(!it || typeof it.id !== 'string' || !it.id.trim()) continue;
    var qty = parseInt(it.qty, 10);
    itemsActuales.push({id: it.id.trim(), qty: (isFinite(qty) && qty > 0) ? qty : 1});
  }

  return {mensaje: mensaje, catalogo: catalogo, itemsActuales: itemsActuales, recortados: recortados};
}

var TOOL_SCHEMA = {
  type: 'function',
  function: {
    name: 'proponer_items',
    description: 'Propone productos del catálogo recibido que resuelven la necesidad del cliente.',
    parameters: {
      type: 'object',
      properties: {
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id:       {type: 'string', description: 'Debe ser exactamente uno de los id del catálogo recibido.'},
              cantidad: {type: 'integer', minimum: 1},
              motivo:   {type: 'string', description: 'Frase corta en español: por qué este producto responde al pedido.'}
            },
            required: ['id', 'cantidad', 'motivo']
          }
        },
        nota: {type: 'string', description: 'Comentario general opcional sobre la propuesta.'}
      },
      required: ['items']
    }
  }
};

function construirSystemPrompt(){
  return [
    'Sos un asistente que ayuda a armar cotizaciones para Ceven, eligiendo productos de un catálogo real a partir de lo que necesita un cliente.',
    'Reglas estrictas:',
    '- Elegí ÚNICAMENTE productos cuyo "id" esté en el catálogo que te paso. Nunca inventes ni modifiques un id.',
    '- No repitas un id que ya figure en "ya está en la cotización", salvo que el pedido pida explícitamente más unidades de ese mismo producto.',
    '- Las cantidades tienen que ser razonables para lo que se pide.',
    '- El campo price_ref de cada producto es SOLO una referencia de presupuesto para vos: nunca lo repitas, ni menciones un número de precio, en "motivo" ni en "nota".',
    '- Siempre tenés que llamar a la herramienta proponer_items. Si nada del catálogo resuelve bien el pedido, llamala con "items" vacío y explicá por qué en "nota".',
    '- "motivo" es una frase corta en español explicando por qué ese producto responde al pedido.'
  ].join('\n');
}

function construirMensajeUsuario(norm){
  var partes = [];
  partes.push('Pedido del cliente: ' + (norm.mensaje || '(sin texto)'));
  partes.push('Catálogo disponible (' + norm.catalogo.length + ' productos), en JSON:');
  partes.push(JSON.stringify(norm.catalogo));
  if(norm.itemsActuales.length){
    partes.push('Ya está en la cotización (evitar repetir salvo que el pedido lo pida explícitamente):');
    partes.push(JSON.stringify(norm.itemsActuales));
  }
  return partes.join('\n\n');
}

function armarPayloadOpenRouter(norm, model){
  return {
    model: model,
    messages: [
      {role: 'system', content: construirSystemPrompt()},
      {role: 'user', content: construirMensajeUsuario(norm)}
    ],
    tools: [TOOL_SCHEMA],
    tool_choice: {type: 'function', function: {name: 'proponer_items'}},
    temperature: 0.3
  };
}

/* Respuesta cruda de OpenRouter → argumentos de la tool call, o {ok:false} si
   no hubo tool call o el JSON de argumentos no parsea. Nunca tira excepción. */
function parsearArgumentosToolCall(openRouterJson){
  try{
    var choice = openRouterJson && openRouterJson.choices && openRouterJson.choices[0];
    var msg = choice && choice.message;
    var call = msg && msg.tool_calls && msg.tool_calls[0];
    var fn = call && call.function;
    if(!fn || typeof fn.arguments !== 'string') return {ok: false};
    var args = JSON.parse(fn.arguments);
    if(!args || !Array.isArray(args.items)) return {ok: false};
    return {ok: true, items: args.items, nota: (typeof args.nota === 'string') ? args.nota : ''};
  }catch(e){
    return {ok: false};
  }
}

/* Los items que propuso el modelo, validados contra el catálogo que se le
   mandó. Nunca confía en lo que dijo el modelo para description/category:
   los toma del catálogo ya validado. */
function validarPropuestaModelo(argumentos, catalogoNormalizado){
  var byId = {};
  for(var i=0;i<catalogoNormalizado.length;i++){
    var p = catalogoNormalizado[i];
    byId[p.id.trim().toUpperCase()] = p;
  }

  var items = [], noEncontrados = [], vistos = {};
  var propuestos = (argumentos && argumentos.items) || [];
  for(var j=0;j<propuestos.length;j++){
    var it = propuestos[j];
    if(!it || typeof it.id !== 'string' || !it.id.trim()) continue;
    var key = it.id.trim().toUpperCase();
    var real = byId[key];
    if(!real){
      if(noEncontrados.indexOf(it.id.trim()) === -1) noEncontrados.push(it.id.trim());
      continue;
    }
    if(vistos[key]) continue;   // el modelo repitió el mismo id dos veces
    vistos[key] = true;

    var cantidad = parseInt(it.cantidad, 10);
    if(!isFinite(cantidad) || cantidad < CANTIDAD_MIN) cantidad = CANTIDAD_MIN;
    if(cantidad > CANTIDAD_MAX) cantidad = CANTIDAD_MAX;

    items.push({
      id: real.id,   // casing exacto del catálogo real, no el que mandó el modelo
      cantidad: cantidad,
      motivo: (typeof it.motivo === 'string') ? it.motivo.slice(0, MOTIVO_MAX) : '',
      description: real.description,
      category: real.category
    });
  }
  return {items: items, no_encontrados: noEncontrados};
}

/* ============================================================================
   GEMINI · payload y parseo para el proveedor primario (api/asistente.js)
   ----------------------------------------------------------------------------
   La API de Interactions de Gemini (generativelanguage.googleapis.com,
   endpoint /v1beta/interactions) es distinta a la de OpenRouter/OpenAI:
     - el pedido de tool forzada no es tool_choice.function.name sino
       generation_config.tool_choice.allowed_tools = {mode:'any', tools:[...]};
     - la respuesta no trae choices[0].message.tool_calls[0].function.arguments
       como STRING para parsear con JSON.parse — trae un array `steps`, y el
       step de tipo function_call ya tiene `arguments` como objeto nativo.
   Confirmado contra ai.google.dev el 27/08/2026 (API nueva, no la
   generateContent clásica) — sin poder probarla contra la key real (vive
   solo en las env vars de Vercel), así que parsearArgumentosGemini es
   deliberadamente estricto: cualquier forma inesperada devuelve {ok:false} en
   vez de arriesgar una excepción o un item mal formado, y eso alcanza para
   que api/asistente.js caiga solo al fallback de OpenRouter.
   ============================================================================ */

var GEMINI_TOOL = {
  type: 'function',
  name: TOOL_SCHEMA.function.name,
  description: TOOL_SCHEMA.function.description,
  parameters: TOOL_SCHEMA.function.parameters
};

function armarPayloadGemini(norm, model){
  return {
    model: model,
    system_instruction: construirSystemPrompt(),
    input: construirMensajeUsuario(norm),
    tools: [GEMINI_TOOL],
    generation_config: {
      temperature: 0.3,
      tool_choice: {allowed_tools: {mode: 'any', tools: [GEMINI_TOOL.name]}}
    }
  };
}

/* Respuesta cruda de Gemini → argumentos de la function_call, o {ok:false} si
   no hubo una function_call de proponer_items con argumentos utilizables.
   Nunca tira excepción. */
function parsearArgumentosGemini(geminiJson){
  try{
    var steps = geminiJson && geminiJson.steps;
    if(!Array.isArray(steps)) return {ok: false};
    for(var i=0;i<steps.length;i++){
      var s = steps[i];
      if(!s || s.type !== 'function_call' || s.name !== GEMINI_TOOL.name) continue;
      var args = s.arguments;
      if(!args || typeof args !== 'object' || !Array.isArray(args.items)) return {ok: false};
      return {ok: true, items: args.items, nota: (typeof args.nota === 'string') ? args.nota : ''};
    }
    return {ok: false};
  }catch(e){
    return {ok: false};
  }
}

/* ============================================================================
   ESCALADO DE MODELO · heurística determinística, sin llamada de IA extra
   ----------------------------------------------------------------------------
   Decide DEFAULT vs un modelo más potente/pago, mirando solo señales que el
   propio server ya calculó (norm.mensaje, norm.catalogo) — nunca algo que
   mande el cliente, para no abrir una forma barata de forzar el modelo caro.
   Sin `modeloEscalado` (o sea, sin OPENROUTER_MODEL_ESCALADO seteada en las
   env vars) el escalado queda desactivado por completo: fail-safe, cero
   riesgo de costo nuevo sin que un operador lo configure a propósito.
   ============================================================================ */

var PALABRAS_ESCALADO_MIN = 40;  // mensaje "cargado": varios ítems/requisitos
var COMAS_ESCALADO_MIN    = 3;   // 3+ separadores de cláusula: pedido con varias partes
var CATALOGO_ESCALADO_MIN = 60;  // catálogo grande post-filtro: muchos candidatos, más lugar para errar

function contarPalabras(mensaje){
  var m = String(mensaje || '').trim();
  return m ? m.split(/\s+/).length : 0;
}

function contarSeparadoresDeClausula(mensaje){
  var m = String(mensaje || '');
  var comas = (m.match(/[,;]/g) || []).length;
  var conectores = (m.match(/\by\b/gi) || []).length;
  return comas + conectores;
}

/* Escala solo si el mensaje es complejo Y el catálogo candidato sigue siendo
   grande (o hizo falta recortarlo de nuevo acá) — exigir ambas condiciones
   evita pagar de más en catálogos chicos donde el modelo gratis ya acierta
   sin problema. */
function elegirModelo(norm, modeloDefault, modeloEscalado){
  if(!modeloEscalado) return modeloDefault;

  var palabras = contarPalabras(norm.mensaje);
  var separadores = contarSeparadoresDeClausula(norm.mensaje);
  var mensajeComplejo = (palabras >= PALABRAS_ESCALADO_MIN) || (separadores >= COMAS_ESCALADO_MIN);

  var catalogoGrande = norm.catalogo.length >= CATALOGO_ESCALADO_MIN;
  var cortadoDosVeces = norm.recortados > 0;

  if(mensajeComplejo && (catalogoGrande || cortadoDosVeces)) return modeloEscalado;
  return modeloDefault;
}

module.exports = {
  MENSAJE_MAX: MENSAJE_MAX,
  CATALOGO_MAX: CATALOGO_MAX,
  ITEMS_ACTUALES_MAX: ITEMS_ACTUALES_MAX,
  CANTIDAD_MIN: CANTIDAD_MIN,
  CANTIDAD_MAX: CANTIDAD_MAX,
  PALABRAS_ESCALADO_MIN: PALABRAS_ESCALADO_MIN,
  COMAS_ESCALADO_MIN: COMAS_ESCALADO_MIN,
  CATALOGO_ESCALADO_MIN: CATALOGO_ESCALADO_MIN,
  TOOL_SCHEMA: TOOL_SCHEMA,
  GEMINI_TOOL: GEMINI_TOOL,
  normalizarCatalogoEntrada: normalizarCatalogoEntrada,
  armarPayloadOpenRouter: armarPayloadOpenRouter,
  parsearArgumentosToolCall: parsearArgumentosToolCall,
  armarPayloadGemini: armarPayloadGemini,
  parsearArgumentosGemini: parsearArgumentosGemini,
  validarPropuestaModelo: validarPropuestaModelo,
  contarPalabras: contarPalabras,
  contarSeparadoresDeClausula: contarSeparadoresDeClausula,
  elegirModelo: elegirModelo
};
