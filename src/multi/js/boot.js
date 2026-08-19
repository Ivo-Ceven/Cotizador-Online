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

  /* ── EJECUTIVOS (#exec) ────────────────────────────────────────────────────
     El <select> venia con UNA sola opcion ("Seleccionar ejecutivo") y ningun
     ejecutivo: no habia nada que elegir, y como guardar y emitir exigen uno
     (cevenRequireExec), el campo dejaba el pedido trabado.

     Se llena con TODO el equipo que puede cotizar —admin y ventas— desde la RPC
     `ceven_equipo` (shared/equipo.js), y queda SIEMPRE habilitado: en el
     multimarca se arma el pedido de otro y hay que poder ponerle su nombre.

     Va aca y no al cargar auth.js porque ese archivo esta en el <head>, con el
     <select> todavia sin existir: `cevenApplyVendorAutofill()` hacia
     getElementById('exec') → null y volvia en seco. Es el mismo defecto que ya
     habia arreglado Poly en su boot.js.

     Dos pasadas a proposito: la cache pinta al toque (y es lo unico que hay sin
     conexion) y el refresco la corrige despues. Al reves, el campo arranca vacio
     justo cuando lo estas por usar. */
  refrescarEjecutivos();
  cevenEquipoRefrescar().then(function(){ refrescarEjecutivos(); });

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
  if(typeof cevenClientesDbRefreshDatalist === 'function') cevenClientesDbRefreshDatalist();

})();

/* Los ejecutivos del <select>. Fuera de la IIFE porque quotes-db.js la llama al
   abrir un pedido del historial y al empezar uno nuevo.

   A los del equipo se les suman los que ya figuran en pedidos guardados: si
   alguien se dio de baja, sus pedidos siguen existiendo y el <select> tiene que
   poder seguir mostrando su nombre en vez de blanquearlo al abrirlos. */
function refrescarEjecutivos(){
  var previos = [];
  if(typeof getDB === 'function'){
    getDB().forEach(function(r){ previos.push(r['Ejecutivo']); });
  }
  cevenLlenarExec(document.getElementById('exec'), previos);
}
