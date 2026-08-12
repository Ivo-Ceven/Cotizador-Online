#!/usr/bin/env node
/* ============================================================================
   check-multi.js · Cotizadores Ceven
   ----------------------------------------------------------------------------
   El cotizador multimarca (src/multi/) cotiza SKUs de Apple y de Poly sin ser
   la app de ninguna de las dos. La pregunta que este banco contesta es UNA:

       ¿el mismo SKU sale al mismo precio por los dos caminos?

   Si divergen, el cliente recibe un PDF multimarca con un precio y el PDF de la
   marca con otro — y nadie se entera hasta que él los compara. Por eso los dos
   caminos corren acá sobre el MISMO producto y se compara el número.

   Se cargan los archivos REALES: los de la marca (apple/js/pricing.js,
   poly/js/tiers.js, con sus globales de pantalla) y los del multimarca
   (multi/js/marcas.js, que solo conoce los `pricing-core.js`).

   Verifica además el REPARTO por marca y la forma de las filas que se emiten,
   que es lo que hace que la cotización se vea completa del lado de la marca.

   Uso:  node scripts/check-multi.js
   ========================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const lee = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

let fallos = 0, corridas = 0;
function ok(cond, nombre, detalle){
  corridas++;
  if(cond){ console.log('  ✓ ' + nombre); return; }
  fallos++;
  console.error('  ✗ ' + nombre + (detalle ? ('\n      ' + detalle) : ''));
}

const T1 = 'Ceven - Tier 1', T2 = 'Ceven - Tier 2', T3 = 'Ceven - Tier 3', NE = 'Negocios Especiales';

/* ── Catálogos de prueba ─────────────────────────────────────────────────────
   Apple: `sellingPrice` es el precio del price list (nuestro costo) y `lob` es
   lo que matchea la tabla NAC. Poly: los cuatro niveles, con el SKU cuyo Tier 2
   sale más caro que el Tier 1 para que nada asuma que están ordenados. */
const CAT_APPLE = [
  {sku:'MX2H3LE/A', description:'MacBook Pro 14 M4 16GB', lob:'MacBook Pro 14', modelCol:'MacBook Pro 14', sellingPrice:1799},
  {sku:'MYD83LE/A', description:'iPhone 17 Pro 256GB',    lob:'iPhone 17 Pro',  modelCol:'iPhone 17 Pro',  sellingPrice:1099},
  {sku:'MU8F3AM/A', description:'Magic Keyboard',         lob:'Mice & Keyboards', modelCol:'Mice & Keyboards', sellingPrice:99},
  // Producto con la nacionalización ya incluida en el costo: NAC tiene que dar 0.
  {sku:'NAC-INC',   description:'Mac mini nacionalizado', lob:'Mac mini', modelCol:'Mac mini', sellingPrice:800, nacIncluded:true}
];
const CAT_POLY = [
  {sku:'772D0AA', description:'Sync 20+',    iva:'21%',    precios:{[T1]:235, [T2]:230, [T3]:225, [NE]:190}},
  {sku:'A4LZ8AA', description:'Studio AIO',  iva:'21%',    precios:{[T1]:3983.85, [T2]:4346, [T3]:4346, [NE]:3912}},
  {sku:'SIN-TIER',description:'A mano',      iva:'21%',    precios:{}}
];

/* ── El camino de la MARCA ────────────────────────────────────────────────── */

// Apple tal como corre en su app: pricing.js con sus globales de pantalla.
function entornoApple(){
  const ctx = {
    console,
    quoteNacOverrides: {},
    document: { getElementById: () => null }
  };
  ctx.window = ctx; ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(lee('src/apple/js/pricing-core.js'), ctx, {filename:'pricing-core.js'});
  // state.js hace exactamente esto: las tablas salen de pricing-core.
  ctx.nacRates = JSON.parse(JSON.stringify(ctx.CEVEN_APPLE_NAC_DEF));
  ctx.IVA_MAP = ctx.CEVEN_APPLE_IVA_MAP;
  ctx.MODEL_CATEGORY = ctx.CEVEN_APPLE_MODEL_CATEGORY;
  ctx.items = [];
  vm.runInContext(lee('src/apple/js/pricing.js'), ctx, {filename:'pricing.js'});
  vm.runInContext(lee('src/apple/js/pipeline-core.js'), ctx, {filename:'pipeline-core.js'});
  return ctx;
}

// Poly tal como corre en su app: tiers.js leyendo el <select> global.
function entornoPoly(tierGlobalVal){
  const sel = { value: tierGlobalVal || '' };
  const ctx = {
    console,
    products: JSON.parse(JSON.stringify(CAT_POLY)),
    items: [],
    CEVEN_BRAND: { priceTiers: [{v:T1,lbl:'Tier 1'},{v:T2,lbl:'Tier 2'},{v:T3,lbl:'Tier 3'},{v:NE,lbl:'Neg. Esp.'}] },
    document: { getElementById: id => (id === 'tier-global' ? sel : null) },
    cevenEsc: s => String(s), fD: n => String(n),
    showToast(){}, renderQ(){}, cevenClienteSet(){}, cevenClienteTier: () => '',
    cevenNormClient: s => String(s||'').trim().toLowerCase()
  };
  ctx.window = ctx; ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(lee('src/poly/js/pricing-core.js'), ctx, {filename:'pricing-core.js'});
  vm.runInContext(lee('src/poly/js/tiers.js'), ctx, {filename:'tiers.js'});
  vm.runInContext(lee('src/poly/js/pipeline-core.js'), ctx, {filename:'pipeline-core.js'});
  ctx._sel = sel;
  return ctx;
}

/* ── El camino del MULTIMARCA ─────────────────────────────────────────────── */
function entornoMulti(){
  const ctx = { console };
  ctx.window = ctx; ctx.globalThis = ctx;
  vm.createContext(ctx);
  // El multimarca solo carga los núcleos, NO los archivos con DOM de cada marca.
  vm.runInContext(lee('src/apple/js/pricing-core.js'), ctx, {filename:'apple/pricing-core.js'});
  vm.runInContext(lee('src/poly/js/pricing-core.js'),  ctx, {filename:'poly/pricing-core.js'});
  vm.runInContext(lee('src/multi/js/marcas.js'), ctx, {filename:'marcas.js'});
  return ctx;
}

function ctxBase(extra){
  const base = {
    fecha:'11/08/2026', hora:'10:30', cliente:'ACME S.A.', proyecto:'Sala de reuniones',
    ejecutivo:'Ivo', obs:'—', mesCierre:'2026-09', estado:'Cotizado',
    payMode:'30 días', effDate:'2026-08-31', delivery:'Inmediata',
    qn:'0123', multiQNum:'M-0042',
    margen:0, fob:false, tierGlobal:'',
    nacRates:{}, catalogos:{apple:CAT_APPLE, poly:CAT_POLY}
  };
  for(const k in (extra||{})) base[k] = extra[k];
  return base;
}

const M = entornoMulti();

/* ========================== 1) MISMO PRECIO: APPLE ========================= */
console.log('\nCotizador multimarca · el mismo SKU al mismo precio\n');
console.log('1 · Apple: multimarca vs. cotizador de Apple');
{
  const A = entornoApple();
  const ctx = ctxBase({margen: 12, nacRates: A.nacRates});

  CAT_APPLE.forEach(function(p){
    // Camino de la marca: es lo que hace _sumarProductoAItems() en catalog.js.
    const nacMarca = p.nacIncluded ? 0 : A.getNac(p);
    const precioMarca = A.calcP(p.sellingPrice, nacMarca, 12);
    // Camino del multimarca.
    const linea = M.CEVEN_MULTI_MARCAS.apple.nuevaLinea(p, ctx);
    ok(linea.salePrice === precioMarca,
       p.sku + ': ' + precioMarca + ' por los dos caminos',
       'marca ' + precioMarca + ' · multimarca ' + linea.salePrice);
  });

  const mbp = M.CEVEN_MULTI_MARCAS.apple.nuevaLinea(CAT_APPLE[0], ctx);
  ok(mbp.itemNac === A.getNac(CAT_APPLE[0]), 'la nacionalización de la línea es la de la tabla NAC de Apple',
     'dio ' + mbp.itemNac);
  ok(mbp.taxes === A.getIVA(CAT_APPLE[0].lob), 'y el IVA es el mismo que calcula getIVA()',
     'marca ' + A.getIVA(CAT_APPLE[0].lob) + ' · multimarca ' + mbp.taxes);

  const nacInc = M.CEVEN_MULTI_MARCAS.apple.nuevaLinea(CAT_APPLE[3], ctx);
  ok(nacInc.itemNac === 0, 'un producto con la nacionalización incluida cotiza con NAC 0');

  const fob = M.CEVEN_MULTI_MARCAS.apple.nuevaLinea(CAT_APPLE[0], ctxBase({margen:12, nacRates:A.nacRates, fob:true}));
  ok(fob.itemNac === 0, 'una cotización FOB fuerza NAC 0');
  ok(fob.salePrice === A.calcP(CAT_APPLE[0].sellingPrice, 0, 12), 'y el precio FOB coincide con el de la marca');
}

console.log('\n2 · Apple: cambiar el margen mueve las líneas igual que en la marca');
{
  const A = entornoApple();
  const ctx = ctxBase({margen: 12, nacRates: A.nacRates});
  const linea = M.CEVEN_MULTI_MARCAS.apple.nuevaLinea(CAT_APPLE[0], ctx);
  ctx.margen = 20;
  const cambio = M.CEVEN_MULTI_MARCAS.apple.repricear(linea, ctx);
  ok(cambio === true, 'informa que la línea cambió');
  ok(linea.salePrice === A.calcP(CAT_APPLE[0].sellingPrice, linea.itemNac, 20),
     'con margen 20 da lo mismo que calcP() de Apple', 'dio ' + linea.salePrice);
  ok(linea.itemMargin === 20, 'y la línea queda con el margen nuevo');

  linea.manualMargin = true;
  ctx.margen = 35;
  ok(M.CEVEN_MULTI_MARCAS.apple.repricear(linea, ctx) === false,
     'una línea con precio escrito a mano NO se mueve');
}

/* =========================== 3) MISMO PRECIO: POLY ======================== */
console.log('\n3 · Poly: multimarca vs. cotizador de Poly');
{
  [T1, T2, T3, NE].forEach(function(tier){
    const P = entornoPoly(tier);
    const ctx = ctxBase({tierGlobal: tier});
    CAT_POLY.forEach(function(p){
      const precioMarca = P.precioDeCatalogo(p.sku, tier);
      const linea = M.CEVEN_MULTI_MARCAS.poly.nuevaLinea(p, ctx);
      const precioMulti = (linea.salePrice === '') ? null : linea.salePrice;
      ok(precioMulti === precioMarca,
         p.sku + ' en ' + tier + ': ' + precioMarca + ' por los dos caminos',
         'marca ' + precioMarca + ' · multimarca ' + precioMulti);
    });
  });
}

console.log('\n4 · Poly: el nivel de la línea le gana al global, igual que en la marca');
{
  const ctx = ctxBase({tierGlobal: T3});
  const linea = M.CEVEN_MULTI_MARCAS.poly.nuevaLinea(CAT_POLY[0], ctx);
  ok(linea.salePrice === 225, 'nace con el nivel global (Tier 3 = 225)', 'dio ' + linea.salePrice);

  linea.tier = NE;
  ok(M.CEVEN_MULTI_MARCAS.poly.repricear(linea, ctx) === false,
     'con nivel propio, cambiar el global NO la mueve');

  const sigue = M.CEVEN_MULTI_MARCAS.poly.nuevaLinea(CAT_POLY[0], ctx);
  ctx.tierGlobal = T1;
  ok(M.CEVEN_MULTI_MARCAS.poly.repricear(sigue, ctx) === true && sigue.salePrice === 235,
     'la que sigue al global pasa a 235', 'dio ' + sigue.salePrice);

  const sinTier = M.CEVEN_MULTI_MARCAS.poly.nuevaLinea(CAT_POLY[2], ctxBase({tierGlobal: T1}));
  ok(sinTier.salePrice === '', 'un SKU sin ese nivel queda sin precio, no en 0',
     'dio ' + JSON.stringify(sinTier.salePrice));
}

/* ============================== 5) REPARTO ================================ */
console.log('\n5 · Reparto: a cada marca solo lo suyo');
{
  const ctxA = ctxBase({margen:12, nacRates: entornoApple().nacRates});
  const ctxP = ctxBase({tierGlobal:T1});
  const items = [
    M.CEVEN_MULTI_MARCAS.apple.nuevaLinea(CAT_APPLE[0], ctxA),
    M.CEVEN_MULTI_MARCAS.poly.nuevaLinea(CAT_POLY[0], ctxP),
    M.CEVEN_MULTI_MARCAS.apple.nuevaLinea(CAT_APPLE[1], ctxA)
  ];
  const marcas = M.cevenMultiMarcasDe(items);
  ok(marcas.length === 2 && marcas[0] === 'apple' && marcas[1] === 'poly',
     'detecta las dos marcas presentes, en el orden del registro', JSON.stringify(marcas));

  const deApple = M.cevenMultiLineasDe(items, 'apple');
  const dePoly  = M.cevenMultiLineasDe(items, 'poly');
  ok(deApple.length === 2, 'a Apple le tocan sus 2 líneas', 'dio ' + deApple.length);
  ok(dePoly.length === 1,  'a Poly le toca 1', 'dio ' + dePoly.length);
  ok(deApple.every(l => l.brand === 'apple'), 'ninguna línea de otra marca se cuela en Apple');
  ok(dePoly.every(l => l.brand === 'poly'),   'ni en Poly');

  ok(M.cevenMultiMarcasDe([{brand:'hp'}]).indexOf('hp') === 0,
     'una marca que el registro no conoce se devuelve igual, para poder avisar');
  ok(M.cevenMultiMarcaLabel('hp') === 'hp', 'y su etiqueta sale cruda en vez de caer a otra marca');
}

/* ===================== 6) LA FORMA DE LO QUE SE EMITE ===================== */
console.log('\n6 · Las filas emitidas tienen la forma que espera cada marca');
{
  const ctxA = ctxBase({margen:12, nacRates: entornoApple().nacRates});
  const it = M.CEVEN_MULTI_MARCAS.apple.nuevaLinea(CAT_APPLE[0], ctxA);
  it.qty = 3;
  const fila = M.CEVEN_MULTI_MARCAS.apple.filaCquotes(it, ctxA);

  // Las claves que lee el cotizador de Apple al reabrir la cotización.
  ['N° Cotización','Fecha','Cliente','Proyecto','Ejecutivo','Mes Cierre','SKU','Descripción',
   'Cantidad','IVA','Margen %','P. Venta Unitario','Total','Tipo','_base','_nac','_lob','_estado'
  ].forEach(function(k){
    ok(fila[k] !== undefined, 'la fila de Apple trae "' + k + '"');
  });
  ok(fila['Total'] === it.salePrice * 3, 'el Total es precio × cantidad', 'dio ' + fila['Total']);
  ok(fila['Tipo'] === 'producto', 'el Tipo es "producto"');
  ok(fila['Opción'] === 1 && fila['_opcEf'] === 1,
     'baja como cotización de UNA opción, aunque el multimarca tenga A y B');
  ok(fila['_multi'] === 'M-0042', 'y queda el link al pedido que la originó');

  const ctxP = ctxBase({tierGlobal:T1});
  const ip = M.CEVEN_MULTI_MARCAS.poly.nuevaLinea(CAT_POLY[0], ctxP);
  ip.qty = 2;
  const filaP = M.CEVEN_MULTI_MARCAS.poly.filaCquotes(ip, ctxP);
  ['N° Cotización','Cliente','Proyecto','Ejecutivo','Nivel de precio','SKU','Descripción',
   'Cantidad','Nota','IVA','P. Venta Unitario','Total','Tipo','_estado'
  ].forEach(function(k){
    ok(filaP[k] !== undefined, 'la fila de Poly trae "' + k + '"');
  });
  ok(filaP['Nivel de precio'] === T1, 'con el nivel efectivo de la línea', 'dio ' + filaP['Nivel de precio']);
  ok(filaP['Total'] === 235 * 2, 'y el Total es precio × cantidad', 'dio ' + filaP['Total']);

  // Un SKU sin precio no puede emitir un Total NaN al pipeline de la marca.
  const vacio = M.CEVEN_MULTI_MARCAS.poly.nuevaLinea(CAT_POLY[2], ctxP);
  vacio.qty = 2;
  ok(M.CEVEN_MULTI_MARCAS.poly.filaCquotes(vacio, ctxP)['Total'] === 0,
     'una línea sin precio emite Total 0, no NaN');
}

/* ============ 7) LOS TOTALES DE LA FILA DE PIPELINE CIERRAN ============== */
console.log('\n7 · El total de la fila de pipeline es el de sus líneas');
{
  const A = entornoApple();
  const ctxA = ctxBase({margen:12, nacRates: A.nacRates});
  const its = [
    M.CEVEN_MULTI_MARCAS.apple.nuevaLinea(CAT_APPLE[0], ctxA),   // Mac
    M.CEVEN_MULTI_MARCAS.apple.nuevaLinea(CAT_APPLE[1], ctxA),   // iPhone
    M.CEVEN_MULTI_MARCAS.apple.nuevaLinea(CAT_APPLE[2], ctxA)    // accesorio
  ];
  its[0].qty = 2;
  const ag = M.CEVEN_MULTI_MARCAS.apple.filaPipeline(its, ctxA);
  const suma = its.reduce((t, i) => t + i.salePrice * i.qty, 0);
  ok(ag.monto === Math.round(suma), 'Apple: el monto es la suma de las líneas',
     'fila ' + ag.monto + ' · líneas ' + Math.round(suma));

  // La misma cuenta que hace addToPipeline() en la app de Apple.
  const agMarca = A._pipeAgregados(its, []);
  ok(JSON.stringify(ag) === JSON.stringify(agMarca),
     'y TODOS los agregados (familias, montos, margen ponderado) son idénticos a los de la marca');
  ok(ag.qMac === 2, 'la MacBook cuenta 2 unidades en la familia Mac', 'dio ' + ag.qMac);
  ok(ag.qIph === 1, 'el iPhone, 1 en iPhone', 'dio ' + ag.qIph);
  ok(ag.qAcc === 1, 'y el teclado cae en accesorios', 'dio ' + ag.qAcc);

  const P = entornoPoly(T1);
  const ctxP = ctxBase({tierGlobal:T1});
  const ips = [
    M.CEVEN_MULTI_MARCAS.poly.nuevaLinea(CAT_POLY[0], ctxP),
    M.CEVEN_MULTI_MARCAS.poly.nuevaLinea(CAT_POLY[1], ctxP)
  ];
  ips[0].qty = 4;
  const filaP = M.CEVEN_MULTI_MARCAS.poly.filaPipeline(ips, ctxP);
  ok(filaP.monto === P._pipeMontoDeItems(ips),
     'Poly: el monto es el mismo que calcula su addToPipeline()',
     'multimarca ' + filaP.monto + ' · marca ' + P._pipeMontoDeItems(ips));
}

/* ==================== 8) LA PANTALLA SE ARMA DE VERDAD ==================== */
/* Los tres bloques de arriba prueban las cuentas. Este prueba el CABLEADO:
   carga el bundle real de la página (los mismos <script src> que el navegador,
   en el mismo orden) y corre renderQ() sobre un DOM mínimo.

   Existe porque en esta app todo es global y sin build: una llamada a una
   función que no existe —o que quedó en otra marca— no la detecta nada hasta
   que alguien abre la pantalla y le sale un error en la consola. */
console.log('\n8 · La pantalla se arma sin romperse');
{
  const html = lee('src/multi/index.html');
  const srcs = [];
  const re = /<script\s+src="([^"]+)"\s*><\/script>/g;
  let m;
  while((m = re.exec(html))) srcs.push(m[1]);

  // Fuera lo que no se puede correr en Node: vendor (xlsx) y todo lo que hable
  // con la red o el navegador (auth, sync, pwa, backups, service worker).
  /* Fuera lo que necesita navegador de verdad. `notify.js` también: dibuja los
     carteles montando nodos en document.body, y emularlo entero no probaría
     nada del multimarca — los stubs de arriba lo reemplazan. */
  const FUERA = ['vendor/', 'auth.js', 'sync.js', 'pwa.js', 'navbar.js', 'nav.js',
                 'theme.js', 'backup.js', 'backup-folder.js', 'recovery.js',
                 'init.js', 'boot.js', 'papelera.js', 'config.js', 'notify.js'];
  const cargables = srcs
    .map(s => 'src/multi/' + s)
    .map(s => path.normalize(s).replace(/\\/g, '/'))
    .map(s => s.replace(/src\/multi\/\.\.\//, 'src/'))
    .filter(s => !FUERA.some(f => s.indexOf(f) >= 0));

  // Un DOM mínimo: cada elemento recuerda su innerHTML para poder mirarlo.
  const els = {};
  function el(id){
    if(!els[id]) els[id] = {id, value:'', innerHTML:'', textContent:'', style:{}, classList:{add(){},remove(){},contains(){return false}},
                            getAttribute(){return null}, setAttribute(){}, addEventListener(){}, appendChild(){}, querySelectorAll(){return []}};
    return els[id];
  }
  const ctx = {
    console, Date, Math, JSON, Object, Array, String, Number, parseInt, parseFloat, isNaN,
    setTimeout: () => 0, encodeURIComponent,
    localStorage: { getItem: () => null, setItem(){}, removeItem(){} },
    document: {
      getElementById: id => els[id] || null,
      querySelectorAll: () => [],
      addEventListener(){},
      createElement: () => ({style:{}, appendChild(){}, click(){}})
    },
    fetch: () => Promise.reject(new Error('sin red en el banco')),
    // window.addEventListener / location / navigator: los usan los módulos
    // compartidos al cargarse (cerrar popovers al scrollear, etc.).
    addEventListener(){}, removeEventListener(){},
    location: {replace(){}, reload(){}, href: ''},
    navigator: {onLine: true},
    showToast(){}, showErr(){}, notifyUndo(){}, confirmModal(){}, promptModal(){},
    goTo(){}, toggleTC(){}, autoSnapshot(){},
    cevenCanUsePipeline: () => true, cevenCanEditQuote: () => true,
    cevenOwnsExecutive: () => false, cevenMyNombre: () => 'Ivo',
    cevenGetSession: () => null, cevenEnsureExecOption(){},
    cevenPayMode: () => '30 días', cevenDelivery: () => 'Inmediata',
    cevenSetPayMode(){}, cevenSetDelivery(){},
    getMesCierre: () => '2026-09', setMesCierre(){},
    getCur: () => 'USD', getTC: () => 0,
    fI: n => String(Math.round(n)), fD: n => String(n), dp: u => 'USD ' + Math.round(u),
    cevenMonthField: () => '', cevenRefreshClienteDatalist(){},
    renderPapelera(){}, XLSX: {}
  };
  ctx.window = ctx; ctx.globalThis = ctx;
  vm.createContext(ctx);

  // Los contenedores que la pantalla espera encontrar.
  ['qbody','ctrl-box','opc-bar-box','opc-aviso-box','emitir-resumen','catbody','fmarca',
   'catcount','cat-sello','nocat','catui','histwrap','hist-del-btn','client','proyecto',
   'obs','opg','exec','quote-estado','eff-date','qnum','hclient','hexec','fsearch'].forEach(el);

  let error = null;
  try{
    cargables.forEach(f => vm.runInContext(lee(f), ctx, {filename: f}));
  }catch(e){ error = e; }
  ok(!error, 'el bundle de la página carga entero, en el orden del HTML',
     error && (error.message + ' @ ' + error.stack.split('\n')[1]));

  if(!error){
    // Un pedido mixto, armado con el mismo camino que usa el botón "+" del catálogo.
    ctx.catalogos = {apple: CAT_APPLE, poly: CAT_POLY};
    ctx.nacRatesApple = JSON.parse(JSON.stringify(ctx.CEVEN_APPLE_NAC_DEF));
    ctx._margenGlobalValor = 12;
    ctx._tierGlobalValor = T1;
    ctx.products = [];
    ['apple','poly'].forEach(function(b){
      (ctx.catalogos[b]).forEach(function(p){
        var c = JSON.parse(JSON.stringify(p)); c.brand = b; c.id = b + '|' + p.sku;
        ctx.products.push(c);
      });
    });

    let e2 = null;
    try{
      ctx.agregarAlPedido('apple|MX2H3LE/A');
      ctx.agregarAlPedido('poly|772D0AA');
      ctx.renderQ();
    }catch(e){ e2 = e; }
    ok(!e2, 'agregar productos de dos marcas y renderizar la grilla no tira',
       e2 && (e2.message + ' @ ' + e2.stack.split('\n')[1]));

    if(!e2){
      const grilla = els['qbody'].innerHTML;
      ok(ctx.items.length === 2, 'las dos líneas quedaron en el pedido', 'dio ' + ctx.items.length);
      ok(/mk-apple/.test(grilla) && /mk-poly/.test(grilla), 'la grilla separa las líneas por marca');
      ok(/MX2H3LE\/A/.test(grilla) && /772D0AA/.test(grilla), 'y muestra los dos SKU');
      ok(/Total del pedido/.test(grilla), 'con el total del pedido al pie');

      const ctrls = els['ctrl-box'].innerHTML;
      ok(/margen-global/.test(ctrls), 'aparece el control de margen (hay líneas de Apple)');
      ok(/tier-global/.test(ctrls),   'y el de nivel (hay líneas de Poly)');

      ok(/Apple/.test(els['emitir-resumen'].innerHTML) && /Poly/.test(els['emitir-resumen'].innerHTML),
         'el resumen avisa que se van a crear dos cotizaciones');

      // Sacar todas las líneas de Poly tiene que sacar su control.
      ctx.items = ctx.items.filter(i => i.brand !== 'poly');
      ctx.renderQ();
      ok(!/tier-global/.test(els['ctrl-box'].innerHTML),
         'sin líneas de Poly ya no se muestra su selector de nivel');

      // Y el catálogo también se arma.
      let e3 = null;
      try{ ctx.renderCat(); }catch(e){ e3 = e; }
      ok(!e3, 'el catálogo unificado se renderiza', e3 && e3.message);
      if(!e3) ok(/mk-poly/.test(els['catbody'].innerHTML), 'con productos de las dos marcas');
    }
  }
}

/* ============== 8b) LA CLAVE DE app_settings LLEVA PREFIJO ================ */
/* Regresión del bug del 12/08/2026, que es el que hacía que el multimarca
   mostrara SOLO productos de Apple.

   `app_settings.key` guarda la clave REAL de localStorage, con el prefijo de la
   marca (sync.js le aplica cevenK() antes de subir). El catálogo de Poly está
   en `(poly,'poly_cpl')`; el de Apple en `(apple,'cpl')` solo porque el prefijo
   de Apple es ''. Pedir `key=eq.cpl` devuelve Apple y NADA más — sin error, sin
   fila, sin pista. Por eso hay que verificarlo con un chequeo y no con la vista. */
console.log('\n8b · La clave de app_settings se pide con el prefijo de cada marca');
{
  ok(M.cevenMultiClave('apple', 'cpl') === 'cpl',
     'Apple: cpl (su prefijo es vacío, por historia)', 'dio ' + M.cevenMultiClave('apple','cpl'));
  ok(M.cevenMultiClave('poly', 'cpl') === 'poly_cpl',
     'Poly: poly_cpl', 'dio ' + M.cevenMultiClave('poly','cpl'));
  ok(M.cevenMultiClave('poly', 'cquotes') === 'poly_cquotes',
     'y su historial es poly_cquotes', 'dio ' + M.cevenMultiClave('poly','cquotes'));

  var claves = M.cevenMultiClaves(['cpl', 'cnac']);
  ok(claves.indexOf('poly_cpl') >= 0 && claves.indexOf('cpl') >= 0,
     'la lista para el `key=in.(...)` incluye las de TODAS las marcas', JSON.stringify(claves));

  // El prefijo del registro tiene que ser el mismo que el del brand.js de esa
  // marca: si divergen, el multimarca lee una clave que no existe.
  ['apple', 'poly'].forEach(function(b){
    var src = lee('src/' + b + '/brand.js');
    var m = src.match(/prefix:\s*'([^']*)'/);
    ok(m && m[1] === M.CEVEN_MULTI_MARCAS[b].prefix,
       'el prefijo de ' + b + ' coincide con el de su brand.js',
       'brand.js=' + (m && m[1]) + ' registro=' + M.CEVEN_MULTI_MARCAS[b].prefix);
  });
}

/* ============ 9) UNA MARCA GRANDE NO PUEDE TAPAR A LAS OTRAS ============== */
/* Regresión de un bug real (12/08/2026): el catálogo recortaba a 300 filas
   sobre la lista entera, y como `products` se arma marca por marca —Apple
   primero, con cientos de SKUs— el corte caía antes de la primera línea de
   Poly. La pantalla mostraba SOLO productos de Apple y se leía como "el
   multimarca no conoce Poly".

   El tope es necesario (pintar miles de filas congela la pantalla), así que lo
   que se verifica es que sea POR MARCA. */
console.log('\n9 · Una marca con muchos SKUs no tapa a las demás');
{
  const els = {};
  function el(id){
    if(!els[id]) els[id] = {id, value:'', innerHTML:'', textContent:'', style:{},
      classList:{add(){},remove(){},contains(){return false}},
      getAttribute(){return null}, setAttribute(){}, addEventListener(){}, appendChild(){}};
    return els[id];
  }
  ['catbody','fmarca','catcount','cat-sello','nocat','catui','qbody','ctrl-box',
   'opc-bar-box','opc-aviso-box','emitir-resumen','client','obs','fsearch'].forEach(el);

  const ctx = {
    console, Date, Math, JSON, Object, Array, String, Number, parseInt, parseFloat, isNaN,
    setTimeout: () => 0, encodeURIComponent,
    localStorage: {getItem: () => null, setItem(){}, removeItem(){}},
    document: {getElementById: id => els[id] || null, querySelectorAll: () => [], addEventListener(){}},
    addEventListener(){}, location: {}, navigator: {onLine: true},
    fetch: () => Promise.reject(new Error('sin red')),
    showToast(){}, showErr(){}, notifyUndo(){}, goTo(){},
    cevenOpcActiva: () => 1, cevenOpcDe: () => 1, cevenOpcFiltrar: a => a,
    cevenOpcEfectiva: () => 1, cevenOpcPintarBarra(){}, cevenOpcHayB: () => false,
    cevenDelegate(){}, cevenActEl: () => null,
    getCur: () => 'USD', getTC: () => 0, dp: u => 'USD ' + Math.round(u),
    fI: n => String(Math.round(n)), fD: n => String(n),
    getSortedItems: () => ctx.items, upField(){}, rmItem(){},
    items: [], products: [], histSel: {}, emitidas: {},
    cevenLsSet: () => true, cevenLsJSON: (k, d) => d,
    cevenEsc: s => String(s == null ? '' : s),
    cevenK: b => 'multi_' + b,
    CEVEN_BRAND: {id:'multi', prefix:'multi_'}
  };
  ctx.window = ctx; ctx.globalThis = ctx;
  vm.createContext(ctx);
  ['src/apple/js/pricing-core.js','src/poly/js/pricing-core.js','src/multi/js/marcas.js',
   'src/multi/js/catalogo-multi.js','src/multi/js/quote.js','src/multi/js/catalog-view.js']
    .forEach(f => vm.runInContext(lee(f), ctx, {filename: f}));

  // Un catálogo con la proporción real: Apple con cientos de SKUs, Poly con pocos.
  const apple = [];
  for(let i=0;i<800;i++){
    apple.push({sku:'AP'+i+'LE/A', description:'Producto Apple '+i, lob:'MacBook Pro 14', sellingPrice:1000+i});
  }
  ctx.catalogos = {apple: apple, poly: JSON.parse(JSON.stringify(CAT_POLY))};
  ctx.nacRatesApple = JSON.parse(JSON.stringify(ctx.CEVEN_APPLE_NAC_DEF));
  ctx._margenGlobalValor = 12;
  ctx._tierGlobalValor = T1;
  ctx._catRearmar();

  ok(ctx.products.length === 800 + CAT_POLY.length,
     'la lista unificada trae los productos de las dos marcas', 'dio ' + ctx.products.length);

  ctx.renderCat();
  const html = els['catbody'].innerHTML;
  ok(/mk-poly/.test(html),
     'con el buscador vacío se ven productos de Poly aunque Apple tenga 800 SKUs');
  ok(/mk-apple/.test(html), 'y también de Apple');
  ok(/772D0AA/.test(html), 'los SKU de Poly están de verdad en la tabla');

  // El contador tiene que decir QUÉ marca quedó recortada, no solo un total.
  ok(/Apple/.test(els['catcount'].textContent),
     'el contador nombra la marca que quedó recortada', els['catcount'].textContent);

  // Y una marca sin catálogo se muestra en cero en vez de desaparecer: es lo que
  // permite distinguir "no bajó" de "el multimarca no la conoce".
  ctx.catalogos = {apple: apple, poly: []};
  ctx._catRearmar();
  ctx.renderCat();
  ok(/Poly/.test(els['fmarca'].innerHTML),
     'una marca sin productos sigue apareciendo en los filtros, marcada en 0');
}

console.log('\n' + (fallos
  ? ('✗ ' + fallos + ' de ' + corridas + ' fallaron\n')
  : ('✓ ' + corridas + '/' + corridas + ' OK\n')));
process.exit(fallos ? 1 : 0);
