// ── GLOBALS ──
var products = [];
var items = [];
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
  var pp = document.getElementById('p-pipeline');
  if(pp && pp.classList.contains('on')) renderPipeline();
}
var histSel = {};
var editId = null;
var _logo = null;
var _logoDark = null;

var COLS = ['N° Cotización','Fecha','Hora','Cliente','OPG','Sala','Ejecutivo','Observaciones',
            'Mes Cierre','SKU','Descripción','Cantidad','Nota','P. Venta Unitario','Total'];

// ── RECOVERY CHECK ──
// Si el localStorage parece vacío (pérdida de datos) pero hay un backup automático,
// ofrecer restaurar antes de que el usuario note la pérdida.
// Nota de orden de carga: usa confirmModal(), definido recién en boot.js (que carga
// mucho después que este archivo) — por eso se difiere a DOMContentLoaded en vez de
// llamarse en el momento (acá arriba la función todavía no existe).
// Es la misma excepción que importFullBackup() en backup.js: pisa datos locales y
// recarga la página, así que no usa el cartel con auto-cierre a 5s.
function _checkRecovery(){
  try {
    var hasData = localStorage.getItem('poly_cquotes') || localStorage.getItem('poly_cpipeline') || localStorage.getItem('poly_cpl');
    if(hasData) return;
    var autoSnap = localStorage.getItem('poly_cbackup_auto') || sessionStorage.getItem('poly_cbackup_session');
    if(!autoSnap) return;
    var snap = JSON.parse(autoSnap);
    var cotCount = (snap.cquotes || []).length;
    var pipeCount = (snap.cpipeline || []).length;
    var plCount = (snap.cpl || []).length;
    if(!cotCount && !pipeCount && !plCount) return;
    var ts = snap._timestamp ? new Date(snap._timestamp).toLocaleString('es-AR') : '—';
    confirmModal(
      '⚠ Se detectó que los datos del cotizador Poly están vacíos.\n\n' +
      'Se encontró un backup automático del ' + ts + ':\n' +
      '• ' + cotCount + ' filas de cotizaciones\n' +
      '• ' + pipeCount + ' entradas de pipeline\n' +
      '• ' + plCount + ' productos en catálogo\n\n' +
      '¿Restaurar automáticamente?',
      function(){
        if(snap.cquotes)    localStorage.setItem('poly_cquotes',   JSON.stringify(snap.cquotes));
        if(snap.cpipeline)  localStorage.setItem('poly_cpipeline', JSON.stringify(snap.cpipeline));
        if(snap.carchive)   localStorage.setItem('poly_carchive',  JSON.stringify(snap.carchive));
        if(snap.cpl)        localStorage.setItem('poly_cpl',       JSON.stringify(snap.cpl));
        if(snap.cqc)        localStorage.setItem('poly_cqc',       String(snap.cqc));
        if(snap.cdark)      localStorage.setItem('cdark',          String(snap.cdark));
        if(snap.clogo)      localStorage.setItem('poly_clogo',      snap.clogo);
        if(snap.clogo_dark) localStorage.setItem('poly_clogo_dark', snap.clogo_dark);
        location.reload();
      },
      {okLabel: 'Restaurar'}
    );
  } catch(e) {}
}
if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', _checkRecovery);
else _checkRecovery();

try { qNum = parseInt(localStorage.getItem('poly_cqc')||'0') + 1; localStorage.setItem('poly_cqc', qNum); } catch(e) {}
document.getElementById('qnum').textContent = 'Cotización #' + String(qNum).padStart(4,'0');
