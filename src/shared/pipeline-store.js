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
   solo importa para las que declaren `fechaMod` en su pipeCols (hoy, Apple;
   ver el comentario de brand.js). Para las demas queda como un campo local
   sin uso, igual que padCols vacio en Poly. */
function savePipeline(p){
  // Lectura CRUDA del estado anterior, sin pasar por el re-relleno de ceros
  // de getPipeline(): comparar contra una versión repadeada podría marcar
  // "cambió" una entrada que en realidad quedó igual, y fechaMod dejaría de
  // servir para medir estancamiento real.
  var prev = cevenLsJSON(cevenK('cpipeline'), []), prevById = {};
  if(!prev || typeof prev.length !== 'number') prev = [];
  for(var i=0;i<prev.length;i++) prevById[prev[i].id] = prev[i];
  var now = new Date().toISOString();
  for(var j=0;j<p.length;j++){
    var e = p[j], old = prevById[e.id];
    if(!old){ if(!e.fechaMod) e.fechaMod = e.fecha || now; continue; }
    e.fechaMod = (pipeRowSignature(e) !== pipeRowSignature(old)) ? now : old.fechaMod;
  }
  var ok = cevenLsSet(cevenK('cpipeline'), JSON.stringify(p));
  if(ok && typeof autoSnapshot === 'function') autoSnapshot();
  return ok;
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
