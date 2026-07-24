
// ── PIPELINE ──
function getPipeline(){
  try{ return JSON.parse(localStorage.getItem('poly_cpipeline')||'[]'); }catch(e){ return []; }
}
function savePipeline(p){ try{localStorage.setItem('poly_cpipeline',JSON.stringify(p));}catch(e){} autoSnapshot(); }

function getArchive(){ try{return JSON.parse(localStorage.getItem('poly_carchive')||'{}');}catch(e){return {};} }
function saveArchive(a){ try{localStorage.setItem('poly_carchive',JSON.stringify(a));}catch(e){} }

// Mes actual como "YYYY-MM"
function currentMonthKey(){
  var d = new Date(); return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0');
}

// Al entrar al pipeline: mueve al archivo las filas (OPG completos) Facturadas/Perdidas
// de meses anteriores. A diferencia de Apple, no hay desglose por SKU/familia que archivar
// parcialmente — cada fila de Poly es un OPG con su(s) Sala(s) adentro, se archiva entera.
function archiveOldEntries(){
  var pipe = getPipeline();
  var archive = getArchive();
  var curMonth = currentMonthKey();
  var toKeep = [];
  var moved = 0;

  pipe.forEach(function(r){
    var estado = r.estado || 'Cotizado';
    var mesC = r.mesCierre || '';
    var shouldArchive = (estado === 'Facturado' || estado === 'Perdido')
      && mesC && mesC < curMonth;
    if(shouldArchive){
      if(!archive[mesC]) archive[mesC] = [];
      var exists = archive[mesC].some(function(x){ return x.id === r.id; });
      if(!exists){ archive[mesC].push(r); moved++; }
    } else {
      toKeep.push(r);
    }
  });

  if(moved > 0){
    savePipeline(toKeep);
    saveArchive(archive);
    showToast('📦 ' + moved + ' entrada(s) archivada(s)');
  }
}
