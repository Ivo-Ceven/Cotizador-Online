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

/* Guarda el pipeline. Devuelve true si se pudo escribir.
   autoSnapshot() solo corre si el guardado salio bien: dejar un snapshot
   de un estado que no se persistio es peor que no dejarlo, porque
   _checkRecovery() lo ofreceria como "backup" de algo que no existe. */
function savePipeline(p){
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
