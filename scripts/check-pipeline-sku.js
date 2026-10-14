#!/usr/bin/env node
/* ============================================================================
   check-pipeline-sku.js · Cotizadores Ceven
   ----------------------------------------------------------------------------
   src/shared/pipeline-sku.js: el estado PROPIO de una línea de producto dentro
   de una fila del pipeline. El estado del proyecto vale para todos sus
   artículos menos los que tengan uno configurado en particular.

   Existe porque los tres errores posibles acá no rompen nada visible:

     · la HERENCIA al revés (una línea sin override mostrando otra cosa que el
       estado del proyecto) se ve igual de plausible que la correcta;
     · el REPARTO del monto entre estados alimenta los KPI del dashboard. Si no
       suma exactamente el monto de la fila, la plata aparece o desaparece del
       "Total pipeline" y nadie lo nota hasta fin de mes;
     · el REINDEXADO al borrar una línea con la tijera. Las claves son
       `SKU|índice`: si no se corren, los overrides de las líneas de abajo
       quedan apuntando a la línea equivocada, en silencio.

   Corre las funciones REALES contra filas armadas a mano.

   Uso:  node scripts/check-pipeline-sku.js
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

/* pipeline-sku.js depende de cevenEsc (safe.js) y de cevenEstadoValores /
   cevenEstadoLabel (pipeline-status.js). Se cargan los tres de verdad: la lista
   de estados es justamente lo que no hay que duplicar acá. */
function cargar(){
  const ctx = {console};
  ctx.window = ctx;
  vm.createContext(ctx);
  ['src/shared/safe.js', 'src/shared/pipeline-status.js', 'src/shared/pipeline-sku.js', 'src/shared/opciones.js']
    .forEach(f => vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, {filename: f}));
  return ctx;
}

// Una línea de cquotes, con lo mínimo que mira pipeline-sku.js. `lid` es el id
// estable (`_lid`); sin él la fila es "vieja" y la clave cae al índice.
function ln(sku, cant, precio, lid){
  const l = {'SKU': sku, 'Cantidad': cant, 'P. Venta Unitario': precio};
  if(lid !== undefined) l['_lid'] = lid;
  return l;
}
function claves(e, lines){ return lines.map(e.cevenSkuLineKey); }

const e = cargar();

/* ═══ 1 · Herencia ═════════════════════════════════════════════════════════ */
console.log('\n1 · El estado del proyecto se hereda, salvo override');
{
  const fila = {estado: 'Cotizado', monto: 300};
  ok(e.cevenSkuEstado(fila, 'A|0') === 'Cotizado', 'sin skuStatus, la línea hereda el estado del proyecto');

  fila.skuStatus = {'A|0': 'Facturado'};
  ok(e.cevenSkuEstado(fila, 'A|0') === 'Facturado', 'con override, manda el de la línea');
  ok(e.cevenSkuEstado(fila, 'B|1') === 'Cotizado', 'y las demás siguen heredando');

  ok(e.cevenSkuEstado({monto: 1}, 'A|0') === 'Cotizado',
     'una fila sin estado cae a Cotizado, el mismo default que usa el resto del pipeline');

  ok(e.cevenSkuEstadoValores().indexOf('Proyecto') === -1,
     '"En proyecto" no es un estado de línea: describe la cotización entera');
  ok(e.cevenSkuEstadoValores().indexOf('Facturado') !== -1, 'pero el resto del embudo sí está');
}

/* ═══ 2 · Los dos colapsos ═════════════════════════════════════════════════ */
console.log('\n2 · No quedan overrides que digan lo mismo que el proyecto');
{
  // Cotización de UNA línea: no existe "estado particular", es el del proyecto.
  const fila = {estado: 'Cotizado', monto: 100};
  e.cevenSkuEstadoSet(fila, 'A|0', 'Facturado', ['A|0']);
  ok(fila.estado === 'Facturado' && fila.skuStatus === undefined,
     'con una sola línea cambia el estado del proyecto y no guarda mapa', JSON.stringify(fila));
}
{
  // Todas las líneas al mismo estado: colapsa al proyecto.
  const fila = {estado: 'Cotizado', monto: 300};
  const ks = ['A|0', 'B|1'];
  e.cevenSkuEstadoSet(fila, 'A|0', 'Facturado', ks);
  ok(fila.estado === 'Cotizado' && fila.skuStatus['A|0'] === 'Facturado',
     'la primera línea guarda su override y el proyecto no se mueve');
  e.cevenSkuEstadoSet(fila, 'B|1', 'Facturado', ks);
  ok(fila.estado === 'Facturado' && fila.skuStatus === undefined,
     'al quedar TODAS iguales, sube a estado del proyecto y borra el mapa', JSON.stringify(fila));
}
{
  // Volver una línea al estado del proyecto limpia su entrada.
  const fila = {estado: 'Cotizado', monto: 300, skuStatus: {'A|0': 'Facturado'}};
  ok(e.cevenSkuLimpiar(fila, 'A|0') === true && fila.skuStatus === undefined,
     'cevenSkuLimpiar saca el override y tira el mapa cuando queda vacío');
  ok(e.cevenSkuLimpiar(fila, 'A|0') === false, 'y es idempotente: limpiar dos veces no falla');
}
{
  const fila = {estado: 'Cotizado', monto: 300, skuStatus: {'A|0': 'Facturado'}};
  ok(e.cevenSkuEstadoSet(fila, 'A|0', 'Facturado', ['A|0', 'B|1']) === false,
     'poner el estado que ya tenía no cuenta como cambio (no dispara un guardado de más)');
}

/* ═══ 3 · Cuántos artículos tienen estado propio ═══════════════════════════ */
console.log('\n3 · El contador de la fila cuenta los que DIFIEREN del proyecto');
{
  const lines = [ln('A', 1, 100), ln('B', 1, 200), ln('C', 1, 300)];
  const fila = {estado: 'Cotizado', monto: 600, skuStatus: {'A|0': 'Facturado', 'B|1': 'Cotizado'}};
  ok(e.cevenSkuCuantosPropios(fila, lines) === 1,
     'un override que repite el estado del proyecto no cuenta como "propio"');
  ok(e.cevenSkuCuantosPropios({estado: 'Cotizado'}, lines) === 0, 'sin mapa, cero');
}

/* ═══ 4 · Reparto del monto entre estados ══════════════════════════════════ */
console.log('\n4 · El reparto suma SIEMPRE el monto de la fila');
{
  const lines = [ln('A', 2, 100), ln('B', 1, 300)];   // 200 + 300 = 500
  const fila = {estado: 'Cotizado', monto: 500, skuStatus: {'A|0': 'Facturado'}};
  const rep = e.cevenSkuRepartoPorEstado(fila, lines);
  ok(rep['Facturado'] === 200, 'la línea facturada aporta cantidad × precio', JSON.stringify(rep));
  ok(rep['Cotizado'] === 300, 'y el resto queda en el estado del proyecto');
}
{
  const fila = {estado: 'Negociacion', monto: 750};
  const rep = e.cevenSkuRepartoPorEstado(fila, null);
  ok(Object.keys(rep).length === 1 && rep['Negociacion'] === 750,
     'sin overrides el reparto es la fila entera en su estado: exactamente lo de antes');
}
{
  /* El monto de la fila es una foto del momento de agregarla al pipeline y la
     cotización pudo editarse después (el detalle ya avisa de ese descuadre).
     El sobrante NO puede evaporarse: iría a parar a la diferencia entre el
     "Total pipeline" y la suma de las pastillas. */
  const lines = [ln('A', 1, 100), ln('B', 1, 100)];   // las líneas suman 200
  const fila = {estado: 'Cotizado', monto: 500, skuStatus: {'A|0': 'Facturado'}};
  const rep = e.cevenSkuRepartoPorEstado(fila, lines);
  const suma = Object.keys(rep).reduce((a, k) => a + rep[k], 0);
  ok(suma === 500, 'con la cotización editada después, el reparto sigue sumando r.monto',
     JSON.stringify(rep));
  ok(rep['Cotizado'] === 400, 'el sobrante se imputa al estado del proyecto', JSON.stringify(rep));
}
{
  const lines = [ln('A', 1, 100), ln('B', 1, 100)];
  const fila = {estado: 'Cotizado', monto: 200, skuStatus: {'A|0': 'Facturado'}};
  ok(e.cevenSkuEstadosDe(fila, lines).sort().join(',') === 'Cotizado,Facturado',
     'cevenSkuEstadosDe devuelve los DOS estados: es lo que mira el filtro de la tabla');
  ok(e.cevenSkuEstadosDe({estado: 'Perdido', monto: 10}, null).join(',') === 'Perdido',
     'y uno solo cuando no hay overrides');
}

/* ═══ 5 · Reindexado al borrar una línea (la tijera) ═══════════════════════ */
console.log('\n5 · Al sacar un artículo, los overrides siguen en su línea');
{
  const lines = [ln('A', 1, 10), ln('B', 1, 20), ln('C', 1, 30)];
  const fila = {estado: 'Cotizado', skuStatus: {'B|1': 'Facturado', 'C|2': 'Perdido'}};
  e.cevenSkuReindex(fila, ['skuStatus'], lines, 0);        // se borra A
  ok(fila.skuStatus['B|0'] === 'Facturado' && fila.skuStatus['C|1'] === 'Perdido',
     'borrar la primera corre a las de abajo un lugar', JSON.stringify(fila.skuStatus));
  ok(fila.skuStatus['B|1'] === undefined, 'y no deja la clave vieja apuntando a nada');
}
{
  const lines = [ln('A', 1, 10), ln('B', 1, 20), ln('C', 1, 30)];
  const fila = {estado: 'Cotizado', skuStatus: {'A|0': 'Commit', 'B|1': 'Facturado', 'C|2': 'Perdido'}};
  e.cevenSkuReindex(fila, ['skuStatus'], lines, 1);        // se borra la del MEDIO
  ok(fila.skuStatus['A|0'] === 'Commit', 'las de arriba de la borrada no se mueven');
  ok(fila.skuStatus['C|1'] === 'Perdido', 'las de abajo bajan un índice');
  ok(fila.skuStatus['B|1'] === undefined && Object.keys(fila.skuStatus).length === 2,
     'y el override de la línea borrada se va con ella', JSON.stringify(fila.skuStatus));
}
{
  // Apple reindexa SIETE mapas juntos: si se corrieran unos sí y otros no, una
  // línea quedaría con el estado de una y el mes de otra.
  const lines = [ln('A', 1, 10), ln('B', 1, 20)];
  const fila = {skuStatus: {'B|1': 'Facturado'}, skuMesCierre: {'B|1': '2026-11'}};
  e.cevenSkuReindex(fila, ['skuStatus', 'skuMesCierre'], lines, 0);
  ok(fila.skuStatus['B|0'] === 'Facturado' && fila.skuMesCierre['B|0'] === '2026-11',
     'varios mapas se corren juntos y quedan alineados');
}
{
  const lines = [ln('A', 1, 10), ln('B', 1, 20)];
  const fila = {skuStatus: {'B|1': 'Facturado'}};
  e.cevenSkuReindex(fila, ['skuStatus'], lines, 1);
  ok(fila.skuStatus === undefined,
     'si al borrar la línea el mapa queda vacío, se tira: la fila no puede seguir figurando "con estados propios"');
}
{
  // SKU repetido en dos líneas: la clave lleva el índice justamente para eso.
  const lines = [ln('A', 1, 10), ln('A', 1, 20), ln('A', 1, 30)];
  const fila = {skuStatus: {'A|2': 'Facturado'}};
  e.cevenSkuReindex(fila, ['skuStatus'], lines, 0);
  ok(fila.skuStatus['A|1'] === 'Facturado' && fila.skuStatus['A|2'] === undefined,
     'con el mismo SKU repetido, el override sigue a SU línea y no a otra', JSON.stringify(fila.skuStatus));
}

/* ═══ 6 · Las <option> del selector de línea ═══════════════════════════════ */
console.log('\n6 · El <select> de la línea no pierde un estado desconocido');
{
  const h = e.cevenSkuEstadoOptions('Facturado');
  ok(/value="Facturado" selected/.test(h), 'marca el estado actual');
  ok(!/value="Proyecto"/.test(h), 'y no ofrece "En proyecto"');

  // Un proyecto EN 'Proyecto' hace que sus líneas hereden ese valor. Si el
  // <select> no lo incluyera, se dibujaría en la primera opción y el próximo
  // change guardaría un estado que nadie eligió.
  const h2 = e.cevenSkuEstadoOptions('Proyecto');
  ok(/value="Proyecto" selected/.test(h2),
     'pero si la línea YA está en un valor fuera de la lista, se agrega para no pisarlo', h2);
}

/* ═══ 7 · Id estable por línea: la posición ya no importa ══════════════════ */
console.log('\n7 · Reordenar, insertar o cambiar de opción NO mueve los estados');
{
  // El bug original: los estados se ataban a la POSICIÓN. Con `_lid` se atan a la línea.
  const A = ln('A', 1, 10, 'n000001'), B = ln('B', 1, 20, 'n000002'), C = ln('C', 1, 30, 'n000003');
  const fila = {estado: 'Cotizado', skuStatus: {[e.cevenSkuLineKey(B, 1)]: 'Facturado'}};

  const reord = [C, A, B];                                   // B pasa de la posición 1 a la 2
  const est = reord.map((l, i) => e.cevenSkuEstado(fila, e.cevenSkuLineKey(l, i)));
  ok(est.join(',') === 'Cotizado,Cotizado,Facturado',
     'reordenar las líneas: el estado sigue en B y no se corre a otra', est.join(','));

  const ins = [ln('X', 1, 5, 'n000009'), A, B, C];           // se inserta una línea ARRIBA de todas
  const est2 = ins.map((l, i) => e.cevenSkuEstado(fila, e.cevenSkuLineKey(l, i)));
  ok(est2.join(',') === 'Cotizado,Cotizado,Facturado,Cotizado',
     'insertar una línea arriba: el estado sigue en B', est2.join(','));

  ok(e.cevenSkuLineKey(B, 0) === e.cevenSkuLineKey(B, 7),
     'la clave de una línea no depende del índice con que se la consulte');
}
{
  // Mismo SKU repetido: es el caso donde "SKU|índice" era la única diferencia.
  const A1 = ln('A', 1, 10, 'n000001'), A2 = ln('A', 1, 20, 'n000002');
  const fila = {estado: 'Cotizado', skuStatus: {[e.cevenSkuLineKey(A2, 1)]: 'Perdido'}};
  ok(e.cevenSkuEstado(fila, e.cevenSkuLineKey(A2, 0)) === 'Perdido' && e.cevenSkuEstado(fila, e.cevenSkuLineKey(A1, 1)) === 'Cotizado',
     'con el mismo SKU en dos líneas, el estado sigue a SU línea aunque se inviertan');
}
{
  // El reparto del monto (lo que ve el dashboard) tampoco se corre.
  const lines = [ln('A', 1, 100, 'n000001'), ln('B', 1, 300, 'n000002')];
  const fila = {estado: 'Cotizado', monto: 400, skuStatus: {[e.cevenSkuLineKey(lines[1], 1)]: 'Facturado'}};
  const rep1 = e.cevenSkuRepartoPorEstado(fila, lines);
  const rep2 = e.cevenSkuRepartoPorEstado(fila, lines.slice().reverse());
  ok(rep1['Facturado'] === 300 && rep2['Facturado'] === 300 && rep1['Cotizado'] === 100 && rep2['Cotizado'] === 100,
     'el reparto por estado da lo mismo con las líneas en cualquier orden', JSON.stringify([rep1, rep2]));
}
{
  // Borrar una línea con id estable: las demás NO cambian de clave; la borrada se va.
  const A = ln('A', 1, 10, 'n000001'), B = ln('B', 1, 20, 'n000002'), C = ln('C', 1, 30, 'n000003');
  const fila = {skuStatus: {[e.cevenSkuLineKey(B, 1)]: 'Facturado', [e.cevenSkuLineKey(C, 2)]: 'Perdido'}};
  e.cevenSkuReindex(fila, ['skuStatus'], [A, B, C], 0);       // se borra A
  ok(fila.skuStatus[e.cevenSkuLineKey(B, 0)] === 'Facturado' && fila.skuStatus[e.cevenSkuLineKey(C, 1)] === 'Perdido'
     && Object.keys(fila.skuStatus).length === 2,
     'borrar una línea deja intactas las claves de las demás', JSON.stringify(fila.skuStatus));
  e.cevenSkuReindex(fila, ['skuStatus'], [B, C], 0);          // ahora se borra B (la que tenía override)
  ok(fila.skuStatus[e.cevenSkuLineKey(B, 0)] === undefined && fila.skuStatus[e.cevenSkuLineKey(C, 0)] === 'Perdido',
     'y el override de la línea borrada se va con ella');
}
{
  // Compatibilidad: una fila SIN `_lid` (cotización vieja) sigue usando el índice.
  ok(e.cevenSkuLineKey(ln('A', 1, 10), 3) === 'A|3', 'sin _lid la clave sigue siendo SKU|índice');
  ok(e.cevenSkuLineKey(ln('A', 1, 10, ''), 3) === 'A|3', 'un _lid vacío también cae al índice');
  ok(e.cevenSkuLineKey(ln('A', 1, 10, '0'), 3) === 'A|0',
     'un _lid legado ("0", el índice congelado) vale como id y no se confunde con "sin id"');
}

console.log('\n7b · Al reabrir una cotización vieja, las claves que ya tenía siguen valiendo');
{
  // Tres líneas sin _lid: el id legado es el índice, así que las claves NO cambian.
  const rows = [ln('A', 1, 10), ln('B', 1, 20), ln('C', 1, 30)];
  const lids = e.cevenLidsDeFilas(rows);
  ok(lids.join(',') === '0,1,2', 'cada línea vieja recibe el índice que ya tenía como clave', lids.join(','));
  rows.forEach((r, i) => { r['_lid'] = lids[i]; });
  ok(rows.every((r, i) => e.cevenSkuLineKey(r, i) === r['SKU'] + '|' + i),
     'y la clave resultante es idéntica a la de antes: ningún override existente queda huérfano');
  // Ya congeladas, mover una línea no corre nada.
  const fila = {estado: 'Cotizado', skuStatus: {'B|1': 'Facturado'}};
  const reord = [rows[2], rows[0], rows[1]];
  ok(reord.map((l, i) => e.cevenSkuEstado(fila, e.cevenSkuLineKey(l, i))).join(',') === 'Cotizado,Cotizado,Facturado',
     'tras congelar, reordenar ya no corre el estado de B');
}
{
  // Dos opciones: el índice legado se cuenta SOLO dentro de la vigente.
  const rows = [
    Object.assign(ln('A1', 1, 1), {'Opción': 1, '_opcEf': 1}),
    Object.assign(ln('A2', 1, 1), {'Opción': 1, '_opcEf': 1}),
    Object.assign(ln('B1', 1, 1), {'Opción': 2, '_opcEf': 1}),
  ];
  const lids = e.cevenLidsDeFilas(rows);
  ok(lids[0] === '0' && lids[1] === '1', 'las líneas de la opción vigente conservan su índice legado', lids.join(','));
  ok(/^n/.test(lids[2]), 'una línea de la opción NO vigente (que nunca tuvo clave) recibe un id nuevo', lids.join(','));

  const rows2 = rows.map(r => Object.assign({}, r, {'_opcEf': 2}));
  const lids2 = e.cevenLidsDeFilas(rows2);
  ok(lids2[2] === '0' && /^n/.test(lids2[0]) && /^n/.test(lids2[1]),
     'si la vigente es la B, el índice legado se cuenta entre las de la B', lids2.join(','));
}
{
  // Apple: el filtro de Tipo es el del pipeline; las filas meta no son líneas.
  const rows = [
    Object.assign(ln('P1', 1, 1), {'Tipo': 'producto'}),
    Object.assign(ln('G1', 1, 1), {'Tipo': 'garantia'}),
    {'Tipo': 'meta_nac'},
    Object.assign(ln('P2', 1, 1), {'Tipo': 'producto'}),
  ];
  const lids = e.cevenLidsDeFilas(rows, ['producto', 'garantia']);
  ok(lids.join(',') === '0,1,,2', 'la fila meta no cuenta ni recibe id; producto y garantía se numeran juntos', lids.join(','));
}
{
  // Un id repetido dentro de la misma cotización se reasigna: se pisarían el estado.
  const rows = [ln('A', 1, 1, 'n000001'), ln('B', 1, 1, 'n000001')];
  const lids = e.cevenLidsDeFilas(rows);
  ok(lids[0] === 'n000001' && lids[1] !== 'n000001' && lids[1] !== '', 'dos líneas con el mismo _lid: la segunda recibe otro', lids.join(','));
}

console.log('\n7c · El id se estampa al guardar y nunca cambia');
{
  const item = {sku: 'A'};
  const f1 = e.cevenOpcSellarFila({'SKU': 'A'}, item);
  const f2 = e.cevenOpcSellarFila({'SKU': 'A'}, item);
  ok(/^n[0-9a-z]{6,}$/.test(f1['_lid']), 'la fila guardada trae un _lid nuevo, con prefijo "n" (no numérico)', f1['_lid']);
  ok(f1['_lid'] === f2['_lid'], 'guardar dos veces la misma línea conserva el mismo id');
  ok(e.cevenOpcSellarFila({'Tipo': 'meta_nac'}, null)['_lid'] === undefined, 'una fila meta (sin item) no recibe id');
  const set = new Set();
  for(let i = 0; i < 5000; i++) set.add(e.cevenLidNuevo());
  ok(set.size === 5000, 'ids nuevos: 5000 generados, ninguno repetido');
}

console.log('\n' + (fallos
  ?('✗ ' + fallos + ' de ' + corridas + ' fallaron\n')
  : ('✓ ' + corridas + '/' + corridas + ' OK\n')));
process.exit(fallos ? 1 : 0);
