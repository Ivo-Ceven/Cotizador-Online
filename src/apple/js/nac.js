// ── NAC ──
// Las claves de nacRates ('cnac') vienen sincronizadas desde la base: se escapan
// igual que cualquier otro dato remoto antes de interpolarlas en HTML.
function renderNac(){
  var keys=Object.keys(nacRates), html='';
  for(var i=0;i<keys.length;i++){
    var m=keys[i], mE=cevenEsc(m);
    html+='<tr><td style="padding:9px 12px">'+mE+'</td>'
      +'<td style="padding:9px 12px;text-align:right"><input type="number" min="0" max="100" value="'+cevenEsc(nacRates[m])+'" data-model="'+mE+'" onchange="nacRates[this.dataset.model]=parseFloat(this.value)||0;saveNac()" style="width:56px;text-align:right;padding:3px 6px;border:0.5px solid #d2d2d7;border-radius:6px;font-size:13px;font-family:inherit;background:#fff"></td></tr>';
  }
  document.getElementById('nacbody').innerHTML=html;
}

// ── NAC POR COTIZACIÓN (override solo en esta cotización) ──
function openQuoteNac(){
  goTo('qnac');
}

function renderQuoteNac(){
  // Mostrar solo LOBs reales de los items de la cotización + cualquier override existente
  var itemLobs = {};
  for(var ii=0; ii<items.length; ii++){
    var lob = items[ii].lob || items[ii].modelCol || '';
    if(lob) itemLobs[lob] = true;
  }
  Object.keys(quoteNacOverrides).forEach(function(k){ itemLobs[k] = true; });
  var keys = Object.keys(itemLobs).sort();

  var html = '';
  if(!keys.length){
    html = '<tr><td colspan="3" style="text-align:center;color:#aeaeb2;padding:24px">Agregá productos a la cotización para ver sus modelos acá.</td></tr>';
  } else {
    for(var i=0;i<keys.length;i++){
      var m = keys[i];
      // % global aplicado a ese LOB (usando matching del preset)
      var globalApplied = getNacFromPresetOnly({lob:m, modelCol:m, description:m});
      var overrideVal = quoteNacOverrides[m] !== undefined ? quoteNacOverrides[m] : '';
      var hasOverride = overrideVal !== '';
      html += '<tr'+(hasOverride?' style="background:#fff8f3"':'')+'>'
        +'<td style="padding:9px 12px">'+cevenEsc(m)+(hasOverride?' <span style="background:#fff0e8;color:#c84e00;font-size:10px;font-weight:700;padding:1px 6px;border-radius:8px;margin-left:4px">override</span>':'')+'</td>'
        +'<td style="padding:9px 12px;text-align:right;color:#6e6e73;font-size:13px">'+cevenEsc(globalApplied)+'%</td>'
        +'<td style="padding:9px 12px;text-align:right">'
          +'<input type="number" min="0" max="100" step="0.5" value="'+cevenEsc(overrideVal)+'" data-model="'+cevenEsc(m)+'" placeholder="—" onchange="setQuoteNacOverride(this.dataset.model,this.value)" style="width:64px;text-align:right;padding:3px 6px;border:0.5px solid #d2d2d7;border-radius:6px;font-size:13px;font-family:inherit;background:#fff">'
        +'</td>'
      +'</tr>';
    }
  }
  document.getElementById('qnacbody').innerHTML = html;
}

// Igual que getNac pero ignorando overrides — para mostrar el "% Global" puro
function getNacFromPresetOnly(p) {
  var sources = [(p.lob||''), (p.modelCol||''), (p.description||'')];
  for(var s=0;s<sources.length;s++){
    var src = sources[s];
    if(!src) continue;
    if(nacRates[src] !== undefined) return nacRates[src];
    var lo = src.toLowerCase();
    var keys = Object.keys(nacRates);
    var bestKey = null, bestLen = 0;
    for(var i=0;i<keys.length;i++) {
      var kl = keys[i].toLowerCase();
      if(lo.indexOf(kl) !== -1 && kl.length > bestLen) {
        bestKey = keys[i]; bestLen = kl.length;
      }
    }
    if(bestKey !== null) return nacRates[bestKey];
  }
  return 20;
}

function setQuoteNacOverride(model, v){
  var s = (v||'').toString().trim();
  if(s === ''){
    delete quoteNacOverrides[model];
  } else {
    var n = parseFloat(s);
    if(isNaN(n) || n < 0) { delete quoteNacOverrides[model]; }
    else quoteNacOverrides[model] = Math.min(100, n);
  }
}

function clearQuoteNac(){
  if(!Object.keys(quoteNacOverrides).length){ showToast('No hay overrides para limpiar.'); return; }
  // Se limpia y se avisa con "Deshacer": los overrides quedan en el snapshot, no
  // en un confirm() que hay que contestar antes de ver el efecto.
  var previos = quoteNacOverrides;
  quoteNacOverrides = {};
  renderQuoteNac();
  notifyUndo('Quitaste los overrides de % Nacionalización de esta cotización — vuelve a usarse el preset global.', function(){
    quoteNacOverrides = previos;
    renderQuoteNac();
  });
}

function applyQuoteNac(){
  // Al cambiar el % NAC: el precio de venta se MANTIENE,
  // y el margen se recalcula automáticamente con el nuevo costo nacionalizado.
  for(var i=0;i<items.length;i++){
    var it = items[i];
    // Re-evaluar el % nac según LOB usando los overrides nuevos
    it.itemNac = getNac({lob:it.lob||'', modelCol:it.lob||'', description:it.description||''});
    // Mantener precio, recalcular margen exacto (2 decimales)
    if(it.salePrice > 0 && it.sellingBase > 0){
      it.itemMargin = calcMargenFromPrice(it.sellingBase, it.itemNac, it.salePrice);
    }
  }
  goTo('quote');
  showToast('✓ Nacionalización actualizada — márgenes recalculados');
}

// Diagnóstico: muestra qué clave NAC matchea cada producto del price list
function getNacMatchKey(p){
  var sources = [(p.lob||''), (p.modelCol||''), (p.description||'')];
  for(var s=0;s<sources.length;s++){
    var src = sources[s];
    if(!src) continue;
    if(nacRates[src] !== undefined) return src;
    var lo = src.toLowerCase();
    var keys = Object.keys(nacRates);
    var bestKey = null, bestLen = 0;
    for(var i=0;i<keys.length;i++) {
      var kl = keys[i].toLowerCase();
      if(lo.indexOf(kl) !== -1 && kl.length > bestLen) {
        bestKey = keys[i]; bestLen = kl.length;
      }
    }
    if(bestKey !== null) return bestKey;
  }
  return null; // sin match → default 20%
}

function renderNacDiag(){
  var diag = document.getElementById('nac-diag');
  diag.style.display = 'block';
  if(!products.length){
    document.getElementById('diag-body').innerHTML = '<tr><td colspan="5" style="text-align:center;color:#aeaeb2;padding:20px">Cargá un price list primero</td></tr>';
    return;
  }
  var q = (document.getElementById('diag-search').value||'').toLowerCase().trim();
  var rows = products.filter(function(p){
    if(!q) return true;
    return ((p.sku||'')+' '+(p.lob||'')+' '+(p.modelCol||'')+' '+(p.description||'')).toLowerCase().indexOf(q) !== -1;
  });
  // Agrupar por LOB+Model para no listar miles de filas
  var seen = {}, html = '';
  for(var i=0;i<rows.length && i<200;i++){
    var p = rows[i];
    var key = (p.lob||'')+'|'+(p.modelCol||'');
    if(seen[key] && !q) continue;
    seen[key] = true;
    var matchKey = getNacMatchKey(p);
    var nac = matchKey !== null ? nacRates[matchKey] : 20;
    // matchKey sale del price list: se escapa. El "⚠ default" es markup propio.
    var matchDisplay = matchKey !== null ? cevenEsc(matchKey) : '<span style="color:#d70015">⚠ default</span>';
    var rowStyle = matchKey === null ? ' style="background:#fff8e1"' : '';
    html += '<tr'+rowStyle+'>'
      +'<td style="font-size:11px;font-family:monospace">'+cevenEsc(p.sku||'—')+'</td>'
      +'<td>'+cevenEsc(p.lob||'—')+'</td>'
      +'<td>'+cevenEsc(p.modelCol||'—')+'</td>'
      +'<td style="text-align:center;font-size:11px;color:#0071e3">'+matchDisplay+'</td>'
      +'<td style="text-align:right;font-weight:500">'+cevenEsc(nac)+'%</td>'
      +'</tr>';
  }
  document.getElementById('diag-body').innerHTML = html || '<tr><td colspan="5" style="text-align:center;color:#aeaeb2;padding:20px">Sin resultados</td></tr>';
}

