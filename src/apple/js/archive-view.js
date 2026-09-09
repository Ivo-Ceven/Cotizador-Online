function renderArchiveMonth(monthKey, entries){
  // Banner
  var meses = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
  var p = monthKey.split('-');
  var lbl = p.length===2 ? (meses[parseInt(p[1])-1]+' '+p[0]) : monthKey;

  /* El buscador (#pipe-search) filtra también el mes archivado — tabla Y
     tarjetas del dashboard: todo lo de abajo trabaja sobre `entries`. Mismo
     matcher que el pipeline vivo (pipeline-view.js): cliente + proyecto + N°.
     Con búsqueda activa NO se suma el ajuste manual del mes (`mn`): es una
     cifra global del mes, no atribuible a un cliente/proyecto puntual. */
  var _q = ((document.getElementById('pipe-search') || {}).value || '').toLowerCase().trim();
  if(_q){
    entries = entries.filter(function(r){
      return ((r.cliente||'')+' '+(r.proyecto||'')+' '+(r.qNum||'')).toLowerCase().indexOf(_q) !== -1;
    });
  }

  // Dashboard completo del mes archivado
  var dash = document.getElementById('pipe-dashboard');
  var sumMac=0,sumIph=0,sumIpad=0,sumServ=0,sumAcc=0;
  var amtMac=0,amtIph=0,amtIpad=0,amtServ=0,amtAcc=0;
  var sumMonto=0, factMarW=0, factMarM=0, sumMargenW=0, sumMargenM=0;
  var byStatus = {};
  // Incluir ajuste manual del mes en los totales del dashboard
  var mn = (getTargetManual()||{})[monthKey]||{};
  var mnMonto = mn.monto||0, mnMac=mn.mac||0, mnIph=mn.iph||0, mnIpad=mn.ipad||0, mnServ=mn.serv||0, mnAcc=mn.acc||0;
  if(mnMonto>0 && !_q){
    sumMonto += mnMonto;
    sumMac += mnMac; sumIph += mnIph; sumIpad += mnIpad; sumServ += mnServ; sumAcc += mnAcc;
    amtMac += mnMac>0?mnMonto*(mnMac/(mnMac+mnIph+mnIpad+mnServ+mnAcc||1)):0;
    if(!byStatus['Facturado']) byStatus['Facturado']={count:0,monto:0,marW:0,marM:0};
    byStatus['Facturado'].monto += mnMonto;
    if(mn.margen!=null&&mnMonto>0){ sumMargenW+=mn.margen*mnMonto; sumMargenM+=mnMonto; byStatus['Facturado'].marW+=mn.margen*mnMonto; byStatus['Facturado'].marM+=mnMonto; }
  }
  entries.forEach(function(r){
    var monto = r.monto||0;
    sumMonto += monto;
    sumMac  += r.qMac  || 0;
    sumIph  += r.qIph  || 0;
    sumIpad += r.qIpad || 0;
    sumServ += r.qServ || 0;
    sumAcc  += r.qAcc  || 0;
    var totalQty = (r.qMac||0)+(r.qIph||0)+(r.qIpad||0)+(r.qServ||0)+(r.qAcc||0);
    if(totalQty>0){
      amtMac  += monto*(r.qMac||0)/totalQty;
      amtIph  += monto*(r.qIph||0)/totalQty;
      amtIpad += monto*(r.qIpad||0)/totalQty;
      amtServ += monto*(r.qServ||0)/totalQty;
      amtAcc  += monto*(r.qAcc||0)/totalQty;
    }
    if(typeof r.margenPond==='number'&&monto>0){ sumMargenW+=r.margenPond*monto; sumMargenM+=monto; }
    var est = r.estado||'Cotizado';
    if(!byStatus[est]) byStatus[est]={count:0,monto:0,marW:0,marM:0,qMac:0,qIph:0,qIpad:0,qServ:0,qAcc:0};
    byStatus[est].count++;
    byStatus[est].monto+=monto;
    byStatus[est].qMac +=r.qMac ||0; byStatus[est].qIph +=r.qIph ||0;
    byStatus[est].qIpad+=r.qIpad||0; byStatus[est].qServ+=r.qServ||0; byStatus[est].qAcc+=r.qAcc||0;
    if(typeof r.margenPond==='number'&&monto>0){ byStatus[est].marW+=r.margenPond*monto; byStatus[est].marM+=monto; }
    if(est==='Facturado'&&monto>0){ factMarW+=r.margenPond*monto||0; factMarM+=monto; }
  });
  var facturadoData = byStatus['Facturado']||{count:0,monto:0,marW:0,marM:0};
  var perdidoData   = byStatus['Perdido']  ||{count:0,monto:0,marW:0,marM:0};
  var sumPipeline   = sumMonto - facturadoData.monto - perdidoData.monto;
  var pipeMargenW   = sumMargenW-(facturadoData.marW||0)-(perdidoData.marW||0);
  var pipeMargenM   = sumMargenM-(facturadoData.marM||0)-(perdidoData.marM||0);
  dash.style.display='block';
  document.getElementById('dash-count').textContent = entries.length;
  document.getElementById('dash-mac').textContent   = sumMac  || '—';
  document.getElementById('dash-iph').textContent   = sumIph  || '—';
  document.getElementById('dash-ipad').textContent  = sumIpad || '—';
  document.getElementById('dash-serv').textContent  = sumServ || '—';
  document.getElementById('dash-acc').textContent   = sumAcc  || '—';
  document.getElementById('dash-mac-amt').textContent  = amtMac  ? 'USD '+fI(amtMac)  : '';
  document.getElementById('dash-iph-amt').textContent  = amtIph  ? 'USD '+fI(amtIph)  : '';
  document.getElementById('dash-ipad-amt').textContent = amtIpad ? 'USD '+fI(amtIpad) : '';
  document.getElementById('dash-serv-amt').textContent = amtServ ? 'USD '+fI(amtServ) : '';
  document.getElementById('dash-acc-amt').textContent  = amtAcc  ? 'USD '+fI(amtAcc)  : '';
  // Reset Facturado card a su color/label original
  var fcCard2 = document.getElementById('dash-facturado-card');
  var fcLbl2  = document.getElementById('dash-facturado-lbl');
  var fcMgPd2 = document.getElementById('dash-facturado-mgpd');
  if(fcCard2) fcCard2.style.background = '#17a589';
  if(fcLbl2)  { fcLbl2.style.color = '#a5d6a7'; fcLbl2.textContent = 'Facturado'; }
  if(fcMgPd2) fcMgPd2.style.color = '#a5d6a7';
  // Card "Total" → muestra Perdido con estética roja para meses archivados
  var tcCard = document.getElementById('dash-total-card');
  var tlbl2  = document.getElementById('dash-total-lbl');
  var tmval  = document.getElementById('dash-total');
  var tmmgpd = document.getElementById('dash-margen');
  if(perdidoData.count > 0){
    if(tcCard) { tcCard.style.background = '#fbbebe'; tcCard.style.color = '#a80011'; }
    if(tlbl2)  { tlbl2.style.color = '#c84040'; tlbl2.textContent = 'Perdido'; }
    if(tmval)  { tmval.style.color = '#a80011'; tmval.textContent = 'USD '+fI(perdidoData.monto)+(perdidoData.count?' ('+perdidoData.count+' cot.)':''); }
    if(tmmgpd) { tmmgpd.style.color = '#c84040'; tmmgpd.textContent = perdidoData.marM>0?('MgPd '+(perdidoData.marW/perdidoData.marM).toFixed(2)+'%'):'MgPd —'; }
  } else {
    if(tcCard) { tcCard.style.background = '#f5f5f7'; tcCard.style.color = '#a80011'; }
    if(tlbl2)  { tlbl2.style.color = '#c84040'; tlbl2.textContent = 'Perdido'; }
    if(tmval)  { tmval.style.color = '#a80011'; tmval.textContent = 'USD 0'; }
    if(tmmgpd) { tmmgpd.style.color = '#c84040'; tmmgpd.textContent = 'MgPd —'; }
  }
  document.getElementById('dash-facturado').textContent = 'USD '+fI(facturadoData.monto)+(facturadoData.count?' ('+facturadoData.count+' cot.)':'');
  if(fcMgPd2) fcMgPd2.textContent = facturadoData.marM>0?('MgPd '+(facturadoData.marW/facturadoData.marM).toFixed(2)+'%'):'MgPd —';
  // Card Proyectado (en mes archivado = Facturado + Autorizando + Con OC + Commit del mes)
  (function(){
    var proySt = ['Facturado','Autorizando','Con OC','Commit'];
    var pMonto=0,pMarW=0,pMarM=0,pMac=0,pIph=0,pIpad=0,pAcc=0,pServ=0;
    proySt.forEach(function(ps){ var d=byStatus[ps]; if(!d) return;
      pMonto+=d.monto||0; pMarW+=d.marW||0; pMarM+=d.marM||0;
      pMac+=d.qMac||0; pIph+=d.qIph||0; pIpad+=d.qIpad||0; pAcc+=d.qAcc||0; pServ+=d.qServ||0;
    });
    var pv=document.getElementById('dash-proy'), pm=document.getElementById('dash-proy-mgpd');
    if(pv) pv.textContent='USD '+fI(pMonto);
    if(pm){
      var pu=[];
      if(pMac)  pu.push(pMac+' Mac');
      if(pIph)  pu.push(pIph+' iPhone');
      if(pIpad) pu.push(pIpad+' iPad');
      if(pAcc)  pu.push(pAcc+' Acc');
      if(pServ) pu.push(pServ+' Serv');
      pm.innerHTML=(pMarM>0?('MgPd '+(pMarW/pMarM).toFixed(2)+'%'):'MgPd —')
        + (pu.length?'<br><span style="font-size:10px;opacity:.75">'+pu.join(' · ')+'</span>':'');
    }
  })();
  // Pills por estado
  // Orden, colores y etiquetas desde shared/pipeline-status.js.
  var statusOrder = cevenEstadoValores();
  var pillsHtml = '<div style="display:flex;flex-wrap:wrap;gap:6px;width:100%">';
  statusOrder.forEach(function(s){
    var data = byStatus[s]||{count:0,monto:0,marW:0,marM:0};
    if(!data.count) return;
    var c = cevenEstadoPill(s);
    var mgStr = data.marM>0?' · MgPd '+(data.marW/data.marM).toFixed(2)+'%':'';
    pillsHtml += '<div class="'+cevenSpillClass(s)+'" style="background:'+c.bg+';color:'+c.fg+';border-radius:980px;padding:6px 12px;font-size:12px;display:inline-flex;align-items:center;gap:6px">'
      +'<strong>'+cevenEsc(cevenEstadoLabel(s))+'</strong> · '+data.count+' cot. · USD '+fI(data.monto)+mgStr+'</div>';
  });
  pillsHtml += '</div>';
  document.getElementById('dash-by-status').innerHTML = pillsHtml;

  // Tabla de entradas archivadas (read-only)
  var html = '';
  // getArchive() y getDB() hacen JSON.parse de todo el archivo/historial. Estaban
  // dentro del forEach: con 200 entradas eran 200 parses por render.
  var archMonths = Object.keys(getArchive()).sort().reverse();
  var curKey = currentMonthKey();
  var mesOpts = '';
  archMonths.forEach(function(m){
    var pp=m.split('-'), lm=['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'][parseInt(pp[1])-1]+' '+pp[0];
    mesOpts += '<option value="'+cevenEsc(m)+'"'+(m===monthKey?' selected':'')+'>'+cevenEsc(lm)+'</option>';
  });
  if(archMonths.indexOf(curKey)===-1) mesOpts += '<option value="'+cevenEsc(curKey)+'">Pipeline activo</option>';
  var archiveDB = getDB();
  /* "Proyecto/observaciones": texto libre de la cotización (clave `Observaciones`
     de cquotes, que NO se archiva). Se lee por número de cotización. */
  function _archObs(r){
    if(!r.qNum) return '';
    var row = archiveDB.filter(function(x){ return x['N° Cotización'] === r.qNum; })[0];
    var v = row ? String(row['Observaciones'] || '') : '';
    return v === '—' ? '' : v;
  }
  var monthA = ' data-amonth="'+cevenEsc(monthKey)+'"';
  entries.forEach(function(r){
    var mesC = r.mesCierre || '—';
    if(mesC.length===7){ var pp=mesC.split('-'); mesC = meses[parseInt(pp[1])-1]+' '+pp[0]; }
    /* El color del estado archivado salía de una tabla de DOS entradas: cualquier
       estado que no fuera Facturado o Perdido se pintaba gris genérico. Ahora
       sale de shared/pipeline-status.js, que además cae a un gris oscuro legible
       si el estado no está en la lista (dato viejo o import). */
    var fg = cevenEstadoPill(r.estado).fg;
    var idA = monthA + ' data-aid="'+cevenEsc(r.id)+'"';
    // Selector de mes editable para mover la entrada a otro mes
    var mesSel = '<select data-aact="mes"'+idA+' style="padding:2px 4px;border:0.5px solid #d2d2d7;border-radius:5px;font-size:11px;font-family:inherit;background:#fff;min-width:110px">'+mesOpts+'</select>';
    var partialBadge = r._fromPartial ? ' <span style="background:#fff3e0;color:#c84e00;font-size:9px;font-weight:700;padding:1px 5px;border-radius:5px;margin-left:4px" title="Facturación parcial: solo una parte de la cotización fue facturada en este mes">parcial</span>' : '';
    var archExpandKey = 'arch__'+monthKey+'__'+r.id;
    var archExpanded = window._pipeExpanded && window._pipeExpanded[archExpandKey];
    // cliente/proyecto/ejecutivo/estado vienen del pipeline sincronizado: se
    // escapan tanto en el cuerpo del elemento como en title="".
    html += '<tr>'
      +'<td style="font-size:12px;white-space:nowrap">'
        +'<button class="bs" data-aact="expand" data-akey="'+cevenEsc(archExpandKey)+'" title="Ver SKUs" style="padding:0 5px;font-size:11px;line-height:1.4;margin-right:4px;min-width:20px">'+(archExpanded?'▼':'▶')+'</button>'
        +cevenEsc(r.fecha)
      +'</td>'
      +'<td style="text-align:center;white-space:nowrap">'+_pipeModificadoChip(r)+'</td>'
      +'<td style="font-size:12px">'+cevenEsc(r.ejecutivo||'—')+'</td>'
      +'<td style="font-weight:500"><div style="display:flex;align-items:center;gap:4px"><div title="'+cevenEsc(r.cliente||'')+'" style="max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+cevenEsc(r.cliente)+'</div>'+partialBadge+'</div></td>'
      +'<td><div title="'+cevenEsc(r.proyecto||'')+'" style="max-width:240px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+cevenEsc(r.proyecto||'—')+'</div></td>'
      +'<td style="font-size:12px;color:#6e6e73"><div style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+cevenEsc(_archObs(r)||'—')+'</div></td>'
      +'<td style="font-size:12px">'+mesSel+'</td>'
      +'<td style="text-align:center"><span style="border-radius:980px;padding:2px 10px;font-size:11px;font-weight:700;color:'+fg+';background:'+(r.estado==='Facturado'?'#e0f5f1':'#fbbebe')+'">'+cevenEsc(r.estado)+'</span>'
        +(r.estado === 'Perdido'
          ? '<button class="bs" data-aact="perdido-detalle"'+idA+' style="display:block;margin:4px auto 0;padding:2px 7px;font-size:10px;color:#a80011;background:#fff0f0;border-color:#f3b7b7;white-space:nowrap">Ver motivo</button>'
          : '')+'</td>'
      +'<td style="text-align:center">'+cevenEsc(r.qMac||'—')+'</td>'
      +'<td style="text-align:center">'+cevenEsc(r.qIph||'—')+'</td>'
      +'<td style="text-align:center">'+cevenEsc(r.qIpad||'—')+'</td>'
      +'<td style="text-align:center">'+cevenEsc(r.qServ||'—')+'</td>'
      +'<td style="text-align:center">'+cevenEsc(r.qAcc||'—')+'</td>'
      +'<td style="text-align:right;color:#6e6e73">'+(typeof r.margenPond==='number'?r.margenPond.toFixed(2)+'%':'—')+'</td>'
      +'<td class="stk-monto" style="text-align:right;font-weight:500">USD '+fI(r.monto||0)+'</td>'
      +'<td class="stk-act" style="text-align:center">'
        +'<button class="bs" data-aact="restore"'+idA+' title="Restaurar al pipeline activo" style="font-size:11px;padding:2px 8px">↩</button>'
      +'</td>'
    +'</tr>';
    if(archExpanded) html += renderArchiveDetailRow(r, archiveDB);
  });
  // Fila "Otras ventas" si hay ajuste manual para este mes (no con búsqueda activa)
  if(mnMonto > 0 && !_q){
    var mnFecha = mn._fecha || '—';
    html += '<tr style="background:#f0f7ff;border-top:1.5px dashed #b0c8e8">'
      +'<td style="font-size:12px">'+cevenEsc(mnFecha)+'</td>'
      +'<td style="font-size:12px">Ceven</td>'
      +'<td style="font-weight:600;color:#0071e3">Otras ventas <span style="font-size:9px;font-weight:400;color:#6e6e73;margin-left:4px">ajuste manual</span></td>'
      +'<td style="color:#6e6e73;font-size:11px">Diferencia</td>'
      +'<td></td>'
      +'<td><span style="font-size:11px;color:#6e6e73">'+cevenEsc(lbl)+'</span></td>'
      +'<td style="text-align:center"><span style="border-radius:980px;padding:2px 10px;font-size:11px;font-weight:700;color:#0a5c30;background:#e0f5f1">Facturado</span></td>'
      +'<td style="text-align:center">'+cevenEsc(mnMac||'—')+'</td>'
      +'<td style="text-align:center">'+cevenEsc(mnIph||'—')+'</td>'
      +'<td style="text-align:center">'+cevenEsc(mnIpad||'—')+'</td>'
      +'<td style="text-align:center">'+cevenEsc(mnServ||'—')+'</td>'
      +'<td style="text-align:center">'+cevenEsc(mnAcc||'—')+'</td>'
      +'<td style="text-align:right;color:#6e6e73">'+(typeof mn.margen==='number'?mn.margen.toFixed(2)+'%':'—')+'</td>'
      +'<td class="stk-monto" style="text-align:right;font-weight:500;color:#0071e3">USD '+fI(mnMonto)+'</td>'
      +'<td class="stk-act" style="text-align:center">'
        +'<button class="bs" data-aact="ta"'+monthA+' title="Editar ajuste en Target Anual" style="font-size:11px;padding:2px 8px;color:#0071e3;border-color:#b0c8e8;background:#f0f7ff">✎TA</button>'
      +'</td>'
    +'</tr>';
  }
  document.getElementById('pipe-body').innerHTML = html || '<tr><td colspan="16" style="text-align:center;color:#aeaeb2;padding:24px">'
    + (_q ? 'Ninguna entrada archivada de '+cevenEsc(lbl)+' coincide con la búsqueda.' : 'No hay entradas para '+cevenEsc(lbl))
    + '</td></tr>';
  attachPipeSortHandlers();
}

// Delegación de eventos de la vista de archivo. Comparte contenedor (#pipe-body)
// con el pipeline activo, por eso usa su propio namespace de atributos (data-aact).
(function(){
  var body = document.getElementById('pipe-body');
  if(!body) return;
  function pick(e){
    var el = e.target.closest ? e.target.closest('[data-aact]') : null;
    return (el && body.contains(el)) ? el : null;
  }
  body.addEventListener('change', function(e){
    var el = pick(e); if(!el) return;
    if(el.getAttribute('data-aact') === 'mes'){
      moveArchiveEntryMonth(el.getAttribute('data-amonth'), el.getAttribute('data-aid'), el.value);
    }
  });
  body.addEventListener('click', function(e){
    var el = pick(e); if(!el) return;
    switch(el.getAttribute('data-aact')){
      case 'expand':  togglePipelineRow(el.getAttribute('data-akey')); break;
      case 'restore': restoreFromArchive(el.getAttribute('data-amonth'), el.getAttribute('data-aid')); break;
      case 'perdido-detalle':
        var rows = getArchive()[el.getAttribute('data-amonth')] || [];
        var row = rows.filter(function(r){ return String(r.id) === String(el.getAttribute('data-aid')); })[0];
        abrirDetalleMotivoPerdida(row && row.perdidoMotivo);
        break;
      case 'ta':      openTargetAnualEditMonth(el.getAttribute('data-amonth')); break;
    }
  });
})();

// Detalle por SKU (solo lectura) de una entrada archivada del histórico.
// db se recibe ya parseado desde renderArchiveMonth: llamar a getDB() acá dentro
// significaba un JSON.parse del historial completo por cada fila expandida.
function renderArchiveDetailRow(r, db){
  if(!db) db = getDB();
  // Solo la opción vigente (shared/opciones.js): con dos opciones, sin filtrar
  // se listarían las líneas de las dos.
  var lines = cevenOpcFilasDeCotiz(db, r.qNum, ['producto','garantia']);
  if(!lines.length){
    return '<tr class="pipe-detail"><td colspan="16" style="padding:14px 18px;background:#fafafa;color:#aeaeb2;font-size:12px">No se encontraron líneas para esta cotización (#'+cevenEsc(r.qNum||'—')+') en el historial.</td></tr>';
  }
  var inner = '<div style="padding:10px 14px 14px;background:#fafafa">'
    +'<div style="font-size:11px;color:#6e6e73;text-transform:uppercase;letter-spacing:.4px;margin-bottom:8px">Detalle por SKU · #'+cevenEsc(r.qNum)
      +(r._fromPartial?' <span style="text-transform:none;color:#c84e00">· facturación parcial (se muestran todas las líneas de la cotización)</span>':'')
    +'</div>'
    +'<table style="width:100%;font-size:12px;border-collapse:collapse;background:#fff;border:0.5px solid #e5e5e7;border-radius:8px;overflow:hidden;table-layout:fixed">'
    +'<colgroup><col style="width:10%"><col style="width:40%"><col style="width:8%"><col style="width:14%"><col style="width:12%"><col style="width:16%"></colgroup>'
    +'<thead><tr style="background:#f5f5f7">'
      +'<th style="text-align:left;padding:6px 10px;font-size:11px;color:#6e6e73">SKU</th>'
      +'<th style="text-align:left;padding:6px 10px;font-size:11px;color:#6e6e73">Descripción</th>'
      +'<th style="text-align:center;padding:6px 10px;font-size:11px;color:#6e6e73">Qty</th>'
      +'<th style="text-align:right;padding:6px 10px;font-size:11px;color:#6e6e73">P. Unit.</th>'
      +'<th style="text-align:right;padding:6px 10px;font-size:11px;color:#6e6e73">Margen</th>'
      +'<th style="text-align:right;padding:6px 10px;font-size:11px;color:#6e6e73">Subtotal</th>'
    +'</tr></thead><tbody>';
  var totQty=0, totMonto=0, marW=0, marM=0;
  lines.forEach(function(ln){
    var isWarranty = ln['Tipo']==='garantia';
    var qty = parseInt(ln['Cantidad'])||0;
    var price = parseFloat(ln['P. Venta Unitario'])||0;
    var sub = qty*price;
    var mg = parseFloat(ln['Margen %']);
    totQty += qty; totMonto += sub;
    if(!isNaN(mg) && sub>0){ marW += mg*sub; marM += sub; }
    inner += '<tr style="border-top:0.5px solid #f0f0f0'+(isWarranty?';background:#fffbf5':'')+'">'
      +'<td style="padding:6px 10px;font-family:monospace;font-size:11px">'+cevenEsc(ln['SKU']||'')+'</td>'
      +'<td style="padding:6px 10px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="'+cevenEsc(ln['Descripción']||'')+'">'+cevenEsc(ln['Descripción']||'')+(isWarranty?' <span style="background:#fff3e0;color:#c84e00;font-size:9px;font-weight:700;padding:1px 5px;border-radius:6px;margin-left:4px">GARANTÍA</span>':'')+'</td>'
      +'<td style="padding:6px 10px;text-align:center">'+qty+'</td>'
      +'<td style="padding:6px 10px;text-align:right">USD '+fI(price)+'</td>'
      +'<td style="padding:6px 10px;text-align:right;color:#6e6e73">'+(isNaN(mg)?'—':mg.toFixed(2)+'%')+'</td>'
      +'<td style="padding:6px 10px;text-align:right;font-weight:500">USD '+fI(sub)+'</td>'
    +'</tr>';
  });
  var mgPd = marM>0 ? (marW/marM).toFixed(2)+'%' : '—';
  inner += '</tbody><tfoot><tr style="border-top:1.5px solid #d2d2d7;font-weight:600;background:#fafafa">'
    +'<td style="padding:7px 10px" colspan="2">Total · '+lines.length+' línea(s)</td>'
    +'<td style="padding:7px 10px;text-align:center">'+totQty+'</td>'
    +'<td style="padding:7px 10px"></td>'
    +'<td style="padding:7px 10px;text-align:right;color:#6e6e73">MgPd '+mgPd+'</td>'
    +'<td style="padding:7px 10px;text-align:right">USD '+fI(totMonto)+'</td>'
  +'</tr></tfoot></table></div>';
  return '<tr class="pipe-detail"><td colspan="16" style="padding:0;background:#fafafa">'+inner+'</td></tr>';
}

function restoreFromArchive(monthKey, id){
  var archive = getArchive();
  var entries = archive[monthKey] || [];
  var toRestore = null;
  archive[monthKey] = entries.filter(function(r){ if(String(r.id)===String(id)){ toRestore=r; return false; } return true; });
  if(!archive[monthKey].length) delete archive[monthKey];
  if(!toRestore){ showToast('No se encontró esa entrada en el archivo.'); return; }

  // La entrada volvía al pipeline con estado 'Facturado' y su mesCierre viejo,
  // que es exactamente la condición que archiveOldEntries() vuelve a archivar
  // en la siguiente entrada al pipeline: "Restaurar" no hacía nada visible.
  // Se le mueve el cierre al mes actual, igual que moveArchiveEntryMonth().
  // Se restaura una COPIA para que el original —con su mes— quede intacto para
  // el deshacer.
  var restored = JSON.parse(JSON.stringify(toRestore));
  restored.mesCierre = currentMonthKey();
  delete restored.mesAutoRoll;   // decisión manual fresca: sin chapita "↪ auto"
  var pipe = getPipeline();
  pipe.push(restored);
  savePipeline(pipe);
  saveArchive(archive);
  renderPipeline();

  notifyUndo('↩ Restaurada al pipeline actual — el cierre estimado se movió a este mes.', function(){
    var archive2 = getArchive();
    var pipe2 = getPipeline().filter(function(r){ return String(r.id) !== String(id); });
    savePipeline(pipe2);
    if(!archive2[monthKey]) archive2[monthKey] = [];
    // Sin este chequeo la fila se DUPLICABA en el archivo: undoPipelineChange()
    // (u otra restauración) podía haberla devuelto ya, y el push era ciego.
    var yaEsta = archive2[monthKey].some(function(x){ return String(x.id) === String(id); });
    if(!yaEsta) archive2[monthKey].push(toRestore);
    saveArchive(archive2);
    renderPipeline();
  });
}

function moveArchiveEntryMonth(fromKey, id, toKey){
  var archive = getArchive();
  var entries = archive[fromKey] || [];
  var entry = null;
  archive[fromKey] = entries.filter(function(r){ if(String(r.id)===String(id)){ entry=r; return false; } return true; });
  if(!archive[fromKey].length) delete archive[fromKey];
  if(!entry) return;
  var curKey = currentMonthKey();
  if(toKey === curKey){
    // Mover de vuelta al pipeline activo
    entry.mesCierre = toKey;
    var pipe = getPipeline();
    pipe.push(entry);
    savePipeline(pipe);
    saveArchive(archive);
    showToast('↩ Entrada movida al pipeline activo');
  } else {
    // Mover a otro mes archivado
    entry.mesCierre = toKey;
    if(!archive[toKey]) archive[toKey] = [];
    archive[toKey].push(entry);
    saveArchive(archive);
    showToast('📦 Entrada movida a '+toKey);
  }
  renderPipeline();
}

function renderArchiveMonth_stub(){} // placeholder
