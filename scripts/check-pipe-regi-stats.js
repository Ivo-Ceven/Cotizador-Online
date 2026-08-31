#!/usr/bin/env node
/* ============================================================================
   check-pipe-regi-stats.js · Cotizadores Ceven
   ----------------------------------------------------------------------------
   Vista "📊 Estadísticas REGI" (27/08/2026, sobre el vínculo por OPG del
   mismo día — ver docs/HISTORIAL.md): compara, para cada oportunidad ya
   VINCULADA, el monto/fecha que carga HP en su Excel contra lo que Ceven
   tiene cargado de verdad, con KPI agregados por mes y por trimestre.

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
  ok(/-1\.0 meses/.test(e._els['stats-kpi-fecha'].textContent), 'KPI fecha: promedio (-2+0)/2 = -1.0', e._els['stats-kpi-fecha'].textContent);
  ok(/sobre 2 oportunidades vinculadas/.test(e._els['stats-kpi-monto-sub'].textContent), 'la sub-línea dice sobre cuántas oportunidades');
  ok(e._els['stats-mes-body'].innerHTML.indexOf('Ago 2026') !== -1, 'la tabla por mes tiene la fila de agosto');
  ok(e._els['stats-q-body'].innerHTML.indexOf('Q3 2026') !== -1, 'la tabla por trimestre tiene Q3 2026');
  ok(e._els['stats-pick'].innerHTML.indexOf('Hospital Italiano') !== -1 && e._els['stats-pick'].innerHTML.indexOf('Banco Galicia') !== -1,
     'el desplegable lista las dos oportunidades vinculadas');

  e._regiStatsPintarComparacion('OPD1');
  const cmp = e._els['stats-compare'].innerHTML;
  ok(/USD 10\.000/.test(cmp) && /USD 8\.000/.test(cmp), 'el comparador muestra el monto de HP y de Ceven para esa oportunidad', cmp);
  ok(/-USD 2\.000/.test(cmp), 'y la diferencia de monto de ESA oportunidad puntual (8000-10000=-2000)');
  ok(/-2 m/.test(cmp), 'y la diferencia de fecha (agosto a octubre = -2 meses)');
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

/* ═══ 8 · cevenRegiToggleVista: Estadísticas apaga lo que no le corresponde ═ */
console.log('\n8 · cevenRegiToggleVista("__regi_stats") deja la pantalla en el estado correcto');
{
  const e = cargar();
  e._els['pipe-table-normal'] = { style: {} };
  e._els['pipe-table-regi'] = { style: {} };
  e._els['pipe-stats'] = { style: {} };
  e._els['regi-vinc-wrap'] = { style: {} };
  e.cevenRegiToggleVista('__regi_stats');
  ok(e._els['pipe-table-normal'].style.display === 'none', 'oculta el pipeline normal');
  ok(e._els['pipe-table-regi'].style.display === 'none', 'oculta la tabla REGI');
  ok(e._els['pipe-stats'].style.display === '', 'y muestra Estadísticas');
  ok(e._els['regi-vinc-wrap'].style.display === 'none', '"Mostrar vinculadas" no aplica acá, se oculta');
  ok(e._els['pipe-dashboard'].style.display === 'none', 'el dashboard de KPI del pipeline normal/REGI se apaga explícito');
}

console.log('\n' + (fallos
  ? ('✗ ' + fallos + ' de ' + corridas + ' fallaron\n')
  : ('✓ ' + corridas + '/' + corridas + ' OK\n')));
process.exit(fallos ? 1 : 0);
