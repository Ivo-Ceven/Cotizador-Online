/* ============================================================
   PORTAL · historial.js
   ------------------------------------------------------------
   Los pedidos que este cliente-canal ya emitió. Mayormente
   lectura, directo por REST — la RLS de portal_solicitudes/
   portal_solicitud_items ya filtra "los míos", no hace falta
   Edge Function para esto.

   Muestra precio_ceven (lo que Ceven le cotiza) Y precio_reventa
   (lo que él cobra): es su propia plata, no la de otro
   cliente-canal ni la fórmula interna de Ceven — verlo es lo que
   le permite entender su propio margen (markup_pct_aplicado, el
   que quedó fijado al emitir el pedido).

   estado_cliente/motivo_perdida SÍ son editables por el cliente-
   canal (migración 20260820193000): es SU seguimiento de este
   pedido frente a SU cliente final, no el fulfillment de Ceven
   (estado_ceven, que sigue siendo solo lectura — lo pisa el
   trigger trg_portal_sync_estado). Nunca confundir motivo_perdida
   (de él) con pipeline.perdidoMotivo (de Ceven, no se expone acá).

   Depende de: state.js, session.js (cevenAuthedFetch), shared/
   safe.js, shared/notify.js.
   ============================================================ */

var _portalHistorial = [];
var PORTAL_ESTADOS_CLIENTE = ['Cotizado', 'Negociación', 'Ganado', 'Perdido'];
var PORTAL_MOTIVOS_PERDIDA = ['Presupuesto del cliente', 'Precio', 'Decisión del cliente', 'Sin Novedades'];

function _portalHistorialCargar(){
  var cuerpo = document.getElementById('phist-body');
  if(cuerpo) cuerpo.innerHTML = '<tr><td colspan="8" style="text-align:center;color:var(--ct3);padding:16px">Cargando…</td></tr>';
  cevenAuthedFetch(SUPABASE_URL + '/rest/v1/portal_solicitudes'
    + '?select=id,brand,proyecto,moneda,total_ceven,total_reventa,markup_pct_aplicado,pipeline_qnum,estado_ceven,estado_cliente,motivo_perdida,created_at'
    + '&order=created_at.desc&limit=200', {method: 'GET'})
    .then(function(rows){
      _portalHistorial = Array.isArray(rows) ? rows : [];
      _portalHistorialRender();
    })
    .catch(function(err){
      if(cuerpo) cuerpo.innerHTML = '<tr><td colspan="8" style="text-align:center;color:var(--ct3);padding:16px">'
        + cevenEsc((err && err.message) || 'No se pudo cargar el historial.') + '</td></tr>';
    });
}

function _portalHistorialBuscar(id){
  for(var i=0;i<_portalHistorial.length;i++){ if(String(_portalHistorial[i].id) === String(id)) return _portalHistorial[i]; }
  return null;
}

function _portalHistorialEstadoOptions(actual){
  return PORTAL_ESTADOS_CLIENTE.map(function(e){
    return '<option value="' + e + '"' + (e === actual ? ' selected' : '') + '>' + e + '</option>';
  }).join('');
}

function _portalHistorialRender(){
  var cuerpo = document.getElementById('phist-body');
  if(!cuerpo) return;
  if(!_portalHistorial.length){
    cuerpo.innerHTML = '<tr><td colspan="8" style="text-align:center;color:var(--ct3);padding:16px">Todavía no enviaste ningún pedido</td></tr>';
    return;
  }
  cuerpo.innerHTML = _portalHistorial.map(function(s){
    var estadoCliente = s.estado_cliente || 'Cotizado';
    var margen = (s.markup_pct_aplicado != null && s.markup_pct_aplicado !== '') ? Number(s.markup_pct_aplicado) : null;
    return '<tr class="crow" data-act="phist-ver" data-id="' + s.id + '" style="cursor:pointer">'
      + '<td>' + new Date(s.created_at).toLocaleDateString('es-AR') + '</td>'
      + '<td><span class="mk mk-' + cevenEsc(s.brand) + '">' + (s.brand === 'apple' ? 'Apple' : 'Poly') + '</span></td>'
      + '<td>' + cevenEsc(s.proyecto || '—') + '</td>'
      + '<td class="sub">' + (s.pipeline_qnum ? ('#' + cevenEsc(s.pipeline_qnum)) : '—') + '</td>'
      // estado_ceven lo pisa el trigger portal_sync_estado_desde_pipeline
      // cuando el vendedor cambia el estado en su pipeline — el portal nunca
      // lo escribe, solo lo muestra.
      + '<td class="sub">' + cevenEsc(s.estado_ceven || 'Cotizado') + '</td>'
      // Tu estado: lo edita el cliente-canal, sobre su propia venta.
      + '<td>'
        + '<select class="phist-estado-select" data-act="phist-noop" data-id="' + s.id + '" style="padding:3px 6px;font-size:12px;border-radius:6px">'
          + _portalHistorialEstadoOptions(estadoCliente)
        + '</select>'
        + (estadoCliente === 'Perdido' && s.motivo_perdida && s.motivo_perdida.motivo
            ? ' <span title="' + cevenEsc(s.motivo_perdida.motivo + (s.motivo_perdida.detalle ? ': ' + s.motivo_perdida.detalle : '')) + '" style="cursor:help">💬</span>'
            : '')
      + '</td>'
      + '<td style="text-align:right">' + cevenEsc(_portalFmt(s.total_ceven)) + '</td>'
      + '<td style="text-align:right;font-weight:600">' + cevenEsc(_portalFmt(s.total_reventa))
        + (margen != null ? ' <span class="sub" style="font-weight:400">(+' + cevenEsc(margen) + '%)</span>' : '')
      + '</td>'
      + '</tr>';
  }).join('');
}

/* Modal de motivo de pérdida — mismo esqueleto que el que ya usa el
   cotizador interno de Apple (pipeline-detail.js): overlay + tarjeta con
   select+textarea, sin diálogo nativo. Acá es el motivo del cliente-canal
   frente a SU cliente final, nunca el de Ceven. */
function _portalMotivoPerdidaModal(prefill, onGuardar, onCancelar){
  var existente = document.getElementById('phist-motivo-modal');
  if(existente) existente.remove();

  var wrap = document.createElement('div');
  wrap.id = 'phist-motivo-modal';
  wrap.style.cssText = 'position:fixed;inset:0;z-index:100000;background:rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center';
  wrap.innerHTML =
    '<div style="background:var(--c1);border:0.5px solid var(--cb);border-radius:16px;padding:22px;width:380px;max-width:92vw;box-shadow:var(--sh3)">'
      + '<div class="h3" style="margin-bottom:4px">Motivo de pérdida</div>'
      + '<p class="sub" style="margin-bottom:14px">Tuyo, frente a tu cliente final — esto no lo ve Ceven.</p>'
      + '<select data-motivo style="margin-bottom:10px;width:100%">'
        + PORTAL_MOTIVOS_PERDIDA.map(function(m){
            return '<option value="' + cevenEsc(m) + '"' + (prefill && prefill.motivo === m ? ' selected' : '') + '>' + cevenEsc(m) + '</option>';
          }).join('')
      + '</select>'
      + '<textarea data-detalle rows="3" placeholder="Detalle (opcional)" style="width:100%;margin-bottom:14px;resize:vertical;box-sizing:border-box">' + cevenEsc((prefill && prefill.detalle) || '') + '</textarea>'
      + '<div style="display:flex;gap:8px;justify-content:flex-end">'
        + '<button type="button" class="bs" data-cancelar>Cancelar</button>'
        + '<button type="button" class="bd" data-guardar>Guardar</button>'
      + '</div>'
    + '</div>';
  document.body.appendChild(wrap);

  function cerrar(){ wrap.remove(); }
  wrap.querySelector('[data-cancelar]').addEventListener('click', function(){ cerrar(); if(onCancelar) onCancelar(); });
  wrap.querySelector('[data-guardar]').addEventListener('click', function(){
    var motivo = wrap.querySelector('[data-motivo]').value;
    var detalle = wrap.querySelector('[data-detalle]').value.trim();
    cerrar();
    onGuardar({motivo: motivo, detalle: detalle || null});
  });
  wrap.addEventListener('click', function(ev){ if(ev.target === wrap){ cerrar(); if(onCancelar) onCancelar(); } });
}

function _portalHistorialGuardarEstado(id, estadoCliente, motivoPerdida){
  var body = {estado_cliente: estadoCliente, motivo_perdida: estadoCliente === 'Perdido' ? motivoPerdida : null};
  return cevenAuthedFetch(SUPABASE_URL + '/rest/v1/portal_solicitudes?id=eq.' + encodeURIComponent(id), {
    method: 'PATCH', headers: {'Prefer': 'return=minimal'}, body: JSON.stringify(body)
  }).then(function(){
    var fila = _portalHistorialBuscar(id);
    if(fila){ fila.estado_cliente = estadoCliente; fila.motivo_perdida = body.motivo_perdida; }
    _portalHistorialRender();
  }).catch(function(err){
    showToast((err && err.message) || 'No se pudo guardar el estado.');
    _portalHistorialRender(); // vuelve el <select> al valor real
  });
}

function _portalHistorialCambiarEstado(id, nuevoEstado){
  var fila = _portalHistorialBuscar(id);
  if(!fila) return;
  if(nuevoEstado === 'Perdido'){
    _portalMotivoPerdidaModal(fila.motivo_perdida, function(motivo){
      _portalHistorialGuardarEstado(id, 'Perdido', motivo);
    }, function(){
      _portalHistorialRender(); // canceló: el <select> vuelve al estado anterior
    });
  } else {
    _portalHistorialGuardarEstado(id, nuevoEstado, null);
  }
}

function _portalHistorialVer(id){
  var fila = _portalHistorialBuscar(id);
  cevenAuthedFetch(SUPABASE_URL + '/rest/v1/portal_solicitud_items?solicitud_id=eq.' + encodeURIComponent(id)
    + '&select=sku,description,qty,precio_ceven,precio_reventa', {method: 'GET'})
    .then(function(rows){
      var det = document.getElementById('phist-detalle');
      if(!det) return;
      var margen = fila && fila.markup_pct_aplicado != null && fila.markup_pct_aplicado !== '' ? Number(fila.markup_pct_aplicado) : null;
      det.innerHTML = (margen != null ? '<p class="sub" style="margin-bottom:8px">Tu margen en este pedido: <b>+' + cevenEsc(margen) + '%</b></p>' : '')
        + '<table><thead><tr><th>SKU</th><th>Descripción</th><th>Cant.</th>'
        + '<th style="text-align:right">Costo Ceven</th><th style="text-align:right">Tu precio</th></tr></thead><tbody>'
        + (rows || []).map(function(r){
            return '<tr><td style="font-family:monospace;font-size:11px">' + cevenEsc(r.sku) + '</td>'
              + '<td class="wrap">' + cevenEsc(r.description) + '</td>'
              + '<td>' + r.qty + '</td>'
              + '<td style="text-align:right">' + cevenEsc(_portalFmt(r.precio_ceven)) + '</td>'
              + '<td style="text-align:right;font-weight:600">' + cevenEsc(_portalFmt(r.precio_reventa)) + '</td></tr>';
          }).join('')
        + '</tbody></table>';
      det.style.display = '';
    })
    .catch(function(err){ showToast((err && err.message) || 'No se pudo abrir el detalle.'); });
}

function _portalHistorialBind(){
  cevenDelegate('phist-body', 'click', function(ev){
    var el = cevenActEl(ev, this);
    if(el && el.getAttribute('data-act') === 'phist-ver') _portalHistorialVer(el.getAttribute('data-id'));
  });
  var cuerpo = document.getElementById('phist-body');
  if(cuerpo){
    cuerpo.addEventListener('change', function(ev){
      if(!ev.target.classList || !ev.target.classList.contains('phist-estado-select')) return;
      _portalHistorialCambiarEstado(ev.target.getAttribute('data-id'), ev.target.value);
    });
  }
}
