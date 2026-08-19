function openOVLink(id){
  var pipe = getPipeline();
  for(var i=0;i<pipe.length;i++){
    if(pipe[i].id === id && pipe[i].ovLink){
      // Asegurar que el link tenga protocolo
      var url = pipe[i].ovLink;
      if(!/^https?:\/\//i.test(url)) url = 'https://' + url;
      window.open(url, '_blank', 'noopener,noreferrer');
      return;
    }
  }
}

function editOVLink(id){
  var pipe = getPipeline();
  var idx = -1;
  for(var i=0;i<pipe.length;i++){ if(pipe[i].id === id){ idx = i; break; } }
  if(idx < 0) return;
  if(!cevenCanEditPipelineRow(pipe[idx].ejecutivo)){ showToast('No tenés permiso para modificar esta línea del pipeline.'); return; }
  var current = pipe[idx].ovLink || '';
  // promptModal() y no prompt(): el popup nativo bloquea el renderer entero
  // (ver shared/notify.js). El pipeline se relee DENTRO del callback porque
  // entre que se abre el modal y se acepta pudo entrar el poll de 15 s.
  promptModal(current ? 'Editar el link de la Orden de Venta' : 'Pegá el link de la Orden de Venta',
    current, function(val){
      val = (val||'').trim();
      if(val === current) return;
      if(typeof pushPipeUndo === 'function') pushPipeUndo(id);
      var pipe2 = getPipeline();
      for(var j=0;j<pipe2.length;j++){
        if(pipe2[j].id === id){
          if(val === '') delete pipe2[j].ovLink; else pipe2[j].ovLink = val;
          break;
        }
      }
      savePipeline(pipe2);
      renderPipeline();
      notifyUndo(val ? '✓ Link de la OV actualizado' : '✓ Link de la OV quitado',
        function(){ if(typeof undoPipelineChange==='function') undoPipelineChange(); });
    }, {okLabel:'Guardar'});
}

// ── Estado OV por entrada del pipeline ──
// Retorna 'none' | 'partial' | 'full' comparando skuOvLinks vs total de líneas en DB
// db opcional: renderPipeline() ya tiene cquotes parseado y lo pasa, para no
// hacer un JSON.parse de varios MB por cada fila de la tabla.
function _pipeSkuOVState(r, db){
  var skuLinks = r.skuOvLinks || {};
  var linkCount = Object.keys(skuLinks).length;
  if(linkCount === 0) return r.ovLink ? 'full' : 'none';
  if(!db) db = getDB();
  var total = cevenOpcFilasDeCotiz(db, r.qNum, ['producto','garantia']).length;
  if(total === 0 || linkCount >= total) return 'full';
  return 'partial';
}

// openSkuOvLink() / editSkuOvLink() estaban definidas DOS veces en este archivo
// (herencia del corte del monolito). La segunda pisaba a esta, así que la que
// corría era la de más abajo — la que habla de "OC parcial", que es el término
// correcto. Se borró esta copia muerta; la activa quedó donde estaba.

function togglePipelineRow(id){
  window._pipeExpanded = window._pipeExpanded || {};
  window._pipeExpanded[id] = !window._pipeExpanded[id];
  renderPipeline();
}

// Aplicar un cambio de estado a un grupo de SKUs (filas virtuales)
// Volver a unir una fila virtual con el resto (quita los overrides de esos SKUs)
function mergeBackVirtualRow(pipeId, expandKey){
  var _row0 = getPipeline().find(function(r){ return r.id === pipeId; });
  if(_row0 && !cevenCanEditPipelineRow(_row0.ejecutivo)){ showToast('No tenés permiso para modificar esta línea del pipeline.'); return; }
  var lineKeys = window._pipeLineKeysMap[expandKey];
  // Nunca se pregunta antes: se aplica y el cartel ofrece deshacer, con el
  // snapshot de la fila tomado ANTES de mutarla (shared/undo.js).
  if(typeof pushPipeUndo === 'function') pushPipeUndo(pipeId);
  if(!lineKeys || !lineKeys.length){
    // Fallback: quitar todos los overrides de la entrada
    var pipe = getPipeline();
    for(var i=0;i<pipe.length;i++){
      if(pipe[i].id === pipeId){
        delete pipe[i].skuStatus;
        delete pipe[i].skuMesCierre;
        delete pipe[i].skuPartialQty;
        delete pipe[i].skuPartialRemSt;
        delete pipe[i].skuPartialRemMes;
        break;
      }
    }
    savePipeline(pipe);
    renderPipeline();
    notifyUndo('Uniste todas las líneas de esta cotización.',
      function(){ if(typeof undoPipelineChange==='function') undoPipelineChange(); });
    return;
  }
  var pipe = getPipeline();
  for(var i=0;i<pipe.length;i++){
    if(pipe[i].id === pipeId){
      lineKeys.forEach(function(k){
        // Quitar prefijo REM| para obtener la clave real del SKU
        var realKey = k.indexOf('REM|') === 0 ? k.slice(4) : k;
        if(pipe[i].skuStatus)      delete pipe[i].skuStatus[realKey];
        if(pipe[i].skuMesCierre)   delete pipe[i].skuMesCierre[realKey];
        if(pipe[i].skuPartialQty)  delete pipe[i].skuPartialQty[realKey];
        if(pipe[i].skuPartialRemSt)delete pipe[i].skuPartialRemSt[realKey];
        if(pipe[i].skuPartialRemMes)delete pipe[i].skuPartialRemMes[realKey];
      });
      cleanupEmptyOverrides(pipe[i]);
      // Si ahora todos los SKUs tienen el mismo estado/mes, auto-mergear
      tryAutoMerge(pipe[i]);
      break;
    }
  }
  savePipeline(pipe);
  renderPipeline();
  notifyUndo('Uniste estas líneas con el resto de la cotización — se quitaron sus estados, fechas y facturación parcial propios.',
    function(){ if(typeof undoPipelineChange==='function') undoPipelineChange(); });
}

// Si todos los SKUs de una cotización tienen el mismo estado Y mes de cierre,
// no hacen falta overrides — los limpiamos y la fila vuelve a ser una sola.
function tryAutoMerge(entry){
  if(!entry) return;
  // No mergear si hay facturación parcial activa
  if(entry.skuPartialQty && Object.keys(entry.skuPartialQty).length) return;
  // Obtener todas las líneas de la cotización
  var lines = cevenOpcFilasDeCotiz(getDB(), entry.qNum, ['producto','garantia']);
  if(!lines.length) return;

  var defStatus = entry.estado || 'Cotizado';
  var defMes    = entry.mesCierre || '';

  // Chequear si todos los overrides de status son iguales entre sí
  var skuStatus   = entry.skuStatus   || {};
  var skuMesCierre = entry.skuMesCierre || {};

  // Solo considerar líneas NO totalmente archivadas
  var activeLines = lines.filter(function(ln, idx){
    var lk = (ln['SKU']||'') + '|' + idx;
    var archQty = (entry.skuArchivedQty && parseInt(entry.skuArchivedQty[lk])) || 0;
    return archQty < (parseInt(ln['Cantidad'])||0);
  });
  if(!activeLines.length) return; // todas archivadas, nada que mergear

  var allStatuses = activeLines.map(function(ln, idx){
    // idx aquí es el índice en activeLines; necesitamos el índice original en lines
    var origIdx = lines.indexOf(ln);
    var lk = (ln['SKU']||'') + '|' + origIdx;
    return skuStatus[lk] || defStatus;
  });
  var allMeses = activeLines.map(function(ln){
    var origIdx = lines.indexOf(ln);
    var lk = (ln['SKU']||'') + '|' + origIdx;
    return skuMesCierre[lk] !== undefined ? skuMesCierre[lk] : defMes;
  });

  var firstStatus = allStatuses[0];
  var firstMes    = allMeses[0];
  var allSame = allStatuses.every(function(s){ return s === firstStatus; })
             && allMeses.every(function(m){ return m === firstMes; });

  if(allSame){
    // Todos iguales → aplicar al nivel de cotización y limpiar overrides
    entry.estado    = firstStatus;
    entry.mesCierre = firstMes;
    delete entry.skuStatus;
    delete entry.skuMesCierre;
  }
}

function updateVirtualGroupStatus(pipeId, lineKeys, newStatus){
  if(!Array.isArray(lineKeys)) lineKeys = [];
  pushPipeUndo(pipeId);
  var pipe = getPipeline();
  for(var i=0;i<pipe.length;i++){
    if(pipe[i].id === pipeId){
      if(!cevenCanEditPipelineRow(pipe[i].ejecutivo)){ showToast('No tenés permiso para modificar esta línea del pipeline.'); return; }
      var e = pipe[i];
      lineKeys.forEach(function(k){
        if(k.indexOf('REM|') === 0){
          // Resto de un parcial → cambia el estado del remanente
          var rk = k.slice(4);
          if(newStatus === 'Facturado'){
            // El resto también se factura → toda la línea queda Facturada: se disuelve el
            // parcial (evita el estado inválido "remanente Facturado" que luego se revertía).
            if(!e.skuStatus) e.skuStatus = {};
            e.skuStatus[rk] = 'Facturado';
            if(e.skuPartialQty)    delete e.skuPartialQty[rk];
            if(e.skuPartialRemSt)  delete e.skuPartialRemSt[rk];
            if(e.skuPartialRemMes) delete e.skuPartialRemMes[rk];
          } else {
            if(!e.skuPartialRemSt) e.skuPartialRemSt = {};
            e.skuPartialRemSt[rk] = newStatus;
          }
        } else {
          // Porción facturada (u override normal de SKU)
          if(!e.skuStatus) e.skuStatus = {};
          e.skuStatus[k] = newStatus;
          // Si la porción "Facturada" deja de ser Facturado, el parcial pierde sentido:
          // el estado nuevo aplica a TODA la línea (se descarta el split parcial)
          if(newStatus !== 'Facturado' && e.skuPartialQty && e.skuPartialQty[k] !== undefined){
            delete e.skuPartialQty[k];
            if(e.skuPartialRemSt)  delete e.skuPartialRemSt[k];
            if(e.skuPartialRemMes) delete e.skuPartialRemMes[k];
          }
        }
      });
      lineKeys.forEach(function(k){ tryDissolvePartial(e, k.indexOf('REM|')===0?k.slice(4):k); });
      tryAutoMerge(e);
      cleanupEmptyOverrides(e);
      break;
    }
  }
  savePipeline(pipe);
  renderPipeline();
}

function updateVirtualGroupMesValue(pipeId, lineKeys, fullValue){
  if(!Array.isArray(lineKeys)) lineKeys = [];
  pushPipeUndo(pipeId);
  var pipe = getPipeline();
  for(var i=0;i<pipe.length;i++){
    if(pipe[i].id === pipeId){
      if(!cevenCanEditPipelineRow(pipe[i].ejecutivo)){ showToast('No tenés permiso para modificar esta línea del pipeline.'); return; }
      var e = pipe[i];
      lineKeys.forEach(function(k){
        if(k.indexOf('REM|') === 0){
          // Resto de un parcial → cambia el mes del remanente
          var rk = k.slice(4);
          if(!e.skuPartialRemMes) e.skuPartialRemMes = {};
          e.skuPartialRemMes[rk] = fullValue || '';
        } else {
          if(!e.skuMesCierre) e.skuMesCierre = {};
          if(fullValue) e.skuMesCierre[k] = fullValue;
          else delete e.skuMesCierre[k];
        }
      });
      lineKeys.forEach(function(k){ tryDissolvePartial(e, k.indexOf('REM|')===0?k.slice(4):k); });
      tryAutoMerge(e);
      cleanupEmptyOverrides(e);
      break;
    }
  }
  savePipeline(pipe);
  renderPipeline();
}

// Si la porción facturada y el resto de un parcial quedan con el MISMO estado y mes,
// el split deja de tener sentido → se disuelve (la línea vuelve a ser una sola).
function tryDissolvePartial(entry, lk){
  if(!entry || !entry.skuPartialQty || entry.skuPartialQty[lk] === undefined) return;
  var defSt  = entry.estado    || 'Cotizado';
  var defMes = entry.mesCierre || '';
  var factSt  = (entry.skuStatus && entry.skuStatus[lk]) || defSt;
  var factMes = (entry.skuMesCierre && entry.skuMesCierre[lk] !== undefined) ? entry.skuMesCierre[lk] : defMes;
  var remSt   = (entry.skuPartialRemSt && entry.skuPartialRemSt[lk]) || defSt;
  var remMes  = (entry.skuPartialRemMes && entry.skuPartialRemMes[lk] !== undefined) ? entry.skuPartialRemMes[lk] : defMes;
  if(factSt === remSt && factMes === remMes){
    // Disolver: la línea entera queda en factSt/factMes
    delete entry.skuPartialQty[lk];
    if(entry.skuPartialRemSt)  delete entry.skuPartialRemSt[lk];
    if(entry.skuPartialRemMes) delete entry.skuPartialRemMes[lk];
    if(!entry.skuStatus) entry.skuStatus = {};
    entry.skuStatus[lk] = factSt;
    if(factMes !== defMes){ if(!entry.skuMesCierre) entry.skuMesCierre = {}; entry.skuMesCierre[lk] = factMes; }
    else if(entry.skuMesCierre) delete entry.skuMesCierre[lk];
  }
}

// Limpiar objetos de override vacíos
function cleanupEmptyOverrides(e){
  ['skuStatus','skuMesCierre','skuPartialQty','skuPartialRemSt','skuPartialRemMes','skuOvLinks'].forEach(function(f){
    if(e[f] && !Object.keys(e[f]).length) delete e[f];
  });
}

// Aplicar un cambio de mes/año a un grupo de SKUs (filas virtuales)
function updateVirtualGroupMes(pipeId, lineKeys, kind, value){
  var pipe = getPipeline();
  for(var i=0;i<pipe.length;i++){
    if(pipe[i].id === pipeId){
      if(!cevenCanEditPipelineRow(pipe[i].ejecutivo)){ showToast('No tenés permiso para modificar esta línea del pipeline.'); return; }
      if(!pipe[i].skuMesCierre) pipe[i].skuMesCierre = {};
      lineKeys.forEach(function(k){
        var cur = pipe[i].skuMesCierre[k] !== undefined ? pipe[i].skuMesCierre[k] : (pipe[i].mesCierre || '');
        var p = cur ? cur.split('-') : ['',''];
        var y = p[0] || '', m = p[1] || '';
        if(kind === 'y') y = value;
        else m = value;
        if(y && m) pipe[i].skuMesCierre[k] = y + '-' + m;
        else delete pipe[i].skuMesCierre[k];
      });
      break;
    }
  }
  savePipeline(pipe);
  renderPipeline();
}

// db y pipe llegan ya parseados desde renderPipeline(): esta función se llama una
// vez por fila expandida y cada getDB()/getPipeline() era un JSON.parse completo.
function renderPipelineDetailRow(r, db, pipe){
  // Para filas virtuales: usar el id real del pipeline y filtrar a los lineKeys del grupo
  var realId = r._parentId || r.id;
  var lineKeysFilter = r._virtual ? (r._lineKeys || []) : null;
  // Resolver pipeEntry antes del filtrado (necesario para acceder a skuPartialQty en REM|)
  var pipeEntry = r;
  if(r._virtual){
    var allPipe0 = pipe || getPipeline();
    for(var pi0=0; pi0<allPipe0.length; pi0++){ if(allPipe0[pi0].id === realId){ pipeEntry = allPipe0[pi0]; break; } }
  }
  // Buscar las líneas de la cotización en cquotes
  if(!db) db = getDB();
  var allLines = cevenOpcFilasDeCotiz(db, r.qNum, ['producto','garantia']);
  // Si es virtual, filtrar por lineKeys (índice + SKU). Soporta prefijo REM| para restos parciales.
  var rows;
  if(lineKeysFilter){
    rows = [];
    allLines.forEach(function(ln, idx){
      var lk = (ln['SKU']||'') + '|' + idx;
      var isDirect = lineKeysFilter.indexOf(lk) !== -1;
      var isRem    = lineKeysFilter.indexOf('REM|' + lk) !== -1;
      if(isDirect || isRem){
        ln = Object.assign({}, ln); // clonar para no mutar el DB
        ln._origIdx = idx;
        // Descontar unidades archivadas (facturadas en meses anteriores)
        var archQty0 = (pipeEntry.skuArchivedQty||{})[lk];
        if(archQty0) ln['Cantidad'] = Math.max(0,(parseInt(ln['Cantidad'])||0) - parseInt(archQty0));
        if(isRem){
          // Mostrar la cantidad restante = total - parcial facturada
          ln._isPartialRem = true;
          var pq = (pipeEntry.skuPartialQty||{})[lk];
          if(pq) ln['Cantidad'] = (parseInt(ln['Cantidad'])||0) - parseInt(pq);
          ln._origLineKey = lk;
        }
        rows.push(ln);
      }
    });
  } else {
    rows = allLines.map(function(ln, idx){
      ln = Object.assign({}, ln); ln._origIdx = idx;
      var archQty1 = (pipeEntry.skuArchivedQty||{})[(ln['SKU']||'')+'|'+idx];
      if(archQty1) ln['Cantidad'] = Math.max(0,(parseInt(ln['Cantidad'])||0) - parseInt(archQty1));
      return ln;
    }).filter(function(ln){ return (parseInt(ln['Cantidad'])||0) > 0; });
  }
  if(!rows.length){
    return '<tr class="pipe-detail"><td colspan="15" style="padding:14px 18px;background:#fafafa;color:#aeaeb2;font-size:12px">No se encontraron líneas para esta cotización en el historial.</td></tr>';
  }
  // skuStatus por línea (se guarda en pipe entry)
  var skuStatus = pipeEntry.skuStatus || {};
  /* Los estados por LÍNEA no incluyen 'Proyecto': ese es un estado de la
     cotización entera, no de un SKU suelto. El resto sale de
     shared/pipeline-status.js, igual que la tabla y las pastillas. */
  var statusOpts = cevenEstadoValores().filter(function(s){ return s !== 'Proyecto'; });
  function statusColorMini(s){ return cevenEstadoCard(s).bg; }
  var ovLinks = pipeEntry.skuOvLinks || {}; // links de OC parcial por línea
  var skuMesCierre = pipeEntry.skuMesCierre || {}; // mes/año de cierre por línea (YYYY-MM)
  var inner = '<div style="padding:10px 14px 14px;background:#fafafa">'
    +'<div style="font-size:11px;color:#6e6e73;text-transform:uppercase;letter-spacing:.4px;margin-bottom:8px">Detalle por SKU · #'+cevenEsc(r.qNum)+'</div>'
    +'<table style="width:100%;font-size:12px;border-collapse:collapse;background:#fff;border:0.5px solid #e5e5e7;border-radius:8px;overflow:hidden;table-layout:fixed">'
    +'<colgroup>'
      +'<col style="width:8%">'   /* SKU */
      +'<col style="width:27%">'  /* Descripción */
      +'<col style="width:11%">'  /* Cierre est. */
      +'<col style="width:10%">'  /* Estado */
      +'<col style="width:5%">'   /* Qty */
      +'<col style="width:9%">'   /* P. Unit. */
      +'<col style="width:7%">'   /* Margen */
      +'<col style="width:10%">'  /* Subtotal */
      +'<col style="width:7%">'   /* OV */
      +'<col style="width:6%">'   /* Acciones */
    +'</colgroup>'
    +'<thead><tr style="background:#f5f5f7">'
      +'<th style="text-align:left;padding:6px 10px;font-size:11px;color:#6e6e73">SKU</th>'
      +'<th style="text-align:left;padding:6px 10px;font-size:11px;color:#6e6e73">Descripción</th>'
      +'<th style="text-align:center;padding:6px 10px;font-size:11px;color:#6e6e73">Cierre est.</th>'
      +'<th style="text-align:center;padding:6px 10px;font-size:11px;color:#6e6e73">Estado</th>'
      +'<th style="text-align:center;padding:6px 10px;font-size:11px;color:#6e6e73">Qty</th>'
      +'<th style="text-align:right;padding:6px 10px;font-size:11px;color:#6e6e73">P. Unit.</th>'
      +'<th style="text-align:right;padding:6px 10px;font-size:11px;color:#6e6e73">Margen</th>'
      +'<th style="text-align:right;padding:6px 10px;font-size:11px;color:#6e6e73">Subtotal</th>'
      +'<th style="text-align:center;padding:6px 10px;font-size:11px;color:#6e6e73">OV</th>'
      +'<th style="text-align:center;padding:6px 10px;font-size:11px;color:#6e6e73" title="Quitar estado/cierre específico del SKU"></th>'
    +'</tr></thead><tbody>';

  var monthsShort = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
  var nowY = new Date().getFullYear();

  for(var i=0;i<rows.length;i++){
    var ln = rows[i];
    // Clave única para la línea: SKU + índice ORIGINAL (en filas virtuales puede ser distinto al índice local)
    var origIdx = (ln._origIdx !== undefined) ? ln._origIdx : i;
    var lineKey = (ln['SKU']||'') + '|' + origIdx;
    // Para filas de resto parcial, el estado es el remSt guardado (no el skuStatus del lineKey)
    var lnStatus = ln._isPartialRem
      ? ((pipeEntry.skuPartialRemSt||{})[ln._origLineKey] || (r.estado||'Cotizado'))
      : (skuStatus[lineKey] || (r.estado || 'Cotizado'));
    var lnPrice = parseFloat(ln['P. Venta Unitario']) || 0;
    var lnQty = parseInt(ln['Cantidad']) || 1;
    var lnTotal = lnPrice * lnQty;
    var isWarranty = ln['Tipo'] === 'garantia';
    // lineKey es (SKU del Excel) + '|' + índice. Antes se metía dentro de un
    // string JS de onclick escapando sólo las comillas simples
    // (lineKey.replace(/'/g,"\\'")), escape que NO cubre la barra invertida: un
    // SKU  \');alert(1);//  cerraba el string y ejecutaba código. Ahora viaja en
    // data-lk y lo lee el listener delegado.
    var lineA = ' data-did="'+cevenEsc(realId)+'" data-lk="'+cevenEsc(lineKey)+'"';

    // Selector de estado: para fila de resto parcial, no modificar (es de solo lectura visual)
    var statusSel;
    if(ln._isPartialRem){
      statusSel = '<span class="'+cevenSpillClass(lnStatus)+'" style="font-size:10px;padding:2px 8px;border-radius:980px;background:'+statusColorMini(lnStatus)+';color:#fff;font-weight:600">'+cevenEsc(cevenEstadoLabel(lnStatus))+'</span>';
    } else {
      statusSel = '<select data-dact="status"'+lineA+' style="padding:2px 6px;border:0.5px solid #d2d2d7;border-radius:5px;font-size:10px;font-family:inherit;background:#fff;color:'+statusColorMini(lnStatus)+';font-weight:600">';
      // El estado guardado puede no estar en la lista (dato viejo/corrupto): se
      // agrega para no pisarlo en silencio al re-renderizar.
      var stOptsLn = statusOpts.indexOf(lnStatus) === -1 ? statusOpts.concat([lnStatus]) : statusOpts;
      stOptsLn.forEach(function(s){ statusSel += '<option value="'+cevenEsc(s)+'"'+(s===lnStatus?' selected':'')+'>'+cevenEsc(cevenEstadoLabel(s))+'</option>'; });
      statusSel += '</select>';
    }

    var lnLink = ovLinks[lineKey];
    // Botón OV por línea
    var ovBtn = lnLink
      ? '<button class="bs" data-dact="ov-open" data-dctx="ov-edit"'+lineA+' title="Abrir OV · clic derecho para editar/quitar" style="background:#34c759;color:#fff;border-color:#34c759;padding:1px 6px;font-size:10px;font-weight:600">OV</button>'
      : '<button class="bs" data-dact="ov-edit"'+lineA+' title="Cargar link a Orden de Venta de esta línea" style="background:#fde8e8;color:#d70015;border-color:#f5b1b1;padding:1px 6px;font-size:10px;font-weight:600">OV</button>';
    var hasOverrides = (pipeEntry.skuStatus && pipeEntry.skuStatus[lineKey] !== undefined)
                   || (pipeEntry.skuMesCierre && pipeEntry.skuMesCierre[lineKey] !== undefined)
                   || (pipeEntry.skuPartialQty && pipeEntry.skuPartialQty[lineKey] !== undefined);
    var elimBtn = hasOverrides && !ln._isPartialRem
      ? '<button class="bsr" data-dact="clear"'+lineA+' title="Quitar estado/fecha/parcial específicos de este SKU" style="padding:1px 7px;font-size:10px">×</button>'
      : '<button class="bs" disabled style="padding:1px 7px;font-size:10px;color:#d2d2d7;cursor:not-allowed;background:#fafafa">×</button>';

    // Cierre estimado por SKU (default = el de la cotización si no tiene propio)
    var lnMC = skuMesCierre[lineKey] || r.mesCierre || '';
    var hasOwn = skuMesCierre[lineKey] !== undefined;
    var mesCSel = ln._isPartialRem
      ? '<span style="font-size:10px;color:#6e6e73">'+cevenEsc(cevenMesLabel(lnMC) || '—')+'</span>'
      : cevenMonthField(lnMC, ' data-dact="mes"'+lineA, {
          cls: 'mpk-xs' + (hasOwn ? '' : ' mpk-inherit'),
          title: hasOwn ? 'Override propio de este SKU' : 'Heredado de la cotización'
        });

    // Celda de cantidad: cuando estado=Facturado y qty>1, permitir facturación parcial (opt-in)
    var qtyCell;
    if(!ln._isPartialRem && lnStatus === 'Facturado' && lnQty > 1 && !isWarranty){
      var curPartQty = (pipeEntry.skuPartialQty && parseInt(pipeEntry.skuPartialQty[lineKey])) || 0;
      if(curPartQty > 0 && curPartQty < lnQty){
        // Modo parcial ACTIVO: input editable + selector de estado del resto
        var curRemSt = (pipeEntry.skuPartialRemSt && pipeEntry.skuPartialRemSt[lineKey]) || 'Con OC';
        var pInput = '<input type="number" class="no-spin" min="1" max="'+(lnQty-1)+'" value="'+curPartQty+'" '
          + 'data-dact="partial-qty"'+lineA+' data-dqty="'+lnQty+'" '
          + 'title="Unidades facturadas (el resto queda en otro estado)" '
          + 'style="width:38px;text-align:center;font-size:10px;padding:2px 3px;border:0.5px solid #17a589;border-radius:4px;color:#0a5c30;background:#f0faf5">'
          + '<span style="font-size:9px;color:#aeaeb2">/'+lnQty+'</span>';
        var remStSel = '<select data-dact="partial-rem"'+lineA+' '
          + 'title="Estado de las unidades restantes" '
          + 'style="padding:2px 3px;border:0.5px solid #d2d2d7;border-radius:4px;font-size:10px;margin-top:2px;width:100%;color:'+statusColorMini(curRemSt)+';font-weight:600">';
        statusOpts.filter(function(s){ return s !== 'Facturado'; }).forEach(function(s){
          remStSel += '<option value="'+cevenEsc(s)+'"'+(s===curRemSt?' selected':'')+'>'+cevenEsc(cevenEstadoLabel(s))+'</option>';
        });
        remStSel += '</select>';
        qtyCell = '<div style="display:flex;flex-direction:column;gap:2px;align-items:center">'+pInput+remStSel+'</div>';
      } else {
        // Facturado COMPLETO: mostrar cantidad normal + botón opcional para facturar parcial
        qtyCell = '<span style="font-size:11px;font-weight:500">'+lnQty+'</span>'
          + '<button class="bs" data-dact="partial-start"'+lineA+' data-dqty="'+lnQty+'" title="Facturar solo una parte — el resto se abre en una línea aparte" style="display:block;margin:3px auto 0;font-size:9px;padding:1px 6px;color:#17a589;border-color:#a5d6c0;background:#f0faf5">parcial</button>';
      }
    } else if(ln._isPartialRem){
      qtyCell = '<span style="font-size:11px">'+lnQty+'</span><span style="font-size:9px;color:#aeaeb2;margin-left:2px">rest.</span>';
    } else {
      qtyCell = lnQty;
    }

    inner += '<tr style="border-top:0.5px solid #f0f0f0'+(isWarranty?';background:#fffbf5':'')+(ln._isPartialRem?';background:#f5fdf8':'')+'">'
      +'<td style="padding:6px 10px;font-family:monospace;font-size:11px">'+cevenEsc(ln['SKU']||'—')+'</td>'
      +'<td style="padding:6px 10px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="'+cevenEsc(ln['Descripción']||'')+'">'+cevenEsc(ln['Descripción']||'')+(isWarranty?' <span style="background:#fff3e0;color:#c84e00;font-size:9px;font-weight:700;padding:1px 5px;border-radius:6px;margin-left:4px">GARANTÍA</span>':'')+(ln._isPartialRem?' <span style="background:#e8f8ef;color:#1a7f4b;font-size:9px;font-weight:700;padding:1px 5px;border-radius:6px;margin-left:4px">RESTANTE</span>':'')+'</td>'
      +'<td style="padding:6px 10px;text-align:center">'+mesCSel+'</td>'
      +'<td style="padding:6px 10px;text-align:center">'+statusSel+'</td>'
      +'<td style="padding:6px 10px;text-align:center">'+qtyCell+'</td>'
      +'<td style="padding:6px 10px;text-align:right">USD '+fI(lnPrice)+'</td>'
      +'<td style="padding:6px 10px;text-align:right;color:#6e6e73">'+(isNaN(parseFloat(ln['Margen %']))?'—':parseFloat(ln['Margen %']).toFixed(2)+'%')+'</td>'
      +'<td style="padding:6px 10px;text-align:right;font-weight:500">USD '+fI(lnTotal)+'</td>'
      +'<td style="padding:6px 10px;text-align:center">'+ovBtn+'</td>'
      +'<td style="padding:6px 10px;text-align:center">'+elimBtn+'</td>'
    +'</tr>';
  }
  inner += '</tbody></table></div>';
  return '<tr class="pipe-detail"><td colspan="15" style="padding:0;background:#fafafa">'+inner+'</td></tr>';
}

// Delegación de eventos del detalle por SKU. Vive en #pipe-body (junto con las
// filas del pipeline y las del archivo), por eso usa su propio namespace: data-dact.
(function(){
  var body = document.getElementById('pipe-body');
  if(!body) return;
  var pick = function(e){
    var el = e.target.closest ? e.target.closest('[data-dact],[data-dctx]') : null;
    return (el && body.contains(el)) ? el : null;
  };
  var ids = function(el){
    return {
      id: parseInt(el.getAttribute('data-did'), 10),
      lk: el.getAttribute('data-lk'),
      qty: parseInt(el.getAttribute('data-dqty'), 10)
    };
  };
  body.addEventListener('change', function(e){
    var el = pick(e); if(!el) return;
    var c = ids(el);
    if(isNaN(c.id)) return;
    switch(el.getAttribute('data-dact')){
      case 'status':       updateSkuStatus(c.id, c.lk, el.value); break;
      case 'mes':          updateSkuMesCierreValue(c.id, c.lk, el.value); break;
      case 'partial-qty':  updateSkuPartialQty(c.id, c.lk, el.value, c.qty); break;
      case 'partial-rem':  updateSkuPartialRemSt(c.id, c.lk, el.value); break;
    }
  });
  body.addEventListener('click', function(e){
    var el = pick(e); if(!el) return;
    var act = el.getAttribute('data-dact');
    if(!act) return;
    var c = ids(el);
    if(isNaN(c.id)) return;
    switch(act){
      case 'ov-open':       e.stopPropagation(); openSkuOvLink(c.id, c.lk); break;
      case 'ov-edit':       e.stopPropagation(); editSkuOvLink(c.id, c.lk); break;
      case 'clear':         clearSkuOverrides(c.id, c.lk); break;
      case 'partial-start': promptPartialQty(c.id, c.lk, c.qty); break;
    }
  });
  body.addEventListener('contextmenu', function(e){
    var el = pick(e); if(!el) return;
    if(el.getAttribute('data-dctx') !== 'ov-edit') return;
    e.preventDefault();
    var c = ids(el);
    if(!isNaN(c.id)) editSkuOvLink(c.id, c.lk);
  });
})();

// Inicia una facturación parcial preguntando cuántas unidades se facturaron
function promptPartialQty(pipeId, lineKey, totalQty){
  var _row0 = getPipeline().find(function(r){ return r.id === pipeId; });
  if(_row0 && !cevenCanEditPipelineRow(_row0.ejecutivo)){ showToast('No tenés permiso para modificar esta línea del pipeline.'); return; }
  promptModal('¿Cuántas de las '+totalQty+' unidades fueron facturadas? El resto queda en otro estado, en una línea aparte.',
    '', function(v){
      var n = parseInt(v, 10);
      if(isNaN(n) || n <= 0){ showToast('Ingresá un número válido entre 1 y '+(totalQty-1)+'.'); return; }
      if(n >= totalQty){ return; } // = total → no es parcial, queda todo Facturado
      updateSkuPartialQty(pipeId, lineKey, n, totalQty);
    }, {okLabel:'Aplicar'});
}

function clearSkuOverrides(pipeId, lineKey){
  // Quitar estado/cierre/parcial específicos de este SKU → vuelve al default de
  // la cotización. Se aplica y se avisa con "Deshacer" (ver notify.js).
  var pipe = getPipeline();
  var permitido = false;
  for(var p=0;p<pipe.length;p++){ if(pipe[p].id === pipeId){ permitido = cevenCanEditPipelineRow(pipe[p].ejecutivo); break; } }
  if(!permitido){ showToast('No tenés permiso para modificar esta línea del pipeline.'); return; }
  if(typeof pushPipeUndo === 'function') pushPipeUndo(pipeId);
  for(var i=0;i<pipe.length;i++){
    if(pipe[i].id === pipeId){
      if(pipe[i].skuStatus)      delete pipe[i].skuStatus[lineKey];
      if(pipe[i].skuMesCierre)   delete pipe[i].skuMesCierre[lineKey];
      if(pipe[i].skuOvLinks)     delete pipe[i].skuOvLinks[lineKey];
      if(pipe[i].skuPartialQty)  delete pipe[i].skuPartialQty[lineKey];
      if(pipe[i].skuPartialRemSt)delete pipe[i].skuPartialRemSt[lineKey];
      if(pipe[i].skuPartialRemMes)delete pipe[i].skuPartialRemMes[lineKey];
      cleanupEmptyOverrides(pipe[i]);
      break;
    }
  }
  savePipeline(pipe);
  renderPipeline();
  notifyUndo('Este SKU volvió al estado, fecha y facturación de la cotización.',
    function(){ if(typeof undoPipelineChange==='function') undoPipelineChange(); });
}

// Helper: cuenta cuántas líneas de producto (no garantía) tiene una cotización
function countQuoteProductLines(qNum){
  return cevenOpcFilasDeCotiz(getDB(), qNum, ['producto']).length;
}

function updateSkuStatus(pipeId, lineKey, newStatus){
  var pipe = getPipeline();
  for(var i=0;i<pipe.length;i++){
    if(pipe[i].id === pipeId){
      if(!cevenCanEditPipelineRow(pipe[i].ejecutivo)){ showToast('No tenés permiso para modificar esta línea del pipeline.'); return; }
      if(countQuoteProductLines(pipe[i].qNum) <= 1){
        pipe[i].estado = newStatus;
        if(pipe[i].skuStatus) delete pipe[i].skuStatus[lineKey];
        if(pipe[i].skuStatus && !Object.keys(pipe[i].skuStatus).length) delete pipe[i].skuStatus;
      } else {
        if(!pipe[i].skuStatus) pipe[i].skuStatus = {};
        pipe[i].skuStatus[lineKey] = newStatus;
        tryAutoMerge(pipe[i]);
      }
      break;
    }
  }
  savePipeline(pipe);
  renderPipeline();
}

// ── Facturación parcial ──────────────────────────────────────────────────────
// Guarda cuántas unidades de una línea están facturadas parcialmente.
// Cuando qty >= total, elimina el override (toda la línea = Facturada).
// Cuando qty <= 0, elimina el override (sin facturación parcial).
function updateSkuPartialQty(pipeId, lineKey, qty, totalQty){
  qty = parseInt(qty) || 0;
  totalQty = parseInt(totalQty) || 0;
  if(qty <= 0 || qty >= totalQty) qty = 0;
  var pipe = getPipeline();
  for(var i=0;i<pipe.length;i++){
    if(pipe[i].id === pipeId){
      if(!cevenCanEditPipelineRow(pipe[i].ejecutivo)){ showToast('No tenés permiso para modificar esta línea del pipeline.'); return; }
      if(qty > 0){
        if(!pipe[i].skuPartialQty)  pipe[i].skuPartialQty  = {};
        if(!pipe[i].skuPartialRemSt) pipe[i].skuPartialRemSt = {};
        pipe[i].skuPartialQty[lineKey] = qty;
        if(!pipe[i].skuPartialRemSt[lineKey]) pipe[i].skuPartialRemSt[lineKey] = 'Con OC';
      } else {
        if(pipe[i].skuPartialQty)  delete pipe[i].skuPartialQty[lineKey];
        if(pipe[i].skuPartialRemSt)delete pipe[i].skuPartialRemSt[lineKey];
        if(pipe[i].skuPartialQty   && !Object.keys(pipe[i].skuPartialQty).length)  delete pipe[i].skuPartialQty;
        if(pipe[i].skuPartialRemSt && !Object.keys(pipe[i].skuPartialRemSt).length) delete pipe[i].skuPartialRemSt;
      }
      break;
    }
  }
  savePipeline(pipe);
  renderPipeline();
}

// Cambia el estado de las unidades restantes (no facturadas) de una línea parcialmente facturada.
function updateSkuPartialRemSt(pipeId, lineKey, remSt){
  var pipe = getPipeline();
  for(var i=0;i<pipe.length;i++){
    if(pipe[i].id === pipeId){
      if(!cevenCanEditPipelineRow(pipe[i].ejecutivo)){ showToast('No tenés permiso para modificar esta línea del pipeline.'); return; }
      if(!pipe[i].skuPartialRemSt) pipe[i].skuPartialRemSt = {};
      pipe[i].skuPartialRemSt[lineKey] = remSt;
      tryDissolvePartial(pipe[i], lineKey);
      tryAutoMerge(pipe[i]);
      cleanupEmptyOverrides(pipe[i]);
      break;
    }
  }
  savePipeline(pipe);
  renderPipeline();
}
// ────────────────────────────────────────────────────────────────────────────

function updateSkuMesCierre(pipeId, lineKey, kind, value){
  // kind='m' (mes) o 'y' (año). Almacenar como YYYY-MM o limpiar si vacío.
  var pipe = getPipeline();
  for(var i=0;i<pipe.length;i++){
    if(pipe[i].id === pipeId){
      if(!cevenCanEditPipelineRow(pipe[i].ejecutivo)){ showToast('No tenés permiso para modificar esta línea del pipeline.'); return; }
      if(!pipe[i].skuMesCierre) pipe[i].skuMesCierre = {};
      var cur = pipe[i].skuMesCierre[lineKey] || pipe[i].mesCierre || '';
      var p = cur ? cur.split('-') : ['',''];
      var y = p[0] || '', m = p[1] || '';
      if(kind === 'y') y = value;
      else m = value;
      if(y && m) pipe[i].skuMesCierre[lineKey] = y + '-' + m;
      else delete pipe[i].skuMesCierre[lineKey]; // vacío = vuelve a heredar de la cotización
      break;
    }
  }
  savePipeline(pipe);
  renderPipeline();
}

function openSkuOvLink(pipeId, lineKey){
  var pipe = getPipeline();
  for(var i=0;i<pipe.length;i++){
    if(pipe[i].id === pipeId && pipe[i].skuOvLinks && pipe[i].skuOvLinks[lineKey]){
      var url = pipe[i].skuOvLinks[lineKey];
      if(!/^https?:\/\//i.test(url)) url = 'https://' + url;
      window.open(url, '_blank', 'noopener,noreferrer');
      return;
    }
  }
}

function editSkuOvLink(pipeId, lineKey){
  var pipe = getPipeline();
  var idx = -1;
  for(var i=0;i<pipe.length;i++){ if(pipe[i].id === pipeId){ idx = i; break; } }
  if(idx < 0) return;
  if(!cevenCanEditPipelineRow(pipe[idx].ejecutivo)){ showToast('No tenés permiso para modificar esta línea del pipeline.'); return; }
  var current = (pipe[idx].skuOvLinks || {})[lineKey] || '';
  promptModal(current ? 'Editar el link de la OC parcial' : 'Pegá el link de la OC parcial de esta línea',
    current, function(val){
      val = (val||'').trim();
      if(val === current) return;
      if(typeof pushPipeUndo === 'function') pushPipeUndo(pipeId);
      var pipe2 = getPipeline();
      for(var j=0;j<pipe2.length;j++){
        if(pipe2[j].id === pipeId){
          pipe2[j].skuOvLinks = pipe2[j].skuOvLinks || {};
          if(val === '') delete pipe2[j].skuOvLinks[lineKey];
          else pipe2[j].skuOvLinks[lineKey] = val;
          // Un objeto vacío igual viaja a Supabase como {}: se limpia, igual que
          // el resto de los overrides por SKU.
          if(!Object.keys(pipe2[j].skuOvLinks).length) delete pipe2[j].skuOvLinks;
          break;
        }
      }
      savePipeline(pipe2);
      renderPipeline();
      notifyUndo(val ? '✓ Link de la OC parcial actualizado' : '✓ Link de la OC parcial quitado',
        function(){ if(typeof undoPipelineChange==='function') undoPipelineChange(); });
    }, {okLabel:'Guardar'});
}

// Motivos fijos del modal de pérdida — portado desde una versión vieja del
// cotizador que sí pedía este dato (ver DOCUMENTACION.md, comparado contra
// el código actual el 18-19/08/2026).
var PIPE_MOTIVOS_PERDIDA = ['Presupuesto del cliente', 'Precio', 'Decisión del cliente', 'Sin Novedades'];

/* Modal de motivo de pérdida. Mismo esqueleto visual que confirmModal()/
   promptModal() (shared/notify.js) — overlay + tarjeta, sin diálogo nativo —
   pero con select+textarea, que ninguna de las dos funciones de notify.js
   sostiene, así que va acá como una nueva. */
function abrirModalMotivoPerdida(onConfirm, onCancel){
  var old = document.getElementById('ceven-generic-modal');
  if(old) old.parentNode.removeChild(old);
  var wrap = document.createElement('div');
  wrap.id = 'ceven-generic-modal';
  wrap.style.cssText = 'position:fixed;inset:0;z-index:100000;background:rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;font-family:-apple-system,BlinkMacSystemFont,sans-serif';
  wrap.innerHTML =
    '<div style="background:#fff;border:0.5px solid #d2d2d7;border-radius:16px;padding:22px;width:380px;max-width:92vw;box-shadow:0 10px 40px rgba(0,0,0,.15)">'
      + '<div style="font-size:15px;font-weight:600;color:#1d1d1f;margin-bottom:14px">Motivo de pérdida</div>'
      + '<select data-motivo style="border:0.5px solid #d2d2d7;border-radius:8px;padding:9px 11px;font-size:14px;width:100%;outline:none;margin-bottom:10px;box-sizing:border-box;font-family:inherit;background:#fff">'
        + PIPE_MOTIVOS_PERDIDA.map(function(m){ return '<option value="'+cevenEsc(m)+'">'+cevenEsc(m)+'</option>'; }).join('')
      + '</select>'
      + '<textarea data-detalle rows="3" placeholder="Detalle (opcional)" style="border:0.5px solid #d2d2d7;border-radius:8px;padding:9px 11px;font-size:14px;width:100%;outline:none;margin-bottom:14px;box-sizing:border-box;font-family:inherit;resize:vertical"></textarea>'
      + '<div style="display:flex;gap:8px;justify-content:flex-end">'
        + '<button data-cancel style="border:0.5px solid #d2d2d7;border-radius:980px;padding:8px 16px;font-size:13px;font-weight:500;cursor:pointer;background:#fff;color:#1d1d1f;font-family:inherit">Cancelar</button>'
        + '<button data-ok style="border:none;border-radius:980px;padding:8px 16px;font-size:13px;font-weight:600;cursor:pointer;background:#d70015;color:#fff;font-family:inherit">Marcar Perdido</button>'
      + '</div>'
    + '</div>';
  document.body.appendChild(wrap);
  function close(){ if(wrap.parentNode) wrap.parentNode.removeChild(wrap); }
  wrap.querySelector('[data-ok]').onclick = function(){
    var motivo = wrap.querySelector('[data-motivo]').value;
    var detalle = wrap.querySelector('[data-detalle]').value.trim();
    close();
    onConfirm({motivo: motivo, detalle: detalle});
  };
  wrap.querySelector('[data-cancel]').onclick = function(){ close(); if(onCancel) onCancel(); };
  wrap.onclick = function(ev){ if(ev.target===wrap){ close(); if(onCancel) onCancel(); } };
}

function updatePipelineStatus(id, newStatus){
  var pipe = getPipeline();
  var _row0 = pipe.find(function(r){ return r.id === id; });
  if(_row0 && !cevenCanEditPipelineRow(_row0.ejecutivo)){ showToast('No tenés permiso para modificar esta línea del pipeline.'); return; }
  if(newStatus === 'Perdido'){
    // Motivo obligatorio antes de aplicar. Cancelar no toca `pipe`: solo
    // hace falta repintar para que el <select> vuelva a mostrar el estado
    // real (el navegador ya cambió su valor visual al elegir la opción).
    abrirModalMotivoPerdida(function(motivo){
      _guardarEstadoPipeline(id, newStatus, motivo);
    }, function(){
      renderPipeline();
    });
    return;
  }
  _guardarEstadoPipeline(id, newStatus, null);
}

function _guardarEstadoPipeline(id, newStatus, perdidoMotivo){
  var pipe = getPipeline();
  pushPipeUndo(id);
  for(var i=0;i<pipe.length;i++){
    if(pipe[i].id === id){
      pipe[i].estado = newStatus;
      if(newStatus === 'Perdido') pipe[i].perdidoMotivo = perdidoMotivo;
      tryAutoMerge(pipe[i]);
      break;
    }
  }
  savePipeline(pipe);
  renderPipeline();
}

function updatePipelineMesCierreValue(id, fullValue){
  var pipe = getPipeline();
  var _row0 = pipe.find(function(r){ return r.id === id; });
  if(_row0 && !cevenCanEditPipelineRow(_row0.ejecutivo)){ showToast('No tenés permiso para modificar esta línea del pipeline.'); return; }
  pushPipeUndo(id);
  var qNum = null;
  for(var i=0;i<pipe.length;i++){
    if(pipe[i].id === id){
      pipe[i].mesCierre = fullValue || '';
      qNum = pipe[i].qNum;
      tryAutoMerge(pipe[i]);
      break;
    }
  }
  savePipeline(pipe);
  // Replicar el mes de cierre a la cotización guardada (cquotes)
  if(qNum){
    var db = getDB(), dbChanged = false;
    db.forEach(function(row){
      if(row['N° Cotización'] === qNum && row['Mes Cierre'] !== (fullValue||'')){
        row['Mes Cierre'] = fullValue || '';
        dbChanged = true;
      }
    });
    if(dbChanged) saveDB(db);
  }
  renderPipeline();
}

function updateSkuMesCierreValue(pipeId, lineKey, fullValue){
  var pipe = getPipeline();
  for(var i=0;i<pipe.length;i++){
    if(pipe[i].id === pipeId){
      if(!cevenCanEditPipelineRow(pipe[i].ejecutivo)){ showToast('No tenés permiso para modificar esta línea del pipeline.'); return; }
      if(countQuoteProductLines(pipe[i].qNum) <= 1){
        pipe[i].mesCierre = fullValue || '';
        if(pipe[i].skuMesCierre) delete pipe[i].skuMesCierre[lineKey];
        if(pipe[i].skuMesCierre && !Object.keys(pipe[i].skuMesCierre).length) delete pipe[i].skuMesCierre;
      } else {
        if(!pipe[i].skuMesCierre) pipe[i].skuMesCierre = {};
        if(fullValue) pipe[i].skuMesCierre[lineKey] = fullValue;
        else delete pipe[i].skuMesCierre[lineKey];
        tryAutoMerge(pipe[i]);
      }
      break;
    }
  }
  savePipeline(pipe);
  renderPipeline();
}

function updatePipelineMesCierre(id, kind, value){
  // kind = 'm' (mes) o 'y' (año). Almacenar como YYYY-MM en r.mesCierre.
  var pipe = getPipeline();
  for(var i=0;i<pipe.length;i++){
    if(pipe[i].id === id){
      if(!cevenCanEditPipelineRow(pipe[i].ejecutivo)){ showToast('No tenés permiso para modificar esta línea del pipeline.'); return; }
      var cur = pipe[i].mesCierre || '';
      var p = cur ? cur.split('-') : ['',''];
      var y = p[0] || '', m = p[1] || '';
      if(kind === 'y') y = value;
      else m = value;
      // Si ambos válidos, guardar; si alguno vacío, limpiar
      if(y && m) pipe[i].mesCierre = y + '-' + m;
      else pipe[i].mesCierre = '';
      break;
    }
  }
  savePipeline(pipe);
  renderPipeline();
}

function openPipelineQuote(qn){
  // Cargar la cotización del historial (mismo flujo que editar desde historial)
  var db = getDB();
  var rows = db.filter(function(r){ return r['N° Cotización'] === qn; });
  if(!rows.length){
    showToast('No se encontró la cotización #'+qn+' en el historial.');
    return;
  }
  editQuoteFromHistory(qn);
}

function removePipeline(id){
  var pipe = getPipeline();
  var row = pipe.find(function(r){ return r.id === id; });
  if(row && !cevenCanEditPipelineRow(row.ejecutivo)){ showToast('No tenés permiso para eliminar esta línea del pipeline.'); return; }
  if(!row) return;
  // Se borra y se avisa: pushPipeUndoRemove() guarda la fila entera para poder
  // reinsertarla desde el cartel (o desde el botón Deshacer del pipeline).
  if(typeof pushPipeUndoRemove === 'function') pushPipeUndoRemove(row);
  pipe = pipe.filter(function(r){ return r.id !== id; });
  savePipeline(pipe);
  renderPipeline();
  notifyUndo('Quitaste del pipeline la cotización #'+(row.qNum||'—')+' ('+(row.cliente||'—')+').',
    function(){ if(typeof undoPipelineChange==='function') undoPipelineChange(); });
}

function buildPipelineWorkbook(){
  /* Exporta LO QUE ESTÁ EN PANTALLA: antes bajaba `getPipeline()` entero,
     ignorando los filtros activos. */
  var pipe = cevenPipeFilasVisibles();
  if(!pipe.length) return null;
  var data = pipe.map(function(r){
    var mesLabel = '';
    if(r.mesCierre){
      var parts = r.mesCierre.split('-');
      if(parts.length === 2){
        var meses = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
        var mIdx = parseInt(parts[1]) - 1;
        if(mIdx >= 0 && mIdx < 12) mesLabel = meses[mIdx] + ' ' + parts[0];
      }
    }
    return {
      'Fecha': r.fecha,
      'Cotización #': r.qNum,
      'Estado': r.estado || 'Cotizado',
      'Ejecutivo': r.ejecutivo,
      'Cliente': r.cliente,
      'Proyecto': r.proyecto,
      'Cierre estimado': mesLabel,
      'Q Mac': r.qMac,
      'Q iPhone': r.qIph,
      'Q iPad': r.qIpad,
      'Q Servicios': r.qServ,
      'Q Accesorios': r.qAcc || 0,
      'Margen Ponderado %': r.margenPond != null ? r.margenPond : '',
      'Monto USD': r.monto,
      'OV Link': r.ovLink || ''
    };
  });
  var ws = XLSX.utils.json_to_sheet(data);
  ws['!cols'] = [{wch:11},{wch:13},{wch:13},{wch:14},{wch:24},{wch:24},{wch:14},{wch:8},{wch:9},{wch:8},{wch:12},{wch:14},{wch:14},{wch:14},{wch:32}];
  var wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Pipeline');
  return wb;
}

function exportPipeline(){
  var wb = buildPipelineWorkbook();
  if(!wb){ showToast('Pipeline vacío.'); return; }
  XLSX.writeFile(wb, 'Ceven_Pipeline.xlsx');
}

