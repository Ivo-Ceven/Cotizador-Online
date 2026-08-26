// ── Arranque de la app. El sistema de notificaciones (showToast/notifyUndo/
//    promptModal/confirmModal) vive en ../shared/notify.js, compartido con el
//    shell. ──

// ── INIT ──
renderQ();
if(typeof cevenRefreshClienteDatalist === 'function') cevenRefreshClienteDatalist();
if(typeof cevenClientesDbRefreshDatalist === 'function') cevenClientesDbRefreshDatalist();

// ── EJECUTIVOS (#exec) ──────────────────────────────────────────────────
// No hay lista fija de vendedores Legamaster: se arma con los nombres que ya
// aparecen en las cotizaciones y en el pipeline (mismo criterio que
// history.js y pipeline-view.js) más el nombre de quien está logueado.
// Sin esto se guardaba `Ejecutivo: '—'` y cevenCanEditQuote('—') daba false: el
// propio autor no podía editar ni borrar su cotización.
function refreshExecOptions(){
  var sel = document.getElementById('exec');
  if(!sel) return;
  var cur = sel.value;
  var seen = {}, list = [];
  function _add(n){
    n = (n||'').trim();
    if(!n || n === '—' || seen[n]) return;
    seen[n] = 1; list.push(n);
  }
  if(typeof cevenMyNombre === 'function') _add(cevenMyNombre());
  if(typeof getDB === 'function')         getDB().forEach(function(r){ _add(r['Ejecutivo']); });
  if(typeof getPipeline === 'function')   getPipeline().forEach(function(r){ _add(r.ejecutivo); });
  list.sort();
  var html = '<option value="">Seleccionar ejecutivo</option>';
  for(var i=0;i<list.length;i++) html += '<option value="'+cevenEsc(list[i])+'">'+cevenEsc(list[i])+'</option>';
  sel.innerHTML = html;
  if(cur && typeof cevenEnsureExecOption === 'function') cevenEnsureExecOption(sel, cur);
  sel.value = cur;
}
refreshExecOptions();
if(typeof cevenApplyVendorAutofill === 'function') cevenApplyVendorAutofill();

// ── DEFAULTS: fecha +15 días y pago 30FF ──
(function(){
  var d = new Date(); d.setDate(d.getDate()+15);
  var yyyy = d.getFullYear(), mm = String(d.getMonth()+1).padStart(2,'0'), dd = String(d.getDate()).padStart(2,'0');
  document.getElementById('eff-date').value = yyyy+'-'+mm+'-'+dd;
  var pm = document.getElementById('pay-mode');
  for(var i=0;i<pm.options.length;i++){
    if(pm.options[i].value === CEVEN_PAY_OTRA) continue;
    if(pm.options[i].text.indexOf('30')!==-1){ pm.selectedIndex=i; break; }
  }
  cevenTogglePayOtra();
})();
