/* ============================================================
   PORTAL · clientes-finales.js
   ------------------------------------------------------------
   Los compradores del cliente-canal (externos a Ceven, no
   confundir con la tabla `clientes` que es de clientes DE
   Ceven). CRUD directo por REST contra `portal_clientes_finales`
   — la RLS ya filtra "los míos", no hace falta pasar por una
   Edge Function porque nada de esto compromete plata de Ceven.

   Depende de: state.js, session.js (cevenAuthedFetch), shared/
   safe.js, shared/notify.js.
   ============================================================ */

var CEVEN_PCF_REST = function(){ return SUPABASE_URL + '/rest/v1/portal_clientes_finales'; };

function _portalClientesFinalesCargar(){
  return cevenAuthedFetch(CEVEN_PCF_REST() + '?select=id,nombre,cuit,contacto,domicilio,markup_pct&order=nombre.asc', {method: 'GET'})
    .then(function(rows){
      _portalClientesFinales = Array.isArray(rows) ? rows : [];
      return _portalClientesFinales;
    })
    .catch(function(){ return _portalClientesFinales; });
}

function _portalClientesFinalesRender(){
  _portalClientesFinalesCargar().then(function(rows){
    var cuerpo = document.getElementById('pcf-body');
    if(cuerpo){
      cuerpo.innerHTML = rows.length ? rows.map(function(c){
        return '<tr>'
          + '<td>' + cevenEsc(c.nombre) + '</td>'
          + '<td>' + cevenEsc(c.cuit || '—') + '</td>'
          + '<td>' + (c.markup_pct != null ? cevenEsc(c.markup_pct) + '%' : '<span class="sub">default de la cuenta</span>') + '</td>'
          + '<td style="text-align:center"><button class="bs" data-act="pcf-borrar" data-id="' + c.id + '" style="padding:2px 8px">Eliminar</button></td>'
          + '</tr>';
      }).join('') : '<tr><td colspan="4" style="text-align:center;color:var(--ct3);padding:16px">Todavía no cargaste ningún cliente final</td></tr>';
    }
    _portalPintarSelectClienteFinal();
  });
}

/* El <select> que usa la pantalla de emitir. "" = proyecto libre, sin cliente
   final formal (usa el markup default de la cuenta). */
function _portalPintarSelectClienteFinal(){
  var sel = document.getElementById('pemitir-cliente-final');
  if(!sel) return;
  var actual = sel.value;
  var h = '<option value="">— Proyecto libre (sin cliente final) —</option>';
  h += _portalClientesFinales.map(function(c){
    return '<option value="' + c.id + '">' + cevenEsc(c.nombre) + (c.markup_pct != null ? (' · ' + cevenEsc(c.markup_pct) + '%') : '') + '</option>';
  }).join('');
  sel.innerHTML = h;
  if(_portalClientesFinales.some(function(c){ return String(c.id) === actual; })) sel.value = actual;
}

function _portalClienteFinalCrear(){
  var claims = cevenPortalClaims();
  var portalClientId = claims && claims.portal_client_id;
  if(!portalClientId){ showToast('No se pudo identificar la cuenta. Volvé a entrar.'); return; }

  var nombre = (document.getElementById('pcf-nombre').value || '').trim();
  if(!nombre){ showToast('Cargá el nombre del cliente final.'); return; }
  var cuit = (document.getElementById('pcf-cuit').value || '').trim();
  var contacto = (document.getElementById('pcf-contacto').value || '').trim();
  var domicilio = (document.getElementById('pcf-domicilio').value || '').trim();
  var markupRaw = (document.getElementById('pcf-markup').value || '').trim();
  var body = {
    portal_client_id: portalClientId,
    nombre: nombre, cuit: cuit || null, contacto: contacto || null, domicilio: domicilio || null,
    markup_pct: markupRaw === '' ? null : Number(markupRaw)
  };
  if(body.markup_pct != null && (isNaN(body.markup_pct) || body.markup_pct < 0 || body.markup_pct > 500)){
    showToast('El margen tiene que ser un número entre 0 y 500.');
    return;
  }
  cevenAuthedFetch(CEVEN_PCF_REST(), {
    method: 'POST', headers: {'Prefer': 'return=minimal'}, body: JSON.stringify(body)
  }).then(function(){
    ['pcf-nombre','pcf-cuit','pcf-contacto','pcf-domicilio','pcf-markup'].forEach(function(id){
      var el = document.getElementById(id); if(el) el.value = '';
    });
    showToast('✓ Cliente final agregado.');
    _portalClientesFinalesRender();
  }).catch(function(err){
    showError((err && err.message) || 'No se pudo guardar el cliente final.');
  });
}

function _portalClienteFinalEliminar(id){
  if(!confirm('¿Eliminar este cliente final? No borra pedidos ya emitidos.')) return;
  cevenAuthedFetch(CEVEN_PCF_REST() + '?id=eq.' + encodeURIComponent(id), {
    method: 'DELETE', headers: {'Prefer': 'return=minimal'}
  }).then(function(){
    showToast('Cliente final eliminado.');
    _portalClientesFinalesRender();
  }).catch(function(err){
    showError((err && err.message) || 'No se pudo eliminar.');
  });
}

function _portalClientesFinalesBind(){
  var btn = document.getElementById('pcf-crear');
  if(btn) btn.addEventListener('click', _portalClienteFinalCrear);
  cevenDelegate('pcf-body', 'click', function(ev){
    var el = cevenActEl(ev, this);
    if(el && el.getAttribute('data-act') === 'pcf-borrar') _portalClienteFinalEliminar(el.getAttribute('data-id'));
  });
  var sel = document.getElementById('pemitir-cliente-final');
  if(sel) sel.addEventListener('change', function(){
    _portalClienteFinalId = sel.value;
    _portalCarritoRender();
  });
}
