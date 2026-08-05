/* ============================================================
   NOTIFICACIONES  ·  Cotizadores Ceven  (compartido por el shell
   y todos los cotizadores de marca)
   ------------------------------------------------------------
   Reemplaza alert()/confirm()/prompt() nativos del navegador:
   - showToast(msg, opts): cartel apilable en la esquina inferior
     derecha, se cierra solo a los 5s. opts.actionLabel/onAction
     agrega un botón (ej. "Deshacer").
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
  var box = document.createElement('div');
  box.style.cssText = 'display:flex;align-items:center;gap:10px;background:#1d1d1f;color:#fff;'
    + 'border-radius:12px;padding:10px 10px 10px 16px;font-size:13px;line-height:1.4;'
    + 'box-shadow:0 6px 24px rgba(0,0,0,.18);max-width:360px;pointer-events:auto';
  var span = document.createElement('span');
  span.textContent = msg;
  span.style.cssText = 'flex:1';
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
  timer = setTimeout(close, 5000);
  return close;
}
// Atajo para el patrón "hacé la acción y avisá con botón para deshacer".
function notifyUndo(msg, onUndo){
  showToast(msg, {actionLabel: 'Deshacer', onAction: onUndo});
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
        + '<button data-cancel style="border:0.5px solid #d2d2d7;border-radius:980px;padding:8px 16px;font-size:13px;font-weight:500;cursor:pointer;background:#fff;color:#1d1d1f;font-family:inherit">Cancelar</button>'
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
