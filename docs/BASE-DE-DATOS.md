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
--
-- 🔴 FALTA "esFOB" (boolean), Y EL CLIENTE LA ESCRIBE.
-- Este bloque describe la base REAL, verificada contra information_schema el
-- 12/08/2026. La columna "esFOB" está declarada en
-- supabase/migrations/20260803120000_poly_pipeline_por_proyecto.sql, pero esa
-- migración NUNCA se aplicó (y hoy no se puede: empieza borrando los datos de
-- Poly, que ya son reales — ver el bloque rojo de docs/HISTORIAL.md).
--
-- Consecuencia: TODO insert/upsert que incluya "esFOB" se rechaza con 400 y la
-- fila entera no entra. Le pasa al multimarca al emitir Apple, y al propio
-- cotizador de Apple, cuyo `pipeCols` la incluye — ahí sync.js se come el error
-- con un console.warn, así que falla en silencio (0 filas de Apple en la tabla).
-- El arreglo, cuando se decida hacerlo, es aditivo y de una línea:
--     alter table public.pipeline add column if not exists "esFOB" boolean;

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

## 1b. `clientes` y el portal de clientes-canal

Dos piezas nuevas (agosto 2026), pensadas para que el equipo interno y el
portal de autoservicio compartan la misma noción de "quién es el cliente" sin
que un cliente-canal externo pueda tocar `pipeline`/`app_settings`, que
siguen exigiendo `ceven_is_staff()` sin ninguna excepción.

**`public.clientes`** — tabla madre, compartida por Apple/Poly/Multi y el
portal. Complementa (no reemplaza) el texto libre `pipeline.cliente` /
`cquotes.Cliente`, que sigue siendo lo que se muestra siempre.

```sql
create table public.clientes (
  id bigint generated always as identity primary key,
  nombre text not null,
  nombre_norm text generated always as (lower(regexp_replace(btrim(nombre), '\s+', ' ', 'g'))) stored,
  email text, telefono text, cuit text, domicilio text,
  poly_tier text, apple_margen numeric,   -- lo que Ceven le da a este cliente
  notas text, created_by text, created_at timestamptz, updated_at timestamptz
);
```

`nombre_norm` (columna **generada**) usa el mismo criterio que
`cevenNormClient()` (`shared/clientes.js`) y tiene índice único: el alta desde
los cotizadores internos (`shared/clientes-db.js`) y desde `portal-admin` hace
upsert por ese índice (`on_conflict=nombre_norm`), así que un cliente que ya
existía no se duplica. RLS: `select` para todo el staff, `insert`/`update`
solo para quien no sea `lector` (mismo patrón que `pipeline`); sin `delete`.

`pipeline."clienteId"` (bigint, FK a `clientes.id`, nullable) es la columna
aditiva que liga una fila del pipeline a su cliente real — la escriben tanto
`addToPipeline()` de cada marca como `portal-emitir`.

**Portal de clientes-canal** — un cliente-canal (revendedor) nunca es
`@ceven.com` y nunca tiene acceso directo a `pipeline`/`app_settings`. Su
identidad es un claim de JWT **ortogonal** al de staff (`user_role`),
inyectado por el mismo `custom_access_token_hook` en una rama aparte que no
toca la lógica de staff:

```sql
-- rama nueva del hook, ver supabase/migrations/<...>_portal_clientes_canal.sql
select pc.id, pc.status into v_portal_id, v_portal_status
from public.portal_clientes pc where pc.user_id = (event->>'user_id')::uuid;
-- si existe: claims.portal_client_id / claims.portal_client_status
```

Helpers: `ceven_portal_client_id()` (el id, o null) y `ceven_is_portal_client()`
(activo o no) — mismo estilo `stable`/`set search_path=''` que `ceven_is_staff()`.

| Tabla | Qué guarda | RLS |
|---|---|---|
| `portal_clientes` | El login: `cliente_id` (FK a `clientes`, único), `user_id` (FK a `auth.users`, único), `email`, `status`. Solo la escribe `service_role` (Edge Function `portal-admin`) | `select` propio (`user_id = auth.uid()`) |
| `portal_perfiles` | Lo que completa el cliente-canal (razón social, CUIT, `markup_default_pct`, `perfil_completo`). Tabla **aparte** de `portal_clientes` para que ninguna policy de update pueda dejarlo tocar su propio `status` | `select`/`insert`/`update` propios (`portal_client_id = ceven_portal_client_id()`) |
| `portal_clientes_finales` | Los compradores DEL cliente-canal (externos a Ceven, no confundir con `clientes`). `markup_pct` nullable = usa el default del perfil | CRUD propio completo |
| `portal_solicitudes` | Historial de lo emitido: `total_ceven` (lo que entra al pipeline/forecast — nunca el de reventa), `total_reventa`, `markup_pct_aplicado`, `pipeline_brand`/`pipeline_id`/`pipeline_qnum` (correlación informativa, sin FK), `estado_ceven` (sincronizado, ver abajo) | Solo `select` propio — el insert es exclusivo de `service_role` |
| `portal_solicitud_items` | Detalle por SKU de cada solicitud: `precio_ceven` y `precio_reventa` | `select` propio, vía subquery a `portal_solicitudes` |

`pipeline."origenPortalId"` (uuid, FK a `portal_clientes`, nullable) marca qué
fila del pipeline interno vino de un pedido del portal — es lo que pinta la
chapita "portal" en `pipeline-view.js` de Apple y Poly.

**Storage**: bucket `portal-logos` (privado, 2 MB, solo imágenes), path
`<portal_client_id>/logo.<ext>`, policies por carpeta contra
`ceven_portal_client_id()`. Deliberadamente NO es el mecanismo `clogo`/
`app_settings` de los cotizadores internos (blob que el staff se baja entero
cada 15 s).

**Estado sincronizado**: trigger `trg_portal_sync_estado`
(`after update of estado on pipeline`, `when (old.estado is distinct from
new.estado)`) copia `estado` hacia `portal_solicitudes.estado_ceven` por
`(pipeline_brand, pipeline_id)` — es cómo el cliente-canal ve en qué va su
pedido sin poder leer `pipeline`. La función (`portal_sync_estado_desde_pipeline()`)
es `security definer` (necesaria porque `portal_solicitudes` no tiene policy
de `update` para `authenticated`) con `execute` revocado de `public`/`anon`/
`authenticated` — Postgres lo otorga por default en toda función nueva de
`public`, y `get_advisors` lo marca aunque una función de trigger no se pueda
invocar por RPC directo (falla igual, sin `NEW`/`OLD` de verdad).

**Alta desde el shell**: además de `curl`, hay un panel 🧑‍💼 "Clientes del
portal" en `src/index.html` (`shared/portal-clientes-admin.js`, admin-only),
calcado del modal de Usuarios existente.

**Edge Functions del portal** (`supabase/functions/`, mismo patrón que
`admin-users`: `service_role` + validación server-side de quién llama):

| Función | Qué hace |
|---|---|
| `portal-admin` | Alta/gestión de cuentas (solo `admin@ceven.com`). Resuelve o crea la fila de `clientes`, fija tier/margen, crea el usuario de auth y la fila de `portal_clientes` en la misma pasada — si el alta de `portal_clientes` falla, deshace el usuario recién creado en vez de dejarlo huérfano |
| `portal-catalogo` | Catálogo de una marca con el precio YA calculado para ese cliente (tier de Poly / margen de Apple). Nunca expone costo ni margen interno — el cliente-canal no puede leer `app_settings` con su propio JWT |
| `portal-emitir` | Recibe solo `{brand, items:[{sku,qty}], ...}` (intención) y RECALCULA el precio server-side con una copia byte a byte de `apple\|poly/js/pricing-core.js` (`supabase/functions/_shared/pricing/`, verificada por `scripts/check-portal-pricing-parity.js`). Escribe la fila real en `pipeline` + `cquotes`/`cqc` de la marca y el historial propio del portal. Si el body trae `regiSolicitudId` (REGI aprobado y propio, re-chequeado server-side), pisa el precio por SKU y escribe el `ejecutivo` real en vez de `"—"` |

### REGI — Deal Registration de Poly (21/08/2026, solo Poly)

Un cliente-canal puede pedir, durante la cotización, que se le aplique la
lista de precios de un negocio registrado ante Poly. Migración
`20260821120000_regi_deal_registration.sql` (refinada por
`20260821121500_regi_solicitar_informa_rechazo_previo.sql`). Detalle
completo y el porqué de cada decisión en `docs/HISTORIAL.md` (21/08/2026).

```sql
create table public.regi_codigos (
  id bigint generated always as identity primary key,
  codigo text not null unique,
  cliente_id bigint not null references public.clientes(id),
  proyecto text, vigente_desde date, vigente_hasta date,
  precios jsonb not null default '{}',   -- {sku: precio}, negociado por Poly
  notas text, created_by text, created_at timestamptz, updated_at timestamptz
);

create table public.regi_solicitudes (
  id bigint generated always as identity primary key,
  portal_client_id uuid not null references public.portal_clientes(id),
  codigo text not null,
  ejecutivo_email text not null, ejecutivo_nombre text not null,
  estado text not null default 'pendiente'   -- pendiente | aprobado | rechazado
    check (estado in ('pendiente','aprobado','rechazado')),
  regi_codigo_id bigint references public.regi_codigos(id),
  motivo_rechazo text, resuelto_por text, resuelto_at timestamptz,
  created_at timestamptz
);
```

`pipeline."regiCodigo"` (text, nullable, aditiva) — mismo criterio que
`origenPortalId`: llega gratis al `select=*` de `sync.js`, sin entrar en
`pipeCols`.

**A diferencia del resto del portal, esto NO pasa por ninguna Edge
Function.** El matching es lógica SQL pura (¿el código+cliente existen y
siguen vigentes?), así que va por dos funciones `security definer` nuevas
en vez de `service_role`:

- `portal_equipo_ceven()` — lista de ejecutivos (admin+ventas) legible por
  un cliente-canal, gateada con `ceven_is_portal_client()`. **No envuelve
  `ceven_equipo()`**: esa función filtra por `ceven_is_staff()` adentro, que
  evalúa el JWT del llamador real de la sesión — invocarla desde otra
  función SQL no cambia ese contexto, así que un cliente-canal siempre
  vería `[]` a través de un simple wrapper.
- `portal_regi_solicitar(codigo, ejecutivo_email)` — el matching, siempre
  re-evaluado fresco (nunca se asume vigente un `aprobado` viejo). Solo
  cachea para no duplicar una solicitud `pendiente` en curso; un `rechazado`
  se devuelve tal cual salvo que un match nuevo aparezca después.

RLS: `regi_codigos` — `select` staff (`ceven_is_staff()`), `insert/update/
delete` staff-writer (`ceven_is_writer()`), **sin policy para el
cliente-canal** (nunca lee esta tabla directo). `regi_solicitudes` —
`select` propio + `select` staff, `update` staff-writer (así el panel
🎯 "Códigos REGI" del shell aprueba/rechaza con un `PATCH` directo, sin
Edge Function), **sin policy de `insert` para `authenticated`** — el único
insert lo hace `portal_regi_solicitar()`.

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
