-- ============================================================================
--  ASISTENTE IA · tabla de uso para rate-limit  ·  Cotizadores Ceven
--  ---------------------------------------------------------------------------
--  QUÉ HABILITA
--  api/asistente.js (endpoint nuevo, gateway propio hacia OpenRouter) necesita
--  un tope de consultas por usuario antes de gastar plata en cada llamada al
--  modelo. Hoy son 8 cuentas internas de confianza, pero el endpoint queda
--  listo desde ahora porque a Ceven le pidieron además un cotizador para
--  clientes externos (acceso al multimarca) que también va a usar este mismo
--  asistente — ahí "cualquiera con sesión" deja de ser sinónimo de "de
--  confianza".
--
--  Se reusa Supabase como store del rate-limit (una tabla + RLS) en vez de
--  sumar un servicio nuevo tipo Upstash/Redis: el volumen es bajo y el
--  endpoint ya reenvía el JWT del usuario en cada request, así que contar y
--  registrar pasa por el mismo camino REST que el resto de la app.
--
--  Cómo la usa el endpoint (api/asistente.js), con el JWT que reenvía el
--  cliente — nunca con la service_role:
--    1. GET .../asistente_usage?user_id=eq.<uid>&ts=gte.<hace1h>&select=id
--       con Prefer: count=exact y Range: 0-0 → cuenta sin traer filas.
--    2. Si el conteo llega al tope, responde 429 antes de llamar a OpenRouter.
--    3. Si no, POST .../asistente_usage {user_id} (fire-and-forget) y sigue.
--
--  RLS: cada usuario autenticado puede insertar y leer ÚNICAMENTE sus propias
--  filas (`user_id = auth.uid()`). No hace falta security definer ni tocar
--  auth.users: esto no es una función de lectura de "quién es el equipo" como
--  ceven_equipo(), es un contador propio por usuario.
--
--  CÓMO REVERTIR
--      drop table if exists public.asistente_usage;
-- ============================================================================

create table if not exists public.asistente_usage (
  id      bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  ts      timestamptz not null default now()
);

comment on table public.asistente_usage is
  'Una fila por consulta al asistente IA (api/asistente.js). Sirve solo para contar uso reciente por usuario y aplicar un rate-limit antes de llamar a OpenRouter — no guarda el mensaje ni la propuesta.';

-- Consulta de rate-limit: contar filas de un usuario en la última hora.
create index if not exists asistente_usage_user_ts_idx
  on public.asistente_usage (user_id, ts);

alter table public.asistente_usage enable row level security;

drop policy if exists "cada usuario ve su propio uso" on public.asistente_usage;
create policy "cada usuario ve su propio uso"
  on public.asistente_usage for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "cada usuario registra su propio uso" on public.asistente_usage;
create policy "cada usuario registra su propio uso"
  on public.asistente_usage for insert
  to authenticated
  with check (user_id = auth.uid());

-- Sin update ni delete: es un log de auditoría de uso, no un contador que se
-- edite. Nadie —ni el propio dueño de la fila— tiene esos permisos.


-- ============================================================================
--  VERIFICACIÓN (correr después de aplicar, con una sesión real)
-- ============================================================================
-- 1. Insertar y leer la propia fila:
--      insert into public.asistente_usage (user_id) values (auth.uid());
--      select count(*) from public.asistente_usage where user_id = auth.uid();
--
-- 2. Que RLS bloquee ver el uso de otro usuario:
--      select count(*) from public.asistente_usage where user_id <> auth.uid();
--    Esperado: 0 filas (no un error) — RLS las filtra en vez de rechazar el
--    select.
--
-- 3. Desde afuera, sin sesión (publishable key sola):
--      GET /rest/v1/asistente_usage?select=id
--    Esperado: [] (RLS sin auth.uid() no matchea ninguna fila) o 401, nunca
--    las filas de otro usuario.
-- ============================================================================
