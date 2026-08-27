#!/usr/bin/env node
/* ============================================================================
   check-pipe-regi-opg.js · Cotizadores Ceven
   ----------------------------------------------------------------------------
   Vínculo entre el pipeline real de Poly y el pipeline REGI (Deal
   Registration de HP), agregado el 27/08/2026 — ver docs/HISTORIAL.md de esa
   fecha. El matching es `pipeline.opg` contra `poly_regi_pipeline.regi` (el
   REGI YA APROBADO por HP, no `opd`): decisión explícita del usuario,
   aceptando que una oportunidad sin REGI aprobado no tiene con qué matchear
   todavía.

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

/* ═══ 3 · Una oportunidad sin REGI aprobado NUNCA puede quedar vinculada ═══ */
console.log('\n3 · Sin REGI aprobado (columna vacía) no hay con qué matchear, a propósito');
{
  const e = cargar();
  const vinculados = { 'ABC-123': 1 };
  ok(e._regiEsVinculada(filaRegi('OPD1', ''), vinculados) === false,
     'REGI vacío nunca es "vinculada", aunque el opd exista');
  ok(e._regiEsVinculada(filaRegi('OPD2', 'abc-123'), vinculados) === true,
     'REGI aprobado que matchea (case/espacios distintos) SÍ queda vinculada');
  ok(e._regiEsVinculada(filaRegi('OPD3', 'otro-codigo'), vinculados) === false,
     'REGI aprobado que no matchea ningún OPG, no vinculada');
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
  e._regiPipeRows = [ filaRegi('OPD1', 'abc-123') ];
  ok(e._regiOpgMatcheaVigente('ABC-123') === true, 'matchea contra una oportunidad REGI vigente');
  ok(e._regiOpgMatcheaVigente('') === false, 'un OPG vacío nunca "matchea"');
  ok(e._regiOpgMatcheaVigente('otro') === false, 'un OPG que no está en ninguna REGI, no matchea');
}

/* ═══ 5 · El render oculta las vinculadas por defecto ═══════════════════════ */
console.log('\n5 · La vista REGI oculta por defecto lo que ya está vinculado');
{
  const e = cargar();
  e._pipelineData = [ filaReal('abc-123') ];
  e._regiPipeRows = [
    filaRegi('OPD1', 'abc-123', {cliente:'Vinculada SA', monto:5000}),
    filaRegi('OPD2', '',        {cliente:'Sin REGI SA',  monto:7000}),
    filaRegi('OPD3', 'zzz-999', {cliente:'Suelta SA',    monto:3000})
  ];
  e._regiMostrarVinculadas = false;
  e._renderRegiPipelineFromCache();
  const html = e._els['regi-pipe-body'].innerHTML;
  ok(html.indexOf('Vinculada SA') === -1, 'la oportunidad vinculada no aparece en la tabla', html);
  ok(html.indexOf('Sin REGI SA') !== -1 && html.indexOf('Suelta SA') !== -1,
     'las otras dos (sin REGI y sin match) siguen viéndose');
  ok(e._els['regi-vinc-count'].textContent === '(1)', 'el contador del toggle dice cuántas hay ocultas', e._els['regi-vinc-count'].textContent);
  ok(/USD 10\.000/.test(e._els['dash-total'].innerHTML || e._els['dash-total'].textContent),
     'el total del dashboard suma SOLO lo visible (7.000 + 3.000), no lo vinculado');
}
{
  // Mismo escenario, con el toggle en "mostrar".
  const e = cargar();
  e._pipelineData = [ filaReal('abc-123') ];
  e._regiPipeRows = [
    filaRegi('OPD1', 'abc-123', {cliente:'Vinculada SA', monto:5000}),
    filaRegi('OPD2', 'zzz-999', {cliente:'Suelta SA',    monto:3000})
  ];
  e._regiMostrarVinculadas = true;
  e._renderRegiPipelineFromCache();
  const html = e._els['regi-pipe-body'].innerHTML;
  ok(html.indexOf('Vinculada SA') !== -1, 'con el toggle activado, la vinculada vuelve a aparecer');
  ok(/USD 8\.000/.test(e._els['dash-total'].innerHTML || e._els['dash-total'].textContent),
     'con el toggle en "mostrar", el total SÍ vuelve a incluir la vinculada');
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
  ok(e._els['opg'].value === '', 'sin REGI aprobado, el OPG queda vacío (no hay nada para prellenar)');
  ok(/todavía no tiene REGI aprobado/.test(e._lastToast), 'el aviso explica que hay que completar el OPG cuando HP lo apruebe', e._lastToast);
}
{
  const e = cargar();
  e._canUse = false;   // rol sin permiso para tocar el pipeline
  e._regiPipeRows = [ filaRegi('OPD3', 'X') ];
  e._regiCopiarAPipeline('OPD3');
  ok(e._calls.length === 0, 'sin permiso, no navega ni toca nada del cotizador', JSON.stringify(e._calls));
  ok(/no permite/.test(e._lastToast), 'y avisa que el rol no permite la acción');
}

console.log('\n' + (fallos
  ? ('✗ ' + fallos + ' de ' + corridas + ' fallaron\n')
  : ('✓ ' + corridas + '/' + corridas + ' OK\n')));
process.exit(fallos ? 1 : 0);
