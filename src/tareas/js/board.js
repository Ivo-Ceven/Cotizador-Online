/* ============================================================================
   TABLERO DE TAREAS  ·  src/tareas/js/board.js
   ----------------------------------------------------------------------------
   Pinta las tres columnas (to do / doing / done) y resuelve los dos gestos de
   arrastre. Los datos y la sincronización NO están acá: son de
   shared/todos.js, que expone window.cevenTareas.

   ── Los dos arrastres ──────────────────────────────────────────────────────
   Conviven en la misma pantalla y hay que poder distinguirlos MIENTRAS se
   arrastra, no al soltar:

     · tarjeta  → columna  = mover de estado
     · miembro  → tarjeta  = delegar

   `dataTransfer.getData()` devuelve vacío durante dragover en casi todos los
   navegadores (es una restricción de seguridad de la especificación: el
   contenido recién se puede leer al soltar). Lo que sí se puede mirar es
   `dataTransfer.types`, así que cada arrastre declara un tipo MIME propio y el
   `dragover` decide por ahí si acepta o no.

   Eso además hace que los dos objetivos no se pisen aunque estén anidados: la
   tarjeta solo llama a preventDefault() para T_MIEMBRO y la columna solo para
   T_TAREA, así que el evento que burbujea de la tarjeta a la columna encuentra
   un único destino dispuesto a recibirlo.

   ── Sin arrastrar ──────────────────────────────────────────────────────────
   La API de drag & drop de HTML5 no funciona con el dedo: en celular no hay
   dragstart. Por eso TODO lo que se puede hacer arrastrando se puede hacer
   también desde el detalle (tocar la tarjeta) y con el teclado (Enter abre el
   detalle, ← → mueven de columna).
   ========================================================================== */
(function(){
  var T_TAREA   = 'application/x-ceven-tarea';
  var T_MIEMBRO = 'application/x-ceven-miembro';

  var COLS = [
    {id: 'todo',  label: 'To do'},
    {id: 'doing', label: 'Doing'},
    {id: 'done',  label: 'Done'}
  ];

  var $cols   = document.getElementById('tb-cols');
  var $chips  = document.getElementById('equipo-chips');
  var $nota   = document.getElementById('equipo-nota');
  var $alta   = document.getElementById('tb-alta');
  var $solo   = document.getElementById('tb-solo-lectura');
  var $texto  = document.getElementById('tarea-texto');
  var $estado = document.getElementById('tarea-estado');
  var $tabs   = document.getElementById('tb-tabs');

  /* Qué se está arrastrando. El tipo MIME viaja en el dataTransfer (es lo que
     mira dragover), pero el VALOR se guarda también acá porque getData() no se
     puede leer hasta el drop y porque Safari cambia de opinión seguido sobre
     qué tipos personalizados conserva. Se usa como respaldo del getData(), no
     como fuente única: si el dataTransfer no declara nuestro tipo, el drop ni
     siquiera se acepta. */
  var _arrastre = null;

  /* El poll cada 15 s repinta todo el tablero. Si eso pasa CON un arrastre en
     curso, el nodo que se está llevando desaparece y el navegador cancela el
     gesto a mitad de camino, sin ningún aviso. Mientras haya algo en la mano se
     posterga el repintado hasta el dragend. */
  var _renderPendiente = false;

  var _filtro = '';   // email por el que está filtrado el tablero ('' = todas)

  /* Tablero (equipo) que se está mirando. Se guarda en localStorage y NO se
     sincroniza: es una preferencia de esta persona en esta máquina, y
     mandarla al equipo haría que abrir la página le cambiara la vista a otro.
     La clave lleva el email para que dos cuentas en la misma PC no se pisen. */
  var TABLERO_KEY = 'ceven_tablero_actual';
  var _tablero = '';

  function claveTablero(){
    var yo = (typeof cevenSessionUser === 'function' && cevenSessionUser()) || '';
    return TABLERO_KEY + (yo ? ':' + yo : '');
  }
  /* Con qué tablero se abre la página: el último que se miró, si todavía
     existe; si no, el primero de los tuyos; si no estás en ninguno, el de por
     defecto. Nunca queda en uno vacío por accidente. */
  function tableroInicial(){
    var disponibles = cevenTareas.tableros();
    var guardado = '';
    try{ guardado = localStorage.getItem(claveTablero()) || ''; }catch(e){}
    if(guardado && disponibles.indexOf(guardado) >= 0) return guardado;
    var mios = cevenTareas.misEquipos();
    if(mios.length) return mios[0];
    return cevenTareas.EQUIPO_DEF;
  }
  function irATablero(nombre){
    _tablero = nombre;
    try{ localStorage.setItem(claveTablero(), nombre); }catch(e){}
    render();
  }

  /* Mostrar u ocultar las terminadas hace más de cevenTareas.DIAS_ARCHIVO.
     Arranca oculto en cada carga y no se persiste: el estado normal del tablero
     es "lo que está vivo", y dejarlo pegado entre sesiones convertiría el
     archivado en algo que hay que volver a apagar a mano. */
  var _verArchivadas = false;

  function esc(s){
    return (typeof cevenEsc === 'function') ? cevenEsc(s) : String(s == null ? '' : s);
  }
  function cerca(el, sel){
    return (el && el.closest) ? el.closest(sel) : null;
  }
  function tiene(dt, tipo){
    return !!(dt && dt.types && Array.prototype.indexOf.call(dt.types, tipo) >= 0);
  }
  function escribe(){
    return !!(window.cevenTareas && cevenTareas.puedeEscribir());
  }

  /* Iniciales para el avatar: "Fer Castro" → "FC". Un solo nombre da una sola
     letra; sin nombre, un guión (nunca un chip vacío, que no se puede leer). */
  function iniciales(nombre){
    var p = String(nombre || '').trim().split(/\s+/).filter(Boolean);
    if(!p.length) return '–';
    return (p[0].charAt(0) + (p.length > 1 ? p[p.length - 1].charAt(0) : '')).toUpperCase();
  }
  /* Color estable por persona, derivado del email. No es decoración: es lo que
     permite reconocer quién tiene una tarea de un vistazo, sin leer. Saturación
     y luminosidad fijas para que ninguno quede ilegible en blanco. */
  function tono(email){
    var h = 0, s = String(email || '');
    for(var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
    return 'hsl(' + h + ',52%,42%)';
  }
  function avatarHTML(email, clase, extra){
    var n = cevenTareas.nombreDe(email);
    return '<span class="av ' + (clase || '') + '" style="background:' + tono(email) + '"'
         + (extra || '') + '>' + esc(iniciales(n)) + '</span>';
  }

  /* ── Pestañas de tablero ────────────────────────────────────────────────── */
  function renderTabs(){
    if(!$tabs) return;
    var mios = cevenTareas.misEquipos();
    var h = '';
    cevenTareas.tableros().forEach(function(n){
      var pend = cevenTareas.list().filter(function(t){
        return t.equipo === n && t.estado !== 'done';
      }).length;
      h += '<button type="button" class="tab' + (n === _tablero ? ' on' : '') + '"'
         + ' data-tablero="' + esc(n) + '"'
         // El punto marca los tableros donde sos miembro: con muchos equipos,
         // distinguir los tuyos de los del resto de un vistazo es todo el punto.
         + (mios.indexOf(n) >= 0 ? ' data-mio="1" title="Sos miembro de este equipo"' : '')
         + '>' + esc(n) + (pend ? '<span class="tab-n">' + pend + '</span>' : '') + '</button>';
    });
    if(escribe()) h += '<button type="button" class="tab tab-mas" data-nuevo-equipo title="Crear un equipo nuevo">＋ Equipo</button>';
    if(escribe()) h += '<button type="button" class="tab tab-cfg" data-editar-equipo title="Miembros de este tablero">⚙</button>';
    $tabs.innerHTML = h;
  }

  /* ── Miembros del tablero actual ────────────────────────────────────────── */
  function renderEquipo(){
    if(!$chips) return;
    var eq = cevenTareas.miembrosDe(_tablero);
    var yo = (typeof cevenSessionUser === 'function' && cevenSessionUser()) || '';

    var h = '<button type="button" class="mb mb-todas' + (_filtro ? '' : ' on') + '" data-filtro="">'
          + 'Todas</button>';
    eq.forEach(function(u){
      h += '<button type="button" class="mb' + (_filtro === u.email ? ' on' : '') + '"'
         + ' data-email="' + esc(u.email) + '"'
         + (escribe() ? ' draggable="true"' : '')
         + ' title="' + esc(u.nombre + ' · ' + u.email) + '">'
         + avatarHTML(u.email)
         + '<span>' + esc(u.nombre) + (u.email === yo ? ' <span class="mb-yo">(vos)</span>' : '') + '</span>'
         + '</button>';
    });
    $chips.innerHTML = h;

    /* Avisos de la base, en orden de gravedad. Que falte una columna es lo
       primero que hay que saber: el tablero se ve entero pero los cambios de
       ese dato no se guardan en ningún lado. */
    if($nota){
      var faltan = cevenTareas.faltantes();
      var msg = '';
      if(faltan.length){
        msg = 'La base todavía no tiene ' + (faltan.length === 1 ? 'la columna' : 'las columnas') + ' '
            + faltan.join(', ') + ': eso no se está guardando. Faltan correr las migraciones de '
            + 'supabase/migrations (20260804180000 y 20260804200000).';
      } else if(eq.length <= 1){
        msg = 'Este tablero tiene un solo miembro. Sumá gente con ⚙ para poder delegarle tareas.';
      }
      $nota.hidden = !msg;
      $nota.textContent = msg;
    }
  }

  /* ── Tablero ────────────────────────────────────────────────────────────── */
  function tarjetaHTML(t){
    var avs = t.asignados.map(function(e){
      return avatarHTML(e, '', ' data-quitar="' + esc(e) + '" role="button" tabindex="-1"'
                          + ' title="' + esc(cevenTareas.nombreDe(e)) + ' — tocá para quitar"');
    }).join('');
    if(!avs) avs = '<span class="tk-sin">Sin delegar</span>';

    var meta = esc(t.creadoPor) + ((t.creadoPor && t.fecha) ? ' · ' : '') + esc(t.fecha);
    var arch = cevenTareas.esArchivada(t);
    if(arch) meta = 'archivada · ' + meta;

    return '<article class="tk' + (arch ? ' tk-arch' : '') + '" data-id="' + t.id + '" tabindex="0"'
         + (escribe() ? ' draggable="true"' : '')
         + ' aria-label="' + esc(t.texto) + '">'
         +   '<div class="tk-txt">' + esc(t.texto) + '</div>'
         +   '<div class="tk-pie">'
         +     '<span class="tk-avs">' + avs + '</span>'
         +     '<span class="tk-meta">' + meta + '</span>'
         +   '</div>'
         + '</article>';
  }

  function render(){
    if(!window.cevenTareas) return;
    // El tablero elegido puede haber dejado de existir (lo borró alguien, o es
    // el primer render y todavía no hay ninguno): se resuelve antes de pintar.
    if(!_tablero || cevenTareas.tableros().indexOf(_tablero) < 0) _tablero = tableroInicial();
    renderTabs();
    renderEquipo();

    var puede = escribe();
    if($alta) $alta.hidden = !puede;
    if($solo) $solo.hidden = puede;

    // Primero el tablero, después el filtro por persona: son independientes.
    var todas = cevenTareas.list().filter(function(t){ return t.equipo === _tablero; });
    var visibles = _filtro
      ? todas.filter(function(t){ return t.asignados.indexOf(_filtro) >= 0; })
      : todas;

    COLS.forEach(function(c){
      var sec  = $cols.querySelector('.col[data-estado="' + c.id + '"]');
      if(!sec) return;
      var body = sec.querySelector('[data-body]');
      var cnt  = sec.querySelector('[data-cnt]');

      var lista = visibles.filter(function(t){ return t.estado === c.id; });

      /* Archivado: solo puede haber en done, y el botón vive en su encabezado.
         El conteo de la columna cuenta lo que se VE — si dijera el total, la
         cabecera contradiría a la lista de abajo. */
      var arch = sec.querySelector('[data-arch]');
      if(arch){
        var archivadas = lista.filter(cevenTareas.esArchivada).length;
        if(!_verArchivadas) lista = lista.filter(function(t){ return !cevenTareas.esArchivada(t); });
        arch.hidden = !archivadas;
        arch.textContent = _verArchivadas
          ? 'ocultar archivadas'
          : archivadas + (archivadas === 1 ? ' archivada' : ' archivadas');
        arch.setAttribute('aria-pressed', _verArchivadas ? 'true' : 'false');
        arch.title = 'Terminadas hace más de ' + cevenTareas.DIAS_ARCHIVO + ' días. No se borran.';
      }
      /* Más nuevas arriba. El tablero no guarda un orden manual: agregar una
         columna `orden` es aditivo y se puede hacer después, pero un orden
         arrastrable exige resolver también el reordenamiento concurrente entre
         varias personas, y eso es otro trabajo. */
      lista.sort(function(a, b){
        // Las archivadas, al final: cuando se muestran no tienen que empujar
        // hacia abajo a las que siguen importando.
        var aa = cevenTareas.esArchivada(a), ab = cevenTareas.esArchivada(b);
        if(aa !== ab) return aa ? 1 : -1;
        var d = String(b.fechaISO || '').localeCompare(String(a.fechaISO || ''));
        return d !== 0 ? d : (b.id - a.id);
      });

      if(cnt) cnt.textContent = lista.length;
      body.innerHTML = lista.length
        ? lista.map(tarjetaHTML).join('')
        : '<div class="col-vacio">' + (puede ? 'Arrastrá una tarea acá' : 'Sin tareas') + '</div>';
    });
  }

  /* ── Resaltado del objetivo ─────────────────────────────────────────────── */
  function resaltar(el){
    var previos = document.querySelectorAll('.sobre');
    for(var i = 0; i < previos.length; i++){
      if(previos[i] !== el) previos[i].classList.remove('sobre');
    }
    if(el) el.classList.add('sobre');
  }
  function limpiar(){
    resaltar(null);
    var llev = document.querySelectorAll('.llevando');
    for(var i = 0; i < llev.length; i++) llev[i].classList.remove('llevando');
    _arrastre = null;
    if(_renderPendiente){ _renderPendiente = false; render(); }
  }
  /* dragend dispara en el ORIGEN del arrastre, que puede estar en la lista de
     miembros o en una tarjeta; y si se suelta fuera de todo, es el único evento
     que llega. Por eso el limpiado va en document y no en cada contenedor. */
  document.addEventListener('dragend', limpiar);
  document.addEventListener('drop', limpiar);

  /* ── Pestañas: cambiar, crear y administrar tableros ────────────────────── */
  if($tabs){
    $tabs.addEventListener('click', function(ev){
      if(cerca(ev.target, '[data-nuevo-equipo]')){ nuevoEquipo(); return; }
      if(cerca(ev.target, '[data-editar-equipo]')){ abrirEquipo(); return; }
      var tab = cerca(ev.target, '[data-tablero]');
      if(!tab) return;
      var n = tab.getAttribute('data-tablero');
      if(n !== _tablero){
        _filtro = '';   // el filtro por persona era del tablero anterior
        irATablero(n);
      }
    });
  }

  function nuevoEquipo(){
    if(!escribe() || typeof promptModal !== 'function') return;
    promptModal('Nombre del equipo nuevo', '', function(nombre){
      nombre = String(nombre || '').trim();
      if(!nombre) return;
      if(cevenTareas.tableros().indexOf(nombre) >= 0){
        if(typeof showToast === 'function') showToast('Ya existe un equipo llamado "' + nombre + '".');
        return;
      }
      if(cevenTareas.crearEquipo(nombre)) irATablero(nombre);
    }, {okLabel: 'Crear'});
  }

  /* Modal de miembros del tablero. Mismo patrón que el detalle de una tarea: se
     crea una vez, se repinta por dentro y los listeners viven en el contenedor. */
  function cerrarEquipo(){
    var m = document.getElementById('eq-modal');
    if(m && m.parentNode) m.parentNode.removeChild(m);
    if(window.cevenNav) cevenNav.notifyClosed(cerrarEquipo);
  }

  function pintarEquipo(){
    var wrap = document.getElementById('eq-modal');
    if(!wrap) return;
    var actual = cevenTareas.miembrosDe(_tablero).map(function(u){ return u.email; });
    var tieneFila = cevenTareas.equipos().some(function(e){ return e.nombre === _tablero; });
    var esDefecto = _tablero === cevenTareas.EQUIPO_DEF;

    /* La lista para tildar es TODA la gente de Ceven, no los miembros: el punto
       del modal es justamente sumar a alguien que todavía no está. */
    var filas = cevenTareas.personas().map(function(u){
      var on = actual.indexOf(u.email) >= 0;
      return '<button type="button" data-miembro="' + esc(u.email) + '"' + (on ? ' class="on"' : '') + '>'
           + avatarHTML(u.email)
           + '<span>' + esc(u.nombre) + (u.rol ? ' <span class="rol">' + esc(u.rol) + '</span>' : '') + '</span>'
           + (on ? '<span class="tick">✓</span>' : '')
           + '</button>';
    }).join('') || '<div class="sub">No se pudo leer la gente de Ceven.</div>';

    wrap.innerHTML =
      '<div class="tkm" role="dialog" aria-modal="true" aria-label="Miembros del equipo">'
      +  '<div class="tkm-hd"><div class="h3">Equipo · ' + esc(_tablero) + '</div>'
      +    '<button type="button" class="tkm-x" data-cerrar title="Cerrar">×</button></div>'
      +  (tieneFila ? '' : '<div class="tb-nota" style="margin:0 0 12px">Este tablero no tiene ficha propia: '
           + 'aparece porque hay tareas que lo nombran. Al sumar un miembro se crea.</div>')
      +  '<div class="lbl">Quiénes aparecen para delegar acá</div>'
      +  '<div class="tkm-eq">' + filas + '</div>'
      +  '<div class="tkm-pie">'
      +    (esDefecto
            ? '<span class="sub">El tablero General no se puede eliminar.</span>'
            : '<button type="button" class="tkm-del" data-borrar-equipo>Eliminar equipo</button>')
      +    '<button type="button" class="tkm-ok" data-cerrar>Listo</button>'
      +  '</div>'
      + '</div>';
  }

  function abrirEquipo(){
    if(!escribe()) return;
    cerrarEquipo();
    var wrap = document.createElement('div');
    wrap.id = 'eq-modal';
    document.body.appendChild(wrap);

    wrap.addEventListener('click', function(ev){
      if(ev.target === wrap || cerca(ev.target, '[data-cerrar]')){ cerrarEquipo(); return; }

      var m = cerca(ev.target, '[data-miembro]');
      if(m){
        var email = m.getAttribute('data-miembro');
        /* Un tablero que solo existe porque hay tareas que lo nombran no tiene
           fila: se crea al primer cambio, o el tilde no tendría dónde guardarse. */
        if(!cevenTareas.equipos().some(function(e){ return e.nombre === _tablero; })){
          cevenTareas.crearEquipo(_tablero);
        }
        var actual = cevenTareas.miembrosDe(_tablero).map(function(u){ return u.email; });
        if(actual.indexOf(email) >= 0) cevenTareas.quitarMiembro(_tablero, email);
        else cevenTareas.agregarMiembro(_tablero, email);
        pintarEquipo();
        return;
      }

      if(cerca(ev.target, '[data-borrar-equipo]')) borrarEquipo();
    });

    pintarEquipo();
    if(window.cevenNav) cevenNav.openOverlay(cerrarEquipo);
  }

  function borrarEquipo(){
    var nombre = _tablero;
    var cuantas = cevenTareas.list().filter(function(t){ return t.equipo === nombre; }).length;
    var msg = 'Eliminar el equipo "' + nombre + '".'
      + (cuantas
          ? '\n\nSus ' + cuantas + (cuantas === 1 ? ' tarea pasa' : ' tareas pasan')
            + ' al tablero ' + cevenTareas.EQUIPO_DEF + '. No se borra ninguna.'
          : '\n\nNo tiene tareas.');
    if(typeof confirmModal !== 'function') return;
    confirmModal(msg, function(){
      if(cevenTareas.eliminarEquipo(nombre)){
        cerrarEquipo();
        irATablero(cevenTareas.EQUIPO_DEF);
      }
    }, {okLabel: 'Eliminar', danger: true});
  }

  /* ── Arrastrar un miembro ───────────────────────────────────────────────── */
  if($chips){
    $chips.addEventListener('dragstart', function(ev){
      var chip = cerca(ev.target, '[data-email]');
      if(!chip || !escribe()){ ev.preventDefault(); return; }
      var email = chip.getAttribute('data-email');
      _arrastre = {tipo: 'miembro', valor: email};
      ev.dataTransfer.setData(T_MIEMBRO, email);
      ev.dataTransfer.effectAllowed = 'copy';
    });

    $chips.addEventListener('click', function(ev){
      var reset = cerca(ev.target, '[data-filtro]');
      if(reset){ _filtro = ''; render(); return; }
      var chip = cerca(ev.target, '[data-email]');
      if(!chip) return;
      var email = chip.getAttribute('data-email');
      _filtro = (_filtro === email) ? '' : email;   // volver a tocarlo saca el filtro
      render();
    });
  }

  /* ── Arrastrar una tarjeta + soltar cualquiera de las dos cosas ─────────── */
  if($cols){
    $cols.addEventListener('dragstart', function(ev){
      var card = cerca(ev.target, '.tk');
      if(!card || !escribe()){ ev.preventDefault(); return; }
      var id = card.getAttribute('data-id');
      _arrastre = {tipo: 'tarea', valor: id};
      ev.dataTransfer.setData(T_TAREA, id);
      ev.dataTransfer.effectAllowed = 'move';
      card.classList.add('llevando');
    });

    $cols.addEventListener('dragover', function(ev){
      var dt = ev.dataTransfer;
      if(tiene(dt, T_MIEMBRO)){
        var card = cerca(ev.target, '.tk');
        if(!card) return;                       // sobre la columna pelada: no hay a quién delegar
        ev.preventDefault();
        dt.dropEffect = 'copy';
        resaltar(card);
        return;
      }
      if(tiene(dt, T_TAREA)){
        var col = cerca(ev.target, '.col');
        if(!col) return;
        ev.preventDefault();
        dt.dropEffect = 'move';
        resaltar(col);
      }
    });

    $cols.addEventListener('drop', function(ev){
      var dt = ev.dataTransfer;

      if(tiene(dt, T_MIEMBRO)){
        var card = cerca(ev.target, '.tk');
        if(!card) return;
        ev.preventDefault();
        var email = dt.getData(T_MIEMBRO) || (_arrastre && _arrastre.valor) || '';
        var id = card.getAttribute('data-id');
        if(email && cevenTareas.delegar(id, email)){
          var t = cevenTareas.get(id);
          if(typeof showToast === 'function'){
            showToast('Delegada a ' + cevenTareas.nombreDe(email) + ': "' + (t ? t.texto : '') + '".');
          }
        }
        return;
      }

      if(tiene(dt, T_TAREA)){
        var col = cerca(ev.target, '.col');
        if(!col) return;
        ev.preventDefault();
        var tid = dt.getData(T_TAREA) || (_arrastre && _arrastre.valor) || '';
        if(tid) cevenTareas.mover(tid, col.getAttribute('data-estado'));
      }
    });

    /* Click: mostrar/ocultar archivadas, quitar un delegado si se tocó su
       avatar, o abrir el detalle. El botón de archivadas va PRIMERO porque vive
       en el encabezado de la columna, fuera de cualquier `.tk`. */
    $cols.addEventListener('click', function(ev){
      if(cerca(ev.target, '[data-arch]')){
        _verArchivadas = !_verArchivadas;
        render();
        return;
      }
      var quitar = cerca(ev.target, '[data-quitar]');
      if(quitar){
        var card0 = cerca(quitar, '.tk');
        if(card0 && escribe()){
          var email = quitar.getAttribute('data-quitar');
          if(cevenTareas.quitar(card0.getAttribute('data-id'), email) && typeof showToast === 'function'){
            showToast('Le quitaste la tarea a ' + cevenTareas.nombreDe(email) + '.');
          }
        }
        return;
      }
      var card = cerca(ev.target, '.tk');
      if(card) abrirDetalle(card.getAttribute('data-id'));
    });

    /* Teclado: el equivalente completo del arrastre. */
    $cols.addEventListener('keydown', function(ev){
      var card = cerca(ev.target, '.tk');
      if(!card) return;
      var id = card.getAttribute('data-id');

      if(ev.key === 'Enter' || ev.key === ' '){
        ev.preventDefault();
        abrirDetalle(id);
        return;
      }
      if(ev.key !== 'ArrowLeft' && ev.key !== 'ArrowRight') return;
      if(!escribe()) return;
      ev.preventDefault();
      var t = cevenTareas.get(id);
      if(!t) return;
      var i = 0;
      COLS.forEach(function(c, k){ if(c.id === t.estado) i = k; });
      var j = Math.min(COLS.length - 1, Math.max(0, i + (ev.key === 'ArrowRight' ? 1 : -1)));
      if(j === i) return;
      cevenTareas.mover(id, COLS[j].id);
      /* Después del repintado la tarjeta es otro nodo: hay que devolverle el
         foco o el teclado queda huérfano en el body. */
      var nueva = $cols.querySelector('.tk[data-id="' + id + '"]');
      if(nueva) nueva.focus();
    });
  }

  /* ── Alta ───────────────────────────────────────────────────────────────── */
  if($alta){
    $alta.addEventListener('submit', function(ev){
      ev.preventDefault();
      var txt = ($texto.value || '').trim();
      if(!txt) return;
      // La tarea nace en el tablero que se está mirando: crearla y que aparezca
      // en otro lado sería el peor default posible.
      if(cevenTareas.agregar(txt, $estado.value, _tablero)) $texto.value = '';
      $texto.focus();
    });
  }

  /* ── Detalle ──────────────────────────────────────────────────────────────
     El modal se crea UNA vez por apertura y después solo se repinta por dentro.
     Mover o (des)asignar desde acá no puede cerrarlo y volver a abrirlo: cada
     ciclo empujaría y sacaría una entrada del historial (cevenNav), y con el
     botón Atrás del celular eso deja de coincidir con lo que se ve en pantalla. */
  var _abierta = null;

  function cerrarDetalle(){
    var m = document.getElementById('tk-modal');
    if(m && m.parentNode) m.parentNode.removeChild(m);
    _abierta = null;
    if(window.cevenNav) cevenNav.notifyClosed(cerrarDetalle);
  }

  function pintarDetalle(){
    var wrap = document.getElementById('tk-modal');
    if(!wrap || _abierta == null) return;
    var t = cevenTareas.get(_abierta);
    if(!t){ cerrarDetalle(); return; }
    var puede = escribe();

    var estados = COLS.map(function(c){
      return '<button type="button" data-mover="' + c.id + '"'
           + (t.estado === c.id ? ' class="on"' : '')
           + (puede ? '' : ' disabled') + '>' + c.label + '</button>';
    }).join('');

    /* Tablero al que pertenece. Mover una tarea de equipo se hace desde acá y no
       arrastrando: el gesto de arrastre ya tiene dos significados en esta
       pantalla (mover de columna, delegar) y un tercero sería adivinanza. */
    var tableros = cevenTareas.tableros().map(function(n){
      return '<button type="button" data-tab="' + esc(n) + '"'
           + (t.equipo === n ? ' class="on"' : '')
           + (puede ? '' : ' disabled') + '>' + esc(n) + '</button>';
    }).join('');

    var eq = cevenTareas.miembrosDe(t.equipo);
    /* Alguien que ya está asignado pero salió del equipo igual tiene que poder
       sacarse de la tarea: se agrega al final de la lista para que exista una
       fila donde tocar. */
    t.asignados.forEach(function(e){
      var esta = eq.some(function(u){ return u.email === e; });
      if(!esta) eq.push({email: e, nombre: cevenTareas.nombreDe(e), rol: 'fuera del equipo'});
    });

    var miembros = eq.map(function(u){
      var on = t.asignados.indexOf(u.email) >= 0;
      return '<button type="button" data-toggle="' + esc(u.email) + '"'
           + (on ? ' class="on"' : '') + (puede ? '' : ' disabled') + '>'
           + avatarHTML(u.email)
           + '<span>' + esc(u.nombre) + (u.rol ? ' <span class="rol">' + esc(u.rol) + '</span>' : '') + '</span>'
           + (on ? '<span class="tick">✓</span>' : '')
           + '</button>';
    }).join('') || '<div class="sub">No hay miembros para delegar.</div>';

    wrap.innerHTML =
      '<div class="tkm" role="dialog" aria-modal="true" aria-label="Detalle de la tarea">'
      +  '<div class="tkm-hd"><div class="h3">Tarea</div>'
      +    '<button type="button" class="tkm-x" data-cerrar title="Cerrar">×</button></div>'
      +  '<textarea id="tkm-texto"' + (puede ? '' : ' readonly') + '></textarea>'
      +  '<div class="lbl">Columna</div><div class="tkm-estados">' + estados + '</div>'
      +  '<div class="lbl">Equipo</div><div class="tkm-estados tkm-tabs">' + tableros + '</div>'
      +  '<div class="lbl">Delegada a</div><div class="tkm-eq">' + miembros + '</div>'
      +  '<div class="tkm-pie">'
      +    (puede ? '<button type="button" class="tkm-del" data-eliminar>Eliminar</button>' : '<span></span>')
      +    '<button type="button" class="tkm-ok" data-cerrar>Listo</button>'
      +  '</div>'
      + '</div>';

    // El texto se asigna por .value y no dentro del HTML: así nunca pasa por el
    // parser, escape mediante o no.
    var ta = wrap.querySelector('#tkm-texto');
    ta.value = t.texto;
    return ta;
  }

  function abrirDetalle(id){
    var t = cevenTareas.get(id);
    if(!t) return;
    if(_abierta != null) cerrarDetalle();
    _abierta = t.id;

    var wrap = document.createElement('div');
    wrap.id = 'tk-modal';
    document.body.appendChild(wrap);

    /* Un solo juego de listeners para toda la vida del modal: el contenido se
       reemplaza, el contenedor no. */
    wrap.addEventListener('click', function(ev){
      if(ev.target === wrap || cerca(ev.target, '[data-cerrar]')){
        guardarTexto();
        cerrarDetalle();
        return;
      }
      var mv = cerca(ev.target, '[data-mover]');
      if(mv){ guardarTexto(); cevenTareas.mover(_abierta, mv.getAttribute('data-mover')); pintarDetalle(); return; }

      var tb = cerca(ev.target, '[data-tab]');
      if(tb){
        guardarTexto();
        var destino = tb.getAttribute('data-tab');
        if(cevenTareas.moverAEquipo(_abierta, destino)){
          /* Se cierra: la tarea ya no está en el tablero que se está mirando, y
             dejar abierto el detalle de algo que desapareció de atrás confunde.
             El cartel dice a dónde fue, que es lo que hace falta saber. */
          cerrarDetalle();
          if(typeof showToast === 'function') showToast('Tarea movida al equipo ' + destino + '.');
        }
        return;
      }

      var tg = cerca(ev.target, '[data-toggle]');
      if(tg){
        guardarTexto();
        var email = tg.getAttribute('data-toggle');
        var actual = cevenTareas.get(_abierta);
        if(!actual) return;
        if(actual.asignados.indexOf(email) >= 0) cevenTareas.quitar(_abierta, email);
        else cevenTareas.delegar(_abierta, email);
        pintarDetalle();
        return;
      }

      if(cerca(ev.target, '[data-eliminar]')) borrar(_abierta);
    });

    // Delegado, no atado al <textarea>: el nodo se rehace en cada repintado.
    wrap.addEventListener('keydown', function(ev){
      if(ev.key !== 'Enter' || ev.shiftKey) return;
      if(!cerca(ev.target, '#tkm-texto')) return;
      ev.preventDefault();
      guardarTexto();
      cerrarDetalle();
    });

    var ta = pintarDetalle();
    if(window.cevenNav) cevenNav.openOverlay(cerrarDetalle);
    if(ta && escribe()){ ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); }
  }

  function guardarTexto(){
    var ta = document.getElementById('tkm-texto');
    if(_abierta == null || !ta) return;
    cevenTareas.renombrar(_abierta, ta.value);
  }

  function borrar(id){
    var removida = cevenTareas.eliminar(id);
    cerrarDetalle();
    if(removida && typeof notifyUndo === 'function'){
      notifyUndo('Eliminaste la tarea: "' + removida.texto + '".', function(){
        cevenTareas.restaurar(removida);
      });
    }
  }

  /* ── Arranque ───────────────────────────────────────────────────────────── */
  if(!window.cevenTareas){
    /* Sin SUPABASE_URL el store ni siquiera se define (shared/todos.js corta al
       entrar). El tablero es 100 % colaborativo: sin base no hay nada que
       mostrar, y una pantalla vacía sin explicación sería peor. */
    if($cols) $cols.innerHTML = '<div class="tb-nota">La base de datos no está configurada '
      + '(SUPABASE_URL vacío en shared/config.js): el tablero del equipo no puede funcionar sin ella.</div>';
    if($alta) $alta.hidden = true;
    return;
  }

  cevenTareas.onChange(function(){
    if(_arrastre){ _renderPendiente = true; return; }
    render();
    /* El detalle también se repinta: si el poll trajo que alguien más movió o
       delegó esta misma tarea, dejarlo mostrando la foto vieja invita a pisar
       el cambio del otro con un click. */
    if(_abierta != null && document.getElementById('tk-modal')){
      var focoEnTexto = document.activeElement && document.activeElement.id === 'tkm-texto';
      if(!focoEnTexto) pintarDetalle();   // salvo si están escribiendo: repintar borraría lo tipeado
    }
  });
  render();
  /* El store arranca solo, pero si esta página se abrió con la sesión ya válida
     su boot() corrió antes de que existiera este suscriptor. Un render de más
     no cuesta nada y evita depender del orden. */
  window.addEventListener('ceven-session-ready', render);
})();
