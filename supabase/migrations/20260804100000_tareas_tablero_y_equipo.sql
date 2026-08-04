-- ============================================================================
--  TAREAS DEL EQUIPO · tablero to-do/doing/done + delegación por miembro
--  ---------------------------------------------------------------------------
--  ✅ APLICADA el 04/08/2026 en el proyecto iqewnebpdyctexavtpmt.
--     Es aditiva: agrega dos columnas a `todos` (con backfill desde `hecho`) y
--     una función de lectura. No borra ni renombra nada, así que un cliente
--     viejo —una PWA cacheada que todavía manda solo {texto, hecho}— sigue
--     funcionando: el trigger de más abajo le deriva el estado.
--
--     Verificado desde afuera, con la publishable key y sin sesión (los dos
--     controles son lo que hace concluyente cada prueba):
--       · POST /rest/v1/rpc/ceven_equipo → 401 42501 "permission denied for
--         function", o sea que EXISTE y le niega el paso a `anon`. Una función
--         inexistente devuelve 404 PGRST202.
--       · GET /rest/v1/todos?select=estado,asignados → 401 42501 de TABLA, no
--         400. PostgREST resuelve los nombres de columna antes de mirar
--         permisos (una columna inventada da 400 42703), así que las dos
--         columnas existen.
--     Lo que esa vía NO alcanza a ver, porque necesita leer el catálogo con una
--     sesión: el trigger, los CHECK y el backfill. Verificarlos con el bloque
--     de VERIFICACIÓN del final desde el SQL Editor.
--
--  QUÉ HABILITA
--  El organizador de tareas era una checklist plana (texto + hecho). Pasa a ser
--  un tablero de tres columnas con miembros asignados, en su propia página
--  (src/tareas/), a la que se entra desde una tarjeta del shell igual que a un
--  cotizador.
--
--  ---------------------------------------------------------------------------
--  1) POR QUÉ `hecho` NO SE BORRA, Y POR QUÉ HAY UN TRIGGER
--
--  `estado` deja a `hecho` redundante, y lo natural sería reemplazarlo. No se
--  puede todavía: la app es una PWA offline-first con stale-while-revalidate,
--  así que después del deploy siguen habiendo navegadores corriendo el bundle
--  anterior hasta que recargan. Ese cliente hace
--
--      PATCH /todos?id=eq.123  {"hecho": true}
--
--  y no sabe que existe `estado`. Sin trigger, la tarea quedaría tildada para
--  él y en "To do" para todos los demás — una divergencia silenciosa, que es
--  justo la clase de bug que este repo viene arrastrando (ver el contador de
--  cotizaciones en HISTORIAL.md).
--
--  El trigger hace que las dos columnas no puedan desfasarse, escriba quien
--  escriba. La regla es "gana el campo que cambió"; si cambian los dos en el
--  mismo UPDATE gana `estado`, porque eso solo lo manda el cliente nuevo, que
--  es el único que distingue 'doing'.
--
--  Cuando no queden clientes viejos, `hecho` se puede dropear junto con el
--  trigger — no antes.
--
--  ---------------------------------------------------------------------------
--  2) POR QUÉ `ceven_equipo()` Y NO LA EDGE FUNCTION
--
--  Para arrastrar un miembro sobre una tarea hace falta la lista del equipo, y
--  hoy la única forma de obtenerla es la Edge Function `admin-users`, que
--  valida server-side `caller.email === admin@ceven.com`. O sea: nadie más que
--  el admin puede ver quiénes son sus compañeros, y delegar sería una función
--  de un solo usuario.
--
--  `ceven_equipo()` es `security definer` porque `auth.users` no es legible por
--  `authenticated` (ni debe serlo). Devuelve SOLO email, nombre y rol — nada de
--  hashes, tokens, metadata ni fechas de sesión— y el filtro `ceven_is_staff()`
--  va DENTRO del cuerpo: sin un JWT con email @ceven.com devuelve cero filas,
--  aunque alguien consiga ejecutar la función.
--
--  Es la misma información que la app ya publica de rebote (`todos.creadoPor`
--  guarda el nombre de quien cargó cada tarea, y el pipeline el del ejecutivo),
--  ahora expuesta a propósito y en un solo lugar.
--
--  ⚠ `security definer` + `set search_path = ''` van juntos siempre: sin fijar
--  el search_path, alguien que pueda crear objetos en un esquema del path
--  reescribe qué función se resuelve adentro y corre código como el dueño.
--  Por eso acá todo va calificado (`auth.users`, `public.user_roles`).
--
--  ---------------------------------------------------------------------------
--  CÓMO REVERTIR
--      drop function if exists public.ceven_equipo();
--      drop trigger  if exists todos_sync_estado on public.todos;
--      drop function if exists public.todos_sync_estado();
--      alter table public.todos drop column if exists estado, drop column if exists asignados;
--  (`hecho` nunca se tocó, así que la checklist vieja vuelve a funcionar sola.)
-- ============================================================================


-- ============================================================================
--  PARTE A · Columnas del tablero
-- ============================================================================

alter table public.todos
  add column if not exists estado    text,
  -- Emails de los miembros delegados. Array, no un `asignado` escalar: la
  -- consigna es delegar arrastrando, y arrastrar un segundo miembro sobre una
  -- tarea que ya tiene uno es el gesto obvio para "que la hagan entre los dos".
  -- Se guardan emails y no nombres porque el email es la identidad estable: el
  -- nombre se edita desde el modal de usuarios y dejaría asignaciones huérfanas.
  add column if not exists asignados jsonb not null default '[]'::jsonb;

-- Backfill antes de poner el NOT NULL: las filas que ya existen no tienen estado.
update public.todos
   set estado = case when hecho then 'done' else 'todo' end
 where estado is null;

alter table public.todos
  alter column estado set default 'todo',
  alter column estado set not null;

alter table public.todos drop constraint if exists todos_estado_check;
alter table public.todos add  constraint todos_estado_check
  check (estado in ('todo', 'doing', 'done'));

-- Que `asignados` sea un array y no un objeto o un escalar: el cliente hace
-- .filter()/.indexOf() sobre lo que venga, y un jsonb suelto lo rompería.
alter table public.todos drop constraint if exists todos_asignados_check;
alter table public.todos add  constraint todos_asignados_check
  check (jsonb_typeof(asignados) = 'array');

comment on column public.todos.estado is
  'Columna del tablero: todo | doing | done. `hecho` es su espejo booleano, mantenido por el trigger todos_sync_estado para los clientes viejos.';
comment on column public.todos.asignados is
  'Array JSON de emails @ceven.com delegados. Vacío = sin asignar.';


-- ============================================================================
--  PARTE B · `hecho` y `estado` no pueden desfasarse
-- ============================================================================

create or replace function public.todos_sync_estado()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    -- Insert de un cliente viejo: no manda `estado`, el default lo pone en
    -- 'todo' aunque venga hecho=true. Se deriva de `hecho` en ese caso.
    if new.estado is null or (new.estado = 'todo' and new.hecho) then
      new.estado := case when new.hecho then 'done' else 'todo' end;
    end if;
    new.hecho := (new.estado = 'done');
    return new;
  end if;

  if new.estado is distinct from old.estado then
    -- Cliente nuevo moviendo la tarjeta. Manda `estado`.
    new.hecho := (new.estado = 'done');
  elsif new.hecho is distinct from old.hecho then
    -- Cliente viejo tildando el checkbox. Destildar una tarea que estaba en
    -- 'done' la devuelve a 'todo'; si no estaba en 'done' no hay nada que
    -- mover (destildar algo que ya estaba en 'doing' no debería sacarlo de ahí).
    new.estado := case
      when new.hecho              then 'done'
      when old.estado = 'done'    then 'todo'
      else old.estado
    end;
  end if;
  return new;
end;
$$;

drop trigger if exists todos_sync_estado on public.todos;
create trigger todos_sync_estado
  before insert or update on public.todos
  for each row execute function public.todos_sync_estado();


-- ============================================================================
--  PARTE C · La lista del equipo, legible por cualquier @ceven.com
-- ============================================================================

create or replace function public.ceven_equipo()
returns table (email text, nombre text, rol text)
language sql
stable
security definer
set search_path = ''
as $$
  select
    u.email::text,
    -- Sin nombre cargado, la parte local del mail: un chip vacío no se puede
    -- arrastrar ni reconocer. `nullif(trim(...))` porque el modal de usuarios
    -- deja escribir espacios y '' no es lo mismo que NULL para coalesce.
    coalesce(
      nullif(trim(u.raw_user_meta_data ->> 'nombre'), ''),
      split_part(u.email::text, '@', 1)
    ) as nombre,
    -- El rol autoritativo vive en user_roles; sin fila, el hook del JWT da
    -- 'lector' (fail-safe) y acá se muestra lo mismo para no mentir.
    coalesce(r.role, 'lector') as rol
  from auth.users u
  left join public.user_roles r on r.user_id = u.id
  where public.ceven_is_staff()
    and lower(split_part(u.email::text, '@', 2)) = 'ceven.com'
    and u.deleted_at is null
  order by 2;
$$;

comment on function public.ceven_equipo() is
  'Equipo visible para delegar tareas: email, nombre y rol de las cuentas @ceven.com. security definer porque auth.users no es legible por authenticated; el filtro ceven_is_staff() adentro hace que sin un JWT @ceven.com devuelva cero filas.';

revoke execute on function public.ceven_equipo() from anon, public;
grant  execute on function public.ceven_equipo() to authenticated;


-- ============================================================================
--  VERIFICACIÓN (correr después de aplicar)
-- ============================================================================
-- 1. Columnas y backfill:
--      select id, texto, hecho, estado, asignados from public.todos order by id;
--    Esperado: ninguna con estado null; hecho=true ⇔ estado='done'.
--
-- 2. Que el trigger cubra al cliente viejo (simula el PATCH del bundle previo):
--      update public.todos set hecho = true where id = <alguna>;
--      select hecho, estado from public.todos where id = <alguna>;   -- done
--      update public.todos set hecho = false where id = <alguna>;    -- todo
--
-- 3. Que el equipo se lea desde la app (con sesión @ceven.com):
--      POST /rest/v1/rpc/ceven_equipo
--    Esperado: una fila por usuario. Con un token que no sea @ceven.com: [].
