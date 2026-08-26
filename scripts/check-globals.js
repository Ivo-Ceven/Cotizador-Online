#!/usr/bin/env node
/* ============================================================================
   check-globals.js · Cotizadores Ceven
   ----------------------------------------------------------------------------
   Los cotizadores no usan ES modules: todos los <script> comparten el scope
   global. Si dos archivos definen una funcion con el mismo nombre, el que se
   carga despues pisa al anterior — sin error, sin warning, sin nada.

   Esto ya paso: openSkuOvLink/editSkuOvLink estuvieron definidas dos veces en
   apple/js/pipeline-detail.js desde el corte del monolito (07/2026) hasta que
   un review lo encontro. La version que corria era la de mas abajo; la otra era
   codigo muerto que alguien podia leer y creer vigente.

   El riesgo crecio con el refactor a src/shared/: ahora una funcion movida a
   compartido puede colisionar con una copia que quedo en la marca.

   Que hace: por cada marca, lee su index.html, sigue los <script src> EN ORDEN
   (que es exactamente el bundle que ve el navegador) y avisa:

     1. si un nombre se define mas de una vez (el de abajo pisa al de arriba);
     2. si el bundle LLAMA a una `ceven*()` que ese bundle no define.

   El (2) se agrego el 12/08/2026 por un bug real: `shared/clientes.js` usaba
   `cevenNormClient()`, que vivia en `shared/pipeline-group.js`. El multimarca
   carga clientes.js pero NO el pipeline —emite a las marcas, no tiene uno
   propio—, asi que la pagina cargaba entera, se veia perfecta, y reventaba
   recien al apretar Guardar:

     Uncaught ReferenceError: cevenNormClient is not defined
         at cevenClienteSet (clientes.js:47)

   Sin build ni modulos, una dependencia que falta no se nota hasta que alguien
   toca el boton que la usa. Por eso se revisa contra la lista de <script> de
   cada pagina, que es el unico lugar donde esta escrito el bundle real.

   Uso:  node scripts/check-globals.js
   Sale con codigo 1 si encuentra algo, para poder usarlo en un hook o en CI.
   ========================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
/* "Marca" es un decir: lo que se revisa es cada PAGINA con su propio bundle de
   <script src>. El tablero de tareas (src/tareas/) no es una marca pero comparte
   el mismo scope global con shared/, asi que corre el mismo riesgo. */
const MARCAS = [
  { nombre: 'apple',      html: 'src/apple/index.html'      },
  { nombre: 'poly',       html: 'src/poly/index.html'       },
  { nombre: 'legamaster', html: 'src/legamaster/index.html' },
  /* El multimarca es el caso de mayor riesgo de colision: carga los
     `pricing-core.js` de DOS marcas en el mismo bundle. Si alguna vez las dos
     definieran una funcion con el mismo nombre, una pisaria a la otra en
     silencio y el precio de una marca saldria calculado con la formula de la
     otra. Este chequeo es lo que lo impide. */
  { nombre: 'multi',  html: 'src/multi/index.html'  },
  { nombre: 'tareas', html: 'src/tareas/index.html' }
];

/* Solo definiciones en COLUMNA 0: lo que esta indentado vive dentro de un IIFE
   o de otra funcion y no es global. Sin este ancla el chequeo da decenas de
   falsos positivos (cada `function fail(){}` interno de auth.js, etc.). */
const DEF = /^(?:function\s+([A-Za-z_$][\w$]*)\s*\(|window\.([A-Za-z_$][\w$]*)\s*=\s*function|var\s+([A-Za-z_$][\w$]*)\s*=\s*function)/gm;

/* Exports. Muchos modulos compartidos se escriben adentro de un IIFE y publican
   con `window.cevenX = ...` INDENTADO, que el ancla de columna 0 de DEF no ve
   (y no debe ver: DEF busca colisiones, y ahi el ancla es lo que evita decenas
   de falsos positivos). Para saber si un nombre ESTA disponible alcanza con que
   alguien lo publique, en cualquier columna y con cualquier valor. */
const EXPORT = /window\.([A-Za-z_$][\w$]*)\s*=/g;

/* Llamadas a funciones del proyecto. Se limita al prefijo `ceven` a proposito:
   es nuestro namespace, asi que un `cevenAlgo()` que nadie define es siempre un
   error, mientras que un nombre suelto podria ser del navegador o de una lib. */
const CALL  = /(?<![.\w$])(ceven[A-Za-z_$][\w$]*)\s*\(/g;
const WCALL = /window\.(ceven[A-Za-z_$][\w$]*)\s*\(/g;

/* Los comentarios se sacan antes de buscar llamadas. Esta base documenta mucho
   —y nombra funciones y hasta funciones SQL (`ceven_equipo()`) al explicar por
   que algo es como es—, asi que sin esto el chequeo denuncia la prosa. El
   `[^:]` deja intactos los `https://` de las URLs. */
function sinComentarios(src){
  return src.replace(/\/\*[\s\S]*?\*\//g, ' ')
            .replace(/(^|[^:\\])\/\/[^\n]*/gm, '$1');
}

/* Dependencias OPCIONALES declaradas. Todo el codigo compartido pregunta
   `typeof cevenX === 'function'` antes de usar lo que puede no estar en esa
   marca; esas llamadas no son un error, son el mecanismo. */
const GUARD = /typeof\s+(?:window\.)?(ceven[A-Za-z_$][\w$]*)\s*[!=]==?\s*['"]function['"]/g;

function nombresDe(re, src){
  const out = new Set();
  let m;
  re.lastIndex = 0;
  while((m = re.exec(src))) out.add(m[1]);
  return out;
}

function scriptsDe(htmlPath){
  const html = fs.readFileSync(htmlPath, 'utf8');
  const dir  = path.dirname(htmlPath);
  const out  = [];
  const re   = /<script\s+src="([^"]+)"\s*><\/script>/g;
  let m;
  while((m = re.exec(html))) out.push(path.resolve(dir, m[1]));
  return out;
}

function revisar(marca){
  const htmlPath = path.join(ROOT, marca.html);
  if(!fs.existsSync(htmlPath)){
    console.error('  ✗ no existe ' + marca.html);
    return { faltantes: 1, choques: [] };
  }

  const defs = new Map();      // nombre -> [archivos que lo definen] (para colisiones)
  const disponibles = new Set(); // todo lo que el bundle publica, definido o exportado
  const llamadas = new Map();  // nombre -> [archivos que la llaman]
  const opcionales = new Set();
  let faltantes = 0, archivos = 0;

  for(const f of scriptsDe(htmlPath)){
    if(!fs.existsSync(f)){
      console.error('  ✗ FALTA: ' + path.relative(ROOT, f).replace(/\\/g, '/'));
      faltantes++;
      continue;
    }
    archivos++;
    if(f.includes('vendor')) continue;          // libs de terceros: no son nuestras
    const src = sinComentarios(fs.readFileSync(f, 'utf8'));
    const rel = path.relative(ROOT, f).replace(/\\/g, '/');
    let m;
    DEF.lastIndex = 0;
    while((m = DEF.exec(src))){
      const nombre = m[1] || m[2] || m[3];
      if(!defs.has(nombre)) defs.set(nombre, []);
      defs.get(nombre).push(rel);
      disponibles.add(nombre);
    }
    nombresDe(EXPORT, src).forEach(n => disponibles.add(n));
    nombresDe(GUARD, src).forEach(n => opcionales.add(n));
    for(const re of [CALL, WCALL]){
      nombresDe(re, src).forEach(function(n){
        if(!llamadas.has(n)) llamadas.set(n, []);
        llamadas.get(n).push(rel);
      });
    }
  }

  const choques = [];
  for(const [nombre, donde] of defs){
    if(donde.length > 1) choques.push({ nombre, donde });
  }

  /* Llamada sin definicion y sin guarda: el bundle carga igual y revienta
     cuando alguien toca lo que la usa. */
  const sueltas = [];
  for(const [nombre, donde] of llamadas){
    if(disponibles.has(nombre) || opcionales.has(nombre)) continue;
    sueltas.push({ nombre, donde });
  }

  console.log('  ' + archivos + ' scripts, ' + defs.size + ' definiciones globales');
  if(choques.length){
    console.error('  ✗ ' + choques.length + ' nombre(s) definidos mas de una vez:');
    for(const c of choques){
      console.error('      ' + c.nombre);
      c.donde.forEach(function(d, i){
        console.error('        ' + (i === c.donde.length - 1 ? 'GANA  ' : 'pisado') + ' ' + d);
      });
    }
  } else {
    console.log('  ✓ sin colisiones');
  }
  if(sueltas.length){
    console.error('  ✗ ' + sueltas.length + ' funcion(es) que este bundle llama y NO define:');
    for(const s of sueltas){
      console.error('      ' + s.nombre + '()  ← ' + s.donde.join(', '));
    }
    console.error('      Falta el <script> en ' + marca.html + ', o la funcion tiene que');
    console.error('      mudarse a un modulo que esta pagina si cargue. Si de verdad es');
    console.error('      opcional, usala con typeof ' + sueltas[0].nombre + " === 'function'.");
  } else {
    console.log('  ✓ sin llamadas a funciones que no estén en el bundle');
  }
  return { faltantes, choques, sueltas };
}

let problemas = 0;
for(const marca of MARCAS){
  console.log('\n' + marca.nombre.toUpperCase());
  const r = revisar(marca);
  problemas += r.faltantes + r.choques.length + r.sueltas.length;
}

if(problemas){
  console.error('\n✗ ' + problemas + ' problema(s).\n');
  process.exit(1);
}
console.log('\n✓ globales OK: ningun nombre se define dos veces, y cada ceven*() que se\n'
          + '  llama está definida en el bundle de esa página.\n');
