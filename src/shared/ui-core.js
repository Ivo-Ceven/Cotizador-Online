/* ============================================================
   UI CORE  ·  compartido por todas las marcas
   ------------------------------------------------------------
   Sale de apple/js/utils.js + poly/js/utils.js, que eran 96%
   identicos. Aca vive TODO lo generico: modo oscuro, logo,
   delegacion de eventos, navegacion entre vistas, formateo de
   numeros/moneda, helpers de mes de cierre y el cartel de error.

   Lo que era exclusivo de Apple (margenes, nacionalizacion,
   IVA) se fue a apple/js/pricing.js. Poly no tiene equivalente.

   Depende de: brand.js (cevenK), safe.js (cevenLsSet), state.js
   (editingManualId). Declara _darkMode/_logo/_logoDark, que antes
   estaban duplicados en los dos state.js.
   Se carga DESPUES de state.js y ANTES de pricing.js.
   ============================================================ */

// ── DARK MODE ──
// 'cdark' va SIN prefijo a proposito: es una preferencia del navegador, no del
// cotizador, y se comparte entre marcas (ver CEVEN_BACKUP_UNPREFIXED en backup.js).
// Los re-render extra van con typeof: 'warranties' y 'target' existen solo en Apple.
var _darkMode = (localStorage.getItem('cdark') === '1');
(function(){ if(_darkMode) document.body.classList.add('dark'); })();

function toggleDark(){
  _darkMode = !_darkMode;
  cevenLsSet('cdark', _darkMode ? '1' : '0');
  document.body.classList.toggle('dark', _darkMode);
  var icon = _darkMode ? '☀️' : '🌙';
  document.querySelectorAll('.dark-btn').forEach(function(b){ b.textContent = icon; });
  applyLogo();
  renderQ();
  if(typeof renderWarranties === 'function') renderWarranties();
  var pp = document.getElementById('p-pipeline');
  if(pp && pp.classList.contains('on')) renderPipeline();
  var tm = document.getElementById('target-modal');
  if(tm && tm.style.display !== 'none' && typeof renderTargetAnual === 'function') renderTargetAnual();
}

// ── LOGO ──
var _logo = null;
var _logoDark = null;

function applyLogo(){
  var src = (_darkMode && _logoDark) ? _logoDark : _logo;
  var img = document.getElementById('logo-img');
  var ph  = document.getElementById('logo-ph');
  if(!img || !ph) return;
  if(src){ img.src = src; img.style.display = 'block'; ph.style.display = 'none'; }
  else   { img.style.display = 'none'; ph.style.display = 'inline-block'; }
  // Placeholder indica qué logo se puede subir
  if(_darkMode && !_logoDark && _logo) ph.textContent = '+ Logo modo oscuro';
  else ph.textContent = '+ Subir logo';
}
(function(){
  try {
    var s = localStorage.getItem(cevenK('clogo'));
    if(s) _logo = s;
    var sd = localStorage.getItem(cevenK('clogo_dark'));
    if(sd) _logoDark = sd;
  } catch(e){}
  applyLogo();
})();

function handleLogo(f) {
  if(!f) return;
  var r = new FileReader();
  r.onload = function(e) {
    // Un logo es un data-URL grande: es justo el caso donde localStorage
    // revienta por cuota. cevenLsSet avisa en vez de fallar en silencio.
    if(_darkMode){
      _logoDark = e.target.result;
      cevenLsSet(cevenK('clogo_dark'), _logoDark);
    } else {
      _logo = e.target.result;
      cevenLsSet(cevenK('clogo'), _logo);
    }
    applyLogo();
  };
  r.readAsDataURL(f);
}

// ── SCREENS ──
// Aplica una vista SIN tocar el historial. Lo usa cevenNav (en popstate y en el
// arranque). goTo() es la entrada pública, que además integra el botón Atrás.
//
// Las vistas 'nac' y 'qnac' existen sólo en Apple: van con typeof porque este
// archivo lo comparten las dos marcas.
function _navApply(n) {
  var el = document.getElementById('p-'+n);
  if(!el) return;                          // vista desconocida: no hacemos nada
  var pgs = document.querySelectorAll('.pg');
  for(var i=0;i<pgs.length;i++) pgs[i].classList.remove('on');
  el.classList.add('on');
  if(n === 'nac'  && typeof renderNac === 'function') renderNac();
  if(n === 'qnac' && typeof renderQuoteNac === 'function') renderQuoteNac();
  if(n === 'history') renderHistory();
  if(n === 'addprod' && editingManualId === null) prepAddProd();
  // archiveOldEntries() se llama ACÁ Y SOLO ACÁ. renderPipeline() no debe
  // volver a llamarlo: cada pasada que archiva algo dispara savePipeline() →
  // autoSnapshot() → scheduleFullBackup(), y duplicarlo duplica ese trabajo.
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

/* ── DELEGACIÓN DE EVENTOS ──────────────────────────────────────────────
   Reemplaza los handlers inline que interpolaban datos, tipo
     onclick="fn('" + valor.replace(/'/g,"\\'") + "')"
   Ese escapado NO es seguro: no cubre la barra invertida, así que un valor
   como  \');alert(1);//  cierra el string JS y ejecuta lo que sigue. Y como
   cliente / OPG / SKU / descripción llegan sincronizados desde Supabase, el
   valor no lo controla quien mira la pantalla.
   Con delegación el dato viaja en un data-* (escapado como atributo) y se lee
   con getAttribute(): nunca se parsea como código.

   cevenDelegate() ata el listener una sola vez por contenedor: los render()
   pisan el innerHTML de los hijos, pero el contenedor sobrevive. Por eso se
   llama DESDE el render y no desde una IIFE al cargar el archivo: si el
   contenedor todavía no existe cuando corre el <script>, una IIFE se rinde en
   silencio y la vista queda sin ningún handler para siempre. */
function cevenDelegate(containerId, evName, handler){
  var el = document.getElementById(containerId);
  if(!el) return;
  var flag = '_cevenDeleg_' + evName;
  if(el[flag]) return;
  el[flag] = true;
  el.addEventListener(evName, handler);
}
/* Sube desde el target hasta el contenedor y devuelve el primer elemento que
   declare data-act (o null si el clic no cayó sobre nada accionable).
   Al devolver el elemento MÁS INTERNO, el clic sobre un botón dentro de una
   fila accionable no dispara además el handler de la fila: no hace falta un
   stopPropagation() en cada uno (y propagar deja que se sigan cerrando los
   menús que escuchan en document). */
function cevenActEl(ev, container){
  var el = ev.target;
  while(el && el !== container){
    if(el.getAttribute && el.getAttribute('data-act')) return el;
    el = el.parentNode;
  }
  return null;
}

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
// Genera <option> de meses/años para un período (año actual a año+4)
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

// ── MONEDA ──
function getCur() { var el = document.getElementById('cur'); return el ? el.value : 'USD'; }

// Devuelve el tipo de cambio, o 0 si falta / es inválido.
//
// Antes esto era `parseFloat(...) || 1`. El fallback estaba para evitar dividir
// por cero, pero convertía un TC vacío en una cotización a 1:1: un ítem de
// USD 1.041 se imprimía "ARS 1.041" y salía así al cliente. Ahora 0 significa
// "no hay TC" y quien lo use TIENE que chequearlo (ver cevenTCValido).
function getTC() {
  var el = document.getElementById('tc');
  if(!el) return 0;
  var v = parseFloat(el.value);
  if(isNaN(v) || v <= 0) return 0;
  return v;
}

// ¿Se puede mostrar/exportar precios con la configuración actual?
// En USD el TC es irrelevante; en ARS hace falta un TC > 0.
// El PDF debe bloquear la exportación si esto da false.
function cevenTCValido(){ return getCur() !== 'ARS' || getTC() > 0; }

// Precio formateado. Si estamos en ARS sin TC NO inventa un número: lo dice.
function dp(u) {
  if(getCur() !== 'ARS') return 'USD '+fI(u);
  var tc = getTC();
  if(tc <= 0) return 'ARS — (falta TC)';
  return 'ARS '+fI(Math.round(u*tc));
}

function showErr(m) { var e=document.getElementById('errbox'); if(!e) return; e.textContent=m; e.style.display=m?'block':'none'; }

function toggleTC() {
  var tc = document.getElementById('tc');
  var cond = document.getElementById('cond-cur');
  if(tc) tc.style.display = getCur()==='ARS' ? 'block' : 'none';
  if(cond) cond.textContent = getCur()==='ARS' ? 'Precios unitarios expresados en pesos argentinos' : 'Precios unitarios expresados en dólares estadounidenses';
}
