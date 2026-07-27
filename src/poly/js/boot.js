// ── Arranque de la app (reemplaza el rol de bootstrap que warranties.js
//    cumplía en Apple: acá no hay garantías, pero el render inicial y los
//    defaults de fecha/pago tienen que pasar igual). El sistema de
//    notificaciones (showToast/notifyUndo/promptModal/confirmModal) vive
//    en ../shared/notify.js, compartido con el shell. ──

// ── INIT ──
renderQ();
if(typeof refreshOpgDatalist === 'function') refreshOpgDatalist();

// ── DEFAULTS: fecha +15 días y pago 30FF ──
(function(){
  var d = new Date(); d.setDate(d.getDate()+15);
  var yyyy = d.getFullYear(), mm = String(d.getMonth()+1).padStart(2,'0'), dd = String(d.getDate()).padStart(2,'0');
  document.getElementById('eff-date').value = yyyy+'-'+mm+'-'+dd;
  var pm = document.getElementById('pay-mode');
  for(var i=0;i<pm.options.length;i++){ if(pm.options[i].text.indexOf('30')!==-1){ pm.selectedIndex=i; break; } }
})();
