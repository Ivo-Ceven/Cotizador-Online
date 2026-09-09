-- ============================================================================
-- pipeline."esFOB" + comentarios de columnas poly/apple
-- ----------------------------------------------------------------------------
-- Parte SEGURA extraida de 20260803120000_poly_pipeline_por_proyecto.sql, que se
-- elimino del repo el 09/09/2026: aquel archivo empezaba con
--   delete from public.pipeline     where brand = 'poly';
--   delete from public.app_settings where brand = 'poly' and key in (...);
--   alter table public.pipeline drop column if exists salas;
-- que hoy borraria datos reales de Poly (ver "🔴 LOS DATOS DE POLY YA SON
-- REALES" en docs/HISTORIAL.md). Los delete / el drop de `salas` NO se
-- reescriben: `salas` queda como columna sin uso, inofensiva.
--
-- Lo unico que sigue haciendo falta de ese archivo es la columna "esFOB":
--   · Apple la declara en `pipeCols` (src/apple/brand.js) y el cliente la
--     ESCRIBE al agregar al pipeline (isCotizacionFOB()).
--   · Como la columna no existe en la base, TODO upsert de pipeline que la
--     incluya se rechaza con 400 (PGRST204) y la fila entera no entra —
--     sync.js se come el error con un console.warn (falla en silencio).
--     Le pasa al cotizador de Apple y al multimarca al emitir Apple.
--   · El arreglo es aditivo y de una linea. Ver docs/BASE-DE-DATOS.md.
--
-- Todo aditivo/idempotente: no toca datos, `add column if not exists`.
--
-- Revert:  alter table public.pipeline drop column if exists "esFOB";
-- ============================================================================

alter table public.pipeline add column if not exists "esFOB" boolean;

comment on column public.pipeline."esFOB" is
  'apple: la cotizacion es FOB (nacionalizacion 0%). Se toma de Observaciones al agregar al pipeline.';

-- Comentarios que dejan de decir "solo apple" en columnas que hoy usa tambien poly.
comment on column public.pipeline."qNum" is
  'Nro de cotizacion. apple y poly. El cliente lo re-normaliza a "0071" (padCols).';
comment on column public.pipeline.proyecto is
  'apple: nombre/referencia del proyecto. poly: el cliente final.';
comment on column public.pipeline.opg is
  'poly: numero de precio especial que asigna la marca. INFORMATIVO: no agrupa.';
comment on column public.pipeline.factura is
  'poly: link a Netsuite del proyecto, se completa post-hoc (analogo a ovLink).';
