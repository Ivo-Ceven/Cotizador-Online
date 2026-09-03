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
  ['src/shared/safe.js', 'src/shared/pipeline-status.js', 'src/shared/pipeline-sku.js']
    .forEach(f => vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, {filename: f}));
  return ctx;
}

// Una línea de cquotes, con lo mínimo que mira pipeline-sku.js.
function ln(sku, cant, precio){
  return {'SKU': sku, 'Cantidad': cant, 'P. Venta Unitario': precio};
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

console.log('\n' + (fallos
  ? ('✗ ' + fallos + ' de ' + corridas + ' fallaron\n')
  : ('✓ ' + corridas + '/' + corridas + ' OK\n')));
process.exit(fallos ? 1 : 0);
