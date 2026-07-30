/* ============================================================
   PRICING  ·  Apple (exclusivo de esta marca)
   ------------------------------------------------------------
   Lo que quedó de apple/js/utils.js después de mandar lo genérico
   a shared/ui-core.js: margen, nacionalización e IVA.

   Poly NO tiene equivalente — no maneja nacionalización ni
   márgenes por ítem — así que esto no va a shared/.

   Depende de: brand.js (cevenK), safe.js (cevenLsSet),
   shared/ui-core.js, state.js (items, nacRates, NAC_DEF,
   quoteNacOverrides, IVA_MAP).
   Se carga DESPUÉS de shared/ui-core.js.
   ============================================================ */

// ── MARGEN ──
function getM() {
  // Leer del input de número (admite 0.25) — si no existe, fallback al slider
  var input = document.getElementById('msl-input');
  if(input && input.value !== ''){
    var v = parseFloat(input.value);
    if(!isNaN(v)) return Math.min(80, Math.max(0, Math.round(v*100)/100));
  }
  var sl = document.getElementById('msl');
  return (sl ? parseInt(sl.value) : 0) || 0;
}

function syncMarginFromInput(){
  var input = document.getElementById('msl-input');
  var v = parseFloat(input.value);
  if(isNaN(v)) return;
  v = Math.min(80, Math.max(0, v));
  // Redondear a 0.25 más cercano
  v = Math.round(v * 4) / 4;
  document.getElementById('msl').value = v;
  // Recalcular precios en la cotización (los items con margen estándar)
  recalcMarginsFromGlobal();
}

function syncMarginFromSlider(){
  var v = parseFloat(document.getElementById('msl').value);
  document.getElementById('msl-input').value = v;
  recalcMarginsFromGlobal();
}

function recalcMarginsFromGlobal(){
  // Sólo afecta a items que NO fueron editados manualmente
  var mg = getM();
  for(var i=0;i<items.length;i++){
    if(!items[i].manualMargin){
      items[i].itemMargin = mg;
      items[i].salePrice = calcP(items[i].sellingBase, items[i].itemNac, mg);
    }
  }
  if(document.getElementById('p-quote') && document.getElementById('p-quote').classList.contains('on')) renderQ();
  if(document.getElementById('p-catalog') && document.getElementById('p-catalog').classList.contains('on')) renderCat();
}

// ── PRECIO ──
function calcP(base, nac, mg) { if(mg >= 100) mg = 99; return Math.round(base*(1+nac/100)/(1-mg/100)); }

// ── NACIONALIZACIÓN ──
function getNac(p) {
  // Buscar primero en LOB, luego en modelCol como fallback, y también en description
  var sources = [(p.lob||''), (p.modelCol||''), (p.description||'')];
  for(var s=0;s<sources.length;s++){
    var src = sources[s];
    if(!src) continue;
    // Override por cotización gana primero
    if(quoteNacOverrides[src] !== undefined) return quoteNacOverrides[src];
    if(nacRates[src] !== undefined) return nacRates[src];
    var lo = src.toLowerCase();
    // Buscar override más específico
    var keysO = Object.keys(quoteNacOverrides);
    var bestO = null, bestOLen = 0;
    for(var k=0;k<keysO.length;k++){
      var kol = keysO[k].toLowerCase();
      if(lo.indexOf(kol) !== -1 && kol.length > bestOLen){ bestO = keysO[k]; bestOLen = kol.length; }
    }
    if(bestO !== null) return quoteNacOverrides[bestO];
    // Si no hay override, ir al global
    var keys = Object.keys(nacRates);
    var bestKey = null, bestLen = 0;
    for(var i=0;i<keys.length;i++) {
      var kl = keys[i].toLowerCase();
      if(lo.indexOf(kl) !== -1 && kl.length > bestLen) {
        bestKey = keys[i];
        bestLen = kl.length;
      }
    }
    if(bestKey !== null) return nacRates[bestKey];
  }
  return 20;
}

// Guarda las tasas de nacionalización. Devuelve true/false: si el navegador
// rechaza la escritura (cuota llena) NO snapshotea, para no propagar un estado
// que en realidad no se guardó.
function saveNac() {
  var ok = cevenLsSet(cevenK('cnac'), JSON.stringify(nacRates));
  if(ok && typeof autoSnapshot === 'function') autoSnapshot();
  return ok;
}
function resetNac() { nacRates = JSON.parse(JSON.stringify(NAC_DEF)); saveNac(); renderNac(); }

// ── IVA ──
function getIVA(lob) {
  if(IVA_MAP[lob] !== undefined) return IVA_MAP[lob];
  var l = (lob||'').toLowerCase();
  var keys = Object.keys(IVA_MAP);
  var bestKey = null, bestLen = 0;
  for(var i=0;i<keys.length;i++) {
    var kl = keys[i].toLowerCase();
    if(l.indexOf(kl) !== -1 && kl.length > bestLen) {
      bestKey = keys[i];
      bestLen = kl.length;
    }
  }
  return bestKey !== null ? IVA_MAP[bestKey] : '';
}

// ── MISC ──
function uniq(arr) {
  var seen = {}, out = ['Todos'];
  for(var i=0;i<arr.length;i++) { if(arr[i] && !seen[arr[i]]) { seen[arr[i]]=1; out.push(arr[i]); } }
  out.sort(function(a,b){ return a==='Todos'?-1:b==='Todos'?1:a.localeCompare(b); });
  return out;
}
