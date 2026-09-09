/* ============================================================
   CAPA DE SINCRONIZACIÓN SUPABASE  ·  compartida por TODAS las marcas
   ------------------------------------------------------------
   - Intercepta el guardado de forma robusta (Storage.prototype),
     sin ensuciar el almacenamiento ni romper la app.
   - La app arranca al instante; los datos compartidos llegan async.
   - Replica cada cambio: pipeline fila por fila, el resto en bloque.
   - Cada 15s trae los cambios del equipo.
   - Autentica cada request con el access_token del usuario (policies
     RLS `to authenticated`: la anon key sola no lee ni escribe) y
     aísla los datos por marca (columna `brand`, parte de la PK).

   Cero constantes por marca: TODO lo que distingue a un cotizador
   de otro sale de window.CEVEN_BRAND (ver <marca>/brand.js) y de
   window.cevenK() para las claves de localStorage.

   ------------------------------------------------------------
   LAS TRES INVARIANTES QUE HAY QUE RESPETAR SÍ O SÍ
   ------------------------------------------------------------
   1) rawSet() escribe con el setItem ORIGINAL, esquivando el
      intercept. Todo lo que baja del servidor se escribe así: si se
      usara localStorage.setItem (o cevenLsSet de shared/safe.js) el
      intercept marcaría la clave como sucia y la volvería a subir —
      ping-pong infinito con el poll.
   2) _dirty[k] = "hay un cambio local sin confirmar en k". Se prende
      en el intercept (antes de cualquier request) y se apaga SOLO
      cuando el servidor confirmó el push. Mientras esté prendida, el
      poll y el bootstrap tienen PROHIBIDO pisar esa clave.
   3) _pipeSnap = "lo que Supabase ya tiene", fila por fila. Solo se
      puede avanzar con un push confirmado; ante cualquier fallo se
      vuelve atrás para que el próximo intento recalcule el diff
      completo (altas, ediciones y bajas).
   ============================================================ */
(function(){

  var B = window.CEVEN_BRAND;
  // Sin marca no hay nada que sincronizar, pero los hooks tienen que existir
  // igual porque backup.js los invoca durante una restauración.
  if(!B || typeof window.cevenK !== 'function'){
    window._syncPause  = function(){};
    window._syncResume = function(){};
    console.error('[sync] falta CEVEN_BRAND / cevenK — brand.js tiene que cargarse ANTES que shared/sync.js');
    return;
  }

  // 0) Limpiar basura que una versión anterior pudo dejar (clave 'setItem', etc.)
  var METHOD_KEYS = {setItem:1, getItem:1, removeItem:1, clear:1, key:1, length:1};
  try{
    for(var mk in METHOD_KEYS){
      if(localStorage.getItem(mk) !== null) localStorage.removeItem(mk);
    }
  }catch(e){}

  // La URL y la key vienen de shared/config.js (se carga antes que este archivo)
  var SUPABASE_URL = window.SUPABASE_URL || '';
  var SUPABASE_KEY = window.SUPABASE_ANON_KEY || '';
  var REST = SUPABASE_URL + '/rest/v1/';

  // Sin base configurada: la sync queda desactivada y la app corre 100% local.
  // No se hace NINGÚN request.
  if(!SUPABASE_URL){
    window._syncPause  = function(){};
    window._syncResume = function(){};
    console.warn('[sync] Supabase sin configurar (shared/config.js) — la app corre 100% local, sin sincronización');
    return;
  }

  /* ---------- Configuración derivada de la marca ---------- */

  var BRAND = B.id;
  var BQ    = 'brand=eq.' + encodeURIComponent(BRAND);

  // settingKeys viene con nombres BASE; las claves REALES llevan el prefijo.
  var PIPE_KEY     = window.cevenK('cpipeline');
  var SETTING_KEYS = [];
  var BASE_OF      = {};   // clave real -> nombre base (para el rehidratado)
  for(var si = 0; si < (B.settingKeys || []).length; si++){
    var kReal = window.cevenK(B.settingKeys[si]);
    SETTING_KEYS.push(kReal);
    BASE_OF[kReal] = B.settingKeys[si];
  }

  // Cola de pendientes en disco. A propósito NO está en settingKeys: si lo
  // estuviera se sincronizaría a sí misma y cada equipo vería los pendientes
  // de los demás.
  var DIRTY_KEY = window.cevenK('_sync_dirty');
  if(SETTING_KEYS.indexOf(DIRTY_KEY) >= 0){
    console.error('[sync] "_sync_dirty" NO puede estar en CEVEN_BRAND.settingKeys — se sincronizaría a sí misma');
  }

  var PIPE_COLS  = B.pipeCols      || [];
  var NUM_COLS   = B.numCols       || [];
  var OBJ_COLS   = B.objCols       || [];
  var NULL_COLS  = B.nullableCols  || [];   // escalares que la app puede vaciar
  var LOCAL_ONLY = B.localOnlyCols || [];   // sin columna en Supabase: el merge los preserva
  /* Claves cuyo valor solo puede subir (el contador de cotizaciones). Se
     resuelven con Math.max en vez de "gana el ultimo que escribio": ver
     _mergeMonotona(). Los nombres son BASE, sin prefijo, igual que settingKeys. */
  var MONOTONIC  = {};
  (B.monotonicKeys || []).forEach(function(base){ MONOTONIC[window.cevenK(base)] = 1; });
  var PAD_COLS   = B.padCols       || {};   // col -> ancho: numérica en la base, string con ceros acá

  var POLL_MS       = 15000;
  var DEBOUNCE_MS   = 350;
  var BOOT_RETRY_MS = 10000;
  var DIRTY_GRACE   = 8000;    // un cambio recién guardado no cuenta como "sin subir" todavía
  var DEL_CHUNK     = 100;     // ids por request de DELETE (más da 414 Request-URI Too Long)
  var BACKOFF_MAX   = 60000;

  /* ---------- Sesión y fetch autenticado ---------- */

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

  /* ---------- Estado interno ---------- */

  // Original confiable, tomado del prototipo (nunca queda tapado por un item)
  var SP = window.Storage && window.Storage.prototype;
  var _origSetItem = (SP && SP.setItem) || localStorage.setItem;

  var _pipeSnap  = {};    // id -> snapKey de lo que Supabase YA tiene (invariante 3)
  var _pushing   = 0;     // pushes en vuelo (contador, no booleano: se solapan)
  var _booted    = false;
  var _paused    = false;
  var _timers    = {};    // clave -> handle del debounce/backoff
  var _retry     = {};    // clave -> delay actual del backoff (ms)
  var _dirty     = {};    // clave -> timestamp del cambio local sin confirmar (invariante 2)
  var _dirtySeq  = {};    // clave -> versión del último cambio local (ver pushOk)
  var _seq       = 0;
  var _inFlight  = {};    // clave -> hay un push de esa clave viajando ahora
  var _dirtyUp   = {};    // id de fila de pipeline pendiente de upsert
  var _dirtyDel  = {};    // id de fila de pipeline pendiente de borrado
  var _preBoot   = {};    // claves escritas antes de que resolviera el bootstrap
  var _pollTimer = null;
  var _bootTimer = null;
  var _lastFlushAll = 0;
  var _lastPending  = -1;

  function pushBegin(){ _pushing++; }
  function pushDone(){ if(_pushing > 0) _pushing--; }
  function isEmpty(o){ for(var k in o){ return false; } return true; }

  // Escribe esquivando el intercept (invariante 1). Devuelve true/false igual
  // que cevenLsSet() de shared/safe.js: nunca falla en silencio.
  function rawSet(k, v){
    try{
      _origSetItem.call(localStorage, k, v);
      return true;
    }catch(err){
      console.error('[sync] no se pudo guardar "' + k + '" en localStorage', err);
      var msg = '⚠ No se pudo guardar "' + k + '". Si el almacenamiento del navegador está lleno, ' +
                'exportá un backup y borrá cotizaciones viejas.';
      if(typeof showToast === 'function') showToast(msg);
      return false;
    }
  }
  function lsGet(k){
    try{ return localStorage.getItem(k); }catch(e){ return null; }
  }

  /* ---------- Cola de pendientes PERSISTENTE ----------
     _retry / _timers / _pipeSnap vivían solo en memoria: un F5 los borraba y
     el bootstrap siguiente daba lo local por perdido. Ahora el estado mínimo
     para no perder nada (qué claves están sucias y qué filas de pipeline
     faltan subir o borrar) se espeja en DIRTY_KEY.

     No se persiste _pipeSnap entero (sería una copia completa del pipeline):
     el snapshot se reconstruye del servidor en el bootstrap, que es
     exactamente lo que significa, y las filas sucias se dejan afuera a
     propósito para que el primer push las suba. */

  function saveDirty(){
    rawSet(DIRTY_KEY, JSON.stringify({
      k:   _dirty,
      r:   _retry,
      up:  Object.keys(_dirtyUp),
      del: Object.keys(_dirtyDel)
    }));
  }
  function loadDirty(){
    var d = window.cevenLsJSON(DIRTY_KEY, null);
    if(!d || typeof d !== 'object') return;
    var k;
    if(d.k && typeof d.k === 'object'){
      for(k in d.k){
        if(k === PIPE_KEY || SETTING_KEYS.indexOf(k) >= 0) _dirty[k] = Number(d.k[k]) || 0;
      }
    }
    if(d.r && typeof d.r === 'object'){
      for(k in d.r){ if(_dirty[k] !== undefined) _retry[k] = Number(d.r[k]) || 2500; }
    }
    for(var i = 0; i < (d.up  || []).length; i++) _dirtyUp[d.up[i]]   = 1;
    for(var j = 0; j < (d.del || []).length; j++) _dirtyDel[d.del[j]] = 1;
    for(k in _dirty) _dirtySeq[k] = ++_seq;
    var n = Object.keys(_dirty).length;
    if(n) console.warn('[sync] ' + n + ' clave(s) quedaron sin subir en una sesión anterior — mandan los datos locales');
  }
  function markDirty(k){
    // La versión sube SIEMPRE; el timestamp se conserva porque la gracia del
    // contador se mide desde el primer cambio sin confirmar, no desde el último.
    _dirtySeq[k] = ++_seq;
    if(_dirty[k] === undefined){ _dirty[k] = Date.now(); saveDirty(); }
  }
  // Una clave está "ocupada" mientras haya cualquier indicio de un cambio local
  // sin confirmar. El poll NUNCA pisa una clave ocupada. _dirty cubre toda la
  // ventana (desde el setItem hasta el push confirmado); los otros tres chequeos
  // quedan como red de seguridad — _timers[k] se borra justo ANTES de llamar a
  // flush(), y esa rendija era por donde el poll pisaba lo recién guardado.
  function keyBusy(k){
    return _pushing > 0 || _timers[k] !== undefined || _retry[k] !== undefined || _dirty[k] !== undefined;
  }

  /* ---------- Contador de pendientes ----------
     shared/pwa.js lo muestra como "N cambios sin subir": es el único aviso
     honesto, porque navigator.onLine no ve un portal cautivo ni Supabase caído.
     Un cambio recién guardado no cuenta hasta DIRTY_GRACE (si no, el cartel de
     advertencia parpadearía en cada guardado normal); uno que ya falló al menos
     una vez (_retry) cuenta desde el instante cero. */
  function pendingCount(){
    var n = 0, now = Date.now(), k;
    for(k in _dirty){
      if(_retry[k] !== undefined || (now - _dirty[k]) > DIRTY_GRACE) n++;
    }
    return n;
  }
  function notifyPending(){
    var n = pendingCount();
    if(n === _lastPending) return;
    _lastPending = n;
    try{
      window.dispatchEvent(new CustomEvent('ceven-sync-pending', {detail: {pending: n}}));
    }catch(e){}
  }
  window._syncPendingCount = pendingCount;

  /* ---------- Reintento ----------
     Mientras la clave esté sucia el poll no la pisa, así que proteger el dato
     local y volver a intentar son la misma cosa. Los push son upserts por PK y
     deletes por id: idempotentes, reintentar nunca duplica ni corrompe. */
  function retryLater(k){
    markDirty(k);
    clearTimeout(_timers[k]); delete _timers[k];
    var d = Math.min((_retry[k] || 2500) * 2, BACKOFF_MAX);   // 5s, 10s, 20s, 40s, 60s…
    _retry[k] = d;
    // En pausa no se agenda nada: _syncResume() (o el próximo arranque) drena
    // la cola. El pendiente queda igual anotado en disco.
    if(!_paused) _timers[k] = setTimeout(function(){ delete _timers[k]; flush(k); }, d);
    saveDirty();
    notifyPending();
  }
  // Cierra un push que salió bien. `seq` es la versión que tenía la clave
  // cuando el request salió: si mientras viajaba entró OTRO cambio local, la
  // clave NO queda limpia. Sin esto, un reload en esa ventana perdía el aviso
  // de "falta subir" y el bootstrap siguiente dejaba ganar al servidor.
  function pushOk(k, seq){
    delete _retry[k];
    if(_dirtySeq[k] === seq) delete _dirty[k];
    else schedule(k);
    saveDirty();
    notifyPending();
  }
  // Cierre incondicional: la clave está demostrablemente al día (o ya no existe).
  function retryDone(k){
    if(_retry[k] === undefined && _dirty[k] === undefined) return;
    delete _retry[k];
    delete _dirty[k];
    saveDirty();
    notifyPending();
  }
  function schedule(k){
    clearTimeout(_timers[k]);
    _timers[k] = setTimeout(function(){ delete _timers[k]; flush(k); }, DEBOUNCE_MS);
  }

  /* ---------- Normalización de filas ---------- */

  // Emite SIEMPRE el mismo set de columnas (PIPE_COLS + brand) para todas las
  // filas. Dos razones:
  //  · Un escalar que se vacía tiene que viajar como null explícito. Si se
  //    omite, PostgREST conserva el valor viejo y el poll lo vuelve a traer:
  //    el pipeline entra en un ciclo de revert infinito cada 15s (el caso de
  //    la Factura en Poly y de ovLink/proyecto en Apple).
  //  · Un upsert en lote con filas de distinta forma rebota con
  //    PGRST102 "All object keys must match".
  // En la tabla `pipeline` solo id y brand son NOT NULL (son la PK), así que
  // mandar null en cualquier otra columna es seguro.
  //
  // nullableCols marca además los escalares que la app VACÍA a mano, y cada
  // pantalla lo hace a su manera: Poly guarda null (`factura = val==='' ? null
  // : val`), Apple borra la propiedad (`delete r.ovLink`) y un import de Excel
  // deja ''. Los tres significan lo mismo y los tres tienen que terminar en un
  // NULL de SQL, nunca en un string vacío.
  function pickPipe(row){
    var o = {}, i, c, val;
    for(i = 0; i < PIPE_COLS.length; i++){
      c = PIPE_COLS[i];
      val = row[c];
      if(OBJ_COLS.indexOf(c) >= 0){
        // jsonb: objeto nativo si tiene contenido, NULL si está vacío o borrado.
        if(typeof val === 'string'){ try{ val = JSON.parse(val); }catch(e){ val = null; } }
        o[c] = (val && typeof val === 'object' && Object.keys(val).length > 0) ? val : null;
      } else if(NULL_COLS.indexOf(c) >= 0){
        o[c] = (val === undefined || val === null || val === '') ? null : val;
      } else {
        o[c] = (val === undefined) ? null : val;
      }
    }
    o.brand = BRAND;
    return o;
  }
  function snapKey(row){ return JSON.stringify(pickPipe(row)); }

  /* Ids que YA están en el archivo (carchive) — no pueden estar además en el
     pipeline vivo. Una fila así se resucita cuando otro equipo la re-sube a la
     tabla `pipeline` antes de recibir el carchive nuevo, o cuando un DELETE no
     pasó por permisos y el cliente lo dio por hecho. El merge del poll y del
     arranque la filtran, y encolan su borrado del servidor.

     Se lee de localStorage directo (no de getArchive()) para no depender del
     orden de carga de pipeline-store.js. Cache por string crudo: el blob puede
     ser grande y el poll corre cada 15 s. */
  var _archIdCache = { raw: null, ids: {} };
  function pipeArchivedIds(){
    var raw = lsGet(window.cevenK('carchive'));
    if(raw === _archIdCache.raw) return _archIdCache.ids;
    var ids = {};
    try{
      var a = JSON.parse(raw || '{}');
      if(a && typeof a === 'object'){
        for(var mk in a){
          var list = a[mk];
          for(var i = 0; list && i < list.length; i++){
            if(list[i] && list[i].id != null) ids[list[i].id] = 1;
          }
        }
      }
    }catch(e){}
    _archIdCache = { raw: raw, ids: ids };
    return ids;
  }

  function padNum(v, len){
    var s = String(parseInt(v, 10) || 0);
    while(s.length < len) s = '0' + s;
    return s;
  }
  function coerce(r){
    delete r.brand;   // dato redundante localmente (este cotizador es 100% de su marca)
    var i, c;
    for(i = 0; i < NUM_COLS.length; i++){
      c = NUM_COLS[i];
      if(r[c] !== null && r[c] !== undefined && r[c] !== '') r[c] = Number(r[c]);
    }
    // Columnas numéricas en Supabase que la app guarda como string con ceros a
    // la izquierda (qNum en Apple: 71 -> '0071'). Sin esto el match contra
    // cquotes falla y el diff marca la fila como cambiada para siempre.
    for(c in PAD_COLS){
      if(r[c] !== null && r[c] !== undefined && r[c] !== '') r[c] = padNum(r[c], PAD_COLS[c]);
    }
    // jsonb: Supabase devuelve objetos nativos, pero por si acaso vienen string
    for(i = 0; i < OBJ_COLS.length; i++){
      var oc = OBJ_COLS[i];
      if(r[oc] && typeof r[oc] === 'string'){ try{ r[oc] = JSON.parse(r[oc]); }catch(e){ r[oc] = null; } }
    }
    return r;
  }
  function byId(a, b){ return (Number(a.id) || 0) - (Number(b.id) || 0); }
  function normPipe(arr){ return JSON.stringify(arr.map(pickPipe).sort(byId)); }
  function visible(id){ var el = document.getElementById(id); return !!(el && el.classList.contains('on')); }

  // Copia sobre la fila del servidor los campos que solo existen en local
  // (localOnlyCols: no hay columna en Supabase, el servidor los ignora).
  function keepLocalOnly(serverRow, localRow){
    if(!localRow) return serverRow;
    for(var i = 0; i < LOCAL_ONLY.length; i++){
      var c = LOCAL_ONLY[i];
      if(localRow[c] !== undefined) serverRow[c] = localRow[c];
    }
    return serverRow;
  }

  // Lectura del pipeline que distingue "vacío" de "ilegible". Es la diferencia
  // entre no hacer nada y borrar todo el pipeline del servidor.
  function readPipe(){
    var raw = lsGet(PIPE_KEY);
    if(raw === null || raw === '') return {ok: true, rows: []};
    var v;
    try{ v = JSON.parse(raw); }catch(e){ return {ok: false, rows: []}; }
    if(!Array.isArray(v)) return {ok: false, rows: []};
    return {ok: true, rows: v};
  }
  function writePipe(rows){ return rawSet(PIPE_KEY, JSON.stringify(rows)); }

  /* ---------- GET con resultado discriminado ----------
     Antes devolvía null ante cualquier fallo (red, 500, 401, JSON inválido) y
     el llamador no podía distinguir "el servidor está vacío" de "no pude
     preguntar". Si fallaba solo el GET del pipeline pero respondía el de
     app_settings, el bootstrap concluía "hay datos, el servidor manda" y
     escribía "[]" en cpipeline: pipeline borrado.
     status: -1 sin red · 0 respuesta ilegible · >0 el código HTTP real. */
  function fetchJSON(path){
    return sfetch(path).then(function(r){
      if(!r.ok){
        console.warn('[sync] GET ' + path + ' → HTTP ' + r.status);
        return {ok: false, status: r.status};
      }
      return r.json().then(
        function(d){ return {ok: true, data: d}; },
        function(e){ console.warn('[sync] GET ' + path + ' → respuesta ilegible', e); return {ok: false, status: 0}; }
      );
    }, function(e){
      console.warn('[sync] GET ' + path + ' → sin red', e);
      return {ok: false, status: -1};
    });
  }
  function fetchRows(path){
    return fetchJSON(path).then(function(res){
      if(res.ok && !Array.isArray(res.data)){
        console.warn('[sync] GET ' + path + ' → se esperaba un array');
        return {ok: false, status: 0};
      }
      return res;
    });
  }

  /* ---------- Push ----------
     Los tres devuelven true/false ("¿quedó guardado en Supabase?") y NUNCA
     rechazan. Es la pieza central: antes se tragaban el error de red y el
     llamador daba el cambio por subido, así que un push perdido no se
     reintentaba jamás y el siguiente poll lo pisaba con el estado del servidor. */
  function pushPipeRows(rows){
    if(!rows.length) return Promise.resolve(true);
    return sfetch('pipeline', {method: 'POST', headers: {'Prefer': 'resolution=merge-duplicates,return=minimal'}, body: JSON.stringify(rows)})
      .then(function(r){
        if(!r.ok) r.text().then(function(t){ console.warn('[sync] upsert pipeline ' + r.status + ':', t); });
        return r.ok;
      }, function(e){ console.warn('[sync] upsert pipeline', e); return false; });
  }
  // Los ids van en la query string: con ~500 filas la URL pasaba los 8KB, el
  // servidor devolvía 414 y se reintentaba la MISMA URL para siempre.
  function delPipeRows(ids){
    if(!ids.length) return Promise.resolve(true);
    var chunks = [], i;
    for(i = 0; i < ids.length; i += DEL_CHUNK) chunks.push(ids.slice(i, i + DEL_CHUNK));
    return Promise.all(chunks.map(function(chunk){
      var list = chunk.map(function(id){ return encodeURIComponent(String(id)); }).join(',');
      return sfetch('pipeline?' + BQ + '&id=in.(' + list + ')', {method: 'DELETE'})
        .then(function(r){
          if(!r.ok) console.warn('[sync] delete pipeline ' + r.status + ' (' + chunk.length + ' ids)');
          return r.ok;
        }, function(e){ console.warn('[sync] delete pipeline', e); return false; });
    })).then(function(res){
      // Todos o ninguno: si un lote falló, el diff se recalcula entero.
      return res.every(function(ok){ return ok; });
    });
  }
  function pushSettings(rows){
    if(!rows.length) return Promise.resolve(true);
    // La columna `key` guarda la clave REAL de localStorage (con prefijo de
    // marca). La PK de app_settings es (key, brand): redundante pero es lo que
    // ya hay en la base.
    rows = rows.map(function(r){ return {brand: BRAND, key: r.key, value: r.value}; });
    pushBegin();
    return sfetch('app_settings', {method: 'POST', headers: {'Prefer': 'resolution=merge-duplicates,return=minimal'}, body: JSON.stringify(rows)})
      .then(function(r){
        pushDone();
        if(!r.ok) r.text().then(function(t){ console.warn('[sync] upsert settings ' + r.status + ':', t); });
        return r.ok;
      }, function(e){ pushDone(); console.warn('[sync] upsert settings', e); return false; });
  }

  /* ---------- Rehidratado de la UI ----------
     Indexado por nombre BASE. Solo corre lo que la marca declara en
     settingKeys y solo si la función de render existe: una marca sin
     nacionalización no tiene 'cnac' ni renderNac() y no pasa nada. */
  var REHYDRATE = {
    cpl: function(){
      window.products = window.cevenLsJSON(window.cevenK('cpl'), []);
      if(typeof initCat === 'function') initCat();
    },
    cnac: function(){
      window.nacRates = window.cevenLsJSON(window.cevenK('cnac'), {});
      if(visible('p-nac') && typeof renderNac === 'function') renderNac();
    },
    clogo:      function(){ if(typeof applyLogo === 'function') applyLogo(); },
    clogo_dark: function(){ if(typeof applyLogo === 'function') applyLogo(); },
    cquotes:    function(){ if(visible('p-history') && typeof renderHistory === 'function') renderHistory(); },
    // Otro dispositivo borró, restauró o purgó: la papelera es compartida.
    cpapelera:  function(){ if(visible('p-history') && typeof renderPapelera === 'function') renderPapelera(); }
  };
  function applyChanged(changedRealKeys){
    for(var k in changedRealKeys){
      var fn = REHYDRATE[BASE_OF[k]];
      if(fn){ try{ fn(); }catch(e){ console.warn('[sync] rehidratado de "' + k + '"', e); } }
    }
  }
  function rehydrate(){
    for(var i = 0; i < SETTING_KEYS.length; i++){
      var fn = REHYDRATE[BASE_OF[SETTING_KEYS[i]]];
      if(fn){ try{ fn(); }catch(e){} }
    }
    try{ if(typeof renderQ === 'function') renderQ(); }catch(e){}
    try{ if(visible('p-pipeline') && typeof renderPipeline === 'function') renderPipeline(); }catch(e){}
    try{ if(visible('p-history') && typeof renderHistory === 'function') renderHistory(); }catch(e){}
  }

  /* ---------- Intercept del guardado (sobre el prototipo) ---------- */
  if(SP){
    SP.setItem = function(k, v){
      if(METHOD_KEYS[k]) return;              // nunca guardar claves con nombre de método
      _origSetItem.call(this, k, v);
      if(this !== window.localStorage) return;
      if(k !== PIPE_KEY && SETTING_KEYS.indexOf(k) < 0) return;
      // Sucia YA, antes de cualquier request (invariante 2): si el navegador se
      // cierra en los próximos 350ms el cambio no se pierde igual.
      markDirty(k);
      if(!_booted){
        // El bootstrap todavía no resolvió (o la sync está en pausa por un
        // import). Antes se descartaba la escritura; ahora se encola.
        _preBoot[k] = 1;
        return;
      }
      schedule(k);
    };
  }
  function drainPreBoot(){
    var keys = Object.keys(_preBoot);
    if(!keys.length) return;
    _preBoot = {};
    console.log('[sync] ' + keys.length + ' escritura(s) previas al arranque — se suben ahora');
    keys.forEach(schedule);
  }

  /* ---------- Flush ---------- */
  function flush(k){
    if(_paused) return;   // _syncResume() drena la cola; el pendiente queda anotado
    // Ya hay un push de esta clave viajando. No se manda otro en paralelo: dos
    // respuestas cruzadas se pisan el snapshot y el flag de sucio. Al terminar,
    // pushOk() re-agenda solo si entró un cambio nuevo mientras tanto.
    if(_inFlight[k]) return;
    // Sin sesión tampoco se puede empujar, pero el cambio local sigue sin subir:
    // reintentar (y de paso la clave queda ocupada para que el poll no la pise).
    if(!sessionOk()){
      console.warn('[sync] sin sesión válida — se posterga "' + k + '"');
      retryLater(k);
      return;
    }
    if(k === PIPE_KEY){ syncPipeline(); return; }

    var v = lsGet(k);
    if(v === null){
      // La clave ya no existe (removeItem, o nunca se escribió). No hay nada que
      // subir; dejarla colgada en _retry la haría reintentar para siempre en
      // silencio, que es exactamente lo que hacía el `return` pelado de antes.
      console.warn('[sync] "' + k + '" ya no existe en localStorage — se descarta el pendiente');
      retryDone(k);
      return;
    }
    var seq = _dirtySeq[k];
    _inFlight[k] = true;
    pushSettings([{key: k, value: v}]).then(function(ok){
      delete _inFlight[k];
      ok ? pushOk(k, seq) : retryLater(k);
    });
  }

  function syncPipeline(){
    var read = readPipe();
    if(!read.ok){
      // JSON corrupto: no se puede calcular el diff. Antes se salía sin log y
      // sin resolver el pendiente. Se reintenta: el pendiente sigue contando
      // (es la verdad: eso no está sincronizado) y en cuanto la app reescriba
      // la clave, sube.
      console.error('[sync] "' + PIPE_KEY + '" tiene JSON inválido — no se puede sincronizar, se reintenta');
      retryLater(PIPE_KEY);
      return;
    }
    var arr = read.rows, nextSnap = {}, toUpsert = [], i, r, sk, id;
    for(i = 0; i < arr.length; i++){
      r = arr[i];
      if(!r || r.id == null) continue;
      sk = snapKey(r);
      nextSnap[r.id] = sk;
      if(_pipeSnap[r.id] !== sk) toUpsert.push(r);
    }
    var toDelete = [];
    for(id in _pipeSnap){ if(!(id in nextSnap)) toDelete.push(id); }
    // Borrados de una sesión anterior que nunca se confirmaron: no están ni en
    // el local ni en _pipeSnap, pero el servidor todavía los tiene.
    for(id in _dirtyDel){ if(!(id in nextSnap) && toDelete.indexOf(id) < 0) toDelete.push(id); }

    if(!toUpsert.length && !toDelete.length){
      _pipeSnap = nextSnap;
      retryDone(PIPE_KEY);
      return;
    }

    // Anotar la intención ANTES de intentar: si el navegador se cierra en el
    // medio, la próxima sesión sabe exactamente qué filas mandan localmente.
    for(i = 0; i < toUpsert.length; i++) _dirtyUp[toUpsert[i].id] = 1;
    for(i = 0; i < toDelete.length; i++) _dirtyDel[toDelete[i]] = 1;
    markDirty(PIPE_KEY);
    saveDirty();

    var prevSnap = _pipeSnap;
    var seq = _dirtySeq[PIPE_KEY];
    _pipeSnap = nextSnap;
    _inFlight[PIPE_KEY] = true;
    pushBegin();
    Promise.all([pushPipeRows(toUpsert.map(pickPipe)), delPipeRows(toDelete)]).then(function(res){
      pushDone();
      delete _inFlight[PIPE_KEY];
      if(res[0] && res[1]){
        for(var a = 0; a < toUpsert.length; a++) delete _dirtyUp[toUpsert[a].id];
        for(var b = 0; b < toDelete.length; b++) delete _dirtyDel[toDelete[b]];
        pushOk(PIPE_KEY, seq);
        return;
      }
      _pipeSnap = prevSnap;   // invariante 3: solo se avanza con push confirmado
      retryLater(PIPE_KEY);
    }, function(e){
      pushDone();
      delete _inFlight[PIPE_KEY];
      console.warn('[sync] pipeline', e);
      _pipeSnap = prevSnap;
      retryLater(PIPE_KEY);
    });
  }

  // Reintenta TODO lo pendiente reseteando el backoff. El backoff satura en 60s
  // y si la red volvía y el usuario cerraba la pestaña antes, el cambio nunca
  // llegaba a intentarse. Se dispara con 'online' y al volver a la pestaña.
  function flushDirty(motivo){
    if(!_booted){
      // Todavía no arrancó (típico: no había sesión). Adelantar el reintento.
      if(_bootTimer !== null){ clearTimeout(_bootTimer); _bootTimer = null; bootstrap(); }
      return;
    }
    var keys = Object.keys(_dirty);
    if(!keys.length) return;
    var now = Date.now();
    if(now - _lastFlushAll < 2000) return;   // 'online' y 'visibilitychange' suelen llegar juntos
    _lastFlushAll = now;
    console.log('[sync] ' + motivo + ' — reintentando ' + keys.length + ' clave(s) pendiente(s)');
    keys.forEach(function(k){
      delete _retry[k];                                  // la red volvió: backoff de cero
      clearTimeout(_timers[k]); delete _timers[k];
      flush(k);
    });
    saveDirty();
  }
  window.addEventListener('online', function(){ flushDirty('volvió la red'); });
  document.addEventListener('visibilitychange', function(){
    if(document.visibilityState === 'visible') flushDirty('pestaña visible');
  });

  /* ---------- Poll ---------- */
  function poll(){
    notifyPending();   // el contador depende del tiempo (gracia de _dirty)
    if(!_booted || _paused || _pushing > 0 || !sessionOk()) return;

    fetchRows('pipeline?' + BQ + '&select=*').then(function(res){
      if(!res.ok) return;                  // GET fallido: NO se toca nada
      if(keyBusy(PIPE_KEY)) return;        // cambio propio sin confirmar: primero sube lo nuestro
      var serverRows = res.data;
      serverRows.forEach(coerce);
      var read = readPipe();
      if(!read.ok) return;                 // local ilegible: que lo resuelva syncPipeline
      // El set de filas lo manda el servidor (así se propagan los borrados del
      // equipo), pero los campos de localOnlyCols se preservan de la fila local:
      // reemplazar el array entero destruía skuOvLinks en cada poll.
      var localById = {}, i;
      for(i = 0; i < read.rows.length; i++){
        if(read.rows[i] && read.rows[i].id != null) localById[read.rows[i].id] = read.rows[i];
      }
      var merged = serverRows.map(function(sr){ return keepLocalOnly(sr, localById[sr.id]); }).sort(byId);

      /* Una fila que ya está en el archivo (carchive) NO puede volver al
         pipeline vivo. Si el servidor todavía la tiene —otro equipo la re-subió
         antes de recibir el carchive nuevo, o su DELETE no pasó por permisos y
         el cliente lo dio por hecho— se saca de acá y se encola su borrado del
         servidor. Sin esto la fila "reaparece" en cada poll. */
      var _arch = pipeArchivedIds();
      if(!isEmpty(_arch)){
        var _resu = [];
        merged = merged.filter(function(r){
          if(r.id != null && _arch[r.id]){ _resu.push(String(r.id)); return false; }
          return true;
        });
        if(_resu.length){
          for(var _rd = 0; _rd < _resu.length; _rd++) _dirtyDel[_resu[_rd]] = 1;
          markDirty(PIPE_KEY); saveDirty(); schedule(PIPE_KEY);
        }
      }

      // normPipe compara solo las columnas sincronizadas (pickPipe ignora las
      // localOnly), así que una diferencia únicamente local no reescribe nada.
      if(normPipe(read.rows) === normPipe(merged)) return;
      if(!writePipe(merged)) return;       // no se pudo guardar: el snapshot NO puede avanzar
      _pipeSnap = {};
      merged.forEach(function(r){ if(r.id != null) _pipeSnap[r.id] = snapKey(r); });
      if(visible('p-pipeline') && typeof renderPipeline === 'function') renderPipeline();
    });

    fetchRows('app_settings?' + BQ + '&select=*').then(function(res){
      if(!res.ok) return;
      var changed = {};
      res.data.forEach(function(row){
        var k = row.key;
        if(SETTING_KEYS.indexOf(k) < 0) return;
        if(keyBusy(k)) return;             // cambio propio sin confirmar: no pisarlo
        var v = String(row.value);
        if(lsGet(k) === v) return;
        /* Las claves monótonas NO se pisan: se quedan con el mayor de los dos.
           Sin esto, un equipo con el contador atrasado se lo bajaba a todos y
           las próximas cotizaciones reusaban números ya emitidos. Si el nuestro
           es el que gana, hay que marcarlo sucio para que suba. */
        if(MONOTONIC[k]){
          var mayor = _mergeMonotona(k, v);
          if(mayor === null) return;       // gana el servidor y ya está aplicado
          markDirty(k);
          return;
        }
        if(rawSet(k, v)) changed[k] = 1;
      });
      applyChanged(changed);
    });
  }
  function startPolling(){
    if(_pollTimer === null) _pollTimer = setInterval(poll, POLL_MS);
  }

  /* ---------- Pausa / reanudación (importFullBackup) ---------- */
  window._syncPause = function(){
    _paused = true;
    _booted = false;
    if(_pollTimer !== null){ clearInterval(_pollTimer); _pollTimer = null; }
    if(_bootTimer !== null){ clearTimeout(_bootTimer); _bootTimer = null; }
    // Antes solo se apagaba _booted: los timers ya agendados seguían disparando
    // flush() (que ni miraba _booted) y el poll seguía vivo.
    for(var k in _timers){ clearTimeout(_timers[k]); }
    _timers = {};
  };
  window._syncResume = function(){
    _paused = false;
    _booted = true;
    startPolling();
    drainPreBoot();
    flushDirty('sync reanudada');
  };

  /* ---------- Seed: el localStorage es la fuente de verdad ---------- */
  function seedFromLocal(){
    var read = readPipe();
    if(!read.ok) console.error('[sync] "' + PIPE_KEY + '" ilegible — el seed sube solo los settings');
    var rows = [], i;
    for(i = 0; i < read.rows.length; i++){
      if(read.rows[i] && read.rows[i].id != null) rows.push(read.rows[i]);
    }
    var sets = [];
    SETTING_KEYS.forEach(function(k){ var v = lsGet(k); if(v !== null) sets.push({key: k, value: v}); });
    if(!rows.length && !sets.length) return;

    // pushBegin bloquea el poll mientras el seed sube (si no, el poll lee el
    // servidor vacío y pisa el localStorage recién restaurado).
    pushBegin();
    rows.forEach(function(r){ _pipeSnap[r.id] = snapKey(r); _dirtyUp[r.id] = 1; });
    if(rows.length) markDirty(PIPE_KEY);
    sets.forEach(function(s){ markDirty(s.key); });
    saveDirty();

    // _inFlight evita que el flushDirty('arranque') de finishBoot() mande todo
    // esto una segunda vez en paralelo.
    var seqs = {};
    seqs[PIPE_KEY] = _dirtySeq[PIPE_KEY];
    _inFlight[PIPE_KEY] = true;
    sets.forEach(function(s){ seqs[s.key] = _dirtySeq[s.key]; _inFlight[s.key] = true; });

    Promise.all([pushPipeRows(rows.map(pickPipe)), pushSettings(sets)]).then(function(res){
      pushDone();
      delete _inFlight[PIPE_KEY];
      sets.forEach(function(s){ delete _inFlight[s.key]; });
      // El seed es EL momento crítico (el localStorage es la única copia de los
      // datos): si no subió, hay que reintentar, no seguir como si nada.
      if(res[0]){
        rows.forEach(function(r){ delete _dirtyUp[r.id]; });
        pushOk(PIPE_KEY, seqs[PIPE_KEY]);
      } else {
        _pipeSnap = {};   // forzar el re-diff completo en el próximo intento
        retryLater(PIPE_KEY);
      }
      sets.forEach(function(s){ res[1] ? pushOk(s.key, seqs[s.key]) : retryLater(s.key); });
      if(res[0] && res[1]) console.log('[sync] base sembrada');
      else console.warn('[sync] el seed no subió completo — reintentando');
      saveDirty();
    });
  }

  /* ---------- Merge del servidor sobre el local (bootstrap) ----------
     NUNCA se pisa el pipeline local. Merge por id:
       · fila en los dos          → manda el servidor, SALVO que la fila esté
                                    sucia (cambio local sin confirmar).
       · fila solo local          → se conserva y se pushea.  ← lo que antes se
                                    perdía: el bootstrap escribía cpipeline con
                                    lo del servidor y RECIÉN DESPUÉS leía esa
                                    misma clave para "rescatar" lo local, así
                                    que siempre leía [] y el rescate era código
                                    muerto.
       · fila solo en el servidor → entra.
       · fila en _dirtyDel        → se borró local y el DELETE no subió: no se
                                    resucita, se vuelve a borrar. */
  function mergePipeIntoLocal(serverRows){
    var read = readPipe();
    if(!read.ok){
      console.error('[sync] "' + PIPE_KEY + '" ilegible — se reemplaza por el estado del servidor');
      var srv = serverRows.slice().sort(byId);
      if(writePipe(srv)){
        _pipeSnap = {};
        srv.forEach(function(r){ if(r.id != null) _pipeSnap[r.id] = snapKey(r); });
      }
      return;
    }
    var localRows = read.rows, i, r, id;
    var localById = {};
    for(i = 0; i < localRows.length; i++){
      r = localRows[i];
      if(r && r.id != null) localById[r.id] = r;
    }
    // Si la clave quedó sucia pero no sabemos QUÉ filas (el navegador se cerró
    // dentro de los 350ms del debounce), manda todo lo local. Conservador a
    // propósito: perder un cambio del equipo se arregla, perder el nuestro no.
    var rowLevel  = !isEmpty(_dirtyUp) || !isEmpty(_dirtyDel);
    var allLocal  = (_dirty[PIPE_KEY] !== undefined) && !rowLevel;

    /* Igual que en el poll: una fila que está en el archivo NO entra al pipeline
       vivo, ni siquiera si el servidor o el local todavía la tienen. Se encola
       su borrado. El archivo gana incluso sobre _dirtyUp: si se archivó, la
       decisión fue sacarla del vivo. */
    var _arch = pipeArchivedIds();
    var _archDel = 0;

    var out = [], pushIds = [], seen = {};
    for(i = 0; i < serverRows.length; i++){
      r = serverRows[i];
      if(r.id == null) continue;
      seen[r.id] = 1;
      if(_dirtyDel[r.id]) continue;
      if(_arch[r.id]){ _dirtyDel[r.id] = 1; _archDel++; continue; }
      var lr = localById[r.id];
      if(lr && (allLocal || _dirtyUp[r.id])){ out.push(lr); pushIds.push(r.id); }
      else out.push(keepLocalOnly(r, lr));
    }
    for(i = 0; i < localRows.length; i++){
      r = localRows[i];
      if(!r || r.id == null || seen[r.id] || _dirtyDel[r.id]) continue;
      if(_arch[r.id]){ _dirtyDel[r.id] = 1; _archDel++; continue; }
      out.push(r); pushIds.push(r.id);
    }
    out.sort(byId);
    if(!writePipe(out)) return;

    // _pipeSnap = lo que el servidor YA tiene. Las filas que mandan localmente
    // se dejan AFUERA a propósito, así el primer syncPipeline las detecta como
    // distintas y las sube.
    _pipeSnap = {};
    for(i = 0; i < out.length; i++){
      id = out[i].id;
      if(pushIds.indexOf(id) >= 0) continue;
      _pipeSnap[id] = snapKey(out[i]);
    }
    if(pushIds.length){
      console.log('[sync] arranque: ' + pushIds.length + ' fila(s) local(es) sin subir — se pushean');
      pushIds.forEach(function(x){ _dirtyUp[x] = 1; });
    }
    if(pushIds.length || _archDel){
      if(_archDel) console.log('[sync] arranque: ' + _archDel + ' fila(s) ya archivada(s) seguían en la tabla pipeline — se borran');
      markDirty(PIPE_KEY);
      saveDirty();
    }
  }

  // Decide quién gana clave por clave, pero NO pushea: se limita a dejar sucias
  // las que tiene que subir. finishBoot() llama a flushDirty() y las manda por
  // el único camino de subida que hay (flush), sin duplicar requests.
  /* Resuelve una clave monótona quedándose con el mayor de los dos valores.
     Devuelve null si gana el servidor (y lo escribe), o el valor local si el
     que gana es el nuestro — en ese caso el que llama tiene que markDirty()
     para que suba. Un valor no numérico de cualquiera de los dos lados hace
     que gane el servidor, que es el comportamiento de siempre. */
  function _mergeMonotona(k, serverVal){
    var loc = parseInt(lsGet(k), 10);
    var srv = parseInt(serverVal, 10);
    if(isNaN(srv)) return null;
    if(isNaN(loc) || srv >= loc){ rawSet(k, String(srv)); return null; }
    return String(loc);
  }

  function mergeSettings(serverSets){
    SETTING_KEYS.forEach(function(k){
      var local = lsGet(k);
      /* Las monótonas se resuelven ANTES del corte por "sucia": el contador de
         cotizaciones queda sucio en cuanto alguien guarda, y con la regla de
         abajo el local ganaba siempre — que es exactamente cómo un navegador
         con localStorage limpio le imponía `cqc = 1` a todo el equipo. */
      if(MONOTONIC[k]){
        var sv0 = serverSets[k];
        if(sv0 === undefined || sv0 === null){ if(local !== null) markDirty(k); return; }
        if(_mergeMonotona(k, sv0) !== null) markDirty(k);
        return;
      }
      // Clave sucia = cambio local sin confirmar: manda lo local, no se pisa.
      if(_dirty[k] !== undefined){
        if(local === null) retryDone(k);   // ya no existe: nada que subir
        return;
      }
      var sv = serverSets[k];
      if(sv !== undefined && sv !== null){
        var v = String(sv);
        if(local !== v) rawSet(k, v);
        return;
      }
      // El servidor no la tiene: si existe local, sembrarla.
      if(local !== null) markDirty(k);
    });
  }

  /* ---------- Bootstrap ---------- */
  function readImportFlag(){
    var f = false;
    try{
      // sessionStorage (https) primero, localStorage como fallback para file://
      f = sessionStorage.getItem('_ceven_import_reload') === '1';
      if(f) sessionStorage.removeItem('_ceven_import_reload');
      if(!f){
        f = localStorage.getItem('_ceven_import_reload') === '1';
        if(f) localStorage.removeItem('_ceven_import_reload');
      }
      // Flag POR MARCA: lo deja un restore de backup COMBINADO (varias marcas en
      // un archivo). Cada cotizador consume el suyo la primera vez que se abre y
      // empuja su parte restaurada — ver _applyCombinedBackupRestore() en
      // shared/backup.js.
      if(!f){
        var bk = cevenK('cimport_reload');
        f = lsGet(bk) === '1';
        if(f) try{ localStorage.removeItem(bk); }catch(e){}
      }
    }catch(e){}
    return f;
  }

  function finishBoot(){
    _booted = true;
    drainPreBoot();
    startPolling();
    flushDirty('arranque');
    notifyPending();
  }

  function bootstrap(){
    if(_paused) return;
    if(_bootTimer !== null){ clearTimeout(_bootTimer); _bootTimer = null; }

    // Sin sesión válida no hay sync (las policies de la base la rechazarían
    // igual). Antes se hacía `return` a secas: la sync quedaba muerta PARA
    // SIEMPRE, sin poll y sin _booted, y el contador de pendientes daba 0, o
    // sea que la UI decía "todo sincronizado" mientras nada subía. La sesión
    // puede aparecer sola (login en otra pestaña, refresh del token), así que
    // se reintenta.
    if(!sessionOk()){
      console.warn('[sync] sin sesión válida — se reintenta el arranque en ' + (BOOT_RETRY_MS / 1000) + 's');
      notifyPending();
      _bootTimer = setTimeout(bootstrap, BOOT_RETRY_MS);
      return;
    }

    // ¿Venimos de un import manual? Entonces el localStorage es la fuente de
    // verdad. Se traduce a "todas las claves sucias", que es exactamente la
    // regla de local-manda que ya maneja el resto del módulo — y como _dirty
    // se persiste, sobrevive aunque no haya conexión en este arranque.
    if(readImportFlag()){
      console.log('[sync] post-import — manda el localStorage');
      _pipeSnap = {};
      markDirty(PIPE_KEY);
      SETTING_KEYS.forEach(function(k){ if(lsGet(k) !== null) markDirty(k); });
      saveDirty();
    }

    Promise.all([
      fetchRows('pipeline?' + BQ + '&select=*'),
      fetchRows('app_settings?' + BQ + '&select=*')
    ]).then(function(res){
      var pipeRes = res[0], setsRes = res[1];

      if(!pipeRes.ok && !setsRes.ok){
        console.warn('[sync] sin conexión con Supabase (pipeline ' + pipeRes.status + ', settings ' +
                     setsRes.status + ') — la app corre con datos locales');
        // No se toca NADA: el localStorage es la única copia buena. _pipeSnap
        // queda vacío, así que el primer push manda todo el pipeline (upsert
        // idempotente, no rompe nada).
        finishBoot();
        return;
      }

      var serverSets = {};
      if(setsRes.ok) setsRes.data.forEach(function(r){ serverSets[r.key] = r.value; });
      if(pipeRes.ok) pipeRes.data.forEach(coerce);

      // "Vacío" solo se puede afirmar si las DOS lecturas funcionaron. Si una
      // falló, "no vi nada" no significa "no hay nada".
      var serverEmpty = pipeRes.ok && setsRes.ok &&
                        pipeRes.data.length === 0 && Object.keys(serverSets).length === 0;

      if(serverEmpty){
        console.log('[sync] base vacía — sembrando Supabase desde el localStorage');
        seedFromLocal();
      } else {
        if(pipeRes.ok) mergePipeIntoLocal(pipeRes.data);
        else console.warn('[sync] no se pudo leer el pipeline (' + pipeRes.status + ') — se conserva el local intacto');
        if(setsRes.ok) mergeSettings(serverSets);
        else console.warn('[sync] no se pudieron leer los settings (' + setsRes.status + ') — se conservan los locales');
      }
      rehydrate();
      finishBoot();
    });
  }

  loadDirty();
  notifyPending();
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bootstrap);
  else bootstrap();
})();
