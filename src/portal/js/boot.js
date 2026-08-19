/* ============================================================
   PORTAL · boot.js
   ------------------------------------------------------------
   El arranque: cablea los formularios/botones una sola vez y
   decide qué pantalla mostrar (login / onboarding / app) según
   el estado de la sesión. Va al final: todo lo demás ya está
   definido.
   ============================================================ */

function _portalHacerLogin(){
  var email = (document.getElementById('plogin-email').value || '').trim();
  var password = document.getElementById('plogin-password').value;
  var remember = document.getElementById('plogin-remember').checked;
  var err = document.getElementById('plogin-error');
  var btn = document.getElementById('plogin-submit');
  if(err) err.textContent = '';
  if(btn){ btn.disabled = true; btn.textContent = 'Entrando…'; }

  cevenPortalLogin(email, password, remember).then(function(){
    _portalArrancar();
  }).catch(function(msg){
    if(err) err.textContent = (typeof msg === 'string') ? msg : 'No se pudo iniciar sesión.';
  }).then(function(){
    if(btn){ btn.disabled = false; btn.textContent = 'Entrar'; }
  });
}

function _portalArrancar(){
  if(!cevenPortalIsValidSession() || !cevenPortalEsCliente()){
    document.getElementById('pg-login').style.display = '';
    document.getElementById('pg-onboarding').style.display = 'none';
    document.getElementById('pg-app').style.display = 'none';
    return;
  }
  document.getElementById('pg-login').style.display = 'none';
  cevenPortalScheduleRefresh();
  _portalPerfilCargar().then(function(){
    if(_portalOnboardingNecesario()) _portalOnboardingMostrar();
    else _portalAppMostrar();
  });
}

function _portalAppMostrar(){
  document.getElementById('pg-onboarding').style.display = 'none';
  document.getElementById('pg-app').style.display = '';
  var who = document.getElementById('pgh-email');
  if(who) who.textContent = cevenPortalEmail();
  _portalClientesFinalesCargar().then(_portalPintarSelectClienteFinal);
  _portalLogoRefrescarPreview();
  _portalGoTo('marca');
}

document.addEventListener('DOMContentLoaded', function(){
  var loginForm = document.getElementById('plogin-form');
  if(loginForm) loginForm.addEventListener('submit', function(ev){ ev.preventDefault(); _portalHacerLogin(); });

  var logoutBtn = document.getElementById('pbtn-logout');
  if(logoutBtn) logoutBtn.addEventListener('click', cevenPortalLogout);

  document.querySelectorAll('[data-marca]').forEach(function(btn){
    btn.addEventListener('click', function(){ _portalElegirMarca(btn.getAttribute('data-marca')); });
  });
  document.querySelectorAll('[data-pgt]').forEach(function(btn){
    btn.addEventListener('click', function(){ _portalGoTo(btn.getAttribute('data-pgt')); });
  });

  _portalOnboardingBind();
  _portalCatBind();
  _portalClientesFinalesBind();
  _portalLogoBind();
  _portalEmitirBind();
  _portalHistorialBind();

  _portalArrancar();
});
