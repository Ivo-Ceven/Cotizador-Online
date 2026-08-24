#!/usr/bin/env node
/* ============================================================================
   check-combo-cliente.js · Cotizadores Ceven
   ----------------------------------------------------------------------------
   El desplegable del campo Cliente (shared/clientes.js), que reemplazo al
   <datalist> nativo.

   Se verifica lo que NO se ve mirando la pantalla:

     · el plegado de acentos tiene que conservar el LARGO, porque el resaltado
       busca sobre el texto plegado y corta sobre el original. Si se corriera un
       caracter, "Peñaflor" saldria resaltado a la mitad;
     · el colapso de espacios va SOLO en la funcion de buscar y no en la de
       plegar, justamente por lo anterior — y no puede comerse la letra "s"
       (paso: un `/s+/g` sin la barra dejaba "Sysmex" en "yxme");
     · el nombre del cliente es texto libre que se sincroniza con todo el equipo
       y se interpola en el HTML del desplegable: tiene que ir escapado;
     · el orden es "los que empiezan con lo tipeado primero", que es lo que el
       datalist nativo NO hacia y el motivo de todo esto.

   Uso:  node scripts/check-combo-cliente.js
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

/* El combo es un IIFE: sus funciones no salen al scope global a proposito. Para
   poder probarlas se engancha una linea de export al final del archivo REAL —
   no se copia ni se reescribe nada de la logica. */
const MARCA = 'window.cevenClienteComboClose = cerrar;';
const EXPORT = MARCA + ' window._probe = {_plegar:_plegar, _fold:_fold, _resaltar:_resaltar,'
             + ' _filtrar:_filtrar, _todos:_todos};';

function cargar(nombres, fichas){
  const store = {'poly_cclientes': JSON.stringify(fichas || {})};
  // Un <datalist> de mentira con la misma forma que el real: la unica fuente
  // de datos del combo son sus <option>.
  const dl = { querySelectorAll: () => (nombres || []).map(n => ({value: n})) };
  const ctx = {
    console,
    document: {
      getElementById: id => (id === 'cliente-datalist' ? dl : null),
      querySelectorAll: () => [],
      addEventListener: () => {}
    },
    addEventListener: () => {},
    localStorage: {
      getItem: k => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: k => { delete store[k]; }
    },
    CEVEN_BRAND: { prefix: 'poly_', priceTiers: [
      {v:'Ceven - Tier 1', lbl:'Tier 1'}, {v:'Ceven - Tier 2', lbl:'Tier 2'},
      {v:'Ceven - Tier 3', lbl:'Tier 3'}, {v:'Negocios Especiales', lbl:'Neg. Especiales'}
    ]},
    cevenK: b => 'poly_' + b,
    cevenLsSet: (k, v) => { store[k] = String(v); return true; },
    cevenLsJSON: (k, d) => { try{ return JSON.parse(store[k]) || d; }catch(e){ return d; } },
    cevenEsc: s => String(s == null ? '' : s)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;').replace(/'/g,'&#39;')
  };
  ctx.window = ctx;
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  const src = fs.readFileSync(path.join(ROOT, 'src/shared/clientes.js'), 'utf8');
  if(src.indexOf(MARCA) === -1) throw new Error('cambió el marcador de export en clientes.js');
  vm.runInContext(src.replace(MARCA, EXPORT), ctx, {filename: 'src/shared/clientes.js'});
  return ctx;
}

const NOMBRES = ['Banco Galicia','Camuzzi Gas Pampeana','Cervecería y Maltería Quilmes',
  'Grupo Peñaflor','Newtech SA','Qualix SRL','Sysmex Argentina','Telecom Argentina'];
const FICHAS = {
  'banco galicia': {nombre:'Banco Galicia', tier:'Ceven - Tier 1'},
  'qualix srl':    {nombre:'Qualix SRL',    tier:'Negocios Especiales'}
};

console.log('\nDesplegable del campo Cliente · shared/clientes.js\n');

const e = cargar(NOMBRES, FICHAS);
const p = e._probe;

/* ═══ 1 · Plegado de acentos ═══════════════════════════════════════════════ */
console.log('1 · Buscar sin acentos encuentra igual, y sin correr los índices');
{
  ok(p._plegar('Peñaflor') === 'penaflor', 'la ñ se pliega a n', 'dio ' + p._plegar('Peñaflor'));
  ok(p._plegar('Cervecería') === 'cerveceria', 'y los acentos se van');
  /* El invariante que sostiene todo el resaltado. */
  ['Peñaflor','Cervecería y Maltería Quilmes','Bagó','ÁÉÍÓÚñÜ'].forEach(function(n){
    ok(p._plegar(n).length === n.length, 'plegar "' + n + '" conserva el largo',
       n.length + ' → ' + p._plegar(n).length);
  });
}

/* ═══ 2 · La función de buscar sí colapsa espacios ═════════════════════════ */
console.log('\n2 · La de buscar colapsa espacios; la de plegar no puede');
{
  ok(p._fold('  Banco   Galicia ') === 'banco galicia', 'espacios de más y de los costados se van',
     JSON.stringify(p._fold('  Banco   Galicia ')));
  ok(p._plegar('  Banco   Galicia ') === '  banco   galicia ',
     'plegar los deja tal cual (si no, el resaltado se correría)',
     JSON.stringify(p._plegar('  Banco   Galicia ')));
  /* Regresión concreta: un `/s+/g` sin la barra invertida no colapsa espacios,
     se come la letra "s" — "Sysmex" quedaba "yxme" y no matcheaba con nada. */
  ok(p._fold('Sysmex') === 'sysmex', 'la letra "s" NO se come', JSON.stringify(p._fold('Sysmex')));
  ok(p._fold('Sysmex Argentina') === 'sysmex argentina', 'ni siquiera con un espacio al lado');
}

/* ═══ 3 · Resaltado ════════════════════════════════════════════════════════ */
console.log('\n3 · Se resalta la parte que matchea, en el lugar correcto');
{
  ok(p._resaltar('Telecom Argentina', 'argent') === 'Telecom <b>Argent</b>ina',
     'en el medio del nombre', p._resaltar('Telecom Argentina', 'argent'));
  ok(p._resaltar('Grupo Peñaflor', 'penaflor') === 'Grupo <b>Peñaflor</b>',
     'buscando sin acento, resalta el nombre CON acento y completo',
     p._resaltar('Grupo Peñaflor', 'penaflor'));
  ok(p._resaltar('Banco Galicia', '') === 'Banco Galicia', 'sin búsqueda no se resalta nada');
  ok(p._resaltar('Banco Galicia', 'zzz') === 'Banco Galicia', 'ni si no matchea');
}

/* ═══ 4 · Orden: primero los que EMPIEZAN con lo tipeado ═══════════════════ */
console.log('\n4 · Primero los que empiezan con lo tipeado (lo que el datalist nativo no hacía)');
{
  const r = p._filtrar('qu').map(x => x.nombre);
  ok(r[0] === 'Qualix SRL', 'Qualix (empieza) antes que Quilmes (en el medio)', JSON.stringify(r));
  ok(r.indexOf('Cervecería y Maltería Quilmes') === 1, 'y Quilmes igual aparece', JSON.stringify(r));

  const r2 = p._filtrar('galicia').map(x => x.nombre);
  ok(r2.length === 1 && r2[0] === 'Banco Galicia',
     'buscar por una palabra del MEDIO encuentra — el caso que motivó el cambio', JSON.stringify(r2));

  const r3 = p._filtrar('argentina').map(x => x.nombre);
  ok(r3.length === 2, 'dos clientes con "Argentina" en el medio', JSON.stringify(r3));

  ok(p._filtrar('').length === NOMBRES.length, 'sin texto se listan todos');
  ok(p._filtrar('zzzz').length === 0, 'sin coincidencias, lista vacía (el llamador avisa)');
}

/* ═══ 5 · El nivel de precio viaja con cada cliente ════════════════════════ */
console.log('\n5 · Cada cliente trae su nivel de precio, que es el que se le va a aplicar');
{
  const porNombre = {};
  p._filtrar('').forEach(function(x){ porNombre[x.nombre] = x.tier; });
  ok(porNombre['Banco Galicia'] === 'Ceven - Tier 1', 'el de la ficha', porNombre['Banco Galicia']);
  ok(porNombre['Qualix SRL'] === 'Negocios Especiales', 'y el de Negocios Especiales');
  ok(!porNombre['Newtech SA'],
     'un cliente sin ficha no inventa un nivel (todavía no tiene uno recordado)',
     JSON.stringify(porNombre['Newtech SA']));
}

/* ═══ 6 · Sin datalist no explota ══════════════════════════════════════════ */
console.log('\n6 · Casos borde');
{
  const vacio = cargar([], {});
  ok(vacio._probe._todos().length === 0, 'sin clientes cargados devuelve lista vacía, no rompe');
  ok(vacio._probe._filtrar('lo que sea').length === 0, 'y filtrar sobre nada tampoco');

  const conBasura = cargar(['', 'Real SA', ''], {});
  ok(conBasura._probe._todos().length === 1, 'las <option> vacías no entran como cliente');
}

/* ═══ 7 · El nombre es texto libre y va escapado ═══════════════════════════ */
console.log('\n7 · El nombre del cliente se interpola en el HTML del desplegable');
{
  const x = cargar(['<img src=x onerror=alert(1)>', 'Fulano & Cía "SA"'], {});
  const h1 = x._probe._resaltar('<img src=x onerror=alert(1)>', 'img');
  ok(h1.indexOf('<img') === -1, 'un nombre con <img> no entra como etiqueta', h1);
  /* Las ÚNICAS etiquetas que puede haber en la salida son las <b> del propio
     resaltado. El `<` del nombre queda como &lt; — partido por el <b> en este
     caso, así que no alcanza con buscar "&lt;img" de corrido. */
  ok(h1.replace(/<\/?b>/g, '').indexOf('<') === -1, 'todo otro < viene escapado', h1);
  ok(/<b>img<\/b>/.test(h1), 'y el resaltado sigue cayendo donde corresponde', h1);
  const h2 = x._probe._resaltar('Fulano & Cía "SA"', '');
  ok(h2 === 'Fulano &amp; Cía &quot;SA&quot;', 'el & y las comillas también', h2);
}

/* ═══ 8 · El <datalist> quedó como fuente de datos, no como desplegable ════ */
console.log('\n8 · Las tres marcas dejaron de usar el desplegable nativo');
{
  ['src/poly/index.html', 'src/apple/index.html', 'src/multi/index.html'].forEach(function(f){
    const s = fs.readFileSync(path.join(ROOT, f), 'utf8');
    const campo = (s.match(/<input id="client"[^>]*>/) || [''])[0];
    ok(campo.indexOf('list="cliente-datalist"') === -1,
       path.basename(path.dirname(f)) + ': el input ya no abre el desplegable nativo', campo);
    ok(campo.indexOf('autocomplete="off"') !== -1,
       path.basename(path.dirname(f)) + ': ni el autocompletado del navegador');
    /* El <datalist> SIGUE en el HTML y tiene que seguir: es de donde el combo
       lee los nombres, y lo llenan cevenRefreshClienteDatalist() (local) y
       cevenClientesDbRefreshDatalist() (la tabla `clientes`, por red). */
    ok(s.indexOf('<datalist id="cliente-datalist">') !== -1,
       path.basename(path.dirname(f)) + ': pero el <datalist> queda como fuente de datos');
  });
}

console.log('\n' + (fallos
  ? ('✗ ' + fallos + ' de ' + corridas + ' fallaron\n')
  : ('✓ ' + corridas + '/' + corridas + ' OK\n')));
process.exit(fallos ? 1 : 0);
