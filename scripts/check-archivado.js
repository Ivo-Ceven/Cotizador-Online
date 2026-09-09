#!/usr/bin/env node
/* ============================================================================
   check-archivado.js · Cotizadores Ceven
   ----------------------------------------------------------------------------
   Las dos pasadas que corren al entrar al pipeline (src/<marca>/js/
   pipeline-data.js), en orden:

     rollOverdueEntries()  — toda fila ABIERTA con cierre estimado en un mes
                             pasado se mueve al mes actual y se marca
                             `mesAutoRoll` (una sola vez).
     archiveOldEntries()   — toda fila CERRADA (Facturado/Perdido) de un mes
                             pasado se va al archivo (📦 cajita).

   Abierta/cerrada particionan: una fila nunca la tocan las dos.

   El bug histórico del archivado: `savePipeline(toKeep)` estaba gateado por
   "¿archivé algo NUEVO?" (`moved > 0`), no por "¿el pipeline vivo cambió?".
   Una fila que YA estaba en el archivo pero seguía viva en el pipeline (la
   resucitó una carrera de sync entre `carchive` —blob de app_settings— y la
   tabla `pipeline` —fila por fila—) quedaba excluida de `toKeep` PERO el
   guardado no se disparaba, así que figuraba en los dos lados para siempre.

   Corre las funciones REALES de cada marca contra un pipeline armado a mano.

   Uso:  node scripts/check-archivado.js
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

// Un mes anterior al actual, en formato 'YYYY-MM'.
function mesPasado(){
  const d = new Date();
  d.setMonth(d.getMonth() - 2);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}

const CUR = (() => {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
})();

/* Monta el pipeline-data.js de una marca con el pipeline y el archivo que se le
   pasen, corre la(s) función(es) que pida `fns`, y devuelve el estado final.
   Las dependencias que no hacen al caso van con stubs mínimos. */
function montar(marca, pipeInicial, archiveInicial, fns){
  let _pipe = JSON.parse(JSON.stringify(pipeInicial));
  let _archive = JSON.parse(JSON.stringify(archiveInicial || {}));
  const ctx = {
    console,
    getPipeline: () => _pipe,
    savePipeline: (p) => { _pipe = p; return true; },   // ignora {systemChange} a propósito
    getArchive:  () => _archive,
    saveArchive: (a) => { _archive = a; return true; },
    currentMonthKey: () => CUR,
    getDB: () => [],
    cevenOpcFilasDeCotiz: () => [],
    // Sin overrides por SKU en estos casos: el estado efectivo es el de la fila.
    cevenSkuTieneOverrides: () => false,
    cevenSkuEstadosDe: (r) => [r.estado || 'Cotizado'],
    cevenMesLabel: (k) => k,
    categorize: () => 'acc',
    showToast: () => {},
    renderPipeline: () => {},
    _selectArchiveMonth: () => {},
    autoSnapshot: () => {}
  };
  ctx.window = ctx;
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'src/' + marca + '/js/pipeline-data.js'), 'utf8'),
    ctx, {filename: marca + '/js/pipeline-data.js'});
  (fns || ['archiveOldEntries']).forEach(function(fn){ ctx[fn](); });
  return { pipe: _pipe, archive: _archive };
}
const correr     = (m, p, a) => montar(m, p, a, ['archiveOldEntries']);
const correrRoll = (m, p, a) => montar(m, p, a, ['rollOverdueEntries']);
const correrNav  = (m, p, a) => montar(m, p, a, ['rollOverdueEntries', 'archiveOldEntries']);

const MP = mesPasado();
const fila = (id, estado, mes) => ({
  id: id, qNum: String(id).padStart(4, '0'), fecha: '01/01/2026',
  cliente: 'Canal ' + id, proyecto: 'Cliente final ' + id, ejecutivo: 'Ana',
  estado: estado, mesCierre: mes, monto: 1000 * id
});

['poly', 'legamaster', 'apple'].forEach(function(marca){
  console.log('\n' + marca.toUpperCase() + ' · archiveOldEntries()\n');

  /* 1 · Lo normal: Facturado/Perdido de mes pasado se archiva y sale del vivo. */
  {
    const r = correr(marca, [
      fila(1, 'Facturado', MP),
      fila(2, 'Cotizado', MP),                 // abierto: se queda
      fila(3, 'Perdido', MP)
    ], {});
    const ids = r.pipe.map(x => x.id).sort();
    ok(JSON.stringify(ids) === '[2]', 'solo queda en el vivo el proyecto abierto', JSON.stringify(ids));
    const arc = (r.archive[MP] || []).map(x => x.id).filter(x => x != null).sort();
    ok(JSON.stringify(arc) === '[1,3]', 'los cerrados quedaron en el archivo del mes', JSON.stringify(arc));
  }

  /* 2 · EL BUG: una fila YA archivada que seguía viva en el pipeline (carrera de
     sync) tiene que salir del vivo aunque no se archive nada "nuevo". */
  {
    const yaArchivada = fila(7, 'Facturado', MP);
    const r = correr(marca,
      [ yaArchivada, fila(8, 'Cotizado', MP) ],   // 7 sigue viva Y ya está en el archivo
      { [MP]: [ JSON.parse(JSON.stringify(yaArchivada)) ] });
    const ids = r.pipe.map(x => x.id).sort();
    ok(JSON.stringify(ids) === '[8]', 'la fila ya archivada se saca del pipeline vivo igual', JSON.stringify(ids));
    ok((r.archive[MP] || []).filter(x => x.id === 7).length === 1,
       'y NO se duplica en el archivo (queda una sola vez)');
  }

  /* 3 · Nada que hacer: no se toca el archivo ni el pipeline. */
  {
    const r = correr(marca, [ fila(9, 'Commit', MP), fila(10, 'Cotizado', '') ], {});
    ok(r.pipe.length === 2, 'sin cerrados de meses pasados, el pipeline queda igual');
    ok(Object.keys(r.archive).length === 0, 'y el archivo sigue vacío');
  }

  /* 4 · Un Facturado del MES ACTUAL no se archiva (todavía no cerró el mes). */
  {
    const r = correr(marca, [ fila(11, 'Facturado', CUR) ], {});
    ok(r.pipe.length === 1, 'Facturado del mes en curso se queda en el pipeline vivo');
  }

  /* ─── rollOverdueEntries() ─── */

  /* 5 · Una fila ABIERTA con cierre vencido se mueve al mes actual y se marca. */
  {
    const r = correrRoll(marca, [
      fila(20, 'Cotizado', MP),
      fila(21, 'Commit', MP),
      fila(22, 'Facturado', MP),     // cerrada: NO se rollea (es de archiveOldEntries)
      fila(23, 'Cotizado', CUR),     // ya en el mes actual
      fila(24, 'Cotizado', '')       // sin fecha
    ], {});
    const byId = {}; r.pipe.forEach(x => byId[x.id] = x);
    ok(byId[20].mesCierre === CUR && byId[20].mesAutoRoll === MP,
       'abierta vencida → mesCierre al mes actual + mesAutoRoll con el mes viejo',
       JSON.stringify([byId[20].mesCierre, byId[20].mesAutoRoll]));
    ok(byId[21].mesCierre === CUR && byId[21].mesAutoRoll === MP, 'idem para Commit');
    ok(byId[22].mesCierre === MP && byId[22].mesAutoRoll === undefined,
       'la Facturada vencida NO se rollea', JSON.stringify([byId[22].mesCierre, byId[22].mesAutoRoll]));
    ok(byId[23].mesCierre === CUR && byId[23].mesAutoRoll === undefined,
       'la que ya está en el mes actual queda intacta');
    ok(byId[24].mesCierre === '' && byId[24].mesAutoRoll === undefined,
       'la sin fecha de cierre queda intacta');
  }

  /* 6 · Re-roll: `mesAutoRoll` NO se pisa (conserva el PRIMER mes). */
  {
    const f = fila(25, 'Negociacion', MP);
    f.mesAutoRoll = '2020-01';   // ya se auto-movió una vez, hace tiempo
    const r = correrRoll(marca, [ f ], {});
    const row = r.pipe[0];
    ok(row.mesCierre === CUR, 're-roll: mesCierre vuelve a ir al mes actual');
    ok(row.mesAutoRoll === '2020-01', 're-roll: mesAutoRoll conserva el PRIMER mes, no se pisa');
  }

  /* 7 · Flujo real de navegación: roll y LUEGO archivo. Ninguna fila en los dos. */
  {
    const r = correrNav(marca, [
      fila(30, 'Cotizado', MP),      // abierta vencida  → rolleada, sigue viva
      fila(31, 'Facturado', MP),     // cerrada vencida  → archivada
      fila(32, 'Perdido', MP)        // cerrada vencida  → archivada
    ], {});
    const vivos = r.pipe.map(x => x.id).sort();
    const arch = (r.archive[MP] || []).map(x => x.id).filter(x => x != null).sort();
    ok(JSON.stringify(vivos) === '[30]', 'tras roll+archivo, solo la abierta sigue viva', JSON.stringify(vivos));
    ok(r.pipe[0].mesCierre === CUR && r.pipe[0].mesAutoRoll === MP, 'y quedó en el mes actual, marcada');
    ok(JSON.stringify(arch) === '[31,32]', 'las cerradas se fueron a la cajita', JSON.stringify(arch));
    ok(!vivos.some(id => arch.indexOf(id) !== -1), 'ninguna fila figura en el vivo Y en el archivo');
  }
});

console.log('\n' + (fallos
  ? ('✗ ' + fallos + ' de ' + corridas + ' fallaron\n')
  : ('✓ ' + corridas + '/' + corridas + ' OK\n')));
process.exit(fallos ? 1 : 0);
