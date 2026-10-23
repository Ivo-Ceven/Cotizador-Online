/* ============================================================================
   COMPRAS ESTIMADAS  ·  src/compras/js/compras.js
   ----------------------------------------------------------------------------
   Trae el pipeline, las cotizaciones y el historial de estados, y los pinta.
   Toda la cuenta vive en shared/compras-forecast.js (lógica pura, con test):
   esto solo busca los datos, aplica los filtros y dibuja.

   Fuentes (REST con la sesión del usuario; RLS deja leer a todo el staff):
     · public.pipeline           estado, mes de cierre, estados por artículo
     · public.cotizaciones       las líneas (SKU, cantidad, precio)
     · public.pipeline_transiciones   historial de estados, para calibrar. Si la
                                 tabla no existe todavía, la página funciona igual
                                 y lo dice: la calibración queda en la base.
     · public.app_settings       brand='compras', key='fc_config': las
                                 probabilidades y umbrales editados. Solo escribe
                                 el admin (la policy lo exige: ceven_can_write_brand).
   ========================================================================== */
(function(){
  'use strict';

  var REST = (window.SUPABASE_URL || '') + '/rest/v1/';
  var CFG_BRAND = 'compras', CFG_KEY = 'fc_config';
  var MARCAS = {apple: 'Apple', poly: 'Poly', legamaster: 'Legamaster', huawei: 'Huawei', hp: 'HP'};
  var ESTADOS = ['Proyecto', 'Cotizado', 'Negociacion', 'Commit', 'Con OC', 'Autorizando'];

  var S = {
    pipeline: [], cotiz: [], trans: null, cfgGuardada: null,
    cfg: null, resumen: {}, bases: null, res: null,
    estados: {},                 // estado -> incluido
    abiertos: {},                // marca|sku -> detalle desplegado
    visibles: [],                // artículos que se ven ahora (para el CSV)
    editando: false,
    excluidos: {},               // 'marca|id' -> true: órdenes sacadas a mano del cálculo
    full: null,                  // el mismo cálculo SIN exclusiones (para listar lo que se puede sacar)
    lista: [],                   // negocios del cálculo completo, de mayor a menor
    panelExcl: false
  };
  ESTADOS.forEach(function(e){ S.estados[e] = true; });

  /* Las órdenes quitadas se recuerdan en ESTE navegador (no se comparten): es una
     decisión de análisis de quien mira, no un dato del negocio. Por eso la página
     avisa siempre que hay exclusiones activas. Todo acceso a localStorage va en
     try/catch: en ventana privada o con el almacenamiento bloqueado puede tirar. */
  var EXCL_KEY = 'ceven_fc_excluidos_v1';
  function leerExcluidos(){
    try{
      var arr = JSON.parse(localStorage.getItem(EXCL_KEY) || '[]');
      if(Array.isArray(arr)) arr.forEach(function(k){ if(typeof k === 'string') S.excluidos[k] = true; });
    }catch(e){}
  }
  function guardarExcluidos(){
    try{ localStorage.setItem(EXCL_KEY, JSON.stringify(Object.keys(S.excluidos))); }catch(e){}
  }
  leerExcluidos();

  function $(id){ return document.getElementById(id); }
  function esc(s){ return cevenEsc(s); }

  /* ── Formato ─────────────────────────────────────────────────────────── */
  function fU(n){
    n = Number(n) || 0;
    return n.toLocaleString('es-AR', {maximumFractionDigits: Math.abs(n) < 100 && n % 1 !== 0 ? 1 : 0});
  }
  function fM(n){ return 'US$ ' + (Number(n) || 0).toLocaleString('es-AR', {maximumFractionDigits: 0}); }
  function fPct(p){ return (p * 100).toLocaleString('es-AR', {maximumFractionDigits: 0}) + '%'; }
  function fMes(k){
    if(!k || k === 'sin mes') return 'Sin mes';
    var m = /^(\d{4})-(\d{2})$/.exec(k);
    if(!m) return k;
    return new Date(+m[1], +m[2] - 1, 1).toLocaleDateString('es-AR', {month: 'short', year: 'numeric'});
  }
  function ordMes(a, b){
    if(a === 'sin mes') return 1;
    if(b === 'sin mes') return -1;
    return a < b ? -1 : (a > b ? 1 : 0);
  }
  function aviso(txt){
    var el = $('fc-aviso');
    if(!txt){ el.hidden = true; el.textContent = ''; return; }
    el.hidden = false; el.textContent = txt;
  }

  /* ── Datos ───────────────────────────────────────────────────────────── */

  /* PostgREST corta en 1000 filas por pedido: se pagina hasta agotar. */
  function traer(path){
    var out = [];
    function pagina(off){
      var sep = path.indexOf('?') === -1 ? '?' : '&';
      return cevenAuthedFetch(REST + path + sep + 'limit=1000&offset=' + off, {method: 'GET'}).then(function(rows){
        rows = Array.isArray(rows) ? rows : [];
        out = out.concat(rows);
        return rows.length === 1000 ? pagina(off + 1000) : out;
      });
    }
    return pagina(0);
  }

  function cargar(){
    aviso('');
    $('fc-kpis').innerHTML = '<div class="fc-vacio">Cargando…</div>';
    var pPip = traer('pipeline?select=brand,id,qNum,cliente,proyecto,ejecutivo,estado,mesCierre,moneda,skuStatus,skuMesCierre,skuPartialQty,skuArchivedQty,fechaMod,fechaISO');
    var pCot = traer('cotizaciones?select=brand,qnum,lineas,borrada_at&borrada_at=is.null');
    // Opcionales: si fallan (tabla sin crear, sin config guardada), la página sigue.
    var pTr  = traer('pipeline_transiciones?select=brand,pipeline_id,estado_de,estado_a,at&order=at.asc')
      .catch(function(){ return null; });
    var pCfg = cevenAuthedFetch(REST + 'app_settings?select=value&brand=eq.' + CFG_BRAND + '&key=eq.' + CFG_KEY, {method: 'GET'})
      .then(function(rows){
        try{ return (rows && rows[0] && rows[0].value) ? JSON.parse(rows[0].value) : null; }catch(e){ return null; }
      }).catch(function(){ return null; });

    return Promise.all([pPip, pCot, pTr, pCfg]).then(function(r){
      S.pipeline = r[0]; S.cotiz = r[1]; S.trans = r[2]; S.cfgGuardada = r[3];
      podarExcluidos();
      armarMeses();
      render();
    }).catch(function(err){
      $('fc-kpis').innerHTML = '';
      $('fc-tabla').innerHTML = '';
      aviso('No se pudieron leer los datos' + (err && err.message ? ': ' + err.message : '') + '. Revisá la conexión y tocá Actualizar.');
    });
  }

  /* Una orden que ya no está en el pipeline (se archivó, se borró) deja de
     necesitar su exclusión: se olvida para que la lista no crezca para siempre. */
  function podarExcluidos(){
    var hay = {}, cambio = false;
    S.pipeline.forEach(function(f){ hay[f.brand + '|' + f.id] = true; });
    Object.keys(S.excluidos).forEach(function(k){ if(!hay[k]){ delete S.excluidos[k]; cambio = true; } });
    if(cambio) guardarExcluidos();
  }

  /* Los meses de cierre que existen en el pipeline abierto, para el filtro. */
  function armarMeses(){
    var sel = $('fc-hasta'), actual = sel.value, ms = {};
    S.pipeline.forEach(function(f){ if(f.mesCierre && /^\d{4}-\d{2}$/.test(f.mesCierre)) ms[f.mesCierre] = 1; });
    var lista = Object.keys(ms).sort();
    sel.innerHTML = '<option value="">Todos los meses</option>' + lista.map(function(m){
      return '<option value="' + esc(m) + '">' + esc(fMes(m)) + '</option>';
    }).join('');
    if(actual && ms[actual]) sel.value = actual;
  }

  /* ── Cálculo ─────────────────────────────────────────────────────────── */
  function calcular(){
    S.cfg = cevenFcConfig(S.cfgGuardada);
    S.resumen = cevenFcResumirTransiciones(S.trans || []);
    S.bases = cevenFcBaseCalibrada(S.cfg, S.resumen);
    var marca = $('fc-marca').value;
    var base = {
      pipeline: S.pipeline, cotizaciones: S.cotiz, cfg: S.cfg, bases: S.bases, ahora: new Date(),
      marcas: marca ? [marca] : [], hastaMes: $('fc-hasta').value,
      estados: ESTADOS.filter(function(e){ return S.estados[e]; })
    };
    // Dos corridas con los mismos filtros: la completa alimenta la lista de órdenes
    // que se pueden quitar (así una ya quitada sigue apareciendo, para devolverla);
    // la otra es la que se muestra.
    S.full = cevenFcConstruir(base);
    S.lista = cevenFcNegocios(S.full.articulos);
    base.excluir = Object.keys(S.excluidos);
    S.res = cevenFcConstruir(base);
    // La búsqueda por texto recorta los artículos; todo lo demás se recalcula sobre lo que queda.
    var q = ($('fc-q').value || '').trim().toLowerCase();
    S.visibles = S.res.articulos.filter(function(a){
      return !q || (a.sku + ' ' + a.desc).toLowerCase().indexOf(q) !== -1;
    }).sort(function(a, b){ return b.estimado - a.estimado || b.total - a.total; });
    S.sub = cevenFcResumir(S.visibles);
  }

  /* ── Pintado ─────────────────────────────────────────────────────────── */
  function render(){
    calcular();
    pintarEstados();
    pintarExcl();
    pintarKpis();
    pintarTabla();
    pintarMeses();
    pintarProbs();
    $('fc-csv').disabled = !S.visibles.length;
    $('fc-editar').hidden = !(typeof cevenIsAdmin === 'function' && cevenIsAdmin());
  }

  function pintarEstados(){
    $('fc-estados').innerHTML = ESTADOS.map(function(e){
      var p = cevenEstadoPill(e), on = S.estados[e];
      return '<button type="button" class="fc-chip" data-est="' + esc(e) + '" aria-pressed="' + (on ? 'true' : 'false') + '"'
        + (on ? ' style="background:' + p.bg + ';border-color:' + p.fg + '33"' : '') + '>'
        + esc(cevenEstadoLabel(e)) + '</button>';
    }).join('');
  }

  /* ── Quitar órdenes ──────────────────────────────────────────────────── */
  function pintarExcl(){
    var n = 0, un = 0, mo = 0, nombres = [];
    S.lista.forEach(function(o){
      if(!S.excluidos[o.key]) return;
      n++; un += o.unidades; mo += o.monto;
      nombres.push(o.cliente || ('#' + o.qNum));
    });
    S.exclN = n;
    var badge = $('fc-quitar-n');
    badge.hidden = !n; badge.textContent = String(n);

    // Aviso permanente: con exclusiones activas, los totales no son "todo el pipeline".
    var bar = $('fc-excl-bar');
    if(!n){ bar.hidden = true; bar.innerHTML = ''; }
    else{
      bar.hidden = false;
      bar.innerHTML = esc((n === 1 ? '1 orden quitada' : n + ' órdenes quitadas') + ' del cálculo (' + fU(un) + ' u. · ' + fM(mo) + ' de valor de venta): '
        + nombres.slice(0, 3).join(', ') + (nombres.length > 3 ? ' y ' + (nombres.length - 3) + ' más' : '') + '. Los totales no las incluyen.')
        + '<button type="button" id="fc-restaurar-bar">Restaurar</button>';
    }

    $('fc-excl').hidden = !S.panelExcl;
    $('fc-quitar').setAttribute('aria-expanded', S.panelExcl ? 'true' : 'false');
    if(!S.panelExcl) return;

    var cont = $('fc-excl-lista'), sc = cont.scrollTop;
    if(!S.lista.length){ cont.innerHTML = '<div class="fc-vacio">No hay negocios para estos filtros.</div>'; return; }
    var h = '<div class="fc-excl-fila hd"><span></span><span>Negocio</span><span>Estado</span><span class="n">Unidades</span><span class="n oculta-m">Valor</span><span class="n oculta-m">Estimado</span></div>';
    S.lista.forEach(function(o){
      var on = !!S.excluidos[o.key], p = cevenEstadoPill(o.estado);
      h += '<label class="fc-excl-fila' + (on ? ' on' : '') + '">'
        + '<input type="checkbox" data-k="' + esc(o.key) + '"' + (on ? ' checked' : '') + '>'
        + '<div class="fc-excl-nom">' + esc(o.cliente || '—') + (o.proyecto ? ' · ' + esc(o.proyecto) : '')
        + '<span>' + esc(MARCAS[o.brand] || o.brand) + ' · #' + esc(String(o.qNum)) + (o.ejecutivo ? ' · ' + esc(o.ejecutivo) : '') + ' · ' + o.articulos + (o.articulos === 1 ? ' equipo' : ' equipos') + '</span></div>'
        + '<div><span class="fc-pill" style="background:' + p.bg + ';color:' + p.fg + '">' + esc(cevenEstadoLabel(o.estado)) + '</span></div>'
        + '<div class="n">' + fU(o.unidades) + '</div><div class="n oculta-m">' + fM(o.monto) + '</div><div class="n oculta-m">' + fU(o.estimado) + '</div></label>';
    });
    cont.innerHTML = h;
    cont.scrollTop = sc;
  }

  function quitar(key, on){
    if(on) S.excluidos[key] = true; else delete S.excluidos[key];
    guardarExcluidos();
    render();
  }
  function restaurarTodos(){
    S.excluidos = {};
    guardarExcluidos();
    render();
  }

  function pintarKpis(){
    var t = S.sub.totales;
    var pct = t.total > 0 ? t.estimado / t.total : 0;
    var sin = S.res.sinCotizacion.length;
    $('fc-kpis').innerHTML =
        kpi('Necesidad total', fU(t.total) + ' u.', 'si cierran todos los negocios abiertos', '')
      + kpi('Estimado a comprar', fU(t.estimado) + ' u.', fPct(pct) + ' de la necesidad total, según probabilidad de cierre', 'est')
      + kpi('Valor de venta', fM(t.montoEstimado), 'estimado · total ' + fM(t.montoTotal), '')
      + kpi('Negocios', String(t.negocios), t.articulos + ' equipos distintos' + (sin ? ' · ' + sin + ' sin cotización encontrada' : ''), '');
  }
  function kpi(k, v, s, cls){
    return '<div class="fc-kpi ' + cls + '"><div class="k">' + esc(k) + '</div><div class="v">' + esc(v) + '</div><div class="s">' + esc(s) + '</div></div>';
  }

  function pintarTabla(){
    var t = $('fc-tabla');
    if(!S.visibles.length){
      t.innerHTML = '<tbody><tr><td class="fc-vacio l">No hay equipos para estos filtros.</td></tr></tbody>';
      return;
    }
    var h = '<thead>'
      + '<tr class="gr"><th></th><th></th><th colspan="2" class="g-tot">Necesidad total</th><th colspan="3" class="g-est sep">Estimado</th></tr>'
      + '<tr><th class="l">Equipo</th><th>Marca</th>'
      + '<th class="g-tot">Unidades</th><th class="g-tot">Valor</th>'
      + '<th class="g-est sep">Unidades</th><th class="g-est">Valor</th><th class="g-est">%</th></tr></thead><tbody>';
    S.visibles.forEach(function(a){
      var k = a.brand + '|' + a.sku, abierta = !!S.abiertos[k];
      h += '<tr class="fc-fila' + (abierta ? ' fc-abierta' : '') + '" data-k="' + esc(k) + '">'
        + '<td class="l"><span class="fc-flecha">▸</span><span class="fc-sku">' + esc(a.sku) + '</span>'
        + (a.desc ? '<span class="fc-desc">' + esc(a.desc) + '</span>' : '') + '</td>'
        + '<td><span class="fc-marca">' + esc(MARCAS[a.brand] || a.brand) + '</span></td>'
        + '<td class="g-tot">' + fU(a.total) + '</td><td class="g-tot">' + fM(a.montoTotal) + '</td>'
        + '<td class="g-est sep">' + fU(a.estimado) + '</td><td class="g-est">' + fM(a.montoEstimado) + '</td>'
        + '<td class="g-est">' + fPct(a.total > 0 ? a.estimado / a.total : 0) + '</td></tr>';
      if(abierta) h += detalle(a);
    });
    var t2 = S.sub.totales;
    h += '<tr class="fc-tot"><td class="l">Total</td><td></td>'
      + '<td class="g-tot">' + fU(t2.total) + '</td><td class="g-tot">' + fM(t2.montoTotal) + '</td>'
      + '<td class="g-est sep">' + fU(t2.estimado) + '</td><td class="g-est">' + fM(t2.montoEstimado) + '</td>'
      + '<td class="g-est">' + fPct(t2.total > 0 ? t2.estimado / t2.total : 0) + '</td></tr></tbody>';
    t.innerHTML = h;
  }

  function detalle(a){
    var negs = a.negocios.slice().sort(function(x, y){ return y.estimado - x.estimado; });
    var h = '<tr class="fc-det"><td colspan="7"><div class="fc-inner"><table><thead><tr>'
      + '<th class="l">Negocio</th><th class="l">Ejecutivo</th><th>Estado</th><th>Cierre</th><th>Unidades</th><th>Prob.</th><th>Estimado</th><th></th></tr></thead><tbody>';
    negs.forEach(function(n){
      var p = cevenEstadoPill(n.estado), d = n.detalle;
      var why = 'Base ' + fPct(d.base)
        + (d.edadDias !== null ? ' · ' + d.edadDias + ' días sin tocar' + (d.fEdad < 1 ? ' (×' + d.fEdad.toFixed(2) + ')' : '') : '')
        + (d.vencido ? ' · cierre vencido (×' + d.fVencido.toFixed(2) + ')' : '');
      h += '<tr><td class="l">' + esc(n.cliente || '—') + (n.proyecto ? ' · ' + esc(n.proyecto) : '')
        + ' <span class="fc-sub">#' + esc(String(n.qNum)) + '</span></td>'
        + '<td class="l">' + esc(n.ejecutivo || '—') + '</td>'
        + '<td><span class="fc-pill" style="background:' + p.bg + ';color:' + p.fg + '">' + esc(cevenEstadoLabel(n.estado)) + '</span></td>'
        + '<td>' + esc(fMes(n.mes)) + (d.vencido ? ' <span class="fc-mal" title="Mes de cierre ya vencido">●</span>' : '') + '</td>'
        + '<td>' + fU(n.unidades) + '</td><td title="' + esc(why) + '">' + fPct(n.prob) + '</td><td>' + fU(n.estimado) + '</td>'
        + '<td><button type="button" class="fc-x" data-ex="' + esc(n.brand + '|' + n.id) + '" title="Quitar este negocio completo del cálculo (todos sus equipos)">✕</button></td></tr>';
    });
    return h + '</tbody></table></div></td></tr>';
  }

  function pintarMeses(){
    var pm = S.sub.porMes, ks = Object.keys(pm).sort(ordMes);
    if(!ks.length){ $('fc-meses').innerHTML = '<tbody><tr><td class="fc-vacio l">Sin datos.</td></tr></tbody>'; return; }
    var h = '<thead><tr class="gr"><th></th><th colspan="2" class="g-tot">Necesidad total</th><th colspan="2" class="g-est sep">Estimado</th></tr>'
      + '<tr><th class="l">Mes de cierre</th><th class="g-tot">Unidades</th><th class="g-tot">Valor</th><th class="g-est sep">Unidades</th><th class="g-est">Valor</th></tr></thead><tbody>';
    ks.forEach(function(k){
      var m = pm[k];
      h += '<tr><td class="l">' + esc(fMes(k)) + '</td><td class="g-tot">' + fU(m.total) + '</td><td class="g-tot">' + fM(m.montoTotal)
        + '</td><td class="g-est sep">' + fU(m.estimado) + '</td><td class="g-est">' + fM(m.montoEstimado) + '</td></tr>';
    });
    $('fc-meses').innerHTML = h + '</tbody>';
  }

  /* Probabilidad que efectivamente se está aplicando hoy por estado (promedio
     ponderado por unidades): es donde se ve el efecto de la edad y el vencimiento. */
  function probHoy(){
    var acc = {};
    S.res.articulos.forEach(function(a){
      a.negocios.forEach(function(n){
        var o = acc[n.estado] = acc[n.estado] || {u: 0, e: 0};
        o.u += n.unidades; o.e += n.estimado;
      });
    });
    return acc;
  }

  function pintarProbs(){
    var cfg = S.cfg, hoy = probHoy(), hayHist = S.trans && S.trans.length;
    var totalRes = 0;
    ESTADOS.forEach(function(e){ totalRes += S.bases[e].n; });
    $('fc-calib-estado').textContent = S.trans === null
      ? 'Sin historial todavía: la calibración usa solo la base'
      : (totalRes ? totalRes + ' resultados observados' : (hayHist ? 'Registrando… todavía no hay negocios resueltos' : 'Registro vacío: la calibración usa solo la base'));

    var h = '<thead><tr><th class="l">Estado</th><th>Base inicial</th><th>Umbral</th><th>Observado</th>'
      + '<th>Base calibrada</th><th class="g-est">Aplicada hoy</th></tr></thead><tbody>';
    ESTADOS.forEach(function(e){
      var c = cfg.prob[e], b = S.bases[e], p = cevenEstadoPill(e), o = hoy[e];
      h += '<tr><td class="l"><span class="fc-pill" style="background:' + p.bg + ';color:' + p.fg + '">' + esc(cevenEstadoLabel(e)) + '</span></td>'
        + '<td>' + fPct(c.base) + '</td><td>' + fPct(c.min) + ' – ' + fPct(c.max) + '</td>'
        + '<td>' + (b.observada === null ? '<span class="fc-sub">—</span>' : fPct(b.observada) + ' <span class="fc-sub">(' + b.n + ')</span>') + '</td>'
        + '<td>' + fPct(b.efectiva) + '</td>'
        + '<td class="g-est">' + (o && o.u > 0 ? fPct(o.e / o.u) : '<span class="fc-sub">—</span>') + '</td></tr>';
    });
    $('fc-probs').innerHTML = h + '</tbody>';
    $('fc-params').innerHTML =
        '<span>Gracia: <b>' + cfg.edad.graciaDias + ' días</b> sin tocar</span>'
      + '<span>Luego pierde <b>' + (cfg.edad.caidaPorDia * 100).toLocaleString('es-AR', {maximumFractionDigits: 2}) + '%</b> por día, hasta quedar en <b>' + fPct(cfg.edad.pisoFactor) + '</b> de la base</span>'
      + '<span>Cierre vencido: <b>×' + cfg.vencido.factor.toFixed(2) + '</b></span>'
      + '<span>Peso de la base frente a lo observado: <b>' + cfg.calib.k + ' negocios</b></span>'
      + '<span>Con OC y Autorizando no se erosionan con el tiempo</span>';
  }

  /* ── Edición (solo admin) ────────────────────────────────────────────── */
  function abrirForm(cfgInicial){
    var c = cfgInicial || S.cfg;
    function pct(x){ return +(x * 100).toFixed(2); }
    var h = '<table><thead><tr><th>Estado</th><th>Base %</th><th>Mín %</th><th>Máx %</th></tr></thead><tbody>';
    ESTADOS.forEach(function(e){
      var p = c.prob[e];
      h += '<tr><td>' + esc(cevenEstadoLabel(e)) + '</td>'
        + '<td><input type="number" min="0" max="100" step="1" data-f="' + e + '.base" value="' + pct(p.base) + '"></td>'
        + '<td><input type="number" min="0" max="100" step="1" data-f="' + e + '.min" value="' + pct(p.min) + '"></td>'
        + '<td><input type="number" min="0" max="100" step="1" data-f="' + e + '.max" value="' + pct(p.max) + '"></td></tr>';
    });
    h += '</tbody></table><div class="fila">'
      + campo('Gracia (días)', 'edad.graciaDias', c.edad.graciaDias, 0, 3650, 1)
      + campo('Caída por día (%)', 'edad.caidaPorDia', pct(c.edad.caidaPorDia), 0, 100, 0.1)
      + campo('Piso de la edad (% de la base)', 'edad.pisoFactor', pct(c.edad.pisoFactor), 0, 100, 1)
      + campo('Factor si el cierre venció (%)', 'vencido.factor', pct(c.vencido.factor), 0, 100, 1)
      + campo('Peso de la base (negocios)', 'calib.k', c.calib.k, 0, 100000, 1)
      + '</div><div class="botones"><button type="button" class="fc-btn fc-btn-pri" id="fc-guardar">Guardar</button>'
      + '<button type="button" class="fc-btn" id="fc-defaults">Valores originales</button>'
      + '<button type="button" class="fc-btn" id="fc-cancelar">Cancelar</button><span class="fc-msg" id="fc-msg"></span></div>';
    var f = $('fc-form');
    f.innerHTML = h; f.hidden = false; S.editando = true;
  }
  function campo(lbl, f, v, mn, mx, st){
    return '<label>' + esc(lbl) + '<input type="number" min="' + mn + '" max="' + mx + '" step="' + st + '" data-f="' + f + '" value="' + v + '"></label>';
  }
  function leerForm(){
    var out = {prob: {}, edad: {}, vencido: {}, calib: {}};
    var inputs = $('fc-form').querySelectorAll('input[data-f]');
    for(var i = 0; i < inputs.length; i++){
      var path = inputs[i].getAttribute('data-f').split('.'), raw = parseFloat(inputs[i].value);
      if(isNaN(raw)) continue;
      var esPct = !(path[0] === 'edad' && path[1] === 'graciaDias') && !(path[0] === 'calib');
      var val = esPct ? raw / 100 : raw;
      if(ESTADOS.indexOf(path[0]) !== -1){ (out.prob[path[0]] = out.prob[path[0]] || {})[path[1]] = val; }
      else { out[path[0]][path[1]] = val; }
    }
    return out;
  }
  function guardar(){
    var msg = $('fc-msg'), cfg = cevenFcConfig(leerForm());   // saneada: nunca se guarda algo roto
    msg.textContent = 'Guardando…';
    cevenAuthedFetch(REST + 'app_settings', {
      method: 'POST',
      headers: {'Prefer': 'resolution=merge-duplicates,return=minimal'},
      body: JSON.stringify([{brand: CFG_BRAND, key: CFG_KEY, value: JSON.stringify(cfg)}])
    }).then(function(){
      S.cfgGuardada = cfg; cerrarForm(); render();
      if(typeof showToast === 'function') showToast('✓ Probabilidades guardadas.');
    }).catch(function(err){
      msg.textContent = 'No se pudo guardar' + (err && err.message ? ': ' + err.message : '') + '.';
    });
  }
  function cerrarForm(){ $('fc-form').hidden = true; $('fc-form').innerHTML = ''; S.editando = false; }

  /* ── CSV ─────────────────────────────────────────────────────────────── */
  function csv(){
    var n = function(x){ return (Math.round((Number(x) || 0) * 100) / 100).toString().replace('.', ','); };
    var q = function(s){ return '"' + String(s == null ? '' : s).replace(/"/g, '""') + '"'; };
    var filas = [['Marca', 'SKU', 'Descripción', 'Unidades total', 'Valor total USD', 'Unidades estimadas', 'Valor estimado USD']];
    S.visibles.forEach(function(a){
      filas.push([MARCAS[a.brand] || a.brand, a.sku, a.desc, n(a.total), n(a.montoTotal), n(a.estimado), n(a.montoEstimado)]);
    });
    // Un CSV suelto se lee sin la pantalla: si hay órdenes quitadas, queda dicho adentro.
    if(S.exclN) filas.push([], ['Nota: este detalle NO incluye ' + S.exclN + (S.exclN === 1 ? ' orden quitada' : ' órdenes quitadas') + ' a mano del cálculo.']);
    var txt = '﻿' + filas.map(function(f){ return f.map(q).join(';'); }).join('\r\n');
    var url = URL.createObjectURL(new Blob([txt], {type: 'text/csv;charset=utf-8'}));
    var a = document.createElement('a');
    a.href = url; a.download = 'compras-estimadas-' + new Date().toISOString().slice(0, 10) + '.csv';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function(){ URL.revokeObjectURL(url); }, 1000);
  }

  /* ── Eventos ─────────────────────────────────────────────────────────── */
  $('fc-marca').addEventListener('change', render);
  $('fc-hasta').addEventListener('change', render);
  $('fc-q').addEventListener('input', render);
  $('fc-recargar').addEventListener('click', cargar);
  $('fc-csv').addEventListener('click', csv);
  $('fc-editar').addEventListener('click', function(){ if(S.editando) cerrarForm(); else abrirForm(); });
  $('fc-estados').addEventListener('click', function(ev){
    var b = ev.target.closest ? ev.target.closest('button[data-est]') : null;
    if(!b) return;
    var e = b.getAttribute('data-est');
    S.estados[e] = !S.estados[e];
    render();
  });
  $('fc-quitar').addEventListener('click', function(){ S.panelExcl = !S.panelExcl; pintarExcl(); });
  $('fc-restaurar-todos').addEventListener('click', restaurarTodos);
  $('fc-excl-bar').addEventListener('click', function(ev){ if(ev.target && ev.target.id === 'fc-restaurar-bar') restaurarTodos(); });
  $('fc-excl-lista').addEventListener('change', function(ev){
    var cb = ev.target;
    if(cb && cb.type === 'checkbox') quitar(cb.getAttribute('data-k'), cb.checked);
  });
  $('fc-tabla').addEventListener('click', function(ev){
    var x = ev.target.closest ? ev.target.closest('button[data-ex]') : null;
    if(x){ quitar(x.getAttribute('data-ex'), true); return; }        // ✕ de un negocio del detalle
    var tr = ev.target.closest ? ev.target.closest('tr.fc-fila') : null;
    if(!tr) return;
    var k = tr.getAttribute('data-k');
    S.abiertos[k] = !S.abiertos[k];
    pintarTabla();
  });
  $('fc-form').addEventListener('click', function(ev){
    var id = ev.target && ev.target.id;
    if(id === 'fc-guardar') guardar();
    else if(id === 'fc-cancelar') cerrarForm();
    else if(id === 'fc-defaults') abrirForm(cevenFcConfig(null));   // solo precarga el form: recién Guardar los fija
  });

  cargar();
})();
