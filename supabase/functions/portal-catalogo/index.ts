import { createClient } from "npm:@supabase/supabase-js@2";

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

/* ---------------------------------------------------------------------------
   portal-catalogo · catálogo de una marca, ya con el precio del cliente-canal
   ---------------------------------------------------------------------------
   El cliente-canal no puede leer `app_settings` con su propio JWT — esa tabla
   sigue exigiendo ceven_is_staff() sin excepción. Esta función es el único
   camino: valida que quien llama es una cuenta de portal ACTIVA, lee el price
   list real con la service_role, aplica el tier/margen que Ceven le asignó a
   ESE cliente (tabla `clientes`, Fase 0) y devuelve solo
   {sku, description, category, price} — nunca costo ni margen interno de
   Ceven, nunca la tabla de nacionalización completa, nunca el catálogo de una
   marca que no pidió.

   El precio sale de EXACTAMENTE la misma cuenta que usan los cotizadores
   internos (supabase/functions/_shared/pricing/*, copia byte a byte de
   apple|poly/js/pricing-core.js — ver scripts/check-portal-pricing-parity.js).
   Cargarlas por `eval` indirecto funciona porque son scripts sloppy-mode sin
   `'use strict'` ni exports: sus `var`/`function` quedan en `globalThis`.
   --------------------------------------------------------------------------- */

async function cargarPricingCore(archivo: string) {
  const url = new URL(`../_shared/pricing/${archivo}`, import.meta.url);
  const src = await Deno.readTextFile(url);
  // Indirecta a propósito: eval directo hereda el modo estricto del módulo
  // ES que la está llamando, y ahí los `var`/`function` NO quedan en
  // globalThis. La indirecta siempre corre como código global sloppy-mode.
  (0, eval)(src);
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

  const { brand } = await req.json();
  if (brand !== "apple" && brand !== "poly")
    return json({ message: "Marca inválida." }, 400);

  const { data: cliente, error: clienteErr } = await admin
    .from("clientes")
    .select("poly_tier, apple_margen")
    .eq("id", portalCliente.cliente_id)
    .single();
  if (clienteErr) return json({ message: "No se pudo leer la ficha del cliente." }, 500);

  const catalogKey = brand === "apple" ? "cpl" : "poly_cpl";
  const { data: catRow } = await admin
    .from("app_settings")
    .select("value")
    .eq("brand", brand)
    .eq("key", catalogKey)
    .maybeSingle();

  let products: Array<Record<string, unknown>> = [];
  try {
    products = catRow?.value ? JSON.parse(catRow.value) : [];
  } catch {
    return json({ message: "El catálogo de " + brand + " está corrupto del lado de Ceven." }, 500);
  }
  if (!Array.isArray(products) || !products.length)
    return json({ ok: true, products: [], aviso: "Todavía no hay catálogo cargado para esta marca." });

  try {
    if (brand === "poly") {
      if (!cliente.poly_tier)
        return json({ message: "Tu cuenta todavía no tiene un nivel de precio asignado. Contactá a Ceven." }, 400);

      await cargarPricingCore("poly-pricing-core.js");
      // deno-lint-ignore no-explicit-any
      const g = globalThis as any;
      const salida = products
        .map((p) => ({
          sku: String(p.sku ?? ""),
          description: String(p.description ?? ""),
          category: String(p.rubro ?? ""),
          price: g.cevenPolyPrecioDe(p, cliente.poly_tier),
        }))
        .filter((p) => p.sku && p.price !== null);

      return json({ ok: true, products: salida });
    }

    // apple
    if (cliente.apple_margen == null)
      return json({ message: "Tu cuenta todavía no tiene un margen asignado. Contactá a Ceven." }, 400);

    const { data: nacRow } = await admin
      .from("app_settings").select("value").eq("brand", "apple").eq("key", "cnac").maybeSingle();

    await cargarPricingCore("apple-pricing-core.js");
    // deno-lint-ignore no-explicit-any
    const g = globalThis as any;
    let nacRates: Record<string, number> = g.CEVEN_APPLE_NAC_DEF;
    if (nacRow?.value) {
      try {
        const parsed = JSON.parse(nacRow.value);
        if (parsed && typeof parsed === "object") nacRates = parsed;
      } catch { /* si está corrupto, se sigue con el default */ }
    }

    const salida = products
      .filter((p) => !p.deleted)
      .map((p) => {
        const nac = p.nacIncluded ? 0 : g.cevenAppleNac(
          { lob: p.lob, modelCol: p.modelCol, description: p.description }, nacRates, {}
        );
        return {
          sku: String(p.sku ?? ""),
          description: String(p.description ?? ""),
          category: String(p.lob ?? ""),
          price: g.cevenAppleCalcP(Number(p.sellingPrice) || 0, nac, Number(cliente.apple_margen)),
        };
      })
      .filter((p) => p.sku);

    return json({ ok: true, products: salida });
  } catch (e) {
    console.warn("[portal-catalogo] fallo calculando precios:", e);
    return json({ message: "No se pudo calcular el catálogo." }, 500);
  }
});
