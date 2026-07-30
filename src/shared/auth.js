/* ============================================================
   LOGIN  ·  Ceven Cotizador  ·  Supabase Auth real
   - Autenticación vía REST de GoTrue (sin SDK), mismo patrón que
     usa la capa de sync más abajo en este archivo.
   - Crear/eliminar/blanquear usuarios pasa por la Edge Function
     "admin-users" (usa la service_role key, nunca expuesta acá).
     Solo admin@ceven.com puede invocarla (validado server-side).
   ============================================================ */
function cevenIsValidEmail(u){
  return new RegExp('^[^\\s@]+@' + CEVEN_DOMAIN.replace(/\./g,'\\.') + '$', 'i').test(u);
}

/* ============================================================
   SESIÓN  ·  todo se deriva del JWT, nada de localStorage
   ------------------------------------------------------------
   En localStorage/sessionStorage se guardan SOLO los dos tokens que emitió
   GoTrue. El email, el nombre, el rol y el vencimiento salen de los claims
   del access_token, que está firmado por Supabase.

   Antes no era así: el rol y expires_at se guardaban como campos sueltos del
   objeto de sesión, o sea que este bloque alcanzaba para volverse admin:

     localStorage.ceven_auth_session = JSON.stringify({
       access_token:'x', expires_at: Date.now()+9e9,
       email:'admin@ceven.com', role:'admin' });

   ⚠ ESTO NO ES LA BARRERA REAL, es defensa en profundidad.
   Leer el rol del token sube el costo de la escalada dentro del navegador
   (ya no alcanza con editar un objeto: hay que falsificar un JWT firmado),
   pero NO protege los datos. Mientras las policies RLS sigan siendo
   USING(true) WITH CHECK(true) para ALL en `pipeline`, `app_settings` y
   `todos`, cualquier usuario autenticado —incluido un "lector"— puede leer
   y escribir TODO por REST con su propio token legítimo, sin pasar por esta
   UI ni por estas funciones. Lo único que cierra ese agujero son las
   policies por operación, rol y marca:
   supabase/migrations/20260730120000_rls_por_rol_y_marca.sql
   ============================================================ */
var CEVEN_ROLES = ['admin','ventas','lector'];
/* Claims del token actual (null si no hay sesión o el token no parsea).
   Memoizado por token: cevenMyRole() se llama una vez por fila del pipeline. */
var _cevenClaims = {token: null, payload: null};
function cevenGetSession(){
  try{
    var raw = localStorage.getItem(CEVEN_SESSION_KEY) || sessionStorage.getItem(CEVEN_SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  }catch(e){ return null; }
}
function cevenSaveSession(sess, remember){
  var store = remember ? localStorage : sessionStorage;
  var other = remember ? sessionStorage : localStorage;
  try{ store.setItem(CEVEN_SESSION_KEY, JSON.stringify(sess)); other.removeItem(CEVEN_SESSION_KEY); }catch(e){}
}
/* Solo la sesión. Para el borrado completo de "Salir" ver cevenWipeLocalData(). */
function cevenClearSession(){
  try{ localStorage.removeItem(CEVEN_SESSION_KEY); sessionStorage.removeItem(CEVEN_SESSION_KEY); }catch(e){}
  _cevenClaims.token = null; _cevenClaims.payload = null;
}

/* ---- Lectura del JWT (decoder propio, sin librerías) ----
   El access_token es "header.payload.signature", cada parte en base64url:
   igual que base64 pero con '-' en lugar de '+', '_' en lugar de '/' y sin
   el padding '='. Hay que reponer las dos cosas antes de atob().

   Y atob() devuelve una cadena de BYTES, no texto: el payload es UTF-8, así
   que un nombre como "Martín" vuelve como "MartÃ­n" si no se decodifica.
   Se arma la secuencia %XX byte a byte y se deja que decodeURIComponent
   haga el UTF-8 (escape() está deprecado y no se usa).

   La firma NO se verifica: es imposible en el cliente sin la clave. Lo que
   garantiza este parseo es que rol y vencimiento vienen del token que emitió
   el servidor, no de un campo que cualquiera edita desde la consola. */
function cevenB64UrlDecode(seg){
  var s = String(seg).replace(/-/g, '+').replace(/_/g, '/');
  while(s.length % 4 !== 0) s += '=';
  var bytes;
  try{ bytes = atob(s); }catch(e){ return null; }   /* base64 inválido */
  var pct = '', hex, i;
  for(i = 0; i < bytes.length; i++){
    hex = bytes.charCodeAt(i).toString(16);
    pct += '%' + (hex.length === 1 ? '0' + hex : hex);
  }
  try{ return decodeURIComponent(pct); }catch(e){ return null; }   /* UTF-8 inválido */
}
/* Devuelve el payload del JWT, o null si NO es utilizable. Sin `exp` o sin
   `sub` no hay forma de saber si venció ni de quién es: se trata como token
   inválido y arriba eso equivale a "no hay sesión". */
function cevenDecodeJWT(token){
  if(typeof token !== 'string') return null;
  var parts = token.split('.');
  if(parts.length !== 3) return null;
  var json = cevenB64UrlDecode(parts[1]);
  if(json === null) return null;
  var payload;
  try{ payload = JSON.parse(json); }catch(e){ return null; }
  if(!payload || typeof payload !== 'object') return null;
  if(typeof payload.exp !== 'number' || !isFinite(payload.exp)) return null;
  if(typeof payload.sub !== 'string' || !payload.sub) return null;
  return payload;
}
function cevenClaims(){
  var s = cevenGetSession();
  var tok = (s && typeof s.access_token === 'string' && s.access_token) ? s.access_token : null;
  if(!tok){ _cevenClaims.token = null; _cevenClaims.payload = null; return null; }
  if(_cevenClaims.token !== tok){
    _cevenClaims.token = tok;
    _cevenClaims.payload = cevenDecodeJWT(tok);
  }
  return _cevenClaims.payload;
}
/* OJO: el claim `role` de primer nivel del JWT de Supabase es el rol de
   Postgres ("authenticated"), NO el rol de la app. */
function cevenSessionMeta(){
  var c = cevenClaims();
  return (c && c.user_metadata && typeof c.user_metadata === 'object') ? c.user_metadata : {};
}
function cevenSessionUser(){
  var c = cevenClaims();
  return (c && typeof c.email === 'string' && c.email) ? c.email.toLowerCase() : null;
}
function cevenMyNombre(){
  var n = cevenSessionMeta().nombre;
  return (typeof n === 'string') ? n : '';
}
/* Rol de la app. Dos fuentes, en orden de confianza:

   1. El claim `user_role`, que inyecta el Custom Access Token Hook de la
      migración a partir de la tabla `user_roles`. Esa tabla solo la escribe
      la service_role, así que el claim NO es falsificable por el usuario, y
      es EXACTAMENTE lo que van a evaluar las policies RLS. Mientras el hook
      no esté activado, este claim no existe.

   2. `user_metadata.role`, que es lo que hay hoy. Viene firmado dentro del
      token, pero el propio usuario lo puede cambiar con
      PUT /auth/v1/user {"data":{"role":"admin"}} y volver a pedir un token.
      O sea: sirve para decidir qué botones mostrar, NO para proteger datos.

   Cuando el hook esté activo, (1) gana y la UI pasa a coincidir con lo que
   la base realmente permite. */
function cevenMyRole(){
  if(!cevenIsValidSession()) return 'lector';   /* fail-safe: sin token usable, el rol más restrictivo */
  var c = cevenClaims();
  if(c && CEVEN_ROLES.indexOf(c.user_role) >= 0) return c.user_role;
  if(cevenSessionUser() === CEVEN_ADMIN) return 'admin'; /* bootstrap, por el claim `email` del token */
  var role = cevenSessionMeta().role;
  if(CEVEN_ROLES.indexOf(role) >= 0) return role;
  return 'lector';
}
function cevenIsAdmin(){
  return cevenMyRole() === 'admin';
}
/* Vencimiento REAL (ms epoch), 0 si no hay token usable. Antes se guardaba
   Date.now() + expires_in*1000 al loguear: además de ser un campo que el
   cliente escribe, dependía de que el reloj de la máquina estuviera en hora.
   `exp` lo pone el servidor al firmar. */
function cevenSessionExpiresAt(){
  var c = cevenClaims();
  return c ? c.exp * 1000 : 0;
}
function cevenIsValidSession(){
  var exp = cevenSessionExpiresAt();
  return exp > 0 && Date.now() < exp;
}
function cevenShowApp(){
  var ov = document.getElementById('ceven-login');
  if(ov) ov.style.display = 'none';
  var lbl = document.getElementById('ceven-logout-label');
  if(lbl) lbl.textContent = 'Salir (' + (cevenSessionUser() || '') + ')';
  cevenUpdateAccountBar();
  cevenApplyVendorAutofill();
  /* Aviso para los módulos que NO deben pintar datos del equipo antes del
     login (shared/todos.js). Se dispara también en la carga inicial con
     sesión ya válida; ahí todavía no hay listeners y no hace falta, porque
     esos módulos chequean la sesión ellos mismos al arrancar. */
  try{ window.dispatchEvent(new Event('ceven-session-ready')); }catch(e){}
}
/* La barra (Usuarios / Salir) se ve en la página principal (cotización)
   o en el shell (panel selector de marcas, #brand-panel). */
function cevenUpdateAccountBar(){
  var bar = document.getElementById('ceven-account-bar');
  if(!bar) return;
  var quote = document.getElementById('p-quote');
  var onMain = cevenIsValidSession() &&
    ((quote && quote.classList.contains('on')) || !!document.getElementById('brand-panel'));
  bar.style.display = onMain ? 'flex' : 'none';
  var ubtn = document.getElementById('ceven-users-btn');
  if(ubtn) ubtn.style.display = cevenIsAdmin() ? '' : 'none';
  var pbtn = document.getElementById('btn-add-pipeline');
  if(pbtn) pbtn.style.display = cevenCanUsePipeline() ? '' : 'none';
}

/* ---- Permisos por rol ----
   admin:  sin restricciones.
   ventas: puede ver todo; solo puede MODIFICAR cotizaciones/filas de pipeline
           cuyo campo "Ejecutivo" coincide con su propio nombre (case-insensitive, trim).
   lector: no puede modificar nada YA GUARDADO ni el pipeline; sí puede armar y
           guardar una cotización nueva desde cero. */
function cevenOwnsExecutive(ejecutivo){
  var mine = (cevenMyNombre()||'').trim().toLowerCase();
  var theirs = (ejecutivo||'').trim().toLowerCase();
  return !!mine && mine === theirs;
}
function cevenCanEditQuote(ejecutivo){
  var role = cevenMyRole();
  if(role === 'admin') return true;
  if(role === 'lector') return false;
  return cevenOwnsExecutive(ejecutivo); /* role === 'ventas' */
}
function cevenCanEditPipelineRow(ejecutivo){ return cevenCanEditQuote(ejecutivo); }
function cevenCanUsePipeline(){ return cevenMyRole() !== 'lector'; }

/* ---- Autocompletar + bloquear el campo Vendedor (#exec) ---- */
function cevenEnsureExecOption(sel, name){
  if(!name) return;
  for(var i=0;i<sel.options.length;i++){ if(sel.options[i].value === name) return; }
  var o = document.createElement('option');
  o.value = name; o.textContent = name;
  sel.appendChild(o);
}
function cevenApplyVendorAutofill(){
  var sel = document.getElementById('exec');
  if(!sel) return;
  var nombre = cevenMyNombre();
  if(cevenMyRole() !== 'admin'){
    if(nombre){ cevenEnsureExecOption(sel, nombre); sel.value = nombre; }
    sel.disabled = true;
  } else {
    sel.disabled = false;
  }
}

/* ---- Login / logout ---- */
function cevenAuthErrorMsg(body){
  var code = (body && (body.error_code || body.code || body.error || '')).toString().toLowerCase();
  var desc = (body && (body.msg || body.error_description || body.message || '')).toString();
  if(code.indexOf('invalid_credentials') >= 0 || desc.indexOf('Invalid login credentials') >= 0 || code.indexOf('user_not_found') >= 0){
    return 'Usuario o contraseña incorrectos.';
  }
  if(code.indexOf('email_not_confirmed') >= 0 || desc.indexOf('Email not confirmed') >= 0){
    return 'La cuenta no está confirmada. Contacta al administrador.';
  }
  if(code.indexOf('too_many_requests') >= 0 || code.indexOf('rate_limit') >= 0 || desc.indexOf('rate limit') >= 0){
    return 'Demasiados intentos. Espera un momento y vuelve a intentar.';
  }
  if(desc) return desc;
  return 'No se pudo iniciar sesión. Intenta nuevamente.';
}
function cevenDoLogin(ev){
  if(ev) ev.preventDefault();
  var u = (document.getElementById('ceven-user').value || '').trim().toLowerCase();
  var p = document.getElementById('ceven-pass').value || '';
  var err = document.getElementById('ceven-login-err');
  var remember = document.getElementById('ceven-remember').checked;
  function fail(msg){
    if(err){ err.textContent = msg; err.style.display = 'block'; }
    var pf = document.getElementById('ceven-pass'); if(pf){ pf.value=''; pf.focus(); }
  }
  if(!SUPABASE_URL){ fail('Base de datos no configurada. Completá SUPABASE_URL y SUPABASE_ANON_KEY en js/config.js.'); return false; }
  if(!cevenIsValidEmail(u)){ fail('El usuario debe ser un email @' + CEVEN_DOMAIN + '.'); return false; }

  var btn = document.getElementById('ceven-login-form').querySelector('button[type=submit]');
  if(btn){ btn.disabled = true; btn.textContent = 'Entrando…'; }

  fetch(SUPABASE_URL + '/auth/v1/token?grant_type=password', {
    method: 'POST',
    headers: {'apikey': SUPABASE_ANON_KEY, 'Content-Type': 'application/json'},
    body: JSON.stringify({email: u, password: p})
  })
  .then(function(r){ return r.json().then(function(j){ return {ok:r.ok, body:j}; }); })
  .then(function(res){
    if(btn){ btn.disabled = false; btn.textContent = 'Entrar'; }
    if(!res.ok){ fail(cevenAuthErrorMsg(res.body)); return; }
    var j = res.body;
    /* Solo los tokens: email, nombre, rol y vencimiento se leen del JWT. */
    cevenSaveSession({access_token: j.access_token, refresh_token: j.refresh_token}, remember);
    if(!cevenIsValidSession()){   /* token ilegible: mejor no dejar entrar */
      cevenClearSession();
      fail('La respuesta del servidor no trajo una sesión válida. Intentá de nuevo.');
      return;
    }
    if(err) err.style.display = 'none';
    document.getElementById('ceven-pass').value = '';
    cevenScheduleRefresh();
    cevenShowApp();
  })
  .catch(function(){
    if(btn){ btn.disabled = false; btn.textContent = 'Entrar'; }
    fail('No se pudo conectar. Revisa tu conexión a internet.');
  });
  return false;
}
/* ---- Borrado completo al salir ----
   "Salir" borraba solo `ceven_auth_session`. Todo lo demás quedaba legible
   sin sesión: cotizaciones (cquotes), price list con costos (cpl), pipeline,
   archivo, target, logos, las claves poly_*, la caché de tareas del equipo y
   los cachés del service worker. En una PC compartida eso es el historial
   comercial completo a un F12 de distancia.

   Se borra TODO menos una lista corta de preferencias de UI sin datos: es la
   única forma de no olvidarse una clave cuando se agrega una marca nueva
   (barrer por prefijo conocido se desactualiza solo).

   Esto corre SOLO en el logout explícito. cevenForceLogout() (token vencido)
   no borra nada a propósito: puede haber cambios offline sin subir y tirarlos
   por un token vencido sería peor que el riesgo que evita. */
var CEVEN_KEEP_KEYS = ['cdark'];   /* modo oscuro: preferencia visual, sin datos */
function cevenWipeLocalData(){
  var stores = [];
  try{ stores.push(localStorage); }catch(e){}
  try{ stores.push(sessionStorage); }catch(e){}
  stores.forEach(function(store){
    var keys = [], i;
    try{ for(i = 0; i < store.length; i++) keys.push(store.key(i)); }catch(e){ return; }
    keys.forEach(function(k){
      if(k === null || CEVEN_KEEP_KEYS.indexOf(k) >= 0) return;
      try{ store.removeItem(k); }catch(e){}
    });
  });
  _cevenClaims.token = null; _cevenClaims.payload = null;
  /* Los cachés del SW solo tienen código y HTML propios (sw.js nunca cachea
     Supabase), pero el enunciado es "que no quede nada": se borran igual. La
     próxima carga los rehace desde la red. */
  if(!window.caches || typeof caches.keys !== 'function') return Promise.resolve();
  return caches.keys().then(function(names){
    return Promise.all(names.map(function(n){ return caches.delete(n); }));
  }).catch(function(){});
}
function cevenLogout(){
  var sess = cevenGetSession();
  cevenCancelRefresh();
  cevenClearSession();   /* la sesión se corta ya, sin esperar a la red */

  /* Revocar el refresh_token en el servidor es best-effort: si la red no
     responde, el usuario igual tiene que quedar deslogueado en este equipo. */
  var revoke = (sess && sess.access_token)
    ? fetch(SUPABASE_URL + '/auth/v1/logout', {
        method: 'POST',
        headers: {'apikey': SUPABASE_ANON_KEY, 'Authorization': 'Bearer ' + sess.access_token}
      }).catch(function(){})
    : Promise.resolve();

  var done = false;
  function finish(){ if(done) return; done = true; location.reload(); }
  setTimeout(finish, 3000);   /* una red colgada no puede dejar la sesión abierta */
  Promise.all([revoke, cevenWipeLocalData()]).then(finish, finish);
}

/* ---- Refresh automático del access_token (vence en ~1h) ---- */
var _cevenRefreshTimer = null;
function cevenCancelRefresh(){ if(_cevenRefreshTimer){ clearTimeout(_cevenRefreshTimer); _cevenRefreshTimer = null; } }
function cevenScheduleRefresh(){
  cevenCancelRefresh();
  var exp = cevenSessionExpiresAt();
  if(!exp) return;
  var delay = Math.max(exp - Date.now() - 60000, 5000);
  _cevenRefreshTimer = setTimeout(cevenRefreshToken, delay);
}
/* Refresca el access_token y devuelve una PROMISE:
     - resuelve con el access_token nuevo si salió bien;
     - resuelve con null si no se pudo (sin conexión → se reintenta solo; o
       sesión muerta → ya se forzó el logout).
   Nunca rechaza a propósito: hay llamadores que la invocan "y listo" (el
   timer, shared/sync.js) y un rechazo sin handler sería solo ruido en la
   consola. Llamadas concurrentes comparten la misma Promise: dos refresh en
   paralelo rotarían el refresh_token dos veces y uno de los dos quedaría
   inválido. */
var _cevenRefreshing = null;
function cevenRefreshToken(){
  if(_cevenRefreshing) return _cevenRefreshing;
  var sess = cevenGetSession();
  if(!sess || !sess.refresh_token) return Promise.resolve(null);
  var remember = !!localStorage.getItem(CEVEN_SESSION_KEY);
  var p = fetch(SUPABASE_URL + '/auth/v1/token?grant_type=refresh_token', {
    method: 'POST',
    headers: {'apikey': SUPABASE_ANON_KEY, 'Content-Type': 'application/json'},
    body: JSON.stringify({refresh_token: sess.refresh_token})
  })
  .then(function(r){
    return r.json().then(function(j){ return {ok:r.ok, body:j}; },
                        function(){ return {ok:false, body:{}}; });
  })
  .then(function(res){
    /* Hubo respuesta del servidor: si dice que no, la sesión está muerta. */
    var j = res.body || {};
    if(!res.ok || !j.access_token){ cevenForceLogout(); return null; }
    cevenSaveSession({
      access_token:  j.access_token,
      /* GoTrue rota el refresh_token: siempre guardar el nuevo. */
      refresh_token: j.refresh_token || sess.refresh_token
    }, remember);
    if(!cevenIsValidSession()){ cevenForceLogout(); return null; }
    cevenScheduleRefresh();
    return j.access_token;
  }, function(){
    /* No hubo respuesta (sin conexión, Supabase caído): reintentar, NO cerrar
       sesión — el usuario puede estar trabajando offline. */
    cevenCancelRefresh();
    _cevenRefreshTimer = setTimeout(cevenRefreshToken, 30000);
    return null;
  })
  .then(function(token){ _cevenRefreshing = null; return token; });
  _cevenRefreshing = p;
  return p;
}
function cevenForceLogout(){
  cevenCancelRefresh();
  cevenClearSession();
  alert('Tu sesión expiró. Vuelve a iniciar sesión.');
  location.reload();
}
document.addEventListener('visibilitychange', function(){
  if(document.visibilityState === 'visible' && cevenIsValidSession()){
    if(cevenSessionExpiresAt() - Date.now() < 60000) cevenRefreshToken();
    else cevenScheduleRefresh();
  }
});

/* ---- Gestión de usuarios (solo admin@ceven.com, vía Edge Function) ---- */
function cevenOpenUsers(){
  if(!cevenIsAdmin()){ alert('Solo el administrador puede gestionar usuarios.'); return; }
  var _m = document.getElementById('ceven-users-modal');
  var _wasOpen = _m.style.display === 'flex';
  _m.style.display = 'flex';
  var e = document.getElementById('ceven-users-err'); if(e) e.style.display = 'none';
  if(window.cevenNav && !_wasOpen) cevenNav.openOverlay(cevenCloseUsers);
  cevenRenderUsers();
}
function cevenCloseUsers(){
  document.getElementById('ceven-users-modal').style.display = 'none';
  if(window.cevenNav) cevenNav.notifyClosed(cevenCloseUsers);
}
/* Helper genérico: fetch autenticado con el access_token del usuario, con un
   retry automático (refresh + reintento) si el token venció justo a tiempo. */
function cevenAuthedFetch(url, opts){
  var sess = cevenGetSession();
  if(!sess || !sess.access_token) return Promise.reject({message:'No hay sesión activa.'});
  function call(token){
    var headers = Object.assign({'apikey': SUPABASE_ANON_KEY, 'Authorization':'Bearer '+token, 'Content-Type':'application/json'}, opts.headers||{});
    return fetch(url, Object.assign({}, opts, {headers: headers}))
      .then(function(r){ return r.json().then(function(j){ return {status:r.status, body:j}; }).catch(function(){ return {status:r.status, body:{}}; }); });
  }
  return call(sess.access_token).then(function(res){
    if(res.status !== 401){
      if(res.status >= 400) return Promise.reject(res.body);
      return res.body;
    }
    /* 401: el token venció justo. Se encadena AL refresh real en vez de
       esperar 800ms fijos y comparar tokens: con la red lenta ese timeout
       rechazaba requests perfectamente válidas (y con la red rápida hacía
       esperar 800ms de gusto). */
    return cevenRefreshToken().then(function(token){
      if(!token) return Promise.reject(res.body);   /* no se pudo refrescar: vale el error original */
      return call(token).then(function(r2){
        if(r2.status >= 400) return Promise.reject(r2.body);
        return r2.body;
      });
    });
  });
}
function cevenCallUsersFn(action, body){
  return cevenAuthedFetch(CEVEN_AUTH_FN_URL, {
    method: 'POST',
    body: JSON.stringify(Object.assign({action: action}, body||{}))
  });
}
/* Cualquier usuario logueado puede cambiar SU PROPIA contraseña (no requiere ser admin
   ni la Edge Function: GoTrue lo permite con el propio access_token del usuario). */

/* Modal genérico para pedir una contraseña sin mostrarla en claro (reemplaza
   a prompt(), que la exponía en pantalla). Se construye por JS para funcionar
   igual en el shell y en los cotizadores sin duplicar markup. */
function cevenAskPassword(title, onSubmit){
  var old = document.getElementById('ceven-pass-modal');
  if(old) old.parentNode.removeChild(old);
  var wrap = document.createElement('div');
  wrap.id = 'ceven-pass-modal';
  wrap.style.cssText = 'position:fixed;inset:0;z-index:100000;background:rgba(0,0,0,.3);display:flex;align-items:center;justify-content:center;font-family:-apple-system,BlinkMacSystemFont,sans-serif';
  wrap.innerHTML =
    '<div style="background:#fff;border:0.5px solid #d2d2d7;border-radius:16px;padding:24px;width:330px;max-width:92vw;box-shadow:0 10px 40px rgba(0,0,0,.15)">' +
      '<div id="ceven-pass-title" style="font-size:15px;font-weight:600;color:#1d1d1f;margin-bottom:14px"></div>' +
      '<input id="ceven-pass-input" type="password" autocomplete="new-password" placeholder="Mínimo 6 caracteres"' +
        ' style="border:0.5px solid #d2d2d7;border-radius:8px;padding:9px 11px;font-size:14px;width:100%;outline:none;margin-bottom:10px;box-sizing:border-box;font-family:inherit">' +
      '<div id="ceven-pass-err" style="display:none;background:#fff0f0;color:#d70015;font-size:12px;padding:7px 10px;border-radius:8px;margin-bottom:10px"></div>' +
      '<div style="display:flex;gap:8px;justify-content:flex-end">' +
        '<button id="ceven-pass-cancel" style="border:0.5px solid #d2d2d7;border-radius:980px;padding:8px 16px;font-size:13px;font-weight:500;cursor:pointer;background:#fff;color:#1d1d1f;font-family:inherit">Cancelar</button>' +
        '<button id="ceven-pass-ok" style="border:none;border-radius:980px;padding:8px 16px;font-size:13px;font-weight:500;cursor:pointer;background:#1d1d1f;color:#fff;font-family:inherit">Guardar</button>' +
      '</div>' +
    '</div>';
  document.body.appendChild(wrap);
  wrap.querySelector('#ceven-pass-title').textContent = title;
  var input = wrap.querySelector('#ceven-pass-input');
  function close(){ if(wrap.parentNode) wrap.parentNode.removeChild(wrap); }
  function submit(){
    var np = (input.value || '').trim();
    if(np.length < 6){
      var err = wrap.querySelector('#ceven-pass-err');
      err.textContent = 'La contraseña debe tener al menos 6 caracteres.';
      err.style.display = 'block';
      return;
    }
    close();
    onSubmit(np);
  }
  wrap.querySelector('#ceven-pass-ok').onclick = submit;
  wrap.querySelector('#ceven-pass-cancel').onclick = close;
  input.onkeydown = function(ev){
    if(ev.key === 'Enter'){ ev.preventDefault(); submit(); }
    if(ev.key === 'Escape') close();
  };
  input.focus();
}

function cevenChangeMyPassword(){
  cevenAskPassword('Nueva contraseña para tu cuenta', function(np){
    cevenAuthedFetch(SUPABASE_URL + '/auth/v1/user', {
      method: 'PUT',
      body: JSON.stringify({password: np})
    }).then(function(){
      alert('Tu contraseña fue actualizada correctamente.');
    }).catch(function(e){
      alert((e && e.message) || cevenAuthErrorMsg(e) || 'No se pudo cambiar la contraseña.');
    });
  });
}
function cevenCreateUser(ev){
  if(ev) ev.preventDefault();
  var u      = (document.getElementById('ceven-new-user').value || '').trim().toLowerCase();
  var p      = document.getElementById('ceven-new-pass').value || '';
  var nombre = (document.getElementById('ceven-new-nombre').value || '').trim();
  var role   = document.getElementById('ceven-new-role').value || 'ventas';
  var err = document.getElementById('ceven-users-err');
  function fail(msg){ if(err){ err.textContent = msg; err.style.display = 'block'; } }
  if(!u || !p){ fail('Completa usuario y contraseña.'); return false; }
  if(!cevenIsValidEmail(u)){ fail('El usuario debe ser un email @' + CEVEN_DOMAIN + '.'); return false; }
  if(p.length < 6){ fail('La contraseña debe tener al menos 6 caracteres.'); return false; }
  if(!nombre){ fail('El nombre de vendedor es obligatorio.'); return false; }
  if(CEVEN_ROLES.indexOf(role) < 0){ fail('Rol inválido.'); return false; }
  if(err) err.style.display = 'none';
  cevenCallUsersFn('create', {email:u, password:p, nombre:nombre, role:role}).then(function(){
    document.getElementById('ceven-new-user').value = '';
    document.getElementById('ceven-new-pass').value = '';
    document.getElementById('ceven-new-nombre').value = '';
    document.getElementById('ceven-new-role').value = 'ventas';
    cevenRenderUsers();
  }).catch(function(e){
    fail((e && e.message) || 'No se pudo crear el usuario.');
  });
  return false;
}
function cevenDeleteUser(u){
  if(!confirm('¿Eliminar al usuario "' + u + '"?')) return;
  cevenCallUsersFn('delete', {email:u}).then(function(){
    cevenRenderUsers();
  }).catch(function(e){
    alert((e && e.message) || 'No se pudo eliminar el usuario.');
  });
}
function cevenResetPassword(u){
  cevenAskPassword('Nueva contraseña para "' + u + '"', function(np){
    cevenCallUsersFn('reset_password', {email:u, password:np}).then(function(){
      alert('Contraseña de "' + u + '" actualizada.');
    }).catch(function(e){
      alert((e && e.message) || 'No se pudo blanquear la contraseña.');
    });
  });
}
var _cevenEditProfileEmail = null;
function cevenOpenEditProfile(u, currentNombre, currentRole){
  _cevenEditProfileEmail = u;
  document.getElementById('ceven-edit-profile-email').textContent = u;
  document.getElementById('ceven-edit-profile-nombre').value = currentNombre || '';
  document.getElementById('ceven-edit-profile-role').value = CEVEN_ROLES.indexOf(currentRole) >= 0 ? currentRole : 'ventas';
  var err = document.getElementById('ceven-edit-profile-err'); if(err) err.style.display = 'none';
  var _m = document.getElementById('ceven-edit-profile-modal');
  var _wasOpen = _m.style.display === 'flex';
  _m.style.display = 'flex';
  if(window.cevenNav && !_wasOpen) cevenNav.openOverlay(cevenCloseEditProfile);
}
function cevenCloseEditProfile(){
  document.getElementById('ceven-edit-profile-modal').style.display = 'none';
  if(window.cevenNav) cevenNav.notifyClosed(cevenCloseEditProfile);
}
function cevenSubmitEditProfile(ev){
  if(ev) ev.preventDefault();
  var u = _cevenEditProfileEmail;
  var nombre = (document.getElementById('ceven-edit-profile-nombre').value || '').trim();
  var role = document.getElementById('ceven-edit-profile-role').value || 'ventas';
  var err = document.getElementById('ceven-edit-profile-err');
  function fail(msg){ if(err){ err.textContent = msg; err.style.display = 'block'; } }
  if(!u) return false;
  if(!nombre){ fail('El nombre de vendedor es obligatorio.'); return false; }
  if(CEVEN_ROLES.indexOf(role) < 0){ fail('Rol inválido.'); return false; }
  if(err) err.style.display = 'none';
  cevenCallUsersFn('update_profile', {email:u, nombre:nombre, role:role}).then(function(){
    cevenCloseEditProfile();
    cevenRenderUsers();
  }).catch(function(e){
    fail((e && e.message) || 'No se pudo actualizar el perfil.');
  });
  return false;
}
/* Delegación de eventos para la lista de usuarios.
   Antes cada botón traía un onclick="cevenDeleteUser('...')" armado por
   concatenación, con un escapado que cubría comillas simples pero NO la barra
   invertida: un nombre terminado en \ cerraba el string JS y lo que seguía se
   ejecutaba. Ahora los datos viajan en atributos data-* (escapados con
   cevenEsc, que sí cubre comillas) y nunca se parsean como código. */
function cevenBindUsersList(box){
  if(box._cevenBound) return;
  box._cevenBound = true;
  box.addEventListener('click', function(ev){
    var btn = ev.target && ev.target.closest ? ev.target.closest('button[data-act]') : null;
    if(!btn || !box.contains(btn)) return;
    var email = btn.getAttribute('data-email') || '';
    var act = btn.getAttribute('data-act');
    if(act === 'edit')        cevenOpenEditProfile(email, btn.getAttribute('data-nombre') || '', btn.getAttribute('data-role') || '');
    else if(act === 'reset')  cevenResetPassword(email);
    else if(act === 'delete') cevenDeleteUser(email);
  });
}
function cevenRenderUsers(){
  var box = document.getElementById('ceven-users-list');
  if(!box) return;
  cevenBindUsersList(box);
  box.innerHTML = '<div style="font-size:13px;color:#6e6e73;padding:8px 4px">Cargando…</div>';
  cevenCallUsersFn('list', {}).then(function(res){
    var users = (res && res.users) || [];
    users.sort(function(a,b){ return String(a.email).localeCompare(String(b.email)); });
    var roleLabel = {admin:'Administrador', ventas:'Ventas', lector:'Lector'};
    var rows = '', esc = cevenEsc;
    users.forEach(function(u){
      var email = String(u.email == null ? '' : u.email);
      var role = CEVEN_ROLES.indexOf(u.role) >= 0 ? u.role : 'ventas';
      var nombre = u.nombre || '';
      var isAdmin = (email.toLowerCase() === CEVEN_ADMIN);
      var data = ' data-email="' + esc(email) + '"';
      var tag = ' <span style="font-size:11px;color:#0071e3">(' + esc(roleLabel[role] || role) + ')</span>';
      var sub = '<div style="font-size:11px;color:#6e6e73">' + (nombre ? esc(nombre) : '<em>sin nombre</em>') + '</div>';
      var btns = '<button type="button" data-act="edit"' + data
               + ' data-nombre="' + esc(nombre) + '" data-role="' + esc(role) + '" '
               + 'style="border:0.5px solid #6e6e73;border-radius:6px;padding:3px 9px;font-size:12px;cursor:pointer;color:#1d1d1f;background:none;font-family:inherit;margin-right:6px">Editar</button>';
      if(!isAdmin){
        btns += '<button type="button" data-act="reset"' + data + ' '
              + 'style="border:0.5px solid #0071e3;border-radius:6px;padding:3px 9px;font-size:12px;cursor:pointer;color:#0071e3;background:none;font-family:inherit;margin-right:6px">Blanquear</button>';
        btns += '<button type="button" data-act="delete"' + data + ' '
              + 'style="border:0.5px solid #d70015;border-radius:6px;padding:3px 9px;font-size:12px;cursor:pointer;color:#d70015;background:none;font-family:inherit">Eliminar</button>';
      }
      rows += '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 4px;border-bottom:0.5px solid #f0f0f0">'
            + '<span>'
            +   '<span style="font-size:13px;color:#1d1d1f">' + esc(email) + tag + '</span>'
            +   sub
            + '</span>'
            + '<span style="white-space:nowrap">' + btns + '</span></div>';
    });
    box.innerHTML = rows || '<div style="font-size:13px;color:#6e6e73;padding:8px 4px">Sin usuarios.</div>';
  }).catch(function(){
    box.innerHTML = '<div style="font-size:13px;color:#d70015;padding:8px 4px">No se pudo cargar la lista de usuarios.</div>';
  });
}

/* Comprueba la sesión apenas carga el script */
if(cevenIsValidSession()){
  cevenScheduleRefresh();
  cevenShowApp();
} else {
  cevenClearSession();
}
