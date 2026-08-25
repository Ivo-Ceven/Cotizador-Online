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

   25/08/2026: la fila dejó de ser 100% de solo lectura en UN sentido —
   se le puede asignar productos del catálogo (poly_regi_pipeline_productos,
   ver js/pipeline-regi-productos.js). Los campos que vienen del Excel
   (regi/forecast/account/amount/...) siguen sin editarse a mano: la única
   forma de tocarlos sigue siendo reimportar. `r.productosMonto` es la
   sumatoria de esos productos, un monto DISTINTO de `r.monto` (el que
   reporta el archivo de HP) — los dos conviven como KPI a propósito, sin
   que uno pise al otro.

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

/* ── Mostrar/ocultar según la vista ──────────────────────────────────────
   Un solo punto de control, llamado desde renderPipeline() en CADA render
   (cambie o no la vista): así "Pipeline actual" y los meses archivados
   siempre quedan con todo visible, sin tener que acordarse de restaurarlo
   en cada lugar que sale de la vista REGI.

   El refetch (invalidar window._regiPipeRows) pasa SOLO en la transición
   false->true, no en cada render: si no, escribir en el buscador mientras
   se está en la vista REGI dispararía un pedido a Supabase por letra. */
function cevenRegiToggleVista(activa){
  var eraActiva = !!window._regiVistaWasActive;
  window._regiVistaWasActive = activa;
  if(activa && !eraActiva) window._regiPipeRows = null;

  var tNormal = document.getElementById('pipe-table-normal');
  var tRegi = document.getElementById('pipe-table-regi');
  if(tNormal) tNormal.style.display = activa ? 'none' : '';
  if(tRegi) tRegi.style.display = activa ? '' : 'none';

  var execWrap = document.getElementById('pipe-exec-wrap');
  var statusWrap = document.getElementById('pipe-status-wrap');
  if(execWrap) execWrap.style.display = activa ? 'none' : '';
  if(statusWrap) statusWrap.style.display = activa ? 'none' : '';

  // Facturado no tiene equivalente en REGI (no hay "facturado" en una
  // oportunidad que todavía es de un partner). El pipeline normal y el
  // archivo sí lo usan — queda visible ahí.
  var facturadoCard = document.getElementById('dash-facturado-card');
  if(facturadoCard) facturadoCard.style.display = activa ? 'none' : '';
  // La tarjeta de "Forecast del mes" (dash-proy-card) NO se oculta: en REGI
  // se repropone como "Productos asignados" (ver _regiPintarDashboard), el
  // segundo KPI que pidió el usuario. Mismo criterio que dash-total-card,
  // ya reproposta como "Monto total REGI" — renderPipeline() repinta sus
  // rótulos de siempre en cada pasada del pipeline normal, así que no queda
  // pegado al volver.

  // exportPipeline() arma el Excel con las columnas del pipeline normal
  // (fecha/ejecutivo/OPG/factura...): no sabe leer una fila de REGI.
  var exportBtn = document.getElementById('pipe-export-btn');
  if(exportBtn) exportBtn.style.display = activa ? 'none' : '';
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
  return {
    opd: r.opd, regi: r.regi || '', forecast: r.forecast || '',
    proyecto: r.opportunity || '', primaryPartner: r.primary_partner || '',
    drExpiration: r.dr_expiration || '',
    // cliente/monto/mesCierre: mismos nombres que una fila real, a propósito
    // (ver el comentario del encabezado) — así cevenPipeGroupBy() y
    // compañía las agrupan/ordenan sin que se las toque.
    cliente: r.account || '',
    monto: Number(r.amount) || 0,
    // Sumatoria propia de poly_regi_pipeline_productos (ver
    // js/pipeline-regi-productos.js), distinta de `monto` (lo que reporta
    // el archivo de HP). window._regiProductosTotales ya está armado por
    // _cevenRegiPipeFetch() antes de mapear estas filas.
    productosMonto: (window._regiProductosTotales && window._regiProductosTotales[r.opd]) || 0,
    mesCierre: r.close_date ? String(r.close_date).slice(0, 7) : ''
  };
}

function _cevenRegiPipeFetch(){
  var url = _cevenRegiPipeRest('poly_regi_pipeline')
    + '?select=opd,regi,dr_expiration,opportunity,forecast,account,primary_partner,amount,close_date'
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
  var rows = window._regiPipeRows || [];

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
    var hay = ((r.cliente||'')+' '+(r.proyecto||'')+' '+(r.regi||'')+' '+(r.primaryPartner||'')).toLowerCase();
    return hay.indexOf(q) !== -1;
  });

  var sortCol = window._pipeSort.col, sortDir = window._pipeSort.dir;
  var numericCols = {monto: 1, productosMonto: 1};
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
  var _vacio = rows.length === 0
    ? 'Todavía no se importó ningún Excel de REGI. Tocá "⬇ Importar Excel REGI".'
    : (_hayFiltros ? 'Ninguna oportunidad coincide con los filtros. Tocá "✕ Limpiar filtros".' : 'El Excel importado no tiene oportunidades.');
  document.getElementById('regi-pipe-body').innerHTML = html || '<tr><td colspan="9" style="text-align:center;color:#aeaeb2;padding:24px">'+_vacio+'</td></tr>';
  attachPipeSortHandlers();
  _regiBindDelegation();
}

function _regiPintarDashboard(filtered, forecastFilter){
  var dash = document.getElementById('pipe-dashboard');
  if(!dash) return;
  dash.style.display = 'block';

  var sumMonto = 0, sumProductos = 0, conProductos = 0, cliVistos = {}, nClientes = 0, byForecast = {};
  filtered.forEach(function(r){
    sumMonto += (r.monto || 0);
    sumProductos += (r.productosMonto || 0);
    if(r.productosMonto) conProductos++;
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
  document.getElementById('dash-total').textContent = 'USD ' + fI(sumMonto);
  _pipeSetLbl('dash-total-sub', 'Deal Registration de HP/Poly, del último Excel importado');

  // Segundo KPI (dash-proy-card, normalmente "Forecast del mes"): la
  // sumatoria de los productos que Ceven le asignó a cada proyecto, un
  // monto DISTINTO del de arriba — ver el comentario de cabecera y
  // js/pipeline-regi-productos.js.
  _pipeSetLbl('dash-proy-lbl', 'Productos asignados');
  document.getElementById('dash-proy').textContent = 'USD ' + fI(sumProductos);
  _pipeSetLbl('dash-proy-sub', conProductos + ' de ' + filtered.length + (filtered.length === 1 ? ' proyecto con productos cargados' : ' proyectos con productos cargados'));

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

function _regiForecastTagHTML(f){
  if(!f) return '<span style="color:#aeaeb2;font-size:11px">—</span>';
  var c = REGI_FORECAST_COLORS[f] || {bg:'#f2f2f7', fg:'#1d1d1f'};
  return '<span style="background:'+c.bg+';color:'+c.fg+';border-radius:980px;padding:2px 10px;font-size:11px;font-weight:700">'+cevenEsc(f)+'</span>';
}

function _regiRowHTML(r){
  var vencido = r.drExpiration && r.drExpiration < cevenHoyISO();
  return '<tr>'
    + '<td style="font-size:12px;font-family:ui-monospace,Menlo,monospace">'+(r.regi ? cevenEsc(r.regi) : '<span style="color:#aeaeb2">sin REGI</span>')+'</td>'
    + '<td style="font-size:12px"><div style="max-width:280px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+cevenEsc(r.proyecto||'—')+'</div></td>'
    + '<td style="font-size:12px;color:#6e6e73">'+cevenEsc(r.primaryPartner||'—')+'</td>'
    + '<td style="text-align:center">'+_regiForecastTagHTML(r.forecast)+'</td>'
    + '<td style="font-size:12px;white-space:nowrap'+(vencido?';color:#d70015':'')+'" title="'+(vencido?'Deal Registration vencido':'')+'">'+cevenEsc(r.drExpiration ? _regiFechaDDMMYYYY(r.drExpiration) : '—')+'</td>'
    + '<td style="font-size:12px;white-space:nowrap">'+cevenEsc(r.mesCierre ? _mesLabelPoly(r.mesCierre) : '—')+'</td>'
    + '<td style="text-align:right;font-weight:500;white-space:nowrap;min-width:110px">USD '+fI(r.monto||0)+'</td>'
    // Segundo monto: la sumatoria de los productos asignados (distinta del
    // "Monto" de arriba, que es lo que reporta el archivo de HP). Sin
    // productos cargados se dice con un guión, no con "USD 0" — un 0 se
    // leería como "se cotizó en cero" y acá solo significa "sin cargar".
    // stk-monto/stk-act: ahora son las ÚLTIMAS dos columnas de la tabla
    // (ver el comentario del <th> en index.html) — "Monto" perdió la clase.
    + '<td class="stk-monto" style="text-align:right;font-weight:500;white-space:nowrap;min-width:110px;color:'+(r.productosMonto?'#1d1d1f':'#aeaeb2')+'">'+(r.productosMonto ? 'USD '+fI(r.productosMonto) : '—')+'</td>'
    + '<td class="stk-act" style="text-align:center;white-space:nowrap"><button class="bs" data-act="regi-editar" data-opd="'+cevenEsc(r.opd)+'" title="Asignar productos del catálogo a este proyecto" style="padding:2px 8px;font-size:12px">✎ Editar</button></td>'
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
