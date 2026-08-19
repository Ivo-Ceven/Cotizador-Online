-- ============================================================================
--  APPLE · motivo de pérdida + fecha de última modificación  ·  Cotizadores Ceven
--  ---------------------------------------------------------------------------
--  QUÉ HABILITA
--  Dos columnas aditivas en `public.pipeline`, portadas desde una versión
--  vieja y paralela del cotizador Apple (`DOCUMENTACION.md`, comparada contra
--  el código actual el 18-19/08/2026) que sí las tenía:
--
--  1) `perdidoMotivo` (jsonb): al marcar una cotización como "Perdido" en el
--     pipeline, el vendedor elige un motivo fijo (Presupuesto del cliente /
--     Precio / Decisión del cliente / Sin Novedades) + detalle libre. Hoy no
--     existe ni el dato ni la UI — se pierde por completo por qué se perdió
--     cada negocio.
--
--  2) `fechaMod` (text, no timestamptz — para que coincida con el tipo de
--     `fecha`/`fechaISO`/`estado`/`ovLink`, que ya son `text` en esta tabla):
--     última modificación real de la entrada, estampada por `savePipeline()`
--     (`src/shared/pipeline-store.js`) comparando una firma antes/después —
--     un guardado sin cambios no la mueve. Habilita la alerta de
--     cotizaciones estancadas (30/60 días sin movimiento) en la UI de Apple.
--     Es brand-agnostic (vive en `shared/`), pero solo Apple la declara en
--     `pipeCols` por ahora — Poly/Multi no la usan, mismo patrón que
--     `padCols` vacío en Poly.
--
--  ---------------------------------------------------------------------------
--  ⚠️ ORDEN OBLIGATORIO: correr esta migración ANTES de deployar el código
--  que agrega `perdidoMotivo`/`fechaMod` a `pipeCols`/`objCols` de
--  `src/apple/brand.js`. `src/shared/sync.js` NO degrada con gracia si una
--  columna declarada no existe todavía en Supabase: `pushPipeRows()` sube
--  TODAS las columnas de `pipeCols` en un solo POST, y si el servidor
--  rechaza por `PGRST204` (columna inexistente), falla el batch ENTERO —
--  no solo el campo nuevo. Invertir el orden deja el pipeline de Apple sin
--  sincronizar hasta que se corrija.
--
--  CÓMO REVERTIR
--      alter table public.pipeline drop column if exists "perdidoMotivo";
--      alter table public.pipeline drop column if exists "fechaMod";
-- ============================================================================

alter table public.pipeline add column if not exists "perdidoMotivo" jsonb;
alter table public.pipeline add column if not exists "fechaMod" text;

comment on column public.pipeline."perdidoMotivo" is
  'Motivo de pérdida al marcar una cotización "Perdido": {motivo, detalle}. Motivo fijo (Presupuesto del cliente | Precio | Decisión del cliente | Sin Novedades) + texto libre. Solo Apple.';
comment on column public.pipeline."fechaMod" is
  'Última modificación real de la entrada (ISO string), estampada solo cuando cambia algo — ver pipeRowSignature() en src/shared/pipeline-store.js. Usada para la alerta de cotizaciones estancadas (30/60 días). Solo Apple declara esta columna en pipeCols; en Poly/Multi queda NULL.';


-- ============================================================================
--  VERIFICACIÓN (correr después de aplicar)
-- ============================================================================
-- 1. Las columnas existen:
--      select column_name, data_type from information_schema.columns
--      where table_name = 'pipeline' and column_name in ('perdidoMotivo','fechaMod');
--    Esperado: perdidoMotivo → jsonb, fechaMod → text.
--
-- 2. Las filas existentes no se rompieron (deben quedar NULL, no error):
--      select count(*) from public.pipeline where "perdidoMotivo" is null and "fechaMod" is null;
--    Esperado: todas las filas actuales (la migración es aditiva, no backfillea).
-- ============================================================================
