#!/usr/bin/env node
/* ============================================================================
   check-pdf-pro.js · Cotizadores Ceven
   ----------------------------------------------------------------------------
   El botón "PDF Pro" de Apple (src/apple/js/pdf-pro.js) arma un documento A4
   vertical con una tarjeta por familia. Viene del cotizador monolítico viejo,
   donde lo "solicitado" y lo "alternativo" se decidían con un checkbox por
   línea (`_pipeInclude`). Acá eso son las Opciones A/B de shared/opciones.js, y
   esa traducción es justo lo que puede salir mal en silencio: si el documento
   sumara las dos opciones, el cliente recibiría un total que incluye plata de
   una propuesta que no eligió.

   Por eso este script corre buildPDFPro() DE VERDAD sobre un DOM falso y le lee
   el HTML antes de rasterizarlo (se intercepta downloadQuotePDFPro). No valida
   el PDF en sí — eso es html2canvas, que no corre en Node — sino las decisiones
   de negocio del documento:

     · el Total de la operación cuenta SOLO la opción vigente;
     · la alternativa se informa aparte, con su propio importe;
     · las garantías no entran al total (son opcionales y excluyentes entre sí);
     · las condiciones salen de shared/pdf-core.js, así que la entrega libre
       sale con su texto y no con el "__otra" del <select>;
     · nada de lo que escribe el usuario se interpola sin escapar.

   Uso:  node scripts/check-pdf-pro.js
   ========================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');

let fallos = 0;
function ok(cond, nombre, detalle){
  if(cond){ console.log('  ✓ ' + nombre); return; }
  fallos++;
  console.error('  ✗ ' + nombre + (detalle ? ('\n      ' + detalle) : ''));
}

/* ── DOM mínimo ────────────────────────────────────────────────────────────
   Solo lo que toca buildPDFPro(): getElementById sobre los campos de la
   cabecera y de las condiciones. Nada de layout: el documento se corta en
   downloadQuotePDFPro(), que acá se intercepta. */
function hacerDOM(campos){
  const el = v => ({ value: v, checked: false });
  const nodos = {};
  Object.keys(campos).forEach(k => { nodos[k] = el(campos[k]); });
  return {
    getElementById: id => nodos[id] || null,
    createElement: () => ({ style:{}, setAttribute(){}, appendChild(){}, remove(){} }),
    body: { appendChild(){}, removeChild(){} }
  };
}

function cargar(campos){
  const ctx = {
    console,
    location: { href: 'https://cotizadores-ceven.vercel.app/apple/index.html', origin: 'https://x' },
    document: hacerDOM(campos),
    CEVEN_BRAND: { id: 'apple', condicionesFijas: ['Incluye enrolamiento en Apple Business Manager'] },
    // Stubs de lo que pdf-pro.js usa pero no es lo que se está probando.
    showToast(m){ ctx._toast = m; },
    showErrorPopup(m){ ctx._error = m; },
    html2canvas(){ throw new Error('no debería rasterizar en el check'); },
    jspdf: { jsPDF: function(){} },
    doSave(){ ctx._guardo = true; return true; },
    cevenQNumFmt: n => String(n).padStart(4, '0'),
    _logo: null,
    qNum: 603,
    // Las cuentas de precio no son lo que se prueba: alcanza con un formateo fiel.
    dp: u => 'USD ' + Math.round(u).toLocaleString('es-AR'),
    getCur: () => 'USD',
    cevenDelivery: () => 'Entre 5 y 7 días hábiles',   // resuelve el "__otra"
    cevenPayMode: () => '30 días FF',
    cevenEntregaEsInmediata: t => /inmediata/i.test(t || '')
  };
  ctx.window = ctx;
  ctx.globalThis = ctx;
  vm.createContext(ctx);

  const lee = p => fs.readFileSync(path.join(ROOT, p), 'utf8');
  vm.runInContext(lee('src/shared/safe.js'), ctx);
  vm.runInContext(lee('src/shared/pdf-core.js'), ctx);
  vm.runInContext(lee('src/shared/opciones.js'), ctx);
  vm.runInContext(lee('src/apple/js/pdf-pro.js'), ctx);
  return ctx;
}

/* Corre buildPDFPro() y devuelve el HTML que le habría pasado al rasterizador. */
function documentoDe(ctx, items, warranties, opcVigente, hayB){
  let html = null, nombre = null;
  vm.runInContext('downloadQuotePDFPro = function(h, f){ _htmlCapturado = h; _nombreCapturado = f; };', ctx);
  ctx.items = items;
  ctx.warrantyItems = warranties;
  ctx.getSortedItems = () => items.slice();
  ctx.getSortedWarranties = () => warranties.map((w, i) => ({ w, origIdx: i }));
  ctx.getProductFamily = it => it.famTest;
  ctx.FAMILY_ORDER = ['MacBook Air', 'MacBook Pro', 'iPhone'];
  vm.runInContext('cevenOpcEstadoSet(' + JSON.stringify({ activa: opcVigente, ef: opcVigente, hayB }) + ');', ctx);
  vm.runInContext('buildPDFPro();', ctx);
  html   = ctx._htmlCapturado;
  nombre = ctx._nombreCapturado;
  return { html, nombre };
}

const CAMPOS = {
  client:   'Hospital Italiano',
  exec:     'Fer Castro',
  obs:      'Renovación parque <notebooks>',   // con < > a propósito: tiene que salir escapado
  proyecto: 'Piso 4',
  'eff-date': '2026-10-15',
  'pay-mode': '30 días FF',
  delivery: '__otra'                            // el valor crudo del <select>
};

// Dos opciones: A = MacBook Air (vigente), B = MacBook Pro (alternativa).
const ITEMS = [
  { sku:'MGN63LL/A', description:'MacBook Air 13 M4',  qty:10, salePrice:1200, taxes:'10.5%', stock:'Disponible', opc:1, famTest:'MacBook Air' },
  { sku:'MPHE3LL/A', description:'MacBook Pro 14 M4',  qty:10, salePrice:2000, taxes:'10.5%', stock:'A pedido',   opc:2, famTest:'MacBook Pro' }
];
const WARR = [
  { equipo:'MacBook Air (13-inch, M4, 2025)', sku:'3AGLStartCa', canal:'GL', 'años':3, precio:68.3, cantidad:10, opc:1, _fromProduct:'MGN63LL/A|MacBook Air 13 M4' },
  { equipo:'MacBook Air (13-inch, M4, 2025)', sku:'3ACCStartCa', canal:'CC', 'años':3, precio:168,  cantidad:10, opc:1, _fromProduct:'MGN63LL/A|MacBook Air 13 M4' }
];

console.log('\nPDF PRO · una cotización con Opción A vigente y Opción B alternativa');
{
  const ctx = cargar(CAMPOS);
  const { html, nombre } = documentoDe(ctx, ITEMS, WARR, 1, true);

  ok(!!html, 'genera el documento');
  ok(ctx._guardo === true, 'guarda la cotización antes de exportar');

  // El total: 10 × 1200 = 12.000. La Opción B (10 × 2000 = 20.000) NO suma.
  const total = (html.match(/s-total[\s\S]*?s-val">([^<]+)</) || [])[1];
  ok(/12\.000/.test(total || ''), 'el Total de la operación cuenta SOLO la opción vigente', 'salió: ' + total);
  ok(!/32\.000/.test(html), 'no suma las dos opciones juntas');

  // La alternativa se informa, con su importe, fuera del total.
  ok(/No está incluido en este total/.test(html), 'declara qué quedó afuera del total');
  ok(/Alternativas cotizadas[\s\S]*?MacBook Pro 14 M4[\s\S]*?20\.000/.test(html),
     'informa la Opción B aparte, con su importe');

  // Chips
  ok(/chip-sol">SOLICITADO/.test(html), 'sella la línea vigente como SOLICITADO');
  ok(/chip-alt">ALTERNATIVA · OPCIÓN B/.test(html), 'sella la otra como ALTERNATIVA · OPCIÓN B');

  // Garantías: se listan, pero fuera del total.
  ok(/Garantías extendidas — CevenCare/.test(html), 'lista las garantías en su sección');
  ok(/no están incluidas en el total/.test(html), 'aclara que las garantías no suman');
  ok(/badge-gl">GL</.test(html) && /badge-cc">CC</.test(html), 'el badge del canal sale de una lista cerrada');

  // Condiciones: vienen de shared/pdf-core.js, no del <select> crudo.
  ok(!/__otra/.test(html), 'la entrega libre no sale como "__otra"');
  ok(/Entre 5 y 7 días hábiles/.test(html), 'imprime el texto real de la entrega');
  ok(/Apple Business Manager/.test(html), 'incluye las condiciones propias de la marca');
  ok(/Propuesta efectiva hasta: 2026-10-15/.test(html), 'incluye la validez');

  // Escapado
  ok(/&lt;notebooks&gt;/.test(html) && !/<notebooks>/.test(html),
     'escapa lo que escribe el usuario');

  // Nombre de archivo compartido con los otros documentos
  ok(nombre === 'Hospital Italiano - Piso 4 - Ceven - 2026-10-15',
     'el nombre del archivo lo arma cevenNombreDocumento()', 'salió: ' + nombre);
}

console.log('\nPDF PRO · la misma cotización con la Opción B marcada como vigente');
{
  const ctx = cargar(CAMPOS);
  const { html } = documentoDe(ctx, ITEMS, WARR, 2, true);
  const total = (html.match(/s-total[\s\S]*?s-val">([^<]+)</) || [])[1];
  ok(/20\.000/.test(total || ''), 'el total sigue a la opción vigente', 'salió: ' + total);
  ok(/Alternativas cotizadas[\s\S]*?MacBook Air 13 M4/.test(html), 'ahora la A es la alternativa');
  ok(/chip-alt">ALTERNATIVA · OPCIÓN A/.test(html), 'la sella como OPCIÓN A');
  ok(!/3AGLStartCa/.test(html),
     'no imprime las garantías de la opción que quedó como alternativa');
}

console.log('\nPDF PRO · una cotización de una sola opción');
{
  const ctx = cargar(CAMPOS);
  const { html } = documentoDe(ctx, [ITEMS[0]], WARR, 1, false);
  ok(!/chip-sol|chip-alt/.test(html), 'sin Opción B no sella ninguna línea (sería ruido)');
  ok(!/Alternativas cotizadas/.test(html), 'no habla de alternativas que no existen');
  const total = (html.match(/s-total[\s\S]*?s-val">([^<]+)</) || [])[1];
  ok(/12\.000/.test(total || ''), 'el total es el de la única opción');
}

console.log('\nPDF PRO · una cotización vacía');
{
  const ctx = cargar(CAMPOS);
  const { html } = documentoDe(ctx, [], [], 1, false);
  ok(html === undefined || html === null, 'no genera documento');
  ok(/vacía/.test(ctx._toast || ''), 'avisa por cartel, sin diálogo nativo');
}

console.log(fallos ? ('\n✗ ' + fallos + ' problema(s).\n') : '\n✓ PDF Pro OK.\n');
process.exit(fallos ? 1 : 0);
