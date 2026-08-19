
// ── PIPELINE · ARCHIVADO (especifico de Apple) ──
// getPipeline/savePipeline/getArchive/saveArchive/currentMonthKey viven en
// shared/pipeline-store.js: son identicos en las dos marcas. Lo de abajo NO:
// Apple archiva porciones de una cotizacion SKU por SKU (parciales, familias
// Mac/iPhone/iPad), Poly archiva la fila entera. Ver el comentario del modulo.

// Al entrar al pipeline: mueve al archivo las entradas Facturadas/Perdidas de meses anteriores
function archiveOldEntries(){
  var pipe = getPipeline();
  var archive = getArchive();
  var curMonth = currentMonthKey();
  var toKeep = [];
  var moved = 0;

  // 1. Archivar entradas completamente Facturadas/Perdidas de meses pasados
  pipe.forEach(function(r){
    var estado = r.estado || 'Cotizado';
    var mesC = r.mesCierre || '';
    var shouldArchive = (estado === 'Facturado' || estado === 'Perdido')
      && mesC && mesC < curMonth;
    if(shouldArchive){
      if(!archive[mesC]) archive[mesC] = [];
      var exists = archive[mesC].some(function(x){ return x.id === r.id && !x._fromPartial; });
      if(!exists){ archive[mesC].push(r); moved++; }
    } else {
      toKeep.push(r);
    }
  });

  // 2. Archivar porciones Facturadas de meses pasados (líneas individuales / parciales)
  //    Modelo: skuArchivedQty[lk] = unidades ya facturadas+archivadas de esa línea.
  //    recalcPipelineUnits y la expansión virtual descuentan ese valor, así que la
  //    resta es persistente e idempotente (no la deshace el recálculo).
  var db = getDB();
  var partialMoved = 0;
  var pipeChanged = false;
  // categorize() (pipeline-core.js) es ahora la única fuente: esta copia
  // inline había divergido en silencio (le faltaba la exclusión de
  // accesorios que sí tienen las otras), justo el riesgo que motiva
  // centralizarla en un solo lugar.
  function _catOf(ln){
    return categorize({description: ln['Descripción']||'', lob: (ln['_lob']||'').trim()});
  }
  toKeep.forEach(function(r){
    var hasAnyOverride = (r.skuStatus && Object.keys(r.skuStatus).length)
                      || (r.skuMesCierre && Object.keys(r.skuMesCierre).length);
    if(!hasAnyOverride) return;
    var lines = cevenOpcFilasDeCotiz(db, r.qNum, ['producto','garantia']);
    if(!lines.length) return;

    var rootSt  = r.estado    || 'Cotizado';
    var rootMes = r.mesCierre || '';
    var archByMonth = {}; // mc -> acumulador para entrada de archivo
    var entryChanged = false;

    lines.forEach(function(ln, idx){
      var lk    = (ln['SKU']||'')+'|'+idx;
      var tQty  = parseInt(ln['Cantidad'])||0;
      var already = (r.skuArchivedQty && parseInt(r.skuArchivedQty[lk])) || 0;
      var remainQty = tQty - already;
      if(remainQty <= 0) return; // ya totalmente archivada

      var st = (r.skuStatus && r.skuStatus[lk]) || rootSt;
      var mc = (r.skuMesCierre && r.skuMesCierre[lk] !== undefined) ? r.skuMesCierre[lk] : rootMes;
      if(!mc || mc >= curMonth) return; // no es de mes pasado

      var price = parseFloat(ln['P. Venta Unitario'])||0;
      var cat   = _catOf(ln);
      var mg    = parseFloat(ln['Margen %']);

      // ¿Hay ya una entrada de archivo parcial para este id+mes? (señal de orphan del flujo viejo)
      var hasArchiveEntry = archive[mc] && archive[mc].some(function(x){ return x.id===r.id && x._fromPartial; });

      // Caso A: línea Facturada en mes pasado → archivar su porción ahora
      // Caso B: orphan (mes pasado, no Facturado) pero ya existe entrada de archivo → solo marcar archivado
      var isFacturado = (st === 'Facturado');
      if(!isFacturado && !hasArchiveEntry) return; // Con OC con fecha pasada legítima → no tocar

      var pQty   = r.skuPartialQty && parseInt(r.skuPartialQty[lk]);
      var factQty = (pQty>0 && pQty<remainQty) ? pQty : remainQty;
      var isPartialRemain = (pQty>0 && pQty<remainQty);

      // Marcar unidades como archivadas
      if(!r.skuArchivedQty) r.skuArchivedQty = {};
      r.skuArchivedQty[lk] = already + factQty;

      // Crear/acumular entrada de archivo SOLO si es facturado real ahora (Caso A)
      if(isFacturado){
        var lM = factQty * price;
        if(!archByMonth[mc]) archByMonth[mc] = {qMac:0,qIph:0,qIpad:0,qServ:0,qAcc:0,monto:0,marW:0,marM:0};
        var a = archByMonth[mc];
        if(ln['Tipo']==='garantia') a.qServ+=factQty;
        else if(cat==='mac') a.qMac+=factQty;
        else if(cat==='iphone') a.qIph+=factQty;
        else if(cat==='ipad') a.qIpad+=factQty;
        else a.qAcc+=factQty;
        a.monto += lM;
        if(!isNaN(mg)&&lM>0){ a.marW+=mg*lM; a.marM+=lM; }
      }

      // Reconfigurar la línea activa: queda el remanente con su estado/mes propios, sin la parte facturada
      if(isPartialRemain){
        var remSt  = (r.skuPartialRemSt  && r.skuPartialRemSt[lk]) || rootSt;
        var remMes = (r.skuPartialRemMes && r.skuPartialRemMes[lk] !== undefined) ? r.skuPartialRemMes[lk] : rootMes;
        if(remSt !== rootSt){ if(!r.skuStatus) r.skuStatus={}; r.skuStatus[lk]=remSt; }
        else if(r.skuStatus) delete r.skuStatus[lk];
        if(remMes !== rootMes){ if(!r.skuMesCierre) r.skuMesCierre={}; r.skuMesCierre[lk]=remMes; }
        else if(r.skuMesCierre) delete r.skuMesCierre[lk];
      } else {
        // Toda la línea (o lo que restaba) se archivó → sin overrides de estado
        if(r.skuStatus)     delete r.skuStatus[lk];
        if(r.skuMesCierre)  delete r.skuMesCierre[lk];
      }
      if(r.skuPartialQty)   delete r.skuPartialQty[lk];
      if(r.skuPartialRemSt) delete r.skuPartialRemSt[lk];
      if(r.skuPartialRemMes)delete r.skuPartialRemMes[lk];
      entryChanged = true;
    });

    // Materializar entradas de archivo (Caso A). Dedupe/acumular por id+mes.
    Object.keys(archByMonth).forEach(function(mc){
      var a = archByMonth[mc];
      if(a.monto<=0 && (a.qMac+a.qIph+a.qIpad+a.qServ+a.qAcc)<=0) return;
      if(!archive[mc]) archive[mc]=[];
      var existing = archive[mc].find(function(x){ return x.id===r.id && x._fromPartial; });
      if(existing){
        existing.qMac=(existing.qMac||0)+a.qMac; existing.qIph=(existing.qIph||0)+a.qIph;
        existing.qIpad=(existing.qIpad||0)+a.qIpad; existing.qServ=(existing.qServ||0)+a.qServ;
        existing.qAcc=(existing.qAcc||0)+a.qAcc; existing.monto=(existing.monto||0)+Math.round(a.monto);
      } else {
        archive[mc].push({
          id:r.id, qNum:r.qNum, fecha:r.fecha||'', cliente:r.cliente||'',
          ejecutivo:r.ejecutivo||'', proyecto:r.proyecto||'',
          estado:'Facturado', mesCierre:mc, monto:Math.round(a.monto),
          qMac:a.qMac, qIph:a.qIph, qIpad:a.qIpad, qServ:a.qServ, qAcc:a.qAcc,
          margenPond:a.marM>0?Math.round(a.marW/a.marM*100)/100:(r.margenPond||null),
          ovLink:r.ovLink||undefined, _fromPartial:true
        });
        partialMoved++;
      }
    });

    if(entryChanged){
      pipeChanged = true;
      // Limpiar objetos de override vacíos
      if(r.skuStatus      &&!Object.keys(r.skuStatus).length)      delete r.skuStatus;
      if(r.skuMesCierre   &&!Object.keys(r.skuMesCierre).length)   delete r.skuMesCierre;
      if(r.skuPartialQty  &&!Object.keys(r.skuPartialQty).length)  delete r.skuPartialQty;
      if(r.skuPartialRemSt&&!Object.keys(r.skuPartialRemSt).length)delete r.skuPartialRemSt;
      if(r.skuPartialRemMes&&!Object.keys(r.skuPartialRemMes).length)delete r.skuPartialRemMes;
      if(r.skuArchivedQty &&!Object.keys(r.skuArchivedQty).length) delete r.skuArchivedQty;
    }
  });

  if(moved > 0 || partialMoved > 0 || pipeChanged){
    savePipeline(toKeep);
    saveArchive(archive);
    var msg = [];
    if(moved > 0) msg.push(moved+' entrada(s) archivada(s)');
    if(partialMoved > 0) msg.push(partialMoved+' parcial(es) archivado(s)');
    if(msg.length) showToast('📦 ' + msg.join(' · '));
  }
}
