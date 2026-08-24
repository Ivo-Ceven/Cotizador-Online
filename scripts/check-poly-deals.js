#!/usr/bin/env node
/* ============================================================================
   check-poly-deals.js · Cotizadores Ceven
   ----------------------------------------------------------------------------
   Corre el importador REAL de deals (processDeals de src/poly/js/catalog.js)
   contra la hoja "Promos" del BOM Calculator de HP/Poly, y verifica lo que si
   se rompe no da ningun error: que el precio de deal se monte sobre el catalogo
   que ya esta cargado en vez de reemplazarlo, que la descripcion de NetSuite no
   se pise con la abreviatura de HP, que la vigencia se lea bien y que el
   archivo de NetSuite se pueda reimportar sin borrar los deals.

   Ese ultimo es el caso caro: el archivo de NetSuite se reimporta seguido
   (cambia el stock), asi que un deal que no sobreviva a esa reimportacion dura
   horas y despues desaparece sin que nadie lo note.

   Corre con un banco propio que imita la forma del archivo real —incluida la
   fila de pie "Applied filters:" que trae en la columna del SKU— porque los
   .xlsx reales son datos de trabajo. Si tenes el archivo a mano se le pasa por
   linea de comandos y ademas corre los chequeos genericos contra el:

   Uso:  node scripts/check-poly-deals.js [BOM-Calculator-….xlsx]
   ========================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const ARCHIVO = process.argv[2] || null;

let fallos = 0, corridas = 0;
function ok(cond, nombre, detalle){
  corridas++;
  if(cond){ console.log('  ✓ ' + nombre); return; }
  fallos++;
  console.error('  ✗ ' + nombre + (detalle ? ('\n      ' + detalle) : ''));
}

const T1 = 'Ceven - Tier 1', T2 = 'Ceven - Tier 2', T3 = 'Ceven - Tier 3', NE = 'Negocios Especiales';
const DEAL = 'DEAL';

/* Serial de Excel de una fecha, que es como viene "End Date" (46234 = 31/07/26).
   Se calcula en vez de escribirlo a mano para que el banco tenga siempre un
   deal vigente y uno vencido RELATIVOS A HOY: con fechas fijas, el chequeo
   pasaba en agosto y empezaba a fallar solo en septiembre. */
function serialDe(dias){
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + dias);
  return Math.round((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - Date.UTC(1899, 11, 30)) / 86400000);
}
function isoDe(dias){
  const d = new Date();
  d.setDate(d.getDate() + dias);
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
}

/* ---- El catalogo que "ya estaba cargado" (lo que deja el Excel de NetSuite) - */
function catalogoBase(){
  return [
    {id:'772D0AA', sku:'772D0AA', description:'ALTAVOZ MANOS LIBRES POLY SYNC 20+ CON USB-C',
     precios:{[T1]:235,[T2]:230,[T3]:225,[NE]:190}, stock:4, iva:'IVA GENERAL', ivaPct:'21%', rubro:'Audio'},
    {id:'77P35AA', sku:'77P35AA', description:'ALTAVOZ POLY SYNC 40 MICROSOFT TEAMS',
     precios:{[T1]:300,[T2]:295,[T3]:290,[NE]:280}, stock:null, iva:'IVA GENERAL', ivaPct:'21%', rubro:'Audio'},
    {id:1712000000000, sku:'MANUAL-1', description:'Cargado a mano', manual:true,
     precios:{[T1]:100}, stock:null, iva:'IVA GENERAL', ivaPct:'21%', rubro:''}
  ];
}

/* ---- El archivo de deals: la forma EXACTA de la hoja "Promos" -------------- */
function filasPromos(){
  const fila = (sku, desc, bdnet, deal, endSerial) => ({
    'Base SKU': sku, 'Description': desc, 'PL':'NG', 'List Price': bdnet * 2.2,
    'Contractual Discount': 0.38, 'NDP': bdnet * 1.35, 'Remaining Qty': 200,
    'Add Discount': 0.16, 'Total Discount': 0.54, 'BDNet': bdnet, 'FDA': bdnet * 0.35,
    'Promo':'Up Front', 'Min Qty': 0, 'Deal': deal, 'V':'2', 'End Date': endSerial,
    'Country':'ARGENTINA', 'Price Term':'Indent', 'Type':'BDNet'
  });
  return [
    // Un SKU que YA esta en el catalogo: se le suma el deal, no se toca lo demas.
    fila('772D0AA', 'Poly Sync 20+ -M SPKPHN', 144.88, '47981658', serialDe(30)),
    // Otro que ya esta, pero con un deal VENCIDO.
    fila('77P35AA', 'Poly Sync 40 -M SPKPHN', 168.80, '47981658', serialDe(-20)),
    // Uno que NO esta en el catalogo: se da de alta con la descripcion de HP.
    fila('E37760112', '1y Poly Elite TC10', 140.10, '48107903', serialDe(30)),
    // El mismo SKU en DOS deals: gana el que vence mas tarde.
    fila('842D2AA', 'Poly R30 UVB (deal viejo)', 425.28, '47981658', serialDe(5)),
    fila('842D2AA', 'Poly R30 UVB (deal nuevo)', 400.00, '48107903', serialDe(60)),
    // Basura que el archivo real trae y hay que descartar sin romper nada.
    fila('SIN-PRECIO', 'Fila sin BDNet', 0, '48107903', serialDe(30)),
    fila('SIN-DEAL', 'Fila sin numero de deal', 99, '', serialDe(30)),
    // El pie del archivo real: el texto de los filtros cae en la columna del SKU.
    {'Base SKU':'Applied filters:\r\nCountry is ARGENTINA\r\nStatus is Active',
     'Description':'', 'PL':'', 'List Price':'', 'Contractual Discount':'', 'NDP':'',
     'Remaining Qty':'', 'Add Discount':'', 'Total Discount':'', 'BDNet':'', 'FDA':'',
     'Promo':'', 'Min Qty':'', 'Deal':'', 'V':'', 'End Date':'', 'Country':'',
     'Price Term':'', 'Type':''}
  ];
}

/* ---- Cargar el importador real, con lo justo del entorno del navegador ----- */
function cargarCatalogo(productosIniciales){
  const opc  = fs.readFileSync(path.join(ROOT, 'src/shared/opciones.js'), 'utf8');
  const core = fs.readFileSync(path.join(ROOT, 'src/shared/catalog-core.js'), 'utf8');
  const cat  = fs.readFileSync(path.join(ROOT, 'src/poly/js/catalog.js'), 'utf8');
  const store = {};
  const ctx = {
    console,
    products: [],
    selIds: {},
    editId: null,
    _pendingNewSKUs: [],
    // brand.js entero no hace falta: el importador solo mira priceTiers.
    CEVEN_BRAND: { priceTiers: [
      {v:T1, lbl:'Tier 1'}, {v:T2, lbl:'Tier 2'}, {v:T3, lbl:'Tier 3'},
      {v:NE, lbl:'Neg. Especiales'}, {v:DEAL, lbl:'Deal', deal:true}
    ]},
    localStorage: {
      getItem: k => (k in store ? store[k] : null),
      setItem: (k,v) => { store[k] = String(v); },
      removeItem: k => { delete store[k]; }
    },
    // Mismo elemento permisivo que check-poly-catalogo.js: initCat()/renderCat()
    // son las funciones REALES y tocan el DOM; lo que se verifica son los datos.
    document: {
      getElementById: () => ({
        style: {}, classList: { add(){}, remove(){} },
        value: '', textContent: '', innerHTML: '', checked: false, open: false,
        tagName: 'DIV', _attrs: {},
        getAttribute(k){ return this._attrs[k] !== undefined ? this._attrs[k] : null; },
        setAttribute(k, v){ this._attrs[k] = String(v); },
        closest: () => null,
        appendChild(){}, addEventListener(){}, querySelectorAll: () => []
      }),
      querySelectorAll: () => []
    },
    cevenK: b => 'poly_' + b,
    cevenLsSet: (k,v) => { store[k] = String(v); return true; },
    cevenLsJSON: (k,d) => { try{ return JSON.parse(store[k]); }catch(e){ return d; } },
    cevenEsc: s => String(s),
    showErr: m => { if(m) ctx._err = m; },
    showToast: m => { ctx._toast = m; },
    cevenDelegate: () => {},
    cevenActEl: () => null,
    fD: n => String(n),
    XLSX: {}
  };
  ctx.window = ctx;
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(opc, ctx);
  vm.runInContext(core, ctx);
  vm.runInContext(cat, ctx);
  ctx.products = productosIniciales || [];
  ctx._store = store;
  return ctx;
}

const idx = lista => { const o = {}; lista.forEach(p => { o[p.sku] = p; }); return o; };

console.log('\nImportador de deals de Poly · hoja "Promos" del BOM Calculator\n');

/* ═══ 1 · El deal se monta sobre el catálogo, no lo reemplaza ═══════════════ */
console.log('1 · El deal se monta sobre el catálogo que ya está cargado');
{
  const e = cargarCatalogo(catalogoBase());
  e.processDeals(filasPromos());
  const p = idx(e.products);

  ok(!e._err, 'el importador no reportó error', e._err);
  ok(!!p['772D0AA'], 'el SKU que ya estaba sigue en el catálogo');
  ok(p['772D0AA'].precios[T1] === 235, 'y conserva sus 4 precios del ERP', 'Tier 1 dio ' + p['772D0AA'].precios[T1]);
  ok(p['772D0AA'].precios[DEAL] === 144.88, 'con el precio de deal agregado como un nivel más',
     'dio ' + p['772D0AA'].precios[DEAL]);
  ok(p['772D0AA'].stock === 4 && p['772D0AA'].rubro === 'Audio' && p['772D0AA'].ivaPct === '21%',
     'y sin tocarle stock, rubro ni IVA');
  ok(!!p['MANUAL-1'], 'el artículo cargado a mano sigue estando');
  ok(p['MANUAL-1'].precios[DEAL] === undefined, 'y no le aparece un precio de deal de la nada');
}

/* ═══ 2 · La descripción de NetSuite no se pisa ═════════════════════════════ */
console.log('\n2 · La descripción del ERP manda sobre la abreviatura de HP');
{
  const e = cargarCatalogo(catalogoBase());
  e.processDeals(filasPromos());
  const p = idx(e.products);
  ok(/ALTAVOZ MANOS LIBRES/.test(p['772D0AA'].description),
     'un SKU que ya estaba conserva la descripción de NetSuite', 'dio ' + p['772D0AA'].description);
  ok(p['E37760112'] && p['E37760112'].description === '1y Poly Elite TC10',
     'un SKU nuevo se da de alta con la descripción del archivo de HP',
     'dio ' + (p['E37760112'] && p['E37760112'].description));
  ok(p['E37760112'] && p['E37760112'].ivaPct === '21%',
     'y con la alícuota general, que es la regla del negocio sin dato fiscal');
}

/* ═══ 3 · Vigencia ═════════════════════════════════════════════════════════ */
console.log('\n3 · El "End Date" se lee como fecha, y un deal vencido se marca');
{
  const e = cargarCatalogo(catalogoBase());
  e.processDeals(filasPromos());
  const p = idx(e.products);

  ok(p['772D0AA'].deal.fin === isoDe(30), 'el serial de Excel se convierte a AAAA-MM-DD',
     'dio ' + p['772D0AA'].deal.fin + ', esperaba ' + isoDe(30));
  ok(p['772D0AA'].deal.nro === '47981658', 'el número de deal se guarda tal cual', 'dio ' + p['772D0AA'].deal.nro);
  ok(e.cevenDealVencido(p['772D0AA'].deal) === false, 'un deal a 30 días NO está vencido');
  ok(e.cevenDealVencido(p['77P35AA'].deal) === true,  'uno que terminó hace 20 días SÍ');
  ok(e.cevenDealVencido({nro:'1', fin: isoDe(0)}) === false,
     'el día del vencimiento todavía vale: "End Date 31/07" es hasta el 31/07 inclusive');
  ok(e.cevenDealVencido({nro:'1', fin:''}) === false,
     'sin fecha no se da por vencido (no saber cuándo termina ≠ saber que terminó)');
  ok(e.cevenDealFechaTxt('2026-07-31') === '31/07/26', 'la fecha se lee 31/07/26 en pantalla',
     'dio ' + e.cevenDealFechaTxt('2026-07-31'));
  ok(/venció el 31\/07\/26/.test(e.cevenDealTxt({nro:'47981658', fin:'2026-07-31'})) ||
     /vence 31\/07\/26/.test(e.cevenDealTxt({nro:'47981658', fin:'2026-07-31'})),
     'el texto del deal lleva número y vigencia', e.cevenDealTxt({nro:'47981658', fin:'2026-07-31'}));
}

/* ═══ 4 · Filas que hay que descartar ══════════════════════════════════════ */
console.log('\n4 · Las filas que no son un deal se descartan sin romper nada');
{
  const e = cargarCatalogo(catalogoBase());
  e.processDeals(filasPromos());
  const p = idx(e.products);
  ok(!p['SIN-PRECIO'], 'una fila con BDNet 0 no da de alta ningún SKU');
  ok(!p['SIN-DEAL'],   'una fila sin número de deal tampoco');
  ok(!Object.keys(p).some(s => /Applied filters/.test(s)),
     'el pie "Applied filters:" del archivo real no entra como producto');
  ok(e.products.length === 5, 'quedan los 3 de antes + los 2 SKU nuevos con deal', 'dio ' + e.products.length);
}

/* ═══ 5 · Un SKU en dos deals ══════════════════════════════════════════════ */
console.log('\n5 · Un SKU en dos deals se queda con el que vence más tarde');
{
  const e = cargarCatalogo(catalogoBase());
  e.processDeals(filasPromos());
  const p = idx(e.products);
  ok(p['842D2AA'].deal.nro === '48107903', 'gana el deal que termina en 60 días, no el de 5',
     'dio ' + p['842D2AA'].deal.nro);
  ok(p['842D2AA'].precios[DEAL] === 400, 'y con él viaja su precio', 'dio ' + p['842D2AA'].precios[DEAL]);
}

/* ═══ 6 · Un archivo nuevo reemplaza los deals viejos ══════════════════════ */
console.log('\n6 · El archivo nuevo reemplaza TODOS los deals, no los acumula');
{
  const e = cargarCatalogo(catalogoBase());
  e.processDeals(filasPromos());
  ok(e.products.length === 5, 'punto de partida: 5 productos', 'dio ' + e.products.length);

  // Un segundo archivo que solo trae UN SKU, y ni siquiera de los mismos.
  const soloUno = [filasPromos()[0]];      // 772D0AA
  e.processDeals(soloUno);
  const p = idx(e.products);

  ok(p['772D0AA'].precios[DEAL] === 144.88, 'el SKU que sigue en promoción conserva su deal');
  ok(!p['77P35AA'].deal, 'el que salió de la promoción pierde el deal');
  ok(p['77P35AA'].precios[DEAL] === undefined, 'y pierde también el precio de deal');
  ok(p['77P35AA'].precios[T1] === 300, 'pero se queda en el catálogo con sus precios del ERP');
  ok(!p['E37760112'], 'un SKU que existía SOLO por un deal se va del catálogo: sin deal no tiene ningún precio');
  ok(!!p['MANUAL-1'], 'el artículo manual no se toca nunca');
  ok(/quedaron sin deal/.test(e._toast || ''), 'y el aviso lo dice en vez de hacerlo callado', e._toast);
}

/* ═══ 7 · Reimportar el catálogo de NetSuite no borra los deals ════════════ */
console.log('\n7 · Reimportar el Excel de NetSuite conserva los precios de deal');
{
  const e = cargarCatalogo(catalogoBase());
  e.processDeals(filasPromos());

  /* El archivo del ERP en su formato largo real: una fila por (SKU × nivel).
     No trae ni 842D2AA ni E37760112, que son SKU que hoy existen solo por su
     deal — el caso que importa es que no se los lleve puestos. */
  const largo = [];
  [['772D0AA', 240], ['77P35AA', 305]].forEach(([sku, base]) => {
    [[T1, base], [T2, base-5], [T3, base-10], [NE, base-45]].forEach(([niv, precio]) => {
      largo.push({
        'MARCA':'POLY', 'Nombre':sku, 'Nombre para mostrar':'DESCRIPCIÓN NUEVA DEL ERP ' + sku,
        'Ubicacion del inventario':'Los Patos (Distribucion)', 'Moneda':'US Dollar',
        'Nivel de precio':niv, 'Precio unitario':precio, 'LocAvailable':'7',
        'Programa fiscal':'IVA GENERAL', 'RUBRO':'Audio'
      });
    });
  });
  e.processRows(largo);
  const p = idx(e.products);

  ok(p['772D0AA'].precios[T1] === 240, 'el precio del ERP se actualiza', 'dio ' + p['772D0AA'].precios[T1]);
  ok(p['772D0AA'].precios[DEAL] === 144.88, 'y el precio de deal sobrevive a la reimportación',
     'dio ' + p['772D0AA'].precios[DEAL]);
  ok(p['772D0AA'].deal && p['772D0AA'].deal.nro === '47981658', 'con su número de deal');
  ok(p['772D0AA'].deal.fin === isoDe(30), 'y su vigencia');
  ok(!!p['E37760112'], 'un SKU que existe solo por su deal NO se va con la reimportación');
  ok(p['E37760112'].precios[DEAL] === 140.10, 'y conserva su precio', 'dio ' + p['E37760112'].precios[DEAL]);
  ok(!!p['MANUAL-1'], 'el artículo manual sigue conservándose, como antes');
  ok(/precio de deal, conservados/.test(e._toast || ''), 'el aviso avisa que se conservaron', e._toast);
}

/* ═══ 8 · La detección de archivo ══════════════════════════════════════════ */
console.log('\n8 · Se reconoce cuál de los dos archivos es, por el contenido');
{
  const e = cargarCatalogo(catalogoBase());
  ok(e._pareceDeals(filasPromos()) === true, 'la hoja "Promos" se reconoce como archivo de deals');
  const erp = [{'MARCA':'POLY','Nombre':'772D0AA','Nombre para mostrar':'X',
    'Nivel de precio':T1,'Precio unitario':100,'LocAvailable':'','Programa fiscal':'IVA GENERAL','RUBRO':'Audio'}];
  ok(e._pareceDeals(erp) === false, 'el de NetSuite NO (no tiene ni BDNet ni Deal)');
  ok(e._pareceDeals([]) === false, 'una hoja vacía tampoco');
  ok(e._hojaPromos({SheetNames:['BOM','Mission','Promos','Lead Time']}) === 'Promos',
     'la hoja "Promos" se encuentra entre las 20 y pico del BOM Calculator');
  ok(e._hojaPromos({SheetNames:['ResultadosPreviewCatalogDistri']}) === null,
     'y el archivo del ERP no la tiene');
}

/* ═══ 9 · Fechas en otros formatos ═════════════════════════════════════════ */
console.log('\n9 · "End Date" en texto también se entiende');
{
  const e = cargarCatalogo(catalogoBase());
  ok(e.cevenDealFechaISO(46234) === '2026-07-31', 'serial de Excel 46234 → 2026-07-31',
     'dio ' + e.cevenDealFechaISO(46234));
  ok(e.cevenDealFechaISO(46234.409) === '2026-07-31', 'con la hora pegada al serial, la fecha es la misma',
     'dio ' + e.cevenDealFechaISO(46234.409));
  ok(e.cevenDealFechaISO('2026-07-31') === '2026-07-31', 'texto ISO');
  ok(e.cevenDealFechaISO('31/07/2026') === '2026-07-31', 'texto dd/mm/aaaa', 'dio ' + e.cevenDealFechaISO('31/07/2026'));
  ok(e.cevenDealFechaISO('31/7/26') === '2026-07-31', 'texto dd/m/aa', 'dio ' + e.cevenDealFechaISO('31/7/26'));
  ok(e.cevenDealFechaISO('') === '', 'celda vacía → sin fecha, no una fecha inventada');
  ok(e.cevenDealFechaISO('cualquier cosa') === '', 'texto que no es una fecha → sin fecha');
}

/* ═══ 10 · Contra el archivo real, si está a mano ══════════════════════════ */
if(ARCHIVO && fs.existsSync(ARCHIVO)){
  console.log('\n10 · Contra el archivo real · ' + path.basename(ARCHIVO));
  const XLSX = require(path.join(ROOT, 'src/vendor/xlsx.full.min.js'));
  const wb = XLSX.read(new Uint8Array(fs.readFileSync(ARCHIVO)), {type:'array'});
  const e = cargarCatalogo(catalogoBase());
  const hoja = e._hojaPromos(wb);
  ok(!!hoja, 'el archivo trae una hoja "Promos"');
  if(hoja){
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[hoja], {defval:''});
    ok(e._pareceDeals(rows), 'y se reconoce como archivo de deals');
    e.processDeals(rows);
    ok(!e._err, 'el importador no reportó error', e._err);
    const conDeal = e.products.filter(p => p.deal);
    ok(conDeal.length > 0, 'se cargó al menos un deal', 'dio ' + conDeal.length);
    ok(conDeal.every(p => typeof p.precios[DEAL] === 'number' && p.precios[DEAL] > 0),
       'todos los deals tienen un precio numérico mayor a 0');
    ok(conDeal.every(p => !!p.deal.nro), 'y todos tienen número de deal');
    ok(conDeal.every(p => /^\d{4}-\d{2}-\d{2}$/.test(p.deal.fin) || p.deal.fin === ''),
       'y una fecha en AAAA-MM-DD (o vacía)');
    ok(!e.products.some(p => /Applied filters/.test(p.sku)), 'el pie del archivo no entró como producto');
    const nros = {}; conDeal.forEach(p => { nros[p.deal.nro] = (nros[p.deal.nro]||0) + 1; });
    console.log('      ' + conDeal.length + ' SKU con deal · '
      + Object.keys(nros).map(n => n + ' (' + nros[n] + ')').join(', ')
      + ' · vigencias: ' + Array.from(new Set(conDeal.map(p => p.deal.fin))).sort().join(', '));
  }
} else if(ARCHIVO){
  console.log('\n(no existe ' + ARCHIVO + ' — se corrieron solo los chequeos del banco)');
} else {
  console.log('\n(sin archivo real: pasale el BOM-Calculator-….xlsx para correr también los chequeos genéricos)');
}

console.log('\n' + (fallos
  ? ('✗ ' + fallos + ' de ' + corridas + ' fallaron\n')
  : ('✓ ' + corridas + '/' + corridas + ' OK\n')));
process.exit(fallos ? 1 : 0);
