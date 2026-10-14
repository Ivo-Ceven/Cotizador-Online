-- ============================================================================
--  TAREAS DEL EQUIPO · archivado automático de las terminadas (3 días)
--  ---------------------------------------------------------------------------
--  ✅ APLICADA el 05/08/2026 en el proyecto iqewnebpdyctexavtpmt.
--     Aditiva: una columna nueva en `todos` (con backfill) y una versión nueva
--     del trigger que ya existe. No borra ni renombra nada.
--
--     Verificado con el bloque de VERIFICACIÓN de más abajo, sobre una fila de
--     prueba que después se borró. Los seis pasos dieron lo esperado.
--
--     ⚠ OJO AL VERIFICAR ESTO DE NUEVO: si los pasos corren en UNA SOLA
--     transacción, `now()` queda congelado y el paso 3 —"editar sin salir de
--     done no cambia la fecha"— no prueba nada, porque un re-sellado daría
--     exactamente el mismo valor. Hay que partirlo en dos transacciones y
--     comparar contra `clock_timestamp()`. Hecho así: la fecha quedó en
--     12:35:46.763 mientras el reloj avanzaba a 12:35:53, con un UPDATE que
--     además cambió `texto` y `asignados`. Ahí sí queda demostrado que el
--     reloj de archivado no se reinicia al editar una tarea terminada.
--
--     Invariante confirmada sobre las filas reales:
--       hecho = true  ⇔  estado = 'done'  ⇔  "terminadaEn" is not null
--
--  QUÉ RESUELVE
--  La columna Done crecía para siempre: nada archivaba ni purgaba, y el único
--  borrado era manual, tarjeta por tarjeta. A partir de acá, una tarea que
--  lleva más de 3 días terminada desaparece del tablero — pero NO se borra: la
--  columna Done trae un botón para verlas.
--
--  Es archivado de PRESENTACIÓN, no una política de retención: las filas siguen
--  en la tabla y el poll las sigue trayendo. Si algún día molesta el volumen,
--  eso es otra cosa (un `select` con filtro, o un borrado real programado) y se
--  decide con datos, no antes.
--
--  ---------------------------------------------------------------------------
--  POR QUÉ HACE FALTA UNA COLUMNA
--
--  `fechaISO` es cuándo se CREÓ la tarea, no cuándo se terminó. Archivar por
--  ese campo daría lo contrario de lo buscado: una tarea vieja que recién se
--  termina nacería archivada, y una creada hoy y cerrada hoy tardaría 3 días
--  en irse aunque ya no le importe a nadie. Hace falta la fecha del PASO a
--  `done`, que hasta ahora no se guardaba en ningún lado.
--
--  ---------------------------------------------------------------------------
--  QUIÉN LA ESCRIBE: SOLO EL TRIGGER
--
--  El cliente no manda nunca `terminadaEn` (shared/todos.js la saca del payload
--  a propósito). Dos motivos:
--
--    · el reloj del navegador es del usuario. Con la máquina adelantada un día,
--      una tarea terminada hoy se archiva sola mañana — para todo el equipo;
--    · así no hay dos escritores para el mismo dato, que es de dónde salen las
--      divergencias silenciosas que este repo ya pagó caro.
--
--  El cliente sí la calcula localmente al mover una tarjeta, para que la
--  pantalla no espere al próximo repaso; el valor del servidor la pisa en el
--  primer poll. Eso no puede archivar nada de más: una tarea recién terminada
--  está a 3 días del corte con cualquiera de las dos fechas.
--
--  ---------------------------------------------------------------------------
--  EL BACKFILL USA LA FECHA DE CREACIÓN, Y ESO ARCHIVA LO VIEJO DE ENTRADA
--
--  De las tareas ya terminadas no sabemos cuándo se terminaron: el dato no
--  existía. `fechaISO` es lo más cercano que hay y es una cota inferior (se
--  terminaron DESPUÉS de crearse), así que las que se crearon hace más de 3
--  días quedan archivadas apenas se aplica esto. Es el efecto buscado —
--  justamente son las que venían acumulándose— y no se pierde nada: están a un
--  click, en "ver archivadas".
--
--  ---------------------------------------------------------------------------
--  CÓMO REVERTIR
--      -- volver el trigger a la versión de 20260804100000 (está en ese archivo)
--      alter table public.todos drop column if exists "terminadaEn";
-- ============================================================================


-- ============================================================================
--  PARTE A · La columna
-- ============================================================================

alter table public.todos
  add column if not exists "terminadaEn" timestamptz;

comment on column public.todos."terminadaEn" is
  'Cuándo pasó a estado=done. NULL si no está terminada. La escribe SOLO el trigger todos_sync_estado: el reloj del cliente es del usuario y una máquina adelantada archivaría tareas de más para todo el equipo.';

-- Backfill. El regex es una guarda, no adorno: `fechaISO` es `text` y un solo
-- valor que no parsee abortaría el UPDATE entero, dejando la migración a medias.
update public.todos
   set "terminadaEn" = case
         when "fechaISO" ~ '^\d{4}-\d{2}-\d{2}T' then "fechaISO"::timestamptz
         else now()
       end
 where estado = 'done'
   and "terminadaEn" is null;

-- Coherencia al revés: nada que no esté en done puede tener fecha de fin.
update public.todos
   set "terminadaEn" = null
 where estado <> 'done'
   and "terminadaEn" is not null;


-- ============================================================================
--  PARTE B · El trigger, ahora también dueño de `terminadaEn`
--  ---------------------------------------------------------------------------
--  Reemplaza a la versión de 20260804100000. Lo de `hecho`/`estado` es idéntico;
--  lo nuevo va AL FINAL, después de que `new.estado` ya quedó resuelto — si
--  fuera antes, un cliente viejo mandando `PATCH {"hecho":true}` (que llega con
--  `new.estado` todavía en el valor anterior) no dejaría fecha de fin, y esa
--  tarea nunca se archivaría.
-- ============================================================================

create or replace function public.todos_sync_estado()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_era_done boolean;
begin
  if tg_op = 'INSERT' then
    -- Insert de un cliente viejo: no manda `estado`, el default lo pone en
    -- 'todo' aunque venga hecho=true. Se deriva de `hecho` en ese caso.
    if new.estado is null or (new.estado = 'todo' and new.hecho) then
      new.estado := case when new.hecho then 'done' else 'todo' end;
    end if;
    new.hecho := (new.estado = 'done');
    new."terminadaEn" := case when new.estado = 'done' then now() else null end;
    return new;
  end if;

  v_era_done := (old.estado = 'done');

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

  -- Fecha de fin: se sella al ENTRAR a done y se borra al salir. Quedarse en
  -- done no la toca — renombrar o delegar una tarea terminada no puede
  -- devolverle otros 3 días de vida en el tablero.
  if new.estado = 'done' and not v_era_done then
    new."terminadaEn" := now();
  elsif new.estado <> 'done' then
    new."terminadaEn" := null;
  else
    new."terminadaEn" := old."terminadaEn";
  end if;

  return new;
end;
$$;

-- El trigger en sí no cambia (mismo nombre, mismo BEFORE INSERT OR UPDATE),
-- pero se recrea para no depender de que ya estuviera bien.
drop trigger if exists todos_sync_estado on public.todos;
create trigger todos_sync_estado
  before insert or update on public.todos
  for each row execute function public.todos_sync_estado();


-- ============================================================================
--  VERIFICACIÓN (correr después de aplicar)
-- ============================================================================
-- 1. Backfill coherente — no puede haber ninguna fila fuera de estas dos formas:
--
--      select estado, ("terminadaEn" is null) as sin_fecha, count(*)
--      from public.todos group by 1, 2 order by 1;
--
--    Esperado: estado='done' → sin_fecha=false; el resto → sin_fecha=true.
--
-- 2. Que el sello se ponga y se saque (reemplazar <id> por una tarea de prueba):
--
--      update public.todos set estado = 'done'  where id = <id>;
--      select estado, "terminadaEn" from public.todos where id = <id>;  -- fecha
--      update public.todos set texto = texto || ' x' where id = <id>;
--      select "terminadaEn" from public.todos where id = <id>;          -- LA MISMA
--      update public.todos set estado = 'todo'  where id = <id>;
--      select "terminadaEn" from public.todos where id = <id>;          -- null
--
--    El paso del medio es el que importa: editar una tarea terminada NO puede
--    reiniciarle el reloj de archivado.
--
-- 3. Que el camino del cliente viejo también selle:
--
--      update public.todos set hecho = true where id = <id>;
--      select estado, "terminadaEn" from public.todos where id = <id>;  -- done + fecha
