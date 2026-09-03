/* togglePipelineRow(id) se fue con el direccionamiento por índice: ahora abrir y
   cerrar lo hace togglePipeNode(clave), en shared/pipeline-group.js, que sirve
   igual para un grupo de cliente que para una fila. */

/* ── LINK DE NETSUITE ────────────────────────────────────────────────────────
   El botón de la fila del pipeline llevaba el NÚMERO de factura; ahora lleva el
   link al proyecto en Netsuite. Con link cargado el botón abre Netsuite, y para
   cambiarlo está el ✎ amarillo de al lado.

   ⚠ **El dato se sigue guardando en la clave `factura`**, igual que "sala" en
   Poly: esa columna existe en Supabase (`pipeCols` y `nullableCols` de
   brand.js), viaja sincronizada a todo el equipo y ya tiene valores cargados.
   Renombrarla obligaría a una migración de la tabla `pipeline` y de los backups
   JSON para no ganar nada. Se renombró SOLO lo que se lee en pantalla. */

/* Un link pegado a mano puede venir sin protocolo ("app.netsuite.com/…"), y
   entonces el navegador lo trataría como una ruta relativa de la propia app.
   Devuelve '' si el texto no puede ser una URL http(s) — ver por qué abajo. */
function cevenNetsuiteURL(link){
  var url = String(link == null ? '' : link).trim();
  if(!url) return '';
  /* Solo http y https. El pipeline se sincroniza con todo el equipo, así que
     este valor NO es de confianza: un `javascript:...` guardado como link
     correría en la pantalla de todos al hacer clic en el botón. Cualquier otro
     esquema (javascript:, data:, file:) se descarta. */
  if(/^[a-z][a-z0-9+.-]*:/i.test(url)) return /^https?:\/\//i.test(url) ? url : '';
  /* Sin esquema se asume https, pero solo si lo que hay ANTES de la primera
     barra parece un dominio. Sin este chequeo, las filas viejas —que en esta
     columna guardaban el NÚMERO de factura— se convertían en "https://0001-123":
     el botón salía en verde como si tuviera link y no llevaba a ningún lado.
     Así quedan en rojo, que es la verdad: falta cargar el link. */
  var host = url.split(/[/?#]/)[0];
  if(host.indexOf('.') === -1) return '';
  return 'https://' + url;
}

function abrirNetsuite(id){
  var pipe = getPipeline();
  for(var i=0;i<pipe.length;i++){
    if(pipe[i].id !== id) continue;
    var url = cevenNetsuiteURL(pipe[i].factura);
    if(!url){ editNetsuiteLink(id); return; }   // sin link: se ofrece cargarlo
    window.open(url, '_blank', 'noopener,noreferrer');
    return;
  }
}

function editNetsuiteLink(id){
  var pipe = getPipeline();
  var idx = -1;
  for(var i=0;i<pipe.length;i++){ if(pipe[i].id === id){ idx = i; break; } }
  if(idx < 0) return;
  if(!cevenCanEditPipelineRow(pipe[idx].ejecutivo)){ showToast('No tenés permiso para modificar este proyecto: es de otro ejecutivo.'); return; }
  var current = pipe[idx].factura || '';
  promptModal(current ? 'Editar el link de Netsuite' : 'Pegá el link de Netsuite de este proyecto', current, function(val){
    val = (val||'').trim();
    if(val === current) return;
    // Se valida ACÁ además de al abrir: guardar algo que después no va a abrir
    // deja el botón en verde mintiendo que hay un link usable.
    if(val && !cevenNetsuiteURL(val)){
      showToast('Ese link no sirve: tiene que ser una dirección http:// o https://.');
      return;
    }
    if(typeof pushPipeUndo === 'function') pushPipeUndo(id);
    var pipe2 = getPipeline();
    for(var i=0;i<pipe2.length;i++){ if(pipe2[i].id === id){ pipe2[i].factura = val === '' ? null : val; break; } }
    savePipeline(pipe2);
    renderPipeline();
    notifyUndo(val ? '✓ Link de Netsuite actualizado' : '✓ Link de Netsuite quitado', function(){ if(typeof undoPipelineChange==='function') undoPipelineChange(); });
  }, {okLabel:'Guardar'});
}

/* ── OPG / código REGI ───────────────────────────────────────────────────
   El OPG es un dato informativo del proyecto (número de precio especial que
   asigna la marca) que además, desde 27/08/2026, sirve para vincular el
   proyecto con una oportunidad del pipeline REGI de HP: si acá se carga el
   mismo código que trae la columna "REGI" del Excel (ver pipeline-regi.js),
   esa oportunidad se oculta sola de la vista REGI. Antes solo se cargaba
   reabriendo la cotización entera — con esto se puede corregir sin salir
   del pipeline, igual que ya se hace con el link de Netsuite. */
function editOpgValue(id){
  var pipe = getPipeline();
  var idx = -1;
  for(var i=0;i<pipe.length;i++){ if(pipe[i].id === id){ idx = i; break; } }
  if(idx < 0) return;
  if(!cevenCanEditPipelineRow(pipe[idx].ejecutivo)){ showToast('No tenés permiso para modificar este proyecto: es de otro ejecutivo.'); return; }
  var current = pipe[idx].opg || '';
  promptModal('Editar OPG (pegá acá el código REGI de HP para vincular este proyecto)', current, function(val){
    val = (val||'').trim();
    if(val === current) return;
    if(typeof pushPipeUndo === 'function') pushPipeUndo(id);
    var pipe2 = getPipeline();
    for(var i=0;i<pipe2.length;i++){ if(pipe2[i].id === id){ pipe2[i].opg = val === '' ? null : val; break; } }
    savePipeline(pipe2);
    renderPipeline();
    notifyUndo(val ? '✓ OPG actualizado' : '✓ OPG quitado', function(){ if(typeof undoPipelineChange==='function') undoPipelineChange(); });
  }, {okLabel:'Guardar'});
}

function updatePipelineStatus(id, newStatus){
  var pipe = getPipeline();
  var row = pipe.find(function(r){ return r.id === id; });
  if(row && !cevenCanEditPipelineRow(row.ejecutivo)){ showToast('No tenés permiso para modificar este proyecto: es de otro ejecutivo.'); return; }
  if(newStatus === 'Perdido'){
    abrirModalMotivoPerdida(function(perdidoMotivo){
      _guardarEstadoPipeline(id, newStatus, perdidoMotivo);
    }, function(){
      renderPipeline();
    });
    return;
  }
  _guardarEstadoPipeline(id, newStatus, null);
}

function _guardarEstadoPipeline(id, newStatus, perdidoMotivo){
  var pipe = getPipeline();
  if(typeof pushPipeUndo === 'function') pushPipeUndo(id);
  for(var i=0;i<pipe.length;i++){
    if(pipe[i].id === id){
      pipe[i].estado = newStatus;
      if(newStatus === 'Perdido') pipe[i].perdidoMotivo = perdidoMotivo;
      else delete pipe[i].perdidoMotivo;
      break;
    }
  }
  savePipeline(pipe);
  renderPipeline();
}

function updatePipelineMesCierreValue(id, fullValue){
  var pipe = getPipeline();
  var row = pipe.find(function(r){ return r.id === id; });
  if(row && !cevenCanEditPipelineRow(row.ejecutivo)){ showToast('No tenés permiso para modificar este proyecto: es de otro ejecutivo.'); return; }
  if(typeof pushPipeUndo === 'function') pushPipeUndo(id);
  for(var i=0;i<pipe.length;i++){ if(pipe[i].id === id){ pipe[i].mesCierre = fullValue || ''; break; } }
  savePipeline(pipe);
  renderPipeline();
}

function removePipeline(id){
  var pipe = getPipeline();
  var row = pipe.find(function(r){ return r.id === id; });
  if(!row) return;
  if(!cevenCanEditPipelineRow(row.ejecutivo)){ showToast('No tenés permiso para eliminar este proyecto: es de otro ejecutivo.'); return; }
  if(typeof pushPipeUndoRemove === 'function') pushPipeUndoRemove(row);
  pipe = pipe.filter(function(r){ return r.id !== id; });
  savePipeline(pipe);
  renderPipeline();
  notifyUndo('Quitaste el proyecto "'+(row.proyecto||'—')+'" (cotización #'+(row.qNum||'—')+') del pipeline.', function(){ if(typeof undoPipelineChange==='function') undoPipelineChange(); });
}

/* removeSalaFromPipeline() vivía acá y se fue con el modelo de OPG: no hay más
   sub-filas que quitar, así que quitar un proyecto es removePipeline(id). */

function openPipelineQuote(qn){
  var db = getDB();
  var rows = db.filter(function(r){ return r['N° Cotización'] === qn; });
  if(!rows.length){ showToast('No se encontró la cotización #'+qn+' en el historial.'); return; }
  editQuoteFromHistory(qn);
}

/* Fila expandible: los ARTÍCULOS de la cotización del proyecto, con sus precios.

   Antes listaba las salas del OPG; con el modelo por proyecto eso ya no existe y
   el nivel que falta es el de abajo, que es el que nadie podía ver desde el
   pipeline (había que abrir el historial).

   Desde el 03/09/2026 cada artículo muestra además el NIVEL DE PRECIO con el
   que se cotizó y su ESTADO propio, y se lo puede sacar de la cotización con la
   tijera. El estado se hereda del proyecto salvo que la línea tenga uno
   configurado en particular (shared/pipeline-sku.js).

   `esArchivo` llega desde _pipeTablaHTML(): en un mes ya cerrado esto es de
   solo lectura, porque la fila no vive en getPipeline() y los handlers no la
   encontrarían — el clic quedaría mudo, el mismo bug que ya documenta el ✎ del
   OPG en pipeline-view.js.

   `db` viene de renderPipeline(): getDB() hace JSON.parse de varios MB y el poll
   redibuja cada 15 s, así que se parsea UNA vez por render y se pasa hacia
   abajo. Si no viene, se lee acá. */
function renderPipelineDetailRow(r, esArchivo, db){
  if(!db) db = getDB();
  var qn = r.qNum;
  // Solo la opción vigente (shared/opciones.js): con dos opciones, sin filtrar
  // se listarían las líneas de las dos.
  var lines = cevenOpcFilasDeCotiz(db, qn);

  if(!lines.length){
    /* La cotización puede haberse borrado del historial y la fila del pipeline
       sobrevive: decirlo es mejor que mostrar una tabla vacía. */
    return '<tr class="pipe-detail"><td colspan="9" style="padding:14px 18px;background:#fafafa;color:#aeaeb2;font-size:12px">'
      + 'No se encontraron los artículos de la cotización #' + cevenEsc(qn||'—')
      + ' — puede haberse borrado del historial.</td></tr>';
  }

  var editable = !esArchivo && cevenCanEditPipelineRow(r.ejecutivo);
  var idA = cevenEsc(r.id);
  var total = 0;
  var body = '';
  lines.forEach(function(ln, i){
    var precio = parseFloat(ln['P. Venta Unitario']) || 0;
    var cant   = parseInt(ln['Cantidad'], 10) || 1;
    var sub    = precio * cant;
    total += sub;

    /* El nivel viaja con cada línea de la cotización desde 08/2026
       ('Nivel de precio' en poly/js/state.js). Las cotizaciones anteriores a
       esa columna no lo tienen: ahí va un guión, no una etiqueta inventada. */
    var tier = ln['Nivel de precio'] || '';
    var tierTxt = tier ? cevenTierLabel(tier) : '—';

    var lk = cevenSkuLineKey(ln, i);
    var lnSt = cevenSkuEstado(r, lk);
    var propio = !!(r.skuStatus && r.skuStatus[lk] !== undefined);
    var cSt = cevenEstadoPill(lnSt);
    var lineA = ' data-did="'+idA+'" data-lk="'+cevenEsc(lk)+'"';

    var celdaSt = editable
      ? '<select data-dact="sku-est"'+lineA+' title="'+(propio ? 'Estado propio de este artículo' : 'Heredado del proyecto')+'"'
          + ' style="padding:2px 5px;border:0.5px solid '+(propio ? cSt.fg : '#d2d2d7')+';border-radius:5px;font-size:10px;'
          + 'font-family:inherit;background:'+(propio ? cSt.bg : '#fff')+';color:'+cSt.fg+';font-weight:600">'
          + cevenSkuEstadoOptions(lnSt) + '</select>'
      : '<span class="'+cevenEsc(cevenSpillClass(lnSt))+'" style="border-radius:980px;padding:2px 8px;font-size:10px;font-weight:700;'
          + 'color:'+cSt.fg+';background:'+cSt.bg+'">'+cevenEsc(cevenEstadoLabel(lnSt))+'</span>';

    /* Dos acciones por línea, las dos solo con permiso de edición:
         ×  vuelve a heredar el estado del proyecto (solo si tiene uno propio)
         ✂️ saca el artículo de la cotización */
    var celdaAcc = '';
    if(editable){
      celdaAcc = propio
        ? '<button class="bs" data-dact="sku-est-clear"'+lineA+' title="Volver a heredar el estado del proyecto" style="padding:1px 6px;font-size:10px">×</button> '
        : '';
      celdaAcc += '<button class="bsr" data-dact="sku-rm"'+lineA+' title="Sacar este artículo de la cotización" style="padding:1px 6px;font-size:11px">✂️</button>';
    }

    body += '<tr style="border-top:0.5px solid #f0f0f0">'
      +'<td style="padding:6px 10px;font-family:ui-monospace,Menlo,monospace;font-size:11px">'+cevenEsc(ln['SKU']||'—')+'</td>'
      +'<td style="padding:6px 10px">'+cevenEsc(ln['Descripción']||'—')+'</td>'
      +'<td style="padding:6px 10px;text-align:center;font-size:11px;color:#6e6e73;white-space:nowrap">'+cevenEsc(tierTxt)+'</td>'
      +'<td style="padding:6px 10px;text-align:center">'+cant+'</td>'
      +'<td style="padding:6px 10px;text-align:right">USD '+fI(precio)+'</td>'
      +'<td style="padding:6px 10px;text-align:right;font-weight:500">USD '+fI(sub)+'</td>'
      +'<td style="padding:6px 10px;text-align:center;overflow:visible">'+celdaSt+'</td>'
      +'<td style="padding:6px 10px;text-align:center;white-space:nowrap">'+celdaAcc+'</td>'
      +'</tr>';
  });

  var qnA = cevenEsc(qn||'');
  /* El total de los artículos puede no coincidir con el monto de la fila: el
     monto es una foto del momento de agregar al pipeline y la cotización pudo
     editarse después. Cuando difieren se avisa, en vez de dejar dos números
     distintos en pantalla sin explicación. */
  var descuadre = Math.abs(Math.round(total) - Math.round(r.monto||0)) > 1
    ? '<span style="color:#c84e00;font-weight:500"> · la fila dice USD '+fI(r.monto||0)+': la cotización se editó después de agregarla</span>'
    : '';

  var inner = '<div style="padding:10px 14px 14px;background:#fafafa">'
    +'<div style="font-size:11px;color:#6e6e73;text-transform:uppercase;letter-spacing:.4px;margin-bottom:8px">'
      +'Artículos · cotización <span data-act="openq" data-qn="'+qnA+'" style="color:var(--acc,#0071e3);font-weight:700;cursor:pointer">#'+qnA+'</span>'
      +(r.opg ? ' · OPG '+cevenEsc(r.opg) : '')
    +'</div>'
    +'<table style="width:100%;font-size:12px;border-collapse:collapse;background:#fff;border:0.5px solid #e5e5e7;border-radius:8px;overflow:hidden">'
    +'<thead><tr style="background:#f5f5f7">'
      +'<th style="text-align:left;padding:6px 10px;font-size:11px;color:#6e6e73">SKU</th>'
      +'<th style="text-align:left;padding:6px 10px;font-size:11px;color:#6e6e73">Descripción</th>'
      +'<th style="text-align:center;padding:6px 10px;font-size:11px;color:#6e6e73">Nivel</th>'
      +'<th style="text-align:center;padding:6px 10px;font-size:11px;color:#6e6e73">Cant.</th>'
      +'<th style="text-align:right;padding:6px 10px;font-size:11px;color:#6e6e73">P. unitario</th>'
      +'<th style="text-align:right;padding:6px 10px;font-size:11px;color:#6e6e73">Subtotal</th>'
      +'<th style="text-align:center;padding:6px 10px;font-size:11px;color:#6e6e73">Estado</th>'
      +'<th style="padding:6px 10px"></th>'
    +'</tr></thead><tbody>'+body+'</tbody>'
    +'<tfoot><tr style="background:#f5f5f7;border-top:0.5px solid #e5e5e7">'
      +'<td colspan="5" style="padding:6px 10px;text-align:right;font-size:11px;color:#6e6e73">Total de la cotización'+descuadre+'</td>'
      +'<td style="padding:6px 10px;text-align:right;font-weight:600">USD '+fI(total)+'</td>'
      +'<td colspan="2"></td>'
    +'</tr></tfoot></table></div>';
  return '<tr class="pipe-detail"><td colspan="9" style="padding:0;background:#fafafa">'+inner+'</td></tr>';
}

/* ── ESTADO PROPIO DE UNA LÍNEA ──────────────────────────────────────────────
   La herencia y los colapsos viven en shared/pipeline-sku.js; acá queda lo que
   toca el pipeline de Poly: buscar la fila, chequear permiso, guardar.

   A diferencia del estado del PROYECTO, poner una línea en 'Perdido' no abre el
   modal de motivo: el motivo describe por qué se cayó el negocio entero y se
   sigue cargando desde el <select> de la fila. */
function _pipeFilaPorId(id){
  var pipe = getPipeline();
  for(var i=0;i<pipe.length;i++){ if(pipe[i].id === id) return {pipe: pipe, row: pipe[i]}; }
  return null;
}

function updateSkuEstadoPipe(id, lineKey, nuevo){
  var f = _pipeFilaPorId(id);
  if(!f){ showToast('Ese proyecto ya no está en el pipeline actual.'); return; }
  if(!cevenCanEditPipelineRow(f.row.ejecutivo)){ showToast('No tenés permiso para modificar este proyecto: es de otro ejecutivo.'); renderPipeline(); return; }
  var todas = cevenOpcFilasDeCotiz(getDB(), f.row.qNum).map(cevenSkuLineKey);
  if(typeof pushPipeUndo === 'function') pushPipeUndo(id);
  if(!cevenSkuEstadoSet(f.row, lineKey, nuevo, todas)){ renderPipeline(); return; }
  savePipeline(f.pipe);
  renderPipeline();
}

function clearSkuEstadoPipe(id, lineKey){
  var f = _pipeFilaPorId(id);
  if(!f) return;
  if(!cevenCanEditPipelineRow(f.row.ejecutivo)){ showToast('No tenés permiso para modificar este proyecto: es de otro ejecutivo.'); return; }
  if(typeof pushPipeUndo === 'function') pushPipeUndo(id);
  if(!cevenSkuLimpiar(f.row, lineKey)) return;
  savePipeline(f.pipe);
  renderPipeline();
}

/* ── SACAR UN ARTÍCULO DE LA COTIZACIÓN (✂️) ─────────────────────────────────
   Los artículos NO son del pipeline: son filas de `cquotes`. Sacar uno es
   editar una cotización guardada sin abrirla, y hay que dejar consistentes las
   tres cosas que dependen de esas líneas: el historial, el monto de la fila y
   las claves `SKU|índice` de los estados por línea.

   El molde es cambiarOpcionVigente() (pipeline-core.js), que ya toca `cquotes`
   y recalcula el monto con la MISMA función que usa "Agregar al pipeline"
   (_pipeMontoDeItems) — si fueran dos cuentas distintas, la fila diría un total
   y la cotización otro. */
function quitarLineaDeCotizacion(id, lineKey){
  var f = _pipeFilaPorId(id);
  if(!f){ showToast('Ese proyecto ya no está en el pipeline actual.'); return; }
  var row = f.row;
  if(!cevenCanEditQuote(row.ejecutivo)){ showToast('No tenés permiso para editar esta cotización.'); return; }

  // Un solo getDB(): `lines` tiene que ser las MISMAS referencias que están en
  // `db`, porque el borrado es por identidad de objeto (así la opción A/B que
  // no está vigente no se toca ni por casualidad).
  var db = getDB();
  var lines = cevenOpcFilasDeCotiz(db, row.qNum);
  var idx = -1;
  for(var i=0;i<lines.length;i++){ if(cevenSkuLineKey(lines[i], i) === lineKey){ idx = i; break; } }
  if(idx < 0){ showToast('Ese artículo ya no está en la cotización.'); renderPipeline(); return; }

  /* Sacar el último dejaría una fila de pipeline apuntando a una cotización
     que ya no existe (el detalle mostraría "no se encontraron los artículos" y
     el monto quedaría en 0). Para eso está el ✕ de la fila. */
  if(lines.length <= 1){
    showToast('Es el único artículo de la cotización #'+(row.qNum||'—')+' — usá ✕ para quitar el proyecto del pipeline.');
    return;
  }

  var target = lines[idx];
  var sku = target['SKU'] || '—';
  // Estado previo para el Deshacer. `db` no se muta: el borrado arma un array
  // nuevo, así que esta misma referencia sirve para volver atrás con el orden
  // original intacto (importante: el orden ES el índice de los lineKeys).
  var dbAntes = db;
  var montoAntes = row.monto;
  var skuStatusAntes = row.skuStatus ? JSON.parse(JSON.stringify(row.skuStatus)) : null;

  if(!saveDB(db.filter(function(x){ return x !== target; }))){
    showToast('No se pudo guardar el cambio (almacenamiento lleno): la cotización quedó como estaba.');
    return;
  }

  // Corre los índices de los estados por línea ANTES de recalcular el monto:
  // sin esto, los overrides de las líneas de abajo apuntan a la equivocada.
  cevenSkuReindex(row, ['skuStatus'], lines, idx);
  row.monto = _pipeMontoDeItems(lines.filter(function(x){ return x !== target; }).map(function(l){
    return {qty: parseInt(l['Cantidad'], 10) || 1, salePrice: parseFloat(l['P. Venta Unitario']) || 0};
  }));
  savePipeline(f.pipe);
  renderPipeline();

  notifyUndo('Sacaste '+sku+' de la cotización #'+(row.qNum||'—')+'.', function(){
    saveDB(dbAntes);
    var f2 = _pipeFilaPorId(id);
    if(f2){
      f2.row.monto = montoAntes;
      if(skuStatusAntes) f2.row.skuStatus = skuStatusAntes; else delete f2.row.skuStatus;
      savePipeline(f2.pipe);
    }
    renderPipeline();
  });
}

function buildPipelineWorkbook(){
  /* Exporta LO QUE ESTÁ EN PANTALLA, no `getPipeline()` entero: antes ignoraba
     los filtros y la vista de mes archivado, así que "⬇ Excel" sobre un pipeline
     filtrado bajaba igual todo. Las filas son las que dejó el último render
     (window._pipeNodes), en el mismo orden y agrupadas por cliente. */
  var pipe = cevenPipeFilasVisibles();
  if(!pipe.length) return null;
  var meses = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

  /* Columna "Estados por ítem": solo se llena en los proyectos donde el estado
     de la fila NO alcanza para explicar el monto, o sea los que tienen
     artículos con estado propio. Sin esto, el Excel diría "Cotizado · USD 50k"
     de un proyecto que en pantalla tiene 30k ya facturados.
     getDB() se parsea a lo sumo una vez, y solo si hace falta. */
  var _db = null;
  function _estadosPorItem(r){
    if(!cevenSkuTieneOverrides(r)) return '';
    if(_db === null) _db = getDB();
    var rep = cevenSkuRepartoPorEstado(r, cevenOpcFilasDeCotiz(_db, r.qNum));
    return Object.keys(rep).map(function(st){
      return cevenEstadoLabel(st) + ': USD ' + Math.round(rep[st]);
    }).join(' · ');
  }

  var data = pipe.map(function(r){
    var mesLabel = '';
    if(r.mesCierre){
      var parts = r.mesCierre.split('-');
      if(parts.length === 2){
        var mIdx = parseInt(parts[1]) - 1;
        if(mIdx >= 0 && mIdx < 12) mesLabel = meses[mIdx] + ' ' + parts[0];
      }
    }
    /* Mismo orden que la tabla en pantalla. La columna se llamaba "Proyectos" y
       traía un NÚMERO (cuántas salas tenía el OPG) mientras la tabla mostraba un
       NOMBRE bajo el encabezado "Proyecto": el mismo concepto con dos contenidos
       incompatibles. Ahora es el nombre, como en pantalla. */
    return {
      'Fecha': r.fecha,
      'Ejecutivo': r.ejecutivo,
      'Cliente': r.cliente,
      'OPG': r.opg || '',
      'Proyecto': r.proyecto || '',
      'Cotización': r.qNum || '',
      'Cierre estimado': mesLabel,
      'Estado': cevenEstadoLabel(r.estado || 'Cotizado'),
      'Estados por ítem': _estadosPorItem(r),
      'Monto USD': r.monto,
      // La clave sigue siendo `factura` (columna de Supabase); lo que cambió es
      // qué guarda y cómo se llama en pantalla. Ver el comentario de arriba.
      'Netsuite': r.factura || ''
    };
  });
  var ws = XLSX.utils.json_to_sheet(data);
  ws['!cols'] = [{wch:11},{wch:18},{wch:24},{wch:14},{wch:26},{wch:12},{wch:14},{wch:13},{wch:34},{wch:14},{wch:16}];
  var wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Pipeline');
  return wb;
}

function exportPipeline(){
  var wb = buildPipelineWorkbook();
  if(!wb){ showToast('No hay proyectos para exportar con los filtros actuales.'); return; }
  XLSX.writeFile(wb, 'Ceven_Poly_Pipeline.xlsx');
}
