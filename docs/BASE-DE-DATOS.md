# Base de datos · Esquema (Supabase)

Proyecto activo: **`iqewnebpdyctexavtpmt`** (config en `src/shared/config.js`). Este documento describe el esquema desplegado y cómo lo usa la app. Estado 2026-07-14: tablas + policies + Edge Function **aplicadas**.

La app habla con Supabase **por REST puro** (sin SDK):

- **PostgREST** (`/rest/v1/`) para las tablas `pipeline` y `app_settings` — con `apikey` = publishable key y `Authorization: Bearer <access_token del usuario logueado>`. Sin JWT de usuario la base rechaza el request (401).
- **GoTrue** (`/auth/v1/`) para login con email/contraseña, refresh de token y cambio de contraseña propia.
- **Edge Function** `admin-users` (`/functions/v1/admin-users`) para gestión de usuarios (solo el admin).

Las tablas separan los datos **por marca** (columna `brand`): el cotizador Apple opera siempre con `brand='apple'`; los futuros cotizadores Poly/HP usarán su propio valor. Los usuarios son compartidos entre marcas.

## 1. Tablas

Los nombres de columna son **camelCase** — en el DDL van entre comillas dobles, exactamente como acá (PostgREST es case-sensitive):

```sql
-- Pipeline: una fila por entrada de pipeline (espeja localStorage.cpipeline)
create table public.pipeline (
  brand           text not null default 'apple',  -- marca dueña de la fila
  id              bigint,                    -- Date.now() generado por el cliente
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
  "ovLink"        text,       -- link a la orden de venta
  opg             text,       -- usada solo por brand='poly': número de precio especial que asigna la marca
  salas           jsonb,      -- usada solo por brand='poly': desglose [{qNum,sala,monto,fecha}] de las Salas agrupadas bajo el OPG
  factura         text,       -- usada solo por brand='poly': número de factura, se completa post-hoc (análogo a ovLink)
  primary key (brand, id)
);
-- Nota: el campo local `skuOvLinks` NO se sincroniza (excluido a propósito en sync.js).
-- Nota: qMac/qIph/qIpad/qServ/qAcc/montoMac.../qNum/margenPond/skuStatus/skuMesCierre/skuPartial*/ovLink
-- son 100% de brand='apple' — para brand='poly' quedan siempre NULL (agregados 2026-07-24, migración aditiva).

-- Tareas del equipo: organizador colaborativo del SHELL (src/index.html), NO es
-- de una marca — sin columna brand, un solo checklist compartido entre Apple y
-- Poly. Sincroniza por REST directo (shared/todos.js), no por el intercept de
-- localStorage de los cotizadores. Agregada 2026-07-27.
create table public.todos (
  id        bigint primary key,   -- Date.now() generado por el cliente
  texto     text not null,
  hecho     boolean not null default false,
  "creadoPor" text,               -- nombre o email de quien la creó
  fecha     text,                 -- dd/mm/aaaa (para mostrar)
  "fechaISO" text                 -- ISO 8601 (para ordenar)
);
alter table public.todos enable row level security;
create policy "authenticated full access" on public.todos
  for all to authenticated using (true) with check (true);
revoke all on table public.todos from anon;

-- Settings compartidos: espeja claves de localStorage como key/value, por marca
create table public.app_settings (
  brand text not null default 'apple',
  key   text,                 -- cquotes | cpl | carchive | cnac | cqc | ctarget |
                              -- ctarget_manual | clogo | clogo_dark | cnac_mac24_v2
  value text,                 -- el JSON serializado tal cual está en localStorage
  primary key (brand, key)
);
```

Requisitos que impone `sync.js`:

- **PK compuestas obligatorias** `(brand,id)` / `(brand,key)`: los upserts usan `Prefer: resolution=merge-duplicates` y resuelven sobre la PK; la marca aísla los datos de cada cotizador.
- Todos los GET/DELETE de la sync filtran `brand=eq.<marca>`; cada fila subida lleva su `brand`.
- Los `jsonb` reciben `null` cuando el override se limpia localmente (no omitir la columna).
- `app_settings.value` puede ser **grande** (el price list entero, o el logo en base64) — es `text`, sin límite.

### Permisos (RLS) — solo usuarios autenticados

La sync manda `apikey` = publishable key y `Authorization: Bearer <access_token del usuario>` (lo toma de `ceven_auth_session` en cada request, con retry post-refresh si expira). Las policies exigen usuario logueado; el rol `anon` no tiene ningún privilegio:

```sql
alter table public.pipeline     enable row level security;
alter table public.app_settings enable row level security;
create policy "authenticated full access" on public.pipeline
  for all to authenticated using (true) with check (true);
create policy "authenticated full access" on public.app_settings
  for all to authenticated using (true) with check (true);
revoke all on table public.pipeline from anon;
revoke all on table public.app_settings from anon;
```

> Nota de diseño: cualquier usuario **logueado** puede leer/escribir todo — los datos son compartidos por el equipo y los roles (admin/ventas/lector) se aplican en la UI. El linter de Supabase lo marca como WARN (`using (true)`); es deliberado en esta etapa. Un endurecimiento futuro por roles requeriría claims en el JWT y policies por rol.

## 2. Autenticación (GoTrue)

- Proveedor **Email/Password** habilitado, sin confirmación por mail (los usuarios los crea el admin ya confirmados).
- **Signups públicos deshabilitados** (Dashboard → Authentication → Sign In/Up): la única vía de alta es la Edge Function `admin-users`, que valida dominio y admin server-side.
- Usuarios con email `@ceven.com` (validado server-side en la Edge Function; el client-side es solo UX).
- Perfil en `user_metadata`: `{ "nombre": "Fer Castro", "role": "admin" | "ventas" | "lector" }`.
- **Crear manualmente el usuario `admin@ceven.com`** (Dashboard → Authentication → Add user, auto-confirm). Es admin por bootstrap aunque no tenga `role` en metadata.

Endpoints que usa la app: `POST /auth/v1/token?grant_type=password`, `?grant_type=refresh_token`, `POST /auth/v1/logout`, `PUT /auth/v1/user` (cambio de contraseña propia).

## 3. Edge Function `admin-users`

**Desplegada** (2026-07-14, verify_jwt on) con validaciones server-side adicionales al código de referencia de abajo: dominio `@ceven.com` y rol válido en `create`/`update_profile`, largo mínimo de contraseña, y bloqueo de `delete` sobre la cuenta del admin. Contrato que espera el frontend (`shared/auth.js`):

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

1. ~~Crear proyecto Supabase nuevo~~ ✔ (`iqewnebpdyctexavtpmt`)
2. ~~Correr el SQL de tablas + policies~~ ✔ (migraciones `esquema_inicial_pipeline_y_settings`, `brand_multimarcas_pk_compuestas`, `rls_solo_usuarios_autenticados`)
3. ~~Desplegar la Edge Function `admin-users`~~ ✔
4. ~~Completar `src/shared/config.js`~~ ✔ (publishable key)
5. **Pendiente (Dashboard):** deshabilitar signups públicos y crear `admin@ceven.com` (auto-confirmado).
6. **Pendiente:** abrir la app, loguearse y restaurar el backup JSON con el botón ⬆️ — el post-import siembra Supabase con esos datos (con la base vacía, el primer login también siembra lo que haya en el localStorage del navegador).
