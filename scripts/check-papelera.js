#!/usr/bin/env node
/* ============================================================================
   check-papelera.js · Cotizadores Ceven
   ----------------------------------------------------------------------------
   La papelera guarda 30 días lo que se elimina del historial. Lo que se
   verifica acá es sobre todo lo que NO se ve mirando la pantalla:

     · que borrar sea atómico hacia el lado seguro. Si `cpapelera` no se puede
       guardar (cuota llena), la cotización NO se saca de `cquotes`. Al revés
       desaparecía de las dos partes, y eso no se nota hasta que alguien la
       busca;
     · que la purga se lleve lo vencido y SOLO lo vencido;
     · que restaurar no mezcle líneas de dos cotizaciones bajo el mismo número;
     · que los permisos valgan también acá (la papelera es compartida).

   No se mockea el reloj: las entradas de prueba se escriben con la fecha de
   borrado ya corrida hacia atrás, que es lo mismo que mira el código real.

   Uso:  node scripts/check-papelera.js
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

const DIA = 86400000;
function fila(qn, sku, extra){
  return Object.assign({
    'N° Cotización': qn, 'Fecha': '07/08/2026', 'Cliente': 'Vista Energy',
    'Proyecto': 'Sala Directorio', 'Ejecutivo': 'Tsu Rivas',
    'SKU': sku, 'Descripción': 'Poly ' + sku, 'Cantidad': 1,
    'P. Venta Unitario': 100, 'Total': 100
  }, extra || {});
}

function cargar(opts){
  opts = opts || {};
  const store = {};
  /* Con `fallaClave` el error de cuota se provoca a propósito y cevenLsSet() lo
     reporta por consola, como debe. Se silencia solo ahí para que el ✗ de un
     test que falle de verdad no quede enterrado en un volcado de stack. */
  const ctx = {
    console: opts.fallaClave
      ? Object.assign({}, console, { error(){}, warn(){} })
      : console,
    location: { href: 'https://cotizadores-ceven.vercel.app/poly/index.html', hash: '' },
    navigator: { userAgent: 'node' },
    localStorage: {
      getItem: k => (k in store ? store[k] : null),
      setItem: (k, v) => {
        // Simula la cuota llena para una clave puntual (ver el test de atomicidad).
        if(opts.fallaClave && k.indexOf(opts.fallaClave) !== -1){
          const err = new Error('quota'); err.name = 'QuotaExceededError'; throw err;
        }
        store[k] = String(v);
      },
      removeItem: k => { delete store[k]; }
    },
    document: {
      readyState: 'complete',
      getElementById: () => null,       // sin DOM: renderPapelera() sale sola
      addEventListener(){}
    },
    // Rol por defecto: admin (puede todo). Los tests de permiso lo pisan.
    cevenCanEditQuote: () => (opts.puedeEditar === undefined ? true : opts.puedeEditar),
    fD: n => String(n),
    showToast: m => { ctx._toast = m; },
    confirmModal: (msg, onConfirm) => { ctx._confirm = msg; onConfirm(); }   // acepta siempre
  };
  ctx.window = ctx; ctx.self = ctx; ctx.globalThis = ctx;
  vm.createContext(ctx);

  const lee = p => fs.readFileSync(path.join(ROOT, p), 'utf8');
  vm.runInContext(lee('src/poly/brand.js'), ctx);
  vm.runInContext(lee('src/shared/safe.js'), ctx);

  // getDB/saveDB de la marca, sobre el mismo localStorage falso.
  vm.runInContext(`
    function getDB(){ var d = cevenLsJSON(cevenK('cquotes'), []); return Array.isArray(d) ? d : []; }
    function saveDB(db){
      db = db.filter(function(r){ return r['SKU'] && r['Descripción']; });
      return cevenLsSet(cevenK('cquotes'), JSON.stringify(db));
    }
    function renderHistory(){ globalThis._renders = (globalThis._renders||0) + 1; }
  `, ctx);

  vm.runInContext(lee('src/shared/papelera.js'), ctx);
  return { ctx, store };
}

console.log('\nPapelera · 30 días, atomicidad y permisos\n');

/* ---- 1. El viaje de ida: borrar ------------------------------------------ */
{
  const { ctx } = cargar();
  ctx.saveDB([fila('0001','A'), fila('0001','B'), fila('0002','C')]);

  const filas1 = ctx.getDB().filter(r => r['N° Cotización'] === '0001');
  ok(ctx.cevenPapeleraTirar('0001', filas1) === true, 'tirar a la papelera devuelve true');

  ctx.saveDB(ctx.getDB().filter(r => r['N° Cotización'] !== '0001'));
  ok(ctx.getDB().length === 1, 'el historial queda con la otra cotización');

  const p = ctx.cevenPapeleraGet();
  ok(p.length === 1 && p[0].qn === '0001', 'la papelera tiene una entrada');
  ok(p[0].filas.length === 2, 'guardó las DOS líneas de la cotización', String(p[0].filas.length));
  ok(p[0].cliente === 'Vista Energy' && p[0].ejecutivo === 'Tsu Rivas',
     'guardó cliente y ejecutivo para poder mostrarlos sin abrir las filas');
  ok(p[0].total === 200, 'guardó el total sumado', String(p[0].total));
  ok(!isNaN(Date.parse(p[0].borrada)), 'guardó la fecha de borrado en ISO');
}

/* ---- 2. Atomicidad: si no entra en la papelera, no se borra --------------- */
{
  // La cuota falla SOLO para cpapelera: cquotes se puede escribir.
  const { ctx } = cargar({ fallaClave: 'cpapelera' });
  ctx.saveDB([fila('0001','A'), fila('0002','B')]);

  const filas1 = ctx.getDB().filter(r => r['N° Cotización'] === '0001');
  const guardo = ctx.cevenPapeleraTirar('0001', filas1);
  ok(guardo === false, 'con la cuota llena, tirar a la papelera devuelve false');
  ok(ctx.cevenPapeleraGet().length === 0, 'y la papelera quedó vacía');
  // El llamador (history.js) corta acá: es lo que se está verificando.
  ok(ctx.getDB().length === 2,
     'el historial NO se tocó: la cotización sigue estando', String(ctx.getDB().length));
}

/* ---- 3. Varias de una: o entran todas o ninguna --------------------------- */
{
  const { ctx } = cargar({ fallaClave: 'cpapelera' });
  ctx.saveDB([fila('0001','A'), fila('0002','B'), fila('0003','C')]);
  const grupos = ['0001','0002','0003'].map(qn => ({
    qn, filas: ctx.getDB().filter(r => r['N° Cotización'] === qn)
  }));
  ok(ctx.cevenPapeleraTirarVarias(grupos) === false, 'el lote entero falla si no entra');
  ok(ctx.cevenPapeleraGet().length === 0,
     'no quedan entradas a medias', String(ctx.cevenPapeleraGet().length));
}
{
  const { ctx } = cargar();
  ctx.saveDB([fila('0001','A'), fila('0002','B'), fila('0003','C')]);
  const grupos = ['0001','0002','0003'].map(qn => ({
    qn, filas: ctx.getDB().filter(r => r['N° Cotización'] === qn)
  }));
  ok(ctx.cevenPapeleraTirarVarias(grupos) === true, 'el lote entra cuando hay lugar');
  ok(ctx.cevenPapeleraGet().length === 3, 'las tres entradas están');
}

/* ---- 4. Borrar el mismo número dos veces reemplaza, no duplica ------------ */
{
  const { ctx } = cargar();
  ctx.cevenPapeleraTirar('0001', [fila('0001','A')]);
  ctx.cevenPapeleraTirar('0001', [fila('0001','A'), fila('0001','B')]);
  const p = ctx.cevenPapeleraGet();
  ok(p.length === 1, 'sigue habiendo UNA entrada para #0001', String(p.length));
  ok(p[0].filas.length === 2, 'y es la última, no la primera');
}

/* ---- 5. Restaurar --------------------------------------------------------- */
{
  const { ctx } = cargar();
  ctx.saveDB([fila('0002','C')]);
  ctx.cevenPapeleraTirar('0001', [fila('0001','A'), fila('0001','B')]);

  ok(ctx.cevenPapeleraRestaurar('0001') === true, 'restaurar devuelve true');
  const db = ctx.getDB();
  ok(db.length === 3, 'las dos líneas volvieron al historial', String(db.length));
  ok(db.filter(r => r['N° Cotización'] === '0001').length === 2, 'y son las de #0001');
  ok(ctx.cevenPapeleraGet().length === 0, 'la entrada salió de la papelera');
  ok(ctx._renders > 0, 'repintó el historial');
}

/* ---- 6. Restaurar sobre un número que ya existe --------------------------- */
{
  const { ctx } = cargar();
  ctx.saveDB([fila('0001','YA-ESTABA')]);
  ctx.cevenPapeleraTirar('0001', [fila('0001','A')]);

  ok(ctx.cevenPapeleraRestaurar('0001') === false,
     'restaurar se niega si el número ya está en el historial');
  ok(/Ya existe una cotización #0001/.test(ctx._toast || ''), 'y lo explica', ctx._toast);
  ok(ctx.getDB().length === 1, 'no mezcló líneas de dos cotizaciones');
  ok(ctx.cevenPapeleraGet().length === 1, 'la entrada sigue en la papelera, no se perdió');
}

/* ---- 7. La purga de los 30 días ------------------------------------------ */
{
  const { ctx, store } = cargar();
  const ahora = Date.now();
  store[ctx.cevenK('cpapelera')] = JSON.stringify([
    { qn: 'VIEJA',  borrada: new Date(ahora - 31 * DIA).toISOString(), filas: [fila('VIEJA','A')] },
    { qn: 'JUSTO',  borrada: new Date(ahora - 29 * DIA).toISOString(), filas: [fila('JUSTO','B')] },
    { qn: 'HOY',    borrada: new Date(ahora).toISOString(),            filas: [fila('HOY','C')] },
    { qn: 'SINFECHA', borrada: 'cualquier cosa',                       filas: [fila('SINFECHA','D')] }
  ]);

  ok(ctx.cevenPapeleraPurgar() === 1, 'la purga se lleva UNA entrada');
  const qns = ctx.cevenPapeleraGet().map(e => e.qn);
  ok(qns.indexOf('VIEJA') === -1, 'se fue la de 31 días');
  ok(qns.indexOf('JUSTO') !== -1, 'quedó la de 29 días');
  ok(qns.indexOf('HOY') !== -1, 'quedó la de hoy');
  ok(qns.indexOf('SINFECHA') !== -1,
     'una entrada con fecha ilegible NO se tira (ante la duda, no se pierde nada)');
  ok(ctx.cevenPapeleraPurgar() === 0, 'purgar de nuevo no saca nada más (es idempotente)');
}

/* ---- 8. Días restantes ---------------------------------------------------- */
{
  const { ctx } = cargar();
  const ahora = Date.now();
  const dr = e => ctx.cevenPapeleraDiasRestantes(e);
  ok(dr({ borrada: new Date(ahora).toISOString() }) === 30, 'recién borrada: 30 días');
  ok(dr({ borrada: new Date(ahora - 29 * DIA).toISOString() }) === 1, 'a los 29 días: queda 1');
  ok(dr({ borrada: new Date(ahora - 31 * DIA).toISOString() }) === 0, 'vencida: 0');
  ok(dr({ borrada: 'ilegible' }) === 30, 'sin fecha usable se muestra el plazo entero');
}

/* ---- 9. El "Deshacer" del cartel saca de la papelera ---------------------- */
{
  const { ctx } = cargar();
  ctx.cevenPapeleraTirar('0001', [fila('0001','A')]);
  ctx.cevenPapeleraTirar('0002', [fila('0002','B')]);
  ctx.cevenPapeleraSacar(['0001']);
  const qns = ctx.cevenPapeleraGet().map(e => e.qn);
  ok(qns.length === 1 && qns[0] === '0002',
     'deshacer saca solo esa entrada, sin preguntar ni restaurar', qns.join(','));
}

/* ---- 10. Permisos --------------------------------------------------------- */
{
  const { ctx } = cargar({ puedeEditar: false });
  ctx.cevenPapeleraTirar('0001', [fila('0001','A')]);

  ok(ctx.cevenPapeleraRestaurar('0001') === false, 'sin permiso no se puede restaurar');
  ok(/permiso/.test(ctx._toast || ''), 'y lo dice', ctx._toast);
  ok(ctx.cevenPapeleraGet().length === 1, 'la entrada sigue ahí');

  ctx._confirm = null;
  ctx.cevenPapeleraBorrarDef('0001');
  ok(ctx._confirm === null, 'sin permiso no llega ni a preguntar por el borrado definitivo');
  ok(ctx.cevenPapeleraGet().length === 1, 'y no borró nada');

  ctx.cevenPapeleraVaciar();
  ok(ctx.cevenPapeleraGet().length === 1, 'vaciar no toca lo que no podés eliminar');
  ok(/No hay cotizaciones que puedas eliminar/.test(ctx._toast || ''), 'y lo explica', ctx._toast);
}

/* ---- 11. Borrado definitivo y vaciado (con permiso) ---------------------- */
{
  const { ctx } = cargar();
  ctx.cevenPapeleraTirar('0001', [fila('0001','A')]);
  ctx.cevenPapeleraTirar('0002', [fila('0002','B')]);

  ctx.cevenPapeleraBorrarDef('0001');
  ok(ctx.cevenPapeleraGet().length === 1, 'el borrado definitivo saca esa entrada');
  ok(/no se puede deshacer/.test(ctx._confirm || ''), 'y avisa que no tiene vuelta', ctx._confirm);

  ctx.cevenPapeleraVaciar();
  ok(ctx.cevenPapeleraGet().length === 0, 'vaciar deja la papelera en cero');
}

/* ---- 12. `cpapelera` sincroniza en las DOS marcas ------------------------- */
{
  const lee = p => fs.readFileSync(path.join(ROOT, p), 'utf8');
  ['poly', 'apple'].forEach(marca => {
    const src = lee('src/' + marca + '/brand.js');
    const m = src.match(/settingKeys:\s*\[([^\]]*)\]/);
    ok(!!m && /'cpapelera'/.test(m[1]),
       marca + ': `cpapelera` está en settingKeys (si no, la papelera no sincroniza)');
  });
  ok(/'\.\/shared\/papelera\.js'/.test(lee('src/sw.js')),
     'papelera.js está en el precache del service worker');
}

console.log('\n' + (fallos ? '✗ ' + fallos + '/' + corridas + ' FALLARON' : '✓ ' + corridas + '/' + corridas + ' OK') + '\n');
process.exit(fallos ? 1 : 0);
