-- Pipeline: una fila por entrada de pipeline (espeja localStorage.cpipeline)
create table public.pipeline (
  id              bigint primary key,        -- Date.now() generado por el cliente
  fecha           text,                      -- dd/mm/aaaa (para mostrar)
  "fechaISO"      text,                      -- aaaa-mm-dd (para ordenar)
  "qNum"          bigint,                    -- nro de cotización (el cliente lo re-normaliza a "0071")
  cliente         text,
  proyecto        text,
  ejecutivo       text,
  "mesCierre"     text,                      -- 'YYYY-MM'
  estado          text,                      -- Proyecto|Cotizado|Negociacion|Commit|Con OC|Autorizando|Facturado|Perdido
  "qMac"          numeric, "qIph"  numeric, "qIpad" numeric,
  "qServ"         numeric, "qAcc"  numeric,
  "montoMac"      numeric, "montoIph" numeric, "montoIpad" numeric,
  "montoAcc"      numeric, "montoServ" numeric,
  monto           numeric,
  "margenPond"    numeric,
  moneda          text,
  "skuStatus"        jsonb,   -- overrides de estado por línea de producto
  "skuMesCierre"     jsonb,   -- overrides de mes de cierre por línea
  "skuPartialQty"    jsonb,   -- entregas parciales: qty facturada por línea
  "skuPartialRemSt"  jsonb,   -- estado del remanente parcial
  "skuPartialRemMes" jsonb,   -- mes del remanente parcial
  "skuArchivedQty"   jsonb,   -- qty ya archivada por línea
  "ovLink"        text        -- link a la orden de venta
);

-- Settings compartidos: espeja claves de localStorage como key/value
create table public.app_settings (
  key   text primary key,
  value text
);

-- RLS: la app opera como rol anon (sin JWT de usuario)
alter table public.pipeline     enable row level security;
alter table public.app_settings enable row level security;
create policy "anon full access" on public.pipeline     for all to anon using (true) with check (true);
create policy "anon full access" on public.app_settings for all to anon using (true) with check (true);