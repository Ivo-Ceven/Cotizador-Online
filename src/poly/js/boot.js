// ── Arranque de la app (reemplaza el rol de bootstrap que warranties.js
//    cumplía en Apple: acá no hay garantías, pero el render inicial y los
//    defaults de fecha/pago tienen que pasar igual). ──

function showToast(msg) {
  var t = document.getElementById('ceven-toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'ceven-toast';
    t.style.cssText = 'position:fixed;bottom:28px;left:50%;transform:translateX(-50%);background:#1d1d1f;color:#fff;padding:10px 20px;border-radius:980px;font-size:13px;font-weight:500;z-index:99999;opacity:0;transition:opacity .25s;pointer-events:none;white-space:nowrap';
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.style.opacity = '1';
  clearTimeout(t._tid);
  t._tid = setTimeout(function(){ t.style.opacity = '0'; }, 2800);
}

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
