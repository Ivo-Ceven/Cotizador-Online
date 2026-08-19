/* ============================================================================
   NAVBAR  ·  barra superior compartida (shell + todas las marcas)
   ----------------------------------------------------------------------------
   Antes no había navegación: se saltaba entre vistas con botones sueltos
   repartidos por cada barra de herramientas (📋 al historial en la cotización,
   "← Volver" en el pipeline) y no había forma de saber, mirando la pantalla,
   en qué vista ni en qué marca estabas. Acá está todo en un solo lugar.

   Qué pinta:
     · el chip de marca (logo + Ceven · Apple) — click = volver al panel de marcas.
       Es la única señal permanente de en qué cotizador estás: Apple y Poly se
       ven casi iguales y sus datos NO se mezclan;
     · un ítem por vista, según CEVEN_BRAND.navItems (declarativo por marca,
       igual que el resto del contrato — acá no hay ningún if por marca);
     · a la derecha, la cuenta: modo oscuro, usuarios (solo admin, solo donde
       existe el modal), quién sos con tu rol, contraseña y salir.

   Se carga TEMPRANO (justo después del guard de sesión) para que la barra ya
   esté en su lugar cuando el resto del markup se parsea, y no salte. Los
   handlers usan funciones que se definen más abajo (goTo, toggleDark): recién
   se ejecutan al hacer click, así que el orden no molesta.

   Depende de: auth.js (rol, sesión) y —si es un cotizador— brand.js.
   El shell la usa sin navItems: solo el wordmark y la cuenta.

   Hay un tercer caso: páginas que NO son de marca pero tampoco son el shell
   (src/tareas/). Declaran `window.CEVEN_PAGE = {label, icon}` antes de cargar
   este archivo y con eso reciben chip propio y vuelta al panel. Es un objeto
   aparte y no un CEVEN_BRAND falso a propósito: un brand.js de mentira
   arrastraría todo el contrato de marca (theme, prefix, pipeCols, el botón de
   modo oscuro que acá no tiene a quién llamar) para usar dos campos.
   ============================================================================ */
(function(){
  var B = window.CEVEN_BRAND || null;
  var P = (!B && window.CEVEN_PAGE) ? window.CEVEN_PAGE : null;

  /* Cara visible de cada marca: el logo oficial, en icons/brands/. Vive acá y no
     en brand.js porque es la misma tarjeta que muestra el panel del shell: si se
     duplicara, se despegarían.

     `mono` marca los logos de un solo color oscuro (el de Apple es negro puro):
     sobre la navbar en modo oscuro desaparecerían, así que dark.css los invierte
     — ver la regla de img.cvnav-mark[data-mono]. Los de HP (azul) y Poly
     (naranja) se leen igual en los dos modos y no la necesitan.

     La ruta es relativa a la PÁGINA, no a este archivo: todo cotizador cuelga un
     nivel abajo de la raíz (apple/index.html, apple/cevencare.html, poly/…), el
     mismo supuesto del botón "volver al panel" de más abajo. */
  var MARKS = {
    apple: { img: 'apple.png', mono: true },
    poly:  { img: 'poly.png' },
    hp:    { img: 'hp.png' }
  };

  var ROLES = { admin: 'Administrador', ventas: 'Ventas', lector: 'Lector' };

  function esc(s){
    return (typeof cevenEsc === 'function') ? cevenEsc(s) : String(s == null ? '' : s);
  }

  /* Iniciales para el avatar: "Fer Castro" → "FC". Sin nombre cargado cae al
     mail (juan@ceven.com → "J"), y sin sesión a un guión. */
  function initials(nombre, email){
    var n = (nombre || '').trim();
    if(n){
      var p = n.split(/\s+/);
      return (p[0].charAt(0) + (p.length > 1 ? p[p.length-1].charAt(0) : '')).toUpperCase();
    }
    var e = (email || '').trim();
    return e ? e.charAt(0).toUpperCase() : '–';
  }

  /* ── Markup ───────────────────────────────────────────────────────────── */
  function build(){
    var items   = (B && B.navItems) || [];
    var esMarca = !!B;
    // Todo lo que cuelga un nivel abajo de la raíz vuelve al panel; el shell ya está ahí.
    var vuelve  = !!(B || P);
    var hayUsuarios = !!document.getElementById('ceven-users-modal');
    var hayPortal = !!document.getElementById('ceven-portal-modal');

    var h = '<header class="cvnav"><div class="cvnav-in">';

    // Chip de marca. En el cotizador vuelve al panel; en el shell ya estás ahí.
    // alt="" a propósito: el nombre de la marca ya va escrito al lado.
    var mk = esMarca ? MARKS[B.id] : null;
    var mark = mk
      ? '<img class="cvnav-mark" src="../icons/brands/' + mk.img + '" alt="" width="18" height="18"' +
        (mk.mono ? ' data-mono="1"' : '') + '>'
      : '<span class="cvnav-mark">' + esc((P && P.icon) || (esMarca ? '📄' : '📊')) + '</span>';

    h += '<button class="cvnav-brand" id="cvnav-home"' +
         (vuelve ? ' title="Volver al panel de marcas"' : ' disabled') + '>' +
         mark +
         '<span class="cvnav-name">Ceven<i>·</i><b>' +
           esc(B ? B.label : (P ? P.label : 'Cotizadores')) +
         '</b></span></button>';

    // Vistas
    h += '<nav class="cvnav-links" id="cvnav-links" aria-label="Secciones">';
    for(var i = 0; i < items.length; i++){
      var it = items[i];
      h += '<button class="cvnav-link" data-view="' + esc(it.view) + '"' +
           (it.needsPipeline ? ' data-needs-pipeline="1"' : '') + '>' +
           esc(it.label) + '</button>';
    }
    h += '</nav>';

    // Cuenta
    h += '<div class="cvnav-acc">';
    if(esMarca){
      h += '<button class="cvnav-btn dark-btn" id="cvnav-dark" title="Modo oscuro / claro">🌙</button>';
    }
    if(hayUsuarios){
      h += '<button class="cvnav-btn" id="ceven-users-btn" title="Gestionar usuarios">👤</button>';
    }
    if(hayPortal){
      h += '<button class="cvnav-btn" id="ceven-portal-btn" title="Clientes del portal">🧑‍💼</button>';
    }
    h += '<div class="cvnav-user" id="cvnav-user">' +
           '<span class="cvnav-ava" id="cvnav-ava">–</span>' +
           '<span class="cvnav-who"><b id="cvnav-nombre"></b><span id="cvnav-rol"></span></span>' +
         '</div>' +
         '<button class="cvnav-btn" id="cvnav-pass" title="Cambiar mi contraseña">🔑</button>' +
         '<button class="cvnav-btn" id="cvnav-out" title="Cerrar sesión">🚪</button>';
    h += '</div></div></header>';

    document.body.insertAdjacentHTML('afterbegin', h);
  }

  /* ── Cableado ─────────────────────────────────────────────────────────── */
  function wire(){
    var home = document.getElementById('cvnav-home');
    if(home && (B || P)) home.addEventListener('click', function(){ location.href = '../index.html'; });

    var links = document.getElementById('cvnav-links');
    if(links) links.addEventListener('click', function(ev){
      var b = ev.target.closest ? ev.target.closest('[data-view]') : null;
      if(!b) return;
      if(typeof goTo === 'function') goTo(b.getAttribute('data-view'));
    });

    var dk = document.getElementById('cvnav-dark');
    if(dk) dk.addEventListener('click', function(){ if(typeof toggleDark === 'function') toggleDark(); });

    var us = document.getElementById('ceven-users-btn');
    if(us) us.addEventListener('click', function(){ if(typeof cevenOpenUsers === 'function') cevenOpenUsers(); });

    var pc = document.getElementById('ceven-portal-btn');
    if(pc) pc.addEventListener('click', function(){ if(typeof cevenOpenPortalClientes === 'function') cevenOpenPortalClientes(); });

    var pw = document.getElementById('cvnav-pass');
    if(pw) pw.addEventListener('click', function(){ if(typeof cevenChangeMyPassword === 'function') cevenChangeMyPassword(); });

    var out = document.getElementById('cvnav-out');
    if(out) out.addEventListener('click', function(){ if(typeof cevenLogout === 'function') cevenLogout(); });
  }

  /* ── Sincronización ───────────────────────────────────────────────────────
     La llama cevenSyncUserUI() de auth.js, que a su vez corre en cada
     cambio de vista (_navApply) y al mostrar la app tras el login. Actualiza
     tres cosas: qué ítem está activo, quién sos, y si el pipeline se ve. */
  window.cevenNavbarSync = function(){
    var logueado = (typeof cevenIsValidSession === 'function') && cevenIsValidSession();

    // Ítem activo. Las vistas que no están en la barra (addprod, qnac) marcan
    // la que las contiene, declarada en navItems.alsoFor.
    var on = document.querySelector('.pg.on');
    var vista = on ? on.id.replace(/^p-/, '') : '';
    var items = (B && B.navItems) || [];
    var links = document.querySelectorAll('.cvnav-link');
    for(var i = 0; i < links.length; i++){
      var v  = links[i].getAttribute('data-view');
      var it = null;
      for(var j = 0; j < items.length; j++){ if(items[j].view === v) it = items[j]; }
      var activo = (v === vista) ||
                   !!(it && it.alsoFor && it.alsoFor.indexOf(vista) >= 0);
      links[i].classList.toggle('on', activo);
      links[i].setAttribute('aria-current', activo ? 'page' : 'false');

      // Un lector no usa el pipeline: sacarle el ítem evita el viaje en falso.
      if(links[i].getAttribute('data-needs-pipeline')){
        var puede = (typeof cevenCanUsePipeline !== 'function') || cevenCanUsePipeline();
        links[i].style.display = puede ? '' : 'none';
      }
    }

    // Quién sos. Sin sesión la barra queda sin identidad (el shell la muestra
    // detrás del overlay de login).
    var nombre = (typeof cevenMyNombre === 'function' && logueado) ? cevenMyNombre() : '';
    var email  = (typeof cevenSessionUser === 'function' && logueado) ? (cevenSessionUser() || '') : '';
    var rol    = (typeof cevenMyRole === 'function' && logueado) ? cevenMyRole() : '';

    var ava = document.getElementById('cvnav-ava');
    if(ava) ava.textContent = initials(nombre, email);
    var nom = document.getElementById('cvnav-nombre');
    if(nom){
      nom.textContent = nombre || email;
      nom.title = email;
    }
    var rl = document.getElementById('cvnav-rol');
    if(rl) rl.textContent = ROLES[rol] || '';

    /* La gestión de usuarios es solo del admin. cevenSyncUserUI() hace lo
       mismo, pero auth.js llama a cevenShowApp() apenas se carga —antes de que
       exista esta barra—, así que si no se resolviera acá el botón quedaría
       visible para todos hasta el próximo cambio de vista. */
    var us = document.getElementById('ceven-users-btn');
    if(us) us.style.display = (typeof cevenIsAdmin === 'function' && cevenIsAdmin()) ? '' : 'none';
  };

  build();
  wire();
  cevenNavbarSync();
})();
