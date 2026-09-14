#!/usr/bin/env node
/* ============================================================================
   check-pipe-kpi.js · Cotizadores Ceven
   ----------------------------------------------------------------------------
   Las tarjetas del dashboard del pipeline de Apple filtran la tabla de abajo, y
   al lado de las pastillas de mes hay una de "⚠ Estancadas". Las dos cosas
   vienen del cotizador monolítico viejo.

   Lo que se chequea acá es lo que se rompe sin hacer ruido:

   1. Las tarjetas NO tienen estado propio: escriben en los mismos filtros que
      los <select> y las pastillas. Si tuvieran uno, tocar una tarjeta y después
      el select dejaría dos filtros peleándose y la tabla mostraría otra cosa
      que la tarjeta.
   2. La tarjeta "Forecast del mes" y el filtro que dispara miran el MISMO set
      de estados (PIPE_PROYECTADO_STATUSES). Si divergieran, tocar la tarjeta
      mostraría filas distintas de las que sumó.
   3. El chip de la columna "Modificado" y la pastilla/filtro de estancadas usan
      UNA sola definición (nivelEstancamiento). Antes eran dos: el chip marcaba
      filas que el filtro no mostraba.
   4. Una fila Facturada o Perdida nunca se estanca — no hay acción pendiente.
   5. Sin estancadas, la pastilla se va Y apaga el filtro: dejarlo prendido sin
      pastilla en pantalla vaciaba la tabla sin nada que lo explicara.

   Uso:  node scripts/check-pipe-kpi.js
   ========================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');

let fallos = 0;
function ok(cond, nombre, detalle){
  if(cond){ console.log('  ✓ ' + nombre); return; }
  fallos++;
  console.error('  ✗ ' + nombre + (detalle ? ('\n      ' + detalle) : ''));
}

const DIA = 86400000;
const hace = d => new Date(Date.now() - d * DIA).toISOString();

/* Carga el tramo de pipeline-view.js que va de la alerta de estancadas hasta el
   final de los filtros del dashboard. El resto del archivo dibuja la tabla y
   necesita un DOM entero; esto no. */
function cargar(){
  const selects = { 'pipe-family': { value: '' }, 'pipe-status': { value: '' } };
  const tarjetas = {};
  const ctx = {
    console,
    document: {
      getElementById: id => selects[id] || tarjetas[id] || null
    },
    cevenEsc: s => String(s == null ? '' : s)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;').replace(/'/g,'&#39;'),
    renderPipeline(){ ctx._renders = (ctx._renders || 0) + 1; },
    cevenPipeSyncStatusSelect(){
      selects['pipe-status'].value = ctx._pipeStatusFilters.length === 1 ? ctx._pipeStatusFilters[0] : '';
    },
    _selects: selects,
    _tarjetas: tarjetas
  };
  ctx.window = ctx;
  ctx.globalThis = ctx;
  vm.createContext(ctx);

  const txt = fs.readFileSync(path.join(ROOT, 'src/apple/js/pipeline-view.js'), 'utf8');
  const ini = txt.indexOf('var PIPE_STALE_AVISO');
  const fin = txt.indexOf('function renderPipeline(');
  if(ini < 0 || fin < 0) throw new Error('no se encontró el tramo de KPI/estancadas en pipeline-view.js');
  vm.runInContext(txt.slice(ini, fin), ctx);
  return ctx;
}

console.log('\nESTANCADAS · qué cuenta como estancada');
{
  const c = cargar();
  const nivel = c.nivelEstancamiento;
  ok(nivel({ estado:'Cotizado', fechaMod: hace(5) })  === null,    'una fila movida hace 5 días está al día');
  ok(nivel({ estado:'Cotizado', fechaMod: hace(29) }) === null,    'a los 29 días todavía no avisa');
  ok(nivel({ estado:'Cotizado', fechaMod: hace(30) }) === 'aviso', 'a los 30 avisa');
  ok(nivel({ estado:'Cotizado', fechaMod: hace(59) }) === 'aviso', 'a los 59 sigue en aviso');
  ok(nivel({ estado:'Cotizado', fechaMod: hace(60) }) === 'alerta','a los 60 pasa a alerta');
  ok(nivel({ estado:'Facturado', fechaMod: hace(400) }) === null,  'una Facturada nunca se estanca');
  ok(nivel({ estado:'Perdido',   fechaMod: hace(400) }) === null,  'una Perdida tampoco');
  ok(nivel({ estado:'Cotizado' }) === null,                        'sin fechaMod no se puede saber: no se marca');
  ok(nivel({ estado:'Cotizado', fechaMod:'no es una fecha' }) === null, 'una fecha ilegible no rompe');
  ok(nivel(null) === null,                                         'una fila nula no rompe');

  // El chip de la columna y el filtro tienen que coincidir SIEMPRE.
  const filas = [
    { estado:'Cotizado',  fechaMod: hace(70) },
    { estado:'Cotizado',  fechaMod: hace(35) },
    { estado:'Cotizado',  fechaMod: hace(2)  },
    { estado:'Facturado', fechaMod: hace(90) }
  ];
  const chipMarca = r => /background:#fde8e8|background:#fff4e5/.test(c._pipeModificadoChip(r));
  const discrepa = filas.filter(r => chipMarca(r) !== !!nivel(r));
  ok(discrepa.length === 0, 'el chip de "Modificado" y el filtro marcan las mismas filas',
     discrepa.length ? JSON.stringify(discrepa) : '');
}

console.log('\nESTANCADAS · la pastilla');
{
  const c = cargar();
  const pipe = [
    { estado:'Cotizado',  fechaMod: hace(70) },   // alerta
    { estado:'Cotizado',  fechaMod: hace(65) },   // alerta
    { estado:'Cotizado',  fechaMod: hace(35) },   // aviso
    { estado:'Cotizado',  fechaMod: hace(1)  },   // al día
    { estado:'Facturado', fechaMod: hace(99) }    // cerrada
  ];
  const html = c.pastillaEstancadasHTML(pipe);
  ok(/Estancadas · 3/.test(html), 'cuenta avisos + alertas y deja fuera las cerradas', html);
  ok(/\(2 \+60d\)/.test(html), 'desglosa cuántas pasaron el umbral de alerta');
  ok(/togglePipeStaleFilter\(\)/.test(html), 'la pastilla dispara el filtro');

  // Sin estancadas: se va Y apaga el filtro.
  c._pipeStaleFilter = true;
  const vacio = c.pastillaEstancadasHTML([{ estado:'Cotizado', fechaMod: hace(1) }]);
  ok(vacio === '', 'sin estancadas no dibuja pastilla');
  ok(c._pipeStaleFilter === false, 'y apaga el filtro, para no dejar la tabla vacía sin explicación');

  ok(!/<script|onerror=/.test(c.pastillaEstancadasHTML(pipe)), 'no interpola nada sin escapar');
}

console.log('\nTARJETAS · filtro por familia');
{
  const c = cargar();
  const fam = c._selects['pipe-family'];
  c.toggleKpiFamilyFilter('mac');
  ok(fam.value === 'mac', 'tocar Macs filtra por mac');
  c.toggleKpiFamilyFilter('mac');
  ok(fam.value === '', 'tocarla de nuevo saca el filtro');
  c.toggleKpiFamilyFilter('iphone');
  c.toggleKpiFamilyFilter('ipad');
  ok(fam.value === 'ipad', 'tocar otra reemplaza (el <select> es de un solo valor)');
  ok(c._renders >= 4, 'cada toque repinta la tabla');
}

console.log('\nTARJETAS · filtro por estado');
{
  const c = cargar();
  c.toggleKpiFacturadoFilter();
  ok(JSON.stringify(c._pipeStatusFilters) === '["Facturado"]', 'Facturado filtra por ese estado');
  ok(c._selects['pipe-status'].value === 'Facturado', 'y sincroniza el <select>, que otro código lee');
  c.toggleKpiFacturadoFilter();
  ok(c._pipeStatusFilters.length === 0, 'tocarla de nuevo limpia');
  ok(c._selects['pipe-status'].value === '', 'y vacía el <select>');

  c.toggleKpiProyectadoFilter();
  ok(JSON.stringify(c._pipeStatusFilters.slice().sort())
     === JSON.stringify(['Autorizando','Commit','Con OC','Facturado']),
     'Forecast filtra por sus cuatro estados');
  ok(c._selects['pipe-status'].value === '',
     'con 4 estados el <select> queda vacío: no hay un valor único que los represente');
  c.toggleKpiProyectadoFilter();
  ok(c._pipeStatusFilters.length === 0, 'tocarla de nuevo limpia');

  /* La razón de ser de la constante compartida: la tarjeta suma estos estados y
     el filtro tiene que mostrar exactamente esos. */
  const txt = fs.readFileSync(path.join(ROOT, 'src/apple/js/pipeline-view.js'), 'utf8');
  ok(/var proySt = PIPE_PROYECTADO_STATUSES;/.test(txt),
     'la tarjeta Forecast suma la MISMA constante que filtra, no una copia');
  ok((txt.match(/\['Facturado', ?'Autorizando', ?'Con OC', ?'Commit'\]/g) || []).length === 1,
     'el set de estados del forecast está escrito una sola vez');
}

console.log('\nTARJETAS · limpiar');
{
  const c = cargar();
  c.toggleKpiFamilyFilter('mac');
  c.toggleKpiFacturadoFilter();
  c.clearKpiFilters();
  ok(c._selects['pipe-family'].value === '' && c._pipeStatusFilters.length === 0,
     'Cotizaciones / Total pipeline limpian familia y estado de una');
}

console.log('\nTARJETAS · resaltado de la que filtra');
{
  const c = cargar();
  const clases = id => {
    const set = new Set();
    return { classList: { toggle: (cl, on) => { on ? set.add(cl) : set.delete(cl); }, has: cl => set.has(cl) }, _set: set };
  };
  ['dash-mac-card','dash-iph-card','dash-ipad-card','dash-serv-card','dash-acc-card',
   'dash-facturado-card','dash-proy-card'].forEach(id => { c._tarjetas[id] = clases(id); });

  c.toggleKpiFamilyFilter('mac');
  c._pipePintarKpiActivas();
  ok(c._tarjetas['dash-mac-card']._set.has('kpi-active'), 'la tarjeta que filtra queda marcada');
  ok(!c._tarjetas['dash-iph-card']._set.has('kpi-active'), 'las otras no');

  c.toggleKpiFamilyFilter('mac');
  c._pipePintarKpiActivas();
  ok(!c._tarjetas['dash-mac-card']._set.has('kpi-active'), 'al sacar el filtro se despinta');

  c.toggleKpiProyectadoFilter();
  c._pipePintarKpiActivas();
  ok(c._tarjetas['dash-proy-card']._set.has('kpi-active-accent'),
     'las tarjetas con color propio usan la variante con filete blanco');
}

console.log('\nCABLEADO · el HTML y el CSS');
{
  const html = fs.readFileSync(path.join(ROOT, 'src/apple/index.html'), 'utf8');
  const css  = fs.readFileSync(path.join(ROOT, 'src/shared/css/base.css'), 'utf8');
  ['dash-mac-card','dash-iph-card','dash-ipad-card','dash-serv-card','dash-acc-card',
   'dash-facturado-card','dash-proy-card','dash-total-card','dash-count-card',
   'pipe-stale-pill'].forEach(id => {
    ok(html.indexOf('id="' + id + '"') !== -1, 'existe #' + id + ' en el HTML');
  });
  ok(/toggleKpiFamilyFilter\('mac'\)/.test(html), 'la tarjeta de Mac está cableada');
  ok(/\.kpi-active\{/.test(css) && /\.kpi-active-accent\{/.test(css), 'las dos clases de resaltado existen');
  ok(/\.kpi-click\{[^}]*cursor:pointer/.test(css), 'las tarjetas clicables muestran el cursor');
}

console.log(fallos ? ('\n✗ ' + fallos + ' problema(s).\n') : '\n✓ KPI y estancadas OK.\n');
process.exit(fallos ? 1 : 0);
