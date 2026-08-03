#!/usr/bin/env node
/* ============================================================================
   check-quote-num.js · Cotizadores Ceven
   ----------------------------------------------------------------------------
   Banco de pruebas de shared/quote-num.js: la asignacion del numero de
   cotizacion. Es la logica que producia numeros repetidos entre usuarios y no
   hay forma de verla fallar hasta que dos personas se pisan una cotizacion.

   Corre el modulo REAL (no una copia) contra un localStorage y unas fuentes de
   datos simuladas.

   Uso:  node scripts/check-quote-num.js
   ========================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const SRC  = fs.readFileSync(path.join(ROOT, 'src/shared/quote-num.js'), 'utf8');

let fallos = 0, corridas = 0;
function ok(cond, nombre, detalle){
  corridas++;
  if(cond){ console.log('  ✓ ' + nombre); return; }
  fallos++;
  console.error('  ✗ ' + nombre + (detalle ? ('\n      ' + detalle) : ''));
}

/* Un "navegador": su localStorage, sus datos y el modulo cargado encima. */
function nuevoNavegador(opts){
  opts = opts || {};
  const store = Object.assign({}, opts.store || {});
  const ctx = {
    localStorage: {
      getItem: k => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: k => { delete store[k]; }
    },
    document: { getElementById: () => null },
    window: {
      cevenK: base => 'poly_' + base,
      // cevenLsSet es el guardado "seguro" que ademas marca la clave para sync.
      cevenLsSet: (k, v) => { store[k] = String(v); return true; }
    },
    getDB:       () => opts.db       || [],
    getPipeline: () => opts.pipeline || [],
    getArchive:  () => opts.archive  || {},
    items: []
  };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(SRC, ctx);
  ctx._store = store;
  return ctx;
}

console.log('\n1 · El numero NO se quema al cargar la pagina');
{
  // Antes: state.js hacia el +1 y el setItem en cada carga. Tres F5 = tres numeros.
  const store = { poly_cqc: '70' };
  for(let i = 0; i < 3; i++){
    const nav = nuevoNavegador({ store });
    Object.assign(store, nav._store);
  }
  ok(store.poly_cqc === '70', 'tres cargas seguidas dejan el contador en 70',
     'quedo en ' + store.poly_cqc);
}

console.log('\n2 · El numero se reserva recien al usarlo');
{
  const nav = nuevoNavegador({ store: { poly_cqc: '70' } });
  ok(nav.cevenNextQNum() === 71, 'cevenNextQNum() propone 71 sin persistir');
  ok(nav._store.poly_cqc === '70', 'y el contador sigue en 70');
  ok(nav.cevenReservarQNum() === 71, 'cevenReservarQNum() devuelve 71');
  ok(nav._store.poly_cqc === '71', 'y ahora si el contador quedo en 71');
}

console.log('\n3 · Un contador atrasado no reusa numeros');
{
  // El caso real: el poll bajo el contador, o un navegador limpio arranco en 0.
  const nav = nuevoNavegador({
    store: { poly_cqc: '1' },
    db: [{ 'N° Cotización': '0071' }, { 'N° Cotización': '0068' }],
    pipeline: [{ qNum: '0075' }],
    archive: { '2026-07': [{ qNum: '0080' }] }
  });
  ok(nav.cevenMayorQNumUsado() === 80, 've el mayor numero real (80) en las tres fuentes');
  ok(nav.cevenNextQNum() === 81, 'y propone 81, no 2');
}
{
  const nav = nuevoNavegador({ store: {}, db: [], pipeline: [], archive: {} });
  ok(nav.cevenNextQNum() === 1, 'con todo vacio arranca en 1');
}

console.log('\n4 · El contador nunca baja');
{
  const nav = nuevoNavegador({ store: { poly_cqc: '90' } });
  nav.cevenAnotarQNum(12);      // editQuoteFromHistory de una cotizacion vieja
  ok(nav._store.poly_cqc === '90', 'anotar un numero menor no lo mueve',
     'quedo en ' + nav._store.poly_cqc);
  nav.cevenAnotarQNum(95);
  ok(nav._store.poly_cqc === '95', 'anotar uno mayor si lo sube');
}

console.log('\n5 · Editar del historial vs. colision con otro usuario');
{
  const nav = nuevoNavegador({ store: {} });
  nav.cevenEditandoQNum('0071');
  ok(nav.cevenEsEdicionDe('0071') === true,  'el numero abierto del historial es edicion');
  ok(nav.cevenEsEdicionDe('0072') === false, 'otro numero que ya existe es colision');
  nav.cevenEditandoQNum(null);
  ok(nav.cevenEsEdicionDe('0071') === false, 'empezar una nueva limpia la marca');
}

console.log('\n6 · Formato del numero');
{
  const nav = nuevoNavegador({ store: {} });
  ok(nav.cevenQNumFmt(7) === '0007',      '7 -> 0007');
  ok(nav.cevenQNumFmt(1234) === '1234',   '1234 -> 1234');
  ok(nav.cevenQNumFmt(12345) === '12345', '12345 no se recorta');
}

console.log('\n7 · Merge monotono del contador (funcion REAL de sync.js)');
{
  /* _mergeMonotona() vive dentro del IIFE de sync.js, asi que no se puede
     importar: se extrae su fuente y se evalua con lsGet/rawSet simulados. Es
     feo, pero prueba EL codigo, no una copia que puede quedar desfasada. */
  const syncSrc = fs.readFileSync(path.join(ROOT, 'src/shared/sync.js'), 'utf8');
  const m = syncSrc.match(/function _mergeMonotona\(k, serverVal\)\{[\s\S]*?\n  \}/);
  if(!m){
    fallos++;
    console.error('  ✗ no se encontro _mergeMonotona() en src/shared/sync.js'
      + '\n      (se renombro o cambio de forma: actualizar este chequeo)');
  } else {
    let escrito = null;
    const fn = new Function('lsGet', 'rawSet', m[0] + '; return _mergeMonotona;');

    function merge(local, servidor){
      escrito = null;
      const impl = fn(() => local, (k, v) => { escrito = v; return true; });
      const devuelto = impl('poly_cqc', servidor);
      return { valor: escrito !== null ? escrito : local, subir: devuelto !== null };
    }

    let r = merge('100', '80');
    ok(r.valor === '100' && r.subir === true,  'servidor atrasado (80) no baja el local (100)');
    r = merge('80', '100');
    ok(r.valor === '100' && r.subir === false, 'servidor adelantado (100) gana');
    r = merge('100', '100');
    ok(r.valor === '100' && r.subir === false, 'iguales: no hay nada que subir');
    r = merge(null, '50');
    ok(r.valor === '50' && r.subir === false,  'sin valor local gana el servidor');
    r = merge('50', 'basura');
    ok(r.valor === '50' && r.subir === false,  'un valor no numerico del servidor no rompe nada');
  }
}

console.log('\n8 · Dos usuarios a la vez');
{
  /* A y B abren la app con el mismo contador. Antes los dos tomaban 71 y el
     segundo en guardar borraba la cotizacion del primero. Ahora, cuando el
     numero de A llega por la sync, B lo ve ocupado y toma el siguiente. */
  const compartido = { poly_cqc: '70' };
  const A = nuevoNavegador({ store: compartido, db: [] });
  const B = nuevoNavegador({ store: compartido, db: [] });
  ok(A.cevenNextQNum() === 71 && B.cevenNextQNum() === 71,
     'los dos proponen 71 mientras no se hablan');

  const dbA = [{ 'N° Cotización': '0071' }];          // A guardo primero
  const B2 = nuevoNavegador({ store: { poly_cqc: '71' }, db: dbA });
  ok(B2.cevenNextQNum() === 72,
     'cuando la #0071 de A le llega a B, B propone 72');
}

console.log('\n' + (fallos
  ? ('✗ ' + fallos + ' de ' + corridas + ' fallaron\n')
  : ('✓ ' + corridas + '/' + corridas + ' OK\n')));
process.exit(fallos ? 1 : 0);
