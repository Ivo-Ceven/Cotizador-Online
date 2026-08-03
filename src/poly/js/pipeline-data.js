
// ── PIPELINE · ARCHIVADO (especifico de Poly) ──
// getPipeline/savePipeline/getArchive/saveArchive/currentMonthKey viven en
// shared/pipeline-store.js: son identicos en las dos marcas.

// Al entrar al pipeline: mueve al archivo los proyectos Facturados/Perdidos de
// meses anteriores. A diferencia de Apple, no hay desglose por SKU/familia que
// archivar parcialmente: cada fila de Poly es un proyecto y se archiva entera.
function archiveOldEntries(){
  var pipe = getPipeline();
  var archive = getArchive();
  var curMonth = currentMonthKey();
  var toKeep = [];
  var moved = 0;
  var meses = {};   // meses tocados, para poder decir a DÓNDE fueron

  pipe.forEach(function(r){
    var estado = r.estado || 'Cotizado';
    var mesC = r.mesCierre || '';
    var shouldArchive = (estado === 'Facturado' || estado === 'Perdido')
      && mesC && mesC < curMonth;
    if(shouldArchive){
      if(!archive[mesC]) archive[mesC] = [];
      var exists = archive[mesC].some(function(x){ return x.id === r.id; });
      if(!exists){ archive[mesC].push(r); moved++; meses[mesC] = 1; }
    } else {
      toKeep.push(r);
    }
  });

  if(moved > 0){
    savePipeline(toKeep);
    saveArchive(archive);

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
