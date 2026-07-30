/* ============================================================
   BACKUP COMPLETO  ·  compartido por todas las marcas
   ------------------------------------------------------------
   Exporta e importa TODO el estado del cotizador en un archivo
   JSON, y mantiene un snapshot de emergencia en localStorage
   (cbackup_auto) + sessionStorage (cbackup_session) que levanta
   _checkRecovery() en state.js cuando el storage aparece vacio.

   Todo lo que distingue una marca de otra sale de CEVEN_BRAND:
   nombres de archivo, tag del backup, numeros de version y —
   sobre todo — la lista de claves que entran al backup.
   ============================================================ */


/* ── QUE ENTRA AL BACKUP: LISTA BLANCA, NO LISTA NEGRA ─────────
   El criterio viejo de Apple era "volcar todo localStorage menos
   dos buffers". Como el prefijo de Apple es '' no habia forma de
   distinguir los datos del cotizador de la sesion de Supabase, y
   cada backup se llevaba ceven_auth_session con access_token y
   refresh_token en claro — reescrito ademas en la carpeta del
   usuario cada 8 segundos, que suele ser OneDrive. Al importar,
   ese volcado se restauraba tal cual: abrir el backup de un
   companero te dejaba logueado como el.

   Ahora se enumera lo que ENTRA, no lo que se excluye:

     settingKeys        (brand.js)  todo lo que sincroniza
     + CEVEN_BACKUP_LOCAL_ONLY      datos que no son "setting"
     + backupExtraKeys  (brand.js)  flags de migracion de la marca
   todas con el prefijo de la marca, mas:
     + CEVEN_BACKUP_UNPREFIXED      preferencias sin prefijo

   Lo que no este en esa lista queda afuera por definicion: la
   sesion, las claves de la otra marca en el mismo navegador, los
   buffers del propio backup (cbackup_auto / cbackup_full_last, que
   se regeneran solos) y cualquier clave de infraestructura futura.
   Sumar una clave al backup es un acto deliberado: se agrega a
   settingKeys o a backupExtraKeys en brand.js. */

/* Preferencias que viven SIN prefijo porque son del navegador y no
   del cotizador: las comparten todas las marcas (ver state.js). */
var CEVEN_BACKUP_UNPREFIXED = ['cdark'];

/* Datos del usuario que no figuran en settingKeys porque no viajan
   a Supabase como "setting" — el pipeline sincroniza como filas de
   tabla, no como blob — pero son datos igual y tienen que estar. */
var CEVEN_BACKUP_LOCAL_ONLY = ['cpipeline'];

/* Nombres BASE (sin prefijo) de los campos con nombre del snapshot.
   Es EXACTAMENTE lo que _checkRecovery() restaura en state.js:
   settingKeys + el pipeline + el modo oscuro. Si alguna vez dejan
   de coincidir, la recuperacion vuelve a prometer datos que nadie
   guardo — que es justo el bug que esta lista corrige. */
function _cevenBackupBases(){
  return (window.CEVEN_BRAND.settingKeys || [])
    .concat(CEVEN_BACKUP_LOCAL_ONLY)
    .concat(CEVEN_BACKUP_UNPREFIXED);
}

/* Clave real de localStorage para un nombre base. */
function _cevenBackupLsKey(base){
  return CEVEN_BACKUP_UNPREFIXED.indexOf(base) >= 0 ? base : cevenK(base);
}

/* Conjunto de claves de localStorage habilitadas para el backup. */
function _cevenBackupAllowSet(){
  var bases = _cevenBackupBases().concat(window.CEVEN_BRAND.backupExtraKeys || []);
  var set = {};
  for(var i=0;i<bases.length;i++) set[_cevenBackupLsKey(bases[i])] = 1;
  return set;
}

/* Segundo filtro, redundante a proposito: aunque brand.js liste una
   clave de mas por error, una credencial no sale nunca a un archivo
   ni vuelve nunca de uno. */
function _cevenBackupIsSecret(k){
  return k === CEVEN_SESSION_KEY ||
         k.indexOf('ceven_')  === 0 ||
         k.indexOf('_ceven_') === 0;
}

function _cevenBackupAllows(k, set){
  if(!k) return false;
  if(_cevenBackupIsSecret(k)) return false;
  return set[k] === 1;
}

/* Los campos con nombre conservan el TIPO que tenian en los backups
   viejos: arrays y objetos parseados (state.js les hace .length y
   JSON.stringify al restaurar), texto crudo para el resto. */
function _cevenBackupParse(raw){
  var c = raw.charAt(0);
  if(c === '[' || c === '{'){
    try { return JSON.parse(raw); }
    catch(err){
      console.warn('[backup] JSON invalido — se respalda como texto crudo:', raw.slice(0,40));
      return raw;
    }
  }
  return raw;
}


// ── SNAPSHOT COMPLETO (backup manual y archivo en carpeta) ──
function buildFullBackupSnapshot(){
  var b = window.CEVEN_BRAND;
  var snap = {
    _version:   b.backupVersion,
    _timestamp: new Date().toISOString(),
    _app:       b.appTag,
    _all:       {}   // claves de localStorage habilitadas, tal cual
  };
  var allow = _cevenBackupAllowSet();
  for(var i=0;i<localStorage.length;i++){
    var k = localStorage.key(i);
    if(!_cevenBackupAllows(k, allow)) continue;
    snap._all[k] = localStorage.getItem(k);
  }
  // Campos con nombre, sin prefijo: los leen los restauradores viejos
  // y el contador del cartel de confirmacion. Las claves ausentes se
  // omiten — todos los consumidores las chequean antes de usarlas.
  var bases = _cevenBackupBases();
  for(var j=0;j<bases.length;j++){
    var raw = localStorage.getItem(_cevenBackupLsKey(bases[j]));
    if(raw === null) continue;
    snap[bases[j]] = _cevenBackupParse(raw);
  }
  return snap;
}

function exportFullBackup(){
  var snap = buildFullBackupSnapshot();
  var blob = new Blob([JSON.stringify(snap, null, 2)], {type: 'application/json'});
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  var ts = new Date().toISOString().replace(/[:.]/g,'-').slice(0,19);
  a.href = url;
  a.download = window.CEVEN_BRAND.exportPrefix + ts + '.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast('✓ Backup descargado — guardalo en un lugar seguro');
}

// Importar backup: restaura TODO el estado desde un archivo JSON.
// Excepcion deliberada al patron "cartel + deshacer": esto pisa TODOS los
// datos locales y recarga la pagina al toque — un cartel que se cierra solo
// a los 5s seria peligroso aca (si no llegas a reaccionar, se ejecuta igual
// sin que hayas confirmado nada, y despues de recargar no hay forma de
// deshacer). Por eso usa confirmModal(), que no tiene temporizador — pero
// sigue sin ser un popup nativo del navegador, es HTML propio.
function importFullBackup(input){
  var file = input.files[0];
  if(!file) return;
  var b = window.CEVEN_BRAND;
  var reader = new FileReader();
  reader.onload = function(e){
    try {
      var snap = JSON.parse(e.target.result);
      // El tag identifica marca ademas de app: un backup de otra marca
      // no puede entrar aca aunque comparta el navegador.
      if(snap._app !== b.appTag){
        showToast('El archivo no parece ser un backup valido del cotizador ' + b.label + '.');
        input.value = '';
        return;
      }
      var cotCount  = (snap.cquotes   || []).length;
      var pipeCount = (snap.cpipeline || []).length;
      var plCount   = (snap.cpl       || []).length;
      var ts = snap._timestamp ? new Date(snap._timestamp).toLocaleString('es-AR') : 'desconocida';
      confirmModal(
        'Restaurar backup del ' + ts + '?\n\n' +
        '• ' + cotCount  + ' filas de cotizaciones\n' +
        '• ' + pipeCount + ' entradas de pipeline\n' +
        '• ' + plCount   + ' productos en ' + b.plLabel + '\n\n' +
        '⚠ Esto REEMPLAZA todos los datos actuales del cotizador ' + b.label + ' en el navegador.',
        function(){ _applyBackupRestore(snap); input.value = ''; },
        {okLabel: 'Restaurar', danger: true}
      );
    } catch(err) {
      showToast('Error al leer el archivo: ' + err.message);
      input.value = '';
    }
  };
  reader.readAsText(file);
}

function _applyBackupRestore(snap){
  // ── Pausar sync con Supabase durante la restauracion ──
  // Evita que cada setItem dispare un push y sature el free tier.
  if(typeof window._syncPause === 'function') window._syncPause();

  var allow = _cevenBackupAllowSet();
  var failed = 0;

  if(snap._all && typeof snap._all === 'object'){
    // MISMO filtro que en la exportacion. Un archivo ajeno no puede
    // inyectar la sesion de quien lo genero (asi te logueabas como el
    // autor del backup) ni escribir claves de otra marca.
    Object.keys(snap._all).forEach(function(k){
      if(!_cevenBackupAllows(k, allow)) return;
      if(!cevenLsSet(k, snap._all[k])) failed++;
    });
  } else {
    // Compatibilidad con backups viejos (campos con nombre, sin prefijo)
    _cevenBackupBases().forEach(function(base){
      var v = snap[base];
      if(v === undefined || v === null) return;
      var raw = (typeof v === 'object') ? JSON.stringify(v) : String(v);
      if(!cevenLsSet(_cevenBackupLsKey(base), raw)) failed++;
    });
  }

  if(failed){
    // Restauracion parcial: NO marcamos el import ni recargamos. Si
    // recargaramos con el flag puesto, el bootstrap empujaria a Supabase
    // un estado a medio escribir y el equipo entero se comeria el
    // destrozo. Sin el flag, el proximo arranque vuelve a bajar del
    // servidor y el usuario puede liberar espacio y reintentar.
    showToast('⚠ Restauracion incompleta: ' + failed + ' claves no se pudieron guardar. ' +
              'Libera espacio y volve a importar — no se recargo la app.');
    return;
  }

  // Marcar que este reload viene de un import: el bootstrap debe
  // empujar el localStorage a Supabase, no al reves.
  try{ sessionStorage.setItem('_ceven_import_reload','1'); }catch(e){}
  cevenLsSet('_ceven_import_reload','1'); // fallback para file://
  showToast('✓ Backup restaurado — recargando...');
  setTimeout(function(){ location.reload(); }, 1000);
}


// ── SNAPSHOT AUTOMATICO ──
// Cada vez que se guarda una cotizacion o se modifica el pipeline se
// deja una copia en sessionStorage (sobrevive hasta cerrar la pestana)
// y en localStorage bajo cbackup_auto (persiste). Es el buffer que lee
// _checkRecovery() en state.js. Devuelve true si se pudo guardar.
function autoSnapshot(){
  var b = window.CEVEN_BRAND;
  var snap = {
    _version:   b.autoSnapVersion,
    _timestamp: new Date().toISOString(),
    _app:       b.appTag
  };
  _cevenBackupBases().forEach(function(base){
    // cpl (price list / catalogo) queda AFUERA a proposito: es el mayor
    // consumidor de cuota y copiarlo aca mas que duplicaba la huella
    // dentro de los mismos 5MB de localStorage — o sea, ayudaba a
    // provocar el mismo llenado de storage del que este snapshot deberia
    // proteger. Se reimporta desde Excel en un minuto; no justifica el
    // costo. Todo el resto SI entra, y sale de settingKeys, que es
    // exactamente lo que restaura _checkRecovery().
    if(base === 'cpl') return;
    var raw = localStorage.getItem(_cevenBackupLsKey(base));
    if(raw === null) return;
    snap[base] = _cevenBackupParse(raw);
  });

  var json = JSON.stringify(snap);
  var ok = cevenLsSet(cevenK('cbackup_auto'), json);
  try { sessionStorage.setItem(cevenK('cbackup_session'), json); }
  catch(err){ console.warn('[backup] no se pudo guardar el snapshot de sesion', err); }

  // Ademas, actualizar el archivo de backup completo en la carpeta (debounced)
  if(typeof scheduleFullBackup === 'function') scheduleFullBackup();
  return ok;
}

// Reescribe el archivo de backup completo poco despues de cada cambio
// (debounce 8s), para que el archivo en disco este siempre al dia y se
// pueda recuperar al instante.
var _fullBackupTimer = null;
function scheduleFullBackup(){
  // _pipeBackupHandle lo declara backup-folder.js, que carga despues.
  if(!window._pipeBackupHandle) return;
  clearTimeout(_fullBackupTimer);
  _fullBackupTimer = setTimeout(function(){
    if(typeof writeFullBackupToFolder !== 'function') return;
    writeFullBackupToFolder().then(function(ok){
      if(ok) cevenLsSet(cevenK('cbackup_full_last'), String(Date.now()));
    });
  }, 8000);
}
