#!/usr/bin/env node
/* ============================================================================
   check-pipe-pills.js · Cotizadores Ceven
   ----------------------------------------------------------------------------
   Las dos filas de pastillas del dashboard del pipeline, las dos en
   src/shared/pipeline-ui.js: "Top clientes" (cevenPintarTopClientes) y "Cierre
   estimado" (cevenPintarPillsMes).

   Existe porque estos errores no rompen nada y por eso no se ven. Top clientes
   mostraba siempre CINCO clientes con medalla y numeros que parecian
   razonables: ordenaba por cantidad de filas en vez de por plata, contaba lo
   perdido, se calculaba sobre el pipeline entero ignorando los filtros que el
   resto del dashboard si respetaba, y trataba "ACME" y "acme " como dos
   clientes. Hay que comparar con la tabla de abajo para darse cuenta.

   De las de mes se verifica que "Sin fecha" NO se pinte cuando no hay ninguna
   fila sin fecha, y sobre todo el agujero que eso abre: si el filtro activo
   apunta a una pastilla que dejo de existir, la tabla queda vacia sin ninguna
   pastilla marcada que lo explique, y la unica salida es "Limpiar filtros".

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

/* Un <div> de mentira que guarda su innerHTML y sabe contar hijos: el "achicar
   a una fila" del final de la funcion los recorre. scrollWidth 0 hace que ese
   while no entre nunca, que es lo que se quiere para verificar el ranking sin
   que el ancho de la ventana lo recorte. */
function nodo(){
  return {
    _html: '', children: [], style: {},
    get innerHTML(){ return this._html; },
    set innerHTML(v){
      this._html = v;
      // Cada pastilla es un <div class="pipe-mpill ...> de primer nivel.
      this.children = (v.match(/<div class="pipe-mpill/g) || []).map(function(){ return {}; });
    },
    removeChild(){ this.children.pop(); },
    get lastElementChild(){ return this.children[this.children.length - 1] || null; },
    scrollWidth: 0, clientWidth: 0
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
         verifica son las pastillas del pipeline— pero sin estos stubs el
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

// El orden en que quedaron las pastillas, por nombre de cliente.
function ordenPastillas(html){
  const out = [];
  const re = /data-cli="([^"]*)"/g;
  let m;
  while((m = re.exec(html)) !== null) out.push(m[1]);
  return out;
}

const fila = (cliente, monto, estado, extra) =>
  Object.assign({cliente: cliente, monto: monto, estado: estado || 'Cotizado'}, extra || {});

console.log('\nTop clientes del pipeline · shared/pipeline-ui.js\n');

/* ═══ 1 · Ordena por PLATA, no por cantidad de filas ════════════════════════ */
console.log('1 · Ordena por monto, no por cantidad de proyectos');
{
  const e = cargar();
  e.cevenPintarTopClientes([
    fila('Chico SA', 500),  fila('Chico SA', 500),
    fila('Chico SA', 500),  fila('Chico SA', 500),   // 4 proyectos, USD 2.000
    fila('Grande SA', 200000)                        // 1 proyecto,  USD 200.000
  ]);
  const orden = ordenPastillas(e._box.innerHTML);
  ok(orden[0] === 'Grande SA',
     'el cliente de USD 200.000 en un solo proyecto va primero',
     'quedó ' + JSON.stringify(orden));
  ok(orden[1] === 'Chico SA', 'y el de 4 proyectos chicos, segundo');
  ok(/USD 200\.000/.test(e._box.innerHTML), 'la pastilla muestra el monto');
  ok(/\(4\)/.test(e._box.innerHTML), 'y la cantidad de proyectos entre paréntesis, como dato secundario');
}

/* ═══ 2 · Lo perdido no cuenta ═════════════════════════════════════════════ */
console.log('\n2 · Un cliente al que se le perdió todo no es un "top cliente"');
{
  const e = cargar();
  e.cevenPintarTopClientes([
    fila('Perdedora SA', 900000, 'Perdido'),
    fila('Real SA', 1000)
  ]);
  const orden = ordenPastillas(e._box.innerHTML);
  ok(orden.indexOf('Perdedora SA') === -1, 'el cliente con todo perdido no aparece', JSON.stringify(orden));
  ok(orden[0] === 'Real SA', 'y queda el que sí tiene negocio abierto');
}
{
  const e = cargar();
  e.cevenPintarTopClientes([
    fila('Mixta SA', 900000, 'Perdido'),
    fila('Mixta SA', 5000, 'Commit')
  ]);
  ok(/USD 5\.000/.test(e._box.innerHTML),
     'de un cliente con parte perdida se cuenta solo lo que sigue vivo', e._box.innerHTML);
}
{
  const e = cargar();
  e.cevenPintarTopClientes([fila('Factura SA', 80000, 'Facturado')]);
  ok(/USD 80\.000/.test(e._box.innerHTML),
     'lo FACTURADO sí cuenta: es plata que entró (a diferencia de "Total pipeline", que pregunta otra cosa)');
}

/* ═══ 3 · Mismo cliente escrito distinto ═══════════════════════════════════ */
console.log('\n3 · "ACME" y "acme " son el mismo cliente');
{
  const e = cargar();
  e.cevenPintarTopClientes([
    fila('ACME S.A.', 1000), fila('acme s.a. ', 1000), fila('ACME  S.A.', 1000),
    fila('Otra SA', 2500)
  ]);
  const orden = ordenPastillas(e._box.innerHTML);
  ok(orden.length === 2, 'quedan 2 clientes, no 4', JSON.stringify(orden));
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
  const orden = ordenPastillas(e._box.innerHTML);
  ok(orden.length === 1 && orden[0] === 'Solo Septiembre SA',
     'con un filtro que deja una sola fila, hay una sola pastilla', JSON.stringify(orden));
  ok(/USD 7\.000/.test(e._box.innerHTML), 'y el monto es el de esa fila, no el del pipeline entero');
}

/* ═══ 5 · Casos borde ══════════════════════════════════════════════════════ */
console.log('\n5 · Casos borde');
{
  const e = cargar();
  e.cevenPintarTopClientes([]);
  ok(/Sin proyectos abiertos/.test(e._box.innerHTML), 'sin filas, lo dice en vez de quedar vacío');
}
{
  const e = cargar();
  e.cevenPintarTopClientes([fila('', 100), fila('—', 200), fila('Real SA', 50)]);
  const orden = ordenPastillas(e._box.innerHTML);
  ok(orden.length === 1 && orden[0] === 'Real SA',
     'las filas sin cliente no arman una pastilla "(sin cliente)"', JSON.stringify(orden));
}
{
  const e = cargar();
  const muchos = [];
  for(let i = 1; i <= 9; i++) muchos.push(fila('Cliente ' + i, i * 1000));
  e.cevenPintarTopClientes(muchos);
  const orden = ordenPastillas(e._box.innerHTML);
  ok(orden.length === 5, 'nunca más de 5 pastillas', 'dio ' + orden.length);
  ok(orden[0] === 'Cliente 9' && orden[4] === 'Cliente 5', 'y son los 5 más grandes, de mayor a menor',
     JSON.stringify(orden));
}
{
  const e = cargar();
  e.cevenPintarTopClientes([fila('B SA', 1000), fila('A SA', 1000)]);
  const orden = ordenPastillas(e._box.innerHTML);
  ok(orden[0] === 'A SA',
     'a igual monto e igual cantidad, alfabético: el orden no puede bailar entre renders',
     JSON.stringify(orden));
}
{
  const e = cargar();
  e.cevenPintarTopClientes([fila('Sin monto SA', undefined), fila('Con monto SA', 10)]);
  const orden = ordenPastillas(e._box.innerHTML);
  ok(orden.length === 2, 'un cliente sin monto igual aparece (no se cae ni desaparece)', JSON.stringify(orden));
  ok(orden[0] === 'Con monto SA', 'pero abajo del que tiene monto');
}

/* ═══ 6 · La pastilla activa ═══════════════════════════════════════════════ */
console.log('\n6 · La pastilla del cliente buscado se marca como activa');
{
  const e = cargar();
  e._buscador.value = '  acme s.a.  ';       // el usuario tocó la pastilla de ACME
  e.cevenPintarTopClientes([fila('ACME S.A.', 5000), fila('Otra SA', 100)]);
  const activas = (e._box.innerHTML.match(/pipe-mpill-on/g) || []).length;
  ok(activas === 1, 'exactamente una pastilla queda activa', 'dio ' + activas);
  ok(/pipe-mpill pipe-mpill-on" data-pill="client" data-act="client" data-cli="ACME S.A."/.test(e._box.innerHTML),
     'y es la de ACME, aunque el buscador tenga otra grafía y espacios de más');
}

/* ═══ 7 · El nombre del cliente no puede ejecutar código ═══════════════════ */
console.log('\n7 · El nombre del cliente viaja escapado (el pipeline se sincroniza con todo el equipo)');
{
  const e = cargar();
  e.cevenPintarTopClientes([fila('\\\');alert(1);//', 1000), fila('<img src=x onerror=alert(1)>', 900)]);
  const html = e._box.innerHTML;
  ok(html.indexOf('<img') === -1, 'un nombre con <img> no entra como etiqueta');
  /* El texto "onerror=" SIGUE estando, y tiene que estar: es parte del nombre
     del cliente y se muestra tal cual. Lo que importa es que el < que lo
     convertiría en una etiqueta esté escapado — así queda como texto inerte. */
  ok(html.indexOf('&lt;img src=x onerror=') !== -1, 'queda como texto escapado, no como HTML');
  /* La comilla simple del nombre `\');alert(1);//` tampoco puede quedar cruda:
     era lo que cerraba el string del onclick viejo. */
  ok(html.indexOf("');alert(1)") === -1 && html.indexOf('&#39;);alert(1)') !== -1,
     'la comilla simple del nombre viaja escapada');
  ok(/data-cli="[^"]*"/.test(html) && !/onclick=/.test(html),
     'el nombre va en data-cli y NO adentro de un onclick');
}

/* ═══ 8 · Las dos marcas lo usan, y ninguna dejó su copia vieja ════════════ */
console.log('\n8 · Apple y Poly llaman a la función compartida, sin copias locales');
{
  const apple = fs.readFileSync(path.join(ROOT, 'src/apple/js/pipeline-view.js'), 'utf8');
  const poly  = fs.readFileSync(path.join(ROOT, 'src/poly/js/pipeline-view.js'), 'utf8');
  ok(/cevenPintarTopClientes\(/.test(apple), 'Apple la llama');
  ok(/cevenPintarTopClientes\(/.test(poly),  'Poly la llama');
  /* Que ninguna arme la pastilla por su cuenta: si volviera una copia local,
     las dos marcas empezarían a contestar distinto a la misma pregunta. Cada
     una SÍ conserva su delegación de clicks sobre ese contenedor —Apple por
     `data-pill` y Poly por `data-act`—, así que eso no cuenta. */
  const marca = (src) => /pipe-mpill.*data-cli|data-cli=.*pipe-mpill/.test(src)
    || /topClientsBox/.test(src);
  ok(!marca(apple), 'Apple ya no arma las pastillas por su cuenta');
  ok(!marca(poly),  'Poly tampoco');
  ok(/pipe-topclients-pills/.test(apple) && /pipe-topclients-pills/.test(poly),
     'pero las dos siguen escuchando los clicks de ese contenedor');
  // El que se le pasa NO puede ser el pipeline entero: ese era el error viejo.
  ok(/cevenPintarTopClientes\(sinBuscar\)/.test(apple) && /cevenPintarTopClientes\(sinBuscar\)/.test(poly),
     'las dos le pasan las filas filtradas (`sinBuscar`), no `pipe`');
}


/* ═══ 9 · Pastillas de "Cierre estimado" ═══════════════════════════════════ */
// Las etiquetas de las pastillas de mes, en orden.
function etiquetasMes(html){
  const out = [];
  const re = /data-val="[^"]*"[^>]*>([^<]*)</g;
  let m;
  while((m = re.exec(html)) !== null) out.push(m[1]);
  return out;
}
function valoresMes(html){
  const out = [];
  const re = /data-val="([^"]*)"/g;
  let m;
  while((m = re.exec(html)) !== null) out.push(m[1]);
  return out;
}

console.log('\n9 · "Sin fecha" solo aparece si hay alguna fila sin fecha');
{
  const e = cargar();
  e.window._pipeMonthFilter = '';
  const r = e.cevenPintarPillsMes(['2026-08','2026-09'], false);
  const vals = valoresMes(e._mes.innerHTML);
  ok(vals.indexOf('sin-fecha') === -1, 'sin filas sin fecha, la pastilla NO se pinta', JSON.stringify(vals));
  ok(vals.length === 3 && vals[0] === '', 'quedan "Todos" + los dos meses', JSON.stringify(vals));
  ok(r === '', 'y el filtro sigue vacío');
}
{
  const e = cargar();
  e.window._pipeMonthFilter = '';
  e.cevenPintarPillsMes(['2026-08'], true);
  const vals = valoresMes(e._mes.innerHTML);
  ok(vals.indexOf('sin-fecha') === 1, 'con alguna fila sin fecha, aparece justo después de "Todos"',
     JSON.stringify(vals));
}

console.log('\n10 · Las etiquetas y el orden de los meses');
{
  const e = cargar();
  e.window._pipeMonthFilter = '';
  e.cevenPintarPillsMes(['2026-08','2026-09','2027-01'], true);
  const lbl = etiquetasMes(e._mes.innerHTML);
  ok(JSON.stringify(lbl) === JSON.stringify(['Todos','Sin fecha','Ago 2026','Sep 2026','Ene 2027']),
     'se leen como "Ago 2026" y en el orden en que se pasaron', JSON.stringify(lbl));
}
{
  const e = cargar();
  e.window._pipeMonthFilter = '';
  e.cevenPintarPillsMes(['basura'], false);
  const lbl = etiquetasMes(e._mes.innerHTML);
  ok(lbl[1] === 'basura', 'un valor que no tiene forma de mes se muestra crudo en vez de "undefined NaN"',
     JSON.stringify(lbl));
}

console.log('\n11 · Un filtro que apunta a algo que ya no existe vuelve a "Todos"');
{
  // El caso concreto: estaba filtrado "Sin fecha" y a la última fila sin fecha
  // le pusieron mes. Antes la pastilla desaparecía pero el filtro quedaba, y la
  // tabla se veía vacía sin ninguna pastilla marcada que lo explicara.
  const e = cargar();
  e.window._pipeMonthFilter = 'sin-fecha';
  const r = e.cevenPintarPillsMes(['2026-08'], false);
  ok(r === '', 'devuelve "" para que el llamador filtre por eso y no por el valor viejo', JSON.stringify(r));
  ok(e.window._pipeMonthFilter === '', 'y lo deja limpio en el estado global');
  ok(/pipe-mpill-on/.test(e._mes.innerHTML), 'queda una pastilla marcada (Todos), no ninguna');
  const primera = e._mes.innerHTML.indexOf('pipe-mpill-on');
  ok(primera > 0 && primera < e._mes.innerHTML.indexOf('2026-08'), 'y la marcada es "Todos"');
}
{
  const e = cargar();
  e.window._pipeMonthFilter = '2026-08';
  const r = e.cevenPintarPillsMes(['2026-09'], true);
  ok(r === '', 'lo mismo si se movió la última fila de un mes', JSON.stringify(r));
}
{
  // Y al revés: un filtro que SÍ sigue existiendo no se toca.
  const e = cargar();
  e.window._pipeMonthFilter = '2026-09';
  const r = e.cevenPintarPillsMes(['2026-08','2026-09'], false);
  ok(r === '2026-09', 'un filtro vigente se respeta', JSON.stringify(r));
  ok(/data-val="2026-09"/.test(e._mes.innerHTML) && /pipe-mpill-on/.test(e._mes.innerHTML),
     'y su pastilla queda marcada');
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
  /* En Apple "sin fecha" incluye no tener ningún skuMesCierre, y el filtro lo
     mira con `.length`. La detección de la pastilla tiene que usar la MISMA
     condición o la pastilla aparecería para filas que el filtro descarta. */
  ok(/!r\.skuMesCierre \|\| !Object\.keys\(r\.skuMesCierre\)\.length/.test(apple2.split('cevenPintarPillsMes')[0]),
     'Apple detecta "sin fecha" con la misma condición que usa para filtrar');
}

console.log('\n' + (fallos
  ? ('✗ ' + fallos + ' de ' + corridas + ' fallaron\n')
  : ('✓ ' + corridas + '/' + corridas + ' OK\n')));
process.exit(fallos ? 1 : 0);
