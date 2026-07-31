
function togglePipeMonthlyView(){
  window._pipeShowMonths = !window._pipeShowMonths;
  renderPipeline();
}

// Los filtros (mes/cliente/pills) y el sort de columnas viven en
// shared/pipeline-ui.js: eran identicos salvo que columnas arrancan
// descendentes, que ahora sale de brand.pipeSortDescCols.

// Recalcula qMac/qIph/qIpad/qServ/qAcc de entradas del pipeline desde las líneas del DB.
// Corrige cualquier categorización incorrecta guardada previamente (ej: MBAir detectada como acc).
function recalcPipelineUnits(){
  var pipe = getPipeline();
  var db = getDB();
  if(!db.length) return;
  var changed = false;
  pipe.forEach(function(r){
    if(!r.qNum) return;
    var lines = db.filter(function(x){
      return x['N° Cotización'] === r.qNum && (x['Tipo']==='producto' || x['Tipo']==='garantia');
    });
    if(!lines.length) return;
    var qM=0,qI=0,qP=0,qS=0,qA=0,monto=0,marW=0,marM=0;
    lines.forEach(function(ln, idx){
      var qty = parseInt(ln['Cantidad'])||0;
      // Descontar unidades ya facturadas y archivadas de esta línea
      var lk = (ln['SKU']||'')+'|'+idx;
      var arch = (r.skuArchivedQty && parseInt(r.skuArchivedQty[lk])) || 0;
      qty = Math.max(0, qty - arch);
      if(qty===0) return;
      // Monto efectivo de la porción no archivada
      var price = parseFloat(ln['P. Venta Unitario'])||0;
      var lineTot = qty * price;
      monto += lineTot;
      var mg = parseFloat(ln['Margen %']);
      if(!isNaN(mg) && lineTot>0){ marW += mg*lineTot; marM += lineTot; }
      if(ln['Tipo']==='garantia'){ qS+=qty; return; }
      var lob = (ln['_lob']||'').trim();
      var desc = (ln['Descripción']||'').toLowerCase();
      var cat = null;
      if(/\biphone\b/.test(desc) && !/keyboard|mouse|pencil|case|cover|cable|adapter|folio/i.test(desc)) cat='iphone';
      else if(/\bipad\b/.test(desc) && !/keyboard|mouse|pencil|case|cover|cable|adapter|folio/i.test(desc)) cat='ipad';
      else if(/\bmacbook\b|\bimac\b|\bmac\s*(mini|studio|pro|neo)\b|\bmbp(ro)?\b|\bmba(ir)?\b/i.test(desc)) cat='mac';
      else cat = MODEL_CATEGORY[lob];
      if(!cat){
        cat='acc';
      }
      if(cat==='iphone') qI+=qty;
      else if(cat==='ipad') qP+=qty;
      else if(cat==='mac') qM+=qty;
      else qA+=qty;
    });
    // Solo recalcular monto/margen cuando hay unidades archivadas (parciales);
    // las demás entradas conservan su monto original guardado.
    var hasArchived = r.skuArchivedQty && Object.keys(r.skuArchivedQty).length > 0;
    var newMonto = hasArchived ? Math.round(monto) : r.monto;
    var newMargen = hasArchived ? (marM>0 ? Math.round((marW/marM)*100)/100 : r.margenPond) : r.margenPond;
    if(r.qMac!==qM||r.qIph!==qI||r.qIpad!==qP||r.qServ!==qS||r.qAcc!==qA||r.monto!==newMonto||r.margenPond!==newMargen){
      r.qMac=qM; r.qIph=qI; r.qIpad=qP; r.qServ=qS; r.qAcc=qA;
      r.monto=newMonto; r.margenPond=newMargen;
      changed=true;
    }
  });
  if(changed) savePipeline(pipe);
}

function renderPipeline(){
  ensureTargetManualFechas(); // asegurar que ajustes manuales tengan fecha
  window._pipeLineKeysMap = {}; // reset mapa de lineKeys para filas virtuales

  // Re-ajustar pastillas (top clientes) al redimensionar la ventana (una sola vez)
  if(!window._pipeResizeBound){
    window._pipeResizeBound = true;
    var _pipeRT;
    window.addEventListener('resize', function(){
      clearTimeout(_pipeRT);
      _pipeRT = setTimeout(function(){
        var d = document.getElementById('pipe-dashboard');
        if(d && d.style.display !== 'none') renderPipeline();
      }, 200);
    });
  }

  // Recalcular unidades desde DB (corrige categorizaciones guardadas incorrectamente)
  recalcPipelineUnits();

  // El archivado automático NO va acá: lo hace _navApply('pipeline') en
  // shared/ui-core.js. Estaba en los dos lados, así que cada entrada al
  // pipeline escribía dos veces y disparaba dos veces la cadena de backup
  // (savePipeline → autoSnapshot → scheduleFullBackup). Además renderPipeline()
  // lo llama el poll de sync cada 15s, o sea que archivaba sin que nadie navegue.

  // Poblar selector de meses archivados
  var archive = getArchive();
  var archiveSel = document.getElementById('archive-month-sel');
  if(archiveSel){
    var archiveMonths = Object.keys(archive).sort().reverse();
    var curArchiveVal = archiveSel.value;
    var meses = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
    var newHtml = '<option value="">Pipeline actual</option>';
    archiveMonths.forEach(function(m){
      var p = m.split('-');
      var lbl = p.length===2 ? (meses[parseInt(p[1])-1]+' '+p[0]) : m;
      newHtml += '<option value="'+cevenEsc(m)+'">📦 '+cevenEsc(lbl)+'</option>';
    });
    if(archiveSel.innerHTML !== newHtml) archiveSel.innerHTML = newHtml;
    if(curArchiveVal && archiveMonths.indexOf(curArchiveVal) !== -1) archiveSel.value = curArchiveVal;
  }

  var selectedArchiveMonth = archiveSel ? archiveSel.value : '';

  // Si hay un mes archivado seleccionado, mostrar solo ese mes del archivo
  if(selectedArchiveMonth){
    renderArchiveMonth(selectedArchiveMonth, archive[selectedArchiveMonth] || []);
    return;
  }

  var pipe = getPipeline();
  // getDB() hace JSON.parse de cquotes (varios MB). Se llamaba dentro del loop de
  // expansión virtual, dentro de _pipeSkuOVState() y dentro de
  // renderPipelineDetailRow(): con 200 entradas eran ~200 parses de 2 MB por
  // render, y el poll de sync dispara renderPipeline() cada 15 s. Se parsea una
  // sola vez por pasada y se pasa hacia abajo.
  var pipeDB = getDB();
  var q = (document.getElementById('pipe-search').value||'').toLowerCase().trim();
  var ex = document.getElementById('pipe-exec').value || '';
  var fam = (document.getElementById('pipe-family')||{}).value || '';
  // Multi-select de estados: usar el array _pipeStatusFilters si tiene entradas
  var _stFilters = window._pipeStatusFilters || [];
  var st  = _stFilters.length === 1 ? _stFilters[0]
          : (_stFilters.length === 0 ? ((document.getElementById('pipe-status')||{}).value || '') : '');
  var monthFilter = window._pipeMonthFilter || '';

  // Poblar el dropdown de meses dinámicamente con todos los meses presentes
  // Considera tanto el mesCierre de la cotización como los skuMesCierre por SKU
  var allMonthValues = {};
  pipe.forEach(function(r){
    if(r.mesCierre) allMonthValues[r.mesCierre] = true;
    if(r.skuMesCierre){
      Object.keys(r.skuMesCierre).forEach(function(k){
        if(r.skuMesCierre[k]) allMonthValues[r.skuMesCierre[k]] = true;
      });
    }
  });
  // Pastillas de Cierre estimado (reemplazan al dropdown)
  var monthPills = document.getElementById('pipe-month-pills');
  if(monthPills){
    var sortedMonths = Object.keys(allMonthValues).sort();
    var meses = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
    var cur = monthFilter;
    function _mPill(val, label){
      var active = (cur === val) || (val==='' && !cur);
      var bg = active ? '#1d1d1f' : '#fff';
      var fg = active ? '#fff' : '#1d1d1f';
      var bd = active ? '#1d1d1f' : '#d2d2d7';
      return '<div class="pipe-mpill'+(active?' pipe-mpill-on':'')+'" data-pill="month" data-val="'+cevenEsc(val)+'" style="cursor:pointer;border:0.5px solid '+bd+';background:'+bg+';color:'+fg+';border-radius:980px;padding:5px 13px;font-size:12px;font-weight:'+(active?'600':'500')+';white-space:nowrap;transition:transform .1s">'+cevenEsc(label)+'</div>';
    }
    var pillsH = _mPill('', 'Todos') + _mPill('sin-fecha', 'Sin fecha');
    sortedMonths.forEach(function(m){
      var p = m.split('-');
      var lbl = p.length===2 ? (meses[parseInt(p[1])-1]+' '+p[0]) : m;
      pillsH += _mPill(m, lbl);
    });
    monthPills.innerHTML = pillsH;
  }

  // ── Top 3 clientes por cantidad de cotizaciones (siempre desde TODO el pipeline) ──
  var topClientsBox = document.getElementById('pipe-topclients-pills');
  if(topClientsBox){
    var cliCount = {};
    pipe.forEach(function(r){
      var cl = (r.cliente||'').trim();
      if(!cl || cl==='—') return;
      cliCount[cl] = (cliCount[cl]||0) + 1;
    });
    var topCli = Object.keys(cliCount).map(function(c){ return {cli:c, n:cliCount[c]}; });
    topCli.sort(function(a,b){ return b.n - a.n; });
    topCli = topCli.slice(0,5);
    var medals = ['🥇','🥈','🥉','4°','5°'];
    var curSearch = (document.getElementById('pipe-search').value||'').trim().toLowerCase();
    var tcH = '';
    topCli.forEach(function(t, i){
      var active = curSearch === t.cli.toLowerCase();
      var bg = active ? '#1d1d1f' : '#fff';
      var fg = active ? '#fff' : '#1d1d1f';
      var bd = active ? '#1d1d1f' : '#d2d2d7';
      // El nombre del cliente iba dentro de un string JS de un onclick, escapado
      // sólo con replace(/'/g,"\\'"). Ese escape no cubre la barra invertida: un
      // cliente llamado  \');alert(1);//  cerraba el string y ejecutaba lo que
      // siguiera. Ahora viaja en data-cli y lo lee el listener delegado.
      tcH += '<div class="pipe-mpill'+(active?' pipe-mpill-on':'')+'" data-pill="client" data-cli="'+cevenEsc(t.cli)+'" style="cursor:pointer;border:0.5px solid '+bd+';background:'+bg+';color:'+fg+';border-radius:980px;padding:5px 13px;font-size:12px;font-weight:'+(active?'600':'500')+';white-space:nowrap;transition:transform .1s">'
        +medals[i]+' '+cevenEsc(t.cli)+' <span style="opacity:.7;font-weight:400">· '+cevenEsc(t.n)+' cot.</span></div>';
    });
    topClientsBox.innerHTML = tcH || '<span style="font-size:12px;color:#aeaeb2">Sin cotizaciones</span>';
    // Ajustar a UNA sola fila: quitar clientes sobrantes si no entran (mínimo 3)
    (function fitTopClients(){
      var row = document.getElementById('pipe-pills-row');
      if(!row) return;
      var guard = 0;
      while(row.scrollWidth > row.clientWidth + 1 && topClientsBox.children.length > 3 && guard < 8){
        topClientsBox.removeChild(topClientsBox.lastElementChild);
        guard++;
      }
    })();
  }

  var filtered = pipe.filter(function(r){
    if(ex && r.ejecutivo !== ex) return false;
    if(q){
      var hay = ((r.cliente||'')+' '+(r.proyecto||'')+' '+(r.qNum||'')).toLowerCase();
      if(hay.indexOf(q) === -1) return false;
    }
    if(fam === 'mac'    && !(r.qMac>0))  return false;
    if(fam === 'iphone' && !(r.qIph>0))  return false;
    if(fam === 'ipad'   && !(r.qIpad>0)) return false;
    if(fam === 'serv'   && !(r.qServ>0)) return false;
    if(fam === 'acc'    && !(r.qAcc>0))  return false;
    // No descartar por estado raíz a las cotizaciones con facturación parcial / estados por SKU:
    // se dejan pasar a la expansión virtual y luego se filtran fila por fila (ver más abajo).
    var _hasStOverrides = (r.skuStatus && Object.keys(r.skuStatus).length) || (r.skuPartialQty && Object.keys(r.skuPartialQty).length);
    if(_stFilters.length > 0 && !_hasStOverrides && _stFilters.indexOf(r.estado||'Cotizado') === -1) return false;
    if(monthFilter){
      // Si filtro = sin-fecha, sólo entradas sin mesCierre (y sin override por SKU que tenga fecha)
      // Si filtro = YYYY-MM, sólo entradas que tengan ese mes (en mesCierre principal o en algún skuMesCierre)
      var hasMatchingMonth = false;
      if(monthFilter === 'sin-fecha'){
        if(!r.mesCierre && (!r.skuMesCierre || !Object.keys(r.skuMesCierre).length)){
          hasMatchingMonth = true;
        }
      } else {
        if(r.mesCierre === monthFilter) hasMatchingMonth = true;
        if(!hasMatchingMonth && r.skuMesCierre){
          var keys = Object.keys(r.skuMesCierre);
          for(var i=0;i<keys.length;i++){
            if(r.skuMesCierre[keys[i]] === monthFilter){ hasMatchingMonth = true; break; }
          }
        }
      }
      if(!hasMatchingMonth) return false;
    }
    return true;
  });
  // Aplicar ordenamiento dinámico
  var sortCol = window._pipeSort.col;
  var sortDir = window._pipeSort.dir;
  var numericCols = {monto:1, qMac:1, qIph:1, qIpad:1, qServ:1, qAcc:1, margenPond:1};
  filtered.sort(function(a,b){
    var av = a[sortCol], bv = b[sortCol];
    // Normalizar undefined/null
    if(av === undefined || av === null) av = numericCols[sortCol] ? 0 : '';
    if(bv === undefined || bv === null) bv = numericCols[sortCol] ? 0 : '';
    var cmp;
    if(numericCols[sortCol]){
      cmp = (parseFloat(av)||0) - (parseFloat(bv)||0);
    } else {
      cmp = String(av).localeCompare(String(bv));
    }
    return sortDir === 'asc' ? cmp : -cmp;
  });

  // ── EXPANSIÓN VIRTUAL ──
  // Si una entrada tiene skuStatus o skuMesCierre con valores distintos al global,
  // se "explota" en sub-filas virtuales agrupadas por (estado, mes_cierre)
  // Cuando hay un filtro de mes activo, las cotizaciones que pasen el filtro
  // se expanden también para mostrar solo los SKUs del mes filtrado.
  var virtualRows = [];
  filtered.forEach(function(r){
    var hasSkuOverrides = (r.skuStatus && Object.keys(r.skuStatus).length) ||
                          (r.skuMesCierre && Object.keys(r.skuMesCierre).length) ||
                          (r.skuPartialQty && Object.keys(r.skuPartialQty).length);
    if(!hasSkuOverrides && !monthFilter){
      virtualRows.push(r);
      return;
    }
    // Buscar todas las líneas de la cotización
    var lines = pipeDB.filter(function(x){
      return x['N° Cotización'] === r.qNum && (x['Tipo']==='producto' || x['Tipo']==='garantia');
    });
    if(!lines.length){ virtualRows.push(r); return; }

    // Agrupar líneas por (estado, mesCierre)
    var groups = {};
    var defaultStatus = r.estado || 'Cotizado';
    var defaultMes = r.mesCierre || '';
    lines.forEach(function(ln, idx){
      var lineKey = (ln['SKU']||'') + '|' + idx;
      var st = (r.skuStatus && r.skuStatus[lineKey]) || defaultStatus;
      var mc = (r.skuMesCierre && r.skuMesCierre[lineKey] !== undefined) ? r.skuMesCierre[lineKey] : defaultMes;

      // Descontar unidades ya archivadas (facturadas en meses anteriores)
      var archQty = (r.skuArchivedQty && parseInt(r.skuArchivedQty[lineKey])) || 0;
      var lnEffQty = (parseInt(ln['Cantidad'])||0) - archQty;
      if(lnEffQty <= 0) return; // línea totalmente archivada
      if(archQty > 0){ ln = Object.assign({}, ln); ln['Cantidad'] = lnEffQty; }

      // ── Facturación parcial ──────────────────────────────────────────────
      // Si la línea está Facturada y tiene un qty parcial, dividirla en dos grupos:
      // uno Facturado (qty parcial) y uno con el estado restante (qty sobrante).
      var partQty = r.skuPartialQty && parseInt(r.skuPartialQty[lineKey]);
      var totalLnQty = parseInt(ln['Cantidad']) || 0;
      if(partQty > 0 && partQty < totalLnQty && st === 'Facturado'){
        var remQty = totalLnQty - partQty;
        var remSt = (r.skuPartialRemSt && r.skuPartialRemSt[lineKey]) || defaultStatus;
        var remMc = (r.skuPartialRemMes && r.skuPartialRemMes[lineKey] !== undefined) ? r.skuPartialRemMes[lineKey] : defaultMes;
        // Grupo Facturado parcial
        if(!monthFilter || (mc||'sin-fecha') === monthFilter){
          var lnF = Object.assign({}, ln); lnF['Cantidad'] = partQty;
          var gkF = 'Facturado||' + mc;
          if(!groups[gkF]) groups[gkF] = {estado:'Facturado', mesCierre:mc, lines:[], lineKeys:[]};
          groups[gkF].lines.push(lnF);
          groups[gkF].lineKeys.push(lineKey);
        }
        // Grupo restante
        if(!monthFilter || (remMc||'sin-fecha') === monthFilter){
          var lnR = Object.assign({}, ln); lnR['Cantidad'] = remQty;
          var gkR = remSt + '||' + remMc;
          if(!groups[gkR]) groups[gkR] = {estado:remSt, mesCierre:remMc, lines:[], lineKeys:[]};
          groups[gkR].lines.push(lnR);
          groups[gkR].lineKeys.push('REM|' + lineKey); // marcador especial de "resto"
        }
        return; // no pasar por el flujo normal para esta línea
      }
      // ────────────────────────────────────────────────────────────────────

      // Si hay filtro de mes activo, descartar SKUs que no matcheen
      if(monthFilter){
        var skuMonth = mc || 'sin-fecha';
        if(skuMonth !== monthFilter) return;
      }
      var gKey = st + '||' + mc;
      if(!groups[gKey]){ groups[gKey] = {estado: st, mesCierre: mc, lines: [], lineKeys: []}; }
      groups[gKey].lines.push(ln);
      groups[gKey].lineKeys.push(lineKey);
    });
    var groupKeys = Object.keys(groups);
    if(groupKeys.length === 0){
      // Cuando hay filtro de mes y ningún SKU matchea, no agregar nada
      return;
    }
    if(groupKeys.length === 1 && !hasSkuOverrides && !monthFilter){
      virtualRows.push(r);
      return;
    }
    // Generar una fila virtual por grupo
    var totalLines = lines.length; // total de líneas de la cotización
    groupKeys.forEach(function(gk){
      var g = groups[gk];
      var v = Object.assign({}, r);
      v._virtual = true;
      v._parentId = r.id;
      v._groupKey = gk;
      v._lineKeys = g.lineKeys;
      v._isPartial = g.lineKeys.length < totalLines; // true solo si es un subconjunto real
      v._hasOverrides = hasSkuOverrides; // false = virtual por filtro de mes, no por overrides reales
      v.estado = g.estado;
      v.mesCierre = g.mesCierre;
      // Recalcular cantidades y monto por familia para ESTE grupo
      var qM=0, qI=0, qP=0, qS=0, qA=0, mont=0, marW=0, marM=0;
      g.lines.forEach(function(ln){
        var qty = parseInt(ln['Cantidad'])||0;
        var price = parseFloat(ln['P. Venta Unitario'])||0;
        var lineTotal = qty * price;
        mont += lineTotal;
        if(ln['Tipo'] === 'garantia'){ qS += qty; return; }
        var lnLob  = (ln['_lob'] || '').trim();
        var lnDesc = (ln['Descripción'] || '').toLowerCase();
        // Misma lógica que categorize(): la descripción manda primero, lookup por Model como fallback
        var lnCat = null;
        if(/\biphone\b/.test(lnDesc) && !/keyboard|mouse|pencil|case|cover|cable|adapter|folio/i.test(lnDesc)) lnCat = 'iphone';
        else if(/\bipad\b/.test(lnDesc) && !/keyboard|mouse|pencil|case|cover|cable|adapter|folio/i.test(lnDesc)) lnCat = 'ipad';
        else if(/\bmacbook\b|\bimac\b|\bmac\s*(mini|studio|pro|neo)\b|\bmbp(ro)?\b|\bmba(ir)?\b/i.test(lnDesc)) lnCat = 'mac';
        else lnCat = MODEL_CATEGORY[lnLob];
        if(!lnCat) lnCat = 'acc';
        if(lnCat === 'iphone') qI += qty;
        else if(lnCat === 'ipad') qP += qty;
        else if(lnCat === 'mac') qM += qty;
        else qA += qty;
        // Margen ponderado por línea (solo productos con margen)
        var mg = parseFloat(ln['Margen %']);
        if(!isNaN(mg)){ marW += mg * lineTotal; marM += lineTotal; }
      });
      v.qMac = qM; v.qIph = qI; v.qIpad = qP; v.qServ = qS; v.qAcc = qA;
      v.monto = Math.round(mont);
      v.margenPond = marM > 0 ? Math.round((marW/marM)*100)/100 : null;
      virtualRows.push(v);
    });
  });
  filtered = virtualRows;

  // Filtro de estado aplicado fila por fila (incluye filas virtuales de facturación parcial):
  // así, p. ej., bajo "Facturado" no se cuela la porción "Con OC" de una cotización parcial.
  if(_stFilters.length > 0){
    filtered = filtered.filter(function(v){ return _stFilters.indexOf(v.estado||'Cotizado') !== -1; });
  }

  // ── DASHBOARD: totales y por estado ──
  var sumMonto = 0, sumMac=0, sumIph=0, sumIpad=0, sumServ=0, sumAcc=0;
  var amtMac=0, amtIph=0, amtIpad=0, amtServ=0, amtAcc=0;
  var byStatus = {};
  var byStatusMonth = {};
  var allMonths = {};
  var hasNoMonth = false;
  var sumMargenMontoG = 0; // Σ(margen × monto) para ponderado global
  var sumMontoMargenG = 0; // Σ(monto) de cotizaciones con margen
  var _dashCurMonth = currentMonthKey();
  for(var i=0;i<filtered.length;i++){
    var r = filtered[i];
    var estado = r.estado || 'Cotizado';
    // Ignorar filas Facturado de meses pasados que son parciales no archivadas
    // (el Target Anual las sigue contando via _acumFacturado)
    if(estado === 'Facturado' && r.mesCierre && r.mesCierre < _dashCurMonth) continue;
    var monto = r.monto || 0;
    sumMonto += monto;
    var isFactPerd = !st && (estado === 'Facturado' || estado === 'Perdido');
    sumMac += r.qMac || 0;
    sumIph += r.qIph || 0;
    sumIpad += r.qIpad || 0;
    sumServ += r.qServ || 0;
    sumAcc  += r.qAcc  || 0;
    // Montos del pipeline activo (excluir Facturado y Perdido — van al card verde/negro)
    if(!isFactPerd){
      var totalQty = (r.qMac||0) + (r.qIph||0) + (r.qIpad||0) + (r.qServ||0) + (r.qAcc||0);
      if(totalQty > 0){
        amtMac  += monto * (r.qMac||0)  / totalQty;
        amtIph  += monto * (r.qIph||0)  / totalQty;
        amtIpad += monto * (r.qIpad||0) / totalQty;
        amtServ += monto * (r.qServ||0) / totalQty;
        amtAcc  += monto * (r.qAcc||0)  / totalQty;
      }
    }
    var isFOB = esFOBEntry(r);
    if(!byStatus[estado]) byStatus[estado] = {count:0, monto:0, marW:0, marM:0, qMac:0, qIph:0, qIpad:0, qServ:0, qAcc:0};
    byStatus[estado].count++;
    byStatus[estado].monto += monto;
    byStatus[estado].qMac  += r.qMac  || 0;
    byStatus[estado].qIph  += r.qIph  || 0;
    byStatus[estado].qIpad += r.qIpad || 0;
    byStatus[estado].qServ += r.qServ || 0;
    byStatus[estado].qAcc  += r.qAcc  || 0;
    if(typeof r.margenPond === 'number' && monto > 0){
      byStatus[estado].marW += r.margenPond * monto;
      byStatus[estado].marM += monto;
    }
    // Acumular margen ponderado global: Σ(margen × monto) / Σ(monto)
    if(typeof r.margenPond === 'number' && monto > 0){
      sumMargenMontoG += r.margenPond * monto;
      sumMontoMargenG += monto;
    }
    // Acumular por estado x mes de cierre
    var mesKey = r.mesCierre || 'sin-fecha';
    if(!byStatusMonth[estado]) byStatusMonth[estado] = {};
    if(!byStatusMonth[estado][mesKey]) byStatusMonth[estado][mesKey] = {count:0, monto:0, marW:0, marM:0};
    byStatusMonth[estado][mesKey].count++;
    byStatusMonth[estado][mesKey].monto += monto;
    if(typeof r.margenPond === 'number' && monto > 0){
      byStatusMonth[estado][mesKey].marW += r.margenPond * monto;
      byStatusMonth[estado][mesKey].marM += monto;
    }
    if(mesKey !== 'sin-fecha') allMonths[mesKey] = true;
    if(mesKey === 'sin-fecha') hasNoMonth = true;
  }
  var margenPondGlobal = sumMontoMargenG > 0 ? (sumMargenMontoG / sumMontoMargenG) : 0;
  // Total pipeline = Total − Facturado − Perdido (solo cuando no hay filtro de estado activo)
  var facturadoData = byStatus['Facturado'] || {count:0, monto:0, marW:0, marM:0};
  var perdidoData   = byStatus['Perdido']   || {count:0, monto:0, marW:0, marM:0};
  var sumPipeline   = st ? sumMonto : (sumMonto - facturadoData.monto - perdidoData.monto);
  var pipelineMargenW = st ? sumMargenMontoG : (sumMargenMontoG - (facturadoData.marW||0) - (perdidoData.marW||0));
  var pipelineMargenM = st ? sumMontoMargenG : (sumMontoMargenG - (facturadoData.marM||0) - (perdidoData.marM||0));
  var margenPipelineGlobal = pipelineMargenM > 0 ? (pipelineMargenW / pipelineMargenM) : 0;

  var dash = document.getElementById('pipe-dashboard');
  if(filtered.length){
    // Cuando hay filtro de estado: mostrar unidades directas del filtro
    // Cuando no: excluir Facturado/Perdido del dashboard general
    var fD = byStatus['Facturado'] || {qMac:0,qIph:0,qIpad:0,qServ:0,qAcc:0,monto:0,count:0,marW:0,marM:0};
    var pipeMac  = st ? sumMac : (sumMac  - (fD.qMac||0)  - (byStatus['Perdido']||{qMac:0}).qMac);
    var pipeIph  = st ? sumIph : (sumIph  - (fD.qIph||0)  - (byStatus['Perdido']||{qIph:0}).qIph);
    var pipeIpad = st ? sumIpad: (sumIpad - (fD.qIpad||0) - (byStatus['Perdido']||{qIpad:0}).qIpad);
    var pipeServ = st ? sumServ: (sumServ - (fD.qServ||0) - (byStatus['Perdido']||{qServ:0}).qServ);
    var pipeAcc  = st ? sumAcc : (sumAcc  - (fD.qAcc||0)  - (byStatus['Perdido']||{qAcc:0}).qAcc);

    dash.style.display = 'block';
    document.getElementById('dash-count').textContent = filtered.length;
    document.getElementById('dash-mac').textContent   = pipeMac  || '—';
    document.getElementById('dash-iph').textContent   = pipeIph  || '—';
    document.getElementById('dash-ipad').textContent  = pipeIpad || '—';
    document.getElementById('dash-serv').textContent  = pipeServ || '—';
    document.getElementById('dash-acc').textContent   = pipeAcc  || '—';
    document.getElementById('dash-mac-amt').textContent  = amtMac  ? 'USD ' + fI(amtMac)  : '';
    document.getElementById('dash-iph-amt').textContent  = amtIph  ? 'USD ' + fI(amtIph)  : '';
    document.getElementById('dash-ipad-amt').textContent = amtIpad ? 'USD ' + fI(amtIpad) : '';
    document.getElementById('dash-serv-amt').textContent = amtServ ? 'USD ' + fI(amtServ) : '';
    document.getElementById('dash-acc-amt').textContent  = amtAcc  ? 'USD ' + fI(amtAcc)  : '';
    document.getElementById('dash-total').textContent    = 'USD ' + fI(sumPipeline);
    document.getElementById('dash-margen').textContent   = sumMontoMargenG > 0 ? ('MgPd ' + margenPipelineGlobal.toFixed(2) + '%') : 'MgPd —';
    // ── Card Proyectado = Facturado + Autorizando + Con OC + Commit ──
    (function(){
      var proySt = ['Facturado','Autorizando','Con OC','Commit'];
      var pMonto=0,pMarW=0,pMarM=0,pMac=0,pIph=0,pIpad=0,pAcc=0,pServ=0;
      proySt.forEach(function(ps){ var d=byStatus[ps]; if(!d) return;
        pMonto+=d.monto||0; pMarW+=d.marW||0; pMarM+=d.marM||0;
        pMac+=d.qMac||0; pIph+=d.qIph||0; pIpad+=d.qIpad||0; pAcc+=d.qAcc||0; pServ+=d.qServ||0;
      });
      var pv = document.getElementById('dash-proy');
      var pm = document.getElementById('dash-proy-mgpd');
      if(pv) pv.textContent = 'USD ' + fI(pMonto);
      if(pm){
        var pu=[];
        if(pMac)  pu.push(pMac+' Mac');
        if(pIph)  pu.push(pIph+' iPhone');
        if(pIpad) pu.push(pIpad+' iPad');
        if(pAcc)  pu.push(pAcc+' Acc');
        if(pServ) pu.push(pServ+' Serv');
        pm.innerHTML = (pMarM>0 ? ('MgPd ' + (pMarW/pMarM).toFixed(2) + '%') : 'MgPd —')
          + (pu.length ? '<br><span style="font-size:10px;opacity:.75">'+pu.join(' · ')+'</span>' : '');
      }
    })();
    // Restaurar card negro (Total pipeline) — puede haber sido rojo si se venía de mes archivado
    var _tc = document.getElementById('dash-total-card');
    var _tl = document.getElementById('dash-total-lbl');
    var _tm = document.getElementById('dash-margen');
    if(_tc) { _tc.style.background = '#1d1d1f'; _tc.style.color = '#fff'; }
    if(_tl) { _tl.style.color = '#aeaeb2'; _tl.textContent = st ? ('Total ' + st) : 'Total pipeline'; }
    var _tv = document.getElementById('dash-total');
    if(_tv) _tv.style.color = '';
    if(_tm) _tm.style.color = '#aeaeb2';

    // Facturado card: cuando hay filtro de estado activo, mostrar datos de ese estado
    // Cuando no hay filtro, mostrar solo el Facturado de la sesión
    var cardFactData = st ? (byStatus[st] || {qMac:0,qIph:0,qIpad:0,qServ:0,qAcc:0,monto:0,count:0,marW:0,marM:0}) : fD;
    var cardFactLbl  = st || 'Facturado';
    var cardFactColors = {
      'Proyecto':    {card:'#6e36c8', sub:'#c9a9f0'},
      'Cotizado':    {card:'#0071e3', sub:'#80b8f5'},
      'Negociacion': {card:'#c84e00', sub:'#f0a070'},
      'Commit':      {card:'#7a5800', sub:'#c8a050'},
      'Con OC':      {card:'#15863a', sub:'#70c890'},
      'Autorizando': {card:'#169670', sub:'#8ccdb0'},
      'Facturado':   {card:'#17a589', sub:'#a5d6a7'},
      'Perdido':     {card:'#a80011', sub:'#f09090'}
    };
    var fcCard = document.getElementById('dash-facturado-card');
    var fcLbl  = document.getElementById('dash-facturado-lbl');
    var fcMgPd = document.getElementById('dash-facturado-mgpd');
    var fcColor = cardFactColors[cardFactLbl] || cardFactColors['Facturado'];
    if(fcCard) fcCard.style.background = fcColor.card;
    if(fcLbl)  fcLbl.style.color = fcColor.sub;
    if(fcLbl)  fcLbl.textContent = cardFactLbl;
    if(fcMgPd) fcMgPd.style.color = fcColor.sub;
    document.getElementById('dash-facturado').textContent = 'USD ' + fI(cardFactData.monto);
    var factMgPdTxt = cardFactData.marM > 0 ? ('MgPd ' + (cardFactData.marW / cardFactData.marM).toFixed(2) + '%') : 'MgPd —';
    var factUnits = [];
    if(cardFactData.qMac)  factUnits.push(cardFactData.qMac+' Mac');
    if(cardFactData.qIph)  factUnits.push(cardFactData.qIph+' iPhone');
    if(cardFactData.qIpad) factUnits.push(cardFactData.qIpad+' iPad');
    if(cardFactData.qAcc)  factUnits.push(cardFactData.qAcc+' Acc');
    if(cardFactData.qServ) factUnits.push(cardFactData.qServ+' Serv');
    if(fcMgPd) fcMgPd.innerHTML = factMgPdTxt
      + (factUnits.length ? '<br><span style="font-size:10px;opacity:.75">'+factUnits.join(' · ')+'</span>' : '');

    // Pills por estado — mostrar siempre TODOS, incluso los que están en 0
    var statusOrder = ['Proyecto','Cotizado','Negociacion','Commit','Con OC','Autorizando','Facturado','Perdido'];
    var statusColors = {
      'Proyecto':    {bg:'#f2e8ff', fg:'#6e36c8'},
      'Cotizado':    {bg:'#e8f4ff', fg:'#0071e3'},
      'Negociacion': {bg:'#fff3e0', fg:'#c84e00'},
      'Commit':      {bg:'#fff8e1', fg:'#7a5800'},
      'Con OC':      {bg:'#e8f6ee', fg:'#15863a'},
      'Autorizando': {bg:'#d4f0de', fg:'#0e7a52'},
      'Facturado':   {bg:'#b8e8cc', fg:'#0a5c30'},
      'Perdido':     {bg:'#fbbebe', fg:'#a80011'}
    };
    // ── BLOQUE POR ESTADO + APERTURA POR MES ──
    var pillsHtml = '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;width:100%">'
      +'<div style="font-size:11px;color:#6e6e73;text-transform:uppercase;letter-spacing:.4px">Por estado</div>'
      +'<button class="bs" data-pill="months" id="pipe-toggle-months" style="font-size:11px;padding:3px 10px">'+(window._pipeShowMonths?'Ocultar meses':'Ver por mes')+'</button>'
    +'</div>';

    if(!window._pipeShowMonths){
      // Vista compacta: pills por estado
      pillsHtml += '<div style="display:flex;flex-wrap:wrap;gap:6px;width:100%">';
      statusOrder.forEach(function(s){
        var data = byStatus[s] || {count:0, monto:0, marW:0, marM:0};
        var c = statusColors[s] || {bg:'#f2f2f7', fg:'#1d1d1f'};
        var dim = data.count === 0 ? ';opacity:.45' : '';
        var isActive = window._pipeStatusFilters && window._pipeStatusFilters.indexOf(s) !== -1;
        var activeBorder = isActive ? ';outline:2px solid '+c.fg+';outline-offset:1px' : '';
        var pondTxt = '';
        if(data.marM > 0){
          var pond = data.marW / data.marM;
          pondTxt = ' · MgPd ' + pond.toFixed(2) + '%';
        }
        pillsHtml += '<div class="spill spill-'+s.replace(/ /g,'')+'" data-pill="status" data-st="'+cevenEsc(s)+'" style="background:'+c.bg+';color:'+c.fg+';border-radius:980px;padding:6px 12px;font-size:12px;display:inline-flex;align-items:center;gap:6px;cursor:pointer;transition:transform .1s'+activeBorder+dim+'">'
          +'<strong>'+cevenEsc(s)+'</strong>'
          +'<span style="opacity:.85">· '+data.count+' cot. · USD '+fI(data.monto)+pondTxt+'</span>'
          +'</div>';
      });
      pillsHtml += '</div>';
    } else {
      // Vista expandida: matriz Estado × Mes
      // Ordenar meses cronológicamente, "sin-fecha" al final
      var monthList = Object.keys(allMonths).sort();
      if(hasNoMonth) monthList.push('sin-fecha');

      var meses = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
      function fmtMonth(m){
        if(m === 'sin-fecha') return 'Sin fecha';
        var p = m.split('-');
        if(p.length === 2){
          var idx = parseInt(p[1])-1;
          return idx>=0 && idx<12 ? (meses[idx]+' '+p[0].slice(2)) : m;
        }
        return m;
      }

      pillsHtml += '<div class="pipe-month-wrap" style="overflow-x:auto;border:0.5px solid #d2d2d7;border-radius:10px;background:#fff;width:100%">';
      pillsHtml += '<table style="width:100%;font-size:12px;border-collapse:collapse;min-width:'+(140+monthList.length*120)+'px">';
      pillsHtml += '<thead><tr><th style="text-align:left;padding:8px 12px;background:#fafafa;border-bottom:0.5px solid #e5e5e7;position:sticky;left:0;z-index:2">Estado</th>';
      monthList.forEach(function(m){
        pillsHtml += '<th style="text-align:right;padding:8px 12px;background:#fafafa;border-bottom:0.5px solid #e5e5e7;font-weight:600;white-space:nowrap;min-width:110px">'+cevenEsc(fmtMonth(m))+'</th>';
      });
      pillsHtml += '<th style="text-align:right;padding:8px 12px;background:#fafafa;border-bottom:0.5px solid #e5e5e7;font-weight:700;white-space:nowrap">Total</th>';
      pillsHtml += '</tr></thead><tbody>';

      statusOrder.forEach(function(s){
        var sData = byStatus[s] || {count:0, monto:0, marW:0, marM:0};
        if(sData.count === 0) return; // ocultar estados vacíos en matriz
        var c = statusColors[s] || {bg:'#f2f2f7', fg:'#1d1d1f'};
        pillsHtml += '<tr>'
          +'<td style="padding:8px 12px;border-bottom:0.5px solid #f0f0f0;position:sticky;left:0;background:#fff;z-index:1">'
            +'<span class="spill spill-'+s.replace(/ /g,'')+'" style="background:'+c.bg+';color:'+c.fg+';border-radius:980px;padding:3px 10px;font-size:11px;font-weight:700">'+cevenEsc(s)+'</span>'
          +'</td>';
        monthList.forEach(function(m){
          var d = (byStatusMonth[s]||{})[m] || {count:0, monto:0, marW:0, marM:0};
          if(d.count === 0){
            pillsHtml += '<td style="padding:8px 12px;text-align:right;border-bottom:0.5px solid #f0f0f0;color:#d2d2d7">—</td>';
          } else {
            var cellMgPd = d.marM > 0 ? (d.marW / d.marM).toFixed(2) + '%' : '—';
            pillsHtml += '<td style="padding:8px 12px;text-align:right;border-bottom:0.5px solid #f0f0f0;white-space:nowrap">'
              +'<div style="font-weight:600">USD '+fI(d.monto)+'</div>'
              +'<div style="font-size:10px;color:#6e6e73">'+d.count+' cot. · MgPd '+cellMgPd+'</div>'
            +'</td>';
          }
        });
        var rowMgPd = sData.marM > 0 ? (sData.marW / sData.marM).toFixed(2) + '%' : '—';
        pillsHtml += '<td style="padding:8px 12px;text-align:right;border-bottom:0.5px solid #f0f0f0;background:#fafafa;white-space:nowrap">'
          +'<div style="font-weight:700">USD '+fI(sData.monto)+'</div>'
          +'<div style="font-size:10px;color:#6e6e73">'+sData.count+' cot. · MgPd '+rowMgPd+'</div>'
        +'</td>';
        pillsHtml += '</tr>';
      });

      // Fila de totales por mes
      pillsHtml += '<tr style="background:#fafafa">'
        +'<td style="padding:8px 12px;font-weight:700;position:sticky;left:0;background:#fafafa;z-index:1">Total</td>';
      var grandTotal = 0, grandCount = 0, grandMarW = 0, grandMarM = 0;
      monthList.forEach(function(m){
        var monthTotal = 0, monthCount = 0, monthMarW = 0, monthMarM = 0;
        statusOrder.forEach(function(s){
          var d = (byStatusMonth[s]||{})[m];
          if(d){
            monthTotal += d.monto;
            monthCount += d.count;
            monthMarW += d.marW || 0;
            monthMarM += d.marM || 0;
          }
        });
        grandTotal += monthTotal;
        grandCount += monthCount;
        grandMarW += monthMarW;
        grandMarM += monthMarM;
        if(monthCount === 0){
          pillsHtml += '<td style="padding:8px 12px;text-align:right;color:#d2d2d7">—</td>';
        } else {
          var monthMgPd = monthMarM > 0 ? (monthMarW / monthMarM).toFixed(2) + '%' : '—';
          pillsHtml += '<td style="padding:8px 12px;text-align:right;font-weight:700;white-space:nowrap">'
            +'<div>USD '+fI(monthTotal)+'</div>'
            +'<div style="font-size:10px;color:#6e6e73;font-weight:500">'+monthCount+' cot. · MgPd '+monthMgPd+'</div>'
          +'</td>';
        }
      });
      var grandMgPd = grandMarM > 0 ? (grandMarW / grandMarM).toFixed(2) + '%' : '—';
      pillsHtml += '<td style="padding:8px 12px;text-align:right;font-weight:700;background:#1d1d1f;color:#fff;white-space:nowrap">'
        +'<div>USD '+fI(grandTotal)+'</div>'
        +'<div style="font-size:10px;color:#aeaeb2;font-weight:500">'+grandCount+' cot. · MgPd '+grandMgPd+'</div>'
      +'</td>';
      pillsHtml += '</tr>';

      pillsHtml += '</tbody></table></div>';
    }

    document.getElementById('dash-by-status').innerHTML = pillsHtml;
  } else {
    dash.style.display = 'none';
  }

  // ── TABLA ──
  function cell(val, isFiltered){
    var bold = isFiltered ? ';background:#fff8e1;font-weight:700' : '';
    return '<td style="text-align:center'+bold+'">'+cevenEsc(val||'—')+'</td>';
  }

  var html = '';
  for(var i=0;i<filtered.length;i++){
    var r = filtered[i];
    // Mes/año actual de la entrada (puede estar vacío)
    var mYear = '', mMonth = '';
    if(r.mesCierre){
      var p = r.mesCierre.split('-');
      if(p.length === 2){ mYear = p[0]; mMonth = p[1]; }
    }
    var realId = r._parentId || r.id;
    var expandKey = r._virtual ? (realId + '__' + r._groupKey) : r.id;
    // Guardar lineKeys en mapa global para acceso seguro desde onclick (evitar JSON en atributos HTML)
    if(r._virtual && r._lineKeys){
      window._pipeLineKeysMap[expandKey] = r._lineKeys;
    }
    var isVirtual = !!r._virtual;
    // expandKey incluye el estado y el mes por SKU (r._groupKey), que salen de la
    // base: concatenarlo dentro de un onclick entre comillas simples permitía
    // cerrar el string y ejecutar código. Ahora todo viaja por data-* y lo
    // resuelve el listener delegado de #pipe-body.
    var rowA = ' data-pid="'+cevenEsc(realId)+'" data-pkey="'+cevenEsc(expandKey)+'"'+(isVirtual?' data-pvirtual="1"':'');

    // Cierre estimado: select combinado Mes/Año
    var curMC = r.mesCierre || '';
    var mesSel = '<select data-pact="mes"'+rowA+' style="padding:2px 4px;border:0.5px solid #d2d2d7;border-radius:5px;font-size:11px;font-family:inherit;background:#fff;min-width:110px">'
      + generateMesYearOptions(curMC)
      + '</select>';

    var estado = r.estado || 'Cotizado';
    var statusOpts = ['Proyecto','Cotizado','Negociacion','Commit','Con OC','Autorizando','Facturado','Perdido'];
    var statusSel = '<select data-pact="status"'+rowA+' style="padding:3px 6px;border:0.5px solid #d2d2d7;border-radius:6px;font-size:11px;font-family:inherit;background:#fff;width:100%">';
    // El estado guardado puede no estar en la lista (dato viejo o corrupto): se
    // agrega como opción propia para no cambiarlo en silencio al re-renderizar.
    if(statusOpts.indexOf(estado) === -1) statusOpts = statusOpts.concat([estado]);
    statusOpts.forEach(function(s){
      statusSel += '<option value="'+cevenEsc(s)+'"'+(s===estado?' selected':'')+'>'+cevenEsc(s)+'</option>';
    });
    statusSel += '</select>';

    var expanded = window._pipeExpanded && window._pipeExpanded[expandKey];
    // Badge para identificar filas virtuales
    var _hasArchived = r.skuArchivedQty && Object.keys(r.skuArchivedQty).length > 0;
    var virtualBadge = ((isVirtual && r._isPartial) || _hasArchived) ? '<span style="background:#f0f0f3;color:#6e6e73;font-size:9px;font-weight:600;padding:1px 5px;border-radius:5px;margin-left:6px" title="Facturación parcial: parte de esta cotización fue facturada en un mes anterior">parcial</span>' : '';
    // Tinte de fila según estado (mismo color de la pill)
    var rowStatusColors = {
      'Proyecto':    {bg:'', fg:''},
      'Cotizado':    {bg:'', fg:''},
      'Negociacion': {bg:'', fg:''},
      'Commit':      {bg:'#fff8e1', fg:''},
      'Con OC':      {bg:'#e8f6ee', fg:''},
      'Autorizando': {bg:'#d4f0de', fg:''},
      'Facturado':   {bg:'#b8e8cc', fg:''},
      'Perdido':     {bg:'#fbbebe', fg:''}
    };
    var rowTintInfo = rowStatusColors[estado] || {bg:'', fg:''};
    var rowTint = rowTintInfo.bg;
    var rowFg = rowTintInfo.fg;
    if(!rowTint && isVirtual) rowTint = '#fafbfc';
    var rowStyle = '';
    if(rowTint) rowStyle += 'background:'+rowTint;
    if(rowFg) rowStyle += (rowStyle?';':'') + 'color:'+rowFg;
    var _trCls = 'row-st-'+(estado||'').replace(/ /g,'_')+(isVirtual?' row-virtual':'');
    html += '<tr class="'+_trCls+'"'+(rowStyle?' style="'+rowStyle+'"':'')+'>'
      +'<td style="font-size:12px;white-space:nowrap">'
        +'<button class="bs" data-pact="expand"'+rowA+' title="Ver SKUs" style="padding:0 5px;font-size:11px;line-height:1.4;margin-right:4px;min-width:20px">'+(expanded?'▼':'▶')+'</button>'
        +cevenEsc(r.fecha)
      +'</td>'
      +'<td style="font-size:12px">'+cevenEsc(r.ejecutivo||'—')+'</td>'
      +'<td style="font-weight:500"><div style="display:flex;align-items:center;gap:4px"><div title="'+cevenEsc(r.cliente||'')+'" style="max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+cevenEsc(r.cliente)+'</div>'+virtualBadge+'</div></td>'
      +'<td><div title="'+cevenEsc(r.proyecto||'')+'" style="max-width:240px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+cevenEsc(r.proyecto||'—')+'</div></td>'
      +'<td style="font-size:12px;white-space:nowrap">'+mesSel+'</td>'
      +'<td style="text-align:center">'+statusSel+'</td>'
      +cell(r.qMac,  fam==='mac')
      +cell(r.qIph,  fam==='iphone')
      +cell(r.qIpad, fam==='ipad')
      +cell(r.qServ, fam==='serv')
      +cell(r.qAcc,  fam==='acc')
      +'<td style="text-align:right;font-size:12px;color:#6e6e73;white-space:nowrap">'+(typeof r.margenPond==='number'?r.margenPond.toFixed(2)+'%':'—')+'</td>'
      +'<td class="stk-monto" style="text-align:right;font-weight:500;white-space:nowrap;min-width:110px'+(rowTint?';background:'+rowTint:'')+(rowFg?';color:'+rowFg:'')+'">USD '+fI(r.monto||0)+'</td>'
      +'<td class="stk-act" style="text-align:center;white-space:nowrap'+(rowTint?';background:'+rowTint:'')+'">'
        +(function(){
          var _ovSt = _pipeSkuOVState(r, pipeDB);
          if(_ovSt === 'full'){
            // Completo: verde. Si tiene ovLink legacy, click abre; si es por SKU, expande el detalle
            var _act = r.ovLink ? 'ov-open' : 'expand';
            var _rc  = r.ovLink ? ' data-pctx="ov-edit"' : '';
            return '<button class="bs" data-pact="'+_act+'"'+_rc+rowA+' title="OV cargada en todas las líneas · clic para ver detalle" style="background:#34c759;color:#fff;border-color:#2aad4e;padding:2px 8px;font-size:11px;font-weight:600">OV</button> ';
          } else if(_ovSt === 'partial'){
            // Parcial: mitad verde / mitad rojo → expande para ver cuál falta
            return '<button class="bs" data-pact="expand"'+rowA+' title="OV parcial: algunas líneas tienen OV y otras no · clic para ver detalle" style="background:linear-gradient(90deg,#34c759 50%,#ff3b30 50%);color:#fff;border-color:#2aad4e;padding:2px 8px;font-size:11px;font-weight:600">OV</button> ';
          } else {
            // Sin OV
            return '<button class="bs" data-pact="ov-edit"'+rowA+' title="Cargar link a Orden de Venta" style="background:#fde8e8;color:#d70015;border-color:#f5b1b1;padding:2px 8px;font-size:11px;font-weight:600">OV</button> ';
          }
        })()
        +(cevenCanEditPipelineRow(r.ejecutivo) ? '<button class="bs" data-pact="quote" data-pqnum="'+cevenEsc(r.qNum)+'"'+rowA+' title="Editar cotización" style="padding:2px 8px;font-size:12px">✎</button> ' : '')
        +(cevenCanEditPipelineRow(r.ejecutivo) ? (isVirtual && r._hasOverrides
          ? '<button class="bsr" data-pact="merge"'+rowA+' title="Volver a unir esta línea con el resto (quita el split)">×</button>'
          : '<button class="bsr" data-pact="del"'+rowA+' title="Eliminar cotización del pipeline">×</button>'
        ) : '')
      +'</td>'
      +'</tr>';
    // Sub-fila con detalle de SKUs
    if(expanded){
      html += renderPipelineDetailRow(r, pipeDB, pipe);
    }
  }

  document.getElementById('pipe-body').innerHTML = html || '<tr><td colspan="14" style="text-align:center;color:#aeaeb2;padding:24px">Sin entradas en pipeline. Cargá una cotización y tocá "Agregar a Pipeline".</td></tr>';
  attachPipeSortHandlers();
}

// ── DELEGACIÓN DE EVENTOS DEL PIPELINE ──────────────────────────────────────
// Todos los handlers de las filas y de las pastillas eran onclick/onchange inline
// con el cliente, el estado por SKU y el mes de cierre concatenados dentro de
// strings JS. Ahora esos datos van en atributos data-* y se leen desde acá.
(function(){
  function ctx(el){
    var virtual = el.getAttribute('data-pvirtual') === '1';
    var key = el.getAttribute('data-pkey');
    return {
      id: parseInt(el.getAttribute('data-pid'), 10),
      key: key,
      virtual: virtual,
      lineKeys: virtual ? (window._pipeLineKeysMap[key] || []) : null
    };
  }

  var body = document.getElementById('pipe-body');
  if(body){
    var pickRow = function(e){
      var el = e.target.closest ? e.target.closest('[data-pact],[data-pctx]') : null;
      return (el && body.contains(el)) ? el : null;
    };
    body.addEventListener('change', function(e){
      var el = pickRow(e); if(!el) return;
      var c = ctx(el);
      if(isNaN(c.id)) return;
      if(el.getAttribute('data-pact') === 'mes'){
        if(c.virtual) updateVirtualGroupMesValue(c.id, c.lineKeys, el.value);
        else          updatePipelineMesCierreValue(c.id, el.value);
      } else if(el.getAttribute('data-pact') === 'status'){
        if(c.virtual) updateVirtualGroupStatus(c.id, c.lineKeys, el.value);
        else          updatePipelineStatus(c.id, el.value);
      }
    });
    body.addEventListener('click', function(e){
      var el = pickRow(e); if(!el) return;
      var act = el.getAttribute('data-pact');
      if(!act) return;
      var c = ctx(el);
      switch(act){
        case 'expand':  e.stopPropagation(); togglePipelineRow(c.key); break;
        case 'ov-open': e.stopPropagation(); openOVLink(c.id); break;
        case 'ov-edit': e.stopPropagation(); editOVLink(c.id); break;
        case 'quote':   openPipelineQuote(el.getAttribute('data-pqnum')); break;
        case 'merge':   mergeBackVirtualRow(c.id, c.key); break;
        case 'del':     e.stopPropagation(); removePipeline(c.id); break;
      }
    });
    body.addEventListener('contextmenu', function(e){
      var el = pickRow(e); if(!el) return;
      if(el.getAttribute('data-pctx') !== 'ov-edit') return;
      e.preventDefault();
      editOVLink(ctx(el).id);
    });
  }

  // Pastillas: mes de cierre, top clientes y estados. El efecto hover que antes
  // vivía en onmouseover/onmouseout inline se resuelve acá.
  ['pipe-month-pills','pipe-topclients-pills','dash-by-status'].forEach(function(boxId){
    var box = document.getElementById(boxId);
    if(!box) return;
    var pickPill = function(e){
      var el = e.target.closest ? e.target.closest('[data-pill]') : null;
      return (el && box.contains(el)) ? el : null;
    };
    box.addEventListener('click', function(e){
      var el = pickPill(e); if(!el) return;
      switch(el.getAttribute('data-pill')){
        case 'month':  setPipeMonth(el.getAttribute('data-val')); break;
        case 'client': setPipeClientFilter(el.getAttribute('data-cli')); break;
        case 'status': togglePillFilter(el.getAttribute('data-st')); break;
        case 'months': togglePipeMonthlyView(); break;
      }
    });
    box.addEventListener('mouseover', function(e){
      var el = pickPill(e);
      if(el && el.getAttribute('data-pill') !== 'months') el.style.transform = 'translateY(-1px)';
    });
    box.addEventListener('mouseout', function(e){
      var el = pickPill(e);
      if(el && el.getAttribute('data-pill') !== 'months') el.style.transform = '';
    });
  });
})();

