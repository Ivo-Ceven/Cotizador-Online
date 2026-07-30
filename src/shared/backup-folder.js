/* ============================================================
   BACKUP EN CARPETA  ·  compartido por todas las marcas
   ------------------------------------------------------------
   Estrategia 1 (Chrome/Edge con File System Access API):
     El usuario elige una carpeta UNA vez con "📂 Elegir carpeta
     de backup". A partir de ahi, cada vez que entra al pipeline
     se guarda silenciosamente el Excel del pipeline ahi, y cada
     12hs (o 8s despues de cada cambio) el JSON completo.
   Estrategia 2 (Safari/Firefox): no soporta la API, asi que el
     auto-backup silencioso queda desactivado. El usuario puede
     usar el boton "⬇ Excel" cuando quiera.

   Nombres de archivo y clave de IndexedDB salen de CEVEN_BRAND.
   ============================================================ */

var _pipeBackupHandle = null; // FileSystemDirectoryHandle persistido en IndexedDB

// Todas las marcas comparten la base 'cevenBackup' en el mismo origin, pero
// cada una guarda su handle bajo su propia clave (brand.idbKey): asi el mismo
// navegador recuerda una carpeta distinta por cotizador y no se pisan los
// archivos. OJO: esos valores no se tocan nunca — cambiarlos le hace perder
// al usuario el permiso de carpeta que ya concedio.
function _idbOpen(){
  return new Promise(function(resolve, reject){
    var req = indexedDB.open('cevenBackup', 1);
    // El guard del contains() no es decorativo: como la base es compartida,
    // la primera marca que corra el upgrade crea el store y la segunda
    // tiraria ConstraintError sin el chequeo.
    req.onupgradeneeded = function(){ if(!req.result.objectStoreNames.contains('handles')) req.result.createObjectStore('handles'); };
    req.onsuccess = function(){ resolve(req.result); };
    req.onerror = function(){ reject(req.error); };
  });
}
function _idbGet(key){
  return _idbOpen().then(function(db){
    return new Promise(function(res, rej){
      var tx = db.transaction('handles','readonly');
      var r = tx.objectStore('handles').get(key);
      r.onsuccess = function(){ res(r.result); };
      r.onerror = function(){ rej(r.error); };
    });
  });
}
function _idbPut(key, val){
  return _idbOpen().then(function(db){
    return new Promise(function(res, rej){
      var tx = db.transaction('handles','readwrite');
      var r = tx.objectStore('handles').put(val, key);
      r.onsuccess = function(){ res(); };
      r.onerror = function(){ rej(r.error); };
    });
  });
}

async function pickBackupFolder(){
  if(!('showDirectoryPicker' in window)){
    showToast('Tu navegador no soporta backup automatico en carpeta. Usa Chrome o Edge en escritorio — mientras tanto, toca "⬇ Excel" para descargar manualmente.');
    return;
  }
  try {
    var handle = await window.showDirectoryPicker({mode:'readwrite'});
    _pipeBackupHandle = handle;
    await _idbPut(window.CEVEN_BRAND.idbKey, handle);
    showToast('✓ Carpeta configurada — backup completo automatico de TODOS los datos (se mantiene al dia)');
    updateBackupButtonLabel();
    autoBackupPipeline(true);
    // Forzar un backup completo inicial al configurar la carpeta
    localStorage.removeItem(cevenK('cbackup_full_last'));
    maybeAutoFullBackup();
  } catch(e){ /* user cancelled */ }
}

async function clearBackupFolder(){
  var prevHandle = _pipeBackupHandle;
  _pipeBackupHandle = null;
  try { await _idbPut(window.CEVEN_BRAND.idbKey, null); } catch(e){}
  updateBackupButtonLabel();
  notifyUndo('Backup automatico desactivado.', function(){
    _pipeBackupHandle = prevHandle;
    _idbPut(window.CEVEN_BRAND.idbKey, prevHandle).catch(function(){});
    updateBackupButtonLabel();
  });
}

function updateBackupButtonLabel(){
  var btn = document.getElementById('pipe-backup-btn');
  if(!btn) return;
  if(_pipeBackupHandle){
    btn.textContent = '✓ Backup activo';
    btn.title = 'Backup automático activo en: ' + (_pipeBackupHandle.name || 'carpeta elegida') + ' · click para desactivar';
    btn.onclick = clearBackupFolder;
  } else {
    btn.textContent = '📂 Elegir carpeta backup';
    btn.title = 'Elegí una carpeta donde guardar backups automáticos del pipeline';
    btn.onclick = pickBackupFolder;
  }
}

// Fecha local en formato YYYY-MM-DD, para nombrar un backup por día (ordena bien alfabéticamente).
function _backupDateStamp(){
  var d = new Date();
  var yyyy = d.getFullYear();
  var mm = String(d.getMonth()+1).padStart(2,'0');
  var dd = String(d.getDate()).padStart(2,'0');
  return yyyy + '-' + mm + '-' + dd;
}

// Pide (o revalida) el permiso de escritura sobre la carpeta elegida.
function _ensureFolderPermission(){
  if(!_pipeBackupHandle.queryPermission) return Promise.resolve(true);
  return _pipeBackupHandle.queryPermission({mode:'readwrite'}).then(function(perm){
    if(perm === 'granted') return true;
    return _pipeBackupHandle.requestPermission({mode:'readwrite'}).then(function(req){
      return req === 'granted';
    });
  });
}

async function autoBackupPipeline(silentSuccess){
  if(!_pipeBackupHandle) return;
  var wb = buildPipelineWorkbook();
  if(!wb) return; // pipeline vacío, no escribir
  try {
    if(!(await _ensureFolderPermission())){
      showToast('⚠ Permiso de carpeta revocado — reactivá tocando 📂');
      _pipeBackupHandle = null;
      updateBackupButtonLabel();
      return;
    }
    var name = window.CEVEN_BRAND.pipeFilePrefix + _backupDateStamp() + '.xlsx';
    var fileHandle = await _pipeBackupHandle.getFileHandle(name, {create:true});
    var writable = await fileHandle.createWritable();
    var arrayBuf = XLSX.write(wb, {bookType:'xlsx', type:'array'});
    await writable.write(arrayBuf);
    await writable.close();
    if(!silentSuccess){
      // backup silencioso normal — solo logueamos en consola
      console.log('[Pipeline] Backup guardado en', _pipeBackupHandle.name);
    } else {
      showToast('✓ Backup guardado en ' + (_pipeBackupHandle.name || 'carpeta'));
    }
  } catch(e){
    console.warn('[Pipeline] Error en backup:', e);
  }
}

// ── BACKUP COMPLETO AUTOMÁTICO (2 veces por día, mismo archivo) ──
// Escribe un JSON con TODO el estado en la carpeta elegida, reemplazando
// siempre el mismo archivo. Lo que entra al JSON lo decide la lista blanca
// de shared/backup.js — nunca credenciales: este archivo se reescribe cada
// 8 segundos y la carpeta elegida suele estar sincronizada a OneDrive.
async function writeFullBackupToFolder(){
  if(!_pipeBackupHandle) return false;
  try {
    if(!(await _ensureFolderPermission())) return false;
    var snap = buildFullBackupSnapshot();
    var fileHandle = await _pipeBackupHandle.getFileHandle(window.CEVEN_BRAND.fullBackupFile, {create:true});
    var writable = await fileHandle.createWritable();
    await writable.write(JSON.stringify(snap, null, 2));
    await writable.close();
    return true;
  } catch(e){
    console.warn('[Backup completo] Error:', e);
    return false;
  }
}

// Chequea si pasaron 12hs desde el último backup completo; si sí, lo hace.
async function maybeAutoFullBackup(){
  if(!_pipeBackupHandle) return;
  var HALF_DAY = 12*60*60*1000;
  var last = parseInt(localStorage.getItem(cevenK('cbackup_full_last'))||'0');
  var now = Date.now();
  if(last && (now - last < HALF_DAY)) return;
  var ok = await writeFullBackupToFolder();
  if(ok){
    cevenLsSet(cevenK('cbackup_full_last'), String(now));
    showToast('✓ Backup completo automático guardado');
    console.log('[Backup completo] Guardado en', _pipeBackupHandle.name, new Date(now).toLocaleString('es-AR'));
  }
}

// Restaurar handle al cargar (si el navegador lo permite — Chrome lo permite)
(async function restoreBackupHandle(){
  try {
    var h = await _idbGet(window.CEVEN_BRAND.idbKey);
    if(h){ _pipeBackupHandle = h; updateBackupButtonLabel(); }
  } catch(e){}
  // Chequear backup completo al cargar y luego cada 30 min mientras la app esté abierta
  setTimeout(maybeAutoFullBackup, 4000);
  setInterval(maybeAutoFullBackup, 30*60*1000);
})();
