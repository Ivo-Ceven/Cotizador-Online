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
   (que es exactamente el bundle que ve el navegador) y avisa si un nombre se
   define mas de una vez.

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
  { nombre: 'apple',  html: 'src/apple/index.html'  },
  { nombre: 'poly',   html: 'src/poly/index.html'   },
  { nombre: 'tareas', html: 'src/tareas/index.html' }
];

/* Solo definiciones en COLUMNA 0: lo que esta indentado vive dentro de un IIFE
   o de otra funcion y no es global. Sin este ancla el chequeo da decenas de
   falsos positivos (cada `function fail(){}` interno de auth.js, etc.). */
const DEF = /^(?:function\s+([A-Za-z_$][\w$]*)\s*\(|window\.([A-Za-z_$][\w$]*)\s*=\s*function|var\s+([A-Za-z_$][\w$]*)\s*=\s*function)/gm;

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

  const defs = new Map();   // nombre -> [archivos que lo definen]
  let faltantes = 0, archivos = 0;

  for(const f of scriptsDe(htmlPath)){
    if(!fs.existsSync(f)){
      console.error('  ✗ FALTA: ' + path.relative(ROOT, f).replace(/\\/g, '/'));
      faltantes++;
      continue;
    }
    archivos++;
    if(f.includes('vendor')) continue;          // libs de terceros: no son nuestras
    const src = fs.readFileSync(f, 'utf8');
    const rel = path.relative(ROOT, f).replace(/\\/g, '/');
    let m;
    DEF.lastIndex = 0;
    while((m = DEF.exec(src))){
      const nombre = m[1] || m[2] || m[3];
      if(!defs.has(nombre)) defs.set(nombre, []);
      defs.get(nombre).push(rel);
    }
  }

  const choques = [];
  for(const [nombre, donde] of defs){
    if(donde.length > 1) choques.push({ nombre, donde });
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
  return { faltantes, choques };
}

let problemas = 0;
for(const marca of MARCAS){
  console.log('\n' + marca.nombre.toUpperCase());
  const r = revisar(marca);
  problemas += r.faltantes + r.choques.length;
}

if(problemas){
  console.error('\n✗ ' + problemas + ' problema(s). El ultimo archivo cargado es el que gana:');
  console.error('  renombra una de las copias o borra la que quedo muerta.\n');
  process.exit(1);
}
console.log('\n✓ globales OK: ningun nombre se define dos veces en el mismo bundle.\n');
