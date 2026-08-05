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
     · la gente de Ceven (RPC ceven_equipo) y los TABLEROS de
       trabajo (tabla equipos) — dos cosas distintas, ver el aviso
       de `_personas` / `_equipos` más abajo,
     · y la pastilla de pendientes de la tarjeta del shell, que es
       lo único que el shell sigue mostrando.

   API pública: window.cevenTareas (ver el bloque del final).

   ------------------------------------------------------------
   ⚠ LOS TABLEROS NO SON UNA BARRERA DE PRIVACIDAD. Separan el
   trabajo en la PANTALLA: el cliente se baja `todos?select=*`
   entero y filtra en JavaScript, y las policies siguen dejando
   que cualquier @ceven.com lea y escriba todo. Sirve para
   organizarse, no para esconder. El porqué y qué haría falta para
   que fuera real están en 20260804200000_tareas_equipos.sql.

   ------------------------------------------------------------
   DEGRADACIÓN: la app se puede deployar ANTES que las migraciones
   (hoy hay varias sin correr). Cuando falta una columna, PostgREST
   rechaza el request ENTERO, así que se detecta cuál falta —al
   leer y al escribir— y se la recorta de ahí en más, en vez de
   perder también el texto de la tarea. Ver `_faltantes`,
   `columnaFaltante()` y `personasFallback()`.
   ============================================================ */
(function(){
  if(!window.SUPABASE_URL) return; // sin base configurada: no hay nada que sincronizar

  var REST         = SUPABASE_URL + '/rest/v1/';
  var CACHE_KEY    = 'ceven_todos_cache';
  var PERSONAS_KEY = 'ceven_equipo_cache';    // nombre histórico de la clave; no se migra para no perder la caché
  var EQUIPOS_KEY  = 'ceven_equipos_cache';
  var ESTADOS      = ['todo', 'doing', 'done'];
  var EQUIPO_DEF   = 'General';

  /* ⚠ Dos cosas distintas que se llaman parecido, y conviene no confundirlas:

       _personas → la gente de Ceven (la RPC `ceven_equipo`, que se llama así
                   por historia: nació antes de que existieran los equipos).
       _equipos  → los TABLEROS de trabajo (tabla `equipos`), cada uno con su
                   lista de miembros.

     En la API pública son `personas()` y `equipos()`. */
  var _todos    = [];
  var _personas = [];
  var _equipos  = [];
  var _subs     = [];
  var _booted   = false;

  /* Columnas que la base todavía no tiene. La app se puede deployar antes que
     las migraciones —hoy mismo hay tres sin aplicar— y PostgREST rechaza el
     request ENTERO si una sola columna no existe: mandarlas igual perdería
     también el texto de la tarea. Se detectan por la respuesta del servidor y
     se recortan de ahí en más.

     Es un mapa y no un booleano porque las columnas llegaron en migraciones
     distintas y pueden faltar de a una: con un flag global, que faltara
     `equipo` habría dejado de mandar también `estado`. */
  var _faltantes = {};
  var _avisoFaltante = false; // el cartel se muestra una sola vez

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
    try{ _personas = JSON.parse(localStorage.getItem(PERSONAS_KEY) || '[]') || []; }
    catch(e){ _personas = []; }
    try{ _equipos = (JSON.parse(localStorage.getItem(EQUIPOS_KEY) || '[]') || []).map(normalizarEquipo); }
    catch(e){ _equipos = []; }
  }
  function saveCache(){
    try{ localStorage.setItem(CACHE_KEY, JSON.stringify(_todos)); }catch(e){}
    try{ localStorage.setItem(EQUIPOS_KEY, JSON.stringify(_equipos)); }catch(e){}
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
      terminadaEn: (estado === 'done' && r.terminadaEn) ? String(r.terminadaEn) : null,
      /* Tablero al que pertenece. Una tarea sin equipo (fila vieja, o creada
         antes de la migración) cae en el de por defecto en vez de quedar en
         ninguno y volverse invisible. */
      equipo: String(r.equipo || '').trim() || EQUIPO_DEF
    };
  }

  /* Forma canónica de un equipo. `miembros` son los emails que aparecen para
     delegar en ese tablero — no quiénes pueden verlo. */
  function normalizarEquipo(e){
    e = e || {};
    return {
      nombre:    String(e.nombre == null ? '' : e.nombre).trim(),
      miembros:  Array.isArray(e.miembros)
                   ? e.miembros.filter(function(m){ return typeof m === 'string' && m; })
                   : [],
      creadoPor: e.creadoPor || '',
      creadoISO: e.creadoISO || ''
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

  /* Lo que se manda al servidor, sin las columnas que la base no tiene. */
  function payload(campos){
    var out = {};
    for(var k in campos){
      if(!Object.prototype.hasOwnProperty.call(campos, k)) continue;
      if(_faltantes[k]) continue;
      /* `terminadaEn` NUNCA viaja, exista o no la columna: es del trigger. El
         reloj del navegador lo pone el usuario, y una máquina adelantada
         archivaría tareas de más para todo el equipo. */
      if(k === 'terminadaEn') continue;
      out[k] = campos[k];
    }
    return out;
  }

  /* ¿Qué columna rechazó el servidor? PostgREST devuelve PGRST204 con el nombre
     entre comillas ("Could not find the 'equipo' column of 'todos'..."); según
     la versión puede llegar el error de Postgres crudo ("column todos.equipo
     does not exist"). Se cubren las dos formas y se devuelve el NOMBRE, no un
     booleano: recortar de a una columna evita que la falta de `equipo` deje de
     mandar también `estado`. */
  function columnaFaltante(txt){
    txt = txt || '';
    var m = /Could not find the '([^']+)' column/i.exec(txt);
    if(m) return m[1];
    m = /column [\w."]*?\.?"?([A-Za-z_][\w]*)"?\s+does not exist/i.exec(txt);
    return m ? m[1] : null;
  }
  function marcarFaltante(col){
    if(!col || _faltantes[col]) return false;
    _faltantes[col] = true;
    if(!_avisoFaltante && typeof showToast === 'function'){
      _avisoFaltante = true;
      showToast('La base todavía no tiene la columna "' + col + '": ese dato no se va a guardar hasta que se corran las migraciones pendientes de supabase/migrations.');
    }
    return true;
  }

  /* Envía y, si el rechazo fue por columna faltante, reintenta ya recortado.
     El reintento importa: sin él el primer movimiento después del deploy se
     pierde sin dejar rastro. */
  function enviar(path, opts, campos, reconstruir){
    return tfetch(path, opts).then(function(r){
      if(r.ok) return true;
      return r.text().then(function(txt){
        /* Si faltan VARIAS columnas, el servidor solo nombra la primera: cada
           reintento descarta una y vuelve a intentar. Con `marcarFaltante`
           devolviendo false cuando ya estaba marcada, el ciclo termina sí o sí
           (el conjunto de columnas solo crece). */
        if(!marcarFaltante(columnaFaltante(txt))) return fallo(r.status);
        var recortada = payload(campos);
        /* Un cambio que era SOLO de columnas que faltan (delegar a alguien) se
           queda sin nada que mandar. Reintentar con un body vacío es un 400
           seguro: mejor no mandar nada — el cartel ya explicó que eso no se va a
           guardar hasta correr las migraciones. */
        if(!Object.keys(recortada).length) return false;
        var op2 = Object.assign({}, opts, {body: JSON.stringify(reconstruir(recortada))});
        return enviar(path, op2, campos, reconstruir);
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
      /* Detectar las columnas que faltan también al LEER, no solo al escribir:
         así el tablero ya arranca degradado en vez de esperar a que el primer
         movimiento falle. Si una columna no existe, PostgREST ni siquiera la
         devuelve en el JSON. */
      if(rows.length){
        ['estado', 'asignados', 'equipo'].forEach(function(col){
          if(rows.every(function(r){ return r[col] === undefined; })) marcarFaltante(col);
        });
      }
      mergeServidor(rows);
      emit();
      return true;
    }).catch(function(){ return false; });
  }

  /* Los equipos (tableros). Tabla chica y que cambia poco: se pide junto con
     todo lo demás y queda cacheada para arrancar offline. */
  function fetchEquipos(){
    if(!sessionOk()) return Promise.resolve(false);
    return tfetch('equipos?select=*').then(function(r){
      return r.ok ? r.json() : null;
    }).then(function(rows){
      if(!Array.isArray(rows)) return false;
      _equipos = rows.map(normalizarEquipo).filter(function(e){ return !!e.nombre; });
      emit();
      return true;
    }).catch(function(){ return false; });
  }

  /* La lista del equipo. Cambia poco: se pide al arrancar y queda cacheada.
     Si la RPC no existe todavía, se cae al equipo deducible (yo + quien ya
     tenga alguna tarea delegada) para que la pantalla siga siendo usable. */
  function personasFallback(){
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
  function fetchPersonas(){
    if(!sessionOk()) return Promise.resolve(false);
    return tfetch('rpc/ceven_equipo', {method: 'POST', body: '{}'}).then(function(r){
      return r.ok ? r.json() : null;
    }).then(function(rows){
      /* Ojo: el fallback SOLO cuando no hay nada mejor. Pisar la lista cacheada
         con la deducida ante cualquier tropiezo del servidor (un 500, un token
         que venció, sin conexión) borra los nombres reales y deja a todo el
         equipo mostrándose como la parte local de su mail. */
      if(!Array.isArray(rows) || !rows.length){
        if(!_personas.length){ _personas = personasFallback(); emit(); }
        return false;
      }
      _personas = rows.map(function(u){
        return {
          email:  String(u.email || ''),
          nombre: String(u.nombre || (u.email || '').split('@')[0] || ''),
          rol:    String(u.rol || '')
        };
      }).filter(function(u){ return !!u.email; });
      try{ localStorage.setItem(PERSONAS_KEY, JSON.stringify(_personas)); }catch(e){}
      emit();
      return true;
    }).catch(function(){
      if(!_personas.length){ _personas = personasFallback(); emit(); }
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

  function agregar(texto, estado, equipo){
    texto = String(texto == null ? '' : texto).trim();
    if(!texto || !puedeEscribir()) return null;
    var now = new Date();
    var t = normalizar({
      id: nuevoId(),
      texto: texto,
      estado: ESTADOS.indexOf(estado) >= 0 ? estado : 'todo',
      equipo: equipo,   // normalizar() cae a EQUIPO_DEF si viene vacío
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

  /* ── Equipos (tableros) ────────────────────────────────────────────────────
     Sin ventana anti-poll como la de las tareas: son pocos, cambian poco, y un
     cambio de miembros que tarde un ciclo en verse no rompe nada. */
  function equipoPorNombre(n){
    n = String(n || '').trim();
    for(var i = 0; i < _equipos.length; i++) if(_equipos[i].nombre === n) return _equipos[i];
    return null;
  }

  function crearEquipo(nombre){
    nombre = String(nombre == null ? '' : nombre).trim();
    if(!nombre || !puedeEscribir()) return null;
    if(equipoPorNombre(nombre)) return null;   // el nombre es la clave primaria
    var e = normalizarEquipo({
      nombre: nombre,
      /* Quien lo crea entra solo. Un tablero recién hecho sin nadie adentro no
         deja delegar y obliga a un segundo paso para algo que siempre se quiere. */
      miembros: [(typeof cevenSessionUser === 'function' && cevenSessionUser()) || ''].filter(Boolean),
      creadoPor: (typeof cevenMyNombre === 'function' && cevenMyNombre()) || '',
      creadoISO: new Date().toISOString()
    });
    _equipos.push(e);
    emit();
    enviar('equipos', {
      method: 'POST',
      headers: {'Prefer': 'resolution=merge-duplicates,return=minimal'},
      body: JSON.stringify([e])
    }, e, function(recortada){ return [recortada]; });
    return e;
  }

  function guardarMiembros(nombre, miembros){
    var e = equipoPorNombre(nombre);
    if(!e || !puedeEscribir()) return false;
    e.miembros = miembros;
    emit();
    var campos = {miembros: miembros};
    enviar('equipos?nombre=eq.' + encodeURIComponent(e.nombre), {
      method: 'PATCH',
      body: JSON.stringify(campos)
    }, campos, function(recortada){ return recortada; });
    return true;
  }

  function eliminarEquipo(nombre){
    var e = equipoPorNombre(nombre);
    if(!e || !puedeEscribir()) return false;
    if(e.nombre === EQUIPO_DEF) return false;   // el tablero de por defecto no se borra

    /* Las tareas NO se borran: se mudan al tablero por defecto. Borrar un
       equipo es una acción de organización, y llevarse puesto el trabajo que
       tenía adentro sería una pérdida de datos disfrazada de limpieza. */
    _todos.forEach(function(t){
      if(t.equipo === e.nombre) actualizar(t.id, {equipo: EQUIPO_DEF});
    });

    _equipos = _equipos.filter(function(x){ return x.nombre !== e.nombre; });
    emit();
    tfetch('equipos?nombre=eq.' + encodeURIComponent(e.nombre), {method: 'DELETE'}).catch(function(){});
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
    var n = pendientes();
    el.textContent = n ? (n + (n === 1 ? ' pendiente' : ' pendientes')) : 'Al día';
    el.setAttribute('data-vacio', n ? '0' : '1');
  }

  /* Pendientes que te importan: las de TUS tableros. Con equipos, contar todo
     convierte la pastilla en ruido — 40 pendientes de Técnica no son un motivo
     para que entre alguien de Comercial. Si no estás en ninguno, se cuentan
     todas: es el caso de siempre y el de antes de que existieran los equipos. */
  function pendientes(){
    var mios = misEquipos();
    return _todos.filter(function(t){
      if(t.estado === 'done') return false;
      return !mios.length || mios.indexOf(t.equipo) >= 0;
    }).length;
  }

  /* Nombres de los tableros donde figuro como miembro. */
  function misEquipos(){
    var yo = (typeof cevenSessionUser === 'function' && cevenSessionUser()) || '';
    if(!yo) return [];
    return _equipos.filter(function(e){ return e.miembros.indexOf(yo) >= 0; })
                   .map(function(e){ return e.nombre; });
  }

  /* Todos los tableros que hay que mostrar en el selector: los de la tabla MÁS
     los que aparecen en alguna tarea sin tener fila propia. Ese segundo caso no
     es teórico — si alguien borra un equipo mientras otro tiene tareas sin
     sincronizar, esas tareas quedarían en un tablero inexistente y, sin esto,
     invisibles. */
  function nombresDeTableros(){
    var vistos = {}, out = [];
    function sumar(n){ if(n && !vistos[n]){ vistos[n] = 1; out.push(n); } }
    sumar(EQUIPO_DEF);
    _equipos.forEach(function(e){ sumar(e.nombre); });
    _todos.forEach(function(t){ sumar(t.equipo); });
    return out;
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
    fetchPersonas();
    fetchEquipos();
    /* Solo las tareas se repasan cada 15 s. Los equipos cambian de tanto en
       tanto y con el mismo intervalo serían el doble de requests para nada; se
       refrescan junto a las tareas cada cuatro vueltas (~1 min). */
    var vuelta = 0;
    setInterval(function(){
      fetchTodos();
      if(++vuelta % 4 === 0) fetchEquipos();
    }, 15000);
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
    get:    function(id){ var t = porId(id); return t ? Object.assign({}, t, {asignados: t.asignados.slice()}) : null; },

    /* La GENTE de Ceven (RPC ceven_equipo). Se llama `personas` y no `equipo`
       para no confundirse con los tableros, que son `equipos()`. */
    personas: function(){ return _personas.slice(); },

    /* Los TABLEROS. `equipos()` son los que tienen fila propia; `tableros()`
       suma los que solo aparecen en alguna tarea (ver nombresDeTableros). */
    equipos:  function(){ return _equipos.map(function(e){ return Object.assign({}, e, {miembros: e.miembros.slice()}); }); },
    tableros: nombresDeTableros,
    misEquipos: misEquipos,
    EQUIPO_DEF: EQUIPO_DEF,

    /* Miembros de un tablero, para el listado desde el que se arrastra. Un
       tablero sin fila propia (o sin nadie cargado) cae a TODA la gente de
       Ceven: dejar el listado vacío haría imposible delegar ahí. */
    miembrosDe: function(nombre){
      var e = equipoPorNombre(nombre);
      var mails = (e && e.miembros.length) ? e.miembros : null;
      if(!mails) return _personas.slice();
      return mails.map(function(m){
        for(var i = 0; i < _personas.length; i++) if(_personas[i].email === m) return _personas[i];
        return {email: m, nombre: String(m).split('@')[0], rol: ''};
      });
    },

    /* Nombre para mostrar de un email. Alguien que ya no está (se fue, lo
       borraron) igual tiene que verse: cae a la parte local del mail en vez de
       desaparecer de la tarjeta que tiene asignada. */
    nombreDe: function(email){
      for(var i = 0; i < _personas.length; i++) if(_personas[i].email === email) return _personas[i].nombre;
      return String(email || '').split('@')[0];
    },

    puedeEscribir: puedeEscribir,
    /* Columnas que la base todavía no tiene (migraciones sin correr). El
       tablero lo usa para avisar en pantalla en vez de fallar en silencio. */
    faltantes:     function(){ return Object.keys(_faltantes); },
    pendientes:    pendientes,

    agregar:  agregar,
    crearEquipo:    crearEquipo,
    eliminarEquipo: eliminarEquipo,
    agregarMiembro: function(nombre, email){
      var e = equipoPorNombre(nombre);
      if(!e || !email || e.miembros.indexOf(email) >= 0) return false;
      return guardarMiembros(nombre, e.miembros.concat([email]));
    },
    quitarMiembro: function(nombre, email){
      var e = equipoPorNombre(nombre);
      if(!e || e.miembros.indexOf(email) < 0) return false;
      return guardarMiembros(nombre, e.miembros.filter(function(m){ return m !== email; }));
    },
    moverAEquipo: function(id, equipo){
      equipo = String(equipo || '').trim() || EQUIPO_DEF;
      var t = porId(id);
      if(!t || t.equipo === equipo) return false;
      return actualizar(id, {equipo: equipo});
    },
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

    refrescar: function(){ return Promise.all([fetchTodos(), fetchPersonas(), fetchEquipos()]); },
    onChange:  function(cb){ if(typeof cb === 'function') _subs.push(cb); }
  };
})();
