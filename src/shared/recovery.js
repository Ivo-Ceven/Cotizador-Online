/* ============================================================
   RECUPERACION ANTE PERDIDA DE DATOS  ·  compartido
   ------------------------------------------------------------
   Si el localStorage parece vacio (se limpio el navegador, se
   agoto la cuota, se cambio de perfil) pero hay un snapshot
   automatico, se ofrece restaurarlo ANTES de que el usuario
   note la perdida y empiece a recargar cosas a mano.

   Las dos marcas tenian su propia copia de esto en state.js.
   Las dos arrastraban los mismos tres problemas:

   1) La lista de claves a restaurar estaba escrita a mano en cada
      state.js. backup.js ya advertia que tenia que coincidir con
      _cevenBackupBases() "o la recuperacion vuelve a prometer datos
      que nadie guardo". Ahora no hay dos listas: se delega en
      _applyBackupRestore(), que es el mismo camino que usa el
      import de un backup manual.

   2) Escribian con localStorage.setItem crudo y despues recargaban.
      Si la cuota estaba llena — el escenario mas probable en una
      perdida de datos — la escritura fallaba en silencio y la app
      recargaba mostrando el mismo vacio, ahora ademas con el
      snapshot "consumido". _applyBackupRestore usa cevenLsSet,
      cuenta los fallos y NO recarga si la restauracion quedo a
      medias.

   3) No marcaban _ceven_import_reload. Sin esa marca el arranque
      trata a Supabase como fuente de verdad y baja el estado del
      servidor encima de lo que se acaba de restaurar: la
      restauracion se deshacia sola a los pocos segundos. Tampoco
      pausaban el sync mientras escribian.

   Ademas, Apple usaba confirm() nativo y corria en medio del
   <body>: frenaba el arranque con un modal encima de una pagina a
   medio construir. Se difiere a DOMContentLoaded (como ya hacia
   Poly), que ademas garantiza que backup.js ya cargo.

   Se usa confirmModal() y no el cartel con auto-cierre porque esto
   pisa datos locales y recarga: si el cartel se cerrara solo a los
   5s, la accion seguiria sin que nadie haya confirmado nada.

   Depende de: brand.js, safe.js, notify.js (confirmModal),
   backup.js (_applyBackupRestore). Se carga DESPUES de backup.js.
   ============================================================ */
function _checkRecovery(){
  try {
    var b = window.CEVEN_BRAND;

    // ¿Hay datos? Alcanza con que exista cualquiera de los tres grandes.
    var hasData = localStorage.getItem(cevenK('cquotes'))
               || localStorage.getItem(cevenK('cpipeline'))
               || localStorage.getItem(cevenK('cpl'));
    if(hasData) return;

    var autoSnap = localStorage.getItem(cevenK('cbackup_auto'))
                || sessionStorage.getItem(cevenK('cbackup_session'));
    if(!autoSnap) return;

    var snap = JSON.parse(autoSnap);

    // Un snapshot de otra marca no puede entrar aca aunque comparta el
    // navegador (mismo criterio que importFullBackup).
    if(snap._app && snap._app !== b.appTag) return;

    var cotCount  = (snap.cquotes   || []).length;
    var pipeCount = (snap.cpipeline || []).length;
    if(!cotCount && !pipeCount) return;

    var ts = snap._timestamp ? new Date(snap._timestamp).toLocaleString('es-AR') : '—';
    confirmModal(
      '⚠ Se detectó que los datos del cotizador ' + b.label + ' están vacíos.\n\n' +
      'Se encontró un backup automático del ' + ts + ':\n' +
      '• ' + cotCount  + ' filas de cotizaciones\n' +
      '• ' + pipeCount + ' entradas de pipeline\n\n' +
      'El ' + b.plLabel + ' no entra en el backup automático (ocupaba más que\n' +
      'todo el resto junto); se reimporta desde el Excel.\n\n' +
      '¿Restaurar automáticamente?',
      function(){ _applyBackupRestore(snap); },
      {okLabel: 'Restaurar'}
    );
  } catch(e){
    console.error('[recovery] no se pudo evaluar el snapshot automatico', e);
  }
}

if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', _checkRecovery);
else _checkRecovery();
