-- ============================================================================
-- cotizaciones · la tabla que reemplaza al blob `cquotes` de app_settings
-- ----------------------------------------------------------------------------
-- POR QUE
-- -------
-- Hasta hoy el historial de cotizaciones de cada marca viajaba como UN SOLO
-- string JSON en app_settings (`cquotes`), o sea last-write-wins a nivel
-- documento: el que sube su blob ultimo borra lo que los demas hayan guardado
-- desde su ultima lectura. Con cuatro escritores concurrentes (el navegador de
-- cada usuario, el `emitir` del multimarca, la Edge Function portal-emitir y
-- cualquier restore de backup) eso se traduce en cotizaciones que desaparecen
-- sin dejar rastro: no pasan por la papelera y no hay ningun error.
--
-- El caso esta reproducido de forma determinista en
-- scripts/check-sync-colecciones.js (seccion 8), corriendo el sync.js real.
--
-- QUE CAMBIA
-- ----------
-- Una fila por cotizacion, con sus lineas en jsonb. El sync pasa a diffear fila
-- por fila igual que ya hace con `pipeline`, que justamente por eso nunca sufrio
-- este problema.
--
-- La clave del diseño es separar IDENTIDAD de ETIQUETA:
--   · `id`   identidad. La genera el cliente, offline, y no cambia nunca.
--   · `qnum` etiqueta (el "#0100" que ve el cliente). Si dos personas toman el
--            mismo numero, el unique (brand, qnum) rebota y el cliente renumera.
--            Se pierde el numero, NUNCA la cotizacion.
--
-- Por que `id` es TEXT y no UUID: las cotizaciones que ya existen necesitan un
-- id deterministico que este backfill y un cliente offline calculen IGUAL sin
-- coordinarse. Las viejas son 'q' || qnum; las nuevas, un uuid del navegador.
--
-- ESTA MIGRACION NO ROMPE NADA: crea la tabla y la llena, pero ningun cliente la
-- lee todavia. El blob sigue siendo la fuente de verdad hasta la Fase 2.
-- Es idempotente: se puede correr mas de una vez.
--
-- Ver el plan completo en docs/HISTORIAL.md y docs/ARQUITECTURA.md.
-- ============================================================================

create table if not exists public.cotizaciones (
  brand       text not null,
  id          text not null,              -- identidad: 'q0100' (legacy) o uuid
  qnum        bigint not null,            -- etiqueta visible
  cliente     text,
  proyecto    text,
  ejecutivo   text,
  estado      text,
  "mesCierre" text,                       -- 'YYYY-MM', camelCase como en pipeline
  autor_id    uuid,                       -- auth.uid() de quien la creo
  lineas      jsonb not null,             -- las filas de cquotes de ESA cotizacion
  cond        jsonb,                      -- condiciones comerciales
  updated_at  timestamptz not null default now(),
  borrada_at  timestamptz,                -- papelera: nunca DELETE fisico
  primary key (brand, id),
  constraint cotizaciones_qnum_unico unique (brand, qnum)
);

-- El historial se filtra siempre por marca, y muy seguido por numero.
create index if not exists cotizaciones_brand_qnum_idx
  on public.cotizaciones (brand, qnum desc);
-- Las no borradas son el 99% de las consultas.
create index if not exists cotizaciones_vivas_idx
  on public.cotizaciones (brand, qnum desc) where borrada_at is null;

-- ----------------------------------------------------------------------------
-- RLS · mismas cuatro policies que `pipeline` (20260730120000_rls_por_rol_y_marca)
-- ----------------------------------------------------------------------------
-- select abierto a cualquier usuario autenticado (el equipo ve todo el
-- historial); escribir exige que la marca este en el claim del usuario. El
-- WITH CHECK del update hace falta ademas del USING: sin el se podria mover una
-- fila de 'poly' a 'apple' y saltearse el aislamiento por marca.
alter table public.cotizaciones enable row level security;

revoke all on table public.cotizaciones from anon;

drop policy if exists "cotizaciones_select" on public.cotizaciones;
drop policy if exists "cotizaciones_insert" on public.cotizaciones;
drop policy if exists "cotizaciones_update" on public.cotizaciones;
drop policy if exists "cotizaciones_delete" on public.cotizaciones;

create policy "cotizaciones_select" on public.cotizaciones
  for select to authenticated
  using (true);

create policy "cotizaciones_insert" on public.cotizaciones
  for insert to authenticated
  with check (public.ceven_can_write_brand(brand));

create policy "cotizaciones_update" on public.cotizaciones
  for update to authenticated
  using (public.ceven_can_write_brand(brand))
  with check (public.ceven_can_write_brand(brand));

create policy "cotizaciones_delete" on public.cotizaciones
  for delete to authenticated
  using (public.ceven_can_write_brand(brand));

-- ----------------------------------------------------------------------------
-- BACKFILL desde el blob
-- ----------------------------------------------------------------------------
-- Se hace UNA SOLA VEZ y del lado del servidor a proposito: si cada dispositivo
-- convirtiera su copia, dos de ellos podrian asignarle ids distintos a la misma
-- cotizacion y terminariamos con duplicados. Aca hay una sola conversion
-- autoritativa y todos la bajan ya hecha.
--
-- `s.key like '%cquotes'` cubre las cuatro marcas de una: apple usa 'cquotes'
-- (su prefix es '' por historia) y las demas 'poly_cquotes', 'legamaster_cquotes',
-- 'multi_cquotes'.
--
-- `with ordinality` preserva el ORDEN de las lineas dentro de la cotizacion: el
-- lineKey de los overrides por SKU del pipeline es "SKU|indice" sobre esa lista,
-- asi que si el orden se altera los estados por SKU se aplican a la linea
-- equivocada (ver docs/ARQUITECTURA.md).
--
-- OJO en el ensayo sobre la copia: si algun `cquotes` tuviera JSON invalido, el
-- cast `s.value::jsonb` aborta la migracion entera. No es destructivo (corre en
-- una transaccion: no se escribe nada), pero hay que detectarlo ANTES de
-- produccion. Para encontrar al culpable sin que explote:
--
--   select brand, key, left(value, 120)
--   from public.app_settings
--   where key like '%cquotes'
--     and (value is null or value !~ '^\s*\[');
insert into public.cotizaciones (brand, id, qnum, cliente, proyecto, ejecutivo, estado, "mesCierre", lineas, cond)
with filas as (
  select
    s.brand,
    (t.e ->> 'N° Cotización')            as qn,
    t.e                                   as linea,
    t.ord                                 as ord
  from public.app_settings s
  cross join lateral jsonb_array_elements(s.value::jsonb) with ordinality as t(e, ord)
  where s.key like '%cquotes'
    and s.value is not null
    and jsonb_typeof(s.value::jsonb) = 'array'
    and nullif(t.e ->> 'N° Cotización', '') is not null
)
select
  f.brand,
  'q' || f.qn,
  -- El numero se guarda como '0100' (string con ceros); la columna es bigint.
  -- El regexp es una red de seguridad por si alguna fila vieja trae un prefijo.
  nullif(regexp_replace(f.qn, '\D', '', 'g'), '')::bigint,
  -- Los datos de cabecera estan repetidos en TODAS las filas de la cotizacion:
  -- alcanza con tomar uno. max() sobre el mismo valor repetido es ese valor.
  max(f.linea ->> 'Cliente'),
  max(f.linea ->> 'Proyecto'),
  max(f.linea ->> 'Ejecutivo'),
  max(f.linea ->> '_estado'),
  max(f.linea ->> 'Mes Cierre'),
  jsonb_agg(f.linea order by f.ord),
  jsonb_build_object(
    'pago',    max(f.linea ->> 'Condición de pago'),
    'vigencia',max(f.linea ->> 'Propuesta efectiva hasta'),
    'entrega', max(f.linea ->> 'Entrega')
  )
from filas f
-- Una fila sin numero parseable no puede entrar: qnum es NOT NULL y ademas
-- unique. Es preferible dejarla en el blob (que no se borra en esta fase) a
-- abortar el backfill entero.
where nullif(regexp_replace(f.qn, '\D', '', 'g'), '') is not null
group by f.brand, f.qn
on conflict (brand, id) do nothing;

-- ----------------------------------------------------------------------------
-- VERIFICACION (correr a mano despues de aplicar; no aborta la migracion)
-- ----------------------------------------------------------------------------
-- Cotizaciones migradas por marca vs. numeros distintos que hay en el blob.
-- Los dos lados tienen que dar IGUAL antes de habilitar la Fase 2.
--
--   with delBlob as (
--     select s.brand, count(distinct t.e ->> 'N° Cotización') as n
--     from public.app_settings s
--     cross join lateral jsonb_array_elements(s.value::jsonb) as t(e)
--     where s.key like '%cquotes' and jsonb_typeof(s.value::jsonb) = 'array'
--       and nullif(t.e ->> 'N° Cotización', '') is not null
--     group by s.brand
--   )
--   select b.brand, b.n as en_blob, count(c.id) as en_tabla
--   from delBlob b left join public.cotizaciones c on c.brand = b.brand
--   group by b.brand, b.n;
