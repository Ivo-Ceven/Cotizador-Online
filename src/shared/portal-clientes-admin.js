/* ============================================================
   PORTAL-CLIENTES-ADMIN · gestión de cuentas del portal desde el shell
   ------------------------------------------------------------
   Fase 3: hasta acá la única forma de dar de alta un cliente-canal
   era pegarle con curl a la Edge Function portal-admin. Esto es
   el mismo patrón que ya usa el modal "👤 Usuarios"
   (shared/auth.js: cevenOpenUsers/cevenRenderUsers/
   cevenCallUsersFn) pero apuntando a portal-admin en vez de
   admin-users — solo vive en el shell (src/index.html), que es
   donde está el modal `#ceven-portal-modal`; navbar.js solo pinta
   el botón 🧑‍💼 si ese modal existe en la página.

   El nombre del cliente en el form de alta es TEXTO LIBRE a
   propósito: portal-admin ya resuelve-o-crea la fila de `clientes`
   por nombre_norm (mismo criterio que shared/clientes-db.js desde
   los cotizadores), así que si el nombre ya existía como cliente
   de un vendedor, esta alta lo reusa en vez de duplicarlo.

   Depende de: shared/auth.js (cevenIsAdmin, cevenAuthedFetch,
   cevenGetSession), shared/safe.js (cevenEsc), shared/nav.js
   (cevenNav, opcional).
   ============================================================ */

var CEVEN_POLY_TIERS = ['Ceven - Tier 1', 'Ceven - Tier 2', 'Ceven - Tier 3', 'Negocios Especiales'];

function cevenCallPortalAdminFn(action, body){
  return cevenAuthedFetch(CEVEN_PORTAL_ADMIN_FN_URL, {
    method: 'POST',
    body: JSON.stringify(Object.assign({action: action}, body || {}))
  });
}

function cevenOpenPortalClientes(){
  if(!cevenIsAdmin()){ alert('Solo el administrador puede gestionar clientes del portal.'); return; }
  var m = document.getElementById('ceven-portal-modal');
  if(!m) return;
  var wasOpen = m.style.display === 'flex';
  m.style.display = 'flex';
  var e = document.getElementById('ceven-portal-err'); if(e) e.style.display = 'none';
  if(window.cevenNav && !wasOpen) cevenNav.openOverlay(cevenClosePortalClientes);
  cevenRenderPortalClientes();
}
function cevenClosePortalClientes(){
  var m = document.getElementById('ceven-portal-modal');
  if(m) m.style.display = 'none';
  if(window.cevenNav) cevenNav.notifyClosed(cevenClosePortalClientes);
}

function cevenCreatePortalCliente(ev){
  if(ev) ev.preventDefault();
  var email = (document.getElementById('cpa-email').value || '').trim().toLowerCase();
  var pass = document.getElementById('cpa-pass').value || '';
  var nombreCliente = (document.getElementById('cpa-nombre').value || '').trim();
  var polyTier = document.getElementById('cpa-tier').value || '';
  var appleMargen = (document.getElementById('cpa-margen').value || '').trim();
  var err = document.getElementById('ceven-portal-err');
  function fail(msg){ if(err){ err.textContent = msg; err.style.display = 'block'; } }

  if(!email || !pass){ fail('Completá el email y la contraseña.'); return false; }
  if(pass.length < 6){ fail('La contraseña debe tener al menos 6 caracteres.'); return false; }
  if(!nombreCliente){ fail('Cargá el nombre del cliente.'); return false; }
  if(err) err.style.display = 'none';

  cevenCallPortalAdminFn('create', {
    email: email, password: pass, nombreCliente: nombreCliente,
    polyTier: polyTier, appleMargen: appleMargen
  }).then(function(){
    document.getElementById('cpa-email').value = '';
    document.getElementById('cpa-pass').value = '';
    document.getElementById('cpa-nombre').value = '';
    document.getElementById('cpa-tier').value = '';
    document.getElementById('cpa-margen').value = '';
    cevenRenderPortalClientes();
  }).catch(function(e){
    fail((e && e.message) || 'No se pudo dar de alta el cliente.');
  });
  return false;
}

function cevenRenderPortalClientes(){
  var box = document.getElementById('ceven-portal-list');
  if(!box) return;
  cevenBindPortalClientesList(box);
  box.innerHTML = '<div style="font-size:13px;color:#6e6e73;padding:8px 4px">Cargando…</div>';
  cevenCallPortalAdminFn('list', {}).then(function(res){
    var lista = (res && res.clientes) || [];
    var rows = '', esc = cevenEsc;
    lista.forEach(function(pc){
      var cliente = pc.cliente || {};
      var activo = pc.status === 'activo';
      var data = ' data-email="' + esc(pc.email) + '"';
      var tag = ' <span style="font-size:11px;color:' + (activo ? '#0f7a35' : '#d70015') + '">(' + (activo ? 'activo' : 'suspendido') + ')</span>';
      var tierInfo = [];
      if(cliente.poly_tier) tierInfo.push('Poly: ' + esc(cliente.poly_tier));
      if(cliente.apple_margen != null) tierInfo.push('Apple: ' + esc(cliente.apple_margen) + '%');
      var sub = '<div style="font-size:11px;color:#6e6e73">' + esc(cliente.nombre || '—') + (tierInfo.length ? ' · ' + tierInfo.join(' · ') : ' · sin tier/margen asignado') + '</div>';
      var btn = activo
        ? '<button type="button" data-act="suspend"' + data + ' style="border:0.5px solid #d70015;border-radius:6px;padding:3px 9px;font-size:12px;cursor:pointer;color:#d70015;background:none;font-family:inherit">Suspender</button>'
        : '<button type="button" data-act="reactivate"' + data + ' style="border:0.5px solid #0071e3;border-radius:6px;padding:3px 9px;font-size:12px;cursor:pointer;color:#0071e3;background:none;font-family:inherit">Reactivar</button>';
      rows += '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 4px;border-bottom:0.5px solid #f0f0f0">'
            + '<span><span style="font-size:13px;color:#1d1d1f">' + esc(pc.email) + tag + '</span>' + sub + '</span>'
            + '<span style="white-space:nowrap">' + btn + '</span></div>';
    });
    box.innerHTML = rows || '<div style="font-size:13px;color:#6e6e73;padding:8px 4px">Todavía no hay clientes del portal.</div>';
  }).catch(function(){
    box.innerHTML = '<div style="font-size:13px;color:#d70015;padding:8px 4px">No se pudo cargar la lista.</div>';
  });
}

function cevenBindPortalClientesList(box){
  if(box._bound) return;
  box._bound = true;
  box.addEventListener('click', function(ev){
    var b = ev.target.closest ? ev.target.closest('[data-act]') : null;
    if(!b) return;
    var email = b.getAttribute('data-email');
    var act = b.getAttribute('data-act');
    if(act !== 'suspend' && act !== 'reactivate') return;
    cevenCallPortalAdminFn(act, {email: email}).then(function(){
      cevenRenderPortalClientes();
    }).catch(function(e){
      alert((e && e.message) || 'No se pudo actualizar el cliente.');
    });
  });
}
