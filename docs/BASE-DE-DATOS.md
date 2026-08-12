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
  id        bigint primary key,   -- generado por el cliente: Date.now()*1000 + ruido
  texto     text not null,
  hecho     boolean not null default false,   -- espejo de estado='done', ver abajo
  estado    text not null default 'todo',     -- todo | doing | done (columna del tablero)
  asignados jsonb not null default '[]',      -- emails @ceven.com delegados
  equipo    text not null default 'General',  -- tablero al que pertenece (NOMBRE, no FK)
  "terminadaEn" timestamptz,      -- cuándo pasó a done; la escribe SOLO el trigger
  "creadoPor" text,               -- nombre o email de quien la creó
  fecha     text,                 -- dd/mm/aaaa (para mostrar)
  "fechaISO" text                 -- ISO 8601 (para ordenar)
);

-- Equipos de trabajo del tablero. `miembros` es a quién se le puede DELEGAR
-- dentro de ese tablero, no quién puede verlo.
create table public.equipos (
  nombre      text primary key,
  miembros    jsonb not null default '[]',
  "creadoPor" text,
  "creadoISO" text
);
-- `hecho` quedó redundante con `estado`, pero NO se borra: la app es una PWA
-- offline-first, así que después de un deploy siguen habiendo navegadores con
-- el bundle anterior mandando PATCH {"hecho":true} sin saber que existe
-- `estado`. El trigger `todos_sync_estado` deriva uno del otro (gana el que
-- cambió; si cambian los dos, gana `estado`) para que no puedan desfasarse.
-- Se puede dropear junto con el trigger cuando no queden clientes viejos.
--
-- El mismo trigger sella `terminadaEn` al ENTRAR a done y la limpia al salir.
-- El cliente NUNCA la manda: el reloj del navegador lo pone el usuario, y una
-- máquina adelantada archivaría tareas de más para todo el equipo. Sobre esa
-- fecha corre el archivado automático (3 días, constante DIAS_ARCHIVO en
-- shared/todos.js): las terminadas hace más salen del tablero pero no se
-- borran.
--
-- ⚠ `todos.equipo` guarda el NOMBRE del equipo y no una FK a `equipos`, porque
-- la app es offline-first y una tarea creada sin conexión no puede depender de
-- resolver un id contra el servidor. Efecto buscado: una tarea que apunta a un
-- equipo inexistente igual se muestra, en un tablero con ese nombre — con una
-- FK, desaparecería.
--
-- ⚠⚠ LOS TABLEROS NO SON UNA BARRERA DE PRIVACIDAD. Separan el trabajo en la
-- pantalla: el cliente se baja `todos?select=*` entero y filtra en JavaScript,
-- y las policies dejan que cualquier @ceven.com lea y escriba todos los
-- equipos. Es una decisión explícita (04/08/2026), no un olvido. Para que
-- fuera aislamiento real habría que filtrar por pertenencia en las policies
-- (join contra `equipos.miembros` con `auth.jwt() ->> 'email'`) y que el
-- cliente pida solo su equipo — ver el encabezado de la migración
-- 20260804200000_tareas_equipos.sql.
alter table public.todos enable row level security;
create policy "authenticated full access" on public.todos
  for all to authenticated using (true) with check (true);
revoke all on table public.todos from anon;

-- Settings compartidos: espeja claves de localStorage como key/value, por marca
create table public.app_settings (
  brand text not null default 'apple',
  -- ⚠ `key` es la clave REAL de localStorage, o sea CON el prefijo de la marca:
  --      apple → cpl, cquotes, cqc…        (su prefix es '' por historia)
  --      poly  → poly_cpl, poly_cquotes…   (su prefix es 'poly_')
  --      multi → multi_cquotes, multi_cqc…
  --    Lo que va SIN prefijo es la declaración `settingKeys` de brand.js;
  --    sync.js le antepone cevenK() antes de subir (ver sync.js:73-80 y :564).
  --    Es redundante con la columna `brand`, pero es lo que ya hay en la base.
  --    Quien lea app_settings de OTRA marca (lo hace el cotizador multimarca)
  --    tiene que pedir la clave prefijada: `key=eq.cpl` no encuentra a Poly.
  key   text,
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

Desde el **31/07/2026** hay cuatro policies por tabla (una por operación) en vez de una sola `for all using(true)`. Las definen las migraciones `20260730120000_rls_por_rol_y_marca.sql` y `20260731090000_exigir_dominio_ceven.sql`; el detalle y el porqué están ahí y en `HISTORIAL.md`. En resumen:

| Quién | Lee | Escribe |
|---|---|---|
| `anon` (publishable key sola, sin sesión) | nada | nada |
| Autenticado **sin** email `@ceven.com` | **nada** | nada |
| `@ceven.com` con rol `lector` | todo | nada |
| `@ceven.com` con rol `ventas` | todo | solo las marcas de su `brands` (o todas si es `NULL`) |
| `@ceven.com` con rol `admin` | todo | todo |

Las policies llaman a cuatro funciones: `ceven_is_staff()` (dominio), `ceven_role()`, `ceven_is_writer()` y `ceven_can_write_brand(b)`.

Hay una quinta que **no** es de policies sino de lectura directa desde la app: **`ceven_equipo()`** (migración `20260804100000`), que devuelve email, nombre y rol de las cuentas `@ceven.com`. La necesita el tablero de tareas para poder arrastrar un miembro sobre una tarjeta; hasta entonces la única forma de listar usuarios era la Edge Function `admin-users`, que solo responde a `admin@ceven.com` — o sea que delegar habría sido una función de un solo usuario. Es `security definer` porque `auth.users` no es legible por `authenticated` (ni debe serlo): devuelve **solo esos tres campos** y lleva el filtro `ceven_is_staff()` adentro del cuerpo, así que con un token que no sea `@ceven.com` devuelve cero filas.

Dos decisiones que conviene no revertir sin entenderlas:

- **El dominio se exige dentro de la policy**, no solo en la config de GoTrue. Que el signup público esté apagado y no haya OAuth habilitado es config de dashboard: invisible desde el repo y silenciosa si cambia. Con `ceven_is_staff()` en la policy, prender "Sign in with Google" deja de ser un agujero.
- **El rol sale del claim `user_role`**, que inyecta el Custom Access Token Hook desde `public.user_roles`. **Nunca** de `user_metadata`: ese campo lo edita el propio usuario con `PUT /auth/v1/user` (el mismo endpoint que usa "cambiar mi contraseña"), así que leerlo en una policy sería una escalada a admin de un request.

Efecto secundario esperado: un cambio de rol no es inmediato — se aplica cuando el usuario refresca el token (~1 h) o vuelve a entrar. Para forzarlo, cerrarle la sesión.

## 2. Autenticación (GoTrue)

- Proveedor **Email/Password** habilitado, sin confirmación por mail (los usuarios los crea el admin ya confirmados).
- **Signups públicos deshabilitados** (Dashboard → Authentication → Sign In/Up): la única vía de alta es la Edge Function `admin-users`, que valida dominio y admin server-side.
- Usuarios con email `@ceven.com` (validado server-side en la Edge Function; el client-side es solo UX).
- Perfil en `user_metadata`: `{ "nombre": "Fer Castro", "role": "admin" | "ventas" | "lector" }`. **El `role` de acá es solo una pista para la UI** — el autoritativo vive en `public.user_roles` (ver la sección de RLS). Los escribe juntos la Edge Function.
- **Custom Access Token Hook activo** (Authentication → Hooks): `public.custom_access_token_hook` agrega el claim `user_role` a cada token. Si se desactiva, las policies dan `lector` a todos y la app queda en solo lectura.
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

**El código fuente vive en `supabase/functions/admin-users/index.ts`** (versionado desde el 31/07/2026; antes existía solo desplegado, con una copia inlineada acá que quedó desactualizada). Usa la `service_role` key que la plataforma inyecta como `SUPABASE_SERVICE_ROLE_KEY` — nunca exponerla en el frontend.

Lo que conviene saber sin abrir el archivo:

- **Valida server-side** que quien llama sea `admin@ceven.com` (con su `access_token`), que el email sea del dominio y que el rol sea válido. Las validaciones del frontend son solo UX.
- **Escribe el rol en los dos lados**: `public.user_roles` (el autoritativo, que leen las policies vía el claim del JWT) y `user_metadata` (pista para la UI). Van juntas para que no diverjan.
- **`list` lee el rol de `user_roles`**, no de `user_metadata`: es el que la base realmente aplica. Un usuario sin fila se muestra como `lector` y se marca con `sinRol`, porque eso es lo que el hook le va a dar.
- **`delete` no toca `user_roles`**: la FK tiene `on delete cascade`.
- **Un cambio de rol no es inmediato**: las policies leen el claim del JWT, que se refresca al vencer el token (~1 h) o al volver a entrar. La respuesta de `update_profile` trae `avisoRol` con ese texto.

## 4. Checklist de puesta en marcha

1. ~~Crear proyecto Supabase nuevo~~ ✔ (`iqewnebpdyctexavtpmt`)
2. ~~Correr el SQL de tablas + policies~~ ✔ (migraciones `esquema_inicial_pipeline_y_settings`, `brand_multimarcas_pk_compuestas`, `rls_solo_usuarios_autenticados`)
3. ~~Desplegar la Edge Function `admin-users`~~ ✔
4. ~~Completar `src/shared/config.js`~~ ✔ (publishable key)
5. ~~Deshabilitar signups públicos y crear `admin@ceven.com`~~ ✔ (30/07/2026). Cerrar el signup no afecta el alta desde la app: `admin-users` usa la Admin API (`auth.admin.createUser`), que no pasa por `disable_signup`.
6. ~~Activar el Custom Access Token Hook~~ ✔ (31/07/2026, Dashboard → Authentication → Hooks). Sin él nadie tiene claim `user_role` y las policies tratan a todos como `lector`.
7. **Pendiente (Dashboard):** activar la protección de contraseñas filtradas (Authentication → Passwords). Es lo único que reporta hoy el linter de seguridad.
8. **Pendiente:** abrir la app, loguearse y restaurar el backup JSON con el botón ⬆️ — el post-import siembra Supabase con esos datos (con la base vacía, el primer login también siembra lo que haya en el localStorage del navegador).
