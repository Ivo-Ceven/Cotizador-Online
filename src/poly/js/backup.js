
// ── BACKUP COMPLETO ──
// Exporta TODO el estado en un archivo JSON: cotizaciones, pipeline, catálogo,
// logo, número de cotización actual.
// Captura GENÉRICAMENTE todas las claves poly_* de localStorage (excepto buffers
// internos), así nunca se escapa ningún dato presente o futuro.
function buildFullBackupSnapshot(){
  var snap = {
    _version:   1,
    _timestamp: new Date().toISOString(),
    _app:       'CevenCotizadorPoly',
    _all:       {}   // todas las claves poly_* de localStorage
  };
  var skip = { 'poly_cbackup_auto':1 };
  for(var i=0;i<localStorage.length;i++){
    var k = localStorage.key(i);
    if(!k || skip[k]) continue;
    if(k.indexOf('poly_')!==0 && k!=='cdark') continue; // solo lo de este cotizador (+ dark mode, compartido)
    snap._all[k] = localStorage.getItem(k);
  }
  // Campos con nombre (compatibilidad con backups/restauradores anteriores)
  snap.cquotes    = JSON.parse(localStorage.getItem('poly_cquotes')   || '[]');
  snap.cpipeline  = JSON.parse(localStorage.getItem('poly_cpipeline') || '[]');
  snap.carchive   = JSON.parse(localStorage.getItem('poly_carchive')  || '{}');
  snap.cpl        = JSON.parse(localStorage.getItem('poly_cpl')       || '[]');
  snap.cqc        = parseInt(localStorage.getItem('poly_cqc')          || '1');
  snap.cdark      = localStorage.getItem('cdark')                      || '0';
  snap.clogo      = localStorage.getItem('poly_clogo')                 || null;
  snap.clogo_dark = localStorage.getItem('poly_clogo_dark')            || null;
  return snap;
}

function exportFullBackup(){
  var snap = buildFullBackupSnapshot();
  var blob = new Blob([JSON.stringify(snap, null, 2)], {type: 'application/json'});
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  var ts = new Date().toISOString().replace(/[:.]/g,'-').slice(0,19);
  a.href = url;
  a.download = 'Ceven_Poly_Backup_' + ts + '.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast('✓ Backup descargado — guardalo en un lugar seguro');
}

// Importar backup: restaura TODO el estado desde un archivo JSON
function importFullBackup(input){
  var file = input.files[0];
  if(!file) return;
  var reader = new FileReader();
  reader.onload = function(e){
    try {
      var snap = JSON.parse(e.target.result);
      if(snap._app !== 'CevenCotizadorPoly'){
        alert('El archivo no parece ser un backup válido del cotizador Poly.');
        input.value = '';
        return;
      }
      var cotCount = (snap.cquotes || []).length;
      var pipeCount = (snap.cpipeline || []).length;
      var plCount = (snap.cpl || []).length;
      var ts = snap._timestamp ? new Date(snap._timestamp).toLocaleString('es-AR') : 'desconocida';
      if(!confirm(
        'Restaurar backup del ' + ts + '?\n\n' +
        '• ' + cotCount + ' filas de cotizaciones\n' +
        '• ' + pipeCount + ' entradas de pipeline\n' +
        '• ' + plCount + ' productos en catálogo\n\n' +
        '⚠ Esto REEMPLAZA todos los datos actuales del cotizador Poly en el navegador.'
      )){
        input.value = '';
        return;
      }
      // ── Pausar sync con Supabase durante la restauración ──
      if(typeof window._syncPause === 'function') window._syncPause();
      if(snap._all && typeof snap._all === 'object'){
        Object.keys(snap._all).forEach(function(k){
          try{ localStorage.setItem(k, snap._all[k]); }catch(e){}
        });
      } else {
        // Compatibilidad con backups viejos (campos con nombre)
        if(snap.cquotes !== undefined)   localStorage.setItem('poly_cquotes',   JSON.stringify(snap.cquotes));
        if(snap.cpipeline !== undefined) localStorage.setItem('poly_cpipeline', JSON.stringify(snap.cpipeline));
        if(snap.carchive !== undefined)  localStorage.setItem('poly_carchive',  JSON.stringify(snap.carchive));
        if(snap.cpl !== undefined)       localStorage.setItem('poly_cpl',       JSON.stringify(snap.cpl));
        if(snap.cqc !== undefined)       localStorage.setItem('poly_cqc',       String(snap.cqc));
        if(snap.cdark !== undefined)     localStorage.setItem('cdark',          String(snap.cdark));
        if(snap.clogo)                   localStorage.setItem('poly_clogo',      snap.clogo);
        if(snap.clogo_dark)              localStorage.setItem('poly_clogo_dark', snap.clogo_dark);
      }
      // Marcar que este reload viene de un import: el bootstrap debe
      // empujar el localStorage a Supabase, no al revés.
      try{ sessionStorage.setItem('_ceven_import_reload','1'); }catch(e){}
      try{ localStorage.setItem('_ceven_import_reload','1'); }catch(e){} // fallback para file://
      showToast('✓ Backup restaurado — recargando...');
      setTimeout(function(){ location.reload(); }, 1000);
    } catch(err) {
      alert('Error al leer el archivo: ' + err.message);
    } finally {
      input.value = '';
    }
  };
  reader.readAsText(file);
}

// Auto-backup: cada vez que se guarda una cotización o se modifica el pipeline,
// también guardar un snapshot en sessionStorage (sobrevive hasta cerrar la pestaña)
// y en localStorage bajo 'poly_cbackup_auto' (persiste). Buffer de seguridad.
function autoSnapshot(){
  try {
    var snap = JSON.stringify({
      _version: 1,
      _timestamp: new Date().toISOString(),
      _app: 'CevenCotizadorPoly',
      cquotes:   JSON.parse(localStorage.getItem('poly_cquotes')   || '[]'),
      cpipeline: JSON.parse(localStorage.getItem('poly_cpipeline') || '[]'),
      cpl:       JSON.parse(localStorage.getItem('poly_cpl')       || '[]'),
      cqc:       parseInt(localStorage.getItem('poly_cqc') || '1'),
      clogo:     localStorage.getItem('poly_clogo') || null
    });
    localStorage.setItem('poly_cbackup_auto', snap);
    sessionStorage.setItem('poly_cbackup_session', snap);
  } catch(e) { /* ignorar si el storage está lleno */ }
  // Además, actualizar el archivo de backup completo en la carpeta (debounced)
  if(typeof scheduleFullBackup === 'function') scheduleFullBackup();
}

// Reescribe el archivo de backup completo poco después de cada cambio (debounce 8s),
// para que el archivo en disco esté siempre al día y se pueda recuperar al instante.
var _fullBackupTimer = null;
function scheduleFullBackup(){
  if(typeof _pipeBackupHandle === 'undefined' || !_pipeBackupHandle) return;
  clearTimeout(_fullBackupTimer);
  _fullBackupTimer = setTimeout(function(){
    if(typeof writeFullBackupToFolder !== 'function') return;
    writeFullBackupToFolder().then(function(ok){
      if(ok) localStorage.setItem('poly_cbackup_full_last', String(Date.now()));
    });
  }, 8000);
}
