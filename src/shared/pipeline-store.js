/* ============================================================
   PIPELINE · ACCESO A DISCO  ·  compartido por todas las marcas
   ------------------------------------------------------------
   Solo el guardado/lectura, que es identico en las dos marcas.
   La logica de archivado (archiveOldEntries) NO esta aca: Apple
   archiva porciones de una cotizacion linea por linea (SKU,
   parciales, familias Mac/iPhone/iPad) y Poly archiva la fila
   entera porque cada fila es un OPG. Son reglas de negocio
   distintas de verdad, no una parametrizacion.

   Depende de: brand.js (cevenK, padCols), safe.js (cevenLsSet,
   cevenLsJSON), backup.js (autoSnapshot) en tiempo de ejecucion.
   Se carga ANTES que <marca>/js/pipeline-data.js.
   ============================================================ */

/* Lee el pipeline. Dos cosas que antes se hacian mal:

   1) JSON.parse crudo en try/catch: si el JSON estaba corrupto la app
      arrancaba con el pipeline VACIO sin decir nada, y el usuario creia
      haber perdido todo. cevenLsJSON avisa por consola y devuelve [].

   2) El re-relleno con ceros estaba hardcodeado a qNum/4 en Apple.
      Ahora sale de brand.padCols, que es la misma tabla que usa sync.js
      para no marcar la fila como cambiada en cada poll. Poly tiene
      padCols vacio (numera por OPG, que es texto libre) y esto es no-op. */
function getPipeline(){
  var arr = cevenLsJSON(cevenK('cpipeline'), []);
  if(!arr || typeof arr.length !== 'number') return [];
  var pad = window.CEVEN_BRAND.padCols || {};
  var cols = Object.keys(pad);
  if(!cols.length) return arr;
  for(var i=0;i<arr.length;i++){
    for(var c=0;c<cols.length;c++){
      var col = cols[c], v = arr[i][col];
      if(v !== null && v !== undefined && v !== ''){
        arr[i][col] = String(parseInt(v, 10) || 0).padStart(pad[col], '0');
      }
    }
  }
  return arr;
}

/* Firma de una entrada del pipeline SIN `fechaMod` (para no retroalimentarse
   comparando el campo contra si mismo). La usa savePipeline() para saber si
   una entrada cambio de verdad entre el estado anterior y el nuevo. */
function pipeRowSignature(e){
  var copia = Object.assign({}, e);
  delete copia.fechaMod;
  return JSON.stringify(copia);
}

/* Guarda el pipeline. Devuelve true si se pudo escribir.
   autoSnapshot() solo corre si el guardado salio bien: dejar un snapshot
   de un estado que no se persistio es peor que no dejarlo, porque
   _checkRecovery() lo ofreceria como "backup" de algo que no existe.

   Estampa `fechaMod` (ISO) en cada entrada que cambio de verdad respecto a
   lo que habia antes, comparando por firma — un guardado sin cambios no
   mueve la fecha. Es brand-agnostic a proposito (mismo criterio que
   pickPipe()/nullableCols en sync.js): corre para cualquier marca, pero
   solo importa para las que declaren `fechaMod` en su pipeCols (hoy Apple,
   Poly y Legamaster; ver el comentario de brand.js).

   `opts.systemChange === true`: el cambio lo hizo el SISTEMA, no una persona
   (rollOverdueEntries() moviendo un cierre estimado vencido). En ese caso NO
   se estampa `fechaMod` aunque la firma cambie — si no, el reloj de "dias sin
   movimiento" se resetearia solo cada mes y la alerta de estancamiento nunca
   dispararia. Un alta SI estampa (una fila nueva es actividad). */
function savePipeline(p, opts){
  var systemChange = !!(opts && opts.systemChange);
  // Lectura CRUDA del estado anterior, sin pasar por el re-relleno de ceros
  // de getPipeline(): comparar contra una versión repadeada podría marcar
  // "cambió" una entrada que en realidad quedó igual, y fechaMod dejaría de
  // servir para medir estancamiento real.
  var prev = cevenLsJSON(cevenK('cpipeline'), []), prevById = {};
  if(!prev || typeof prev.length !== 'number') prev = [];
  for(var i=0;i<prev.length;i++) prevById[prev[i].id] = prev[i];
  var now = new Date().toISOString();
  /* Mes de facturación (shared/pipeline-facturacion.js): se sella ANTES de
     comparar firmas, así lo que el sellado agrega ya cuenta como parte del
     mismo cambio. Los cambios del sistema (roll, backfill, split) fijan sus
     propios campos y no pasan por acá. */
  var sellar = !systemChange && typeof cevenFactSellar === 'function';
  var pc = (window.CEVEN_BRAND && window.CEVEN_BRAND.pipeCols) || [];
  var conMesCierreSku = pc.indexOf('skuMesCierre') !== -1;
  var mesActual = currentMonthKey();
  for(var j=0;j<p.length;j++){
    var e = p[j], old = prevById[e.id];
    if(sellar) cevenFactSellar(e, old || null, mesActual, now, conMesCierreSku);
    if(!old){ if(!e.fechaMod) e.fechaMod = e.fecha || now; continue; }
    var changed = pipeRowSignature(e) !== pipeRowSignature(old);
    e.fechaMod = (changed && !systemChange) ? now : old.fechaMod;
  }
  var ok = cevenLsSet(cevenK('cpipeline'), JSON.stringify(p));
  if(ok && typeof autoSnapshot === 'function') autoSnapshot();
  return ok;
}

/* ── La fila del pipeline sigue a su cotización ─────────────────────────────
   El monto de la fila (y en Apple las cantidades/montos por familia y el
   margen ponderado) se calculaba UNA vez, al tocar "Agregar al pipeline". Si
   después se editaba la cotización y se la guardaba, la fila quedaba con la
   foto vieja y el detalle avisaba "la cotización se editó después de
   agregarla". Ahora lo llama el doSave() de cada marca: guardar una cotización
   que ya está en el pipeline le recalcula los agregados a su fila, con la misma
   función que usa la ✂️ (_pipeAplicarAgregados, una por marca) y solo con la
   opción vigente.

   Guarda de identidad: solo si la cotización sigue siendo del MISMO canal y
   cliente final que la fila. Antes del 11/09/2026 dos cotizaciones podían
   compartir número, y hay filas cuyo número hoy apunta a otra cotización
   (Poly #0184 y #0193): sincronizar a ciegas le pondría a esa fila la plata de
   otro proyecto. En ese caso, o si se cambió el cliente final en la
   cotización, no se toca nada y se avisa — "Agregar al pipeline" es el camino
   explícito para eso.

   Las filas del archivo (meses cerrados) no viven en getPipeline() y no se
   tocan. Devuelve true si cambió la fila. */
var _PIPE_CAMPOS_MONTO = ['monto','margenPond','qMac','qIph','qIpad','qServ','qAcc',
                          'montoMac','montoIph','montoIpad','montoAcc','montoServ'];
function _pipeNormIdent(s){
  s = String(s == null ? '' : s).trim().toLowerCase();
  return s === '—' ? '' : s;
}
// ¿Las líneas guardadas son de la misma oportunidad que la fila? (canal + cliente final)
function _pipeCotizEsDeLaFila(row, lineas){
  var cab = lineas[0];
  return !!cab && _pipeNormIdent(cab['Proyecto']) === _pipeNormIdent(row.proyecto)
               && _pipeNormIdent(cab['Cliente'])  === _pipeNormIdent(row.cliente);
}
/* `opts.antesDeCambiar(row)`: se llama solo si la fila VA a cambiar, antes de
   mutarla (para el snapshot del Deshacer). `opts.silencioso`: sin cartel. */
function cevenPipeSincronizarConCotiz(qn, opts){
  opts = opts || {};
  if(typeof _pipeAplicarAgregados !== 'function' || typeof cevenOpcFilasDeCotiz !== 'function') return false;
  var pipe = getPipeline(), row = null;
  for(var i=0;i<pipe.length;i++){ if(pipe[i].qNum === qn){ row = pipe[i]; break; } }
  if(!row) return false;
  if(typeof cevenCanEditPipelineRow === 'function' && !cevenCanEditPipelineRow(row.ejecutivo)) return false;

  var lineas = cevenOpcFilasDeCotiz(getDB(), qn, ['producto','garantia']);
  if(!lineas.length) return false;
  if(!_pipeCotizEsDeLaFila(row, lineas)){
    if(!opts.silencioso && typeof showToast === 'function'){
      showToast('La #'+qn+' está en el pipeline como "'+(row.proyecto||'—')+'" ('+(row.cliente||'—')+
                '): el monto de esa fila no se actualizó. Si es la misma oportunidad, usá "Agregar al pipeline".');
    }
    return false;
  }

  // Se calcula sobre una copia: si no cambia nada, no hay snapshot ni guardado.
  var nueva = Object.assign({}, row);
  _pipeAplicarAgregados(nueva, lineas);
  var igual = _PIPE_CAMPOS_MONTO.every(function(k){ return nueva[k] === row[k]; });
  if(igual) return false;
  if(typeof opts.antesDeCambiar === 'function') opts.antesDeCambiar(row);
  _PIPE_CAMPOS_MONTO.forEach(function(k){ if(k in nueva) row[k] = nueva[k]; });
  savePipeline(pipe);
  return true;
}

/* Botón "↻" del aviso de descuadre en el detalle de la fila. Para las filas
   que ya venían descuadradas de antes (o que editó un cliente sin actualizar). */
function cevenPipeActualizarMontoFila(id){
  var pipe = getPipeline(), row = null;
  for(var i=0;i<pipe.length;i++){ if(pipe[i].id === id){ row = pipe[i]; break; } }
  if(!row){ showToast('Ese proyecto ya no está en el pipeline actual.'); return; }
  if(typeof cevenCanEditPipelineRow === 'function' && !cevenCanEditPipelineRow(row.ejecutivo)){
    showToast('No tenés permiso para modificar este proyecto: es de otro ejecutivo.'); return;
  }
  var montoAntes = row.monto;
  var ok = cevenPipeSincronizarConCotiz(row.qNum, {
    antesDeCambiar: function(r){ if(typeof pushPipeUndo === 'function') pushPipeUndo(r.id); }
  });
  if(typeof renderPipeline === 'function') renderPipeline();
  if(!ok) return;   // sin cambios, o ya avisó por qué no
  var ahora = getPipeline().filter(function(r){ return r.id === id; })[0] || {};
  notifyUndo('Cotización #'+row.qNum+': el monto pasó de USD '+fI(montoAntes||0)+' a USD '+fI(ahora.monto||0)+'.',
    function(){ if(typeof undoPipelineChange === 'function') undoPipelineChange(); });
}

/* El aviso que va al lado de "Total de la cotización" cuando el monto de la
   fila no coincide con los artículos. Distingue los dos casos reales:
   · la cotización es otra (número reusado antes del 11/09/2026, o se le cambió
     el cliente final): no se puede recalcular, y se dice;
   · es la misma pero el monto quedó viejo: se ofrece actualizarlo. */
function cevenPipeDescuadreHTML(r, lineas, total, editable){
  if(Math.abs(Math.round(total) - Math.round(r.monto||0)) <= 1) return '';
  var pre = '<span style="color:#c84e00;font-weight:500"> · la fila dice USD '+fI(r.monto||0);
  if(!_pipeCotizEsDeLaFila(r, lineas)){
    var cab = lineas[0] || {};
    return pre + ': la #'+cevenEsc(r.qNum||'')+' del historial hoy es de otra oportunidad ('
      + cevenEsc(cab['Proyecto']||'—') + ' · ' + cevenEsc(cab['Cliente']||'—')
      + '). Revisá a mano cuál es el monto real.</span>';
  }
  return pre + ': no coincide con la cotización'
    + (editable ? ' <button class="bs" data-dact="sync-monto" data-did="'+cevenEsc(r.id)+'" title="Recalcular el monto de la fila con los artículos de la cotización" style="padding:1px 6px;font-size:10px">↻ Actualizar a USD '+fI(total)+'</button>' : '')
    + '</span>';
}

function getArchive(){
  var a = cevenLsJSON(cevenK('carchive'), {});
  return (a && typeof a === 'object') ? a : {};
}
function saveArchive(a){ return cevenLsSet(cevenK('carchive'), JSON.stringify(a)); }

// Mes actual como "YYYY-MM"
function currentMonthKey(){
  var d = new Date(); return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0');
}

/* 'YYYY-MM' + n meses -> 'YYYY-MM', con acarreo de año. `n` puede ser negativo.
   Clave mal formada -> se devuelve tal cual. Lo usa el test del auto-roll y lo
   va a necesitar la capa de alertas ("cuántos meses entre dos claves"). */
function cevenMonthAdd(key, n){
  var p = String(key || '').split('-'), y = +p[0], m = +p[1];
  if(p.length !== 2 || isNaN(y) || isNaN(m)) return key;
  var t = y * 12 + (m - 1) + (n || 0);
  return Math.floor(t / 12) + '-' + String((t % 12) + 1).padStart(2, '0');
}
