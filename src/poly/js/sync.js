/* ============================================================
   CAPA DE SINCRONIZACION SUPABASE  ·  Ceven Cotizador  (v4)
   - Intercepta el guardado de forma robusta (Storage.prototype),
     sin ensuciar el almacenamiento ni romper la app.
   - La app arranca al instante; los datos compartidos llegan async.
   - Replica cada cambio: pipeline fila por fila, el resto en bloque.
   - Cada 15s trae los cambios del equipo.
   - v4: autentica cada request con el access_token del usuario
     (policies RLS `to authenticated`; la anon key sola no puede
     leer ni escribir) y aisla los datos por marca (columna brand).
   ============================================================ */
(function(){
  // 0) Limpiar basura que una version anterior pudo dejar (clave 'setItem', etc.)
  try{
    ['setItem','getItem','removeItem','clear','key','length'].forEach(function(m){
      if(localStorage.getItem(m)!==null) localStorage.removeItem(m);
    });
  }catch(e){}

  // La URL y la key vienen de js/config.js (se carga antes que este archivo)
  var SUPABASE_URL = window.SUPABASE_URL || '';
  var SUPABASE_KEY = window.SUPABASE_ANON_KEY || '';
  var REST = SUPABASE_URL + '/rest/v1/';

  // Sin base configurada: la sync queda desactivada y la app corre 100% local.
  // No se hace NINGÚN request. Se dejan los hooks _syncPause/_syncResume como
  // no-ops porque importFullBackup() los invoca durante una restauración.
  if(!SUPABASE_URL){
    window._syncPause  = function(){};
    window._syncResume = function(){};
    console.warn('[sync] Supabase sin configurar (shared/config.js) — la app corre 100% local, sin sincronización');
    return;
  }

  var SETTING_KEYS = ['poly_cquotes','poly_cpl','poly_carchive','poly_cqc','poly_clogo','poly_clogo_dark'];
  var METHOD_KEYS = {setItem:1,getItem:1,removeItem:1,clear:1,key:1,length:1};

  // Fila de pipeline por OPG (no por qNum — ver pipeline-core.js): sin familias
  // Apple (qMac/qIph/...), con opg/salas/factura en su lugar.
  var PIPE_COLS = ['id','fecha','fechaISO','cliente','ejecutivo','mesCierre','estado',
    'monto','moneda','opg','salas','factura'];
  var NUM_COLS = ['id','monto'];
  // Columnas jsonb en Supabase: van como objeto/array nativo (no string)
  // coerce las parsea de vuelta si vienen como string por algún motivo
  var OBJ_COLS = ['salas'];

  // Marca de este cotizador: TODA la sync filtra y estampa esta marca.
  // (Los cotizadores de otras marcas usan su propio valor y no se mezclan.)
  var BRAND = 'poly';
  var BQ = 'brand=eq.' + BRAND;

  // Headers autenticados con el token del usuario logueado (auth.js se carga antes).
  // Sin sesión, el Bearer va vacío y Supabase rechaza el request (fail-safe).
  function authHeaders(){
    var sess = (typeof cevenGetSession === 'function') ? cevenGetSession() : null;
    return {
      'apikey': SUPABASE_KEY,
      'Authorization': 'Bearer ' + ((sess && sess.access_token) || ''),
      'Content-Type': 'application/json'
    };
  }
  function sessionOk(){
    return (typeof cevenIsValidSession === 'function') && cevenIsValidSession();
  }
  // fetch autenticado contra PostgREST con un retry si el token venció justo
  // a tiempo (mismo patrón que cevenAuthedFetch en auth.js).
  function sfetch(path, opts){
    opts = opts || {};
    function call(){
      return fetch(REST + path, Object.assign({}, opts, {headers: Object.assign(authHeaders(), opts.headers || {})}));
    }
    return call().then(function(r){
      if(r.status !== 401) return r;
      var sess = (typeof cevenGetSession === 'function') ? cevenGetSession() : null;
      var prev = sess && sess.access_token;
      if(typeof cevenRefreshToken === 'function') cevenRefreshToken();
      return new Promise(function(resolve){
        setTimeout(function(){
          var s2 = (typeof cevenGetSession === 'function') ? cevenGetSession() : null;
          if(!s2 || s2.access_token === prev){ resolve(r); return; }
          call().then(resolve, function(){ resolve(r); });
        }, 800);
      });
    });
  }

  // Original confiable, tomado del prototipo (nunca queda tapado por un item)
  var SP = window.Storage && window.Storage.prototype;
  var _origSetItem = (SP && SP.setItem) || localStorage.setItem;
  function rawSet(k,v){ _origSetItem.call(localStorage, k, v); }

  var _pipeSnap = {};
  // Contador de pushes en vuelo (no booleano: varios pushes pueden solaparse
  // y un flag simple se apagaba cuando terminaba el primero, no el último).
  var _pushing = 0;
  function pushBegin(){ _pushing++; }
  function pushDone(){ if(_pushing > 0) _pushing--; }
  var _booted = false;
  var _timers = {};
  // Expuesto para que importFullBackup() pueda pausar la sync durante la restauración
  window._syncPause  = function(){ _booted = false; };
  window._syncResume = function(){ _booted = true;  };

  function pickPipe(row){
    var o={};
    for(var i=0;i<PIPE_COLS.length;i++){
      var c=PIPE_COLS[i];
      if(OBJ_COLS.indexOf(c)>=0){
        // jsonb: mandar como objeto nativo si tiene contenido, o NULL si está vacío/borrado.
        // Mandar null es clave: si un override (skuStatus, skuPartialRemSt, etc.) se limpia
        // localmente, hay que blanquearlo también en Supabase; si se omite, PostgREST deja el
        // valor viejo y el poll lo vuelve a traer (revertía el estado al anterior).
        var val = row[c];
        if(typeof val === 'string'){ try{ val = JSON.parse(val); }catch(e){ val = null; } }
        o[c] = (val && typeof val === 'object' && Object.keys(val).length > 0) ? val : null;
      } else {
        if(row[c]===undefined || row[c]===null) continue;
        o[c] = row[c];
      }
    }
    o.brand = BRAND;
    return o;
  }
  function snapKey(row){ return JSON.stringify(pickPipe(row)); }
  function coerce(r){
    delete r.brand; // dato redundante localmente (este cotizador es 100% de su marca)
    for(var i=0;i<NUM_COLS.length;i++){ var c=NUM_COLS[i]; if(r[c]!==null && r[c]!==undefined && r[c]!=='') r[c]=Number(r[c]); }
    // jsonb fields: Supabase devuelve objetos nativos, pero por si acaso vienen como string
    for(var j=0;j<OBJ_COLS.length;j++){
      var oc=OBJ_COLS[j];
      if(r[oc] && typeof r[oc]==='string'){ try{ r[oc]=JSON.parse(r[oc]); }catch(e){ delete r[oc]; } }
    }
    return r;
  }
  function byId(a,b){ return (Number(a.id)||0)-(Number(b.id)||0); }
  function normPipe(arr){ return JSON.stringify(arr.map(pickPipe).sort(byId)); }
  function visible(id){ var el=document.getElementById(id); return el && el.classList.contains('on'); }

  function fetchJSON(path){
    return sfetch(path).then(function(r){ return r.ok ? r.json() : null; }).catch(function(){ return null; });
  }
  // Los tres push devuelven true/false ("¿quedó guardado en Supabase?") y NUNCA
  // rechazan. Es la pieza central: antes se tragaban el error de red y el llamador
  // daba el cambio por subido, así que un push perdido no se reintentaba jamás y
  // el siguiente poll lo pisaba con el estado del servidor. Ver retryLater().
  function pushPipeRows(rows){
    if(!rows.length) return Promise.resolve(true);
    return sfetch('pipeline', {method:'POST', headers:{'Prefer':'resolution=merge-duplicates,return=minimal'}, body:JSON.stringify(rows)})
      .then(function(r){ if(!r.ok) r.text().then(function(t){ console.warn('[sync] upsert pipeline '+r.status+':', t); }); return r.ok; })
      .catch(function(e){ console.warn('[sync] upsert pipeline', e); return false; });
  }
  function delPipeRows(ids){
    if(!ids.length) return Promise.resolve(true);
    return sfetch('pipeline?'+BQ+'&id=in.('+ids.join(',')+')', {method:'DELETE'})
      .then(function(r){ if(!r.ok) console.warn('[sync] delete pipeline '+r.status); return r.ok; })
      .catch(function(e){ console.warn('[sync] delete pipeline', e); return false; });
  }
  function pushSettings(rows){
    if(!rows.length) return Promise.resolve(true);
    rows = rows.map(function(r){ return {brand:BRAND, key:r.key, value:r.value}; });
    pushBegin();
    return sfetch('app_settings', {method:'POST', headers:{'Prefer':'resolution=merge-duplicates,return=minimal'}, body:JSON.stringify(rows)})
      .then(function(r){ pushDone(); if(!r.ok) r.text().then(function(t){ console.warn('[sync] upsert settings '+r.status+':', t); }); return r.ok; },
            function(e){ pushDone(); console.warn('[sync] upsert settings', e); return false; });
  }

  // ---- Reintento de lo que no se pudo subir ----
  // Mientras _timers[k] exista, el poll no pisa esa clave (misma garantía que ya
  // usaba el debounce de 350ms). Por eso el reintento vive ahí adentro: proteger
  // el dato local y volver a intentar son la misma cosa. Los push son upserts por
  // PK y deletes por id, o sea idempotentes: reintentar nunca duplica ni corrompe.
  var _retry = {};   // clave -> delay actual del backoff
  function retryLater(k){
    clearTimeout(_timers[k]);
    var d = Math.min((_retry[k] || 2500) * 2, 60000);   // 5s, 10s, 20s, 40s, 60s…
    _retry[k] = d;
    _timers[k] = setTimeout(function(){ delete _timers[k]; flush(k); }, d);
    notifyPending();
  }
  function retryDone(k){
    if(_retry[k] !== undefined){ delete _retry[k]; notifyPending(); }
  }
  // shared/pwa.js escucha esto para mostrar "N cambios sin subir": es el único
  // aviso honesto, porque navigator.onLine no ve un portal cautivo ni Supabase caído.
  function notifyPending(){
    try{
      window.dispatchEvent(new CustomEvent('ceven-sync-pending', {
        detail: {pending: Object.keys(_retry).length}
      }));
    }catch(e){}
  }
  window._syncPendingCount = function(){ return Object.keys(_retry).length; };

  function seedFromLocal(){
    try{
      var lp = JSON.parse(localStorage.getItem('poly_cpipeline')||'[]');
      var sets=[];
      SETTING_KEYS.forEach(function(k){ var v=localStorage.getItem(k); if(v!==null) sets.push({key:k,value:v}); });
      if(!lp.length && !sets.length) return;
      // Bloquear el poll mientras el seed sube a Supabase
      // (evita race condition donde poll lee Supabase vacío y pisa el localStorage recién restaurado)
      pushBegin();
      lp.forEach(function(r){ if(r.id!=null) _pipeSnap[r.id]=snapKey(r); });
      Promise.all([
        pushPipeRows(lp.map(pickPipe)),
        pushSettings(sets)
      ]).then(function(res){
        pushDone();
        if(res[0] && res[1]){ console.log('[sync] base sembrada'); retryDone('poly_cpipeline'); return; }
        // El seed es EL momento crítico (el localStorage es la única copia de los
        // datos): si no subió, hay que reintentar, no seguir como si nada.
        console.warn('[sync] el seed no subió completo — reintentando');
        _pipeSnap={};   // forzar el re-diff completo en el próximo intento
        retryLater('poly_cpipeline');
        sets.forEach(function(s){ retryLater(s.key); });
      });
    }catch(e){ console.warn('[sync] seed', e); }
  }

  function rehydrate(){
    try{ window.products = JSON.parse(localStorage.getItem('poly_cpl')||'[]'); if(typeof initCat==='function') initCat(); }catch(e){}
    try{ if(typeof applyLogo==='function') applyLogo(); }catch(e){}
    try{ if(typeof renderQ==='function') renderQ(); }catch(e){}
    try{ if(visible('p-pipeline') && typeof renderPipeline==='function') renderPipeline(); }catch(e){}
    try{ if(visible('p-history') && typeof renderHistory==='function') renderHistory(); }catch(e){}
  }

  // ---- Interceptado ROBUSTO del guardado (sobre el prototipo) ----
  if(SP){
    SP.setItem = function(k,v){
      if(METHOD_KEYS[k]) return;            // nunca guardar claves con nombre de metodo (evita el bug)
      _origSetItem.call(this, k, v);
      if(this===window.localStorage && _booted && (k==='poly_cpipeline' || SETTING_KEYS.indexOf(k)>=0)){
        clearTimeout(_timers[k]);
        // borrar la entrada al disparar: _timers[k] truthy significa "flush pendiente"
        // y el poll lo usa para no pisar cambios locales todavía no subidos
        _timers[k]=setTimeout(function(){ delete _timers[k]; flush(k); }, 350);
      }
    };
  }
  function flush(k){
    // Sin sesión tampoco se puede empujar, pero el cambio local sigue sin subir:
    // reintentar (y de paso _timers[k] evita que el poll lo pise cuando vuelva).
    if(!sessionOk()){ retryLater(k); return; }
    if(k==='poly_cpipeline'){ syncPipeline(); }
    else {
      var v=localStorage.getItem(k);
      if(v===null) return;
      pushSettings([{key:k,value:v}]).then(function(ok){ ok ? retryDone(k) : retryLater(k); });
    }
  }
  function syncPipeline(){
    var arr; try{ arr=JSON.parse(localStorage.getItem('poly_cpipeline')||'[]'); }catch(e){ return; }
    var nextSnap={}, toUpsert=[];
    for(var i=0;i<arr.length;i++){
      var r=arr[i]; if(r.id==null) continue;
      var sk=snapKey(r); nextSnap[r.id]=sk;
      if(_pipeSnap[r.id]!==sk) toUpsert.push(pickPipe(r));
    }
    var toDelete=[];
    for(var id in _pipeSnap){ if(!(id in nextSnap)) toDelete.push(id); }
    // _pipeSnap = "lo que Supabase ya tiene". Solo se puede avanzar si el push
    // SALIÓ BIEN; si no, se vuelve atrás para que el próximo intento recalcule el
    // diff completo (incluidos los borrados) y no dé por subido lo que no subió.
    var prevSnap=_pipeSnap;
    _pipeSnap=nextSnap;
    pushBegin();
    Promise.all([pushPipeRows(toUpsert), delPipeRows(toDelete)]).then(function(res){
      pushDone();
      if(res[0] && res[1]){ retryDone('poly_cpipeline'); return; }
      _pipeSnap=prevSnap;
      retryLater('poly_cpipeline');
    }, function(){ pushDone(); _pipeSnap=prevSnap; retryLater('poly_cpipeline'); });
  }

  function poll(){
    if(!_booted || _pushing > 0 || !sessionOk()) return;
    fetchJSON('pipeline?'+BQ+'&select=*').then(function(rows){
      if(!Array.isArray(rows)) return;
      // No pisar el estado local si hay un cambio propio esperando su flush
      // (el debounce de 350ms): primero sube lo nuestro, el próximo poll trae el merge.
      if(_timers['poly_cpipeline'] || _pushing > 0) return;
      rows.forEach(coerce);
      var lp; try{ lp=JSON.parse(localStorage.getItem('poly_cpipeline')||'[]'); }catch(e){ lp=[]; }
      if(normPipe(lp)!==normPipe(rows)){
        var sorted=rows.slice().sort(byId);
        rawSet('poly_cpipeline', JSON.stringify(sorted));
        _pipeSnap={}; sorted.forEach(function(r){ _pipeSnap[r.id]=snapKey(r); });
        if(visible('p-pipeline') && typeof renderPipeline==='function') renderPipeline();
      }
    });
    fetchJSON('app_settings?'+BQ+'&select=*').then(function(sets){
      if(!Array.isArray(sets)) return;
      var changed={};
      sets.forEach(function(row){
        if(SETTING_KEYS.indexOf(row.key)<0) return;
        if(_timers[row.key]) return; // cambio propio pendiente de flush: no pisarlo
        var v=String(row.value);
        if(localStorage.getItem(row.key)!==v){ rawSet(row.key, v); changed[row.key]=1; }
      });
      if(changed['poly_cpl']){ try{ window.products=JSON.parse(localStorage.getItem('poly_cpl')||'[]'); if(typeof initCat==='function') initCat(); }catch(e){} }
      if(changed['poly_clogo'] && typeof applyLogo==='function'){ try{ applyLogo(); }catch(e){} }
      if(changed['poly_cquotes'] && visible('p-history') && typeof renderHistory==='function') renderHistory();
    });
  }

  function bootstrap(){
    // Sin sesión válida no hay sync (las policies de la base la rechazarían
    // igual). El guard de index.html ya redirige al login del shell.
    if(!sessionOk()){
      console.warn('[sync] sin sesión válida — sync desactivada');
      return;
    }
    // ¿Venimos de un import manual? Si es así, el localStorage es la fuente
    // de verdad y hay que empujarlo a Supabase, no al revés.
    var fromImport = false;
    try{
      // sessionStorage (https) primero, localStorage como fallback para file://
      fromImport = sessionStorage.getItem('_ceven_import_reload') === '1';
      if(fromImport){ sessionStorage.removeItem('_ceven_import_reload'); }
      if(!fromImport){
        fromImport = localStorage.getItem('_ceven_import_reload') === '1';
        if(fromImport) localStorage.removeItem('_ceven_import_reload');
      }
    }catch(e){}

    Promise.all([ fetchJSON('pipeline?'+BQ+'&select=*'), fetchJSON('app_settings?'+BQ+'&select=*') ]).then(function(res){
      var serverPipe=res[0], serverSetsArr=res[1];
      if(serverPipe===null && serverSetsArr===null){
        console.warn('[sync] sin conexion con Supabase — la app corre con datos locales');
        _booted=true; setInterval(poll, 15000); return;
      }
      serverPipe = serverPipe||[]; serverPipe.forEach(coerce);
      var serverSets={}; (serverSetsArr||[]).forEach(function(r){ serverSets[r.key]=r.value; });
      var serverEmpty = (serverPipe.length===0) && (Object.keys(serverSets).length===0);

      if(fromImport || serverEmpty){
        // Local manda: sembrar Supabase con lo que tiene el navegador
        console.log('[sync] ' + (fromImport ? 'post-import' : 'base vacía') + ' — sembrando Supabase desde localStorage');
        seedFromLocal();
        rehydrate(); // renderizar la UI inmediatamente con los datos locales restaurados
      } else {
        rawSet('poly_cpipeline', JSON.stringify(serverPipe.slice().sort(byId)));
        serverPipe.forEach(function(r){ _pipeSnap[r.id]=snapKey(r); });
        SETTING_KEYS.forEach(function(k){
          if(serverSets[k]!==undefined && serverSets[k]!==null){ rawSet(k, String(serverSets[k])); }
          else {
            var v=localStorage.getItem(k);
            if(v!==null) pushSettings([{key:k,value:v}]).then(function(ok){ if(!ok) retryLater(k); });
          }
        });
        if(serverPipe.length===0){
          try{
            var lp=JSON.parse(localStorage.getItem('poly_cpipeline')||'[]');
            if(lp.length){
              lp.forEach(function(r){ if(r.id!=null) _pipeSnap[r.id]=snapKey(r); });
              pushPipeRows(lp.map(pickPipe)).then(function(ok){ if(!ok){ _pipeSnap={}; retryLater('poly_cpipeline'); } });
            }
          }catch(e){}
        }
        rehydrate();
      }
      _booted=true;
      setInterval(poll, 15000);
    });
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', bootstrap);
  else bootstrap();
})();

