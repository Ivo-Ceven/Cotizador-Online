
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

function deleteSelected(){
  var keys=Object.keys(histSel);
  if(!keys.length) return;
  var db=getDB();
  var removed=[], newDb=[];
  for(var i=0;i<db.length;i++){
    if(histSel[db[i]['N° Cotización']]) removed.push(db[i]); else newDb.push(db[i]);
  }
  saveDB(newDb);
  histSel={};
  updateHistBtns();
  renderHistory();
  notifyUndo('Eliminaste '+keys.length+' cotización(es).', function(){
    var db2=getDB();
    saveDB(db2.concat(removed));
    renderHistory();
  });
}

function deleteQ(qn){
  var db = getDB();
  var first = db.find(function(r){ return r['N° Cotización'] === qn; });
  if(first && !cevenCanEditQuote(first['Ejecutivo'])){ showToast('No tenés permiso para eliminar esta cotización.'); return; }
  var removed=[], newDb=[];
  for(var i=0;i<db.length;i++){
    if(db[i]['N° Cotización'] === qn) removed.push(db[i]); else newDb.push(db[i]);
  }
  saveDB(newDb);
  delete histSel[qn];
  updateHistBtns();
  renderHistory();
  notifyUndo('Eliminaste la cotización #'+qn+'.', function(){
    var db2=getDB();
    saveDB(db2.concat(removed));
    renderHistory();
  });
}

function clearHF(){ document.getElementById('hclient').value=''; document.getElementById('hexec').value=''; document.getElementById('hfrom').value=''; document.getElementById('hto').value=''; renderHistory(); }

function parseARDate(s){ if(!s)return null; var p=s.split('/'); if(p.length===3)return new Date(p[2],p[1]-1,p[0]); return null; }

function renderHistory(){
  var db=getDB(), wrap=document.getElementById('histwrap');

  // Poblar el filtro de Ejecutivo dinámicamente (no hay lista fija de vendedores Poly)
  var execSel = document.getElementById('hexec');
  if(execSel){
    var curExec = execSel.value;
    var seen = {}, execList = [];
    db.forEach(function(r){ var e=(r['Ejecutivo']||'').trim(); if(e && e!=='—' && !seen[e]){ seen[e]=1; execList.push(e); } });
    execList.sort();
    execSel.innerHTML = '<option value="">Todos</option>' + execList.map(function(e){ return '<option value="'+cevenEsc(e)+'"'+(e===curExec?' selected':'')+'>'+cevenEsc(e)+'</option>'; }).join('');
  }

  var fc=document.getElementById('hclient').value.toLowerCase();
  var fe=document.getElementById('hexec').value;
  var ff=document.getElementById('hfrom').value;
  var ft=document.getElementById('hto').value;
  if(!db.length){ wrap.innerHTML='<div style="text-align:center;padding:36px;color:#aeaeb2"><div style="font-size:26px;margin-bottom:6px">📭</div><p>No hay cotizaciones guardadas.</p></div>'; return; }
  var grouped={};
  for(var i=0;i<db.length;i++){var k=db[i]['N° Cotización']||'—';if(!grouped[k])grouped[k]=[];grouped[k].push(db[i]);}
  var keys=Object.keys(grouped).reverse();
  var html='';
  for(var ki=0;ki<keys.length;ki++){
    var qn=keys[ki], rows=grouped[qn], first=rows[0];
    var searchHay = ((first['Cliente']||'')+' '+(first['OPG']||'')+' '+(first['Sala']||'')).toLowerCase();
    if(fc&&searchHay.indexOf(fc)===-1) continue;
    if(fe&&first['Ejecutivo']!==fe) continue;
    if(ff||ft){ var d=parseARDate(first['Fecha']); if(d){if(ff&&d<new Date(ff))continue;if(ft&&d>new Date(ft+'T23:59:59'))continue;} }
    // Filtrar filas corruptas (sin SKU o descripción válidos)
    rows = rows.filter(function(r){ return r['SKU'] && r['SKU'] !== 'undefined' && r['Descripción'] && r['Descripción'] !== 'undefined'; });
    if(!rows.length) continue;
    var gt=0; for(var ri=0;ri<rows.length;ri++) gt+=parseFloat(rows[ri]['Total'])||0;
    // Todo lo que sigue sale de poly_cquotes, que sync.js baja de Supabase: cada
    // celda va por cevenEsc() y el N° de cotización viaja en un data-qn (nunca
    // interpolado dentro de un onclick).
    var qnA = cevenEsc(qn);
    var trows='';
    for(var ri=0;ri<rows.length;ri++){
      var r=rows[ri];
      trows+='<tr><td>'+cevenEsc(r['SKU'])+'</td><td class="wrap">'+cevenEsc(r['Descripción'])+'</td>'
        +'<td style="text-align:center">'+cevenEsc(r['Cantidad'])+'</td>'
        +'<td style="text-align:center">'+cevenEsc(r['Nota']||'—')+'</td>'
        +'<td style="text-align:right">USD '+fI(parseFloat(r['P. Venta Unitario'])||0)+'</td>'
        +'<td style="text-align:right;font-weight:500">USD '+fI(parseFloat(r['Total'])||0)+'</td></tr>';
    }
    html+='<div class="hist-card" style="background:#fff;border-radius:12px;border:0.5px solid #d2d2d7;margin-bottom:13px;overflow:hidden">'
      +'<div class="hist-card-hdr" style="display:flex;align-items:center;gap:10px;padding:11px 14px;background:#f5f5f7;flex-wrap:wrap">'
        +'<input type="checkbox"'+(histSel[qn]?' checked':'')+' data-act="sel" data-qn="'+qnA+'" style="width:auto;accent-color:#1d1d1f">'
        +'<div style="font-size:15px;font-weight:600;flex:1">Cotización #'+cevenEsc(qn)+'</div>'
        +'<div style="font-size:11px;color:#6e6e73">'+cevenEsc(first['Fecha']||'')+' '+cevenEsc(first['Hora']||'')+'</div>'
        +(cevenCanEditQuote(first['Ejecutivo']) ? '<button class="bs" data-act="edit" data-qn="'+qnA+'" style="color:#0071e3;border-color:#0071e3">✎ Editar</button>' : '')
        +'<button class="bs" data-act="copy" data-qn="'+qnA+'" title="Copiar como cotización nueva y abrirla para editar" style="color:#15863a;border-color:#34c759">⧉ Copiar</button>'
        +(cevenCanEditQuote(first['Ejecutivo']) ? '<button class="bsr" data-act="del" data-qn="'+qnA+'">✕</button>' : '')
      +'</div>'
      +'<div class="hist-card-info" style="display:flex;gap:16px;flex-wrap:wrap;padding:9px 14px;border-bottom:0.5px solid #f0f0f0;font-size:13px">'
        +'<div><span class="lbl">Cliente</span><strong>'+cevenEsc(first['Cliente']||'—')+'</strong></div>'
        +'<div><span class="lbl">OPG</span>'+cevenEsc(first['OPG']||'—')+'</div>'
        +'<div><span class="lbl">Sala</span>'+cevenEsc(first['Sala']||'—')+'</div>'
        +'<div><span class="lbl">Ejecutivo</span>'+cevenEsc(first['Ejecutivo']||'—')+'</div>'
        +'<div style="margin-left:auto;text-align:right"><span class="lbl">Total</span><strong style="font-size:15px">USD '+fI(gt)+'</strong></div>'
      +'</div>'
      +'<div style="overflow-x:auto"><table style="min-width:520px">'
        +'<thead><tr><th>SKU</th><th>Descripción</th><th style="text-align:center">Qty</th><th style="text-align:center">Nota</th><th style="text-align:right">P. Venta Unit.</th><th style="text-align:right">Total</th></tr></thead>'
        +'<tbody>'+trows+'</tbody></table></div>'
    +'</div>';
  }
  wrap.innerHTML = html || '<div style="text-align:center;padding:24px;color:#aeaeb2"><p>Sin resultados con los filtros actuales.</p></div>';
  _histBindDelegation();
}

// El N° de cotización se lee con getAttribute(): vuelve como el mismo string que
// usan las claves de grouped{} / db[i]['N° Cotización'], así que los === siguen
// funcionando y no hay nada que parsear como JS.
function _histBindDelegation(){
  cevenDelegate('histwrap', 'click', function(ev){
    var el = cevenActEl(ev, this);
    if(!el) return;
    var act = el.getAttribute('data-act'), qn = el.getAttribute('data-qn');
    if(act === 'edit')      editQuoteFromHistory(qn);
    else if(act === 'copy') copiarCotizacionHist(qn);
    else if(act === 'del')  deleteQ(qn);
  });
  cevenDelegate('histwrap', 'change', function(ev){
    var el = cevenActEl(ev, this);
    if(!el) return;
    if(el.getAttribute('data-act') === 'sel') toggleHistSel(el.getAttribute('data-qn'), el);
  });
}
