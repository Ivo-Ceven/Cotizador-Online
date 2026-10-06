-- ===========================================================================
-- pipeline  ·  mes en que se FACTURO cada cotizacion
-- ---------------------------------------------------------------------------
-- Columnas aditivas, sin restriccion de marca (igual que "mesAutoRoll" en
-- 20260908120000). Las escribe savePipeline() / pipeline-facturacion.js
-- (src/shared) al marcar Facturado:
--
--   "mesFact"        'YYYY-MM' en que quedo Facturada la fila entera.
--   "fechaFact"      ISO de ese momento.
--   "skuMesFact"     jsonb { 'SKU|idx': 'YYYY-MM' }: mes de facturacion de las
--                    lineas que se facturaron con estado propio ("skuStatus").
--   "mesCierreAntes" cierre estimado que tenia antes de pasar a Facturado; se
--                    restaura si el Facturado era un error y se cambia de estado.
--
-- Al pasar a Facturado, "mesCierre" pasa a ser el mes de facturacion: todo lo
-- que agrupa por mes (selector, forecast, archivo) sigue leyendo solo "mesCierre".
--
-- 🔴 ORDEN DE DEPLOY: aplicar ESTA migracion ANTES de deployar el codigo que suma
-- las columnas a `pipeCols` de poly/huawei/legamaster/apple. sync.js
-- (pushPipeRows) manda TODAS las pipeCols en un solo POST; si una columna no
-- existe server-side, PostgREST responde PGRST204 y rebota el lote ENTERO de
-- pipeline de esa marca, en silencio, para siempre (la trampa "esFOB", ver
-- docs/BASE-DE-DATOS.md). `add column if not exists` hace esto idempotente.
--
-- Revert:
--   alter table public.pipeline
--     drop column if exists "mesFact", drop column if exists "fechaFact",
--     drop column if exists "skuMesFact", drop column if exists "mesCierreAntes";
-- ===========================================================================

alter table public.pipeline add column if not exists "mesFact"        text;
alter table public.pipeline add column if not exists "fechaFact"      text;
alter table public.pipeline add column if not exists "skuMesFact"     jsonb;
alter table public.pipeline add column if not exists "mesCierreAntes" text;

comment on column public.pipeline."mesFact" is
  'Mes (YYYY-MM) en que la fila quedo Facturada. NULL = no esta Facturada. Ver src/shared/pipeline-facturacion.js.';
comment on column public.pipeline."fechaFact" is
  'ISO del momento en que la fila quedo Facturada.';
comment on column public.pipeline."skuMesFact" is
  'Mes de facturacion por linea: { "SKU|idx": "YYYY-MM" }, solo para lineas con estado propio Facturado.';
comment on column public.pipeline."mesCierreAntes" is
  'Cierre estimado (YYYY-MM) previo a pasar a Facturado; se restaura si se revierte el estado.';
