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
    var s = localStorage.getItem('clogo');
    if(s) _logo = s;
    var sd = localStorage.getItem('clogo_dark');
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
      try { localStorage.setItem('clogo_dark', _logoDark); } catch(ex){}
    } else {
      _logo = e.target.result;
      try { localStorage.setItem('clogo', _logo); } catch(ex){}
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
  if(n === 'nac') renderNac();
  if(n === 'qnac') renderQuoteNac();
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
// Genera <option> de meses/años para un período (default: año-1 a año+4)
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
function getM() {
  // Leer del input de número (admite 0.25) — si no existe, fallback al slider
  var input = document.getElementById('msl-input');
  if(input && input.value !== ''){
    var v = parseFloat(input.value);
    if(!isNaN(v)) return Math.min(80, Math.max(0, Math.round(v*100)/100));
  }
  return parseInt(document.getElementById('msl').value) || 0;
}

function syncMarginFromInput(){
  var input = document.getElementById('msl-input');
  var v = parseFloat(input.value);
  if(isNaN(v)) return;
  v = Math.min(80, Math.max(0, v));
  // Redondear a 0.25 más cercano
  v = Math.round(v * 4) / 4;
  document.getElementById('msl').value = v;
  // Recalcular precios en la cotización (los items con margen estándar)
  recalcMarginsFromGlobal();
}

function syncMarginFromSlider(){
  var v = parseFloat(document.getElementById('msl').value);
  document.getElementById('msl-input').value = v;
  recalcMarginsFromGlobal();
}

function recalcMarginsFromGlobal(){
  // Sólo afecta a items que NO fueron editados manualmente
  var mg = getM();
  for(var i=0;i<items.length;i++){
    if(!items[i].manualMargin){
      items[i].itemMargin = mg;
      items[i].salePrice = calcP(items[i].sellingBase, items[i].itemNac, mg);
    }
  }
  if(document.getElementById('p-quote') && document.getElementById('p-quote').classList.contains('on')) renderQ();
  if(document.getElementById('p-catalog') && document.getElementById('p-catalog').classList.contains('on')) renderCat();
}
function getCur() { return document.getElementById('cur').value; }
function getTC() { return parseFloat(document.getElementById('tc').value) || 1; }
function dp(u) { return getCur()==='ARS' ? 'ARS '+fI(Math.round(u*getTC())) : 'USD '+fI(u); }
function calcP(base, nac, mg) { if(mg >= 100) mg = 99; return Math.round(base*(1+nac/100)/(1-mg/100)); }

function getNac(p) {
  // Buscar primero en LOB, luego en modelCol como fallback, y también en description
  var sources = [(p.lob||''), (p.modelCol||''), (p.description||'')];
  for(var s=0;s<sources.length;s++){
    var src = sources[s];
    if(!src) continue;
    // Override por cotización gana primero
    if(quoteNacOverrides[src] !== undefined) return quoteNacOverrides[src];
    if(nacRates[src] !== undefined) return nacRates[src];
    var lo = src.toLowerCase();
    // Buscar override más específico
    var keysO = Object.keys(quoteNacOverrides);
    var bestO = null, bestOLen = 0;
    for(var k=0;k<keysO.length;k++){
      var kol = keysO[k].toLowerCase();
      if(lo.indexOf(kol) !== -1 && kol.length > bestOLen){ bestO = keysO[k]; bestOLen = kol.length; }
    }
    if(bestO !== null) return quoteNacOverrides[bestO];
    // Si no hay override, ir al global
    var keys = Object.keys(nacRates);
    var bestKey = null, bestLen = 0;
    for(var i=0;i<keys.length;i++) {
      var kl = keys[i].toLowerCase();
      if(lo.indexOf(kl) !== -1 && kl.length > bestLen) {
        bestKey = keys[i];
        bestLen = kl.length;
      }
    }
    if(bestKey !== null) return nacRates[bestKey];
  }
  return 20;
}

function getIVA(lob) {
  if(IVA_MAP[lob] !== undefined) return IVA_MAP[lob];
  var l = (lob||'').toLowerCase();
  var keys = Object.keys(IVA_MAP);
  var bestKey = null, bestLen = 0;
  for(var i=0;i<keys.length;i++) {
    var kl = keys[i].toLowerCase();
    if(l.indexOf(kl) !== -1 && kl.length > bestLen) {
      bestKey = keys[i];
      bestLen = kl.length;
    }
  }
  return bestKey !== null ? IVA_MAP[bestKey] : '';
}

function uniq(arr) {
  var seen = {}, out = ['Todos'];
  for(var i=0;i<arr.length;i++) { if(arr[i] && !seen[arr[i]]) { seen[arr[i]]=1; out.push(arr[i]); } }
  out.sort(function(a,b){ return a==='Todos'?-1:b==='Todos'?1:a.localeCompare(b); });
  return out;
}

function showErr(m) { var e=document.getElementById('errbox'); e.textContent=m; e.style.display=m?'block':'none'; }

function toggleTC() {
  document.getElementById('tc').style.display = getCur()==='ARS' ? 'block' : 'none';
  document.getElementById('cond-cur').textContent = getCur()==='ARS' ? 'Precios unitarios expresados en pesos argentinos' : 'Precios unitarios expresados en dólares estadounidenses';
}

function saveNac() { try { localStorage.setItem('cnac', JSON.stringify(nacRates)); } catch(e){} autoSnapshot(); }
function resetNac() { nacRates = JSON.parse(JSON.stringify(NAC_DEF)); saveNac(); renderNac(); }

