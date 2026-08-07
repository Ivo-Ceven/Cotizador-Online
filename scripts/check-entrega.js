#!/usr/bin/env node
/* ============================================================================
   check-entrega.js · Cotizadores Ceven
   ----------------------------------------------------------------------------
   La entrega dejó de ser un <input type="text"> y pasó a ser un <select> con
   plazos fijos más una opción libre (08/2026). Eso mete tres cosas que se
   pueden romper sin tirar ninguna excepción:

     1) el `.value` del <select> vale "__otra" cuando se elige la opción libre.
        Si alguien lo lee crudo, el PDF sale diciendo "Entrega: __otra" y eso lo
        ve el cliente. Por eso se lee SIEMPRE con cevenDelivery();
     2) las cotizaciones guardadas de cuando era texto libre tienen cualquier
        cosa en la columna `Entrega`. Al reabrirlas tienen que entrar por la
        opción "Otra…" con su texto intacto, no perderse;
     3) la entrega inmediata se imprime en verde. Es un formato, así que no
        rompe nada si falla — simplemente deja de resaltar y nadie se entera.

   Se apoya, como check-comprobante.js, en que jsPDF escribe los content
   streams sin comprimir: el texto y los colores se leen del PDF con regex.

   Uso:  node scripts/check-entrega.js
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

/* ---- DOM de mentira --------------------------------------------------------
   Lo mínimo que ui-core.js toca al cargar, más el selector de entrega y su
   campo libre — que son los que se quieren ejercitar de verdad. */
function nuevoElemento(extra){
  return Object.assign({
    value: '', innerHTML: '', style: {}, _foco: 0,
    focus(){ this._foco++; },
    classList: { add(){}, remove(){} },
    getAttribute(){ return null; },
    setAttribute(){},
    removeAttribute(){}
  }, extra || {});
}

// Las MISMAS opciones que sirven los dos index.html. Si allá se agrega un plazo
// y acá no, el round-trip de ese plazo no queda cubierto — pero nada falla.
const OPCIONES = ['', 'Inmediata', '3 días hábiles', 'Entre 5 y 7 días hábiles', '__otra'];

function cargar(){
  const els = {
    delivery: nuevoElemento({ options: OPCIONES.map(v => ({ value: v })) }),
    'delivery-otra': nuevoElemento()
  };
  const ctx = {
    console,
    location: { href: 'https://cotizadores-ceven.vercel.app/poly/index.html', hash: '' },
    URL: URL,
    navigator: { userAgent: 'node' },
    btoa: s => Buffer.from(s, 'binary').toString('base64'),
    atob: s => Buffer.from(s, 'base64').toString('binary'),
    localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    document: {
      readyState: 'complete',
      body: { classList: { add(){}, remove(){} } },
      getElementById: id => els[id] || null,
      querySelectorAll: () => [],
      addEventListener(){},
      createElement: () => nuevoElemento()
    },
    CEVEN_EMISOR: {
      razonSocial: 'Ceven S.A', domicilio: 'Manuel Garcia 352',
      contacto: '', cuit: '30-69669295-1'
    },
    CEVEN_BRAND: { id: 'poly', prefix: 'poly_', condicionesFijas: [] },
    cevenK: base => 'poly_' + base,
    fD: n => Number(n).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    showToast: () => {}
  };
  ctx.window = ctx;
  ctx.self = ctx;
  ctx.globalThis = ctx;
  ctx.addEventListener = () => {};
  vm.createContext(ctx);

  const lee = p => fs.readFileSync(path.join(ROOT, p), 'utf8');
  vm.runInContext(lee('src/vendor/jspdf.umd.min.js'), ctx);
  vm.runInContext(lee('src/vendor/jspdf.plugin.autotable.min.js'), ctx);
  vm.runInContext(lee('src/shared/ui-core.js'), ctx);
  vm.runInContext(lee('src/shared/pdf-core.js'), ctx);
  vm.runInContext(lee('src/shared/comprobante.js'), ctx);
  return { ctx, els };
}

console.log('\nEntrega · selector, round-trip y resaltado\n');

const { ctx, els } = cargar();

/* ---- 1. Reconocer la entrega inmediata ----------------------------------- */
const esInm = ctx.cevenEntregaEsInmediata;
ok(esInm('Inmediata'),   'reconoce "Inmediata"');
ok(esInm('inmediata'),   'reconoce "inmediata" (minúscula, texto libre viejo)');
ok(esInm('  INMEDIATA '),'reconoce con espacios de más y en mayúsculas');
ok(!esInm(''),           'una entrega vacía NO es inmediata');
ok(!esInm('3 días hábiles'), '"3 días hábiles" NO es inmediata');
ok(!esInm('no inmediata'),   '"no inmediata" NO se toma por inmediata');
ok(!esInm('inmediata sujeta a stock'),
   '"inmediata sujeta a stock" NO se toma por inmediata (tiene condición)');

/* ---- 2. Round-trip por el selector --------------------------------------- */
ctx.cevenSetDelivery('Inmediata');
ok(els.delivery.value === 'Inmediata' && ctx.cevenDelivery() === 'Inmediata',
   'una opción de la lista queda elegida en el <select>', els.delivery.value);
ok(els['delivery-otra'].style.display === 'none',
   'con una opción de la lista, el campo libre queda escondido');

ctx.cevenSetDelivery('20 días hábiles puestos en obra');
ok(els.delivery.value === '__otra', 'un plazo que no está en la lista entra por "Otra…"');
ok(ctx.cevenDelivery() === '20 días hábiles puestos en obra',
   'cevenDelivery() devuelve el TEXTO libre, nunca el marcador "__otra"',
   ctx.cevenDelivery());
ok(els['delivery-otra'].style.display === '',
   'con "Otra…" el campo libre se muestra');

const focoAntes = els['delivery-otra']._foco;
ctx.cevenSetDelivery('otro plazo escrito a mano');
ok(els['delivery-otra']._foco === focoAntes,
   'restaurar una cotización no le roba el foco al usuario');

ctx.cevenSetDelivery('');
ok(els.delivery.value === '' && ctx.cevenDelivery() === '',
   'vaciar vuelve a la opción vacía, no a "Otra…" en blanco', els.delivery.value);
ok(els['delivery-otra'].value === '',
   'vaciar también limpia el campo libre (no deja el texto de la anterior)');

/* ---- 3. La línea de condiciones se marca ---------------------------------- */
const base = {
  'N° Cotización': '0563', 'Fecha': '06/08/2026', 'Cliente': 'Vista Energy',
  'Proyecto': 'Sala Directorio', 'Ejecutivo': 'Tsu Rivas',
  'Condición de pago': '30 días FF', 'Propuesta efectiva hasta': '2026-08-20',
  'SKU': '875K5AA', 'Descripción': 'Poly TC10 Touch Controller Black',
  'Cantidad': 1, 'IVA': '21%', 'P. Venta Unitario': 720, 'Total': 720
};
const filaInm  = Object.assign({}, base, { 'Entrega': 'Inmediata' });
const filaLent = Object.assign({}, base, { 'Entrega': '5 a 7 días hábiles' });

const detInm  = ctx.cevenCondicionesDetalle(filaInm);
const detLent = ctx.cevenCondicionesDetalle(filaLent);

ok(detInm[detInm.length - 1].texto === 'Entrega: Inmediata',
   '"Entrega" sigue siendo la última condición', detInm[detInm.length - 1].texto);
ok(detInm[detInm.length - 1].destacar === true,
   'la entrega inmediata queda marcada para destacar');
ok(detLent[detLent.length - 1].destacar === false,
   'una entrega con plazo NO queda marcada');
ok(detInm.filter(l => l.destacar).length === 1,
   'se destaca UNA sola línea, no el bloque entero');

// La forma vieja (strings pelados) tiene que seguir intacta: la usan los otros
// chequeos y cualquiera que arme el bloque a mano.
const strs = ctx.cevenCondiciones(filaInm);
ok(Array.isArray(strs) && typeof strs[0] === 'string',
   'cevenCondiciones() sigue devolviendo strings pelados');
ok(strs.length === detInm.length && strs[strs.length - 1] === 'Entrega: Inmediata',
   'cevenCondiciones() y cevenCondicionesDetalle() dicen lo mismo');

/* ---- 4. El HTML del PDF de la cotización ---------------------------------- */
ctx.cevenEsc = s => String(s);   // pdf-core cae a esto si no está safe.js
const htmlInm  = ctx.cevenCondicionesHTML(filaInm);
const htmlLent = ctx.cevenCondicionesHTML(filaLent);
ok(/class="cd cd-ok">Entrega: Inmediata</.test(htmlInm),
   'la entrega inmediata sale con la clase cd-ok', htmlInm);
ok((htmlInm.match(/cd-ok/g) || []).length === 1,
   'solo esa línea lleva cd-ok');
ok(!/cd-ok/.test(htmlLent),
   'con plazo no aparece cd-ok en ningún lado');
ok(/\.cd-ok\{/.test(ctx.cevenPdfDocCSS('')) && /\.cd-ok\{/.test(ctx.cevenPdfListCSS()),
   'las DOS hojas de estilo definen .cd-ok (si no, la clase no pinta nada)');

/* ---- 5. El comprobante: encabezado unificado y verde ---------------------- */
function textoPDF(doc){
  const crudo = doc.output('arraybuffer');
  const s = Buffer.from(crudo).toString('latin1');
  return (s.match(/\((?:\\.|[^()\\])*\)/g) || [])
    .map(t => t.slice(1, -1).replace(/\\([()\\])/g, '$1')).join(' ');
}

const docInm = ctx.cevenComprobanteDoc('0563', [filaInm], ctx.CEVEN_EMISOR);
ok(!!docInm, 'el comprobante se genera sin reventar');
const txtInm = textoPDF(docInm);

ok(/Cotización N/.test(txtInm) && /0563/.test(txtInm), 'el número de cotización está');
ok(/Cliente:/.test(txtInm),  'el cliente ahora lleva rótulo "Cliente:" (está en la tabla)');
ok(/Vista Energy/.test(txtInm), 'el nombre del cliente está');
ok(/Proyecto:/.test(txtInm) && /Sala Directorio/.test(txtInm), 'el proyecto está, con su rótulo');
ok(!/Datos del cliente/.test(txtInm),
   'ya no existe la sección aparte "Datos del cliente"');
ok(/Entrega: Inmediata/.test(txtInm), 'la condición de entrega está impresa');

/* El verde: jsPDF escribe los colores como "r g b rg", normalizados a 0..1.
   Se comparan como NÚMEROS y no como texto: la cantidad de decimales que emite
   no es la misma para el color del texto (3) que para el del relleno (2), y
   clavar el formato hacía fallar un chequeo que en realidad estaba bien. */
function coloresDe(doc){
  const s = Buffer.from(doc.output('arraybuffer')).toString('latin1');
  return (s.match(/(?:^|[\s>])(-?[\d.]+) (-?[\d.]+) (-?[\d.]+) rg\b/g) || [])
    .map(op => op.trim().split(/\s+/).slice(0, 3).map(Number));
}
const cerca = (usados, c) => usados.some(u =>
  u.every((v, i) => Math.abs(v - c[i] / 255) < 0.01));

const usadosInm = coloresDe(docInm);
ok(cerca(usadosInm, ctx.CEVEN_COMP_VERDE),
   'el comprobante escribe el verde de texto para la entrega inmediata');
ok(cerca(usadosInm, ctx.CEVEN_COMP_VERDE_BG),
   'y el recuadro verde claro de fondo');

const docLent = ctx.cevenComprobanteDoc('0563', [filaLent], ctx.CEVEN_EMISOR);
ok(!cerca(coloresDe(docLent), ctx.CEVEN_COMP_VERDE),
   'con una entrega con plazo NO se usa el verde');

/* Un cliente larguísimo no puede empujar el texto fuera de la caja: la fila
   crece. Se comprueba que el nombre entero siga estando (partido en renglones,
   pero completo) y que el detalle siga saliendo después. */
const largo = 'Consorcio de Cooperación para la Infraestructura Audiovisual del Área Metropolitana Sociedad Anónima';
const docLargo = ctx.cevenComprobanteDoc('0563', [Object.assign({}, filaInm, { 'Cliente': largo })], ctx.CEVEN_EMISOR);
const txtLargo = textoPDF(docLargo).replace(/\s+/g, ' ');
ok(largo.split(' ').every(p => txtLargo.includes(p)),
   'un cliente largo se parte en renglones pero no pierde ninguna palabra');
ok(/TOTAL/.test(txtLargo), 'y el detalle sigue saliendo debajo');

console.log('\n' + (fallos ? '✗ ' + fallos + '/' + corridas + ' FALLARON' : '✓ ' + corridas + '/' + corridas + ' OK') + '\n');
process.exit(fallos ? 1 : 0);
