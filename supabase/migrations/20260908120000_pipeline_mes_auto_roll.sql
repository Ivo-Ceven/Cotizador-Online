-- ===========================================================================
-- pipeline."mesAutoRoll"  ·  auto-roll del mes de cierre estimado vencido
-- ---------------------------------------------------------------------------
-- Columna aditiva, sin restriccion de marca (igual que "fechaMod" /
-- "perdidoMotivo" en 20260818130000). Guarda el mes de cierre ORIGINAL
-- ('YYYY-MM') de una fila cuyo cierre estimado vencio y el sistema movio al
-- mes actual al entrar al pipeline (rollOverdueEntries() en
-- src/<marca>/js/pipeline-data.js). Sirve para pintar la chapita "↪ auto" y,
-- mas adelante, para las alertas de "este proyecto se viene arrastrando".
--
--   NULL  = nunca se auto-movio, o el mes se edito a mano despues.
--   texto = 'YYYY-MM' del primer mes que tuvo al ser auto-movida (se setea
--           UNA sola vez, no se pisa en re-rolls).
--
-- 🔴 ORDEN DE DEPLOY: aplicar ESTA migracion ANTES de deployar el codigo que
-- suma 'mesAutoRoll' a `pipeCols` de poly/legamaster/apple. sync.js
-- (pushPipeRows) manda TODAS las pipeCols en un solo POST; si la columna no
-- existe server-side, PostgREST responde PGRST204 y rebota el lote ENTERO de
-- pipeline de esa marca, en silencio, para siempre (la trampa "esFOB", ver
-- docs/BASE-DE-DATOS.md). `add column if not exists` hace esto idempotente.
--
-- Revert:  alter table public.pipeline drop column if exists "mesAutoRoll";
-- ===========================================================================

alter table public.pipeline add column if not exists "mesAutoRoll" text;

comment on column public.pipeline."mesAutoRoll" is
  'Mes de cierre ORIGINAL (YYYY-MM) de una fila cuyo cierre estimado vencio y el '
  'sistema movio al mes actual al entrar al pipeline. NULL = nunca auto-movida o '
  'el mes se edito a mano despues. Se setea UNA sola vez (no se pisa en re-rolls). '
  'Ver rollOverdueEntries() en src/<marca>/js/pipeline-data.js.';
