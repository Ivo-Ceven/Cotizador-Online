#!/usr/bin/env node
/* ============================================================================
   check-pipe-regi-stats.js · Cotizadores Ceven
   ----------------------------------------------------------------------------
   "📊 Estadísticas REGI" (27/08/2026, sobre el vínculo por OPG del mismo día
   — ver docs/HISTORIAL.md): compara, para cada oportunidad ya VINCULADA, el
   monto/fecha que carga HP en su Excel contra lo que Ceven tiene cargado de
   verdad — KPI, gráfico HP-vs-Ceven, tablas por mes/trimestre y slicers
   interactivos (período + estado). Desde 09/2026 es una vista propia del
   navbar (#p-regi-stats), ya no una opción del selector "Vista".

   Corre las funciones REALES de src/poly/js/pipeline-regi.js. Mismo harness
   `vm` que scripts/check-pipe-regi-opg.js.

   Uso:  node scripts/check-pipe-regi-stats.js
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

function nodo(){
  return { _html: '', textContent: '', value: '', style: {}, addEventListener: function(){} };
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
    'opg':                    { value: '' },
    'archive-month-sel':      { value: '__regi_stats' },
    'stats-empty':            nodo(),
    'stats-body':             nodo(),
    'stats-filtros':          Object.assign(nodo(), { contains: () => false }),
    'stats-chart':            nodo(),
    'stats-kpi-monto':        nodo(),
    'stats-kpi-monto-sub':    nodo(),
    'stats-kpi-fecha':        nodo(),
    'stats-kpi-fecha-sub':    nodo(),
    'stats-mes-body':         nodo(),
    'stats-q-body':           nodo(),
    'stats-pick':             nodo(),
    'stats-compare':          nodo()
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
    _mesLabelPoly: mk => {
      var p = String(mk||'').split('-');
      if(p.length !== 2) return mk;
      var meses = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
      var m = meses[parseInt(p[1],10)-1];
      return m ? (m+' '+p[0]) : mk;
    },
    cevenEstadoLabel: e => e || 'Cotizado',
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

// Fila real de pipeline mínima.
const filaReal = (opg, monto, mesCierre, extra) =>
  Object.assign({ id: Math.random(), opg: opg, monto: monto, mesCierre: mesCierre || '', estado: 'Cotizado' }, extra || {});

// Oportunidad REGI mínima (shape de _regiRowToPipeRow).
const filaRegi = (opd, regi, montoArchivo, mesCierre, extra) => Object.assign({
  opd: opd, regi: regi || '', proyecto: 'Proyecto ' + opd, cliente: 'Cliente ' + opd,
  primaryPartner: '', drExpiration: '', mesCierre: mesCierre || '',
  montoArchivo: montoArchivo, productosMonto: 0, monto: montoArchivo, forecast: ''
}, extra || {});

// Arma un escenario con pares ya cruzados (mismo OPG/regi) y lo carga en el ctx.
function conPares(e, pares){
  e._pipelineData = pares.map(function(p){ return p.ceven; });
  e._regiPipeRows = pares.map(function(p){ return p.hp; });
}

console.log('\nEstadísticas REGI: HP vs. Ceven · src/poly/js/pipeline-regi.js\n');

/* ═══ 1 · Diferencia de monto: ceven − hp, sobre el monto CRUDO de HP ══════ */
console.log('1 · _regiDiffMonto: ceven − hp.montoArchivo, negativo si Ceven pronostica menos');
{
  const e = cargar();
  ok(e._regiDiffMonto({ceven:{monto:8000}, hp:{montoArchivo:10000}}) === -2000,
     'Ceven por debajo de HP da negativo');
  ok(e._regiDiffMonto({ceven:{monto:12000}, hp:{montoArchivo:10000}}) === 2000,
     'Ceven por encima de HP da positivo');
  ok(e._regiDiffMonto({ceven:{monto:5000}, hp:{monto:999999, montoArchivo:5000}}) === 0,
     'usa montoArchivo de HP, NO el .monto ya blendeado con productos del carrito REGI', '');
}

/* ═══ 2 · Diferencia de fecha, en meses ═════════════════════════════════════ */
console.log('\n2 · _regiDiffFechaMeses: hp − ceven, negativo si Ceven pronostica MÁS LEJOS');
{
  const e = cargar();
  ok(e._regiDiffFechaMeses({hp:{mesCierre:'2026-08'}, ceven:{mesCierre:'2026-11'}}) === -3,
     'Ceven 3 meses más tarde que HP da -3');
  ok(e._regiDiffFechaMeses({hp:{mesCierre:'2026-11'}, ceven:{mesCierre:'2026-08'}}) === 3,
     'Ceven 3 meses más temprano que HP da +3');
  ok(e._regiDiffFechaMeses({hp:{mesCierre:'2026-08'}, ceven:{mesCierre:'2026-08'}}) === 0,
     'mismo mes, 0');
  ok(e._regiDiffFechaMeses({hp:{mesCierre:''}, ceven:{mesCierre:'2026-08'}}) === null,
     'sin fecha de HP, no hay con qué restar: null, no NaN');
  ok(e._regiDiffFechaMeses({hp:{mesCierre:'2026-08'}, ceven:{mesCierre:''}}) === null,
     'sin fecha de Ceven, lo mismo');
}

/* ═══ 3 · Trimestres ════════════════════════════════════════════════════════ */
console.log('\n3 · _regiTrimestreKey/_regiTrimestreLabel en los bordes del año');
{
  const e = cargar();
  ok(e._regiTrimestreKey('2026-01') === '2026-Q1', 'enero es Q1');
  ok(e._regiTrimestreKey('2026-03') === '2026-Q1', 'marzo sigue siendo Q1');
  ok(e._regiTrimestreKey('2026-04') === '2026-Q2', 'abril ya es Q2');
  ok(e._regiTrimestreKey('2026-12') === '2026-Q4', 'diciembre es Q4');
  ok(e._regiTrimestreKey('') === '', 'sin mes, clave vacía (no "NaN-QNaN")');
  ok(e._regiTrimestreLabel('2026-Q3') === 'Q3 2026', 'la etiqueta se lee "Q3 2026"');
}

/* ═══ 4 · Pares vinculados: REGI o OPD si falta REGI ═══════════════════════ */
console.log('\n4 · _regiPairsVinculadas: vincula por REGI aprobado u OPD sin REGI');
{
  const e = cargar();
  e._pipelineData = [ filaReal('abc-1', 1000), filaReal('opd2', 2000), filaReal('', 500) ];
  e._regiPipeRows = [
    filaRegi('OPD1', 'abc-1', 1000),      // matchea
    filaRegi('OPD2', '', 2000),           // sin REGI aprobado: matchea por OPD
    filaRegi('OPD3', 'zzz-9', 3000)       // REGI aprobado pero ningún OPG lo tiene
  ];
  const pares = e._regiPairsVinculadas();
  ok(pares.length === 2, 'entran el par por REGI y el par por OPD', JSON.stringify(pares.map(p=>p.hp.opd)));
  ok(pares[0].hp.opd === 'OPD1', 'y es el que matcheó de verdad');
  ok(pares[1].hp.opd === 'OPD2', 'la fila sin REGI entra con su OPD');
}

/* ═══ 5 · KPI totales ═══════════════════════════════════════════════════════ */
console.log('\n5 · _regiKpisTotales: suma de monto, PROMEDIO de fecha (no suma)');
{
  const e = cargar();
  const pares = [
    { hp:{montoArchivo:10000, mesCierre:'2026-08'}, ceven:{monto:8000,  mesCierre:'2026-10'} },  // diffMonto -2000, diffFecha -2
    { hp:{montoArchivo:5000,  mesCierre:'2026-09'}, ceven:{monto:6000,  mesCierre:'2026-09'} }    // diffMonto +1000, diffFecha 0
  ];
  const k = e._regiKpisTotales(pares);
  ok(k.n === 2, 'cuenta los pares');
  ok(k.diffMonto === -1000, 'SUMA las diferencias de monto (-2000 + 1000)', k.diffMonto);
  ok(k.nFecha === 2, 'las dos tienen fecha en los dos lados');
  ok(k.diffFechaProm === -1, 'PROMEDIA la diferencia de fecha ((-2 + 0) / 2), no la suma', k.diffFechaProm);
}
{
  const e = cargar();
  const pares = [{ hp:{montoArchivo:1000, mesCierre:''}, ceven:{monto:1000, mesCierre:'2026-08'} }];
  const k = e._regiKpisTotales(pares);
  ok(k.diffFechaProm === null, 'sin ningún par con fecha en los dos lados, el promedio es null (no 0 ni NaN)');
}

/* ═══ 6 · Agregación por período (mes y trimestre) ══════════════════════════ */
console.log('\n6 · _regiAgregarPorPeriodo: agrupa por keyFn(hp.mesCierre), "sin fecha" siempre al final');
{
  const e = cargar();
  const pares = [
    { hp:{montoArchivo:1000, mesCierre:'2026-08'}, ceven:{monto:1200, mesCierre:'2026-08'} },
    { hp:{montoArchivo:2000, mesCierre:'2026-08'}, ceven:{monto:1800, mesCierre:'2026-09'} },
    { hp:{montoArchivo:500,  mesCierre:'2026-01'}, ceven:{monto:500,  mesCierre:'2026-01'} },
    { hp:{montoArchivo:900,  mesCierre:''},        ceven:{monto:900,  mesCierre:'2026-05'} }
  ];
  const porMes = e._regiAgregarPorPeriodo(pares, mk => mk || '', e._mesLabelPoly);
  ok(porMes.length === 3, '3 buckets: Ene, Ago, sin fecha', JSON.stringify(porMes.map(g=>g.label)));
  ok(porMes[0].key === '2026-01', 'ordenado cronológicamente primero', porMes[0].key);
  ok(porMes[1].key === '2026-08' && porMes[1].n === 2, 'agosto junta las dos oportunidades de HP de ese mes', JSON.stringify(porMes[1]));
  ok(porMes[1].diffMonto === 200 + (-200), 'suma diffMonto del bucket (200 + -200 = 0)', porMes[1].diffMonto);
  ok(porMes[porMes.length-1].label === 'Sin fecha (HP)', 'el bucket sin fecha queda AL FINAL, no primero', JSON.stringify(porMes.map(g=>g.label)));

  const porQ = e._regiAgregarPorPeriodo(pares, e._regiTrimestreKey, e._regiTrimestreLabel);
  ok(porQ.length === 3, '3 buckets también por trimestre (Q1 y Q3 de 2026 + sin fecha)', JSON.stringify(porQ.map(g=>g.label)));
  ok(porQ[1].label === 'Q3 2026' && porQ[1].n === 2, 'Q3 2026 junta las dos oportunidades de agosto', JSON.stringify(porQ[1]));
}

/* ═══ 7 · Render completo: KPI, tablas, dropdown y comparador ═══════════════ */
console.log('\n7 · renderRegiStats / _renderRegiStatsFromCache pintan lo que corresponde');
{
  const e = cargar();
  conPares(e, [
    { hp: filaRegi('OPD1', 'abc-1', 10000, '2026-08'), ceven: filaReal('abc-1', 8000, '2026-10', {cliente:'Hospital Italiano', proyecto:'Sala A'}) },
    { hp: filaRegi('OPD2', 'zzz-9', 5000,  '2026-08'), ceven: filaReal('zzz-9', 6000, '2026-08', {cliente:'Banco Galicia',    proyecto:'Sala B'}) }
  ]);
  e.renderRegiStats();
  ok(e._els['stats-empty'].style.display === 'none', 'con pares, el mensaje de vacío se oculta');
  ok(e._els['stats-body'].style.display === 'block', 'y el cuerpo se muestra');
  ok(/-USD 1\.000/.test(e._els['stats-kpi-monto'].textContent), 'KPI monto: suma -2000+1000 = -1000, con signo', e._els['stats-kpi-monto'].textContent);
  ok(/1\.0 meses después/.test(e._els['stats-kpi-fecha'].textContent), 'KPI fecha redactado: promedio -1.0 = "1.0 meses después"', e._els['stats-kpi-fecha'].textContent);
  ok(/2 oportunidades/.test(e._els['stats-kpi-monto-sub'].textContent)
     && /Ceven USD/.test(e._els['stats-kpi-monto-sub'].textContent)
     && /HP USD/.test(e._els['stats-kpi-monto-sub'].textContent),
     'la sub-línea son los dos totales crudos + el conteo, sin texto interpretativo', e._els['stats-kpi-monto-sub'].textContent);
  ok(e._els['stats-mes-body'].innerHTML.indexOf('Ago 2026') !== -1, 'la tabla por mes tiene la fila de agosto');
  ok(e._els['stats-q-body'].innerHTML.indexOf('Q3 2026') !== -1, 'la tabla por trimestre tiene Q3 2026');
  ok(e._els['stats-pick'].innerHTML.indexOf('Hospital Italiano') !== -1 && e._els['stats-pick'].innerHTML.indexOf('Banco Galicia') !== -1,
     'el desplegable lista las dos oportunidades vinculadas');

  e._regiStatsPintarComparacion('OPD1');
  const cmp = e._els['stats-compare'].innerHTML;
  ok(/USD 10\.000/.test(cmp) && /USD 8\.000/.test(cmp), 'el comparador muestra el monto de HP y de Ceven para esa oportunidad', cmp);
  ok(/-USD 2\.000/.test(cmp), 'y la diferencia de monto de ESA oportunidad puntual (8000-10000=-2000)');
  ok(/-2\.0 m/.test(cmp), 'y la diferencia de fecha (agosto a octubre = -2.0 meses), con 1 decimal');
  ok(cmp.indexOf('Cotizaciones de Ceven para este REGI') === -1, 'un REGI con UNA sola cotización no muestra desglose');
}
{
  // Sin ningún par vinculado: mensaje de vacío, nada de tablas ni KPI rotos.
  const e = cargar();
  conPares(e, []);
  e.renderRegiStats();
  ok(e._els['stats-empty'].style.display === 'block', 'sin pares, se muestra el mensaje de vacío');
  ok(e._els['stats-body'].style.display === 'none', 'y se oculta el cuerpo con los KPI/tablas');
  ok(/vinculada/.test(e._els['stats-empty'].textContent), 'el mensaje explica que hace falta vincular primero', e._els['stats-empty'].textContent);
}
{
  // Sin selección en el desplegable, el comparador queda vacío (no explota).
  const e = cargar();
  conPares(e, [{ hp: filaRegi('OPD1', 'abc-1', 1000, '2026-08'), ceven: filaReal('abc-1', 1000, '2026-08') }]);
  e.renderRegiStats();
  e._regiStatsPintarComparacion('');
  ok(e._els['stats-compare'].innerHTML === '', 'sin oportunidad elegida, el panel de comparación queda vacío');
  e._regiStatsPintarComparacion('NO-EXISTE');
  ok(e._els['stats-compare'].innerHTML === '', 'un opd que no está en los pares tampoco rompe nada');
}

/* ═══ 8 · Estadísticas es una vista propia del navbar, NO del selector "Vista" ═ */
console.log('\n8 · Estadísticas migró del selector "Vista" al navbar (p-regi-stats)');
{
  // cevenRegiToggleVista solo conoce el pipeline normal y "__regi": nunca
  // manosea #pipe-stats (que ya no existe) ni el dashboard por Estadísticas.
  const e = cargar();
  e._els['pipe-table-normal'] = { style: {} };
  e._els['pipe-table-regi'] = { style: {} };
  e._els['regi-vinc-wrap'] = { style: {} };
  e.cevenRegiToggleVista('__regi');
  ok(e._els['pipe-table-normal'].style.display === 'none', '"__regi" oculta el pipeline normal');
  ok(e._els['pipe-table-regi'].style.display === '', 'y muestra la tabla REGI');
  ok(e._els['regi-vinc-wrap'].style.display === '', '"Mostrar vinculadas" aplica en la tabla REGI');
}
{
  const src = fs.readFileSync(path.join(ROOT, 'src/poly/js/pipeline-regi.js'), 'utf8');
  ok(src.indexOf('__regi_stats') === -1, 'ya no queda ninguna referencia a __regi_stats en pipeline-regi.js');
  ok(src.indexOf("getElementById('pipe-stats')") === -1, 'cevenRegiToggleVista ya no toca #pipe-stats');
  ok(src.indexOf("getElementById('p-regi-stats')") !== -1, 'renderRegiStats mira #p-regi-stats para saber si sigue en pantalla');

  const view = fs.readFileSync(path.join(ROOT, 'src/poly/js/pipeline-view.js'), 'utf8');
  ok(view.indexOf('__regi_stats') === -1, 'el selector "Vista" ya no ofrece "__regi_stats"');
  ok(view.indexOf('__regi') !== -1, 'pero sigue ofreciendo "🎯 Pipeline REGI" (__regi)');

  const brand = fs.readFileSync(path.join(ROOT, 'src/poly/brand.js'), 'utf8');
  ok(/view:\s*'regi-stats'/.test(brand), 'poly/brand.js declara el navItem view:"regi-stats"');

  const html = fs.readFileSync(path.join(ROOT, 'src/poly/index.html'), 'utf8');
  ok(html.indexOf('id="p-regi-stats"') !== -1, 'poly/index.html tiene el .pg #p-regi-stats');
  ok(html.indexOf('id="pipe-stats"') === -1, 'y ya no tiene el viejo #pipe-stats');

  const uicore = fs.readFileSync(path.join(ROOT, 'src/shared/ui-core.js'), 'utf8');
  ok(/n === 'regi-stats'.*renderRegiStats/.test(uicore), '_navApply llama renderRegiStats() al entrar a "regi-stats"');
}

/* ═══ 9 · Un mismo REGI en VARIAS cotizaciones de Ceven: impacto agregado ═══ */
console.log('\n9 · _regiCevenAgg / _regiPairsVinculadas agregan las N cotizaciones del mismo OPG');
{
  // Dos cotizaciones activas con el mismo OPG, meses de cierre distintos.
  const e = cargar();
  e._pipelineData = [
    filaReal('m-1', 8000,  '2026-10', {cliente:'Cli X', proyecto:'Proy A', estado:'Cotizado'}),
    filaReal('m-1', 12000, '2026-12', {cliente:'Cli X', proyecto:'Proy B', estado:'Negociacion'})
  ];
  e._regiPipeRows = [ filaRegi('OPD9', 'm-1', 25000, '2026-11') ];
  const pares = e._regiPairsVinculadas();
  ok(pares.length === 1, 'las dos filas del mismo OPG dan UN par (no dos)');
  const ag = pares[0].ceven;
  ok(ag.nCotiz === 2 && ag.nActivas === 2, 'el par sabe que agrega 2 cotizaciones', JSON.stringify({nCotiz:ag.nCotiz, nActivas:ag.nActivas}));
  ok(ag.monto === 20000, 'monto agregado = suma de las dos (8000 + 12000)', ag.monto);
  ok(e._regiDiffMonto(pares[0]) === -5000, 'diff de monto usa el agregado: 20000 − 25000 = -5000', e._regiDiffMonto(pares[0]));
  // Promedio de meses PONDERADO POR MONTO: (8000·oct + 12000·dic) / 20000 ≈ 24322.2
  const df = e._regiDiffFechaMeses(pares[0]);
  ok(Math.abs(df - (-0.2)) < 1e-6, 'diff de fecha usa el promedio ponderado (nov − 24322.2 ≈ -0.2)', df);
}
{
  // Una activa + una Perdida con el mismo OPG: la Perdida no suma ni pondera.
  const e = cargar();
  e._pipelineData = [
    filaReal('m-2', 10000, '2026-09', {cliente:'C', proyecto:'P1', estado:'Cotizado'}),
    filaReal('m-2', 4000,  '2026-06', {cliente:'C', proyecto:'P2', estado:'Perdido'})
  ];
  e._regiPipeRows = [ filaRegi('OPD10', 'm-2', 12000, '2026-09') ];
  const ag = e._regiPairsVinculadas()[0].ceven;
  ok(ag.monto === 10000, 'monto agregado excluye la cotización Perdida (queda 10000, no 14000)', ag.monto);
  ok(ag.montoTotal === 14000 && ag.nExcluidas === 1, 'igual guarda el total crudo y cuántas quedaron afuera');
  ok(e._regiDiffFechaMeses(e._regiPairsVinculadas()[0]) === 0,
     'el promedio de fecha ignora el mes de la Perdida (solo cuenta 2026-09 = el de HP)');
}
{
  // El comparador de una oportunidad multi-cotización: agregado + desglose.
  const e = cargar();
  e._pipelineData = [
    filaReal('m-1', 8000,  '2026-10', {cliente:'Cli X', proyecto:'Proy A', estado:'Cotizado'}),
    filaReal('m-1', 12000, '2026-12', {cliente:'Cli X', proyecto:'Proy B', estado:'Negociacion'})
  ];
  e._regiPipeRows = [ filaRegi('OPD9', 'm-1', 25000, '2026-11') ];
  e.renderRegiStats();
  ok(/· 2 cotiz\./.test(e._els['stats-pick'].innerHTML),
     'el desplegable marca la oportunidad con más de una cotización', e._els['stats-pick'].innerHTML);
  ok(/Ceven USD 20\.000/.test(e._els['stats-kpi-monto-sub'].textContent)
     && /HP USD 25\.000/.test(e._els['stats-kpi-monto-sub'].textContent),
     'la sub-línea del KPI muestra el total agregado de Ceven (20.000) y el de HP (25.000)',
     e._els['stats-kpi-monto-sub'].textContent);
  e._regiStatsPintarComparacion('OPD9');
  const cmp = e._els['stats-compare'].innerHTML;
  ok(/USD 20\.000/.test(cmp), 'la columna Ceven muestra el monto agregado (20.000)', cmp);
  ok(/≈/.test(cmp), 'el mes de Ceven se marca como aproximado (promedio ponderado)');
  ok(/Cotizaciones de Ceven para este REGI \(2\)/.test(cmp), 'hay un bloque de desglose con las 2 cotizaciones');
  ok(cmp.indexOf('Proy A') !== -1 && cmp.indexOf('Proy B') !== -1, 'el desglose lista cada cotización por proyecto');
}

/* ═══ 10 · Oportunidad ya facturada: compara contra lo facturado, no 0 ═════ */
console.log('\n10 · una oportunidad facturada usa el monto realizado, no USD 0 (fix 09/2026)');
{
  // Una sola cotización, estado Facturado.
  const e = cargar();
  e._pipelineData = [ filaReal('f-1', 9000, '2026-07', {cliente:'Cli F', proyecto:'Proy F', estado:'Facturado'}) ];
  e._regiPipeRows = [ filaRegi('OPD11', 'f-1', 10000, '2026-08') ];
  const par = e._regiPairsVinculadas()[0];
  ok(par.ceven.monto === 0, 'la posición viva sigue siendo 0 (Facturado no es posición viva)');
  ok(par.ceven.montoFacturado === 9000 && par.ceven.nFacturadas === 1,
     '_regiCevenAgg guarda el monto facturado aparte', JSON.stringify({f:par.ceven.montoFacturado, n:par.ceven.nFacturadas}));
  ok(e._regiDiffMonto(par) === -1000,
     'la diferencia usa lo facturado: 9000 − 10000 = -1000 (no -10000)', e._regiDiffMonto(par));
  e.renderRegiStats();
  e._regiStatsPintarComparacion('OPD11');
  const cmp = e._els['stats-compare'].innerHTML;
  ok(/USD 9\.000/.test(cmp), 'el comparador muestra el monto facturado (9.000), no USD 0', cmp);
  ok(/facturado/.test(cmp), 'y lo rotula como facturado');
  ok(/-USD 1\.000/.test(cmp), 'la diferencia puntual de esa oportunidad es -1.000');
}
{
  // Perdido NO cae en el fallback: ahí el 0 es la información.
  const e = cargar();
  e._pipelineData = [ filaReal('p-1', 9000, '2026-07', {cliente:'Cli P', proyecto:'Proy P', estado:'Perdido'}) ];
  e._regiPipeRows = [ filaRegi('OPD12', 'p-1', 10000, '2026-08') ];
  const par = e._regiPairsVinculadas()[0];
  ok(e._regiDiffMonto(par) === -10000,
     'una oportunidad perdida sigue comparando contra 0 (0 − 10000 = -10000)', e._regiDiffMonto(par));
}
{
  // Mixto: hay una activa → gana la posición viva, la facturada no se suma.
  const e = cargar();
  e._pipelineData = [
    filaReal('mx-1', 4000, '2026-09', {cliente:'C', proyecto:'Activa',    estado:'Cotizado'}),
    filaReal('mx-1', 6000, '2026-05', {cliente:'C', proyecto:'Facturada', estado:'Facturado'})
  ];
  e._regiPipeRows = [ filaRegi('OPD13', 'mx-1', 12000, '2026-09') ];
  const par = e._regiPairsVinculadas()[0];
  ok(e._regiDiffMonto(par) === 4000 - 12000,
     'con posición viva, la comparación la usa a ella (4000), no 4000+6000', e._regiDiffMonto(par));
}

/* ═══ 11 · Sin recorte de meses: TODA oportunidad vinculada entra ═══════════ */
console.log('\n11 · _regiPairsVinculadas ya no recorta por fecha (jun/jul vuelven a entrar)');
{
  const e = cargar();
  e._pipelineData = [
    filaReal('c-may', 500,  '2026-05', {estado:'Cotizado'}),
    filaReal('c-jun', 1000, '2026-06', {estado:'Cotizado'}),
    filaReal('c-jul', 2000, '2026-07', {estado:'Cotizado'}),
    filaReal('c-ago', 3000, '2026-08', {estado:'Cotizado'}),
    filaReal('c-sin', 4000, '',        {estado:'Cotizado'})
  ];
  e._regiPipeRows = [
    filaRegi('OPDMAY', 'c-may', 500,  '2026-05'),
    filaRegi('OPDJUN', 'c-jun', 1000, '2026-06'),
    filaRegi('OPDJUL', 'c-jul', 2000, '2026-07'),
    filaRegi('OPDAGO', 'c-ago', 3000, '2026-08'),
    filaRegi('OPDSIN', 'c-sin', 4000, '')
  ];
  const opds = e._regiPairsVinculadas().map(p => p.hp.opd).sort();
  ok(opds.length === 5, 'entran las 5 (no hay cutoff)', JSON.stringify(opds));
  ok(opds.indexOf('OPDMAY') !== -1 && opds.indexOf('OPDJUN') !== -1 && opds.indexOf('OPDJUL') !== -1,
     'mayo, junio y julio ya NO se descartan');
}

/* ═══ 12 · Slicers PowerBI: período (mes/trimestre) y estado de Ceven ══════ */
console.log('\n12 · _regiStatsParPasa / _regiStatsChartData / _regiFechaTxt');
{
  const e = cargar();
  // Texto redactado del desfasaje de fecha, sin signos que interpretar.
  ok(e._regiFechaTxt(null).txt === '—', 'sin dato: guión');
  ok(e._regiFechaTxt(0).txt === 'en fecha', 'diff 0: "en fecha"');
  ok(e._regiFechaTxt(1.8).txt === '1.8 meses antes', 'diff +1.8 (HP más lejos): Ceven cierra "antes"');
  ok(e._regiFechaTxt(-2).txt === '2.0 meses después', 'diff -2 (Ceven más lejos): "después"');
  ok(e._regiFechaTxt(1).txt === '1.0 meses antes', 'siempre con decimal: "1.0 meses"');
}
{
  const e = cargar();
  conPares(e, [
    { hp: filaRegi('OPA', 'a', 1000, '2026-08'), ceven: filaReal('a', 1200, '2026-08', {estado:'Cotizado'}) },
    { hp: filaRegi('OPB', 'b', 2000, '2026-09'), ceven: filaReal('b', 1500, '2026-09', {estado:'Negociacion'}) },
    { hp: filaRegi('OPC', 'c', 3000, '2026-11'), ceven: filaReal('c', 4000, '2026-11', {estado:'Facturado'}) }
  ]);
  const all = e._regiPairsVinculadas();

  // Sin filtros: pasan las 3.
  ok(all.filter(e._regiStatsParPasa).length === 3, 'sin slicers, pasan todas');

  // Filtro por mes: solo 2026-09.
  e.window._regiStatsFiltros = { meses: { '2026-09': 1 }, estados: {} };
  const soloSep = all.filter(e._regiStatsParPasa);
  ok(soloSep.length === 1 && soloSep[0].hp.opd === 'OPB', 'slicer de mes deja solo septiembre', JSON.stringify(soloSep.map(p=>p.hp.opd)));

  // Filtro por estado Ceven: solo Facturado.
  e.window._regiStatsFiltros = { meses: {}, estados: { 'Facturado': 1 } };
  const soloFact = all.filter(e._regiStatsParPasa);
  ok(soloFact.length === 1 && soloFact[0].hp.opd === 'OPC', 'slicer de estado deja solo la facturada', JSON.stringify(soloFact.map(p=>p.hp.opd)));

  // Dimensiones ofrecidas.
  e.window._regiStatsFiltros = { meses: {}, estados: {} };
  const dims = e._regiStatsDimensiones(all);
  ok(dims.meses.join(',') === '2026-08,2026-09,2026-11', 'los meses del slicer salen ordenados', dims.meses.join(','));
  ok(dims.estados.indexOf('Facturado') !== -1 && dims.estados.indexOf('Cotizado') !== -1, 'los estados presentes están todos');

  // Datos del gráfico: HP vs Ceven por mes.
  const chart = e._regiStatsChartData(all);
  ok(chart.length === 3, 'un grupo por mes', JSON.stringify(chart.map(g=>g.key)));
  ok(chart[0].hp === 1000 && chart[0].ceven === 1200, 'agosto: HP 1000 / Ceven 1200', JSON.stringify(chart[0]));
  ok(chart[2].hp === 3000 && chart[2].ceven === 4000, 'la facturada aporta su monto facturado al gráfico (4000)', JSON.stringify(chart[2]));
}
{
  // Render completo con un slicer activo: KPI y tabla ven el subconjunto.
  const e = cargar();
  conPares(e, [
    { hp: filaRegi('OPX', 'x', 10000, '2026-08'), ceven: filaReal('x', 9000, '2026-08', {estado:'Cotizado'}) },
    { hp: filaRegi('OPY', 'y', 20000, '2026-12'), ceven: filaReal('y', 25000, '2026-12', {estado:'Cotizado'}) }
  ]);
  e.window._regiStatsFiltros = { meses: { '2026-08': 1 }, estados: {} };
  e.renderRegiStats();
  ok(/1 de 2 oportunidades \(filtrado\)/.test(e._els['stats-kpi-monto-sub'].textContent),
     'el KPI avisa que es 1 de 2 (filtrado)', e._els['stats-kpi-monto-sub'].textContent);
  ok(/-USD 1\.000/.test(e._els['stats-kpi-monto'].textContent),
     'y el número es el del subconjunto: 9000 − 10000 = -1000', e._els['stats-kpi-monto'].textContent);
  ok(e._els['stats-mes-body'].innerHTML.indexOf('Dic 2026') === -1
     && e._els['stats-mes-body'].innerHTML.indexOf('Ago 2026') !== -1,
     'la tabla por mes solo muestra agosto');
  ok(e._els['stats-chart'].innerHTML.indexOf('Ago 2026') !== -1 && e._els['stats-chart'].innerHTML.indexOf('Dic 2026') === -1,
     'el gráfico solo tiene la barra de agosto');
  // El desplegable "Comparar una oportunidad" NO se filtra: lista las dos.
  ok(e._els['stats-pick'].innerHTML.indexOf('OPX') !== -1 && e._els['stats-pick'].innerHTML.indexOf('OPY') !== -1,
     'el comparador uno-a-uno sigue listando TODAS las oportunidades');
}

/* ═══ 13 · Parte A: "REGI CEVEN" del header ahora incluye las Facturadas ════ */
console.log('\n13 · _regiCevenMontoKpi / _regiTotalesGlobales: "REGI CEVEN" = activo + facturado, sin Perdido');
{
  const e = cargar();
  e._pipelineData = [
    filaReal('m1', 4000, '2026-09', {estado:'Cotizado'}),
    filaReal('m1', 6000, '2026-05', {estado:'Facturado'}),
    filaReal('m1', 1000, '2026-04', {estado:'Perdido'})
  ];
  e._regiPipeRows = [ filaRegi('OPD1', 'm1', 20000, '2026-09') ];
  const t = e._regiTotalesGlobales(e._regiPipeRows);
  ok(t.vinculadosCeven === 10000, 'REGI CEVEN = activa 4000 + facturada 6000 (la Perdida afuera)', t.vinculadosCeven);
  ok(t.perdidas === 0, 'no es "perdida": no están TODAS sus cotizaciones en Perdido', t.perdidas);
  ok(t.vinculadosHP === 20000, 'REGI vinculados = monto HP de la oportunidad linkeada', t.vinculadosHP);
  ok(e._regiCevenMontoKpi(e._regiCevenAgg(e._pipelineData)) === 10000, '_regiCevenMontoKpi = monto + montoFacturado');
}
{
  const e = cargar();
  e._pipelineData = [ filaReal('m2', 9000, '2026-07', {estado:'Facturado'}) ];
  e._regiPipeRows = [ filaRegi('OPD2', 'm2', 10000, '2026-08') ];
  ok(e._regiTotalesGlobales(e._regiPipeRows).vinculadosCeven === 9000,
     'un REGI todo-Facturado aporta su monto facturado a REGI CEVEN (antes daba 0)');
}

/* ═══ 14 · _regiComposicionKpis: los buckets reconcilian con los KPI ═══════ */
console.log('\n14 · _regiComposicionKpis: cada bucket suma EXACTO lo que muestra su cartel');
{
  const e = cargar();
  e._pipelineData = [
    filaReal('act', 5000, '2026-09', {estado:'Cotizado',  qNum: 101}),
    filaReal('fac', 7000, '2026-06', {estado:'Facturado', qNum: 102}),
    filaReal('per', 3000, '2026-05', {estado:'Perdido',   qNum: 103})
  ];
  e._regiPipeRows = [
    filaRegi('A-act',  'act', 9000, '2026-09'),                       // linkeada activa
    filaRegi('A-fac',  'fac', 8000, '2026-06'),                       // linkeada, solo facturada
    filaRegi('A-per',  'per', 4000, '2026-05'),                       // linkeada, TODAS perdidas
    filaRegi('A-man',  '',    2500, '',       {perdidaManual: true}), // perdida a mano, sin link
    filaRegi('A-nada', 'xyz', 1234, '2026-08')                        // ni link ni perdida
  ];
  const t = e._regiTotalesGlobales(e._regiPipeRows);
  const c = e._regiComposicionKpis(e._regiPipeRows);
  const suma = (arr, k) => arr.reduce((a, it) => a + it[k], 0);
  ok(suma(c.vinc, 'montoHP') === t.vinculadosHP,      'Σ montoHP de vinc === vinculadosHP',      suma(c.vinc,'montoHP') + ' vs ' + t.vinculadosHP);
  ok(suma(c.ceven, 'montoCeven') === t.vinculadosCeven,'Σ montoCeven de ceven === vinculadosCeven', suma(c.ceven,'montoCeven') + ' vs ' + t.vinculadosCeven);
  ok(suma(c.perd, 'montoHP') === t.perdidas,           'Σ montoHP de perd === perdidas',           suma(c.perd,'montoHP') + ' vs ' + t.perdidas);

  const opds = a => a.map(it => it.hp.opd).sort().join(',');
  ok(opds(c.vinc)  === 'A-act,A-fac,A-man,A-per', 'vinc = linkeadas + perdida a mano (no la "nada")', opds(c.vinc));
  ok(opds(c.ceven) === 'A-act,A-fac,A-per',       'ceven = solo linkeadas (la todo-perdida entra, aporta 0)', opds(c.ceven));
  ok(opds(c.perd)  === 'A-man,A-per',             'perd = todo-perdida + perdida a mano', opds(c.perd));

  const man = c.vinc.filter(it => it.hp.opd === 'A-man')[0];
  ok(man && man.filas.length === 0 && man.montoCeven === 0, 'la perdida a mano entra en vinc con filas:[] y montoCeven 0');
  ok(c.ceven.every(it => it.hp.opd !== 'A-man'), 'y NO entra en ceven');
  ok((c.perd.filter(it => it.hp.opd === 'A-man')[0] || {}).via === 'manual', 'su "via" es "manual"');
  ok((c.perd.filter(it => it.hp.opd === 'A-per')[0] || {}).via === 'ceven',  'la todo-perdida marca via "ceven"');
  ok((c.ceven.filter(it => it.hp.opd === 'A-fac')[0] || {}).montoCeven === 7000, 'la linkeada solo-facturada aporta 7000 a ceven');
  ok((c.ceven.filter(it => it.hp.opd === 'A-per')[0] || {}).montoCeven === 0,    'la linkeada todo-perdida aporta 0 a ceven');
}

/* ═══ 15 · _regiStatsDesgloseHTML(ag, opts): clickeable + qué se atenúa ════ */
console.log('\n15 · _regiStatsDesgloseHTML(ag, opts): linkQuotes y excluir configurables; sin opts NO cambia');
{
  const e = cargar();
  const rows = [
    filaReal('x', 4000, '2026-09', {estado:'Cotizado',  qNum: 201, cliente:'Cli A', proyecto:'Proy A'}),
    filaReal('x', 6000, '2026-05', {estado:'Facturado', qNum: 202, cliente:'Cli A', proyecto:'Proy B'}),
    filaReal('x', 1000, '2026-04', {estado:'Perdido',   qNum: 203, cliente:'Cli A', proyecto:'Proy C'})
  ];
  const ag = e._regiCevenAgg(rows);

  const plano = e._regiStatsDesgloseHTML(ag);
  ok(plano.indexOf('data-act="regi-drill-openq"') === -1, 'sin opts: ninguna fila clickeable (vista Estadísticas intacta)');

  const drill = e._regiStatsDesgloseHTML(ag, { linkQuotes: true, excluir: { Perdido: 1 } });
  ok((drill.match(/data-act="regi-drill-openq"/g) || []).length === 3, 'con linkQuotes: las 3 filas con nº de cotización son clickeables');
  ok(drill.indexOf('data-qn="202"') !== -1, 'la fila facturada lleva su data-qn');
  const trDe = (h, qn) => (h.split('<tr').filter(s => s.indexOf('data-qn="' + qn + '"') !== -1)[0] || '');
  ok(trDe(drill, 202).indexOf('opacity:.55') === -1, 'con excluir:{Perdido}, la Facturada NO va atenuada');
  ok(trDe(drill, 203).indexOf('opacity:.55') !== -1, 'la Perdida sí va atenuada');

  const drillDef = e._regiStatsDesgloseHTML(ag, { linkQuotes: true });
  ok(trDe(drillDef, 202).indexOf('opacity:.55') !== -1, 'sin "excluir", vuelve al default {Perdido,Facturado}: la Facturada atenuada');
}

/* ═══ 16 · _regiDrilldownHTML: total, conteo, vacío y bloque expandido ════ */
console.log('\n16 · _regiDrilldownHTML: el total del modal = el cartel; expandir muestra las cotizaciones');
{
  const e = cargar();
  const vac = e._regiDrilldownHTML({ kpi: 'vinc', abiertos: {}, comp: { vinc: [], ceven: [], perd: [] }, cargando: false, error: false });
  ok(vac.indexOf('USD 0') !== -1, 'total USD 0 con bucket vacío');
  ok(vac.indexOf('vinculada ni declarada perdida') !== -1, 'muestra el mensaje de vacío del bucket');
  ok(vac.indexOf('<table') === -1, 'sin tabla rota');

  e._pipelineData = [
    filaReal('act', 5000, '2026-09', {estado:'Cotizado',  qNum: 301, cliente:'Cli', proyecto:'P act'}),
    filaReal('fac', 7000, '2026-06', {estado:'Facturado', qNum: 302, cliente:'Cli', proyecto:'P fac'})
  ];
  e._regiPipeRows = [ filaRegi('A1', 'act', 9000, '2026-09'), filaRegi('A2', 'fac', 8000, '2026-06') ];
  const c = e._regiComposicionKpis(e._regiPipeRows);
  const t = e._regiTotalesGlobales(e._regiPipeRows);
  const s = { kpi: 'ceven', abiertos: {}, comp: c, cargando: false, error: false };
  const html = e._regiDrilldownHTML(s);
  ok(html.indexOf('USD ' + e.fI(t.vinculadosCeven)) !== -1, 'el total del modal coincide con el KPI vinculadosCeven (USD ' + e.fI(t.vinculadosCeven) + ')');
  ok((html.match(/data-act="regi-drill-grp"/g) || []).length === 2, 'un bloque colapsable por oportunidad');
  ok(html.indexOf('Cotizaciones de Ceven para este REGI') === -1, 'colapsado: no pinta el desglose');
  ok(html.indexOf('Expandir todas') !== -1, 'ofrece "Expandir todas"');

  s.abiertos['A1'] = true;
  const html2 = e._regiDrilldownHTML(s);
  ok(html2.indexOf('Cotizaciones de Ceven para este REGI') !== -1, 'expandido: aparece el desglose de esa oportunidad');
  ok(html2.indexOf('data-qn="301"') !== -1, 'y sus cotizaciones quedan clickeables');
  ok(html2.indexOf('Colapsar todas') !== -1, 'con algo abierto, el link pasa a "Colapsar todas"');

  ok(e._regiDrilldownHTML({ kpi: 'perd', abiertos: {}, comp: null, cargando: true,  error: false }).indexOf('Cargando') !== -1,       'estado "cargando" no explota');
  ok(e._regiDrilldownHTML({ kpi: 'perd', abiertos: {}, comp: null, cargando: false, error: true  }).indexOf('No se pudo cargar') !== -1, 'estado "error" no explota');
}

console.log('\n' + (fallos
  ? ('✗ ' + fallos + ' de ' + corridas + ' fallaron\n')
  : ('✓ ' + corridas + '/' + corridas + ' OK\n')));
process.exit(fallos ? 1 : 0);
