// Vista simple de un mes archivado: tabla de OPGs Facturados/Perdidos de ese mes.
function renderArchiveMonth(monthKey, entries){
  var meses = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
  var p = monthKey.split('-');
  var lbl = p.length===2 ? (meses[parseInt(p[1])-1]+' '+p[0]) : monthKey;

  var dash = document.getElementById('pipe-dashboard');
  var sumMonto = 0, sumSalas = 0;
  var byStatus = {};
  entries.forEach(function(r){
    var monto = r.monto || 0;
    sumMonto += monto;
    sumSalas += (r.salas||[]).length;
    var est = r.estado || 'Cotizado';
    if(!byStatus[est]) byStatus[est] = {count:0, monto:0};
    byStatus[est].count++;
    byStatus[est].monto += monto;
  });
  var facturadoData = byStatus['Facturado'] || {count:0, monto:0};
  var perdidoData   = byStatus['Perdido']   || {count:0, monto:0};

  dash.style.display = 'block';
  document.getElementById('dash-count').textContent = entries.length;
  document.getElementById('dash-salas').textContent  = sumSalas;
  document.getElementById('dash-facturado').textContent = 'USD ' + fI(facturadoData.monto) + (facturadoData.count?' ('+facturadoData.count+' OPG)':'');
  document.getElementById('dash-proy').textContent = 'USD ' + fI(facturadoData.monto);
  var tv = document.getElementById('dash-total');
  if(tv) tv.textContent = perdidoData.count ? ('USD ' + fI(perdidoData.monto) + ' perdido (' + perdidoData.count + ')') : 'USD 0 perdido';

  var pillsHtml = '<div style="display:flex;flex-wrap:wrap;gap:6px;width:100%">';
  Object.keys(byStatus).forEach(function(s){
    var data = byStatus[s];
    pillsHtml += '<div class="spill" style="background:#f2f2f7;color:#1d1d1f;border-radius:980px;padding:6px 12px;font-size:12px;display:inline-flex;align-items:center;gap:6px">'
      +'<strong>'+s+'</strong><span style="opacity:.85">· '+data.count+' · USD '+fI(data.monto)+'</span></div>';
  });
  pillsHtml += '</div>';
  document.getElementById('dash-by-status').innerHTML = pillsHtml;

  var html = '';
  entries.forEach(function(r){
    var salasCount = (r.salas||[]).length;
    var expandKey = 'arch__'+monthKey+'__'+r.id;
    var expanded = window._pipeExpanded && window._pipeExpanded[expandKey];
    html += '<tr>'
      +'<td style="font-size:12px;white-space:nowrap">'
        +'<button class="bs" onclick="togglePipelineRow(\''+expandKey+'\')" title="Ver Salas" style="padding:0 5px;font-size:11px;line-height:1.4;margin-right:4px;min-width:20px">'+(expanded?'▼':'▶')+'</button>'
        +r.fecha
      +'</td>'
      +'<td style="font-size:12px">'+(r.ejecutivo||'—')+'</td>'
      +'<td style="font-weight:500">'+(r.cliente||'—')+'</td>'
      +'<td>'+(r.opg||'—')+'</td>'
      +'<td style="text-align:center">'+salasCount+' sala'+(salasCount===1?'':'s')+'</td>'
      +'<td style="font-size:12px">'+lbl+'</td>'
      +'<td style="text-align:center"><span style="border-radius:980px;padding:2px 10px;font-size:11px;font-weight:700;color:'+(r.estado==='Facturado'?'#0a5c30':'#a80011')+';background:'+(r.estado==='Facturado'?'#e0f5f1':'#fbbebe')+'">'+r.estado+'</span></td>'
      +'<td class="stk-monto" style="text-align:right;font-weight:500">USD '+fI(r.monto||0)+'</td>'
      +'<td class="stk-act" style="text-align:center">'
        +'<button class="bs" onclick="restoreFromArchive(\''+monthKey+'\','+r.id+')" title="Restaurar al pipeline activo" style="font-size:11px;padding:2px 8px">↩</button>'
      +'</td>'
    +'</tr>';
    if(expanded) html += renderPipelineDetailRow(r);
  });
  document.getElementById('pipe-body').innerHTML = html || '<tr><td colspan="9" style="text-align:center;color:#aeaeb2;padding:24px">No hay entradas para '+lbl+'</td></tr>';
  attachPipeSortHandlers();
}

function restoreFromArchive(monthKey, id){
  var archive = getArchive();
  var entries = archive[monthKey] || [];
  var toRestore = null;
  archive[monthKey] = entries.filter(function(r){ if(r.id===id){ toRestore=r; return false; } return true; });
  if(!archive[monthKey].length) delete archive[monthKey];
  if(toRestore){
    var pipe = getPipeline();
    pipe.push(toRestore);
    savePipeline(pipe);
  }
  saveArchive(archive);
  renderPipeline();
  notifyUndo('↩ OPG restaurado al pipeline.', function(){
    var archive2 = getArchive();
    var pipe2 = getPipeline().filter(function(r){ return r.id !== id; });
    savePipeline(pipe2);
    if(toRestore){
      if(!archive2[monthKey]) archive2[monthKey] = [];
      archive2[monthKey].push(toRestore);
      saveArchive(archive2);
    }
    renderPipeline();
  });
}
