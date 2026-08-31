#!/usr/bin/env node
/* ============================================================================
   check-pipe-regi-opg.js · Cotizadores Ceven
   ----------------------------------------------------------------------------
   Vínculo entre el pipeline real de Poly y el pipeline REGI (Deal
   Registration de HP), agregado el 27/08/2026 — ver docs/HISTORIAL.md de esa
   fecha. El matching es `pipeline.opg` contra `poly_regi_pipeline.regi` si
   está aprobado, o contra `opd` cuando la fila del Excel no tiene REGI.

   Corre las funciones REALES de src/poly/js/pipeline-regi.js contra filas
   armadas a mano, con el mismo patrón de stubs que scripts/check-pipe-pills.js
   (vm + un DOM de mentira mínimo).

   Uso:  node scripts/check-pipe-regi-opg.js
   ========================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');

let fallos = 0, corridas = 0;
function ok(cond, nombre, detalle){
  corridas++;
  if(cond){ console.log('  ✓ ' + nombre); return; }
  fallos++;
  console.error('  ✗ ' + nombre + (detalle ? ('\n      ' + detalle) : ''));
}

// <div> de mentira: guarda innerHTML/textContent, sabe pintar style. No hace
// falta el trackeo de children de check-pipe-pills.js: acá nada depende del
// ancho para recortar pastillas.
function nodo(){
  return { _html: '', textContent: '', style: {}, addEventListener: function(){} };
}
Object.defineProperty(nodo.prototype, 'innerHTML', {
  get(){ return this._html; },
  set(v){ this._html = v; }
});

function cargar(){
  var els = {
    'pipe-search':            { value: '' },
    'regi-vinc-count':        nodo(),
    'pipe-month-pills':       nodo(),
    'pipe-pills-row':         Object.assign(nodo(), {scrollWidth:0, clientWidth:0}),
    'pipe-topclients-pills':  Object.assign(nodo(), {scrollWidth:0, clientWidth:0}),
    'pipe-dashboard':         { style: {} },
    'dash-count':             nodo(),
    'dash-proyectos':         nodo(),
    'dash-total-lbl':         nodo(),
    'dash-total':             nodo(),
    'dash-total-sub':         nodo(),
    'dash-regi-perdidos':     nodo(),
    'dash-regi-vinculados':   nodo(),
    'dash-by-status':         nodo(),
    'regi-pipe-body':         nodo(),
    'client':                 { value: '' },
    'proyecto':               { value: '' },
    'opg':                    { value: '' }
  };
  var ctx = {
    console,
    document: {
      getElementById: id => els.hasOwnProperty(id) ? els[id] : null,
      querySelectorAll: () => [],
      addEventListener: () => {}
    },
    addEventListener: () => {},
    cevenEsc: s => String(s == null ? '' : s)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;').replace(/'/g,'&#39;'),
    fI: n => Math.round(n).toLocaleString('es-AR'),
    cevenHoyISO: () => '2026-01-01',
    _mesLabelPoly: m => m,
    renderPipeline(){},
    setPipeSort(){},
    attachPipeSortHandlers(){},
    _pipeSetLbl(id, txt){ if(els.hasOwnProperty(id)) els[id].textContent = txt; },
    goTo(v){ ctx._calls.push(['goTo', v]); },
    nuevaCotizacion(){ ctx._calls.push(['nuevaCotizacion']); },
    aplicarTierDelCliente(){ ctx._calls.push(['aplicarTierDelCliente']); },
    cevenClienteCambio(){ ctx._calls.push(['cevenClienteCambio']); },
    setMesCierre(v){ ctx._calls.push(['setMesCierre', v]); },
    showToast(m){ ctx._lastToast = m; },
    cevenCanUsePipeline(){ return ctx._canUse !== false; },
    getPipeline(){ return ctx._pipelineData || []; },
    SUPABASE_URL: 'https://example.supabase.co',
    CEVEN_BRAND: { pipeColCount: 9, pipeSortDescCols: ['monto','fechaISO'] }
  };
  ctx.window = ctx;
  ctx.globalThis = ctx;
  ctx._calls = [];
  ctx._els = els;
  vm.createContext(ctx);
  for(const f of ['src/shared/clientes.js', 'src/shared/pipeline-group.js', 'src/shared/pipeline-ui.js', 'src/poly/js/pipeline-regi.js']){
    vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, {filename: f});
  }
  ctx._pipeSort = { col: 'monto', dir: 'desc' };
  return ctx;
}

// Fila real de pipeline mínima (lo único que le importa a este vínculo es `opg`).
const filaReal = (opg, extra) => Object.assign({ id: Math.random(), opg: opg }, extra || {});

// Oportunidad REGI mínima (mismo shape que arma _regiRowToPipeRow).
const filaRegi = (opd, regi, extra) => Object.assign({
  opd: opd, regi: regi || '', proyecto: 'Proyecto ' + opd, cliente: 'Cliente ' + opd,
  primaryPartner: '', drExpiration: '', mesCierre: '', montoArchivo: 0, productosMonto: 0, monto: 1000, forecast: ''
}, extra || {});

console.log('\nVínculo pipeline real <-> pipeline REGI, vía OPG · src/poly/js/pipeline-regi.js\n');

/* ═══ 1 · Normalización del código ═══════════════════════════════════════ */
console.log('1 · _regiNormCodigo: trim + mayúsculas, para que un espacio o una minúscula no rompan el match');
{
  const e = cargar();
  ok(e._regiNormCodigo('  abc123  ') === 'ABC123', 'espacios y minúsculas se normalizan');
  ok(e._regiNormCodigo(null) === '' && e._regiNormCodigo(undefined) === '', 'null/undefined dan string vacío, no "NULL"');
}

/* ═══ 2 · El set de OPG ya vinculados sale de getPipeline(), sin fetch ══════ */
console.log('\n2 · _regiOpgVinculadosSet lee getPipeline(), no pide nada a Supabase');
{
  const e = cargar();
  e._pipelineData = [ filaReal('abc-123'), filaReal(''), filaReal(null), filaReal(' xyz-9 ') ];
  const set = e._regiOpgVinculadosSet();
  ok(set['ABC-123'] !== undefined, 'un OPG cargado entra al set, normalizado');
  ok(set['XYZ-9'] !== undefined, 'con espacios de más, igual');
  ok(Object.keys(set).length === 2, 'las filas sin OPG no ensucian el set', JSON.stringify(set));
}

/* ═══ 3 · Una oportunidad sin REGI aprobado usa OPD ════════════════════════ */
console.log('\n3 · Sin REGI aprobado (columna vacía), OPD permite el vínculo');
{
  const e = cargar();
  const vinculados = { 'ABC-123': 1, 'OPD1': 1, 'OPD3': 1 };
  ok(e._regiEsVinculada(filaRegi('OPD1', ''), vinculados) === true,
     'REGI vacío usa OPD para quedar vinculada');
  ok(e._regiEsVinculada(filaRegi('OPD2', 'abc-123'), vinculados) === true,
     'REGI aprobado que matchea (case/espacios distintos) SÍ queda vinculada');
  ok(e._regiEsVinculada(filaRegi('OPD3', 'otro-codigo'), vinculados) === false,
     'REGI aprobado que no matchea ningún OPG no usa OPD aunque esté cargado');
}

/* ═══ 4 · El 🎯 de "matchea vigente" en la fila del pipeline real ═══════════ */
console.log('\n4 · _regiOpgMatcheaVigente (el 🎯 al lado del OPG en el pipeline real)');
{
  const e = cargar();
  e._regiPipeRows = null;   // REGI no se cargó todavía esta sesión
  ok(e._regiOpgMatcheaVigente('ABC-123') === false, 'sin datos de REGI cargados, no revienta: da false');
}
{
  const e = cargar();
  e._regiPipeRows = [ filaRegi('OPD1', 'abc-123'), filaRegi('OPD2', '') ];
  ok(e._regiOpgMatcheaVigente('ABC-123') === true, 'matchea contra una oportunidad REGI vigente');
  ok(e._regiOpgMatcheaVigente('opd2') === true, 'sin REGI aprobado, matchea contra el OPD vigente');
  ok(e._regiOpgMatcheaVigente('') === false, 'un OPG vacío nunca "matchea"');
  ok(e._regiOpgMatcheaVigente('otro') === false, 'un OPG que no está en ninguna REGI, no matchea');
}

/* ═══ 5 · El render oculta las vinculadas por defecto ═══════════════════════ */
console.log('\n5 · La vista REGI oculta por defecto lo que ya está vinculado');
{
  const e = cargar();
  e._pipelineData = [ filaReal('abc-123', {monto:4000}), filaReal('opd2', {monto:6000}) ];
  e._regiPipeRows = [
    filaRegi('OPD1', 'abc-123', {cliente:'Vinculada SA', montoArchivo:5000, monto:4000}),
    filaRegi('OPD2', '',        {cliente:'Sin REGI SA',  montoArchivo:7000, monto:6000}),
    filaRegi('OPD3', 'zzz-999', {cliente:'Suelta SA',    montoArchivo:3000, monto:3000, forecast:'Perdido'})
  ];
  e._regiMostrarVinculadas = false;
  e._renderRegiPipelineFromCache();
  const html = e._els['regi-pipe-body'].innerHTML;
  ok(html.indexOf('Vinculada SA') === -1, 'la oportunidad vinculada no aparece en la tabla', html);
  ok(html.indexOf('Sin REGI SA') === -1 && html.indexOf('Suelta SA') !== -1,
     'la oportunidad sin REGI vinculada por OPD se oculta, la suelta sigue visible');
  ok(e._els['regi-vinc-count'].textContent === '(2)', 'el contador incluye vínculos por REGI y OPD', e._els['regi-vinc-count'].textContent);
  ok(/USD 12\.000/.test(e._els['dash-total'].innerHTML || e._els['dash-total'].textContent),
     'el total usa siempre el monto del Excel, sin Perdido e incluyendo vinculadas');
  ok(/USD 3\.000/.test(e._els['dash-regi-perdidos'].textContent),
     'el KPI perdido usa el monto del Excel');
  ok(/USD 10\.000/.test(e._els['dash-regi-vinculados'].textContent),
     'el KPI vinculado suma el monto del pipeline Ceven');
}
{
  // Mismo escenario, con el toggle en "mostrar".
  const e = cargar();
  e._pipelineData = [ filaReal('abc-123') ];
  e._regiPipeRows = [
    filaRegi('OPD1', 'abc-123', {cliente:'Vinculada SA', montoArchivo:5000, monto:5000}),
    filaRegi('OPD2', 'zzz-999', {cliente:'Suelta SA',    montoArchivo:3000, monto:3000})
  ];
  e._regiMostrarVinculadas = true;
  e._renderRegiPipelineFromCache();
  const html = e._els['regi-pipe-body'].innerHTML;
  ok(html.indexOf('Vinculada SA') !== -1, 'con el toggle activado, la vinculada vuelve a aparecer');
  ok(/USD 8\.000/.test(e._els['dash-total'].innerHTML || e._els['dash-total'].textContent),
     'el total usa el Excel aunque cambie el toggle de vinculadas');
  // El detalle de la fila (badge/botones) solo se pinta con el grupo del
  // cliente desplegado — cevenPipeAbierto() arranca colapsado en una sesión
  // nueva. Se prueba _regiRowHTML() directo, sin depender de esa mecánica.
  const vinculada = e._regiPipeRows.filter(r => r.opd === 'OPD1')[0];
  ok(vinculada.vinculada === true, '_renderRegiPipelineFromCache marcó la fila como vinculada');
  const filaHtml = e._regiRowHTML(vinculada);
  ok(/✓ Vinculada/.test(filaHtml), 'y se muestra con la pastilla "✓ Vinculada" en vez de los botones de acción', filaHtml);
  ok(!/data-act="regi-copiar"/.test(filaHtml) && !/data-act="regi-editar"/.test(filaHtml),
     'una fila vinculada no ofrece "Copiar a Ceven" ni "Editar": ya tiene proyecto real');
}
{
  // Todo vinculado: el mensaje de vacío tiene que ser el bueno, no "limpiá filtros".
  const e = cargar();
  e._pipelineData = [ filaReal('abc-123') ];
  e._regiPipeRows = [ filaRegi('OPD1', 'abc-123', {cliente:'Vinculada SA'}) ];
  e._regiMostrarVinculadas = false;
  e._renderRegiPipelineFromCache();
  const html = e._els['regi-pipe-body'].innerHTML;
  ok(/ya están vinculadas/.test(html), 'con todo vinculado y oculto, el mensaje lo dice en vez de sonar a un filtro roto', html);
}

/* ═══ 6 · Copiar a Ceven prellena la cotización, sin tocar addToPipeline ═══ */
console.log('\n6 · _regiCopiarAPipeline prellena cliente/proyecto/OPG y avisa según haya REGI aprobado o no');
{
  const e = cargar();
  e._regiPipeRows = [ filaRegi('OPD1', 'REGI-777', {cliente:'Hospital Italiano', proyecto:'Sala Directorio', mesCierre:'2026-11'}) ];
  e._regiCopiarAPipeline('OPD1');
  ok(e._els['client'].value === 'Hospital Italiano', 'precarga el cliente');
  ok(e._els['proyecto'].value === 'Sala Directorio', 'precarga el proyecto');
  ok(e._els['opg'].value === 'REGI-777', 'precarga el OPG con el REGI ya aprobado — así matchea solo al agregar al pipeline');
  ok(e._calls.some(c => c[0] === 'goTo' && c[1] === 'quote'), 'navega al cotizador');
  ok(e._calls.some(c => c[0] === 'nuevaCotizacion'), 'arranca una cotización NUEVA (no una fila liviana sin cotización atrás)');
  ok(e._calls.some(c => c[0] === 'setMesCierre' && c[1] === '2026-11'), 'y sugiere el mes de cierre del REGI');
  ok(!/todavía no tiene REGI aprobado/.test(e._lastToast), 'el aviso no menciona falta de REGI cuando sí lo tiene');
}
{
  const e = cargar();
  e._regiPipeRows = [ filaRegi('OPD2', '', {cliente:'Cliente Nuevo', proyecto:'Proyecto X'}) ];
  e._regiCopiarAPipeline('OPD2');
  ok(e._els['opg'].value === 'OPD2', 'sin REGI aprobado, precarga OPD para vincular la oportunidad');
  ok(/OPG OPD2/.test(e._lastToast), 'el aviso informa que usa OPD como OPG', e._lastToast);
}
{
  const e = cargar();
  e._canUse = false;   // rol sin permiso para tocar el pipeline
  e._regiPipeRows = [ filaRegi('OPD3', 'X') ];
  e._regiCopiarAPipeline('OPD3');
  ok(e._calls.length === 0, 'sin permiso, no navega ni toca nada del cotizador', JSON.stringify(e._calls));
  ok(/no permite/.test(e._lastToast), 'y avisa que el rol no permite la acción');
}

/* ═══ 7 · Perdido REGI pide y guarda motivo ════════════════════════════════ */
console.log('\n7 · Perdido en REGI pide motivo y feedback');
{
  const e = cargar();
  let confirmar, patch;
  e._regiPipeRows = [filaRegi('OPD1', '', {forecast:'Commit'})];
  e.abrirModalMotivoPerdida = fn => { confirmar = fn; };
  e.cevenAuthedFetch = (url, opts) => {
    patch = JSON.parse(opts.body);
    return {then: fn => { fn(); return {catch: () => {}}; }};
  };
  e._regiCambiarForecast('OPD1', 'Perdido');
  ok(typeof confirmar === 'function', 'elegir Perdido abre el selector de motivo');
  ok(!patch, 'no actualiza REGI antes de confirmar el motivo');
  confirmar({motivo:'Por precio', detalle:'Oferta competidora'});
  ok(patch.forecast_override === 'Perdido' && patch.perdido_motivo.motivo === 'Por precio'
    && patch.perdido_motivo.detalle === 'Oferta competidora',
  'guarda forecast, motivo y feedback');
  ok(e._regiPipeRows[0].forecast === 'Perdido' && e._regiPipeRows[0].perdidoMotivo.motivo === 'Por precio',
     'actualiza el estado local al confirmar');
  ok(/regi-perdido-detalle/.test(e._regiMotivoPerdidaHTML(e._regiPipeRows[0])),
     'una fila perdida muestra el botón Ver motivo');
  e._regiCambiarForecast('OPD1', 'Commit');
  ok(patch.forecast_override === 'Commit' && patch.perdido_motivo === null,
     'al salir de Perdido elimina el motivo anterior');
}

console.log('\n' + (fallos
  ? ('✗ ' + fallos + ' de ' + corridas + ' fallaron\n')
  : ('✓ ' + corridas + '/' + corridas + ' OK\n')));
process.exit(fallos ? 1 : 0);
