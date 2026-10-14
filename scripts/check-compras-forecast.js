#!/usr/bin/env node
/* ============================================================================
   check-compras-forecast.js · Cotizadores Ceven
   ----------------------------------------------------------------------------
   src/shared/compras-forecast.js: el forecast de compras. Total (si todo cierra)
   vs. estimado (ponderado por la probabilidad de cierre).

   Existe porque sus errores no rompen nada visible: un forecast que cuenta de
   más o de menos se ve igual de plausible. Lo que se cuida acá:

     · que los UMBRALES se respeten pase lo que pase (edad, vencimiento,
       calibración): es la promesa del modelo;
     · que no se cuente lo que ya se vendió, lo perdido, las garantías, ni la
       opción B de una cotización cuya vigente es la A;
     · que el estado PROPIO de un artículo mande sobre el del proyecto;
     · que el estimado nunca supere al total y que los totales cierren;
     · que las fechas en día/mes/año no se lean al revés.

   Corre las funciones REALES contra datos armados a mano.

   Uso:  node scripts/check-compras-forecast.js
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
const cerca = (a, b, eps) => Math.abs(a - b) <= (eps === undefined ? 1e-9 : eps);

function cargar(){
  const ctx = {console};
  ctx.window = ctx;
  vm.createContext(ctx);
  ['src/shared/safe.js', 'src/shared/pipeline-status.js', 'src/shared/opciones.js',
   'src/shared/pipeline-sku.js', 'src/shared/compras-forecast.js']
    .forEach(f => vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, {filename: f}));
  return ctx;
}
const e = cargar();
const AHORA = new Date(2026, 9, 13);               // 13/10/2026
const CFG = e.cevenFcConfig();

// Una fila del pipeline y una línea de cotización, con lo mínimo que mira el forecast.
function fila(o){
  return Object.assign({brand: 'poly', id: 1, qNum: 100, estado: 'Commit', mesCierre: '2026-10',
    cliente: 'C', proyecto: 'P', ejecutivo: 'E', fechaMod: '2026-10-12T10:00:00Z'}, o);
}
function ln(sku, cant, precio, extra){
  return Object.assign({'SKU': sku, 'Descripción': 'Desc ' + sku, 'Cantidad': cant,
    'P. Venta Unitario': precio, 'Tipo': 'producto'}, extra || {});
}
function cot(brand, qnum, lineas){ return {brand, qnum, lineas, borrada_at: null}; }
function correr(pipeline, cotizaciones, extra){
  return e.cevenFcConstruir(Object.assign({pipeline, cotizaciones, cfg: CFG, ahora: AHORA}, extra || {}));
}
const art = (r, sku) => r.articulos.filter(a => a.sku === sku)[0];

/* ═══ 1 · Configuración ════════════════════════════════════════════════════ */
console.log('\n1 · La configuración siempre es utilizable');
{
  const c = e.cevenFcConfig(null);
  ok(c.prob['Commit'].base === 0.70 && c.prob['Commit'].min === 0.50 && c.prob['Commit'].max === 0.90,
     'sin nada guardado, valen los defaults');

  const roto = e.cevenFcConfig({prob: {Commit: {base: 'x', min: 0.9, max: 0.2}}, edad: {caidaPorDia: 7}, vencido: {factor: -3}});
  ok(roto.prob['Commit'].min === 0.2 && roto.prob['Commit'].max === 0.9,
     'mínimo y máximo invertidos se ordenan', JSON.stringify(roto.prob['Commit']));
  ok(roto.prob['Commit'].base >= roto.prob['Commit'].min && roto.prob['Commit'].base <= roto.prob['Commit'].max,
     'una base ilegible cae dentro de los umbrales', JSON.stringify(roto.prob['Commit']));
  ok(roto.edad.caidaPorDia === 1 && roto.vencido.factor === 0, 'los valores fuera de rango se recortan a [0,1]');

  const alta = e.cevenFcConfig({prob: {Cotizado: {base: 0.95, min: 0.03, max: 0.20}}});
  ok(alta.prob['Cotizado'].base === 0.20, 'una base por encima del máximo se recorta al máximo');
}

/* ═══ 2 · Fechas ═══════════════════════════════════════════════════════════ */
console.log('\n2 · Las fechas día/mes/año no se leen al revés');
{
  const d = e.cevenFcFecha('9/10/2026');
  ok(d.getMonth() === 9 && d.getDate() === 9, '"9/10/2026" es el 9 de octubre, no el 10 de septiembre', String(d));
  const i = e.cevenFcFecha('2026-10-09T18:24:04.937Z');
  ok(i && i.getUTCFullYear() === 2026 && i.getUTCMonth() === 9, 'una fecha ISO se lee normal');
  ok(e.cevenFcFecha('') === null && e.cevenFcFecha(null) === null && e.cevenFcFecha('basura') === null,
     'vacío o ilegible da null, no una fecha inventada');
  ok(e.cevenFcMesDe(new Date(2026, 0, 5)) === '2026-01', 'el mes sale con dos dígitos');
}

/* ═══ 3 · Probabilidad y umbrales ══════════════════════════════════════════ */
console.log('\n3 · La probabilidad se erosiona con el tiempo, pero nunca sale de sus umbrales');
{
  const fresca = fila({fechaMod: '2026-10-10T00:00:00Z'});
  const p0 = e.cevenFcProbabilidad(fresca, 'Commit', AHORA, CFG, null);
  ok(cerca(p0.p, 0.70), 'un negocio recién tocado vale su base', JSON.stringify(p0));

  const dentro = e.cevenFcProbabilidad(fila({fechaMod: '2026-09-25T00:00:00Z'}), 'Commit', AHORA, CFG, null);
  ok(cerca(dentro.p, 0.70), 'dentro de la gracia (30 días) no pierde nada', JSON.stringify(dentro));

  const vieja = e.cevenFcProbabilidad(fila({fechaMod: '2026-08-24T00:00:00Z'}), 'Commit', AHORA, CFG, null);
  ok(vieja.p < 0.70 && vieja.p > 0.50, 'pasada la gracia (50 días) va cayendo', JSON.stringify(vieja));

  const mas = e.cevenFcProbabilidad(fila({fechaMod: '2026-08-04T00:00:00Z'}), 'Commit', AHORA, CFG, null);
  ok(mas.p < vieja.p && mas.p >= 0.50, 'y cae más cuanto más tiempo pasa');

  // El piso del factor (0.5) y el mínimo del estado (0.50): 0.70 × 0.5 = 0.35 → el mínimo manda.
  const antigua = e.cevenFcProbabilidad(fila({fechaMod: '2024-01-01T00:00:00Z'}), 'Commit', AHORA, CFG, null);
  ok(antigua.p === 0.50, 'una muy vieja toca el MÍNIMO del estado y no baja más', JSON.stringify(antigua));
  ok(antigua.fEdad === CFG.edad.pisoFactor, 'el factor de edad tiene su propio piso');

  const venc = e.cevenFcProbabilidad(fila({fechaMod: '2026-10-12T00:00:00Z', mesCierre: '2026-08'}), 'Negociacion', AHORA, CFG, null);
  ok(venc.vencido && cerca(venc.p, 0.30 * 0.6), 'un cierre ya vencido se castiga con el factor', JSON.stringify(venc));
  const futuro = e.cevenFcProbabilidad(fila({fechaMod: '2026-10-12T00:00:00Z', mesCierre: '2026-12'}), 'Negociacion', AHORA, CFG, null);
  ok(!futuro.vencido && cerca(futuro.p, 0.30), 'un cierre futuro no se castiga');
  const esteMes = e.cevenFcProbabilidad(fila({fechaMod: '2026-10-12T00:00:00Z', mesCierre: '2026-10'}), 'Negociacion', AHORA, CFG, null);
  ok(!esteMes.vencido, 'cerrar este mismo mes todavía no está vencido');

  const lineaMes = e.cevenFcProbabilidad(fila({mesCierre: '2026-12'}), 'Negociacion', AHORA, CFG, null, '2026-08');
  ok(lineaMes.vencido, 'si la LÍNEA tiene su propio mes de cierre, manda ese');

  // Con OC y Autorizando no envejecen ni vencen.
  const oc = e.cevenFcProbabilidad(fila({fechaMod: '2024-01-01T00:00:00Z', mesCierre: '2025-01'}), 'Con OC', AHORA, CFG, null);
  ok(cerca(oc.p, 0.95) && !oc.vencido, 'Con OC: la orden de compra firme no se erosiona con el tiempo', JSON.stringify(oc));

  ok(e.cevenFcProbabilidad(fila(), 'Facturado', AHORA, CFG, null) === null, 'un estado sin probabilidad definida da null');

  // Sin fecha legible: no se inventa una edad.
  const sinFecha = e.cevenFcProbabilidad(fila({fechaMod: 'xx', fechaISO: ''}), 'Commit', AHORA, CFG, null);
  ok(cerca(sinFecha.p, 0.70) && sinFecha.edadDias === null, 'sin fecha legible no se castiga por edad', JSON.stringify(sinFecha));

  // Umbrales: ninguna combinación puede salirse. Barrido.
  let afuera = 0;
  ['Proyecto', 'Cotizado', 'Negociacion', 'Commit', 'Con OC', 'Autorizando'].forEach(est => {
    ['2020-01-01', '2026-06-01', '2026-10-10'].forEach(fm => ['2020-01', '2026-10', '2030-01'].forEach(mc => {
      const r = e.cevenFcProbabilidad(fila({fechaMod: fm + 'T00:00:00Z', mesCierre: mc}), est, AHORA, CFG, null);
      if(r.p < CFG.prob[est].min - 1e-12 || r.p > CFG.prob[est].max + 1e-12) afuera++;
    }));
  });
  ok(afuera === 0, 'barrido de 54 combinaciones de estado/edad/vencimiento: ninguna sale de [mín, máx]');
}

/* ═══ 4 · Calibración con lo que pasó ══════════════════════════════════════ */
console.log('\n4 · La base se corre hacia lo observado, de a poco y dentro de los umbrales');
{
  const t = (id, estado, at) => ({brand: 'poly', pipeline_id: id, estado_de: null, estado_a: estado, at});
  const trans = [
    t(1, 'Cotizado', '2026-09-01'), t(1, 'Commit', '2026-09-10'), t(1, 'Facturado', '2026-09-20'),
    t(2, 'Cotizado', '2026-09-01'), t(2, 'Perdido', '2026-09-15'),
    t(3, 'Cotizado', '2026-09-01'), t(3, 'Commit', '2026-09-12'),                       // sigue abierto
    t(4, 'Commit', '2026-09-02'), t(4, 'Facturado', '2026-09-30')
  ];
  const r = e.cevenFcResumirTransiciones(trans);
  ok(r['Cotizado'].ganadas === 1 && r['Cotizado'].perdidas === 1 && r['Cotizado'].abiertas === 1,
     'cada estado por el que PASÓ un negocio cuenta cómo terminó (gana, pierde o sigue abierto)', JSON.stringify(r['Cotizado']));
  ok(r['Commit'].ganadas === 2 && r['Commit'].perdidas === 0 && r['Commit'].abiertas === 1,
     'Commit: dos facturaron, uno sigue abierto', JSON.stringify(r['Commit']));
  ok(r['Facturado'] === undefined && r['Perdido'] === undefined, 'los estados terminales no se calibran');

  const sinHistoria = e.cevenFcBaseCalibrada(CFG, {});
  ok(cerca(sinHistoria['Commit'].efectiva, 0.70) && sinHistoria['Commit'].n === 0,
     'sin historia, la base queda exactamente como está');

  const b = e.cevenFcBaseCalibrada(CFG, r);
  ok(cerca(b['Commit'].efectiva, (2 * 1 + 10 * 0.70) / 12) && b['Commit'].efectiva > 0.70,
     'con 2 de 2 ganadas, sube un poco: (2·1 + 10·0,70)/12', JSON.stringify(b['Commit']));
  ok(b['Commit'].efectiva < 0.80, 'pero con tan pocos casos NO se dispara: la base pesa más');
  ok(b['Cotizado'].n === 2 && cerca(b['Cotizado'].observada, 0.5), 'se informa cuántos casos hay y la tasa observada');

  // Muchos casos: manda lo observado, pero el máximo se respeta.
  const muchos = {Commit: {ganadas: 1000, perdidas: 0, abiertas: 0}, Cotizado: {ganadas: 0, perdidas: 1000, abiertas: 0}};
  const bm = e.cevenFcBaseCalibrada(CFG, muchos);
  ok(bm['Commit'].efectiva === CFG.prob['Commit'].max, 'con 1000 de 1000 ganadas llega al MÁXIMO y no lo pasa');
  ok(bm['Cotizado'].efectiva === CFG.prob['Cotizado'].min, 'con 0 de 1000 llega al MÍNIMO y no lo pasa');

  // La base calibrada es la que usa la probabilidad.
  const pc = e.cevenFcProbabilidad(fila({fechaMod: '2026-10-12T00:00:00Z'}), 'Commit', AHORA, CFG, b);
  ok(cerca(pc.p, b['Commit'].efectiva), 'la probabilidad parte de la base calibrada');

  // k = 0: se confía 100% en lo observado (dentro de umbrales).
  const cfgK0 = e.cevenFcConfig({calib: {k: 0}});
  ok(cerca(e.cevenFcBaseCalibrada(cfgK0, {Commit: {ganadas: 1, perdidas: 1, abiertas: 0}})['Commit'].efectiva, 0.5),
     'con k = 0 manda lo observado');
}

/* ═══ 5 · El forecast ══════════════════════════════════════════════════════ */
console.log('\n5 · Total vs. estimado');
{
  const r = correr(
    [fila({id: 1, qNum: 100, estado: 'Commit'})],
    [cot('poly', 100, [ln('A', 10, 50), ln('B', 4, 200)])]);
  const a = art(r, 'A');
  ok(a.total === 10 && cerca(a.estimado, 7), 'A: total 10 unidades, estimado 10 × 0,70 = 7', JSON.stringify([a.total, a.estimado]));
  ok(cerca(a.montoTotal, 500) && cerca(a.montoEstimado, 350), 'y el valor de venta acompaña');
  ok(r.totales.total === 14 && cerca(r.totales.estimado, 9.8), 'los totales suman los artículos');
  ok(r.totales.negocios === 1 && r.totales.articulos === 2, 'cuenta negocios y artículos');
  ok(a.negocios[0].estado === 'Commit' && cerca(a.negocios[0].prob, 0.70), 'cada artículo lista los negocios que lo componen, con su probabilidad');
}
{
  // Qué NO cuenta.
  const r = correr(
    [fila({id: 1, qNum: 1, estado: 'Facturado'}), fila({id: 2, qNum: 2, estado: 'Perdido'}),
     fila({id: 3, qNum: 3, estado: 'Cotizado'})],
    [cot('poly', 1, [ln('F', 5, 1)]), cot('poly', 2, [ln('L', 5, 1)]), cot('poly', 3, [ln('C', 5, 1)])]);
  ok(!art(r, 'F') && !art(r, 'L') && art(r, 'C'), 'lo Facturado y lo Perdido no se compra; lo Cotizado sí');
}
{
  const r = correr(
    [fila({id: 1, qNum: 100, brand: 'apple'})],
    [cot('apple', 100, [ln('MAC', 2, 1000), ln('CARE', 2, 300, {'Tipo': 'garantia'}), {'Tipo': 'meta_nac', 'N° Cotización': '0100'}])]);
  ok(art(r, 'MAC') && !art(r, 'CARE'), 'una garantía (servicio) no es mercadería: no se compra');
  ok(r.articulos.length === 1, 'y las filas meta no aparecen');
}
{
  // Opciones A/B: solo cuenta la vigente.
  const A = Object.assign(ln('OA', 3, 1), {'Opción': 1, '_opcEf': 2});
  const B = Object.assign(ln('OB', 3, 1), {'Opción': 2, '_opcEf': 2});
  const r = correr([fila({id: 1, qNum: 100})], [cot('poly', 100, [A, B])]);
  ok(!art(r, 'OA') && art(r, 'OB'), 'con dos opciones solo cuenta la vigente (acá, la B)');
}
{
  // Estado propio de un artículo.
  const lineas = [ln('X', 4, 10, {'_lid': 'n000001'}), ln('Y', 6, 10, {'_lid': 'n000002'})];
  const f = fila({id: 1, qNum: 100, estado: 'Commit', skuStatus: {'Y|n000002': 'Facturado'}});
  const r = correr([f], [cot('poly', 100, lineas)]);
  ok(art(r, 'X') && !art(r, 'Y'), 'un artículo ya Facturado dentro de un proyecto abierto no se vuelve a comprar');

  const f2 = fila({id: 1, qNum: 100, estado: 'Commit', skuStatus: {'Y|n000002': 'Cotizado'}});
  const r2 = correr([f2], [cot('poly', 100, lineas)]);
  ok(cerca(art(r2, 'X').estimado, 4 * 0.70) && cerca(art(r2, 'Y').estimado, 6 * 0.10),
     'y uno con estado propio usa SU probabilidad, no la del proyecto');

  // Reordenar las líneas no mueve el estado de cada artículo (id estable).
  const r3 = correr([f2], [cot('poly', 100, lineas.slice().reverse())]);
  ok(cerca(art(r3, 'X').estimado, 4 * 0.70) && cerca(art(r3, 'Y').estimado, 6 * 0.10),
     'reordenar las líneas de la cotización no corre los estados por artículo');

  // La fila Facturada con líneas todavía abiertas sí se mira.
  const f4 = fila({id: 1, qNum: 100, estado: 'Facturado', skuStatus: {'X|n000001': 'Commit'}});
  const r4 = correr([f4], [cot('poly', 100, lineas)]);
  ok(art(r4, 'X') && !art(r4, 'Y'), 'un proyecto Facturado con un artículo todavía abierto cuenta solo ese artículo');
}
{
  // Unidades ya facturadas/archivadas (Apple).
  const f = fila({id: 1, qNum: 100, brand: 'apple', skuArchivedQty: {'MAC|n1': 3}, skuPartialQty: {'MAC|n1': 2}});
  const r = correr([f], [cot('apple', 100, [ln('MAC', 10, 1, {'_lid': 'n1'})])]);
  ok(art(r, 'MAC').total === 5, '10 pedidas − 3 archivadas − 2 facturadas parcial = 5 por comprar');
  const f2 = fila({id: 1, qNum: 100, brand: 'apple', skuArchivedQty: {'MAC|n1': 10}});
  ok(!art(correr([f2], [cot('apple', 100, [ln('MAC', 10, 1, {'_lid': 'n1'})])]), 'MAC'), 'si ya se facturó todo, no queda nada por comprar');
}
{
  // Sin cotización, borrada, o sin líneas.
  const pip = [fila({id: 1, qNum: 100}), fila({id: 2, qNum: 200}), fila({id: 3, qNum: null})];
  const r = correr(pip, [cot('poly', 100, [ln('A', 1, 1)]), Object.assign(cot('poly', 200, [ln('B', 1, 1)]), {borrada_at: '2026-10-01'})]);
  ok(r.articulos.length === 1 && art(r, 'A'), 'una cotización borrada no cuenta');
  ok(r.sinCotizacion.length === 2, 'los negocios sin cotización encontrada se informan aparte, no se pierden en silencio', String(r.sinCotizacion.length));
  // Mismo número de cotización en otra marca: no se mezcla.
  const r2 = correr([fila({id: 1, qNum: 100, brand: 'poly'})], [cot('legamaster', 100, [ln('Z', 9, 1)])]);
  ok(r2.articulos.length === 0 && r2.sinCotizacion.length === 1, 'la cotización #100 de otra marca no se le asigna a este negocio');
}
{
  // Mismo SKU en dos negocios: se suma, con detalle de cada uno.
  const r = correr(
    [fila({id: 1, qNum: 1, estado: 'Con OC'}), fila({id: 2, qNum: 2, estado: 'Cotizado'})],
    [cot('poly', 1, [ln('S', 100, 5)]), cot('poly', 2, [ln('S', 40, 5)])]);
  const s = art(r, 'S');
  ok(s.total === 140 && cerca(s.estimado, 100 * 0.95 + 40 * 0.10), 'el mismo SKU en dos negocios se suma', JSON.stringify([s.total, s.estimado]));
  ok(s.negocios.length === 2, 'y conserva el detalle por negocio');
  // La misma referencia en distintas marcas es un artículo distinto.
  const r2 = correr([fila({id: 1, qNum: 1, brand: 'poly'}), fila({id: 2, qNum: 1, brand: 'legamaster'})],
    [cot('poly', 1, [ln('S', 1, 1)]), cot('legamaster', 1, [ln('S', 1, 1)])]);
  ok(r2.articulos.length === 2, 'el mismo código en dos marcas no se funde en un artículo');
}
{
  // Por mes, por marca, y coherencia general.
  const pip = [fila({id: 1, qNum: 1, mesCierre: '2026-10'}), fila({id: 2, qNum: 2, mesCierre: '2026-12', estado: 'Negociacion'})];
  const cs = [cot('poly', 1, [ln('A', 10, 1)]), cot('poly', 2, [ln('A', 10, 1), ln('B', 5, 1)])];
  const r = correr(pip, cs);
  ok(r.porMes['2026-10'].total === 10 && r.porMes['2026-12'].total === 15, 'agrupa por mes de cierre');
  ok(art(r, 'A').porMes['2026-12'].total === 10, 'y cada artículo trae su propio desglose por mes');
  ok(r.porMarca['poly'].total === 25, 'y por marca');
  const sumaArt = r.articulos.reduce((a, x) => a + x.total, 0), sumaMes = Object.keys(r.porMes).reduce((a, k) => a + r.porMes[k].total, 0);
  ok(sumaArt === r.totales.total && sumaMes === r.totales.total, 'los totales cierran por artículo, por mes y en general');
  ok(r.articulos.every(x => x.estimado <= x.total + 1e-9) && r.totales.estimado <= r.totales.total, 'el estimado nunca supera al total');

  // Filtros.
  const rm = correr(pip, cs, {hastaMes: '2026-10'});
  ok(rm.totales.total === 10, 'hastaMes deja solo los cierres hasta ese mes');
  const rs = correr(pip, cs, {estados: ['Commit']});
  ok(rs.totales.total === 10, 'estados deja solo los pedidos');
  const rb = correr(pip, cs, {marcas: ['apple']});
  ok(rb.totales.total === 0, 'marcas filtra por marca');
  ok(correr([], []).totales.total === 0, 'sin datos devuelve ceros, no explota');
}

console.log('\n5b · El resumen se puede recalcular sobre un subconjunto (la búsqueda por texto)');
{
  const pip = [fila({id: 1, qNum: 1, mesCierre: '2026-10'}), fila({id: 2, qNum: 2, mesCierre: '2026-12', estado: 'Negociacion'})];
  const r = correr(pip, [cot('poly', 1, [ln('A', 10, 2)]), cot('poly', 2, [ln('A', 10, 2), ln('B', 5, 4)])]);
  ok(cerca(art(r, 'A').porMes['2026-12'].montoTotal, 20) && cerca(art(r, 'A').porMes['2026-12'].montoEstimado, 6),
     'cada mes de un artículo trae su valor total y estimado', JSON.stringify(art(r, 'A').porMes['2026-12']));
  const solo = e.cevenFcResumir(r.articulos.filter(a => a.sku === 'B'));
  ok(solo.totales.total === 5 && solo.totales.articulos === 1 && solo.totales.negocios === 1 && solo.porMes['2026-12'].total === 5 && !solo.porMes['2026-10'],
     'resumir un subconjunto da solo lo de ese subconjunto', JSON.stringify(solo.totales));
  const todo = e.cevenFcResumir(r.articulos);
  ok(JSON.stringify(todo.totales) === JSON.stringify(r.totales), 'resumir todo coincide con los totales del forecast');
  ok(cerca(todo.totales.montoTotal, 10 * 2 + 10 * 2 + 5 * 4), 'el valor total suma cantidad × precio de cada línea');
  ok(e.cevenFcResumir([]).totales.total === 0 && e.cevenFcResumir(null).totales.articulos === 0, 'un resumen vacío es ceros');
}

console.log('\n6 · Sacar a mano una orden puntual grande');
{
  // Una orden enorme (4000 u.) que distorsiona todo + dos chicas, en dos marcas.
  const pip = [
    fila({id: 1, qNum: 1, estado: 'Commit'}),
    fila({id: 2, qNum: 2, estado: 'Con OC'}),
    fila({id: 3, qNum: 3, estado: 'Cotizado', brand: 'legamaster'})
  ];
  const cs = [
    cot('poly', 1, [ln('HS', 4000, 20), ln('MIC', 10, 50)]),
    cot('poly', 2, [ln('HS', 100, 20)]),
    cot('legamaster', 3, [ln('HS', 7, 20)])
  ];
  const todo = correr(pip, cs);
  const sin = correr(pip, cs, {excluir: ['poly|1']});
  ok(art(todo, 'HS').total === 4100 && art(todo, 'MIC'), 'sin exclusiones cuenta todo');
  ok(art(sin, 'HS').total === 100 && !art(sin, 'MIC'),
     'excluir un negocio saca TODAS sus líneas (4000 de HS y también su MIC)', JSON.stringify(sin.articulos.map(a => [a.sku, a.total])));
  ok(cerca(sin.totales.estimado, 100 * 0.95 + 7 * 0.10), 'y los totales se recalculan sin él (queda el Con OC y el chico de Legamaster)', String(sin.totales.estimado));
  ok(sin.totales.negocios === 2 && sin.porMarca['poly'].total === 100 && sin.porMarca['legamaster'].total === 7, 'la cuenta de negocios y por marca también');
  ok(sin.sinCotizacion.length === 0, 'un negocio excluido no cuenta como "sin cotización"');

  // La misma clave en otra marca no se ve afectada: poly|1 no es legamaster|1.
  const otra = correr([fila({id: 1, qNum: 3, brand: 'legamaster'})], [cot('legamaster', 3, [ln('X', 5, 1)])], {excluir: ['poly|1']});
  ok(art(otra, 'X'), 'excluir poly|1 no toca al id 1 de otra marca');
  ok(correr(pip, cs, {excluir: ['poly|99', 'xx']}).totales.total === todo.totales.total,
     'una exclusión que ya no existe en el pipeline se ignora sin romper nada');
  ok(correr(pip, cs, {excluir: []}).totales.total === todo.totales.total, 'lista vacía = no excluye nada');

  // La lista para elegir: por negocio, de mayor a menor, sobre el resultado SIN exclusiones.
  const ng = e.cevenFcNegocios(todo.articulos);
  ok(ng.length === 3 && ng[0].key === 'poly|1' && ng[0].unidades === 4010,
     'lista de negocios ordenada: la orden grande primero, con sus unidades sumadas', JSON.stringify(ng.map(n => [n.key, n.unidades])));
  ok(ng[0].articulos === 2 && cerca(ng[0].monto, 4000 * 20 + 10 * 50), 'cuenta artículos y valor de venta del negocio');
  ok(ng[0].estado === 'Commit' && ng[0].cliente === 'C', 'trae estado y cliente para mostrarlo');
  ok(cerca(ng[0].estimado, 4010 * 0.70), 'y su estimado');
  ok(e.cevenFcNegocios([]).length === 0 && e.cevenFcNegocios(null).length === 0, 'sin artículos devuelve lista vacía');
  // Un negocio con líneas en estados distintos muestra el de más unidades.
  const mixto = correr([fila({id: 5, qNum: 5, estado: 'Commit', skuStatus: {'B|n2': 'Cotizado'}})],
    [cot('poly', 5, [ln('A', 10, 1, {_lid: 'n1'}), ln('B', 90, 1, {_lid: 'n2'})])]);
  ok(e.cevenFcNegocios(mixto.articulos)[0].estado === 'Cotizado', 'con estados mezclados, muestra el de la línea más grande');
}

console.log('\n' + (fallos
  ?('✗ ' + fallos + ' de ' + corridas + ' fallaron\n')
  : ('✓ ' + corridas + '/' + corridas + ' OK\n')));
process.exit(fallos ? 1 : 0);
