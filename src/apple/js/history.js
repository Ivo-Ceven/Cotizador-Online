
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
  if(!confirm('¿Eliminar '+keys.length+' cotización(es) seleccionada(s)?')) return;
  var db=getDB();
  var newDb=[];
  for(var i=0;i<db.length;i++){
    if(!histSel[db[i]['N° Cotización']]) newDb.push(db[i]);
  }
  saveDB(newDb);
  histSel={};
  updateHistBtns();
  renderHistory();
}

function deleteQ(qn){
  var db = getDB();
  var first = db.find(function(r){ return r['N° Cotización'] === qn; });
  if(first && !cevenCanEditQuote(first['Ejecutivo'])){ alert('No tenés permiso para eliminar esta cotización.'); return; }
  if(!confirm('¿Eliminar cotización #'+qn+'?')) return;
  var newDb = [];
  for(var i=0;i<db.length;i++){
    if(db[i]['N° Cotización'] !== qn) newDb.push(db[i]);
  }
  saveDB(newDb);
  delete histSel[qn];
  updateHistBtns();
  renderHistory();
}

function clearHF(){ document.getElementById('hclient').value=''; document.getElementById('hexec').value=''; document.getElementById('hfrom').value=''; document.getElementById('hto').value=''; renderHistory(); }

function parseARDate(s){ if(!s)return null; var p=s.split('/'); if(p.length===3)return new Date(p[2],p[1]-1,p[0]); return null; }

function renderHistory(){
  var db=getDB(), wrap=document.getElementById('histwrap');
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
    if(fc&&(first['Cliente']||'').toLowerCase().indexOf(fc)===-1) continue;
    if(fe&&first['Ejecutivo']!==fe) continue;
    if(ff||ft){ var d=parseARDate(first['Fecha']); if(d){if(ff&&d<new Date(ff))continue;if(ft&&d>new Date(ft+'T23:59:59'))continue;} }
    // Filtrar filas corruptas (sin SKU o descripción válidos)
    rows = rows.filter(function(r){ return r['SKU'] && r['SKU'] !== 'undefined' && r['Descripción'] && r['Descripción'] !== 'undefined'; });
    if(!rows.length) continue;
    var gt=0; for(var ri=0;ri<rows.length;ri++) gt+=parseFloat(rows[ri]['Total'])||0;
    var trows='', wrows='', hasWarranty=false;
    for(var ri=0;ri<rows.length;ri++){
      var r=rows[ri];
      var tr='<tr><td>'+r['SKU']+'</td><td class="wrap">'+r['Descripción']+'</td>'
        +'<td style="text-align:center">'+r['Cantidad']+'</td>'
        +'<td style="text-align:center">'+(r['Disponibilidad']||'—')+'</td>'
        +'<td style="text-align:right">'+(r['Margen %']!=null&&r['Margen %']!=='—'?r['Margen %']+'%':'—')+'</td>'
        +'<td style="text-align:right">USD '+fI(parseFloat(r['P. Venta Unitario'])||0)+'</td>'
        +'<td style="text-align:right;font-weight:500">USD '+fI(parseFloat(r['Total'])||0)+'</td></tr>';
      if(r['Tipo']==='garantia'){
        var wd=null; try{wd=JSON.parse(r['_wdata']);}catch(e){}
        var wc=wd?wd.canal:'GL', wa=wd?wd.años:3;
        var wcBg=wc==='CC'?'#fff0e8':'#e8f4ff', wcFg=wc==='CC'?'#c84e00':'#0071e3';
        wrows+='<tr><td>'+r['SKU']+'</td><td class="wrap">'+r['Descripción']+'</td>'
          +'<td style="text-align:center">'+r['Cantidad']+'</td>'
          +'<td style="text-align:right">USD '+fI(parseFloat(r['P. Venta Unitario'])||0)+'</td>'
          +'<td style="text-align:right;font-weight:500">USD '+fI(parseFloat(r['Total'])||0)+'</td>'
          +'<td style="text-align:center;color:#6e6e73">21%</td>'
          +'<td style="text-align:center"><span style="background:'+wcBg+';color:'+wcFg+';border-radius:20px;padding:2px 6px;font-size:11px;font-weight:700">'+wc+'</span> · '+wa+' '+(wa===1?'año':'años')+'</td>'
          +'</tr>';
        hasWarranty=true;
      } else trows+=tr;
    }
    html+='<div class="hist-card" style="background:#fff;border-radius:12px;border:0.5px solid #d2d2d7;margin-bottom:13px;overflow:hidden">'
      +'<div class="hist-card-hdr" style="display:flex;align-items:center;gap:10px;padding:11px 14px;background:#f5f5f7;flex-wrap:wrap">'
        +'<input type="checkbox"'+(histSel[qn]?' checked':'')+' onchange="toggleHistSel(\''+qn+'\',this)" style="width:auto;accent-color:#1d1d1f">'
        +'<div style="font-size:15px;font-weight:600;flex:1">Cotización #'+qn+'</div>'
        +'<div style="font-size:11px;color:#6e6e73">'+(first['Fecha']||'')+' '+(first['Hora']||'')+'</div>'
        +(cevenCanEditQuote(first['Ejecutivo']) ? '<button class="bs" onclick="editQuoteFromHistory(\''+qn+'\');event.stopPropagation()" style="color:#0071e3;border-color:#0071e3">✎ Editar</button>' : '')
        +'<button class="bs" onclick="copiarCotizacionHist(\''+qn+'\');event.stopPropagation()" title="Copiar como cotización nueva y abrirla para editar" style="color:#15863a;border-color:#34c759">⧉ Copiar</button>'
        +(cevenCanEditQuote(first['Ejecutivo']) ? '<button class="bsr" onclick="deleteQ(\''+qn+'\');event.stopPropagation()">✕</button>' : '')
      +'</div>'
      +'<div class="hist-card-info" style="display:flex;gap:16px;flex-wrap:wrap;padding:9px 14px;border-bottom:0.5px solid #f0f0f0;font-size:13px">'
        +'<div><span class="lbl">Cliente</span><strong>'+(first['Cliente']||'—')+'</strong></div>'
        +'<div><span class="lbl">Ejecutivo</span>'+(first['Ejecutivo']||'—')+'</div>'
        +'<div><span class="lbl">Observaciones</span>'+(first['Observaciones']||'—')+'</div>'
        +'<div style="margin-left:auto;text-align:right"><span class="lbl">Total</span><strong style="font-size:15px">USD '+fI(gt)+'</strong></div>'
      +'</div>'
      +'<div style="overflow-x:auto"><table style="min-width:560px">'
        +'<thead><tr><th>SKU</th><th>Descripción</th><th style="text-align:center">Qty</th><th style="text-align:center">Disponib.</th><th style="text-align:right">Margen</th><th style="text-align:right">P. Venta Unit.</th><th style="text-align:right">Total</th></tr></thead>'
        +'<tbody>'+trows+'</tbody></table></div>'
      +(hasWarranty?'<div class="hist-warr-hdr" style="padding:8px 14px 4px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;color:#c84e00;background:#fff8f3;border-top:0.5px solid #f0e0d6">🛡 Garantías Extendidas (opcionales)</div>'
        +'<div style="overflow-x:auto"><table style="min-width:560px">'
          +'<thead><tr><th>SKU</th><th>Descripción</th><th style="text-align:center">Qty</th><th style="text-align:right">P. Venta</th><th style="text-align:right">Total</th><th style="text-align:center">IVA</th><th style="text-align:center">Canal / Años</th></tr></thead>'
          +'<tbody>'+wrows+'</tbody></table></div>':'')
    +'</div>';
  }
  wrap.innerHTML = html || '<div style="text-align:center;padding:24px;color:#aeaeb2"><p>Sin resultados con los filtros actuales.</p></div>';
}
