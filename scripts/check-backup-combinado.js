#!/usr/bin/env node
/* ============================================================================
   check-backup-combinado.js · Cotizadores Ceven
   ----------------------------------------------------------------------------
   El backup COMBINADO de src/shared/backup.js: un solo JSON con las cuatro
   marcas, restaurable desde cualquier cotizador.

   Se prueba lo que no se ve y que, si se rompe, se pierde plata:
     · el snapshot se lleva TODAS las claves de las cuatro marcas, crudas
       (lossless), y NUNCA la sesión ni claves de infraestructura;
     · restaurar escribe cada clave verbatim y deja un flag `cimport_reload`
       POR MARCA para que cada cotizador empuje su parte a Supabase al abrirse;
     · un archivo adulterado no puede inyectar la sesión ni claves ajenas.

   Corre las funciones REALES de backup.js sobre un localStorage de mentira.

   Uso:  node scripts/check-backup-combinado.js
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

/* localStorage de mentira: Map con la misma API mínima que usa backup.js. */
function fakeLS(seed){
  const m = new Map(Object.entries(seed || {}));
  return {
    _m: m,
    getItem: k => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: k => { m.delete(k); },
    get length(){ return m.size; },
    key: i => Array.from(m.keys())[i]
  };
}

/* Monta backup.js con un CEVEN_BRAND dado y un localStorage sembrado.
   Devuelve el ctx (con las funciones globales de backup.js) + el LS. */
function montar(brand, seed){
  const ls = fakeLS(seed);
  const toasts = [];
  const ctx = {
    console,
    CEVEN_BRAND: brand,
    CEVEN_SESSION_KEY: 'ceven_auth_session',
    localStorage: ls,
    sessionStorage: fakeLS({}),
    cevenK: b => (brand.prefix || '') + b,
    cevenLsSet: (k, v) => { ls.setItem(k, v); return true; },
    cevenLsJSON: (k, d) => { try { return JSON.parse(ls.getItem(k)); } catch(e){ return d; } },
    showToast: m => toasts.push(m),
    confirmModal: (msg, onOk) => { ctx._lastConfirm = msg; ctx._confirmOk = onOk; },
    Blob: function(){ }, URL: { createObjectURL: () => 'blob:x', revokeObjectURL: () => {} },
    document: { createElement: () => ({ click(){}, style:{} }), body: { appendChild(){}, removeChild(){} } },
    location: { reload(){ ctx._reloaded = true; } },
    setTimeout: (fn) => fn && fn(),   // corre inmediato para no colgar el test
    XLSX: undefined
  };
  ctx.window = ctx;
  ctx.globalThis = ctx;
  ctx._toasts = toasts;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'src/shared/backup.js'), 'utf8'),
    ctx, { filename: 'shared/backup.js' });
  return ctx;
}

const BRANDS = {
  poly:       { id:'poly',       prefix:'poly_',       settingKeys:['cquotes','cpl','carchive','cqc','cclientes','clogo','clogo_dark','cpapelera'], backupExtraKeys:[], appTag:'CevenCotizadorPoly', backupVersion:1 },
  apple:      { id:'apple',      prefix:'',            settingKeys:['cquotes','cpl','carchive','cnac','cqc','cclientes','ctarget','ctarget_manual','clogo','clogo_dark','cpapelera'], backupExtraKeys:['cnac_neo25_v3'], appTag:'CevenCotizadorApple', backupVersion:1 },
  legamaster: { id:'legamaster', prefix:'legamaster_', settingKeys:['cquotes','cpl','carchive','cqc','cclientes','clogo','clogo_dark','cpapelera'], backupExtraKeys:[], appTag:'CevenCotizadorLegamaster', backupVersion:1 },
  multi:      { id:'multi',      prefix:'multi_',      settingKeys:['cquotes','carchive','cqc','cclientes','clogo','clogo_dark','cpapelera'], backupExtraKeys:[], appTag:'CevenCotizadorMulti', backupVersion:1 }
};

/* Un localStorage con datos de las 4 marcas + basura que NO debe salir. */
function seedTodo(){
  const s = {
    'cdark': '1',
    'ceven_auth_session': '{"access_token":"SECRETO","refresh_token":"SECRETO"}',
    '_ceven_import_reload': '1'
  };
  Object.values(BRANDS).forEach(b => {
    const p = b.prefix;
    s[p + 'cquotes']   = JSON.stringify([{ 'N° Cotización':'0001', SKU:'X', Observaciones:'nota ' + b.id }]);
    s[p + 'cpipeline']  = JSON.stringify([{ id: 1, qNum:'0001', cliente:'Canal', proyecto:'Cli', estado:'Cotizado', monto: 100, mesCierre:'2026-09' }]);
    s[p + 'carchive']   = JSON.stringify({ '2026-08': [{ id: 9 }] });
    s[p + 'cqc']        = '42';
    s[p + 'cclientes']  = JSON.stringify({ acme: { nombre:'ACME' } });
  });
  s['cnac_neo25_v3'] = JSON.stringify({ x: 1 });   // backupExtraKey de Apple
  return s;
}

/* ═══ 1 · publish + snapshot desde CADA marca da lo mismo (las 4 completas) ═ */
['poly', 'apple', 'legamaster', 'multi'].forEach(function(desde){
  console.log('\n1 · buildCombinedFullBackupSnapshot() desde ' + desde.toUpperCase());
  // Cada marca publica su spec al cargar backup.js: se simula montando las 4.
  const seed = seedTodo();
  ['poly', 'apple', 'legamaster', 'multi'].forEach(id => {
    const c = montar(BRANDS[id], seed);
    // el _publishBackupSpec() IIFE ya corrió; copiar lo que publicó al seed común
    const pub = c.localStorage.getItem('_ceven_bkbases_' + id);
    if(pub) seed['_ceven_bkbases_' + id] = pub;
  });
  const ctx = montar(BRANDS[desde], seed);
  const snap = ctx.buildCombinedFullBackupSnapshot();

  ok(snap._app === 'CevenCotizadorFull', 'el _app marca que es el combinado');
  ok(snap._cdark === '1', 'se lleva la preferencia de modo oscuro (una vez)');
  ok(Object.keys(snap.brands).sort().join(',') === 'apple,legamaster,multi,poly',
     'trae las cuatro marcas', Object.keys(snap.brands).join(','));

  ['poly', 'apple', 'legamaster', 'multi'].forEach(id => {
    const all = snap.brands[id]._all;
    const p = BRANDS[id].prefix;
    ok(all[p + 'cquotes'] === seed[p + 'cquotes'], id + ': cquotes crudo, sin parsear (lossless)');
    ok(all[p + 'cpipeline'] === seed[p + 'cpipeline'], id + ': cpipeline crudo');
    ok(all[p + 'cqc'] === '42', id + ': cqc');
  });
  ok(snap.brands.apple._all['cnac_neo25_v3'] === seed['cnac_neo25_v3'],
     'apple: se lleva su backupExtraKey');

  // NADA de secretos ni infraestructura
  let leak = false;
  Object.values(snap.brands).forEach(b => Object.keys(b._all).forEach(k => {
    if(k === 'ceven_auth_session' || k.indexOf('ceven_') === 0 || k.indexOf('_ceven_') === 0) leak = true;
  }));
  ok(!leak, 'NUNCA sale la sesión ni claves _ceven_*/ceven_* al archivo');
});

/* ═══ 2 · restaurar escribe todo verbatim + flag por marca ═════════════════ */
console.log('\n2 · _applyCombinedBackupRestore()');
{
  // snapshot armado desde el seed completo
  const seed = seedTodo();
  ['poly','apple','legamaster','multi'].forEach(id => {
    const c = montar(BRANDS[id], seed);
    seed['_ceven_bkbases_' + id] = c.localStorage.getItem('_ceven_bkbases_' + id);
  });
  const snap = montar(BRANDS.poly, seed).buildCombinedFullBackupSnapshot();

  // navegador vacío, se restaura desde una página de Legamaster
  const ctx = montar(BRANDS.legamaster, { '_ceven_bkbases_poly': seed['_ceven_bkbases_poly'],
    '_ceven_bkbases_apple': seed['_ceven_bkbases_apple'],
    '_ceven_bkbases_legamaster': seed['_ceven_bkbases_legamaster'],
    '_ceven_bkbases_multi': seed['_ceven_bkbases_multi'] });
  ctx._syncPause = () => { ctx._paused = true; };
  ctx._applyCombinedBackupRestore(snap);

  ok(ctx._paused === true, 'pausa la sync antes de escribir');
  ['poly','apple','legamaster','multi'].forEach(id => {
    const p = BRANDS[id].prefix;
    ok(ctx.localStorage.getItem(p + 'cquotes') === seed[p + 'cquotes'], id + ': cquotes restaurado idéntico');
    ok(ctx.localStorage.getItem(p + 'cpipeline') === seed[p + 'cpipeline'], id + ': cpipeline restaurado idéntico');
    ok(ctx.localStorage.getItem(p + 'cimport_reload') === '1', id + ': queda flag cimport_reload para el push');
  });
  ok(ctx.localStorage.getItem('cdark') === '1', 'restaura el modo oscuro');
  ok(ctx.localStorage.getItem('_ceven_import_reload') === '1', 'y el flag global (por si este cotizador es el primero en abrir)');
  ok(ctx._reloaded === true, 'recarga la página al terminar');
}

/* ═══ 3 · archivo adulterado: no inyecta la sesión ni claves ajenas ════════ */
console.log('\n3 · Un backup adulterado no puede inyectar la sesión');
{
  const seed = seedTodo();
  ['poly','apple','legamaster','multi'].forEach(id => {
    const c = montar(BRANDS[id], seed);
    seed['_ceven_bkbases_' + id] = c.localStorage.getItem('_ceven_bkbases_' + id);
  });
  const snap = montar(BRANDS.poly, seed).buildCombinedFullBackupSnapshot();
  // el atacante mete la sesión y una clave que no es del backup
  snap.brands.poly._all['ceven_auth_session'] = '{"access_token":"ROBADO"}';
  snap.brands.poly._all['poly_algo_raro'] = 'inyectado';

  const ctx = montar(BRANDS.poly, {
    '_ceven_bkbases_poly': seed['_ceven_bkbases_poly'],
    '_ceven_bkbases_apple': seed['_ceven_bkbases_apple'],
    '_ceven_bkbases_legamaster': seed['_ceven_bkbases_legamaster'],
    '_ceven_bkbases_multi': seed['_ceven_bkbases_multi']
  });
  ctx._syncPause = () => {};
  ctx._applyCombinedBackupRestore(snap);
  ok(ctx.localStorage.getItem('ceven_auth_session') === null, 'la sesión NO se escribió');
  ok(ctx.localStorage.getItem('poly_algo_raro') === null, 'una clave que no es del backup tampoco');
  ok(ctx.localStorage.getItem('poly_cquotes') === seed['poly_cquotes'], 'lo legítimo sí se restauró');
}

/* ═══ 4 · importFullBackup enruta el formato combinado ════════════════════ */
console.log('\n4 · importFullBackup() distingue el combinado del de una marca');
{
  const ctx = montar(BRANDS.poly, {});
  let ruteado = null;
  ctx._importCombinedBackup = (s) => { ruteado = 'combinado'; };
  const fakeInput = { files: [{ }], value: 'x' };
  // parchear FileReader para entregar el JSON directo
  ctx.FileReader = function(){
    this.readAsText = () => { this.onload({ target: { result: JSON.stringify({ _app:'CevenCotizadorFull', brands:{} }) } }); };
  };
  ctx.importFullBackup(fakeInput);
  ok(ruteado === 'combinado', 'un archivo con _app CevenCotizadorFull va a _importCombinedBackup()');
}

console.log('\n' + (fallos
  ? ('✗ ' + fallos + ' de ' + corridas + ' fallaron\n')
  : ('✓ ' + corridas + '/' + corridas + ' OK\n')));
process.exit(fallos ? 1 : 0);
