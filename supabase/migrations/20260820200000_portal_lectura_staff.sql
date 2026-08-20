/* ============================================================================
   portal_lectura_staff
   ----------------------------------------------------------------------------
   Ninguna tabla portal_* tenía una policy de SELECT para staff — hasta ahora
   solo el propio cliente-canal podía leer su fila ("lo mío"). Eso significaba
   que Ceven no tenía ninguna forma, ni por la app ni por REST, de ver el
   perfil que completó un cliente-canal, sus clientes finales, o (con la
   migración anterior) el estado_cliente/motivo_perdida que carga sobre sus
   propios pedidos.

   El dueño de Ceven pidió explícitamente: acceso total de lectura al staff
   sobre todo lo que un cliente-canal carga — la restricción es de un solo
   sentido (el cliente-canal no ve nada de Ceven ni de otro cliente-canal;
   Ceven ve todo). Mismo criterio ceven_is_staff() que ya usan pipeline,
   clientes, app_settings, todos y equipos — no se toca ninguna policy
   existente, solo se agrega la de staff en las que faltaba.
   ============================================================================ */

create policy portal_clientes_select_staff on public.portal_clientes
  for select using (ceven_is_staff());

create policy portal_perfiles_select_staff on public.portal_perfiles
  for select using (ceven_is_staff());

create policy pcf_select_staff on public.portal_clientes_finales
  for select using (ceven_is_staff());

create policy psol_select_staff on public.portal_solicitudes
  for select using (ceven_is_staff());

create policy psoli_select_staff on public.portal_solicitud_items
  for select using (ceven_is_staff());
