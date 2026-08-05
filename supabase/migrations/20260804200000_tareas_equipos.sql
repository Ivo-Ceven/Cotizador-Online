-- ============================================================================
--  TAREAS DEL EQUIPO · tableros por equipo de trabajo
--  ---------------------------------------------------------------------------
--  ✅ APLICADA el 05/08/2026 en el proyecto iqewnebpdyctexavtpmt, después de
--     20260804180000_tareas_archivado.sql (ese es el orden correcto: el trigger
--     de `todos` lo define la de archivado).
--
--     Verificado: `todos.equipo` quedó NOT NULL con default 'General' y todas
--     las filas existentes cayeron ahí; la tabla `equipos` tiene su fila
--     'General' y las cuatro policies (select/insert/update/delete). El linter
--     de seguridad no reportó nada nuevo — en particular, ningún
--     `rls_disabled_in_public` sobre `equipos`.
--
--  QUÉ HABILITA
--  Un solo tablero para toda la empresa mezcla trabajos que no tienen nada que
--  ver. A partir de acá cada tarea pertenece a un equipo y el tablero muestra
--  uno por vez, con un selector arriba.
--
--  ---------------------------------------------------------------------------
--  ⚠ ESTO NO ES UNA BARRERA DE PRIVACIDAD, Y NO HAY QUE TRATARLO COMO TAL
--
--  Decisión explícita del equipo (04/08/2026): los tableros se separan en la
--  PANTALLA, no en la base. Cualquier usuario @ceven.com sigue leyendo y
--  escribiendo las tareas de todos los equipos — la policy de `todos` no
--  cambia, y el cliente se baja la tabla entera con `todos?select=*` y filtra
--  en JavaScript.
--
--  O sea: sirve para ORGANIZARSE, no para esconder. Un `curl` con el token de
--  cualquiera lista todo:
--
--      curl "$SUPABASE_URL/rest/v1/todos?select=*" -H "apikey: $ANON" \
--           -H "Authorization: Bearer $TOKEN"
--
--  Si algún día hace falta aislamiento de verdad, NO alcanza con esconder el
--  selector: hay que agregar policies que filtren por pertenencia (join contra
--  `equipos.miembros` con `auth.jwt() ->> 'email'`) y que el cliente pida solo
--  su equipo. Es un trabajo aparte, y este comentario existe para que quien lo
--  encare sepa que lo de hoy nunca pretendió serlo.
--
--  ---------------------------------------------------------------------------
--  POR QUÉ EL NOMBRE ES LA CLAVE, Y NO UN id
--
--  `todos.equipo` guarda el NOMBRE del equipo, no una FK. Es a propósito: la
--  app es offline-first y una tarea creada sin conexión tiene que poder decir a
--  qué equipo va sin depender de que exista una fila remota ni de resolver un
--  id contra el servidor.
--
--  Consecuencia buscada: si una tarea apunta a un equipo que ya no está en
--  `equipos`, el cliente igual la muestra en un tablero con ese nombre. Nada
--  desaparece por una fila faltante — que es justo lo que pasaría con una FK.
--
--  El precio es que renombrar un equipo implica tocar todas sus tareas, así que
--  la UI todavía no ofrece renombrar (crear otro y mover, sí).
--
--  ---------------------------------------------------------------------------
--  CÓMO REVERTIR
--      drop table if exists public.equipos;
--      alter table public.todos drop column if exists equipo;
-- ============================================================================


-- ============================================================================
--  PARTE A · A qué equipo pertenece cada tarea
-- ============================================================================

-- NOT NULL con DEFAULT: las filas que ya existen quedan todas en 'General', que
-- es el tablero al que entra quien no eligió ninguno. Sin default, el backfill
-- sería un UPDATE aparte y una tarea sin equipo no se vería en ningún lado.
alter table public.todos
  add column if not exists equipo text not null default 'General';

comment on column public.todos.equipo is
  'Nombre del equipo/tablero al que pertenece la tarea. Es el NOMBRE y no una FK a proposito: la app es offline-first y una tarea creada sin conexion no puede depender de resolver un id contra el servidor. Separa tableros en la PANTALLA — no es una barrera de privacidad, ver el encabezado de esta migracion.';


-- ============================================================================
--  PARTE B · Los equipos y su gente
-- ============================================================================

create table if not exists public.equipos (
  nombre      text primary key,
  -- Emails @ceven.com. Es quiénes APARECEN en ese tablero para delegar, no
  -- quiénes pueden verlo (verlo lo puede cualquiera).
  miembros    jsonb not null default '[]'::jsonb,
  "creadoPor" text,
  "creadoISO" text,
  constraint equipos_miembros_check check (jsonb_typeof(miembros) = 'array'),
  -- Un nombre vacío haría un tablero imposible de elegir y de nombrar.
  constraint equipos_nombre_check   check (length(btrim(nombre)) > 0)
);

comment on table public.equipos is
  'Equipos de trabajo del tablero de tareas. `miembros` define a quien se le puede delegar dentro de ese tablero, NO quien puede verlo: la separacion es de pantalla, no de permisos.';

-- El tablero por defecto. ON CONFLICT para que reaplicar la migración no pise
-- los miembros que se le hayan cargado.
insert into public.equipos (nombre, miembros, "creadoPor")
values ('General', '[]'::jsonb, 'sistema')
on conflict (nombre) do nothing;


-- ============================================================================
--  PARTE C · Permisos
--  ---------------------------------------------------------------------------
--  Mismo criterio que `todos`, y por los mismos motivos: leer lo puede
--  cualquier cuenta @ceven.com (ceven_is_staff), y escribir cualquiera que no
--  sea lector (ceven_is_writer). Crear un equipo y sumar gente se hace desde el
--  tablero, sin pasar por el admin — decisión del equipo, coherente con que
--  marcar como hecha la tarea de otro ya era el uso normal.
-- ============================================================================

alter table public.equipos enable row level security;
revoke all on table public.equipos from anon;

drop policy if exists "equipos_select" on public.equipos;
create policy "equipos_select" on public.equipos
  for select to authenticated
  using (public.ceven_is_staff());

drop policy if exists "equipos_insert" on public.equipos;
create policy "equipos_insert" on public.equipos
  for insert to authenticated
  with check (public.ceven_is_writer());

drop policy if exists "equipos_update" on public.equipos;
create policy "equipos_update" on public.equipos
  for update to authenticated
  using (public.ceven_is_writer())
  with check (public.ceven_is_writer());

drop policy if exists "equipos_delete" on public.equipos;
create policy "equipos_delete" on public.equipos
  for delete to authenticated
  using (public.ceven_is_writer());


-- ============================================================================
--  VERIFICACIÓN (correr después de aplicar)
-- ============================================================================
-- 1. Que ninguna tarea quedó sin tablero:
--
--      select equipo, count(*) from public.todos group by 1 order by 2 desc;
--
--    Esperado: todas en 'General' si es la primera vez.
--
-- 2. Que 'General' existe y es única:
--
--      select * from public.equipos;
--
-- 3. Que un lector NO puede crear equipos (con el token de un rol 'lector'):
--
--      curl -X POST "$SUPABASE_URL/rest/v1/equipos" -H "apikey: $ANON" \
--           -H "Authorization: Bearer $TOKEN_DEL_LECTOR" \
--           -H "Content-Type: application/json" \
--           -d '[{"nombre":"prueba"}]'
--
--    Esperado: 401/403 por row-level security.
