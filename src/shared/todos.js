/* ============================================================
   TAREAS DEL EQUIPO  ·  organizador colaborativo, compartido entre
   marcas (vive en el shell, src/index.html — no es de un cotizador
   en particular).
   ------------------------------------------------------------
   Checklist simple: texto + quién la creó + hecha/pendiente. Nada
   de asignado/fecha límite/vínculo a pipeline — eso queda para más
   adelante si hace falta.

   Sincroniza contra la tabla `todos` de Supabase por REST directo
   (sin el intercept de localStorage que usan los cotizadores: acá
   alcanza con pintar al toque + pushear + poll cada 15s, igual que
   el pipeline). Cachea la última lista conocida en localStorage
   para no arrancar en blanco offline.
   ============================================================ */
(function(){
  if(!window.SUPABASE_URL) return; // sin base configurada: no hay nada que sincronizar

  var REST = SUPABASE_URL + '/rest/v1/';
  var CACHE_KEY = 'ceven_todos_cache';
  var _todos = [];

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
    return fetch(REST + path, Object.assign({}, opts, {headers: Object.assign(authHeaders(), opts.headers || {})}));
  }
  function sessionOk(){
    return (typeof cevenIsValidSession === 'function') && cevenIsValidSession();
  }

  function loadCache(){
    try{ _todos = JSON.parse(localStorage.getItem(CACHE_KEY)||'[]'); }catch(e){ _todos = []; }
  }
  function saveCache(){
    try{ localStorage.setItem(CACHE_KEY, JSON.stringify(_todos)); }catch(e){}
  }
  function escHtml(s){
    return String(s==null?'':s).replace(/[<>&"]/g, function(c){ return {'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'}[c]; });
  }

  function sortTodos(){
    // pendientes primero (más nuevas arriba), hechas al final
    _todos.sort(function(a,b){
      if(!!a.hecho !== !!b.hecho) return a.hecho ? 1 : -1;
      return (b.fechaISO||'').localeCompare(a.fechaISO||'');
    });
  }

  function renderTodos(){
    var box = document.getElementById('todo-list');
    if(!box) return;
    sortTodos();
    if(!_todos.length){
      box.innerHTML = '<div style="text-align:center;color:#aeaeb2;font-size:12px;padding:14px 0">Sin tareas cargadas.</div>';
      return;
    }
    var html = '';
    _todos.forEach(function(t){
      /* El id viaja crudo dentro de un onclick/onchange: si la fila viene de
         la base con un id no numérico, ahí entra JS arbitrario. Number() lo
         deja siempre en un literal (o NaN, que es inofensivo). */
      var id = Number(t.id);
      html += '<div style="display:flex;align-items:flex-start;gap:9px;padding:8px 0;border-bottom:0.5px solid #f0f0f0">'
        + '<input type="checkbox" '+(t.hecho?'checked':'')+' onchange="toggleTodo('+id+',this.checked)" style="margin-top:3px;width:auto;flex-shrink:0">'
        + '<div style="flex:1;min-width:0">'
          + '<div style="font-size:13px;color:'+(t.hecho?'#aeaeb2':'#1d1d1f')+';text-decoration:'+(t.hecho?'line-through':'none')+';word-break:break-word">'+escHtml(t.texto)+'</div>'
          + '<div style="font-size:10px;color:#aeaeb2;margin-top:2px">'+escHtml(t.creadoPor)+(t.creadoPor&&t.fecha?' · ':'')+escHtml(t.fecha)+'</div>'
        + '</div>'
        + '<button onclick="deleteTodo('+id+')" title="Eliminar tarea" style="border:none;background:none;color:#aeaeb2;font-size:16px;cursor:pointer;line-height:1;padding:2px 4px;flex-shrink:0">×</button>'
      + '</div>';
    });
    box.innerHTML = html;
  }

  function fetchTodos(){
    if(!sessionOk()) return;
    tfetch('todos?select=*').then(function(r){ return r.ok ? r.json() : null; }).then(function(rows){
      if(!Array.isArray(rows)) return;
      _todos = rows;
      saveCache();
      renderTodos();
    }).catch(function(){});
  }

  window.addTodo = function(ev){
    if(ev) ev.preventDefault();
    var input = document.getElementById('todo-input');
    if(!input) return false;
    var texto = (input.value||'').trim();
    if(!texto) return false;
    input.value = '';
    var now = new Date();
    var todo = {
      id: Date.now(),
      texto: texto,
      hecho: false,
      creadoPor: (typeof cevenMyNombre==='function' && cevenMyNombre()) || (typeof cevenSessionUser==='function' && cevenSessionUser()) || '',
      fecha: now.toLocaleDateString('es-AR'),
      fechaISO: now.toISOString()
    };
    _todos.push(todo);
    saveCache();
    renderTodos();
    tfetch('todos', {method:'POST', headers:{'Prefer':'resolution=merge-duplicates,return=minimal'}, body: JSON.stringify([todo])})
      .then(function(r){ if(!r.ok && typeof showToast==='function') showToast('No se pudo guardar la tarea — se reintenta en el próximo repaso.'); })
      .catch(function(){});
    return false;
  };

  window.toggleTodo = function(id, hecho){
    var t = _todos.find(function(x){ return x.id===id; });
    if(t) t.hecho = hecho;
    saveCache();
    renderTodos();
    tfetch('todos?id=eq.'+id, {method:'PATCH', body: JSON.stringify({hecho: hecho})}).catch(function(){});
  };

  window.deleteTodo = function(id){
    var idx = _todos.findIndex(function(x){ return x.id===id; });
    if(idx<0) return;
    var removed = _todos[idx];
    _todos.splice(idx,1);
    saveCache();
    renderTodos();
    tfetch('todos?id=eq.'+id, {method:'DELETE'}).catch(function(){});
    if(typeof notifyUndo === 'function'){
      notifyUndo('Eliminaste la tarea: "'+removed.texto+'".', function(){
        _todos.push(removed);
        saveCache();
        renderTodos();
        tfetch('todos', {method:'POST', headers:{'Prefer':'resolution=merge-duplicates,return=minimal'}, body: JSON.stringify([removed])}).catch(function(){});
      });
    }
  };

  /* El chequeo de sesión gatea TODO, no solo el fetch.
     Antes boot() hacía loadCache() + renderTodos() sin mirar la sesión: las
     tareas del equipo (con nombres de clientes y de quién las cargó) quedaban
     pintadas en el DOM detrás del overlay de login, que es un <div> con
     z-index — se saca con el inspector, o simplemente no llega a taparlo si
     el CSS falla. Sin sesión no se lee la caché ni se pinta nada.

     El login del shell no recarga la página (cevenShowApp() solo esconde el
     overlay), así que hay que reintentar cuando avisa auth.js. */
  var _booted = false;
  function boot(){
    if(_booted || !sessionOk()) return;
    _booted = true;
    loadCache();
    renderTodos();
    fetchTodos();
    setInterval(fetchTodos, 15000);
  }
  window.addEventListener('ceven-session-ready', boot);
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
