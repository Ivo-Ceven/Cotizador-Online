#!/usr/bin/env node
/* ============================================================================
   check-tareas.js · Cotizadores Ceven
   ----------------------------------------------------------------------------
   El tablero de tareas (src/tareas/) se cablea entero por id y por data-*: el
   HTML trae el esqueleto y board.js lo busca con getElementById/querySelector.
   Ese acoplamiento no lo ve nadie hasta que se abre la pagina — un id mal
   escrito no tira ningun error, simplemente deja un pedazo del tablero muerto
   (la columna no se llena, el filtro no responde, el alta no aparece).

   Y como es una PWA offline-first sin build ni tests de navegador, ese "no pasa
   nada visible" viaja al deploy.

   Chequea cuatro cosas, todas estaticas:
     1. todo id que board.js/todos.js buscan existe — en el HTML, o creado por
        el propio JS (el modal de detalle se arma en tiempo de ejecucion);
     2. todo selector data-* que usa board.js aparece en el HTML;
     3. los tres estados coinciden en board.js, en shared/todos.js y en el
        CHECK de la migracion (si se agregara una cuarta columna al tablero y
        no a la base, cada movimiento a esa columna seria rechazado);
     4. las columnas que todos.js manda a Supabase existen en la migracion;
     5. ninguna clase de board.css pisa una de base.css.

   El punto 5 no es teorico: el contenedor se llamaba `.tb` y base.css ya usaba
   `.tb` para la barra de herramientas de vista (`display:flex`). base.css se
   carga antes, asi que el <main> heredaba el flex y el encabezado, el equipo y
   el alta quedaban uno al lado del otro. No hay error, no hay warning: solo una
   pagina mal armada.

   Uso:  node scripts/check-tareas.js
   Sale con codigo 1 si encuentra algo, para poder usarlo en un hook o en CI.
   ========================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const P = {
  boardJs:   'src/tareas/js/board.js',
  boardHtml: 'src/tareas/index.html',
  storeJs:   'src/shared/todos.js',
  shellHtml: 'src/index.html',
  sql:       'supabase/migrations/20260804100000_tareas_tablero_y_equipo.sql'
};

let errores = 0;
const fallo = msg => { console.error('  ✗ ' + msg); errores++; };

function leer(rel){
  const f = path.join(ROOT, rel);
  if(!fs.existsSync(f)){ fallo('falta el archivo ' + rel); return null; }
  return fs.readFileSync(f, 'utf8');
}
const todos = m => [...m];

const boardJs   = leer(P.boardJs);
const boardHtml = leer(P.boardHtml);
const storeJs   = leer(P.storeJs);
const shellHtml = leer(P.shellHtml);
const sql       = leer(P.sql);
if(errores){ process.exit(1); }

/* ── 1. ids ────────────────────────────────────────────────────────────────
   Los "conocidos" son los del markup de las dos paginas MAS los que el propio
   JS escribe (wrap.id = 'tk-modal', o un id="..." dentro de un string de HTML
   que se inyecta). Sin esa segunda fuente, el modal de detalle —que no existe
   en ningun .html— daria falso positivo. */
function idsDeHtml(html){
  return todos(html.matchAll(/\bid="([^"]+)"/g)).map(m => m[1]);
}
function idsQueElJsCrea(js){
  return [
    ...todos(js.matchAll(/\.id\s*=\s*'([^']+)'/g)).map(m => m[1]),
    ...todos(js.matchAll(/\bid="([^"]+)"/g)).map(m => m[1])
  ];
}
const conocidos = new Set([
  ...idsDeHtml(boardHtml),
  ...idsDeHtml(shellHtml),
  ...idsQueElJsCrea(boardJs),
  ...idsQueElJsCrea(storeJs)
]);

for(const [rel, js] of [[P.boardJs, boardJs], [P.storeJs, storeJs]]){
  const buscados = [
    ...todos(js.matchAll(/getElementById\('([^']+)'\)/g)).map(m => m[1]),
    ...todos(js.matchAll(/querySelector\('#([A-Za-z0-9_-]+)'\)/g)).map(m => m[1])
  ];
  for(const id of new Set(buscados)){
    if(!conocidos.has(id)) fallo(rel + ' busca #' + id + ', que no existe en ningun HTML ni lo crea el JS');
  }
}

/* ── 2. selectores data-* ─────────────────────────────────────────────────── */
const dataEnHtml = new Set(todos(boardHtml.matchAll(/\bdata-([a-z-]+)/g)).map(m => m[1]));
const dataEnJs   = new Set(todos(boardJs.matchAll(/\[data-([a-z-]+)/g)).map(m => m[1]));
/* Los que board.js escribe el mismo en el HTML que inyecta (tarjetas, chips,
   botones del modal) no tienen por que estar en el esqueleto. Se aceptan con y
   sin valor: los marcadores booleanos van sueltos (`data-eliminar>`), y exigir
   el `="` los daba por inexistentes. El `]` queda afuera del cierre a proposito
   — es lo que distingue la ESCRITURA del atributo de su uso como selector. */
const dataQueElJsEscribe = new Set(todos(boardJs.matchAll(/\bdata-([a-z-]+)(?:="|[\s>])/g)).map(m => m[1]));
for(const d of dataEnJs){
  if(!dataEnHtml.has(d) && !dataQueElJsEscribe.has(d)){
    fallo(P.boardJs + ' usa [data-' + d + '], que no esta en el esqueleto ni lo escribe el propio JS');
  }
}

/* ── 3. los tres estados ──────────────────────────────────────────────────── */
function estadosDeBoard(){
  const bloque = boardJs.match(/var COLS = \[([\s\S]*?)\];/);
  if(!bloque){ fallo('no se encontro COLS en ' + P.boardJs); return null; }
  return todos(bloque[1].matchAll(/id:\s*'([^']+)'/g)).map(m => m[1]);
}
function estadosDeStore(){
  const m = storeJs.match(/var ESTADOS\s*=\s*\[([^\]]*)\]/);
  if(!m){ fallo('no se encontro ESTADOS en ' + P.storeJs); return null; }
  return todos(m[1].matchAll(/'([^']+)'/g)).map(x => x[1]);
}
function estadosDeSql(){
  const m = sql.match(/check \(estado in \(([^)]*)\)\)/);
  if(!m){ fallo('no se encontro el CHECK de estado en ' + P.sql); return null; }
  return todos(m[1].matchAll(/'([^']+)'/g)).map(x => x[1]);
}
const eB = estadosDeBoard(), eS = estadosDeStore(), eQ = estadosDeSql();
if(eB && eS && eQ){
  const j = a => a.slice().sort().join(',');
  if(j(eB) !== j(eS)) fallo('los estados de board.js [' + eB + '] no coinciden con los de todos.js [' + eS + ']');
  if(j(eS) !== j(eQ)) fallo('los estados de todos.js [' + eS + '] no coinciden con el CHECK de la migracion [' + eQ + ']');
  // Las columnas del HTML tienen que ser exactamente esas, en el mismo orden.
  const enHtml = todos(boardHtml.matchAll(/class="col" data-estado="([^"]+)"/g)).map(m => m[1]);
  if(enHtml.join(',') !== eB.join(',')){
    fallo('las columnas del HTML [' + enHtml + '] no coinciden con COLS de board.js [' + eB + ']');
  }
}

/* ── 4. columnas que se mandan a Supabase ─────────────────────────────────── */
const columnas = ['id', 'texto', 'hecho', 'estado', 'asignados', 'creadoPor', 'fecha', 'fechaISO'];
for(const c of columnas){
  const enStore = new RegExp('\\b' + c + ':').test(storeJs);
  if(!enStore) fallo('todos.js ya no arma la columna ' + c + ' — revisar normalizar()');
}
for(const c of ['estado', 'asignados']){
  if(!new RegExp('add column if not exists ' + c + '\\b').test(sql)){
    fallo('la migracion no agrega la columna ' + c);
  }
}

/* ── 5. clases que pisan a base.css ───────────────────────────────────────── */
const baseCss = leer('src/shared/css/base.css');
const boardCss = leer('src/tareas/css/board.css');
if(baseCss && boardCss){
  /* Solo el cuerpo de las reglas: los comentarios traen rutas ("css/base.css")
     que el regex de clases confundiria con selectores. */
  const sinComentarios = s => s.replace(/\/\*[\s\S]*?\*\//g, '');
  const clases = s => new Set(todos(sinComentarios(s).matchAll(/\.([A-Za-z][\w-]*)/g)).map(m => m[1]));
  /* Reutilizar la escala tipografica compartida es lo correcto, no una
     colision: son las clases que base.css publica justamente para eso. */
  const COMPARTIDAS = new Set(['h1', 'h2', 'h3', 'sub', 'lbl', 'on']);
  const enBase = clases(baseCss);
  for(const c of clases(boardCss)){
    if(enBase.has(c) && !COMPARTIDAS.has(c)){
      fallo('board.css define .' + c + ', que base.css ya usa — base.css se carga antes y sus reglas se heredan solas');
    }
  }
}

if(errores){
  console.error('\n✗ tareas: ' + errores + ' problema(s).');
  process.exit(1);
}
console.log('✓ tareas OK: ids, data-*, estados, columnas y clases CSS sin colisiones.');
