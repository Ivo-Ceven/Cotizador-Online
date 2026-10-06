#!/usr/bin/env node
/* ============================================================================
   check-pipe-facturacion.js · Cotizadores Ceven
   ----------------------------------------------------------------------------
   El mes de facturación del pipeline, de punta a punta, con el `savePipeline()`
   REAL (src/shared/pipeline-store.js) + src/shared/pipeline-facturacion.js:

     1. Sellado: al pasar a Facturado, `mesCierre` pasa al mes actual y se guarda
        `mesFact`/`fechaFact`/`mesCierreAntes` (caso cierre en diciembre que se
        factura antes).
     2. Reversión: si el Facturado era un error y se cambia de estado, vuelve el
        cierre estimado y no queda rastro. Una corrección manual del mes gana.
     3. Por línea: una línea con estado propio Facturado lleva su `skuMesFact`.
     4. Backfill: lo ya Facturado sin `mesFact` toma el mes de `fechaMod`;
        idempotente; no mueve `fechaMod`.
     5. Split al pasar de mes: lo facturado queda en el padre en su mes y lo
        pendiente pasa a una cotización nueva "(artículos pendientes)"; los
        montos suman lo mismo, no se duplica en una segunda pasada.

   Uso:  node scripts/check-pipe-facturacion.js
   ========================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
let fallos = 0;
function ok(cond, nombre, detalle){
  if(cond){ console.log('  ✓ ' + nombre); return; }
  fallos++;
  console.error('  ✗ ' + nombre + (detalle ? ('\n      ' + detalle) : ''));
}

const mesDe = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
const CUR = mesDe(new Date());
const hace = (n) => { const d = new Date(); d.setMonth(d.getMonth() - n, 1); return mesDe(d); };
const fut = (n) => { const d = new Date(); d.setMonth(d.getMonth() + n, 1); return mesDe(d); };
const MP = hace(2);            // mes pasado
const isoDeMes = (mk) => mk + '-15T12:00:00.000Z';

function nuevoCtx(pipeInicial, dbInicial, pipeCols){
  const store = { cpipeline: JSON.stringify(pipeInicial || []), cquotes: JSON.stringify(dbInicial || []) };
  let cqc = 100;
  const toasts = [];
  const ctx = {
    console, cevenEsc: (s) => String(s),
    CEVEN_BRAND: { padCols: {}, pipeCols: pipeCols || ['id'] },
    cevenK: (b) => b,
    cevenLsJSON: (k, d) => { try { return JSON.parse(store[k]); } catch(e) { return d; } },
    cevenLsSet: (k, v) => { store[k] = String(v); return true; },
    autoSnapshot: () => {},
    getDB: () => JSON.parse(store.cquotes),
    saveDB: (db) => { store.cquotes = JSON.stringify(db); return true; },
    cevenOpcFilasDeCotiz: (db, qn) => db.filter(r => r['N° Cotización'] === qn),
    cevenReservarQNum: () => ++cqc,
    cevenQNumFmt: (n) => String(n).padStart(4, '0'),
    cevenQIdLegacy: (qn) => 'q' + qn,
    _pipeMontoDeItems: (its) => its.reduce((a, i) => a + i.qty * i.salePrice, 0),
    cevenCanUsePipeline: () => true,
    showToast: (m) => toasts.push(m),
    renderPipeline: () => {}
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  ['src/shared/pipeline-status.js', 'src/shared/pipeline-sku.js',
   'src/shared/pipeline-store.js', 'src/shared/pipeline-facturacion.js']
    .forEach(f => vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, {filename: f}));
  ctx._store = store; ctx._toasts = toasts;
  ctx.pipe = () => JSON.parse(store.cpipeline);
  return ctx;
}

const fila = (id, estado, mes, extra) => Object.assign({
  id: id, qNum: String(id).padStart(4, '0'), fecha: '01/01/2026', cliente: 'Canal ' + id,
  proyecto: 'Proy ' + id, ejecutivo: 'Ana', estado: estado, mesCierre: mes, monto: 100
}, extra || {});
const linea = (qn, sku, cant, precio) => ({
  'N° Cotización': qn, 'SKU': sku, 'Descripción': sku, 'Cantidad': cant, 'P. Venta Unitario': precio,
  'Proyecto': 'Proy', 'Cliente': 'Canal', 'Ejecutivo': 'Ana', 'Tipo': 'producto', 'Opción': 1, '_opcEf': 1, '_qid': 'qid-' + qn
});

/* ═══ 1 · Sellado ═════════════════════════════════════════════════════════ */
console.log('\n1 · Al pasar a Facturado, la fila queda en el mes en que se facturó');
{
  const c = nuevoCtx([fila(1, 'Negociacion', fut(2))]);
  const p = c.pipe(); p[0].estado = 'Facturado'; c.savePipeline(p);
  const r = c.pipe()[0];
  ok(r.mesCierre === CUR, 'cierre estimado a futuro → pasa al mes actual', 'mesCierre=' + r.mesCierre);
  ok(r.mesFact === CUR && !!r.fechaFact, 'se guarda mesFact y fechaFact');
  ok(r.mesCierreAntes === fut(2), 'se recuerda el cierre estimado previo');

  const p2 = c.pipe(); p2[0].comentario = 'x'; c.savePipeline(p2);
  ok(c.pipe()[0].mesFact === CUR && c.pipe()[0].mesCierreAntes === fut(2), 're-guardar sin cambiar el estado no re-sella');
}

/* ═══ 2 · Reversión ═══════════════════════════════════════════════════════ */
console.log('\n2 · Si el Facturado era un error, no queda rastro');
{
  const c = nuevoCtx([fila(1, 'Negociacion', fut(2))]);
  let p = c.pipe(); p[0].estado = 'Facturado'; c.savePipeline(p);
  p = c.pipe(); p[0].estado = 'Negociacion'; c.savePipeline(p);
  const r = c.pipe()[0];
  ok(r.mesCierre === fut(2), 'vuelve el cierre estimado original', 'mesCierre=' + r.mesCierre);
  ok(!r.mesFact && !r.fechaFact && !r.mesCierreAntes, 'se borran mesFact, fechaFact y mesCierreAntes');

  // Corrección manual del mes sobre una fila Facturada: mesFact sigue al mes real,
  // y si después se revierte el estado vuelve el cierre estimado original.
  const c2 = nuevoCtx([fila(2, 'Commit', fut(3))]);
  p = c2.pipe(); p[0].estado = 'Facturado'; c2.savePipeline(p);
  p = c2.pipe(); p[0].mesCierre = hace(1); c2.savePipeline(p);
  ok(c2.pipe()[0].mesFact === hace(1), 'editar el mes a mano sobre una fila Facturada corrige mesFact');
  p = c2.pipe(); p[0].estado = 'Commit'; c2.savePipeline(p);
  ok(c2.pipe()[0].mesCierre === fut(3) && !c2.pipe()[0].mesFact, 'revertir el estado devuelve el cierre estimado original aunque el mes se haya corregido');
}

/* ═══ 3 · Por línea ═══════════════════════════════════════════════════════ */
console.log('\n3 · Una línea con estado propio Facturado lleva su mes');
{
  const c = nuevoCtx([fila(1, 'Negociacion', fut(1))]);
  let p = c.pipe(); p[0].skuStatus = {'A|0': 'Facturado'}; c.savePipeline(p);
  let r = c.pipe()[0];
  ok(r.skuMesFact && r.skuMesFact['A|0'] === CUR, 'la línea queda sellada con el mes actual');
  ok(r.mesCierre === fut(1) && !r.mesFact, 'la fila (con pendientes) conserva su cierre estimado');
  p = c.pipe(); p[0].skuStatus = {'A|0': 'Negociacion', 'B|1': 'Perdido'}; c.savePipeline(p);
  r = c.pipe()[0];
  ok(!r.skuMesFact, 'si la línea deja de estar Facturada, se borra su sello');
}

/* ═══ 4 · Backfill ════════════════════════════════════════════════════════ */
console.log('\n4 · Backfill de lo que ya estaba Facturado');
{
  const c = nuevoCtx([
    fila(1, 'Facturado', fut(2), {fechaMod: isoDeMes(MP)}),
    fila(2, 'Cotizado', fut(1), {fechaMod: isoDeMes(MP)}),
    fila(3, 'Cotizado', fut(1), {fechaMod: isoDeMes(MP), skuStatus: {'A|0': 'Facturado'}})
  ]);
  c.cevenFactBackfill();
  const [a, b, d] = c.pipe();
  ok(a.mesFact === MP && a.mesCierre === MP && a.mesCierreAntes === fut(2), 'Facturado: mesFact y mesCierre = mes de fechaMod');
  ok(a.fechaMod === isoDeMes(MP), 'no mueve fechaMod (cambio del sistema)');
  ok(!b.mesFact && b.mesCierre === fut(1), 'una fila no Facturada no se toca');
  ok(d.skuMesFact && d.skuMesFact['A|0'] === MP, 'una línea Facturada con estado propio recibe su mes');
  const antes = JSON.stringify(c.pipe());
  c.cevenFactBackfill();
  ok(JSON.stringify(c.pipe()) === antes, 'idempotente: una segunda pasada no cambia nada');
  ok(c.cevenFactMesDeISO('06/10/2026') === '2026-10', "fecha dd/mm/aaaa ('06/10/2026') es octubre, no junio");
}

/* ═══ 5 · Split ═══════════════════════════════════════════════════════════ */
console.log('\n5 · Al pasar de mes, lo pendiente pasa a una cotización nueva');
{
  const db = [linea('0001', 'A', 1, 100), linea('0001', 'B', 2, 50), linea('0001', 'C', 1, 30)];
  const row = fila(1, 'Negociacion', fut(1), {
    monto: 230, skuStatus: {'A|0': 'Facturado', 'C|2': 'Perdido'}, skuMesFact: {'A|0': MP}, fechaMod: isoDeMes(CUR)
  });
  const c = nuevoCtx([row], db);
  const n = c.cevenFactSplit();
  const pipe = c.pipe();
  const padre = pipe.find(r => r.id === 1);
  const hija = pipe.find(r => r.id !== 1);
  ok(n === 1 && pipe.length === 2, 'se parte una fila y aparece una nueva');
  ok(padre.estado === 'Facturado' && padre.mesCierre === MP && padre.mesFact === MP,
     'el padre queda Facturado en el mes en que se facturó', JSON.stringify(padre));
  ok(padre.monto === 130, 'el padre suma lo facturado y lo perdido (A 100 + C 30)', 'monto=' + padre.monto);
  ok(hija && hija.proyecto === 'Proy 1 (artículos pendientes)', 'la hija se llama "(artículos pendientes)"');
  ok(hija.monto === 100 && padre.monto + hija.monto === 230, 'montos: la hija suma lo pendiente y el total no cambia');
  ok(hija.mesCierre === fut(1), 'la hija conserva el cierre estimado (si es futuro)');
  ok(hija.estado === 'Negociacion' && !hija.skuStatus, 'la hija hereda el estado de lo pendiente');
  ok(hija.id === 1 + 3e15, 'id de la hija determinístico');
  ok(hija.qNum !== padre.qNum, 'la hija tiene número de cotización nuevo');
  ok(padre.skuStatus && padre.skuStatus['C|1'] === 'Perdido', 'el padre reindexa sus líneas (C pasa a la posición 1)');

  const nueva = c.getDB();
  ok(nueva.filter(r => r['N° Cotización'] === '0001').map(r => r['SKU']).join() === 'A,C', 'cquotes: el padre conserva A y C');
  const lh = nueva.filter(r => r['N° Cotización'] === hija.qNum);
  ok(lh.length === 1 && lh[0]['SKU'] === 'B' && lh[0]['Proyecto'] === hija.proyecto, 'cquotes: la hija recibe B');
  ok(lh[0]['_qid'] === 'qid-0001-pend', 'la identidad de la cotización hija es determinística');
  ok(padre.fechaMod === isoDeMes(CUR), 'el split no mueve fechaMod del padre');

  const antes = JSON.stringify(c.pipe());
  ok(c.cevenFactSplit() === 0 && JSON.stringify(c.pipe()) === antes, 'idempotente: una segunda pasada no vuelve a partir');
}
{
  // Facturada ESTE mes + pendiente: todavía no se parte.
  const db = [linea('0001', 'A', 1, 100), linea('0001', 'B', 1, 50)];
  const c = nuevoCtx([fila(1, 'Negociacion', fut(1), {skuStatus: {'A|0': 'Facturado'}, skuMesFact: {'A|0': CUR}})], db);
  ok(c.cevenFactSplit() === 0 && c.pipe().length === 1, 'lo facturado este mes no se parte hasta que cambie el mes');
}
{
  // Facturada en mes pasado, pendiente con cierre vencido: la hija cae al mes actual.
  const db = [linea('0001', 'A', 1, 100), linea('0001', 'B', 1, 50)];
  const c = nuevoCtx([fila(1, 'Negociacion', hace(1), {skuStatus: {'A|0': 'Facturado'}, skuMesFact: {'A|0': MP}})], db);
  c.cevenFactSplit();
  const hija = c.pipe().find(r => r.id !== 1);
  ok(hija && hija.mesCierre === CUR, 'si el cierre estimado ya venció, la hija entra al mes actual');
}
{
  // Un proyecto que ya termina en "(artículos pendientes)" no duplica el sufijo.
  const db = [linea('0001', 'A', 1, 100), linea('0001', 'B', 1, 50)];
  const c = nuevoCtx([fila(1, 'Negociacion', fut(1), {proyecto: 'X (artículos pendientes)', skuStatus: {'A|0': 'Facturado'}, skuMesFact: {'A|0': MP}})], db);
  c.cevenFactSplit();
  ok(c.pipe().find(r => r.id !== 1).proyecto === 'X (artículos pendientes)', 'no se repite el sufijo');
}

/* ═══ 6 · Apple: lo facturado se archiva, lo pendiente sigue marcado ═════════ */
console.log('\n6 · Apple: porción facturada archivada, el resto queda "(artículos pendientes)"');
{
  let _pipe = [{id: 1, qNum: '0001', fecha: '01/01/2026', cliente: 'Canal', proyecto: 'Proy', ejecutivo: 'Ana',
    estado: 'Con OC', mesCierre: fut(1), monto: 150, skuStatus: {'A|0': 'Facturado'}, skuMesCierre: {'A|0': MP}}];
  const _archive = {};
  const db = [linea('0001', 'A', 1, 100), linea('0001', 'B', 1, 50)];
  const ctx = {
    console, getPipeline: () => _pipe, savePipeline: (p) => { _pipe = p; return true; },
    getArchive: () => _archive, saveArchive: () => true, currentMonthKey: () => CUR,
    getDB: () => db, cevenOpcFilasDeCotiz: (d, qn) => d.filter(r => r['N° Cotización'] === qn),
    categorize: () => 'acc', showToast: () => {}, cevenMesLabel: (k) => k, renderPipeline: () => {}
  };
  ctx.window = ctx; vm.createContext(ctx);
  ['src/shared/pipeline-facturacion.js', 'src/apple/js/pipeline-data.js']
    .forEach(f => vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, {filename: f}));
  ctx.archiveOldEntries();
  ok(_archive[MP] && _archive[MP][0].proyecto === 'Proy' && _archive[MP][0].monto === 100,
     'la porción facturada se archiva en su mes con el nombre original', JSON.stringify(_archive));
  ok(_pipe[0].proyecto === 'Proy (artículos pendientes)', 'la fila viva queda marcada como pendiente', _pipe[0].proyecto);
  ok(_pipe[0].skuArchivedQty && _pipe[0].skuArchivedQty['A|0'] === 1, 'skuArchivedQty descuenta lo archivado (sin doble conteo)');
  ctx.archiveOldEntries();
  ok(_pipe[0].proyecto === 'Proy (artículos pendientes)' && _archive[MP].length === 1, 'idempotente: no repite sufijo ni duplica el archivo');
}

console.log(fallos ? ('\n✗ ' + fallos + ' fallo(s)') : '\n✓ todo en orden');
process.exit(fallos ? 1 : 0);
