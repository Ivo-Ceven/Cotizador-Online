// ── GLOBALS ──
var products = [];
var items = [];
var warrantyItems = []; // garantías desde CevenCare
var selIds = {};       // {id: orden_de_seleccion} — el valor (número) preserva el orden de selección
var _selSeq = 0;
function _nextSel(){ return ++_selSeq; }

// ── DARK MODE ──
var _darkMode = (localStorage.getItem('cdark') === '1');
(function(){ if(_darkMode) document.body.classList.add('dark'); })();

function toggleDark(){
  _darkMode = !_darkMode;
  localStorage.setItem('cdark', _darkMode ? '1' : '0');
  document.body.classList.toggle('dark', _darkMode);
  var icon = _darkMode ? '☀️' : '🌙';
  document.querySelectorAll('.dark-btn').forEach(function(b){ b.textContent = icon; });
  applyLogo();
  renderQ();
  renderWarranties();
  var pp = document.getElementById('p-pipeline');
  if(pp && pp.classList.contains('on')) renderPipeline();
  var tm = document.getElementById('target-modal');
  if(tm && tm.style.display !== 'none') renderTargetAnual();
}
var histSel = {};
var editId = null;
var _logo = null;
var _logoDark = null;

var NAC_DEF = {"AirTag":29,"Apple TV":29,"Apple TV Accessories":29,"Creativity":33,"Displays & Mounts":33,"Headphones & Speakers":48,"iMac":24,"iPad":19,"iPad Air":19,"iPad Air 11":19,"iPad Air 13":19,"iPad mini":19,"iPad Pro 11":19,"iPad Pro 13":19,"iPhone":6,"Mac English":24,"Mac Spanish":24,"Mac mini":6,"Mac Studio":24,"MacBook Air 13":24,"MacBook Air 15":24,"MacBook Neo":25,"MacBook Pro 14":24,"MacBook Pro 16":24,"Mice & Keyboards":33,"Power & Cables":40,"Watch":40,"Watch SE 3":40,"Watch Series 11":40,"Watch Ultra 3":40};

// Tabla de categorías por Model (LOB) — fuente de verdad para pipeline
var MODEL_CATEGORY = {
  'AirTag':'acc','Apple TV':'acc','Apple TV Accessories':'acc',
  'Creativity':'acc','Displays & Mounts':'acc','Headphones & Speakers':'acc',
  'Mice & Keyboards':'acc','Power & Cables':'acc',
  'Watch':'acc','Watch SE 3':'acc','Watch Series 11':'acc','Watch Ultra 3':'acc',
  // 'Mac English' y 'Mac Spanish' NO están aquí: se usan tanto para Macs con
  // teclado en español/inglés como para accesorios → el fallback por descripción
  // los distingue correctamente (un MacBook tiene "MacBook" en el nombre; un
  // Magic Keyboard/Mouse/Trackpad no).
  'iMac':'mac','Mac mini':'mac','Mac Studio':'mac',
  'MacBook Air 13':'mac','MacBook Air 15':'mac','MacBook Neo':'mac',
  'MacBook Pro 14':'mac','MacBook Pro 16':'mac',
  'iPad':'ipad','iPad Air':'ipad','iPad Air 11':'ipad','iPad Air 13':'ipad',
  'iPad mini':'ipad','iPad Pro 11':'ipad','iPad Pro 13':'ipad',
  'iPhone 15':'iphone','iPhone 16':'iphone','iPhone 16 Plus':'iphone',
  'iPhone 16e':'iphone','iPhone 17':'iphone','iPhone 17 Pro':'iphone',
  'iPhone 17 Pro Max':'iphone','iPhone 17e':'iphone',
  'iPhone Air':'iphone'
};
var nacRates = JSON.parse(JSON.stringify(NAC_DEF));
var quoteNacOverrides = {}; // {LOB: %} aplica solo a la cotización activa
try {
  var _ns = localStorage.getItem('cnac');
  if(_ns) {
    nacRates = JSON.parse(_ns);
    var migrationDone = false;
    // Migración 1: limpiar entradas iPhone específicas y unificar en "iPhone": 6
    Object.keys(nacRates).forEach(function(k){
      if(k.toLowerCase().indexOf('iphone') === 0 && k.length > 6){ delete nacRates[k]; migrationDone = true; }
    });
    if(nacRates['iPhone'] === undefined){ nacRates['iPhone'] = 6; migrationDone = true; }
    // Migración 2: actualizar familia Mac al nuevo preset (24% excepto Mac mini = 6%)
    var nacMigrationKey = 'cnac_mac24_v2';
    if(!localStorage.getItem(nacMigrationKey)){
      var macKeys = ['iMac','Mac Studio','MacBook Air 13','MacBook Air 15','MacBook Neo','MacBook Pro 14','MacBook Pro 16','Mac English','Mac Spanish'];
      macKeys.forEach(function(k){ nacRates[k] = 24; });
      nacRates['Mac mini'] = 6;
      try{ localStorage.setItem(nacMigrationKey, '1'); }catch(e){}
      migrationDone = true;
    }
    // Migración 3: MacBook Neo sube de 24% a 25%
    if(!localStorage.getItem('cnac_neo25_v3')){
      nacRates['MacBook Neo'] = 25;
      try{ localStorage.setItem('cnac_neo25_v3','1'); }catch(e){}
      migrationDone = true;
    }
    if(migrationDone) localStorage.setItem('cnac', JSON.stringify(nacRates));
  }
} catch(e) {}

var IVA_MAP = {"Accessories":"21%","TV & Home":"21%","Mac":"10.5%","Mac English":"10.5%","Mac Spanish":"10.5%","iPad":"10.5%","iPhone":"10.5% + 21%","Watch":"21%"};

// Columnas del Excel de cotizaciones. 'Condición de pago', 'Propuesta efectiva
// hasta' y 'Entrega' se agregaron cuando doSave() empezó a persistirlas (sin eso,
// el PDF regenerado desde el historial perdía el bloque de Condiciones Comerciales).
var COLS = ['N° Cotización','Fecha','Hora','Cliente','Proyecto','Ejecutivo','Observaciones','Mes Cierre','Condición de pago','Propuesta efectiva hasta','Entrega','SKU','Descripción','Cantidad','Disponibilidad','Margen %','P. Venta Unitario','Total'];

// ── RECOVERY CHECK ──
// Si el localStorage parece vacío (pérdida de datos) pero hay un backup automático,
// ofrecer restaurar antes de que el usuario note la pérdida.
(function(){
  try {
    var hasData = localStorage.getItem('cquotes') || localStorage.getItem('cpipeline') || localStorage.getItem('cpl');
    if(!hasData) {
      // Buscar backup automático guardado
      var autoSnap = localStorage.getItem('cbackup_auto') || sessionStorage.getItem('cbackup_session');
      if(autoSnap) {
        var snap = JSON.parse(autoSnap);
        var cotCount = (snap.cquotes || []).length;
        var pipeCount = (snap.cpipeline || []).length;
        var plCount = (snap.cpl || []).length;
        if(cotCount || pipeCount || plCount) {
          var ts = snap._timestamp ? new Date(snap._timestamp).toLocaleString('es-AR') : '—';
          if(confirm(
            '⚠ Se detectó que los datos del cotizador están vacíos.\n\n' +
            'Se encontró un backup automático del ' + ts + ':\n' +
            '• ' + cotCount + ' filas de cotizaciones\n' +
            '• ' + pipeCount + ' entradas de pipeline\n\n' +
            'El price list no entra en el backup automático (ocupaba más que\n' +
            'todo el resto junto); se reimporta desde el Excel.\n\n' +
            '¿Restaurar automáticamente?'
          )) {
            if(snap.cquotes)          localStorage.setItem('cquotes',         JSON.stringify(snap.cquotes));
            if(snap.cpipeline)        localStorage.setItem('cpipeline',       JSON.stringify(snap.cpipeline));
            if(snap.carchive)         localStorage.setItem('carchive',        JSON.stringify(snap.carchive));
            if(snap.cpl)              localStorage.setItem('cpl',             JSON.stringify(snap.cpl));
            if(snap.cnac)             localStorage.setItem('cnac',            JSON.stringify(snap.cnac));
            if(snap.cqc)              localStorage.setItem('cqc',             String(snap.cqc));
            if(snap.ctarget)          localStorage.setItem('ctarget',         JSON.stringify(snap.ctarget));
            if(snap.ctarget_manual)   localStorage.setItem('ctarget_manual',  JSON.stringify(snap.ctarget_manual));
            if(snap.cdark)            localStorage.setItem('cdark',           String(snap.cdark));
            if(snap.clogo)            localStorage.setItem('clogo',           snap.clogo);
            if(snap.clogo_dark)       localStorage.setItem('clogo_dark',      snap.clogo_dark);
            if(snap.cnac_mac24_v2)    localStorage.setItem('cnac_mac24_v2',   snap.cnac_mac24_v2);
            location.reload();
          }
        }
      }
    }
  } catch(e) {}
})();

try { qNum = parseInt(localStorage.getItem('cqc')||'0') + 1; localStorage.setItem('cqc', qNum); } catch(e) {}
document.getElementById('qnum').textContent = 'Cotización #' + String(qNum).padStart(4,'0');

