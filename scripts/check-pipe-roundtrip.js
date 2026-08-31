#!/usr/bin/env node
/* ============================================================================
   check-pipe-roundtrip.js · Cotizadores Ceven
   ----------------------------------------------------------------------------
   Verifica que una fila de pipeline sobreviva el viaje de ida y vuelta a
   Supabase SIN QUEDAR MARCADA COMO CAMBIADA.

   Por que existe: sync.js decide si una fila cambio comparando
   JSON.stringify(pickPipe(fila)) contra el snapshot anterior. Si `coerce()`
   —que normaliza lo que devuelve Postgres— no reconstruye exactamente el mismo
   objeto, la fila queda "sucia" en cada poll: la tabla se re-renderiza cada
   15 s para siempre, el pipeline parpadea solo y no hay ningun error que lo
   explique. Ya paso con `qNum` en Apple (numeric en la base, '0071' en la app).

   El caso concreto que cubre: `padCols`. Una columna numerica que la app guarda
   como string con ceros a la izquierda TIENE que estar declarada ahi, o el
   round-trip devuelve 71 donde habia '0071'.

   Uso:  node scripts/check-pipe-roundtrip.js
   Sale con codigo 1 si encuentra algo, para poder usarlo en un hook o en CI.
   ========================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const MARCAS = ['apple', 'poly', 'legamaster'];

function cargarBrand(marca){
  const src = fs.readFileSync(path.join(ROOT, 'src', marca, 'brand.js'), 'utf8');
  const w = {};
  new Function('window', src)(w);
  return w.CEVEN_BRAND;
}

/* Replicas exactas de sync.js. Si alla cambian, tienen que cambiar aca — es el
   costo de no poder importar el modulo (los cotizadores no usan ES modules). */
function hacerPickPipe(B){
  return function(row){
    const o = {};
    for(const c of B.pipeCols){
      let val = row[c];
      if((B.objCols||[]).indexOf(c) >= 0){
        if(typeof val === 'string'){ try{ val = JSON.parse(val); }catch(e){ val = null; } }
        o[c] = (val && typeof val === 'object' && Object.keys(val).length > 0) ? val : null;
      } else if((B.nullableCols||[]).indexOf(c) >= 0){
        o[c] = (val === undefined || val === null || val === '') ? null : val;
      } else {
        o[c] = (val === undefined) ? null : val;
      }
    }
    o.brand = B.id;
    return o;
  };
}
function hacerCoerce(B){
  const pad = (v, len) => { let s = String(parseInt(v,10) || 0); while(s.length < len) s = '0'+s; return s; };
  return function(r){
    delete r.brand;
    for(const c of (B.numCols||[])) if(r[c] !== null && r[c] !== undefined && r[c] !== '') r[c] = Number(r[c]);
    for(const c in (B.padCols||{}))  if(r[c] !== null && r[c] !== undefined && r[c] !== '') r[c] = pad(r[c], B.padCols[c]);
    for(const oc of (B.objCols||[])) if(r[oc] && typeof r[oc] === 'string'){ try{ r[oc] = JSON.parse(r[oc]); }catch(e){ r[oc] = null; } }
    return r;
  };
}

/* Fila sintetica: un valor plausible por columna declarada. Las de padCols van
   con ceros a la izquierda (que es el caso que rompe), las numericas con un
   numero y el resto con texto. */
function filaDeMuestra(B, opts){
  opts = opts || {};
  const r = {};
  for(const c of B.pipeCols){
    if((B.padCols||{})[c] !== undefined){ r[c] = String(opts.padVal || 71).padStart(B.padCols[c], '0'); }
    else if((B.objCols||[]).indexOf(c) >= 0){ r[c] = opts.vaciarObj ? null : {k: 1}; }
    else if((B.numCols||[]).indexOf(c) >= 0){ r[c] = c === 'id' ? 1754236800000123 : (opts.cero ? 0 : 1234); }
    else if((B.nullableCols||[]).indexOf(c) >= 0){ r[c] = opts.vaciarNullables ? '' : ('v-' + c); }
    else if(opts.booleanos){ r[c] = false; }   // columnas boolean (esFOB) y el caso "todo false"
    else if(opts.faltantes){ /* se deja undefined a proposito */ }
    else { r[c] = 'v-' + c; }
  }
  return r;
}

let problemas = 0;

for(const marca of MARCAS){
  console.log('\n' + marca.toUpperCase());
  const B = cargarBrand(marca);
  const pickPipe = hacerPickPipe(B);
  const coerce   = hacerCoerce(B);

  console.log('  padCols: ' + JSON.stringify(B.padCols || {}) + '  ·  objCols: ' + JSON.stringify(B.objCols || []));

  const casos = [
    ['fila completa',                  filaDeMuestra(B)],
    ['nullables vacios',               filaDeMuestra(B, {vaciarNullables: true})],
    ['jsonb vacios',                   filaDeMuestra(B, {vaciarObj: true})],
    ['numericos en 0',                 filaDeMuestra(B, {cero: true})],
    ['padCols con muchos ceros (0007)', filaDeMuestra(B, {padVal: 7})],
    // `false` no es `null`: una columna boolean que vuelve como false tiene que
    // seguir siendo false, no convertirse en null y marcar la fila como cambiada.
    ['columnas boolean en false',      filaDeMuestra(B, {booleanos: true})],
    // Una fila vieja a la que le falta una columna agregada despues.
    ['columnas ausentes (undefined)',  filaDeMuestra(B, {faltantes: true})]
  ];

  for(const [nombre, fila] of casos){
    const subido = pickPipe(fila);
    // Como vuelve de Postgres: las numericas son numeros, no strings.
    const deLaBase = JSON.parse(JSON.stringify(subido));
    for(const c of (B.numCols||[])) if(deLaBase[c] !== null && deLaBase[c] !== undefined) deLaBase[c] = Number(deLaBase[c]);
    const reSubido = pickPipe(coerce(deLaBase));

    if(JSON.stringify(subido) === JSON.stringify(reSubido)){
      console.log('  ✓ ' + nombre);
    } else {
      problemas++;
      console.error('  ✗ ' + nombre + ' — la fila queda marcada como cambiada');
      for(const c of B.pipeCols){
        if(JSON.stringify(subido[c]) !== JSON.stringify(reSubido[c])){
          console.error('      ' + c + ': subio ' + JSON.stringify(subido[c])
            + ' y volvio ' + JSON.stringify(reSubido[c])
            + ((B.padCols||{})[c] === undefined && typeof subido[c] === 'string' && typeof reSubido[c] === 'number'
                ? '   ← falta declararla en padCols' : ''));
        }
      }
    }
  }
}

if(problemas){
  console.error('\n✗ ' + problemas + ' caso(s) en los que la fila no sobrevive el round-trip.');
  console.error('  Sintoma en la app: el pipeline se re-renderiza solo cada 15 s.\n');
  process.exit(1);
}
console.log('\n✓ round-trip OK: ninguna fila se marca como cambiada al ir y volver.\n');
