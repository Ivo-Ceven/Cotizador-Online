/* ============================================================
   NOTIFICACIONES  ·  Cotizadores Ceven  (compartido por el shell
   y todos los cotizadores de marca)
   ------------------------------------------------------------
   Reemplaza alert()/confirm()/prompt() nativos del navegador:
   - showToast(msg, opts): cartel apilable en la esquina inferior
     derecha, se cierra solo a los 5s. opts.actionLabel/onAction
     agrega un botón (ej. "Deshacer"). opts.type ('success'|
     'warning'|'error'|'info') fuerza el estilo; si no se pasa,
     se infiere del texto (ver _inferToastType). Los tipos 'error' Y
     'warning' NO van como cartel de esquina —se pueden perder de
     vista sin leerlos—: redirigen a showErrorPopup(), un popup
     CENTRADO que no se autocierra (rojo + "Error" para error, ámbar
     + "Aviso" para warning). opts.forceToast:true deja el aviso como
     cartel de esquina igual (notifyUndo() lo hace siempre).
   - showSuccess(msg, opts) / showWarning(msg, opts): atajos que
     fuerzan el tipo, para cuando el texto del mensaje no alcanza
     para inferirlo solo (ej. viene armado con datos dinámicos).
   - showError(msg, opts): atajo que siempre abre showErrorPopup(),
     sin pasar por el cartel ni por la inferencia de texto — usalo
     cuando el mensaje puede traer texto de una excepción o de una
     API externa (err.message) que no va a matchear ningún patrón.
   - showErrorPopup(message, opts): popup centrado en pantalla (no
     es un popup del navegador, es HTML propio) para errores reales
     — no se autocierra, requiere que el usuario lo cierre.
   - notifyUndo(msg, onUndo): atajo para el patrón "hacé la acción
     y avisá con botón para deshacer" — nunca bloquea con un popup
     antes de actuar.
   - promptModal(title, defaultValue, onSubmit, opts): reemplaza
     prompt(). No es un popup del navegador, es HTML propio.
   - confirmModal(message, onConfirm, opts): reemplaza confirm()
     para los pocos casos que SÍ necesitan bloquear antes de actuar
     (operaciones irreversibles que además recargan la página, como
     restaurar un backup completo) — sin auto-cierre a los 5s,
     porque ahí perderse el cartel sería peligroso.
   ============================================================ */

// Adivina si un mensaje es de éxito ("✓ ..."), advertencia (bloquea la
// acción por una regla de negocio o dato faltante) o error real (algo
// se rompió). Cubre las convenciones de texto que ya se usaban en toda
// la app antes de que existieran los tipos; los call sites viejos no
// necesitan tocarse. Cuando el mensaje es dinámico y puede no matchear
// nada (ej. err.message de una excepción), no confíes en esto — usá
// showError() explícitamente.
function _inferToastType(msg){
  var s = String(msg == null ? '' : msg);
  if(/^\s*✓/.test(s)) return 'success';
  if(/^\s*(⚠|ojo:)/i.test(s)) return 'warning';
  if(/\berror\b/i.test(s) || /no cargó/i.test(s) || /\bno se pudo\b/i.test(s)
     || /\bno pudo\b/i.test(s) || /almacenamiento lleno/i.test(s)) return 'error';
  // Sin \b al final de estos verbos: terminan en vocal acentuada (cargá,
  // ingresá) y \b de JS solo reconoce [A-Za-z0-9_] como "de palabra" — una
  // tilde ahí nunca genera el corte, así que el \b no matcheaba nunca.
  if(/no ten[eé]s permiso/i.test(s) || /^(carg[aá]|elegí|ingres[aá]|cont[aá])/i.test(s)
     || /est[aá] vac[ií][ao]/i.test(s) || /ya existe/i.test(s) || /ya no est[aá]/i.test(s)
     || /no se encontr/i.test(s) || /\bno hay\b/i.test(s)
     // Avisos que FRENAN una acción: "no se puede…", "quitala/sacala… primero",
     // "… antes de borrar/guardar/…". Van centrados como el resto.
     || /\bno se puede\b/i.test(s) || /\bquit[aá]l[ao]s?\b/i.test(s) || /\bsac[aá]l[ao]s?\b/i.test(s)
     || /\bantes de (borrar|eliminar|guardar|seguir|continuar|cerrar)/i.test(s)) return 'warning';
  return 'info';
}

/* ── HISTORIAL Y VISOR DE NOTIFICACIONES ─────────────────────────────────────
   Los carteles se van solos y a veces traen mucho texto (el aviso de un
   split de cotizaciones, el resultado de una importación). Todo lo que pasa
   por showToast()/showErrorPopup() queda además en un historial: los últimos
   _NOTIF_MAX avisos con hora y tipo, que sobreviven al recargar la página.

   El visor es un panel lateral que se abre con la campana (aparece abajo a la
   izquierda en cuanto hay algo para ver) o tocando un cartel. Muestra el texto
   COMPLETO, el más nuevo arriba. Los botones de acción ("Deshacer", "Ver")
   no se guardan: son funciones de esa sesión y ya no valen al rato.

   Todo el acceso a localStorage va en try/catch: sin almacenamiento (modo
   privado, cuota) el historial vive en memoria hasta cerrar la pestaña. */
var _NOTIF_KEY = 'ceven_notif_log_v1';
var _NOTIF_SEEN_KEY = 'ceven_notif_seen_v1';
var _NOTIF_MAX = 60;
var _notifMem = null;

function _notifLoad(){
  if(_notifMem) return _notifMem;
  var arr = [];
  try{ arr = JSON.parse(localStorage.getItem(_NOTIF_KEY) || '[]'); }catch(e){ arr = []; }
  _notifMem = Array.isArray(arr) ? arr : [];
  return _notifMem;
}
function _notifSave(){
  try{ localStorage.setItem(_NOTIF_KEY, JSON.stringify(_notifMem || [])); }catch(e){}
}
function _notifSeen(){
  try{ return Number(localStorage.getItem(_NOTIF_SEEN_KEY)) || 0; }catch(e){ return _notifSeenMem || 0; }
}
var _notifSeenMem = 0;
function _notifMarkSeen(){
  _notifSeenMem = Date.now();
  try{ localStorage.setItem(_NOTIF_SEEN_KEY, String(_notifSeenMem)); }catch(e){}
}

// Agrega un aviso al historial. `type`: success | info | warning | error.
function _notifLog(msg, type){
  var text = String(msg == null ? '' : msg).replace(/^\s*(✓|⚠)\s*/, '').trim();
  if(!text) return;
  if(text.length > 4000) text = text.slice(0, 4000) + '…';
  _notifMem = null;                       // relee: puede haber escrito otra pestaña
  var arr = _notifLoad();
  var ult = arr[arr.length - 1], ahora = Date.now();
  if(ult && ult.msg === text && ahora - ult.t < 2000) return;   // rebote del mismo aviso
  arr.push({t: ahora, type: type || 'info', msg: text});
  while(arr.length > _NOTIF_MAX) arr.shift();
  _notifSave();
  _notifBell();
}

function _notifNoVistos(){
  var visto = _notifSeen();
  return _notifLoad().filter(function(n){ return n.t > visto; }).length;
}

// La campana: se crea la primera vez que hay algo para ver, no antes (en las
// páginas donde nunca salta un aviso no aparece nada).
function _notifBell(){
  if(typeof document === 'undefined' || !document.body) return;
  var b = document.getElementById('ceven-notif-bell');
  if(!b){
    b = document.createElement('button');
    b.id = 'ceven-notif-bell';
    b.title = 'Ver las últimas notificaciones';
    b.setAttribute && b.setAttribute('aria-label', 'Ver las últimas notificaciones');
    var hasVerBar = !!document.getElementById('app-ver-bar');
    b.style.cssText = 'position:fixed;left:16px;bottom:' + (hasVerBar ? 30 : 16) + 'px;z-index:99998;'
      + 'width:38px;height:38px;border-radius:50%;border:0.5px solid #d2d2d7;background:#fff;'
      + 'box-shadow:0 4px 14px rgba(0,0,0,.15);cursor:pointer;font-size:17px;line-height:1;'
      + 'display:flex;align-items:center;justify-content:center;font-family:inherit;padding:0';
    var ico = document.createElement('span');
    ico.textContent = '🔔';
    b.appendChild(ico);
    var cnt = document.createElement('span');
    cnt.id = 'ceven-notif-count';
    cnt.style.cssText = 'position:absolute;top:-4px;right:-4px;min-width:17px;height:17px;border-radius:9px;'
      + 'background:#d70015;color:#fff;font-size:10px;font-weight:700;display:none;align-items:center;'
      + 'justify-content:center;padding:0 4px;box-sizing:border-box';
    b.appendChild(cnt);
    b._count = cnt;
    b.onclick = function(){ cevenNotifAbrir(); };
    document.body.appendChild(b);
  }
  var n = _notifNoVistos();
  if(b._count){
    b._count.textContent = n > 9 ? '9+' : String(n);
    b._count.style.display = n > 0 ? 'flex' : 'none';
  }
}

var _NOTIF_COLORES = {success: '#30d158', warning: '#ff9f0a', error: '#ff3b30', info: '#8e8e93'};
var _NOTIF_ROTULOS = {success: 'Listo', warning: 'Aviso', error: 'Error', info: 'Info'};

function _notifHora(t){
  var d = new Date(t), p = function(n){ return (n < 10 ? '0' : '') + n; };
  var hoy = new Date();
  var mismo = d.getFullYear() === hoy.getFullYear() && d.getMonth() === hoy.getMonth() && d.getDate() === hoy.getDate();
  return (mismo ? '' : p(d.getDate()) + '/' + p(d.getMonth() + 1) + ' ') + p(d.getHours()) + ':' + p(d.getMinutes());
}

// Abre (o cierra, si ya está abierto) el panel con el historial completo.
function cevenNotifAbrir(){
  var old = document.getElementById('ceven-notif-panel');
  if(old){ if(old.parentNode) old.parentNode.removeChild(old); return; }
  var vistoAntes = _notifSeen();
  _notifMem = null;
  var items = _notifLoad().slice().reverse();

  var wrap = document.createElement('div');
  wrap.id = 'ceven-notif-panel';
  wrap.style.cssText = 'position:fixed;inset:0;z-index:100000;background:rgba(0,0,0,.25);display:flex;'
    + 'justify-content:flex-end;font-family:-apple-system,BlinkMacSystemFont,sans-serif';
  var panel = document.createElement('div');
  panel.style.cssText = 'background:#fff;width:440px;max-width:100vw;height:100%;display:flex;flex-direction:column;'
    + 'box-shadow:-10px 0 40px rgba(0,0,0,.18);color:#1d1d1f';
  var head = document.createElement('div');
  head.style.cssText = 'display:flex;align-items:center;gap:8px;padding:16px 18px;border-bottom:0.5px solid #e5e5e7';
  var tit = document.createElement('div');
  tit.textContent = 'Notificaciones';
  tit.style.cssText = 'flex:1;font-size:16px;font-weight:700';
  head.appendChild(tit);
  var vaciar = document.createElement('button');
  vaciar.textContent = 'Vaciar';
  vaciar.title = 'Borrar el historial';
  vaciar.style.cssText = 'border:0.5px solid #d2d2d7;border-radius:980px;padding:6px 13px;font-size:12px;font-weight:500;'
    + 'cursor:pointer;background:#fff;color:#1d1d1f;font-family:inherit';
  head.appendChild(vaciar);
  var x = document.createElement('button');
  x.textContent = '×';
  x.title = 'Cerrar';
  x.style.cssText = 'border:none;background:none;color:#8e8e93;font-size:24px;line-height:1;cursor:pointer;padding:0 4px;font-family:inherit';
  head.appendChild(x);
  panel.appendChild(head);

  var lista = document.createElement('div');
  lista.style.cssText = 'flex:1;overflow-y:auto;padding:6px 0';
  if(!items.length){
    var vacio = document.createElement('div');
    vacio.textContent = 'No hay notificaciones todavía.';
    vacio.style.cssText = 'padding:28px 18px;font-size:13px;color:#8e8e93;text-align:center';
    lista.appendChild(vacio);
  }
  items.forEach(function(n){
    var fila = document.createElement('div');
    fila.style.cssText = 'padding:12px 18px;border-bottom:0.5px solid #f0f0f2;'
      + (n.t > vistoAntes ? 'background:#f5f9ff' : '');
    var meta = document.createElement('div');
    meta.style.cssText = 'display:flex;align-items:center;gap:7px;margin-bottom:5px;font-size:11px;color:#6e6e73;font-weight:600';
    var dot = document.createElement('span');
    dot.style.cssText = 'width:8px;height:8px;border-radius:50%;flex-shrink:0;background:' + (_NOTIF_COLORES[n.type] || _NOTIF_COLORES.info);
    meta.appendChild(dot);
    var rot = document.createElement('span');
    rot.textContent = (_NOTIF_ROTULOS[n.type] || 'Info') + ' · ' + _notifHora(n.t);
    meta.appendChild(rot);
    fila.appendChild(meta);
    var txt = document.createElement('div');
    txt.textContent = n.msg;
    txt.style.cssText = 'font-size:13px;line-height:1.5;white-space:pre-wrap;word-break:break-word;user-select:text';
    fila.appendChild(txt);
    lista.appendChild(fila);
  });
  panel.appendChild(lista);
  wrap.appendChild(panel);
  document.body.appendChild(wrap);

  function cerrar(){
    document.removeEventListener('keydown', onKey);
    if(wrap.parentNode) wrap.parentNode.removeChild(wrap);
    _notifMarkSeen();
    _notifBell();
  }
  function onKey(ev){ if(ev.key === 'Escape') cerrar(); }
  document.addEventListener('keydown', onKey);
  x.onclick = cerrar;
  wrap.onclick = function(ev){ if(ev.target === wrap) cerrar(); };
  vaciar.onclick = function(){
    _notifMem = []; _notifSave(); cerrar();
  };
  _notifMarkSeen();
  _notifBell();
}

// Cuánto dura un cartel: 5 s los cortos; los largos, lo que lleve leerlos
// (unos 45 ms por carácter pasado de los 80), con tope de 25 s.
function _toastDuracion(texto, tieneAccion){
  var extra = Math.max(0, String(texto || '').length - 80) * 45;
  return Math.min(25000, 5000 + extra + (tieneAccion ? 3000 : 0));
}

function _toastStack(){
  var el = document.getElementById('ceven-toast-stack');
  if(!el){
    el = document.createElement('div');
    el.id = 'ceven-toast-stack';
    var hasVerBar = !!document.getElementById('app-ver-bar');
    el.style.cssText = 'position:fixed;right:16px;bottom:'+(hasVerBar?30:16)+'px;z-index:99999;'
      + 'display:flex;flex-direction:column-reverse;gap:8px;align-items:flex-end;max-width:calc(100vw - 32px);'
      + 'font-family:-apple-system,BlinkMacSystemFont,sans-serif';
    document.body.appendChild(el);
  }
  return el;
}
function showToast(msg, opts){
  opts = opts || {};
  var type = opts.type || _inferToastType(msg);
  _notifLog(msg, type);   // queda en el historial aunque el cartel se vaya solo
  // Un error o un aviso que frena una acción no se muestra como cartel de
  // esquina — se puede perder de vista sin que el usuario llegue a leer qué
  // pasó. Va como popup centrado (showErrorPopup), salvo que el caller pida
  // lo contrario con forceToast.
  if((type === 'error' || type === 'warning') && !opts.forceToast){
    var o = {}; for(var k in opts) o[k] = opts[k];
    if(type === 'warning') o.severity = 'warning';
    o._logged = true;
    return showErrorPopup(msg, o);
  }
  var ACCENTS = {
    success: {bg:'#30d158', fg:'#04260f', icon:'✓'},
    warning: {bg:'#ff9f0a', fg:'#3a2200', icon:'!'}
  };
  var accent = ACCENTS[type];
  var clean = String(msg == null ? '' : msg).replace(/^\s*(✓|⚠)\s*/, '');
  var box = document.createElement('div');
  box.style.cssText = 'display:flex;align-items:center;gap:10px;background:#1d1d1f;color:#fff;'
    + 'border-radius:12px;padding:10px 10px 10px '+(accent ? '12px' : '16px')+';font-size:13px;line-height:1.4;'
    + 'box-shadow:0 6px 24px rgba(0,0,0,.18);max-width:360px;pointer-events:auto';
  if(accent){
    var badge = document.createElement('span');
    badge.textContent = accent.icon;
    badge.style.cssText = 'flex-shrink:0;width:20px;height:20px;border-radius:50%;background:'+accent.bg+';'
      + 'color:'+accent.fg+';display:flex;align-items:center;justify-content:center;font-size:12px;'
      + 'font-weight:700;line-height:1';
    box.appendChild(badge);
  }
  var span = document.createElement('span');
  span.textContent = clean;
  // Un texto largo se recorta a 5 líneas en el cartel; el completo está en el
  // visor (se abre tocando el cartel o la campana).
  span.style.cssText = 'flex:1;display:-webkit-box;-webkit-line-clamp:5;-webkit-box-orient:vertical;'
    + 'overflow:hidden;cursor:pointer;word-break:break-word';
  span.title = 'Tocá para ver todas las notificaciones';
  span.onclick = function(){ close(); cevenNotifAbrir(); };
  box.appendChild(span);
  var timer;
  function close(){ clearTimeout(timer); if(box.parentNode) box.parentNode.removeChild(box); }
  if(opts.actionLabel && opts.onAction){
    var btn = document.createElement('button');
    btn.textContent = opts.actionLabel;
    btn.style.cssText = 'border:none;border-radius:980px;padding:6px 13px;font-size:12px;font-weight:600;'
      + 'cursor:pointer;background:#fff;color:#1d1d1f;font-family:inherit;white-space:nowrap;flex-shrink:0';
    btn.onclick = function(){ close(); opts.onAction(); };
    box.appendChild(btn);
  }
  var xBtn = document.createElement('button');
  xBtn.textContent = '×';
  xBtn.title = 'Cerrar';
  xBtn.style.cssText = 'border:none;background:none;color:#8e8e93;font-size:17px;line-height:1;'
    + 'cursor:pointer;padding:0 2px;font-family:inherit;flex-shrink:0';
  xBtn.onclick = close;
  box.appendChild(xBtn);
  _toastStack().appendChild(box);
  var dur = _toastDuracion(clean, !!(opts.actionLabel && opts.onAction));
  timer = setTimeout(close, dur);
  // Con el mouse encima no se va (se está leyendo); al sacarlo, 3 s más.
  if(box.addEventListener){
    box.addEventListener('mouseenter', function(){ clearTimeout(timer); });
    box.addEventListener('mouseleave', function(){ clearTimeout(timer); timer = setTimeout(close, 3000); });
  }
  return close;
}
// Atajo para el patrón "hacé la acción y avisá con botón para deshacer".
// forceToast: la acción YA se hizo, el aviso no frena nada — va como cartel de
// esquina aunque el texto ("no se pudo…", "ya no está…") infiera como error o
// warning y lo mandaría al popup centrado.
function notifyUndo(msg, onUndo){
  showToast(msg, {actionLabel: 'Deshacer', onAction: onUndo, forceToast: true});
}

// Atajos para forzar el tipo cuando el texto del mensaje no alcanza para
// que _inferToastType() lo adivine solo (ej. viene armado con datos que no
// van a matchear ningún patrón fijo).
function showSuccess(msg, opts){
  opts = opts || {};
  var o = {}; for(var k in opts) o[k] = opts[k];
  o.type = 'success';
  return showToast(msg, o);
}
function showWarning(msg, opts){
  opts = opts || {};
  var o = {}; for(var k in opts) o[k] = opts[k];
  o.type = 'warning';
  return showToast(msg, o);
}
// A diferencia de showToast() con un mensaje que matchea como error, esto
// SIEMPRE abre el popup centrado, sin depender de que el texto contenga
// "error" o "no se pudo" — imprescindible cuando el mensaje trae texto de
// una excepción o de una respuesta de API (err.message) que puede ser
// cualquier cosa.
function showError(msg, opts){
  return showErrorPopup(msg, opts);
}

// ── Popup CENTRADO — no es un popup del navegador, es HTML propio. Lo usan
// tanto los errores reales como los avisos que frenan una acción (showToast
// con type 'error' o 'warning' redirige acá). A diferencia de showToast(), no
// se autocierra: un aviso que se pierde de vista sin que el usuario lo lea es
// peor que uno que lo obliga a cerrarlo.
//   opts.severity : 'error' (default) | 'warning' — cambia color y título.
//   opts.title    : default "Error" / "Aviso" según severity.
//   opts.okLabel  : default "Entendido".
//   opts.actionLabel/onAction : botón secundario (ej. "Reintentar").
function showErrorPopup(message, opts){
  opts = opts || {};
  var warn = (opts.severity === 'warning');
  if(!opts._logged) _notifLog(message, warn ? 'warning' : 'error');
  var badgeBg = warn ? '#fff4e0' : '#fde8e6';
  var badgeFg = warn ? '#a05c00' : '#d70015';
  var okBg    = warn ? '#1d1d1f' : '#d70015';
  var title   = opts.title || (warn ? 'Aviso' : 'Error');

  var old = document.getElementById('ceven-error-modal');
  if(old) old.parentNode.removeChild(old);
  var wrap = document.createElement('div');
  wrap.id = 'ceven-error-modal';
  wrap.style.cssText = 'position:fixed;inset:0;z-index:100001;background:rgba(0,0,0,.4);display:flex;'
    + 'align-items:center;justify-content:center;font-family:-apple-system,BlinkMacSystemFont,sans-serif';
  wrap.innerHTML =
    '<div style="background:#fff;border:0.5px solid #d2d2d7;border-radius:16px;padding:24px;width:380px;max-width:92vw;box-shadow:0 10px 40px rgba(0,0,0,.2)">'
      + '<div style="display:flex;align-items:center;gap:10px;margin-bottom:14px">'
        + '<span style="flex-shrink:0;width:32px;height:32px;border-radius:50%;background:'+badgeBg+';color:'+badgeFg+';'
          + 'display:flex;align-items:center;justify-content:center;font-size:17px;font-weight:800">!</span>'
        + '<div style="font-size:16px;font-weight:700;color:#1d1d1f">'+title+'</div>'
      + '</div>'
      + '<div data-txt style="font-size:14px;color:#1d1d1f;line-height:1.5;margin-bottom:20px;white-space:pre-line"></div>'
      + '<div style="display:flex;gap:8px;justify-content:flex-end">'
        + (opts.actionLabel && opts.onAction
            ? '<button data-action style="border:0.5px solid #d2d2d7;border-radius:980px;padding:8px 16px;font-size:13px;font-weight:500;cursor:pointer;background:#fff;color:#1d1d1f;font-family:inherit">'+opts.actionLabel+'</button>'
            : '')
        + '<button data-ok style="border:none;border-radius:980px;padding:8px 18px;font-size:13px;font-weight:600;cursor:pointer;background:'+okBg+';color:#fff;font-family:inherit">'+(opts.okLabel || 'Entendido')+'</button>'
      + '</div>'
    + '</div>';
  document.body.appendChild(wrap);
  // El título ya dice "Error"/"Aviso" — si el mensaje repite "Error:" o el "⚠"
  // al principio (convención vieja de showErr/showToast) quedaría duplicado.
  var bodyText = String(message == null ? '' : message).replace(/^\s*(✓|⚠)\s*/, '');
  if(!warn) bodyText = bodyText.replace(/^\s*error\b[:\s]*/i, '');
  wrap.querySelector('[data-txt]').textContent = bodyText;
  function close(){
    document.removeEventListener('keydown', onKey);
    if(wrap.parentNode) wrap.parentNode.removeChild(wrap);
  }
  function onKey(ev){ if(ev.key === 'Escape') close(); }
  document.addEventListener('keydown', onKey);
  wrap.querySelector('[data-ok]').onclick = close;
  var actionBtn = wrap.querySelector('[data-action]');
  if(actionBtn) actionBtn.onclick = function(){ close(); opts.onAction(); };
  wrap.onclick = function(ev){ if(ev.target===wrap) close(); };
  return close;
}

// ── Modal genérico (reemplaza prompt()) — no es un popup del navegador, es HTML propio. ──
function promptModal(title, defaultValue, onSubmit, opts){
  opts = opts || {};
  var old = document.getElementById('ceven-generic-modal');
  if(old) old.parentNode.removeChild(old);
  var wrap = document.createElement('div');
  wrap.id = 'ceven-generic-modal';
  wrap.style.cssText = 'position:fixed;inset:0;z-index:100000;background:rgba(0,0,0,.3);display:flex;align-items:center;justify-content:center;font-family:-apple-system,BlinkMacSystemFont,sans-serif';
  wrap.innerHTML =
    '<div style="background:#fff;border:0.5px solid #d2d2d7;border-radius:16px;padding:24px;width:360px;max-width:92vw;box-shadow:0 10px 40px rgba(0,0,0,.15)">'
      + '<div data-txt style="font-size:15px;font-weight:600;color:#1d1d1f;margin-bottom:14px"></div>'
      + '<input type="text" style="border:0.5px solid #d2d2d7;border-radius:8px;padding:9px 11px;font-size:14px;width:100%;outline:none;margin-bottom:14px;box-sizing:border-box;font-family:inherit">'
      + '<div style="display:flex;gap:8px;justify-content:flex-end">'
        + '<button data-cancel style="border:0.5px solid #d2d2d7;border-radius:980px;padding:8px 16px;font-size:13px;font-weight:500;cursor:pointer;background:#fff;color:#1d1d1f;font-family:inherit">Cancelar</button>'
        + '<button data-ok style="border:none;border-radius:980px;padding:8px 16px;font-size:13px;font-weight:500;cursor:pointer;background:#1d1d1f;color:#fff;font-family:inherit">'+(opts.okLabel||'Guardar')+'</button>'
      + '</div>'
    + '</div>';
  document.body.appendChild(wrap);
  /* `[data-txt]` y NO `div>div`. El selector viejo estaba roto y se llevaba
     puesto el modal entero: `wrap` TAMBIEN es un div, asi que `div>div` matchea
     primero la TARJETA (hija de wrap) y no el parrafo de adentro. Ponerle
     textContent a la tarjeta borraba el input y los dos botones, y quedaba un
     cartel con el titulo y nada mas — imposible de confirmar salvo clickeando
     el fondo, que cancela.

     No era teorico: rompia el numero de factura del pipeline de Poly, la
     restauracion de backup, la recuperacion de datos y el alta de equipos del
     tablero. querySelector() con un combinador puede usar ancestros de fuera
     del elemento raiz para satisfacer el selector; solo el ultimo compuesto
     tiene que caer adentro. */
  wrap.querySelector('[data-txt]').textContent = title;
  var input = wrap.querySelector('input');
  input.value = defaultValue || '';
  function close(){ if(wrap.parentNode) wrap.parentNode.removeChild(wrap); }
  function submit(){ var v = input.value; close(); onSubmit(v); }
  wrap.querySelector('[data-ok]').onclick = submit;
  wrap.querySelector('[data-cancel]').onclick = close;
  wrap.onclick = function(ev){ if(ev.target===wrap) close(); };
  input.onkeydown = function(ev){
    if(ev.key === 'Enter'){ ev.preventDefault(); submit(); }
    if(ev.key === 'Escape') close();
  };
  input.focus(); input.select();
}

// ── Modal de confirmación SIN auto-cierre — reservado para operaciones que
// recargan la página y pisan datos locales sin vuelta atrás (restaurar backup).
// Ahí un cartel que se cierra solo a los 5s sería peligroso: si no llegás a
// reaccionar a tiempo, la acción sigue igual sin que hayas confirmado nada.
function confirmModal(message, onConfirm, opts){
  opts = opts || {};
  var old = document.getElementById('ceven-generic-modal');
  if(old) old.parentNode.removeChild(old);
  var wrap = document.createElement('div');
  wrap.id = 'ceven-generic-modal';
  wrap.style.cssText = 'position:fixed;inset:0;z-index:100000;background:rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;font-family:-apple-system,BlinkMacSystemFont,sans-serif';
  wrap.innerHTML =
    '<div style="background:#fff;border:0.5px solid #d2d2d7;border-radius:16px;padding:22px;width:380px;max-width:92vw;box-shadow:0 10px 40px rgba(0,0,0,.15)">'
      + '<div data-txt style="font-size:14px;color:#1d1d1f;line-height:1.5;margin-bottom:18px;white-space:pre-line"></div>'
      + '<div style="display:flex;gap:8px;justify-content:flex-end">'
        + '<button data-cancel style="border:0.5px solid #d2d2d7;border-radius:980px;padding:8px 16px;font-size:13px;font-weight:500;cursor:pointer;background:#fff;color:#1d1d1f;font-family:inherit">'+(opts.cancelLabel||'Cancelar')+'</button>'
        + '<button data-ok style="border:none;border-radius:980px;padding:8px 16px;font-size:13px;font-weight:600;cursor:pointer;background:'+(opts.danger?'#d70015':'#1d1d1f')+';color:#fff;font-family:inherit">'+(opts.okLabel||'Confirmar')+'</button>'
      + '</div>'
    + '</div>';
  document.body.appendChild(wrap);
  // Ver el comentario de promptModal(): `div>div` matcheaba la tarjeta entera.
  wrap.querySelector('[data-txt]').textContent = message;
  function close(){ if(wrap.parentNode) wrap.parentNode.removeChild(wrap); }
  wrap.querySelector('[data-ok]').onclick = function(){ close(); onConfirm(); };
  wrap.querySelector('[data-cancel]').onclick = close;
  wrap.onclick = function(ev){ if(ev.target===wrap) close(); };
}
