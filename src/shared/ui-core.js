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
  if(n === 'regi-stats' && typeof renderRegiStats === 'function') renderRegiStats();  // Poly: Estadísticas REGI
  if(n === 'history') renderHistory();
  if(n === 'addprod' && editingManualId === null) prepAddProd();
  // rollOverdueEntries() y archiveOldEntries() se llaman ACÁ Y SOLO ACÁ.
  // renderPipeline() no debe volver a llamarlos: cada pasada que mueve algo
  // dispara savePipeline() → autoSnapshot() → scheduleFullBackup().
  // ORDEN: primero el roll (mueve al mes actual las filas ABIERTAS con cierre
  // vencido) y recién después el archivado (se lleva las CERRADAS de meses
  // pasados). Abierta/cerrada particionan: una fila nunca la tocan las dos.
  if(n === 'pipeline'){
    if(typeof rollOverdueEntries === 'function') rollOverdueEntries();
    archiveOldEntries();
    renderPipeline();
    if(typeof autoBackupPipeline === 'function') autoBackupPipeline(false);
    if(typeof maybeAutoFullBackup === 'function') maybeAutoFullBackup();
  }
  if(typeof cevenSyncUserUI === 'function') cevenSyncUserUI();
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

/* ── MENÚ ⋯ DE LA BARRA DE ACCIONES ─────────────────────────────────────
   Es un <details class="ovf"> nativo: abre y cierra con el click en el ⋯, se
   enfoca con Tab y no necesita ni una línea de JS para eso. Lo único que le
   falta es lo que <details> no hace: cerrarse al hacer click en otra cosa, al
   elegir una opción, o con Escape.

   Escape acá no choca con nav.js: el de nav.js solo actúa si hay un modal
   registrado en su pila, y este menú no es un modal. */
(function(){
  function cerrarSalvo(salvo){
    var abiertos = document.querySelectorAll('details.ovf[open]');
    for(var i = 0; i < abiertos.length; i++){
      if(abiertos[i] !== salvo) abiertos[i].removeAttribute('open');
    }
  }
  document.addEventListener('click', function(e){
    if(!e.target || !e.target.closest) return;
    var d = e.target.closest('details.ovf');
    cerrarSalvo(d);
    if(d && e.target.closest('.ovf-menu button')) d.removeAttribute('open');
  });
  document.addEventListener('keydown', function(e){
    if(e.key === 'Escape' || e.key === 'Esc') cerrarSalvo(null);
  });
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

// Helpers para Mes de cierre. El campo es el picker de shared/monthpicker.js,
// que expone `value` igual que el <select> que reemplazó.
function getMesCierre(){
  var s = document.getElementById('mes-cierre-mY');
  return (s && s.value) ? s.value : '';
}
function setMesCierre(v){
  cevenMonthSet('mes-cierre-mY', v);
}
// El campo se arma desde acá y no en los dos index.html: así el markup del
// picker vive en un solo lado y no se despega entre marcas.
(function(){
  var box = document.getElementById('mes-cierre-box');
  if(box) box.innerHTML = cevenMonthField('', ' id="mes-cierre-mY"', {cls:'mpk-full'});
})();
function fD(n) { return n.toLocaleString('es-AR',{minimumFractionDigits:2,maximumFractionDigits:2}); }

/* ── CONDICIÓN DE PAGO ──────────────────────────────────────────────────────
   El `<select id="pay-mode">` tiene las cuatro condiciones de siempre más una
   opción "Otra", que revela un campo de texto (#pay-mode-otra) para escribir
   cualquier cosa.

   Estas dos funciones existen para que el resto del código NO sepa de eso. Hay
   ocho lugares que leen o escriben la condición (los dos PDF, los dos
   quotes-db, warranties, boot); si cada uno resolviera el "Otra" por su cuenta,
   alcanzaría con que uno se olvide para que el PDF salga diciendo "Otra" en vez
   de lo que se escribió. Acá se resuelve una sola vez.

   Lo que se guarda y se imprime es SIEMPRE el texto final, nunca el marcador:
   así una cotización vieja se relee igual aunque el listado de opciones cambie. */
var CEVEN_PAY_OTRA = '__otra';

function cevenPayMode(){
  var sel = document.getElementById('pay-mode');
  if(!sel) return '';
  if(sel.value !== CEVEN_PAY_OTRA) return sel.value;
  var libre = document.getElementById('pay-mode-otra');
  return libre ? String(libre.value || '').trim() : '';
}

/* Escribe la condición viniendo de una cotización guardada. Si el texto no es
   una de las opciones del selector, entra por "Otra" — que es exactamente lo
   que pasa al reabrir algo guardado con una condición escrita a mano. */
function cevenSetPayMode(v){
  var sel = document.getElementById('pay-mode');
  if(!sel) return;
  v = String(v == null ? '' : v);
  for(var i = 0; i < sel.options.length; i++){
    if(sel.options[i].value === v && v !== CEVEN_PAY_OTRA){
      sel.value = v;
      cevenTogglePayOtra();
      return;
    }
  }
  sel.value = CEVEN_PAY_OTRA;
  var libre = document.getElementById('pay-mode-otra');
  if(libre) libre.value = v;
  cevenTogglePayOtra();
}

/* Muestra u esconde el campo libre. Lo llama el onchange del selector. */
function cevenTogglePayOtra(){
  var sel   = document.getElementById('pay-mode');
  var libre = document.getElementById('pay-mode-otra');
  if(!sel || !libre) return;
  var otra = sel.value === CEVEN_PAY_OTRA;
  libre.style.display = otra ? '' : 'none';
  if(otra) libre.focus();
}

/* ── ENTREGA ────────────────────────────────────────────────────────────────
   Mismo mecanismo que la condición de pago: un `<select id="delivery">` con los
   plazos habituales más una opción libre (#delivery-otra) para cualquier otro.

   Hasta 08/2026 esto era un `<input type="text">` y cada uno tipeaba el plazo a
   mano. Dos consecuencias: el mismo plazo salía impreso de varias formas
   ("inmediata", "Inmediata", "INMEDIATA", "entrega inmediata"), y no había
   forma confiable de reconocer la entrega inmediata para destacarla en el PDF.

   Igual que con el pago, lo que se guarda y se imprime es SIEMPRE el texto
   final, nunca el marcador: una cotización vieja se relee bien aunque mañana
   cambien las opciones del selector. Y por eso mismo el valor de cada <option>
   es su propio texto — no un código.

   La primera opción es vacía a propósito: antes el campo arrancaba en blanco y
   el PDF imprimía "Entrega: —". Sin una opción vacía, toda cotización nueva
   saldría afirmando un plazo que nadie eligió. */
var CEVEN_ENTREGA_OTRA = '__otra';

function cevenDelivery(){
  var sel = document.getElementById('delivery');
  if(!sel) return '';
  if(sel.value !== CEVEN_ENTREGA_OTRA) return sel.value;
  var libre = document.getElementById('delivery-otra');
  return libre ? String(libre.value || '').trim() : '';
}

/* Escribe la entrega viniendo de una cotización guardada. Si el texto no es una
   de las opciones del selector, entra por "Otra" — que es lo que pasa al
   reabrir algo guardado cuando era un campo de texto libre. */
function cevenSetDelivery(v){
  var sel = document.getElementById('delivery');
  if(!sel) return;
  var libre = document.getElementById('delivery-otra');
  v = String(v == null ? '' : v);

  /* Sin dato: vuelve a la opción vacía y se limpia TAMBIÉN el campo libre.
     Va antes del recorrido de opciones y no dentro, porque la opción vacía
     también matchea por valor: saliendo por ahí, el texto de la cotización
     anterior quedaba escondido en el input y reaparecía al elegir "Otra…". */
  if(v === ''){
    sel.value = '';
    if(libre) libre.value = '';
    cevenToggleDeliveryOtra();
    return;
  }

  for(var i = 0; i < sel.options.length; i++){
    if(sel.options[i].value === v && v !== CEVEN_ENTREGA_OTRA){
      sel.value = v;
      cevenToggleDeliveryOtra();
      return;
    }
  }
  sel.value = CEVEN_ENTREGA_OTRA;
  if(libre) libre.value = v;
  cevenToggleDeliveryOtra();
}

/* Muestra u esconde el campo libre. `foco` solo lo manda el onchange del
   selector: al restaurar una cotización guardada, robarle el foco al usuario
   sin que haya tocado nada mueve el scroll hasta las condiciones comerciales. */
function cevenToggleDeliveryOtra(foco){
  var sel   = document.getElementById('delivery');
  var libre = document.getElementById('delivery-otra');
  if(!sel || !libre) return;
  var otra = sel.value === CEVEN_ENTREGA_OTRA;
  libre.style.display = otra ? '' : 'none';
  if(otra && foco) libre.focus();
}

/* La entrega inmediata es la única que los documentos destacan (en verde): es
   un argumento de venta y conviene que salte a la vista.

   Se compara con el texto completo, sin distinguir mayúsculas ni espacios de
   más, así que también agarra a quien lo haya escrito a mano en el campo libre
   o a una cotización vieja de cuando esto era un input. NO se busca la palabra
   suelta adentro de la frase: "no inmediata" o "inmediata sujeta a stock" son
   justamente los casos en los que pintar de verde engañaría. */
function cevenEntregaEsInmediata(v){
  return /^inmediata$/i.test(String(v == null ? '' : v).trim());
}

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

// El errbox inline (arriba del importador de Excel) se pasaba por alto: quedaba
// fuera de foco o scrolleado, así que un archivo mal formado fallaba en
// silencio para el usuario. Ahora, además de escribir el errbox, un error
// real (m truthy) abre el popup centrado — imposible de no ver. Llamar con
// '' sigue limpiando el errbox sin abrir nada, como antes.
function showErr(m) {
  var e = document.getElementById('errbox');
  if(e){ e.textContent = m || ''; e.style.display = m ? 'block' : 'none'; }
  if(m && typeof showErrorPopup === 'function') showErrorPopup(m);
}

function toggleTC() {
  var tc = document.getElementById('tc');
  var cond = document.getElementById('cond-cur');
  if(tc) tc.style.display = getCur()==='ARS' ? 'block' : 'none';
  if(cond) cond.textContent = getCur()==='ARS' ? 'Precios unitarios expresados en pesos argentinos' : 'Precios unitarios expresados en dólares estadounidenses';
}
