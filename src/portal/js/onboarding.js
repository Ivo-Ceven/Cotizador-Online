/* ============================================================
   PORTAL · onboarding.js
   ------------------------------------------------------------
   El perfil que el cliente-canal completa una única vez al
   entrar por primera vez (razón social, CUIT, contacto, markup
   default). Vive en `portal_perfiles`, separada de
   `portal_clientes` a propósito (ver la migración): así ninguna
   policy de UPDATE puede terminar dejándolo tocar su propio
   status o a qué `clientes.id` está atado.

   Depende de: state.js, session.js (cevenAuthedFetch,
   cevenPortalClaims), shared/notify.js.
   ============================================================ */

var CEVEN_PERFIL_REST = function(){ return SUPABASE_URL + '/rest/v1/portal_perfiles'; };

/* Se llama al arrancar la app, con sesión ya válida. Devuelve una promesa que
   resuelve cuando el perfil está listo para usarse (completo o no): quien
   llama decide si mostrar el onboarding o seguir directo a la app. */
function _portalPerfilCargar(){
  return cevenAuthedFetch(CEVEN_PERFIL_REST() + '?select=*', {method: 'GET'})
    .then(function(rows){
      _portalPerfil = (Array.isArray(rows) && rows[0]) ? rows[0] : null;
      return _portalPerfil;
    })
    .catch(function(){ _portalPerfil = null; return null; });
}

function _portalOnboardingNecesario(){
  return !_portalPerfil || !_portalPerfil.perfil_completo;
}

function _portalOnboardingMostrar(){
  var pg = document.getElementById('pg-onboarding');
  if(!pg) return;
  if(_portalPerfil){
    ['razon_social', 'cuit', 'domicilio', 'telefono', 'contacto'].forEach(function(campo){
      var el = document.getElementById('pob-' + campo.replace(/_/g, '-'));
      if(el) el.value = _portalPerfil[campo] || '';
    });
    var markup = document.getElementById('pob-markup');
    if(markup) markup.value = (_portalPerfil.markup_default_pct != null) ? _portalPerfil.markup_default_pct : '';
  }
  pg.style.display = '';
}

function _portalOnboardingGuardar(){
  var claims = cevenPortalClaims();
  var portalClientId = claims && claims.portal_client_id;
  if(!portalClientId){ showToast('No se pudo identificar la cuenta. Volvé a entrar.'); return; }

  var razonSocial = (document.getElementById('pob-razon-social').value || '').trim();
  if(!razonSocial){ showToast('Cargá la razón social.'); return; }
  var markupRaw = (document.getElementById('pob-markup').value || '').trim();
  var markup = markupRaw === '' ? 0 : Number(markupRaw);
  if(isNaN(markup) || markup < 0 || markup > 500){ showToast('El margen por defecto tiene que ser un número entre 0 y 500.'); return; }

  var body = {
    portal_client_id: portalClientId,
    razon_social: razonSocial,
    cuit: (document.getElementById('pob-cuit').value || '').trim() || null,
    domicilio: (document.getElementById('pob-domicilio').value || '').trim() || null,
    telefono: (document.getElementById('pob-telefono').value || '').trim() || null,
    contacto: (document.getElementById('pob-contacto').value || '').trim() || null,
    markup_default_pct: markup,
    perfil_completo: true
  };

  var btn = document.getElementById('pob-guardar');
  if(btn){ btn.disabled = true; btn.textContent = 'Guardando…'; }

  cevenAuthedFetch(CEVEN_PERFIL_REST() + '?on_conflict=portal_client_id', {
    method: 'POST',
    headers: {'Prefer': 'resolution=merge-duplicates,return=representation'},
    body: JSON.stringify(body)
  }).then(function(rows){
    _portalPerfil = (Array.isArray(rows) && rows[0]) ? rows[0] : body;
    document.getElementById('pg-onboarding').style.display = 'none';
    _portalAppMostrar();
  }).catch(function(err){
    showToast((err && err.message) || 'No se pudo guardar el perfil.');
  }).then(function(){
    if(btn){ btn.disabled = false; btn.textContent = 'Guardar y continuar'; }
  });
}

function _portalOnboardingBind(){
  var btn = document.getElementById('pob-guardar');
  if(btn) btn.addEventListener('click', _portalOnboardingGuardar);
}
