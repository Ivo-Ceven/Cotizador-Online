#!/usr/bin/env node
/* ============================================================================
   check-apple-picker.js · Cotizadores Ceven
   ----------------------------------------------------------------------------
   La subpantalla flotante de Apple (src/apple/js/picker.js) y la vista Catálogo
   pintan sus filas con la MISMA función, `_catRowHTML()`, y agregan productos
   por el MISMO camino, `_sumarProductoAItems()`. Eso es justamente lo que hay
   que sostener: si los dos se desincronizan, un producto entra a la cotización
   con un precio distinto según por dónde se lo agregó, y eso no tira ningún
   error — sale en la cotización del cliente.

   Se verifica contra las funciones REALES cargadas en un DOM de mentira:

     · la fila de la flotante trae ＋ (o ✓ si el SKU ya está) y la del catálogo
       sigue trayendo checkbox y ✎/×;
     · el alta de a uno y el alta en lote dan el mismo precio;
     · las chapitas (manual / NAC✓ / a revisar) van en Descripción y NO en la
       celda del SKU, que está fija en 130px;
     · sacar un SKU saca TODAS sus líneas.

   Uso:  node scripts/check-apple-picker.js
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

/* ---- Entorno: lo justo del navegador + los módulos reales ------------------ */
function cargar(){
  const store = {};
  const campos = {};        // los <input>/<select> que tocan las funciones
  function campo(val){
    return { value: val === undefined ? '' : String(val), style:{}, innerHTML:'',
             textContent:'', checked:false, classList:{add(){},remove(){},contains:()=>false},
             addEventListener(){} };
  }
  ['fsearch','fmodel','fcountry','obs','msl','msl-input','catbody','catcount','addbtn',
   'chkall','plbadge','catui','nopl','pk-search','pk-model','pk-country','pk-body',
   'pk-count','pk-cart','pk-cart-n','pk-total','prod-picker'].forEach(function(id){ campos[id] = campo(''); });
  campos['fmodel'].value = 'Todos';
  campos['fcountry'].value = 'Todos';
  campos['msl'].value = '20';                 // margen global 20 %

  const ctx = {
    console,
    products: [], items: [], warrantyItems: [], selIds: {}, editId: null,
    nacRates: {}, quoteNacOverrides: {}, IVA_MAP: {},
    localStorage: {
      getItem: k => (k in store ? store[k] : null),
      setItem: (k,v) => { store[k] = String(v); },
      removeItem: k => { delete store[k]; }
    },
    document: {
      getElementById: id => campos[id] || null,
      addEventListener(){}, querySelectorAll: () => []
    },
    readyState: 'complete',
    cevenK: b => b,                            // Apple no tiene prefijo
    // brand.js real en miniatura: catalog-core.js lee CEVEN_BRAND.plLabel.
    CEVEN_BRAND: {id:'apple', prefix:'', plLabel:'price list'},
    showErr(){}, showToast(m){ ctx._toast = m; }, notifyUndo(){},
    goTo(){}, renderQ(){}, renderWarranties(){}, initCat(){},
    cevenDelegate(){}, cevenActEl: () => null,
    getCur: () => 'USD', getTC: () => 0,
    fI: n => Math.round(n).toLocaleString('es-AR'),
    fD: n => Number(n).toLocaleString('es-AR',{minimumFractionDigits:2,maximumFractionDigits:2}),
    dp: u => 'USD ' + Math.round(u).toLocaleString('es-AR'),
    uniq: function(arr){ var seen={}, out=['Todos']; arr.forEach(function(v){ if(v && !seen[v]){ seen[v]=1; out.push(v); } }); return out; },
    optionsHTML: vals => vals.map(v => '<option>'+v+'</option>').join(''),
    XLSX: {}
  };
  ctx.window = ctx; ctx.globalThis = ctx;
  vm.createContext(ctx);
  // opciones.js: el catálogo y la cotización filtran por opción A/B
  // (cevenOpcFiltrar/cevenOpcActiva). En el navegador se carga antes.
  for(const f of ['src/shared/safe.js', 'src/shared/opciones.js', 'src/shared/catalog-core.js', 'src/shared/quote-core.js',
                  'src/apple/js/pricing-core.js', 'src/apple/js/pricing.js', 'src/apple/js/catalog.js']){
    vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, {filename: f});
  }
  ctx._campos = campos;
  return ctx;
}

const P_IPAD = {id: 3, sku:'MD4P4LE/A', lob:'iPad', modelCol:'iPad', country:'Argentina',
                description:'iPad Wi-Fi 256GB - Pink A3354', sellingPrice: 496.64};
const P_MAC  = {id:'pm_1_1', sku:'MGEA4LE/A', lob:'Mac', modelCol:'MacBook Pro 16', country:'Argentina',
                description:'16-inch MacBook Pro', sellingPrice: 2773.38, manual:true, needsReview:true};

console.log('\nSubpantalla flotante de productos · Apple\n');

/* ---- 1) La fila: qué trae cada tabla -------------------------------------- */
let ctx = cargar();
ctx.products = [P_IPAD, P_MAC];
let calc = ctx._catCalc();

ok(calc.mg === 20, 'el margen global sale del slider', 'dio ' + calc.mg);
ok(calc.fob === false, 'sin "FOB" en Observaciones, la cotización no es FOB');

const filaCat = ctx._catRowHTML(P_IPAD, calc, null);
const filaPk  = ctx._catRowHTML(P_IPAD, calc, {agregar:true});

ok(/type="checkbox"/.test(filaCat), 'la fila del catálogo trae el checkbox de selección');
ok(/data-act="edit"/.test(filaCat) && /data-act="del"/.test(filaCat), 'la fila del catálogo trae ✎ y ×');
ok(/data-act="addone"/.test(filaPk), 'la fila de la flotante trae el botón ＋');
ok(!/type="checkbox"/.test(filaPk), 'la fila de la flotante NO trae checkbox');
ok(!/data-act="del"/.test(filaPk), 'la fila de la flotante NO trae el × de borrar del catálogo');
ok(/data-pid="3"/.test(filaPk), 'la fila direcciona por id de producto (data-pid)');

/* Las chapitas se movieron a Descripción: con el SKU a 130px se comían la
   columna y el propio SKU salía cortado. */
const filaMac = ctx._catRowHTML(P_MAC, calc, null);
const celdas = filaMac.split('</td>');
const celdaSku  = celdas[1] || '';
const celdaDesc = celdas[2] || '';
ok(celdaSku.indexOf('manual') === -1, 'la chapita "manual" NO está en la celda del SKU');
ok(celdaDesc.indexOf('manual') !== -1, 'la chapita "manual" está en Descripción');
ok(celdaDesc.indexOf('Revisar costo') !== -1, 'la chapita "⚠ Revisar costo" está en Descripción');

/* ---- 2) Alta de a uno = alta en lote (el precio no puede diferir) ---------- */
const esperado = ctx.calcP(P_IPAD.sellingPrice, ctx.getNac(P_IPAD), 20);
ctx.agregarUno(P_IPAD);
ok(ctx.items.length === 1, 'agregarUno() suma una línea', 'dio ' + ctx.items.length);
ok(ctx.items[0].salePrice === esperado, 'el precio es calcP(costo, nac, margen)',
   'dio ' + (ctx.items[0]||{}).salePrice + ' y se esperaba ' + esperado);
ok(ctx.items[0].qty === 1 && ctx.items[0].sellingBase === P_IPAD.sellingPrice,
   'la línea arranca con cantidad 1 y el costo del catálogo');
ok(/Agregado: MD4P4LE\/A/.test(ctx._toast||''), 'avisa con un cartel qué SKU agregó', ctx._toast);

const ctxLote = cargar();
ctxLote.products = [P_IPAD, P_MAC];
ctxLote.selIds[P_IPAD.id] = 1;
ctxLote.addToQuote();
ok(ctxLote.items.length === 1 && ctxLote.items[0].salePrice === ctx.items[0].salePrice,
   'el alta en lote ("Agregar (N)") da el MISMO precio que el alta de a uno',
   'lote ' + (ctxLote.items[0]||{}).salePrice + ' vs uno ' + ctx.items[0].salePrice);

/* ---- 3) El botón cambia de estado y no duplica ---------------------------- */
ok(ctx._enCotizacion('MD4P4LE/A'), '_enCotizacion() reconoce el SKU cargado');
const filaPk2 = ctx._catRowHTML(P_IPAD, calc, {agregar:true});
ok(/data-act="unq"/.test(filaPk2), 'con el SKU ya en la cotización el botón pasa a ✓ (sacar)');
ok(/class="crow pk-row enq"/.test(filaPk2), 'la fila queda marcada como "ya está" (.enq)', filaPk2.slice(0,80));

ctx.agregarUno(P_IPAD);
ok(ctx.items.length === 1, 'volver a tocar ＋ no duplica la línea', 'dio ' + ctx.items.length);

/* ---- 4) Sacar un SKU saca TODAS sus líneas -------------------------------- */
ctx._sumarProductoAItems(P_IPAD, calc);   // una segunda línea del mismo SKU (copia de cotización)
ok(ctx.items.length === 2, 'se pueden tener dos líneas del mismo SKU');
ctx.quitarDeCotizacion(P_IPAD);
ok(ctx.items.length === 0, 'quitarDeCotizacion() saca todas las líneas de ese SKU',
   'quedaron ' + ctx.items.length);

/* ---- 5) FOB y precio ya nacionalizado no se nacionalizan ------------------- */
const ctxFob = cargar();
ctxFob.products = [P_IPAD];
ctxFob._campos['obs'].value = 'Cotización FOB Miami';
const calcFob = ctxFob._catCalc();
ok(calcFob.fob === true, 'isCotizacionFOB() detecta el FOB en Observaciones');
ctxFob.agregarUno(P_IPAD);
ok(ctxFob.items[0].itemNac === 0, 'en una cotización FOB la línea entra con nac 0',
   'dio ' + ctxFob.items[0].itemNac);
ok(ctxFob.items[0].salePrice === ctxFob.calcP(P_IPAD.sellingPrice, 0, 20),
   'y el precio sale sin nacionalizar');

/* ---- 6) Los filtros de la flotante son propios ----------------------------- */
const ctxF = cargar();
ctxF.products = [P_IPAD, P_MAC];
ctxF._campos['pk-search'].value = 'macbook';
const soloMac = ctxF.getFilteredCon(ctxF._campos['pk-search'], ctxF._campos['pk-model'], ctxF._campos['pk-country']);
ok(soloMac.length === 1 && soloMac[0].sku === 'MGEA4LE/A', 'la búsqueda de la flotante filtra su propia lista',
   'dio ' + soloMac.length);
const todoCat = ctxF.getFiltered();   // la vista Catálogo no se enteró
ok(todoCat.length === 2, 'y no toca el filtro de la vista Catálogo', 'dio ' + todoCat.length);

console.log('\n' + (fallos ? '✗ ' + fallos + ' de ' + corridas + ' fallaron' : '✓ ' + corridas + ' chequeos OK') + '\n');
process.exit(fallos ? 1 : 0);
