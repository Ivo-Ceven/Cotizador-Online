-- ============================================================================
--  PORTAL DE CLIENTES-CANAL · modelo de datos (Fase 1)
--  ---------------------------------------------------------------------------
--  Identidad separada de staff: un cliente-canal NUNCA es @ceven.com y NUNCA
--  debe poder leer/escribir pipeline/app_settings/todos directo (esas policies
--  siguen exigiendo ceven_is_staff() sin excepcion, no se tocan acá). Su claim
--  de JWT (portal_client_id) es ortogonal al de staff (user_role) — una cuenta
--  nunca tiene los dos: lo garantiza la Edge Function de alta (portal-admin),
--  nunca la base.
--
--  Ver docs/HISTORIAL.md y el plan "Portal de clientes-canal" para el porqué
--  completo de cada decisión.
-- ============================================================================

-- ── 1. Tabla portal_clientes primero (todo lo demás la referencia) ────────

create table public.portal_clientes (
  id uuid primary key default gen_random_uuid(),
  cliente_id bigint not null unique references public.clientes(id) on delete cascade,
  user_id uuid not null unique references auth.users(id) on delete cascade,
  email text not null,
  status text not null default 'activo' check (status in ('activo','suspendido')),
  created_by text,
  created_at timestamptz not null default now()
);

comment on table public.portal_clientes is
  'Cuentas de login del portal de clientes-canal. Un cliente_id de la tabla clientes puede o no tener fila acá — tenerla es lo que le da acceso al portal.';

alter table public.portal_clientes enable row level security;

create policy "portal_clientes_select_own" on public.portal_clientes
  for select to authenticated using (user_id = auth.uid());

revoke all on public.portal_clientes from anon;

-- ── 2. Helpers del claim de portal (mismo estilo que ceven_is_staff()) ─────
-- Van ANTES que el resto de las tablas/policies: las usan en su USING/CHECK.

create or replace function public.ceven_portal_client_id()
returns uuid
language sql
stable
set search_path = ''
as $$
  select nullif(auth.jwt() ->> 'portal_client_id', '')::uuid;
$$;

comment on function public.ceven_portal_client_id() is
  'El id de portal_clientes de la sesión actual, o null si no es una cuenta de portal. Claim inyectado por custom_access_token_hook, ortogonal a user_role.';

create or replace function public.ceven_is_portal_client()
returns boolean
language sql
stable
set search_path = ''
as $$
  select public.ceven_portal_client_id() is not null
     and coalesce(auth.jwt() ->> 'portal_client_status', '') = 'activo';
$$;

comment on function public.ceven_is_portal_client() is
  'true si la sesión actual es una cuenta de cliente-canal activa. No la usa ninguna policy de pipeline/app_settings/todos — esas siguen exigiendo ceven_is_staff() sin excepción.';

-- ── 3. El resto de las tablas del portal ────────────────────────────────────

-- Lo que controla el propio cliente-canal de sí mismo. Tabla APARTE de
-- portal_clientes a propósito: así ninguna policy de UPDATE puede terminar
-- dejándolo tocar su propio status o el cliente_id al que está atado.
create table public.portal_perfiles (
  portal_client_id uuid primary key references public.portal_clientes(id) on delete cascade,
  razon_social text,
  cuit text,
  domicilio text,
  telefono text,
  contacto text,
  markup_default_pct numeric not null default 0,
  perfil_completo boolean not null default false,
  updated_at timestamptz not null default now()
);

comment on table public.portal_perfiles is
  'Datos que completa el propio cliente-canal la primera vez que entra, más su markup de reventa default. Nunca contiene tier/margen de Ceven — eso vive en clientes.';

alter table public.portal_perfiles enable row level security;

create policy "portal_perfiles_select_own" on public.portal_perfiles
  for select to authenticated using (portal_client_id = public.ceven_portal_client_id());
create policy "portal_perfiles_insert_own" on public.portal_perfiles
  for insert to authenticated with check (portal_client_id = public.ceven_portal_client_id());
create policy "portal_perfiles_update_own" on public.portal_perfiles
  for update to authenticated
  using (portal_client_id = public.ceven_portal_client_id())
  with check (portal_client_id = public.ceven_portal_client_id());

revoke all on public.portal_perfiles from anon;

create trigger portal_perfiles_updated_at
before update on public.portal_perfiles
for each row execute function public.clientes_set_updated_at();

-- Los clientes finales del cliente-canal (puede tener varios: cotiza a
-- distintos compradores en el tiempo).
create table public.portal_clientes_finales (
  id bigint generated always as identity primary key,
  portal_client_id uuid not null references public.portal_clientes(id) on delete cascade,
  nombre text not null check (length(btrim(nombre)) > 0),
  cuit text,
  contacto text,
  domicilio text,
  markup_pct numeric,   -- null = usa portal_perfiles.markup_default_pct
  created_at timestamptz not null default now()
);

comment on table public.portal_clientes_finales is
  'Los compradores del cliente-canal (externos a Ceven). No tiene relación con la tabla clientes, que es de clientes DE Ceven.';

create index portal_clientes_finales_pc_idx on public.portal_clientes_finales (portal_client_id);

alter table public.portal_clientes_finales enable row level security;

create policy "pcf_select_own" on public.portal_clientes_finales
  for select to authenticated using (portal_client_id = public.ceven_portal_client_id());
create policy "pcf_insert_own" on public.portal_clientes_finales
  for insert to authenticated with check (portal_client_id = public.ceven_portal_client_id());
create policy "pcf_update_own" on public.portal_clientes_finales
  for update to authenticated
  using (portal_client_id = public.ceven_portal_client_id())
  with check (portal_client_id = public.ceven_portal_client_id());
create policy "pcf_delete_own" on public.portal_clientes_finales
  for delete to authenticated using (portal_client_id = public.ceven_portal_client_id());

revoke all on public.portal_clientes_finales from anon;

-- Historial de lo emitido por el portal. SOLO la service_role inserta (Edge
-- Function portal-emitir) — el cliente-canal nunca hace INSERT directo,
-- porque total_ceven tiene que salir de un recálculo server-side, nunca de lo
-- que mande el body. Por eso NO hay policy de insert/update/delete acá.
create table public.portal_solicitudes (
  id bigint generated always as identity primary key,
  portal_client_id uuid not null references public.portal_clientes(id) on delete cascade,
  cliente_final_id bigint references public.portal_clientes_finales(id) on delete set null,
  brand text not null,
  proyecto text,
  moneda text not null default 'USD',
  total_ceven numeric not null,       -- lo que Ceven le cotiza al canal (nunca visible a otro cliente-canal)
  total_reventa numeric not null,     -- lo que el canal le cobra a su cliente final
  markup_pct_aplicado numeric,
  pipeline_brand text,
  pipeline_id bigint,                 -- correlación informativa con public.pipeline (sin FK: PK compuesta brand+id)
  created_at timestamptz not null default now()
);

comment on table public.portal_solicitudes is
  'Historial de pedidos emitidos por el portal. total_ceven es lo que entra al pipeline interno; total_reventa es plata del cliente-canal, no de Ceven, y no se mezcla con el forecast.';

create index portal_solicitudes_pc_idx on public.portal_solicitudes (portal_client_id);
create index portal_solicitudes_cf_idx on public.portal_solicitudes (cliente_final_id);

alter table public.portal_solicitudes enable row level security;

create policy "psol_select_own" on public.portal_solicitudes
  for select to authenticated using (portal_client_id = public.ceven_portal_client_id());

revoke all on public.portal_solicitudes from anon;

create table public.portal_solicitud_items (
  id bigint generated always as identity primary key,
  solicitud_id bigint not null references public.portal_solicitudes(id) on delete cascade,
  sku text not null,
  description text,
  qty numeric not null check (qty > 0),
  precio_ceven numeric not null,      -- calculado server-side, nunca lo manda el cliente
  precio_reventa numeric not null
);

create index portal_solicitud_items_sol_idx on public.portal_solicitud_items (solicitud_id);

alter table public.portal_solicitud_items enable row level security;

create policy "psoli_select_own" on public.portal_solicitud_items
  for select to authenticated using (
    solicitud_id in (
      select id from public.portal_solicitudes
      where portal_client_id = public.ceven_portal_client_id()
    )
  );

revoke all on public.portal_solicitud_items from anon;

-- ── 4. Extensión del hook de JWT (rama nueva, ortogonal a la de staff) ─────
-- La rama de staff queda BYTE A BYTE igual que en
-- 20260731180813_rls_parte_a_user_roles_y_hook: no se toca su lógica, solo se
-- agrega el bloque de portal al final antes de devolver.

create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable security definer
set search_path to ''
as $function$
declare
  claims   jsonb;
  v_role   text;
  v_brands text[];
  v_email  text;
  v_portal_id     uuid;
  v_portal_status text;
begin
  select r.role, r.brands into v_role, v_brands
  from public.user_roles r
  where r.user_id = (event ->> 'user_id')::uuid;

  -- Bootstrap: la cuenta del administrador nunca se queda afuera aunque le
  -- falte la fila en user_roles (recuperacion ante un borrado accidental).
  select lower(u.email) into v_email from auth.users u
  where u.id = (event ->> 'user_id')::uuid;
  if v_email = 'admin@ceven.com' then
    v_role := 'admin';
    v_brands := null;
  end if;

  -- Sin fila conocida, el rol mas restrictivo. Nunca se hereda de metadata.
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

  -- Rama nueva, ortogonal: cliente del portal. Una cuenta nunca es staff Y
  -- cliente-canal a la vez — lo garantiza portal-admin al dar de alta (nunca
  -- invita un email @ceven.com ni crea portal_clientes para alguien que ya
  -- tiene fila en user_roles), no esta función.
  select pc.id, pc.status into v_portal_id, v_portal_status
  from public.portal_clientes pc
  where pc.user_id = (event ->> 'user_id')::uuid;

  if v_portal_id is not null then
    claims := jsonb_set(claims, '{portal_client_id}', to_jsonb(v_portal_id));
    claims := jsonb_set(claims, '{portal_client_status}', to_jsonb(coalesce(v_portal_status, 'activo')));
  else
    claims := claims - 'portal_client_id' - 'portal_client_status';
  end if;

  return jsonb_set(event, '{claims}', claims);
end;
$function$;

-- ── 5. Badge de origen en el pipeline interno (aditiva, nullable) ─────────

alter table public.pipeline
  add column if not exists "origenPortalId" uuid references public.portal_clientes(id) on delete set null;

create index if not exists pipeline_origen_portal_idx on public.pipeline ("origenPortalId");

-- ── 6. Storage: logo del cliente-canal ──────────────────────────────────────
-- Privado, path <portal_client_id>/logo.<ext>. NO reusa el mecanismo clogo/
-- app_settings (blob por-marca que el staff se baja completo cada 15s) —
-- sumarle un logo por cliente-canal ahí agravaría ese problema latente y
-- ademas esa tabla sigue atada a ceven_is_staff().

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('portal-logos', 'portal-logos', false, 2097152, array['image/png','image/jpeg','image/webp','image/svg+xml']);

create policy "portal_logo_select_own" on storage.objects
  for select to authenticated
  using (bucket_id = 'portal-logos' and (storage.foldername(name))[1] = public.ceven_portal_client_id()::text);

create policy "portal_logo_insert_own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'portal-logos' and (storage.foldername(name))[1] = public.ceven_portal_client_id()::text);

create policy "portal_logo_update_own" on storage.objects
  for update to authenticated
  using (bucket_id = 'portal-logos' and (storage.foldername(name))[1] = public.ceven_portal_client_id()::text)
  with check (bucket_id = 'portal-logos' and (storage.foldername(name))[1] = public.ceven_portal_client_id()::text);
