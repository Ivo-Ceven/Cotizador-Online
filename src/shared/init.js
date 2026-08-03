document.getElementById('app-ver-num').textContent = APP_VERSION;

/* El número de la próxima cotización: se recalcula acá, con TODOS los módulos
   cargados. state.js —donde se muestra por primera vez— corre antes que
   quotes-db.js y pipeline-store.js, así que ahí solo se puede leer el contador;
   recién acá existen getDB()/getPipeline()/getArchive() para mirar el mayor
   número que existe de verdad. Ver shared/quote-num.js. */
if(typeof cevenRefrescarQNum === 'function') cevenRefrescarQNum();
// Sincronizar ícono de dark mode con el estado actual
(function(){
  var icon = _darkMode ? '☀️' : '🌙';
  document.querySelectorAll('.dark-btn').forEach(function(b){ b.textContent = icon; });
})();
