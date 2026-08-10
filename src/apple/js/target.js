// ── TARGET ANUAL ──
function openTargetAnual(){
  var modal = document.getElementById('target-modal');
  var _wasOpen = modal.style.display === 'block';
  var yearInput  = document.getElementById('target-year');
  var amountInput = document.getElementById('target-amount');
  var now = new Date();
  var saved = {};
  try{ saved = JSON.parse(localStorage.getItem('ctarget')||'{}'); }catch(e){}
  yearInput.value  = saved.year  || now.getFullYear();
  amountInput.value = saved.amount || '';
  // Resetear estado al abrir
  _tgtConfigOpen = false;
  var cw = document.getElementById('target-config-wrap');
  var cb = document.getElementById('target-config-toggle');
  if(cw) cw.style.display = 'none';
  if(cb) cb.textContent = '⚙ Configurar';
  modal.style.display = 'block';
  if(window.cevenNav && !_wasOpen) cevenNav.openOverlay(closeTargetAnual);
  renderTargetAnual();
}

// Abre Target Anual directo en el mes para editar el ajuste manual
function openTargetAnualEditMonth(mk){
  var modal = document.getElementById('target-modal');
  var _wasOpen = modal.style.display === 'block';
  var yearInput  = document.getElementById('target-year');
  var amountInput = document.getElementById('target-amount');
  var now = new Date();
  var saved = {};
  try{ saved = JSON.parse(localStorage.getItem('ctarget')||'{}'); }catch(e){}
  yearInput.value   = saved.year   || now.getFullYear();
  amountInput.value = saved.amount || '';
  // Abrir config y activar edición del mes
  _tgtConfigOpen = true;
  _tgtEditMonth  = mk;
  var cw = document.getElementById('target-config-wrap');
  var cb = document.getElementById('target-config-toggle');
  if(cw) cw.style.display = 'block';
  if(cb) cb.textContent = '▲ Ocultar';
  modal.style.display = 'block';
  if(window.cevenNav && !_wasOpen) cevenNav.openOverlay(closeTargetAnual);
  renderTargetAnual();
  // Scroll al mes correspondiente
  setTimeout(function(){
    var body = modal.querySelector('[id="target-dashboard"]') || modal;
    var rows = modal.querySelectorAll('tr');
    for(var i=0;i<rows.length;i++){
      if(rows[i].dataset && rows[i].dataset.mk === mk){
        rows[i].scrollIntoView({behavior:'smooth', block:'center'});
        break;
      }
    }
  }, 200);
}

function closeTargetAnual(){
  document.getElementById('target-modal').style.display = 'none';
  if(window.cevenNav) cevenNav.notifyClosed(closeTargetAnual);
}

// ── ANÁLISIS POR SKU ──
function openSkuDashboard(){
  window._skuExpanded = window._skuExpanded || {};
  var _wasOpen = document.getElementById('sku-modal').style.display === 'block';
  document.getElementById('sku-modal').style.display = 'block';
  if(window.cevenNav && !_wasOpen) cevenNav.openOverlay(closeSkuDashboard);
  renderSkuDashboard();
}
function closeSkuDashboard(){
  document.getElementById('sku-modal').style.display = 'none';
  if(window.cevenNav) cevenNav.notifyClosed(closeSkuDashboard);
}
function toggleSkuRow(sku){
  window._skuExpanded = window._skuExpanded || {};
  // El SKU llega tal cual desde data-sku: ya no hay que deshacer ningún escape
  // ad-hoc (antes venía con las comillas simples convertidas en \').
  window._skuExpanded[sku] = !window._skuExpanded[sku];
  renderSkuDashboard();
}

// Delegación de eventos del análisis por SKU.
(function(){
  var dash = document.getElementById('sku-dashboard');
  if(!dash) return;
  dash.addEventListener('click', function(e){
    var el = e.target.closest ? e.target.closest('[data-skurow]') : null;
    if(!el || !dash.contains(el)) return;
    toggleSkuRow(el.getAttribute('data-skurow'));
  });
})();

function renderSkuDashboard(){
  var pipe = getPipeline();
  var db = getDB();
  /* El target sigue el embudo comercial, así que no incluye 'Proyecto' (una
     idea todavía sin cotizar no proyecta facturación). Colores desde
     shared/pipeline-status.js: eran las mismas dos tablas, copiadas. */
  var states = cevenEstadoValores().filter(function(s){ return s !== 'Proyecto'; });
  var stColor = {}, stBg = {};
  states.forEach(function(s){
    stColor[s] = cevenEstadoCard(s).bg;
    stBg[s]    = cevenEstadoPill(s).bg;
  });

  // Agregar por SKU
  var agg = {};
  function ensure(sku,desc){
    if(!agg[sku]) agg[sku]={desc:desc||'',total:0,byState:{},rows:[]};
    if(desc && !agg[sku].desc) agg[sku].desc=desc;
    return agg[sku];
  }
  function add(sku,desc,state,qty,client,mes){
    if(!qty||qty<=0) return;
    var a=ensure(sku,desc);
    a.total+=qty;
    a.byState[state]=(a.byState[state]||0)+qty;
    a.rows.push({client:client||'—',state:state,qty:qty,mes:mes||''});
  }

  pipe.forEach(function(r){
    var rootSt=r.estado||'Cotizado', rootMes=r.mesCierre||'';
    // Solo productos — excluir garantías de este análisis
    var lines=cevenOpcFilasDeCotiz(db, r.qNum, ['producto']);
    lines.forEach(function(ln,idx){
      var sku=ln['SKU']||'—', desc=ln['Descripción']||'';
      var lk=sku+'|'+idx;
      var tQty=parseInt(ln['Cantidad'])||0;
      var arch=(r.skuArchivedQty&&parseInt(r.skuArchivedQty[lk]))||0;
      if(arch>0) add(sku,desc,'Facturado',arch,r.cliente,'archivado');
      var eff=tQty-arch;
      if(eff<=0) return;
      var st=(r.skuStatus&&r.skuStatus[lk])||rootSt;
      var mes=(r.skuMesCierre&&r.skuMesCierre[lk]!==undefined)?r.skuMesCierre[lk]:rootMes;
      if(st==='Facturado'){
        var pq=r.skuPartialQty&&parseInt(r.skuPartialQty[lk]);
        if(pq>0&&pq<eff){
          var remSt=(r.skuPartialRemSt&&r.skuPartialRemSt[lk])||'Con OC';
          var remMes=(r.skuPartialRemMes&&r.skuPartialRemMes[lk]!==undefined)?r.skuPartialRemMes[lk]:rootMes;
          add(sku,desc,'Facturado',pq,r.cliente,mes);
          add(sku,desc,remSt,eff-pq,r.cliente,remMes);
        } else {
          add(sku,desc,'Facturado',eff,r.cliente,mes);
        }
      } else {
        add(sku,desc,st,eff,r.cliente,mes);
      }
    });
  });

  // Array ordenado por total activo (excluye Perdido para el ranking)
  var arr = Object.keys(agg).map(function(s){
    var a=agg[s];
    var rank=a.total-(a.byState['Perdido']||0);
    return {sku:s,desc:a.desc,total:a.total,rank:rank,byState:a.byState,rows:a.rows};
  });
  arr.sort(function(a,b){ return b.rank-a.rank; });

  var meses=['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
  function fmtMes(m){ if(!m||m==='archivado') return m==='archivado'?'archivado':'—'; var p=m.split('-'); return p.length===2?(meses[parseInt(p[1])-1]+' '+p[0]):m; }

  var html='';

  if(!arr.length){
    document.getElementById('sku-dashboard').innerHTML='<div style="text-align:center;color:#aeaeb2;padding:40px">No hay SKUs en el pipeline.</div>';
    return;
  }

  // ── Top 5 cards ──
  html+='<div style="font-size:11px;color:#6e6e73;text-transform:uppercase;letter-spacing:.4px;margin-bottom:8px">Top 5 SKU · por unidades activas</div>';
  html+='<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px;margin-bottom:20px">';
  arr.slice(0,5).forEach(function(a){
    // mini breakdown top estados
    var segs='';
    states.forEach(function(s){
      var u=a.byState[s]||0; if(!u) return;
      segs+='<span style="display:inline-block;font-size:10px;color:'+stColor[s]+';font-weight:600;margin-right:6px;white-space:nowrap">'+u+' '+s+'</span>';
    });
    html+='<div style="background:#fff;border:0.5px solid #d2d2d7;border-radius:12px;padding:12px 14px">'
      +'<div style="font-family:monospace;font-size:12px;font-weight:600;color:#1d1d1f">'+cevenEsc(a.sku)+'</div>'
      +'<div style="font-size:10px;color:#6e6e73;margin:2px 0 6px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="'+cevenEsc(a.desc||'')+'">'+cevenEsc(a.desc||'—')+'</div>'
      +'<div style="font-size:24px;font-weight:700;color:#1d1d1f">'+fI(a.rank)+' <span style="font-size:11px;font-weight:400;color:#6e6e73">unid.</span></div>'
      +'<div style="margin-top:6px;line-height:1.6">'+segs+'</div>'
    +'</div>';
  });
  html+='</div>';

  // ── Tabla por SKU ──
  html+='<div style="background:#fff;border:0.5px solid #d2d2d7;border-radius:12px;overflow:hidden">'
    +'<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:12px;min-width:880px">'
    +'<thead><tr style="background:#fafafa;border-bottom:0.5px solid #e5e5e7">'
    +'<th style="text-align:left;padding:9px 12px;font-weight:600">SKU</th>'
    +'<th style="text-align:left;padding:9px 12px;font-weight:600">Descripción</th>';
  states.forEach(function(s){
    html+='<th style="text-align:center;padding:9px 6px;font-weight:600;color:'+stColor[s]+'">'+s+'</th>';
  });
  html+='<th style="text-align:center;padding:9px 10px;font-weight:700">Total</th>'
    +'<th style="width:30px"></th>'
    +'</tr></thead><tbody>';

  arr.forEach(function(a){
    // El SKU (que sale del Excel del price list) iba dentro de un string JS del
    // onclick escapando sólo las comillas simples: con  \');alert(1);//  se
    // cerraba el string y se ejecutaba lo que siguiera. Va por data-sku.
    var expanded=window._skuExpanded&&window._skuExpanded[a.sku];
    html+='<tr style="border-top:0.5px solid #f0f0f0;cursor:pointer" data-skurow="'+cevenEsc(a.sku)+'">'
      +'<td style="padding:8px 12px;font-family:monospace;font-weight:600">'+cevenEsc(a.sku)+'</td>'
      +'<td style="padding:8px 12px;max-width:240px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="'+cevenEsc(a.desc||'')+'">'+cevenEsc(a.desc||'—')+'</td>';
    states.forEach(function(s){
      var u=a.byState[s]||0;
      html+='<td style="text-align:center;padding:8px 6px;color:'+(u?stColor[s]:'#d2d2d7')+';font-weight:'+(u?'600':'400')+'">'+(u||'—')+'</td>';
    });
    html+='<td style="text-align:center;padding:8px 10px;font-weight:700">'+fI(a.total)+'</td>'
      +'<td style="text-align:center;color:#6e6e73">'+(expanded?'▼':'▶')+'</td>'
      +'</tr>';
    // Sub-fila expandida: clientes
    if(expanded){
      // Agrupar filas por cliente+estado+mes
      var cmap={};
      a.rows.forEach(function(row){
        var key=row.client+'||'+row.state+'||'+row.mes;
        if(!cmap[key]) cmap[key]={client:row.client,state:row.state,mes:row.mes,qty:0};
        cmap[key].qty+=row.qty;
      });
      var clientRows=Object.keys(cmap).map(function(k){return cmap[k];});
      clientRows.sort(function(x,y){ return y.qty-x.qty; });
      var inner='<div style="padding:8px 14px 12px 24px;background:#fafafa">'
        +'<div style="font-size:10px;color:#6e6e73;text-transform:uppercase;letter-spacing:.4px;margin-bottom:6px">Clientes cotizando '+cevenEsc(a.sku)+'</div>'
        +'<table style="width:100%;border-collapse:collapse;font-size:12px">';
      clientRows.forEach(function(cr){
        inner+='<tr style="border-top:0.5px solid #eee">'
          +'<td style="padding:5px 10px;font-weight:500;min-width:160px">'+cevenEsc(cr.client)+'</td>'
          +'<td style="padding:5px 10px"><span style="background:'+(stBg[cr.state]||'#f2f2f7')+';color:'+(stColor[cr.state]||'#1d1d1f')+';border-radius:980px;padding:2px 9px;font-size:10px;font-weight:600">'+cevenEsc(cr.state)+'</span></td>'
          +'<td style="padding:5px 10px;color:#6e6e73">'+cevenEsc(fmtMes(cr.mes))+'</td>'
          +'<td style="padding:5px 10px;text-align:right;font-weight:700">'+fI(cr.qty)+' unid.</td>'
          +'</tr>';
      });
      inner+='</table></div>';
      html+='<tr><td colspan="'+(states.length+4)+'" style="padding:0">'+inner+'</td></tr>';
    }
  });
  html+='</tbody></table></div></div>';

  document.getElementById('sku-dashboard').innerHTML=html;
}

function saveTargetAnual(){
  var year   = parseInt(document.getElementById('target-year').value)  || new Date().getFullYear();
  var amount = parseFloat(document.getElementById('target-amount').value) || 0;
  try{ localStorage.setItem('ctarget', JSON.stringify({year:year, amount:amount})); }catch(e){}
  renderTargetAnual();
  showToast('✓ Target guardado');
}

// ── helpers Target Anual ──
var _tgtEditMonth  = null; // mes actualmente en edición (YYYY-MM o null)
var _tgtConfigOpen = false; // sección de configuración visible u oculta
var _tgtRevShare   = {mac:0,iph:0,ipad:0,acc:0}; // participación revenue por familia

function toggleTargetConfig(){
  _tgtConfigOpen = !_tgtConfigOpen;
  if(!_tgtConfigOpen) window._tgtEditMonth = null; // cerrar edición de mes al ocultar config
  var wrap = document.getElementById('target-config-wrap');
  var btn  = document.getElementById('target-config-toggle');
  if(wrap) wrap.style.display = _tgtConfigOpen ? 'block' : 'none';
  if(btn)  btn.textContent    = _tgtConfigOpen ? '▲ Ocultar' : '⚙ Configurar';
  renderTargetAnual();
}


function getTargetManual(){
  try{ return JSON.parse(localStorage.getItem('ctarget_manual')||'{}'); }catch(e){ return {}; }
}
function saveTargetManualField(mk, field, val){
  var data = getTargetManual();
  if(!data[mk]) data[mk] = {};
  var v = parseFloat(val);
  data[mk][field] = isNaN(v) ? 0 : v;
  // Guardar fecha de última modificación
  var d = new Date();
  var fechaStr = d.getDate()+'/'+(d.getMonth()+1)+'/'+d.getFullYear();
  data[mk]._fecha = fechaStr;
  try{ localStorage.setItem('ctarget_manual', JSON.stringify(data)); }catch(e){}
  renderTargetAnual();
}

// Asignar fecha a ajustes manuales que no la tengan (migración de datos existentes)
function ensureTargetManualFechas(){
  var data = getTargetManual();
  var changed = false;
  var d = new Date();
  var fechaStr = d.getDate()+'/'+(d.getMonth()+1)+'/'+d.getFullYear();
  Object.keys(data).forEach(function(mk){
    if(data[mk] && !data[mk]._fecha){
      data[mk]._fecha = fechaStr;
      changed = true;
    }
  });
  if(changed) try{ localStorage.setItem('ctarget_manual', JSON.stringify(data)); }catch(e){}
}

function toggleTargetEdit(mk){
  _tgtEditMonth = (_tgtEditMonth === mk) ? null : mk;
  renderTargetAnual();
}

function renderTargetAnual(){
  ensureTargetManualFechas(); // migrar ajustes sin fecha
  var year   = parseInt(document.getElementById('target-year').value)  || new Date().getFullYear();
  var amount = parseFloat(document.getElementById('target-amount').value) || 0;
  var dash   = document.getElementById('target-dashboard');

  // ── Datos del pipeline (Facturado) ──
  // Combinar pipeline activo + archivo (carchive) para el año seleccionado
  var allEntries = getPipeline().slice();
  var archiveData = getArchive();
  Object.keys(archiveData).forEach(function(mKey){
    if(mKey.substring(0,4) === String(year)){
      allEntries = allEntries.concat(archiveData[mKey]);
    }
  });
  var meses = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
  var pipe_m = {};
  for(var i=0;i<12;i++) pipe_m[year+'-'+String(i+1).padStart(2,'0')]={monto:0,mac:0,iph:0,ipad:0,serv:0,acc:0,montoMac:0,montoIph:0,montoIpad:0,montoAcc:0,montoServ:0,marW:0,marM:0};

  // Acumula las porciones Facturadas de una entrada respetando skuStatus/skuPartialQty/skuMesCierre
  // (misma lógica que el pipeline dashboard con filas virtuales)
  var _tgtDB = getDB();
  function _acumFacturado(r){
    var defSt  = r.estado    || 'Cotizado';
    var defMes = r.mesCierre || '';
    var hasOverrides = (r.skuStatus    && Object.keys(r.skuStatus).length)
                    || (r.skuPartialQty && Object.keys(r.skuPartialQty).length);

    if(!hasOverrides){
      // Camino simple: root estado/monto
      if(defSt !== 'Facturado') return;
      var mc = defMes;
      if(!mc || mc.substring(0,4) !== String(year) || !pipe_m[mc]) return;
      var m = pipe_m[mc];
      m.monto+=r.monto||0; m.mac+=r.qMac||0; m.iph+=r.qIph||0;
      m.ipad+=r.qIpad||0; m.serv+=r.qServ||0; m.acc+=r.qAcc||0;
      var rTot=(r.qMac||0)+(r.qIph||0)+(r.qIpad||0)+(r.qAcc||0)+(r.qServ||0);
      if(rTot>0){ var rM=r.monto||0;
        m.montoMac+=rM*(r.qMac||0)/rTot; m.montoIph+=rM*(r.qIph||0)/rTot;
        m.montoIpad+=rM*(r.qIpad||0)/rTot; m.montoAcc+=rM*(r.qAcc||0)/rTot;
        m.montoServ+=rM*(r.qServ||0)/rTot; }
      if(typeof r.margenPond==='number'&&(r.monto||0)>0){m.marW+=r.margenPond*r.monto;m.marM+=r.monto;}
      return;
    }

    // Camino complejo: expandir línea por línea del DB
    var lines = cevenOpcFilasDeCotiz(_tgtDB, r.qNum, ['producto','garantia']);
    if(!lines.length){ // sin líneas en DB → fallback simple
      var r2=Object.assign({},r); delete r2.skuStatus; delete r2.skuPartialQty; _acumFacturado(r2); return;
    }
    lines.forEach(function(ln,idx){
      var lk = (ln['SKU']||'')+'|'+idx;
      var st = (r.skuStatus && r.skuStatus[lk]) || defSt;
      var mc = (r.skuMesCierre && r.skuMesCierre[lk]!==undefined) ? r.skuMesCierre[lk] : defMes;
      if(st!=='Facturado') return;
      if(!mc||mc.substring(0,4)!==String(year)||!pipe_m[mc]) return;
      // Descontar unidades ya archivadas (ya contabilizadas como entrada de archivo)
      var archQty  = (r.skuArchivedQty && parseInt(r.skuArchivedQty[lk])) || 0;
      var totalQty = Math.max(0,(parseInt(ln['Cantidad'])||0) - archQty);
      if(totalQty<=0) return;
      var partQty  = r.skuPartialQty && parseInt(r.skuPartialQty[lk]);
      var factQty  = (partQty>0&&partQty<totalQty) ? partQty : totalQty;
      var price    = parseFloat(ln['P. Venta Unitario'])||0;
      var lMonto   = factQty * price;
      var lob  = (ln['_lob']||'').trim();
      var desc = (ln['Descripción']||'').toLowerCase();
      var cat  = null;
      if(/\biphone\b/.test(desc)&&!/keyboard|mouse|pencil|case|cover|cable|adapter|folio/i.test(desc)) cat='iphone';
      else if(/\bipad\b/.test(desc)&&!/keyboard|mouse|pencil|case|cover|cable|adapter|folio/i.test(desc)) cat='ipad';
      else if(/\bmacbook\b|\bimac\b|\bmac\s*(mini|studio|pro|neo)\b|\bmbp(ro)?\b|\bmba(ir)?\b/i.test(desc)) cat='mac';
      else cat = MODEL_CATEGORY[lob];
      if(!cat) cat='acc';
      var m=pipe_m[mc];
      m.monto+=lMonto;
      if(ln['Tipo']==='garantia'){m.serv+=factQty;m.montoServ+=lMonto;}
      else if(cat==='mac')   {m.mac +=factQty;m.montoMac +=lMonto;}
      else if(cat==='iphone'){m.iph +=factQty;m.montoIph +=lMonto;}
      else if(cat==='ipad')  {m.ipad+=factQty;m.montoIpad+=lMonto;}
      else                   {m.acc +=factQty;m.montoAcc +=lMonto;}
      var mg=parseFloat(ln['Margen %']);
      if(!isNaN(mg)&&lMonto>0){m.marW+=mg*lMonto;m.marM+=lMonto;}
    });
  }

  allEntries.forEach(function(r){ _acumFacturado(r); });

  // ── Ajustes manuales ──
  var manual = getTargetManual();
  var nowD = new Date();
  var curYM = nowD.getFullYear()+'-'+String(nowD.getMonth()+1).padStart(2,'0');

  // ── Calcular totales combinados (pipeline + manual) ──
  var totalFact=0,totMac=0,totIph=0,totIpad=0,totAcc=0,totServ=0,totMarW=0,totMarM=0;
  var totMontoMac=0,totMontoIph=0,totMontoIpad=0,totMontoAcc=0;
  // Unidades solo del pipeline (sin ajustes manuales) → para precio promedio
  var pmTotMac=0,pmTotIph=0,pmTotIpad=0,pmTotAcc=0;
  for(var i2=0;i2<12;i2++){
    var mk2=year+'-'+String(i2+1).padStart(2,'0');
    var pm=pipe_m[mk2], mn=manual[mk2]||{};
    var monto=(pm.monto||0)+(mn.monto||0);
    totalFact+=monto;
    totMac+=(pm.mac||0)+(mn.mac||0); totIph+=(pm.iph||0)+(mn.iph||0);
    totIpad+=(pm.ipad||0)+(mn.ipad||0); totAcc+=(pm.acc||0)+(mn.acc||0);
    totServ+=(pm.serv||0)+(mn.serv||0);
    // Acumular montos y unidades reales por familia (solo pipeline, no manual)
    totMontoMac+=pm.montoMac||0; totMontoIph+=pm.montoIph||0;
    totMontoIpad+=pm.montoIpad||0; totMontoAcc+=pm.montoAcc||0;
    pmTotMac+=pm.mac||0; pmTotIph+=pm.iph||0;
    pmTotIpad+=pm.ipad||0; pmTotAcc+=pm.acc||0;
    var mar=mn.margen!=null?mn.margen:(pm.marM>0?pm.marW/pm.marM:0);
    if(monto>0&&mar>0){totMarW+=mar*monto;totMarM+=monto;}
  }
  // Precio promedio por familia desde TODAS las cotizaciones (no solo Facturadas)
  // Mix en UNIDADES desde todas las cotizaciones (precio promedio solo para líneas con precio > 0)
  var _aqMM=0,_aqMU=0, _aqIM=0,_aqIU=0, _aqPM=0,_aqPU=0, _aqAM=0,_aqAU=0;
  _tgtDB.forEach(function(ln){
    if(ln['Tipo']!=='producto') return;
    var qty=parseInt(ln['Cantidad'])||0;
    if(qty<=0) return;
    var price=parseFloat(ln['P. Venta Unitario'])||0;
    var lob=(ln['_lob']||'').trim(), desc=(ln['Descripción']||'').toLowerCase();
    var cat=null;
    if(/\biphone\b/.test(desc)&&!/keyboard|mouse|pencil|case|cover|cable|adapter|folio/i.test(desc)) cat='iphone';
    else if(/\bipad\b/.test(desc)&&!/keyboard|mouse|pencil|case|cover|cable|adapter|folio/i.test(desc)) cat='ipad';
    else if(/\bmacbook\b|\bimac\b|\bmac\s*(mini|studio|pro|neo)\b|\bmbp(ro)?\b|\bmba(ir)?\b/i.test(desc)) cat='mac';
    else cat=MODEL_CATEGORY[lob];
    if(!cat) cat='acc';
    // Unidades: siempre se cuentan. Monto: solo si tiene precio
    var lMonto=price>0?qty*price:0;
    if(cat==='mac')         {_aqMM+=lMonto;_aqMU+=qty;}
    else if(cat==='iphone') {_aqIM+=lMonto;_aqIU+=qty;}
    else if(cat==='ipad')   {_aqPM+=lMonto;_aqPU+=qty;}
    else                    {_aqAM+=lMonto;_aqAU+=qty;}
  });
  // Usar promedio de todas las cotizaciones; fallback al promedio Facturado si no hay cotizaciones
  var aM = _aqMU>0 ? _aqMM/_aqMU : (pmTotMac >0 ? totMontoMac /pmTotMac  : 0);
  var aI = _aqIU>0 ? _aqIM/_aqIU : (pmTotIph >0 ? totMontoIph /pmTotIph  : 0);
  var aP = _aqPU>0 ? _aqPM/_aqPU : (pmTotIpad>0 ? totMontoIpad/pmTotIpad : 0);
  var aA = _aqAU>0 ? _aqAM/_aqAU : (pmTotAcc >0 ? totMontoAcc /pmTotAcc  : 0);
  var falta = Math.max(0, amount - totalFact);
  // Mix de unidades desde lo REALMENTE FACTURADO del año (coincide con los badges ✓ y el título "mix histórico").
  // Si todavía no hay nada facturado, cae al mix de todas las cotizaciones para no quedar en cero.
  var totalUnidadesFact = totMac + totIph + totIpad + totAcc;
  var totalUnidadesAllQ = _aqMU + _aqIU + _aqPU + _aqAU;
  var pctUMac, pctUIph, pctUIpad, pctUAcc;
  if(totalUnidadesFact > 0){
    pctUMac  = totMac  / totalUnidadesFact;
    pctUIph  = totIph  / totalUnidadesFact;
    pctUIpad = totIpad / totalUnidadesFact;
    pctUAcc  = totAcc  / totalUnidadesFact;
  } else if(totalUnidadesAllQ > 0){
    pctUMac  = _aqMU / totalUnidadesAllQ;
    pctUIph  = _aqIU / totalUnidadesAllQ;
    pctUIpad = _aqPU / totalUnidadesAllQ;
    pctUAcc  = _aqAU / totalUnidadesAllQ;
  } else {
    pctUMac = pctUIph = pctUIpad = pctUAcc = 0;
  }
  // Estimación: falta × proporción_familia / precio_promedio_familia
  // → siempre decrece cuando se factura más (falta baja), sin importar qué familia
  var estMac  = aM > 0 ? Math.round(falta * pctUMac  / aM) : 0;
  var estIph  = aI > 0 ? Math.round(falta * pctUIph  / aI) : 0;
  var estIpad = aP > 0 ? Math.round(falta * pctUIpad / aP) : 0;
  var estAcc  = aA > 0 ? Math.round(falta * pctUAcc  / aA) : 0;
  _tgtRevShare = { mac: pctUMac, iph: pctUIph, ipad: pctUIpad, acc: pctUAcc };
  var pct=amount>0?Math.min(100,(totalFact/amount)*100):0;
  var pctC=pct>=100?'#34c759':pct>=60?'#ff9f0a':'#0071e3';

  // ── Proyección: Autorizando + Con OC + Commit del pipeline activo (monto y unidades por familia) ──
  var montoConOC=0, montoCommit=0, montoAut=0;
  var ocMac=0,ocIph=0,ocIpad=0,ocAcc=0;
  var commitMac=0,commitIph=0,commitIpad=0,commitAcc=0;
  var autMac=0,autIph=0,autIpad=0,autAcc=0;
  function _catLn(ln){
    var lob=(ln['_lob']||'').trim(), desc=(ln['Descripción']||'').toLowerCase();
    var cat=null;
    if(/\biphone\b/.test(desc)&&!/keyboard|mouse|pencil|case|cover|cable|adapter|folio/i.test(desc)) cat='iphone';
    else if(/\bipad\b/.test(desc)&&!/keyboard|mouse|pencil|case|cover|cable|adapter|folio/i.test(desc)) cat='ipad';
    else if(/\bmacbook\b|\bimac\b|\bmac\s*(mini|studio|pro|neo)\b|\bmbp(ro)?\b|\bmba(ir)?\b/i.test(desc)) cat='mac';
    else cat=MODEL_CATEGORY[lob];
    if(!cat) cat='acc';
    return cat;
  }
  function _addUnits(st, qty, cat){
    if(st==='Autorizando'){
      if(cat==='mac') autMac+=qty; else if(cat==='iphone') autIph+=qty;
      else if(cat==='ipad') autIpad+=qty; else autAcc+=qty;
    } else if(st==='Con OC'){
      if(cat==='mac') ocMac+=qty; else if(cat==='iphone') ocIph+=qty;
      else if(cat==='ipad') ocIpad+=qty; else ocAcc+=qty;
    } else if(st==='Commit'){
      if(cat==='mac') commitMac+=qty; else if(cat==='iphone') commitIph+=qty;
      else if(cat==='ipad') commitIpad+=qty; else commitAcc+=qty;
    }
  }
  function _addRoot(st, pr){
    if(st==='Autorizando'){
      montoAut += pr.monto||0;
      autMac+=pr.qMac||0; autIph+=pr.qIph||0; autIpad+=pr.qIpad||0; autAcc+=pr.qAcc||0;
    } else if(st==='Con OC'){
      montoConOC += pr.monto||0;
      ocMac+=pr.qMac||0; ocIph+=pr.qIph||0; ocIpad+=pr.qIpad||0; ocAcc+=pr.qAcc||0;
    } else if(st==='Commit'){
      montoCommit += pr.monto||0;
      commitMac+=pr.qMac||0; commitIph+=pr.qIph||0; commitIpad+=pr.qIpad||0; commitAcc+=pr.qAcc||0;
    }
  }
  getPipeline().forEach(function(pr){
    var defSt  = pr.estado    || 'Cotizado';
    var hasOv  = (pr.skuStatus && Object.keys(pr.skuStatus).length)
              || (pr.skuPartialQty && Object.keys(pr.skuPartialQty).length);
    if(!hasOv){ _addRoot(defSt, pr); return; }
    var pLines = cevenOpcFilasDeCotiz(_tgtDB, pr.qNum, ['producto','garantia']);
    if(!pLines.length){ _addRoot(defSt, pr); return; }
    pLines.forEach(function(ln,idx){
      var lk  = (ln['SKU']||'')+'|'+idx;
      var st  = (pr.skuStatus && pr.skuStatus[lk]) || defSt;
      var archQ = (pr.skuArchivedQty && parseInt(pr.skuArchivedQty[lk])) || 0;
      var qty = Math.max(0,(parseInt(ln['Cantidad'])||0) - archQ);
      if(qty<=0) return;
      var prc = parseFloat(ln['P. Venta Unitario'])||0;
      var cat = _catLn(ln);
      if(st==='Facturado'){
        var pq = pr.skuPartialQty && parseInt(pr.skuPartialQty[lk]);
        if(pq>0 && pq<qty){
          var remSt=(pr.skuPartialRemSt&&pr.skuPartialRemSt[lk])||'Con OC';
          var remQty=qty-pq, remM=remQty*prc;
          if(remSt==='Autorizando') { montoAut    += remM; _addUnits('Autorizando', remQty, cat); }
          else if(remSt==='Con OC') { montoConOC  += remM; _addUnits('Con OC', remQty, cat); }
          else if(remSt==='Commit') { montoCommit += remM; _addUnits('Commit', remQty, cat); }
        }
      } else if(st==='Autorizando'){
        montoAut    += qty*prc; _addUnits('Autorizando', qty, cat);
      } else if(st==='Con OC'){
        montoConOC  += qty*prc; _addUnits('Con OC', qty, cat);
      } else if(st==='Commit'){
        montoCommit += qty*prc; _addUnits('Commit', qty, cat);
      }
    });
  });
  // Segmentos en orden de certeza: Facturado → Autorizando → Con OC → Commit
  var pctFact   = amount>0 ? Math.min(100, totalFact /amount*100) : 0;
  var pctAut    = amount>0 ? Math.min(Math.max(0,100-pctFact),                montoAut  /amount*100) : 0;
  var pctOC     = amount>0 ? Math.min(Math.max(0,100-pctFact-pctAut),         montoConOC/amount*100) : 0;
  var pctCommit = amount>0 ? Math.min(Math.max(0,100-pctFact-pctAut-pctOC), montoCommit/amount*100) : 0;
  var pctTotal  = pctFact + pctAut + pctOC + pctCommit;
  // Faltante real = target menos todo lo ya comprometido (Facturado + Autorizando + OC + Commit)
  var faltaReal = Math.max(0, amount - totalFact - montoAut - montoConOC - montoCommit);
  // Recalcular estimación con faltaReal
  estMac  = aM > 0 ? Math.round(faltaReal * pctUMac  / aM) : 0;
  estIph  = aI > 0 ? Math.round(faltaReal * pctUIph  / aI) : 0;
  estIpad = aP > 0 ? Math.round(faltaReal * pctUIpad / aP) : 0;
  estAcc  = aA > 0 ? Math.round(faltaReal * pctUAcc  / aA) : 0;

  var html='';

  // ── KPI cards ──
  html+='<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px;margin-bottom:16px">'
    +'<div class="tgt-kpi" style="background:#fff;border-radius:12px;padding:12px 14px;border:0.5px solid #d2d2d7">'
      +'<div class="tgt-lbl" style="font-size:11px;color:#6e6e73;text-transform:uppercase;letter-spacing:.4px;margin-bottom:4px">Target '+year+'</div>'
      +'<div class="tgt-val" style="font-size:20px;font-weight:700;color:#1d1d1f">'+(amount>0?'USD '+fI(amount):'No definido')+'</div>'
    +'</div>'
    +'<div class="tgt-kpi" style="background:#fff;border-radius:12px;padding:12px 14px;border:0.5px solid #d2d2d7">'
      +'<div class="tgt-lbl" style="font-size:11px;color:#6e6e73;text-transform:uppercase;letter-spacing:.4px;margin-bottom:4px">Facturado '+year+'</div>'
      +'<div style="font-size:20px;font-weight:700;color:#34c759">USD '+fI(totalFact)+'</div>'
    +'</div>'
    +'<div class="tgt-kpi" style="background:#fff;border-radius:12px;padding:12px 14px;border:0.5px solid #d2d2d7">'
      +'<div class="tgt-lbl" style="font-size:11px;color:#6e6e73;text-transform:uppercase;letter-spacing:.4px;margin-bottom:4px">Falta facturar</div>'
      +'<div style="font-size:20px;font-weight:700;color:'+(falta>0?'#ff3b30':'#34c759')+'">USD '+fI(falta)+'</div>'
    +'</div>'
  +'</div>';

  // ── Barra de progreso multi-segmento ──
  // Degradado verde: claro (facturado) → oscuro (commit)
  var clrFact  = '#34c759'; // Verde claro  – Facturado
  var clrAut   = '#22a85c'; // Verde medio-claro – Autorizando
  var clrOC    = '#1a8c40'; // Verde medio  – Con OC
  var clrCommit= '#0a5c28'; // Verde oscuro – Commit
  if(amount>0){
    var pTotC = pctTotal>=100?'#34c759':pctTotal>=60?'#1a8c40':'#8e8e93';
    var cumAut = pctFact + pctAut;
    var cumOC  = pctFact + pctAut + pctOC;
    // marcadores sobre la barra en los puntos de transición
    var barMarkers='';
    if(pctFact>3&&pctFact<96) barMarkers+='<span style="position:absolute;left:'+pctFact.toFixed(1)+'%;transform:translateX(-50%);font-size:9px;color:#8e8e93;white-space:nowrap">'+pctFact.toFixed(1)+'%</span>';
    if(pctAut>1&&cumAut<97) barMarkers+='<span style="position:absolute;left:'+cumAut.toFixed(1)+'%;transform:translateX(-50%);font-size:9px;color:#8e8e93;white-space:nowrap">'+cumAut.toFixed(1)+'%</span>';
    if(pctOC>1&&cumOC<97) barMarkers+='<span style="position:absolute;left:'+cumOC.toFixed(1)+'%;transform:translateX(-50%);font-size:9px;color:#8e8e93;white-space:nowrap">'+cumOC.toFixed(1)+'%</span>';
    html+='<div class="tgt-prog" style="background:#fff;border-radius:12px;padding:14px 16px;margin-bottom:16px;border:0.5px solid #d2d2d7">'
      +'<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">'
        +'<span style="font-size:12px;font-weight:600;color:#1d1d1f">Progreso anual</span>'
        +'<span style="font-size:12px;font-weight:700;color:'+pTotC+'">'+pctTotal.toFixed(1)+'% proyectado</span>'
      +'</div>'
      +(barMarkers?'<div style="position:relative;height:13px;margin-bottom:1px">'+barMarkers+'</div>':'<div style="height:4px"></div>')
      +'<div style="position:relative;background:#e5e5ea;border-radius:980px;height:10px;overflow:hidden;margin-bottom:10px">'
        +(pctFact>0?'<div style="position:absolute;left:0;top:0;height:100%;width:'+pctFact.toFixed(2)+'%;background:'+clrFact+'"></div>':'')
        +(pctAut>0?'<div style="position:absolute;left:'+pctFact.toFixed(2)+'%;top:0;height:100%;width:'+pctAut.toFixed(2)+'%;background:'+clrAut+'"></div>':'')
        +(pctOC>0?'<div style="position:absolute;left:'+cumAut.toFixed(2)+'%;top:0;height:100%;width:'+pctOC.toFixed(2)+'%;background:'+clrOC+'"></div>':'')
        +(pctCommit>0?'<div style="position:absolute;left:'+cumOC.toFixed(2)+'%;top:0;height:100%;width:'+pctCommit.toFixed(2)+'%;background:'+clrCommit+'"></div>':'')
      +'</div>'
      +'<div style="display:flex;gap:16px;flex-wrap:wrap">'
        +'<div style="display:flex;align-items:center;gap:5px">'
          +'<div style="width:8px;height:8px;border-radius:50%;background:'+clrFact+';flex-shrink:0"></div>'
          +'<span style="font-size:11px;color:#8e8e93">Facturado</span>'
          +'<span style="font-size:11px;font-weight:600;color:#1d1d1f">'+pctFact.toFixed(1)+'%</span>'
        +'</div>'
        +(pctAut>0?'<div style="display:flex;align-items:center;gap:5px">'
          +'<div style="width:8px;height:8px;border-radius:50%;background:'+clrAut+';flex-shrink:0"></div>'
          +'<span style="font-size:11px;color:#8e8e93">Autorizando</span>'
          +'<span style="font-size:11px;font-weight:600;color:#1d1d1f">+'+pctAut.toFixed(1)+'%<span style="font-weight:400;color:#8e8e93"> → '+cumAut.toFixed(1)+'%</span></span>'
        +'</div>':'')
        +(pctOC>0?'<div style="display:flex;align-items:center;gap:5px">'
          +'<div style="width:8px;height:8px;border-radius:50%;background:'+clrOC+';flex-shrink:0"></div>'
          +'<span style="font-size:11px;color:#8e8e93">Con OC</span>'
          +'<span style="font-size:11px;font-weight:600;color:#1d1d1f">+'+pctOC.toFixed(1)+'%<span style="font-weight:400;color:#8e8e93"> → '+cumOC.toFixed(1)+'%</span></span>'
        +'</div>':'')
        +(pctCommit>0?'<div style="display:flex;align-items:center;gap:5px">'
          +'<div style="width:8px;height:8px;border-radius:50%;background:'+clrCommit+';flex-shrink:0"></div>'
          +'<span style="font-size:11px;color:#8e8e93">Commit</span>'
          +'<span style="font-size:11px;font-weight:600;color:#1d1d1f">+'+pctCommit.toFixed(1)+'%<span style="font-weight:400;color:#8e8e93"> → '+pctTotal.toFixed(1)+'%</span></span>'
        +'</div>':'')
      +'</div>'
    +'</div>';
  }

  // ── Estimación unidades faltantes ──
  if(falta>0&&(estMac>0||estIph>0||estIpad>0||estAcc>0)){
    function _estRow(icon, label, estU, factU, autU, ocU, commitU, pctMix, avgPrice){
      if(estU<=0 && factU<=0 && autU<=0 && ocU<=0 && commitU<=0) return '';
      var badges='';
      if(factU>0)   badges+='<span style="color:#34c759;font-weight:600">✓ '+fI(factU)+' fact</span>';
      if(autU>0)    badges+=(badges?' · ':'')+'<span style="color:#169670;font-weight:600">'+fI(autU)+' autoriz.</span>';
      if(ocU>0)     badges+=(badges?' · ':'')+'<span style="color:#1a8c40;font-weight:600">'+fI(ocU)+' OC</span>';
      if(commitU>0) badges+=(badges?' · ':'')+'<span style="color:#7a5800;font-weight:600">'+fI(commitU)+' commit</span>';
      if(badges) badges+=' · ';
      return '<tr>'
        +'<td style="padding:6px 14px 6px 0;white-space:nowrap;font-size:13px">'+icon+' '+label+'</td>'
        +'<td style="padding:6px 10px;text-align:right;font-size:20px;font-weight:700;min-width:70px">'+(estU>0?fI(estU):'—')+'</td>'
        +'<td class="tgt-sub" style="padding:6px 0 6px 8px;font-size:11px;color:#a08030">'
          +(estU>0?'faltantes · ':'')
          +badges
          +Math.round(pctMix*100)+'% del mix · precio prom. USD '+fI(Math.round(avgPrice))
        +'</td>'
      +'</tr>';
    }
    var rows='';
    rows+=_estRow('🖥','Mac',   estMac, totMac, autMac, ocMac, commitMac, pctUMac, aM);
    rows+=_estRow('📱','iPhone',estIph, totIph, autIph, ocIph, commitIph, pctUIph, aI);
    rows+=_estRow('📟','iPad',  estIpad,totIpad,autIpad,ocIpad,commitIpad,pctUIpad,aP);
    rows+=_estRow('🔌','Acc',   estAcc, totAcc, autAcc, ocAcc, commitAcc, pctUAcc, aA);
    if(rows) html+='<div class="tgt-est" style="background:#fff8e1;border:0.5px solid #ffe082;border-radius:12px;padding:14px 16px;margin-bottom:16px">'
      +'<div class="tgt-lbl2" style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;color:#7a5800;margin-bottom:10px">Estimación unidades · mix histórico '+year+'</div>'
      +'<table style="border-collapse:collapse;width:100%"><tbody>'+rows+'</tbody></table>'
    +'</div>';
  }

  // ── Tabla mensual (limpia, click para editar) ──
  html+='<div class="tgt-table-wrap" style="background:#fff;border-radius:12px;overflow:hidden;border:0.5px solid #d2d2d7">'
    +'<div style="overflow-x:auto">'
    +'<table style="width:100%;border-collapse:collapse;font-size:12px">'
    +'<thead class="tgt-thead"><tr style="background:#fafafa;border-bottom:0.5px solid #e5e5e7">'
      +'<th style="text-align:left;padding:10px 12px;font-weight:600;min-width:90px">Mes</th>'
      +'<th style="text-align:right;padding:10px 12px;font-weight:600">Facturado USD</th>'
      +'<th style="text-align:center;padding:10px 10px;font-weight:600">Mac</th>'
      +'<th style="text-align:center;padding:10px 10px;font-weight:600">iPhone</th>'
      +'<th style="text-align:center;padding:10px 10px;font-weight:600">iPad</th>'
      +'<th style="text-align:center;padding:10px 10px;font-weight:600">Acc</th>'
      +'<th style="text-align:center;padding:10px 10px;font-weight:600">Serv</th>'
      +'<th style="text-align:right;padding:10px 12px;font-weight:600">Margen</th>'
      +'<th style="width:36px"></th>'
    +'</tr></thead><tbody>';

  for(var mi=0;mi<12;mi++){
    var mk=year+'-'+String(mi+1).padStart(2,'0');
    var pm4=pipe_m[mk], mn4=manual[mk]||{};
    var isCur=(mk===curYM), isFut=(mk>curYM);
    var editable=!isFut && _tgtConfigOpen;
    var hasAdj=mn4&&(mn4.monto||mn4.mac||mn4.iph||mn4.ipad||mn4.acc||mn4.serv||mn4.margen!=null);
    // Valores combinados
    var monto4=(pm4.monto||0)+(mn4.monto||0);
    var mac4=(pm4.mac||0)+(mn4.mac||0);
    var iph4=(pm4.iph||0)+(mn4.iph||0);
    var ipad4=(pm4.ipad||0)+(mn4.ipad||0);
    var acc4=(pm4.acc||0)+(mn4.acc||0);
    var serv4=(pm4.serv||0)+(mn4.serv||0);
    var marPipe4=pm4.marM>0?pm4.marW/pm4.marM:null;
    var marFinal=mn4.margen!=null?mn4.margen:marPipe4;
    var isOpen=(_tgtEditMonth===mk);
    var rowBg=isCur?'#f0f7ff':(isOpen?'#f5f0ff':'');
    var rowCls=isCur?'tgt-cur':(isOpen?'tgt-edit':'');

    // Fila principal
    html+='<tr data-mk="'+mk+'"'+(rowCls?' class="'+rowCls+'"':'')+' style="border-bottom:0.5px solid #f0f0f0;background:'+rowBg+'">'
      +'<td style="padding:9px 12px;font-weight:'+(isCur?'700':'400')+';color:'+(isCur?'#0071e3':'var(--ct1,#1d1d1f)');
    html+=';white-space:nowrap">'+meses[mi]+' '+year+(isCur?' ←':'')+(hasAdj?' <span style="font-size:9px;background:#e8f4ff;color:#0071e3;border-radius:6px;padding:1px 5px;font-weight:600">+ajuste</span>':'')+' </td>'
      +'<td style="padding:9px 12px;text-align:right;font-weight:600;color:'+(monto4>0?'#34c759':'var(--ct3,#aeaeb2)')+'">'+(monto4>0?'USD '+fI(monto4):'—')+'</td>'
      +'<td style="padding:9px 10px;text-align:center;color:'+(mac4>0?'var(--ct1,#1d1d1f)':'var(--ct3,#d2d2d7)')+'">'+(mac4||'—')+'</td>'
      +'<td style="padding:9px 10px;text-align:center;color:'+(iph4>0?'var(--ct1,#1d1d1f)':'var(--ct3,#d2d2d7)')+'">'+(iph4||'—')+'</td>'
      +'<td style="padding:9px 10px;text-align:center;color:'+(ipad4>0?'var(--ct1,#1d1d1f)':'var(--ct3,#d2d2d7)')+'">'+(ipad4||'—')+'</td>'
      +'<td style="padding:9px 10px;text-align:center;color:'+(acc4>0?'var(--ct1,#1d1d1f)':'var(--ct3,#d2d2d7)')+'">'+(acc4||'—')+'</td>'
      +'<td style="padding:9px 10px;text-align:center;color:'+(serv4>0?'var(--ct1,#1d1d1f)':'var(--ct3,#d2d2d7)')+'">'+(serv4||'—')+'</td>'
      +'<td style="padding:9px 12px;text-align:right;color:var(--ct2,#6e6e73)">'+(marFinal!=null?marFinal.toFixed(2)+'%':'—')+'</td>'
      +'<td style="padding:9px 8px;text-align:center">'
        +(editable?'<button data-tact="toggle" data-tmk="'+cevenEsc(mk)+'" style="background:none;border:0.5px solid var(--cb,#d2d2d7);border-radius:6px;cursor:pointer;font-size:11px;padding:2px 6px;font-family:inherit;color:var(--ct2,#6e6e73)" title="Ajuste manual">'+(isOpen?'▲':'✎')+'</button>':'')
      +'</td>'
    +'</tr>';

    // Sub-fila de edición (solo si está abierta)
    if(isOpen){
      var IS='class="tgt-inp no-spin" style="width:80px;padding:5px 8px;border:0.5px solid #d2d2d7;border-radius:6px;font-size:12px;font-family:inherit;background:#fff;text-align:right"';
      var IC='class="tgt-inp no-spin" style="width:60px;padding:5px 8px;border:0.5px solid #d2d2d7;border-radius:6px;font-size:12px;font-family:inherit;background:#fff;text-align:center"';
      html+='<tr class="tgt-edit" style="background:#f5f0ff;border-bottom:0.5px solid #d2d2d7">'
        +'<td colspan="9" style="padding:12px 14px">'
          +'<div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;color:#6e36c8;margin-bottom:10px">✎ Ajuste manual para '+meses[mi]+' '+year+' <span style="font-weight:400;color:var(--ct2,#6e6e73)">(se suma al dato del pipeline · pipeline: USD '+fI(pm4.monto||0)+')</span></div>'
          +'<div style="display:flex;flex-wrap:wrap;gap:12px;align-items:flex-end">'
            +'<div><div class="tgt-lbl" style="font-size:11px;color:#6e6e73;margin-bottom:4px">+Monto USD</div>'
              +'<input type="number" min="0" '+IS+' value="'+cevenEsc(mn4.monto||'')+'" placeholder="0"'
              +' data-tact="field" data-tfield="monto" data-tmk="'+cevenEsc(mk)+'"></div>'
            +'<div><div class="tgt-lbl" style="font-size:11px;color:#6e6e73;margin-bottom:4px">+Mac</div>'
              +'<input type="number" min="0" '+IC+' value="'+cevenEsc(mn4.mac||'')+'" placeholder="0"'
              +' data-tact="field" data-tfield="mac" data-tmk="'+cevenEsc(mk)+'"></div>'
            +'<div><div class="tgt-lbl" style="font-size:11px;color:#6e6e73;margin-bottom:4px">+iPhone</div>'
              +'<input type="number" min="0" '+IC+' value="'+cevenEsc(mn4.iph||'')+'" placeholder="0"'
              +' data-tact="field" data-tfield="iph" data-tmk="'+cevenEsc(mk)+'"></div>'
            +'<div><div class="tgt-lbl" style="font-size:11px;color:#6e6e73;margin-bottom:4px">+iPad</div>'
              +'<input type="number" min="0" '+IC+' value="'+cevenEsc(mn4.ipad||'')+'" placeholder="0"'
              +' data-tact="field" data-tfield="ipad" data-tmk="'+cevenEsc(mk)+'"></div>'
            +'<div><div class="tgt-lbl" style="font-size:11px;color:#6e6e73;margin-bottom:4px">+Acc</div>'
              +'<input type="number" min="0" '+IC+' value="'+cevenEsc(mn4.acc||'')+'" placeholder="0"'
              +' data-tact="field" data-tfield="acc" data-tmk="'+cevenEsc(mk)+'"></div>'
            +'<div><div class="tgt-lbl" style="font-size:11px;color:#6e6e73;margin-bottom:4px">+Serv</div>'
              +'<input type="number" min="0" '+IC+' value="'+cevenEsc(mn4.serv||'')+'" placeholder="0"'
              +' data-tact="field" data-tfield="serv" data-tmk="'+cevenEsc(mk)+'"></div>'
            +'<div><div class="tgt-lbl" style="font-size:11px;color:#6e6e73;margin-bottom:4px">Margen %</div>'
              +'<input type="number" min="0" max="100" step="0.01" '+IS+' value="'+cevenEsc(mn4.margen!=null?mn4.margen:'')+'" placeholder="auto"'
              +' data-tact="field" data-tfield="margen" data-tmk="'+cevenEsc(mk)+'"></div>'
            +'<div style="display:flex;gap:6px;margin-left:4px">'
              +'<button data-tact="toggle" data-tmk="'+cevenEsc(mk)+'" style="background:#0071e3;color:#fff;border:none;border-radius:8px;padding:7px 14px;font-size:12px;font-weight:600;cursor:pointer;font-family:inherit">Listo</button>'
              +(hasAdj?'<button data-tact="clear" data-tmk="'+cevenEsc(mk)+'" style="background:none;color:#d70015;border:0.5px solid #d70015;border-radius:8px;padding:7px 10px;font-size:12px;cursor:pointer;font-family:inherit">Borrar ajuste</button>':'')
            +'</div>'
          +'</div>'
        +'</td>'
      +'</tr>';
    }
  }

  // Fila total
  html+='<tr class="tgt-total" style="background:#1d1d1f;color:#fff;font-weight:700">'
    +'<td style="padding:10px 12px">Total '+year+'</td>'
    +'<td style="padding:10px 12px;text-align:right">USD '+fI(totalFact)+'</td>'
    +'<td style="padding:10px 10px;text-align:center">'+totMac+'</td>'
    +'<td style="padding:10px 10px;text-align:center">'+totIph+'</td>'
    +'<td style="padding:10px 10px;text-align:center">'+totIpad+'</td>'
    +'<td style="padding:10px 10px;text-align:center">'+totAcc+'</td>'
    +'<td style="padding:10px 10px;text-align:center">'+(totServ||'—')+'</td>'
    +'<td style="padding:10px 12px;text-align:right">'+(totMarM>0?(totMarW/totMarM).toFixed(2)+'%':'—')+'</td>'
    +'<td></td>'
  +'</tr>';

  html+='</tbody></table></div></div>';
  dash.innerHTML=html;
}

// Delegación de eventos del Target Anual (ajustes manuales por mes).
(function(){
  var dash = document.getElementById('target-dashboard');
  if(!dash) return;
  var pick = function(e){
    var el = e.target.closest ? e.target.closest('[data-tact]') : null;
    return (el && dash.contains(el)) ? el : null;
  };
  dash.addEventListener('change', function(e){
    var el = pick(e); if(!el) return;
    if(el.getAttribute('data-tact') === 'field'){
      saveTargetManualField(el.getAttribute('data-tmk'), el.getAttribute('data-tfield'), el.value);
    }
  });
  dash.addEventListener('click', function(e){
    var el = pick(e); if(!el) return;
    var mk = el.getAttribute('data-tmk');
    if(el.getAttribute('data-tact') === 'toggle')     toggleTargetEdit(mk);
    else if(el.getAttribute('data-tact') === 'clear') clearTargetManual(mk);
  });
})();

function clearTargetManual(mk){
  var data=getTargetManual();
  delete data[mk];
  try{localStorage.setItem('ctarget_manual',JSON.stringify(data));}catch(e){}
  renderTargetAnual();
}

