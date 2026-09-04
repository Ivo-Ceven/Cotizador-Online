/* ============================================================
   PORTAL · logo.js
   ------------------------------------------------------------
   El logo del cliente-canal, para el PDF que le manda a su
   cliente final (junto con el de Ceven, siempre presente — ver
   pdf.js). Vive en el bucket privado `portal-logos`, path
   "<portal_client_id>/logo.<ext>" — NO en app_settings/clogo
   como el logo de los cotizadores internos, que se descarga
   completo cada 15s por cada sesión de staff abierta; sumarle
   un logo por cliente-canal ahí agravaría ese problema latente.

   Depende de: session.js (cevenPortalClaims, cevenPortalGetSession),
   shared/notify.js.
   ============================================================ */

var _portalLogoObjectUrl = null;   // el último blob: URL creado, para poder revocarlo

function _portalLogoCarpeta(){
  var claims = cevenPortalClaims();
  return (claims && claims.portal_client_id) || null;
}

function _portalLogoListar(){
  var carpeta = _portalLogoCarpeta();
  if(!carpeta) return Promise.resolve(null);
  return cevenAuthedFetch(SUPABASE_URL + '/storage/v1/object/list/portal-logos', {
    method: 'POST',
    body: JSON.stringify({prefix: carpeta + '/', limit: 5, sortBy: {column: 'created_at', order: 'desc'}})
  }).then(function(rows){
    return (Array.isArray(rows) && rows[0]) ? (carpeta + '/' + rows[0].name) : null;
  }).catch(function(){ return null; });
}

/* El objeto es privado: verlo requiere el token, así que no se puede poner
   directo en un <img src>. Se baja como blob y se arma un object URL. */
function _portalLogoUrl(path){
  var sess = cevenPortalGetSession();
  if(!sess || !path) return Promise.resolve(null);
  return fetch(SUPABASE_URL + '/storage/v1/object/portal-logos/' + path, {
    headers: {'apikey': SUPABASE_ANON_KEY, 'Authorization': 'Bearer ' + sess.access_token}
  }).then(function(r){ return r.ok ? r.blob() : null; })
    .then(function(blob){ return blob ? URL.createObjectURL(blob) : null; })
    .catch(function(){ return null; });
}

function _portalLogoRefrescarPreview(){
  var img = document.getElementById('plogo-preview');
  if(!img) return;
  _portalLogoListar().then(function(path){
    if(!path){ img.style.display = 'none'; return; }
    return _portalLogoUrl(path).then(function(url){
      if(!url) return;
      if(_portalLogoObjectUrl) URL.revokeObjectURL(_portalLogoObjectUrl);
      _portalLogoObjectUrl = url;
      img.src = url;
      img.style.display = '';
    });
  });
}

function _portalLogoSubir(file){
  if(!file) return;
  if(!/^image\/(png|jpeg|webp|svg\+xml)$/.test(file.type)){
    showToast('El logo tiene que ser PNG, JPG, WEBP o SVG.');
    return;
  }
  if(file.size > 2 * 1024 * 1024){
    showToast('El logo no puede pesar más de 2 MB.');
    return;
  }
  var carpeta = _portalLogoCarpeta();
  if(!carpeta){ showToast('No se pudo identificar la cuenta.'); return; }
  var ext = (file.type.split('/')[1] || 'png').replace('svg+xml', 'svg');
  var path = carpeta + '/logo.' + ext;

  var sess = cevenPortalGetSession();
  fetch(SUPABASE_URL + '/storage/v1/object/portal-logos/' + path, {
    method: 'POST',
    headers: {'apikey': SUPABASE_ANON_KEY, 'Authorization': 'Bearer ' + sess.access_token, 'Content-Type': file.type, 'x-upsert': 'true'},
    body: file
  }).then(function(r){
    if(!r.ok) return r.json().then(function(j){ return Promise.reject(j); }, function(){ return Promise.reject({}); });
    showToast('✓ Logo actualizado.');
    _portalLogoRefrescarPreview();
  }).catch(function(err){
    showError((err && err.message) || 'No se pudo subir el logo.');
  });
}

function _portalLogoBind(){
  var input = document.getElementById('plogo-input');
  if(input) input.addEventListener('change', function(){
    if(input.files && input.files[0]) _portalLogoSubir(input.files[0]);
  });
}
