-- REGI: código de Deal Registration de Poly, pedido desde el portal de
-- clientes-canal. Ver docs/HISTORIAL.md (21/08/2026) y el plan de diseño
-- para el porqué de cada decisión.
--
-- Exclusivo de Poly a propósito: sin columna `brand` en ninguna tabla nueva.
--
-- Cero Edge Functions nuevas: el matching (¿este código+cliente existe y
-- está vigente?) es lógica SQL pura, va por `security definer` igual que
-- ceven_equipo()/portal_sync_estado_desde_pipeline() — no por service_role.

-- ── Tablas ──────────────────────────────────────────────────────────────

create table public.regi_codigos (
  id bigint generated always as identity primary key,
  codigo text not null check (length(btrim(codigo)) > 0),
  cliente_id bigint not null references public.clientes(id),
  proyecto text,
  vigente_desde date,
  vigente_hasta date,
  precios jsonb not null default '{}'::jsonb check (jsonb_typeof(precios) = 'object'),
  notas text,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (codigo)
);
comment on table public.regi_codigos is
  'Maestro de códigos REGI (Deal Registration de Poly) cargados por Ceven, con su lista de precios propia por SKU (columna precios, {sku: precio}). Exclusivo de Poly — sin columna brand a propósito. El cliente-canal nunca lee esta tabla directo: solo a través de portal_regi_solicitar(), security definer.';

create index regi_codigos_cliente_id_idx on public.regi_codigos (cliente_id);

create table public.regi_solicitudes (
  id bigint generated always as identity primary key,
  portal_client_id uuid not null references public.portal_clientes(id),
  codigo text not null check (length(btrim(codigo)) > 0),
  ejecutivo_email text not null,
  ejecutivo_nombre text not null,
  estado text not null default 'pendiente'
    check (estado in ('pendiente', 'aprobado', 'rechazado')),
  regi_codigo_id bigint references public.regi_codigos(id),
  motivo_rechazo text,
  resuelto_por text,
  resuelto_at timestamptz,
  created_at timestamptz not null default now()
);
comment on table public.regi_solicitudes is
  'Solicitudes de aprobación de REGI hechas desde el portal, una por pedido de aprobación. El insert lo hace únicamente portal_regi_solicitar() (security definer) — nunca REST directo del cliente-canal, mismo criterio que portal_solicitudes (solo service_role/definer inserta). El staff aprueba/rechaza con un UPDATE directo (RLS ceven_is_writer()).';

create index regi_solicitudes_portal_client_id_idx on public.regi_solicitudes (portal_client_id);
create index regi_solicitudes_pendientes_idx on public.regi_solicitudes (created_at) where estado = 'pendiente';

alter table public.pipeline add column if not exists "regiCodigo" text;
comment on column public.pipeline."regiCodigo" is
  'Código REGI (Deal Registration de Poly) aplicado a este pedido si vino del portal con REGI aprobado. NULL en el resto de las filas. Aditiva, mismo criterio que origenPortalId/origenPortalEstado.';

-- ── RLS ─────────────────────────────────────────────────────────────────

alter table public.regi_codigos enable row level security;

create policy regi_codigos_select_staff on public.regi_codigos
  for select to authenticated using (public.ceven_is_staff());
create policy regi_codigos_insert_staff on public.regi_codigos
  for insert to authenticated with check (public.ceven_is_writer());
create policy regi_codigos_update_staff on public.regi_codigos
  for update to authenticated using (public.ceven_is_writer()) with check (public.ceven_is_writer());
create policy regi_codigos_delete_staff on public.regi_codigos
  for delete to authenticated using (public.ceven_is_writer());

alter table public.regi_solicitudes enable row level security;

create policy regi_sol_select_own on public.regi_solicitudes
  for select to authenticated using (portal_client_id = public.ceven_portal_client_id());
create policy regi_sol_select_staff on public.regi_solicitudes
  for select to authenticated using (public.ceven_is_staff());
create policy regi_sol_update_staff on public.regi_solicitudes
  for update to authenticated using (public.ceven_is_writer()) with check (public.ceven_is_writer());
-- Sin policy de insert para `authenticated`: el único camino de escritura es
-- portal_regi_solicitar() (security definer, bypassea RLS en su propio insert).

-- ── Funciones ───────────────────────────────────────────────────────────

-- Lista de ejecutivos Ceven (admin+ventas, nunca lector) que puede leer un
-- cliente-canal para elegir a quién dirigir su solicitud de REGI.
--
-- NO envuelve ceven_equipo(): esa función filtra "where ceven_is_staff()"
-- adentro, y ceven_is_staff() lee auth.jwt() del llamador REAL de la sesión
-- (no cambia por estar dentro de otra función SQL) — un cliente-canal jamás
-- pasa ese filtro aunque la invoque indirecto. Se repite la misma selección
-- de auth.users + user_roles, gateada con ceven_is_portal_client().
create or replace function public.portal_equipo_ceven()
returns table (email text, nombre text)
language sql
stable
security definer
set search_path = ''
as $function$
  select
    u.email::text,
    coalesce(nullif(trim(u.raw_user_meta_data ->> 'nombre'), ''), split_part(u.email::text, '@', 1)) as nombre
  from auth.users u
  left join public.user_roles r on r.user_id = u.id
  where public.ceven_is_portal_client()
    and lower(split_part(u.email::text, '@', 2)) = 'ceven.com'
    and coalesce(r.role, 'lector') in ('admin', 'ventas')
    and u.deleted_at is null
  order by 2;
$function$;

revoke execute on function public.portal_equipo_ceven() from public, anon;
grant execute on function public.portal_equipo_ceven() to authenticated;

-- El matching de REGI. Se re-evalúa SIEMPRE fresco contra regi_codigos (no
-- se reusa un `aprobado` viejo de regi_solicitudes): un REGI puede vencer
-- entre una cotización y la siguiente, así que "por cotización" significa
-- literalmente volver a chequear cada vez que se invoca. La única
-- idempotencia es para no acumular filas `pendiente` duplicadas si el
-- cliente reintenta el mismo código sin que Ceven lo haya resuelto todavía.
create or replace function public.portal_regi_solicitar(p_codigo text, p_ejecutivo_email text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_portal_client_id uuid := public.ceven_portal_client_id();
  v_cliente_id bigint;
  v_ejecutivo_nombre text;
  v_existing record;
  v_match record;
  v_codigo text := btrim(p_codigo);
  v_solicitud_id bigint;
  v_estado text;
begin
  if v_portal_client_id is null or not public.ceven_is_portal_client() then
    raise exception 'No autenticado como cliente del portal.';
  end if;
  if v_codigo = '' then
    raise exception 'Falta el código REGI.';
  end if;

  select cliente_id into v_cliente_id
  from public.portal_clientes where id = v_portal_client_id;

  select nombre into v_ejecutivo_nombre
  from public.portal_equipo_ceven() where email = p_ejecutivo_email;
  if v_ejecutivo_nombre is null then
    raise exception 'Elegí un ejecutivo Ceven de la lista.';
  end if;

  select * into v_existing
  from public.regi_solicitudes
  where portal_client_id = v_portal_client_id
    and codigo = v_codigo
    and estado = 'pendiente'
  order by created_at desc
  limit 1;

  if found then
    return jsonb_build_object(
      'id', v_existing.id, 'estado', v_existing.estado,
      'mensaje', 'Ya tenés una solicitud pendiente para este código.'
    );
  end if;

  select * into v_match
  from public.regi_codigos
  where codigo = v_codigo
    and cliente_id = v_cliente_id
    and (vigente_desde is null or vigente_desde <= current_date)
    and (vigente_hasta is null or vigente_hasta >= current_date)
  limit 1;

  if found then
    insert into public.regi_solicitudes
      (portal_client_id, codigo, ejecutivo_email, ejecutivo_nombre, estado, regi_codigo_id, resuelto_por, resuelto_at)
    values
      (v_portal_client_id, v_codigo, p_ejecutivo_email, v_ejecutivo_nombre, 'aprobado', v_match.id, 'auto', now())
    returning id, estado into v_solicitud_id, v_estado;
    return jsonb_build_object(
      'id', v_solicitud_id, 'estado', v_estado,
      'mensaje', 'REGI aprobado automáticamente.',
      'skusCubiertos', (select count(*) from jsonb_object_keys(v_match.precios))
    );
  else
    insert into public.regi_solicitudes
      (portal_client_id, codigo, ejecutivo_email, ejecutivo_nombre, estado)
    values
      (v_portal_client_id, v_codigo, p_ejecutivo_email, v_ejecutivo_nombre, 'pendiente')
    returning id, estado into v_solicitud_id, v_estado;
    return jsonb_build_object(
      'id', v_solicitud_id, 'estado', v_estado,
      'mensaje', 'Solicitud enviada a Ceven para revisión.'
    );
  end if;
end;
$function$;

revoke execute on function public.portal_regi_solicitar(text, text) from public, anon;
grant execute on function public.portal_regi_solicitar(text, text) to authenticated;
