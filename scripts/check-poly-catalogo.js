#!/usr/bin/env node
/* ============================================================================
   check-poly-catalogo.js · Cotizadores Ceven
   ----------------------------------------------------------------------------
   Corre el importador REAL de Poly (processRows de src/poly/js/catalog.js)
   contra un archivo del ERP y verifica que el plegado del formato largo dé lo
   que tiene que dar.

   El export del ERP viene con una fila por (SKU, ubicacion, nivel de precio):
   77 SKUs reales se presentan como 564 filas. Si el plegado se equivoca, el
   sintoma no es un error sino precios o stock mal — que es justo lo que nadie
   mira hasta que sale en una cotizacion.

   Uso:  node scripts/check-poly-catalogo.js [ruta.xls]
         (por defecto ./ingresoPoly.xls)
   ========================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const ARCHIVO = process.argv[2] || path.join(ROOT, 'ingresoPoly.xls');

let fallos = 0, corridas = 0;
function ok(cond, nombre, detalle){
  corridas++;
  if(cond){ console.log('  ✓ ' + nombre); return; }
  fallos++;
  console.error('  ✗ ' + nombre + (detalle ? ('\n      ' + detalle) : ''));
}

/* ---- Leer el archivo (SpreadsheetML 2003, que es XML, no un .xls binario) --- */
function leerFilas(file){
  const xml = fs.readFileSync(file, 'utf8');
  const hoja = xml.match(/<Table[\s\S]*?<\/Table>/);
  if(!hoja) throw new Error('no se encontró <Table> en ' + file);
  const filas = hoja[0].match(/<Row[\s\S]*?<\/Row>/g) || [];
  const out = [];
  for(const f of filas){
    const celdas = f.match(/<Cell[\s\S]*?(?:\/>|<\/Cell>)/g) || [];
    const vals = [];
    let idx = 0;
    for(const c of celdas){
      const ix = c.match(/ss:Index="(\d+)"/);
      if(ix) idx = parseInt(ix[1], 10) - 1;
      const d = c.match(/<Data[^>]*>([\s\S]*?)<\/Data>/);
      while(vals.length < idx) vals.push('');
      vals.push(d ? d[1].replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').trim() : '');
      idx++;
    }
    out.push(vals);
  }
  return out;
}

const crudas = leerFilas(ARCHIVO);
const cab = crudas[0];
// processRows() recibe objetos {columna: valor}, como los deja XLSX.sheet_to_json
const rows = crudas.slice(1).map(v => {
  const o = {};
  cab.forEach((c, i) => { o[c] = v[i] !== undefined ? v[i] : ''; });
  return o;
});

/* ---- Cargar el importador real, con lo justo del entorno del navegador ----- */
function cargarCatalogo(){
  const safe = fs.readFileSync(path.join(ROOT, 'src/shared/safe.js'), 'utf8');
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
    localStorage: {
      getItem: k => (k in store ? store[k] : null),
      setItem: (k,v) => { store[k] = String(v); },
      removeItem: k => { delete store[k]; }
    },
    /* Un elemento permisivo en vez de null: initCat()/renderCat() son las
       funciones REALES (no stubs) y tocan el DOM. Lo que se verifica es el
       plegado de datos, no el render.

       `getAttribute`/`setAttribute`/`closest` los necesita el filtro de rubros
       (_pintarFiltroRubro → _rubroElegido), que guarda la categoría elegida en
       un `data-rubro` del contenedor. Sin ellos este chequeo tiraba
       "el.getAttribute is not a function" y no llegaba a correr nada. */
    document: {
      getElementById: () => ({
        style: {}, classList: { add(){}, remove(){} },
        value: '', textContent: '', innerHTML: '', checked: false,
        tagName: 'DIV', _attrs: {},
        getAttribute(k){ return this._attrs[k] !== undefined ? this._attrs[k] : null; },
        setAttribute(k, v){ this._attrs[k] = String(v); },
        closest: () => null,
        appendChild(){}, addEventListener(){}, querySelectorAll: () => []
      }),
      querySelectorAll: () => []
    },
    // Lo que processRows() toca del entorno; nada de esto afecta al plegado.
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
  vm.runInContext(safe, ctx);
  vm.runInContext(opc, ctx);
  vm.runInContext(core, ctx);
  vm.runInContext(cat, ctx);
  return ctx;
}

console.log('\nImportador de Poly · ' + path.basename(ARCHIVO));
console.log('  ' + rows.length + ' filas crudas, ' + cab.length + ' columnas\n');

const ctx = cargarCatalogo();
ctx.processRows(rows);
const prods = ctx.products;

ok(!ctx._err, 'el importador no reportó error', ctx._err);
ok(prods.length === 77, 'plega 564 filas en 77 productos', 'dio ' + prods.length);

const porSku = {};
prods.forEach(p => { porSku[p.sku] = p; });
ok(Object.keys(porSku).length === prods.length, 'no hay SKUs repetidos en el resultado');

const TIERS = ['Ceven - Tier 1','Ceven - Tier 2','Ceven - Tier 3','Negocios Especiales'];
const conLos4 = prods.filter(p => TIERS.every(t => typeof p.precios[t] === 'number')).length;
ok(conLos4 === prods.length, 'los 77 productos tienen los 4 niveles de precio',
   'solo ' + conLos4 + ' los tienen');

/* Caso concreto tomado del archivo a mano, para que el chequeo no se limite a
   validar contra si mismo. */
const s1 = porSku['772D0AA'];
ok(!!s1, 'existe el SKU 772D0AA');
if(s1){
  ok(s1.precios['Negocios Especiales'] === 190, '772D0AA · Negocios Especiales = 190', 'dio ' + s1.precios['Negocios Especiales']);
  ok(s1.precios['Ceven - Tier 3'] === 225,      '772D0AA · Tier 3 = 225',              'dio ' + s1.precios['Ceven - Tier 3']);
  ok(s1.precios['Ceven - Tier 1'] === 235,      '772D0AA · Tier 1 = 235',              'dio ' + s1.precios['Ceven - Tier 1']);
  ok(s1.iva === 'IVA GENERAL',                  '772D0AA · IVA desde Programa fiscal', 'dio ' + s1.iva);
  ok(s1.rubro === 'Audio',                      '772D0AA · rubro = Audio',             'dio ' + s1.rubro);
  ok(/ALTAVOZ/i.test(s1.description),           '772D0AA · descripción desde "Nombre para mostrar"');
}

/* El stock es el que mas facil se rompe: el archivo repite el mismo
   LocAvailable en las 4 filas de niveles de cada deposito, asi que sumar sin
   deduplicar por ubicacion lo cuadruplica. 99T09AA esta en DOS depositos
   (9 + 1), que es el unico caso del archivo. */
const s2 = porSku['99T09AA'];
ok(!!s2, 'existe el SKU 99T09AA (el único en dos depósitos)');
if(s2) ok(s2.stock === 10, '99T09AA · stock = 9 + 1 = 10 (no ×4)', 'dio ' + s2.stock);
/* Sin stock NO es lo mismo que stock 0: el archivo deja LocAvailable vacío para
   los SKUs que no tiene en ningún depósito, y el catálogo los muestra como "—"
   en vez de "0" (que se leería como "se agotó"). */
if(s1) ok(s1.stock === null, '772D0AA · sin LocAvailable ⇒ stock null, no 0', 'dio ' + s1.stock);

const conStock = prods.filter(p => p.stock !== null);
ok(conStock.every(p => p.stock > 0), 'ningún producto con stock quedó multiplicado por los 4 niveles');

const sinStock = prods.filter(p => !p.stock).length;
ok(sinStock === 25, '25 productos sin stock en ningún depósito', 'dio ' + sinStock);

/* Que el importador NO asuma el orden de los tiers: hay 11 filas donde
   T1>=T2>=T3 no se cumple o Negocios Especiales no es el mas barato. */
const raros = prods.filter(p => {
  const t = TIERS.map(k => p.precios[k]);
  return !(t[0] >= t[1] && t[1] >= t[2]) || t[3] !== Math.min.apply(null, t);
});
ok(raros.length > 0, 'se conservan los precios que rompen el orden esperado (' + raros.length + ' SKUs)');
const a4 = porSku['A4LZ8AA'];
if(a4) ok(a4.precios['Ceven - Tier 2'] === 4346 && a4.precios['Ceven - Tier 1'] === 3983.85,
          'A4LZ8AA · Tier 2 (4346) sale MÁS caro que Tier 1 (3983,85), tal cual el archivo');

/* ---- IVA: la columna "Programa fiscal" resuelta a alícuota -----------------
   La regla del negocio es "si dice reducido es 10,5 %, si no 21 %". Lo que se
   verifica acá es que se aplique sobre el archivo real (520 generales y 44
   reducidos) y que el porcentaje viaje en el producto — es lo que después
   termina en la cotización, en el PDF y en el comprobante. */
ok(ctx.cevenIvaPct('IVA REDUCIDO') === '10,5%', '"IVA REDUCIDO" → 10,5%', ctx.cevenIvaPct('IVA REDUCIDO'));
ok(ctx.cevenIvaPct('IVA GENERAL')  === '21%',   '"IVA GENERAL" → 21%',   ctx.cevenIvaPct('IVA GENERAL'));
ok(ctx.cevenIvaPct('Reducido')     === '10,5%', 'el match no depende de mayúsculas ni del texto entero');
ok(ctx.cevenIvaPct('')             === '21%',   'sin dato fiscal → 21% (la alícuota general)');
ok(ctx.cevenIvaPct(undefined)      === '21%',   'undefined → 21%, no rompe');

const reducidos = prods.filter(p => p.ivaPct === '10,5%');
const generales = prods.filter(p => p.ivaPct === '21%');
ok(reducidos.length + generales.length === prods.length,
   'los 77 productos quedaron con una alícuota (ninguno sin IVA)',
   'reducidos ' + reducidos.length + ' + generales ' + generales.length);
ok(reducidos.every(p => /reducid/i.test(p.iva)),
   'todos los 10,5% vienen de un "Programa fiscal" que dice reducido');
ok(generales.every(p => !/reducid/i.test(p.iva)),
   'ningún 21% salió de una fila que decía reducido');
ok(reducidos.length > 0 && generales.length > 0,
   'el archivo trae de los dos tipos (' + reducidos.length + ' reducidos, ' + generales.length + ' generales)');
if(s1) ok(s1.ivaPct === '21%', '772D0AA · "IVA GENERAL" quedó en 21%', 'dio ' + s1.ivaPct);

/* Un producto cargado a mano no tiene programa fiscal: cae en la general. */
ok(ctx.cevenProductoIva({ sku: 'MANUAL-1', manual: true }) === '21%',
   'un artículo manual (sin programa fiscal) cotiza al 21%');
ok(ctx.cevenIvaDeCatalogo('772D0AA') === '21%', 'cevenIvaDeCatalogo() encuentra el SKU en el catálogo');
ok(ctx.cevenIvaDeCatalogo('NO-EXISTE') === '21%', 'un SKU que no está en el catálogo cae al 21%');

console.log('\n' + (fallos
  ? ('✗ ' + fallos + ' de ' + corridas + ' fallaron\n')
  : ('✓ ' + corridas + '/' + corridas + ' OK\n')));
process.exit(fallos ? 1 : 0);
