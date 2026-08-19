/* ============================================================
   PORTAL · historial.js
   ------------------------------------------------------------
   Los pedidos que este cliente-canal ya emitió. Solo lectura,
   directo por REST — la RLS de portal_solicitudes/
   portal_solicitud_items ya filtra "los míos", no hace falta
   Edge Function para esto.

   Muestra precio_ceven (lo que Ceven le cotiza) Y precio_reventa
   (lo que él cobra): es su propia plata, no la de otro
   cliente-canal ni la fórmula interna de Ceven — verlo es lo que
   le permite entender su propio margen.

   Depende de: state.js, session.js (cevenAuthedFetch), shared/
   safe.js, shared/notify.js.
   ============================================================ */

var _portalHistorial = [];

function _portalHistorialCargar(){
  var cuerpo = document.getElementById('phist-body');
  if(cuerpo) cuerpo.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--ct3);padding:16px">Cargando…</td></tr>';
  cevenAuthedFetch(SUPABASE_URL + '/rest/v1/portal_solicitudes'
    + '?select=id,brand,proyecto,moneda,total_ceven,total_reventa,pipeline_qnum,estado_ceven,created_at'
    + '&order=created_at.desc&limit=200', {method: 'GET'})
    .then(function(rows){
      _portalHistorial = Array.isArray(rows) ? rows : [];
      _portalHistorialRender();
    })
    .catch(function(err){
      if(cuerpo) cuerpo.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--ct3);padding:16px">'
        + cevenEsc((err && err.message) || 'No se pudo cargar el historial.') + '</td></tr>';
    });
}

function _portalHistorialRender(){
  var cuerpo = document.getElementById('phist-body');
  if(!cuerpo) return;
  if(!_portalHistorial.length){
    cuerpo.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--ct3);padding:16px">Todavía no enviaste ningún pedido</td></tr>';
    return;
  }
  cuerpo.innerHTML = _portalHistorial.map(function(s){
    return '<tr class="crow" data-act="phist-ver" data-id="' + s.id + '" style="cursor:pointer">'
      + '<td>' + new Date(s.created_at).toLocaleDateString('es-AR') + '</td>'
      + '<td><span class="mk mk-' + cevenEsc(s.brand) + '">' + (s.brand === 'apple' ? 'Apple' : 'Poly') + '</span></td>'
      + '<td>' + cevenEsc(s.proyecto || '—') + '</td>'
      + '<td class="sub">' + (s.pipeline_qnum ? ('#' + cevenEsc(s.pipeline_qnum)) : '—') + '</td>'
      // estado_ceven lo pisa el trigger portal_sync_estado_desde_pipeline
      // cuando el vendedor cambia el estado en su pipeline — el portal nunca
      // lo escribe, solo lo muestra.
      + '<td class="sub">' + cevenEsc(s.estado_ceven || 'Cotizado') + '</td>'
      + '<td style="text-align:right">' + cevenEsc(_portalFmt(s.total_ceven)) + '</td>'
      + '<td style="text-align:right;font-weight:600">' + cevenEsc(_portalFmt(s.total_reventa)) + '</td>'
      + '</tr>';
  }).join('');
}

function _portalHistorialVer(id){
  cevenAuthedFetch(SUPABASE_URL + '/rest/v1/portal_solicitud_items?solicitud_id=eq.' + encodeURIComponent(id)
    + '&select=sku,description,qty,precio_ceven,precio_reventa', {method: 'GET'})
    .then(function(rows){
      var det = document.getElementById('phist-detalle');
      if(!det) return;
      det.innerHTML = '<table><thead><tr><th>SKU</th><th>Descripción</th><th>Cant.</th>'
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
}
