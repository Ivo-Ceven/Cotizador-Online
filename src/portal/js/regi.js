/* ============================================================
   PORTAL · regi.js
   ------------------------------------------------------------
   REGI = Deal Registration de Poly. El cliente-canal carga un
   código + elige su ejecutivo Ceven y pide aprobación. Si matchea
   con un regi_codigos que Ceven cargó para ESTE cliente (y sigue
   vigente), se aprueba solo; si no, queda pendiente para revisión
   manual. Un rechazo previo se muestra tal cual la próxima vez que
   se pide el mismo código (sin generar otro pendiente), salvo que
   Ceven haya cargado el código después — ahí un match nuevo gana.

   Todo pasa por dos funciones SQL security definer
   (portal_equipo_ceven, portal_regi_solicitar) — no por una Edge
   Function nueva, ver supabase/migrations/20260821120000_regi_
   deal_registration.sql y 20260821121500_regi_solicitar_informa_
   rechazo_previo.sql.

   Exclusivo de Poly: la tarjeta se muestra/oculta según _portalMarca
   en _portalElegirMarca() (catalog.js). El estado se resetea cada
   vez que se cambia de marca — "por cotización", no persiste entre
   pedidos (ver plan de diseño): volver a pedirlo re-evalúa siempre
   fresco, un aprobado viejo no se asume vigente sin volver a pedirlo.

   Depende de: state.js (_portalMarca, _portalRegi), session.js
   (cevenAuthedFetch), shared/safe.js (cevenEsc), shared/notify.js
   (showToast), catalog.js (_portalCatCargar, para recargar precios
   al aprobar).
   ============================================================ */

var _portalRegiEjecutivos = [];

function _portalRegiReset(){
  _portalRegi = null;
  var codigo = document.getElementById('pregi-codigo');
  var estado = document.getElementById('pregi-estado');
  if(codigo) codigo.value = '';
  if(estado){ estado.textContent = ''; estado.style.color = ''; }
  _portalRegiPintarResumenEmitir();
}

function _portalRegiMostrar(){
  var box = document.getElementById('pregi-box');
  if(!box) return;
  box.style.display = (_portalMarca === 'poly') ? '' : 'none';
  if(_portalMarca === 'poly' && !_portalRegiEjecutivos.length) _portalRegiCargarEjecutivos();
}

function _portalRegiCargarEjecutivos(){
  cevenAuthedFetch(SUPABASE_URL + '/rest/v1/rpc/portal_equipo_ceven', {
    method: 'POST',
    body: JSON.stringify({})
  }).then(function(lista){
    _portalRegiEjecutivos = Array.isArray(lista) ? lista : [];
    var sel = document.getElementById('pregi-ejecutivo');
    if(!sel) return;
    sel.innerHTML = '<option value="">Elegí uno…</option>' + _portalRegiEjecutivos.map(function(e){
      return '<option value="' + cevenEsc(e.email) + '">' + cevenEsc(e.nombre) + '</option>';
    }).join('');
  }).catch(function(){
    /* Deja el select con el placeholder — no bloquea el resto del portal. */
  });
}

function _portalRegiSolicitar(){
  var codigoEl = document.getElementById('pregi-codigo');
  var ejecEl = document.getElementById('pregi-ejecutivo');
  var codigo = codigoEl ? codigoEl.value.trim() : '';
  var ejecutivo = ejecEl ? ejecEl.value : '';
  if(!codigo){ showToast('Ingresá el código REGI.'); return; }
  if(!ejecutivo){ showToast('Elegí a tu ejecutivo Ceven.'); return; }

  var btn = document.getElementById('pregi-solicitar');
  if(btn){ btn.disabled = true; btn.textContent = 'Consultando…'; }

  cevenAuthedFetch(SUPABASE_URL + '/rest/v1/rpc/portal_regi_solicitar', {
    method: 'POST',
    body: JSON.stringify({p_codigo: codigo, p_ejecutivo_email: ejecutivo})
  }).then(function(r){
    if(!r || !r.estado){ showToast('No se pudo procesar la solicitud.'); return; }
    _portalRegi = {id: r.id, codigo: codigo, estado: r.estado, ejecutivo: ejecutivo};
    _portalRegiPintarEstado(r);
    if(r.estado === 'aprobado') _portalCatCargar();
  }).catch(function(err){
    showToast((err && err.message) || 'No se pudo procesar la solicitud.');
  }).then(function(){
    if(btn){ btn.disabled = false; btn.textContent = 'Solicitar aprobación'; }
  });
}

function _portalRegiPintarEstado(r){
  var estadoEl = document.getElementById('pregi-estado');
  if(!estadoEl) return;
  if(r.estado === 'aprobado'){
    var cubre = (r.skusCubiertos != null)
      ? (' — se aplicó a ' + r.skusCubiertos + ' producto' + (r.skusCubiertos === 1 ? '' : 's'))
      : '';
    estadoEl.textContent = '✓ REGI aprobado' + cubre;
    estadoEl.style.color = 'var(--cgreen, #16a34a)';
  } else if(r.estado === 'rechazado'){
    estadoEl.textContent = '✗ ' + (r.mensaje || 'Este código fue rechazado por Ceven.');
    estadoEl.style.color = 'var(--cred)';
  } else {
    estadoEl.textContent = '⏳ ' + (r.mensaje || 'Pendiente de revisión de Ceven — seguís cotizando con tu nivel normal mientras tanto.');
    estadoEl.style.color = '';
  }
  _portalRegiPintarResumenEmitir();
}

function _portalRegiPintarResumenEmitir(){
  var resumen = document.getElementById('pregi-resumen-emitir');
  if(!resumen) return;
  if(_portalRegi && _portalRegi.estado === 'aprobado'){
    var ejec = _portalRegiEjecutivos.filter(function(e){ return e.email === _portalRegi.ejecutivo; })[0];
    resumen.textContent = 'Se va a emitir con ejecutivo ' + (ejec ? ejec.nombre : _portalRegi.ejecutivo) + ' · REGI ' + _portalRegi.codigo;
    resumen.style.display = '';
  } else {
    resumen.style.display = 'none';
  }
}

// El id de la solicitud aprobada vigente, o null — lo consumen
// catalog.js (para pedir el catálogo con precios REGI) y emitir.js
// (para que portal-emitir aplique esos mismos precios al emitir).
function _portalRegiSolicitudIdSiAprobado(){
  return (_portalRegi && _portalRegi.estado === 'aprobado') ? _portalRegi.id : null;
}

function _portalRegiBind(){
  var btn = document.getElementById('pregi-solicitar');
  if(btn) btn.addEventListener('click', _portalRegiSolicitar);
}
