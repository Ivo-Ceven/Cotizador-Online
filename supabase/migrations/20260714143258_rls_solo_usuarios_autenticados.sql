-- Endurecimiento: la anon key sola ya no puede leer/escribir.
-- Solo usuarios logueados (JWT de GoTrue) acceden a los datos.
drop policy if exists "anon full access" on public.pipeline;
drop policy if exists "anon full access" on public.app_settings;

create policy "authenticated full access" on public.pipeline
  for all to authenticated using (true) with check (true);
create policy "authenticated full access" on public.app_settings
  for all to authenticated using (true) with check (true);

revoke all on table public.pipeline from anon;
revoke all on table public.app_settings from anon;