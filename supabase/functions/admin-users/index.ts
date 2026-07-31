import { createClient } from "npm:@supabase/supabase-js@2";

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const ADMIN_EMAIL = "admin@ceven.com";
const DOMAIN = "ceven.com";
const ROLES = ["admin", "ventas", "lector"];

/* ---------------------------------------------------------------------------
   El rol autoritativo vive en public.user_roles, NO en user_metadata.

   Motivo: user_metadata lo puede editar el propio usuario con
   PUT /auth/v1/user (el mismo endpoint que usa "cambiar mi contraseña"), así
   que si las policies lo leyeran, cualquiera se haría admin. user_roles solo
   la escribe la service_role — o sea, esta función.

   Se sigue escribiendo `role` en user_metadata porque el cliente lo usa como
   pista para la UI cuando el claim del hook todavía no llegó, pero no decide
   ningún permiso. Las dos escrituras van juntas para que no diverjan.
   --------------------------------------------------------------------------- */
async function setRole(userId: string, role: string) {
  const { error } = await admin
    .from("user_roles")
    .upsert({ user_id: userId, role, updated_at: new Date().toISOString() },
            { onConflict: "user_id" });
  if (error) throw new Error("El usuario se guardó pero no se pudo asignar el rol: " + error.message);
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
    return json({ message: "Solo el administrador puede gestionar usuarios." }, 403);

  const { action, email, password, nombre, role } = await req.json();
  const isDomainEmail = (e: string) =>
    new RegExp(`^[^\\s@]+@${DOMAIN.replace(/\./g, "\\.")}$`, "i").test(e ?? "");
  const findByEmail = async (e: string) => {
    const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
    return data?.users.find(u => u.email?.toLowerCase() === e.toLowerCase());
  };

  try {
    if (action === "list") {
      const { data, error } = await admin.auth.admin.listUsers({ perPage: 1000 });
      if (error) throw error;

      // El rol que se muestra sale de user_roles, que es el que la base
      // realmente aplica. Antes salía de user_metadata y podía mentir.
      const { data: roles } = await admin.from("user_roles").select("user_id, role");
      const roleById = new Map((roles ?? []).map(r => [r.user_id, r.role]));

      return json({ users: data.users.map(u => {
        const real = roleById.get(u.id);
        return {
          email:  u.email,
          nombre: (u.user_metadata as Record<string, unknown>)?.nombre ?? "",
          // Sin fila en user_roles el hook da 'lector' (fail-safe): se muestra
          // eso mismo y se marca, en vez de mostrar el metadata y engañar.
          role:   real ?? "lector",
          sinRol: real === undefined,
        };
      }) });
    }

    if (action === "create") {
      // Validaciones server-side (las del frontend son solo UX)
      if (!isDomainEmail(email)) return json({ message: `El usuario debe ser un email @${DOMAIN}.` }, 400);
      if (typeof password !== "string" || password.length < 6)
        return json({ message: "La contraseña debe tener al menos 6 caracteres." }, 400);
      if (!ROLES.includes(role)) return json({ message: "Rol inválido." }, 400);
      const { data: created, error } = await admin.auth.admin.createUser({
        email, password, email_confirm: true, user_metadata: { nombre, role },
      });
      if (error) throw error;
      await setRole(created.user.id, role);
      return json({ ok: true });
    }

    const user = await findByEmail(email);
    if (!user) return json({ message: "Usuario no encontrado." }, 404);

    if (action === "delete") {
      if (user.email?.toLowerCase() === ADMIN_EMAIL)
        return json({ message: "No se puede eliminar la cuenta del administrador." }, 400);
      // user_roles tiene on delete cascade: la fila se va sola.
      const { error } = await admin.auth.admin.deleteUser(user.id);
      if (error) throw error;
      return json({ ok: true });
    }

    if (action === "reset_password") {
      if (typeof password !== "string" || password.length < 6)
        return json({ message: "La contraseña debe tener al menos 6 caracteres." }, 400);
      const { error } = await admin.auth.admin.updateUserById(user.id, { password });
      if (error) throw error;
      return json({ ok: true });
    }

    if (action === "update_profile") {
      if (!ROLES.includes(role)) return json({ message: "Rol inválido." }, 400);
      const { error } = await admin.auth.admin.updateUserById(user.id, {
        user_metadata: { ...user.user_metadata, nombre, role },
      });
      if (error) throw error;
      await setRole(user.id, role);
      // El cambio de rol NO es inmediato: las policies leen el claim `user_role`
      // del JWT, que se refresca recién cuando vence el token (~1 h) o cuando
      // el usuario vuelve a entrar. Se avisa para que el admin no crea que falló.
      return json({ ok: true, avisoRol: "El rol se aplica cuando el usuario vuelva a iniciar sesión (o dentro de ~1 h)." });
    }

    return json({ message: "Acción inválida." }, 400);
  } catch (e) {
    return json({ message: (e as Error).message ?? "Error interno." }, 400);
  }
});
