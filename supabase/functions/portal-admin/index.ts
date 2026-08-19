import { createClient } from "npm:@supabase/supabase-js@2";

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const ADMIN_EMAIL = "admin@ceven.com";
const CEVEN_DOMAIN = "ceven.com";
const POLY_TIERS = ["Ceven - Tier 1", "Ceven - Tier 2", "Ceven - Tier 3", "Negocios Especiales"];

/* ---------------------------------------------------------------------------
   portal-admin · alta/gestión de cuentas de cliente-canal
   ---------------------------------------------------------------------------
   Mismo esqueleto que admin-users/index.ts: solo admin@ceven.com puede
   llamarla (validado server-side con su access_token), usa la service_role
   para todo lo que RLS no le permitiría a nadie más.

   Una cuenta de portal es dos cosas atadas: una fila en `clientes` (el nivel
   de precio/margen que Ceven le da — compartida con los cotizadores internos,
   ver Fase 0) y una fila en `portal_clientes` (el login). El admin fija una
   contraseña temporal y se la pasa él mismo al cliente — no hay invite-by-
   -email, coincide con "pasa credenciales" del pedido original.

   Invariante que esta función tiene que sostener (la base no la fuerza):
   una cuenta NUNCA es staff y cliente-canal a la vez. Por eso `create`
   rechaza cualquier email @ceven.com.
   --------------------------------------------------------------------------- */

function isDomainEmail(e: string, domain: string) {
  return new RegExp(`^[^\\s@]+@${domain.replace(/\./g, "\\.")}$`, "i").test(e ?? "");
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

  // 1) Validar que quien llama es el admin (server-side, con su access_token)
  const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
  const { data: caller } = await admin.auth.getUser(token);
  if (caller?.user?.email?.toLowerCase() !== ADMIN_EMAIL)
    return json({ message: "Solo el administrador puede gestionar clientes del portal." }, 403);

  const body = await req.json();
  const { action, email, password, nombreCliente, clienteId, polyTier, appleMargen } = body;

  try {
    if (action === "list") {
      const { data, error } = await admin
        .from("portal_clientes")
        .select("id, email, status, created_at, cliente:clientes(id, nombre, poly_tier, apple_margen)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return json({ clientes: data });
    }

    if (action === "create") {
      if (!email || isDomainEmail(email, CEVEN_DOMAIN))
        return json({ message: "El email del cliente-canal no puede ser del dominio @ceven.com." }, 400);
      if (typeof password !== "string" || password.length < 6)
        return json({ message: "La contraseña debe tener al menos 6 caracteres." }, 400);
      if (!clienteId && !(typeof nombreCliente === "string" && nombreCliente.trim()))
        return json({ message: "Falta el nombre del cliente o un cliente_id existente." }, 400);
      if (polyTier != null && polyTier !== "" && !POLY_TIERS.includes(polyTier))
        return json({ message: "Nivel de precio de Poly inválido." }, 400);
      if (appleMargen != null && appleMargen !== "" && (isNaN(Number(appleMargen)) || Number(appleMargen) < 0 || Number(appleMargen) > 80))
        return json({ message: "El margen de Apple tiene que ser un número entre 0 y 80." }, 400);

      // Resolver o crear la fila de `clientes` (Fase 0): mismo criterio de
      // nombre_norm que usa shared/clientes-db.js desde los cotizadores
      // internos, para que sea EL MISMO cliente si ya se le había cotizado.
      let cliente;
      if (clienteId) {
        const { data, error } = await admin.from("clientes").select("*").eq("id", clienteId).maybeSingle();
        if (error) throw error;
        if (!data) return json({ message: "El cliente_id indicado no existe." }, 400);
        cliente = data;
      } else {
        const { data, error } = await admin
          .from("clientes")
          .upsert({ nombre: nombreCliente.trim() }, { onConflict: "nombre_norm" })
          .select()
          .single();
        if (error) throw error;
        cliente = data;
      }

      // Ya tiene acceso al portal — no se duplica.
      const { data: yaExiste } = await admin
        .from("portal_clientes").select("id").eq("cliente_id", cliente.id).maybeSingle();
      if (yaExiste) return json({ message: "Ese cliente ya tiene una cuenta de portal." }, 400);

      // El tier/margen se fija (o se actualiza) en la misma pasada.
      const patch: Record<string, unknown> = {};
      if (polyTier !== undefined) patch.poly_tier = polyTier || null;
      if (appleMargen !== undefined) patch.apple_margen = appleMargen === "" ? null : Number(appleMargen);
      if (Object.keys(patch).length) {
        const { error } = await admin.from("clientes").update(patch).eq("id", cliente.id);
        if (error) throw error;
      }

      const { data: created, error: createErr } = await admin.auth.admin.createUser({
        email, password, email_confirm: true,
        user_metadata: { tipo: "cliente-canal", cliente: cliente.nombre },
      });
      if (createErr) throw createErr;

      const { error: pcErr } = await admin.from("portal_clientes").insert({
        cliente_id: cliente.id, user_id: created.user.id, email,
        created_by: caller.user.email,
      });
      if (pcErr) {
        // El usuario de auth ya se creó: no lo dejamos huérfano sin portal_clientes,
        // que es lo único que le da acceso — mejor deshacerlo que dejar una cuenta
        // que loguea pero no hace nada y nadie recuerda por qué.
        await admin.auth.admin.deleteUser(created.user.id);
        throw new Error("No se pudo dar de alta el acceso al portal: " + pcErr.message);
      }

      return json({ ok: true, clienteId: cliente.id, email });
    }

    if (action === "suspend" || action === "reactivate") {
      const { error } = await admin
        .from("portal_clientes")
        .update({ status: action === "suspend" ? "suspendido" : "activo" })
        .eq("email", email);
      if (error) throw error;
      // El cambio no es inmediato: portal_client_status viaja en el JWT y se
      // refresca recién cuando vence el token o el cliente vuelve a entrar —
      // mismo comportamiento ya documentado para user_role.
      return json({ ok: true, aviso: "Se aplica cuando el cliente vuelva a iniciar sesión (o dentro de ~1 h)." });
    }

    return json({ message: "Acción inválida." }, 400);
  } catch (e) {
    return json({ message: (e as Error).message ?? "Error interno." }, 400);
  }
});
