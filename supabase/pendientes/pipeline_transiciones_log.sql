-- ============================================================================
--  PENDIENTE DE APLICAR · NO está en la base
--  ----------------------------------------------------------------------------
--  Vive en supabase/pendientes/ y no en supabase/migrations/ a propósito: una
--  migración sin aplicar dentro de migrations/ vuelve a desalinear el repo con
--  la base (ver docs/HISTORIAL.md, 13/10/2026).
--
--  Para aplicarla: apply_migration con este SQL, y después mover el archivo a
--  supabase/migrations/ con la versión que devuelva list_migrations.
--
--  Sin esta tabla el forecast de compras funciona igual: la calibración de las
--  probabilidades queda en su base y la página lo dice ("sin historial").
-- ============================================================================

-- ============================================================================
--  pipeline_transiciones · registro de cada cambio de estado de un negocio
--  ----------------------------------------------------------------------------
--  POR QUE
--  -------
--  El forecast de compras (src/shared/compras-forecast.js) pondera cada negocio
--  por su probabilidad de cerrar y quiere ir ajustando esa probabilidad con lo
--  que realmente pasa: de los negocios que pasaron por Commit, cuantos
--  terminaron facturandose. `pipeline` solo guarda el estado ACTUAL, asi que esa
--  historia no se puede reconstruir: hay que empezar a guardarla.
--
--  QUE GUARDA
--  ----------
--  Una fila por cada vez que un negocio entra a un estado: al crearse (estado_de
--  null) y en cada cambio posterior. Solo la escribe el trigger; nadie por la
--  API. Queda aunque la fila de pipeline se archive o se borre, que es justo
--  cuando el resultado (Facturado / Perdido) ya se conoce.
--
--  Se siembra con los negocios abiertos de hoy (estado actual, `at` = ahora)
--  para que los que se resuelvan de aqui en adelante cuenten desde su estado de
--  partida. Aditivo: no toca pipeline ni ninguna otra tabla.
-- ============================================================================

create table if not exists public.pipeline_transiciones (
  id          bigint generated always as identity primary key,
  brand       text        not null,
  pipeline_id bigint      not null,
  estado_de   text,
  estado_a    text        not null,
  at          timestamptz not null default now()
);

comment on table public.pipeline_transiciones is
  'Historial de estados de cada negocio del pipeline: una fila por cada entrada a un estado (estado_de null = alta). Solo la escribe el trigger trg_pipeline_log_transicion. Alimenta la calibracion del forecast de compras. Sin FK a proposito: sobrevive al archivado/borrado de la fila de pipeline.';

create index if not exists pipeline_transiciones_negocio_idx
  on public.pipeline_transiciones (brand, pipeline_id, at);

alter table public.pipeline_transiciones enable row level security;

-- Solo lectura para el staff. No hay policy de insert/update/delete: lo escribe
-- unicamente el trigger (security definer).
create policy "pipeline_transiciones_select" on public.pipeline_transiciones
  for select to authenticated
  using (public.ceven_is_staff());

revoke all on table public.pipeline_transiciones from anon;
revoke insert, update, delete, truncate on table public.pipeline_transiciones from authenticated;

create or replace function public.pipeline_log_transicion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.estado is not null then
      insert into public.pipeline_transiciones (brand, pipeline_id, estado_de, estado_a)
      values (new.brand, new.id, null, new.estado);
    end if;
  elsif new.estado is not null and old.estado is distinct from new.estado then
    insert into public.pipeline_transiciones (brand, pipeline_id, estado_de, estado_a)
    values (new.brand, new.id, old.estado, new.estado);
  end if;
  return new;
end;
$$;

comment on function public.pipeline_log_transicion() is
  'Trigger de pipeline: registra en pipeline_transiciones cada alta y cada cambio de estado. security definer porque authenticated no tiene permiso de escritura sobre esa tabla.';

-- Funcion de trigger: igual que el resto del repo, sin EXECUTE para nadie
-- (Postgres lo otorga a PUBLIC por defecto en toda funcion nueva de public).
revoke execute on function public.pipeline_log_transicion() from public, anon, authenticated;

drop trigger if exists trg_pipeline_log_transicion on public.pipeline;
create trigger trg_pipeline_log_transicion
after insert or update of estado on public.pipeline
for each row
execute function public.pipeline_log_transicion();

-- Siembra: los negocios abiertos hoy, con su estado actual. Idempotente.
insert into public.pipeline_transiciones (brand, pipeline_id, estado_de, estado_a)
select p.brand, p.id, null, p.estado
from public.pipeline p
where p.estado is not null
  and p.estado not in ('Facturado', 'Perdido')
  and not exists (select 1 from public.pipeline_transiciones t where t.brand = p.brand and t.pipeline_id = p.id);
