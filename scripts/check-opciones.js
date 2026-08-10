#!/usr/bin/env node
/* ============================================================================
   check-opciones.js · Cotizadores Ceven
   ----------------------------------------------------------------------------
   Una cotización puede llevar DOS propuestas alternativas (Opción A y Opción B)
   y guardarse como una sola. La regla que sostiene todo:

       **solo la opción VIGENTE suma al pipeline, al Target y al Excel.**

   Si las dos sumaran, el forecast del equipo quedaría inflado con plata que
   nunca se va a facturar. Eso no tira ninguna excepción y no se ve mirando la
   pantalla: se ve a fin de mes, cuando el total no cierra. Por eso se verifica
   con las funciones REALES de las dos marcas:

     · la grilla y los totales muestran la opción que se está editando;
     · addToPipeline() toma SOLO la vigente (Apple, con familias y garantías;
       Poly, con el monto);
     · cambiar la vigente desde el pipeline RECALCULA la fila;
     · el ida y vuelta por `cquotes` conserva qué línea es de cuál opción y cuál
       es la vigente;
     · una cotización sin opciones (todo lo guardado hasta 08/2026) se comporta
       exactamente igual que antes.

   Uso:  node scripts/check-opciones.js
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

/* ---- Entorno mínimo del navegador ------------------------------------------ */
function campo(val){
  return { value: val === undefined ? '' : String(val), style:{}, innerHTML:'', textContent:'',
           checked:false, classList:{add(){},remove(){},contains:()=>false}, addEventListener(){},
           _opcBound:false };
}

function cargar(marca){
  const store = {};
  const els = {};
  const ids = ['client','exec','proyecto','obs','eff-date','quote-estado','mes-cierre-mY','qnum',
               'opc-bar-box','opc-aviso-box','qbody','qbody-wrap','catbody','catcount','addbtn',
               'chkall','plbadge','fsearch','fmodel','fcountry','msl','msl-input','warranty-section',
               'franchise-note','wbody','opg','tier-global','pipe-body','cur','tc'];
  ids.forEach(function(id){ els[id] = campo(''); });
  els['fmodel'].value = 'Todos'; els['fcountry'].value = 'Todos';
  els['msl'].value = '20';

  const ctx = {
    console,
    products: [], items: [], warrantyItems: [], selIds: {}, editId: null,
    nacRates: {}, quoteNacOverrides: {}, IVA_MAP: {}, MODEL_CATEGORY: {}, qNum: 71,
    localStorage: {
      getItem: k => (k in store ? store[k] : null),
      setItem: (k,v) => { store[k] = String(v); },
      removeItem: k => { delete store[k]; }
    },
    document: {
      getElementById: id => els[id] || null,
      addEventListener(){}, querySelectorAll: () => []
    },
    CEVEN_BRAND: {
      id: marca, prefix: marca === 'poly' ? 'poly_' : '', plLabel: 'catálogo',
      quoteLists: marca === 'apple'
        ? [{get: () => ctx.items, set: v => { ctx.items = v; }},
           {get: () => ctx.warrantyItems, set: v => { ctx.warrantyItems = v; }}]
        : [{get: () => ctx.items, set: v => { ctx.items = v; }}]
    },
    cevenK: b => (marca === 'poly' ? 'poly_' : '') + b,
    cevenEsc: s => String(s == null ? '' : s),
    showErr(){}, showToast(m){ ctx._toast = m; },
    notifyUndo(msg, fn){ ctx._undoMsg = msg; ctx._undo = fn; },
    goTo(){}, renderCat(){}, renderPicker(){}, renderPipeline(){}, initCat(){},
    renderWarranties(){}, renderQ(){},
    cevenDelegate(){}, cevenActEl: () => null,
    getCur: () => 'USD', getTC: () => 0,
    fI: n => Math.round(n).toLocaleString('es-AR'),
    fD: n => Number(n).toLocaleString('es-AR',{minimumFractionDigits:2,maximumFractionDigits:2}),
    dp: u => 'USD ' + Math.round(u).toLocaleString('es-AR'),
    getMesCierre: () => '2026-09', setMesCierre(){},
    cevenPayMode: () => '30 días', cevenDelivery: () => 'Inmediata',
    cevenSetPayMode(){}, cevenSetDelivery(){}, cevenPintarQNum(){},
    cevenReservarQNum: () => 72, cevenAnotarQNum(){}, cevenEditandoQNum(){},
    cevenEsEdicionDe: () => false, cevenQNumFmt: n => String(n).padStart(4,'0'),
    cevenCanUsePipeline: () => true, cevenCanEditPipelineRow: () => true,
    cevenCanEditQuote: () => true, cevenMyNombre: () => 'Ivo', cevenIsAdmin: () => true,
    cevenApplyVendorAutofill(){}, autoSnapshot(){}, cevenClienteSet(){},
    cevenRequireExec: () => true, cevenExecActual: () => 'Ivo',
    cevenNuevoIdFila: () => 12345, refreshOpgDatalist(){},
    pushPipeUndo(){}, pushPipeUndoInsert(){}, pushPipeUndoRemove(){}, undoPipelineChange(){},
    isCotizacionFOB: () => false,
    suggestMacWarranty(){}, resetClientMode(){},
    tierDeLinea: () => '', repricearLinea(){}, cevenProductoIva: () => '21%',
    cevenIvaDeCatalogo: () => '21%', pintarTierGlobal(){}, tierSelectHTML: () => '',
    _qBindDelegation(){}, cevenTiers: () => [], CEVEN_IVA_REDUCIDO: '10.5%',
    XLSX: {}
  };
  ctx.window = ctx; ctx.globalThis = ctx;
  vm.createContext(ctx);
  const lee = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
  const comunes = ['src/shared/safe.js', 'src/shared/opciones.js', 'src/shared/quote-core.js'];
  const propios = marca === 'apple'
    ? ['src/apple/js/pricing.js', 'src/apple/js/pipeline-core.js']
    : ['src/poly/js/pipeline-core.js'];
  comunes.concat(propios).forEach(function(f){ vm.runInContext(lee(f), ctx, {filename: f}); });

  // getPipeline/savePipeline/getDB/saveDB: los define cada marca en módulos que
  // acá no hacen falta enteros (arrastran el DOM del pipeline). Se implementan
  // sobre el mismo `store`, que es lo que ven las funciones bajo prueba.
  ctx.getPipeline = () => JSON.parse(store['_pipe'] || '[]');
  ctx.savePipeline = p => { store['_pipe'] = JSON.stringify(p); return true; };
  ctx.getDB = () => JSON.parse(store['_db'] || '[]');
  ctx.saveDB = db => { store['_db'] = JSON.stringify(db); return true; };
  ctx.doSave = () => true;
  ctx._els = els;
  return ctx;
}

const A = 1, B = 2;

/* ============================ 1) EL MODELO ================================= */
console.log('\nOpciones A/B · el modelo (shared/opciones.js)\n');
let c = cargar('apple');

ok(c.cevenOpcDe({}) === A, 'una línea sin campo `opc` es de la Opción A (cotizaciones viejas)');
ok(c.cevenOpcDe({opc: 2}) === B, 'reconoce la Opción B por el campo de la línea');
ok(c.cevenOpcDe({'Opción': '2'}) === B, 'y por la columna "Opción" de una fila guardada');
ok(c.cevenOpcActiva() === A && c.cevenOpcEfectiva() === A && !c.cevenOpcHayB(),
   'una cotización arranca con una sola opción, vigente A');

c.cevenOpcAgregarB();
ok(c.cevenOpcHayB() && c.cevenOpcActiva() === B, 'agregar la Opción B abre esa solapa');
ok(c.cevenOpcEfectiva() === A, 'pero la vigente sigue siendo la A hasta que se marque',
   'dio ' + c.cevenOpcEfectiva());
c.cevenOpcMarcarVigente(B);
ok(c.cevenOpcEfectiva() === B, 'marcar vigente cambia cuál suma');
ok(/vigente/i.test(c._undoMsg||''), 'y avisa con un cartel que se puede deshacer', c._undoMsg);
c._undo();
ok(c.cevenOpcEfectiva() === A, 'el Deshacer vuelve a la anterior');

const filas = [{'Opción':1,'_opcEf':2}, {'Opción':2,'_opcEf':2}];
ok(c.cevenOpcHayBEnFilas(filas), 'detecta dos opciones en filas guardadas');
ok(c.cevenOpcEfectivaDeFilas(filas) === B, 'y cuál es la vigente, desde `_opcEf`');
ok(c.cevenOpcEfectivaDeFilas([{'Opción':1}]) === A,
   'una cotización de una sola opción es vigente A aunque no traiga `_opcEf`');
ok(c.cevenOpcFilasDeCotiz(
     [{'N° Cotización':'0071','Tipo':'producto','Opción':1,'_opcEf':2},
      {'N° Cotización':'0071','Tipo':'producto','Opción':2,'_opcEf':2},
      {'N° Cotización':'0072','Tipo':'producto','Opción':1}],
     '0071', ['producto']).length === 1,
   'cevenOpcFilasDeCotiz() devuelve SOLO las líneas de la opción vigente');

/* Borrar la Opción B tiene que llevarse sus líneas de TODAS las listas de la
   marca (en Apple, también las garantías). */
c = cargar('apple');
c.cevenOpcAgregarB();
c.items = [{sku:'A1',qty:1,salePrice:100,opc:1},{sku:'B1',qty:1,salePrice:50,opc:2}];
c.warrantyItems = [{sku:'W1',cantidad:1,precio:10,opc:2}];
c.cevenOpcBorrarB();
ok(c.items.length === 1 && c.items[0].sku === 'A1', 'borrar la Opción B se lleva sus productos');
ok(c.warrantyItems.length === 0, 'y también sus garantías CevenCare');
ok(!c.cevenOpcHayB() && c.cevenOpcActiva() === A, 'y la pantalla vuelve a una sola opción');
c._undo();
ok(c.items.length === 2 && c.warrantyItems.length === 1, 'el Deshacer repone las dos listas');

/* ==================== 2) EL PIPELINE NO SUMA DOBLE ========================= */
console.log('\nEl pipeline toma SOLO la opción vigente\n');

/* --- Apple: familias, garantías y margen ponderado --- */
c = cargar('apple');
c.cevenOpcAgregarB();
c.items = [
  {sku:'MAC-A', description:'MacBook Pro 16', lob:'Mac',  qty:2, salePrice:1000, itemMargin:20, opc:1},
  {sku:'IPD-A', description:'iPad Wi-Fi',     lob:'iPad', qty:5, salePrice:100,  itemMargin:10, opc:1},
  {sku:'MAC-B', description:'MacBook Air 13', lob:'Mac',  qty:2, salePrice:600,  itemMargin:15, opc:2}
];
c.warrantyItems = [{sku:'W-A', cantidad:2, precio:50, opc:1}, {sku:'W-B', cantidad:2, precio:20, opc:2}];
c._els['client'].value = 'Cliente S.A.';
c.addToPipeline();
let fila = c.getPipeline()[0];

ok(!!fila, 'la fila entró al pipeline');
ok(fila.monto === 2600, 'el monto es SOLO el de la Opción A (2000+500+100 garantías)',
   'dio ' + (fila||{}).monto);
ok(fila.qMac === 2 && fila.qIpad === 5, 'las cantidades por familia también salen solo de la A',
   'Mac ' + fila.qMac + ' / iPad ' + fila.qIpad);
ok(fila.qServ === 2 && fila.montoServ === 100, 'las garantías de la B no suman a Servicios',
   'qServ ' + fila.qServ + ' montoServ ' + fila.montoServ);
const totalDeLasDos = 2000 + 500 + 100 + 1200 + 40;
ok(fila.monto !== totalDeLasDos, 'y NO es la suma de las dos opciones ('+totalDeLasDos+')');

/* --- Poly: el monto --- */
let cp = cargar('poly');
cp.cevenOpcAgregarB();
cp.items = [
  {sku:'P-A1', qty:2, salePrice:500, opc:1},
  {sku:'P-B1', qty:2, salePrice:300, opc:2}
];
cp._els['client'].value = 'Cliente S.A.';
cp._els['proyecto'].value = 'Sala principal';
cp.addToPipeline();
let filaP = cp.getPipeline()[0];
ok(!!filaP && filaP.monto === 1000, 'Poly: el monto es solo el de la Opción A',
   'dio ' + (filaP||{}).monto);

/* La vigente vacía se corta con un cartel en vez de entrar en 0. */
let cv = cargar('apple');
cv.cevenOpcAgregarB();
cv.items = [{sku:'A1', description:'iPad', qty:1, salePrice:100, opc:1}];
cv.cevenOpcMarcarVigente(B);          // vigente B, que está vacía
cv._els['client'].value = 'Cliente';
cv._toast = '';
cv.addToPipeline();
ok(cv.getPipeline().length === 0, 'con la opción vigente vacía no se agrega la fila');
ok(/vigente y está vacía/.test(cv._toast||''), 'y se explica por qué', cv._toast);

/* ============ 3) CAMBIAR LA VIGENTE DESDE EL PIPELINE ====================== */
console.log('\nCambiar la opción vigente desde la fila del pipeline\n');

c = cargar('apple');
c.saveDB([
  {'N° Cotización':'0071','Tipo':'producto','Opción':1,'_opcEf':1,'SKU':'MAC-A','Descripción':'MacBook Pro 16','_lob':'Mac','Cantidad':2,'P. Venta Unitario':1000,'Margen %':20,'Total':2000},
  {'N° Cotización':'0071','Tipo':'garantia','Opción':1,'_opcEf':1,'SKU':'W-A','Descripción':'Gta','Cantidad':2,'P. Venta Unitario':50,'Total':100},
  {'N° Cotización':'0071','Tipo':'producto','Opción':2,'_opcEf':1,'SKU':'MAC-B','Descripción':'MacBook Air 13','_lob':'Mac','Cantidad':2,'P. Venta Unitario':600,'Margen %':15,'Total':1200}
]);
c.savePipeline([{id:1, qNum:'0071', ejecutivo:'Ivo', cliente:'Cliente S.A.', monto:2100, qMac:2, qServ:2, montoServ:100, margenPond:20}]);
c.cambiarOpcionVigente(1);
fila = c.getPipeline()[0];
ok(c.cevenOpcEfectivaDeFilas(c.getDB()) === B, 'la cotización queda con la Opción B como vigente');
ok(fila.monto === 1200, 'y la fila del pipeline se RECALCULA con la B', 'dio ' + fila.monto);
ok(fila.qServ === 0 && fila.montoServ === 0, 'las garantías de la A dejan de contar',
   'qServ ' + fila.qServ);
ok(fila.margenPond === 15, 'el margen ponderado también se recalcula', 'dio ' + fila.margenPond);
ok(/Opción B/.test(c._undoMsg||''), 'avisa con un cartel', c._undoMsg);

/* Una cotización de una sola opción no se puede "cambiar". */
c = cargar('apple');
c.saveDB([{'N° Cotización':'0072','Tipo':'producto','Opción':1,'SKU':'X','Descripción':'X','Cantidad':1,'P. Venta Unitario':10,'Total':10}]);
c.savePipeline([{id:2, qNum:'0072', ejecutivo:'Ivo', monto:10}]);
c._toast = '';
c.cambiarOpcionVigente(2);
ok(/una sola opción/.test(c._toast||''), 'con una sola opción se dice y no se toca nada', c._toast);
ok(c.getPipeline()[0].monto === 10, 'la fila queda igual');

/* Poly: mismo camino, recalculando el monto. */
cp = cargar('poly');
cp.saveDB([
  {'N° Cotización':'0071','Tipo':'producto','Opción':1,'_opcEf':1,'SKU':'P-A1','Descripción':'A','Cantidad':2,'P. Venta Unitario':500,'Total':1000},
  {'N° Cotización':'0071','Tipo':'producto','Opción':2,'_opcEf':1,'SKU':'P-B1','Descripción':'B','Cantidad':2,'P. Venta Unitario':300,'Total':600}
]);
cp.savePipeline([{id:9, qNum:'0071', ejecutivo:'Ivo', monto:1000}]);
cp.cambiarOpcionVigente(9);
ok(cp.getPipeline()[0].monto === 600, 'Poly: la fila pasa a valer lo de la Opción B',
   'dio ' + cp.getPipeline()[0].monto);
cp._undo();
ok(cp.cevenOpcEfectivaDeFilas(cp.getDB()) === A, 'el Deshacer devuelve la vigente a la A');

/* ================= 4) LO VIEJO SIGUE FUNCIONANDO IGUAL ==================== */
console.log('\nCotizaciones sin opciones (todo lo guardado hasta 08/2026)\n');

c = cargar('apple');
c.items = [
  {sku:'MAC', description:'MacBook Pro 16', lob:'Mac', qty:1, salePrice:1000, itemMargin:20},
  {sku:'IPD', description:'iPad',           lob:'iPad', qty:2, salePrice:100, itemMargin:10}
];
c._els['client'].value = 'Cliente';
c.addToPipeline();
fila = c.getPipeline()[0];
ok(fila.monto === 1200, 'sin campo `opc`, todo suma como Opción A', 'dio ' + fila.monto);
ok(!c.cevenOpcHayB(), 'y la cotización no muestra solapas de opciones');

const viejas = [
  {'N° Cotización':'0050','Tipo':'producto','SKU':'A','Descripción':'A','Cantidad':1,'P. Venta Unitario':10,'Total':10},
  {'N° Cotización':'0050','Tipo':'producto','SKU':'B','Descripción':'B','Cantidad':1,'P. Venta Unitario':20,'Total':20}
];
ok(c.cevenOpcFilasDeCotiz(viejas, '0050', ['producto']).length === 2,
   'una cotización vieja devuelve TODAS sus líneas (el índice del lineKey no se corre)');
ok(c.cevenOpcChipPipeHTML(viejas, '') === '', 'y su fila del pipeline no muestra la chapita A/B');

/* ===================== 5) EL CABLEADO NO SE PUEDE CAER ===================== */
/* Lo de arriba prueba la lógica; esto prueba que siga ENCHUFADA. Son llamadas de
   una línea, fáciles de perder en un merge, y perderlas no rompe nada visible:
   simplemente la cotización deja de guardar a qué opción pertenece cada línea, o
   el pipeline vuelve a sumar las dos. */
console.log('\nEl cableado en las dos marcas\n');

function fuente(f){ return fs.readFileSync(path.join(ROOT, f), 'utf8'); }
[['apple', 'Apple'], ['poly', 'Poly']].forEach(function(par){
  const m = par[0], label = par[1];
  const qdb   = fuente('src/'+m+'/js/quotes-db.js');
  const quote = fuente('src/'+m+'/js/quote.js');
  const pipe  = fuente('src/'+m+'/js/pipeline-core.js');
  const pdf   = fuente('src/'+m+'/js/pdf.js');
  const html  = fuente('src/'+m+'/index.html');
  ok(/cevenOpcSellarFila\(/.test(qdb),        label + ': doSave() sella cada fila con su opción');
  ok(/cevenOpcCargarDeFilas\(/.test(qdb),     label + ': abrir del historial recupera las opciones');
  ok(/cevenOpcReset\(\)/.test(qdb),           label + ': "＋ Nueva" vuelve a una sola opción');
  ok(/cevenOpcEstado\(\)/.test(qdb) && /cevenOpcEstadoSet\(/.test(qdb),
                                              label + ': el snapshot de Deshacer lleva el estado de opciones');
  ok(/cevenOpcPintarBarra\(/.test(quote),     label + ': renderQ() pinta la barra de opciones');
  ok(/cevenOpcFiltrar\(items, opc\)/.test(quote), label + ': renderQ() muestra solo la opción activa');
  ok(/cevenOpcEfectiva\(\)/.test(pipe),       label + ': addToPipeline() usa la opción vigente');
  ok(/function cambiarOpcionVigente/.test(pipe), label + ': se puede cambiar la vigente desde el pipeline');
  ok(/cevenOpcLeyenda\(\)/.test(pdf),         label + ': el PDF avisa que las opciones son excluyentes');
  ok(/opc-bar-box/.test(html) && /shared\/opciones\.js/.test(html),
                                              label + ': el index.html tiene la barra y carga el módulo');
  ok(/'Opción'/.test(fuente('src/'+m+'/js/state.js')), label + ': "Opción" es una columna del Excel');
});

console.log('\n' + (fallos ? '✗ ' + fallos + ' de ' + corridas + ' fallaron' : '✓ ' + corridas + ' chequeos OK') + '\n');
process.exit(fallos ? 1 : 0);
