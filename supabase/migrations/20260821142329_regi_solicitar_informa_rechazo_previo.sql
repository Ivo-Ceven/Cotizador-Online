-- Ajuste sobre 20260821120000_regi_deal_registration.sql, antes de que
-- portal_regi_solicitar() tuviera ningún uso real (regi_solicitudes vacía).
--
-- La primera versión solo evitaba duplicar una solicitud PENDIENTE; un
-- código ya RECHAZADO por Ceven volvía a crear otra pendiente en cada
-- reintento del cliente, y no había forma de que el cliente se enterara del
-- rechazo (el portal no tiene polling en background, así que el único
-- momento en que puede aparecer es cuando vuelve a apretar "Solicitar
-- aprobación"). Ahora:
--   - el match SIGUE re-evaluándose siempre fresco contra regi_codigos
--     primero: si Ceven cargó el código después de rechazarlo, un match
--     nuevo gana y aprueba, sin que el rechazo previo lo bloquee;
--   - sin match nuevo, un rechazo previo se devuelve tal cual (con su
--     motivo) en vez de generar otra solicitud pendiente — así el cliente
--     ve "rechazado" la próxima vez que lo intenta, no un pendiente eterno;
--   - un aprobado ya vigente para el MISMO regi_codigo_id no se duplica.
create or replace function public.portal_regi_solicitar(p_codigo text, p_ejecutivo_email text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_portal_client_id uuid := public.ceven_portal_client_id();
  v_cliente_id bigint;
  v_ejecutivo_nombre text;
  v_codigo text := btrim(p_codigo);
  v_match record;
  v_previa record;
  v_solicitud_id bigint;
  v_estado text;
begin
  if v_portal_client_id is null or not public.ceven_is_portal_client() then
    raise exception 'No autenticado como cliente del portal.';
  end if;
  if v_codigo = '' then
    raise exception 'Falta el código REGI.';
  end if;

  select cliente_id into v_cliente_id
  from public.portal_clientes where id = v_portal_client_id;

  select nombre into v_ejecutivo_nombre
  from public.portal_equipo_ceven() where email = p_ejecutivo_email;
  if v_ejecutivo_nombre is null then
    raise exception 'Elegí un ejecutivo Ceven de la lista.';
  end if;

  select * into v_match
  from public.regi_codigos
  where codigo = v_codigo
    and cliente_id = v_cliente_id
    and (vigente_desde is null or vigente_desde <= current_date)
    and (vigente_hasta is null or vigente_hasta >= current_date)
  limit 1;

  if found then
    select * into v_previa
    from public.regi_solicitudes
    where portal_client_id = v_portal_client_id
      and codigo = v_codigo
      and estado = 'aprobado'
      and regi_codigo_id = v_match.id
    order by created_at desc
    limit 1;
    if found then
      return jsonb_build_object(
        'id', v_previa.id, 'estado', v_previa.estado,
        'mensaje', 'REGI ya aprobado.',
        'skusCubiertos', (select count(*) from jsonb_object_keys(v_match.precios))
      );
    end if;

    insert into public.regi_solicitudes
      (portal_client_id, codigo, ejecutivo_email, ejecutivo_nombre, estado, regi_codigo_id, resuelto_por, resuelto_at)
    values
      (v_portal_client_id, v_codigo, p_ejecutivo_email, v_ejecutivo_nombre, 'aprobado', v_match.id, 'auto', now())
    returning id, estado into v_solicitud_id, v_estado;
    return jsonb_build_object(
      'id', v_solicitud_id, 'estado', v_estado,
      'mensaje', 'REGI aprobado automáticamente.',
      'skusCubiertos', (select count(*) from jsonb_object_keys(v_match.precios))
    );
  end if;

  select * into v_previa
  from public.regi_solicitudes
  where portal_client_id = v_portal_client_id
    and codigo = v_codigo
    and estado in ('pendiente', 'rechazado')
  order by created_at desc
  limit 1;

  if found then
    return jsonb_build_object(
      'id', v_previa.id, 'estado', v_previa.estado,
      'mensaje', case
        when v_previa.estado = 'rechazado' then
          'Ceven rechazó este código' ||
          (case when v_previa.motivo_rechazo is not null and btrim(v_previa.motivo_rechazo) <> ''
                then ': ' || v_previa.motivo_rechazo else '.' end)
        else 'Ya tenés una solicitud pendiente para este código.'
      end
    );
  end if;

  insert into public.regi_solicitudes
    (portal_client_id, codigo, ejecutivo_email, ejecutivo_nombre, estado)
  values
    (v_portal_client_id, v_codigo, p_ejecutivo_email, v_ejecutivo_nombre, 'pendiente')
  returning id, estado into v_solicitud_id, v_estado;
  return jsonb_build_object(
    'id', v_solicitud_id, 'estado', v_estado,
    'mensaje', 'Solicitud enviada a Ceven para revisión.'
  );
end;
$function$;
