-- ============================================================================
-- Poly · el pipeline pasa de "1 fila = 1 OPG" a "1 fila = 1 proyecto"
-- ----------------------------------------------------------------------------
-- Hasta ahora una fila de Poly era un OPG con un array `salas[]` (jsonb) adentro
-- y el estado / mes de cierre / factura vivían a nivel OPG. Eso tenía dos
-- consecuencias que el usuario veía:
--
--   · cambiarle el estado a un proyecto se lo cambiaba a todos los proyectos del
--     mismo OPG, porque el estado no era del proyecto;
--   · `addToPipeline()` buscaba la fila destino SOLO por OPG, así que la misma
--     cotización podía terminar en dos filas distintas: su monto se contaba dos
--     veces en los KPIs y aparecía repetida en el Excel del pipeline.
--
-- El OPG pasa a ser un dato informativo del proyecto (así lo usa el negocio) y
-- la identidad de la fila es el número de cotización.
--
-- NO HAY DATOS PRODUCTIVOS: se borran los de prueba en vez de migrarlos. Esa fue
-- una decisión explícita — ver docs/HISTORIAL.md, entrada del 03/08/2026.
--
-- Lo que NO hace este archivo, y hay que tener presente: limpiar el
-- `localStorage` de cada navegador. Si alguien abre la app con el
-- `poly_cpipeline` viejo en disco, el bootstrap de sync.js lo trata como filas
-- locales que el servidor no tiene y las vuelve a subir. De eso se encarga el
-- flag `poly_model_v2` en src/poly/index.html, que corre ANTES de sync.js.
-- ============================================================================

begin;

-- 1) Datos de prueba de Poly. `pipeline` va fila por fila; `cquotes`/`carchive`
--    son blobs en app_settings. `cqc` (el contador de cotizaciones) se borra
--    también: los números viejos apuntaban a cotizaciones que ya no existen.
delete from public.pipeline      where brand = 'poly';
delete from public.app_settings  where brand = 'poly'
  and key in ('poly_cquotes', 'poly_carchive', 'poly_cqc');

-- 2) `salas` era jsonb y solo la usaba Poly. Con el modelo nuevo no queda
--    ninguna marca usándola.
alter table public.pipeline drop column if exists salas;

-- 3) Poly empieza a usar tres columnas que YA EXISTÍAN y hasta ahora eran
--    apple-only (quedaban NULL para brand='poly'): no hace falta agregar nada.
--    Se actualizan los comentarios para que el esquema no siga diciendo que son
--    de una sola marca.
comment on column public.pipeline."qNum" is
  'Nro de cotizacion. apple y poly. El cliente lo re-normaliza a "0071" (padCols).';
comment on column public.pipeline.proyecto is
  'apple: nombre/referencia del proyecto. poly: el proyecto (cliente final).';
comment on column public.pipeline.opg is
  'poly: numero de precio especial que asigna la marca. INFORMATIVO: no agrupa.';
comment on column public.pipeline.factura is
  'poly: numero de factura DEL PROYECTO, se completa post-hoc (analogo a ovLink).';

-- 4) Apple: `Proyecto` y `Observaciones` dejan de ser el mismo campo.
--
--    El marcador FOB (que pone la nacionalizacion en 0%) se escribe en
--    Observaciones, que NO viaja al pipeline. Hasta ahora se detectaba de
--    rebote, porque `proyecto` guardaba ese mismo texto: al separarlos, la
--    deteccion se caia y CAMBIABAN LOS PRECIOS. Por eso el flag pasa a ser una
--    columna propia, sincronizada como cualquier otra.
alter table public.pipeline add column if not exists "esFOB" boolean;
comment on column public.pipeline."esFOB" is
  'apple: la cotizacion es FOB (nacionalizacion 0%). Se toma de Observaciones al agregar al pipeline.';

commit;
