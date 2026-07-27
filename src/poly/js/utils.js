// ── LOGO ──
function applyLogo(){
  var src = (_darkMode && _logoDark) ? _logoDark : _logo;
  var img = document.getElementById('logo-img');
  var ph  = document.getElementById('logo-ph');
  if(src){ img.src = src; img.style.display = 'block'; ph.style.display = 'none'; }
  else   { img.style.display = 'none'; ph.style.display = 'inline-block'; }
  // Placeholder indica qué logo se puede subir
  if(_darkMode && !_logoDark && _logo) ph.textContent = '+ Logo modo oscuro';
  else ph.textContent = '+ Subir logo';
}
(function(){
  try {
    var s = localStorage.getItem('poly_clogo');
    if(s) _logo = s;
    var sd = localStorage.getItem('poly_clogo_dark');
    if(sd) _logoDark = sd;
    applyLogo();
  } catch(e){}
})();

function handleLogo(f) {
  if(!f) return;
  var r = new FileReader();
  r.onload = function(e) {
    if(_darkMode){
      _logoDark = e.target.result;
      try { localStorage.setItem('poly_clogo_dark', _logoDark); } catch(ex){}
    } else {
      _logo = e.target.result;
      try { localStorage.setItem('poly_clogo', _logo); } catch(ex){}
    }
    applyLogo();
  };
  r.readAsDataURL(f);
}

// ── SCREENS ──
// Aplica una vista SIN tocar el historial. Lo usa cevenNav (en popstate y en el
// arranque). goTo() es la entrada pública, que además integra el botón Atrás.
function _navApply(n) {
  var el = document.getElementById('p-'+n);
  if(!el) return;                          // vista desconocida: no hacemos nada
  var pgs = document.querySelectorAll('.pg');
  for(var i=0;i<pgs.length;i++) pgs[i].classList.remove('on');
  el.classList.add('on');
  if(n === 'history') renderHistory();
  if(n === 'addprod' && editingManualId === null) prepAddProd();
  if(n === 'pipeline'){ archiveOldEntries(); renderPipeline(); if(typeof autoBackupPipeline === 'function') autoBackupPipeline(false); if(typeof maybeAutoFullBackup === 'function') maybeAutoFullBackup(); }
  if(typeof cevenUpdateAccountBar === 'function') cevenUpdateAccountBar();
}

function goTo(n) {
  if(window.cevenNav) cevenNav.goToView(n);
  else _navApply(n);
}

// Registro de la vista inicial + restauración desde el hash (deep-link/recarga).
// El registro es sincrónico; el re-render de un deep-link distinto de 'quote' se
// difiere hasta que carguen el resto de scripts (renderPipeline, etc.).
(function(){
  var v = (location.hash || '').replace(/^#/, '');
  if(!v || !document.getElementById('p-'+v)) v = 'quote';
  if(window.cevenNav) cevenNav.registerView(_navApply, v);
  if(v === 'quote') _navApply('quote');
  else window.addEventListener('DOMContentLoaded', function(){ _navApply(v); });
})();

// ── UTILS ──
function fI(n) { return Math.round(n).toLocaleString('es-AR'); }

// Helpers para Mes de cierre (Safari-friendly: dos selects)
function getMesCierre(){
  var s = document.getElementById('mes-cierre-mY');
  if(!s || !s.value) return '';
  return s.value;
}
function setMesCierre(v){
  var s = document.getElementById('mes-cierre-mY');
  if(!s) return;
  s.value = v || '';
}
// Genera <option> de meses/años para un período (default: año a año+4)
function generateMesYearOptions(currentVal){
  var meses = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
  var now = new Date();
  var yr = now.getFullYear();
  var html = '<option value=""'+((!currentVal)?' selected':'')+'>— Mes/Año —</option>';
  for(var y = yr; y <= yr + 4; y++){
    for(var m = 1; m <= 12; m++){
      var mm = (m < 10 ? '0'+m : ''+m);
      var val = y + '-' + mm;
      html += '<option value="'+val+'"'+(currentVal===val?' selected':'')+'>'+meses[m-1]+' '+y+'</option>';
    }
  }
  return html;
}
// Poblar el select combinado al cargar
(function(){
  var sel = document.getElementById('mes-cierre-mY');
  if(!sel) return;
  sel.innerHTML = generateMesYearOptions('');
})();
function fD(n) { return n.toLocaleString('es-AR',{minimumFractionDigits:2,maximumFractionDigits:2}); }

function getCur() { return document.getElementById('cur').value; }
function getTC() { return parseFloat(document.getElementById('tc').value) || 1; }
function dp(u) { return getCur()==='ARS' ? 'ARS '+fI(Math.round(u*getTC())) : 'USD '+fI(u); }

function showErr(m) { var e=document.getElementById('errbox'); e.textContent=m; e.style.display=m?'block':'none'; }

function toggleTC() {
  document.getElementById('tc').style.display = getCur()==='ARS' ? 'block' : 'none';
  document.getElementById('cond-cur').textContent = getCur()==='ARS' ? 'Precios unitarios expresados en pesos argentinos' : 'Precios unitarios expresados en dólares estadounidenses';
}
