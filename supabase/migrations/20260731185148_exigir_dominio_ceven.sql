-- ============================================================================
--  EXIGIR CUENTA @ceven.com PARA TODO ACCESO
--  ---------------------------------------------------------------------------
--  ✅ APLICADA el 31/07/2026 (proyecto iqewnebpdyctexavtpmt).
--
--  POR QUÉ
--  Después de la migración de RLS por rol, las policies de lectura seguían
--  siendo `using(true)` para cualquier `authenticated`. La única barrera para
--  que un desconocido no llegara a ser `authenticated` era la configuración de
--  GoTrue: signup público apagado y ningún proveedor OAuth habilitado.
--
--  Eso funciona, pero es frágil por dos motivos: es config de dashboard —
--  invisible desde el repo, nadie se entera si cambia— y alcanza con que
--  alguien prenda "Sign in with Google" o los signins anónimos para que
--  cualquiera con un Gmail quede autenticado y lea el pipeline y el price list
--  completos.
--
--  Con el dominio DENTRO de la policy, la garantía deja de depender de esa
--  configuración: un usuario que no sea @ceven.com no lee ni una fila, sin
--  importar cómo consiguió el token.
--
--  Se usa split_part(email,'@',2) = 'ceven.com' y no LIKE '%@ceven.com' para
--  que no haya ninguna ambigüedad con dominios que terminen parecido.
--  Sin claim `email` (usuario anónimo) da false.
--
--  VERIFICADO contra datos reales:
--    @ceven.com admin   -> ve las 4/5/1 filas y escribe
--    @ceven.com lector  -> ve todo, no escribe
--    @gmail.com "admin" -> 0 filas, no escribe, no borra
--    @notceven.com      -> 0 filas
--    x@ceven.com.evil.io-> 0 filas
--    anónimo sin email  -> 0 filas
--
--  SI ALGÚN DÍA CAMBIA EL DOMINIO (o hay que sumar otro), es acá:
--    create or replace function public.ceven_is_staff() ...
--      select lower(split_part(auth.jwt() ->> 'email','@',2))
--             in ('ceven.com','otrodominio.com');
-- ============================================================================

create or replace function public.ceven_is_staff()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(
    lower(split_part(auth.jwt() ->> 'email', '@', 2)) = 'ceven.com',
    false
  );
$$;

comment on function public.ceven_is_staff() is
  'true solo si el JWT trae un email @ceven.com. Es la barrera de fondo: no depende de que el signup publico este apagado ni de que no haya proveedores OAuth habilitados.';

grant execute on function public.ceven_is_staff() to authenticated;

-- Los helpers de escritura tambien lo exigen: un no-staff no escribe aunque
-- por algun motivo tuviera un rol asignado en el token.
create or replace function public.ceven_is_writer()
returns boolean language sql stable set search_path = '' as $$
  select public.ceven_is_staff() and public.ceven_role() <> 'lector';
$$;

create or replace function public.ceven_can_write_brand(b text)
returns boolean language sql stable set search_path = '' as $$
  select case
    when not public.ceven_is_staff()    then false
    when public.ceven_role() = 'admin'  then true
    when public.ceven_role() = 'lector' then false
    else public.ceven_brands() is null or b = any(public.ceven_brands())
  end;
$$;

-- Lectura: de using(true) a using(es staff).
drop policy if exists "pipeline_select" on public.pipeline;
create policy "pipeline_select" on public.pipeline
  for select to authenticated
  using (public.ceven_is_staff());

drop policy if exists "app_settings_select" on public.app_settings;
create policy "app_settings_select" on public.app_settings
  for select to authenticated
  using (public.ceven_is_staff());

drop policy if exists "todos_select" on public.todos;
create policy "todos_select" on public.todos
  for select to authenticated
  using (public.ceven_is_staff());
