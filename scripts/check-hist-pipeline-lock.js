#!/usr/bin/env node
/* ============================================================================
   check-hist-pipeline-lock.js · Cotizadores Ceven
   ----------------------------------------------------------------------------
   Una fila del pipeline (o de un mes archivado) es una FOTO de la cotización
   con un puntero `qNum`. Si se borra la cotización del historial, esa fila
   queda huérfana y su monto sigue sumando. Desde 09/2026 NO se deja borrar
   del historial una cotización todavía referenciada por el pipeline:
   cevenQuoteEnPipeline() en shared/pipeline-group.js + los guards en
   <marca>/js/history.js y shared/papelera.js.

   Corre las funciones REALES. Mismo harness `vm` que check-pipe-regi-opg.js.
   Uso:  node scripts/check-hist-pipeline-lock.js
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

// Carga shared/pipeline-group.js + <marca>/js/history.js en un contexto con
// los stubs mínimos. Devuelve el ctx.
function cargar(marca){
  const ctx = {
    console,
    _pipeline: [],
    _archive: {},
    _db: [],
    _toasts: [],
    _undo: [],
    histSel: {},
    getPipeline(){ return ctx._pipeline; },
    getArchive(){ return ctx._archive; },
    getDB(){ return ctx._db; },
    saveDB(next){ ctx._db = next; ctx._savedDB = next; return true; },
    showToast(m){ ctx._toasts.push(String(m)); },
    notifyUndo(msg, fn){ ctx._undo.push({ msg: String(msg), fn: fn }); },
    updateHistBtns(){},
    renderHistory(){},
    cevenCanEditQuote(){ return true; },
    cevenEsc: s => String(s == null ? '' : s),
    fI: n => String(Math.round(n)),
    // Papelera: stubs que registran la llamada y "guardan bien".
    cevenPapeleraTirar(qn, filas){ ctx._papelera = ctx._papelera || []; ctx._papelera.push({ qn: String(qn), n: filas.length }); return true; },
    cevenPapeleraTirarVarias(grupos){ ctx._papelera = ctx._papelera || []; grupos.forEach(g => ctx._papelera.push({ qn: String(g.qn), n: g.filas.length })); return true; },
    cevenPapeleraSacar(){},
    document: {
      getElementById: () => ({ style: {}, value: '', textContent: '', innerHTML: '', addEventListener: () => {}, contains: () => false }),
      addEventListener: () => {},
      querySelectorAll: () => []
    },
    cevenDelegate: () => {},
    cevenActEl: () => null
  };
  ctx.window = ctx;
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'src/shared/pipeline-group.js'), 'utf8'), ctx, { filename: 'pipeline-group.js' });
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'src/' + marca + '/js/history.js'), 'utf8'), ctx, { filename: marca + '/history.js' });
  // history.js redefine estas (declaraciones de función ganan): las apagamos
  // DESPUÉS de cargar — no es lo que se prueba y arrastran medio DOM.
  ctx.renderHistory = function(){};
  ctx.updateHistBtns = function(){};
  ctx.renderPapelera = function(){};
  return ctx;
}

// Fila de cquotes mínima.
const filaDB = (qn, extra) => Object.assign({ 'N° Cotización': qn, 'SKU': 'X', 'Descripción': 'D', 'Total': '100', 'Ejecutivo': 'Fer' }, extra || {});

console.log('\nBloqueo de borrado del historial si la cotización está en el pipeline\n');

/* ═══ 1 · cevenQuoteEnPipeline: pipeline, archivo, o ninguno ════════════════ */
console.log('1 · cevenQuoteEnPipeline(qn)');
{
  const e = cargar('poly');
  e._pipeline = [ { qNum: '0007', proyecto: 'Sala A', estado: 'Negociacion', monto: 5000 } ];
  e._archive  = { '2026-08': [ { qNum: '0009', proyecto: 'Sala Z', estado: 'Facturado', monto: 3000 } ] };

  const a = e.cevenQuoteEnPipeline('0007');
  ok(a && a.donde === 'pipeline' && a.proyecto === 'Sala A' && a.estado === 'Negociacion',
     'encuentra la que está en el pipeline vivo', JSON.stringify(a));

  const b = e.cevenQuoteEnPipeline('0009');
  ok(b && b.donde === 'archivo' && b.mes === '2026-08',
     'encuentra la que está en un mes archivado, con el mes', JSON.stringify(b));

  ok(e.cevenQuoteEnPipeline('0099') === null, 'la que no está en ningún lado devuelve null');
  ok(e.cevenQuoteEnPipeline('') === null && e.cevenQuoteEnPipeline(null) === null, 'qn vacío/null: null, sin romper');

  // Comparación por string: 7 y '0007' NO son lo mismo (el resto del código
  // compara N° de cotización como string crudo).
  ok(e.cevenQuoteEnPipeline('7') === null, 'compara el qNum tal cual (string), sin normalizar ceros');
}
{
  const e = cargar('poly');
  e._pipeline = [ { qNum: '0001' }, { qNum: '0002' }, { qNum: '0003' } ];
  const bloq = e.cevenQuotesEnPipeline(['0002', '0009', '0003']);
  ok(bloq.length === 2 && bloq.map(x => x.qn).sort().join(',') === '0002,0003',
     'cevenQuotesEnPipeline devuelve solo las referenciadas', JSON.stringify(bloq.map(x => x.qn)));
  ok(e.cevenQuotesEnPipeline([]).length === 0, 'lista vacía: nada bloqueado');
}

/* ═══ 2 · _cevenBloqueoBorradoMsg: texto claro ════════════════════════════ */
console.log('\n2 · _cevenBloqueoBorradoMsg');
{
  const e = cargar('poly');
  const m1 = e._cevenBloqueoBorradoMsg('0007', { donde: 'pipeline', proyecto: 'Sala A', estado: 'Cotizado' });
  ok(/#0007/.test(m1) && /pipeline/.test(m1) && /Sala A/.test(m1) && /Quitala del pipeline/.test(m1),
     'menciona el número, el pipeline, el proyecto y qué hacer', m1);
  const m2 = e._cevenBloqueoBorradoMsg('0009', { donde: 'archivo', mes: '2026-08', proyecto: '', estado: 'Facturado' });
  ok(/archivado/.test(m2) && /ago 2026/.test(m2), 'para el archivo dice el mes legible', m2);
}

/* ═══ 3 · deleteQ: bloquea si está en el pipeline, si no borra normal ═════ */
console.log('\n3 · deleteQ(qn)');
{
  const e = cargar('poly');
  e._db = [ filaDB('0007'), filaDB('0099') ];
  e._pipeline = [ { qNum: '0007', proyecto: 'Sala A', estado: 'Cotizado', monto: 1000 } ];

  e.deleteQ('0007');
  ok(e._savedDB === undefined && !e._papelera, 'no toca ni la base ni la papelera cuando está en el pipeline');
  ok(e._toasts.some(t => /pipeline/.test(t)), 'avisa por qué no se borró', JSON.stringify(e._toasts));
  ok(e._db.length === 2, 'las dos cotizaciones siguen en el historial');

  e.deleteQ('0099');
  ok(e._papelera && e._papelera.length === 1 && e._papelera[0].qn === '0099', 'la que NO está en el pipeline sí va a la papelera');
  ok(e._savedDB && e._savedDB.length === 1 && e._savedDB[0]['N° Cotización'] === '0007',
     'y se saca del historial (queda solo la 0007)', JSON.stringify(e._savedDB && e._savedDB.map(r => r['N° Cotización'])));
}

/* ═══ 4 · deleteSelected: borra las libres, deja las bloqueadas ══════════ */
console.log('\n4 · deleteSelected() con selección mixta');
{
  const e = cargar('poly');
  e._db = [ filaDB('0007'), filaDB('0010'), filaDB('0011') ];
  e._pipeline = [ { qNum: '0007', proyecto: 'Sala A', estado: 'Cotizado', monto: 1000 } ];
  e.histSel = { '0007': true, '0010': true, '0011': true };

  e.deleteSelected();
  const papQns = (e._papelera || []).map(x => x.qn).sort();
  ok(papQns.join(',') === '0010,0011', 'solo 0010 y 0011 van a la papelera (0007 no)', JSON.stringify(papQns));
  ok(e._savedDB && e._savedDB.map(r => r['N° Cotización']).join(',') === '0007', 'en el historial queda solo la 0007', JSON.stringify(e._savedDB && e._savedDB.map(r => r['N° Cotización'])));
  ok(e.histSel['0007'] === true && !e.histSel['0010'] && !e.histSel['0011'], 'la bloqueada queda marcada, las borradas no');
  ok(e._toasts.some(t => /no se borraron/.test(t) && /pipeline/.test(t)), 'avisa cuántas no se borraron', JSON.stringify(e._toasts));
  ok(e._undo.length === 1 && /2 cotización/.test(e._undo[0].msg), 'el cartel de deshacer cuenta 2, no 3', e._undo[0] && e._undo[0].msg);
}
{
  // Todas bloqueadas: no borra nada, avisa, ni siquiera arma la papelera.
  const e = cargar('poly');
  e._db = [ filaDB('0007'), filaDB('0008') ];
  e._pipeline = [ { qNum: '0007' }, { qNum: '0008' } ];
  e.histSel = { '0007': true, '0008': true };
  e.deleteSelected();
  ok(!e._papelera && e._savedDB === undefined, 'ninguna se borró');
  ok(e._toasts.some(t => /No se puede/.test(t)), 'un solo aviso de que ninguna se puede', JSON.stringify(e._toasts));
}

/* ═══ 5 · Las 3 marcas con pipeline tienen el mismo comportamiento ═══════ */
console.log('\n5 · Apple / Poly / Legamaster: mismo bloqueo');
['apple', 'poly', 'legamaster'].forEach(function(marca){
  const e = cargar(marca);
  e._db = [ filaDB('0007') ];
  e._pipeline = [ { qNum: '0007', proyecto: 'P', estado: 'Cotizado', monto: 1 } ];
  e.deleteQ('0007');
  ok(e._savedDB === undefined && e._toasts.some(t => /pipeline/.test(t)),
     marca + ': deleteQ() no borra una cotización que está en el pipeline');
});

/* ═══ 6 · Cableado: pipeline-group.js antes de history.js, no en multi ═══ */
console.log('\n6 · orden de <script> en los index.html');
['apple', 'poly', 'legamaster'].forEach(function(marca){
  const html = fs.readFileSync(path.join(ROOT, 'src/' + marca + '/index.html'), 'utf8');
  const iGroup = html.indexOf('shared/pipeline-group.js');
  const iHist  = html.indexOf('js/history.js');
  ok(iGroup !== -1 && iHist !== -1 && iGroup < iHist,
     marca + ': shared/pipeline-group.js se carga ANTES que history.js', JSON.stringify({ iGroup, iHist }));
});
{
  const multi = fs.readFileSync(path.join(ROOT, 'src/multi/index.html'), 'utf8');
  ok(multi.indexOf('shared/pipeline-group.js') === -1,
     'el multimarca NO carga pipeline-group.js (no tiene pipeline) — el typeof guard cubre el resto');
}

console.log('\n' + (fallos
  ? ('✗ ' + fallos + ' de ' + corridas + ' fallaron\n')
  : ('✓ ' + corridas + '/' + corridas + ' OK\n')));
process.exit(fallos ? 1 : 0);
