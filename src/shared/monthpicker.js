/* ============================================================================
   MONTH PICKER  ·  elegir el mes de cierre
   ----------------------------------------------------------------------------
   Reemplaza al <select> que generaba generateMesYearOptions(): 61 <option>
   (vacío + 12 meses × 5 años) en un desplegable por cada fila del pipeline.
   Tenía tres problemas, y el tercero era un bug de verdad:

     1. elegir "Mar 2027" era scrollear una lista de 61 renglones iguales;
     2. el rango arrancaba SIEMPRE en el año actual, así que ofrecía cinco años
        para adelante — cuatro de los cuales no se usan nunca — y ninguno atrás;
     3. y por eso mismo, una fila con un mes de cierre viejo (2025 mirando desde
        2026, o cualquier entrada del archivo) no tenía <option> que la
        representara: el select se dibujaba en "— Mes/Año —" y mostraba en
        pantalla que la fila NO tenía fecha, cuando en los datos sí la tenía.

   Acá el disparador es un <button> que muestra el valor formateado ("Nov 2026")
   sin importar de qué año sea, y al tocarlo abre una grilla de 12 meses con el
   año arriba y flechas para moverse. Dos clicks para cualquier fecha.

   Contrato con el resto de la app: el <button> lleva el valor en su propiedad
   `value` —igual que el <select> que reemplaza— y al elegir dispara un evento
   `change` que burbujea. Los listeners delegados que ya existían (`data-pact`,
   `data-dact`, `data-act`) siguen funcionando sin tocarlos.

   El popover va en <body> con position:fixed a propósito: adentro de la tabla
   del pipeline, que tiene overflow-x:auto y columnas sticky, cualquier cosa
   absoluta queda recortada por el contenedor.

   Depende de: safe.js (cevenEsc).
   ============================================================================ */
(function(){
  var MESES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
  var VACIO = '— Mes/Año —';

  /* '2026-11' → 'Nov 2026'. Un valor que no tenga esa forma se muestra tal cual:
     es dato guardado y esconderlo sería peor que mostrarlo raro. */
  function fmt(v){
    if(!v) return '';
    var p = String(v).split('-');
    if(p.length !== 2) return String(v);
    var idx = parseInt(p[1], 10) - 1;
    return (idx >= 0 && idx < 12) ? (MESES[idx] + ' ' + p[0]) : String(v);
  }
  window.cevenMesLabel = fmt;

  function mesKeyDe(d){
    var m = d.getMonth() + 1;
    return d.getFullYear() + '-' + (m < 10 ? '0' + m : m);
  }

  /* ── HTML del campo ───────────────────────────────────────────────────────
     `attrs` es la cadena de atributos que ya usaba cada call site (los data-*
     de la fila); tiene que venir con el espacio inicial. */
  window.cevenMonthField = function(value, attrs, opts){
    opts = opts || {};
    var v = value || '';
    return '<button type="button" class="mpk' + (opts.cls ? ' ' + opts.cls : '') + '"' +
             ' data-mpk="1" aria-haspopup="dialog" aria-expanded="false"' +
             ' value="' + cevenEsc(v) + '"' +
             (opts.title ? ' title="' + cevenEsc(opts.title) + '"' : '') +
             (attrs || '') + '>' +
             '<span class="mpk-lbl' + (v ? '' : ' mpk-empty') + '">' +
               cevenEsc(fmt(v) || VACIO) +
             '</span>' +
             '<span class="mpk-caret" aria-hidden="true">▾</span>' +
           '</button>';
  };

  /* Setter programático: mantiene value y etiqueta juntos. Lo usa setMesCierre()
     de ui-core.js, que antes hacía `select.value = v` y alcanzaba. */
  window.cevenMonthSet = function(el, v){
    if(typeof el === 'string') el = document.getElementById(el);
    if(!el) return;
    el.value = v || '';
    var lbl = el.querySelector('.mpk-lbl');
    if(!lbl) return;
    lbl.textContent = fmt(el.value) || VACIO;
    if(el.value) lbl.classList.remove('mpk-empty');
    else         lbl.classList.add('mpk-empty');
  };

  /* ── Popover ──────────────────────────────────────────────────────────── */
  var pop = null;   // el nodo abierto, o null
  var cur = null;   // el <button> que lo abrió
  var curY = 0;     // año que se está mostrando

  function close(){
    if(!pop) return;
    if(pop.parentNode) pop.parentNode.removeChild(pop);
    if(cur) cur.setAttribute('aria-expanded', 'false');
    pop = null; cur = null;
  }
  window.cevenMonthPickerClose = close;

  function grid(){
    var sel = cur ? (cur.value || '') : '';
    var selY = sel ? sel.split('-')[0] : '';
    var selM = sel ? sel.split('-')[1] : '';
    var hoy  = mesKeyDe(new Date());
    var h = '';
    for(var m = 1; m <= 12; m++){
      var mm  = (m < 10 ? '0' + m : '' + m);
      var val = curY + '-' + mm;
      var cls = 'mpk-m';
      if(String(selY) === String(curY) && selM === mm) cls += ' on';
      else if(val === hoy) cls += ' now';
      h += '<button type="button" class="' + cls + '" data-mpk-v="' + val + '">' + MESES[m-1] + '</button>';
    }
    return h;
  }

  function paint(){
    pop.querySelector('.mpk-year').textContent = curY;
    pop.querySelector('.mpk-grid').innerHTML = grid();
  }

  function place(){
    var r = cur.getBoundingClientRect();
    var w = pop.offsetWidth, h = pop.offsetHeight;
    var left = Math.max(8, Math.min(r.left, window.innerWidth - w - 8));
    var top  = r.bottom + 6;
    if(top + h > window.innerHeight - 8) top = Math.max(8, r.top - h - 6);
    pop.style.left = left + 'px';
    pop.style.top  = top + 'px';
  }

  function open(btn){
    close();
    cur = btn;
    curY = parseInt((btn.value || '').split('-')[0], 10) || (new Date()).getFullYear();

    pop = document.createElement('div');
    pop.className = 'mpk-pop';
    pop.setAttribute('role', 'dialog');
    pop.setAttribute('aria-label', 'Elegir mes y año');
    pop.innerHTML =
      '<div class="mpk-hd">' +
        '<button type="button" class="mpk-nav" data-mpk-y="-1" title="Año anterior">‹</button>' +
        '<b class="mpk-year"></b>' +
        '<button type="button" class="mpk-nav" data-mpk-y="1" title="Año siguiente">›</button>' +
      '</div>' +
      '<div class="mpk-grid"></div>' +
      '<div class="mpk-ft">' +
        '<button type="button" class="mpk-ft-btn" data-mpk-v="">Sin fecha</button>' +
        '<button type="button" class="mpk-ft-btn" data-mpk-v="' + mesKeyDe(new Date()) + '">Este mes</button>' +
      '</div>';
    document.body.appendChild(pop);
    paint();
    place();
    btn.setAttribute('aria-expanded', 'true');

    /* preventScroll: sin eso, enfocar puede disparar un scroll del contenedor y
       el listener de scroll de más abajo cerraría el popover recién abierto. */
    var first = pop.querySelector('.mpk-m.on') || pop.querySelector('.mpk-m');
    if(first){ try{ first.focus({preventScroll:true}); }catch(err){ first.focus(); } }
  }

  function commit(v){
    var el = cur;
    close();
    if(!el) return;
    /* Sin cambio real no se dispara nada: cada `change` termina en un
       savePipeline() y un push a Supabase. */
    if((el.value || '') === (v || '')) return;
    cevenMonthSet(el, v);
    try{ el.dispatchEvent(new Event('change', {bubbles:true})); }catch(e){}
  }

  /* ── Cableado global ──────────────────────────────────────────────────────
     Un solo listener en document: los campos se generan y regeneran con cada
     render del pipeline, así que engancharlos de a uno no serviría. */
  document.addEventListener('click', function(e){
    var t = e.target;
    if(!t || !t.closest) return;

    var dentro = pop && pop.contains(t);
    if(dentro){
      var nav = t.closest('[data-mpk-y]');
      if(nav){ curY += parseInt(nav.getAttribute('data-mpk-y'), 10); paint(); place(); return; }
      var pick = t.closest('[data-mpk-v]');
      if(pick){ commit(pick.getAttribute('data-mpk-v')); }
      return;
    }

    var trig = t.closest('[data-mpk]');
    if(trig){
      e.preventDefault();
      // Segundo click sobre el mismo campo: cierra, no reabre.
      if(cur === trig) close();
      else open(trig);
      return;
    }
    close();
  });

  document.addEventListener('keydown', function(e){
    if(!pop) return;
    if(e.key === 'Escape' || e.key === 'Esc'){
      var el = cur;
      close();
      if(el) el.focus();
    }
  });

  /* El popover está en coordenadas de viewport: si algo scrollea debajo, queda
     flotando lejos del campo. Cerrar es más honesto que perseguirlo. */
  window.addEventListener('scroll', function(){ close(); }, true);
  window.addEventListener('resize', function(){ close(); });
})();
