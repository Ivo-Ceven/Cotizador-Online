/* Con guarda: este archivo lo carga toda página que muestre versión, y si el
   zócalo no está —o se le puso otro id— la excepción de la PRIMERA línea se
   llevaba puesto todo lo que viene abajo, en silencio salvo por la consola. */
var _verEl = document.getElementById('app-ver-num');
if(_verEl) _verEl.textContent = APP_VERSION;

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
