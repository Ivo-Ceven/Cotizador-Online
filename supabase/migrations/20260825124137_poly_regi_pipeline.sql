-- Pipeline REGI de Poly: segunda vista del pipeline, generada a partir del
-- Excel "REgis.xlsx" que manda el partner portal de HP (Deal Registration).
-- Ver docs/HISTORIAL.md (25/08/2026) y el plan de diseño para el porqué.
--
-- Exclusivo de Poly a propósito, mismo criterio que regi_codigos/
-- regi_solicitudes (20260821120000_regi_deal_registration.sql): sin columna
-- `brand`.
--
-- No es un log de cambios: cada importación del Excel deja esta tabla
-- IGUAL al archivo que se acaba de cargar (si una oportunidad ya no está en
-- el Excel, se borra de acá). El cliente hace ese reemplazo en dos pasos con
-- REST puro — upsert por `opd` con un `imported_at` común, después un DELETE
-- de lo que quedó con `imported_at` viejo — así que no hace falta ninguna
-- función `security definer` ni Edge Function nueva.

create table public.poly_regi_pipeline (
  -- Identificador real de la oportunidad en el Excel de HP. No es `regi`
  -- porque el Deal Registration puede no estar aprobado todavía: esa columna
  -- viene vacía en varias filas del archivo real.
  opd text primary key,
  regi text,
  dr_expiration date,
  opportunity text not null,
  forecast text,
  account text not null,
  primary_partner text,
  amount numeric not null default 0,
  close_date date,
  imported_at timestamptz not null default now(),
  imported_by text
);
comment on table public.poly_regi_pipeline is
  'Snapshot del pipeline de Deal Registration de HP/Poly (REGI), reemplazado entero en cada importación del Excel "REgis.xlsx" desde el pipeline de Poly. Exclusivo de Poly — sin columna brand a propósito. Solo lectura desde la UI: no hay edición de fila, la única forma de actualizar es reimportar.';

create index poly_regi_pipeline_account_idx on public.poly_regi_pipeline (account);

-- ── RLS ─────────────────────────────────────────────────────────────────

alter table public.poly_regi_pipeline enable row level security;

create policy poly_regi_pipeline_select on public.poly_regi_pipeline
  for select to authenticated using (public.ceven_is_staff());
create policy poly_regi_pipeline_insert on public.poly_regi_pipeline
  for insert to authenticated with check (public.ceven_is_writer());
create policy poly_regi_pipeline_update on public.poly_regi_pipeline
  for update to authenticated using (public.ceven_is_writer()) with check (public.ceven_is_writer());
create policy poly_regi_pipeline_delete on public.poly_regi_pipeline
  for delete to authenticated using (public.ceven_is_writer());
