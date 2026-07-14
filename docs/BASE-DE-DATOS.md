# Base de datos · Esquema requerido (Supabase)

La base anterior fue descartada. Este documento describe **todo lo que la app espera** de un proyecto Supabase para volver a funcionar con sincronización y login. Una vez creado, completar `src/js/config.js`.

La app habla con Supabase **por REST puro** (sin SDK):

- **PostgREST** (`/rest/v1/`) para las tablas `pipeline` y `app_settings` — usando **solo la anon key** (sin JWT de usuario).
- **GoTrue** (`/auth/v1/`) para login con email/contraseña, refresh de token y cambio de contraseña propia.
- **Edge Function** `admin-users` (`/functions/v1/admin-users`) para gestión de usuarios (solo el admin).

## 1. Tablas

Los nombres de columna son **camelCase** — en el DDL van entre comillas dobles, exactamente como acá (PostgREST es case-sensitive):

```sql
-- Pipeline: una fila por entrada de pipeline (espeja localStorage.cpipeline)
create table public.pipeline (
  id              bigint primary key,        -- Date.now() generado por el cliente
  fecha           text,                      -- dd/mm/aaaa (para mostrar)
  "fechaISO"      text,                      -- aaaa-mm-dd (para ordenar)
  "qNum"          bigint,                    -- nro de cotización (el cliente lo re-normaliza a "0071")
  cliente         text,
  proyecto        text,
  ejecutivo       text,
  "mesCierre"     text,                      -- 'YYYY-MM'
  estado          text,                      -- Proyecto|Cotizado|Negociacion|Commit|Con OC|Autorizando|Facturado|Perdido
  "qMac"          numeric, "qIph"  numeric, "qIpad" numeric,
  "qServ"         numeric, "qAcc"  numeric,
  "montoMac"      numeric, "montoIph" numeric, "montoIpad" numeric,
  "montoAcc"      numeric, "montoServ" numeric,
  monto           numeric,
  "margenPond"    numeric,
  moneda          text,
  "skuStatus"        jsonb,   -- overrides de estado por línea de producto
  "skuMesCierre"     jsonb,   -- overrides de mes de cierre por línea
  "skuPartialQty"    jsonb,   -- entregas parciales: qty facturada por línea
  "skuPartialRemSt"  jsonb,   -- estado del remanente parcial
  "skuPartialRemMes" jsonb,   -- mes del remanente parcial
  "skuArchivedQty"   jsonb,   -- qty ya archivada por línea
  "ovLink"        text        -- link a la orden de venta
);
-- Nota: el campo local `skuOvLinks` NO se sincroniza (excluido a propósito en sync.js).

-- Settings compartidos: espeja claves de localStorage como key/value
create table public.app_settings (
  key   text primary key,     -- cquotes | cpl | carchive | cnac | cqc | ctarget |
                              -- ctarget_manual | clogo | clogo_dark | cnac_mac24_v2
  value text                  -- el JSON serializado tal cual está en localStorage
);
```

Requisitos que impone `sync.js`:

- **PK obligatoria** en `pipeline.id` y `app_settings.key`: los upserts usan `Prefer: resolution=merge-duplicates`.
- Los `jsonb` reciben `null` cuando el override se limpia localmente (no omitir la columna).
- `app_settings.value` puede ser **grande** (el price list entero, o el logo en base64) — es `text`, sin límite.

### Permisos (RLS)

La capa de sync manda `apikey` y `Authorization: Bearer <anon key>` — es decir, opera como rol `anon`, **sin JWT del usuario logueado**. Para que funcione igual que antes, `anon` necesita select/insert/update/delete en ambas tablas:

```sql
alter table public.pipeline     enable row level security;
alter table public.app_settings enable row level security;
create policy "anon full access" on public.pipeline     for all to anon using (true) with check (true);
create policy "anon full access" on public.app_settings for all to anon using (true) with check (true);
```

> ⚠️ **Seguridad**: esto replica el diseño original — cualquiera con la anon key (que viaja en el JS) puede leer/escribir estas tablas. El login protege la *UI*, no la *API*. Si se quiere endurecer en la base nueva, la mejora natural es que `sync.js` use el `access_token` de la sesión (`Authorization: Bearer <token del usuario>`) y las policies exijan `to authenticated` — requiere un cambio chico en `sync.js` (tomar el token de `ceven_auth_session`).

## 2. Autenticación (GoTrue)

- Proveedor **Email/Password** habilitado, sin confirmación por mail (los usuarios los crea el admin ya confirmados).
- Usuarios con email `@ceven.com` (la app lo valida client-side).
- Perfil en `user_metadata`: `{ "nombre": "Fer Castro", "role": "admin" | "ventas" | "lector" }`.
- **Crear manualmente el usuario `admin@ceven.com`** (Dashboard → Authentication → Add user, auto-confirm). Es admin por bootstrap aunque no tenga `role` en metadata.

Endpoints que usa la app: `POST /auth/v1/token?grant_type=password`, `?grant_type=refresh_token`, `POST /auth/v1/logout`, `PUT /auth/v1/user` (cambio de contraseña propia).

## 3. Edge Function `admin-users`

El código de la función vivía en el proyecto viejo; hay que **volver a desplegarla**. Contrato que espera el frontend (`auth.js`):

- `POST /functions/v1/admin-users` con `Authorization: Bearer <access_token del usuario>`.
- Solo debe aceptar llamadas cuyo token pertenezca a `admin@ceven.com` (validar server-side).
- Body: `{ "action": "...", ...campos }`. Acciones:

| action | body extra | respuesta esperada |
|---|---|---|
| `list` | — | `{ "users": [{ "email", "nombre", "role" }] }` |
| `create` | `email, password, nombre, role` | crea usuario confirmado con `user_metadata {nombre, role}` |
| `delete` | `email` | elimina el usuario |
| `reset_password` | `email, password` | blanquea la contraseña |
| `update_profile` | `email, nombre, role` | actualiza `user_metadata` |

- Errores: status ≥ 400 con `{ "message": "..." }` (el frontend muestra `message`).

Implementación de referencia (Deno, usa la `service_role` key que la plataforma inyecta como `SUPABASE_SERVICE_ROLE_KEY` — nunca exponerla en el frontend):

```ts
import { createClient } from "npm:@supabase/supabase-js@2";

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

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

  // 1) Validar que quien llama es el admin
  const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
  const { data: caller } = await admin.auth.getUser(token);
  if (caller?.user?.email?.toLowerCase() !== "admin@ceven.com")
    return json({ message: "Solo el administrador puede gestionar usuarios." }, 403);

  const { action, email, password, nombre, role } = await req.json();
  const findByEmail = async (e: string) => {
    const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
    return data?.users.find(u => u.email?.toLowerCase() === e.toLowerCase());
  };

  try {
    if (action === "list") {
      const { data, error } = await admin.auth.admin.listUsers({ perPage: 1000 });
      if (error) throw error;
      return json({ users: data.users.map(u => ({
        email: u.email,
        nombre: (u.user_metadata as any)?.nombre ?? "",
        role:   (u.user_metadata as any)?.role ?? "",
      })) });
    }
    if (action === "create") {
      const { error } = await admin.auth.admin.createUser({
        email, password, email_confirm: true, user_metadata: { nombre, role },
      });
      if (error) throw error;
      return json({ ok: true });
    }
    const user = await findByEmail(email);
    if (!user) return json({ message: "Usuario no encontrado." }, 404);
    if (action === "delete") {
      const { error } = await admin.auth.admin.deleteUser(user.id);
      if (error) throw error;
      return json({ ok: true });
    }
    if (action === "reset_password") {
      const { error } = await admin.auth.admin.updateUserById(user.id, { password });
      if (error) throw error;
      return json({ ok: true });
    }
    if (action === "update_profile") {
      const { error } = await admin.auth.admin.updateUserById(user.id, {
        user_metadata: { ...user.user_metadata, nombre, role },
      });
      if (error) throw error;
      return json({ ok: true });
    }
    return json({ message: "Acción inválida." }, 400);
  } catch (e) {
    return json({ message: (e as Error).message ?? "Error interno." }, 400);
  }
});
```

## 4. Checklist de puesta en marcha

1. Crear proyecto Supabase nuevo.
2. Correr el SQL de tablas + policies (sección 1).
3. Desplegar la Edge Function `admin-users` (sección 3).
4. Crear `admin@ceven.com` en Authentication (auto-confirmado).
5. Completar `src/js/config.js` con la URL y la anon/publishable key nuevas.
6. Abrir la app: al loguearse por primera vez con la base vacía, la sync **siembra** Supabase con lo que haya en el `localStorage` del navegador (o restaurar antes un backup JSON con el botón ⬆️ y dejar que el post-import siembre eso).
