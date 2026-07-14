
// ── WARRANTIES (CevenCare) ──
function renderWarranties() {
  var section = document.getElementById('warranty-section');
  var fnote = document.getElementById('franchise-note');

  if (!warrantyItems.length) {
    section.style.display = 'none';
    return;
  }
  section.style.display = 'block';

  // Check if any CC plan exists (franchise)
  var hasCC = warrantyItems.some(function(w){ return w.canal === 'CC'; });
  fnote.style.display = hasCC ? 'block' : 'none';

  var sorted = getSortedWarranties(); // [{w, origIdx}, ...]
  var html = '';
  for (var i = 0; i < sorted.length; i++) {
    var w = sorted[i].w;
    var origIdx = sorted[i].origIdx;
    var wPrice = Math.round((w.precio||0)*100)/100;
    var wTotal = wPrice * w.cantidad;
    var canalColor = w.canal === 'CC' ? '#c84e00' : '#0071e3';
    var canalBg   = w.canal === 'CC' ? '#fff0e8' : '#e8f4ff';
    html += '<tr>'
      + '<td style="font-weight:500;font-size:12px">' + w.sku + '</td>'
      + '<td class="wrap">' + w.equipo + '</td>'
      + '<td style="text-align:right"><input class="si" type="number" min="1" value="' + w.cantidad + '" style="width:44px" onchange="upWarrantyQty(' + origIdx + ',this.value)"></td>'
      + '<td style="text-align:center"><span style="background:' + canalBg + ';color:' + canalColor + ';border-radius:20px;padding:2px 8px;font-size:11px;font-weight:700">' + w.canal + '</span></td>'
      + '<td style="text-align:right;white-space:nowrap">'
        + '<div style="display:inline-flex;align-items:center;gap:3px;justify-content:flex-end">'
          + '<span style="font-size:12px;color:#6e6e73;margin-right:2px">USD</span>'
          + '<input class="si no-spin" type="number" min="0.01" step="0.01" value="' + wPrice + '" style="width:72px;text-align:right;font-weight:500" onchange="upWarrantyPriceDirect(' + origIdx + ',this.value)" onblur="upWarrantyPriceDirect(' + origIdx + ',this.value)">'
        + '</div>'
      + '</td>'
      + '<td style="text-align:right;font-weight:500">USD ' + wTotal.toLocaleString('es-AR',{minimumFractionDigits:wTotal%1===0?0:2,maximumFractionDigits:2}) + '</td>'
      + '<td style="text-align:center;color:#6e6e73">21%</td>'
      + '<td style="text-align:center;color:#6e6e73">' + w.años + ' ' + (w.años === 1 ? 'año' : 'años') + '</td>'
      + '<td style="text-align:center"><button class="bsr" onclick="rmWarranty(' + origIdx + ')" title="Eliminar">×</button></td>'
      + '</tr>';
  }
  document.getElementById('wbody').innerHTML = html;
}

function upWarrantyQty(idx, v) {
  warrantyItems[idx].cantidad = Math.max(1, parseInt(v) || 1);
  renderWarranties();
}

function upWarrantyPrice(idx, delta) {
  warrantyItems[idx].precio = Math.max(0.01, Math.round((warrantyItems[idx].precio + delta) * 100) / 100);
  renderWarranties();
}

function upWarrantyPriceDirect(idx, val) {
  var v = parseFloat(val);
  if(isNaN(v) || v < 0.01) return;
  warrantyItems[idx].precio = Math.round(v * 100) / 100;
  renderWarranties();
}

function rmWarranty(idx) {
  warrantyItems.splice(idx, 1);
  renderWarranties();
}

// ── CEVENCARE MODAL ──
function openCevenCare() {
  // Try iframe modal first (works when served from same origin / local folder)
  var modal = document.getElementById('cc-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'cc-modal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9999;display:flex;align-items:flex-end;justify-content:center';
    modal.innerHTML = '<div style="background:#f5f5f7;width:min(820px,100%);height:92vh;border-radius:20px 20px 0 0;overflow:hidden;display:flex;flex-direction:column">'
      + '<div style="display:flex;align-items:center;justify-content:space-between;padding:14px 18px;background:#fff;border-bottom:.5px solid #d2d2d7;flex-shrink:0">'
        + '<div style="font-size:14px;font-weight:600;color:#1d1d1f">🛡 CevenCare — Agregá las garantías y cerrá cuando termines</div>'
        + '<button onclick="closeCevenCare()" style="background:#f2f2f7;border:none;width:28px;height:28px;border-radius:50%;cursor:pointer;font-size:16px;color:#6e6e73;display:flex;align-items:center;justify-content:center">×</button>'
      + '</div>'
      + '<iframe id="cc-iframe" src="cevencare.html" style="flex:1;border:none;width:100%" allowtransparency="true" onerror="iframeError()" onload="iframeLoaded(this)"></iframe>'
      + '</div>';
    modal.onclick = function(e){ if(e.target===modal) closeCevenCare(); };
    document.body.appendChild(modal);
  } else {
    modal.style.display = 'flex';
  }
}

function iframeLoaded(iframe) {
  // Check if iframe loaded correctly (same origin check)
  try {
    var doc = iframe.contentDocument || iframe.contentWindow.document;
    if (!doc || doc.title === '') throw new Error('no content');
  } catch(e) {
    // Cross-origin or file not found - fallback to popup
    document.getElementById('cc-modal').style.display = 'none';
    var popup = window.open('cevencare.html', 'cevencare', 'width=820,height=700,resizable=yes,scrollbars=yes');
    if (!popup) alert('Habilitá popups para abrir CevenCare, o asegurate que ambos archivos estén en la misma carpeta.');
  }
}

function closeCevenCare() {
  var modal = document.getElementById('cc-modal');
  if (modal) modal.style.display = 'none';
}

// Called from CevenCare iframe via postMessage
window.addEventListener('message', function(e) {
  // Solo aceptar mensajes del propio origin (CevenCare es same-origin);
  // 'null' cubre el modo file:// donde origin no existe.
  if (e.origin !== location.origin && e.origin !== 'null') return;
  if (!e.data || e.data.type !== 'cevencare-add-warranty') return;
  var items_to_add = e.data.items;
  if (!Array.isArray(items_to_add) || !items_to_add.length) return;
  items_to_add.forEach(function(w) {
    var key = w.equipo + '|' + w.canal + '|' + w.años + '|' + w.sku;
    var existing = warrantyItems.find(function(x){ return x.key === key; });
    if (existing) {
      existing.cantidad += w.cantidad;
    } else {
      // Al traer del cotizador, redondear SIEMPRE hacia arriba
      w.precio = Math.ceil(w.precio||0);
      warrantyItems.push(Object.assign({}, w, {key: key}));
    }
  });
  renderWarranties();
  // NO cerramos el modal — el usuario puede seguir agregando y cierra cuando quiera
  showToast('✓ Garantía agregada · Usá el botón Volver para volver al cotizador');
});

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
renderWarranties();

// ── DEFAULTS: fecha +15 días y pago 30FF ──
(function(){
  var d = new Date(); d.setDate(d.getDate()+15);
  var yyyy = d.getFullYear(), mm = String(d.getMonth()+1).padStart(2,'0'), dd = String(d.getDate()).padStart(2,'0');
  document.getElementById('eff-date').value = yyyy+'-'+mm+'-'+dd;
  var pm = document.getElementById('pay-mode');
  for(var i=0;i<pm.options.length;i++){ if(pm.options[i].text.indexOf('30')!==-1){ pm.selectedIndex=i; break; } }
})();

// ── MAC WARRANTY AUTO-SUGGEST ──
var MAC_WARRANTIES_3Y = { canal: {"MacBook Neo Sin Touch ID": {"gl_plan": "Ceven NeoCare", "cc_plan": "Ceven NeoCare Complete", "gl": {"sku": "3AGLNeoCa", "precio": 71.74}, "cc": {"sku": "3ACCNeoCa", "precio": 152.32}}, "MacBook Neo Touch ID": {"gl_plan": "Ceven NeoCare", "cc_plan": "Ceven NeoCare Complete", "gl": {"sku": "3AGLNeoCa", "precio": 71.74}, "cc": {"sku": "3ACCNeoCa", "precio": 152.32}}, "MacBook Air (Retina, 13\", 2020)": {"gl_plan": "Ceven StartCare", "cc_plan": "Ceven StartCare Complete", "gl": {"sku": "3AGLStartCa", "precio": 65.14}, "cc": {"sku": "3ACCStartCa", "precio": 158.81}}, "MacBook Air (M1, 2020)": {"gl_plan": "Ceven StartCare", "cc_plan": "Ceven StartCare Complete", "gl": {"sku": "3AGLStartCa", "precio": 65.14}, "cc": {"sku": "3ACCStartCa", "precio": 158.81}}, "Mac mini (2023) with M2 CPU de 8 núcleos, GPU de 10 núcleos": {"gl_plan": "Ceven StartCare", "cc_plan": "Ceven StartCare Complete", "gl": {"sku": "3AGLStartCa", "precio": 65.14}, "cc": {"sku": "3ACCStartCa", "precio": 158.81}}, "Mac mini (2023) with M2 CPU de 8 núcleos, GPU de 10 núcleos Ethernet 10 Gb": {"gl_plan": "Ceven StartCare", "cc_plan": "Ceven StartCare Complete", "gl": {"sku": "3AGLStartCa", "precio": 65.14}, "cc": {"sku": "3ACCStartCa", "precio": 158.81}}, "MacBook Air (M2, 2022)": {"gl_plan": "Ceven StartCare", "cc_plan": "Ceven StartCare Complete", "gl": {"sku": "3AGLStartCa", "precio": 65.14}, "cc": {"sku": "3ACCStartCa", "precio": 158.81}}, "MacBook Air (13-inch, M4, 2025)": {"gl_plan": "Ceven StartCare", "cc_plan": "Ceven StartCare Complete", "gl": {"sku": "3AGLStartCa", "precio": 65.14}, "cc": {"sku": "3ACCStartCa", "precio": 158.81}}, "MacBook Air (13-inch, M3, 2024) CPU de 8 núcleos, GPU de 10 núcleos": {"gl_plan": "Ceven StartCare", "cc_plan": "Ceven StartCare Complete", "gl": {"sku": "3AGLStartCa", "precio": 65.14}, "cc": {"sku": "3ACCStartCa", "precio": 158.81}}, "Macbook Air 13 M4": {"gl_plan": "Ceven StartCare", "cc_plan": "Ceven StartCare Complete", "gl": {"sku": "3AGLStartCa", "precio": 65.14}, "cc": {"sku": "3ACCStartCa", "precio": 158.81}}, "MacBook Air (15-inch, M4, 2025)": {"gl_plan": "Ceven StartCare", "cc_plan": "Ceven StartCare Complete", "gl": {"sku": "3AGLStartCa", "precio": 65.14}, "cc": {"sku": "3ACCStartCa", "precio": 158.81}}, "MacBook Air (15-inch, M3, 2024)": {"gl_plan": "Ceven StartCare", "cc_plan": "Ceven StartCare Complete", "gl": {"sku": "3AGLStartCa", "precio": 65.14}, "cc": {"sku": "3ACCStartCa", "precio": 158.81}}, "MacBook Air (15-inch, M2, 2023)": {"gl_plan": "Ceven StartCare", "cc_plan": "Ceven StartCare Complete", "gl": {"sku": "3AGLStartCa", "precio": 65.14}, "cc": {"sku": "3ACCStartCa", "precio": 158.81}}, "iMac (24-inch, 2023, Two ports)": {"gl_plan": "Ceven StartCare", "cc_plan": "Ceven StartCare Complete", "gl": {"sku": "3AGLStartCa", "precio": 65.14}, "cc": {"sku": "3ACCStartCa", "precio": 158.81}}, "iMac (24-inch, 2024, Two ports)": {"gl_plan": "Ceven StartCare", "cc_plan": "Ceven StartCare Complete", "gl": {"sku": "3AGLStartCa", "precio": 65.14}, "cc": {"sku": "3ACCStartCa", "precio": 158.81}}, "iMac (24-inch, 2024, Four ports)": {"gl_plan": "Ceven StartCare", "cc_plan": "Ceven StartCare Complete", "gl": {"sku": "3AGLStartCa", "precio": 65.14}, "cc": {"sku": "3ACCStartCa", "precio": 158.81}}, "MacBook Pro (13-inch, M2, 2022)": {"gl_plan": "Ceven ProfessionalCare", "cc_plan": "Ceven ProfessionalCare Complete", "gl": {"sku": "3AGLProCa", "precio": 76.42}, "cc": {"sku": "3ACCProCa", "precio": 188.89}}, "MacBook Pro (13\", 2020, Four Thunderbolt 3 ports)": {"gl_plan": "Ceven ProfessionalCare", "cc_plan": "Ceven ProfessionalCare Complete", "gl": {"sku": "3AGLProCa", "precio": 76.42}, "cc": {"sku": "3ACCProCa", "precio": 188.89}}, "MacBook Pro (13\", 2020, Two Thunderbolt 3 ports)": {"gl_plan": "Ceven ProfessionalCare", "cc_plan": "Ceven ProfessionalCare Complete", "gl": {"sku": "3AGLProCa", "precio": 76.42}, "cc": {"sku": "3ACCProCa", "precio": 188.89}}, "MacBook Pro (13-inch, M1, 2020)": {"gl_plan": "Ceven ProfessionalCare", "cc_plan": "Ceven ProfessionalCare Complete", "gl": {"sku": "3AGLProCa", "precio": 76.42}, "cc": {"sku": "3ACCProCa", "precio": 188.89}}, "MacBook Pro (14-inch, M4, 2024)": {"gl_plan": "Ceven ProfessionalCare", "cc_plan": "Ceven ProfessionalCare Complete", "gl": {"sku": "3AGLProCa", "precio": 76.42}, "cc": {"sku": "3ACCProCa", "precio": 188.89}}, "MacBook Pro (14-inch, M3, Nov 2023)": {"gl_plan": "Ceven ProfessionalCare", "cc_plan": "Ceven ProfessionalCare Complete", "gl": {"sku": "3AGLProCa", "precio": 76.42}, "cc": {"sku": "3ACCProCa", "precio": 188.89}}, "MacBook Pro (14-inch, 2023)": {"gl_plan": "Ceven ProfessionalCare", "cc_plan": "Ceven ProfessionalCare Complete", "gl": {"sku": "3AGLProCa", "precio": 76.42}, "cc": {"sku": "3ACCProCa", "precio": 188.89}}, "MacBook Pro (14-inch, 2023) Chip M2 Max": {"gl_plan": "Ceven ProfessionalCare", "cc_plan": "Ceven ProfessionalCare Complete", "gl": {"sku": "3AGLProCa", "precio": 76.42}, "cc": {"sku": "3ACCProCa", "precio": 188.89}}, "MacBook Pro (14-inch, M3 Pro, Nov 2023)": {"gl_plan": "Ceven ProfessionalCare", "cc_plan": "Ceven ProfessionalCare Complete", "gl": {"sku": "3AGLProCa", "precio": 76.42}, "cc": {"sku": "3ACCProCa", "precio": 188.89}}, "MacBook Pro (14-inch, M3 Max, Nov 2023)": {"gl_plan": "Ceven ProfessionalCare", "cc_plan": "Ceven ProfessionalCare Complete", "gl": {"sku": "3AGLProCa", "precio": 76.42}, "cc": {"sku": "3ACCProCa", "precio": 188.89}}, "MacBook Pro (14-inch, 2021)": {"gl_plan": "Ceven ProfessionalCare", "cc_plan": "Ceven ProfessionalCare Complete", "gl": {"sku": "3AGLProCa", "precio": 76.42}, "cc": {"sku": "3ACCProCa", "precio": 188.89}}, "MacBook Pro (14-inch, M4 Pro or M4 Max, 2024)": {"gl_plan": "Ceven ProfessionalCare", "cc_plan": "Ceven ProfessionalCare Complete", "gl": {"sku": "3AGLProCa", "precio": 76.42}, "cc": {"sku": "3ACCProCa", "precio": 188.89}}, "MacBook Pro (16-inch, 2021)": {"gl_plan": "Ceven MaxCare", "cc_plan": "Ceven MaxCare Complete", "gl": {"sku": "3AGLCMaxCa", "precio": 105.86}, "cc": {"sku": "3ACCMaxCa", "precio": 264.43}}, "MacBook Pro (16-inch, Nov 2023) Chip M3 Pro": {"gl_plan": "Ceven MaxCare", "cc_plan": "Ceven MaxCare Complete", "gl": {"sku": "3AGLCMaxCa", "precio": 105.86}, "cc": {"sku": "3ACCMaxCa", "precio": 264.43}}, "MacBook Pro (16-inch, Nov 2023) Chip M3 Max": {"gl_plan": "Ceven MaxCare", "cc_plan": "Ceven MaxCare Complete", "gl": {"sku": "3AGLCMaxCa", "precio": 105.86}, "cc": {"sku": "3ACCMaxCa", "precio": 264.43}}, "MacBook Pro (16-inch, 2023) Chip M2 Pro": {"gl_plan": "Ceven MaxCare", "cc_plan": "Ceven MaxCare Complete", "gl": {"sku": "3AGLCMaxCa", "precio": 105.86}, "cc": {"sku": "3ACCMaxCa", "precio": 264.43}}, "MacBook Pro (16-inch, 2023) Chip M2 Max": {"gl_plan": "Ceven MaxCare", "cc_plan": "Ceven MaxCare Complete", "gl": {"sku": "3AGLCMaxCa", "precio": 105.86}, "cc": {"sku": "3ACCMaxCa", "precio": 264.43}}, "MacBook Pro (16-inch, M4, 2024)": {"gl_plan": "Ceven MaxCare", "cc_plan": "Ceven MaxCare Complete", "gl": {"sku": "3AGLCMaxCa", "precio": 105.86}, "cc": {"sku": "3ACCMaxCa", "precio": 264.43}}, "MacBook Pro (16-inch, 2024)": {"gl_plan": "Ceven MaxCare", "cc_plan": "Ceven MaxCare Complete", "gl": {"sku": "3AGLCMaxCa", "precio": 105.86}, "cc": {"sku": "3ACCMaxCa", "precio": 264.43}}, "Mac Studio (2022) Chip M1 Max de Apple": {"gl_plan": "Ceven MaxCare", "cc_plan": "Ceven MaxCare Complete", "gl": {"sku": "3AGLCMaxCa", "precio": 105.86}, "cc": {"sku": "3ACCMaxCa", "precio": 264.43}}}, cf: {"MacBook Neo Sin Touch ID": {"gl_plan": "Ceven NeoCare", "cc_plan": "Ceven NeoCare Complete", "gl": {"sku": "3AGLNeoCa", "precio": 82.5}, "cc": {"sku": "3ACCNeoCa", "precio": 175.17}}, "MacBook Neo Touch ID": {"gl_plan": "Ceven NeoCare", "cc_plan": "Ceven NeoCare Complete", "gl": {"sku": "3AGLNeoCa", "precio": 82.5}, "cc": {"sku": "3ACCNeoCa", "precio": 175.17}}, "MacBook Air (Retina, 13\", 2020)": {"gl_plan": "Ceven StartCare", "cc_plan": "Ceven StartCare Complete", "gl": {"sku": "3AGLStartCa", "precio": 74.91}, "cc": {"sku": "3ACCStartCa", "precio": 182.63}}, "MacBook Air (M1, 2020)": {"gl_plan": "Ceven StartCare", "cc_plan": "Ceven StartCare Complete", "gl": {"sku": "3AGLStartCa", "precio": 74.91}, "cc": {"sku": "3ACCStartCa", "precio": 182.63}}, "Mac mini (2023) with M2 CPU de 8 núcleos, GPU de 10 núcleos": {"gl_plan": "Ceven StartCare", "cc_plan": "Ceven StartCare Complete", "gl": {"sku": "3AGLStartCa", "precio": 74.91}, "cc": {"sku": "3ACCStartCa", "precio": 182.63}}, "Mac mini (2023) with M2 CPU de 8 núcleos, GPU de 10 núcleos Ethernet 10 Gb": {"gl_plan": "Ceven StartCare", "cc_plan": "Ceven StartCare Complete", "gl": {"sku": "3AGLStartCa", "precio": 74.91}, "cc": {"sku": "3ACCStartCa", "precio": 182.63}}, "MacBook Air (M2, 2022)": {"gl_plan": "Ceven StartCare", "cc_plan": "Ceven StartCare Complete", "gl": {"sku": "3AGLStartCa", "precio": 74.91}, "cc": {"sku": "3ACCStartCa", "precio": 182.63}}, "MacBook Air (13-inch, M4, 2025)": {"gl_plan": "Ceven StartCare", "cc_plan": "Ceven StartCare Complete", "gl": {"sku": "3AGLStartCa", "precio": 74.91}, "cc": {"sku": "3ACCStartCa", "precio": 182.63}}, "MacBook Air (13-inch, M3, 2024) CPU de 8 núcleos, GPU de 10 núcleos": {"gl_plan": "Ceven StartCare", "cc_plan": "Ceven StartCare Complete", "gl": {"sku": "3AGLStartCa", "precio": 74.91}, "cc": {"sku": "3ACCStartCa", "precio": 182.63}}, "Macbook Air 13 M4": {"gl_plan": "Ceven StartCare", "cc_plan": "Ceven StartCare Complete", "gl": {"sku": "3AGLStartCa", "precio": 74.91}, "cc": {"sku": "3ACCStartCa", "precio": 182.63}}, "MacBook Air (15-inch, M4, 2025)": {"gl_plan": "Ceven StartCare", "cc_plan": "Ceven StartCare Complete", "gl": {"sku": "3AGLStartCa", "precio": 74.91}, "cc": {"sku": "3ACCStartCa", "precio": 182.63}}, "MacBook Air (15-inch, M3, 2024)": {"gl_plan": "Ceven StartCare", "cc_plan": "Ceven StartCare Complete", "gl": {"sku": "3AGLStartCa", "precio": 74.91}, "cc": {"sku": "3ACCStartCa", "precio": 182.63}}, "MacBook Air (15-inch, M2, 2023)": {"gl_plan": "Ceven StartCare", "cc_plan": "Ceven StartCare Complete", "gl": {"sku": "3AGLStartCa", "precio": 74.91}, "cc": {"sku": "3ACCStartCa", "precio": 182.63}}, "iMac (24-inch, 2023, Two ports)": {"gl_plan": "Ceven StartCare", "cc_plan": "Ceven StartCare Complete", "gl": {"sku": "3AGLStartCa", "precio": 74.91}, "cc": {"sku": "3ACCStartCa", "precio": 182.63}}, "iMac (24-inch, 2024, Two ports)": {"gl_plan": "Ceven StartCare", "cc_plan": "Ceven StartCare Complete", "gl": {"sku": "3AGLStartCa", "precio": 74.91}, "cc": {"sku": "3ACCStartCa", "precio": 182.63}}, "iMac (24-inch, 2024, Four ports)": {"gl_plan": "Ceven StartCare", "cc_plan": "Ceven StartCare Complete", "gl": {"sku": "3AGLStartCa", "precio": 74.91}, "cc": {"sku": "3ACCStartCa", "precio": 182.63}}, "MacBook Pro (13-inch, M2, 2022)": {"gl_plan": "Ceven ProfessionalCare", "cc_plan": "Ceven ProfessionalCare Complete", "gl": {"sku": "3AGLProCa", "precio": 87.88}, "cc": {"sku": "3ACCProCa", "precio": 217.22}}, "MacBook Pro (13\", 2020, Four Thunderbolt 3 ports)": {"gl_plan": "Ceven ProfessionalCare", "cc_plan": "Ceven ProfessionalCare Complete", "gl": {"sku": "3AGLProCa", "precio": 87.88}, "cc": {"sku": "3ACCProCa", "precio": 217.22}}, "MacBook Pro (13\", 2020, Two Thunderbolt 3 ports)": {"gl_plan": "Ceven ProfessionalCare", "cc_plan": "Ceven ProfessionalCare Complete", "gl": {"sku": "3AGLProCa", "precio": 87.88}, "cc": {"sku": "3ACCProCa", "precio": 217.22}}, "MacBook Pro (13-inch, M1, 2020)": {"gl_plan": "Ceven ProfessionalCare", "cc_plan": "Ceven ProfessionalCare Complete", "gl": {"sku": "3AGLProCa", "precio": 87.88}, "cc": {"sku": "3ACCProCa", "precio": 217.22}}, "MacBook Pro (14-inch, M4, 2024)": {"gl_plan": "Ceven ProfessionalCare", "cc_plan": "Ceven ProfessionalCare Complete", "gl": {"sku": "3AGLProCa", "precio": 87.88}, "cc": {"sku": "3ACCProCa", "precio": 217.22}}, "MacBook Pro (14-inch, M3, Nov 2023)": {"gl_plan": "Ceven ProfessionalCare", "cc_plan": "Ceven ProfessionalCare Complete", "gl": {"sku": "3AGLProCa", "precio": 87.88}, "cc": {"sku": "3ACCProCa", "precio": 217.22}}, "MacBook Pro (14-inch, 2023)": {"gl_plan": "Ceven ProfessionalCare", "cc_plan": "Ceven ProfessionalCare Complete", "gl": {"sku": "3AGLProCa", "precio": 87.88}, "cc": {"sku": "3ACCProCa", "precio": 217.22}}, "MacBook Pro (14-inch, 2023) Chip M2 Max": {"gl_plan": "Ceven ProfessionalCare", "cc_plan": "Ceven ProfessionalCare Complete", "gl": {"sku": "3AGLProCa", "precio": 87.88}, "cc": {"sku": "3ACCProCa", "precio": 217.22}}, "MacBook Pro (14-inch, M3 Pro, Nov 2023)": {"gl_plan": "Ceven ProfessionalCare", "cc_plan": "Ceven ProfessionalCare Complete", "gl": {"sku": "3AGLProCa", "precio": 87.88}, "cc": {"sku": "3ACCProCa", "precio": 217.22}}, "MacBook Pro (14-inch, M3 Max, Nov 2023)": {"gl_plan": "Ceven ProfessionalCare", "cc_plan": "Ceven ProfessionalCare Complete", "gl": {"sku": "3AGLProCa", "precio": 87.88}, "cc": {"sku": "3ACCProCa", "precio": 217.22}}, "MacBook Pro (14-inch, 2021)": {"gl_plan": "Ceven ProfessionalCare", "cc_plan": "Ceven ProfessionalCare Complete", "gl": {"sku": "3AGLProCa", "precio": 87.88}, "cc": {"sku": "3ACCProCa", "precio": 217.22}}, "MacBook Pro (14-inch, M4 Pro or M4 Max, 2024)": {"gl_plan": "Ceven ProfessionalCare", "cc_plan": "Ceven ProfessionalCare Complete", "gl": {"sku": "3AGLProCa", "precio": 87.88}, "cc": {"sku": "3ACCProCa", "precio": 217.22}}, "MacBook Pro (16-inch, 2021)": {"gl_plan": "Ceven MaxCare", "cc_plan": "Ceven MaxCare Complete", "gl": {"sku": "3AGLCMaxCa", "precio": 121.74}, "cc": {"sku": "3ACCMaxCa", "precio": 304.1}}, "MacBook Pro (16-inch, Nov 2023) Chip M3 Pro": {"gl_plan": "Ceven MaxCare", "cc_plan": "Ceven MaxCare Complete", "gl": {"sku": "3AGLCMaxCa", "precio": 121.74}, "cc": {"sku": "3ACCMaxCa", "precio": 304.1}}, "MacBook Pro (16-inch, Nov 2023) Chip M3 Max": {"gl_plan": "Ceven MaxCare", "cc_plan": "Ceven MaxCare Complete", "gl": {"sku": "3AGLCMaxCa", "precio": 121.74}, "cc": {"sku": "3ACCMaxCa", "precio": 304.1}}, "MacBook Pro (16-inch, 2023) Chip M2 Pro": {"gl_plan": "Ceven MaxCare", "cc_plan": "Ceven MaxCare Complete", "gl": {"sku": "3AGLCMaxCa", "precio": 121.74}, "cc": {"sku": "3ACCMaxCa", "precio": 304.1}}, "MacBook Pro (16-inch, 2023) Chip M2 Max": {"gl_plan": "Ceven MaxCare", "cc_plan": "Ceven MaxCare Complete", "gl": {"sku": "3AGLCMaxCa", "precio": 121.74}, "cc": {"sku": "3ACCMaxCa", "precio": 304.1}}, "MacBook Pro (16-inch, M4, 2024)": {"gl_plan": "Ceven MaxCare", "cc_plan": "Ceven MaxCare Complete", "gl": {"sku": "3AGLCMaxCa", "precio": 121.74}, "cc": {"sku": "3ACCMaxCa", "precio": 304.1}}, "MacBook Pro (16-inch, 2024)": {"gl_plan": "Ceven MaxCare", "cc_plan": "Ceven MaxCare Complete", "gl": {"sku": "3AGLCMaxCa", "precio": 121.74}, "cc": {"sku": "3ACCMaxCa", "precio": 304.1}}, "Mac Studio (2022) Chip M1 Max de Apple": {"gl_plan": "Ceven MaxCare", "cc_plan": "Ceven MaxCare Complete", "gl": {"sku": "3AGLCMaxCa", "precio": 121.74}, "cc": {"sku": "3ACCMaxCa", "precio": 304.1}}} };

// Buscar la mejor garantía Mac que coincida con la descripción del producto
function findBestMacWarranty(description, mode) {
  if (!description) return null;
  var d = description.toLowerCase();
  // Solo Macs (excluir iPad/iPhone)
  if (d.includes('ipad') || d.includes('iphone')) return null;
  var isMacLike = d.includes('mac') || d.includes('imac') || /\bmbp(ro)?\b/.test(d) || /\bmba(ir)?\b/.test(d);
  if (!isMacLike) return null;

  var pool = MAC_WARRANTIES_3Y[mode === 'cf' ? 'cf' : 'canal'];
  var keys = Object.keys(pool);

  // Determinar familia (Pro 14/16, Air 13/15, mini, iMac, Studio, Neo)
  function getFamily(s) {
    s = s.toLowerCase();
    if (s.includes('macbook neo')) return 'neo';
    if (s.includes('mac studio')) return 'studio';
    if (s.includes('mac mini')) return 'mini';
    if (s.includes('imac')) return 'imac';
    // MBP/MBA aliases
    var isMBP = s.includes('macbook pro') || /\bmbp(ro)?\b/.test(s);
    var isMBA = s.includes('macbook air') || /\bmba(ir)?\b/.test(s);
    // Detectar tamaño SOLO buscando patrones de pulgadas reales:
    //   "14in", "14-inch", "14\"", "14\u201d", "14 pulg", "14"
    //   (no matchea "16C", "16G", "16GB", "16gb", etc.)
    function findSize(str){
      // Patrón: número seguido de in/inch/"/pulg, o número aislado entre espacios al inicio
      var m = str.match(/\b(\d{2})(?:\s*(?:in\b|-?\s*inch\b|"|\u201d|pulg))/i);
      if(m) return m[1];
      // Fallback: si la cadena ARRANCA con "14IN" / "16in" sin separador
      m = str.match(/^(\d{2})(?:in|-inch)/i);
      if(m) return m[1];
      return null;
    }
    var size = findSize(s);
    if (isMBP) {
      if (size === '16') return 'mbp16';
      if (size === '14') return 'mbp14';
      if (size === '13') return 'mbp13';
      // Sin pulgada detectada: heredar por defecto MBP14
      return 'mbp14';
    }
    if (isMBA) {
      if (size === '15') return 'mba15';
      if (size === '13') return 'mba13';
      return 'mba13';
    }
    return null;
  }

  var targetFamily = getFamily(description);
  if (!targetFamily) return null;

  // Filtrar candidatos por familia
  var candidates = keys.filter(function(k){ return getFamily(k) === targetFamily; });
  if (!candidates.length) return null;

  // Detectar chip M (M1, M2, M3, M4, M5, etc.) en la descripción
  var chipMatch = d.match(/\bm(\d+)\b/);
  var targetChip = chipMatch ? parseInt(chipMatch[1]) : null;

  // Score: el que tenga el chip más cercano (o sin chip = neutral)
  function score(key) {
    var k = key.toLowerCase();
    var s = 0;
    var kChipMatch = k.match(/\bm(\d+)\b/);
    var kChip = kChipMatch ? parseInt(kChipMatch[1]) : null;
    if (targetChip !== null && kChip !== null) {
      // Más cercano = más alto. Mismo chip = +100, +1 difference = +50, +2 = +25, etc.
      var diff = Math.abs(kChip - targetChip);
      if (diff === 0) s += 100;
      else if (diff === 1) s += 50;
      else if (diff === 2) s += 25;
      else s += Math.max(0, 10 - diff * 2);
      // Preferir chip <= target (versiones anteriores) si no hay match exacto
      if (kChip <= targetChip) s += 5;
    }
    // Pro/Max/etc. matching
    if (d.includes('pro') && k.includes('pro')) s += 10;
    if (d.includes('max') && k.includes('max')) s += 10;
    if (d.includes('ultra') && k.includes('ultra')) s += 10;
    return s;
  }

  candidates.sort(function(a,b){ return score(b) - score(a); });

  // Caso especial MacBook Neo: distinguir Touch ID vs Sin Touch ID
  if (targetFamily === 'neo') {
    var hasTouchId = /touch\s*id/i.test(d) && !/sin\s+touch\s*id/i.test(d);
    var noTouchId  = /sin\s+touch\s*id/i.test(d) || (!hasTouchId && /\bnotid\b/i.test(d));
    if (hasTouchId || noTouchId) {
      var preferred = candidates.filter(function(k){
        var kl = k.toLowerCase();
        var kHas = /touch\s*id/.test(kl) && !/sin\s+touch\s*id/.test(kl);
        var kNo  = /sin\s+touch\s*id/.test(kl);
        return hasTouchId ? kHas : kNo;
      });
      if (preferred.length) candidates = preferred;
    }
  }

  var bestKey = candidates[0];
  return {
    equipoKey: bestKey,
    data: pool[bestKey]
  };
}

// Modo de cliente seleccionado para esta sesión de cotización
var _currentClientMode = null; // null | 'cf' | 'canal'

// Disparado cuando se agrega un producto: detecta Mac y agrega garantías automáticamente
function suggestMacWarranty(item) {
  var d = (item.description || '').toLowerCase();
  if (d.includes('ipad') || d.includes('iphone')) return;
  var isMacLike = d.includes('mac') || d.includes('imac') || /\bmbp(ro)?\b/.test(d) || /\bmba(ir)?\b/.test(d);
  if (!isMacLike) return;

  // Si ya está agregada la garantía para este equipo, no repetir
  var alreadyHas = warrantyItems.some(function(w){
    return w._fromProduct === (item.sku + '|' + item.description);
  });
  if (alreadyHas) return;

  // Si ya tenemos modo elegido, agregar directo
  if (_currentClientMode) {
    addMacWarrantiesFor(item, _currentClientMode);
    return;
  }

  // Pendiente: encolar y mostrar UN solo diálogo si no hay otro abierto
  window._pendingMacItems = window._pendingMacItems || [];
  window._pendingMacItems.push(item);
  if (document.getElementById('mac-warranty-dialog')) return; // ya hay diálogo
  showClientModeDialog();
}

function showClientModeDialog() {
  var dlg = document.createElement('div');
  dlg.id = 'mac-warranty-dialog';
  dlg.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:100000;display:flex;align-items:center;justify-content:center;padding:20px';
  dlg.innerHTML = ''
    + '<div style="background:#fff;border-radius:16px;padding:22px;width:min(380px,100%);box-shadow:0 20px 50px rgba(0,0,0,.25)">'
    + '<div style="font-size:15px;font-weight:600;color:#1d1d1f;margin-bottom:6px">🛡 Garantías Mac</div>'
    + '<div style="font-size:12px;color:#6e6e73;margin-bottom:14px;line-height:1.45">Detecté equipos Mac en tu cotización. ¿Es para Cliente Final o Canal? Agregaré automáticamente las garantías de 3 años (GL y CC).</div>'
    + '<div style="display:flex;flex-direction:column;gap:8px">'
      + '<button id="macw-cf"     style="padding:11px 14px;border:1px solid #0071e3;background:#0071e3;color:#fff;border-radius:10px;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit">Cliente Final</button>'
      + '<button id="macw-canal"  style="padding:11px 14px;border:1px solid #1d1d1f;background:#fff;color:#1d1d1f;border-radius:10px;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit">Canal (Revendedor)</button>'
      + '<button id="macw-skip"   style="padding:9px 14px;border:none;background:transparent;color:#6e6e73;border-radius:10px;font-size:12px;cursor:pointer;font-family:inherit;margin-top:4px">No agregar garantías</button>'
    + '</div>'
    + '</div>';
  document.body.appendChild(dlg);

  function close() { dlg.remove(); }

  function pick(mode) {
    _currentClientMode = mode;
    close();
    var pending = window._pendingMacItems || [];
    window._pendingMacItems = [];
    pending.forEach(function(it){ addMacWarrantiesFor(it, mode); });
    if (mode) {
      showToast('🛡 Garantías Mac agregadas como ' + (mode==='cf'?'Cliente Final':'Canal'));
    }
  }

  document.getElementById('macw-cf').onclick    = function(){ pick('cf'); };
  document.getElementById('macw-canal').onclick = function(){ pick('canal'); };
  document.getElementById('macw-skip').onclick  = function(){
    _currentClientMode = 'skip';
    window._pendingMacItems = [];
    close();
  };
  dlg.onclick = function(e){ if(e.target===dlg){ /* no cerrar al click fuera */ } };
}

function addMacWarrantiesFor(item, mode) {
  if (mode === 'skip') return;
  var match = findBestMacWarranty(item.description, mode);
  if (!match) return;

  var equipo = match.equipoKey;
  var w = match.data;
  if (!w) return;
  var fromMarker = item.sku + '|' + item.description;
  var qty = item.qty || 1;
  var added = false;

  // Agregar GL 3 años (precio del cotizador → redondeo hacia arriba)
  if (w.gl && w.gl.sku) {
    warrantyItems.push({
      equipo: equipo, sku: w.gl.sku, canal: 'GL', años: 3,
      precio: Math.ceil(w.gl.precio||0), cantidad: qty, tipo: mode,
      gl_plan: w.gl_plan, key: equipo + '|GL|3|' + w.gl.sku, _fromProduct: fromMarker
    });
    added = true;
  }
  // Agregar CC 3 años (precio del cotizador → redondeo hacia arriba)
  if (w.cc && w.cc.sku) {
    warrantyItems.push({
      equipo: equipo, sku: w.cc.sku, canal: 'CC', años: 3,
      precio: Math.ceil(w.cc.precio||0), cantidad: qty, tipo: mode,
      cc_plan: w.cc_plan, key: equipo + '|CC|3|' + w.cc.sku, _fromProduct: fromMarker
    });
    added = true;
  }
  if (added) renderWarranties();
}

// Reset modo cuando se inicia nueva cotización (se hookea desde nuevaCotizacion)
function resetClientMode() {
  _currentClientMode = null;
  window._pendingMacItems = [];
}

