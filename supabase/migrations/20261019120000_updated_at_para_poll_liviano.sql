-- updated_at mantenido por trigger en las tres tablas que sincroniza shared/sync.js.
--
-- Para qué: el poll de cada pestaña (cada 15 s) bajaba las colecciones y
-- app_settings ENTERAS en cada vuelta, y eso era casi todo el egreso de
-- Supabase. Ahora pide primero solo `id,updated_at` (o `key,updated_at`) —
-- unos pocos kB — y baja todo únicamente si esa huella cambió.
--
-- `cotizaciones` ya tenía la columna pero nada la actualizaba (solo el default
-- del insert), así que no servía para detectar ediciones. Los clientes nunca
-- mandan updated_at (no está en las `cols` de sync.js); si alguno lo mandara,
-- el trigger lo pisa igual.

create or replace function public.ceven_set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Función de trigger: nadie tiene por qué llamarla por RPC.
revoke execute on function public.ceven_set_updated_at() from public, anon, authenticated;

alter table public.pipeline     add column if not exists updated_at timestamptz not null default now();
alter table public.app_settings add column if not exists updated_at timestamptz not null default now();
update public.cotizaciones set updated_at = now() where updated_at is null;

drop trigger if exists trg_pipeline_updated_at on public.pipeline;
create trigger trg_pipeline_updated_at
  before insert or update on public.pipeline
  for each row execute function public.ceven_set_updated_at();

drop trigger if exists trg_app_settings_updated_at on public.app_settings;
create trigger trg_app_settings_updated_at
  before insert or update on public.app_settings
  for each row execute function public.ceven_set_updated_at();

drop trigger if exists trg_cotizaciones_updated_at on public.cotizaciones;
create trigger trg_cotizaciones_updated_at
  before insert or update on public.cotizaciones
  for each row execute function public.ceven_set_updated_at();
