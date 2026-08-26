
// ── PIPELINE · ARCHIVADO ──
// getPipeline/savePipeline/getArchive/saveArchive/currentMonthKey viven en
// shared/pipeline-store.js: son identicos en todas las marcas.

// Al entrar al pipeline: mueve al archivo los proyectos Facturados/Perdidos de
// meses anteriores. Cada fila de Legamaster es un proyecto y se archiva entera
// (mismo modelo que Poly, sin desglose por SKU/familia que archivar parcialmente).
function archiveOldEntries(){
  var pipe = getPipeline();
  var archive = getArchive();
  var curMonth = currentMonthKey();
  var toKeep = [];
  var moved = 0;
  var meses = {};

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

    var keys = Object.keys(meses).sort();
    var msg = '📦 Se archivaron ' + moved + (moved===1 ? ' proyecto' : ' proyectos')
      + ' (Facturado/Perdido de meses ya cerrados).';

    if(keys.length === 1){
      showToast(msg + ' Están en Vista → ' + _mesLabelLm(keys[0]) + '.', {
        actionLabel: 'Ver',
        onAction: function(){ _selectArchiveMonth(keys[0]); renderPipeline(); }
      });
    } else {
      showToast(msg + ' Están en el selector Vista, en ' + keys.length + ' meses.');
    }
  }
}

// '2026-01' -> 'Ene 2026'.
function _mesLabelLm(mk){
  var p = String(mk||'').split('-');
  if(p.length !== 2) return mk;
  var meses = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
  var m = meses[parseInt(p[1],10) - 1];
  return m ? (m + ' ' + p[0]) : mk;
}
