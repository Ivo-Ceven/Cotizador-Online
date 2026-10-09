/* ============================================================
   PIPELINE · MES DE FACTURACIÓN  ·  compartido por todas las marcas
   ------------------------------------------------------------
   Una cotización Facturada tiene que contar en el mes en que se FACTURÓ, no en
   el de su cierre estimado: el caso que lo motivó es una cotización con cierre
   en diciembre que se terminó facturando en octubre.

   Cómo se resuelve sin tocar dashboards ni archivado: al pasar a Facturado, el
   `mesCierre` de la fila pasa a ser el mes actual (todo lo que agrupa por mes
   —selector, forecast, archivo— ya lee solo `mesCierre`). Lo que queda
   guardado además:

     `mesFact`        'YYYY-MM' en que quedó Facturada la fila entera.
     `fechaFact`      ISO de ese momento.
     `skuMesFact`     { 'SKU|idx': 'YYYY-MM' } para las líneas que se facturaron
                      con estado propio (shared/pipeline-sku.js).
     `mesCierreAntes` el cierre estimado previo: si el Facturado era un error y
                      se cambia de estado, se restaura y no queda rastro.

   Tres piezas:
     1. cevenFactSellar()   la llama savePipeline() en cada guardado.
     2. cevenFactBackfill() una pasada para lo que ya estaba Facturado antes de
                            que existieran estos campos (usa el mes de `fechaMod`).
     3. cevenFactSplit()    al pasar de mes, una cotización con líneas facturadas
                            y otras pendientes se parte: lo facturado queda en su
                            mes y lo pendiente pasa a una cotización nueva,
                            "<proyecto> (artículos pendientes)".

   Depende de: pipeline-store.js (getPipeline, savePipeline, currentMonthKey) y
   pipeline-sku.js en tiempo de ejecución. Se carga DESPUÉS de los dos.
   ============================================================ */

var CEVEN_SUFIJO_PENDIENTES = ' (artículos pendientes)';

/* Las filas derivadas toman el id del padre + este corrimiento. Tiene que ser
   determinístico (dos personas que parten la misma fila a la vez convergen en
   la MISMA fila y no en dos) y ENTERO: `id` es bigint. Los ids reales rondan
   1.7e15 (Date.now()*1000) y MAX_SAFE_INTEGER es 9.0e15, así que 3e15 no choca
   con ninguno y entran dos generaciones de derivadas. */
var CEVEN_ID_DERIVADA = 3e15;

/* 'YYYY-MM' (hora local) de un ISO. '' si no es una fecha. */
function cevenFactMesDeISO(iso){
  if(!iso) return '';
  /* savePipeline() siembra `fechaMod` de las altas con `fecha`, que es
     'dd/mm/aaaa': `new Date()` lo leería como mm/dd. */
  var dm = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(String(iso));
  if(dm) return dm[3] + '-' + dm[2].padStart(2, '0');
  var d = new Date(iso);
  if(isNaN(d.getTime())) return '';
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}

/* El mes en que se facturó una línea, o '' si no se sabe / no está facturada.
   Una línea con estado propio lleva el suyo en `skuMesFact`; una que hereda
   el estado del proyecto lleva el del proyecto. */
function cevenFactMesDeLinea(row, lk){
  if(!row) return '';
  if(row.skuStatus && row.skuStatus[lk] !== undefined){
    return (row.skuStatus[lk] === 'Facturado' && row.skuMesFact && row.skuMesFact[lk]) || '';
  }
  return row.estado === 'Facturado' ? (row.mesFact || '') : '';
}

/* ── 1. SELLADO ──────────────────────────────────────────────────────────────
   `row` es la fila que se está guardando, `old` la que había (o null si es un
   alta). Muta `row`. La llama savePipeline() salvo en cambios del sistema
   (roll, backfill y split fijan sus propios campos).

   `conMesCierreSku`: la marca tiene `skuMesCierre` por línea (Apple). Una línea
   que pasa a Facturado también fija ahí el mes, que es lo que lee su archivado
   por línea y el Target Anual. */
function cevenFactSellar(row, old, mes, ahora, conMesCierreSku){
  if(!row) return;
  var antesF = !!old && old.estado === 'Facturado';
  var ahoraF = row.estado === 'Facturado';

  if(ahoraF && !antesF){
    row.mesFact = mes;
    row.fechaFact = ahora;
    if((row.mesCierre || '') !== mes){
      if(typeof row.mesCierreAntes !== 'string') row.mesCierreAntes = row.mesCierre || '';
      row.mesCierre = mes;
    }
  } else if(!ahoraF && antesF){
    // Era un error (o se reabrió): se vuelve al cierre estimado que tenía, salvo
    // que alguien ya lo haya corregido a mano.
    if(row.mesFact && row.mesCierre === row.mesFact && typeof row.mesCierreAntes === 'string'){
      row.mesCierre = row.mesCierreAntes;
    }
    delete row.mesFact; delete row.fechaFact; delete row.mesCierreAntes;
  } else if(ahoraF && antesF && old && (row.mesCierre || '') !== (old.mesCierre || '')){
    // Corrección manual del mes sobre una fila ya Facturada: es el mes real.
    row.mesFact = row.mesCierre || row.mesFact;
  }

  // Por línea: solo las que tienen estado propio (las que heredan van con la fila).
  var oSt = (old && old.skuStatus) || {};
  var nSt = row.skuStatus || {};
  var prev = row.skuMesFact || (old && old.skuMesFact) || {};
  var mapa = {};
  Object.keys(nSt).forEach(function(k){
    if(nSt[k] !== 'Facturado') return;
    var antes = (oSt[k] !== undefined) ? oSt[k] : (old && old.estado);
    if(antes === 'Facturado'){
      mapa[k] = prev[k] || (old && old.estado === 'Facturado' && oSt[k] === undefined ? old.mesFact : '') || mes;
    } else {
      mapa[k] = mes;
      if(conMesCierreSku){
        if(!row.skuMesCierre) row.skuMesCierre = {};
        row.skuMesCierre[k] = mes;
      }
    }
  });
  if(Object.keys(mapa).length) row.skuMesFact = mapa; else delete row.skuMesFact;
}

/* ── 2. BACKFILL ─────────────────────────────────────────────────────────────
   Lo que ya estaba Facturado antes de esta versión no tiene `mesFact`. Se le
   asigna el mes de su `fechaMod` (la última modificación real: es una
   aproximación, una edición posterior a la factura la corre, por eso el aviso
   lista lo que movió).

   Idempotente sin bandera: una vez sellada la fila ya tiene `mesFact`, así que
   no vuelve a entrar. Eso también cubre filas Facturadas por un navegador con
   la versión vieja en caché. Va con {systemChange:true}: no es actividad del
   vendedor y no tiene que mover `fechaMod`. */
function cevenFactBackfill(){
  var pipe = getPipeline();
  var tocadas = [];
  pipe.forEach(function(r){
    var mesMod = cevenFactMesDeISO(r.fechaMod);
    if(!mesMod) return;
    var movio = false;
    if(r.estado === 'Facturado' && !r.mesFact){
      r.mesFact = mesMod;
      r.fechaFact = r.fechaMod;
      if((r.mesCierre || '') !== mesMod){
        r.mesCierreAntes = r.mesCierre || '';
        r.mesCierre = mesMod;
        movio = true;
      }
      tocadas.push({r: r, desde: r.mesCierreAntes, movio: movio});
    }
    if(r.skuStatus){
      Object.keys(r.skuStatus).forEach(function(k){
        if(r.skuStatus[k] !== 'Facturado') return;
        if(r.skuMesFact && r.skuMesFact[k]) return;
        if(!r.skuMesFact) r.skuMesFact = {};
        r.skuMesFact[k] = mesMod;
        if(!tocadas.some(function(t){ return t.r === r; })) tocadas.push({r: r, desde: null, movio: false});
      });
    }
  });
  if(!tocadas.length) return 0;
  savePipeline(pipe, {systemChange: true});

  var movidas = tocadas.filter(function(t){ return t.movio; });
  if(movidas.length && typeof showToast === 'function'){
    var nombres = movidas.slice(0, 3).map(function(t){ return t.r.proyecto || t.r.cliente || ('#' + t.r.qNum); });
    showToast('✓ ' + movidas.length + (movidas.length === 1 ? ' cotización facturada pasó' : ' cotizaciones facturadas pasaron')
      + ' al mes en que se facturó (según su última modificación): ' + nombres.join(', ')
      + (movidas.length > 3 ? '…' : '') + '. Si alguna está mal, corregí el mes en la fila.');
  }
  return tocadas.length;
}

/* ── 3. SPLIT AL PASAR DE MES ────────────────────────────────────────────────
   Una cotización con líneas facturadas en un mes ya cerrado y otras todavía
   abiertas se parte en dos:

     · PADRE  conserva las líneas Facturadas de meses pasados (y las Perdidas),
              queda Facturado en su mes y lo archiva archiveOldEntries().
     · HIJA   cotización nueva con todo lo demás —pendientes y lo facturado en
              el mes en curso—, número nuevo, proyecto "<…> (artículos
              pendientes)", en el pipeline vivo.

   Solo parte la opción vigente (A/B), que es la que cuenta en el pipeline.
   Apple factura por unidades y tiene su propio archivado por línea: no se
   parte acá. */
function _factRaizYMapa(lines, idxs, estados, raiz){
  var sk = {};
  idxs.forEach(function(iOld, iNew){
    if(estados[iOld] !== raiz) sk[cevenSkuLineKey(lines[iOld], iNew)] = estados[iOld];
  });
  return sk;
}

function _factMontoDe(lines, idxs){
  return _pipeMontoDeItems(idxs.map(function(i){
    return {qty: parseInt(lines[i]['Cantidad'], 10) || 1, salePrice: parseFloat(lines[i]['P. Venta Unitario']) || 0};
  }));
}

function _factNombreHija(p){
  p = String(p || '').trim();
  if(p.indexOf(CEVEN_SUFIJO_PENDIENTES.trim()) >= 0) return p;
  return (p || '—') + CEVEN_SUFIJO_PENDIENTES;
}

function cevenFactSplit(){
  if(typeof _pipeMontoDeItems !== 'function') return 0;
  var B = window.CEVEN_BRAND || {};
  if((B.pipeCols || []).indexOf('skuPartialQty') !== -1) return 0;   // Apple: otro camino

  var cur = currentMonthKey();
  var pipe = getPipeline();
  var db = null;
  var quitar = [], agregar = [], hijas = [], partidas = 0;
  var ahora = new Date();

  pipe.slice().forEach(function(r){
    if(!cevenSkuTieneOverrides(r)) return;
    var childId = (Number(r.id) || 0) + CEVEN_ID_DERIVADA;
    if(!Number(r.id) || childId > 9e15) return;
    if(pipe.some(function(x){ return Number(x.id) === childId; })) return;   // ya se partió

    if(db === null) db = getDB();
    var lines = cevenOpcFilasDeCotiz(db, r.qNum);
    if(lines.length < 2) return;

    var cierre = [], resto = [], estados = [], meses = [], hayPasada = false;
    lines.forEach(function(l, i){
      var lk = cevenSkuLineKey(l, i);
      var st = cevenSkuEstado(r, lk);
      var m = cevenFactMesDeLinea(r, lk);
      estados[i] = st; meses[i] = m;
      if(st === 'Perdido'){ cierre.push(i); }
      else if(st === 'Facturado' && m && m < cur){ cierre.push(i); hayPasada = true; }
      else { resto.push(i); }
    });
    // Hace falta algo PENDIENTE: si lo que queda es solo facturado de este mes
    // no hay nada que derivar.
    var pendientes = resto.filter(function(i){ return estados[i] !== 'Facturado'; });
    if(!hayPasada || !pendientes.length) return;

    // ── hija ──
    var qnHija = cevenQNumFmt(cevenReservarQNum());
    var nombre = _factNombreHija(r.proyecto);
    var primera = estados[pendientes[0]];
    var skHija = _factRaizYMapa(lines, resto, estados, primera);
    var mesFHija = {};
    resto.forEach(function(iOld, iNew){
      if(estados[iOld] === 'Facturado') mesFHija[cevenSkuLineKey(lines[iOld], iNew)] = (meses[iOld] && meses[iOld] >= cur) ? meses[iOld] : cur;
    });
    var parentQid = (lines[0] && lines[0]['_qid']) || cevenQIdLegacy(r.qNum);
    var fecha = ahora.toLocaleDateString('es-AR');
    var hora = ahora.toLocaleTimeString('es-AR', {hour: '2-digit', minute: '2-digit'});
    var mesHija = (r.mesCierre && r.mesCierre >= cur) ? r.mesCierre : cur;

    var hija = {
      id: childId, fecha: fecha, fechaISO: ahora.toISOString(), qNum: qnHija,
      cliente: r.cliente, clienteId: r.clienteId, proyecto: nombre, opg: r.opg || null,
      ejecutivo: r.ejecutivo, mesCierre: mesHija, estado: primera,
      monto: _factMontoDe(lines, resto), moneda: r.moneda || 'USD', factura: null
    };
    if(Object.keys(skHija).length) hija.skuStatus = skHija;
    if(Object.keys(mesFHija).length) hija.skuMesFact = mesFHija;
    hijas.push(hija);

    resto.forEach(function(i){
      var c = Object.assign({}, lines[i]);
      c['N° Cotización'] = qnHija;
      c['_qid'] = parentQid + '-pend';
      c['Fecha'] = fecha; c['Hora'] = hora;
      c['Proyecto'] = nombre;
      c['Mes Cierre'] = mesHija;
      c['Opción'] = 1; c['_opcEf'] = 1;
      agregar.push(c);
      quitar.push(lines[i]);
    });

    // ── padre ──
    var mesPadre = cierre.reduce(function(a, i){ return (meses[i] && meses[i] > a) ? meses[i] : a; }, '');
    var skPadre = _factRaizYMapa(lines, cierre, estados, 'Facturado');
    r.estado = 'Facturado';
    if(Object.keys(skPadre).length) r.skuStatus = skPadre; else delete r.skuStatus;
    delete r.skuMesFact; delete r.mesCierreAntes;
    r.mesFact = mesPadre;
    r.mesCierre = mesPadre;
    r.monto = _factMontoDe(lines, cierre);
    partidas++;
  });

  if(!partidas) return 0;

  var nuevaDB = db.filter(function(x){ return quitar.indexOf(x) === -1; }).concat(agregar);
  if(!saveDB(nuevaDB)) return 0;                 // sin lugar: no se toca el pipeline
  hijas.forEach(function(h){ pipe.push(h); });
  savePipeline(pipe, {systemChange: true});

  if(typeof showToast === 'function'){
    showToast('↪ ' + partidas + (partidas === 1 ? ' cotización tenía' : ' cotizaciones tenían')
      + ' artículos facturados y otros pendientes: lo facturado quedó en su mes y lo pendiente pasó a una cotización nueva'
      + CEVEN_SUFIJO_PENDIENTES.trim() + '.', {
      actionLabel: 'Ver',
      onAction: function(){ window._pipeMonthFilter = cur; if(typeof renderPipeline === 'function') renderPipeline(); }
    });
  }
  return partidas;
}

/* Lo único que llama _navApply() al entrar al Pipeline, ANTES del auto-roll y del
   archivado. Un error acá no puede dejar la vista sin pintar. */
function cevenFactAlEntrarAlPipeline(){
  if(typeof cevenCanUsePipeline === 'function' && !cevenCanUsePipeline()) return;
  try{
    cevenFactBackfill();
    cevenFactSplit();
  }catch(e){
    if(window.console) console.error('[pipeline-facturacion]', e);
  }
}

/* ── EDITAR A MANO EL MES DE FACTURACIÓN DE UN ARTÍCULO ──────────────────────
   Lo que se infiere al migrar los datos viejos (mes de `fechaMod`) es una
   aproximación: si alguien tocó la cotización después de facturar, el mes sale
   corrido. Este es el arreglo manual, desde el detalle de la fila.

   Con estado propio en la línea → `skuMesFact[lk]`. Si la línea hereda
   Facturado del proyecto (todos facturados) → el mes de la fila entera:
   `mesFact` y `mesCierre`, que es lo que agrupa el pipeline. */
function cevenFactSetMesLinea(row, lk, mes){
  if(!row || !lk || !/^\d{4}-\d{2}$/.test(mes || '')) return false;
  if(row.skuStatus && row.skuStatus[lk] !== undefined){
    if(row.skuStatus[lk] !== 'Facturado') return false;
    if(!row.skuMesFact) row.skuMesFact = {};
    if(row.skuMesFact[lk] === mes) return false;
    row.skuMesFact[lk] = mes;
    return true;
  }
  if(row.estado !== 'Facturado' || row.mesCierre === mes) return false;
  row.mesFact = mes;
  row.mesCierre = mes;
  return true;
}

/* <select> de meses: del año pasado hasta el mes actual (facturar a futuro no
   existe). Si el mes guardado queda afuera de la ventana, se agrega igual. */
function cevenFactMesSelectHTML(row, lk, attrs){
  var cur = currentMonthKey(), sel = cevenFactMesDeLinea(row, lk);
  var meses = [];
  for(var i = 0; i < 13; i++) meses.push(cevenMonthAdd(cur, -i));
  if(sel && meses.indexOf(sel) === -1) meses.push(sel);
  var lab = function(k){ return (typeof cevenMesLabel === 'function') ? cevenMesLabel(k) : k; };
  var h = '<select data-dact="sku-mes-fact"' + attrs + ' title="Mes en que se facturó este artículo"'
        + ' style="margin-top:3px;padding:1px 4px;border:0.5px solid #d2d2d7;border-radius:5px;font-size:10px;font-family:inherit">';
  if(!sel) h += '<option value="" selected>¿Mes facturado?</option>';
  meses.forEach(function(k){
    h += '<option value="' + k + '"' + (k === sel ? ' selected' : '') + '>Fact. ' + lab(k) + '</option>';
  });
  return h + '</select>';
}

function cevenFactEditarMesLinea(id, lk, mes){
  var f = (typeof _pipeFilaPorId === 'function') ? _pipeFilaPorId(id) : null;
  if(!f){ showToast('Ese proyecto ya no está en el pipeline actual.'); return; }
  if(!cevenCanEditPipelineRow(f.row.ejecutivo)){
    showToast('No tenés permiso para modificar este proyecto: es de otro ejecutivo.');
    renderPipeline(); return;
  }
  if(typeof pushPipeUndo === 'function') pushPipeUndo(id);
  if(!cevenFactSetMesLinea(f.row, lk, mes)){ renderPipeline(); return; }
  savePipeline(f.pipe);
  // Si el mes ya pasó y quedan pendientes, se parte en el acto (no hace falta
  // salir y volver a entrar al pipeline).
  try{
    var partidas = cevenFactSplit();
    /* Lo facturado de un mes ya cerrado va a la cajita (archivo) ahora, no al
       próximo ingreso al pipeline: si no, quedaba un rato en el pipeline vivo
       bajo un mes pasado. Solo si algo cambió de mes: archiveOldEntries() guarda
       y avisa, y no hace falta correrlo en cada cambio de selector. */
    if((partidas || f.row.mesCierre < currentMonthKey()) && typeof archiveOldEntries === 'function') archiveOldEntries();
  }catch(e){ if(window.console) console.error('[pipeline-facturacion]', e); }
  renderPipeline();
}
