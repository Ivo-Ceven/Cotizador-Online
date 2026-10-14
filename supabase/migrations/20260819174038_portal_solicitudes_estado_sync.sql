-- ============================================================================
--  Sincroniza estado del pipeline -> portal_solicitudes (Fase 3)
--  ---------------------------------------------------------------------------
--  El cliente-canal no puede leer `pipeline` (RLS exige ceven_is_staff() sin
--  excepción, y eso no cambia). Para que vea en qué va su pedido sin que un
--  vendedor tenga que avisarle a mano, se sincroniza el campo `estado` de la
--  fila de pipeline que generó ese pedido hacia una columna nueva,
--  `portal_solicitudes.estado_ceven`, con un trigger AFTER UPDATE.
--
--  Se dispara SOLO cuando `estado` realmente cambió de valor (`WHEN` en el
--  trigger), no en cada PATCH que hace sync.js aunque no toque ese campo —
--  sin esto, el trigger correría en cada push periódico del staff sin razón.
-- ============================================================================

alter table public.portal_solicitudes add column if not exists estado_ceven text;

create or replace function public.portal_sync_estado_desde_pipeline()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.portal_solicitudes
  set estado_ceven = new.estado
  where pipeline_brand = new.brand and pipeline_id = new.id;
  return new;
end;
$$;

comment on function public.portal_sync_estado_desde_pipeline() is
  'security definer porque portal_solicitudes no tiene policy de UPDATE para authenticated (solo select propio) — el trigger corre con los privilegios del owner, no del staff que disparó el UPDATE en pipeline. No expone nada nuevo: solo copia un valor que ya era público para el dueño de la fila.';

drop trigger if exists trg_portal_sync_estado on public.pipeline;
create trigger trg_portal_sync_estado
after update of estado on public.pipeline
for each row
when (old.estado is distinct from new.estado)
execute function public.portal_sync_estado_desde_pipeline();
