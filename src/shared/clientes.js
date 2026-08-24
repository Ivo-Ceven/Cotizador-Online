/* ============================================================
   CLIENTES  ·  compartido por todas las marcas
   ------------------------------------------------------------
   Ficha por cliente. Hoy guarda una sola cosa —el nivel de
   precio con el que se le cotiza— pero nace como ficha y no
   como "un campo suelto" a proposito: el proximo paso previsto
   es una tabla de clientes con condiciones de pago, CUIT, etc.
   Agregar un campo tiene que ser agregar una clave aca, sin
   mover nada de lo que ya usa esto.

   Se guarda en `cclientes` (con el prefijo de la marca) y
   sincroniza como una clave mas de app_settings. Es un blob
   chico —una entrada por cliente— asi que el last-write-wins
   de las settings no molesta como si molestaria en cquotes.

   La clave es el nombre NORMALIZADO con cevenNormClient(), el
   mismo criterio con el que el pipeline agrupa: "ACME S.A." y
   "acme s.a. " son el mismo cliente y tienen que compartir
   ficha. Se guarda ademas la grafia con la que se lo vio por
   ultima vez, para poder mostrarlo como lo escribe el usuario.

   ⚠ cevenNormClient() VIVE ACA, y no en pipeline-group.js como
   hasta el 12/08/2026. La dependencia iba al reves —el modulo
   del cliente dependia del modulo del pipeline—, asi que una
   pagina con clientes pero SIN pipeline se cargaba entera y
   recien reventaba al guardar:

     Uncaught ReferenceError: cevenNormClient is not defined
         at cevenClienteSet (clientes.js:47)

   Le paso al multimarca, que no tiene pipeline propio (emite a
   las marcas). Ahora el pipeline depende del cliente, que es el
   sentido correcto: el pipeline AGRUPA por cliente, no lo define.

   Depende de: brand.js (cevenK), safe.js (cevenLsSet,
   cevenLsJSON).
   Se carga ANTES de pipeline-group.js.
   ============================================================ */

/* La forma canonica de un nombre de cliente. El campo es texto libre: sin esto,
   "Coca Cola", "coca cola" y "Coca Cola " son tres clientes distintos para
   cualquier agrupacion y para cualquier ficha.

   Los guiones y la puntuacion NO se tocan: "Coca-Cola" y "Coca Cola" pueden ser
   dos razones sociales distintas de verdad, y unir de mas es peor que unir de
   menos — se pierde plata de vista abajo del cliente equivocado. */
function cevenNormClient(s){
  return String(s == null ? '' : s).trim().toLowerCase().replace(/\s+/g, ' ');
}

function cevenGetClientes(){
  var c = window.cevenLsJSON(window.cevenK('cclientes'), {});
  return (c && typeof c === 'object' && !(c instanceof Array)) ? c : {};
}

function cevenSaveClientes(c){
  return window.cevenLsSet(window.cevenK('cclientes'), JSON.stringify(c));
}

/* La ficha de un cliente, o null. `nombre` entra crudo, como lo escribio el
   usuario: la normalizacion es interna. */
function cevenClienteFicha(nombre){
  var k = cevenNormClient(nombre);
  if(!k) return null;
  return cevenGetClientes()[k] || null;
}

/* Guarda/actualiza campos de la ficha SIN pisar los que no se pasan: cuando
   mañana existan condiciones de pago, guardar el tier no puede borrarlas. */
function cevenClienteSet(nombre, campos){
  var crudo = String(nombre == null ? '' : nombre).trim();
  var k = cevenNormClient(crudo);
  if(!k) return false;
  var todos = cevenGetClientes();
  var f = todos[k] || {};
  for(var c in campos){ if(campos[c] !== undefined) f[c] = campos[c]; }
  f.nombre = crudo || f.nombre;      // ultima grafia vista, para mostrar
  todos[k] = f;
  return cevenSaveClientes(todos);
}

// Nivel de precio con el que se le cotiza a este cliente ('' si no hay ficha).
function cevenClienteTier(nombre){
  var f = cevenClienteFicha(nombre);
  return (f && f.tier) || '';
}

/* Lista de nombres de clientes conocidos, para el <datalist> del formulario.
   Se arma con las fichas MAS lo que ya aparece en el pipeline y en el
   historial: con la base recien migrada no hay fichas todavia, y un
   autocompletado vacio no ayuda a nadie. */
function cevenClientesConocidos(){
  var seen = {}, out = [];
  function _add(n){
    n = String(n == null ? '' : n).trim();
    if(!n || n === '—') return;
    var k = cevenNormClient(n);
    if(!k || seen[k]) return;
    seen[k] = 1; out.push(n);
  }
  var fichas = cevenGetClientes();
  Object.keys(fichas).forEach(function(k){ _add(fichas[k].nombre || k); });
  try{ if(typeof getPipeline === 'function') getPipeline().forEach(function(r){ _add(r.cliente); }); }catch(e){}
  try{ if(typeof getDB === 'function') getDB().forEach(function(r){ _add(r['Cliente']); }); }catch(e){}
  out.sort(function(a, b){ return a.localeCompare(b); });
  return out;
}

/* Refresca el <datalist> del campo Cliente. Mismo criterio que el de OPG
   (refreshOpgDatalist): reduce el riesgo de que un typo cree un cliente
   "nuevo" que despues aparece como un grupo aparte en el pipeline. */
function cevenRefreshClienteDatalist(){
  var dl = document.getElementById('cliente-datalist');
  if(!dl) return;
  dl.innerHTML = cevenClientesConocidos().map(function(n){
    return '<option value="' + cevenEsc(n) + '">';
  }).join('');
}

/* ════════════════════════════════════════════════════════════════════════════
   COMBO DE CLIENTE  ·  reemplaza al <datalist> nativo
   ----------------------------------------------------------------------------
   El campo Cliente usaba `list="cliente-datalist"`, o sea el desplegable nativo
   del navegador. Cuatro problemas, y ninguno se arregla con CSS porque ese
   desplegable NO es estilable:

     · se ve como un menú del sistema en medio de una app que no se ve así, y en
       Chrome ignora la tipografía y el tamaño del resto del formulario;
     · el matching lo decide el navegador: Chrome arranca por PREFIJO, así que
       tipear "galicia" no encontraba "Banco Galicia" — y con 200 clientes en la
       base eso significa scrollear o saber cómo empieza el nombre;
     · no muestra NADA además del texto. El nivel de precio que se aplica solo al
       elegir el cliente (aplicarTierDelCliente) quedaba invisible hasta después
       de haberlo elegido;
     · cuando no hay coincidencias no dice nada: la lista simplemente no se abre,
       y no hay forma de distinguir "no existe ese cliente" de "el desplegable no
       anduvo". Ese es justo el momento en que hay que avisar que se está por
       crear un cliente nuevo, que después arma su propio grupo en el pipeline.

   La fuente de datos SIGUE SIENDO el <datalist>, que ahora no se ve pero se
   llena igual: cevenRefreshClienteDatalist() (acá arriba, con lo local) y
   cevenClientesDbRefreshDatalist() (clientes-db.js, con la tabla `clientes`,
   que llega por red y tarda). Leerlo de ahí es lo que hace que este combo no
   tenga que saber nada de Supabase ni de en qué orden llegan las dos listas.

   Contrato: al elegir una opción se escribe el valor en el input y se dispara
   un `change` que burbujea, así que los `onchange` que ya estaban
   (aplicarTierDelCliente, cevenClienteCambio) siguen andando sin tocarlos.

   El popover va en <body> con position:fixed, igual que el de monthpicker.js y
   por la misma razón: adentro de una tarjeta cualquier cosa absoluta se recorta.
   ════════════════════════════════════════════════════════════════════════════ */
(function(){
  var MAX_VISIBLES = 60;   // con 500 clientes, pintar todos traba el teclado

  var pop = null;    // el nodo abierto, o null
  var input = null;  // el <input> que lo abrió
  var items = [];    // [{nombre, tier}] de lo que se está mostrando
  var sel = -1;      // índice resaltado con el teclado

  /* Sin acentos y en minúscula. cevenNormClient() no alcanza acá: sirve para
     decidir si dos nombres SON el mismo cliente (y ahí "Peña" y "Pena" no lo
     son), pero para BUSCAR sí queremos que tipear "pena" encuentre "Peña". Son
     dos preguntas distintas y por eso son dos funciones distintas. */
  function _plegar(s){
    s = String(s == null ? '' : s).toLowerCase();
    // normalize() existe en todo navegador que soporte service workers; el try
    // cae a la comparación con acentos, que es peor pero funciona.
    try{ s = s.normalize('NFD').replace(/[\u0300-\u036f]/g, ''); }catch(e){}
    return s;
  }

  /* Lo mismo más el colapso de espacios, que es lo que se quiere para BUSCAR:
     "Banco  Galicia" escrito con dos espacios tiene que encontrarse tipeando
     uno. Va aparte de _plegar() porque colapsar CAMBIA EL LARGO, y _resaltar()
     necesita que los índices del texto plegado sirvan sobre el original. */
  function _fold(s){
    return _plegar(s).replace(/\s+/g, ' ').trim();
  }

  /* Los clientes conocidos, sacados del <datalist>. Se lee en cada apertura y
     no se cachea: la lista de la base llega asincrónica y puede engordar entre
     una apertura y la siguiente. */
  function _todos(){
    var dl = document.getElementById('cliente-datalist');
    if(!dl) return [];
    var opts = dl.querySelectorAll('option'), out = [], i;
    for(i = 0; i < opts.length; i++){
      var n = opts[i].value;
      if(!n) continue;
      out.push({nombre: n, tier: cevenClienteTier(n)});
    }
    return out;
  }

  /* Filtra y ORDENA por qué tan bien matchea, que es la parte que el datalist
     nativo no hace: primero los que empiezan con lo tipeado, después los que lo
     contienen en el medio ("galicia" → "Banco Galicia"), y dentro de cada
     grupo, el orden alfabético con el que ya venían. Sin eso, buscar por una
     palabra del medio devuelve todo alfabético y el que buscabas queda 40°. */
  function _filtrar(q){
    var todos = _todos();
    var f = _fold(q);
    if(!f) return todos.slice(0, MAX_VISIBLES);
    var empieza = [], contiene = [];
    for(var i = 0; i < todos.length; i++){
      var pos = _fold(todos[i].nombre).indexOf(f);
      if(pos === 0)     empieza.push(todos[i]);
      else if(pos > 0)  contiene.push(todos[i]);
    }
    return empieza.concat(contiene).slice(0, MAX_VISIBLES);
  }

  /* El nombre con la parte que matchea en <b>. Se busca sobre el texto plegado
     pero se corta sobre el ORIGINAL, y eso solo funciona si los índices de los
     dos coinciden. Para el caso que importa coinciden: NFD parte "ñ" en n + la
     tilde combinante y después se saca la tilde, así que vuelve a medir uno.

     Igual se compara el largo antes de cortar. Hay caracteres cuya
     descomposición no vuelve al largo original, y no vale la pena averiguar
     cuáles: si no cuadra se muestra el nombre sin resaltar, que es exactamente
     lo que había antes de este combo. Resaltar la mitad de otra palabra sería
     peor que no resaltar nada. */
  function _resaltar(nombre, q){
    var f = _fold(q);
    if(!f) return cevenEsc(nombre);
    var plegado = _fold(nombre);
    if(plegado.length !== nombre.length) return cevenEsc(nombre);
    var pos = plegado.indexOf(f);
    if(pos < 0) return cevenEsc(nombre);
    return cevenEsc(nombre.slice(0, pos))
      + '<b>' + cevenEsc(nombre.slice(pos, pos + f.length)) + '</b>'
      + cevenEsc(nombre.slice(pos + f.length));
  }

  function cerrar(){
    if(!pop) return;
    if(pop.parentNode) pop.parentNode.removeChild(pop);
    if(input) input.setAttribute('aria-expanded', 'false');
    pop = null; input = null; items = []; sel = -1;
  }
  window.cevenClienteComboClose = cerrar;

  function _ubicar(){
    if(!pop || !input) return;
    var r = input.getBoundingClientRect();
    pop.style.width = Math.max(220, r.width) + 'px';
    var h = pop.offsetHeight;
    var left = Math.max(8, Math.min(r.left, window.innerWidth - pop.offsetWidth - 8));
    var top = r.bottom + 4;
    // Sin lugar abajo, se abre para arriba en vez de quedar cortado por el borde.
    if(top + h > window.innerHeight - 8 && r.top - h - 4 > 8) top = r.top - h - 4;
    pop.style.left = left + 'px';
    pop.style.top = top + 'px';
  }

  function _pintar(){
    if(!pop || !input) return;
    var q = input.value || '';
    items = _filtrar(q);
    sel = -1;

    var h = '';
    if(!items.length){
      /* Los dos vacíos son distintos y antes decían lo mismo (nada). Con la
         lista cargada, "no hay ninguno con ese nombre" es además el aviso de
         que se está por crear un cliente nuevo — que después arma su propio
         grupo en el pipeline, y ahí ya es tarde para ver el typo. */
      h = '<div class="cbo-vacio">' + ((_todos().length && q.trim())
        ? '<b>Sin coincidencias.</b><br>Se va a crear como cliente nuevo.'
        : 'Todavía no hay clientes cargados.') + '</div>';
    } else {
      var actual = cevenNormClient(q);
      for(var i = 0; i < items.length; i++){
        var it = items[i];
        var ya = cevenNormClient(it.nombre) === actual;
        h += '<div class="cbo-op' + (ya ? ' cbo-ya' : '') + '" data-cbo-i="' + i + '" role="option">'
          +   '<span class="cbo-n">' + _resaltar(it.nombre, q) + '</span>'
          /* El nivel de precio del cliente: es EXACTAMENTE lo que
             aplicarTierDelCliente() va a poner al elegirlo, así que verlo antes
             evita el "¿por qué me cambió los precios?". Los clientes sin ficha
             (los que salen del pipeline o del historial) no muestran nada, que
             es la verdad: todavía no tienen nivel recordado. */
          +   (it.tier ? '<span class="cbo-t">' + cevenEsc(
                (typeof cevenTierLabel === 'function') ? cevenTierLabel(it.tier) : it.tier) + '</span>' : '')
          + '</div>';
      }
      // Se avisa el recorte en vez de mentir que eso es toda la lista.
      if(items.length >= MAX_VISIBLES){
        h += '<div class="cbo-mas">Se muestran los primeros ' + MAX_VISIBLES
           + ' — seguí escribiendo para achicar la lista</div>';
      }
    }
    pop.innerHTML = h;
    _ubicar();
  }

  function _marcar(i){
    var ops = pop ? pop.querySelectorAll('.cbo-op') : [];
    if(!ops.length) return;
    if(sel >= 0 && ops[sel]) ops[sel].classList.remove('on');
    sel = (i + ops.length) % ops.length;
    ops[sel].classList.add('on');
    // scrollIntoView a secas scrollea también la página; block:'nearest' no.
    try{ ops[sel].scrollIntoView({block:'nearest'}); }catch(e){}
  }

  function _elegir(i){
    var it = items[i];
    var el = input;
    if(!it || !el){ cerrar(); return; }
    var cambio = el.value !== it.nombre;
    el.value = it.nombre;
    cerrar();
    el.focus();
    /* El `change` es el contrato con el resto de la app: de ahí cuelgan
       aplicarTierDelCliente() y cevenClienteCambio(), que resuelve el id contra
       Supabase. Un input escrito por JS no lo dispara solo. */
    if(cambio){ try{ el.dispatchEvent(new Event('change', {bubbles:true})); }catch(e){} }
  }

  function abrir(el){
    if(pop && input === el){ _pintar(); return; }
    cerrar();
    input = el;
    pop = document.createElement('div');
    pop.className = 'cbo-pop';
    pop.setAttribute('role', 'listbox');
    pop.setAttribute('aria-label', 'Clientes');
    document.body.appendChild(pop);
    el.setAttribute('aria-expanded', 'true');
    _pintar();
  }

  /* ── Cableado global ──────────────────────────────────────────────────────
     Un solo juego de listeners en document, como monthpicker.js: el campo puede
     no existir todavía cuando este archivo corre, así que engancharse al
     elemento no serviría. */
  function _esCampo(t){
    return !!(t && t.id === 'client' && t.tagName === 'INPUT');
  }

  // focusin y no focus: focus no burbujea, así que no se puede delegar.
  document.addEventListener('focusin', function(e){
    if(_esCampo(e.target)) abrir(e.target);
    else if(pop && !pop.contains(e.target)) cerrar();
  });

  document.addEventListener('input', function(e){
    if(_esCampo(e.target) && pop) _pintar();
  });

  document.addEventListener('click', function(e){
    var t = e.target;
    if(!t || !t.closest) return;
    if(pop && pop.contains(t)){
      var op = t.closest('[data-cbo-i]');
      if(op) _elegir(parseInt(op.getAttribute('data-cbo-i'), 10));
      return;
    }
    // Clic en el campo estando abierto: no lo cierra (lo acaba de abrir el
    // focusin). Clic en cualquier otro lado, sí.
    if(!_esCampo(t)) cerrar();
  });

  document.addEventListener('keydown', function(e){
    if(!pop || !_esCampo(e.target)) return;
    var k = e.key;
    if(k === 'ArrowDown'){ e.preventDefault(); _marcar(sel + 1); }
    else if(k === 'ArrowUp'){ e.preventDefault(); _marcar(sel - 1); }
    else if(k === 'Enter'){
      /* Enter SIN nada resaltado deja lo tipeado y cierra: es la forma de
         cargar un cliente nuevo sin pelearse con la lista. */
      if(sel >= 0){ e.preventDefault(); _elegir(sel); }
      else cerrar();
    }
    else if(k === 'Escape' || k === 'Esc'){
      /* stopPropagation: shared/nav.js escucha Escape para cerrar la pantalla
         entera. Cerrar el desplegable no puede además sacarte de la vista. */
      e.stopPropagation();
      cerrar();
    }
    else if(k === 'Tab') cerrar();
  }, true);

  /* El popover es position:fixed: si la página se mueve queda flotando lejos del
     campo. Se reubica con el scroll, y se cierra si el campo salió de vista. */
  window.addEventListener('scroll', function(){
    if(!pop || !input) return;
    var r = input.getBoundingClientRect();
    if(r.bottom < 0 || r.top > window.innerHeight) cerrar();
    else _ubicar();
  }, true);
  window.addEventListener('resize', function(){ if(pop) _ubicar(); });
})();
