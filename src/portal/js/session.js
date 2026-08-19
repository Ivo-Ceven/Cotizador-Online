/* ============================================================
   PORTAL · session.js
   ------------------------------------------------------------
   Sesión GoTrue del portal: login, refresh, decodificación de
   JWT. Es una copia adaptada de shared/auth.js, NO ese archivo —
   auth.js trae de más (roles de staff, gestión de usuarios,
   `@ceven.com`) y, lo que importa más acá, usa la MISMA clave de
   localStorage que el shell/cotizadores internos
   (CEVEN_SESSION_KEY = 'ceven_auth_session'). Todo vive en el
   mismo origin (cotizadores-ceven.vercel.app), así que reusar esa
   clave pisaría la sesión de un vendedor que tuviera las dos
   pestañas abiertas. Acá se usa una clave propia.

   La única función que SE LLAMA IGUAL que en auth.js es
   `cevenAuthedFetch` — a propósito: shared/asistente.js la invoca
   por nombre sin importar de dónde salió, y así se reusa ese
   módulo sin tocarle una línea.

   Depende de: shared/config.js (SUPABASE_URL/ANON_KEY), shared/
   safe.js (nada obligatorio, pero conviene cargarlo antes).
   ============================================================ */

var CEVEN_PORTAL_SESSION_KEY = 'ceven_portal_auth_session';

var _cevenPortalClaims = { token: null, payload: null };
var _cevenPortalRefreshing = null;
var _cevenPortalRefreshTimer = null;

function cevenPortalGetSession(){
  try{
    var raw = localStorage.getItem(CEVEN_PORTAL_SESSION_KEY) || sessionStorage.getItem(CEVEN_PORTAL_SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  }catch(e){ return null; }
}
function cevenPortalSaveSession(sess, remember){
  var store = remember ? localStorage : sessionStorage;
  var other = remember ? sessionStorage : localStorage;
  try{ store.setItem(CEVEN_PORTAL_SESSION_KEY, JSON.stringify(sess)); other.removeItem(CEVEN_PORTAL_SESSION_KEY); }catch(e){}
}
function cevenPortalClearSession(){
  try{ localStorage.removeItem(CEVEN_PORTAL_SESSION_KEY); sessionStorage.removeItem(CEVEN_PORTAL_SESSION_KEY); }catch(e){}
  _cevenPortalClaims.token = null; _cevenPortalClaims.payload = null;
}

/* Mismo decoder que auth.js (sin librerías): el JWT es
   "header.payload.signature" en base64url, y atob() devuelve bytes, no texto
   UTF-8 — sin el paso por %XX un nombre como "Martín" vuelve roto. */
function cevenPortalB64UrlDecode(seg){
  var s = String(seg).replace(/-/g, '+').replace(/_/g, '/');
  while(s.length % 4 !== 0) s += '=';
  var bytes;
  try{ bytes = atob(s); }catch(e){ return null; }
  var pct = '', hex, i;
  for(i = 0; i < bytes.length; i++){
    hex = bytes.charCodeAt(i).toString(16);
    pct += '%' + (hex.length === 1 ? '0' + hex : hex);
  }
  try{ return decodeURIComponent(pct); }catch(e){ return null; }
}
function cevenPortalDecodeJWT(token){
  if(typeof token !== 'string') return null;
  var parts = token.split('.');
  if(parts.length !== 3) return null;
  var json = cevenPortalB64UrlDecode(parts[1]);
  if(json === null) return null;
  var payload;
  try{ payload = JSON.parse(json); }catch(e){ return null; }
  if(!payload || typeof payload !== 'object') return null;
  if(typeof payload.exp !== 'number' || !isFinite(payload.exp)) return null;
  if(typeof payload.sub !== 'string' || !payload.sub) return null;
  return payload;
}
function cevenPortalClaims(){
  var s = cevenPortalGetSession();
  var tok = (s && typeof s.access_token === 'string' && s.access_token) ? s.access_token : null;
  if(!tok){ _cevenPortalClaims.token = null; _cevenPortalClaims.payload = null; return null; }
  if(_cevenPortalClaims.token !== tok){
    _cevenPortalClaims.token = tok;
    _cevenPortalClaims.payload = cevenPortalDecodeJWT(tok);
  }
  return _cevenPortalClaims.payload;
}
function cevenPortalSessionExpiresAt(){
  var c = cevenPortalClaims();
  return (c && typeof c.exp === 'number') ? c.exp * 1000 : 0;
}
function cevenPortalIsValidSession(){
  var exp = cevenPortalSessionExpiresAt();
  return exp > 0 && Date.now() < exp;
}
/* La barrera real la pone RLS/las Edge Functions — esto es solo para no
   mostrarle la app a alguien logueado con una cuenta que no es de portal
   (ej. si alguien pegara por error credenciales de staff acá). */
function cevenPortalEsCliente(){
  var c = cevenPortalClaims();
  return !!(c && typeof c.portal_client_id === 'string' && c.portal_client_id);
}
function cevenPortalEmail(){
  var c = cevenPortalClaims();
  return (c && typeof c.email === 'string') ? c.email : '';
}

function cevenPortalLogin(email, password, remember){
  return fetch(SUPABASE_URL + '/auth/v1/token?grant_type=password', {
    method: 'POST',
    headers: {'apikey': SUPABASE_ANON_KEY, 'Content-Type': 'application/json'},
    body: JSON.stringify({email: email, password: password})
  })
  .then(function(r){ return r.json().then(function(j){ return {ok: r.ok, body: j}; }, function(){ return {ok: false, body: {}}; }); })
  .then(function(res){
    if(!res.ok) return Promise.reject(cevenPortalAuthErrorMsg(res.body));
    cevenPortalSaveSession({access_token: res.body.access_token, refresh_token: res.body.refresh_token}, !!remember);
    if(!cevenPortalIsValidSession()){
      cevenPortalClearSession();
      return Promise.reject('La respuesta del servidor no trajo una sesión válida. Probá de nuevo.');
    }
    if(!cevenPortalEsCliente()){
      cevenPortalClearSession();
      return Promise.reject('Esta cuenta no tiene acceso al portal de clientes.');
    }
    cevenPortalScheduleRefresh();
    return true;
  });
}

function cevenPortalAuthErrorMsg(body){
  var code = (body && (body.error_code || body.code || body.error || '')).toString().toLowerCase();
  var desc = (body && (body.msg || body.error_description || body.message || '')).toString();
  if(code.indexOf('invalid_credentials') >= 0 || desc.indexOf('Invalid login credentials') >= 0) return 'Usuario o contraseña incorrectos.';
  if(code.indexOf('too_many_requests') >= 0 || code.indexOf('rate_limit') >= 0) return 'Demasiados intentos. Esperá un momento y volvé a intentar.';
  return desc || 'No se pudo iniciar sesión.';
}

function cevenPortalCancelRefresh(){ if(_cevenPortalRefreshTimer){ clearTimeout(_cevenPortalRefreshTimer); _cevenPortalRefreshTimer = null; } }
function cevenPortalScheduleRefresh(){
  cevenPortalCancelRefresh();
  var exp = cevenPortalSessionExpiresAt();
  if(!exp) return;
  var delay = Math.max(exp - Date.now() - 60000, 5000);
  _cevenPortalRefreshTimer = setTimeout(cevenPortalRefreshToken, delay);
}
function cevenPortalRefreshToken(){
  if(_cevenPortalRefreshing) return _cevenPortalRefreshing;
  var sess = cevenPortalGetSession();
  if(!sess || !sess.refresh_token) return Promise.resolve(null);
  var remember = !!localStorage.getItem(CEVEN_PORTAL_SESSION_KEY);
  var p = fetch(SUPABASE_URL + '/auth/v1/token?grant_type=refresh_token', {
    method: 'POST',
    headers: {'apikey': SUPABASE_ANON_KEY, 'Content-Type': 'application/json'},
    body: JSON.stringify({refresh_token: sess.refresh_token})
  })
  .then(function(r){ return r.json().then(function(j){ return {ok: r.ok, body: j}; }, function(){ return {ok: false, body: {}}; }); })
  .then(function(res){
    if(!res.ok){
      // Solo se fuerza logout si el SERVIDOR contestó que el refresh_token
      // está muerto — no ante un simple corte de red, que se reintenta solo.
      if(res.body && (res.body.error_code || res.body.msg)) cevenPortalForceLogout();
      return null;
    }
    cevenPortalSaveSession({access_token: res.body.access_token, refresh_token: res.body.refresh_token}, remember);
    cevenPortalScheduleRefresh();
    return res.body.access_token;
  })
  .catch(function(){ return null; });
  _cevenPortalRefreshing = p.then(function(token){ _cevenPortalRefreshing = null; return token; });
  return _cevenPortalRefreshing;
}
function cevenPortalForceLogout(){
  cevenPortalCancelRefresh();
  cevenPortalClearSession();
  alert('Tu sesión expiró. Volvé a iniciar sesión.');
  location.reload();
}
function cevenPortalLogout(){
  var sess = cevenPortalGetSession();
  cevenPortalCancelRefresh();
  cevenPortalClearSession();
  if(sess && sess.access_token){
    fetch(SUPABASE_URL + '/auth/v1/logout', {
      method: 'POST',
      headers: {'apikey': SUPABASE_ANON_KEY, 'Authorization': 'Bearer ' + sess.access_token}
    }).catch(function(){});
  }
  location.reload();
}

/* El nombre es a propósito el mismo que en shared/auth.js — ver el
   comentario de cabecera. Mismo contrato: resuelve con el body ya
   parseado en 2xx, rechaza con el body de error en 4xx/5xx, reintenta
   una vez tras refrescar el token si la primera vino con 401. */
function cevenAuthedFetch(url, opts){
  var sess = cevenPortalGetSession();
  if(!sess || !sess.access_token) return Promise.reject({message: 'No hay sesión activa.'});
  function call(token){
    var headers = Object.assign({'apikey': SUPABASE_ANON_KEY, 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json'}, (opts && opts.headers) || {});
    return fetch(url, Object.assign({}, opts, {headers: headers}))
      .then(function(r){ return r.json().then(function(j){ return {status: r.status, body: j}; }).catch(function(){ return {status: r.status, body: {}}; }); });
  }
  return call(sess.access_token).then(function(res){
    if(res.status !== 401){
      if(res.status >= 400) return Promise.reject(res.body);
      return res.body;
    }
    return cevenPortalRefreshToken().then(function(token){
      if(!token) return Promise.reject(res.body);
      return call(token).then(function(r2){
        if(r2.status >= 400) return Promise.reject(r2.body);
        return r2.body;
      });
    });
  });
}

document.addEventListener('visibilitychange', function(){
  if(document.visibilityState === 'visible' && cevenPortalIsValidSession()){
    if(cevenPortalSessionExpiresAt() - Date.now() < 60000) cevenPortalRefreshToken();
    else cevenPortalScheduleRefresh();
  }
});
