/* ============================================================
   PIPELINE REGI · segunda vista del pipeline de Poly
   ------------------------------------------------------------
   Deal Registration de HP/Poly: se importa a mano el Excel que manda
   el partner portal ("REgis.xlsx") y se pinta con el mismo shell visual
   del pipeline de siempre (tarjeta de dashboard, pastillas de mes/top
   clientes, tabla agrupada por cuenta) — pero es un snapshot de SOLO
   LECTURA: no hay cotización de Ceven detrás de una fila, así que no
   hay estado editable, link de Netsuite ni botón de quitar. Para
   actualizarla se vuelve a importar el Excel.

   El dato vive en Supabase (`poly_regi_pipeline`, RLS
   ceven_is_staff()/ceven_is_writer() — mismo criterio que
   regi_codigos), no en localStorage: lo importa una persona y lo ve
   todo el equipo. Cada importación REEMPLAZA la tabla entera (ver
   _procesarRegiPipelineExcel): un upsert por `opd` con un
   `imported_at` común, y después se borra lo que quedó con un
   `imported_at` más viejo — así una oportunidad que salió del Excel
   sale también de acá, sin necesitar una función SQL nueva.

   Reusa sin tocarlas las piezas compartidas del pipeline que ya no
   asumen que la fila es editable: cevenPipeGroupBy/cevenPipeSortGroups
   (shared/pipeline-group.js), cevenPintarPillsMes/cevenPintarTopClientes
   (shared/pipeline-ui.js), y el registro de nodos para expandir/colapsar
   grupos (cevenPipeNodeAdd/cevenPipeKey/cevenPipeAbierto/togglePipeNode).
   Para eso las filas sintéticas llevan los mismos NOMBRES de campo que
   una fila real (`cliente`, `monto`, `mesCierre`): esas funciones los
   leen así y no hay que tocarlas.

   Lo que SÍ es propio (encabezado de grupo sin pastillas de Estado,
   columnas de la fila, dashboard con Forecast en vez de Estado) está
   todo acá porque de verdad es otra tabla, no la misma con más columnas
   — mismo criterio que ya dejan escrito shared/pipeline-group.js y
   shared/pipeline-ui.js sobre Poly vs Apple.

   03/09/2026 · VUELVE A SER UNA FOTO DEL EXCEL. Entre el 25/08 y esta
   fecha la fila se pudo editar en dos sentidos —asignarle productos del
   catálogo (tabla poly_regi_pipeline_productos, js/pipeline-regi-productos.js)
   y editarle el Forecast a mano (columna `forecast_override`, con un cuarto
   estado que HP no tiene: "Perdido")—, y el monto de los productos
   REEMPLAZABA al del archivo. Pedido del jefe: acá no se edita nada, esto
   tiene que decir exactamente lo que dice el archivo de HP. Se sacó toda la
   edición y el editor de productos entero.

   Lo que queda escribiendo desde esta vista NO toca la foto: "⬇ Importar
   Excel REGI" (la reemplaza entera, que es la única forma de actualizarla) y
   "➕ Copiar a Ceven" (abre una cotización nueva del lado de Ceven).

   Las dos cosas de la base quedaron EN SU LUGAR, sin borrar ni migrar:
   `poly_regi_pipeline_productos` y `poly_regi_pipeline.forecast_override` /
   `perdido_motivo` siguen existiendo con sus datos, esta vista simplemente
   dejó de leerlas. Volver atrás es volver a pedirlas en el select.

   `r.monto` es el monto que se VE y se SUMA en toda la UI (fila, grupo,
   dashboard, orden) y es SIEMPRE el `amount` del archivo de HP.
   `r.montoArchivo` es el mismo número: se conserva como nombre propio
   porque las Estadísticas REGI comparan explícitamente "lo que dice HP"
   contra "lo que tiene Ceven" (ver _regiDiffMonto).

   Depende de: shared/auth.js (cevenAuthedFetch, cevenMyRole,
   cevenSessionUser, cevenCanUsePipeline), shared/config.js
   (SUPABASE_URL), shared/safe.js (cevenEsc), shared/notify.js
   (showToast), shared/ui-core.js (fI, cevenDelegate, cevenActEl),
   shared/pipeline-group.js, shared/pipeline-ui.js, poly/js/catalog.js
   (cevenDealFechaISO — el serial de Excel a 'AAAA-MM-DD', ya resuelto
   ahí para "End Date" de los deals), poly/js/pipeline-data.js
   (_mesLabelPoly). Se carga DESPUÉS de todos esos.
   ============================================================ */

window._regiPipeRows = null;         // null = todavía no se pidió a Supabase
window._regiForecastFilter = '';
window._regiSoloPerdidas = false;    // toggle "Solo perdidas" (excluye a "Mostrar vinculadas")
window._regiVistaWasActive = false;
// OPD marcados "Perdida" que siguen 3 s en la tabla antes de que el filtro
// "ya vinculadas" los saque (ver _regiMarcarPerdida). `...T` guarda el timer
// de cada uno para poder cancelarlo si se destilda o falla el PATCH.
window._regiPerdidaGracia = window._regiPerdidaGracia || {};
window._regiPerdidaGraciaT = window._regiPerdidaGraciaT || {};

function _cevenRegiPipeRest(path){ return SUPABASE_URL + '/rest/v1/' + path; }

/* Las TRES categorías de forecast del partner portal de HP, que son las
   únicas que puede traer la columna `Forecast` del Excel.

   'Perdido' vivía acá como cuarto valor: no salía del archivo, era el
   override que Ceven fijaba a mano (forecast_override). Se fue con la
   edición el 03/09/2026 — dejarlo habría pintado para siempre una pastilla
   apagada de un estado que ya nadie puede fijar. */
var REGI_FORECAST_COLORS = {
  Commit:   {bg:'#fff8e1', fg:'#7a5800'},
  Pipeline: {bg:'#e8f4ff', fg:'#0071e3'},
  Upside:   {bg:'#f2e8ff', fg:'#6e36c8'}
};

/* 'AAAA-MM-DD' -> 'DD/MM/AAAA', solo para mostrar. DR Expiration se guarda en
   ISO (ordena bien como string); esto es cosmético. */
function _regiFechaDDMMYYYY(iso){
  var p = String(iso||'').split('-');
  return p.length === 3 ? (p[2]+'/'+p[1]+'/'+p[0]) : (iso||'');
}

/* ── Vínculo con el pipeline real, vía OPG (27/08/2026) ───────────────────
   El pipeline REGI tiene que "quedar vacío": toda oportunidad que HP nos
   reconoce tiene que terminar con una cotización real cargada del lado de
   Ceven. El matching es `pipeline.opg` (ya existe, "número de precio
   especial que asigna la marca") contra `regi` si HP ya lo aprobó. Si no hay
   REGI, usa `opd`, que es el dato presente en todas las filas del Excel.
   Así el vínculo existente por REGI no cambia y las oportunidades pendientes
   de aprobación también se pueden cargar y vincular.

   Un mismo REGI puede estar en el pipeline de Ceven en VARIAS cotizaciones
   distintas (el mismo OPG cargado en varias filas). El vínculo es booleano
   ("¿hay al menos una?"), pero las Estadísticas agregan TODAS esas filas
   (_regiCevenAgg) para compararlas contra el único dato de HP.

   Sin columna nueva ni fetch nuevo a Supabase: getPipeline() ya es la misma
   fuente en memoria que usa toda la vista del pipeline real, mantenida al
   día por shared/sync.js. */
function _regiNormCodigo(v){
  return String(v == null ? '' : v).trim().toUpperCase();
}

function _regiCodigoVinculo(r){
  return _regiNormCodigo(r && (r.regi || r.opd));
}

// {OPG_NORMALIZADO: [fila, fila, ...]} — TODAS las filas del pipeline real que
// tienen ese OPG, no una sola. Antes era {OPG: fila} y un segundo proyecto con
// el mismo OPG pisaba al primero sin aviso, así que su monto/fecha quedaban
// fuera de las Estadísticas. Los únicos consumidores son _regiEsVinculada
// (booleano) y _regiCevenAgg (agrega la lista).
function _regiOpgVinculadosSet(){
  var set = {};
  (getPipeline() || []).forEach(function(r){
    var v = _regiNormCodigo(r.opg);
    if(!v) return;
    (set[v] || (set[v] = [])).push(r);
  });
  return set;
}

/* Una oportunidad REGI está vinculada si su REGI aprobado —o su OPD cuando
   todavía no tiene REGI— coincide con el OPG de alguna fila real.
   `vinculados` la arma UNA vez por render (_regiOpgVinculadosSet) para no
   recorrer getPipeline() por fila. */
function _regiEsVinculada(r, vinculados){
  var codigo = _regiCodigoVinculo(r);
  var filas = codigo && vinculados[codigo];
  return !!(filas && filas.length);
}

/* Usada desde pipeline-view.js (fila del pipeline REAL) para el 🎯 que
   confirma que un OPG cargado matchea AHORA con una oportunidad REGI
   vigente. Si el pipeline REGI no se cargó todavía esta sesión, no hay con
   qué comparar: se devuelve false sin disparar un fetch solo para esto. */
function _regiOpgMatcheaVigente(opg){
  var v = _regiNormCodigo(opg);
  if(!v || !window._regiPipeRows) return false;
  return window._regiPipeRows.some(function(r){ return _regiCodigoVinculo(r) === v; });
}

/* ── Estadísticas REGI: HP vs. Ceven (27/08/2026) ──────────────────────────
   Compara, oportunidad por oportunidad, lo que HP carga en su Excel (monto y
   fecha ESTIMADOS, sin hablar con el cliente) contra lo que Ceven tiene
   cargado de verdad en su propio pipeline (con el cliente real hablado).
   Solo entran los pares YA VINCULADOS por OPG — sin eso no hay con qué
   comparar del otro lado (ver el comentario de _regiOpgVinculadosSet).

   Un mismo REGI puede estar en el pipeline de Ceven en VARIAS cotizaciones
   distintas: el lado "Ceven" de cada par es la AGREGACIÓN de todas ellas
   (_regiCevenAgg), no una sola fila. */

// Estados que NO suman a la posición viva de Ceven: mismo criterio que el
// "Total pipeline" del pipeline normal (pipeline-view.js: sumMonto − facturado
// − perdido). Un estado ausente cuenta como 'Cotizado' (activo), igual que ahí.
var _REGI_ESTADOS_EXCLUIDOS = { Perdido: 1, Facturado: 1 };

/* Filtros interactivos de las Estadísticas (slicers estilo PowerBI). Mapas
   usados como sets: una clave presente y truthy = seleccionada; vacío = "todos".
   Viven en window y NO se persisten (mismo criterio que _regiForecastFilter):
   son estado de vista, se resetean al recargar. */
window._regiStatsFiltros = window._regiStatsFiltros || { meses: {}, estados: {} };
var _REGI_SIN_FECHA = '(sin fecha)';   // clave del bucket sin cierre estimado de HP

/* year*12 + (mes-1)  ->  'YYYY-MM'. Inverso de _regiMesOrdinal: sirve para
   pasar el promedio ponderado (fraccionario, se redondea) por _mesLabelPoly. */
function _regiOrdinalAMes(ord){
  var o = Math.max(0, Math.round(Number(ord) || 0));
  var y = Math.floor(o / 12), m = (o % 12) + 1;
  return y + '-' + (m < 10 ? '0' : '') + m;
}

/* Agrega N filas del pipeline real (todas con el mismo OPG) en un solo lado
   "Ceven". `monto`/`mesCierre` llevan los mismos nombres que una fila suelta,
   así _regiDiffMonto y compañía no se tocan.
   - `monto`: Σ de las filas ACTIVAS (estado ∉ {Perdido, Facturado}).
   - `montoFacturado`: Σ de las filas en estado Facturado (plata realizada). El
     comparador la usa cuando no hay ninguna activa, para no mostrar USD 0 en
     una venta ya cerrada (ver _regiCevenMontoComparacion).
   - `mesOrdinal`: promedio de meses de cierre PONDERADO POR MONTO sobre las
     filas activas con fecha (fraccionario a propósito); si Σpesos = 0 cae a
     promedio simple; null si ninguna activa tiene fecha. */
function _regiCevenAgg(rows){
  rows = rows || [];
  var monto = 0, montoTotal = 0, nActivas = 0, nExcluidas = 0;
  var montoFacturado = 0, nFacturadas = 0;
  var pesoFecha = 0, sumaPonderada = 0, sumaSimple = 0, nFecha = 0;
  rows.forEach(function(r){
    var m = Number(r.monto) || 0;
    montoTotal += m;
    var est = r.estado || 'Cotizado';
    if(_REGI_ESTADOS_EXCLUIDOS[est]){
      nExcluidas++;
      // Facturado se guarda aparte: es plata REALIZADA y se compara bien
      // contra el estimado de HP. Perdido no — ahí el 0 ES la información.
      if(est === 'Facturado'){ montoFacturado += m; nFacturadas++; }
      return;
    }
    nActivas++;
    monto += m;
    var ord = _regiMesOrdinal(r.mesCierre);
    if(ord !== null){
      nFecha++;
      sumaSimple += ord;
      pesoFecha += Math.max(m, 0);
      sumaPonderada += Math.max(m, 0) * ord;
    }
  });
  var mesOrdinal = null;
  if(nFecha > 0) mesOrdinal = pesoFecha > 0 ? (sumaPonderada / pesoFecha) : (sumaSimple / nFecha);

  var resumen = nActivas
    ? (nActivas + (nActivas === 1 ? ' cotización activa' : ' cotizaciones activas'))
    : 'sin cotización activa';
  if(nExcluidas) resumen += ' · ' + nExcluidas + ' sin contar (Perdido/Facturado)';

  return {
    monto: monto,
    montoTotal: montoTotal,
    montoFacturado: montoFacturado,
    nFacturadas: nFacturadas,
    mesOrdinal: mesOrdinal,
    mesCierre: mesOrdinal === null ? '' : _regiOrdinalAMes(mesOrdinal),
    nCotiz: rows.length,
    nActivas: nActivas,
    nExcluidas: nExcluidas,
    cliente: (rows[0] && rows[0].cliente) || '',
    proyecto: (rows[0] && rows[0].proyecto) || '',
    estadosResumen: resumen,
    rows: rows
  };
}

/* Monto Ceven que suma a "REGI CEVEN" del header: TODO lo linkeado que no esté
   Perdido — la posición viva (`.monto`, cotizaciones activas) MÁS lo ya
   facturado (`.montoFacturado`, plata realizada). Es distinto de
   `_regiCevenAgg().monto` a secas (solo la posición viva, que es lo que las
   Estadísticas comparan contra el estimado de HP): acá una venta ya cerrada
   sigue contando como monto Ceven real de ese REGI. */
function _regiCevenMontoKpi(ag){
  ag = ag || {};
  return (Number(ag.monto) || 0) + (Number(ag.montoFacturado) || 0);
}

/* [{hp, ceven}] — hp es la fila REGI (shape de _regiRowToPipeRow), ceven es la
   AGREGACIÓN (_regiCevenAgg) de todas las filas del pipeline real con ese OPG.
   Devuelve TODAS las vinculadas: el recorte por período/estado lo hacen los
   slicers de la vista (_regiStatsParPasa), no esta función. */
function _regiPairsVinculadas(){
  var vinculados = _regiOpgVinculadosSet();
  var pares = [];
  (window._regiPipeRows || []).forEach(function(hp){
    var codigo = _regiCodigoVinculo(hp);
    var filas = codigo && vinculados[codigo];
    if(filas && filas.length) pares.push({hp: hp, ceven: _regiCevenAgg(filas)});
  });
  return pares;
}

/* Monto del lado Ceven que entra en la comparación contra HP:
   - con posición viva (≥1 cotización activa) → esa suma (`ag.monto`), como siempre.
   - sin nada activo pero con cotización(es) FACTURADA(s) → lo facturado. Una
     venta cerrada es plata realizada y se compara bien contra el estimado de
     HP; mostrar 0 ahí se leía como "Ceven no cotizó" (bug reportado 09/2026).
   - solo perdidas / nada → 0 (el 0 ES la información: HP la sigue viendo viva).
   `.facturado` avisa al render que rotule el número como ya facturado. */
function _regiCevenMontoComparacion(ag){
  ag = ag || {};
  var activo = Number(ag.monto) || 0;
  var facturado = Number(ag.montoFacturado) || 0;
  if(!((ag.nActivas || 0) > 0) && facturado > 0) return { valor: facturado, facturado: true };
  return { valor: activo, facturado: false };
}

/* ceven − hp: negativo si Ceven pronostica/factura MENOS monto que HP.
   hp.montoArchivo (no hp.monto) es a propósito: `.monto` puede venir
   reemplazado por productos asignados dentro del carrito propio de REGI
   (feature del 25/08/2026) — mezclarlo confundiría "lo que HP dice" con "lo
   que Ceven ya armó adentro de REGI", que es justo la comparación que se
   quiere evitar. El lado Ceven sale de _regiCevenMontoComparacion (contempla
   las oportunidades ya facturadas). */
function _regiDiffMonto(par){
  return _regiCevenMontoComparacion(par.ceven || {}).valor - (Number(par.hp.montoArchivo) || 0);
}

// 'YYYY-MM' -> year*12 + (mes-1), para poder restar dos meses. null si no
// tiene forma de mes (fecha vacía o rota).
function _regiMesOrdinal(mk){
  var p = String(mk || '').split('-');
  if(p.length !== 2) return null;
  var y = parseInt(p[0], 10), m = parseInt(p[1], 10);
  if(!y || !m) return null;
  return y * 12 + (m - 1);
}

/* hp − ceven, en meses: negativo si el cierre estimado de Ceven es POSTERIOR
   al de HP (Ceven pronostica "más lejos"). null si falta la fecha de
   cualquiera de los dos lados — no hay con qué restar. */
function _regiDiffFechaMeses(par){
  var oh = _regiMesOrdinal(par.hp.mesCierre);
  // El lado Ceven puede ser una agregación de varias cotizaciones: usa el
  // ordinal fraccionario (promedio ponderado por monto) si viene calculado; si
  // no, cae a parsear el string 'YYYY-MM' (una sola fila, o los tests).
  var oc = (par.ceven && par.ceven.mesOrdinal != null)
    ? par.ceven.mesOrdinal
    : _regiMesOrdinal(par.ceven.mesCierre);
  if(oh === null || oc === null || oc === undefined) return null;
  return oh - oc;
}

// 'YYYY-MM' -> 'YYYY-Qn'. '' si no tiene forma de mes (mismo criterio que
// _regiMesOrdinal: sin esto, una fecha rota se agruparía con el trimestre 1
// de un año "NaN").
function _regiTrimestreKey(mk){
  var p = String(mk || '').split('-');
  if(p.length !== 2) return '';
  var m = parseInt(p[1], 10);
  if(!m) return '';
  return p[0] + '-Q' + (Math.floor((m - 1) / 3) + 1);
}
function _regiTrimestreLabel(qk){
  var p = String(qk || '').split('-Q');
  return p.length === 2 ? ('Q' + p[1] + ' ' + p[0]) : qk;
}

/* KPI totales sobre los pares YA filtrados por los slicers:
   - montoHp / montoCeven: Σ de cada lado (Ceven vía _regiCevenMontoComparacion).
   - diffMonto: montoCeven − montoHp (SUMA de las diferencias por par, idéntico).
   - diffFechaProm: PROMEDIO del desfasaje de cierre (sumar meses entre muchas
     oportunidades da un número ilegible); null si ninguna tiene fecha en ambos
     lados. */
function _regiKpisTotales(pares){
  var diffMonto = 0, montoHp = 0, montoCeven = 0, sumFecha = 0, nFecha = 0, nMulti = 0;
  pares.forEach(function(par){
    montoHp += Number(par.hp.montoArchivo) || 0;
    montoCeven += _regiCevenMontoComparacion(par.ceven || {}).valor || 0;
    diffMonto += _regiDiffMonto(par);
    var df = _regiDiffFechaMeses(par);
    if(df !== null){ sumFecha += df; nFecha++; }
    if(par.ceven && par.ceven.nCotiz > 1) nMulti++;
  });
  return {
    n: pares.length, diffMonto: diffMonto, montoHp: montoHp, montoCeven: montoCeven,
    diffFechaProm: nFecha ? (sumFecha / nFecha) : null, nFecha: nFecha, nMulti: nMulti
  };
}

/* ── Slicers de las Estadísticas ─────────────────────────────────────────────
   Período (mes / trimestre) y Estado de Ceven. Los valores disponibles salen
   de los propios pares vinculados; el estado de selección vive en
   window._regiStatsFiltros. */

// Clave de mes del par para agrupar/filtrar: 'YYYY-MM' o el sentinel sin fecha.
function _regiParMesKey(par){
  var mk = par && par.hp && par.hp.mesCierre;
  return (_regiMesOrdinal(mk) === null) ? _REGI_SIN_FECHA : String(mk);
}

// Estados de Ceven presentes en un par (uno por cotización vinculada).
function _regiParEstados(par){
  var out = {};
  (((par && par.ceven) || {}).rows || []).forEach(function(r){ out[r.estado || 'Cotizado'] = 1; });
  return Object.keys(out);
}

/* Meses y estados que ofrecen los slicers, ya ordenados: los meses cronológicos
   con "Sin fecha" al final; los estados por el ranking del embudo. */
function _regiStatsDimensiones(paresAll){
  var mesesSet = {}, estSet = {};
  paresAll.forEach(function(par){
    mesesSet[_regiParMesKey(par)] = 1;
    _regiParEstados(par).forEach(function(e){ estSet[e] = 1; });
  });
  var meses = Object.keys(mesesSet).sort(function(a, b){
    if(a === _REGI_SIN_FECHA) return 1;
    if(b === _REGI_SIN_FECHA) return -1;
    return a < b ? -1 : (a > b ? 1 : 0);
  });
  var estados = Object.keys(estSet).sort(function(a, b){
    var ra = (typeof cevenEstadoRank === 'function') ? cevenEstadoRank(a) : 0;
    var rb = (typeof cevenEstadoRank === 'function') ? cevenEstadoRank(b) : 0;
    return ra - rb;
  });
  return { meses: meses, estados: estados };
}

// ¿El par pasa los slicers activos? Sets vacíos = "todos".
function _regiStatsParPasa(par){
  var f = window._regiStatsFiltros || {};
  var mesesSel = Object.keys(f.meses || {}).filter(function(k){ return f.meses[k]; });
  var estSel = Object.keys(f.estados || {}).filter(function(k){ return f.estados[k]; });
  if(mesesSel.length && mesesSel.indexOf(_regiParMesKey(par)) === -1) return false;
  if(estSel.length){
    var ests = _regiParEstados(par);
    var hay = ests.some(function(e){ return estSel.indexOf(e) !== -1; });
    if(!hay) return false;
  }
  return true;
}

// ¿Hay algún slicer activo? (para mostrar "Limpiar" y avisar que es un subconjunto)
function _regiStatsHayFiltro(){
  var f = window._regiStatsFiltros || {};
  return Object.keys(f.meses || {}).some(function(k){ return f.meses[k]; })
      || Object.keys(f.estados || {}).some(function(k){ return f.estados[k]; });
}

// 'YYYY-MM' -> 'YYYY-Qn' de los meses presentes, para los chips de trimestre.
function _regiStatsTrimestresDe(meses){
  var out = [];
  meses.forEach(function(mk){
    if(mk === _REGI_SIN_FECHA) return;
    var q = _regiTrimestreKey(mk);
    if(q && out.indexOf(q) === -1) out.push(q);
  });
  return out.sort();
}

/* Barras agrupadas HP vs Ceven por mes, sobre los pares filtrados. Cada grupo:
   {key, label, hp, ceven, n}. "Sin fecha" queda al final. */
function _regiStatsChartData(paresView){
  var mapa = {};
  paresView.forEach(function(par){
    var k = _regiParMesKey(par);
    if(!mapa[k]) mapa[k] = { key: k, hp: 0, ceven: 0, n: 0 };
    mapa[k].hp += Number(par.hp.montoArchivo) || 0;
    mapa[k].ceven += _regiCevenMontoComparacion(par.ceven || {}).valor || 0;
    mapa[k].n++;
  });
  return Object.keys(mapa).sort(function(a, b){
    if(a === _REGI_SIN_FECHA) return 1;
    if(b === _REGI_SIN_FECHA) return -1;
    return a < b ? -1 : (a > b ? 1 : 0);
  }).map(function(k){
    var g = mapa[k];
    g.label = (k === _REGI_SIN_FECHA) ? 'Sin fecha' : _mesLabelPoly(k);
    return g;
  });
}

// Monto compacto para las etiquetas del gráfico: 1.2M / 340k / 900.
function _regiMoneyCorto(n){
  n = Number(n) || 0;
  var s = n < 0 ? '-' : '';
  var a = Math.abs(n);
  if(a >= 1e6) return s + (a / 1e6).toFixed(a >= 1e7 ? 0 : 1).replace(/\.0$/, '') + 'M';
  if(a >= 1e3) return s + Math.round(a / 1e3) + 'k';
  return s + Math.round(a);
}

/* Desfasaje de cierre en palabras (sin signos que haya que interpretar).
   diff = hp − ceven (meses): >0 Ceven cierra ANTES que HP, <0 DESPUÉS.
   Devuelve {txt, color}. */
function _regiFechaTxt(diff){
  if(diff === null || diff === undefined) return { txt: '—', color: '#1d1d1f' };
  var a = Math.abs(diff);
  if(a < 0.05) return { txt: 'en fecha', color: '#1d1d1f' };
  var meses = a.toFixed(1) + ' meses';
  return diff > 0
    ? { txt: meses + ' antes', color: '#15863a' }
    : { txt: meses + ' después', color: '#d70015' };
}

/* Agrupa por keyFn(hp.mesCierre) — "por mes" pasa la identidad, "por
   trimestre" pasa _regiTrimestreKey. El bucket "sin fecha" (HP sin
   close_date) se arma con una clave que ordena SIEMPRE al final: un
   ordenamiento alfabético normal lo pondría primero (unos paréntesis
   ordenan antes que un dígito) y ahí se leería como si fuera lo más
   próximo, exactamente al revés de lo que es. */
function _regiAgregarPorPeriodo(pares, keyFn, labelFn){
  // String.fromCharCode(0xFFFF), no el literal: un noncharacter Unicode
  // pegado a mano en el fuente es frágil entre editores/encodings.
  var SIN_FECHA = String.fromCharCode(0xFFFF) + '-sin-fecha';
  var mapa = {};
  pares.forEach(function(par){
    var k = keyFn(par.hp.mesCierre) || SIN_FECHA;
    if(!mapa[k]) mapa[k] = { key: k, n: 0, diffMonto: 0, sumFecha: 0, nFecha: 0 };
    var g = mapa[k];
    g.n++;
    g.diffMonto += _regiDiffMonto(par);
    var df = _regiDiffFechaMeses(par);
    if(df !== null){ g.sumFecha += df; g.nFecha++; }
  });
  return Object.keys(mapa).sort().map(function(k){
    var g = mapa[k];
    g.label = (k === SIN_FECHA) ? 'Sin fecha (HP)' : labelFn(k);
    g.diffFechaProm = g.nFecha ? (g.sumFecha / g.nFecha) : null;
    return g;
  });
}

/* ── Mostrar/ocultar según la vista ──────────────────────────────────────
   Un solo punto de control, llamado desde renderPipeline() en CADA render
   (cambie o no la vista): así "Pipeline actual" y los meses archivados
   siempre quedan con todo visible, sin tener que acordarse de restaurarlo
   en cada lugar que sale de la vista REGI.

   El refetch (invalidar window._regiPipeRows) pasa SOLO en la transición
   false->true, no en cada render: si no, escribir en el buscador mientras
   se está en la vista REGI dispararía un pedido a Supabase por letra. */
/* Recibe el VALOR del selector "Vista" ('', '__regi' o un mes archivado).
   Estadísticas ya NO pasa por acá: es una vista propia del navbar
   (p-regi-stats, la pinta renderRegiStats). Sigue siendo el ÚNICO lugar que
   decide qué se ve DENTRO de #p-pipeline, llamado desde renderPipeline() en
   CADA render. */
function cevenRegiToggleVista(vista){
  var esRegi = (vista === '__regi');
  var usaDatosRegi = esRegi;   // consume window._regiPipeRows

  var eraActiva = !!window._regiVistaWasActive;
  window._regiVistaWasActive = usaDatosRegi;
  if(usaDatosRegi && !eraActiva) window._regiPipeRows = null;

  var tNormal = document.getElementById('pipe-table-normal');
  var tRegi = document.getElementById('pipe-table-regi');
  if(tNormal) tNormal.style.display = usaDatosRegi ? 'none' : '';
  if(tRegi) tRegi.style.display = esRegi ? '' : 'none';

  var execWrap = document.getElementById('pipe-exec-wrap');
  var statusWrap = document.getElementById('pipe-status-wrap');
  if(execWrap) execWrap.style.display = usaDatosRegi ? 'none' : '';
  if(statusWrap) statusWrap.style.display = usaDatosRegi ? 'none' : '';

  // "Mostrar vinculadas" y "Solo perdidas": solo existen EN la tabla REGI.
  var vincWrap = document.getElementById('regi-vinc-wrap');
  if(vincWrap) vincWrap.style.display = esRegi ? '' : 'none';
  var perdWrap = document.getElementById('regi-perd-wrap');
  if(perdWrap) perdWrap.style.display = esRegi ? '' : 'none';

  // Facturado y Forecast del mes no tienen equivalente en REGI: no hay
  // "facturado" en una oportunidad que todavía es de un partner, y el monto
  // único de la fila ya reemplaza la necesidad de un segundo KPI separado. El
  // pipeline normal y el archivo sí usan las dos tarjetas — quedan visibles ahí.
  var facturadoCard = document.getElementById('dash-facturado-card');
  var proyCard = document.getElementById('dash-proy-card');
  if(facturadoCard) facturadoCard.style.display = usaDatosRegi ? 'none' : '';
  if(proyCard) proyCard.style.display = usaDatosRegi ? 'none' : '';
  /* "Monto REGI vinculados" se fue de la grilla de KPI al header (04/09/2026,
     junto con "Monto total REGI" — ver el comentario grande sobre
     _regiEnsureHeaderKpis): es un KPI global que no cambia con los filtros,
     y ahora vive chico y siempre visible ahí, no solo adentro de esta vista.
     La tarjeta sigue en el HTML (display:none por default) para no tocar el
     layout de la grilla, mismo criterio que "Monto REGI perdidos" de acá abajo. */
  var vincCard = document.getElementById('dash-regi-vinculados-card');
  if(vincCard) vincCard.style.display = 'none';
  /* "Monto REGI perdidos" no se muestra más en ninguna vista: contaba las
     filas con forecast 'Perdido', que solo existía como override a mano y se
     fue el 03/09/2026. La tarjeta sigue en el HTML (display:none por
     default) para no tocar el layout de la grilla de KPI. */
  var perdCard = document.getElementById('dash-regi-perdidos-card');
  if(perdCard) perdCard.style.display = 'none';

  // exportPipeline() arma el Excel con las columnas del pipeline normal
  // (fecha/ejecutivo/OPG/factura...): no sabe leer una fila de REGI.
  var exportBtn = document.getElementById('pipe-export-btn');
  if(exportBtn) exportBtn.style.display = usaDatosRegi ? 'none' : '';

  // Los dos montos globales del header (arriba de todo, al lado del título)
  // se pintan acá y no en _regiPintarDashboard: esta función corre en CADA
  // renderPipeline() sin importar la vista, así que quedan al día se esté
  // mirando el pipeline normal, REGI o un mes archivado.
  if(typeof _regiEnsureHeaderKpis === 'function') _regiEnsureHeaderKpis();
}

/* ── Importar el Excel ────────────────────────────────────────────────── */

function handleRegiPipelineFile(f){
  if(!f) return;
  if(!cevenCanUsePipeline()){ showToast('Tu rol no permite importar el pipeline REGI.'); return; }
  var r = new FileReader();
  r.onload = function(e){
    try{
      var wb = XLSX.read(new Uint8Array(e.target.result), {type:'array'});
      var filas = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], {defval:''});
      _procesarRegiPipelineExcel(filas);
    }catch(er){ showErr('Error Excel: ' + er.message); }
  };
  r.readAsArrayBuffer(f);
}

/* OPD es la clave real (no REGI: el Deal Registration puede no estar
   aprobado todavía, y varias filas del archivo real vienen con REGI vacío).
   Se descartan las filas sin OPD/Opportunity/Account: son basura de pie de
   página, mismo criterio que _pareceDeals()/handlePL() con el BOM
   Calculator. */
function _procesarRegiPipelineExcel(filas){
  var ts = new Date().toISOString();
  var quien = (typeof cevenSessionUser === 'function') ? (cevenSessionUser() || null) : null;
  var rows = [];
  (filas || []).forEach(function(f){
    var opd = String(f['OPD'] == null ? '' : f['OPD']).trim();
    var opportunity = String(f['Opportunity'] == null ? '' : f['Opportunity']).trim();
    var account = String(f['Account'] == null ? '' : f['Account']).trim();
    if(!opd || !opportunity || !account) return;
    rows.push({
      opd: opd,
      regi: String(f['REGI'] == null ? '' : f['REGI']).trim() || null,
      dr_expiration: cevenDealFechaISO(f['DR Expiration']) || null,
      opportunity: opportunity,
      forecast: String(f['Forecast'] == null ? '' : f['Forecast']).trim() || null,
      account: account,
      primary_partner: String(f['Primary Partner'] == null ? '' : f['Primary Partner']).trim() || null,
      amount: Number(f['Amount']) || 0,
      close_date: cevenDealFechaISO(f['Close Date']) || null,
      imported_at: ts,
      imported_by: quien
    });
  });
  if(!rows.length){
    showErr('El Excel no tiene filas reconocibles (se esperan, entre otras, las columnas OPD, Opportunity y Account).');
    return;
  }

  cevenAuthedFetch(_cevenRegiPipeRest('poly_regi_pipeline'), {
    method: 'POST',
    headers: {Prefer: 'resolution=merge-duplicates,return=minimal'},
    body: JSON.stringify(rows)
  }).then(function(){
    // Reemplazo: todo lo que no se tocó en ESTA importación (imported_at
    // más viejo que `ts`) es una oportunidad que ya no está en el Excel.
    return cevenAuthedFetch(_cevenRegiPipeRest('poly_regi_pipeline') + '?imported_at=lt.' + encodeURIComponent(ts), {method: 'DELETE'});
  }).then(function(){
    window._regiPipeRows = null;
    var sel = document.getElementById('archive-month-sel');
    if(sel) sel.value = '__regi';
    if(typeof renderPipeline === 'function') renderPipeline();
    showToast('✓ Pipeline REGI actualizado: ' + rows.length + ' oportunidad' + (rows.length === 1 ? '' : 'es') + '.');
  }).catch(function(e){
    showErr('No se pudo importar el pipeline REGI: ' + ((e && e.message) || 'error desconocido'));
  });
}

/* ── Traer los datos ──────────────────────────────────────────────────── */

/* Una fila del Excel de HP, tal cual. Todo lo que se lee acá sale del
   archivo: no hay ningún campo que Ceven pueda pisar a mano. */
function _regiRowToPipeRow(r){
  var montoArchivo = Number(r.amount) || 0;
  return {
    opd: r.opd, regi: r.regi || '',
    // Commit / Pipeline / Upside, lo que diga el archivo. Ya no hay override.
    forecast: r.forecast || '',
    proyecto: r.opportunity || '', primaryPartner: r.primary_partner || '',
    drExpiration: r.dr_expiration || '',
    // cliente/monto/mesCierre: mismos nombres que una fila real, a propósito
    // (ver el comentario del encabezado) — así cevenPipeGroupBy() y
    // compañía las agrupan/ordenan sin que se las toque.
    cliente: r.account || '',
    // Los dos son el mismo número desde que la vista volvió a ser una foto.
    // `monto` es el que lee la UI compartida; `montoArchivo` es el nombre
    // que usan las Estadísticas para decir "esto lo dice HP".
    montoArchivo: montoArchivo,
    monto: montoArchivo,
    mesCierre: r.close_date ? String(r.close_date).slice(0, 7) : '',
    // Checkbox "Perdida" de la tabla (04/09/2026) — ver _regiMarcarPerdida.
    // Único uso que le queda a forecast_override: NO revive el <select> de
    // Commit/Pipeline/Upside que se fue el 03/09/2026, solo este booleano.
    perdidaManual: r.forecast_override === 'Perdido'
  };
}

function _cevenRegiPipeFetch(){
  /* Con los KPI globales ahora pintándose en el header de TODAS las vistas
     del pipeline (_regiEnsureHeaderKpis), esta función puede pedirse dos
     veces en paralelo apenas se abre "🎯 Pipeline" por primera vez: una desde
     ahí y otra desde renderRegiPipeline(). El in-flight promise evita el GET
     duplicado — la segunda llamada recibe el mismo resultado que la primera. */
  if(window._regiPipeFetchPromise) return window._regiPipeFetchPromise;
  /* Un solo GET. `perdido_motivo` y la tabla `poly_regi_pipeline_productos`
     siguen existiendo en la base con sus datos pero esta vista no las lee
     (ver el comentario de cabecera) — `forecast_override` sí, desde el
     04/09/2026: es donde vive el checkbox "Perdida" (ver _regiMarcarPerdida
     y el comentario grande sobre _regiEnsureHeaderKpis). No revive el resto
     de la edición vieja: acá SOLO se usa el valor 'Perdido' de esa columna,
     nunca 'Commit'/'Pipeline'/'Upside' — el Forecast sigue siendo 100% del
     Excel, sin pastilla editable. */
  var url = _cevenRegiPipeRest('poly_regi_pipeline')
    + '?select=opd,regi,dr_expiration,opportunity,forecast,account,primary_partner,amount,close_date,forecast_override'
    + '&order=amount.desc';
  window._regiPipeFetchPromise = cevenAuthedFetch(url, {method: 'GET'}).then(function(res){
    window._regiPipeFetchPromise = null;
    window._regiPipeRows = (Array.isArray(res) ? res : []).map(_regiRowToPipeRow);
    return window._regiPipeRows;
  }, function(err){
    window._regiPipeFetchPromise = null;
    throw err;
  });
  return window._regiPipeFetchPromise;
}

/* ── KPI globales de REGI en el header (04/09/2026, ampliado el mismo día) ──
   Cuatro números fijos, que NO se mueven con ningún filtro (ver el
   comentario de _regiPintarDashboard más abajo):
     · Monto total REGI      — el Amount crudo de TODO el Excel de HP.
     · REGI vinculados       — de eso, lo que Ceven ya "tiene contemplado":
       o hay una cotización real con el mismo OPG (activa o Perdida), o Ceven
       la declaró perdida a mano sin llegar a cargarla (checkbox "Perdida" en
       la tabla). Usa el monto que DECLARA HP (montoArchivo), no el de Ceven
       — el objetivo es que este número llegue a IGUALAR "Monto total REGI":
       ahí se sabe que no se está perdiendo de vista nada de lo que ve HP.
     · REGI CEVEN (celeste)  — de las vinculadas por un link REAL, el monto
       Ceven real de TODAS sus cotizaciones que NO estén Perdidas: la posición
       viva más lo ya facturado (una venta cerrada sigue siendo monto Ceven de
       ese REGI). Ver _regiCevenMontoKpi. Antes sacaba también las Facturadas
       (era la "posición viva" a secas) — se corrigió el 10/09/2026 a pedido
       del jefe.
     · REGIs perdidas        — el Amount de HP de lo que se da por perdido:
       la cotización real que existía pasó a 'Perdido' en el pipeline (todos
       sus links, ninguno activo ni Facturado), o Ceven la marcó perdida a
       mano sin cotización real atrás.
   Los cuatro vivían como tarjetas grandes en la grilla de KPI, solo visibles
   adentro de 🎯 Pipeline REGI; ahora viven chicos en el header de la barra de
   arriba, visibles en TODAS las vistas de este pipeline (normal, REGI,
   Estadísticas, mes archivado) — el mismo lugar fijo donde antes estaban
   "← Volver" y "+ Nueva cotización". */

// {totalExcel, vinculadosHP, vinculadosCeven, perdidas} a partir de TODAS las
// filas de REGI (sin filtrar). Si `rowsTotal` ya trae `.linkReal`/
// `.montoVinculado`/`.perdidaCeven` calculados (_renderRegiPipelineFromCache
// los pone en cada fila antes de llamar acá), se reusan tal cual; si no
// —porque todavía no se entró nunca a 🎯 Pipeline REGI esta sesión—, se
// calculan acá mismo contra el pipeline real actual. `.perdidaManual` sale
// directo del Excel (columna forecast_override), así que siempre está.
function _regiTotalesGlobales(rowsTotal){
  var vinculados = null;
  var totalExcel = 0, vinculadosHP = 0, vinculadosCeven = 0, perdidas = 0;
  (rowsTotal || []).forEach(function(r){
    var montoArchivo = Number(r.montoArchivo) || 0;
    totalExcel += montoArchivo;

    var linkReal = r.linkReal, montoVinc = r.montoVinculado, perdidaCeven = r.perdidaCeven;
    if(linkReal === undefined){
      if(!vinculados) vinculados = _regiOpgVinculadosSet();
      var filasReales = vinculados[_regiCodigoVinculo(r)] || null;
      linkReal = !!(filasReales && filasReales.length);
      montoVinc = linkReal ? _regiCevenMontoKpi(_regiCevenAgg(filasReales)) : 0;
      perdidaCeven = !!(linkReal && filasReales.every(function(f){ return (f.estado || 'Cotizado') === 'Perdido'; }));
    }
    var perdidaManual = !!r.perdidaManual;

    // "Vinculada" en sentido amplio: contabilizada por HP, sea por un link
    // real (activo o ya perdido) o porque Ceven la declaró perdida a mano.
    if(linkReal || perdidaManual) vinculadosHP += montoArchivo;
    if(linkReal) vinculadosCeven += Number(montoVinc) || 0;
    if(perdidaCeven || perdidaManual) perdidas += montoArchivo;
  });
  return {totalExcel: totalExcel, vinculadosHP: vinculadosHP, vinculadosCeven: vinculadosCeven, perdidas: perdidas};
}

function _regiPintarHeaderKpis(t){
  var elTot = document.getElementById('hdr-regi-total');
  var elVin = document.getElementById('hdr-regi-vinc');
  var elCev = document.getElementById('hdr-regi-ceven');
  var elPerd = document.getElementById('hdr-regi-perdidas');
  if(elTot) elTot.textContent = 'USD ' + fI(t.totalExcel);
  if(elVin) elVin.textContent = 'USD ' + fI(t.vinculadosHP);
  if(elCev) elCev.textContent = 'USD ' + fI(t.vinculadosCeven);
  if(elPerd) elPerd.textContent = 'USD ' + fI(t.perdidas);
}

/* Punto de entrada único, llamado en CADA renderPipeline() sin importar la
   vista activa (ver el final de cevenRegiToggleVista). Si el Excel de REGI
   ya se pidió esta sesión, pinta directo con lo que hay en memoria — sin
   fetch, sin esperar. Si todavía no, lo trae en soft-fetch (no bloquea el
   render de la vista que sí se está mirando) y se repinta sola cuando llega;
   si falla (sin conexión, sin pipeline REGI importado todavía) los montos
   quedan en USD 0 sin reventar el resto del pipeline. */
function _regiEnsureHeaderKpis(){
  var hayAlgunHeader = document.getElementById('hdr-regi-total') || document.getElementById('hdr-regi-vinc')
    || document.getElementById('hdr-regi-ceven') || document.getElementById('hdr-regi-perdidas');
  if(!hayAlgunHeader) return;
  _regiBindHeaderKpiDrill();
  if(window._regiPipeRows){
    _regiPintarHeaderKpis(_regiTotalesGlobales(window._regiPipeRows));
    return;
  }
  _cevenRegiPipeFetch().then(function(){ _regiEnsureHeaderKpis(); }, function(){ /* sin datos: se deja en USD 0 */ });
}

/* ── Drill-down de los KPI del header (10/09/2026) ─────────────────────────
   Los tres carteles de la derecha (REGI vinculados / REGI CEVEN / REGIs
   perdidas) abren un modal con las OPORTUNIDADES REGI que componen ese número
   y, adentro de cada una, sus COTIZACIONES de Ceven (clickeables para abrir la
   cotización). Sin fetch nuevo: usa lo que ya está en memoria
   (window._regiPipeRows + getPipeline()). */

// {vinc, ceven, perd} — por bucket, un item por oportunidad REGI:
// { hp, filas, montoHP, montoCeven, via }. MISMO criterio de clasificación que
// _regiTotalesGlobales: si se toca uno, tocar el otro (hay un test de
// reconciliación en scripts/check-pipe-regi-stats.js).
//   · vinc  → linkReal || perdidaManual        (aporta montoHP al KPI)
//   · ceven → linkReal                         (aporta montoCeven = _regiCevenMontoKpi)
//   · perd  → perdidaCeven || perdidaManual    (aporta montoHP; via: 'manual'|'ceven'|'ambas')
// `filas` es SIEMPRE la lista de cotizaciones reales con ese OPG (puede ser []).
function _regiComposicionKpis(rowsTotal){
  var vinculados = _regiOpgVinculadosSet();
  var vinc = [], ceven = [], perd = [];
  (rowsTotal || []).forEach(function(r){
    var montoHP = Number(r.montoArchivo) || 0;
    var filas = vinculados[_regiCodigoVinculo(r)] || [];
    var linkReal = filas.length > 0;
    var perdidaManual = !!r.perdidaManual;
    var perdidaCeven = linkReal && filas.every(function(f){ return (f.estado || 'Cotizado') === 'Perdido'; });
    var montoCeven = linkReal ? _regiCevenMontoKpi(_regiCevenAgg(filas)) : 0;
    var item = { hp: r, filas: filas, montoHP: montoHP, montoCeven: montoCeven };
    if(linkReal || perdidaManual) vinc.push(item);
    if(linkReal) ceven.push(item);
    if(perdidaCeven || perdidaManual){
      perd.push(Object.assign({}, item, {
        via: (perdidaCeven && perdidaManual) ? 'ambas' : (perdidaManual ? 'manual' : 'ceven')
      }));
    }
  });
  vinc.sort(function(a, b){ return b.montoHP - a.montoHP; });
  ceven.sort(function(a, b){ return b.montoCeven - a.montoCeven; });
  perd.sort(function(a, b){ return b.montoHP - a.montoHP; });
  return { vinc: vinc, ceven: ceven, perd: perd };
}

// Metadatos por cartel: qué campo suma, qué estados atenuar en el desglose,
// color del total y textos.
var _REGI_DRILL_META = {
  vinc: {
    titulo: 'REGI vinculados', color: 'var(--cgreen)', campo: 'montoHP',
    excluir: _REGI_ESTADOS_EXCLUIDOS,
    sub: 'Monto que declara HP de cada oportunidad ya contemplada: hay un link real (activo o perdido) o Ceven la declaró perdida a mano.',
    vacio: 'Ninguna oportunidad de REGI está vinculada ni declarada perdida todavía.'
  },
  ceven: {
    titulo: 'REGI CEVEN', color: 'var(--cblue)', campo: 'montoCeven',
    excluir: { Perdido: 1 },
    sub: 'Monto de Ceven real de las cotizaciones con REGI linkeado, sin las Perdidas (posición viva + facturado).',
    vacio: 'Ninguna oportunidad de REGI tiene todavía una cotización real de Ceven.'
  },
  perd: {
    titulo: 'REGIs perdidas', color: 'var(--cred)', campo: 'montoHP',
    excluir: _REGI_ESTADOS_EXCLUIDOS,
    sub: 'Monto que declara HP de las oportunidades dadas por perdidas: switch "Perdida" a mano, o link real con todas sus cotizaciones en Perdido.',
    vacio: 'Ninguna oportunidad de REGI está declarada perdida.'
  }
};

// Estado del modal abierto (null = cerrado). `abiertos` es {opd: bool}.
var _regiDrillState = null;

function _regiDrilldownKpiAbrir(kpi){
  if(!_REGI_DRILL_META[kpi]) return;
  _regiDrillState = { kpi: kpi, abiertos: {}, comp: null, cargando: !window._regiPipeRows, error: false };
  _regiDrilldownPaint();
  if(_regiDrillState.cargando){
    _cevenRegiPipeFetch().then(function(){
      if(!_regiDrillState || _regiDrillState.kpi !== kpi) return;
      _regiDrillState.cargando = false;
      _regiDrillState.comp = _regiComposicionKpis(window._regiPipeRows || []);
      _regiDrilldownPaint();
    }, function(){
      if(!_regiDrillState || _regiDrillState.kpi !== kpi) return;
      _regiDrillState.cargando = false; _regiDrillState.error = true;
      _regiDrilldownPaint();
    });
  } else {
    _regiDrillState.comp = _regiComposicionKpis(window._regiPipeRows || []);
    _regiDrilldownPaint();
  }
}

function _regiDrilldownCerrar(){
  _regiDrillState = null;
  var w = document.getElementById('regi-kpi-drill-modal');
  if(w && w.parentNode) w.parentNode.removeChild(w);
}

function _regiDrilldownPaint(){
  var s = _regiDrillState;
  if(!s) return;
  var wrap = document.getElementById('regi-kpi-drill-modal');
  if(!wrap){
    wrap = document.createElement('div');
    wrap.id = 'regi-kpi-drill-modal';
    wrap.style.cssText = 'position:fixed;inset:0;z-index:100000;background:rgba(0,0,0,.4);'
      + 'display:flex;align-items:flex-start;justify-content:center;padding:5vh 16px;overflow:auto;'
      + 'font-family:-apple-system,BlinkMacSystemFont,sans-serif';
    wrap.addEventListener('click', _regiDrilldownClick);
    document.body.appendChild(wrap);
  }
  wrap.innerHTML = _regiDrilldownHTML(s);
}

function _regiDrilldownClick(ev){
  var wrap = ev.currentTarget;
  if(ev.target === wrap){ _regiDrilldownCerrar(); return; }
  var el = cevenActEl(ev, wrap);
  if(!el) return;
  var act = el.getAttribute('data-act');
  var s = _regiDrillState;
  if(act === 'regi-drill-cerrar'){
    _regiDrilldownCerrar();
  } else if(act === 'regi-drill-openq'){
    var qn = el.getAttribute('data-qn');
    _regiDrilldownCerrar();
    if(typeof openPipelineQuote === 'function') openPipelineQuote(qn);
  } else if(act === 'regi-drill-grp' && s){
    var opd = el.getAttribute('data-opd');
    s.abiertos[opd] = !s.abiertos[opd];
    _regiDrilldownPaint();
  } else if(act === 'regi-drill-todas' && s && s.comp){
    var abrir = el.getAttribute('data-modo') === 'abrir';
    (s.comp[s.kpi] || []).forEach(function(it){ s.abiertos[it.hp.opd] = abrir; });
    _regiDrilldownPaint();
  }
}

function _regiDrilldownHTML(s){
  var meta = _REGI_DRILL_META[s.kpi];
  var card = 'background:var(--c1);border:0.5px solid var(--cb);border-radius:16px;width:760px;max-width:100%;'
    + 'box-shadow:0 12px 44px rgba(0,0,0,.22);display:flex;flex-direction:column;max-height:88vh';

  if(s.cargando || s.error){
    return '<div style="' + card + '">'
      + '<div style="padding:16px 20px;border-bottom:0.5px solid var(--cb);font-size:11px;font-weight:700;'
        + 'text-transform:uppercase;letter-spacing:.5px;color:var(--ct2)">' + cevenEsc(meta.titulo) + '</div>'
      + '<div style="padding:44px 20px;text-align:center;color:' + (s.error ? 'var(--cred)' : 'var(--ct2)') + '">'
        + (s.error ? 'No se pudo cargar el pipeline REGI.' : 'Cargando…') + '</div>'
      + _regiDrilldownFooterHTML('') + '</div>';
  }

  var items = (s.comp && s.comp[s.kpi]) || [];
  var total = items.reduce(function(a, it){ return a + (Number(it[meta.campo]) || 0); }, 0);
  var algunoAbierto = items.some(function(it){ return s.abiertos[it.hp.opd]; });

  var head = '<div style="padding:16px 20px;border-bottom:0.5px solid var(--cb)">'
    + '<div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--ct2)">' + cevenEsc(meta.titulo) + '</div>'
    + '<div style="display:flex;align-items:baseline;gap:10px;margin-top:5px">'
      + '<strong style="font-size:24px;color:' + meta.color + '">USD ' + fI(total) + '</strong>'
      + '<span style="font-size:12px;color:var(--ct2)">' + items.length + (items.length === 1 ? ' oportunidad' : ' oportunidades') + '</span>'
    + '</div>'
    + '<div style="font-size:11px;color:var(--ct2);margin-top:6px;line-height:1.45">' + cevenEsc(meta.sub) + '</div>'
  + '</div>';

  var body = items.length
    ? items.map(function(it){ return _regiDrilldownBloqueHTML(it, s, meta); }).join('')
    : '<div style="padding:40px 20px;text-align:center;color:var(--ct2)">' + cevenEsc(meta.vacio) + '</div>';

  var footLeft = items.length
    ? '<button type="button" data-act="regi-drill-todas" data-modo="' + (algunoAbierto ? 'cerrar' : 'abrir') + '" '
      + 'style="border:none;background:none;color:var(--cblue);font-size:12px;cursor:pointer;font-family:inherit;text-decoration:underline">'
      + (algunoAbierto ? 'Colapsar todas' : 'Expandir todas') + '</button>'
    : '';

  return '<div style="' + card + '">'
    + head
    + '<div style="overflow:auto;padding:4px 10px;flex:1">' + body + '</div>'
    + _regiDrilldownFooterHTML(footLeft)
  + '</div>';
}

function _regiDrilldownFooterHTML(left){
  return '<div style="padding:12px 20px;border-top:0.5px solid var(--cb);display:flex;justify-content:space-between;align-items:center;gap:12px">'
    + '<span>' + (left || '') + '</span>'
    + '<button type="button" data-act="regi-drill-cerrar" style="border:0.5px solid var(--cb);border-radius:980px;'
      + 'padding:8px 18px;font-size:13px;font-weight:600;cursor:pointer;background:var(--c1);color:var(--ct1);font-family:inherit">Cerrar</button>'
  + '</div>';
}

function _regiDrilldownBloqueHTML(it, s, meta){
  var r = it.hp;
  var abierto = !!s.abiertos[r.opd];
  var filas = it.filas || [];
  var linkReal = filas.length > 0;
  var todasPerdidas = linkReal && filas.every(function(f){ return (f.estado || 'Cotizado') === 'Perdido'; });

  var pillCss = 'border-radius:980px;padding:2px 9px;font-size:10px;font-weight:700;white-space:nowrap;flex-shrink:0';
  var pill = todasPerdidas
    ? '<span style="background:#fde8e6;color:#d70015;' + pillCss + '">✕ Perdida</span>'
    : (linkReal
      ? '<span style="background:#e6f7ec;color:#15863a;' + pillCss + '">✓ Vinculada</span>'
      : '<span style="background:#fde8e6;color:#d70015;' + pillCss + '">✕ Perdida (declarada)</span>');

  var codigo = cevenEsc(r.opd || '—') + (r.regi ? ' · ' + cevenEsc(r.regi) : '');
  var monto = Number(it[meta.campo]) || 0;

  var head = '<div data-act="regi-drill-grp" data-opd="' + cevenEsc(r.opd) + '" '
    + 'style="display:flex;align-items:center;gap:10px;padding:10px 8px;cursor:pointer">'
    + '<span style="font-size:11px;width:12px;flex-shrink:0;color:var(--ct2)">' + (abierto ? '▼' : '▶') + '</span>'
    + '<div style="min-width:0;flex:1">'
      + '<div style="font-size:11px;font-family:ui-monospace,Menlo,monospace;color:var(--ct2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="' + codigo + '">' + codigo + '</div>'
      + '<div style="font-size:13px;color:var(--ct1);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + cevenEsc(r.proyecto || '—') + '</div>'
      + '<div style="font-size:11px;color:var(--ct2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + cevenEsc(r.cliente || '—') + '</div>'
    + '</div>'
    + pill
    + '<strong style="font-size:13px;white-space:nowrap;flex-shrink:0">USD ' + fI(monto) + '</strong>'
  + '</div>';

  var detalle = '';
  if(abierto){
    detalle = linkReal
      ? '<div style="padding:0 8px 12px 30px">'
          + _regiStatsDesgloseHTML(_regiCevenAgg(filas), { linkQuotes: true, excluir: meta.excluir })
        + '</div>'
      : '<div style="padding:2px 8px 12px 30px;font-size:12px;color:var(--ct2)">'
          + 'Sin cotización real de Ceven — se declaró perdida a mano con el switch "Perdida" de la tabla REGI.</div>';
  }
  return '<div style="border-bottom:0.5px solid var(--cb2)">' + head + detalle + '</div>';
}

/* Ata el click/teclado de los tres carteles clickeables del header
   (#regi-hdr-kpis, static en el HTML) y el Esc que cierra el modal. Idempotente
   (cevenDelegate + flag propio): _regiEnsureHeaderKpis corre en cada render. */
function _regiBindHeaderKpiDrill(){
  cevenDelegate('regi-hdr-kpis', 'click', _regiHdrKpiActivar);
  cevenDelegate('regi-hdr-kpis', 'keydown', _regiHdrKpiKeydown);
  if(!window._regiDrillEscBound){
    window._regiDrillEscBound = true;
    document.addEventListener('keydown', function(ev){
      if(ev.key === 'Escape' && document.getElementById('regi-kpi-drill-modal')) _regiDrilldownCerrar();
    });
  }
}

function _regiHdrKpiActivar(ev){
  var el = cevenActEl(ev, ev.currentTarget);
  if(el && el.getAttribute('data-act') === 'regi-kpi-drill') _regiDrilldownKpiAbrir(el.getAttribute('data-kpi'));
}

function _regiHdrKpiKeydown(ev){
  if(ev.key !== 'Enter' && ev.key !== ' ' && ev.key !== 'Spacebar') return;
  var el = cevenActEl(ev, ev.currentTarget);
  if(el && el.getAttribute('data-act') === 'regi-kpi-drill'){
    ev.preventDefault();
    _regiDrilldownKpiAbrir(el.getAttribute('data-kpi'));
  }
}

/* ── Render ───────────────────────────────────────────────────────────── */

function renderRegiPipeline(){
  if(window._regiPipeRows === null){
    var body = document.getElementById('regi-pipe-body');
    if(body) body.innerHTML = '<tr><td colspan="10" style="text-align:center;color:#aeaeb2;padding:24px">Cargando…</td></tr>';
    var dash = document.getElementById('pipe-dashboard');
    if(dash) dash.style.display = 'none';
    _cevenRegiPipeFetch().then(function(){
      // Si mientras tanto se cambió de vista, no pisa lo que se esté viendo.
      var sel = document.getElementById('archive-month-sel');
      if(sel && sel.value === '__regi') _renderRegiPipelineFromCache();
    }).catch(function(e){
      var b = document.getElementById('regi-pipe-body');
      if(b) b.innerHTML = '<tr><td colspan="10" style="text-align:center;color:#d70015;padding:24px">No se pudo cargar el pipeline REGI'
        + ((e && e.message) ? (': ' + cevenEsc(e.message)) : '.') + '</td></tr>';
    });
    return;
  }
  _renderRegiPipelineFromCache();
}

function _renderRegiPipelineFromCache(){
  var rowsTotal = window._regiPipeRows || [];

  // Se recalcula EN CADA render (no al traer del Excel): getPipeline() puede
  // haber cambiado desde el último render de esta vista —por ejemplo, se
  // vinculó un proyecto con "✎" en el pipeline real y se volvió acá— sin que
  // haga falta reimportar ni volver a pedirle nada a Supabase.
  var vinculados = _regiOpgVinculadosSet();
  rowsTotal.forEach(function(r){
    var filasReales = vinculados[_regiCodigoVinculo(r)] || null;
    // `linkReal`: hay al menos una cotización real de Ceven con este OPG,
    // sea cual sea su estado. Es el vínculo de verdad (matching por código);
    // no confundir con `vinculada` de acá abajo, que es más ancho.
    r.linkReal = !!(filasReales && filasReales.length);
    // Monto Ceven real de TODAS las cotizaciones de este OPG que no estén
    // Perdidas: posición viva + facturado (ver _regiCevenMontoKpi). Es lo que
    // muestra el KPI celeste "REGI CEVEN" del header — mismo criterio que
    // _regiTotalesGlobales, que reusa este valor cuando la fila viene
    // enriquecida.
    r.montoVinculado = r.linkReal ? _regiCevenMontoKpi(_regiCevenAgg(filasReales)) : 0;
    // Perdida por el lado de Ceven: hubo vínculo real, pero TODAS las
    // cotizaciones que lo forman están en 'Perdido' — ninguna activa, ninguna
    // Facturado. El vínculo existió y no prosperó.
    r.perdidaCeven = !!(r.linkReal && filasReales.every(function(f){ return (f.estado || 'Cotizado') === 'Perdido'; }));
    // "Vinculada", en el sentido amplio que pide el jefe (04/09/2026):
    // contabilizada por HP, sea por un link real (activo o ya perdido) o
    // porque Ceven la declaró perdida a mano con el checkbox de la tabla
    // (`perdidaManual`, viene del Excel — ver _regiRowToPipeRow) sin llegar
    // a cargar una cotización real. El objetivo es que sumando esto se
    // llegue a TODO "Monto total REGI": nada de lo que ve HP queda afuera.
    r.vinculada = r.linkReal || r.perdidaManual;
  });
  var nVinculadas = rowsTotal.filter(function(r){ return r.vinculada; }).length;
  var nPerdidas = rowsTotal.filter(_regiEsPerdida).length;
  _regiPintarToggleVinculadas(nVinculadas);
  _regiPintarToggleSoloPerdidas(nPerdidas);

  // Las que acaban de marcarse "Perdida" siguen 3 s en la tabla aunque ya
  // cuenten como vinculadas: _regiMarcarPerdida las mete en _regiPerdidaGracia
  // y las saca al vencer la ventana (efecto regi-row-saliendo, poly/index.html).
  var _gracia = window._regiPerdidaGracia || {};
  var rows;
  if(window._regiSoloPerdidas){
    // "Solo perdidas" gana sobre "Mostrar vinculadas": las perdidas SON
    // vinculadas, así que sin esto quedarían ocultas igual. Deja pasar también
    // las que están en su ventana de gracia de 3 s (recién marcadas).
    rows = rowsTotal.filter(function(r){ return _regiEsPerdida(r) || _gracia[r.opd]; });
  } else if(window._regiMostrarVinculadas){
    rows = rowsTotal;
  } else {
    rows = rowsTotal.filter(function(r){ return !r.vinculada || _gracia[r.opd]; });
  }

  var q = (document.getElementById('pipe-search').value || '').toLowerCase().trim();
  var forecastFilter = window._regiForecastFilter || '';

  var mesesPresentes = {}, haySinFecha = false;
  rows.forEach(function(r){ if(r.mesCierre) mesesPresentes[r.mesCierre] = true; else haySinFecha = true; });
  var monthFilter = cevenPintarPillsMes(Object.keys(mesesPresentes).sort(), haySinFecha, rows);

  var sinBuscar = rows.filter(function(r){
    if(forecastFilter && (r.forecast || '') !== forecastFilter) return false;
    if(monthFilter){
      if(monthFilter === 'sin-fecha'){ if(r.mesCierre) return false; }
      else if(r.mesCierre !== monthFilter) return false;
    }
    return true;
  });

  cevenPintarTopClientes(sinBuscar);

  var filtered = !q ? sinBuscar.slice() : sinBuscar.filter(function(r){
    var hay = ((r.cliente||'')+' '+(r.proyecto||'')+' '+(r.regi||'')+' '+(r.opd||'')+' '+(r.primaryPartner||'')).toLowerCase();
    return hay.indexOf(q) !== -1;
  });

  var sortCol = window._pipeSort.col, sortDir = window._pipeSort.dir;
  var numericCols = {monto: 1};
  filtered.sort(function(a, b){
    var av = a[sortCol], bv = b[sortCol];
    if(av === undefined || av === null) av = numericCols[sortCol] ? 0 : '';
    if(bv === undefined || bv === null) bv = numericCols[sortCol] ? 0 : '';
    var cmp = numericCols[sortCol] ? ((parseFloat(av)||0) - (parseFloat(bv)||0)) : String(av).localeCompare(String(bv));
    return sortDir === 'asc' ? cmp : -cmp;
  });

  var _hayFiltros = !!(q || forecastFilter || monthFilter);
  _regiPintarDashboard(rowsTotal, filtered, forecastFilter, _hayFiltros);

  var html = _regiTablaHTML(filtered);
  var _vacio;
  if(rowsTotal.length === 0){
    _vacio = 'Todavía no se importó ningún Excel de REGI. Tocá "⬇ Importar Excel REGI".';
  } else if(window._regiSoloPerdidas && nPerdidas === 0){
    _vacio = 'Ninguna oportunidad de REGI está marcada como perdida. Se marcan con el switch "Perdida" de cada fila.';
  } else if(rows.length === 0 && !window._regiMostrarVinculadas && nVinculadas > 0){
    // El caso lindo: no queda nada por atender. Se lo dice así y no como
    // "ninguna oportunidad coincide con los filtros" (que suena a que algo
    // está mal filtrado) para no ir a buscar el "✕ Limpiar filtros" al pedo.
    _vacio = '✓ Todas las oportunidades de REGI ya están vinculadas a un proyecto real o declaradas perdidas. Tocá "Mostrar vinculadas ('+nVinculadas+')" para verlas.';
  } else {
    _vacio = _hayFiltros ? 'Ninguna oportunidad coincide con los filtros. Tocá "✕ Limpiar filtros".' : 'El Excel importado no tiene oportunidades.';
  }
  document.getElementById('regi-pipe-body').innerHTML = html || '<tr><td colspan="10" style="text-align:center;color:#aeaeb2;padding:24px">'+_vacio+'</td></tr>';
  attachPipeSortHandlers();
  _regiBindDelegation();
}

/* Etiqueta del checkbox "Mostrar vinculadas (N)". Separado en su propio
   <span> para no tener que rearmar el <label> entero (y perder el checkbox
   con su estado) en cada render. */
function _regiPintarToggleVinculadas(n){
  var el = document.getElementById('regi-vinc-count');
  if(el) el.textContent = '(' + n + ')';
}

// Contador del toggle "Solo perdidas (N)", mismo criterio que el de arriba.
function _regiPintarToggleSoloPerdidas(n){
  var el = document.getElementById('regi-perd-count');
  if(el) el.textContent = '(' + n + ')';
}

/* "Perdida" en la vista REGI: la declaró perdida Ceven a mano (switch de la
   fila → forecast_override) o el vínculo real existió y todas sus cotizaciones
   quedaron en 'Perdido' (perdidaCeven, lo calcula _renderRegiPipelineFromCache
   sobre cada fila antes de filtrar). Mismo criterio que el KPI "REGIs
   perdidas" del header (_regiTotalesGlobales). */
function _regiEsPerdida(r){
  return !!(r && (r.perdidaManual || r.perdidaCeven));
}

/* Los dos toggles de la vista REGI ("Mostrar vinculadas" y "Solo perdidas")
   son modos de vista que compiten: prender uno apaga el otro. La exclusión
   vive acá y no en el onchange para no repetir el cruce de ids en el HTML. */
function _regiToggleMostrarVinculadas(on){
  window._regiMostrarVinculadas = !!on;
  if(on){
    window._regiSoloPerdidas = false;
    var p = document.getElementById('regi-solo-perd');
    if(p) p.checked = false;
  }
  renderPipeline();
}
function _regiToggleSoloPerdidas(on){
  window._regiSoloPerdidas = !!on;
  if(on){
    window._regiMostrarVinculadas = false;
    var v = document.getElementById('regi-mostrar-vinc');
    if(v) v.checked = false;
  }
  renderPipeline();
}

/* ── Render de "📊 Estadísticas REGI" ──────────────────────────────────────
   Mismo patrón que renderRegiPipeline(): si window._regiPipeRows todavía no
   se pidió esta sesión, lo trae (_cevenRegiPipeFetch, ya existe) y recién
   ahí pinta. getPipeline() nunca hace falta traerlo aparte: ya está en
   memoria. */
function renderRegiStats(){
  if(window._regiPipeRows === null){
    var empty = document.getElementById('stats-empty');
    var body = document.getElementById('stats-body');
    if(empty){ empty.style.display = 'block'; empty.textContent = 'Cargando…'; }
    if(body) body.style.display = 'none';
    _cevenRegiPipeFetch().then(function(){
      // Solo pintar si seguimos en la vista de Estadísticas cuando vuelve el fetch.
      var pg = document.getElementById('p-regi-stats');
      if(pg && pg.classList && pg.classList.contains('on')) _renderRegiStatsFromCache();
    }).catch(function(e){
      if(empty) empty.textContent = 'No se pudo cargar el pipeline REGI' + ((e && e.message) ? (': ' + cevenEsc(e.message)) : '.');
    });
    return;
  }
  _renderRegiStatsFromCache();
}

function _renderRegiStatsFromCache(){
  var paresAll = _regiPairsVinculadas();
  window._regiStatsPares = paresAll;   // el comparador (sin slicers) busca por opd acá

  var empty = document.getElementById('stats-empty');
  var body = document.getElementById('stats-body');
  if(!paresAll.length){
    if(empty){
      empty.style.display = 'block';
      empty.textContent = 'Todavía no hay ninguna oportunidad vinculada. Vinculá proyectos desde "🎯 Pipeline REGI" (o cargando el mismo código en el OPG del pipeline real) para verlas acá.';
    }
    if(body) body.style.display = 'none';
    return;
  }
  if(empty) empty.style.display = 'none';
  if(body) body.style.display = 'block';

  // Slicers: se pintan desde el universo completo; el resto usa el subconjunto.
  var dims = _regiStatsDimensiones(paresAll);
  _regiStatsPintarFiltros(dims);
  var pares = paresAll.filter(_regiStatsParPasa);

  _regiStatsPintarKpis(_regiKpisTotales(pares), pares.length, paresAll.length);
  _regiStatsPintarChart(_regiStatsChartData(pares));

  var porMes = _regiAgregarPorPeriodo(pares, function(mk){ return mk || ''; }, _mesLabelPoly);
  var porQ = _regiAgregarPorPeriodo(pares, _regiTrimestreKey, _regiTrimestreLabel);
  var mesBody = document.getElementById('stats-mes-body');
  var qBody = document.getElementById('stats-q-body');
  if(mesBody) mesBody.innerHTML = porMes.map(_regiStatsFilaPeriodoHTML).join('')
    || '<tr><td colspan="4" style="text-align:center;color:#aeaeb2;padding:14px">Ningún dato con los filtros actuales.</td></tr>';
  if(qBody) qBody.innerHTML = porQ.map(_regiStatsFilaPeriodoHTML).join('')
    || '<tr><td colspan="4" style="text-align:center;color:#aeaeb2;padding:14px">—</td></tr>';

  // El desplegable "Comparar una oportunidad" sigue listando TODAS (no filtra).
  var sel = document.getElementById('stats-pick');
  if(sel){
    var prev = sel.value;
    sel.innerHTML = _regiStatsOpciones(paresAll);
    sel.value = paresAll.some(function(p){ return p.hp.opd === prev; }) ? prev : '';
  }
  _regiStatsPintarComparacion(sel ? sel.value : '');
}

function _regiStatsColor(v){
  if(v === null || v === undefined) return '#1d1d1f';
  return v < 0 ? '#d70015' : (v > 0 ? '#15863a' : '#1d1d1f');
}

/* KPIs, sin texto que haya que interpretar: el subtítulo son los dos totales
   crudos (Ceven y HP) y el conteo. El de fecha va redactado ("1.8 meses
   después"), sin signos. `nView`/`nTotal`: cuántas oportunidades quedaron con
   los slicers y cuántas hay en total. */
function _regiStatsPintarKpis(kpis, nView, nTotal){
  var elMonto = document.getElementById('stats-kpi-monto');
  var elMontoSub = document.getElementById('stats-kpi-monto-sub');
  if(elMonto){
    elMonto.textContent = (kpis.diffMonto < 0 ? '-' : '+') + 'USD ' + fI(Math.abs(kpis.diffMonto));
    elMonto.style.color = _regiStatsColor(kpis.diffMonto);
  }
  if(elMontoSub){
    elMontoSub.textContent = 'Ceven USD ' + fI(kpis.montoCeven) + '  ·  HP USD ' + fI(kpis.montoHp)
      + '  ·  ' + _regiStatsAlcanceTxt(nView, nTotal);
  }

  var elFecha = document.getElementById('stats-kpi-fecha');
  var elFechaSub = document.getElementById('stats-kpi-fecha-sub');
  var f = _regiFechaTxt(kpis.diffFechaProm);
  if(elFecha){
    elFecha.textContent = f.txt;
    elFecha.style.color = f.color;
  }
  if(elFechaSub){
    elFechaSub.textContent = kpis.nFecha
      ? ('promedio sobre ' + kpis.nFecha + (kpis.nFecha === 1 ? ' oportunidad' : ' oportunidades') + ' con fecha en ambos lados')
      : 'ninguna oportunidad con fecha en ambos lados';
  }
}

// "12 oportunidades" o "5 de 12 oportunidades (filtrado)".
function _regiStatsAlcanceTxt(nView, nTotal){
  if(nView === nTotal) return nView + (nView === 1 ? ' oportunidad' : ' oportunidades');
  return nView + ' de ' + nTotal + ' oportunidades (filtrado)';
}

function _regiStatsFilaPeriodoHTML(g){
  var f = _regiFechaTxt(g.diffFechaProm);
  return '<tr>'
    + '<td>' + cevenEsc(g.label) + '</td>'
    + '<td style="text-align:center">' + g.n + '</td>'
    + '<td style="text-align:right;font-weight:600;color:' + _regiStatsColor(g.diffMonto) + '">'
      + (g.diffMonto < 0 ? '-' : '+') + 'USD ' + fI(Math.abs(g.diffMonto)) + '</td>'
    + '<td style="text-align:right;font-weight:600;color:' + f.color + '">' + cevenEsc(f.txt) + '</td>'
  + '</tr>';
}

/* ── Slicers: chips de trimestre + mes + estado de Ceven ─────────────────── */
function _regiStatsChipHTML(act, val, label, activo){
  var bg = activo ? '#0071e3' : '#fff';
  var fg = activo ? '#fff' : '#1d1d1f';
  var bd = activo ? '#0071e3' : '#d2d2d7';
  return '<button type="button" data-act="' + act + '" data-val="' + cevenEsc(val) + '"'
    + ' style="border:0.5px solid ' + bd + ';background:' + bg + ';color:' + fg
    + ';border-radius:980px;padding:5px 12px;font-size:12px;font-weight:500;cursor:pointer;font-family:inherit">'
    + cevenEsc(label) + '</button>';
}

function _regiStatsPintarFiltros(dims){
  var box = document.getElementById('stats-filtros');
  if(!box) return;
  var f = window._regiStatsFiltros || (window._regiStatsFiltros = { meses: {}, estados: {} });

  // Podar selecciones de dimensiones que ya no existen (los datos cambiaron):
  // sin esto quedaría un filtro fantasma que vacía la vista y no tiene chip
  // para destildarlo.
  Object.keys(f.meses).forEach(function(k){ if(dims.meses.indexOf(k) === -1) delete f.meses[k]; });
  Object.keys(f.estados).forEach(function(k){ if(dims.estados.indexOf(k) === -1) delete f.estados[k]; });

  var trims = _regiStatsTrimestresDe(dims.meses);
  var mesesReales = dims.meses.filter(function(m){ return m !== _REGI_SIN_FECHA; });

  function fila(titulo, chips){
    return '<div style="display:flex;flex-wrap:wrap;gap:6px;align-items:center">'
      + '<span style="font-size:11px;color:#6e6e73;text-transform:uppercase;letter-spacing:.4px;min-width:70px">' + titulo + '</span>'
      + chips + '</div>';
  }

  var h = '';

  if(trims.length > 1){
    h += fila('Trimestre', trims.map(function(q){
      var meses = mesesReales.filter(function(m){ return _regiTrimestreKey(m) === q; });
      var activo = meses.length > 0 && meses.every(function(m){ return f.meses[m]; });
      return _regiStatsChipHTML('stats-trim', q, _regiTrimestreLabel(q), activo);
    }).join(''));
  }

  var chipsMes = dims.meses.map(function(m){
    var label = (m === _REGI_SIN_FECHA) ? 'Sin fecha' : _mesLabelPoly(m);
    return _regiStatsChipHTML('stats-mes', m, label, !!f.meses[m]);
  }).join('');
  h += fila('Mes', chipsMes);

  if(dims.estados.length > 1){
    var chipsEst = dims.estados.map(function(e){
      var label = (typeof cevenEstadoLabel === 'function') ? cevenEstadoLabel(e) : e;
      return _regiStatsChipHTML('stats-estado', e, label, !!f.estados[e]);
    }).join('');
    h += fila('Estado Ceven', chipsEst);
  }

  if(_regiStatsHayFiltro()){
    h += '<div><button type="button" data-act="stats-limpiar" style="border:none;background:none;color:#0071e3;font-size:12px;cursor:pointer;font-family:inherit;padding:2px 0;text-decoration:underline">Limpiar filtros</button></div>';
  }

  box.innerHTML = h;
  _regiStatsBindFiltros(box);
}

function _regiStatsBindFiltros(box){
  if(box._regiBound) return;
  box._regiBound = true;
  box.addEventListener('click', function(ev){
    var el = ev.target && ev.target.closest ? ev.target.closest('[data-act]') : null;
    if(!el || !box.contains(el)) return;
    var f = window._regiStatsFiltros || (window._regiStatsFiltros = { meses: {}, estados: {} });
    var act = el.getAttribute('data-act');
    var val = el.getAttribute('data-val');
    if(act === 'stats-limpiar'){ f.meses = {}; f.estados = {}; }
    else if(act === 'stats-mes'){ if(f.meses[val]) delete f.meses[val]; else f.meses[val] = 1; }
    else if(act === 'stats-estado'){ if(f.estados[val]) delete f.estados[val]; else f.estados[val] = 1; }
    else if(act === 'stats-trim'){
      // Trimestre: alterna EN BLOQUE los meses reales de ese trimestre.
      var dims = _regiStatsDimensiones(window._regiStatsPares || []);
      var meses = dims.meses.filter(function(m){ return m !== _REGI_SIN_FECHA && _regiTrimestreKey(m) === val; });
      var todosPuestos = meses.length > 0 && meses.every(function(m){ return f.meses[m]; });
      meses.forEach(function(m){ if(todosPuestos) delete f.meses[m]; else f.meses[m] = 1; });
    } else return;
    _renderRegiStatsFromCache();
  });
}

/* ── Gráfico de barras: HP vs Ceven por mes ─────────────────────────────────
   Sin librería: dos barras por grupo, alto proporcional al máximo de la vista.
   Scrollea horizontal si hay muchos meses (el .tw de afuera). */
function _regiStatsPintarChart(data){
  var box = document.getElementById('stats-chart');
  if(!box) return;
  if(!data.length){ box.innerHTML = '<div style="color:#aeaeb2;font-size:12px;padding:14px 0">Ningún dato con los filtros actuales.</div>'; return; }

  var max = 0;
  data.forEach(function(g){ max = Math.max(max, g.hp, g.ceven); });
  if(max <= 0) max = 1;
  var H = 150;   // alto del área de barras, px

  var barras = data.map(function(g){
    var hHp = Math.max(2, Math.round(H * g.hp / max));
    var hCe = Math.max(2, Math.round(H * g.ceven / max));
    function bar(alto, color, monto){
      return '<div title="USD ' + fI(monto) + '" style="width:22px;height:' + alto + 'px;background:' + color
        + ';border-radius:3px 3px 0 0"></div>';
    }
    return '<div style="display:flex;flex-direction:column;align-items:center;gap:5px;min-width:64px">'
      + '<div style="display:flex;align-items:flex-end;gap:4px;height:' + H + 'px">'
        + bar(hHp, '#c7c7cc', g.hp)
        + bar(hCe, '#0071e3', g.ceven)
      + '</div>'
      + '<div style="font-size:10px;color:#6e6e73;font-variant-numeric:tabular-nums;text-align:center;line-height:1.3">'
        + _regiMoneyCorto(g.hp) + ' / <b style="color:#0071e3">' + _regiMoneyCorto(g.ceven) + '</b></div>'
      + '<div style="font-size:11px;color:#1d1d1f;white-space:nowrap">' + cevenEsc(g.label) + '</div>'
    + '</div>';
  }).join('');

  box.innerHTML =
    '<div style="display:flex;gap:14px;font-size:11px;color:#6e6e73;margin-bottom:10px">'
    + '<span><span style="display:inline-block;width:10px;height:10px;background:#c7c7cc;border-radius:2px;vertical-align:middle;margin-right:4px"></span>HP (estimado)</span>'
    + '<span><span style="display:inline-block;width:10px;height:10px;background:#0071e3;border-radius:2px;vertical-align:middle;margin-right:4px"></span>Ceven</span>'
    + '</div>'
    + '<div style="overflow-x:auto"><div style="display:flex;gap:10px;align-items:flex-end;padding-bottom:4px">' + barras + '</div></div>';
}

function _regiStatsOpciones(pares){
  var h = '<option value="">— Elegí una oportunidad —</option>';
  pares.forEach(function(par){
    var multi = (par.ceven && par.ceven.nCotiz > 1) ? (' · ' + par.ceven.nCotiz + ' cotiz.') : '';
    h += '<option value="' + cevenEsc(par.hp.opd) + '">'
      + cevenEsc(par.ceven.cliente || par.hp.cliente || '—') + ' — '
      + cevenEsc(par.hp.proyecto || par.ceven.proyecto || '—')
      + ' (' + cevenEsc(par.hp.regi) + ')' + multi + '</option>';
  });
  return h;
}

function _regiStatsFilaCompararHTML(etiqueta, valHp, valCeven, diffTxt, diffColor){
  return '<tr>'
    + '<td style="color:#6e6e73">' + cevenEsc(etiqueta) + '</td>'
    + '<td>' + valHp + '</td>'
    + '<td>' + valCeven + '</td>'
    + '<td style="font-weight:600' + (diffColor ? (';color:' + diffColor) : '') + '">' + diffTxt + '</td>'
  + '</tr>';
}

function _regiStatsPintarComparacion(opd){
  var box = document.getElementById('stats-compare');
  if(!box) return;
  var par = opd && (window._regiStatsPares || []).filter(function(p){ return p.hp.opd === opd; })[0];
  if(!par){ box.innerHTML = ''; return; }

  var ag = par.ceven || {};
  var multi = (ag.nCotiz || 0) > 1;
  var diffMonto = _regiDiffMonto(par);
  var diffFecha = _regiDiffFechaMeses(par);
  var mesHp = par.hp.mesCierre ? _mesLabelPoly(par.hp.mesCierre) : '—';
  // El mes de Ceven puede ser un promedio ponderado por monto de varias
  // cotizaciones: se marca con "≈" cuando no sale de una sola fila activa.
  var mesCeven = ag.mesCierre ? ((ag.nActivas > 1 ? '≈ ' : '') + _mesLabelPoly(ag.mesCierre)) : '—';
  var fechaDifTxt = diffFecha === null ? '—' : ((diffFecha > 0 ? '+' : '') + diffFecha.toFixed(1) + ' m');

  var mc = _regiCevenMontoComparacion(ag);
  var montoCevenTxt = 'USD ' + fI(mc.valor || 0);
  if(mc.facturado){
    // Sin posición viva pero facturada: se muestra lo facturado y se rotula,
    // en vez de un USD 0 que se leería como "Ceven no cotizó esta oportunidad".
    montoCevenTxt += ' <span style="color:#6e6e73">· facturado</span>';
  } else if(multi){
    montoCevenTxt += ' <span style="color:#6e6e73">· ' + cevenEsc(ag.estadosResumen) + '</span>';
  }

  var estadoTxt;
  if(ag.nCotiz === 1){
    var e0 = (ag.rows && ag.rows[0] && ag.rows[0].estado) || 'Cotizado';
    estadoTxt = (typeof cevenEstadoLabel === 'function') ? cevenEstadoLabel(e0) : e0;
  } else {
    estadoTxt = ag.estadosResumen || '—';
  }

  box.innerHTML = '<table style="width:100%">'
    + '<thead><tr><th></th><th>HP (Excel)</th><th>Ceven (real' + (multi ? ', ' + ag.nCotiz + ' cotiz.' : '') + ')</th><th>Diferencia</th></tr></thead>'
    + '<tbody>'
      + _regiStatsFilaCompararHTML('Canal / Cliente final',
          cevenEsc(par.hp.cliente || '—') + ' — ' + cevenEsc(par.hp.proyecto || '—'),
          cevenEsc(ag.cliente || '—') + ' — ' + cevenEsc(ag.proyecto || '—'),
          '—', null)
      + _regiStatsFilaCompararHTML('Monto',
          'USD ' + fI(par.hp.montoArchivo || 0),
          montoCevenTxt,
          (diffMonto < 0 ? '-' : '+') + 'USD ' + fI(Math.abs(diffMonto)), _regiStatsColor(diffMonto))
      + _regiStatsFilaCompararHTML('Cierre estimado', mesHp, mesCeven,
          fechaDifTxt, _regiStatsColor(diffFecha))
      + _regiStatsFilaCompararHTML('Estado', '—', cevenEsc(estadoTxt), '—', null)
    + '</tbody></table>'
    + (multi ? _regiStatsDesgloseHTML(ag) : '');
}

/* Desglose del lado Ceven: una fila por cotización real vinculada a este REGI.
   Las que no cuentan van atenuadas, mismo criterio visual que una fila ya
   vinculada en la tabla del pipeline REGI. Solo se pinta cuando hay más de una
   (ver _regiStatsPintarComparacion).
   `opts` (opcional, lo usa el drill-down de los KPI del header):
     · opts.excluir   — set de estados a atenuar. Default {Perdido,Facturado}
       (la posición viva de las Estadísticas); el KPI "REGI CEVEN" pasa
       {Perdido} porque ahí las Facturadas SÍ suman.
     · opts.linkQuotes — cada fila con nº de cotización se vuelve clickeable
       (data-act="regi-drill-openq") para abrir esa cotización. */
function _regiStatsDesgloseHTML(ag, opts){
  opts = opts || {};
  var excluir = opts.excluir || _REGI_ESTADOS_EXCLUIDOS;
  var link = !!opts.linkQuotes;
  var filas = (ag.rows || []).map(function(r){
    var estado = r.estado || 'Cotizado';
    var excl = !!excluir[estado];
    var lbl = (typeof cevenEstadoLabel === 'function') ? cevenEstadoLabel(estado) : estado;
    var qn = (r.qNum !== undefined && r.qNum !== null && r.qNum !== '') ? String(r.qNum) : '';
    var clickable = link && !!qn;
    var st = [];
    if(excl) st.push('opacity:.55');
    if(clickable) st.push('cursor:pointer');
    var attrs = st.length ? (' style="' + st.join(';') + '"') : '';
    if(clickable) attrs += ' data-act="regi-drill-openq" data-qn="' + cevenEsc(qn) + '" title="Abrir la cotización #' + cevenEsc(qn) + '"';
    return '<tr' + attrs + '>'
      + '<td>' + cevenEsc(r.cliente || '—') + '</td>'
      + '<td>' + cevenEsc(r.proyecto || '—') + '</td>'
      + '<td style="text-align:right;white-space:nowrap">USD ' + fI(Number(r.monto) || 0) + '</td>'
      + '<td style="white-space:nowrap">' + cevenEsc(r.mesCierre ? _mesLabelPoly(r.mesCierre) : '—') + '</td>'
      + '<td>' + cevenEsc(lbl) + (clickable ? ' <span style="color:var(--cblue);white-space:nowrap">#' + cevenEsc(qn) + ' ↗</span>' : '') + '</td>'
    + '</tr>';
  }).join('');
  return '<div style="margin-top:12px">'
    + '<div style="font-size:11px;color:#6e6e73;text-transform:uppercase;letter-spacing:.4px;margin-bottom:6px">'
      + 'Cotizaciones de Ceven para este REGI (' + (ag.rows || []).length + ')</div>'
    + '<table style="width:100%">'
      + '<thead><tr><th>Canal</th><th>Cliente final</th><th style="text-align:right">Monto</th><th>Cierre</th><th>Estado</th></tr></thead>'
      + '<tbody>' + filas + '</tbody></table></div>';
}

function _regiPintarDashboard(rowsTotal, filtered, forecastFilter, hayFiltros){
  var dash = document.getElementById('pipe-dashboard');
  if(!dash) return;
  dash.style.display = 'block';

  /* Los cuatro KPI globales del header (Monto total REGI / REGI vinculados /
     REGI CEVEN / REGIs perdidas — ver el comentario grande sobre
     _regiEnsureHeaderKpis) NO se mueven con ningún filtro. Se pintan igual
     desde acá, con los mismos rowsTotal, para no perder la actualización en
     cuanto se entra a 🎯 Pipeline REGI. */
  _regiPintarHeaderKpis(_regiTotalesGlobales(rowsTotal));

  var cliVistos = {}, nClientes = 0, byForecast = {}, montoFiltrado = 0;
  filtered.forEach(function(r){
    var ck = (r.cliente||'').trim().toLowerCase();
    if(ck && !cliVistos[ck]){ cliVistos[ck] = 1; nClientes++; }
    montoFiltrado += Number(r.monto) || 0;
    var fc = r.forecast || '';
    if(fc){
      if(!byForecast[fc]) byForecast[fc] = {count:0, monto:0};
      byForecast[fc].count++; byForecast[fc].monto += (r.monto || 0);
    }
  });

  document.getElementById('dash-count').textContent = nClientes;
  document.getElementById('dash-proyectos').textContent = filtered.length;

  /* Este KPI sí sigue a los filtros (búsqueda, Forecast, mes, "Mostrar
     vinculadas"): antes esta misma tarjeta mostraba el total global fijo de
     arriba; liberada esa tarjeta, queda para el número que faltaba —cuánto
     suman las oportunidades que se ven en pantalla ahora mismo—, mismo
     criterio que "Total pipeline"/"Total filtrado" del pipeline normal
     (pipeline-view.js). */
  _pipeSetLbl('dash-total-lbl', 'Monto filtrado');
  document.getElementById('dash-total').textContent = 'USD ' + fI(montoFiltrado);
  _pipeSetLbl('dash-total-sub', hayFiltros
    ? 'según los filtros aplicados'
    : (window._regiSoloPerdidas ? 'solo las declaradas perdidas'
      : (window._regiMostrarVinculadas ? 'incluye las ya vinculadas' : 'de las oportunidades sin vincular')));

  var pillsHtml = '<div style="font-size:11px;color:#6e6e73;text-transform:uppercase;letter-spacing:.4px;margin-bottom:8px">Por Forecast</div>'
    + '<div style="display:flex;flex-wrap:wrap;gap:6px;width:100%">';
  Object.keys(REGI_FORECAST_COLORS).forEach(function(fc){
    var data = byForecast[fc] || {count:0, monto:0};
    var c = REGI_FORECAST_COLORS[fc];
    var dim = data.count === 0 ? ';opacity:.45' : '';
    var isActive = forecastFilter === fc;
    var activeBorder = isActive ? ';outline:2px solid '+c.fg+';outline-offset:1px' : '';
    pillsHtml += '<div data-act="regi-forecast" data-fc="'+cevenEsc(fc)+'" style="background:'+c.bg+';color:'+c.fg+';border-radius:980px;padding:6px 12px;font-size:12px;display:inline-flex;align-items:center;gap:6px;cursor:pointer'+activeBorder+dim+'">'
      +'<strong>'+cevenEsc(fc)+'</strong><span style="opacity:.85">· '+data.count+' · USD '+fI(data.monto)+'</span></div>';
  });
  pillsHtml += '</div>';
  document.getElementById('dash-by-status').innerHTML = pillsHtml;
}

/* ── Tabla ────────────────────────────────────────────────────────────── */

function _regiGroupRowHTML(g, key, abierto){
  var n = g.n + (g.n === 1 ? ' oportunidad' : ' oportunidades');
  return '<tr class="pipe-grp" data-act="expcli" data-k="'+cevenEsc(key)+'" style="cursor:pointer">'
    + '<td colspan="10" style="padding:9px 12px;background:#f0f0f3;border-top:0.5px solid #d2d2d7">'
      + '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">'
        + '<span style="font-size:11px;width:12px;display:inline-block">'+(abierto?'▼':'▶')+'</span>'
        + '<strong style="font-size:13px">'+cevenEsc(g.label)+'</strong>'
        + '<span style="font-size:11px;color:#6e6e73">'+n+'</span>'
        + '<span style="flex:1"></span>'
        + '<strong style="font-size:13px;white-space:nowrap">USD '+fI(g.monto)+'</strong>'
      + '</div>'
    + '</td></tr>';
}

/* Forecast: una pastilla fija con el valor del archivo. Fue un <select>
   editable entre el 25/08 y el 03/09/2026; ahora es lo que dice HP y nada
   más. Un valor que no esté en REGI_FORECAST_COLORS (archivo con una
   categoría nueva) se pinta en gris con su texto crudo, en vez de caer a
   otra categoría: mostrar lo que hay permite darse cuenta. */
function _regiForecastPillHTML(r){
  var actual = r.forecast || '';
  if(!actual) return '<span style="color:#aeaeb2;font-size:11px">—</span>';
  var c = REGI_FORECAST_COLORS[actual] || {bg:'#f2f2f7', fg:'#6e6e73'};
  return '<span style="background:'+c.bg+';color:'+c.fg+';border-radius:980px;padding:2px 10px;'
    + 'font-size:11px;font-weight:700;white-space:nowrap">'+cevenEsc(actual)+'</span>';
}

// Checkbox "Perdida" (04/09/2026): declara a mano que Ceven no va a trabajar
// esta oportunidad, sin necesidad de cargar una cotización real solo para
// poder marcarla. PATCH sobre forecast_override (ver _regiMarcarPerdida) —
// sobrevive las reimportaciones del Excel, igual que ya hacía esa columna.
function _regiPerdidaCheckboxHTML(r){
  return '<input type="checkbox" role="switch" class="regi-perdida-toggle" data-act="regi-perdida" data-opd="'+cevenEsc(r.opd)+'"'
    + (r.perdidaManual ? ' checked' : '')
    + ' title="Marcar como perdida: HP la sigue mostrando pero Ceven no la va a trabajar. Sigue sumando a REGI vinculados.">';
}

function _regiRowHTML(r){
  var vencido = r.drExpiration && r.drExpiration < cevenHoyISO();
  // La celda de Acciones distingue TRES casos, en orden de autoridad:
  // 1) link real (linkReal): el proyecto real ya existe, es la fuente de
  //    verdad, y la celda se reduce a decirlo.
  // 2) sin link real pero declarada perdida a mano (perdidaManual): Ceven no
  //    la va a cargar, así que tampoco tiene sentido ofrecer "Copiar".
  // 3) ninguna de las dos: la acción disponible es copiarla al pipeline real.
  // La fila se atenúa siempre que esté "resuelta" (r.vinculada, que cubre
  // los tres... salvo el 3, ver más abajo) — mismo criterio que las
  // pastillas apagadas del dashboard, para que salte a la vista qué ya no
  // necesita atención.
  //
  // "➕ Copiar a Ceven" no edita esta foto, abre una cotización nueva del
  // lado de Ceven. El "✎ Editar" que asignaba productos se fue el
  // 03/09/2026 con el resto de la edición.
  // Orden de autoridad: link real que terminó todo en 'Perdido' → "✕ Perdida"
  // (roja, aunque haya vínculo real: la oportunidad no prosperó); link real vivo
  // → "✓ Vinculada"; sin link pero declarada perdida a mano → "✕ Perdida
  // (declarada)"; nada → botón para copiarla al pipeline real.
  var celdaAcc = (r.linkReal && r.perdidaCeven)
    ? '<span style="background:#fde8e6;color:#d70015;border-radius:980px;padding:3px 10px;font-size:11px;font-weight:700;white-space:nowrap">✕ Perdida</span>'
    : (r.linkReal
      ? '<span style="background:#e6f7ec;color:#15863a;border-radius:980px;padding:3px 10px;font-size:11px;font-weight:700;white-space:nowrap">✓ Vinculada</span>'
      : (r.perdidaManual
        ? '<span style="background:#fde8e6;color:#d70015;border-radius:980px;padding:3px 10px;font-size:11px;font-weight:700;white-space:nowrap">✕ Perdida (declarada)</span>'
        : '<button class="bs" data-act="regi-copiar" data-opd="'+cevenEsc(r.opd)+'" title="Crear la cotización real en nuestro pipeline a partir de esta oportunidad" style="padding:2px 8px;font-size:12px;background:#e8f4ff;color:#0071e3;border-color:#b8ddff">'
            + ((window._regiCopiadas && window._regiCopiadas[r.opd]) ? '➕ Copiar de nuevo' : '➕ Copiar a Ceven') + '</button>'));
  // regi-row-saliendo: recién marcada "Perdida", en su ventana de 3 s antes de
  // que el filtro la retire. Gana sobre el opacity:.55 de vinculada (el
  // keyframe la desvanece igual).
  var _saliendo = !!(window._regiPerdidaGracia && window._regiPerdidaGracia[r.opd]);
  return '<tr'+(_saliendo ? ' class="regi-row-saliendo"' : (r.vinculada ? ' style="opacity:.55"' : ''))+'>'
    // opd/regi/partner: pueden venir larguísimos del Excel de HP. Se recortan
    // con "…" dentro de un ancho fijo (título nativo para el texto completo),
    // igual que la columna Proyecto de al lado, para no ensanchar la tabla.
    + '<td style="font-size:12px;font-family:ui-monospace,Menlo,monospace"><div'+(r.opd?' title="'+cevenEsc(r.opd)+'"':'')+' style="max-width:170px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+cevenEsc(r.opd||'—')+'</div></td>'
    + '<td style="font-size:12px;font-family:ui-monospace,Menlo,monospace"><div'+(r.regi?' title="'+cevenEsc(r.regi)+'"':'')+' style="max-width:170px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+(r.regi ? cevenEsc(r.regi) : '<span style="color:#aeaeb2">sin REGI</span>')+'</div></td>'
    + '<td style="font-size:12px"><div style="max-width:280px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+cevenEsc(r.proyecto||'—')+'</div></td>'
    + '<td style="font-size:12px;color:#6e6e73"><div'+(r.primaryPartner?' title="'+cevenEsc(r.primaryPartner)+'"':'')+' style="max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+cevenEsc(r.primaryPartner||'—')+'</div></td>'
    + '<td style="text-align:center">'+_regiForecastPillHTML(r)+'</td>'
    + '<td style="text-align:center">'+_regiPerdidaCheckboxHTML(r)+'</td>'
    + '<td style="font-size:12px;white-space:nowrap'+(vencido?';color:#d70015':'')+'" title="'+(vencido?'Deal Registration vencido':'')+'">'+cevenEsc(r.drExpiration ? _regiFechaDDMMYYYY(r.drExpiration) : '—')+'</td>'
    + '<td style="font-size:12px;white-space:nowrap">'+cevenEsc(r.mesCierre ? _mesLabelPoly(r.mesCierre) : '—')+'</td>'
    + '<td class="stk-monto" style="text-align:right;font-weight:500;white-space:nowrap;min-width:110px">USD '+fI(r.monto||0)+'</td>'
    + '<td class="stk-act" style="text-align:center;white-space:nowrap">'+celdaAcc+'</td>'
  + '</tr>';
}

function _regiTablaHTML(filas){
  cevenPipeNodeReset();
  var grupos = cevenPipeSortGroups(cevenPipeGroupBy(filas), window._pipeSort.col, window._pipeSort.dir);
  var html = '';
  grupos.forEach(function(g, gi){
    var kGrupo = cevenPipeKey('regi', 'c', gi);
    cevenPipeNodeAdd(kGrupo, {kind:'c', grupo:g});
    var abierto = cevenPipeAbierto(kGrupo);
    html += _regiGroupRowHTML(g, kGrupo, abierto);
    if(!abierto) return;
    g.rows.forEach(function(r){ html += _regiRowHTML(r); });
  });
  return html;
}

/* _regiCambiarForecast()/_regiGuardarForecast() vivían acá: hacían un PATCH
   de `forecast_override`/`perdido_motivo` sobre poly_regi_pipeline. Se fueron
   el 03/09/2026 con el resto de la edición — esta vista ya no escribe una
   sola columna de esa tabla, solo la reemplaza entera al importar el Excel.
   Las columnas siguen en la base con sus datos (ver el comentario de
   cabecera). */

/* ── Copiar una oportunidad a una cotización real ─────────────────────────
   Confirmado con el usuario antes de construir esto: NO crea una fila
   liviana sin cotización atrás. Abre una cotización nueva de verdad,
   prellenada, igual que loguea el resto del pipeline hoy (una fila = una
   cotización real) — así no hay que inventar ningún caso especial en
   addToPipeline() ni en el detalle expandible/export del pipeline real. El
   OPG se prellena con el `regi` de la oportunidad o con su `opd` cuando
   todavía no fue aprobado: cuando el AM apriete "Agregar al pipeline" con
   productos reales cargados, la oportunidad va a matchear sola.

   window._regiCopiadas es solo para no repetir el mismo botón "Copiar a
   Ceven" sin que el usuario se dé cuenta de que ya lo usó — no persiste
   entre sesiones ni distingue quién lo apretó, no hace falta más que eso. */
window._regiCopiadas = window._regiCopiadas || {};

function _regiCopiarAPipeline(opd){
  if(!cevenCanUsePipeline()){ showToast('Tu rol no permite agregar al pipeline.'); return; }
  var r = (window._regiPipeRows || []).filter(function(x){ return x.opd === opd; })[0];
  if(!r) return;
  goTo('quote');
  nuevaCotizacion();
  document.getElementById('client').value = r.cliente;
  if(typeof aplicarTierDelCliente === 'function') aplicarTierDelCliente();
  if(typeof cevenClienteCambio === 'function') cevenClienteCambio();
  document.getElementById('proyecto').value = r.proyecto;
  document.getElementById('opg').value = r.regi || r.opd || '';
  if(r.mesCierre && typeof setMesCierre === 'function') setMesCierre(r.mesCierre);
  window._regiCopiadas[opd] = true;
  showToast(r.regi
    ? 'Cotización iniciada desde REGI "'+r.proyecto+'" (OPG '+r.regi+') — cargá los productos reales y usá "Agregar al pipeline".'
    : 'Cotización iniciada desde REGI "'+r.proyecto+'" (OPG '+r.opd+') — cargá los productos reales y usá "Agregar al pipeline".');
}

/* Checkbox "Perdida" de la tabla (04/09/2026): declara a mano que Ceven no
   va a trabajar esta oportunidad, sin necesidad de cargar una cotización
   real. Optimista — cambia la UI antes de esperar la respuesta, y revierte
   si el PATCH falla — porque es una acción de bajo riesgo, tocada seguido
   mientras se repasa la lista.

   Persiste en `forecast_override` (columna que ya existía en la base, ver el
   comentario de _cevenRegiPipeFetch): sobrevive las reimportaciones del
   Excel igual que ya hacía antes con el <select> de Forecast que se fue el
   03/09/2026. */
function _regiMarcarPerdida(opd, marcar){
  if(!cevenCanUsePipeline()){
    showToast('Tu rol no permite marcar oportunidades de REGI como perdidas.');
    renderPipeline();   // el checkbox ya cambió de estado visual solo con el click: hay que devolverlo
    return;
  }
  var r = (window._regiPipeRows || []).filter(function(x){ return x.opd === opd; })[0];
  if(!r) return;
  var anterior = r.perdidaManual;
  r.perdidaManual = marcar;

  /* Al marcarla, la fila pasa a contar como "vinculada" y el filtro por
     defecto la saca de la tabla. Antes se iba en el mismo frame del click y no
     se llegaba a ver ni que el toggle quedaba en rojo. Ahora se la retiene 3 s
     con un lavado rojo que se desvanece (clase regi-row-saliendo, keyframes en
     poly/index.html) y recién ahí se re-renderiza para que el filtro "ya
     vinculadas" la retire. Solo aplica al MARCAR y con el filtro activo: al
     destildar —o con "Mostrar vinculadas" prendido— la fila se queda igual y
     no hay nada que retener. */
  window._regiPerdidaGracia = window._regiPerdidaGracia || {};
  window._regiPerdidaGraciaT = window._regiPerdidaGraciaT || {};
  _regiCancelarGracia(opd);
  // `typeof setTimeout`: fuera del browser (los checks corren en un vm sin
  // timers) se cae al comportamiento directo de siempre — la fila sale en el
  // mismo render, sin ventana de gracia.
  if(marcar && !window._regiMostrarVinculadas && typeof setTimeout === 'function'){
    window._regiPerdidaGracia[opd] = true;
    window._regiPerdidaGraciaT[opd] = setTimeout(function(){
      delete window._regiPerdidaGracia[opd];
      delete window._regiPerdidaGraciaT[opd];
      // Si mientras tanto se cambió de vista, no forzar el render de otra.
      var sel = document.getElementById('archive-month-sel');
      if(sel && sel.value === '__regi') renderPipeline();
    }, 3000);
  } else {
    delete window._regiPerdidaGracia[opd];
  }

  renderPipeline();
  cevenAuthedFetch(_cevenRegiPipeRest('poly_regi_pipeline') + '?opd=eq.' + encodeURIComponent(opd), {
    method: 'PATCH',
    headers: {Prefer: 'return=minimal'},
    body: JSON.stringify({forecast_override: marcar ? 'Perdido' : null})
  }).catch(function(e){
    r.perdidaManual = anterior;
    _regiCancelarGracia(opd);
    renderPipeline();
    showError('No se pudo guardar el cambio: ' + ((e && e.message) || 'error desconocido'));
  });
}

/* Saca un OPD de la ventana de gracia post-"Perdida" y mata su timer, si lo
   tiene. Se usa al re-marcar, al destildar y cuando el PATCH falla. */
function _regiCancelarGracia(opd){
  if(window._regiPerdidaGracia) delete window._regiPerdidaGracia[opd];
  var t = window._regiPerdidaGraciaT && window._regiPerdidaGraciaT[opd];
  if(t){
    if(typeof clearTimeout === 'function') clearTimeout(t);
    delete window._regiPerdidaGraciaT[opd];
  }
}

/* Delegación propia: #regi-pipe-body y #dash-by-status son contenedores
   propios/compartidos, pero pipeBindDelegation() (pipeline-view.js) ya deja
   UN listener por contenedor vía cevenDelegate() — atarle un segundo ahí no
   sirve (cevenDelegate no permite dos por el mismo id+evento). Se ata acá
   con el mismo criterio (flag propio, no volver a atar en cada render). */
function _regiBindDelegation(){
  var body = document.getElementById('regi-pipe-body');
  if(body && !body._regiBound){
    body._regiBound = true;
    body.addEventListener('click', function(ev){
      var el = cevenActEl(ev, body);
      if(!el) return;
      var act = el.getAttribute('data-act');
      if(act === 'expcli') togglePipeNode(el.getAttribute('data-k'));
      else if(act === 'regi-copiar') _regiCopiarAPipeline(el.getAttribute('data-opd'));
    });
    // El checkbox "Perdida" (04/09/2026) es el único control editable que
    // quedó en esta tabla desde que volvió a ser una foto del Excel — de ahí
    // el único listener de 'change'.
    body.addEventListener('change', function(ev){
      var el = cevenActEl(ev, body);
      if(!el || el.getAttribute('data-act') !== 'regi-perdida') return;
      _regiMarcarPerdida(el.getAttribute('data-opd'), el.checked);
    });
  }
  var dashByStatus = document.getElementById('dash-by-status');
  if(dashByStatus && !dashByStatus._regiBound){
    dashByStatus._regiBound = true;
    dashByStatus.addEventListener('click', function(ev){
      var el = cevenActEl(ev, dashByStatus);
      if(!el || el.getAttribute('data-act') !== 'regi-forecast') return;
      var fc = el.getAttribute('data-fc');
      window._regiForecastFilter = (window._regiForecastFilter === fc) ? '' : fc;
      renderPipeline();
    });
  }
}
