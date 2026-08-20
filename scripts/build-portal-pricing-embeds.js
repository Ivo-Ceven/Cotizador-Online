#!/usr/bin/env node
/* ============================================================================
   build-portal-pricing-embeds.js · Cotizadores Ceven
   ----------------------------------------------------------------------------
   portal-catalogo/index.ts y portal-emitir/index.ts necesitan el código de
   supabase/functions/_shared/pricing/*.js DENTRO del bundle que se sube con
   deploy_edge_function, como string (JSON.stringify) más eval indirecto.

   Por qué no Deno.readTextFile ni un import normal: el runtime de Edge
   Functions de Supabase no da permiso de lectura de filesystem en producción
   (Deno.readTextFile devuelve "path not found" para CUALQUIER ruta, incluso
   el propio index.ts en ejecución — confirmado el 20/08/2026 con una función
   de diagnóstico temporal, ver docs/HISTORIAL.md). Y un `import` normal de un
   .js corre como módulo ES: sus `var`/`function` de nivel superior NO quedan
   en globalThis sin `export`, que es justo lo que necesita el eval indirecto
   (ver el comentario en pricing-core.js sobre por qué son sloppy-mode).

   Este script regenera el bloque entre BEGIN_PRICING_EMBED/END_PRICING_EMBED
   de cada archivo destino a partir de supabase/functions/_shared/pricing/.
   Correlo cada vez que cambie ese _shared, y después redeployá las dos
   funciones. scripts/check-portal-pricing-parity.js verifica que nadie se
   haya olvidado.

   Uso:  node scripts/build-portal-pricing-embeds.js
   ========================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

const PARES = [
  { archivo: 'apple-pricing-core.js', constante: 'APPLE_PRICING_SRC' },
  { archivo: 'poly-pricing-core.js', constante: 'POLY_PRICING_SRC' },
];

const TARGETS = [
  'supabase/functions/portal-catalogo/index.ts',
  'supabase/functions/portal-emitir/index.ts',
];

const MARK_START = '// BEGIN_PRICING_EMBED (auto-generado — no editar a mano, ver scripts/build-portal-pricing-embeds.js)';
const MARK_END = '// END_PRICING_EMBED';

function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

function bloqueEmbebido() {
  const lineas = [MARK_START];
  for (const par of PARES) {
    const src = fs.readFileSync(path.join(ROOT, 'supabase/functions/_shared/pricing', par.archivo), 'utf8');
    lineas.push('const ' + par.constante + ': string = ' + JSON.stringify(src) + ';');
  }
  lineas.push(MARK_END);
  return lineas.join('\n');
}

const nuevoBloque = bloqueEmbebido();
const re = new RegExp(escapeRe(MARK_START) + '[\\s\\S]*?' + escapeRe(MARK_END));

let fallos = 0;
for (const rel of TARGETS) {
  const p = path.join(ROOT, rel);
  const actual = fs.readFileSync(p, 'utf8');
  if (!re.test(actual)) {
    console.error('✗ ' + rel + ': no se encontraron los marcadores ' + MARK_START);
    fallos++;
    continue;
  }
  const actualizado = actual.replace(re, nuevoBloque);
  if (actualizado !== actual) {
    fs.writeFileSync(p, actualizado);
    console.log('✓ ' + rel + ': regenerado');
  } else {
    console.log('· ' + rel + ': ya estaba al día');
  }
}
process.exit(fallos ? 1 : 0);
