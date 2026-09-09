/* ============================================================
   BACKUP EN CARPETA  ·  compartido por todas las marcas
   ------------------------------------------------------------
   Estrategia 1 (Chrome/Edge con File System Access API):
     El usuario elige UNA carpeta (la MISMA para los tres
     cotizadores) con "📂 Elegir carpeta de backup". A partir de
     ahi, cada vez que entra al pipeline se guarda ahi el Excel
     combinado, y cada 12hs (o 8s despues de cada cambio) el JSON
     completo con las tres marcas.
   Estrategia 2 (Safari/Firefox): no soporta la API, asi que el
     auto-backup silencioso queda desactivado. El usuario puede
     usar el boton "⬇ Excel" cuando quiera.

   Desde 09/09/2026 el handle de carpeta es UNO SOLO, compartido
   por todos los cotizadores (antes era uno por marca, brand.idbKey).
   Ver cevenBackupNagIfNeeded() para el aviso de arranque.
   ============================================================ */

var _pipeBackupHandle = null; // FileSystemDirectoryHandle persistido en IndexedDB

// Clave UNICA del handle de carpeta, compartida por los tres cotizadores.
// Antes cada marca guardaba el suyo bajo brand.idbKey ('pipeFolder_poly', ...);
// restoreBackupHandle() migra ese valor a esta clave la primera vez para que
// nadie pierda el permiso de carpeta que ya concedio.
var CEVEN_BACKUP_IDB_KEY = 'ceven_backup_folder';

// La base 'cevenBackup' vive en el mismo origin y la comparten las marcas.
// OJO: la clave de arriba no se toca nunca — cambiarla le hace perder al
// usuario el permiso de carpeta que ya concedio.
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
    await _idbPut(CEVEN_BACKUP_IDB_KEY, handle);
    showToast('✓ Carpeta configurada — backup completo automatico de los TRES cotizadores (se mantiene al dia)');
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
  try { await _idbPut(CEVEN_BACKUP_IDB_KEY, null); } catch(e){}
  updateBackupButtonLabel();
  notifyUndo('Backup automatico desactivado.', function(){
    _pipeBackupHandle = prevHandle;
    _idbPut(CEVEN_BACKUP_IDB_KEY, prevHandle).catch(function(){});
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
  /* Excel COMBINADO: una hoja por cotizador con pipeline (poly/apple/legamaster),
     leído crudo de localStorage, así sale igual desde cualquier página. Fallback
     al workbook de la marca si el combinado no está (página vieja). */
  var wb = (typeof buildCombinedPipelineWorkbook === 'function') ? buildCombinedPipelineWorkbook() : null;
  if(!wb && typeof buildPipelineWorkbook === 'function') wb = buildPipelineWorkbook();
  if(!wb) return; // pipeline vacío o página sin pipeline: no escribir
  try {
    if(!(await _ensureFolderPermission())){
      showToast('⚠ Permiso de carpeta revocado — reactivá tocando 📂');
      _pipeBackupHandle = null;
      updateBackupButtonLabel();
      return;
    }
    var name = (typeof buildCombinedPipelineWorkbook === 'function')
      ? ('Ceven_Pipeline_' + _backupDateStamp() + '.xlsx')
      : (window.CEVEN_BRAND.pipeFilePrefix + _backupDateStamp() + '.xlsx');
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
// Escribe UN JSON con TODO el estado de las cuatro marcas en la carpeta
// elegida, reemplazando siempre `Ceven_Backup_Completo.json`. Lo que entra lo
// decide la lista blanca de shared/backup.js (buildCombinedFullBackupSnapshot)
// — nunca credenciales. Se reescribe cada 8s y la carpeta suele estar en
// OneDrive.
async function writeFullBackupToFolder(){
  if(!_pipeBackupHandle) return false;
  try {
    if(!(await _ensureFolderPermission())) return false;
    var snap = (typeof buildCombinedFullBackupSnapshot === 'function')
      ? buildCombinedFullBackupSnapshot()
      : buildFullBackupSnapshot();   // fallback: página vieja sin el combinado
    var name = (typeof CEVEN_FULL_BACKUP_APP === 'string')
      ? 'Ceven_Backup_Completo.json'
      : window.CEVEN_BRAND.fullBackupFile;
    var fileHandle = await _pipeBackupHandle.getFileHandle(name, {create:true});
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

/* ── AVISO DE ARRANQUE: "configurá una carpeta de backup" ──────────────────
   Si no hay carpeta elegida, se muestra un modal propio de la app (NO un
   popup del navegador) despues del login. Se puede cerrar con "Ahora no",
   pero vuelve a aparecer en CADA carga hasta que haya una carpeta.
   Solo tiene sentido donde la API existe (Chrome/Edge de escritorio). */
function cevenBackupNagIfNeeded(){
  if(_pipeBackupHandle || window._cevenBackupNagDone) return;
  if(!('showDirectoryPicker' in window)) return;
  var login = document.getElementById('ceven-login');
  if(login && login.style.display !== 'none') return;   // todavia en la pantalla de login
  if(typeof confirmModal !== 'function') return;
  window._cevenBackupNagDone = true;                    // una sola vez por carga
  confirmModal(
    '⚠ No tenés configurada una carpeta de backup.\n\n'
    + 'Con una carpeta elegida, la app guarda sola —y mantiene al día— una copia '
    + 'completa de los TRES cotizadores (cotizaciones, pipeline, clientes, price '
    + 'list). Es lo que te permite recuperar todo si se borra algo.\n\n'
    + 'Este aviso va a seguir apareciendo cada vez que entres, hasta que elijas una.',
    function(){ pickBackupFolder(); },
    { okLabel: 'Elegir carpeta ahora', cancelLabel: 'Ahora no' }
  );
}
// El evento lo dispara auth.js (cevenShowApp) al entrar; el timeout es el
// fallback para la carga inicial con sesión ya válida (el evento pudo salir
// antes de que este listener existiera). El guard evita el doble.
window.addEventListener('ceven-session-ready', function(){ setTimeout(cevenBackupNagIfNeeded, 800); });

// Restaurar handle al cargar (si el navegador lo permite — Chrome lo permite)
(async function restoreBackupHandle(){
  try {
    var h = await _idbGet(CEVEN_BACKUP_IDB_KEY);
    // Migración una-vez: si no hay handle en la clave nueva pero sí en la vieja
    // por marca, se adopta para no re-pedirle la carpeta al usuario.
    if(!h && window.CEVEN_BRAND && window.CEVEN_BRAND.idbKey){
      var viejo = await _idbGet(window.CEVEN_BRAND.idbKey);
      if(viejo){ h = viejo; await _idbPut(CEVEN_BACKUP_IDB_KEY, viejo).catch(function(){}); }
    }
    if(h){ _pipeBackupHandle = h; updateBackupButtonLabel(); }
  } catch(e){}
  // Chequear backup completo al cargar y luego cada 30 min mientras la app esté abierta
  setTimeout(maybeAutoFullBackup, 4000);
  setInterval(maybeAutoFullBackup, 30*60*1000);
  setTimeout(cevenBackupNagIfNeeded, 3000);
})();
