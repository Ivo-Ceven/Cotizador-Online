/* ============================================================================
   portal_solicitudes_estado_motivo_cliente
   ----------------------------------------------------------------------------
   El cliente-canal pidió poder llevar SU PROPIO seguimiento de cada pedido
   frente a SU cliente final: en qué etapa está esa venta (no la de fulfillment
   de Ceven, que ya vive en estado_ceven y la pisa el trigger
   trg_portal_sync_estado) y, si la perdió, por qué — su motivo, nunca el
   motivo interno de Ceven (pipeline.perdidoMotivo, que sigue sin exponerse:
   ver docs/HISTORIAL.md, 20/08/2026).

   Dos columnas nuevas en portal_solicitudes, editables por el propio cliente-
   canal. Todo lo demás de la fila (total_ceven, total_reventa, portal_client_id,
   pipeline_id, ...) tiene que seguir siendo autoritativo de portal-emitir
   (service_role) — por eso el UPDATE se restringe a columna, no solo a fila:
   authenticated ya tenía UPDATE de tabla completa (default de Supabase), así
   que sin el revoke de abajo la policy dejaría tocar CUALQUIER columna,
   incluido portal_client_id (alguien podría "robarse" un pedido ajeno
   cambiando el dueño).
   ============================================================================ */

alter table public.portal_solicitudes
  add column estado_cliente text default 'Cotizado'
    check (estado_cliente in ('Cotizado', 'Negociación', 'Ganado', 'Perdido')),
  add column motivo_perdida jsonb;

comment on column public.portal_solicitudes.estado_cliente is
  'Etapa propia del cliente-canal sobre este pedido frente a SU cliente final. No confundir con estado_ceven (fulfillment interno de Ceven, read-only para el portal, lo pisa trg_portal_sync_estado).';
comment on column public.portal_solicitudes.motivo_perdida is
  'Motivo de pérdida del cliente-canal frente a SU cliente final, cuando estado_cliente = Perdido: {motivo, detalle}. Nunca el motivo interno de Ceven — eso vive en pipeline.perdidoMotivo y no se expone al portal.';

revoke update on public.portal_solicitudes from authenticated;
grant update (estado_cliente, motivo_perdida) on public.portal_solicitudes to authenticated;

create policy psol_update_own_estado_cliente on public.portal_solicitudes
  for update
  using (portal_client_id = ceven_portal_client_id())
  with check (portal_client_id = ceven_portal_client_id());
