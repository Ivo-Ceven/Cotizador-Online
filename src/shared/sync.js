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
   3) El snapshot de cada colección (C.snap) = "lo que Supabase ya
      tiene", fila por fila. Solo se puede avanzar con un push
      confirmado; ante cualquier fallo se vuelve atrás para que el
      próximo intento recalcule el diff completo (altas, ediciones y
      bajas).
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

  var _pushing   = 0;     // pushes en vuelo (contador, no booleano: se solapan)
  var _booted    = false;
  var _paused    = false;
  var _timers    = {};    // clave -> handle del debounce/backoff
  var _retry     = {};    // clave -> delay actual del backoff (ms)
  var _dirty     = {};    // clave -> timestamp del cambio local sin confirmar (invariante 2)
  var _dirtySeq  = {};    // clave -> versión del último cambio local (ver pushOk)
  var _seq       = 0;
  var _inFlight  = {};    // clave -> hay un push de esa clave viajando ahora
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
     _retry / _timers / los snapshots vivían solo en memoria: un F5 los borraba
     y el bootstrap siguiente daba lo local por perdido. Ahora el estado mínimo
     para no perder nada (qué claves están sucias y qué filas de cada colección
     faltan subir o borrar) se espeja en DIRTY_KEY.

     No se persiste el snapshot entero (sería una copia completa de la
     colección): se reconstruye del servidor en el bootstrap, que es exactamente
     lo que significa, y las filas sucias se dejan afuera a propósito para que
     el primer push las suba.

     `up`/`del` son {clave de colección: [ids]}. Hasta que hubo más de una
     colección eran dos arrays planos de ids del pipeline; loadDirty() sigue
     aceptando esa forma para no perder los pendientes de quien actualiza con la
     cola cargada. */

  function saveDirty(){
    var up = {}, del = {};
    COLECCIONES.forEach(function(C){
      var u = Object.keys(C.dUp), d = Object.keys(C.dDel);
      if(u.length) up[C.key]  = u;
      if(d.length) del[C.key] = d;
    });
    rawSet(DIRTY_KEY, JSON.stringify({ k: _dirty, r: _retry, up: up, del: del }));
  }
  function loadDirty(){
    var d = window.cevenLsJSON(DIRTY_KEY, null);
    if(!d || typeof d !== 'object') return;
    var k;
    if(d.k && typeof d.k === 'object'){
      for(k in d.k){
        if(coleccionDe(k) || SETTING_KEYS.indexOf(k) >= 0) _dirty[k] = Number(d.k[k]) || 0;
      }
    }
    if(d.r && typeof d.r === 'object'){
      for(k in d.r){ if(_dirty[k] !== undefined) _retry[k] = Number(d.r[k]) || 2500; }
    }
    // Forma vieja (arrays planos) = pendientes del pipeline; forma nueva, por clave.
    function repartir(v, destino){
      if(!v) return;
      if(Array.isArray(v)){
        var C0 = coleccionDe(PIPE_KEY);
        if(C0) v.forEach(function(id){ C0[destino][id] = 1; });
        return;
      }
      for(var kk in v){
        var C = coleccionDe(kk);
        if(C) (v[kk] || []).forEach(function(id){ C[destino][id] = 1; });
      }
    }
    repartir(d.up,  'dUp');
    repartir(d.del, 'dDel');
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
  /* ---------- Colecciones sincronizadas FILA POR FILA ----------
     Todo lo de abajo era una sola implementación cableada al pipeline
     (`pickPipe`, `_pipeSnap`, `syncPipeline`, `mergePipeIntoLocal`…). Es la
     única parte de la sync que NO sufre el last-write-wins, porque diffea por
     id y sube/borra fila por fila.

     Se generalizó a un factory para poder enchufarle una segunda colección: las
     cotizaciones, que hoy viajan como el blob `cquotes` en app_settings y por
     eso se pisan entre usuarios (ver docs/ARQUITECTURA.md y el banco de pruebas
     scripts/check-sync-colecciones.js).

     Cada colección es dueña de su clave de localStorage, su tabla, su snapshot
     de "lo que el servidor ya tiene" y sus dos colas de filas pendientes. Las
     tres invariantes de arriba valen igual para todas. */
  var COLECCIONES = [];

  function crearColeccion(cfg){
    var KEY     = cfg.key;
    var TABLA   = cfg.tabla;
    var COLS    = cfg.cols          || [];
    var NUMC    = cfg.numCols       || [];
    var OBJC    = cfg.objCols       || [];
    var NULLC   = cfg.nullCols      || [];
    var LOCALC  = cfg.localOnlyCols || [];
    var PADC    = cfg.padCols       || {};
    // Filas que NO pueden estar en la colección aunque el servidor las mande, y
    // cuyo borrado hay que encolar. Hoy solo lo usa el pipeline (el archivo).
    var EXCLUIR = cfg.excluirIds    || function(){ return {}; };
    var AL_CAMBIAR = cfg.alCambiar  || function(){};

    var C = {
      key:   KEY,
      tabla: TABLA,
      snap:  {},   // id -> snapKey de lo que Supabase YA tiene (invariante 3)
      dUp:   {},   // id de fila pendiente de upsert
      dDel:  {}    // id de fila pendiente de borrado
    };

    // Emite SIEMPRE el mismo set de columnas (COLS + brand) para todas las
    // filas. Dos razones:
    //  · Un escalar que se vacía tiene que viajar como null explícito. Si se
    //    omite, PostgREST conserva el valor viejo y el poll lo vuelve a traer:
    //    el pipeline entra en un ciclo de revert infinito cada 15s (el caso de
    //    la Factura en Poly y de ovLink/proyecto en Apple).
    //  · Un upsert en lote con filas de distinta forma rebota con
    //    PGRST102 "All object keys must match".
    // En las tablas solo id y brand son NOT NULL (son la PK), así que mandar
    // null en cualquier otra columna es seguro.
    //
    // nullableCols marca además los escalares que la app VACÍA a mano, y cada
    // pantalla lo hace a su manera: Poly guarda null (`factura = val==='' ? null
    // : val`), Apple borra la propiedad (`delete r.ovLink`) y un import de Excel
    // deja ''. Los tres significan lo mismo y los tres tienen que terminar en un
    // NULL de SQL, nunca en un string vacío.
    C.pick = function(row){
      var o = {}, i, c, val;
      for(i = 0; i < COLS.length; i++){
        c = COLS[i];
        val = row[c];
        if(OBJC.indexOf(c) >= 0){
          // jsonb: objeto nativo si tiene contenido, NULL si está vacío o borrado.
          if(typeof val === 'string'){ try{ val = JSON.parse(val); }catch(e){ val = null; } }
          o[c] = (val && typeof val === 'object' && Object.keys(val).length > 0) ? val : null;
        } else if(NULLC.indexOf(c) >= 0){
          o[c] = (val === undefined || val === null || val === '') ? null : val;
        } else {
          o[c] = (val === undefined) ? null : val;
        }
      }
      o.brand = BRAND;
      return o;
    };
    C.snapKey = function(row){ return JSON.stringify(C.pick(row)); };

    // Normaliza lo que devuelve Postgres para que vuelva a ser EXACTAMENTE el
    // objeto que la app tenía. Si no reconstruye lo mismo, el diff marca la fila
    // como cambiada en cada poll y la tabla se re-renderiza para siempre.
    C.coerce = function(r){
      delete r.brand;   // dato redundante localmente (este cotizador es 100% de su marca)
      var i, c;
      for(i = 0; i < NUMC.length; i++){
        c = NUMC[i];
        if(r[c] !== null && r[c] !== undefined && r[c] !== '') r[c] = Number(r[c]);
      }
      // Columnas numéricas en Supabase que la app guarda como string con ceros a
      // la izquierda (qNum en Apple: 71 -> '0071'). Sin esto el match contra
      // cquotes falla y el diff marca la fila como cambiada para siempre.
      for(c in PADC){
        if(r[c] !== null && r[c] !== undefined && r[c] !== '') r[c] = padNum(r[c], PADC[c]);
      }
      // jsonb: Supabase devuelve objetos nativos, pero por si acaso vienen string
      for(i = 0; i < OBJC.length; i++){
        var oc = OBJC[i];
        if(r[oc] && typeof r[oc] === 'string'){ try{ r[oc] = JSON.parse(r[oc]); }catch(e){ r[oc] = null; } }
      }
      return r;
    };

    // Copia sobre la fila del servidor los campos que solo existen en local
    // (localOnlyCols: no hay columna en Supabase, el servidor los ignora).
    C.keepLocalOnly = function(serverRow, localRow){
      if(!localRow) return serverRow;
      for(var i = 0; i < LOCALC.length; i++){
        var c = LOCALC[i];
        if(localRow[c] !== undefined) serverRow[c] = localRow[c];
      }
      return serverRow;
    };

    /* Lectura que distingue "vacío" de "ilegible". Es la diferencia entre no
       hacer nada y borrar todo del servidor.

       `leerFilas`/`escribirFilas` existen porque no toda colección guarda en
       localStorage con la misma forma con la que viaja a la tabla: `cquotes` es
       un array PLANO de líneas y la tabla tiene una fila por cotización. El
       adaptador vive en shared/quotes-store.js; acá solo se lo llama. */
    C.read = function(){
      var raw = lsGet(KEY);
      if(raw === null || raw === '') return {ok: true, rows: []};
      var v;
      try{ v = JSON.parse(raw); }catch(e){ return {ok: false, rows: []}; }
      if(!Array.isArray(v)) return {ok: false, rows: []};
      return {ok: true, rows: cfg.leerFilas ? cfg.leerFilas(v) : v};
    };
    C.write = function(rows){
      return rawSet(KEY, JSON.stringify(cfg.escribirFilas ? cfg.escribirFilas(rows) : rows));
    };
    // El orden por defecto es numérico por id (el pipeline usa Date.now()).
    // `cquotes` tiene ids de texto, así que trae el suyo.
    C.orden = cfg.orden || byId;
    C.norm  = function(arr){ return JSON.stringify(arr.map(C.pick).sort(C.orden)); };
    C.excluirIds = EXCLUIR;
    C.alCambiar  = AL_CAMBIAR;
    /* Durante la transición, `cquotes` se sigue subiendo ADEMÁS como el blob de
       siempre, para que un cliente sin actualizar no se quede sin historial. Se
       ESCRIBE el blob pero no se LEE nunca: la tabla es la única fuente de
       verdad, y así un blob viejo no puede pisar a un cliente nuevo. */
    C.espejoBlob = !!cfg.espejoBlob;
    // Última oportunidad de ajustar las filas locales antes de mezclarlas con
    // las del servidor, ya con las del servidor en la mano.
    C.preMerge = cfg.preMerge || function(locales){ return locales; };
    // Qué hacer cuando el servidor rechaza el push por un unique que no es la PK
    // (en cotizaciones: dos personas tomaron el mismo número).
    C.alChocar = cfg.alChocar || null;

    /* ---------- Push ----------
       Los dos devuelven true/false ("¿quedó guardado en Supabase?") y NUNCA
       rechazan. Es la pieza central: antes se tragaban el error de red y el
       llamador daba el cambio por subido, así que un push perdido no se
       reintentaba jamás y el siguiente poll lo pisaba con el estado del
       servidor. */
    /* Resuelve a {ok, conflicto}. `conflicto` trae el cuerpo del error cuando el
       rechazo es por una restricción UNIQUE que NO es la PK (código 23505): el
       upsert resuelve los choques de PK solo, así que un 23505 significa que
       otra fila ya se quedó con un valor único —en `cotizaciones`, el número—.
       Eso no se reintenta igual que un fallo de red: hay que cambiar el dato
       primero, y de eso se ocupa C.alChocar. */
    C.pushRows = function(rows){
      if(!rows.length) return Promise.resolve({ok: true, conflicto: null});
      return sfetch(TABLA, {method: 'POST', headers: {'Prefer': 'resolution=merge-duplicates,return=minimal'}, body: JSON.stringify(rows)})
        .then(function(r){
          if(r.ok) return {ok: true, conflicto: null};
          return r.text().then(function(t){
            console.warn('[sync] upsert ' + TABLA + ' ' + r.status + ':', t);
            var esUnique = (r.status === 409) || (String(t).indexOf('23505') >= 0);
            return {ok: false, conflicto: esUnique ? String(t) : null};
          }, function(){ return {ok: false, conflicto: null}; });
        }, function(e){ console.warn('[sync] upsert ' + TABLA, e); return {ok: false, conflicto: null}; });
    };
    // Los ids van en la query string: con ~500 filas la URL pasaba los 8KB, el
    // servidor devolvía 414 y se reintentaba la MISMA URL para siempre.
    C.delRows = function(ids){
      if(!ids.length) return Promise.resolve(true);
      var chunks = [], i;
      for(i = 0; i < ids.length; i += DEL_CHUNK) chunks.push(ids.slice(i, i + DEL_CHUNK));
      return Promise.all(chunks.map(function(chunk){
        var list = chunk.map(function(id){ return encodeURIComponent(String(id)); }).join(',');
        return sfetch(TABLA + '?' + BQ + '&id=in.(' + list + ')', {method: 'DELETE'})
          .then(function(r){
            if(!r.ok) console.warn('[sync] delete ' + TABLA + ' ' + r.status + ' (' + chunk.length + ' ids)');
            return r.ok;
          }, function(e){ console.warn('[sync] delete ' + TABLA, e); return false; });
      })).then(function(res){
        // Todos o ninguno: si un lote falló, el diff se recalcula entero.
        return res.every(function(ok){ return ok; });
      });
    };

    COLECCIONES.push(C);
    return C;
  }

  function coleccionDe(k){
    for(var i = 0; i < COLECCIONES.length; i++){ if(COLECCIONES[i].key === k) return COLECCIONES[i]; }
    return null;
  }

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
  function byId(a, b){ return (Number(a.id) || 0) - (Number(b.id) || 0); }
  function visible(id){ var el = document.getElementById(id); return !!(el && el.classList.contains('on')); }

  /* ---------- La colección `pipeline` ----------
     La primera (y por ahora única) colección fila por fila. Todo lo que la
     distingue sale de CEVEN_BRAND, igual que antes; lo que cambió es que la
     lógica ya no está cableada a ella.

     `excluirIds`: una fila que ya está en el archivo (carchive) NO puede volver
     al pipeline vivo. */
  var PIPE = crearColeccion({
    key:           PIPE_KEY,
    tabla:         'pipeline',
    cols:          PIPE_COLS,
    numCols:       NUM_COLS,
    objCols:       OBJ_COLS,
    nullCols:      NULL_COLS,
    localOnlyCols: LOCAL_ONLY,
    padCols:       PAD_COLS,
    excluirIds:    pipeArchivedIds,
    alCambiar:     function(){
      if(visible('p-pipeline') && typeof renderPipeline === 'function') renderPipeline();
      else if(visible('p-regi-stats') && typeof renderRegiStats === 'function') renderRegiStats();
    }
  });

  /* ---------- La colección `cotizaciones` ----------
     El historial dejó de viajar como el blob `cquotes` de app_settings. La
     traducción entre el array plano del localStorage y la fila por cotización
     de la tabla la hace shared/quotes-store.js (se carga ANTES que este
     archivo); acá solo se la enchufa.

     Mientras dure la transición se sigue subiendo el blob (`espejoBlob`) para
     que un cliente sin actualizar no se quede sin historial, pero NUNCA se lo
     lee: ver el corte en poll() y en mergeSettings(). */
  var QUOTES_KEY = window.cevenK('cquotes');
  var QUOTES = (typeof cevenQAgrupar === 'function') ? crearColeccion({
    key:      QUOTES_KEY,
    tabla:    'cotizaciones',
    cols:     ['id','qnum','cliente','proyecto','ejecutivo','estado','mesCierre','lineas','cond'],
    numCols:  ['qnum'],
    objCols:  ['lineas','cond'],
    nullCols: ['cliente','proyecto','ejecutivo','estado','mesCierre'],
    padCols:  { qnum: 4 },   // la columna es bigint; la app lo maneja como '0100'
    espejoBlob: true,

    // localStorage guarda líneas sueltas; la tabla, una fila por cotización.
    leerFilas:     function(plano){ return cevenQMarcarLegacy(cevenQAgrupar(plano), plano); },
    escribirFilas: function(cotiz){ return cevenQAplanar(cotiz); },
    // Los ids son texto (uuid o 'q0100'): byId los volvería NaN. Se ordena por
    // número, que es además como el historial se lee.
    orden: function(a, b){ return (parseInt(a.qnum, 10) || 0) - (parseInt(b.qnum, 10) || 0); },

    preMerge: function(locales, serverRows){
      var r = cevenQReconciliar(locales, serverRows);
      if(r.renumeradas.length){
        console.warn('[sync] ' + r.renumeradas.length + ' cotización(es) local(es) sin sincronizar chocaban con otra del equipo — se renumeraron para no perder ninguna');
        r.renumeradas.forEach(function(x){
          if(typeof showToast === 'function'){
            showToast('La cotización #' + x.de + ' ya la había usado otra del equipo. La tuya quedó como #' + x.a + '.');
          }
        });
      }
      return r.cotiz;
    },

    /* Dos personas tomaron el mismo número. El unique de la tabla rebotó, así
       que la etiqueta se cambia y se reintenta. La cotización NO se pierde: su
       identidad es el id, no el número. */
    alChocar: function(detalle, intentadas){
      /* CUÁL número choca lo dice el error, no nuestro snapshot: el sentido de
         todo esto es que este navegador NO sabe qué tomó el resto del equipo.
         Postgres devuelve "Key (brand, qnum)=(apple, 2) already exists.". */
      var m = /\(brand,\s*qnum\)=\(\s*[^,]*,\s*(\d+)\s*\)/.exec(String(detalle || ''));
      if(!m) return false;               // no se pudo leer: reintento normal
      var chocado = parseInt(m[1], 10);
      if(isNaN(chocado)) return false;

      var read = QUOTES.read();
      if(!read.ok) return false;

      // El próximo libre que conocemos. Si vuelve a chocar, rebota otra vez y
      // sube de nuevo: converge, porque el número solo puede crecer.
      var max = chocado;
      read.rows.forEach(function(c){
        var n = parseInt(c.qnum, 10);
        if(!isNaN(n) && n > max) max = n;
      });

      // Solo se renumera la que se intentó subir Y tiene el número que rebotó.
      var enIntento = {};
      (intentadas || []).forEach(function(c){ enIntento[c.id] = 1; });
      var cambio = false;
      read.rows.forEach(function(c){
        if(!enIntento[c.id] || parseInt(c.qnum, 10) !== chocado) return;
        max += 1;
        var nuevo = String(max).padStart(4, '0');
        if(typeof showToast === 'function'){
          showToast('El número #' + c.qnum + ' ya lo usó otra cotización del equipo. Esta quedó como #' + nuevo + '.');
        }
        c.qnum = nuevo;
        cambio = true;
      });
      if(!cambio) return false;
      if(!QUOTES.write(read.rows)) return false;
      /* El contador tiene que enterarse, o la próxima cotización vuelve a nacer
         con un número ya usado. cevenAnotarQNum solo sube, nunca baja. */
      if(typeof cevenAnotarQNum === 'function') cevenAnotarQNum(max);
      QUOTES.snap = {};   // forzar el re-diff completo con los números nuevos
      if(visible('p-history') && typeof renderHistory === 'function') renderHistory();
      return true;
    },

    alCambiar: function(){
      if(visible('p-history') && typeof renderHistory === 'function') renderHistory();
    }
  }) : null;
  if(!QUOTES) console.error('[sync] falta shared/quotes-store.js — tiene que cargarse ANTES que shared/sync.js; las cotizaciones siguen sincronizando como blob');

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
    try{ if(visible('p-regi-stats') && typeof renderRegiStats === 'function') renderRegiStats(); }catch(e){}
    try{ if(visible('p-history') && typeof renderHistory === 'function') renderHistory(); }catch(e){}
  }

  /* ---------- Intercept del guardado (sobre el prototipo) ---------- */
  if(SP){
    SP.setItem = function(k, v){
      if(METHOD_KEYS[k]) return;              // nunca guardar claves con nombre de método
      _origSetItem.call(this, k, v);
      if(this !== window.localStorage) return;
      if(!coleccionDe(k) && SETTING_KEYS.indexOf(k) < 0) return;
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
    var col = coleccionDe(k);
    if(col){ syncColeccion(col); return; }

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

  // Diffea la colección contra su snapshot y sube altas/ediciones y bajas.
  function syncColeccion(C){
    var read = C.read();
    if(!read.ok){
      // JSON corrupto: no se puede calcular el diff. Antes se salía sin log y
      // sin resolver el pendiente. Se reintenta: el pendiente sigue contando
      // (es la verdad: eso no está sincronizado) y en cuanto la app reescriba
      // la clave, sube.
      console.error('[sync] "' + C.key + '" tiene JSON inválido — no se puede sincronizar, se reintenta');
      retryLater(C.key);
      return;
    }
    var arr = read.rows, nextSnap = {}, toUpsert = [], i, r, sk, id;
    for(i = 0; i < arr.length; i++){
      r = arr[i];
      if(!r || r.id == null) continue;
      sk = C.snapKey(r);
      nextSnap[r.id] = sk;
      if(C.snap[r.id] !== sk) toUpsert.push(r);
    }
    var toDelete = [];
    for(id in C.snap){ if(!(id in nextSnap)) toDelete.push(id); }
    // Borrados de una sesión anterior que nunca se confirmaron: no están ni en
    // el local ni en el snapshot, pero el servidor todavía los tiene.
    for(id in C.dDel){ if(!(id in nextSnap) && toDelete.indexOf(id) < 0) toDelete.push(id); }

    if(!toUpsert.length && !toDelete.length){
      C.snap = nextSnap;
      retryDone(C.key);
      return;
    }

    // Anotar la intención ANTES de intentar: si el navegador se cierra en el
    // medio, la próxima sesión sabe exactamente qué filas mandan localmente.
    for(i = 0; i < toUpsert.length; i++) C.dUp[toUpsert[i].id] = 1;
    for(i = 0; i < toDelete.length; i++) C.dDel[toDelete[i]] = 1;
    markDirty(C.key);
    saveDirty();

    var prevSnap = C.snap;
    var seq = _dirtySeq[C.key];
    C.snap = nextSnap;
    _inFlight[C.key] = true;
    pushBegin();
    // El espejo del blob viaja en el mismo lote (ver C.espejoBlob). Que falle NO
    // invalida el push de las filas: la tabla es la fuente de verdad y el blob
    // es solo compatibilidad hacia atrás.
    var espejo = C.espejoBlob
      ? pushSettings([{key: C.key, value: lsGet(C.key) || '[]'}])
      : Promise.resolve(true);
    Promise.all([C.pushRows(toUpsert.map(C.pick)), C.delRows(toDelete), espejo]).then(function(res){
      pushDone();
      delete _inFlight[C.key];
      var up = res[0];
      if(up.ok && res[1]){
        for(var a = 0; a < toUpsert.length; a++) delete C.dUp[toUpsert[a].id];
        for(var b = 0; b < toDelete.length; b++) delete C.dDel[toDelete[b]];
        pushOk(C.key, seq);
        return;
      }
      C.snap = prevSnap;   // invariante 3: solo se avanza con push confirmado
      /* Rechazo por UNIQUE: reintentar el mismo dato daría el mismo error para
         siempre. Hay que cambiarlo primero —renumerar la cotización— y recién
         ahí volver a intentar. */
      if(!up.ok && up.conflicto && C.alChocar){
        try{
          if(C.alChocar(up.conflicto, toUpsert)) schedule(C.key);
          else retryLater(C.key);
        }catch(e){ console.warn('[sync] alChocar de "' + C.key + '"', e); retryLater(C.key); }
        return;
      }
      retryLater(C.key);
    }, function(e){
      pushDone();
      delete _inFlight[C.key];
      console.warn('[sync] ' + C.tabla, e);
      C.snap = prevSnap;
      retryLater(C.key);
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

    COLECCIONES.forEach(function(C){
      fetchRows(C.tabla + '?' + BQ + '&select=*').then(function(res){
        if(!res.ok) return;                // GET fallido: NO se toca nada
        if(keyBusy(C.key)) return;         // cambio propio sin confirmar: primero sube lo nuestro
        var serverRows = res.data;
        serverRows.forEach(C.coerce);
        var read = C.read();
        if(!read.ok) return;               // local ilegible: que lo resuelva syncColeccion
        // El set de filas lo manda el servidor (así se propagan los borrados del
        // equipo), pero los campos de localOnlyCols se preservan de la fila local:
        // reemplazar el array entero destruía skuOvLinks en cada poll.
        var localById = {}, i;
        for(i = 0; i < read.rows.length; i++){
          if(read.rows[i] && read.rows[i].id != null) localById[read.rows[i].id] = read.rows[i];
        }
        var merged = serverRows.map(function(sr){ return C.keepLocalOnly(sr, localById[sr.id]); }).sort(byId);

        /* Una fila excluida NO puede volver a la colección. En el pipeline son
           las que ya están en el archivo (carchive): si el servidor todavía las
           tiene —otro equipo las re-subió antes de recibir el carchive nuevo, o
           su DELETE no pasó por permisos y el cliente lo dio por hecho— se sacan
           de acá y se encola su borrado. Sin esto la fila "reaparece" en cada
           poll. */
        var _exc = C.excluirIds();
        if(!isEmpty(_exc)){
          var _resu = [];
          merged = merged.filter(function(r){
            if(r.id != null && _exc[r.id]){ _resu.push(String(r.id)); return false; }
            return true;
          });
          if(_resu.length){
            for(var _rd = 0; _rd < _resu.length; _rd++) C.dDel[_resu[_rd]] = 1;
            markDirty(C.key); saveDirty(); schedule(C.key);
          }
        }

        // C.norm compara solo las columnas sincronizadas (C.pick ignora las
        // localOnly), así que una diferencia únicamente local no reescribe nada.
        if(C.norm(read.rows) === C.norm(merged)) return;
        if(!C.write(merged)) return;       // no se pudo guardar: el snapshot NO puede avanzar
        C.snap = {};
        merged.forEach(function(r){ if(r.id != null) C.snap[r.id] = C.snapKey(r); });
        try{ C.alCambiar(); }catch(e){ console.warn('[sync] render de "' + C.key + '"', e); }
      });
    });

    fetchRows('app_settings?' + BQ + '&select=*').then(function(res){
      if(!res.ok) return;
      var changed = {};
      res.data.forEach(function(row){
        var k = row.key;
        if(SETTING_KEYS.indexOf(k) < 0) return;
        /* Una clave que además es colección (cquotes) se ESCRIBE como blob por
           compatibilidad, pero NO se lee nunca: su verdad está en la tabla. Sin
           este corte, el blob viejo de un cliente sin actualizar volvería a
           pisar el historial de uno actualizado, que es el bug entero. */
        if(coleccionDe(k)) return;
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
    // Filas por colección, ya filtradas a las que tienen id.
    var porCol = COLECCIONES.map(function(C){
      var read = C.read();
      if(!read.ok) console.error('[sync] "' + C.key + '" ilegible — el seed lo saltea');
      var rows = [], i;
      for(i = 0; i < read.rows.length; i++){
        if(read.rows[i] && read.rows[i].id != null) rows.push(read.rows[i]);
      }
      return {C: C, rows: rows};
    });
    var sets = [];
    SETTING_KEYS.forEach(function(k){ var v = lsGet(k); if(v !== null) sets.push({key: k, value: v}); });
    var hayFilas = porCol.some(function(p){ return p.rows.length > 0; });
    if(!hayFilas && !sets.length) return;

    // pushBegin bloquea el poll mientras el seed sube (si no, el poll lee el
    // servidor vacío y pisa el localStorage recién restaurado).
    pushBegin();
    var seqs = {};
    porCol.forEach(function(p){
      p.rows.forEach(function(r){ p.C.snap[r.id] = p.C.snapKey(r); p.C.dUp[r.id] = 1; });
      if(p.rows.length) markDirty(p.C.key);
    });
    sets.forEach(function(s){ markDirty(s.key); });
    saveDirty();

    // _inFlight evita que el flushDirty('arranque') de finishBoot() mande todo
    // esto una segunda vez en paralelo.
    porCol.forEach(function(p){ seqs[p.C.key] = _dirtySeq[p.C.key]; _inFlight[p.C.key] = true; });
    sets.forEach(function(s){ seqs[s.key] = _dirtySeq[s.key]; _inFlight[s.key] = true; });

    Promise.all(
      porCol.map(function(p){ return p.C.pushRows(p.rows.map(p.C.pick)); })
        .concat([pushSettings(sets)])
    ).then(function(res){
      pushDone();
      var okSets = res[res.length - 1];
      var todoOk = okSets;
      porCol.forEach(function(p, i){
        delete _inFlight[p.C.key];
        // El seed es EL momento crítico (el localStorage es la única copia de
        // los datos): si no subió, hay que reintentar, no seguir como si nada.
        if(res[i] && res[i].ok){
          p.rows.forEach(function(r){ delete p.C.dUp[r.id]; });
          pushOk(p.C.key, seqs[p.C.key]);
        } else {
          p.C.snap = {};   // forzar el re-diff completo en el próximo intento
          retryLater(p.C.key);
          todoOk = false;
        }
      });
      sets.forEach(function(s){ delete _inFlight[s.key]; });
      sets.forEach(function(s){ okSets ? pushOk(s.key, seqs[s.key]) : retryLater(s.key); });
      if(todoOk) console.log('[sync] base sembrada');
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
       · fila en C.dDel           → se borró local y el DELETE no subió: no se
                                    resucita, se vuelve a borrar. */
  function mergeColeccionIntoLocal(C, serverRows){
    var read = C.read();
    if(!read.ok){
      console.error('[sync] "' + C.key + '" ilegible — se reemplaza por el estado del servidor');
      var srv = serverRows.slice().sort(byId);
      if(C.write(srv)){
        C.snap = {};
        srv.forEach(function(r){ if(r.id != null) C.snap[r.id] = C.snapKey(r); });
      }
      return;
    }
    /* Última chance de ajustar lo local ANTES de mezclar, ya con las filas del
       servidor a la vista. En cotizaciones es donde se reconcilian las que se
       guardaron antes de que existiera la tabla: si una quedó sin sincronizar y
       el servidor tiene otra distinta con el mismo id derivado del número, acá
       se le da identidad nueva para que sobrevivan las dos. */
    var localRows = C.preMerge(read.rows, serverRows), i, r, id;
    var localById = {};
    for(i = 0; i < localRows.length; i++){
      r = localRows[i];
      if(r && r.id != null) localById[r.id] = r;
    }
    // Si la clave quedó sucia pero no sabemos QUÉ filas (el navegador se cerró
    // dentro de los 350ms del debounce), manda todo lo local. Conservador a
    // propósito: perder un cambio del equipo se arregla, perder el nuestro no.
    var rowLevel  = !isEmpty(C.dUp) || !isEmpty(C.dDel);
    var allLocal  = (_dirty[C.key] !== undefined) && !rowLevel;

    /* Igual que en el poll: una fila excluida (en el pipeline, una que ya está
       en el archivo) NO entra a la colección, ni siquiera si el servidor o el
       local todavía la tienen. Se encola su borrado. La exclusión gana incluso
       sobre dUp: si se archivó, la decisión fue sacarla del vivo. */
    var _exc = C.excluirIds();
    var _excDel = 0;

    var out = [], pushIds = [], seen = {};
    for(i = 0; i < serverRows.length; i++){
      r = serverRows[i];
      if(r.id == null) continue;
      seen[r.id] = 1;
      if(C.dDel[r.id]) continue;
      if(_exc[r.id]){ C.dDel[r.id] = 1; _excDel++; continue; }
      var lr = localById[r.id];
      if(lr && (allLocal || C.dUp[r.id])){ out.push(lr); pushIds.push(r.id); }
      else out.push(C.keepLocalOnly(r, lr));
    }
    for(i = 0; i < localRows.length; i++){
      r = localRows[i];
      if(!r || r.id == null || seen[r.id] || C.dDel[r.id]) continue;
      if(_exc[r.id]){ C.dDel[r.id] = 1; _excDel++; continue; }
      out.push(r); pushIds.push(r.id);
    }
    out.sort(byId);
    if(!C.write(out)) return;

    // C.snap = lo que el servidor YA tiene. Las filas que mandan localmente se
    // dejan AFUERA a propósito, así el primer syncColeccion las detecta como
    // distintas y las sube.
    C.snap = {};
    for(i = 0; i < out.length; i++){
      id = out[i].id;
      if(pushIds.indexOf(id) >= 0) continue;
      C.snap[id] = C.snapKey(out[i]);
    }
    if(pushIds.length){
      console.log('[sync] arranque: ' + pushIds.length + ' fila(s) local(es) de ' + C.tabla + ' sin subir — se pushean');
      pushIds.forEach(function(x){ C.dUp[x] = 1; });
    }
    if(pushIds.length || _excDel){
      if(_excDel) console.log('[sync] arranque: ' + _excDel + ' fila(s) ya archivada(s) seguían en la tabla ' + C.tabla + ' — se borran');
      markDirty(C.key);
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
      // Las que son colección se resuelven contra su TABLA, no contra el blob
      // (ver C.espejoBlob). Leerlas acá sería volver al last-write-wins.
      if(coleccionDe(k)) return;
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
      COLECCIONES.forEach(function(C){ C.snap = {}; markDirty(C.key); });
      SETTING_KEYS.forEach(function(k){ if(lsGet(k) !== null) markDirty(k); });
      saveDirty();
    }

    Promise.all(
      COLECCIONES.map(function(C){ return fetchRows(C.tabla + '?' + BQ + '&select=*'); })
        .concat([fetchRows('app_settings?' + BQ + '&select=*')])
    ).then(function(res){
      var setsRes  = res[res.length - 1];
      var colRes   = COLECCIONES.map(function(C, i){ return {C: C, res: res[i]}; });
      var algunaOk = colRes.some(function(x){ return x.res.ok; });

      if(!algunaOk && !setsRes.ok){
        console.warn('[sync] sin conexión con Supabase (settings ' + setsRes.status +
                     ') — la app corre con datos locales');
        // No se toca NADA: el localStorage es la única copia buena. Los
        // snapshots quedan vacíos, así que el primer push manda todo (upsert
        // idempotente, no rompe nada).
        finishBoot();
        return;
      }

      var serverSets = {};
      if(setsRes.ok) setsRes.data.forEach(function(r){ serverSets[r.key] = r.value; });
      colRes.forEach(function(x){ if(x.res.ok) x.res.data.forEach(x.C.coerce); });

      // "Vacío" solo se puede afirmar si TODAS las lecturas funcionaron. Si una
      // falló, "no vi nada" no significa "no hay nada".
      var serverEmpty = setsRes.ok && Object.keys(serverSets).length === 0 &&
                        colRes.every(function(x){ return x.res.ok && x.res.data.length === 0; });

      if(serverEmpty){
        console.log('[sync] base vacía — sembrando Supabase desde el localStorage');
        seedFromLocal();
      } else {
        colRes.forEach(function(x){
          if(x.res.ok) mergeColeccionIntoLocal(x.C, x.res.data);
          else console.warn('[sync] no se pudo leer ' + x.C.tabla + ' (' + x.res.status + ') — se conserva el local intacto');
        });
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
