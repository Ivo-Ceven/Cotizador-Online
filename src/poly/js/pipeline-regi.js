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

   25/08/2026: la fila dejó de ser 100% de solo lectura en DOS sentidos —
   se le puede asignar productos del catálogo (poly_regi_pipeline_productos,
   ver js/pipeline-regi-productos.js) y se le puede editar el Forecast a
   mano (columna `forecast_override`, incluye un cuarto estado que el
   archivo de HP no tiene: "Perdido"). El resto de lo que viene del Excel
   (regi/account/amount/fechas) sigue sin editarse: la única forma de
   tocarlo sigue siendo reimportar.

   `r.monto` es el monto que se VE y se SUMA en toda la UI (fila, grupo,
   dashboard, orden): si el proyecto tiene productos asignados, es la
   sumatoria de esos productos; si no, es el `amount` del archivo de HP.
   Uno reemplaza al otro a propósito (pedido del usuario) — no conviven
   como dos KPI separados. `r.montoArchivo` guarda el valor crudo del
   archivo aparte, solo para el tooltip de la fila cuando los dos difieren.

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
window._regiVistaWasActive = false;

function _cevenRegiPipeRest(path){ return SUPABASE_URL + '/rest/v1/' + path; }

// Perdido no viene del archivo de HP (no es una categoría de forecast del
// partner portal): es el cuarto estado que Ceven puede fijar a mano — ver
// forecast_override más abajo. Mismo rojo que usa 'Perdido' en el embudo de
// Estado del pipeline normal (shared/pipeline-status.js), a propósito.
var REGI_FORECAST_COLORS = {
  Commit:   {bg:'#fff8e1', fg:'#7a5800'},
  Pipeline: {bg:'#e8f4ff', fg:'#0071e3'},
  Upside:   {bg:'#f2e8ff', fg:'#6e36c8'},
  Perdido:  {bg:'#fbbebe', fg:'#a80011'}
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

   Sin columna nueva ni fetch nuevo a Supabase: getPipeline() ya es la misma
   fuente en memoria que usa toda la vista del pipeline real, mantenida al
   día por shared/sync.js. */
function _regiNormCodigo(v){
  return String(v == null ? '' : v).trim().toUpperCase();
}

function _regiCodigoVinculo(r){
  return _regiNormCodigo(r && (r.regi || r.opd));
}

// Guarda la FILA completa (no solo el id): la vista de Estadísticas
// (_regiPairsVinculadas) necesita monto/mesCierre/cliente/proyecto del lado
// Ceven, y nada más consume este set salvo como booleano (_regiEsVinculada),
// así que no hay ningún otro lugar que romper con el cambio.
function _regiOpgVinculadosSet(){
  var set = {};
  (getPipeline() || []).forEach(function(r){
    var v = _regiNormCodigo(r.opg);
    if(v) set[v] = r;
  });
  return set;
}

/* Una oportunidad REGI está vinculada si su REGI aprobado —o su OPD cuando
   todavía no tiene REGI— coincide con el OPG de alguna fila real.
   `vinculados` la arma UNA vez por render (_regiOpgVinculadosSet) para no
   recorrer getPipeline() por fila. */
function _regiEsVinculada(r, vinculados){
  var codigo = _regiCodigoVinculo(r);
  return !!(codigo && vinculados[codigo]);
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
   comparar del otro lado (ver el comentario de _regiOpgVinculadosSet). */

/* [{hp, ceven}] — hp es la fila REGI (shape de _regiRowToPipeRow), ceven la
   fila real del pipeline (shape de getPipeline()). */
function _regiPairsVinculadas(){
  var vinculados = _regiOpgVinculadosSet();
  var pares = [];
  (window._regiPipeRows || []).forEach(function(hp){
    var codigo = _regiCodigoVinculo(hp);
    var ceven = codigo && vinculados[codigo];
    if(ceven) pares.push({hp: hp, ceven: ceven});
  });
  return pares;
}

/* ceven − hp: negativo si Ceven pronostica MENOS monto que HP. hp.montoArchivo
   (no hp.monto) es a propósito: `.monto` puede venir reemplazado por
   productos asignados dentro del carrito propio de REGI (feature del
   25/08/2026) — mezclarlo confundiría "lo que HP dice" con "lo que Ceven ya
   armó adentro de REGI", que es justo la comparación que se quiere evitar. */
function _regiDiffMonto(par){
  return (Number(par.ceven.monto) || 0) - (Number(par.hp.montoArchivo) || 0);
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
  var oh = _regiMesOrdinal(par.hp.mesCierre), oc = _regiMesOrdinal(par.ceven.mesCierre);
  if(oh === null || oc === null) return null;
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

/* KPI totales: {n, diffMonto (SUMA, pedido explícito), diffFechaProm
   (PROMEDIO — confirmado con el usuario: sumar desfasajes de fecha entre
   muchas oportunidades da un número poco legible), nFecha}. diffFechaProm
   queda null si ningún par tiene fecha de los dos lados. */
function _regiKpisTotales(pares){
  var diffMonto = 0, sumFecha = 0, nFecha = 0;
  pares.forEach(function(par){
    diffMonto += _regiDiffMonto(par);
    var df = _regiDiffFechaMeses(par);
    if(df !== null){ sumFecha += df; nFecha++; }
  });
  return { n: pares.length, diffMonto: diffMonto, diffFechaProm: nFecha ? (sumFecha / nFecha) : null, nFecha: nFecha };
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
/* Recibe el VALOR del selector "Vista" ('', '__regi', '__regi_stats' o un mes
   archivado) — antes recibía un booleano ("¿es REGI?"), pero con Estadísticas
   sumándose como tercer caso, quien decide qué mostrar necesita saber cuál de
   las tres es, no solo si es "la de antes" o no. Sigue siendo el ÚNICO lugar
   que decide qué se ve, llamado desde renderPipeline() en CADA render. */
function cevenRegiToggleVista(vista){
  var esRegi = (vista === '__regi');
  var esStats = (vista === '__regi_stats');
  var usaDatosRegi = esRegi || esStats;   // las dos consumen window._regiPipeRows

  var eraActiva = !!window._regiVistaWasActive;
  window._regiVistaWasActive = usaDatosRegi;
  if(usaDatosRegi && !eraActiva) window._regiPipeRows = null;

  var tNormal = document.getElementById('pipe-table-normal');
  var tRegi = document.getElementById('pipe-table-regi');
  var stats = document.getElementById('pipe-stats');
  if(tNormal) tNormal.style.display = usaDatosRegi ? 'none' : '';
  if(tRegi) tRegi.style.display = esRegi ? '' : 'none';
  if(stats) stats.style.display = esStats ? '' : 'none';

  var execWrap = document.getElementById('pipe-exec-wrap');
  var statusWrap = document.getElementById('pipe-status-wrap');
  if(execWrap) execWrap.style.display = usaDatosRegi ? 'none' : '';
  if(statusWrap) statusWrap.style.display = usaDatosRegi ? 'none' : '';

  // "Mostrar vinculadas": solo existe EN la tabla REGI (no en el pipeline
  // real ni en Estadísticas, que ya muestra las vinculadas por definición).
  var vincWrap = document.getElementById('regi-vinc-wrap');
  if(vincWrap) vincWrap.style.display = esRegi ? '' : 'none';

  // Facturado y Forecast del mes no tienen equivalente en REGI ni en
  // Estadísticas: no hay "facturado" en una oportunidad que todavía es de un
  // partner, y el monto único de la fila (ver el comentario de cabecera) ya
  // reemplaza la necesidad de un segundo KPI separado. El pipeline normal y
  // el archivo sí usan las dos tarjetas — quedan visibles ahí.
  var facturadoCard = document.getElementById('dash-facturado-card');
  var proyCard = document.getElementById('dash-proy-card');
  if(facturadoCard) facturadoCard.style.display = usaDatosRegi ? 'none' : '';
  if(proyCard) proyCard.style.display = usaDatosRegi ? 'none' : '';

  // exportPipeline() arma el Excel con las columnas del pipeline normal
  // (fecha/ejecutivo/OPG/factura...): no sabe leer una fila de REGI ni de
  // Estadísticas.
  var exportBtn = document.getElementById('pipe-export-btn');
  if(exportBtn) exportBtn.style.display = usaDatosRegi ? 'none' : '';

  // El dashboard de KPI del pipeline normal/REGI (#pipe-dashboard) lo pinta
  // cada render (_pipeTablaHTML / _regiPintarDashboard), que también decide
  // cuándo mostrarlo — salvo Estadísticas, que nunca lo toca porque arma sus
  // propias tarjetas adentro de #pipe-stats. Sin este apagado explícito,
  // entrar a Estadísticas después de haber estado en cualquiera de las otras
  // dos vistas dejaría ese dashboard viejo pegado en pantalla.
  if(esStats){
    var dash = document.getElementById('pipe-dashboard');
    if(dash) dash.style.display = 'none';
  }
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

function _regiRowToPipeRow(r){
  var montoArchivo = Number(r.amount) || 0;
  var productosMonto = (window._regiProductosTotales && window._regiProductosTotales[r.opd]) || 0;
  return {
    opd: r.opd, regi: r.regi || '',
    // El forecast a mano (forecast_override) reemplaza al del archivo — no
    // conviven, ver el comentario de cabecera. Incluye "Perdido", que el
    // archivo de HP no contempla. forecastArchivo se guarda aparte para
    // poder volver a él si alguna vez se limpia el override (ver
    // _regiCambiarForecast): sin esto, "— Sin definir —" dejaría la fila en
    // blanco en vez de volver a mostrar lo que dice el archivo.
    forecastArchivo: r.forecast || '',
    forecast: r.forecast_override || r.forecast || '',
    proyecto: r.opportunity || '', primaryPartner: r.primary_partner || '',
    drExpiration: r.dr_expiration || '',
    // cliente/monto/mesCierre: mismos nombres que una fila real, a propósito
    // (ver el comentario del encabezado) — así cevenPipeGroupBy() y
    // compañía las agrupan/ordenan sin que se las toque.
    cliente: r.account || '',
    // Con productos asignados, `monto` pasa a ser esa sumatoria — reemplaza
    // al del archivo en TODA la UI (fila, grupo, dashboard, orden). Sin
    // productos, sigue siendo el `amount` de HP. montoArchivo se guarda
    // aparte solo para el tooltip de la fila. window._regiProductosTotales
    // ya está armado por _cevenRegiPipeFetch() antes de mapear estas filas.
    montoArchivo: montoArchivo,
    productosMonto: productosMonto,
    monto: productosMonto > 0 ? productosMonto : montoArchivo,
    mesCierre: r.close_date ? String(r.close_date).slice(0, 7) : ''
  };
}

function _cevenRegiPipeFetch(){
  var url = _cevenRegiPipeRest('poly_regi_pipeline')
    + '?select=opd,regi,dr_expiration,opportunity,forecast,forecast_override,account,primary_partner,amount,close_date'
    + '&order=amount.desc';
  // Los productos asignados se traen en la MISMA pasada (no por fila, no
  // hay función de agregación en la base): son pocas filas por proyecto y
  // se suman acá — más simple que armar una vista o un rpc solo para esto.
  // Si ESTE pedido falla, no tira abajo el pipeline entero (que es dato de
  // producción real): se sigue mostrando con "Productos asignados" en 0 en
  // vez de con el cartel de error.
  var urlProd = _cevenRegiPipeRest('poly_regi_pipeline_productos') + '?select=opd,cantidad,precio_unitario';
  return Promise.all([
    cevenAuthedFetch(url, {method: 'GET'}),
    cevenAuthedFetch(urlProd, {method: 'GET'}).catch(function(){ return []; })
  ]).then(function(res){
    var totales = {};
    (Array.isArray(res[1]) ? res[1] : []).forEach(function(p){
      totales[p.opd] = (totales[p.opd] || 0) + (Number(p.cantidad) || 0) * (Number(p.precio_unitario) || 0);
    });
    window._regiProductosTotales = totales;
    window._regiPipeRows = (Array.isArray(res[0]) ? res[0] : []).map(_regiRowToPipeRow);
    return window._regiPipeRows;
  });
}

/* ── Render ───────────────────────────────────────────────────────────── */

function renderRegiPipeline(){
  if(window._regiPipeRows === null){
    var body = document.getElementById('regi-pipe-body');
    if(body) body.innerHTML = '<tr><td colspan="9" style="text-align:center;color:#aeaeb2;padding:24px">Cargando…</td></tr>';
    var dash = document.getElementById('pipe-dashboard');
    if(dash) dash.style.display = 'none';
    _cevenRegiPipeFetch().then(function(){
      // Si mientras tanto se cambió de vista, no pisa lo que se esté viendo.
      var sel = document.getElementById('archive-month-sel');
      if(sel && sel.value === '__regi') _renderRegiPipelineFromCache();
    }).catch(function(e){
      var b = document.getElementById('regi-pipe-body');
      if(b) b.innerHTML = '<tr><td colspan="9" style="text-align:center;color:#d70015;padding:24px">No se pudo cargar el pipeline REGI'
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
  rowsTotal.forEach(function(r){ r.vinculada = _regiEsVinculada(r, vinculados); });
  var nVinculadas = rowsTotal.filter(function(r){ return r.vinculada; }).length;
  _regiPintarToggleVinculadas(nVinculadas);

  var rows = window._regiMostrarVinculadas ? rowsTotal : rowsTotal.filter(function(r){ return !r.vinculada; });

  var q = (document.getElementById('pipe-search').value || '').toLowerCase().trim();
  var forecastFilter = window._regiForecastFilter || '';

  var mesesPresentes = {}, haySinFecha = false;
  rows.forEach(function(r){ if(r.mesCierre) mesesPresentes[r.mesCierre] = true; else haySinFecha = true; });
  var monthFilter = cevenPintarPillsMes(Object.keys(mesesPresentes).sort(), haySinFecha);

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

  _regiPintarDashboard(filtered, forecastFilter);

  var html = _regiTablaHTML(filtered);
  var _hayFiltros = !!(q || forecastFilter || monthFilter);
  var _vacio;
  if(rowsTotal.length === 0){
    _vacio = 'Todavía no se importó ningún Excel de REGI. Tocá "⬇ Importar Excel REGI".';
  } else if(rows.length === 0 && !window._regiMostrarVinculadas && nVinculadas > 0){
    // El caso lindo: no queda nada por atender. Se lo dice así y no como
    // "ninguna oportunidad coincide con los filtros" (que suena a que algo
    // está mal filtrado) para no ir a buscar el "✕ Limpiar filtros" al pedo.
    _vacio = '✓ Todas las oportunidades de REGI ya están vinculadas a un proyecto real. Tocá "Mostrar vinculadas ('+nVinculadas+')" para verlas.';
  } else {
    _vacio = _hayFiltros ? 'Ninguna oportunidad coincide con los filtros. Tocá "✕ Limpiar filtros".' : 'El Excel importado no tiene oportunidades.';
  }
  document.getElementById('regi-pipe-body').innerHTML = html || '<tr><td colspan="9" style="text-align:center;color:#aeaeb2;padding:24px">'+_vacio+'</td></tr>';
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
      var sel = document.getElementById('archive-month-sel');
      if(sel && sel.value === '__regi_stats') _renderRegiStatsFromCache();
    }).catch(function(e){
      if(empty) empty.textContent = 'No se pudo cargar el pipeline REGI' + ((e && e.message) ? (': ' + cevenEsc(e.message)) : '.');
    });
    return;
  }
  _renderRegiStatsFromCache();
}

function _renderRegiStatsFromCache(){
  var pares = _regiPairsVinculadas();
  window._regiStatsPares = pares;   // para que el <select> encuentre el par por opd sin recalcular

  var empty = document.getElementById('stats-empty');
  var body = document.getElementById('stats-body');
  if(!pares.length){
    if(empty){
      empty.style.display = 'block';
      empty.textContent = 'Todavía no hay ninguna oportunidad vinculada. Vinculá proyectos desde "🎯 Pipeline REGI" (o cargando el mismo código en el OPG del pipeline real) para verlas acá.';
    }
    if(body) body.style.display = 'none';
    return;
  }
  if(empty) empty.style.display = 'none';
  if(body) body.style.display = 'block';

  _regiStatsPintarKpis(_regiKpisTotales(pares));

  var porMes = _regiAgregarPorPeriodo(pares, function(mk){ return mk || ''; }, _mesLabelPoly);
  var porQ = _regiAgregarPorPeriodo(pares, _regiTrimestreKey, _regiTrimestreLabel);
  var mesBody = document.getElementById('stats-mes-body');
  var qBody = document.getElementById('stats-q-body');
  if(mesBody) mesBody.innerHTML = porMes.map(_regiStatsFilaPeriodoHTML).join('');
  if(qBody) qBody.innerHTML = porQ.map(_regiStatsFilaPeriodoHTML).join('');

  var sel = document.getElementById('stats-pick');
  if(sel){
    var prev = sel.value;
    sel.innerHTML = _regiStatsOpciones(pares);
    sel.value = pares.some(function(p){ return p.hp.opd === prev; }) ? prev : '';
  }
  _regiStatsPintarComparacion(sel ? sel.value : '');
}

function _regiStatsColor(v){
  if(v === null || v === undefined) return '#1d1d1f';
  return v < 0 ? '#d70015' : (v > 0 ? '#15863a' : '#1d1d1f');
}

function _regiStatsPintarKpis(kpis){
  var elMonto = document.getElementById('stats-kpi-monto');
  var elMontoSub = document.getElementById('stats-kpi-monto-sub');
  if(elMonto){
    elMonto.textContent = (kpis.diffMonto < 0 ? '-' : '+') + 'USD ' + fI(Math.abs(kpis.diffMonto));
    elMonto.style.color = _regiStatsColor(kpis.diffMonto);
  }
  if(elMontoSub){
    elMontoSub.textContent = 'sobre ' + kpis.n + (kpis.n === 1 ? ' oportunidad vinculada' : ' oportunidades vinculadas')
      + ' · negativo = Ceven pronostica MENOS monto que HP';
  }

  var elFecha = document.getElementById('stats-kpi-fecha');
  var elFechaSub = document.getElementById('stats-kpi-fecha-sub');
  if(elFecha){
    elFecha.textContent = (kpis.diffFechaProm === null) ? '—'
      : ((kpis.diffFechaProm > 0 ? '+' : '') + kpis.diffFechaProm.toFixed(1) + ' meses');
    elFecha.style.color = _regiStatsColor(kpis.diffFechaProm);
  }
  if(elFechaSub){
    elFechaSub.textContent = (kpis.nFecha
        ? ('promedio sobre ' + kpis.nFecha + (kpis.nFecha === 1 ? ' oportunidad' : ' oportunidades') + ' con fecha en los dos lados')
        : 'ninguna oportunidad vinculada tiene fecha en los dos lados')
      + ' · negativo = Ceven pronostica un cierre MÁS LEJOS que HP';
  }
}

function _regiStatsFilaPeriodoHTML(g){
  var fechaTxt = (g.diffFechaProm === null) ? '—' : ((g.diffFechaProm > 0 ? '+' : '') + g.diffFechaProm.toFixed(1) + ' m');
  return '<tr>'
    + '<td>' + cevenEsc(g.label) + '</td>'
    + '<td style="text-align:center">' + g.n + '</td>'
    + '<td style="text-align:right;font-weight:600;color:' + _regiStatsColor(g.diffMonto) + '">'
      + (g.diffMonto < 0 ? '-' : '+') + 'USD ' + fI(Math.abs(g.diffMonto)) + '</td>'
    + '<td style="text-align:right;font-weight:600;color:' + _regiStatsColor(g.diffFechaProm) + '">' + fechaTxt + '</td>'
  + '</tr>';
}

function _regiStatsOpciones(pares){
  var h = '<option value="">— Elegí una oportunidad —</option>';
  pares.forEach(function(par){
    h += '<option value="' + cevenEsc(par.hp.opd) + '">'
      + cevenEsc(par.ceven.cliente || par.hp.cliente || '—') + ' — '
      + cevenEsc(par.hp.proyecto || par.ceven.proyecto || '—')
      + ' (' + cevenEsc(par.hp.regi) + ')</option>';
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

  var diffMonto = _regiDiffMonto(par);
  var diffFecha = _regiDiffFechaMeses(par);
  var mesHp = par.hp.mesCierre ? _mesLabelPoly(par.hp.mesCierre) : '—';
  var mesCeven = par.ceven.mesCierre ? _mesLabelPoly(par.ceven.mesCierre) : '—';
  var estadoCeven = (typeof cevenEstadoLabel === 'function') ? cevenEstadoLabel(par.ceven.estado || 'Cotizado') : (par.ceven.estado || '—');

  box.innerHTML = '<table style="width:100%">'
    + '<thead><tr><th></th><th>HP (Excel)</th><th>Ceven (real)</th><th>Diferencia</th></tr></thead>'
    + '<tbody>'
      + _regiStatsFilaCompararHTML('Cliente / Proyecto',
          cevenEsc(par.hp.cliente || '—') + ' — ' + cevenEsc(par.hp.proyecto || '—'),
          cevenEsc(par.ceven.cliente || '—') + ' — ' + cevenEsc(par.ceven.proyecto || '—'),
          '—', null)
      + _regiStatsFilaCompararHTML('Monto',
          'USD ' + fI(par.hp.montoArchivo || 0),
          'USD ' + fI(par.ceven.monto || 0),
          (diffMonto < 0 ? '-' : '+') + 'USD ' + fI(Math.abs(diffMonto)), _regiStatsColor(diffMonto))
      + _regiStatsFilaCompararHTML('Cierre estimado', mesHp, mesCeven,
          diffFecha === null ? '—' : ((diffFecha > 0 ? '+' : '') + diffFecha + ' m'), _regiStatsColor(diffFecha))
      + _regiStatsFilaCompararHTML('Estado', '—', cevenEsc(estadoCeven), '—', null)
    + '</tbody></table>';
}

function _regiPintarDashboard(filtered, forecastFilter){
  var dash = document.getElementById('pipe-dashboard');
  if(!dash) return;
  dash.style.display = 'block';

  // Perdido se excluye de la suma — mismo criterio que "Total pipeline" en
  // el pipeline normal, que tampoco cuenta Perdido ni Facturado
  // (pipeline-view.js: sumPipeline = sumMonto - facturado - perdido). Acá
  // no hay Facturado, así que solo se resta Perdido.
  var sumMonto = 0, sumPerdido = 0, cliVistos = {}, nClientes = 0, byForecast = {};
  filtered.forEach(function(r){
    sumMonto += (r.monto || 0);
    if(r.forecast === 'Perdido') sumPerdido += (r.monto || 0);
    var ck = (r.cliente||'').trim().toLowerCase();
    if(ck && !cliVistos[ck]){ cliVistos[ck] = 1; nClientes++; }
    var fc = r.forecast || '';
    if(fc){
      if(!byForecast[fc]) byForecast[fc] = {count:0, monto:0};
      byForecast[fc].count++; byForecast[fc].monto += (r.monto || 0);
    }
  });

  document.getElementById('dash-count').textContent = nClientes;
  document.getElementById('dash-proyectos').textContent = filtered.length;
  _pipeSetLbl('dash-total-lbl', 'Monto total REGI');
  document.getElementById('dash-total').textContent = 'USD ' + fI(sumMonto - sumPerdido);
  _pipeSetLbl('dash-total-sub', 'sin Perdido · con productos asignados, ese monto reemplaza al del archivo de HP');

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
    + '<td colspan="9" style="padding:9px 12px;background:#f0f0f3;border-top:0.5px solid #d2d2d7">'
      + '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">'
        + '<span style="font-size:11px;width:12px;display:inline-block">'+(abierto?'▼':'▶')+'</span>'
        + '<strong style="font-size:13px">'+cevenEsc(g.label)+'</strong>'
        + '<span style="font-size:11px;color:#6e6e73">'+n+'</span>'
        + '<span style="flex:1"></span>'
        + '<strong style="font-size:13px;white-space:nowrap">USD '+fI(g.monto)+'</strong>'
      + '</div>'
    + '</td></tr>';
}

/* Forecast editable: un <select> coloreado según el valor elegido, no una
   pastilla fija. "— Sin definir —" cubre el caso —raro— de un archivo con
   la columna vacía y ningún override cargado todavía; sin esa opción el
   <select> caería en la primera del array (Commit) y mentiría sobre el
   valor real. */
function _regiForecastSelectHTML(r){
  var actual = r.forecast || '';
  var c = REGI_FORECAST_COLORS[actual] || {bg:'#fff', fg:'#6e6e73'};
  var h = '<select class="si" name="regi-forecast-'+cevenEsc(r.opd)+'" data-act="regi-forecast-edit" data-opd="'+cevenEsc(r.opd)+'"'
    + ' style="font-size:11px;font-weight:700;padding:2px 6px;background:'+c.bg+';color:'+c.fg+';border-color:'+c.fg+'">'
    + '<option value=""'+(!actual?' selected':'')+'>— Sin definir —</option>';
  Object.keys(REGI_FORECAST_COLORS).forEach(function(fc){
    h += '<option value="'+fc+'"'+(fc===actual?' selected':'')+'>'+fc+'</option>';
  });
  h += '</select>';
  return h;
}

function _regiRowHTML(r){
  var vencido = r.drExpiration && r.drExpiration < cevenHoyISO();
  // Cuando el monto de la fila viene de los productos asignados (reemplaza
  // al del archivo, ver el comentario de cabecera), un 🎯 + tooltip avisa
  // de dónde sale — sin eso, un número que de repente cambió de fuente se
  // ve idéntico al de siempre y nadie se entera de por qué no coincide con
  // el archivo de HP.
  var deProductos = r.productosMonto > 0;
  var montoTitle = deProductos
    ? 'Sumatoria de los productos asignados (el archivo de HP dice USD ' + fI(r.montoArchivo||0) + ')'
    : '';
  // Vinculada: el proyecto real ya existe (mismo OPG que este REGI) y es la
  // fuente de verdad — no tiene sentido seguir asignándole productos o
  // forecast a mano acá, así que la celda de Acciones se reduce a decirlo.
  // La fila se atenúa (mismo criterio que las pastillas apagadas del
  // dashboard) para que salte a la vista cuál ya está resuelta.
  var celdaAcc = r.vinculada
    ? '<span style="background:#e6f7ec;color:#15863a;border-radius:980px;padding:3px 10px;font-size:11px;font-weight:700;white-space:nowrap">✓ Vinculada</span>'
    : '<button class="bs" data-act="regi-editar" data-opd="'+cevenEsc(r.opd)+'" title="Asignar productos del catálogo a este proyecto" style="padding:2px 8px;font-size:12px">✎ Editar</button>'
      + ' <button class="bs" data-act="regi-copiar" data-opd="'+cevenEsc(r.opd)+'" title="Crear la cotización real en nuestro pipeline a partir de esta oportunidad" style="padding:2px 8px;font-size:12px;background:#e8f4ff;color:#0071e3;border-color:#b8ddff">'
        + ((window._regiCopiadas && window._regiCopiadas[r.opd]) ? '➕ Copiar de nuevo' : '➕ Copiar a Ceven') + '</button>';
  return '<tr'+(r.vinculada ? ' style="opacity:.55"' : '')+'>'
    + '<td style="font-size:12px;font-family:ui-monospace,Menlo,monospace">'+cevenEsc(r.opd||'—')+'</td>'
    + '<td style="font-size:12px;font-family:ui-monospace,Menlo,monospace">'+(r.regi ? cevenEsc(r.regi) : '<span style="color:#aeaeb2">sin REGI</span>')+'</td>'
    + '<td style="font-size:12px"><div style="max-width:280px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+cevenEsc(r.proyecto||'—')+'</div></td>'
    + '<td style="font-size:12px;color:#6e6e73">'+cevenEsc(r.primaryPartner||'—')+'</td>'
    + '<td style="text-align:center;overflow:visible">'+_regiForecastSelectHTML(r)+'</td>'
    + '<td style="font-size:12px;white-space:nowrap'+(vencido?';color:#d70015':'')+'" title="'+(vencido?'Deal Registration vencido':'')+'">'+cevenEsc(r.drExpiration ? _regiFechaDDMMYYYY(r.drExpiration) : '—')+'</td>'
    + '<td style="font-size:12px;white-space:nowrap">'+cevenEsc(r.mesCierre ? _mesLabelPoly(r.mesCierre) : '—')+'</td>'
    + '<td class="stk-monto" style="text-align:right;font-weight:500;white-space:nowrap;min-width:110px" title="'+cevenEsc(montoTitle)+'">'+(deProductos?'<span title="Monto de los productos asignados">🎯</span> ':'')+'USD '+fI(r.monto||0)+'</td>'
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

/* ── Editar el Forecast a mano ────────────────────────────────────────────
   No optimista a propósito: espera la confirmación del PATCH antes de tocar
   `window._regiPipeRows` y re-renderizar — mismo criterio que
   guardarRegiProductos() en pipeline-regi-productos.js. Si falla, el
   re-render deja el <select> como estaba (el objeto en memoria nunca
   cambió), que es el revert más simple y correcto. */
function _regiCambiarForecast(opd, valor){
  if(!opd) return;
  if(!cevenCanUsePipeline()){ showToast('Tu rol no permite editar proyectos REGI.'); renderPipeline(); return; }
  cevenAuthedFetch(_cevenRegiPipeRest('poly_regi_pipeline') + '?opd=eq.' + encodeURIComponent(opd), {
    method: 'PATCH',
    headers: {Prefer: 'return=minimal'},
    body: JSON.stringify({forecast_override: valor || null})
  }).then(function(){
    var row = (window._regiPipeRows || []).filter(function(r){ return r.opd === opd; })[0];
    // Limpiar el override (valor === '') no deja la fila en blanco: vuelve
    // a mostrar lo que dice el archivo, igual que hace la base con
    // forecast_override en null (ver el comentario de forecastArchivo).
    if(row) row.forecast = valor || row.forecastArchivo || '';
    if(typeof renderPipeline === 'function') renderPipeline();
    showToast('✓ Forecast actualizado' + (valor ? (': ' + valor) : ' (vuelve a mostrar el del archivo)') + '.');
  }).catch(function(e){
    showErr('No se pudo actualizar el forecast: ' + ((e && e.message) || 'error desconocido'));
    if(typeof renderPipeline === 'function') renderPipeline();
  });
}

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
      // La edición vive en pipeline-regi-productos.js (cargado después):
      // se llama por nombre y no por referencia directa, mismo criterio que
      // el resto del pipeline usa para hooks opcionales.
      else if(act === 'regi-editar' && typeof abrirRegiEditor === 'function') abrirRegiEditor(el.getAttribute('data-opd'));
      else if(act === 'regi-copiar') _regiCopiarAPipeline(el.getAttribute('data-opd'));
    });
    body.addEventListener('change', function(ev){
      var el = cevenActEl(ev, body);
      if(el && el.getAttribute('data-act') === 'regi-forecast-edit') _regiCambiarForecast(el.getAttribute('data-opd'), el.value);
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
