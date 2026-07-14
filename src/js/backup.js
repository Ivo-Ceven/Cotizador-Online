
// ── BACKUP COMPLETO ──
// Exporta TODO el estado en un archivo JSON: cotizaciones, pipeline, price list,
// tasas NAC, logo, número de cotización actual.
// Snapshot completo de toda la app (para backup manual y automático)
// Captura GENÉRICAMENTE todas las claves del cotizador en localStorage
// (excepto buffers internos), así nunca se escapa ningún dato presente o futuro.
function buildFullBackupSnapshot(){
  var snap = {
    _version:   4,
    _timestamp: new Date().toISOString(),
    _app:       'CevenCotizador',
    _all:       {}   // todas las claves de localStorage relevantes
  };
  // No tiene sentido respaldar estos (son buffers/punteros internos)
  var skip = { 'cbackup_auto':1, 'cbackup_session':1 };
  for(var i=0;i<localStorage.length;i++){
    var k = localStorage.key(i);
    if(!k || skip[k]) continue;
    snap._all[k] = localStorage.getItem(k);
  }
  // Campos con nombre (compatibilidad con backups/restauradores anteriores)
  snap.cquotes        = JSON.parse(localStorage.getItem('cquotes')       || '[]');
  snap.cpipeline      = JSON.parse(localStorage.getItem('cpipeline')     || '[]');
  snap.carchive       = JSON.parse(localStorage.getItem('carchive')      || '{}');
  snap.cpl            = JSON.parse(localStorage.getItem('cpl')           || '[]');
  snap.cnac           = JSON.parse(localStorage.getItem('cnac')          || '{}');
  snap.cqc            = parseInt(localStorage.getItem('cqc')             || '1');
  snap.ctarget        = JSON.parse(localStorage.getItem('ctarget')       || '{}');
  snap.ctarget_manual = JSON.parse(localStorage.getItem('ctarget_manual')|| '{}');
  snap.cdark          = localStorage.getItem('cdark')                    || '0';
  snap.clogo          = localStorage.getItem('clogo')                    || null;
  snap.clogo_dark     = localStorage.getItem('clogo_dark')               || null;
  snap.cnac_mac24_v2  = localStorage.getItem('cnac_mac24_v2')            || null;
  return snap;
}

function exportFullBackup(){
  var snap = buildFullBackupSnapshot();
  var blob = new Blob([JSON.stringify(snap, null, 2)], {type: 'application/json'});
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  var ts = new Date().toISOString().replace(/[:.]/g,'-').slice(0,19);
  a.href = url;
  a.download = 'Ceven_Backup_' + ts + '.json';
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
      // Validar que sea un backup de la app
      if(snap._app !== 'CevenCotizador'){
        alert('El archivo no parece ser un backup válido de Ceven Cotizador.');
        input.value = '';
        return;
      }
      // Confirmar antes de sobrescribir
      var cotCount = (snap.cquotes || []).length;
      var pipeCount = (snap.cpipeline || []).length;
      var plCount = (snap.cpl || []).length;
      var ts = snap._timestamp ? new Date(snap._timestamp).toLocaleString('es-AR') : 'desconocida';
      if(!confirm(
        'Restaurar backup del ' + ts + '?\n\n' +
        '• ' + cotCount + ' filas de cotizaciones\n' +
        '• ' + pipeCount + ' entradas de pipeline\n' +
        '• ' + plCount + ' productos en price list\n\n' +
        '⚠ Esto REEMPLAZA todos los datos actuales en el navegador.'
      )){
        input.value = '';
        return;
      }
      // ── Pausar sync con Supabase durante la restauración ──
      // Evita que cada setItem dispare un push y sature el free tier,
      // lo que antes causaba errores no atrapados → pantalla en blanco.
      if(typeof window._syncPause === 'function') window._syncPause();
      // Restaurar — preferir el volcado genérico _all (captura TODO)
      if(snap._all && typeof snap._all === 'object'){
        Object.keys(snap._all).forEach(function(k){
          try{ localStorage.setItem(k, snap._all[k]); }catch(e){}
        });
      } else {
        // Compatibilidad con backups viejos (campos con nombre)
        if(snap.cquotes !== undefined)       localStorage.setItem('cquotes',        JSON.stringify(snap.cquotes));
        if(snap.cpipeline !== undefined)     localStorage.setItem('cpipeline',      JSON.stringify(snap.cpipeline));
        if(snap.carchive !== undefined)      localStorage.setItem('carchive',       JSON.stringify(snap.carchive));
        if(snap.cpl !== undefined)           localStorage.setItem('cpl',            JSON.stringify(snap.cpl));
        if(snap.cnac !== undefined)          localStorage.setItem('cnac',           JSON.stringify(snap.cnac));
        if(snap.cqc !== undefined)           localStorage.setItem('cqc',            String(snap.cqc));
        if(snap.ctarget !== undefined)       localStorage.setItem('ctarget',        JSON.stringify(snap.ctarget));
        if(snap.ctarget_manual !== undefined)localStorage.setItem('ctarget_manual', JSON.stringify(snap.ctarget_manual));
        if(snap.cdark !== undefined)         localStorage.setItem('cdark',          String(snap.cdark));
        if(snap.clogo)                       localStorage.setItem('clogo',          snap.clogo);
        if(snap.clogo_dark)                  localStorage.setItem('clogo_dark',     snap.clogo_dark);
        if(snap.cnac_mac24_v2)               localStorage.setItem('cnac_mac24_v2',  snap.cnac_mac24_v2);
      }
      // Marcar que este reload viene de un import: el bootstrap debe
      // empujar el localStorage a Supabase, no al revés.
      try{ sessionStorage.setItem('_ceven_import_reload','1'); }catch(e){}
      try{ localStorage.setItem('_ceven_import_reload','1'); }catch(e){} // fallback para file://
      // Recargar la app para aplicar todo
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
// y en localStorage bajo 'cbackup_auto' (persiste). Esto actúa como buffer de seguridad.
function autoSnapshot(){
  try {
    var snap = JSON.stringify({
      _version: 2,
      _timestamp: new Date().toISOString(),
      _app: 'CevenCotizador',
      cquotes:   JSON.parse(localStorage.getItem('cquotes')  || '[]'),
      cpipeline: JSON.parse(localStorage.getItem('cpipeline')|| '[]'),
      cpl:       JSON.parse(localStorage.getItem('cpl')      || '[]'),
      cnac:      JSON.parse(localStorage.getItem('cnac')     || '{}'),
      cqc:       parseInt(localStorage.getItem('cqc') || '1'),
      clogo:     localStorage.getItem('clogo') || null,
      cnac_mac24_v2: localStorage.getItem('cnac_mac24_v2') || null
    });
    localStorage.setItem('cbackup_auto', snap);
    sessionStorage.setItem('cbackup_session', snap);
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
      if(ok) localStorage.setItem('cbackup_full_last', String(Date.now()));
    });
  }, 8000);
}
