-- ============================================================================
--  CLIENTES · tabla madre compartida por Apple/Poly/Multi y el futuro portal
--  ---------------------------------------------------------------------------
--  Reemplaza de a poco el blob `cclientes`/`poly_cclientes` (app_settings, sin
--  dueño, last-write-wins sobre TODO el diccionario) por una tabla real. No se
--  borra nada existente: pipeline."clienteId" es aditiva y nullable, y las
--  columnas de texto `cliente`/`Cliente` de pipeline/cquotes siguen siendo lo
--  que se muestra siempre. Ver docs/HISTORIAL.md y el plan de
--  "Portal de clientes-canal" para el porqué completo.
--
--  RLS: mismo patrón que `pipeline` — select para todo el staff, insert/update
--  solo para quien no sea `lector` (ceven_is_writer() ya exige ceven_is_staff()
--  puertas adentro). Sin policy de delete: un cliente no se borra.
-- ============================================================================

create table public.clientes (
  id bigint generated always as identity primary key,
  nombre text not null check (length(btrim(nombre)) > 0),
  -- Espeja cevenNormClient() (shared/clientes.js): trim + lowercase + espacios
  -- colapsados, SIN tocar puntuación. Generada, no puede desincronizarse del
  -- criterio del cliente.
  nombre_norm text generated always as (
    lower(regexp_replace(btrim(nombre), '\s+', ' ', 'g'))
  ) stored,
  email text,
  telefono text,
  cuit text,
  domicilio text,
  poly_tier text,       -- uno de los 4 tiers reales de Poly, o null
  apple_margen numeric, -- % de margen fijo para Apple (no tiene tiers), o null
  notas text,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.clientes is
  'Tabla madre de clientes, compartida por todas las marcas. No reemplaza pipeline.cliente/cquotes.Cliente (texto libre, se conserva) — los complementa con un id real, tier/margen y mail.';

create unique index clientes_nombre_norm_uidx on public.clientes (nombre_norm);
create index clientes_email_idx on public.clientes (email) where email is not null;

alter table public.clientes enable row level security;

create policy "clientes_select_staff" on public.clientes
  for select to authenticated using (public.ceven_is_staff());

create policy "clientes_insert_staff" on public.clientes
  for insert to authenticated with check (public.ceven_is_writer());

create policy "clientes_update_staff" on public.clientes
  for update to authenticated
  using (public.ceven_is_writer())
  with check (public.ceven_is_writer());

revoke all on public.clientes from anon;

create or replace function public.clientes_set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger clientes_updated_at
before update on public.clientes
for each row execute function public.clientes_set_updated_at();

-- Vínculo aditivo: qué cliente real corresponde a esta fila de pipeline.
-- Nullable, no toca ninguna fila existente de Poly ni de Apple.
alter table public.pipeline
  add column if not exists "clienteId" bigint references public.clientes(id) on delete set null;

create index if not exists pipeline_cliente_idx on public.pipeline ("clienteId");
