#!/usr/bin/env node
/* ============================================================================
   check-portal-pricing-parity.js · Cotizadores Ceven
   ----------------------------------------------------------------------------
   El portal de clientes-canal (Edge Functions portal-catalogo/portal-emitir)
   necesita las MISMAS cuentas de precio que ya usan los cotizadores internos
   de Apple y Poly — si calculara el precio con una copia reescrita, tarde o
   temprano el mismo SKU saldría a un precio distinto según por dónde se lo
   pidió, y eso se descubre cuando el cliente-canal compara su cotización con
   la de un vendedor.

   La solución no es "escribir la fórmula una vez más con cuidado": es copiar
   src/apple/js/pricing-core.js y src/poly/js/pricing-core.js BYTE A BYTE a
   supabase/functions/_shared/pricing/ (son funciones puras, sin DOM ni
   globales — no dependen de nada del resto del cotizador) y verificar acá que
   nadie tocó una copia sin tocar la otra.

   Si este chequeo falla: el arreglo NUNCA es editar la copia de
   supabase/functions/ a mano. Es volver a copiar el archivo real:
     cp src/apple/js/pricing-core.js supabase/functions/_shared/pricing/apple-pricing-core.js
     cp src/poly/js/pricing-core.js  supabase/functions/_shared/pricing/poly-pricing-core.js

   Uso:  node scripts/check-portal-pricing-parity.js
   ========================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

let fallos = 0, corridas = 0;
function ok(cond, nombre, detalle){
  corridas++;
  if(cond){ console.log('  ✓ ' + nombre); return; }
  fallos++;
  console.error('  ✗ ' + nombre + (detalle ? ('\n      ' + detalle) : ''));
}

const PARES = [
  {
    marca: 'Apple',
    original: 'src/apple/js/pricing-core.js',
    copia: 'supabase/functions/_shared/pricing/apple-pricing-core.js'
  },
  {
    marca: 'Poly',
    original: 'src/poly/js/pricing-core.js',
    copia: 'supabase/functions/_shared/pricing/poly-pricing-core.js'
  }
];

console.log('Paridad de pricing-core.js entre el frontend y las Edge Functions del portal\n');

PARES.forEach(function(par){
  const pOriginal = path.join(ROOT, par.original);
  const pCopia = path.join(ROOT, par.copia);

  const existeOriginal = fs.existsSync(pOriginal);
  const existeCopia = fs.existsSync(pCopia);
  ok(existeOriginal, par.marca + ': existe ' + par.original);
  ok(existeCopia, par.marca + ': existe ' + par.copia);
  if(!existeOriginal || !existeCopia) return;

  const original = fs.readFileSync(pOriginal, 'utf8');
  const copia = fs.readFileSync(pCopia, 'utf8');
  ok(original === copia, par.marca + ': la copia es byte a byte igual al original',
     original.length !== copia.length
       ? ('largo distinto: original ' + original.length + ' vs copia ' + copia.length + ' — corré el cp de arriba')
       : 'mismo largo pero contenido distinto — corré el cp de arriba');

  // Nunca deberían tener "use strict" ni depender de módulos: el mecanismo de
  // carga de las Edge Functions (eval indirecto, ver portal-catalogo/index.ts)
  // depende de que corran como script sloppy-mode sin exports.
  ok(!/^\s*['"]use strict['"]/.test(original), par.marca + ": el original no declara 'use strict'",
     'si lo declara, el eval indirecto de las Edge Functions ya no cuelga las funciones en globalThis');
  ok(!/\bmodule\.exports\b/.test(original) && !/\bexport\s/.test(original),
     par.marca + ': el original no usa module.exports ni export');
});

// Las Edge Functions no pueden leer `copia` del disco en producción (ver
// docs/HISTORIAL.md, 20/08/2026): la llevan embebida como string dentro de
// index.ts, generada por scripts/build-portal-pricing-embeds.js. Si alguien
// corrió ese generador después de tocar el _shared, el embed tiene que ser
// igual al archivo — si no, el catálogo del portal calcula precios viejos.
const EMBEBIDOS = [
  { archivo: 'supabase/functions/portal-catalogo/index.ts', marca: 'portal-catalogo' },
  { archivo: 'supabase/functions/portal-emitir/index.ts', marca: 'portal-emitir' },
];
const EMBED_RE = /const (APPLE|POLY)_PRICING_SRC: string = (".*?");/g;

EMBEBIDOS.forEach(function(destino){
  const p = path.join(ROOT, destino.archivo);
  if (!fs.existsSync(p)) { ok(false, destino.marca + ': existe ' + destino.archivo); return; }
  const contenido = fs.readFileSync(p, 'utf8');
  const encontrados = {};
  let m;
  while ((m = EMBED_RE.exec(contenido)) !== null) {
    try { encontrados[m[1]] = JSON.parse(m[2]); } catch { encontrados[m[1]] = null; }
  }
  PARES.forEach(function(par){
    const clave = par.marca.toUpperCase();
    if (!(clave in encontrados)) {
      ok(false, destino.marca + ': tiene el embed de ' + par.marca,
         'no se encontró const ' + clave + '_PRICING_SRC — corré node scripts/build-portal-pricing-embeds.js');
      return;
    }
    const original = fs.readFileSync(path.join(ROOT, par.original), 'utf8');
    ok(encontrados[clave] === original, destino.marca + ': el embed de ' + par.marca + ' está al día',
       'desincronizado del original — corré node scripts/build-portal-pricing-embeds.js y redeployá ' + destino.marca);
  });
});

console.log('\n' + (fallos
  ? ('✗ ' + fallos + ' de ' + corridas + ' fallaron\n')
  : ('✓ ' + corridas + '/' + corridas + ' OK\n')));
process.exit(fallos ? 1 : 0);
