// ── Arranque de la app (reemplaza el rol de bootstrap que warranties.js
//    cumplía en Apple: acá no hay garantías, pero el render inicial y los
//    defaults de fecha/pago tienen que pasar igual). El sistema de
//    notificaciones (showToast/notifyUndo/promptModal/confirmModal) vive
//    en ../shared/notify.js, compartido con el shell. ──

// ── INIT ──
renderQ();
if(typeof refreshOpgDatalist === 'function') refreshOpgDatalist();
// Autocompletado de Cliente: mismo criterio que el de OPG — reduce el riesgo de
// que un typo cree un cliente "nuevo" que aparece como grupo aparte en el
// pipeline y con su propio nivel de precio. Ver shared/clientes.js.
if(typeof cevenRefreshClienteDatalist === 'function') cevenRefreshClienteDatalist();
if(typeof cevenClientesDbRefreshDatalist === 'function') cevenClientesDbRefreshDatalist();

// ── EJECUTIVOS (#exec) ──────────────────────────────────────────────────
// Dos defectos que se sumaban y dejaban el campo Ejecutivo inservible:
//
//  (a) shared/auth.js se carga en la línea 41 del HTML y su cevenShowApp()
//      llama a cevenApplyVendorAutofill(), pero el <select id="exec"> está
//      recién en la ~78: getElementById('exec') daba null y la función volvía
//      en seco. Este archivo carga al final, con el DOM completo.
//  (b) el <select> traía UNA sola opción ("Seleccionar ejecutivo") y ningún
//      ejecutivo. No hay lista fija de vendedores Poly, así que se arma con los
//      nombres que ya aparecen en las cotizaciones y en el pipeline — el mismo
//      criterio que usan history.js y pipeline-view.js para sus filtros — más
//      el nombre de quien está logueado (si no, con la base vacía no había
//      NADA para elegir).
//
// Con los dos juntos se guardaba `Ejecutivo: '—'`, y después
// cevenCanEditQuote('—') daba false: el propio autor no podía editar ni borrar
// su cotización. Por eso además el guardado ahora exige un ejecutivo elegido.
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
  // Nunca perder lo que ya estaba elegido, aunque ese nombre no esté en la lista
  // (cotización vieja de alguien que ya no figura en ningún lado).
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
  /* Default de arranque. Se busca por texto y se saltea la opcion libre:
     su etiqueta no tiene numeros, pero el dia que los tenga no puede
     quedar seleccionada de entrada con el campo vacio. */
  var pm = document.getElementById('pay-mode');
  for(var i=0;i<pm.options.length;i++){
    if(pm.options[i].value === CEVEN_PAY_OTRA) continue;
    if(pm.options[i].text.indexOf('30')!==-1){ pm.selectedIndex=i; break; }
  }
  cevenTogglePayOtra();
})();
