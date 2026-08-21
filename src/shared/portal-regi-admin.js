/* ============================================================
   PORTAL-REGI-ADMIN · gestión de códigos REGI (Deal Registration
   de Poly) y aprobación de solicitudes del portal, desde el shell
   ------------------------------------------------------------
   A diferencia de portal-clientes-admin.js (que pega a la Edge
   Function portal-admin porque crea logins), acá no hace falta
   ninguna Edge Function: `regi_codigos`/`regi_solicitudes` son
   datos de negocio comunes, con RLS ceven_is_staff()/
   ceven_is_writer() igual que `clientes`/`pipeline` — el staff ya
   puede leerlas y escribirlas directo por REST con su propio JWT.
   Ver supabase/migrations/20260821120000_regi_deal_registration.sql.

   Solo vive en el shell (src/index.html), que es donde está el
   modal `#ceven-regi-modal`; navbar.js solo pinta el botón 🎯 si
   ese modal existe en la página (mismo criterio que el de
   Clientes del portal).

   Gate de permiso: no admin-only como Clientes del portal (que
   crea cuentas) — alcanza con no ser `lector`, mismo criterio que
   `ceven_is_writer()` en la base, porque cargar un REGI o aprobar
   una solicitud es una acción de venta, no de administración de
   cuentas.

   El cliente del formulario de alta se resuelve-o-crea con
   cevenClienteDbResolver() (shared/clientes-db.js) — la MISMA
   función que ya usan los cotizadores internos para no duplicar
   la fila de `clientes` si el nombre ya existía.

   Depende de: shared/auth.js (cevenAuthedFetch, cevenMyRole,
   cevenSessionUser), shared/clientes-db.js (cevenClienteDbResolver,
   cevenClientesDbListar), shared/safe.js (cevenEsc), shared/nav.js
   (cevenNav, opcional).
   ============================================================ */

var _cevenRegiCodigosCache = [];

function _cevenRegiRest(path){ return SUPABASE_URL + '/rest/v1/' + path; }

function _cevenRegiParsearPrecios(texto){
  var out = {};
  String(texto || '').split(/\r?\n/).forEach(function(linea){
    var t = linea.trim();
    if(!t) return;
    var i = t.indexOf(',');
    if(i < 0) return;
    var sku = t.slice(0, i).trim();
    var precio = Number(t.slice(i + 1).trim().replace(',', '.'));
    if(sku && isFinite(precio)) out[sku] = precio;
  });
  return out;
}

function _cevenRegiPreciosATexto(precios){
  precios = precios || {};
  return Object.keys(precios).map(function(k){ return k + ',' + precios[k]; }).join('\n');
}

function cevenOpenRegi(){
  if(cevenMyRole() === 'lector'){ alert('No tenés permiso para gestionar códigos REGI.'); return; }
  var m = document.getElementById('ceven-regi-modal');
  if(!m) return;
  var wasOpen = m.style.display === 'flex';
  m.style.display = 'flex';
  var e = document.getElementById('ceven-regi-codigo-err'); if(e) e.style.display = 'none';
  if(window.cevenNav && !wasOpen) cevenNav.openOverlay(cevenCloseRegi);
  _cevenRegiPintarClienteDatalist();
  cevenRenderRegiCodigos().then(cevenRenderRegiPendientes);
}
function cevenCloseRegi(){
  var m = document.getElementById('ceven-regi-modal');
  if(m) m.style.display = 'none';
  if(window.cevenNav) cevenNav.notifyClosed(cevenCloseRegi);
}

function _cevenRegiPintarClienteDatalist(){
  var dl = document.getElementById('crg-cliente-datalist');
  if(!dl || typeof cevenClientesDbListar !== 'function') return;
  cevenClientesDbListar().then(function(rows){
    dl.innerHTML = rows.map(function(r){ return '<option value="' + cevenEsc(r.nombre) + '">'; }).join('');
  });
}

/* ── Códigos cargados ─────────────────────────────────────────────────── */

function cevenRenderRegiCodigos(){
  var box = document.getElementById('ceven-regi-codigos-list');
  if(!box) return Promise.resolve();
  cevenBindRegiCodigosList(box);
  box.innerHTML = '<div style="font-size:13px;color:#6e6e73;padding:8px 4px">Cargando…</div>';
  var url = _cevenRegiRest('regi_codigos')
    + '?select=id,codigo,cliente_id,proyecto,vigente_desde,vigente_hasta,precios,notas,clientes(nombre)'
    + '&order=created_at.desc&limit=200';
  return cevenAuthedFetch(url, {method: 'GET'}).then(function(rows){
    _cevenRegiCodigosCache = Array.isArray(rows) ? rows : [];
    var esc = cevenEsc, html = '';
    _cevenRegiCodigosCache.forEach(function(r){
      var nCli = (r.clientes && r.clientes.nombre) || '—';
      var vig = [];
      if(r.vigente_desde) vig.push('desde ' + r.vigente_desde);
      if(r.vigente_hasta) vig.push('hasta ' + r.vigente_hasta);
      var nSkus = r.precios ? Object.keys(r.precios).length : 0;
      html += '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 4px;border-bottom:0.5px solid #f0f0f0">'
        + '<span><span style="font-size:13px;color:#1d1d1f">' + esc(r.codigo) + '</span>'
        + '<div style="font-size:11px;color:#6e6e73">' + esc(nCli) + (r.proyecto ? ' · ' + esc(r.proyecto) : '')
          + (vig.length ? ' · ' + esc(vig.join(' ')) : '') + ' · ' + nSkus + ' SKU' + (nSkus === 1 ? '' : 's') + '</div></span>'
        + '<span style="white-space:nowrap"><button type="button" data-act="editar" data-id="' + r.id + '" style="border:0.5px solid #0071e3;border-radius:6px;padding:3px 9px;font-size:12px;cursor:pointer;color:#0071e3;background:none;font-family:inherit">Editar</button></span>'
        + '</div>';
    });
    box.innerHTML = html || '<div style="font-size:13px;color:#6e6e73;padding:8px 4px">Todavía no hay códigos REGI cargados.</div>';
  }).catch(function(){
    _cevenRegiCodigosCache = [];
    box.innerHTML = '<div style="font-size:13px;color:#d70015;padding:8px 4px">No se pudo cargar la lista.</div>';
  });
}

function cevenBindRegiCodigosList(box){
  if(box._bound) return;
  box._bound = true;
  box.addEventListener('click', function(ev){
    var b = ev.target.closest ? ev.target.closest('[data-act]') : null;
    if(!b || b.getAttribute('data-act') !== 'editar') return;
    _cevenRegiEditar(b.getAttribute('data-id'));
  });
}

function _cevenRegiEditar(id){
  var r = _cevenRegiCodigosCache.filter(function(x){ return String(x.id) === String(id); })[0];
  if(!r) return;
  document.getElementById('crg-id').value = r.id;
  document.getElementById('crg-cliente').value = (r.clientes && r.clientes.nombre) || '';
  document.getElementById('crg-codigo').value = r.codigo || '';
  document.getElementById('crg-proyecto').value = r.proyecto || '';
  document.getElementById('crg-desde').value = r.vigente_desde || '';
  document.getElementById('crg-hasta').value = r.vigente_hasta || '';
  document.getElementById('crg-notas').value = r.notas || '';
  document.getElementById('crg-precios').value = _cevenRegiPreciosATexto(r.precios);
  var btn = document.getElementById('crg-submit');
  if(btn) btn.textContent = 'Guardar cambios';
  var cancelar = document.getElementById('crg-cancelar');
  if(cancelar) cancelar.style.display = '';
  var campoCodigo = document.getElementById('crg-codigo');
  if(campoCodigo && campoCodigo.scrollIntoView) campoCodigo.scrollIntoView({block: 'center'});
}

function cevenCancelarEdicionRegiCodigo(){
  ['crg-id', 'crg-cliente', 'crg-codigo', 'crg-proyecto', 'crg-desde', 'crg-hasta', 'crg-notas', 'crg-precios'].forEach(function(id){
    var el = document.getElementById(id); if(el) el.value = '';
  });
  var btn = document.getElementById('crg-submit');
  if(btn) btn.textContent = 'Guardar';
  var cancelar = document.getElementById('crg-cancelar');
  if(cancelar) cancelar.style.display = 'none';
  var err = document.getElementById('ceven-regi-codigo-err');
  if(err) err.style.display = 'none';
}

function cevenGuardarRegiCodigo(ev){
  if(ev) ev.preventDefault();
  var id = document.getElementById('crg-id').value || '';
  var nombreCliente = (document.getElementById('crg-cliente').value || '').trim();
  var codigo = (document.getElementById('crg-codigo').value || '').trim();
  var proyecto = (document.getElementById('crg-proyecto').value || '').trim();
  var desde = document.getElementById('crg-desde').value || '';
  var hasta = document.getElementById('crg-hasta').value || '';
  var notas = (document.getElementById('crg-notas').value || '').trim();
  var precios = _cevenRegiParsearPrecios(document.getElementById('crg-precios').value);
  var err = document.getElementById('ceven-regi-codigo-err');
  function fail(msg){ if(err){ err.textContent = msg; err.style.display = 'block'; } }
  if(err) err.style.display = 'none';

  if(!nombreCliente){ fail('Cargá el cliente.'); return false; }
  if(!codigo){ fail('Cargá el código REGI.'); return false; }
  if(!Object.keys(precios).length){ fail('Cargá al menos un SKU con precio (una línea "SKU,precio" por producto).'); return false; }

  cevenClienteDbResolver(nombreCliente).then(function(cliente){
    if(!cliente){ fail('No se pudo resolver el cliente — probá de nuevo.'); return; }
    var body = {
      cliente_id: cliente.id, codigo: codigo, proyecto: proyecto || null,
      vigente_desde: desde || null, vigente_hasta: hasta || null,
      precios: precios, notas: notas || null,
    };
    var url = _cevenRegiRest('regi_codigos');
    var method = 'POST';
    if(id){ url += '?id=eq.' + encodeURIComponent(id); method = 'PATCH'; }
    else body.created_by = cevenSessionUser();
    cevenAuthedFetch(url, {method: method, body: JSON.stringify(body)}).then(function(){
      cevenCancelarEdicionRegiCodigo();
      cevenRenderRegiCodigos().then(cevenRenderRegiPendientes);
    }).catch(function(e){
      fail((e && e.message) || 'No se pudo guardar el código REGI.');
    });
  });
  return false;
}

/* ── Solicitudes pendientes ───────────────────────────────────────────── */

function cevenRenderRegiPendientes(){
  var box = document.getElementById('ceven-regi-pend-list');
  if(!box) return;
  cevenBindRegiPendientesList(box);
  box.innerHTML = '<div style="font-size:13px;color:#6e6e73;padding:8px 4px">Cargando…</div>';
  var url = _cevenRegiRest('regi_solicitudes')
    + '?select=id,codigo,ejecutivo_nombre,created_at,portal_clientes(cliente_id,clientes(nombre))'
    + '&estado=eq.pendiente&order=created_at.desc&limit=100';
  cevenAuthedFetch(url, {method: 'GET'}).then(function(rows){
    var lista = Array.isArray(rows) ? rows : [];
    var esc = cevenEsc, html = '';
    lista.forEach(function(s){
      var pc = s.portal_clientes || {};
      var nombreCli = (pc.clientes && pc.clientes.nombre) || '—';
      var candidatos = _cevenRegiCodigosCache.filter(function(c){ return String(c.cliente_id) === String(pc.cliente_id); });
      var fecha = s.created_at ? new Date(s.created_at).toLocaleString('es-AR') : '';
      var selectHTML = candidatos.length
        ? '<select data-role="regi-select" style="font-size:12px;padding:3px 6px;margin-right:6px;background:#fff">'
            + candidatos.map(function(c){ return '<option value="' + c.id + '">' + esc(c.codigo) + '</option>'; }).join('')
          + '</select>'
        : '<span style="font-size:11px;color:#d70015;margin-right:6px">Cargá el código en "Códigos cargados" primero</span>';
      html += '<div data-solicitud-id="' + s.id + '" style="padding:8px 4px;border-bottom:0.5px solid #f0f0f0">'
        + '<div style="font-size:13px;color:#1d1d1f">' + esc(nombreCli) + ' pidió "' + esc(s.codigo) + '"</div>'
        + '<div style="font-size:11px;color:#6e6e73;margin-bottom:6px">Ejecutivo: ' + esc(s.ejecutivo_nombre) + ' · ' + esc(fecha) + '</div>'
        + '<div>' + selectHTML
          + (candidatos.length ? '<button type="button" data-act="aprobar" data-id="' + s.id + '" style="border:0.5px solid #0f7a35;border-radius:6px;padding:3px 9px;font-size:12px;cursor:pointer;color:#0f7a35;background:none;font-family:inherit;margin-right:6px">Aprobar</button>' : '')
          + '<button type="button" data-act="rechazar" data-id="' + s.id + '" style="border:0.5px solid #d70015;border-radius:6px;padding:3px 9px;font-size:12px;cursor:pointer;color:#d70015;background:none;font-family:inherit">Rechazar</button>'
        + '</div></div>';
    });
    box.innerHTML = html || '<div style="font-size:13px;color:#6e6e73;padding:8px 4px">No hay solicitudes pendientes.</div>';
  }).catch(function(){
    box.innerHTML = '<div style="font-size:13px;color:#d70015;padding:8px 4px">No se pudo cargar la lista.</div>';
  });
}

function cevenBindRegiPendientesList(box){
  if(box._bound) return;
  box._bound = true;
  box.addEventListener('click', function(ev){
    var b = ev.target.closest ? ev.target.closest('[data-act]') : null;
    if(!b) return;
    var id = b.getAttribute('data-id');
    var act = b.getAttribute('data-act');
    var wrap = b.closest('[data-solicitud-id]');

    if(act === 'aprobar'){
      var sel = wrap ? wrap.querySelector('[data-role="regi-select"]') : null;
      var regiCodigoId = sel ? sel.value : '';
      if(!regiCodigoId){ alert('Elegí a qué código REGI corresponde.'); return; }
      cevenAuthedFetch(_cevenRegiRest('regi_solicitudes') + '?id=eq.' + encodeURIComponent(id), {
        method: 'PATCH',
        body: JSON.stringify({
          estado: 'aprobado', regi_codigo_id: Number(regiCodigoId),
          resuelto_por: cevenSessionUser(), resuelto_at: new Date().toISOString(),
        }),
      }).then(function(){ cevenRenderRegiPendientes(); })
        .catch(function(e){ alert((e && e.message) || 'No se pudo aprobar la solicitud.'); });
    } else if(act === 'rechazar'){
      var motivo = prompt('Motivo del rechazo (opcional, lo ve el cliente):') || null;
      cevenAuthedFetch(_cevenRegiRest('regi_solicitudes') + '?id=eq.' + encodeURIComponent(id), {
        method: 'PATCH',
        body: JSON.stringify({
          estado: 'rechazado', motivo_rechazo: motivo,
          resuelto_por: cevenSessionUser(), resuelto_at: new Date().toISOString(),
        }),
      }).then(function(){ cevenRenderRegiPendientes(); })
        .catch(function(e){ alert((e && e.message) || 'No se pudo rechazar la solicitud.'); });
    }
  });
}
