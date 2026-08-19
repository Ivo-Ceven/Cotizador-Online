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
   alguien la reasigne (cevenCanEditPipelineRow ya hace esa cuenta).

   Apple: la fila de pipeline NUNCA incluye "esFOB" — esa columna no existe en
   la base real (ver docs/HISTORIAL.md, "🔴 falta esFOB") y cualquier insert
   que la incluya se rechaza entero con 400. Portal-emitir no la manda, así
   que un pedido de Apple desde el portal entra bien aunque el cotizador
   interno de Apple siga con ese bug.
   --------------------------------------------------------------------------- */

function qNumFmt(n: number) {
  const s = String(Math.max(0, Math.trunc(n)));
  return s.length >= 4 ? s : "0".repeat(4 - s.length) + s;
}

async function cargarPricingCore(archivo: string) {
  const url = new URL(`../_shared/pricing/${archivo}`, import.meta.url);
  const src = await Deno.readTextFile(url);
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
  const { brand, clienteFinalId, proyecto: proyectoLibre, markupPct: markupLibre } = body;
  const itemsPedidos: Array<{ sku: string; qty: number }> = Array.isArray(body.items) ? body.items : [];

  if (brand !== "apple" && brand !== "poly") return json({ message: "Marca inválida." }, 400);
  if (!itemsPedidos.length) return json({ message: "El pedido está vacío." }, 400);
  if (itemsPedidos.length > 300) return json({ message: "Demasiadas líneas en un solo pedido." }, 400);

  const { data: cliente, error: clienteErr } = await admin
    .from("clientes").select("id, nombre, poly_tier, apple_margen").eq("id", portalCliente.cliente_id).single();
  if (clienteErr || !cliente) return json({ message: "No se pudo leer la ficha del cliente." }, 500);

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
      precioCeven = g.cevenPolyPrecioDe(p, cliente.poly_tier);
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
    proyecto: nombreProyecto, ejecutivo: "—", mesCierre: "",
    estado: "Cotizado", moneda: "USD",
    origenPortalId: portalCliente.id,
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
      "Cliente": cliente.nombre, "Proyecto": nombreProyecto, "Ejecutivo": "—",
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
      Object.assign(base, { "OPG": "—", "Nivel de precio": cliente.poly_tier, "Nota": "—", "IVA": "" });
    }
    return base;
  });

  const { error: settingsErr } = await admin.from("app_settings").upsert([
    { brand, key: cquotesKey, value: JSON.stringify(cquotes.concat(filasNuevas)) },
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
    items: lineas.map((l) => ({
      sku: l.sku, description: l.description, qty: l.qty,
      precioCeven: l.precioCeven, precioReventa: Math.round(l.precioCeven * (1 + markupPct / 100)),
    })),
    noEncontrados,
  });
});
