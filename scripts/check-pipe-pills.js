#!/usr/bin/env node
/* ============================================================================
   check-pipe-pills.js · Cotizadores Ceven
   ----------------------------------------------------------------------------
   Los dos controles del dashboard del pipeline, los dos en
   src/shared/pipeline-ui.js: "Top canales" (cevenPintarTopClientes) y "Cierre
   estimado" (cevenPintarPillsMes). Desde 08/09/2026 ya no son pastillas: son
   dos <select>, y cada <option> lleva la info que antes vivía en la pastilla
   (medalla/puesto, cantidad de proyectos y monto para los canales; proyectos y
   monto para los meses).

   Existe porque estos errores no rompen nada y por eso no se ven. Top canales
   mostraba números que parecían razonables: ordenaba por cantidad de filas en
   vez de por plata, contaba lo perdido, se calculaba sobre el pipeline entero
   ignorando los filtros que el resto del dashboard sí respetaba, y trataba
   "ACME" y "acme " como dos clientes.

   De las de mes se verifica que "Sin fecha" NO aparezca cuando no hay ninguna
   fila sin fecha, y sobre todo el agujero que eso abre: si el filtro activo
   apunta a una opción que dejó de existir, vuelve a "Todos" en vez de dejar la
   tabla vacía sin nada seleccionado.

   Corre las funciones REALES contra filas armadas a mano.

   Uso:  node scripts/check-pipe-pills.js
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

// Un <div> de mentira que solo guarda su innerHTML: las funciones ya no
// recorren hijos ni miden ancho (el <select> reemplazó al "achicar a una fila").
function nodo(){
  return {
    _html: '',
    get innerHTML(){ return this._html; },
    set innerHTML(v){ this._html = v; }
  };
}

function cargar(){
  const box = nodo();
  const mes = nodo();
  const fila = nodo();
  const buscador = { value: '' };
  const ctx = {
    console,
    document: {
      getElementById: id => {
        if(id === 'pipe-topclients-pills') return box;
        if(id === 'pipe-month-pills') return mes;
        if(id === 'pipe-pills-row') return fila;
        if(id === 'pipe-search') return buscador;
        return null;
      },
      querySelectorAll: () => [],
      /* clientes.js cablea el combo del campo Cliente con listeners delegados en
         document/window al cargarse. No se ejercita nada de eso acá —lo que se
         verifica son los controles del pipeline— pero sin estos stubs el
         archivo revienta al evaluarse y no se llega a correr ni un chequeo. */
      addEventListener: () => {}
    },
    addEventListener: () => {},
    cevenEsc: s => String(s == null ? '' : s)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;').replace(/'/g,'&#39;'),
    fI: n => Math.round(n).toLocaleString('es-AR'),
    renderPipeline(){},
    CEVEN_BRAND: { pipeSortDescCols: [] }
  };
  ctx.window = ctx;
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  // clientes.js aporta cevenNormClient; pipeline-group.js, cevenPipeGroupBy.
  for(const f of ['src/shared/clientes.js', 'src/shared/pipeline-group.js', 'src/shared/pipeline-ui.js']){
    vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, {filename: f});
  }
  ctx._box = box;
  ctx._mes = mes;
  ctx._buscador = buscador;
  return ctx;
}

// Los canales del <select>, en orden, sin la opción "" ("Todos los canales").
function ordenCanales(html){
  const out = [];
  const re = /<option value="([^"]*)"/g;
  let m;
  while((m = re.exec(html)) !== null){ if(m[1] !== '') out.push(m[1]); }
  return out;
}
// [{value, label, selected}] de cada <option>.
function opciones(html){
  const out = [];
  const re = /<option value="([^"]*)"( selected)?>([^<]*)<\/option>/g;
  let m;
  while((m = re.exec(html)) !== null) out.push({value: m[1], label: m[3], selected: !!m[2]});
  return out;
}
function seleccionada(html){
  const s = opciones(html).filter(o => o.selected);
  return s.length === 1 ? s[0].value : (s.length === 0 ? null : '<varias>');
}

const fila = (cliente, monto, estado, extra) =>
  Object.assign({cliente: cliente, monto: monto, estado: estado || 'Cotizado'}, extra || {});

console.log('\nTop canales del pipeline · shared/pipeline-ui.js\n');

/* ═══ 1 · Ordena por PLATA, no por cantidad de filas ════════════════════════ */
console.log('1 · Ordena por monto, no por cantidad de proyectos');
{
  const e = cargar();
  e.cevenPintarTopClientes([
    fila('Chico SA', 500),  fila('Chico SA', 500),
    fila('Chico SA', 500),  fila('Chico SA', 500),   // 4 proyectos, USD 2.000
    fila('Grande SA', 200000)                        // 1 proyecto,  USD 200.000
  ]);
  const orden = ordenCanales(e._box.innerHTML);
  ok(orden[0] === 'Grande SA',
     'el canal de USD 200.000 en un solo proyecto va primero',
     'quedó ' + JSON.stringify(orden));
  ok(orden[1] === 'Chico SA', 'y el de 4 proyectos chicos, segundo');
  ok(/USD 200\.000/.test(e._box.innerHTML), 'la opción muestra el monto');
  ok(/· 4 proy/.test(e._box.innerHTML), 'y la cantidad de proyectos');
  ok(/^<select /.test(e._box.innerHTML) && /class="pipe-flt-sel"/.test(e._box.innerHTML),
     'el control es un <select class="pipe-flt-sel">');
}

/* ═══ 2 · Lo perdido no cuenta ═════════════════════════════════════════════ */
console.log('\n2 · Un canal al que se le perdió todo no es un "top canal"');
{
  const e = cargar();
  e.cevenPintarTopClientes([
    fila('Perdedora SA', 900000, 'Perdido'),
    fila('Real SA', 1000)
  ]);
  const orden = ordenCanales(e._box.innerHTML);
  ok(orden.indexOf('Perdedora SA') === -1, 'el canal con todo perdido no aparece', JSON.stringify(orden));
  ok(orden[0] === 'Real SA', 'y queda el que sí tiene negocio abierto');
}
{
  const e = cargar();
  e.cevenPintarTopClientes([
    fila('Mixta SA', 900000, 'Perdido'),
    fila('Mixta SA', 5000, 'Commit')
  ]);
  ok(/USD 5\.000/.test(e._box.innerHTML),
     'de un canal con parte perdida se cuenta solo lo que sigue vivo', e._box.innerHTML);
}
{
  const e = cargar();
  e.cevenPintarTopClientes([fila('Factura SA', 80000, 'Facturado')]);
  ok(/USD 80\.000/.test(e._box.innerHTML),
     'lo FACTURADO sí cuenta: es plata que entró (a diferencia de "Total pipeline", que pregunta otra cosa)');
}

/* ═══ 3 · Mismo canal escrito distinto ════════════════════════════════════ */
console.log('\n3 · "ACME" y "acme " son el mismo canal');
{
  const e = cargar();
  e.cevenPintarTopClientes([
    fila('ACME S.A.', 1000), fila('acme s.a. ', 1000), fila('ACME  S.A.', 1000),
    fila('Otra SA', 2500)
  ]);
  const orden = ordenCanales(e._box.innerHTML);
  ok(orden.length === 2, 'quedan 2 canales, no 4', JSON.stringify(orden));
  ok(/USD 3\.000/.test(e._box.innerHTML), 'y las tres grafías suman USD 3.000 juntas');
  ok(orden[0] === 'ACME S.A.',
     'se muestra la grafía más usada (el mismo criterio que el agrupado de la tabla)',
     'quedó ' + orden[0]);
}

/* ═══ 4 · Respeta los filtros ══════════════════════════════════════════════ */
console.log('\n4 · Sale de las filas filtradas, igual que las tarjetas de al lado');
{
  const e = cargar();
  // Lo que recibe es lo YA filtrado: el que filtra es renderPipeline().
  e.cevenPintarTopClientes([fila('Solo Septiembre SA', 7000)]);
  const orden = ordenCanales(e._box.innerHTML);
  ok(orden.length === 1 && orden[0] === 'Solo Septiembre SA',
     'con un filtro que deja una sola fila, hay una sola opción de canal', JSON.stringify(orden));
  ok(/USD 7\.000/.test(e._box.innerHTML), 'y el monto es el de esa fila, no el del pipeline entero');
}

/* ═══ 5 · Casos borde ══════════════════════════════════════════════════════ */
console.log('\n5 · Casos borde');
{
  const e = cargar();
  e.cevenPintarTopClientes([]);
  ok(/<select[^>]* disabled/.test(e._box.innerHTML) && /Todos los canales/.test(e._box.innerHTML),
     'sin filas el <select> queda deshabilitado con solo "Todos los canales"');
}
{
  const e = cargar();
  e.cevenPintarTopClientes([fila('', 100), fila('—', 200), fila('Real SA', 50)]);
  const orden = ordenCanales(e._box.innerHTML);
  ok(orden.length === 1 && orden[0] === 'Real SA',
     'las filas sin canal no arman una opción "(sin cliente)"', JSON.stringify(orden));
}
{
  const e = cargar();
  const muchos = [];
  for(let i = 1; i <= 9; i++) muchos.push(fila('Cliente ' + i, i * 1000));
  e.cevenPintarTopClientes(muchos);
  const orden = ordenCanales(e._box.innerHTML);
  ok(orden.length === 9, 'ahora entran todos (el <select> scrollea), no solo 5', 'dio ' + orden.length);
  ok(orden[0] === 'Cliente 9' && orden[8] === 'Cliente 1', 'de mayor a menor por monto',
     JSON.stringify(orden));
}
{
  const e = cargar();
  const muchos = [];
  for(let i = 1; i <= 80; i++) muchos.push(fila('C' + i, i));
  e.cevenPintarTopClientes(muchos);
  ok(ordenCanales(e._box.innerHTML).length === 60, 'pero nunca más de 60 (un <select> gigante no ayuda)');
}
{
  const e = cargar();
  e.cevenPintarTopClientes([fila('B SA', 1000), fila('A SA', 1000)]);
  const orden = ordenCanales(e._box.innerHTML);
  ok(orden[0] === 'A SA',
     'a igual monto e igual cantidad, alfabético: el orden no puede bailar entre renders',
     JSON.stringify(orden));
}
{
  const e = cargar();
  e.cevenPintarTopClientes([fila('Sin monto SA', undefined), fila('Con monto SA', 10)]);
  const orden = ordenCanales(e._box.innerHTML);
  ok(orden.length === 2, 'un canal sin monto igual aparece (no se cae ni desaparece)', JSON.stringify(orden));
  ok(orden[0] === 'Con monto SA', 'pero abajo del que tiene monto');
}
{
  const e = cargar();
  e.cevenPintarTopClientes([fila('Uno SA', 3000), fila('Dos SA', 2000), fila('Tres SA', 1000), fila('Cuatro SA', 500)]);
  const html = e._box.innerHTML;
  ok(/🥇 Uno SA/.test(html) && /🥈 Dos SA/.test(html) && /🥉 Tres SA/.test(html),
     'los tres primeros llevan medalla');
  ok(/>4\. Cuatro SA/.test(html), 'del cuarto en adelante, el puesto en número');
}

/* ═══ 6 · La opción activa ════════════════════════════════════════════════ */
console.log('\n6 · La opción del canal buscado queda seleccionada');
{
  const e = cargar();
  e._buscador.value = '  acme s.a.  ';       // el usuario eligió ACME
  e.cevenPintarTopClientes([fila('ACME S.A.', 5000), fila('Otra SA', 100)]);
  ok(seleccionada(e._box.innerHTML) === 'ACME S.A.',
     'queda seleccionada la de ACME, aunque el buscador tenga otra grafía y espacios de más',
     JSON.stringify(seleccionada(e._box.innerHTML)));
}
{
  const e = cargar();
  e._buscador.value = '';
  e.cevenPintarTopClientes([fila('ACME S.A.', 5000)]);
  ok(seleccionada(e._box.innerHTML) === '', 'sin búsqueda, "Todos los canales"');
}

/* ═══ 7 · El nombre del canal no puede ejecutar código ════════════════════ */
console.log('\n7 · El nombre del canal viaja escapado (el pipeline se sincroniza con todo el equipo)');
{
  const e = cargar();
  e.cevenPintarTopClientes([fila('\\\');alert(1);//', 1000), fila('<img src=x onerror=alert(1)>', 900)]);
  const html = e._box.innerHTML;
  ok(html.indexOf('<img') === -1, 'un nombre con <img> no entra como etiqueta');
  ok(html.indexOf('&lt;img src=x onerror=') !== -1, 'queda como texto escapado, no como HTML');
  ok(html.indexOf("');alert(1)") === -1 && html.indexOf('&#39;);alert(1)') !== -1,
     'la comilla simple del nombre viaja escapada');
  ok(!/onclick=/.test(html) && /<option value="/.test(html),
     'el nombre va en value="" de un <option>, sin onclick');
}

/* ═══ 8 · Apple y Poly llaman a la función compartida, sin copias locales ══ */
console.log('\n8 · Apple y Poly llaman a la función compartida, sin copias locales');
{
  const apple = fs.readFileSync(path.join(ROOT, 'src/apple/js/pipeline-view.js'), 'utf8');
  const poly  = fs.readFileSync(path.join(ROOT, 'src/poly/js/pipeline-view.js'), 'utf8');
  ok(/cevenPintarTopClientes\(/.test(apple), 'Apple la llama');
  ok(/cevenPintarTopClientes\(/.test(poly),  'Poly la llama');
  const marca = (src) => /pipe-mpill.*data-cli|data-cli=.*pipe-mpill/.test(src) || /topClientsBox/.test(src);
  ok(!marca(apple), 'Apple ya no arma el control por su cuenta');
  ok(!marca(poly),  'Poly tampoco');
  // El que se le pasa NO puede ser el pipeline entero: ese era el error viejo.
  ok(/cevenPintarTopClientes\(sinBuscar\)/.test(apple) && /cevenPintarTopClientes\(sinBuscar\)/.test(poly),
     'las dos le pasan las filas filtradas (`sinBuscar`), no `pipe`');
}


/* ═══ 9 · Selector de "Cierre estimado" ═══════════════════════════════════ */
console.log('\n9 · "Sin fecha" solo aparece si hay alguna fila sin fecha');
{
  const e = cargar();
  e.window._pipeMonthFilter = '';
  const r = e.cevenPintarPillsMes(['2026-08','2026-09'], false);
  const vals = opciones(e._mes.innerHTML).map(o => o.value);
  ok(vals.indexOf('sin-fecha') === -1, 'sin filas sin fecha, la opción NO se pinta', JSON.stringify(vals));
  ok(vals.length === 3 && vals[0] === '', 'quedan "Todos" + los dos meses', JSON.stringify(vals));
  ok(r === '', 'y el filtro sigue vacío');
  ok(/^<select /.test(e._mes.innerHTML) && /onchange="pipeSetMonthFilter/.test(e._mes.innerHTML),
     'el control es un <select> que llama a pipeSetMonthFilter');
}
{
  const e = cargar();
  e.window._pipeMonthFilter = '';
  e.cevenPintarPillsMes(['2026-08'], true);
  const vals = opciones(e._mes.innerHTML).map(o => o.value);
  ok(vals.indexOf('sin-fecha') === 1, 'con alguna fila sin fecha, aparece justo después de "Todos"',
     JSON.stringify(vals));
}

console.log('\n10 · Las etiquetas y el orden de los meses');
{
  const e = cargar();
  e.window._pipeMonthFilter = '';
  e.cevenPintarPillsMes(['2026-08','2026-09','2027-01'], true);
  const lbl = opciones(e._mes.innerHTML).map(o => o.label);
  ok(JSON.stringify(lbl) === JSON.stringify(['Todos los meses','Sin fecha','Ago 2026','Sep 2026','Ene 2027']),
     'se leen como "Ago 2026" y en el orden en que se pasaron', JSON.stringify(lbl));
}
{
  const e = cargar();
  e.window._pipeMonthFilter = '';
  e.cevenPintarPillsMes(['basura'], false);
  const lbl = opciones(e._mes.innerHTML).map(o => o.label);
  ok(lbl[1] === 'basura', 'un valor que no tiene forma de mes se muestra crudo en vez de "undefined NaN"',
     JSON.stringify(lbl));
}

console.log('\n10b · La info "de top" en las opciones (cuando se pasan las filas)');
{
  const e = cargar();
  e.window._pipeMonthFilter = '';
  const rows = [
    {mesCierre: '2026-08', monto: 10000},
    {mesCierre: '2026-09', monto: 50000},
    {mesCierre: '2026-09', monto: 30000},
    {mesCierre: '',        monto: 1000}
  ];
  e.cevenPintarPillsMes(['2026-08','2026-09'], true, rows);
  const html = e._mes.innerHTML;
  ok(/Todos los meses · 4 proy · USD 91\.000/.test(html), 'la opción "Todos" suma todo lo pasado');
  ok(/Sin fecha · 1 proy · USD 1\.000/.test(html), '"Sin fecha" trae su propio total');
  ok(/Sep 2026 · 2 proy · USD 80\.000/.test(html), 'cada mes trae proyectos y monto');
  ok(/🔝 Sep 2026/.test(html) && !/🔝 Ago 2026/.test(html), 'el 🔝 marca el mes con más plata');
}
{
  const e = cargar();
  e.window._pipeMonthFilter = '';
  e.cevenPintarPillsMes(['2026-08'], false);   // sin `rows`
  ok(!/proy · USD/.test(e._mes.innerHTML), 'sin filas pasadas, las opciones van sin info (compatibilidad)');
}

console.log('\n11 · Un filtro que apunta a algo que ya no existe vuelve a "Todos"');
{
  const e = cargar();
  e.window._pipeMonthFilter = 'sin-fecha';
  const r = e.cevenPintarPillsMes(['2026-08'], false);
  ok(r === '', 'devuelve "" para que el llamador filtre por eso y no por el valor viejo', JSON.stringify(r));
  ok(e.window._pipeMonthFilter === '', 'y lo deja limpio en el estado global');
  ok(seleccionada(e._mes.innerHTML) === '', 'y en el <select> queda seleccionada "Todos", no nada');
}
{
  const e = cargar();
  e.window._pipeMonthFilter = '2026-08';
  const r = e.cevenPintarPillsMes(['2026-09'], true);
  ok(r === '', 'lo mismo si se movió la última fila de un mes', JSON.stringify(r));
}
{
  const e = cargar();
  e.window._pipeMonthFilter = '2026-09';
  const r = e.cevenPintarPillsMes(['2026-08','2026-09'], false);
  ok(r === '2026-09', 'un filtro vigente se respeta', JSON.stringify(r));
  ok(seleccionada(e._mes.innerHTML) === '2026-09', 'y su opción queda seleccionada');
  const e2 = cargar();
  e2.window._pipeMonthFilter = 'sin-fecha';
  ok(e2.cevenPintarPillsMes([], true) === 'sin-fecha',
     '"Sin fecha" se respeta mientras siga habiendo filas sin fecha');
}

console.log('\n12 · Las dos marcas usan la función compartida');
{
  const apple2 = fs.readFileSync(path.join(ROOT, 'src/apple/js/pipeline-view.js'), 'utf8');
  const poly2  = fs.readFileSync(path.join(ROOT, 'src/poly/js/pipeline-view.js'), 'utf8');
  ok(/monthFilter = cevenPintarPillsMes\(/.test(apple2),
     'Apple la llama Y se queda con lo que devuelve (si no, pinta una cosa y filtra otra)');
  ok(/monthFilter = cevenPintarPillsMes\(/.test(poly2), 'Poly también');
  ok(!/_mPill/.test(apple2) && !/_mPill/.test(poly2), 'ninguna dejó su copia local');
  ok(/!r\.skuMesCierre \|\| !Object\.keys\(r\.skuMesCierre\)\.length/.test(apple2.split('cevenPintarPillsMes')[0]),
     'Apple detecta "sin fecha" con la misma condición que usa para filtrar');
}

console.log('\n' + (fallos
  ? ('✗ ' + fallos + ' de ' + corridas + ' fallaron\n')
  : ('✓ ' + corridas + '/' + corridas + ' OK\n')));
process.exit(fallos ? 1 : 0);
