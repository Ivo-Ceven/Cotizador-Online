-- ============================================================================
--  RLS POR ROL Y POR MARCA  ·  Cotizadores Ceven
--  ---------------------------------------------------------------------------
--  ESTA MIGRACIÓN NO ESTÁ APLICADA. Leela entera antes de correrla.
--
--  QUÉ ARREGLA
--  Hoy las tres tablas tienen una sola policy:
--
--      create policy "authenticated full access" on <tabla>
--        for all to authenticated using (true) with check (true);
--
--  O sea: cualquier usuario logueado —incluido uno con rol "lector"— puede
--  leer, escribir, actualizar y BORRAR todo `pipeline`, `app_settings` y
--  `todos` de todas las marcas, con un solo `curl` contra PostgREST y su
--  propio token legítimo. Los permisos por rol de la app (cevenCanEditQuote,
--  cevenCanUsePipeline, etc.) son solo UI: no protegen nada.
--
--  ---------------------------------------------------------------------------
--  POR QUÉ NO SE PUEDE USAR user_metadata EN LAS POLICIES
--
--  El rol hoy vive en `raw_user_meta_data.role` (lo escribe la Edge Function
--  admin-users con la service_role key). Tentador escribir:
--
--      using (auth.jwt() -> 'user_metadata' ->> 'role' <> 'lector')   -- ❌ NO
--
--  Pero `user_metadata` lo puede editar EL PROPIO USUARIO: alcanza con
--
--      PUT /auth/v1/user   {"data": {"role": "admin"}}
--
--  (el mismo endpoint que la app ya usa en cevenChangeMyPassword), refrescar
--  el token y quedar como admin. Sería la misma escalada que ya se cerró en
--  el cliente, pero ahora del lado del servidor.
--
--  Por eso el rol autoritativo se muda a `public.user_roles`, que solo escribe
--  la service_role, y llega al JWT por un Custom Access Token Hook. En las
--  policies se lee el claim `user_role`, NUNCA user_metadata.
--
--  `user_metadata.role` queda como pista de UI (es lo que sigue leyendo
--  shared/auth.js) y no decide ningún permiso real.
--
--  ---------------------------------------------------------------------------
--  ⚠ PASOS MANUALES EN EL DASHBOARD — EN ESTE ORDEN
--
--  0) Authentication → Sign In / Providers → Email:
--     APAGAR "Allow new users to sign up" (Disable signup).
--     Es independiente de esta migración y probablemente lo más urgente de
--     todo: mientras el signup público esté abierto, cualquiera con la
--     publishable key (que está en shared/config.js, o sea es pública) puede
--     crearse una cuenta por POST /auth/v1/signup y quedar como
--     `authenticated`. La validación de dominio @ceven.com de la app es solo
--     de cliente; el endpoint de GoTrue no la aplica. Los usuarios se crean
--     por la Edge Function admin-users y nada más.
--     Verificá también que "Confirm email" esté como lo querés: admin-users
--     crea con email_confirm: true, así que no hace falta mail de por medio.
--
--  1) Aplicar la PARTE A de este archivo (tabla user_roles + función del hook
--     + grants). SQL Editor → pegar → Run. Podés correr el archivo entero: la
--     PARTE B (las policies) queda bien aunque el hook todavía no esté
--     activado, pero mientras no lo actives NADIE va a poder escribir (ver
--     el punto 4).
--
--  2) Revisar el sembrado de roles:
--
--         select u.email, r.role, u.raw_user_meta_data->>'role' as meta_role
--         from public.user_roles r join auth.users u on u.id = r.user_id
--         order by u.email;
--
--     La siembra copia `user_metadata.role` UNA sola vez, y ese campo es
--     editable por el usuario: si alguien ya lo había tocado, acá aparece
--     como admin. Corregí a mano lo que no cierre:
--
--         update public.user_roles set role = 'ventas'
--         where user_id = (select id from auth.users where email = 'quien@ceven.com');
--
--  3) Authentication → Hooks → "Customize Access Token (JWT) Claims":
--     Enable → Postgres → schema `public`, función `custom_access_token_hook`.
--     Guardar.
--
--  4) Cerrar sesión y volver a entrar en la app (o esperar el refresh del
--     token): los tokens viejos NO tienen el claim `user_role` y para las
--     policies de acá abajo eso significa 'lector' — lectura sí, escritura
--     no. Es a propósito: fail-closed. Si después de entrar de nuevo la app
--     sigue sin poder guardar, el hook no quedó activado.
--
--     Para confirmar que el claim está llegando, en la consola del navegador:
--         JSON.parse(atob(JSON.parse(localStorage.ceven_auth_session).access_token.split('.')[1]))
--     Tiene que aparecer "user_role".
--
--  5) Edge Function admin-users: hoy escribe el rol SOLO en user_metadata, así
--     que después de esta migración crear o editar un usuario desde el modal
--     "👤 Usuarios" NO cambia sus permisos reales. Hay que agregarle el upsert
--     a user_roles (corre con service_role, tiene permiso). En `create`,
--     después de createUser:
--
--         const { data: created, error } = await admin.auth.admin.createUser({...});
--         if (error) throw error;
--         await admin.from("user_roles")
--           .upsert({ user_id: created.user.id, role }, { onConflict: "user_id" });
--
--     y en `update_profile`, después de updateUserById:
--
--         await admin.from("user_roles")
--           .upsert({ user_id: user.id, role }, { onConflict: "user_id" });
--
--     (`delete` no necesita nada: user_roles tiene on delete cascade.)
--     Hasta que eso se deploye, los roles se cambian a mano con el UPDATE del
--     paso 2.
--
--  ---------------------------------------------------------------------------
--  CÓMO REVERTIR
--  Volver a la policy de antes (esto deja el agujero abierto de nuevo):
--
--      drop policy if exists ... (todas las de acá abajo)
--      create policy "authenticated full access" on public.pipeline
--        for all to authenticated using (true) with check (true);
--      -- ídem app_settings y todos
--
--  y desactivar el hook en Authentication → Hooks.
-- ============================================================================


-- ============================================================================
--  PARTE A · Rol autoritativo + hook que lo mete en el JWT
-- ============================================================================

create table if not exists public.user_roles (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  role       text not null default 'lector'
             check (role in ('admin', 'ventas', 'lector')),
  -- Marcas que este usuario puede ESCRIBIR. NULL = todas (comportamiento
  -- actual, nadie tiene marca asignada). Poner por ej. '{poly}' para dejar a
  -- alguien tocar solo el pipeline de Poly. Leer siempre se puede todo: el
  -- equipo comparte el pipeline y separar la lectura rompería la app.
  brands     text[],
  updated_at timestamptz not null default now()
);

comment on table public.user_roles is
  'Rol autoritativo por usuario. Lo escribe SOLO la service_role (Edge Function admin-users). NUNCA sincronizar esto desde auth.users.raw_user_meta_data con un trigger: user_metadata lo puede editar el propio usuario con PUT /auth/v1/user y reabriría la escalada a admin.';

alter table public.user_roles enable row level security;

-- Sembrado inicial desde el estado actual (user_metadata). Es una foto de una
-- sola vez, no una sincronización — revisar el resultado (paso 2 de arriba).
insert into public.user_roles (user_id, role)
select u.id,
       case
         when lower(u.email) = 'admin@ceven.com' then 'admin'
         when u.raw_user_meta_data ->> 'role' in ('admin', 'ventas', 'lector')
           then u.raw_user_meta_data ->> 'role'
         else 'lector'
       end
from auth.users u
on conflict (user_id) do nothing;

-- ---------------------------------------------------------------------------
-- Custom Access Token Hook: agrega los claims `user_role` y `user_brands` a
-- cada access_token que emite GoTrue. Corre como supabase_auth_admin.
-- ---------------------------------------------------------------------------
create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  claims   jsonb;
  v_role   text;
  v_brands text[];
  v_email  text;
begin
  select r.role, r.brands into v_role, v_brands
  from public.user_roles r
  where r.user_id = (event ->> 'user_id')::uuid;

  -- Bootstrap: la cuenta del administrador nunca se queda afuera aunque le
  -- falte la fila en user_roles (recuperación ante un borrado accidental).
  select lower(u.email) into v_email from auth.users u
  where u.id = (event ->> 'user_id')::uuid;
  if v_email = 'admin@ceven.com' then
    v_role := 'admin';
    v_brands := null;
  end if;

  -- Sin fila conocida, el rol más restrictivo. Nunca se hereda de metadata.
  if v_role is null or v_role not in ('admin', 'ventas', 'lector') then
    v_role := 'lector';
  end if;

  claims := coalesce(event -> 'claims', '{}'::jsonb);
  claims := jsonb_set(claims, '{user_role}', to_jsonb(v_role));
  if v_brands is null then
    claims := claims - 'user_brands';
  else
    claims := jsonb_set(claims, '{user_brands}', to_jsonb(v_brands));
  end if;

  return jsonb_set(event, '{claims}', claims);
end;
$$;

-- Permisos del hook (tal como los pide Supabase): lo ejecuta el rol de auth y
-- nadie más. Si `authenticated` pudiera ejecutarlo no sería un problema de
-- seguridad por sí solo, pero no tiene por qué verlo.
grant usage on schema public to supabase_auth_admin;
grant execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin;
revoke execute on function public.custom_access_token_hook(jsonb) from authenticated, anon, public;

grant select on table public.user_roles to supabase_auth_admin;
revoke all on table public.user_roles from authenticated, anon;

drop policy if exists "user_roles_select_auth_admin" on public.user_roles;
create policy "user_roles_select_auth_admin" on public.user_roles
  as permissive for select to supabase_auth_admin
  using (true);

-- Cada uno puede ver SU propia fila (útil para depurar desde la app). Nadie
-- puede escribir por RLS: la escritura pasa solo por la service_role, que
-- ignora RLS.
drop policy if exists "user_roles_select_own" on public.user_roles;
create policy "user_roles_select_own" on public.user_roles
  for select to authenticated
  using (user_id = auth.uid());


-- ============================================================================
--  PARTE B · Helpers + policies por operación
-- ============================================================================

-- Rol de la app según el JWT. Sin el claim (token viejo, o hook desactivado)
-- devuelve 'lector': fail-closed, se lee pero no se escribe.
create or replace function public.ceven_role()
returns text
language sql
stable
set search_path = ''
as $$
  select coalesce(nullif(auth.jwt() ->> 'user_role', ''), 'lector');
$$;

-- Marcas escribibles según el JWT. NULL = todas.
create or replace function public.ceven_brands()
returns text[]
language sql
stable
set search_path = ''
as $$
  select case
    when jsonb_typeof(auth.jwt() -> 'user_brands') = 'array'
      then array(select jsonb_array_elements_text(auth.jwt() -> 'user_brands'))
    else null
  end;
$$;

-- ¿Puede escribir algo (cualquier tabla sin marca)?
create or replace function public.ceven_is_writer()
returns boolean
language sql
stable
set search_path = ''
as $$
  select public.ceven_role() <> 'lector';
$$;

-- ¿Puede escribir en ESTA marca?
create or replace function public.ceven_can_write_brand(b text)
returns boolean
language sql
stable
set search_path = ''
as $$
  select case
    when public.ceven_role() = 'admin'  then true
    when public.ceven_role() = 'lector' then false
    else public.ceven_brands() is null or b = any(public.ceven_brands())
  end;
$$;

grant execute on function public.ceven_role()                to authenticated;
grant execute on function public.ceven_brands()              to authenticated;
grant execute on function public.ceven_is_writer()           to authenticated;
grant execute on function public.ceven_can_write_brand(text) to authenticated;


-- ---------------------------------------------------------------------------
--  pipeline  ·  una policy por operación, no `for all`
-- ---------------------------------------------------------------------------
drop policy if exists "authenticated full access" on public.pipeline;
drop policy if exists "pipeline_select" on public.pipeline;
drop policy if exists "pipeline_insert" on public.pipeline;
drop policy if exists "pipeline_update" on public.pipeline;
drop policy if exists "pipeline_delete" on public.pipeline;

-- Lectura: todo el equipo ve el pipeline completo de todas las marcas. Es como
-- funciona la app hoy (shared/sync.js baja las filas de la marca activa pero
-- el dato es compartido) y restringirlo la rompería.
create policy "pipeline_select" on public.pipeline
  for select to authenticated
  using (true);

-- El WITH CHECK sobre `brand` es lo que impide que un usuario limitado a una
-- marca escriba filas de otra (o invente una marca nueva que su claim no lista).
create policy "pipeline_insert" on public.pipeline
  for insert to authenticated
  with check (public.ceven_can_write_brand(brand));

-- USING filtra qué filas ve para actualizar; WITH CHECK valida cómo quedan.
-- Hacen falta las dos: sin WITH CHECK se podría mover una fila de 'poly' a
-- 'apple' y saltearse el aislamiento.
create policy "pipeline_update" on public.pipeline
  for update to authenticated
  using (public.ceven_can_write_brand(brand))
  with check (public.ceven_can_write_brand(brand));

create policy "pipeline_delete" on public.pipeline
  for delete to authenticated
  using (public.ceven_can_write_brand(brand));

-- OPCIONAL (no aplicado): la app dice que un "ventas" solo puede modificar
-- filas cuyo Ejecutivo es él mismo (cevenCanEditPipelineRow). Para llevar eso
-- a la base habría que comparar contra el nombre del vendedor, que hoy es
-- texto libre en la columna `ejecutivo` y no tiene relación con auth.users.
-- Si en algún momento se agrega user_roles.nombre, la policy sería:
--
--   create policy "pipeline_update" on public.pipeline
--     for update to authenticated
--     using (
--       public.ceven_can_write_brand(brand)
--       and (public.ceven_role() = 'admin'
--            or lower(trim(coalesce(ejecutivo, ''))) = lower(trim(coalesce(
--                 (select nombre from public.user_roles where user_id = auth.uid()), ''))))
--     )
--     with check (...lo mismo...);
--
-- No se aplica ahora porque un `ejecutivo` mal tipeado dejaría al vendedor sin
-- poder tocar su propia fila, y eso se descubre en producción.


-- ---------------------------------------------------------------------------
--  app_settings  ·  acá vive el price list con los costos
-- ---------------------------------------------------------------------------
drop policy if exists "authenticated full access" on public.app_settings;
drop policy if exists "app_settings_select" on public.app_settings;
drop policy if exists "app_settings_insert" on public.app_settings;
drop policy if exists "app_settings_update" on public.app_settings;
drop policy if exists "app_settings_delete" on public.app_settings;

create policy "app_settings_select" on public.app_settings
  for select to authenticated
  using (true);

create policy "app_settings_insert" on public.app_settings
  for insert to authenticated
  with check (public.ceven_can_write_brand(brand));

create policy "app_settings_update" on public.app_settings
  for update to authenticated
  using (public.ceven_can_write_brand(brand))
  with check (public.ceven_can_write_brand(brand));

create policy "app_settings_delete" on public.app_settings
  for delete to authenticated
  using (public.ceven_can_write_brand(brand));


-- ---------------------------------------------------------------------------
--  todos  ·  tareas del equipo, viven en el shell y NO son de ninguna marca
--            (no hay columna `brand`: acá no hay aislamiento que hacer)
-- ---------------------------------------------------------------------------
drop policy if exists "authenticated full access" on public.todos;
drop policy if exists "todos_select" on public.todos;
drop policy if exists "todos_insert" on public.todos;
drop policy if exists "todos_update" on public.todos;
drop policy if exists "todos_delete" on public.todos;

create policy "todos_select" on public.todos
  for select to authenticated
  using (true);

create policy "todos_insert" on public.todos
  for insert to authenticated
  with check (public.ceven_is_writer());

-- Update abierto a cualquier no-lector a propósito: la checklist es
-- colaborativa y marcar como hecha una tarea de otro es el uso normal.
create policy "todos_update" on public.todos
  for update to authenticated
  using (public.ceven_is_writer())
  with check (public.ceven_is_writer());

create policy "todos_delete" on public.todos
  for delete to authenticated
  using (public.ceven_is_writer());


-- ============================================================================
--  VERIFICACIÓN (correr después de aplicar)
-- ============================================================================
-- 1. Que no quedó ninguna policy `ALL` con USING(true):
--
--      select tablename, policyname, cmd, qual, with_check
--      from pg_policies where schemaname = 'public' order by tablename, cmd;
--
--    Esperado: 4 policies por tabla (SELECT/INSERT/UPDATE/DELETE), y ninguna
--    con cmd = 'ALL'.
--
-- 2. Que el claim llega (después de re-loguear), desde la app:
--
--      select public.ceven_role();   -- via PostgREST: /rest/v1/rpc/ceven_role
--
-- 3. Prueba real de que un lector no escribe: crear un usuario de prueba con
--    rol 'lector', loguearse con él y probar
--      curl -X POST "$SUPABASE_URL/rest/v1/todos" -H "apikey: $ANON" \
--           -H "Authorization: Bearer $TOKEN_DEL_LECTOR" \
--           -H "Content-Type: application/json" \
--           -d '[{"id":999999,"texto":"prueba","hecho":false}]'
--    Esperado: 401/403 con "new row violates row-level security policy".
--    Antes de esta migración eso devolvía 201.
