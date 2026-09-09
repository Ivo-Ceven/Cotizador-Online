
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
   CEVEN_PAPELERA_DIAS días (shared/papelera.js). */
function deleteSelected(){
  var keys=Object.keys(histSel);
  if(!keys.length) return;

  // Las que están en el pipeline no se borran (dejarían una fila huérfana): se
  // avisan y el resto sí se borra. Las bloqueadas quedan seleccionadas.
  var bloq = (typeof cevenQuotesEnPipeline === 'function') ? cevenQuotesEnPipeline(keys) : [];
  var borrarSet = {};
  keys.forEach(function(qn){ borrarSet[qn] = 1; });
  bloq.forEach(function(b){ delete borrarSet[b.qn]; });
  if(bloq.length === keys.length){
    showToast('⚠ No se puede: ' + (bloq.length === 1 ? 'esa cotización está' : 'esas ' + bloq.length + ' cotizaciones están') + ' en el pipeline. Quitalas de ahí primero.');
    return;
  }
  if(bloq.length) showToast('⚠ ' + bloq.length + ' de las seleccionadas no se borraron: están en el pipeline.');

  var db=getDB();
  var removed=[], newDb=[], porQn={};
  for(var i=0;i<db.length;i++){
    var qn = db[i]['N° Cotización'];
    if(borrarSet[qn]){
      removed.push(db[i]);
      (porQn[qn] = porQn[qn] || []).push(db[i]);
    } else newDb.push(db[i]);
  }
  if(!removed.length) return;

  var grupos = Object.keys(porQn).map(function(qn){ return {qn: qn, filas: porQn[qn]}; });
  if(!cevenPapeleraTirarVarias(grupos)) return;

  saveDB(newDb);
  histSel={};
  bloq.forEach(function(b){ histSel[b.qn] = true; });   // las bloqueadas siguen marcadas
  updateHistBtns();
  renderHistory();
  notifyUndo('Eliminaste '+Object.keys(porQn).length+' cotización(es) — están en la papelera.', function(){
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
  // No se borra del historial si dejaría una fila huérfana en el pipeline.
  var enPipe = (typeof cevenQuoteEnPipeline === 'function') && cevenQuoteEnPipeline(qn);
  if(enPipe){ showToast(_cevenBloqueoBorradoMsg(qn, enPipe)); return; }
  var removed=[], newDb=[];
  for(var i=0;i<db.length;i++){
    if(db[i]['N° Cotización'] === qn) removed.push(db[i]); else newDb.push(db[i]);
  }
  if(!removed.length) return;
  if(!cevenPapeleraTirar(qn, removed)) return;

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
  if(typeof renderPapelera === 'function') renderPapelera();

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
  var keys=Object.keys(grouped).sort(function(a,b){
    var na=parseInt(a,10), nb=parseInt(b,10);
    var va=isNaN(na), vb=isNaN(nb);
    if(va && vb) return String(b).localeCompare(String(a));
    if(va) return 1;
    if(vb) return -1;
    return nb-na;
  });
  var dFrom = parseISODateLocal(ff);
  var dTo   = parseISODateLocal(ft);
  if(dTo) dTo.setHours(23,59,59,999);
  var html='';
  for(var ki=0;ki<keys.length;ki++){
    var qn=keys[ki], rows=grouped[qn], first=rows[0];
    var searchHay = ((first['Cliente']||'')+' '+(first['Proyecto']||'')).toLowerCase();
    if(fc&&searchHay.indexOf(fc)===-1) continue;
    if(fe&&first['Ejecutivo']!==fe) continue;
    if(dFrom||dTo){ var d=parseARDate(first['Fecha']); if(d){ if(dFrom&&d<dFrom)continue; if(dTo&&d>dTo)continue; } }
    rows = rows.filter(function(r){ return r['SKU'] && r['SKU'] !== 'undefined' && r['Descripción'] && r['Descripción'] !== 'undefined'; });
    if(!rows.length) continue;
    var opcEf   = cevenOpcEfectivaDeFilas(rows);
    var hayOpcB = cevenOpcHayBEnFilas(rows);
    var gt=0;
    for(var ri=0;ri<rows.length;ri++){
      if(cevenOpcDe(rows[ri]) !== opcEf) continue;
      gt += parseFloat(rows[ri]['Total'])||0;
    }
    if(hayOpcB){
      rows = rows.slice().sort(function(a,b){
        return (cevenOpcDe(a) === opcEf ? 0 : 1) - (cevenOpcDe(b) === opcEf ? 0 : 1);
      });
    }
    var qnA = cevenEsc(qn);
    var trows='', opcPintada=null;
    for(var ri=0;ri<rows.length;ri++){
      var r=rows[ri];
      if(hayOpcB && cevenOpcDe(r) !== opcPintada){
        opcPintada = cevenOpcDe(r);
        trows += '<tr><td colspan="7" style="background:#f0f0f3;font-size:10px;font-weight:700;'
          +'text-transform:uppercase;letter-spacing:.6px;color:#3a3a3c;padding:5px 10px">'
          +'Opción '+cevenOpcLetra(opcPintada)
          +(opcPintada===opcEf ? ' · vigente' : ' · alternativa (no suma al pipeline)')+'</td></tr>';
      }
      trows+='<tr><td>'+cevenEsc(r['SKU'])+'</td><td class="wrap">'+cevenEsc(r['Descripción'])+'</td>'
        +'<td style="text-align:center">'+cevenEsc(r['Cantidad'])+'</td>'
        +'<td style="text-align:center">'+cevenEsc(r['Nota']||'—')+'</td>'
        +'<td style="text-align:center">'+cevenEsc(cevenFormatoIVA(r['IVA'])||'—')+'</td>'
        +'<td style="text-align:right">USD '+fI(parseFloat(r['P. Venta Unitario'])||0)+'</td>'
        +'<td style="text-align:right;font-weight:500">USD '+fI(parseFloat(r['Total'])||0)+'</td></tr>';
    }
    var mia = (typeof cevenOwnsExecutive === 'function' && cevenOwnsExecutive(first['Ejecutivo'])) ? ' hist-mia' : '';
    html+='<div class="hist-card'+mia+'" style="background:#fff;border-radius:12px;border:0.5px solid #d2d2d7;margin-bottom:13px;overflow:hidden">'
      +'<div class="hist-card-hdr" style="display:flex;align-items:center;gap:10px;padding:11px 14px;background:#f5f5f7;flex-wrap:wrap">'
        +'<input type="checkbox"'+(histSel[qn]?' checked':'')+' data-act="sel" data-qn="'+qnA+'" style="width:auto;accent-color:#1d1d1f">'
        +'<div style="font-size:15px;font-weight:600;flex:1">Cotización #'+cevenEsc(qn)
          +(hayOpcB ? ' <span class="opc-chip" style="font-size:10px">2 opciones · vigente '+cevenOpcLetra(opcEf)+'</span>' : '')
        +'</div>'
        +'<div style="font-size:11px;color:#6e6e73">'+cevenEsc(first['Fecha']||'')+' '+cevenEsc(first['Hora']||'')+'</div>'
        +'<button class="bs" data-act="comp" data-qn="'+qnA+'" title="Descargar el comprobante de esta cotización en PDF y abrirlo" style="color:#1f3864;border-color:#1f3864">🧾 Comprobante</button>'
        +(cevenCanEditQuote(first['Ejecutivo']) ? '<button class="bs" data-act="edit" data-qn="'+qnA+'" style="color:#0071e3;border-color:#0071e3">✎ Editar</button>' : '')
        +'<button class="bs" data-act="copy" data-qn="'+qnA+'" title="Copiar como cotización nueva y abrirla para editar" style="color:#15863a;border-color:#34c759">⧉ Copiar</button>'
        +(cevenCanEditQuote(first['Ejecutivo']) ? '<button class="bsr" data-act="del" data-qn="'+qnA+'">✕</button>' : '')
      +'</div>'
      +'<div class="hist-card-info" style="display:flex;gap:16px;flex-wrap:wrap;padding:9px 14px;border-bottom:0.5px solid #f0f0f0;font-size:13px">'
        +'<div><span class="lbl">Canal</span><strong>'+cevenEsc(first['Cliente']||'—')+'</strong></div>'
        +'<div><span class="lbl">Cliente final</span>'+cevenEsc(first['Proyecto']||'—')+'</div>'
        +'<div><span class="lbl">Proyecto/observaciones</span>'+cevenEsc(first['Observaciones']||'—')+'</div>'
        +'<div><span class="lbl">Ejecutivo</span>'+cevenEsc(first['Ejecutivo']||'—')+'</div>'
        +'<div style="margin-left:auto;text-align:right"><span class="lbl">Total'+(hayOpcB?' · Opción '+cevenOpcLetra(opcEf):'')+'</span><strong style="font-size:15px">USD '+fI(gt)+'</strong></div>'
      +'</div>'
      +'<div style="overflow-x:auto"><table style="min-width:560px">'
        +'<thead><tr><th>SKU</th><th>Descripción</th><th style="text-align:center">Qty</th><th style="text-align:center">Nota</th><th style="text-align:center">IVA</th><th style="text-align:right">P. Venta Unit.</th><th style="text-align:right">Total</th></tr></thead>'
        +'<tbody>'+trows+'</tbody></table></div>'
    +'</div>';
  }
  wrap.innerHTML = html || '<div style="text-align:center;padding:24px;color:#aeaeb2"><p>Sin resultados con los filtros actuales.</p></div>';
  _histBindDelegation();
}

function _histBindDelegation(){
  cevenDelegate('histwrap', 'click', function(ev){
    var el = cevenActEl(ev, this);
    if(!el) return;
    var act = el.getAttribute('data-act'), qn = el.getAttribute('data-qn');
    if(act === 'edit')      editQuoteFromHistory(qn);
    else if(act === 'copy') copiarCotizacionHist(qn);
    else if(act === 'comp') cevenImprimirComprobante(qn, _legaComprobanteOpts());
    else if(act === 'del')  deleteQ(qn);
  });
  cevenDelegate('histwrap', 'change', function(ev){
    var el = cevenActEl(ev, this);
    if(!el) return;
    if(el.getAttribute('data-act') === 'sel') toggleHistSel(el.getAttribute('data-qn'), el);
  });
}
