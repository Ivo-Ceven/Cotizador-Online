#!/usr/bin/env node
/* ============================================================================
   check-apple-catalogo.js · Cotizadores Ceven
   ----------------------------------------------------------------------------
   Corre el importador REAL de Apple (handlePL → processRows, y el merge de
   finishPriceUpdate, de src/apple/js/catalog.js) contra la forma que tienen los
   dos price list que manda Apple:

     · cuatro filas de avisos ANTES del encabezado (por eso hay que buscarlo),
     · una columna "SKU" que es un codigo interno corto ("321D38") y otra
       "Model #" que es el SKU nuestro ("MD4P4LE/A"),
     · el catalogo partido en DOS archivos (lista normal + FTZ) que se pisan en
       algunos SKU, a veces con precios distintos.

   Nada de esto tira excepcion cuando se rompe: sale un catalogo con los SKU
   equivocados, o a la mitad, y eso se ve recien cuando una cotizacion sale con
   un codigo que el cliente no reconoce.

   Uso:  node scripts/check-apple-catalogo.js
         node scripts/check-apple-catalogo.js "APPLE Price list A.xlsx" "…FTZ.xlsx"

   Sin argumentos usa un fixture con la misma forma que los archivos reales
   (los .xlsx estan en .gitignore: son datos de trabajo, no van al repo).
   ========================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const ARCHIVOS = process.argv.slice(2);

let fallos = 0, corridas = 0;
function ok(cond, nombre, detalle){
  corridas++;
  if(cond){ console.log('  ✓ ' + nombre); return; }
  fallos++;
  console.error('  ✗ ' + nombre + (detalle ? ('\n      ' + detalle) : ''));
}

/* ---- Entorno minimo del navegador + el importador real -------------------- */
function cargarCatalogo(){
  const store = {};
  const ctx = {
    console,
    products: [], selIds: {}, editId: null, items: [],
    nacRates: {}, quoteNacOverrides: {}, IVA_MAP: {},
    localStorage: {
      getItem: k => (k in store ? store[k] : null),
      setItem: (k,v) => { store[k] = String(v); },
      removeItem: k => { delete store[k]; }
    },
    /* Un elemento permisivo en vez de null: initCat()/renderCat() son las
       funciones REALES (no stubs) y tocan el DOM. Lo que se verifica es la
       lectura del archivo, no el render. */
    document: {
      getElementById: () => ({
        style: {}, classList: { add(){}, remove(){}, contains: () => false },
        value: '', textContent: '', innerHTML: '', checked: false,
        appendChild(){}, addEventListener(){}, contains: () => false
      }),
      addEventListener(){}, querySelectorAll: () => []
    },
    showErr: m => { ctx._err = m || ''; },
    showToast: m => { ctx._toast = m; },
    alert: m => { ctx._alert = m; },
    confirm: () => true,
    cevenDelegate: () => {}, cevenActEl: () => null,
    fD: n => String(n), dp: n => String(n),
    suggestMacWarranty: () => {},
    /* Las "hojas" de este banco YA son matrices de filas: sheet_to_json solo
       tiene que devolverlas. Con archivos reales, la matriz la arma el XLSX
       vendorizado antes de entrar al contexto (ver leerWorkbook). */
    XLSX: { utils: { sheet_to_json: sheet => sheet } },
    FileReader: function(){}
  };
  ctx.window = ctx;
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  // opciones.js: el catálogo y la cotización filtran por opción A/B
  // (cevenOpcFiltrar/cevenOpcActiva). En el navegador se carga antes.
  for(const f of ['src/shared/safe.js', 'src/shared/opciones.js', 'src/shared/catalog-core.js',
                  'src/apple/js/pricing.js', 'src/apple/js/catalog.js']){
    vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, {filename: f});
  }
  return ctx;
}

/* ---- Fixture: la misma forma que los archivos reales ---------------------- */
const HDR = ['Number','SKU','Status','LOB','Model','Country','Model #','Description','Selling Price'];
const PREAMBULO = [
  ['','','','','',''," ",'',''],
  ['','','','','','','The models listed below are currently impacted by import tariffs…','',''],
  ['','','','','','','','',''],
  // Una celda suelta que dice "SKU" NO es el encabezado: hacen falta dos.
  ['','SKU','','','','','','',''],
  ['','Check if models with NEW Status are authorized for your country','','','','','','','']
];
const LIBRO_A = {
  SheetNames: ['All Countries Price List','Hoja1'],
  Sheets: {
    'All Countries Price List': PREAMBULO.concat([HDR,
      ['','321D38','','iPad','iPad','Argentina','MD4P4LE/A','iPad Wi-Fi 256GB - Pink A3354',496.64],
      ['','321D42','','iPad','iPad','Argentina','MD4G4LE/A','iPad Wi-Fi 256GB - Silver A3354',496.64],
      ['','351D54','','Mac','MacBook Pro 16','Argentina','MGEA4LE/A','16-inch MacBook Pro: Apple M5 Pro',2773.38],
      ['','8VT463','','Mac','MacBook Air 13','ALAC','MG6N4BE/A','13-inch MacBook Air: Apple M4',815.31]
    ]),
    'Hoja1': []
  }
};
const LIBRO_FTZ = {
  SheetNames: ['All Countries Price List'],
  Sheets: {
    'All Countries Price List': PREAMBULO.concat([HDR,
      ['','820P53','','Accessories','AirTag','ALAC','MFE94AM/A','AirTag 2nd Gen (1 Pack) A2937',23.74],
      ['','820P43','','Accessories','AirTag','ALAC','MFEA4AM/A','',81.05],
      // Mismo Model # que el libro A, unos dolares mas caro (el arancel de la FTZ).
      ['','8VT463','EOL','Mac','MacBook Air 13','ALAC','MG6N4BE/A','13-inch MacBook Air: Apple M4',819.39],
      // Precio tipeado en formato es-AR, como llega a veces cuando alguien lo edita.
      ['','980Q64','','Watch','Watch Ultra 3','Uruguay','MEWW4BE/A','Ultra 3 GPS + Cellular 49mm','1.234,50']
    ])
  }
};

/* ---- Archivos reales, si se pasaron por linea de comandos ------------------ */
function leerWorkbook(file){
  const XLSX = require(path.join(ROOT, 'src/vendor/xlsx.full.min.js'));
  const wb = XLSX.read(new Uint8Array(fs.readFileSync(file)), {type:'array'});
  const out = { SheetNames: wb.SheetNames.slice(), Sheets: {} };
  for(const n of wb.SheetNames){
    out.Sheets[n] = XLSX.utils.sheet_to_json(wb.Sheets[n], {header:1, defval:''});
  }
  return out;
}

const libros = ARCHIVOS.length
  ? ARCHIVOS.map(f => ({ nombre: path.basename(f), wb: leerWorkbook(path.resolve(ROOT, f)) }))
  : [{ nombre: 'fixture · lista normal', wb: LIBRO_A }, { nombre: 'fixture · lista FTZ', wb: LIBRO_FTZ }];

console.log('\nImportador de Apple');
libros.forEach(l => console.log('  · ' + l.nombre));
console.log('');

/* ---- 1) Carga completa: los dos archivos juntos --------------------------- */
const ctx = cargarCatalogo();
const filasPorLibro = libros.map(l => ctx._plWorkbookRows(l.wb));
libros.forEach((l, i) => ok(!!filasPorLibro[i], 'encuentra la tabla en ' + l.nombre));

const todas = filasPorLibro.filter(Boolean).reduce((a, b) => a.concat(b), []);
ctx._err = ''; ctx._toast = '';
ctx.processRows(todas);
const prods = ctx.products;

ok(!ctx._err, 'la carga no reportó error', ctx._err);
ok(prods.length > 0, 'carga productos', 'dio ' + prods.length);

const porSku = {};
prods.forEach(p => { porSku[p.sku] = p; });
ok(Object.keys(porSku).length === prods.length, 'no hay SKUs repetidos en el catálogo',
   prods.length - Object.keys(porSku).length + ' repetidos');
ok(prods.every(p => p.sku), 'ningún producto queda sin SKU');
ok(prods.every(p => typeof p.sellingPrice === 'number' && !isNaN(p.sellingPrice)),
   'todos los precios son numéricos');

/* El SKU tiene que ser "Model #", no la columna "SKU" (codigo interno de Apple).
   Se distinguen por la forma: el Model # de Apple termina en "<letra(s)>/A". */
const conBarra = prods.filter(p => /\/[A-Z]$/.test(p.sku)).length;
ok(conBarra === prods.length, 'el SKU sale de "Model #" y no de la columna "SKU"',
   (prods.length - conBarra) + ' SKU no tienen forma de Model # (ej: ' +
   (prods.find(p => !/\/[A-Z]$/.test(p.sku)) || {}).sku + ')');

const conPais = prods.filter(p => p.country).length;
ok(conPais >= prods.length - 1, 'se carga la columna Country', conPais + '/' + prods.length);
const conDesc = prods.filter(p => p.description).length;
ok(conDesc >= prods.length - 2, 'se carga la columna Description', conDesc + '/' + prods.length);

console.log('  · ' + prods.length + ' productos, ' + todas.length + ' filas leídas');

if(!ARCHIVOS.length){
  /* Contra el fixture se puede verificar fila por fila. */
  ok(prods.length === 7, 'los 8 renglones de los dos archivos pliegan a 7 productos',
     'dio ' + prods.length);
  const ipad = porSku['MD4P4LE/A'];
  ok(!!ipad, 'existe el SKU MD4P4LE/A (Model #)');
  if(ipad){
    ok(ipad.sellingPrice === 496.64, 'MD4P4LE/A · Selling Price = 496.64', 'dio ' + ipad.sellingPrice);
    ok(ipad.country === 'Argentina',  'MD4P4LE/A · Country = Argentina',   'dio ' + ipad.country);
    ok(/^iPad Wi-Fi 256GB/.test(ipad.description), 'MD4P4LE/A · Description desde el Excel',
       'dio ' + ipad.description);
    ok(ipad.lob === 'iPad' && ipad.modelCol === 'iPad', 'MD4P4LE/A · LOB y Model para los filtros y el NAC');
  }
  ok(!porSku['321D38'], 'el código interno "321D38" NO entra como SKU');
  /* El caso que motivo el plegado: el mismo Model # en los dos archivos, mas
     caro en el FTZ. Quedarse con el barato subcotiza. */
  const air = porSku['MG6N4BE/A'];
  ok(!!air && air.sellingPrice === 819.39, 'SKU repetido en los dos archivos: gana el precio más alto',
     'dio ' + (air && air.sellingPrice));
  const watch = porSku['MEWW4BE/A'];
  ok(!!watch && watch.sellingPrice === 1234.5, 'precio en formato es-AR ("1.234,50") → 1234.5',
     'dio ' + (watch && watch.sellingPrice));
  ok(!!porSku['MFEA4AM/A'] && porSku['MFEA4AM/A'].sellingPrice === 81.05,
     'una fila sin Description igual entra al catálogo');
  ok(/7 productos/.test(ctx._toast || ''), 'el aviso dice cuántos productos quedaron', ctx._toast);
}

/* ---- 2) El merge de "Actualizar precios" usa el MISMO SKU ------------------ */
/* Si los dos caminos no coincidieran, actualizar precios agregaria todo de nuevo
   como SKU nuevos en vez de actualizar los que ya estan. */
const ctx2 = cargarCatalogo();
const filasA = ctx2._plWorkbookRows(libros[0].wb);
ctx2.processRows(filasA);
const antes = ctx2.products.length;
ctx2._toast = '';
ctx2.finishPriceUpdate(ctx2._plWorkbookRows(libros[1].wb), false);
const despues = ctx2.products.length;
const porSku2 = {};
ctx2.products.forEach(p => { porSku2[p.sku] = p; });

ok(despues >= antes, 'actualizar precios no pierde productos', antes + ' → ' + despues);
ok(Object.keys(porSku2).length === ctx2.products.length,
   'actualizar precios no duplica SKUs que ya estaban');

if(!ARCHIVOS.length){
  ok(antes === 4 && despues === 7, 'carga 4 del archivo normal y suma 3 nuevos del FTZ',
     antes + ' → ' + despues);
  ok(porSku2['MG6N4BE/A'] && porSku2['MG6N4BE/A'].sellingPrice === 819.39,
     'el SKU que estaba en los dos actualiza su precio (815.31 → 819.39)',
     'dio ' + (porSku2['MG6N4BE/A'] || {}).sellingPrice);
  ok(!porSku2['MG6N4BE/A'].needsReview, 'el SKU actualizado NO queda marcado "a revisar"');
  ok(porSku2['MD4P4LE/A'].needsReview, 'el SKU ausente del archivo nuevo queda "a revisar"');
  ok(/1 actualizados, 3 nuevos/.test(ctx2._toast || ''), 'el aviso resume el merge', ctx2._toast);
}

console.log('\n' + (fallos ? '✗ ' + fallos + ' de ' + corridas + ' fallaron' : '✓ ' + corridas + ' chequeos OK') + '\n');
process.exit(fallos ? 1 : 0);
