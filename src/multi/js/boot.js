/* ============================================================
   ARRANQUE  ·  Cotizador multimarca
   ------------------------------------------------------------
   Lo que corre al cargar la pagina, en el orden en que tiene que
   correr. Vive en su propio archivo —y no suelto al final de
   otro— porque es lo primero que se rompe cuando se reordena un
   <script>: si esta escondido adentro de un modulo, encontrarlo
   cuesta.

   Se carga ULTIMO, con todos los modulos ya definidos.
   ============================================================ */
(function(){

  // Defaults de las condiciones comerciales, igual que en las marcas: la
  // propuesta vale 15 dias desde hoy salvo que se cambie a mano.
  var eff = document.getElementById('eff-date');
  if(eff && !eff.value){
    var d = new Date();
    d.setDate(d.getDate() + 15);
    eff.value = d.toISOString().slice(0, 10);
  }

  // El numero del pedido: el proximo libre mirando el historial de verdad, no
  // solo el contador (shared/quote-num.js).
  qNum = cevenNextQNum();
  cevenPintarQNum();

  renderQ();

  /* El catalogo se pinta desde el cache al toque y despues se refresca contra
     Supabase. Va al final para que el primer render de la cotizacion no espere
     a la red. */
  if(typeof initCatalogos === 'function'){
    initCatalogos().then(function(){
      // Los precios de las lineas dependen del catalogo y de la tabla NAC: si
      // el pedido se abrio antes de que llegaran, hay que repintar.
      if(items.length) renderQ();
    });
  }

  if(typeof cevenRefreshClienteDatalist === 'function') cevenRefreshClienteDatalist();

})();
