import { createClient } from "npm:@supabase/supabase-js@2";

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

/* ---------------------------------------------------------------------------
   portal-emitir · el cliente-canal envía un pedido, esto crea la cotización
   REAL en la marca correspondiente
   ---------------------------------------------------------------------------
   El body del cliente es solo INTENCIÓN: {brand, items:[{sku,qty}], ...}.
   Todo lo que le cuesta plata a Ceven se recalcula acá, server-side, con la
   MISMA cuenta que usan los cotizadores internos (_shared/pricing/, ver
   scripts/check-portal-pricing-parity.js) — el cliente-canal nunca puede
   mandar un precio que Ceven no calculó.

   Lo que entra al pipeline/forecast interno (`total_ceven`) es SIEMPRE el
   precio Ceven→canal, nunca el de reventa del canal a su cliente final: mismo
   principio que ya sostiene "Opciones A/B" (solo la vigente suma) — si el
   markup ajeno se mezclara, el forecast de Ceven quedaría inflado con plata
   que Ceven nunca factura.

   La fila de pipeline se marca con "origenPortalId" (el badge de "pedido de
   cliente" lo lee de ahí) y lleva ejecutivo:'—' a propósito: no hay un
   vendedor real todavía, y con eso solo un admin puede tocarla hasta que
   alguien la reasigne (cevenCanEditPipelineRow ya hace esa cuenta). Único
   caso en que ESO cambia: un REGI aprobado con ejecutivo elegido (ver más
   abajo) — ahí el pedido sí nace con dueño real.

   Apple: la fila de pipeline NUNCA incluye "esFOB" — esa columna no existe en
   la base real (ver docs/HISTORIAL.md, "🔴 falta esFOB") y cualquier insert
   que la incluya se rechaza entero con 400. Portal-emitir no la manda, así
   que un pedido de Apple desde el portal entra bien aunque el cotizador
   interno de Apple siga con ese bug.

   El código de _shared/pricing/*.js va EMBEBIDO acá abajo (string generado
   por scripts/build-portal-pricing-embeds.js), no se lee del disco: el
   runtime de Edge Functions de Supabase no da permiso de lectura de
   filesystem en producción — ver el mismo comentario en
   portal-catalogo/index.ts y docs/HISTORIAL.md (20/08/2026).

   REGI (Deal Registration de Poly, 21/08/2026): si el body trae
   `regiSolicitudId` y es una solicitud APROBADA y propia (re-chequeado acá,
   nunca confiado del cliente), el precio de cada línea de Poly se pisa con
   `regi_codigos.precios` cuando el SKU está cubierto, el `ejecutivo`
   elegido reemplaza el "—" de siempre, y el código queda escrito en
   `cquotes["REGI"]` y en `pipeline."regiCodigo"` para trazabilidad — nunca
   se toca el campo `opg`, que sigue siendo el texto libre de siempre.
   --------------------------------------------------------------------------- */

function qNumFmt(n: number) {
  const s = String(Math.max(0, Math.trunc(n)));
  return s.length >= 4 ? s : "0".repeat(4 - s.length) + s;
}

// BEGIN_PRICING_EMBED (auto-generado — no editar a mano, ver scripts/build-portal-pricing-embeds.js)
const APPLE_PRICING_SRC: string = "/* ============================================================\n   PRICING · NÚCLEO  ·  Apple\n   ------------------------------------------------------------\n   Las cuentas de Apple SIN pantalla: no leen un input, no tocan\n   el DOM y no dependen de ninguna global de la app. Todo lo que\n   necesitan entra por parámetro.\n\n   Existe por el cotizador MULTIMARCA (src/multi/), que cotiza\n   SKUs de Apple sin ser la app de Apple: necesita el mismo\n   precio, la misma familia y los mismos agregados de pipeline\n   que esta marca, y la única forma de garantizar que no\n   divergan es que sea EL MISMO código. Duplicar la fórmula\n   terminaría en dos precios distintos para el mismo SKU — el\n   cliente recibiría un PDF y el pipeline diría otra cosa.\n\n   Es el mismo movimiento que ya se hizo con _pipeAgregados()\n   cuando aparecieron las opciones A/B: una sola cuenta, varios\n   llamadores.\n\n   `apple/js/pricing.js` y `apple/js/pipeline-core.js` son ahora\n   los envoltorios que le pasan las globales de la pantalla\n   (nacRates, quoteNacOverrides, IVA_MAP, MODEL_CATEGORY).\n\n   Depende de: nada. Se carga ANTES de apple/js/state.js, que\n   toma de acá las tres tablas.\n   ============================================================ */\n\n/* ── Tablas ──────────────────────────────────────────────────────────────\n   Viven acá y no en state.js porque son datos de PRICING, y el multimarca\n   los necesita sin cargar el resto del estado de la app de Apple. state.js\n   las sigue exponiendo con sus nombres de siempre (NAC_DEF, MODEL_CATEGORY,\n   IVA_MAP) para no tocar los ~20 lugares que ya las usan. */\n\n// % de nacionalización por defecto, por modelo (LOB). Es el PRESET: lo que\n// el usuario edita en la pantalla de Nacionalización vive en `cnac`.\nvar CEVEN_APPLE_NAC_DEF = {\"AirTag\":29,\"Apple TV\":29,\"Apple TV Accessories\":29,\"Creativity\":33,\"Displays & Mounts\":33,\"Headphones & Speakers\":48,\"iMac\":24,\"iPad\":19,\"iPad Air\":19,\"iPad Air 11\":19,\"iPad Air 13\":19,\"iPad mini\":19,\"iPad Pro 11\":19,\"iPad Pro 13\":19,\"iPhone\":6,\"Mac English\":24,\"Mac Spanish\":24,\"Mac mini\":6,\"Mac Studio\":24,\"MacBook Air 13\":24,\"MacBook Air 15\":24,\"MacBook Neo\":25,\"MacBook Pro 14\":24,\"MacBook Pro 16\":24,\"Mice & Keyboards\":33,\"Power & Cables\":40,\"Watch\":40,\"Watch SE 3\":40,\"Watch Series 11\":40,\"Watch Ultra 3\":40};\n\n// Tabla de categorías por Model (LOB) — fuente de verdad para el pipeline.\nvar CEVEN_APPLE_MODEL_CATEGORY = {\n  'AirTag':'acc','Apple TV':'acc','Apple TV Accessories':'acc',\n  'Creativity':'acc','Displays & Mounts':'acc','Headphones & Speakers':'acc',\n  'Mice & Keyboards':'acc','Power & Cables':'acc',\n  'Watch':'acc','Watch SE 3':'acc','Watch Series 11':'acc','Watch Ultra 3':'acc',\n  // 'Mac English' y 'Mac Spanish' NO están aquí: se usan tanto para Macs con\n  // teclado en español/inglés como para accesorios → el fallback por descripción\n  // los distingue correctamente (un MacBook tiene \"MacBook\" en el nombre; un\n  // Magic Keyboard/Mouse/Trackpad no).\n  'iMac':'mac','Mac mini':'mac','Mac Studio':'mac',\n  'MacBook Air 13':'mac','MacBook Air 15':'mac','MacBook Neo':'mac',\n  'MacBook Pro 14':'mac','MacBook Pro 16':'mac',\n  'iPad':'ipad','iPad Air':'ipad','iPad Air 11':'ipad','iPad Air 13':'ipad',\n  'iPad mini':'ipad','iPad Pro 11':'ipad','iPad Pro 13':'ipad',\n  'iPhone 15':'iphone','iPhone 16':'iphone','iPhone 16 Plus':'iphone',\n  'iPhone 16e':'iphone','iPhone 17':'iphone','iPhone 17 Pro':'iphone',\n  'iPhone 17 Pro Max':'iphone','iPhone 17e':'iphone',\n  'iPhone Air':'iphone'\n};\n\nvar CEVEN_APPLE_IVA_MAP = {\"Accessories\":\"21%\",\"TV & Home\":\"21%\",\"Mac\":\"10.5%\",\"Mac English\":\"10.5%\",\"Mac Spanish\":\"10.5%\",\"iPad\":\"10.5%\",\"iPhone\":\"10.5% + 21%\",\"Watch\":\"21%\"};\n\n\n/* ── Precio ──────────────────────────────────────────────────────────────\n   costo base + % nacionalización, dividido por (1 − margen).\n   El clamp de mg a 99 evita la división por cero: con margen 100 el precio\n   sería infinito y la cotización saldría con \"Infinity\". */\nfunction cevenAppleCalcP(base, nac, mg){\n  if(mg >= 100) mg = 99;\n  return Math.round((base||0) * (1 + (nac||0)/100) / (1 - (mg||0)/100));\n}\n\n/* Margen exacto a partir de un precio de venta dado: la inversa de calcP().\n\n   El margen NEGATIVO se conserva: vender bajo el costo nacionalizado es una\n   pérdida real y tiene que llegar así al pipeline y al Target Anual. Antes se\n   clampeaba a 0 y el margen ponderado salía inflado (18,2% en vez de 16,0%). */\nfunction cevenAppleMargenDePrecio(base, nac, price){\n  if(!price || price <= 0) return 0;\n  var costoNac = base * (1 + (nac||0)/100);\n  if(costoNac <= 0) return 0;\n  var mg = (1 - costoNac/price) * 100;\n  if(mg < -100) mg = -100; // piso: precio de venta ridículo / dato corrupto\n  if(mg > 99) mg = 99;\n  return Math.round(mg * 100) / 100; // 2 decimales\n}\n\n/* ── Nacionalización ─────────────────────────────────────────────────────\n   El % de un producto. Se busca en tres campos por orden de confianza (LOB,\n   Model, descripción) y en cada uno primero el override de la cotización y\n   después la tabla global; dentro de cada tabla gana la clave MÁS LARGA que\n   esté contenida en el texto, para que 'iPad Pro 13' le gane a 'iPad'.\n\n   `overrides` es opcional: el multimarca no tiene overrides por cotización.\n   Sin match devuelve 20, que es el default histórico. */\nfunction cevenAppleNac(p, tasas, overrides){\n  p = p || {}; tasas = tasas || {}; overrides = overrides || {};\n  var sources = [(p.lob||''), (p.modelCol||''), (p.description||'')];\n  for(var s=0;s<sources.length;s++){\n    var src = sources[s];\n    if(!src) continue;\n    if(overrides[src] !== undefined) return overrides[src];\n    if(tasas[src] !== undefined) return tasas[src];\n    var lo = src.toLowerCase();\n    var mejor = _cevenAppleClaveMasLarga(overrides, lo);\n    if(mejor !== null) return overrides[mejor];\n    mejor = _cevenAppleClaveMasLarga(tasas, lo);\n    if(mejor !== null) return tasas[mejor];\n  }\n  return 20;\n}\n\n// La clave más larga de `mapa` que esté contenida en `textoLower`, o null.\nfunction _cevenAppleClaveMasLarga(mapa, textoLower){\n  var keys = Object.keys(mapa), mejor = null, mejorLen = 0;\n  for(var i=0;i<keys.length;i++){\n    var k = keys[i].toLowerCase();\n    if(textoLower.indexOf(k) !== -1 && k.length > mejorLen){ mejor = keys[i]; mejorLen = k.length; }\n  }\n  return mejor;\n}\n\n/* ── IVA ─────────────────────────────────────────────────────────────────\n   Mismo criterio de \"la clave más larga que matchea\". */\nfunction cevenAppleIVA(lob, mapa){\n  mapa = mapa || {};\n  if(mapa[lob] !== undefined) return mapa[lob];\n  var mejor = _cevenAppleClaveMasLarga(mapa, (lob||'').toLowerCase());\n  return mejor !== null ? mapa[mejor] : '';\n}\n\n/* ── Familia (Mac / iPhone / iPad / accesorio) ───────────────────────────\n   La descripción manda por sobre el LOB: `lob` se corrompe si se guarda el\n   modal de edición con el modelo en blanco (el select cae a la primera opción\n   del catálogo, p. ej. \"AirTag\") y el ítem terminaba contado como accesorio. */\nfunction cevenAppleCategoria(item, mapa){\n  item = item || {}; mapa = mapa || {};\n  var desc = ((item.description || '') + ' ' + (item.modelCol || '')).toLowerCase();\n  var esAccesorio = /keyboard|mouse|pencil|case|cover|cable|adapter|folio/i.test(desc);\n  if(/\\biphone\\b/.test(desc) && !esAccesorio) return 'iphone';\n  if(/\\bipad\\b/.test(desc)   && !esAccesorio) return 'ipad';\n  if(/\\bmacbook\\b|\\bimac\\b|\\bmac\\s*(mini|studio|pro|neo)\\b|\\bmbp(ro)?\\b|\\bmba(ir)?\\b/i.test(desc)) return 'mac';\n  var lob = (item.lob || '').trim();\n  if(mapa[lob]) return mapa[lob];\n  return 'acc';\n}\n\n/* ── Agregados de una fila de pipeline ───────────────────────────────────\n   Cantidades y montos por familia, total y margen ponderado, a partir de un\n   juego de líneas. Lo llaman TRES caminos —agregar al pipeline, cambiar la\n   opción vigente y ahora la emisión del multimarca— y tienen que dar\n   exactamente lo mismo: si se desincronizaran, la fila diría un total que la\n   cotización no dice. */\nfunction cevenAppleAgregados(its, wrs, mapa){\n  its = its || []; wrs = wrs || [];\n  var qMac=0, qIph=0, qIpad=0, qAcc=0;\n  var montoMac=0, montoIph=0, montoIpad=0, montoAcc=0;\n  var sumMargenMonto = 0, sumMonto = 0;\n  for(var i=0;i<its.length;i++){\n    var c = cevenAppleCategoria(its[i], mapa);\n    var q = its[i].qty || 1;\n    var lm = (its[i].salePrice||0) * q;\n    if(c==='mac'){ qMac += q; montoMac += lm; }\n    else if(c==='iphone'){ qIph += q; montoIph += lm; }\n    else if(c==='ipad'){ qIpad += q; montoIpad += lm; }\n    else { qAcc += q; montoAcc += lm; }   // accesorios = todo lo demás\n    // Margen ponderado: suma(margen_línea × monto_línea) / suma(monto_línea).\n    var lineMargen = (typeof its[i].itemMargin === 'number') ? its[i].itemMargin : 0;\n    sumMargenMonto += lineMargen * lm;\n    sumMonto += lm;\n  }\n  // Servicios = las garantías CevenCare. El multimarca no las tiene y pasa [].\n  var qServ = 0, montoServ = 0;\n  for(var j=0;j<wrs.length;j++){\n    qServ += (wrs[j].cantidad||1);\n    montoServ += (wrs[j].precio||0) * (wrs[j].cantidad||1);\n  }\n  return {\n    qMac: qMac, qIph: qIph, qIpad: qIpad, qAcc: qAcc, qServ: qServ,\n    montoMac: Math.round(montoMac), montoIph: Math.round(montoIph),\n    montoIpad: Math.round(montoIpad), montoAcc: Math.round(montoAcc),\n    montoServ: Math.round(montoServ),\n    monto: Math.round(sumMonto + montoServ),\n    margenPond: sumMonto > 0 ? Math.round((sumMargenMonto / sumMonto) * 100) / 100 : null\n  };\n}\n";
const POLY_PRICING_SRC: string = "/* ============================================================\n   PRICING · NÚCLEO  ·  Poly\n   ------------------------------------------------------------\n   El precio por NIVEL, sin pantalla: no lee el <select> global,\n   no recorre `products` y no toca el DOM. Todo entra por\n   parámetro.\n\n   Existe por el cotizador MULTIMARCA (src/multi/), que cotiza\n   SKUs de Poly sin ser la app de Poly y necesita exactamente el\n   mismo precio. Si la fórmula estuviera escrita dos veces,\n   tarde o temprano el mismo SKU saldría a dos precios distintos\n   según por dónde se lo cotizó.\n\n   `poly/js/tiers.js` es ahora el envoltorio que le pasa el\n   catálogo (`products`) y el nivel del selector global.\n\n   Depende de: nada. Se carga ANTES de poly/js/tiers.js.\n   ============================================================ */\n\n/* El valor GUARDADO de una línea con precio a mano sigue siendo 'MANUAL'\n   aunque en pantalla diga \"Custom\": viaja a la columna `Nivel de precio` de\n   `cquotes`, se sincroniza con todo el equipo y quedó escrito en las\n   cotizaciones que ya existen. Cambiarlo obligaría a migrar esas filas para\n   ganar cero. */\nvar CEVEN_TIER_MANUAL     = 'MANUAL';\nvar CEVEN_TIER_MANUAL_LBL = 'Custom';\n\n/* El precio de un producto YA ENCONTRADO en un nivel. Devuelve null si ese\n   nivel no tiene precio, que NO es lo mismo que 0: un 0 se cotiza y un null\n   hay que completarlo a mano. */\nfunction cevenPolyPrecioDe(prod, tier){\n  if(!prod || !tier || tier === CEVEN_TIER_MANUAL) return null;\n  var p = prod.precios && prod.precios[tier];\n  return (typeof p === 'number' && !isNaN(p)) ? p : null;\n}\n\n// El producto del catálogo con ese SKU, o null.\nfunction cevenPolyProducto(lista, sku){\n  if(!sku || !lista) return null;\n  for(var i=0;i<lista.length;i++){ if(lista[i].sku === sku) return lista[i]; }\n  return null;\n}\n\n// Atajo: precio de un SKU en un nivel, buscando en el catálogo que se le pase.\nfunction cevenPolyPrecioEnLista(lista, sku, tier){\n  return cevenPolyPrecioDe(cevenPolyProducto(lista, sku), tier);\n}\n\n/* El nivel EFECTIVO de una línea: el suyo si lo tiene, si no el global.\n   Una línea puede estar en tres estados:\n     tier === ''         sigue al global (lo normal)\n     tier === '<nivel>'  nivel propio, no la mueve el global\n     tier === 'MANUAL'   precio escrito a mano, no lo mueve nada          */\nfunction cevenPolyTierEfectivo(it, tierGlobal){\n  if(!it) return '';\n  if(it.tier === CEVEN_TIER_MANUAL) return CEVEN_TIER_MANUAL;\n  return it.tier || (tierGlobal || '');\n}\n\n/* Recalcula el precio de una línea según su nivel efectivo. No toca las\n   MANUAL ni las que quedaron sin precio de catálogo (se dejan como están para\n   que el usuario las complete). Devuelve true si cambió algo. */\nfunction cevenPolyRepricear(it, lista, tierGlobal){\n  var t = cevenPolyTierEfectivo(it, tierGlobal);\n  if(t === CEVEN_TIER_MANUAL || !t) return false;\n  var p = cevenPolyPrecioEnLista(lista, it.sku, t);\n  if(p === null) return false;\n  if(it.salePrice === p) return false;\n  it.salePrice = p;\n  return true;\n}\n\n/* El monto de una fila del pipeline a partir de un juego de líneas.\n\n   Lo llaman TRES caminos —agregar al pipeline, cambiar la opción vigente y la\n   emisión del multimarca— y tienen que dar exactamente lo mismo: si se\n   desincronizaran, la fila mostraría un total que la cotización no dice. */\nfunction cevenPolyMonto(its){\n  var monto = 0;\n  its = its || [];\n  for(var i=0;i<its.length;i++){ monto += (its[i].salePrice||0) * (its[i].qty||1); }\n  return Math.round(monto);\n}\n";
// END_PRICING_EMBED

function cargarPricingCore(archivo: string) {
  const src = archivo === "apple-pricing-core.js" ? APPLE_PRICING_SRC : POLY_PRICING_SRC;
  (0, eval)(src);
}

function nuevoIdFila() {
  return Date.now() * 1000 + Math.floor(Math.random() * 1000);
}

Deno.serve(async (req) => {
  const cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, content-type, apikey",
  };
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status, headers: { ...cors, "Content-Type": "application/json" },
    });

  const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
  const { data: caller } = await admin.auth.getUser(token);
  if (!caller?.user) return json({ message: "No autenticado." }, 401);

  const { data: portalCliente } = await admin
    .from("portal_clientes")
    .select("id, status, cliente_id")
    .eq("user_id", caller.user.id)
    .maybeSingle();
  if (!portalCliente || portalCliente.status !== "activo")
    return json({ message: "Esta cuenta no tiene acceso al portal." }, 403);

  const body = await req.json();
  const { brand, clienteFinalId, proyecto: proyectoLibre, markupPct: markupLibre, regiSolicitudId } = body;
  const itemsPedidos: Array<{ sku: string; qty: number }> = Array.isArray(body.items) ? body.items : [];

  if (brand !== "apple" && brand !== "poly") return json({ message: "Marca inválida." }, 400);
  if (!itemsPedidos.length) return json({ message: "El pedido está vacío." }, 400);
  if (itemsPedidos.length > 300) return json({ message: "Demasiadas líneas en un solo pedido." }, 400);

  const { data: cliente, error: clienteErr } = await admin
    .from("clientes").select("id, nombre, poly_tier, apple_margen").eq("id", portalCliente.cliente_id).single();
  if (clienteErr || !cliente) return json({ message: "No se pudo leer la ficha del cliente." }, 500);

  // REGI (Deal Registration de Poly): mismo re-chequeo de ownership+estado
  // que portal-catalogo, nunca se confía en lo que manda el cliente.
  let regiPrecios: Record<string, number> = {};
  let regiCodigoAplicado: string | null = null;
  let ejecutivoNombre = "";
  if (brand === "poly" && regiSolicitudId) {
    const { data: solicitud } = await admin
      .from("regi_solicitudes")
      .select("id, portal_client_id, estado, regi_codigo_id, codigo, ejecutivo_nombre")
      .eq("id", regiSolicitudId)
      .maybeSingle();
    if (
      solicitud && solicitud.portal_client_id === portalCliente.id &&
      solicitud.estado === "aprobado" && solicitud.regi_codigo_id
    ) {
      const { data: regiRow } = await admin
        .from("regi_codigos")
        .select("precios")
        .eq("id", solicitud.regi_codigo_id)
        .maybeSingle();
      if (regiRow?.precios && typeof regiRow.precios === "object") {
        regiPrecios = regiRow.precios as Record<string, number>;
        regiCodigoAplicado = solicitud.codigo;
        ejecutivoNombre = solicitud.ejecutivo_nombre || "";
      }
    }
  }

  // El cliente final y su markup: si se pasó un id, TIENE que ser de este
  // mismo cliente-canal (RLS ya lo filtraría en una query normal, pero acá
  // corre con service_role, así que el chequeo de ownership es manual).
  let nombreProyecto = String(proyectoLibre ?? "").trim() || "—";
  let markupPct = Number(markupLibre);
  if (clienteFinalId) {
    const { data: cf } = await admin
      .from("portal_clientes_finales")
      .select("id, nombre, markup_pct, portal_client_id")
      .eq("id", clienteFinalId).maybeSingle();
    if (!cf || cf.portal_client_id !== portalCliente.id)
      return json({ message: "Ese cliente final no existe o no es tuyo." }, 400);
    nombreProyecto = cf.nombre;
    if (cf.markup_pct != null) markupPct = Number(cf.markup_pct);
  }
  if (!isFinite(markupPct) || markupPct < 0) {
    const { data: perfil } = await admin
      .from("portal_perfiles").select("markup_default_pct").eq("portal_client_id", portalCliente.id).maybeSingle();
    markupPct = Number(perfil?.markup_default_pct) || 0;
  }
  if (markupPct > 500) return json({ message: "El margen de reventa parece un error (más de 500%)." }, 400);

  // ── Catálogo + tabla NAC real, igual que portal-catalogo ──────────────────
  const catalogKey = brand === "apple" ? "cpl" : "poly_cpl";
  const { data: catRow } = await admin
    .from("app_settings").select("value").eq("brand", brand).eq("key", catalogKey).maybeSingle();
  let catalogo: Array<Record<string, unknown>> = [];
  try { catalogo = catRow?.value ? JSON.parse(catRow.value) : []; } catch { /* queda vacío */ }
  const bySku = new Map(catalogo.map((p) => [String(p.sku ?? ""), p]));

  let nacRates: Record<string, number> = {};
  if (brand === "apple") {
    if (cliente.apple_margen == null)
      return json({ message: "Tu cuenta todavía no tiene un margen asignado. Contactá a Ceven." }, 400);
    const { data: nacRow } = await admin
      .from("app_settings").select("value").eq("brand", "apple").eq("key", "cnac").maybeSingle();
    await cargarPricingCore("apple-pricing-core.js");
    // deno-lint-ignore no-explicit-any
    nacRates = (globalThis as any).CEVEN_APPLE_NAC_DEF;
    if (nacRow?.value) { try { const p = JSON.parse(nacRow.value); if (p && typeof p === "object") nacRates = p; } catch { /* default */ } }
  } else {
    if (!cliente.poly_tier)
      return json({ message: "Tu cuenta todavía no tiene un nivel de precio asignado. Contactá a Ceven." }, 400);
    await cargarPricingCore("poly-pricing-core.js");
  }
  // deno-lint-ignore no-explicit-any
  const g = globalThis as any;

  const lineas: Array<{ sku: string; description: string; qty: number; precioCeven: number; lob?: string; itemNac?: number }> = [];
  const noEncontrados: string[] = [];
  for (const it of itemsPedidos) {
    const sku = String(it.sku ?? "").trim();
    const qty = Math.max(1, Math.min(500, Math.trunc(Number(it.qty)) || 1));
    const p = bySku.get(sku);
    if (!p) { noEncontrados.push(sku); continue; }

    let precioCeven: number | null;
    let itemNac = 0, lob = "";
    if (brand === "poly") {
      const precioRegi = regiPrecios[sku];
      precioCeven = precioRegi != null ? precioRegi : g.cevenPolyPrecioDe(p, cliente.poly_tier);
    } else {
      lob = String(p.lob ?? "");
      itemNac = p.nacIncluded ? 0 : g.cevenAppleNac({ lob: p.lob, modelCol: p.modelCol, description: p.description }, nacRates, {});
      precioCeven = g.cevenAppleCalcP(Number(p.sellingPrice) || 0, itemNac, Number(cliente.apple_margen));
    }
    if (precioCeven === null || !isFinite(precioCeven)) { noEncontrados.push(sku); continue; }

    lineas.push({ sku, description: String(p.description ?? ""), qty, precioCeven, lob, itemNac });
  }
  if (!lineas.length)
    return json({ message: "Ningún producto del pedido se pudo cotizar.", noEncontrados }, 400);

  // ── Reservar número: mismo criterio auto-reparable que el resto del repo ──
  const { data: cqcRow } = await admin.from("app_settings").select("value").eq("brand", brand).eq("key", "cqc").maybeSingle();
  const { data: maxRow } = await admin.from("pipeline").select("qNum").eq("brand", brand).order("qNum", { ascending: false }).limit(1).maybeSingle();
  const contador = parseInt(String(cqcRow?.value ?? "0"), 10) || 0;
  const mayorExistente = parseInt(String(maxRow?.qNum ?? "0"), 10) || 0;
  const qNumNum = Math.max(contador, mayorExistente) + 1;
  const qn = qNumFmt(qNumNum);

  const now = new Date();
  const totalCeven = lineas.reduce((s, l) => s + l.precioCeven * l.qty, 0);
  const totalReventa = Math.round(totalCeven * (1 + markupPct / 100));

  // ── Fila de pipeline (marca real) ──────────────────────────────────────
  const pipeRow: Record<string, unknown> = {
    brand, id: nuevoIdFila(),
    fecha: now.toLocaleDateString("es-AR"), fechaISO: now.toISOString(),
    qNum: qNumNum, cliente: cliente.nombre, clienteId: cliente.id,
    proyecto: nombreProyecto, ejecutivo: ejecutivoNombre || "—", mesCierre: "",
    estado: "Cotizado", moneda: "USD",
    origenPortalId: portalCliente.id,
    regiCodigo: regiCodigoAplicado,
  };
  if (brand === "poly") {
    Object.assign(pipeRow, { monto: Math.round(totalCeven), opg: null, factura: null });
  } else {
    const agregados = g.cevenAppleAgregados(
      lineas.map((l) => ({ ...l, salePrice: l.precioCeven, itemMargin: 0 })), [], g.CEVEN_APPLE_MODEL_CATEGORY
    );
    Object.assign(pipeRow, agregados);
    // esFOB deliberadamente OMITIDO — ver comentario de cabecera.
  }

  const { error: pipeErr } = await admin.from("pipeline").insert(pipeRow);
  if (pipeErr) {
    console.warn("[portal-emitir] fallo insertando pipeline:", pipeErr);
    return json({ message: "No se pudo registrar el pedido en Ceven: " + pipeErr.message }, 500);
  }

  // ── cquotes + cqc (mismo blob que ya sincronizan los cotizadores) ────────
  const cquotesKey = brand === "apple" ? "cquotes" : "poly_cquotes";
  const cqcKey = brand === "apple" ? "cqc" : "poly_cqc";
  const { data: cqRow } = await admin.from("app_settings").select("value").eq("brand", brand).eq("key", cquotesKey).maybeSingle();
  let cquotes: Array<Record<string, unknown>> = [];
  try { cquotes = cqRow?.value ? JSON.parse(cqRow.value) : []; } catch { cquotes = []; }

  const filasNuevas = lineas.map((l) => {
    const base: Record<string, unknown> = {
      "N° Cotización": qn, "Fecha": now.toLocaleDateString("es-AR"),
      "Hora": now.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" }),
      "Cliente": cliente.nombre, "Proyecto": nombreProyecto, "Ejecutivo": ejecutivoNombre || "—",
      "Observaciones": "Generado desde el portal de clientes.", "Mes Cierre": "",
      "Condición de pago": "", "Propuesta efectiva hasta": "", "Entrega": "",
      "Opción": 1, "_opcEf": 1,
      "SKU": l.sku, "Descripción": l.description, "Cantidad": l.qty,
      "P. Venta Unitario": l.precioCeven, "Total": l.precioCeven * l.qty,
      "Tipo": "producto", "_estado": "Cotizado", "_portalSolicitudId": null,
    };
    if (brand === "apple") {
      Object.assign(base, {
        "Disponibilidad": "—", "IVA": "", "Margen %": Number(cliente.apple_margen),
        "_base": Number(bySku.get(l.sku)?.sellingPrice) || 0, "_nac": l.itemNac || 0, "_lob": l.lob || "",
        "_taxes": "", "_nacIncluded": !!bySku.get(l.sku)?.nacIncluded, "_manualMg": false,
      });
    } else {
      Object.assign(base, {
        "OPG": "—", "Nivel de precio": cliente.poly_tier, "Nota": "—", "IVA": "",
        "REGI": regiCodigoAplicado || "—",
      });
    }
    return base;
  });

  /* ── La cotización REAL, en su tabla ─────────────────────────────────────
     Esto es lo que leen los cotizadores desde que el historial dejó de ser el
     blob `cquotes` (ver src/shared/quotes-store.js y la migración
     20260911100000_cotizaciones_tabla.sql). Si esta función solo escribiera el
     blob, un pedido del portal aparecería en el pipeline pero NO en el
     historial de nadie.

     `_qid` va sellado en cada línea igual que lo hace saveDB() en el cliente, y
     el id es un uuid —no 'q'+número— porque es una cotización nueva: dos
     emisiones simultáneas tienen que entrar como dos filas distintas y dejar
     que el unique (brand, qnum) arbitre la etiqueta. */
  const qid = crypto.randomUUID();
  const filasSelladas = filasNuevas.map((f) => ({ ...f, _qid: qid }));
  const { error: cotizErr } = await admin.from("cotizaciones").insert({
    brand, id: qid, qnum: qNumNum,
    cliente: cliente.nombre,
    proyecto: nombreProyecto,
    ejecutivo: ejecutivoNombre || "—",
    estado: "Cotizado",
    mesCierre: null,
    lineas: filasSelladas,
    cond: null,
  });
  if (cotizErr) {
    /* El 23505 acá es el unique del número: alguien tomó el mismo qNum entre
       que lo reservamos y ahora. No se reintenta en silencio con otro número
       porque la fila de pipeline ya salió con ESTE, y quedarían desalineadas.
       Se avisa: reemitir es idempotente y es la forma de recuperarse. */
    console.warn("[portal-emitir] fallo insertando la cotización (la fila de pipeline ya quedó creada):", cotizErr);
  }

  const { error: settingsErr } = await admin.from("app_settings").upsert([
    // El blob se sigue escribiendo SOLO por compatibilidad con los clientes que
    // todavía no actualizaron. Nadie actualizado lo lee.
    { brand, key: cquotesKey, value: JSON.stringify(cquotes.concat(filasSelladas)) },
    { brand, key: cqcKey, value: String(qNumNum) },
  ], { onConflict: "brand,key" });
  if (settingsErr) {
    console.warn("[portal-emitir] fallo escribiendo cquotes/cqc (la fila de pipeline ya quedó creada):", settingsErr);
    // No se revierte el insert de pipeline: la cotización sigue siendo real y
    // visible en el pipeline aunque el historial expandido por SKU falte.
    // Es preferible a un rollback silencioso que borre un pedido ya avisado.
  }

  // ── Historial propio del portal ───────────────────────────────────────
  const { data: solicitud, error: solErr } = await admin.from("portal_solicitudes").insert({
    portal_client_id: portalCliente.id,
    cliente_final_id: clienteFinalId ?? null,
    brand, proyecto: nombreProyecto, moneda: "USD",
    total_ceven: Math.round(totalCeven), total_reventa: totalReventa,
    markup_pct_aplicado: markupPct,
    pipeline_brand: brand, pipeline_id: pipeRow.id, pipeline_qnum: qn,
  }).select().single();
  if (solErr) console.warn("[portal-emitir] fallo guardando portal_solicitudes (el pedido a Ceven ya se emitió igual):", solErr);

  if (solicitud) {
    const items = lineas.map((l) => ({
      solicitud_id: solicitud.id, sku: l.sku, description: l.description, qty: l.qty,
      precio_ceven: l.precioCeven, precio_reventa: Math.round(l.precioCeven * (1 + markupPct / 100)),
    }));
    const { error: itemsErr } = await admin.from("portal_solicitud_items").insert(items);
    if (itemsErr) console.warn("[portal-emitir] fallo guardando portal_solicitud_items:", itemsErr);
  }

  return json({
    ok: true, qNum: qn, brand, proyecto: nombreProyecto,
    totalCeven: Math.round(totalCeven), totalReventa, markupPct,
    ejecutivo: ejecutivoNombre || null,
    regiAplicado: regiCodigoAplicado,
    items: lineas.map((l) => ({
      sku: l.sku, description: l.description, qty: l.qty,
      precioCeven: l.precioCeven, precioReventa: Math.round(l.precioCeven * (1 + markupPct / 100)),
    })),
    noEncontrados,
  });
});
