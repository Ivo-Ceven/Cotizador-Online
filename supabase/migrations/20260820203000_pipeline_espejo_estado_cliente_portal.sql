/* ============================================================================
   pipeline_espejo_estado_cliente_portal
   ----------------------------------------------------------------------------
   Ceven pidió ver, DENTRO del pipeline interno (no en una pantalla aparte),
   todo lo que un cliente-canal carga sobre su propio pedido: su estado
   (estado_cliente) y su motivo de pérdida (motivo_perdida) — nunca el motivo
   interno de Ceven, que sigue viviendo solo en pipeline.perdidoMotivo.

   Mismo mecanismo que ya sincroniza en sentido contrario (estado_ceven, ver
   portal_sync_estado_desde_pipeline / trg_portal_sync_estado): un trigger
   copia el valor a dos columnas nuevas de `pipeline`, así el store offline-
   first del cotizador interno las recibe gratis en su próximo `select=*`
   (sync.js) sin tocar pipeCols/objCols de brand.js — son de solo lectura acá,
   igual que el badge "portal" que ya existe (r.origenPortalId en
   apple|poly/js/pipeline-view.js).

   AFTER INSERT también, no solo UPDATE: portal-emitir inserta la fila de
   pipeline ANTES que la de portal_solicitudes, así que cuando esta última se
   crea (con estado_cliente = 'Cotizado' por default) la fila de pipeline ya
   existe y el trigger la encuentra.
   ============================================================================ */

alter table public.pipeline
  add column "origenPortalEstado" text,
  add column "origenPortalMotivo" jsonb;

comment on column public.pipeline."origenPortalEstado" is
  'Estado propio del cliente-canal sobre este pedido frente a SU cliente final (espejo de portal_solicitudes.estado_cliente). Solo lectura acá — lo escribe el cliente-canal desde el portal, lo sincroniza trg_portal_sync_estado_cliente. NULL si origenPortalId es NULL.';
comment on column public.pipeline."origenPortalMotivo" is
  'Motivo de pérdida del cliente-canal frente a SU cliente final (espejo de portal_solicitudes.motivo_perdida). Nunca confundir con perdidoMotivo (motivo interno de Ceven). Solo lectura acá, sincronizado desde el portal.';

create or replace function public.portal_sync_estado_cliente_a_pipeline()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  update public.pipeline
  set "origenPortalEstado" = new.estado_cliente,
      "origenPortalMotivo" = new.motivo_perdida
  where brand = new.pipeline_brand and id = new.pipeline_id;
  return new;
end;
$function$;

-- Security definer + trigger-only: si quedara EXECUTE para authenticated,
-- cualquier cliente-canal podría llamarla directo y pisar el pipeline de
-- OTRO — mismo cuidado que ya se tomó con portal_sync_estado_desde_pipeline.
revoke execute on function public.portal_sync_estado_cliente_a_pipeline() from public, authenticated, anon;

create trigger trg_portal_sync_estado_cliente
after insert or update of estado_cliente, motivo_perdida on public.portal_solicitudes
for each row
execute function public.portal_sync_estado_cliente_a_pipeline();
