// ============================================================================
//  nav.js · Navegación centralizada (historial del navegador + Escape)
// ----------------------------------------------------------------------------
//  Integra el botón "Atrás" del navegador/celular y la tecla Escape con:
//    · las vistas .pg de cada cotizador (quote, catalog, pipeline, ...)
//    · los modales/overlays (Target, SKU, CevenCare, editar ítem, usuarios...)
//
//  Diseño: UNA sola pila de overlays y UN solo listener de popstate.
//  Cada modal que se abre empuja una entrada al historial; "Atrás"/Escape la
//  saca y cierra el modal de más arriba antes de cambiar de vista. Desde la
//  vista inicial "Atrás" sale de la app (comportamiento natural del navegador).
//
//  El shell (index.html) NO registra vistas: solo usa los overlays. Por eso
//  todo funciona aunque applyView quede en null.
// ============================================================================
(function(){
  var overlays    = [];    // pila de funciones closeXxx de los modales abiertos
  var applyView   = null;  // muestra una vista SIN tocar el historial
  var currentView = null;  // vista actualmente visible

  // ── Flags anti-doble-cierre ────────────────────────────────────────────────
  //  _internalClose : el cierre lo disparó el popstate (Atrás/Escape). La
  //                   función closeXxx NO debe volver a tocar el historial.
  //  _closingViaBack: nosotros llamamos history.back() para consumir la entrada
  //                   del overlay tras un cierre por clic (× o fondo). Ese
  //                   popstate resultante se ignora.
  var _internalClose  = false;
  var _closingViaBack = false;

  // Registra la función que aplica vistas y deja la entrada inicial etiquetada.
  function registerView(applyFn, initialView){
    applyView   = applyFn;
    currentView = initialView;
    try { history.replaceState({ cevenView: initialView }, ''); } catch(e){}
  }

  // Navegación pública entre vistas (lo llama goTo de cada cotizador).
  function goToView(name){
    if(name === currentView){ if(applyView) applyView(name); return; }
    currentView = name;
    if(applyView) applyView(name);
    try { history.pushState({ cevenView: name }, '', '#' + name); } catch(e){}
  }

  // Un modal se abrió: lo apilamos y empujamos una entrada de historial.
  function openOverlay(closeFn){
    overlays.push(closeFn);
    try { history.pushState({ cevenOverlay: overlays.length }, ''); } catch(e){}
  }

  // Lo llaman las closeXxx() al terminar de ocultar el modal.
  function notifyClosed(closeFn){
    if(_internalClose) return;              // cierre por Atrás/Escape: ya sincronizado
    var idx = overlays.lastIndexOf(closeFn);
    if(idx === -1) return;                  // no estaba en la pila (nada que hacer)
    overlays.splice(idx, 1);
    // Cierre por clic (× o fondo): consumimos la entrada de historial del overlay.
    _closingViaBack = true;
    try { history.back(); } catch(e){ _closingViaBack = false; }
  }

  window.addEventListener('popstate', function(e){
    // El history.back() que disparamos nosotros tras un cierre por clic: ignorar.
    if(_closingViaBack){ _closingViaBack = false; return; }

    // Hay un modal abierto → Atrás/Escape cierra el de más arriba.
    if(overlays.length){
      var fn = overlays.pop();
      _internalClose = true;
      try { if(fn) fn(); } finally { _internalClose = false; }
      return;
    }

    // Sin modales → navegación entre vistas.
    var st = e.state;
    if(st && st.cevenView && applyView){
      currentView = st.cevenView;
      applyView(st.cevenView);
    } else if(applyView){
      currentView = 'quote';
      applyView('quote');
    }
  });

  // Escape: si hay un modal abierto, retrocede en el historial → el popstate
  // cierra el overlay de arriba. Si no hay modales, no hacemos nada.
  document.addEventListener('keydown', function(e){
    if(e.key === 'Escape' && overlays.length){
      history.back();
    }
  });

  window.cevenNav = {
    registerView: registerView,
    goToView:     goToView,
    openOverlay:  openOverlay,
    notifyClosed: notifyClosed
  };
})();
