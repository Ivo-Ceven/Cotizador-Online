document.getElementById('app-ver-num').textContent = APP_VERSION;
// Sincronizar ícono de dark mode con el estado actual
(function(){
  var icon = _darkMode ? '☀️' : '🌙';
  document.querySelectorAll('.dark-btn').forEach(function(b){ b.textContent = icon; });
})();
