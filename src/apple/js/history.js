
// ── HISTORY ──
function updateHistBtns(){
  var cnt=Object.keys(histSel).length;
  document.getElementById('hist-del-btn').style.display=cnt>0?'inline-block':'none';
  document.getElementById('hist-pdf-btn').style.display=cnt>0?'inline-block':'none';
}

function toggleHistSel(qn,cb){
  if(cb.checked) histSel[qn]=true; else delete histSel[qn];
  updateHistBtns();
}

/* Eliminar NO tira las filas: pasan a la papelera y se pueden restaurar por
   CEVEN_PAPELERA_DIAS días (shared/papelera.js). El "Deshacer" del cartel sigue
   estando para el error inmediato — no se pregunta antes, se hace y se avisa.

   La papelera se escribe ANTES de tocar `cquotes`, y si falla no se borra nada
   — el porqué está en el encabezado de shared/papelera.js. */
function deleteSelected(){
  var keys=Object.keys(histSel);
  if(!keys.length) return;
  var db=getDB();
  var removed=[], newDb=[], porQn={};
  for(var i=0;i<db.length;i++){
    var qn = db[i]['N° Cotización'];
    if(histSel[qn]){
      removed.push(db[i]);
      (porQn[qn] = porQn[qn] || []).push(db[i]);
    } else newDb.push(db[i]);
  }
  if(!removed.length) return;

  var grupos = Object.keys(porQn).map(function(q){ return {qn: q, filas: porQn[q]}; });
  if(!cevenPapeleraTirarVarias(grupos)) return;   // no entró en la papelera: no se borra

  saveDB(newDb);
  histSel={};
  updateHistBtns();
  renderHistory();
  notifyUndo('Eliminaste '+keys.length+' cotización(es) — están en la papelera.', function(){
    var db2=getDB();
    saveDB(db2.concat(removed));
    cevenPapeleraSacar(Object.keys(porQn));
    renderHistory();
  });
}

function deleteQ(qn){
  var db = getDB();
  var first = db.find(function(r){ return r['N° Cotización'] === qn; });
  if(first && !cevenCanEditQuote(first['Ejecutivo'])){ showToast('No tenés permiso para eliminar esta cotización.'); return; }
  var removed = [], newDb = [];
  for(var i=0;i<db.length;i++){
    if(db[i]['N° Cotización'] === qn) removed.push(db[i]); else newDb.push(db[i]);
  }
  if(!removed.length) return;
  if(!cevenPapeleraTirar(qn, removed)) return;    // no entró en la papelera: no se borra

  saveDB(newDb);
  delete histSel[qn];
  updateHistBtns();
  renderHistory();
  notifyUndo('Eliminaste la cotización #'+qn+' — está en la papelera.', function(){
    var db2=getDB();
    saveDB(db2.concat(removed));
    cevenPapeleraSacar([qn]);
    renderHistory();
  });
}

function clearHF(){ document.getElementById('hclient').value=''; document.getElementById('hexec').value=''; document.getElementById('hfrom').value=''; document.getElementById('hto').value=''; renderHistory(); }

function parseARDate(s){ if(!s)return null; var p=s.split('/'); if(p.length===3)return new Date(p[2],p[1]-1,p[0]); return null; }

// Los <input type="date"> devuelven "YYYY-MM-DD" y new Date() lo interpreta como
// UTC medianoche, mientras que parseARDate() construye una fecha LOCAL. Al
// compararlas, en Argentina (UTC-3) las cotizaciones del primer día del rango
// quedaban afuera y las del último se colaban. Este parser también es local.
function parseISODateLocal(s){
  if(!s) return null;
  var p = String(s).split('-');
  if(p.length !== 3) return null;
  var y = parseInt(p[0],10), m = parseInt(p[1],10), d = parseInt(p[2],10);
  if(isNaN(y) || isNaN(m) || isNaN(d)) return null;
  return new Date(y, m-1, d);
}

function renderHistory(){
  var db=getDB(), wrap=document.getElementById('histwrap');
  // Va ANTES del corte por historial vacío: la papelera puede tener cosas
  // justamente cuando el historial no tiene ninguna.
  if(typeof renderPapelera === 'function') renderPapelera();
  var fc=document.getElementById('hclient').value.toLowerCase();
  var fe=document.getElementById('hexec').value;
  var ff=document.getElementById('hfrom').value;
  var ft=document.getElementById('hto').value;
  if(!db.length){ wrap.innerHTML='<div style="text-align:center;padding:36px;color:#aeaeb2"><div style="font-size:26px;margin-bottom:6px">📭</div><p>No hay cotizaciones guardadas.</p></div>'; return; }
  var grouped={};
  for(var i=0;i<db.length;i++){var k=db[i]['N° Cotización']||'—';if(!grouped[k])grouped[k]=[];grouped[k].push(db[i]);}
  // Object.keys() devuelve primero las claves con forma de índice entero (en orden
  // numérico) y después el resto en orden de inserción. '0001'..'0999' llevan cero
  // a la izquierda y no son canónicas, pero '1000' sí: a partir de la cotización
  // #1000 las nuevas saltaban al principio y .reverse() las mandaba al final.
  // Se ordena explícitamente por número, descendente.
  var keys=Object.keys(grouped).sort(function(a,b){
    var na=parseInt(a,10), nb=parseInt(b,10);
    var va=isNaN(na), vb=isNaN(nb);
    if(va && vb) return String(b).localeCompare(String(a));
    if(va) return 1;   // claves no numéricas ('—') al final
    if(vb) return -1;
    return nb-na;
  });
  var dFrom = parseISODateLocal(ff);
  var dTo   = parseISODateLocal(ft);
  if(dTo) dTo.setHours(23,59,59,999);
  var html='';
  for(var ki=0;ki<keys.length;ki++){
    var qn=keys[ki], rows=grouped[qn], first=rows[0];
    if(fc&&(first['Cliente']||'').toLowerCase().indexOf(fc)===-1) continue;
    if(fe&&first['Ejecutivo']!==fe) continue;
    if(dFrom||dTo){ var d=parseARDate(first['Fecha']); if(d){ if(dFrom&&d<dFrom)continue; if(dTo&&d>dTo)continue; } }
    // Filtrar filas corruptas (sin SKU o descripción válidos)
    rows = rows.filter(function(r){ return r['SKU'] && r['SKU'] !== 'undefined' && r['Descripción'] && r['Descripción'] !== 'undefined'; });
    if(!rows.length) continue;
    /* Opciones A/B: el TOTAL de la tarjeta es el de la opción VIGENTE, que es la
       única que se va a facturar. Las líneas de la otra se listan igual —para
       eso está el historial— pero abajo, con su propio rótulo. */
    var opcEf   = cevenOpcEfectivaDeFilas(rows);
    var hayOpcB = cevenOpcHayBEnFilas(rows);
    // El total sumaba TODAS las filas, garantías incluidas, mientras que la grilla
    // y el PDF suman sólo productos: la misma cotización figuraba con dos importes
    // distintos. Ahora se muestran separados y, si hay garantías, también la suma.
    var gtProd=0, gtWarr=0;
    for(var ri=0;ri<rows.length;ri++){
      if(cevenOpcDe(rows[ri]) !== opcEf) continue;
      var amount = parseFloat(rows[ri]['Total'])||0;
      if(rows[ri]['Tipo']==='garantia') gtWarr += amount; else gtProd += amount;
    }
    // Con dos opciones, primero las de la vigente: es lo que se cotizó de verdad.
    if(hayOpcB){
      rows = rows.slice().sort(function(a,b){
        var oa = cevenOpcDe(a) === opcEf ? 0 : 1, obb = cevenOpcDe(b) === opcEf ? 0 : 1;
        return oa - obb;
      });
    }
    var trows='', wrows='', hasWarranty=false, opcPintada=null;
    for(var ri=0;ri<rows.length;ri++){
      var r=rows[ri];
      // Rótulo de opción cada vez que cambia el bloque (solo si hay dos).
      if(hayOpcB && cevenOpcDe(r) !== opcPintada && r['Tipo']!=='garantia'){
        opcPintada = cevenOpcDe(r);
        trows += '<tr><td colspan="7" style="background:#f0f0f3;font-size:10px;font-weight:700;'
          +'text-transform:uppercase;letter-spacing:.6px;color:#3a3a3c;padding:5px 10px">'
          +'Opción '+cevenOpcLetra(opcPintada)
          +(opcPintada===opcEf ? ' · vigente' : ' · alternativa (no suma al pipeline)')+'</td></tr>';
      }
      // SKU, Descripción y demás campos vienen de cquotes, que se sincroniza con
      // todo el equipo: se escapan antes de interpolarlos.
      if(r['Tipo']==='garantia'){
        var wd=null; try{wd=JSON.parse(r['_wdata']);}catch(e){}
        var wc=wd?wd.canal:'GL', wa=wd?wd.años:3;
        var wcBg=wc==='CC'?'#fff0e8':'#e8f4ff', wcFg=wc==='CC'?'#c84e00':'#0071e3';
        wrows+='<tr><td>'+cevenEsc(r['SKU'])+'</td><td class="wrap">'+cevenEsc(r['Descripción'])+'</td>'
          +'<td style="text-align:center">'+cevenEsc(r['Cantidad'])+'</td>'
          +'<td style="text-align:right">USD '+fI(parseFloat(r['P. Venta Unitario'])||0)+'</td>'
          +'<td style="text-align:right;font-weight:500">USD '+fI(parseFloat(r['Total'])||0)+'</td>'
          +'<td style="text-align:center;color:#6e6e73">21%</td>'
          +'<td style="text-align:center"><span style="background:'+wcBg+';color:'+wcFg+';border-radius:20px;padding:2px 6px;font-size:11px;font-weight:700">'+cevenEsc(wc)+'</span> · '+cevenEsc(wa)+' '+(wa===1?'año':'años')+'</td>'
          +'</tr>';
        hasWarranty=true;
      } else {
        trows+='<tr><td>'+cevenEsc(r['SKU'])+'</td><td class="wrap">'+cevenEsc(r['Descripción'])+'</td>'
          +'<td style="text-align:center">'+cevenEsc(r['Cantidad'])+'</td>'
          +'<td style="text-align:center">'+cevenEsc(r['Disponibilidad']||'—')+'</td>'
          +'<td style="text-align:right">'+(r['Margen %']!=null&&r['Margen %']!=='—'?cevenEsc(r['Margen %'])+'%':'—')+'</td>'
          +'<td style="text-align:right">USD '+fI(parseFloat(r['P. Venta Unitario'])||0)+'</td>'
          +'<td style="text-align:right;font-weight:500">USD '+fI(parseFloat(r['Total'])||0)+'</td></tr>';
      }
    }
    var qnA = ' data-hqn="'+cevenEsc(qn)+'"';
    var totalBox = '<div style="margin-left:auto;text-align:right">'
      +'<span class="lbl">Total productos'+(hayOpcB?' · Opción '+cevenOpcLetra(opcEf):'')+'</span>'
      +'<strong style="font-size:15px">USD '+fI(gtProd)+'</strong>'
      +(hasWarranty
        ? '<div style="font-size:11px;color:#c84e00;margin-top:2px">+ Garantías USD '+fI(gtWarr)+'</div>'
          +'<div style="font-size:11px;color:#6e6e73">Total con garantías USD '+fI(gtProd+gtWarr)+'</div>'
        : '')
    +'</div>';
    // Las cotizaciones propias van en celeste (ver .hist-mia en base.css): el
    // historial es del equipo entero y encontrar las tuyas era leer la columna
    // Ejecutivo tarjeta por tarjeta.
    var mia = (typeof cevenOwnsExecutive === 'function' && cevenOwnsExecutive(first['Ejecutivo'])) ? ' hist-mia' : '';
    html+='<div class="hist-card'+mia+'" style="background:#fff;border-radius:12px;border:0.5px solid #d2d2d7;margin-bottom:13px;overflow:hidden">'
      +'<div class="hist-card-hdr" style="display:flex;align-items:center;gap:10px;padding:11px 14px;background:#f5f5f7;flex-wrap:wrap">'
        +'<input type="checkbox"'+(histSel[qn]?' checked':'')+' data-hact="sel"'+qnA+' style="width:auto;accent-color:#1d1d1f">'
        +'<div style="font-size:15px;font-weight:600;flex:1">Cotización #'+cevenEsc(qn)
          +(hayOpcB ? ' <span class="opc-chip" style="font-size:10px">2 opciones · vigente '+cevenOpcLetra(opcEf)+'</span>' : '')
        +'</div>'
        +'<div style="font-size:11px;color:#6e6e73">'+cevenEsc(first['Fecha']||'')+' '+cevenEsc(first['Hora']||'')+'</div>'
        +'<button class="bs" data-hact="comp"'+qnA+' title="Descargar el comprobante de esta cotización en PDF y abrirlo" style="color:#1f3864;border-color:#1f3864">🧾 Comprobante</button>'
        +(cevenCanEditQuote(first['Ejecutivo']) ? '<button class="bs" data-hact="edit"'+qnA+' style="color:#0071e3;border-color:#0071e3">✎ Editar</button>' : '')
        +'<button class="bs" data-hact="copy"'+qnA+' title="Copiar como cotización nueva y abrirla para editar" style="color:#15863a;border-color:#34c759">⧉ Copiar</button>'
        +(cevenCanEditQuote(first['Ejecutivo']) ? '<button class="bsr" data-hact="del"'+qnA+'>✕</button>' : '')
      +'</div>'
      +'<div class="hist-card-info" style="display:flex;gap:16px;flex-wrap:wrap;padding:9px 14px;border-bottom:0.5px solid #f0f0f0;font-size:13px">'
        +'<div><span class="lbl">Cliente</span><strong>'+cevenEsc(first['Cliente']||'—')+'</strong></div>'
        +'<div><span class="lbl">Ejecutivo</span>'+cevenEsc(first['Ejecutivo']||'—')+'</div>'
        +'<div><span class="lbl">Observaciones</span>'+cevenEsc(first['Observaciones']||'—')+'</div>'
        +totalBox
      +'</div>'
      +'<div style="overflow-x:auto"><table style="min-width:560px">'
        +'<thead><tr><th>SKU</th><th>Descripción</th><th style="text-align:center">Qty</th><th style="text-align:center">Disponib.</th><th style="text-align:right">Margen</th><th style="text-align:right">P. Venta Unit.</th><th style="text-align:right">Total</th></tr></thead>'
        +'<tbody>'+trows+'</tbody></table></div>'
      +(hasWarranty?'<div class="hist-warr-hdr" style="padding:8px 14px 4px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;color:#c84e00;background:#fff8f3;border-top:0.5px solid #f0e0d6">🛡 Garantías Extendidas (opcionales) · subtotal USD '+fI(gtWarr)+'</div>'
        +'<div style="overflow-x:auto"><table style="min-width:560px">'
          +'<thead><tr><th>SKU</th><th>Descripción</th><th style="text-align:center">Qty</th><th style="text-align:right">P. Venta</th><th style="text-align:right">Total</th><th style="text-align:center">IVA</th><th style="text-align:center">Canal / Años</th></tr></thead>'
          +'<tbody>'+wrows+'</tbody></table></div>':'')
    +'</div>';
  }
  wrap.innerHTML = html || '<div style="text-align:center;padding:24px;color:#aeaeb2"><p>Sin resultados con los filtros actuales.</p></div>';
}

// Delegación de eventos del historial: el N° de cotización viaja en data-hqn en
// vez de ir concatenado dentro de un onclick.
(function(){
  var wrap = document.getElementById('histwrap');
  if(!wrap) return;
  function pick(e){
    var el = e.target.closest ? e.target.closest('[data-hact]') : null;
    return (el && wrap.contains(el)) ? el : null;
  }
  wrap.addEventListener('change', function(e){
    var el = pick(e); if(!el) return;
    if(el.getAttribute('data-hact') === 'sel') toggleHistSel(el.getAttribute('data-hqn'), el);
  });
  wrap.addEventListener('click', function(e){
    var el = pick(e); if(!el) return;
    var qn = el.getAttribute('data-hqn');
    switch(el.getAttribute('data-hact')){
      case 'edit': e.stopPropagation(); editQuoteFromHistory(qn); break;
      case 'copy': e.stopPropagation(); copiarCotizacionHist(qn); break;
      case 'comp': e.stopPropagation(); cevenImprimirComprobante(qn); break;
      case 'del':  e.stopPropagation(); deleteQ(qn); break;
    }
  });
})();
