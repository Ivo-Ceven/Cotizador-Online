#!/usr/bin/env node
/* ============================================================================
   check-poly-netsuite.js · Cotizadores Ceven
   ----------------------------------------------------------------------------
   El botón del pipeline de Poly que antes llevaba el número de factura ahora
   lleva el LINK a Netsuite: con link cargado abre Netsuite, y al lado hay un ✎
   amarillo para cambiarlo.

   Lo que se verifica acá es cevenNetsuiteURL(), que es la parte con riesgo:

     · el pipeline se sincroniza con TODO el equipo, así que ese valor no es de
       confianza. Un `javascript:...` guardado como link correría en la pantalla
       de quien apriete el botón — el mismo tipo de agujero que ya se cerró en el
       resto de la app escapando todo lo que viene de la base;
     · un link pegado sin protocolo ("app.netsuite.com/…") lo tomaría el
       navegador como una ruta relativa de la propia app y no llevaría a ningún
       lado.

   Uso:  node scripts/check-poly-netsuite.js
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

/* Se carga el módulo real con lo justo del entorno. Solo se usan funciones
   puras (cevenNetsuiteURL), así que no hace falta DOM ni localStorage. */
function cargar(){
  const ctx = { console, getPipeline: () => [], savePipeline(){}, renderPipeline(){},
                promptModal(){}, showToast(){}, notifyUndo(){},
                cevenCanEditPipelineRow: () => true, XLSX: {} };
  ctx.window = ctx; ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'src/poly/js/pipeline-detail.js'), 'utf8'), ctx);
  return ctx;
}

console.log('\nLink de Netsuite · pipeline de Poly\n');
const ctx = cargar();
const url = ctx.cevenNetsuiteURL;

ok(typeof url === 'function', 'cevenNetsuiteURL() existe');

/* ---- Lo que TIENE que abrir ------------------------------------------------ */
ok(url('https://ceven.app.netsuite.com/app/accounting/x.nl?id=99')
     === 'https://ceven.app.netsuite.com/app/accounting/x.nl?id=99',
   'un https completo pasa tal cual');
ok(url('http://intranet/ns/1') === 'http://intranet/ns/1', 'http también sirve');
ok(url('app.netsuite.com/app/x.nl?id=9') === 'https://app.netsuite.com/app/x.nl?id=9',
   'sin protocolo se asume https', url('app.netsuite.com/app/x.nl?id=9'));
ok(url('  app.netsuite.com/x  ') === 'https://app.netsuite.com/x',
   'se recortan los espacios de pegar el link');
ok(url('HTTPS://APP.NETSUITE.COM/X') === 'HTTPS://APP.NETSUITE.COM/X',
   'el protocolo se reconoce sin importar mayúsculas');

/* ---- Lo que NO tiene que abrir --------------------------------------------- */
const peligrosos = [
  'javascript:alert(document.cookie)',
  'JaVaScRiPt:alert(1)',
  'data:text/html,<script>alert(1)</script>',
  'file:///C:/Windows/System32',
  'vbscript:msgbox(1)'
];
peligrosos.forEach(function(mal){
  ok(url(mal) === '', 'rechaza ' + mal.split(':')[0] + ':', 'devolvió ' + JSON.stringify(url(mal)));
});

/* ---- Vacíos ---------------------------------------------------------------- */
ok(url('') === '', 'vacío → sin link');
ok(url(null) === '', 'null → sin link (fila sin cargar)');
ok(url(undefined) === '', 'undefined → sin link');
ok(url('   ') === '', 'solo espacios → sin link');

/* Las filas viejas guardaban en esta columna el NÚMERO de factura. Eso NO es un
   link: si pasara como válido, el botón saldría en verde y al tocarlo no
   llevaría a ningún lado. Se descarta, así queda en rojo pidiendo el link. */
ok(url('0001-00012345') === '', 'un número de factura viejo no cuenta como link',
   url('0001-00012345'));
ok(url('A-1234') === '', 'un texto suelto tampoco', url('A-1234'));
ok(url('netsuite') === '', 'una palabra sin dominio tampoco', url('netsuite'));
// Pero un dominio de verdad sin protocolo sí, que es el caso normal de pegar.
ok(url('ceven.app.netsuite.com/app/x.nl?id=9') === 'https://ceven.app.netsuite.com/app/x.nl?id=9',
   'un dominio sin protocolo sigue funcionando');

console.log('\n' + (fallos
  ? ('✗ ' + fallos + ' de ' + corridas + ' fallaron\n')
  : ('✓ ' + corridas + '/' + corridas + ' OK\n')));
process.exit(fallos ? 1 : 0);
