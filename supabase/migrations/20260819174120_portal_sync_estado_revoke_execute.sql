-- portal_sync_estado_desde_pipeline() es una función de TRIGGER (returns
-- trigger, usa NEW/OLD): llamada directo por RPC ya falla en runtime
-- ("trigger functions can only be called as triggers"), pero Postgres
-- otorga EXECUTE a PUBLIC por default en cualquier función nueva de
-- `public`, así que igual queda listada como invocable — hay que revocarlo
-- a mano, mismo criterio que el resto del repo aplica a las funciones
-- privilegiadas (ver el checklist de seguridad del skill de Supabase).
revoke execute on function public.portal_sync_estado_desde_pipeline() from public, anon, authenticated;