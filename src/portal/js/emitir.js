/* ============================================================
   PORTAL · emitir.js
   ------------------------------------------------------------
   Envía el carrito a portal-emitir. El body que se manda es solo
   INTENCIÓN (sku+qty) — el precio real, el total y el margen
   final los confirma el servidor; el PDF se arma con la
   RESPUESTA, nunca con los números que tenía el carrito local
   (pueden haber cambiado entre que se armó y se emitió).

   Depende de: state.js, session.js, clientes-finales.js, pdf.js,
   shared/notify.js.
   ============================================================ */

function _portalClienteFinalCambio(){
  var libre = !document.getElementById('pemitir-cliente-final').value;
  var box = document.getElementById('pemitir-libre-box');
  if(box) box.style.display = libre ? '' : 'none';
  _portalClienteFinalId = document.getElementById('pemitir-cliente-final').value;
  _portalCarritoRender();
}

function _portalEmitir(){
  if(!_portalCarrito.length){ showToast('El carrito está vacío.'); return; }
  if(!_portalMarca){ showToast('Elegí una marca primero.'); return; }

  var clienteFinalId = document.getElementById('pemitir-cliente-final').value || null;
  var regiSolicitudId = (typeof _portalRegiSolicitudIdSiAprobado === 'function') ? _portalRegiSolicitudIdSiAprobado() : null;
  var body = {
    brand: _portalMarca,
    clienteFinalId: clienteFinalId,
    regiSolicitudId: regiSolicitudId,
    items: _portalCarrito.map(function(it){ return {sku: it.sku, qty: it.qty}; })
  };
  if(!clienteFinalId){
    body.proyecto = (document.getElementById('pemitir-proyecto-libre').value || '').trim();
    body.markupPct = Number(document.getElementById('pemitir-markup-libre').value);
    if(!body.proyecto){ showToast('Contá para quién es este pedido (nombre del proyecto o cliente final).'); return; }
  }

  var btn = document.getElementById('pbtn-emitir');
  if(btn){ btn.disabled = true; btn.textContent = 'Enviando…'; }

  cevenAuthedFetch(SUPABASE_URL + '/functions/v1/portal-emitir', {
    method: 'POST', body: JSON.stringify(body)
  }).then(function(resp){
    showToast('✓ Pedido enviado a Ceven — cotización #' + resp.qNum + '.');
    _portalPdfGenerarYAbrir(resp);
    _portalCarrito = [];
    if(typeof _portalRegiReset === 'function') _portalRegiReset();
    _portalCatRender();
    _portalCarritoRender();
    if(resp.noEncontrados && resp.noEncontrados.length){
      showToast('Ojo: ' + resp.noEncontrados.length + ' producto(s) no se pudieron cotizar y quedaron afuera del pedido.');
    }
  }).catch(function(err){
    showError((err && err.message) || 'No se pudo enviar el pedido.');
  }).then(function(){
    if(btn){ btn.disabled = false; btn.textContent = 'Enviar pedido a Ceven'; }
  });
}

function _portalEmitirBind(){
  var sel = document.getElementById('pemitir-cliente-final');
  if(sel) sel.addEventListener('change', _portalClienteFinalCambio);
  var btn = document.getElementById('pbtn-emitir');
  if(btn) btn.addEventListener('click', _portalEmitir);
}
