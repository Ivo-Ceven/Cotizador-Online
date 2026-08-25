-- Forecast editable a mano sobre un proyecto del pipeline REGI, con un
-- estado que el archivo de HP no contempla: "Perdido". Ver docs/HISTORIAL.md
-- (25/08/2026, "Pipeline REGI: forecast editable + monto único").
--
-- Columna aparte y no un UPDATE directo sobre `forecast` a propósito:
-- `forecast` la reescribe CADA reimportación del Excel
-- (_procesarRegiPipelineExcel manda ese valor para toda fila presente en el
-- archivo nuevo), así que un edit a mano ahí se perdería en la próxima
-- importación. `forecast_override` NO se incluye en ese upsert, así que
-- sobrevive mientras el proyecto (opd) siga existiendo — mismo criterio que
-- ya usa poly_regi_pipeline_productos (tabla aparte) para lo mismo.
alter table public.poly_regi_pipeline
  add column forecast_override text
  check (forecast_override is null or forecast_override in ('Commit', 'Pipeline', 'Upside', 'Perdido'));

comment on column public.poly_regi_pipeline.forecast_override is
  'Forecast que Ceven fija a mano sobre un proyecto REGI (incluye "Perdido", que el archivo de HP no contempla). Si es NULL se muestra "forecast" (el que trae el Excel); si tiene valor, lo reemplaza en toda la UI. No lo toca la reimportación del Excel, así que sobrevive mientras el proyecto (opd) siga existiendo. La UPDATE de esta columna usa la policy poly_regi_pipeline_update que ya existe (ceven_is_writer()) — no hace falta ninguna policy nueva.';
