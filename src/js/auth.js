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

/* ---- Sesión (access_token / refresh_token / expiración / email / nombre / role) ---- */
var CEVEN_ROLES = ['admin','ventas','lector'];
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
function cevenClearSession(){
  try{ localStorage.removeItem(CEVEN_SESSION_KEY); sessionStorage.removeItem(CEVEN_SESSION_KEY); }catch(e){}
}
function cevenSessionUser(){
  var s = cevenGetSession();
  return s && s.email ? s.email : null;
}
/* Extrae {nombre, role} de un user_metadata de Supabase de forma defensiva
   (nunca devuelve undefined, para no perder el campo al guardar el bundle). */
function cevenExtractProfile(userMetadata){
  var md = userMetadata || {};
  var nombre = (typeof md.nombre === 'string') ? md.nombre : '';
  var role = (CEVEN_ROLES.indexOf(md.role) >= 0) ? md.role : '';
  return {nombre: nombre, role: role};
}
function cevenMyNombre(){
  var s = cevenGetSession();
  return (s && s.nombre) ? s.nombre : '';
}
function cevenMyRole(){
  var s = cevenGetSession();
  var email = (s && s.email) ? s.email.toLowerCase() : '';
  if(email === CEVEN_ADMIN) return 'admin'; /* bootstrap: siempre admin, sin importar metadata */
  if(s && CEVEN_ROLES.indexOf(s.role) >= 0) return s.role;
  return 'lector'; /* fail-safe: sin rol válido conocido -> el más restrictivo */
}
function cevenIsAdmin(){
  return cevenMyRole() === 'admin';
}
function cevenIsValidSession(){
  var s = cevenGetSession();
  return !!(s && s.access_token && s.expires_at && Date.now() < s.expires_at);
}
function cevenShowApp(){
  var ov = document.getElementById('ceven-login');
  if(ov) ov.style.display = 'none';
  var lbl = document.getElementById('ceven-logout-label');
  if(lbl) lbl.textContent = 'Salir (' + cevenSessionUser() + ')';
  cevenUpdateAccountBar();
  cevenApplyVendorAutofill();
}
/* La barra (Usuarios / Salir) solo se ve en la página principal (cotización). */
function cevenUpdateAccountBar(){
  var bar = document.getElementById('ceven-account-bar');
  if(!bar) return;
  var quote = document.getElementById('p-quote');
  var onMain = cevenIsValidSession() && quote && quote.classList.contains('on');
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
    var profile = cevenExtractProfile(j.user && j.user.user_metadata);
    cevenSaveSession({
      access_token: j.access_token,
      refresh_token: j.refresh_token,
      expires_at: Date.now() + (j.expires_in||3600)*1000,
      email: ((j.user && j.user.email) || u).toLowerCase(),
      nombre: profile.nombre,
      role: profile.role
    }, remember);
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
function cevenLogout(){
  var sess = cevenGetSession();
  cevenCancelRefresh();
  cevenClearSession();
  if(sess && sess.access_token){
    fetch(SUPABASE_URL + '/auth/v1/logout', {
      method: 'POST',
      headers: {'apikey': SUPABASE_ANON_KEY, 'Authorization': 'Bearer ' + sess.access_token}
    }).catch(function(){}).then(function(){ location.reload(); });
  } else {
    location.reload();
  }
}

/* ---- Refresh automático del access_token (vence en ~1h) ---- */
var _cevenRefreshTimer = null;
function cevenCancelRefresh(){ if(_cevenRefreshTimer){ clearTimeout(_cevenRefreshTimer); _cevenRefreshTimer = null; } }
function cevenScheduleRefresh(){
  cevenCancelRefresh();
  var sess = cevenGetSession();
  if(!sess || !sess.expires_at) return;
  var delay = Math.max(sess.expires_at - Date.now() - 60000, 5000);
  _cevenRefreshTimer = setTimeout(cevenRefreshToken, delay);
}
function cevenRefreshToken(){
  var sess = cevenGetSession();
  if(!sess || !sess.refresh_token) return;
  var remember = !!localStorage.getItem(CEVEN_SESSION_KEY);
  fetch(SUPABASE_URL + '/auth/v1/token?grant_type=refresh_token', {
    method: 'POST',
    headers: {'apikey': SUPABASE_ANON_KEY, 'Content-Type': 'application/json'},
    body: JSON.stringify({refresh_token: sess.refresh_token})
  })
  .then(function(r){ return r.json().then(function(j){ return {ok:r.ok, body:j}; }); })
  .then(function(res){
    if(!res.ok){ cevenForceLogout(); return; }
    var j = res.body;
    var profile = cevenExtractProfile(j.user && j.user.user_metadata);
    cevenSaveSession({
      access_token: j.access_token,
      refresh_token: j.refresh_token,   /* GoTrue rota el refresh_token: siempre guardar el nuevo */
      expires_at: Date.now() + (j.expires_in||3600)*1000,
      email: sess.email,
      nombre: profile.nombre,
      role: profile.role
    }, remember);
    cevenScheduleRefresh();
  })
  .catch(function(){
    _cevenRefreshTimer = setTimeout(cevenRefreshToken, 30000); /* error de red: reintentar, no cerrar sesión */
  });
}
function cevenForceLogout(){
  cevenCancelRefresh();
  cevenClearSession();
  alert('Tu sesión expiró. Vuelve a iniciar sesión.');
  location.reload();
}
document.addEventListener('visibilitychange', function(){
  if(document.visibilityState === 'visible' && cevenIsValidSession()){
    var sess = cevenGetSession();
    if(sess && sess.expires_at - Date.now() < 60000) cevenRefreshToken();
    else cevenScheduleRefresh();
  }
});

/* ---- Gestión de usuarios (solo admin@ceven.com, vía Edge Function) ---- */
function cevenOpenUsers(){
  if(!cevenIsAdmin()){ alert('Solo el administrador puede gestionar usuarios.'); return; }
  document.getElementById('ceven-users-modal').style.display = 'flex';
  var e = document.getElementById('ceven-users-err'); if(e) e.style.display = 'none';
  cevenRenderUsers();
}
function cevenCloseUsers(){
  document.getElementById('ceven-users-modal').style.display = 'none';
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
    if(res.status === 401){
      var prevToken = sess.access_token;
      cevenRefreshToken();
      return new Promise(function(resolve, reject){
        setTimeout(function(){
          var s2 = cevenGetSession();
          if(!s2 || s2.access_token === prevToken){ reject(res.body); return; }
          call(s2.access_token).then(function(r2){
            if(r2.status >= 400) return reject(r2.body);
            resolve(r2.body);
          }, reject);
        }, 800);
      });
    }
    if(res.status >= 400) return Promise.reject(res.body);
    return res.body;
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
function cevenChangeMyPassword(){
  var np = prompt('Nueva contraseña para tu cuenta (mínimo 6 caracteres):', '');
  if(np === null) return;
  np = np.trim();
  if(np.length < 6){ alert('La contraseña debe tener al menos 6 caracteres.'); return; }
  cevenAuthedFetch(SUPABASE_URL + '/auth/v1/user', {
    method: 'PUT',
    body: JSON.stringify({password: np})
  }).then(function(){
    alert('Tu contraseña fue actualizada correctamente.');
  }).catch(function(e){
    alert((e && e.message) || cevenAuthErrorMsg(e) || 'No se pudo cambiar la contraseña.');
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
  var np = prompt('Nueva contraseña para "' + u + '":', '');
  if(np === null) return;
  np = np.trim();
  if(!np || np.length < 6){ alert('La contraseña debe tener al menos 6 caracteres.'); return; }
  cevenCallUsersFn('reset_password', {email:u, password:np}).then(function(){
    alert('Contraseña de "' + u + '" actualizada.');
  }).catch(function(e){
    alert((e && e.message) || 'No se pudo blanquear la contraseña.');
  });
}
var _cevenEditProfileEmail = null;
function cevenOpenEditProfile(u, currentNombre, currentRole){
  _cevenEditProfileEmail = u;
  document.getElementById('ceven-edit-profile-email').textContent = u;
  document.getElementById('ceven-edit-profile-nombre').value = currentNombre || '';
  document.getElementById('ceven-edit-profile-role').value = CEVEN_ROLES.indexOf(currentRole) >= 0 ? currentRole : 'ventas';
  var err = document.getElementById('ceven-edit-profile-err'); if(err) err.style.display = 'none';
  document.getElementById('ceven-edit-profile-modal').style.display = 'flex';
}
function cevenCloseEditProfile(){
  document.getElementById('ceven-edit-profile-modal').style.display = 'none';
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
function cevenRenderUsers(){
  var box = document.getElementById('ceven-users-list');
  if(!box) return;
  box.innerHTML = '<div style="font-size:13px;color:#6e6e73;padding:8px 4px">Cargando…</div>';
  cevenCallUsersFn('list', {}).then(function(res){
    var users = (res && res.users) || [];
    users.sort(function(a,b){ return a.email.localeCompare(b.email); });
    var roleLabel = {admin:'Administrador', ventas:'Ventas', lector:'Lector'};
    var rows = '',
        esc = function(s){ return String(s).replace(/[<>&"]/g, function(c){ return {'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'}[c]; }); },
        arg = function(s){ return esc(s).replace(/'/g,"\\'"); };
    users.forEach(function(u){
      var role = CEVEN_ROLES.indexOf(u.role) >= 0 ? u.role : 'ventas';
      var nombre = u.nombre || '';
      var isAdmin = (u.email.toLowerCase() === CEVEN_ADMIN);
      var tag = ' <span style="font-size:11px;color:#0071e3">(' + (roleLabel[role]||role) + ')</span>';
      var sub = '<div style="font-size:11px;color:#6e6e73">' + (nombre ? esc(nombre) : '<em>sin nombre</em>') + '</div>';
      var btns = '<button onclick="cevenOpenEditProfile(\'' + arg(u.email) + '\',\'' + arg(nombre) + '\',\'' + arg(role) + '\')" '
               + 'style="border:0.5px solid #6e6e73;border-radius:6px;padding:3px 9px;font-size:12px;cursor:pointer;color:#1d1d1f;background:none;font-family:inherit;margin-right:6px">Editar</button>';
      if(!isAdmin){
        btns += '<button onclick="cevenResetPassword(\'' + arg(u.email) + '\')" '
              + 'style="border:0.5px solid #0071e3;border-radius:6px;padding:3px 9px;font-size:12px;cursor:pointer;color:#0071e3;background:none;font-family:inherit;margin-right:6px">Blanquear</button>';
        btns += '<button onclick="cevenDeleteUser(\'' + arg(u.email) + '\')" '
              + 'style="border:0.5px solid #d70015;border-radius:6px;padding:3px 9px;font-size:12px;cursor:pointer;color:#d70015;background:none;font-family:inherit">Eliminar</button>';
      }
      rows += '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 4px;border-bottom:0.5px solid #f0f0f0">'
            + '<span>'
            +   '<span style="font-size:13px;color:#1d1d1f">' + esc(u.email) + tag + '</span>'
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
