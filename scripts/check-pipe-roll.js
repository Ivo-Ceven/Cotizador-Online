#!/usr/bin/env node
/* ============================================================================
   check-pipe-roll.js · Cotizadores Ceven
   ----------------------------------------------------------------------------
   El auto-roll del mes de cierre vencido, de punta a punta: carga el
   `savePipeline()` REAL de src/shared/pipeline-store.js + el `pipeline-data.js`
   de cada marca, y verifica lo que NO se ve mirando la pantalla:

     · `fechaMod` NO se mueve cuando el que cambia la fila es el SISTEMA
       (savePipeline con {systemChange:true}, que usa rollOverdueEntries).
       Si se moviera, el reloj de "días sin movimiento" se resetearía solo
       cada mes y la alerta de estancamiento nunca dispararía.
     · un savePipeline() NORMAL sobre una fila editada de verdad SÍ mueve
       `fechaMod` (guarda contra una regresión del refactor de la firma).
     · `cevenMonthAdd('YYYY-MM', n)` con acarreo de año y n negativo.
     · los setters de mes a mano limpian `mesAutoRoll` (assert sobre el fuente).

   Uso:  node scripts/check-pipe-roll.js
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

const CUR = (() => {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
})();
function mesPasado(n){
  const d = new Date(); d.setMonth(d.getMonth() - (n || 2));
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}
const hace = (dias) => new Date(Date.now() - dias * 86400000).toISOString();

/* Contexto con el savePipeline REAL sobre un "localStorage" en memoria. */
function ctxConMarca(marca, pipeInicial){
  const store = { 'cpipeline': JSON.stringify(pipeInicial || []) };
  const ctx = {
    console,
    CEVEN_BRAND: { padCols: {} },
    cevenK: (b) => b,
    cevenLsJSON: (k, d) => { try { return JSON.parse(store[k]); } catch(e) { return d; } },
    cevenLsSet: (k, v) => { store[k] = String(v); return true; },
    autoSnapshot: () => {},
    getDB: () => [],
    cevenOpcFilasDeCotiz: () => [],
    cevenSkuTieneOverrides: () => false,
    cevenSkuEstadosDe: (r) => [r.estado || 'Cotizado'],
    cevenMesLabel: (k) => k,
    showToast: () => {},
    renderPipeline: () => {}
  };
  ctx.window = ctx;
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'src/shared/pipeline-store.js'), 'utf8'),
    ctx, { filename: 'shared/pipeline-store.js' });
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'src/' + marca + '/js/pipeline-data.js'), 'utf8'),
    ctx, { filename: marca + '/js/pipeline-data.js' });
  ctx._store = store;
  return ctx;
}

const fila = (id, estado, mes, extra) => Object.assign({
  id: id, qNum: String(id).padStart(4, '0'), fecha: '01/01/2026',
  cliente: 'Canal ' + id, proyecto: 'Cli ' + id, ejecutivo: 'Ana',
  estado: estado, mesCierre: mes, monto: 1000 * id
}, extra || {});

const MP = mesPasado(2);

/* ═══ 1 · cevenMonthAdd ════════════════════════════════════════════════════ */
console.log('\n1 · cevenMonthAdd(clave, n)');
{
  const ctx = ctxConMarca('poly', []);
  const f = ctx.cevenMonthAdd;
  ok(f('2026-11', 2)  === '2027-01', "'2026-11' + 2 → '2027-01' (acarreo de año)", f('2026-11', 2));
  ok(f('2026-01', -1) === '2025-12', "'2026-01' - 1 → '2025-12' (negativo)", f('2026-01', -1));
  ok(f('2026-06', 0)  === '2026-06', "+ 0 → identidad", f('2026-06', 0));
  ok(f('2026-12', 1)  === '2027-01', "'2026-12' + 1 → '2027-01'", f('2026-12', 1));
  ok(f('basura', 3)   === 'basura',  "clave mal formada → se devuelve tal cual", f('basura', 3));
}

['poly', 'legamaster', 'apple'].forEach(function(marca){
  console.log('\n' + marca.toUpperCase());

  /* ═══ 2 · el auto-roll NO mueve fechaMod ═════════════════════════════════ */
  {
    const fmViejo = hace(40);
    const ctx = ctxConMarca(marca, [ fila(1, 'Cotizado', MP, { fechaMod: fmViejo }) ]);
    ctx.rollOverdueEntries();
    const row = ctx.getPipeline()[0];
    ok(row.mesCierre === CUR, 'la fila vencida se movió al mes actual');
    ok(row.mesAutoRoll === MP, 'y quedó marcada con el mes original');
    ok(row.fechaMod === fmViejo,
       'fechaMod NO se movió (systemChange) — el reloj de estancamiento sigue corriendo',
       'era ' + fmViejo + ', quedó ' + row.fechaMod);
  }

  /* ═══ 3 · un savePipeline NORMAL sobre una fila editada SÍ mueve fechaMod ═ */
  {
    const fmViejo = hace(40);
    const ctx = ctxConMarca(marca, [ fila(2, 'Cotizado', CUR, { fechaMod: fmViejo }) ]);
    const pipe = ctx.getPipeline();
    pipe[0].estado = 'Commit';                 // cambio real de una persona
    ctx.savePipeline(pipe);                    // sin opts
    ok(ctx.getPipeline()[0].fechaMod !== fmViejo,
       'editar el estado a mano SÍ actualiza fechaMod (guard del refactor)');
  }

  /* ═══ 4 · re-roll: fechaMod tampoco se mueve, mesAutoRoll no se pisa ═════ */
  {
    const fmViejo = hace(90);
    const ctx = ctxConMarca(marca, [
      fila(3, 'Negociacion', MP, { fechaMod: fmViejo, mesAutoRoll: '2020-01' })
    ]);
    ctx.rollOverdueEntries();
    const row = ctx.getPipeline()[0];
    ok(row.mesCierre === CUR, 're-roll: al mes actual otra vez');
    ok(row.mesAutoRoll === '2020-01', 're-roll: mesAutoRoll conserva el PRIMER mes');
    ok(row.fechaMod === fmViejo, 're-roll: fechaMod sigue clavado');
  }

  /* ═══ 5 · sin filas vencidas abiertas → no se escribe nada ══════════════ */
  {
    const ctx = ctxConMarca(marca, [ fila(4, 'Facturado', MP), fila(5, 'Cotizado', CUR) ]);
    const antes = ctx._store['cpipeline'];
    ctx.rollOverdueEntries();
    ok(ctx._store['cpipeline'] === antes, 'nada vencido y abierto → savePipeline ni se llama');
  }
});

/* ═══ 6 · los setters de mes a mano limpian mesAutoRoll (assert de fuente) ═ */
console.log('\n6 · Editar el mes a mano limpia la marca (source check)');
[
  ['poly',       'src/poly/js/pipeline-detail.js',       ['updatePipelineMesCierreValue']],
  ['legamaster', 'src/legamaster/js/pipeline-detail.js', ['updatePipelineMesCierreValue']],
  ['apple',      'src/apple/js/pipeline-detail.js',      ['updatePipelineMesCierreValue', 'updateSkuMesCierreValue']],
].forEach(function(row){
  const [marca, file, fns] = row;
  const src = fs.readFileSync(path.join(ROOT, file), 'utf8');
  fns.forEach(function(fn){
    const i = src.indexOf('function ' + fn);
    const body = src.slice(i, i + 1400);
    ok(/delete\s+pipe\[i\]\.mesAutoRoll/.test(body),
       marca + ': ' + fn + '() hace `delete pipe[i].mesAutoRoll`');
  });
});
[
  ['poly',       'src/poly/js/archive-view.js'],
  ['legamaster', 'src/legamaster/js/archive-view.js'],
  ['apple',      'src/apple/js/archive-view.js'],
].forEach(function(row){
  const [marca, file] = row;
  const src = fs.readFileSync(path.join(ROOT, file), 'utf8');
  ok(/restored\.mesCierre = currentMonthKey\(\);\s*\n\s*delete restored\.mesAutoRoll/.test(src),
     marca + ': restoreFromArchive() limpia mesAutoRoll al restaurar');
});

/* ═══ 7 · el hook corre el roll ANTES del archivado ════════════════════════ */
console.log('\n7 · ui-core.js llama rollOverdueEntries() antes de archiveOldEntries()');
{
  const src = fs.readFileSync(path.join(ROOT, 'src/shared/ui-core.js'), 'utf8');
  const iRoll = src.indexOf('rollOverdueEntries()');
  const iArch = src.indexOf('archiveOldEntries()');
  ok(iRoll > 0 && iArch > 0 && iRoll < iArch,
     'rollOverdueEntries() aparece antes que archiveOldEntries() en el hook de "pipeline"');
}

/* ═══ 8 · brand.js: mesAutoRoll en pipeCols Y nullableCols de las 3 marcas ═ */
console.log('\n8 · brand.js declara mesAutoRoll (pipeCols + nullableCols) y fechaMod (pipeCols)');
['poly', 'legamaster', 'apple'].forEach(function(marca){
  const src = fs.readFileSync(path.join(ROOT, 'src/' + marca + '/brand.js'), 'utf8');
  const w = {};
  new Function('window', src)(w);
  const B = w.CEVEN_BRAND;
  ok(B.pipeCols.indexOf('mesAutoRoll') !== -1, marca + ': mesAutoRoll en pipeCols');
  ok(B.nullableCols.indexOf('mesAutoRoll') !== -1, marca + ': mesAutoRoll en nullableCols');
  ok(B.pipeCols.indexOf('fechaMod') !== -1, marca + ': fechaMod en pipeCols');
  ok((B.objCols || []).indexOf('mesAutoRoll') === -1, marca + ': mesAutoRoll NO es objCols (es text)');
});

console.log('\n' + (fallos
  ? ('✗ ' + fallos + ' de ' + corridas + ' fallaron\n')
  : ('✓ ' + corridas + '/' + corridas + ' OK\n')));
process.exit(fallos ? 1 : 0);
