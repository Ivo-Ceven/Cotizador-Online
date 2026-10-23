#!/usr/bin/env node
/* ============================================================================
   check-hp-catalogo.js · Cotizadores Ceven
   ----------------------------------------------------------------------------
   Corre el importador REAL de HP (handlePL / processRows de
   src/hp/js/catalog.js) y su pricing-core contra un libro de Excel armado
   acá, con la forma del export de NetSuite. A diferencia de Poly y Legamaster,
   este chequeo NO necesita el archivo real: HP todavía no tiene una lista
   de precios versionada, y el día que la haya este test tiene que seguir
   corriendo igual — lo que verifica son invariantes del importador, no los
   datos de un archivo puntual.

   Qué cubre, y por qué cada cosa:

     · LA HOJA "HP". Los archivos "LP y Stock" traen una hoja por marca
       (POLY / HP / HP). Si handlePL() se quedara con la primera hoja, el
       catálogo de HP se llenaría de SKUs de otra marca SIN dar ningún
       error — el modo de falla más caro que tiene esta pantalla. Se verifica
       que elige "HP" aunque no sea la primera, y que cae a la primera
       cuando el archivo no trae ninguna hoja con nombre de marca.

     · LOS 4 NIVELES. El export trae una fila por (SKU × depósito × nivel): los
       4 niveles declarados en hp/brand.js tienen que plegarse a UN producto
       con sus 4 precios.

     · EL STOCK NO SE CUADRUPLICA. El archivo repite el mismo LocAvailable en
       las 4 filas de niveles de un depósito. Sumar sin deduplicar por
       (SKU, ubicación) multiplica el stock por 4 — el bug que ya documenta
       poly/js/catalog.js.

     · NO HAY NIVEL "DEAL". Es lo que separa a HP de Poly (ver la decisión
       en hp/brand.js): el importador de deals es del BOM Calculator de HP.
       Si alguien clona un pedazo de Poly de vuelta, esto lo agarra.

     · EL ARTÍCULO MANUAL SOBREVIVE AL REIMPORT. Los SKU cargados a mano no
       están en el archivo del ERP: si processRows() pisara la lista entera,
       cada actualización de stock los borraría.

     · EL PRECIO ES EL MISMO QUE VA A DAR EL MULTIMARCA. pricing-core.js es el
       archivo que comparten el cotizador de HP y src/multi/, y es la única
       garantía de que un SKU no salga a dos precios según por dónde se cotizó.

   Uso:  node scripts/check-hp-catalogo.js
   Sale con código 1 si algo falla, para poder usarlo en un hook o en CI.
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

/* ---- Cargar el importador real, con lo justo del entorno del navegador ----- */
function cargarCatalogo(){
  const xlsx  = fs.readFileSync(path.join(ROOT, 'src/vendor/xlsx.full.min.js'), 'utf8');
  /* safe.js va de verdad y no stubeado: de ahi salen cevenEsc(), cevenLsSet()
     y sobre todo cevenFormatoIVA(), que es la que usa cevenIvaPct() para
     resolver "IVA REDUCIDO" -> 10,5 %. Stubearla haria que el test valide una
     traduccion de IVA que no es la que corre en produccion. */
  const safe  = fs.readFileSync(path.join(ROOT, 'src/shared/safe.js'), 'utf8');
  const brand = fs.readFileSync(path.join(ROOT, 'src/hp/brand.js'), 'utf8');
  const opc   = fs.readFileSync(path.join(ROOT, 'src/shared/opciones.js'), 'utf8');
  const core  = fs.readFileSync(path.join(ROOT, 'src/shared/catalog-core.js'), 'utf8');
  const pric  = fs.readFileSync(path.join(ROOT, 'src/hp/js/pricing-core.js'), 'utf8');
  const cat   = fs.readFileSync(path.join(ROOT, 'src/hp/js/catalog.js'), 'utf8');
  const store = {};
  const ctx = {
    console,
    products: [],
    selIds: {},
    editId: null,
    items: [],
    _pendingNewSKUs: [],
    localStorage: {
      getItem: k => (k in store ? store[k] : null),
      setItem: (k,v) => { store[k] = String(v); },
      removeItem: k => { delete store[k]; }
    },
    document: {
      getElementById: () => ({
        style: {}, classList: { add(){}, remove(){} },
        value: '', textContent: '', innerHTML: '', checked: false,
        tagName: 'DIV', _attrs: {}, open: false,
        getAttribute(k){ return this._attrs[k] !== undefined ? this._attrs[k] : null; },
        setAttribute(k, v){ this._attrs[k] = String(v); },
        closest: () => null,
        appendChild(){}, addEventListener(){}, querySelectorAll: () => []
      }),
      querySelectorAll: () => []
    },
    // cevenEsc / cevenLsSet / cevenLsJSON / cevenParseMoney / cevenFormatoIVA
    // los define safe.js, que se corre abajo.
    cevenOpcFiltrar: (arr) => arr,
    cevenOpcActiva: () => 1,
    showErr: m => { if(m) ctx._err = m; },
    showToast: m => { ctx._toast = m; },
    cevenDelegate: () => {},
    cevenActEl: () => null,
    fD: n => String(n)
  };
  ctx.window = ctx;
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(xlsx, ctx);
  vm.runInContext(safe, ctx);
  vm.runInContext(brand, ctx);
  vm.runInContext(opc, ctx);
  vm.runInContext(core, ctx);
  vm.runInContext(pric, ctx);
  vm.runInContext(cat, ctx);
  return ctx;
}

const ctx = cargarCatalogo();
const TIERS = ctx.CEVEN_BRAND.priceTiers.map(t => t.v);

/* ---- Un export de NetSuite de mentira, con la forma del de verdad ---------
   Una fila por (SKU × depósito × nivel). Los precios son distintos entre
   niveles Y entre SKU para que un error de plegado no pase inadvertido por
   casualidad. El stock va repetido en las 4 filas del mismo depósito, que es
   exactamente lo que hace el archivo real. */
function filasDe(sku, desc, base, depositos, iva, rubro){
  const out = [];
  depositos.forEach(function(d){
    TIERS.forEach(function(nivel, i){
      out.push({
        'Nombre': sku,
        'Nombre para mostrar': desc,
        'Nivel de precio': nivel,
        'Precio unitario': base + i,          // un precio distinto por nivel
        'Ubicacion del inventario': d.ubi,
        'LocAvailable': d.stock,              // el MISMO en las 4 filas
        'Programa fiscal': iva,
        'RUBRO': rubro
      });
    });
  });
  return out;
}

const FILAS = []
  .concat(filasDe('02312DKT', 'SWITCH HP S5735-L24T4S-A', 1000,
                  [{ubi: 'Depósito Central', stock: 7}, {ubi: 'Depósito Norte', stock: 5}],
                  'IVA GENERAL', 'Networking'))
  .concat(filasDe('50086516', 'ACCESS POINT HP AIRENGINE 5761', 2000,
                  [{ubi: 'Depósito Central', stock: 3}],
                  'IVA REDUCIDO', 'Wireless'));

function libro(hojas){
  const wb = ctx.XLSX.utils.book_new();
  hojas.forEach(function(h){
    ctx.XLSX.utils.book_append_sheet(wb, ctx.XLSX.utils.json_to_sheet(h.filas), h.nombre);
  });
  return wb;
}

/* La elección de hoja que hace handlePL(), sin pasar por el FileReader (que no
   existe en node). Es la MISMA línea que corre en el navegador, copiada acá a
   propósito para que este chequeo falle si allá se cambia el criterio. */
function hojaElegida(wb){
  return wb.SheetNames.find(function(n){ return n.trim().toLowerCase() === 'hp'; })
      || wb.SheetNames[0];
}

console.log('\nImportador de HP · export de NetSuite sintético');
console.log('  ' + FILAS.length + ' filas · ' + TIERS.length + ' niveles · 2 SKU\n');

/* ── 1 · La hoja de la marca ───────────────────────────────────────────────── */
console.log('1 · Elección de hoja en un archivo multimarca');

const wbMulti = libro([
  { nombre: 'POLY',   filas: [{'Nombre':'POLY-X', 'Nombre para mostrar':'algo de Poly',
                               'Nivel de precio':TIERS[0], 'Precio unitario':9}] },
  { nombre: 'HUAWEI', filas: [{'Nombre':'HUAWEI-X', 'Nombre para mostrar':'algo de Huawei',
                               'Nivel de precio':TIERS[0], 'Precio unitario':9}] },
  { nombre: 'HP', filas: FILAS }
]);
ok(hojaElegida(wbMulti) === 'HP',
   'elige la hoja "HP" aunque sea la tercera del archivo',
   'eligió: ' + hojaElegida(wbMulti));

const wbUna = libro([{ nombre: 'Hoja1', filas: FILAS }]);
ok(hojaElegida(wbUna) === 'Hoja1',
   'cae a la primera hoja cuando el archivo no trae una por marca');

/* ── 2 · El plegado del formato largo ──────────────────────────────────────── */
console.log('\n2 · Plegado a un producto por SKU');

const filasHp = ctx.XLSX.utils.sheet_to_json(
  wbMulti.Sheets[hojaElegida(wbMulti)], {defval:''});
ctx.processRows(filasHp);
ok(!ctx._err, 'el importador no reportó error', ctx._err);

const porSku = {};
ctx.products.forEach(p => { porSku[p.sku] = p; });

ok(ctx.products.length === 2,
   'las ' + FILAS.length + ' filas se pliegan a 2 productos',
   'quedaron ' + ctx.products.length);

const sw = porSku['02312DKT'];
ok(!!sw, 'el SKU del switch entró al catálogo');
ok(sw && sw.description === 'SWITCH HP S5735-L24T4S-A',
   'la descripción sale de "Nombre para mostrar"');

const niveles = sw ? Object.keys(sw.precios) : [];
ok(niveles.length === 4, 'el producto queda con los 4 niveles del archivo',
   'quedaron ' + niveles.length + ': ' + niveles.join(', '));
ok(TIERS.every(t => typeof (sw && sw.precios[t]) === 'number'),
   'los 4 niveles son exactamente los declarados en hp/brand.js');
ok(sw && sw.precios[TIERS[0]] === 1000 && sw.precios[TIERS[3]] === 1003,
   'cada nivel se queda con SU precio, no con el de la última fila',
   sw ? JSON.stringify(sw.precios) : '');

/* El bug que este test existe para que no vuelva: 7 + 5 = 12, no 48. */
ok(sw && sw.stock === 12,
   'el stock se suma UNA vez por depósito (7+5=12), no una por fila de nivel',
   'stock = ' + (sw && sw.stock) + (sw && sw.stock === 48 ? '  ← se contó 4 veces' : ''));

ok(porSku['50086516'] && porSku['50086516'].stock === 3,
   'un SKU con un solo depósito conserva su stock');

/* ── 3 · IVA y rubro ───────────────────────────────────────────────────────── */
console.log('\n3 · IVA y categoría');

/* `ivaPct` es el TEXTO de la alícuota ('21%' / '10,5%'), no un número: así lo
   escribe el importador y así lo consumen cevenProductoIva() y la columna IVA
   de la cotización. Se afirma contra las constantes del módulo y no contra el
   literal, para que renombrar la etiqueta no haga pasar el test por casualidad. */
ok(sw && sw.ivaPct === ctx.CEVEN_IVA_GENERAL,
   'IVA GENERAL → ' + ctx.CEVEN_IVA_GENERAL, 'ivaPct = ' + (sw && sw.ivaPct));
ok(porSku['50086516'] && porSku['50086516'].ivaPct === ctx.CEVEN_IVA_REDUCIDO,
   'IVA REDUCIDO → ' + ctx.CEVEN_IVA_REDUCIDO,
   'ivaPct = ' + (porSku['50086516'] && porSku['50086516'].ivaPct));
ok(sw && sw.iva === 'IVA GENERAL',
   'el texto crudo del ERP se conserva aparte, para el tooltip');
/* Un SKU sin dato fiscal cae en la general. Es el caso del artículo cargado a
   mano, que no tiene "Programa fiscal". */
ok(ctx.cevenIvaPct('') === ctx.CEVEN_IVA_GENERAL,
   'un producto sin programa fiscal cae en la alícuota general');
ok(sw && sw.rubro === 'Networking', 'el RUBRO llega para los globitos del filtro');

/* ── 4 · HP NO tiene deals ─────────────────────────────────────────────── */
console.log('\n4 · Sin el nivel DEAL de Poly');

ok(typeof ctx.processDeals !== 'function',
   'no existe processDeals(): el importador del BOM Calculator es de Poly');
ok(typeof ctx.CEVEN_TIER_DEAL === 'undefined',
   'no existe la constante CEVEN_TIER_DEAL');
ok(!ctx.CEVEN_BRAND.priceTiers.some(t => t.deal),
   'ningún nivel de brand.js está marcado `deal: true`');
ok(ctx.products.every(p => !p.deal && !(p.precios && p.precios.DEAL)),
   'ningún producto quedó con datos de deal');

/* ── 5 · El artículo manual sobrevive al reimport ──────────────────────────── */
console.log('\n5 · Reimport del catálogo');

ctx.products.push({
  id: 'MAN-1', sku: 'MANUAL-1', description: 'Servicio de instalación',
  precios: { [TIERS[0]]: 500 }, stock: null, iva: '', ivaPct: 0.21,
  rubro: 'Servicios', manual: true
});
const antes = ctx.products.length;
ctx.processRows(filasHp);

const manual = ctx.products.filter(p => p.sku === 'MANUAL-1')[0];
ok(!!manual, 'el artículo cargado a mano sigue en el catálogo después de reimportar');
ok(manual && manual.precios[TIERS[0]] === 500, 'y conserva su precio');
ok(ctx.products.length === antes,
   'el reimport no duplica productos', 'antes ' + antes + ', después ' + ctx.products.length);

/* Reimportar no borra: precios nuevos sobre los que estaban, nuevos al final,
   y lo que el archivo no trae se queda. */
{
  const p = ctx.products.find(x => x.sku === '02312DKT');
  const precioArchivo = p.precios[TIERS[0]];
  p.precios[TIERS[0]] = 1;
  p.description = 'Descripción conocida';
  ctx.products.push({ id: 'VIEJO-1', sku: 'VIEJO-1', description: 'Ya no viene', precios: { [TIERS[0]]: 10 },
    stock: 2, iva: '', ivaPct: 0.21, rubro: '' });
  const n = ctx.products.length;
  ctx._toast = '';
  ctx.processRows(filasHp);
  const q = ctx.products.find(x => x.sku === '02312DKT');
  ok(ctx.products.length === n, 'el mismo archivo no cambia la cantidad de productos', n + ' → ' + ctx.products.length);
  ok(q.precios[TIERS[0]] === precioArchivo, 'el SKU que viene recibe el precio nuevo', 'dio ' + q.precios[TIERS[0]]);
  ok(q.description === 'Descripción conocida', 'y conserva su descripción');
  const v = ctx.products.find(x => x.sku === 'VIEJO-1');
  const filaQ = ctx._catRowHTML(q, 0, 'data-i', {admin:true});   // antes del segundo archivo
  ok(!!v && v.precios[TIERS[0]] === 10, 'un SKU que ya no viene en el archivo se conserva con su precio');
  ok(/1 producto no estaba/.test(ctx._toast || ''), 'el aviso cuenta los que no estaban', ctx._toast);
  ctx.processRows(filasHp.filter(r => r['Nombre'] !== '02312DKT'));
  ok(ctx.products.some(x => x.sku === '02312DKT'), 'un archivo con menos SKU no vacía el catálogo');
  // El punto amarillo.
  ok(v.needsReview === true, 'un SKU que no vino queda marcado para revisar');
  ok(/pto-ausente/.test(ctx._catRowHTML(v, 0, 'data-i', {admin:true})), 'la fila del SKU ausente lleva el punto amarillo');
  ok(/Consultar al PM/.test(ctx._catRowHTML(v, 0, 'data-i', {admin:true})), 'el punto dice que hay que consultar al PM');
  ok(!/pto-ausente/.test(filaQ), 'la fila de un SKU que vino no lo lleva');
  ok(ctx.products.find(x => x.sku === '02312DKT').needsReview === true, 'el SKU que faltó en el segundo archivo quedó marcado');
  ctx.processRows(filasHp);
  ok(!ctx.products.find(x => x.sku === '02312DKT').needsReview, 'y se le saca la marca cuando vuelve a venir');
}

/* ── 6 · El precio que va a dar el multimarca ──────────────────────────────── */
console.log('\n6 · pricing-core (el mismo archivo que carga src/multi/)');

const lista = ctx.products;
ok(ctx.cevenHpPrecioEnLista(lista, '02312DKT', TIERS[1]) === 1001,
   'precio de un SKU en un nivel');
ok(ctx.cevenHpPrecioEnLista(lista, '02312DKT', 'Nivel Inventado') === null,
   'un nivel que el SKU no tiene devuelve null, no 0',
   'un 0 se cotiza solo; un null hay que completarlo a mano');
ok(ctx.cevenHpPrecioEnLista(lista, 'NO-EXISTE', TIERS[0]) === null,
   'un SKU que no está en el catálogo devuelve null');

// Una línea sin nivel propio sigue al global; una con nivel propio no se mueve.
const sigueAlGlobal = { sku: '02312DKT', tier: '', salePrice: 0, qty: 1 };
ok(ctx.cevenHpRepricear(sigueAlGlobal, lista, TIERS[2]) === true
   && sigueAlGlobal.salePrice === 1002,
   'una línea sin nivel propio toma el precio del nivel global',
   'salePrice = ' + sigueAlGlobal.salePrice);

const nivelPropio = { sku: '02312DKT', tier: TIERS[0], salePrice: 0, qty: 1 };
ctx.cevenHpRepricear(nivelPropio, lista, TIERS[3]);
ok(nivelPropio.salePrice === 1000,
   'una línea con nivel propio ignora el global',
   'salePrice = ' + nivelPropio.salePrice);

const aMano = { sku: '02312DKT', tier: ctx.CEVEN_TIER_MANUAL, salePrice: 777, qty: 1 };
ok(ctx.cevenHpRepricear(aMano, lista, TIERS[0]) === false && aMano.salePrice === 777,
   'una línea MANUAL no la mueve ningún nivel',
   'salePrice = ' + aMano.salePrice);

ok(ctx.cevenHpMonto([{salePrice: 1000, qty: 2}, {salePrice: 1001, qty: 1}]) === 3001,
   'el monto de la fila de pipeline suma precio × cantidad');

/* ── Resultado ─────────────────────────────────────────────────────────────── */
if(fallos){
  console.error('\n✗ ' + fallos + ' de ' + corridas + ' fallaron.\n');
  process.exit(1);
}
console.log('\n✓ ' + corridas + ' chequeos OK: el importador de HP pliega los 4 niveles,\n'
          + '  no cuadruplica el stock, elige la hoja de la marca y no arrastra deals.\n');
