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

/* ── PRECIO / NACIONALIZACIÓN / IVA ──
   Las cuentas están en `pricing-core.js`, sin DOM y sin globales, para que el
   cotizador MULTIMARCA use exactamente las mismas. Acá quedan los envoltorios
   que le pasan el estado de esta pantalla: las tasas NAC editadas, los
   overrides de la cotización activa y la tabla de IVA. */

function calcP(base, nac, mg) { return cevenAppleCalcP(base, nac, mg); }

function getNac(p) { return cevenAppleNac(p, nacRates, quoteNacOverrides); }

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
function getIVA(lob) { return cevenAppleIVA(lob, IVA_MAP); }

// ── MISC ──
// Construye una lista de <option> escapando los valores. Model / Country / LOB
// salen del Excel importado y del price list sincronizado desde la base: son
// datos no confiables y no pueden concatenarse crudos en innerHTML.
function optionsHTML(values, selected) {
  var out = '';
  for(var i=0;i<values.length;i++) {
    var v = cevenEsc(values[i]);
    out += '<option value="'+v+'"'+(values[i]===selected?' selected':'')+'>'+v+'</option>';
  }
  return out;
}

function uniq(arr) {
  var seen = {}, out = ['Todos'];
  for(var i=0;i<arr.length;i++) { if(arr[i] && !seen[arr[i]]) { seen[arr[i]]=1; out.push(arr[i]); } }
  out.sort(function(a,b){ return a==='Todos'?-1:b==='Todos'?1:a.localeCompare(b); });
  return out;
}
