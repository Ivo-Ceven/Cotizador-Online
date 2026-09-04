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
    // Header (04/09/2026): los dos montos globales de REGI que no se mueven
    // con los filtros viven acá ahora, no en dash-total/dash-regi-vinculados
    // (ver el comentario grande sobre _regiEnsureHeaderKpis en pipeline-regi.js).
    'hdr-regi-total':         nodo(),
    'hdr-regi-vinc':          nodo(),
    'hdr-regi-ceven':         nodo(),
    'hdr-regi-perdidas':      nodo(),
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
    showError(m){ ctx._lastError = m; },
    cevenCanUsePipeline(){ return ctx._canUse !== false; },
    getPipeline(){ return ctx._pipelineData || []; },
    // Por defecto resuelve OK; un test que quiera simular una falla de red
    // pisa ctx._fetchImpl antes de llamar a la acción bajo prueba.
    cevenAuthedFetch(){
      ctx._lastFetch = Array.prototype.slice.call(arguments);
      return (ctx._fetchImpl || (function(){ return Promise.resolve({}); }))();
    },
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
  primaryPartner: '', drExpiration: '', mesCierre: '', montoArchivo: 0, monto: 1000, forecast: '',
  perdidaManual: false
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
  ok(Array.isArray(set['ABC-123']), 'un OPG cargado entra al set (como array), normalizado');
  ok(Array.isArray(set['XYZ-9']), 'con espacios de más, igual');
  ok(Object.keys(set).length === 2, 'las filas sin OPG no ensucian el set', JSON.stringify(Object.keys(set)));
}
{
  // Un mismo OPG en VARIAS cotizaciones del pipeline real: el set las junta
  // todas en un array, ninguna pisa a la otra.
  const e = cargar();
  e._pipelineData = [ filaReal('dup-1'), filaReal(' DUP-1 '), filaReal('dup-1'), filaReal('otro') ];
  const set = e._regiOpgVinculadosSet();
  ok(set['DUP-1'].length === 3, 'las 3 filas con el mismo OPG quedan en el mismo array', JSON.stringify(set['DUP-1'] && set['DUP-1'].length));
  ok(set['OTRO'].length === 1, 'el OPG distinto queda aparte');
}

/* ═══ 3 · Una oportunidad sin REGI aprobado usa OPD ════════════════════════ */
console.log('\n3 · Sin REGI aprobado (columna vacía), OPD permite el vínculo');
{
  const e = cargar();
  // vinculados es {OPG: [filas]} — a _regiEsVinculada solo le importa que el
  // array exista y tenga al menos una fila.
  const vinculados = { 'ABC-123': [{}], 'OPD1': [{}], 'OPD3': [{}] };
  ok(e._regiEsVinculada(filaRegi('OPD1', ''), vinculados) === true,
     'REGI vacío usa OPD para quedar vinculada');
  ok(e._regiEsVinculada(filaRegi('OPD2', 'abc-123'), vinculados) === true,
     'REGI aprobado que matchea (case/espacios distintos) SÍ queda vinculada');
  ok(e._regiEsVinculada(filaRegi('OPD3', 'otro-codigo'), vinculados) === false,
     'REGI aprobado que no matchea ningún OPG no usa OPD aunque esté cargado');
  ok(e._regiEsVinculada(filaRegi('OPD4', ''), { 'OPD4': [] }) === false,
     'un array vacío no cuenta como vinculada');
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
    filaRegi('OPD3', 'zzz-999', {cliente:'Suelta SA',    montoArchivo:3000, monto:3000, forecast:'Upside'})
  ];
  e._regiMostrarVinculadas = false;
  e._renderRegiPipelineFromCache();
  const html = e._els['regi-pipe-body'].innerHTML;
  ok(html.indexOf('Vinculada SA') === -1, 'la oportunidad vinculada no aparece en la tabla', html);
  ok(html.indexOf('Sin REGI SA') === -1 && html.indexOf('Suelta SA') !== -1,
     'la oportunidad sin REGI vinculada por OPD se oculta, la suelta sigue visible');
  ok(e._els['regi-vinc-count'].textContent === '(2)', 'el contador incluye vínculos por REGI y OPD', e._els['regi-vinc-count'].textContent);
  // Los cuatro KPI globales (04/09/2026) viven en el header, no en la grilla:
  // no se mueven con el toggle "Mostrar vinculadas" ni con ningún otro filtro.
  ok(/USD 15\.000/.test(e._els['hdr-regi-total'].textContent),
     'el header suma el Excel CRUDO: todas las filas, vinculadas incluidas y sin descontar nada',
     e._els['hdr-regi-total'].textContent);
  // "REGI vinculados" usa el monto que DECLARA HP (5000 + 7000) de las dos
  // linkeadas, no el de Ceven — ese es "REGI CEVEN", el KPI de al lado.
  ok(/USD 12\.000/.test(e._els['hdr-regi-vinc'].textContent),
     'el header "REGI vinculados" suma el Amount de HP de las oportunidades linkeadas',
     e._els['hdr-regi-vinc'].textContent);
  ok(/USD 10\.000/.test(e._els['hdr-regi-ceven'].textContent),
     'y "REGI CEVEN" suma lo que valen esas mismas oportunidades en el pipeline de Ceven',
     e._els['hdr-regi-ceven'].textContent);
  ok(/USD 0\b/.test(e._els['hdr-regi-perdidas'].textContent),
     'nada está perdido en este escenario', e._els['hdr-regi-perdidas'].textContent);
  // La tarjeta de la grilla que antes mostraba el total fijo ahora es
  // "Monto filtrado": con el toggle apagado, solo entra la suelta (3000) —
  // las dos vinculadas (5000 y 6000 vistos por Ceven) quedan afuera.
  ok(/USD 3\.000/.test(e._els['dash-total'].innerHTML || e._els['dash-total'].textContent),
     'la grilla muestra el monto FILTRADO (solo la suelta), no el total global',
     e._els['dash-total'].textContent);
  ok(e._els['dash-total-lbl'].textContent === 'Monto filtrado', 'con la etiqueta que dice que es filtrado', e._els['dash-total-lbl'].textContent);
}
{
  // Un mismo REGI trabajado en VARIAS cotizaciones reales (mismo OPG): "REGI
  // CEVEN" (celeste) suma todas las activas; una en estado Perdido/Facturado
  // no cuenta (mismo criterio que "Total pipeline" del pipeline normal). Como
  // hay cotizaciones activas Y una Facturada de por medio, esto NO cuenta
  // como "perdida" — no están TODAS en Perdido.
  const e = cargar();
  e._pipelineData = [
    filaReal('opg-x', {monto:9000, estado:'Cotizado'}),
    filaReal('opg-x', {monto:6000, estado:'Negociacion'}),
    filaReal('opg-x', {monto:4000, estado:'Perdido'}),
    filaReal('opg-x', {monto:8000, estado:'Facturado'})
  ];
  e._regiPipeRows = [ filaRegi('OPD1', 'opg-x', {cliente:'Multi SA', montoArchivo:20000, monto:20000}) ];
  e._regiMostrarVinculadas = false;
  e._renderRegiPipelineFromCache();
  ok(/USD 15\.000/.test(e._els['hdr-regi-ceven'].textContent),
     'REGI CEVEN suma las cotizaciones activas del mismo OPG (9000 + 6000), sin Perdido (4000) ni Facturado (8000)',
     e._els['hdr-regi-ceven'].textContent);
  ok(/USD 20\.000/.test(e._els['hdr-regi-vinc'].textContent),
     'REGI vinculados sigue usando el Amount completo de HP (20.000), no el de Ceven',
     e._els['hdr-regi-vinc'].textContent);
  ok(/USD 0\b/.test(e._els['hdr-regi-perdidas'].textContent),
     'no cuenta como perdida: hay actividad real y hasta una Facturada', e._els['hdr-regi-perdidas'].textContent);
}
{
  // Ahora SÍ todas las cotizaciones ligadas están en Perdido: el vínculo
  // existió y no prosperó — cuenta para "REGIs perdidas" con el Amount de HP,
  // y "REGI CEVEN" queda en 0 (nada activo que mostrar del lado de Ceven).
  const e = cargar();
  e._pipelineData = [
    filaReal('opg-y', {monto:9000, estado:'Perdido'}),
    filaReal('opg-y', {monto:6000, estado:'Perdido'})
  ];
  e._regiPipeRows = [ filaRegi('OPD1', 'opg-y', {cliente:'Perdida Real SA', montoArchivo:12000, monto:12000}) ];
  e._regiMostrarVinculadas = true;   // si no, la fila queda oculta y no se puede inspeccionar
  e._renderRegiPipelineFromCache();
  const fila = e._regiPipeRows[0];
  ok(fila.linkReal === true, 'sigue teniendo un link real (hubo cotización con ese OPG)');
  ok(fila.perdidaCeven === true, 'pero TODAS sus cotizaciones ligadas están en Perdido');
  ok(fila.vinculada === true, 'y sigue contando como "vinculada" — no desaparece del KPI de arriba');
  ok(/USD 12\.000/.test(e._els['hdr-regi-vinc'].textContent), 'REGI vinculados la sigue contando (Amount de HP)', e._els['hdr-regi-vinc'].textContent);
  ok(/USD 0\b/.test(e._els['hdr-regi-ceven'].textContent), 'REGI CEVEN da 0: no queda nada activo', e._els['hdr-regi-ceven'].textContent);
  ok(/USD 12\.000/.test(e._els['hdr-regi-perdidas'].textContent), 'y "REGIs perdidas" la suma completa', e._els['hdr-regi-perdidas'].textContent);
}
{
  // Checkbox "Perdida" a mano: sin ningún link real, declararla perdida la
  // hace contar igual para "REGI vinculados" y "REGIs perdidas" — el objetivo
  // es que HP y Ceven terminen viendo el mismo número.
  const e = cargar();
  e._pipelineData = [];   // sin ninguna cotización real: no hay forma de linkear por OPG
  e._regiPipeRows = [ filaRegi('OPD9', '', {cliente:'Nunca cargada SA', montoArchivo:2500, monto:2500}) ];
  e._regiMostrarVinculadas = false;
  e._renderRegiPipelineFromCache();
  ok(e._regiPipeRows[0].vinculada === false, 'sin marcar, no cuenta como vinculada todavía');
  ok(/USD 0\b/.test(e._els['hdr-regi-vinc'].textContent), 'así que el header todavía no la contempla', e._els['hdr-regi-vinc'].textContent);

  // renderPipeline() está stubeado como no-op en este harness (vive en
  // pipeline-view.js, que acá no se carga): en la app real, ese llamado es
  // el que dispara _renderRegiPipelineFromCache() y recalcula `.vinculada`.
  // Acá hay que pedirlo a mano para simular esa vuelta.
  e._regiMarcarPerdida('OPD9', true);
  ok(e._regiPipeRows[0].perdidaManual === true, 'el checkbox marca perdidaManual en la fila (optimista, antes de que vuelva el PATCH)');
  ok(e._lastFetch[0].indexOf('opd=eq.OPD9') !== -1, 'el PATCH apunta a esa fila por opd', JSON.stringify(e._lastFetch));
  ok(JSON.parse(e._lastFetch[1].body).forecast_override === 'Perdido', 'y manda forecast_override=Perdido', e._lastFetch[1].body);
  e._renderRegiPipelineFromCache();
  ok(e._regiPipeRows[0].vinculada === true, 'y con eso ya cuenta como "vinculada" — no hace falta cotización real');
  ok(/USD 2\.500/.test(e._els['hdr-regi-vinc'].textContent), 'REGI vinculados ahora la incluye', e._els['hdr-regi-vinc'].textContent);
  ok(/USD 2\.500/.test(e._els['hdr-regi-perdidas'].textContent), 'y también cuenta para REGIs perdidas', e._els['hdr-regi-perdidas'].textContent);
  ok(/USD 0\b/.test(e._els['hdr-regi-ceven'].textContent), 'REGI CEVEN sigue en 0: nunca hubo cotización real detrás', e._els['hdr-regi-ceven'].textContent);

  e._regiMarcarPerdida('OPD9', false);
  ok(e._regiPipeRows[0].perdidaManual === false, 'desmarcarla la saca de perdidaManual');
  ok(JSON.parse(e._lastFetch[1].body).forecast_override === null, 'el PATCH esta vez manda forecast_override=null', e._lastFetch[1].body);
  e._renderRegiPipelineFromCache();
  ok(e._regiPipeRows[0].vinculada === false, 'y vuelve a no contar como vinculada (sin link real detrás)');
}
{
  // Sin permiso de pipeline, ni siquiera intenta el PATCH.
  const e = cargar();
  e._pipelineData = [];
  e._regiPipeRows = [ filaRegi('OPD7', '', {cliente:'Sin Permiso SA'}) ];
  e._canUse = false;
  e._regiMarcarPerdida('OPD7', true);
  ok(e._regiPipeRows[0].perdidaManual === undefined || e._regiPipeRows[0].perdidaManual === false,
     'sin permiso no se marca la fila', e._regiPipeRows[0].perdidaManual);
  ok(/no permite/.test(e._lastToast || ''), 'y avisa que el rol no lo permite', e._lastToast);
}
{
  // Mismo escenario, con el toggle en "mostrar": el header (global) tiene que
  // quedarse fijo en el total del Excel sea cual sea el toggle; la grilla
  // (filtrada) sí tiene que moverse — sin vinculadas solo entra la suelta
  // (3000), con vinculadas entran las dos (8000).
  const e = cargar();
  e._pipelineData = [ filaReal('abc-123') ];
  e._regiPipeRows = [
    filaRegi('OPD1', 'abc-123', {cliente:'Vinculada SA', montoArchivo:5000, monto:5000}),
    filaRegi('OPD2', 'zzz-999', {cliente:'Suelta SA',    montoArchivo:3000, monto:3000})
  ];
  e._regiMostrarVinculadas = false;
  e._renderRegiPipelineFromCache();
  ok(/USD 8\.000/.test(e._els['hdr-regi-total'].textContent), 'el header usa el Excel completo con el toggle apagado', e._els['hdr-regi-total'].textContent);
  ok(/USD 3\.000/.test(e._els['dash-total'].innerHTML || e._els['dash-total'].textContent),
     'y la grilla filtrada, con el toggle apagado, solo cuenta la suelta');

  e._regiMostrarVinculadas = true;
  e._renderRegiPipelineFromCache();
  const html = e._els['regi-pipe-body'].innerHTML;
  ok(html.indexOf('Vinculada SA') !== -1, 'con el toggle activado, la vinculada vuelve a aparecer');
  ok(/USD 8\.000/.test(e._els['hdr-regi-total'].textContent),
     'el header NO se mueve: sigue siendo el mismo total del Excel que con el toggle apagado');
  ok(/USD 8\.000/.test(e._els['dash-total'].innerHTML || e._els['dash-total'].textContent),
     'pero la grilla filtrada SÍ se mueve: con el toggle prendido ahora entran las dos');
  // El detalle de la fila (badge/botones) solo se pinta con el grupo del
  // cliente desplegado — cevenPipeAbierto() arranca colapsado en una sesión
  // nueva. Se prueba _regiRowHTML() directo, sin depender de esa mecánica.
  const vinculada = e._regiPipeRows.filter(r => r.opd === 'OPD1')[0];
  ok(vinculada.vinculada === true, '_renderRegiPipelineFromCache marcó la fila como vinculada');
  const filaHtml = e._regiRowHTML(vinculada);
  ok(/✓ Vinculada/.test(filaHtml), 'y se muestra con la pastilla "✓ Vinculada" en vez de los botones de acción', filaHtml);
  ok(!/data-act="regi-copiar"/.test(filaHtml),
     'una fila vinculada no ofrece "Copiar a Ceven": ya tiene proyecto real');
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

/* ═══ 7 · La vista REGI es una FOTO del Excel: no se edita nada ══════ */
/* Hasta el 03/09/2026 el Forecast se podía editar a mano (columna
   forecast_override) y había un cuarto valor, 'Perdido', que el archivo de HP
   no trae. El jefe pidió que esta vista diga exactamente lo que dice el Excel,
   así que acá se verifica lo contrario de lo que se verificaba antes: que NO
   quede ningún control que escriba sobre la foto. */
console.log('\n7 · El pipeline REGI no tiene nada editable');
{
  const e = cargar();
  const fila = filaRegi('OPD1', '', {forecast:'Commit'});
  const html = e._regiRowHTML(fila);

  ok(!/<select/.test(html), 'la fila no tiene ningún <select> (el Forecast es una pastilla fija)', html);
  ok(!/data-act="regi-forecast-edit"/.test(html), 'no queda el handler de edición del Forecast');
  ok(!/data-act="regi-editar"/.test(html), 'no queda el botón de asignar productos');
  ok(/Commit/.test(html), 'pero el Forecast del archivo se sigue mostrando');
  ok(/data-act="regi-copiar"/.test(html), 'y "Copiar a Ceven" sigue estando: no escribe sobre la foto');

  ok(typeof e._regiCambiarForecast === 'undefined' && typeof e._regiGuardarForecast === 'undefined',
     'las funciones que hacían el PATCH de forecast_override ya no existen');
  ok(typeof e.REGI_FORECAST_COLORS.Perdido === 'undefined',
     '"Perdido" salió de la lista de forecast: no es una categoría del archivo de HP');

  // Un forecast que el archivo traiga y no esté en la lista se muestra crudo,
  // no se cae a otra categoría ni desaparece.
  ok(/Categoria Nueva/.test(e._regiRowHTML(filaRegi('OPD9', '', {forecast:'Categoria Nueva'}))),
     'un forecast desconocido del archivo se pinta tal cual, en vez de esconderse');
}
{
  // El monto de la fila es el del archivo, siempre: ya no hay productos
  // asignados que lo reemplacen.
  const e = cargar();
  e._regiPipeRows = [ filaRegi('OPD1', '', {cliente:'Foto SA', montoArchivo:4321, monto:4321}) ];
  e._regiMostrarVinculadas = false;
  e._renderRegiPipelineFromCache();
  ok(/USD 4\.321/.test(e._els['hdr-regi-total'].textContent),
     'el KPI global "Monto total REGI" del header es el Amount del Excel', e._els['hdr-regi-total'].textContent);
  ok(/USD 4\.321/.test(e._els['dash-total'].textContent),
     'y acá al no haber filtros ni vinculadas, el "Monto filtrado" de la grilla da lo mismo',
     e._els['dash-total'].textContent);
  ok(e._els['dash-total-lbl'].textContent === 'Monto filtrado', 'con la etiqueta de filtrado, no la de total global', e._els['dash-total-lbl'].textContent);
}

console.log('\n' + (fallos
  ? ('✗ ' + fallos + ' de ' + corridas + ' fallaron\n')
  : ('✓ ' + corridas + '/' + corridas + ' OK\n')));
process.exit(fallos ? 1 : 0);
