
// ── PIPELINE · ARCHIVADO + AUTO-ROLL (especifico de Poly) ──
// getPipeline/savePipeline/getArchive/saveArchive/currentMonthKey viven en
// shared/pipeline-store.js: son identicos en las dos marcas.

/* Al entrar al pipeline, ANTES de archiveOldEntries(): toda fila ABIERTA cuyo
   `mesCierre` ('YYYY-MM') sea un mes PASADO se mueve al mes actual, y se marca
   `mesAutoRoll` con el mes original (una sola vez) para pintar la chapita
   "↪ auto". Las CERRADAS (todos los estados efectivos Facturado/Perdido) NO se
   tocan: son de archiveOldEntries(). Asi ninguna fila viva queda con cierre en
   el pasado ensuciando el forecast / el selector de meses.

   El guardado va con {systemChange:true}: mover un cierre vencido NO es
   "actividad" del vendedor, asi que NO tiene que resetear `fechaMod` (si no,
   la alerta de estancamiento nunca dispararia). No hay undo: recuperar =
   editar el mes a mano (que ademas limpia `mesAutoRoll`), mismo criterio que
   el archivado. */
function rollOverdueEntries(){
  var pipe = getPipeline();
  var cur = currentMonthKey();
  var _db = null;
  function _lineasDe(r){
    if(!cevenSkuTieneOverrides(r)) return null;
    if(_db === null) _db = getDB();
    return cevenOpcFilasDeCotiz(_db, r.qNum);
  }
  var cambios = 0, nuevos = 0;
  pipe.forEach(function(r){
    var mesC = r.mesCierre || '';
    if(!mesC || mesC >= cur) return;                 // sin mes, o no vencido
    var cerrada = cevenSkuEstadosDe(r, _lineasDe(r)).every(function(s){
      return s === 'Facturado' || s === 'Perdido';
    });
    if(cerrada) return;                              // la maneja archiveOldEntries
    if(!r.mesAutoRoll){ r.mesAutoRoll = mesC; nuevos++; }  // NO se pisa en re-rolls
    r.mesCierre = cur;
    cambios++;
  });
  if(cambios > 0) savePipeline(pipe, {systemChange:true});
  if(nuevos > 0){
    showToast('↪ ' + nuevos + (nuevos === 1 ? ' proyecto tenía' : ' proyectos tenían')
      + ' el cierre estimado vencido — se movieron a ' + cevenMesLabel(cur)
      + '. Si alguno ya cerró, poné el mes real y marcá Facturado.', {
      actionLabel: 'Ver',
      onAction: function(){ window._pipeMonthFilter = cur; renderPipeline(); }
    });
  }
}

// Al entrar al pipeline: mueve al archivo los proyectos Facturados/Perdidos de
// meses anteriores. A diferencia de Apple, no hay facturación parcial por SKU:
// cada fila de Poly se archiva ENTERA o no se archiva.
//
// Por eso, desde que un artículo puede tener su propio estado (03/09/2026), una
// fila solo se va cuando TODOS sus estados efectivos están cerrados. Un proyecto
// con la mitad facturada y la otra mitad todavía en negociación se archivaría
// con plata viva adentro, y esa plata desaparecería del pipeline sin aviso.
function archiveOldEntries(){
  var pipe = getPipeline();
  var archive = getArchive();
  var curMonth = currentMonthKey();
  var toKeep = [];
  var moved = 0;
  var meses = {};   // meses tocados, para poder decir a DÓNDE fueron

  // getDB() hace JSON.parse de varios MB: solo se paga si hay alguna fila con
  // estados por ítem, que es lo único que necesita mirar las líneas.
  var _db = null;
  function _lineasDe(r){
    if(!cevenSkuTieneOverrides(r)) return null;
    if(_db === null) _db = getDB();
    return cevenOpcFilasDeCotiz(_db, r.qNum);
  }

  pipe.forEach(function(r){
    var mesC = r.mesCierre || '';
    var cerrados = cevenSkuEstadosDe(r, _lineasDe(r)).every(function(s){
      return s === 'Facturado' || s === 'Perdido';
    });
    var shouldArchive = cerrados && mesC && mesC < curMonth;
    if(shouldArchive){
      if(!archive[mesC]) archive[mesC] = [];
      var exists = archive[mesC].some(function(x){ return x.id === r.id; });
      if(!exists){ archive[mesC].push(r); moved++; meses[mesC] = 1; }
      // Si `exists`, la fila NO se copia de nuevo al archivo PERO tampoco vuelve
      // a `toKeep`: hay que sacarla del pipeline vivo igual. Antes solo se
      // guardaba `if(moved > 0)`, así que una fila que YA estaba archivada (la
      // resucitó una carrera de sync entre `carchive` —blob— y la tabla
      // `pipeline` —fila por fila—) quedaba figurando en los DOS lados.
    } else {
      toKeep.push(r);
    }
  });

  // `moved` = filas NUEVAS en el archivo (para el cartel). El guardado se decide
  // por si el pipeline vivo cambió: incluye las que ya estaban archivadas y
  // seguían acá.
  var quitadas = pipe.length - toKeep.length;
  if(quitadas > 0){
    savePipeline(toKeep);
    saveArchive(archive);
  }

  if(moved > 0){
    /* El aviso viejo era '📦 N entrada(s) archivada(s)': movía filas fuera de la
       vista sin decir a dónde fueron ni cómo verlas — había que descubrir solo
       el <select> de la barra. Ahora nombra el mes y lleva.

       No se ofrece "Deshacer": el archivado es automático y vuelve a correr al
       entrar al pipeline (_navApply en shared/ui-core.js), así que desarchivar
       sin mover el cierre estimado se re-archivaría en el acto. Para eso está
       "↩ Restaurar" en la vista del mes, que sí mueve el mes (archive-view.js). */
    var keys = Object.keys(meses).sort();
    var msg = '📦 Se archivaron ' + moved + (moved===1 ? ' proyecto' : ' proyectos')
      + ' (Facturado/Perdido de meses ya cerrados).';

    if(keys.length === 1){
      showToast(msg + ' Están en Vista → ' + _mesLabelPoly(keys[0]) + '.', {
        actionLabel: 'Ver',
        onAction: function(){ _selectArchiveMonth(keys[0]); renderPipeline(); }
      });
    } else {
      showToast(msg + ' Están en el selector Vista, en ' + keys.length + ' meses.');
    }
  }
}

// '2026-01' -> 'Ene 2026'. La tabla de meses estaba repetida a mano en cuatro
// archivos de Poly; acá se usa la del monthpicker, que es la misma que ve el
// usuario al elegir el cierre estimado.
function _mesLabelPoly(mk){
  var p = String(mk||'').split('-');
  if(p.length !== 2) return mk;
  var meses = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
  var m = meses[parseInt(p[1],10) - 1];
  return m ? (m + ' ' + p[0]) : mk;
}
