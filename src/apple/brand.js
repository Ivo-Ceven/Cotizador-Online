/* ============================================================
   CONFIGURACION DE MARCA  ·  Apple
   ------------------------------------------------------------
   Todo lo que distingue a este cotizador de los de otras marcas
   vive aca. Los modulos de src/shared/ leen este objeto y no
   tienen ni una sola constante hardcodeada por marca.

   Se carga ANTES que cualquier modulo compartido.

   Para sumar una marca nueva: copiar este archivo, ajustar los
   valores y cargar los mismos modulos de shared/. No se copia
   ni una linea de logica.
   ============================================================ */
window.CEVEN_BRAND = {
  id:     'apple',          // valor de la columna `brand` en Supabase
  label:  'Apple',
  prefix: '',               // prefijo de las claves de localStorage

  /* --- Sincronizacion (shared/sync.js) ------------------------------ */

  // Nombres BASE, sin prefijo: sync.js les antepone `prefix`.
  settingKeys: ['cquotes','cpl','carchive','cnac','cqc','ctarget','ctarget_manual',
                'clogo','clogo_dark','cnac_mac24_v2'],

  pipeCols: ['id','fecha','fechaISO','qNum','cliente','proyecto','ejecutivo','mesCierre','estado',
    'qMac','qIph','qIpad','qServ','qAcc','montoMac','montoIph','montoIpad','montoAcc','montoServ',
    'monto','margenPond','moneda','skuStatus','skuMesCierre','skuPartialQty','skuPartialRemSt',
    'skuPartialRemMes','skuArchivedQty','ovLink'],

  numCols: ['id','qNum','qMac','qIph','qIpad','qServ','qAcc','montoMac','montoIph','montoIpad',
    'montoAcc','montoServ','monto','margenPond'],

  // Columnas jsonb: viajan como objeto nativo, no como string.
  objCols: ['skuStatus','skuMesCierre','skuPartialQty','skuPartialRemSt','skuPartialRemMes',
    'skuArchivedQty'],

  // Escalares que aceptan NULL: hay que emitirlos explicitamente como null.
  // Si se omiten del payload, PostgREST conserva el valor viejo y el poll lo
  // vuelve a traer, dejando el pipeline en un ciclo de revert infinito.
  nullableCols: ['ovLink','proyecto','mesCierre'],

  // Campos que existen SOLO en localStorage (no hay columna en Supabase).
  // El poll tiene que preservarlos al mergear las filas del servidor.
  localOnlyCols: ['skuOvLinks'],

  /* --- Backup (shared/backup.js, shared/backup-folder.js) ----------- */

  idbKey:          'pipeFolder',                    // handle de carpeta en IndexedDB
  appTag:          'CevenCotizador',                // marca del archivo de backup
  backupVersion:   4,
  autoSnapVersion: 2,
  pipeFilePrefix:  'Ceven_Pipeline_Backup_',
  fullBackupFile:  'Ceven_Backup_Completo.json',
  exportPrefix:    'Ceven_Backup_'
};

/* Helper de claves: cevenK('cquotes') -> 'cquotes' en Apple, 'poly_cquotes' en Poly.
   Todo modulo compartido accede a localStorage a traves de esto. */
window.cevenK = function(base){ return window.CEVEN_BRAND.prefix + base; };
