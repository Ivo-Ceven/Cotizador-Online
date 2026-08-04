/* ============================================================
   TAREAS DEL EQUIPO  ·  store + sincronización
   ------------------------------------------------------------
   Organizador colaborativo compartido entre marcas: no es de un
   cotizador, vive en el shell. Hasta la v5.0 era una checklist
   plana pintada dentro de src/index.html; desde la 5.1 es un
   TABLERO de tres columnas (to do / doing / done) con miembros
   delegados, en su propia página (src/tareas/).

   Este archivo NO pinta el tablero — eso es tareas/js/board.js.
   Acá está lo que las dos páginas necesitan compartir:

     · el estado en memoria + su caché en localStorage,
     · la sincronización contra Supabase (REST directo, sin el
       intercept de localStorage que usan los cotizadores: acá
       alcanza con pintar al toque + pushear + poll cada 15 s,
       igual que el pipeline),
     · la lista del equipo (RPC ceven_equipo),
     · y la pastilla de pendientes de la tarjeta del shell, que es
       lo único que el shell sigue mostrando.

   API pública: window.cevenTareas (ver el bloque del final).

   ------------------------------------------------------------
   DEGRADACIÓN: la app se puede deployar ANTES que la migración
   20260804100000_tareas_tablero_y_equipo.sql. Mientras eso pase,
   `todos` no tiene ni `estado` ni `asignados` y `ceven_equipo()`
   no existe. Las dos cosas se detectan por la respuesta del
   servidor y se degradan solas —tablero en modo checklist, equipo
   deducido de lo que haya— en vez de dejar la pantalla rota. Ver
   `_sinTablero` y `equipoFallback()`.
   ============================================================ */
(function(){
  if(!window.SUPABASE_URL) return; // sin base configurada: no hay nada que sincronizar

  var REST       = SUPABASE_URL + '/rest/v1/';
  var CACHE_KEY  = 'ceven_todos_cache';
  var EQUIPO_KEY = 'ceven_equipo_cache';
  var ESTADOS    = ['todo', 'doing', 'done'];

  var _todos  = [];
  var _equipo = [];
  var _subs   = [];
  var _booted = false;
  var _sinTablero = false;   // la base todavía no tiene las columnas nuevas
  var _avisoTablero = false; // el cartel de arriba se muestra una sola vez

  /* Cambios locales que el poll NO debe pisar. Sin esto, mover una tarjeta y
     que el poll de los 15 s conteste con la foto anterior la devuelve sola a
     su columna durante un ciclo entero — y parece que la app perdió el gesto.
     La ventana es corta a propósito: pasada, gana el servidor, que es lo que
     hace que el tablero converja entre varias personas. */
  var _local    = {};   // id -> ms hasta cuando el valor local manda
  var _borrados = {};   // id -> ms hasta cuando un borrado local tapa al servidor
  var VENTANA   = 8000;

  /* ── REST ──────────────────────────────────────────────────────────────── */
  function authHeaders(){
    var sess = (typeof cevenGetSession === 'function') ? cevenGetSession() : null;
    return {
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': 'Bearer ' + ((sess && sess.access_token) || ''),
      'Content-Type': 'application/json'
    };
  }
  function tfetch(path, opts){
    opts = opts || {};
    return fetch(REST + path, Object.assign({}, opts, {
      headers: Object.assign(authHeaders(), opts.headers || {})
    }));
  }
  function sessionOk(){
    return (typeof cevenIsValidSession === 'function') && cevenIsValidSession();
  }
  function puedeEscribir(){
    return (typeof cevenMyRole !== 'function') || cevenMyRole() !== 'lector';
  }

  /* ── Caché local ───────────────────────────────────────────────────────── */
  function loadCache(){
    try{ _todos = (JSON.parse(localStorage.getItem(CACHE_KEY) || '[]') || []).map(normalizar); }
    catch(e){ _todos = []; }
    try{ _equipo = JSON.parse(localStorage.getItem(EQUIPO_KEY) || '[]') || []; }
    catch(e){ _equipo = []; }
  }
  function saveCache(){
    try{ localStorage.setItem(CACHE_KEY, JSON.stringify(_todos)); }catch(e){}
  }

  /* ── Forma canónica de una tarea ───────────────────────────────────────────
     Toda fila que entra —del servidor, de la caché o recién creada— pasa por
     acá, así el resto del código nunca tiene que preguntarse si `asignados`
     vino como null o si `estado` existe. Con la migración sin aplicar, el
     estado se deriva de `hecho`, que es exactamente lo que hace el trigger del
     otro lado. */
  function normalizar(r){
    r = r || {};
    var estado = (ESTADOS.indexOf(r.estado) >= 0) ? r.estado : (r.hecho ? 'done' : 'todo');
    return {
      id:        Number(r.id),
      texto:     String(r.texto == null ? '' : r.texto),
      estado:    estado,
      hecho:     estado === 'done',
      asignados: Array.isArray(r.asignados)
                   ? r.asignados.filter(function(e){ return typeof e === 'string' && e; })
                   : [],
      creadoPor: r.creadoPor || '',
      fecha:     r.fecha     || '',
      fechaISO:  r.fechaISO  || '',
      /* Cuándo pasó a done — la escribe el trigger de la base, no el cliente
         (ver la migración 20260804180000). Se fuerza a null fuera de done para
         que una fila que quedó sucia en el servidor no archive nada acá. */
      terminadaEn: (estado === 'done' && r.terminadaEn) ? String(r.terminadaEn) : null
    };
  }

  /* ¿Ya se puede sacar del tablero? Terminada hace más de DIAS_ARCHIVO.
     Sin fecha todavía (recién movida offline, o el poll no volvió) cuenta como
     NO archivada: el error seguro es dejarla a la vista, no esconderla. */
  var DIAS_ARCHIVO = 3;
  function esArchivada(t){
    if(!t || t.estado !== 'done' || !t.terminadaEn) return false;
    var ms = Date.parse(t.terminadaEn);
    return isFinite(ms) && (Date.now() - ms) > DIAS_ARCHIVO * 86400000;
  }

  /* Lo que se manda al servidor. Con la migración sin aplicar se recortan las
     dos columnas nuevas: PostgREST rechaza el request ENTERO si una no existe,
     así que mandarlas igual perdería también el texto. */
  function payload(campos){
    var out = {};
    for(var k in campos){
      if(!Object.prototype.hasOwnProperty.call(campos, k)) continue;
      if(_sinTablero && (k === 'estado' || k === 'asignados')) continue;
      /* `terminadaEn` NUNCA viaja: es del trigger. El reloj del navegador lo
         pone el usuario, y una máquina adelantada archivaría tareas de más para
         todo el equipo. Además evita que la columna 400ee el request entero si
         la app se deploya antes que la migración 20260804180000. */
      if(k === 'terminadaEn') continue;
      out[k] = campos[k];
    }
    return out;
  }

  /* ¿El error es "esa columna no existe"? PostgREST lo devuelve como PGRST204
     con el nombre de la columna en el mensaje; según la versión puede venir
     como error de Postgres crudo. Se cubren las dos formas. */
  function esColumnaFaltante(txt){
    return /PGRST204|schema cache|column .*(estado|asignados)|does not exist/i.test(txt || '');
  }
  function marcarSinTablero(){
    if(_sinTablero) return;
    _sinTablero = true;
    if(!_avisoTablero && typeof showToast === 'function'){
      _avisoTablero = true;
      showToast('La base todavía no tiene el tablero: se guarda pendiente/hecha, pero no la columna ni a quién se delegó. Falta correr la migración 20260804100000.');
    }
  }

  /* Envía y, si el rechazo fue por columna faltante, reintenta ya recortado.
     El reintento importa: sin él el primer movimiento después del deploy se
     pierde sin dejar rastro. */
  function enviar(path, opts, campos, reconstruir){
    return tfetch(path, opts).then(function(r){
      if(r.ok) return true;
      return r.text().then(function(txt){
        if(!esColumnaFaltante(txt)) return fallo(r.status);
        marcarSinTablero();
        var recortada = payload(campos);
        /* Un cambio que era SOLO de las columnas nuevas (delegar a alguien) se
           queda sin nada que mandar. Reintentar con un body vacío es un 400
           seguro: mejor no mandar nada — el cartel de marcarSinTablero() ya
           explicó que eso no se va a guardar hasta correr la migración. */
        if(!Object.keys(recortada).length) return false;
        var op2 = Object.assign({}, opts, {body: JSON.stringify(reconstruir(recortada))});
        return tfetch(path, op2).then(function(r2){ return r2.ok ? true : fallo(r2.status); });
      });
    }).catch(function(){
      /* Sin red no se avisa nada: la app es offline-first y el próximo repaso
         con conexión vuelve a traer la verdad del servidor. */
      return false;
    });
  }
  function fallo(status){
    if(typeof showToast === 'function'){
      showToast(status === 401 || status === 403
        ? 'No tenés permiso para modificar las tareas del equipo.'
        : 'No se pudo guardar el cambio — se reintenta en el próximo repaso.');
    }
    return false;
  }

  /* ── Suscriptores ──────────────────────────────────────────────────────── */
  function emit(){
    saveCache();
    pintarBadge();
    for(var i = 0; i < _subs.length; i++){
      try{ _subs[i](); }catch(e){}
    }
  }

  /* ── Lectura ───────────────────────────────────────────────────────────── */
  function purgarVentanas(){
    var now = Date.now(), k;
    for(k in _local)    if(_local[k]    <= now) delete _local[k];
    for(k in _borrados) if(_borrados[k] <= now) delete _borrados[k];
  }

  function mergeServidor(rows){
    purgarVentanas();
    var now = Date.now(), mios = {}, enServidor = {}, out = [];
    _todos.forEach(function(t){ mios[t.id] = t; });

    rows.forEach(function(r){
      var id = Number(r.id);
      enServidor[id] = true;
      if(_borrados[id] > now) return;                        // borrada acá hace un segundo
      out.push((_local[id] > now && mios[id]) ? mios[id] : normalizar(r));
    });
    // Altas locales que el servidor todavía no devuelve (POST en vuelo, u offline).
    _todos.forEach(function(t){
      if(!enServidor[t.id] && _local[t.id] > now) out.push(t);
    });
    _todos = out;
  }

  function fetchTodos(){
    if(!sessionOk()) return Promise.resolve(false);
    return tfetch('todos?select=*').then(function(r){
      return r.ok ? r.json() : null;
    }).then(function(rows){
      if(!Array.isArray(rows)) return false;
      /* Si ninguna fila trae `estado`, la migración no está: se detecta acá
         además de en la escritura, así el tablero ya arranca en modo checklist
         en vez de esperar al primer movimiento fallido. */
      if(rows.length && rows.every(function(r){ return r.estado === undefined; })) marcarSinTablero();
      mergeServidor(rows);
      emit();
      return true;
    }).catch(function(){ return false; });
  }

  /* La lista del equipo. Cambia poco: se pide al arrancar y queda cacheada.
     Si la RPC no existe todavía, se cae al equipo deducible (yo + quien ya
     tenga alguna tarea delegada) para que la pantalla siga siendo usable. */
  function equipoFallback(){
    var vistos = {}, out = [];
    var miMail = (typeof cevenSessionUser === 'function' && cevenSessionUser()) || '';
    if(miMail){
      vistos[miMail] = 1;
      out.push({email: miMail, nombre: (typeof cevenMyNombre === 'function' && cevenMyNombre()) || miMail.split('@')[0], rol: ''});
    }
    _todos.forEach(function(t){
      t.asignados.forEach(function(e){
        if(e && !vistos[e]){ vistos[e] = 1; out.push({email: e, nombre: e.split('@')[0], rol: ''}); }
      });
    });
    return out;
  }
  function fetchEquipo(){
    if(!sessionOk()) return Promise.resolve(false);
    return tfetch('rpc/ceven_equipo', {method: 'POST', body: '{}'}).then(function(r){
      return r.ok ? r.json() : null;
    }).then(function(rows){
      /* Ojo: el fallback SOLO cuando no hay nada mejor. Pisar la lista cacheada
         con la deducida ante cualquier tropiezo del servidor (un 500, un token
         que venció, sin conexión) borra los nombres reales y deja a todo el
         equipo mostrándose como la parte local de su mail. */
      if(!Array.isArray(rows) || !rows.length){
        if(!_equipo.length){ _equipo = equipoFallback(); emit(); }
        return false;
      }
      _equipo = rows.map(function(u){
        return {
          email:  String(u.email || ''),
          nombre: String(u.nombre || (u.email || '').split('@')[0] || ''),
          rol:    String(u.rol || '')
        };
      }).filter(function(u){ return !!u.email; });
      try{ localStorage.setItem(EQUIPO_KEY, JSON.stringify(_equipo)); }catch(e){}
      emit();
      return true;
    }).catch(function(){
      if(!_equipo.length){ _equipo = equipoFallback(); emit(); }
      return false;
    });
  }

  /* ── Escritura ─────────────────────────────────────────────────────────── */
  function porId(id){
    for(var i = 0; i < _todos.length; i++) if(_todos[i].id === Number(id)) return _todos[i];
    return null;
  }
  function tocar(id){ _local[Number(id)] = Date.now() + VENTANA; }

  /* id único. `Date.now()` sola colisiona si dos personas cargan una tarea en
     el mismo milisegundo, y el POST usa merge-duplicates: el segundo PISARÍA
     al primero en silencio. Los tres dígitos de ruido bajan eso a 1/1000 de un
     milisegundo compartido, sin perder el orden temporal ni salirse del rango
     entero exacto de JS (≈1,7·10¹⁵ contra 9·10¹⁵). */
  function nuevoId(){
    return Date.now() * 1000 + Math.floor(Math.random() * 1000);
  }

  function agregar(texto, estado){
    texto = String(texto == null ? '' : texto).trim();
    if(!texto || !puedeEscribir()) return null;
    var now = new Date();
    var t = normalizar({
      id: nuevoId(),
      texto: texto,
      estado: ESTADOS.indexOf(estado) >= 0 ? estado : 'todo',
      asignados: [],
      creadoPor: (typeof cevenMyNombre === 'function' && cevenMyNombre())
                 || (typeof cevenSessionUser === 'function' && cevenSessionUser()) || '',
      fecha: now.toLocaleDateString('es-AR'),
      fechaISO: now.toISOString()
    });
    _todos.push(t);
    tocar(t.id);
    emit();

    var fila = payload(t);
    enviar('todos', {
      method: 'POST',
      headers: {'Prefer': 'resolution=merge-duplicates,return=minimal'},
      body: JSON.stringify([fila])
    }, t, function(recortada){ return [recortada]; });
    return t;
  }

  function actualizar(id, campos){
    var t = porId(id);
    if(!t || !puedeEscribir()) return false;
    var eraDone = t.estado === 'done';
    Object.assign(t, campos);
    t.hecho = t.estado === 'done';
    /* Espejo local de lo que va a hacer el trigger, para que la pantalla no
       espere al próximo repaso. El valor del servidor lo pisa en el primer
       poll; que difieran unos segundos no puede archivar nada de más, porque
       una tarea recién terminada está a DIAS_ARCHIVO del corte de cualquier
       forma. La condición es "entrar" a done, no "estar": renombrar o delegar
       una terminada no le reinicia el reloj. */
    if(t.estado === 'done'){
      if(!eraDone) t.terminadaEn = new Date().toISOString();
    } else {
      t.terminadaEn = null;
    }
    tocar(t.id);
    emit();
    /* `hecho` viaja siempre junto a `estado`: el trigger de la base lo derivaría
       igual, pero mandarlo deja la fila coherente aunque la migración no esté. */
    var campos2 = Object.assign({}, campos);
    if(campos2.estado) campos2.hecho = campos2.estado === 'done';
    enviar('todos?id=eq.' + encodeURIComponent(t.id), {
      method: 'PATCH',
      body: JSON.stringify(payload(campos2))
    }, campos2, function(recortada){ return recortada; });
    return true;
  }

  function eliminar(id){
    var idx = -1;
    for(var i = 0; i < _todos.length; i++) if(_todos[i].id === Number(id)) idx = i;
    if(idx < 0 || !puedeEscribir()) return null;
    var removida = _todos[idx];
    _todos.splice(idx, 1);
    _borrados[removida.id] = Date.now() + VENTANA;
    delete _local[removida.id];
    emit();
    tfetch('todos?id=eq.' + encodeURIComponent(removida.id), {method: 'DELETE'}).catch(function(){});
    return removida;
  }

  function restaurar(t){
    if(!t || !puedeEscribir()) return false;
    var copia = normalizar(t);
    _todos.push(copia);
    delete _borrados[copia.id];
    tocar(copia.id);
    emit();
    var fila = payload(copia);
    enviar('todos', {
      method: 'POST',
      headers: {'Prefer': 'resolution=merge-duplicates,return=minimal'},
      body: JSON.stringify([fila])
    }, copia, function(recortada){ return [recortada]; });
    return true;
  }

  /* ── Pastilla de pendientes en la tarjeta del shell ─────────────────────── */
  function pintarBadge(){
    var el = document.getElementById('tareas-badge');
    if(!el) return;
    var n = _todos.filter(function(t){ return t.estado !== 'done'; }).length;
    el.textContent = n ? (n + (n === 1 ? ' pendiente' : ' pendientes')) : 'Al día';
    el.setAttribute('data-vacio', n ? '0' : '1');
  }

  /* ── Arranque ──────────────────────────────────────────────────────────────
     El chequeo de sesión gatea TODO, no solo el fetch: las tareas del equipo
     traen nombres de clientes y de quién las cargó, y pintarlas detrás del
     overlay de login las deja a un inspector de distancia (el overlay es un
     <div> con z-index, no una barrera). Sin sesión no se lee ni la caché.

     El login del shell no recarga la página (cevenShowApp() solo esconde el
     overlay), así que hay que reintentar cuando avisa auth.js. */
  function boot(){
    if(_booted || !sessionOk()) return;
    _booted = true;
    loadCache();
    emit();
    fetchTodos();
    fetchEquipo();
    setInterval(fetchTodos, 15000);
  }
  window.addEventListener('ceven-session-ready', boot);
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  /* ── API pública ───────────────────────────────────────────────────────── */
  window.cevenTareas = {
    ESTADOS: ESTADOS.slice(),
    DIAS_ARCHIVO: DIAS_ARCHIVO,
    /* Vive acá y no en el tablero para que haya UNA sola definición de
       "archivada": el día que el shell quiera contarlas, o que aparezca otra
       vista, no puede haber dos cortes distintos. */
    esArchivada: esArchivada,

    /* Copias: el tablero ordena y filtra sobre lo que recibe, y no tiene por
       qué poder mutar el store de rebote. */
    list:   function(){ return _todos.map(function(t){ return Object.assign({}, t, {asignados: t.asignados.slice()}); }); },
    equipo: function(){ return _equipo.slice(); },
    get:    function(id){ var t = porId(id); return t ? Object.assign({}, t, {asignados: t.asignados.slice()}) : null; },

    /* Nombre para mostrar de un email. Un miembro que ya no está en el equipo
       (se fue, lo borraron) igual tiene que verse: cae a la parte local del
       mail en vez de desaparecer de la tarjeta que tiene asignada. */
    nombreDe: function(email){
      for(var i = 0; i < _equipo.length; i++) if(_equipo[i].email === email) return _equipo[i].nombre;
      return String(email || '').split('@')[0];
    },

    puedeEscribir: puedeEscribir,
    sinTablero:    function(){ return _sinTablero; },
    pendientes:    function(){ return _todos.filter(function(t){ return t.estado !== 'done'; }).length; },

    agregar:  agregar,
    mover:    function(id, estado){
      if(ESTADOS.indexOf(estado) < 0) return false;
      var t = porId(id);
      if(!t || t.estado === estado) return false;
      return actualizar(id, {estado: estado});
    },
    renombrar: function(id, texto){
      texto = String(texto == null ? '' : texto).trim();
      var t = porId(id);
      if(!texto || !t || t.texto === texto) return false;
      return actualizar(id, {texto: texto});
    },
    delegar: function(id, email){
      var t = porId(id);
      if(!t || !email || t.asignados.indexOf(email) >= 0) return false;
      return actualizar(id, {asignados: t.asignados.concat([email])});
    },
    quitar: function(id, email){
      var t = porId(id);
      if(!t || t.asignados.indexOf(email) < 0) return false;
      return actualizar(id, {asignados: t.asignados.filter(function(e){ return e !== email; })});
    },
    eliminar:  eliminar,
    restaurar: restaurar,

    refrescar: function(){ return Promise.all([fetchTodos(), fetchEquipo()]); },
    onChange:  function(cb){ if(typeof cb === 'function') _subs.push(cb); }
  };
})();
