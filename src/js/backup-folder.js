// ── BACKUP AUTOMÁTICO ──
// Estrategia 1 (Chrome/Edge con File System Access API):
//   El usuario elige una carpeta UNA vez con "📂 Elegir carpeta de backup".
//   A partir de ahí, cada vez que entra al pipeline se guarda silenciosamente
//   en esa carpeta sobreescribiendo "Ceven_Pipeline_Backup.xlsx".
// Estrategia 2 (Safari/Firefox): no soporta API, así que se desactiva el auto-backup
//   silencioso. El usuario puede usar el botón "⬇ Excel" cuando quiera.

var _pipeBackupHandle = null; // FileSystemDirectoryHandle persistido en IndexedDB

function _idbOpen(){
  return new Promise(function(resolve, reject){
    var req = indexedDB.open('cevenBackup', 1);
    req.onupgradeneeded = function(){ req.result.createObjectStore('handles'); };
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
    alert('Tu navegador no soporta backup automático en carpeta. Usá Chrome o Edge en escritorio.\nMientras tanto, podés tocar "⬇ Excel" para descargar manualmente.');
    return;
  }
  try {
    var handle = await window.showDirectoryPicker({mode:'readwrite'});
    _pipeBackupHandle = handle;
    await _idbPut('pipeFolder', handle);
    showToast('✓ Carpeta configurada — backup completo automático de TODOS los datos (se mantiene al día)');
    updateBackupButtonLabel();
    autoBackupPipeline(true);
    // Forzar un backup completo inicial al configurar la carpeta
    localStorage.removeItem('cbackup_full_last');
    maybeAutoFullBackup();
  } catch(e){ /* user cancelled */ }
}

async function clearBackupFolder(){
  if(!confirm('¿Dejar de guardar backups automáticos?')) return;
  _pipeBackupHandle = null;
  try { await _idbPut('pipeFolder', null); } catch(e){}
  updateBackupButtonLabel();
  showToast('Backup automático desactivado');
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

async function autoBackupPipeline(silentSuccess){
  if(!_pipeBackupHandle) return;
  var wb = buildPipelineWorkbook();
  if(!wb) return; // pipeline vacío, no escribir
  try {
    // Verificar permisos
    if(_pipeBackupHandle.queryPermission){
      var perm = await _pipeBackupHandle.queryPermission({mode:'readwrite'});
      if(perm !== 'granted'){
        var req = await _pipeBackupHandle.requestPermission({mode:'readwrite'});
        if(req !== 'granted'){
          showToast('⚠ Permiso de carpeta revocado — reactivá tocando 📂');
          _pipeBackupHandle = null;
          updateBackupButtonLabel();
          return;
        }
      }
    }
    var fileHandle = await _pipeBackupHandle.getFileHandle('Ceven_Pipeline_Backup_' + _backupDateStamp() + '.xlsx', {create:true});
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
// Escribe un JSON con TODO el estado en la carpeta elegida, reemplazando siempre el mismo archivo.
async function writeFullBackupToFolder(){
  if(!_pipeBackupHandle) return false;
  try {
    // Verificar permisos de escritura
    if(_pipeBackupHandle.queryPermission){
      var perm = await _pipeBackupHandle.queryPermission({mode:'readwrite'});
      if(perm !== 'granted'){
        var req = await _pipeBackupHandle.requestPermission({mode:'readwrite'});
        if(req !== 'granted') return false;
      }
    }
    var snap = buildFullBackupSnapshot();
    var fileHandle = await _pipeBackupHandle.getFileHandle('Ceven_Backup_Completo.json', {create:true});
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
  var last = parseInt(localStorage.getItem('cbackup_full_last')||'0');
  var now = Date.now();
  if(last && (now - last < HALF_DAY)) return;
  var ok = await writeFullBackupToFolder();
  if(ok){
    localStorage.setItem('cbackup_full_last', String(now));
    showToast('✓ Backup completo automático guardado');
    console.log('[Backup completo] Guardado en', _pipeBackupHandle.name, new Date(now).toLocaleString('es-AR'));
  }
}

// Restaurar handle al cargar (si el navegador lo permite — Chrome lo permite)
(async function restoreBackupHandle(){
  try {
    var h = await _idbGet('pipeFolder');
    if(h){ _pipeBackupHandle = h; updateBackupButtonLabel(); }
  } catch(e){}
  // Chequear backup completo al cargar y luego cada 30 min mientras la app esté abierta
  setTimeout(maybeAutoFullBackup, 4000);
  setInterval(maybeAutoFullBackup, 30*60*1000);
})();
