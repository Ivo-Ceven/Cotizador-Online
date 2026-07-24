/* ============================================================
   PWA  ·  Cotizadores Ceven  (compartido por el shell y las marcas)
   ------------------------------------------------------------
   - Registra sw.js (raíz del sitio → scope "/"). La versión NO se pasa
     desde acá: el worker importa APP_VERSION de config.js él mismo, así
     que subir esa constante lo reinstala en la carga siguiente.
   - Aviso "Nueva versión disponible" con botón Actualizar. No se
     recarga solo: el usuario puede estar armando una cotización.
   - Botón "Instalar app" cuando el navegador lo ofrece.
   - Pastilla "Sin conexión" (la sync con Supabase queda en pausa).

   Todo lo visual se inyecta por JS para no duplicar markup en cada
   página. Se carga al final del <body>, después de config.js.
   ============================================================ */
(function(){
  /* En file:// no hay service workers (y no hace falta: ya es local). */
  if(!('serviceWorker' in navigator) || location.protocol === 'file:') return;

  var self_ = document.currentScript && document.currentScript.src;
  if(!self_) return;
  var root  = new URL('../', self_);                 // .../shared/pwa.js → raíz del sitio
  var swUrl = new URL('sw.js', root).href;

  /* Si ya había un worker controlando la página, un cambio de controlador
     significa "se activó la versión nueva" → recargar. En la PRIMERA visita
     el controlador aparece por clients.claim() y recargar sería molesto. */
  var hadController = !!navigator.serviceWorker.controller;
  var reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', function(){
    if(!hadController || reloading) return;
    reloading = true;
    location.reload();
  });

  window.addEventListener('load', function(){
    navigator.serviceWorker.register(swUrl, {scope: root.pathname}).then(function(reg){
      if(reg.waiting && navigator.serviceWorker.controller) showUpdate(reg);
      reg.addEventListener('updatefound', function(){
        var sw = reg.installing;
        if(!sw) return;
        sw.addEventListener('statechange', function(){
          if(sw.state === 'installed' && navigator.serviceWorker.controller) showUpdate(reg);
        });
      });
    }).catch(function(err){
      console.warn('[pwa] no se pudo registrar el service worker:', err);
    });
  });

  /* ---- UI ---- */
  var PILL = 'border:0.5px solid #d2d2d7;border-radius:980px;padding:8px 14px;font-size:13px;' +
             'font-weight:500;background:#fff;color:#1d1d1f;font-family:inherit;' +
             'box-shadow:0 2px 10px rgba(0,0,0,.08)';

  /* Columna abajo a la izquierda. En el cotizador esquiva el zócalo de versión
     (#app-ver-bar, fijo abajo con z-index 9999); en el shell no existe. */
  function bar(){
    var el = document.getElementById('ceven-pwa-bar');
    if(el) return el;
    el = document.createElement('div');
    el.id = 'ceven-pwa-bar';
    el.style.cssText = 'position:fixed;left:16px;bottom:' +
      (document.getElementById('app-ver-bar') ? 34 : 16) + 'px;z-index:9500;display:flex;' +
      'flex-direction:column;align-items:flex-start;gap:8px;' +
      'font-family:-apple-system,BlinkMacSystemFont,sans-serif';
    document.body.appendChild(el);
    return el;
  }
  function drop(id){
    var el = document.getElementById(id);
    if(el && el.parentNode) el.parentNode.removeChild(el);
  }

  function showUpdate(reg){
    if(document.getElementById('ceven-pwa-update')) return;
    var box = document.createElement('div');
    box.id = 'ceven-pwa-update';
    box.style.cssText = 'display:flex;align-items:center;gap:10px;background:#1d1d1f;color:#fff;' +
      'border-radius:12px;padding:9px 10px 9px 14px;font-size:13px;box-shadow:0 6px 24px rgba(0,0,0,.18)';
    box.innerHTML = '<span>Nueva versión disponible</span>';

    var ok = document.createElement('button');
    ok.textContent = 'Actualizar';
    ok.style.cssText = 'border:none;border-radius:980px;padding:6px 14px;font-size:13px;font-weight:500;' +
      'cursor:pointer;background:#fff;color:#1d1d1f;font-family:inherit';
    ok.onclick = function(){
      ok.disabled = true;
      ok.textContent = 'Actualizando…';
      /* El worker que espera hace skipWaiting() → activate → controllerchange → recarga. */
      if(reg.waiting) reg.waiting.postMessage({type: 'SKIP_WAITING'});
      else location.reload();
    };
    box.appendChild(ok);

    var no = document.createElement('button');
    no.textContent = '×';
    no.title = 'Ahora no (se vuelve a ofrecer en la próxima carga)';
    no.style.cssText = 'border:none;background:none;color:#8e8e93;font-size:17px;line-height:1;' +
      'cursor:pointer;font-family:inherit;padding:0 4px';
    no.onclick = function(){ drop('ceven-pwa-update'); };
    box.appendChild(no);

    bar().appendChild(box);
  }

  /* ---- Instalar ---- */
  var installEvent = null;
  window.addEventListener('beforeinstallprompt', function(e){
    e.preventDefault();               // se dispara con nuestro botón, no con el del navegador
    installEvent = e;
    if(document.body) showInstall();
  });
  window.addEventListener('appinstalled', function(){
    installEvent = null;
    drop('ceven-pwa-install');
  });
  function showInstall(){
    if(!installEvent || document.getElementById('ceven-pwa-install')) return;
    var btn = document.createElement('button');
    btn.id = 'ceven-pwa-install';
    btn.type = 'button';
    btn.textContent = '⬇ Instalar app';
    btn.title = 'Instalar Cotizadores Ceven en este equipo';
    btn.style.cssText = PILL + ';cursor:pointer';
    btn.onclick = function(){
      if(!installEvent) return;
      var ev = installEvent;
      installEvent = null;            // el evento no se puede reusar
      drop('ceven-pwa-install');
      ev.prompt();
    };
    bar().appendChild(btn);
  }

  /* ---- Estado de la sincronización ----
     Dos señales, en orden de confianza:
       1. Los push que apple/js/sync.js no logró subir. Esta es la verdad, y es la
          que importa: son cambios que por ahora viven SOLO en este equipo.
       2. navigator.onLine. Barato, pero miente: da true en un portal cautivo, con
          Supabase caído o con el token vencido. Sirve solo para el caso obvio.
     El shell no carga sync.js, así que ahí el evento simplemente nunca llega. */
  var pending = 0;
  window.addEventListener('ceven-sync-pending', function(e){
    pending = (e.detail && e.detail.pending) || 0;
    renderStatus();
  });
  function renderStatus(){
    var txt = pending
      ? '⚠︎ ' + pending + (pending === 1 ? ' cambio sin subir' : ' cambios sin subir')
      : (navigator.onLine ? '' : '⚠︎ Sin conexión · no se sincroniza');
    if(!txt){ drop('ceven-pwa-offline'); return; }
    var pill = document.getElementById('ceven-pwa-offline');
    if(!pill){
      pill = document.createElement('div');
      pill.id = 'ceven-pwa-offline';
      pill.style.cssText = PILL + ';background:#fff8e6;border-color:#ffd60a;color:#8a6100';
      bar().appendChild(pill);
    }
    pill.textContent = txt;
    pill.title = pending
      ? 'Hay cambios guardados solo en este equipo que todavía no se pudieron subir. Se reintenta solo cada pocos segundos.'
      : 'Los cambios se guardan en este equipo y se sincronizan al recuperar la conexión.';
  }
  window.addEventListener('online',  renderStatus);
  window.addEventListener('offline', renderStatus);

  /* ---- theme-color según el modo oscuro del cotizador (body.dark) ---- */
  function syncThemeColor(){
    var meta = document.querySelector('meta[name="theme-color"]');
    if(!meta) return;
    meta.setAttribute('content', document.body.classList.contains('dark') ? '#1c1c1e' : '#f5f5f7');
  }

  function boot(){
    syncThemeColor();
    /* sync.js ya puede tener reintentos en curso antes de que enganchemos el evento. */
    if(typeof window._syncPendingCount === 'function') pending = window._syncPendingCount();
    renderStatus();
    showInstall();
    if(window.MutationObserver){
      new MutationObserver(syncThemeColor).observe(document.body, {attributes: true, attributeFilter: ['class']});
    }
  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
