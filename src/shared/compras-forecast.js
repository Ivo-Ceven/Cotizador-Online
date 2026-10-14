/* ============================================================================
   FORECAST DE COMPRAS  ·  lógica pura, compartida
   ----------------------------------------------------------------------------
   Responde "¿cuántos equipos tendríamos que comprar?" a partir de lo que ya hay
   cargado: las filas vivas del pipeline (estado, mes de cierre) cruzadas con las
   líneas de su cotización (SKU, cantidad). Para cada artículo da DOS números:

     · TOTAL      las unidades de todos los negocios abiertos, como si cerraran
                  todos. Es el techo: lo que se necesitaría si todo sale.
     · ESTIMADO   esas mismas unidades ponderadas por la probabilidad de que cada
                  negocio cierre. Es lo que razonablemente conviene tener.

   No toca el DOM ni la red: recibe datos y devuelve datos. La página
   (compras/js/compras.js) trae los datos y pinta; esto se prueba solo
   (scripts/check-compras-forecast.js).

   ── QUÉ ENTRA Y QUÉ NO ──────────────────────────────────────────────────────
   Entran los negocios abiertos. Quedan fuera Facturado (ya se vendió y entregó:
   la compra ya ocurrió) y Perdido (no hay compra). Si un artículo tiene estado
   propio (pipeline-sku.js), manda el de la línea y no el del proyecto. Se
   descuentan las unidades que Apple ya archivó o facturó parcialmente. Las
   garantías/servicios (Tipo 'garantia') no son mercadería y no se compran.
   Cuenta SOLO la opción vigente (A/B) de cada cotización, igual que el pipeline.

   ── LA PROBABILIDAD ─────────────────────────────────────────────────────────
   p = clamp( base × factorEdad × factorVencido , mín , máx )     por estado

     base          la probabilidad de partida de ese estado. Se va CALIBRANDO sola
                   con lo que realmente pasó (cevenFcBaseCalibrada): si los
                   Commit terminan facturándose más o menos de lo supuesto, la
                   base se corre hacia lo observado.
     factorEdad    un negocio abierto que no se toca hace tiempo pierde chances.
                   Pasada la gracia, cae un poco por día hasta un piso.
     factorVencido si su mes de cierre ya pasó, se castiga además.
     mín / máx     UMBRALES: ninguna de las correcciones puede sacar la
                   probabilidad de ese rango. Es lo que mantiene el modelo
                   previsible aunque la calibración o el paso del tiempo
                   empujen para un lado.

   La edad y el vencimiento NO se aplican a Con OC / Autorizando: con la orden de
   compra del cliente en la mano, que pase el tiempo no la vuelve menos firme.

   Depende de: pipeline-status.js, opciones.js y pipeline-sku.js. Se carga DESPUÉS
   de los tres.
   ========================================================================== */

var CEVEN_FC_TERMINALES = ['Facturado', 'Perdido'];

/* Estados cuya probabilidad se erosiona con el tiempo. Con OC y Autorizando no:
   ya hay compromiso del cliente por escrito. */
var CEVEN_FC_ENVEJECEN = ['Proyecto', 'Cotizado', 'Negociacion', 'Commit'];

var CEVEN_FC_DEFAULT = {
  prob: {
    'Proyecto':    {base: 0.05, min: 0.02, max: 0.10},
    'Cotizado':    {base: 0.10, min: 0.03, max: 0.20},
    'Negociacion': {base: 0.30, min: 0.15, max: 0.50},
    'Commit':      {base: 0.70, min: 0.50, max: 0.90},
    'Con OC':      {base: 0.95, min: 0.85, max: 1.00},
    'Autorizando': {base: 0.90, min: 0.75, max: 1.00}
  },
  // Pasados `graciaDias` sin tocar el negocio, pierde `caidaPorDia` (fracción de
  // la probabilidad) por día, hasta quedar en `pisoFactor` de la base.
  edad:    {graciaDias: 30, caidaPorDia: 0.005, pisoFactor: 0.5},
  // Multiplicador si el mes de cierre estimado ya pasó.
  vencido: {factor: 0.6},
  // Fuerza de la base inicial frente a lo observado, en "negocios equivalentes":
  // con k = 10 hacen falta ~10 negocios resueltos en un estado para que lo
  // observado pese tanto como la base. Más alto = más conservador.
  calib:   {k: 10}
};

function _fcNum(v, def, lo, hi){
  var n = parseFloat(v);
  if(isNaN(n)) n = def;
  if(lo !== undefined && n < lo) n = lo;
  if(hi !== undefined && n > hi) n = hi;
  return n;
}

/* La configuración efectiva: lo guardado por encima de los defaults, saneado.
   Siempre devuelve algo utilizable, aunque lo guardado esté incompleto o roto
   (alguien editó a mano, versión vieja): nunca debe tirar la página. */
function cevenFcConfig(guardada){
  var g = guardada || {};
  var d = CEVEN_FC_DEFAULT;
  var cfg = {prob: {}, edad: {}, vencido: {}, calib: {}};
  Object.keys(d.prob).forEach(function(est){
    var dp = d.prob[est], gp = (g.prob && g.prob[est]) || {};
    var mn = _fcNum(gp.min, dp.min, 0, 1);
    var mx = _fcNum(gp.max, dp.max, 0, 1);
    if(mx < mn){ var t = mn; mn = mx; mx = t; }
    cfg.prob[est] = {min: mn, max: mx, base: _fcNum(gp.base, dp.base, mn, mx)};
  });
  var ge = g.edad || {};
  cfg.edad = {
    graciaDias:  _fcNum(ge.graciaDias, d.edad.graciaDias, 0, 3650),
    caidaPorDia: _fcNum(ge.caidaPorDia, d.edad.caidaPorDia, 0, 1),
    pisoFactor:  _fcNum(ge.pisoFactor, d.edad.pisoFactor, 0, 1)
  };
  cfg.vencido = {factor: _fcNum((g.vencido || {}).factor, d.vencido.factor, 0, 1)};
  cfg.calib = {k: _fcNum((g.calib || {}).k, d.calib.k, 0, 100000)};
  return cfg;
}

/* ── Fechas ──────────────────────────────────────────────────────────────────
   `fechaMod` se guardó en dos formatos: ISO ("2026-10-09T18:24:04Z") y el de
   toLocaleDateString('es-AR'), día primero ("9/10/2026"). Date() solo entiende
   bien el primero, y "9/10/2026" lo leería como 10 de septiembre. */
function cevenFcFecha(s){
  if(s === undefined || s === null || s === '') return null;
  var str = String(s).trim();
  var m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(str);
  if(m) return new Date(parseInt(m[3], 10), parseInt(m[2], 10) - 1, parseInt(m[1], 10));
  var d = new Date(str);
  return isNaN(d.getTime()) ? null : d;
}

/* "YYYY-MM" de una fecha. */
function cevenFcMesDe(d){
  return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2);
}

/* ── Calibración con lo que realmente pasó ───────────────────────────────────
   `trans` son las filas de pipeline_transiciones: {brand, pipeline_id,
   estado_de, estado_a, at}. Para cada negocio se arma su recorrido de estados y
   se mira cómo terminó: Facturado (ganó), Perdido (perdió) o sigue abierto.
   Cada estado por el que PASÓ cuenta ese final. Los abiertos no cuentan
   (todavía no se sabe): contarlos como perdidos castigaría de más a los
   negocios recientes. */
function cevenFcResumirTransiciones(trans){
  var porNegocio = {};
  (trans || []).forEach(function(t){
    if(!t || !t.estado_a) return;
    var k = t.brand + '|' + t.pipeline_id;
    (porNegocio[k] = porNegocio[k] || []).push(t);
  });
  var res = {};
  function ensure(est){ return res[est] = res[est] || {ganadas: 0, perdidas: 0, abiertas: 0}; }
  Object.keys(porNegocio).forEach(function(k){
    var seq = porNegocio[k].slice().sort(function(a, b){
      var da = new Date(a.at).getTime() || 0, db = new Date(b.at).getTime() || 0;
      return da - db;
    }).map(function(t){ return t.estado_a; });
    var ultimo = seq[seq.length - 1];
    var final = (ultimo === 'Facturado') ? 'ganada' : (ultimo === 'Perdido' ? 'perdida' : 'abierta');
    var vistos = {};
    seq.forEach(function(est){
      if(CEVEN_FC_TERMINALES.indexOf(est) !== -1 || vistos[est]) return;
      vistos[est] = 1;
      var r = ensure(est);
      if(final === 'ganada') r.ganadas++;
      else if(final === 'perdida') r.perdidas++;
      else r.abiertas++;
    });
  });
  return res;
}

/* La base de cada estado después de mirar la historia. Mezcla la base inicial
   con la tasa observada, ponderada por cuántos negocios ya se resolvieron:

       efectiva = (n × observada + k × base) / (n + k)

   Con pocos casos (n chico) pesa la base y casi no se mueve; con muchos, manda
   lo observado. Siempre dentro de [mín, máx] del estado. Devuelve, por estado,
   todo lo necesario para MOSTRAR de dónde sale el número. */
function cevenFcBaseCalibrada(cfg, resumen){
  var out = {};
  Object.keys(cfg.prob).forEach(function(est){
    var c = cfg.prob[est];
    var r = (resumen && resumen[est]) || {ganadas: 0, perdidas: 0, abiertas: 0};
    var n = r.ganadas + r.perdidas;
    var obs = n > 0 ? r.ganadas / n : null;
    var k = cfg.calib.k;
    var ef = c.base;
    if(n > 0 && (n + k) > 0) ef = (n * obs + k * c.base) / (n + k);
    ef = Math.min(c.max, Math.max(c.min, ef));
    out[est] = {base: c.base, observada: obs, n: n, abiertas: r.abiertas, efectiva: ef};
  });
  return out;
}

/* ── Probabilidad de un negocio, hoy ─────────────────────────────────────────
   `fila` es la fila del pipeline (para la edad y el mes de cierre); `estado` el
   de la línea (puede diferir del de la fila). Devuelve el desglose, no solo el
   número, para poder explicarlo en pantalla. */
function cevenFcProbabilidad(fila, estado, ahora, cfg, bases, mesCierreLinea){
  var c = cfg.prob[estado];
  if(!c) return null;                       // estado sin probabilidad definida
  var b = (bases && bases[estado]) ? bases[estado].efectiva : c.base;
  var envejece = CEVEN_FC_ENVEJECEN.indexOf(estado) !== -1;

  var edadDias = null, fEdad = 1, vencido = false, fVenc = 1;
  if(envejece){
    var ref = cevenFcFecha(fila && fila.fechaMod) || cevenFcFecha(fila && fila.fechaISO);
    if(ref){
      edadDias = Math.max(0, Math.floor((ahora.getTime() - ref.getTime()) / 86400000));
      var exceso = Math.max(0, edadDias - cfg.edad.graciaDias);
      fEdad = Math.max(cfg.edad.pisoFactor, 1 - cfg.edad.caidaPorDia * exceso);
    }
    var mes = mesCierreLinea || (fila && fila.mesCierre) || '';
    if(mes && /^\d{4}-\d{2}$/.test(mes) && mes < cevenFcMesDe(ahora)){
      vencido = true;
      fVenc = cfg.vencido.factor;
    }
  }
  var p = Math.min(c.max, Math.max(c.min, b * fEdad * fVenc));
  return {p: p, base: b, fEdad: fEdad, fVencido: fVenc, edadDias: edadDias, vencido: vencido};
}

/* ── Resumen de una lista de artículos ───────────────────────────────────────
   Totales, por mes y por marca. Aparte de cevenFcConstruir para poder recalcularlo
   sobre un subconjunto (la página filtra por texto sin volver a construir todo):
   así lo que se ve arriba siempre es la suma de lo que se ve abajo. */
function cevenFcResumir(articulos){
  var tot = {total: 0, estimado: 0, montoTotal: 0, montoEstimado: 0};
  var meses = {}, marcas = {}, negocios = {};
  function sumar(o, x){ o.total += x.total; o.estimado += x.estimado; o.montoTotal += x.montoTotal; o.montoEstimado += x.montoEstimado; }
  (articulos || []).forEach(function(a){
    sumar(tot, a);
    var m = marcas[a.brand] = marcas[a.brand] || {total: 0, estimado: 0, montoTotal: 0, montoEstimado: 0};
    sumar(m, a);
    Object.keys(a.porMes).forEach(function(mk){
      var mm = meses[mk] = meses[mk] || {total: 0, estimado: 0, montoTotal: 0, montoEstimado: 0};
      sumar(mm, a.porMes[mk]);
    });
    a.negocios.forEach(function(n){ negocios[n.brand + '|' + n.id] = 1; });
  });
  tot.negocios = Object.keys(negocios).length;
  tot.articulos = (articulos || []).length;
  return {totales: tot, porMes: meses, porMarca: marcas};
}

/* ── Los negocios, de mayor a menor ──────────────────────────────────────────
   Una fila por NEGOCIO (no por artículo), sumando todas sus líneas. Es la lista
   para elegir cuáles sacar del forecast: una orden grande se reconoce por el
   total de unidades del negocio, no por una línea suelta. Se arma sobre el
   resultado SIN exclusiones, así un negocio ya sacado sigue apareciendo (para
   poder volver a ponerlo). `estado` es el de la línea con más unidades. */
function cevenFcNegocios(articulos){
  var por = {};
  (articulos || []).forEach(function(a){
    a.negocios.forEach(function(n){
      var k = n.brand + '|' + n.id;
      var o = por[k] = por[k] || {
        key: k, brand: n.brand, id: n.id, qNum: n.qNum, cliente: n.cliente, proyecto: n.proyecto,
        ejecutivo: n.ejecutivo, unidades: 0, estimado: 0, monto: 0, articulos: 0, _porEstado: {}
      };
      o.unidades += n.unidades; o.estimado += n.estimado; o.monto += n.monto || 0; o.articulos++;
      o._porEstado[n.estado] = (o._porEstado[n.estado] || 0) + n.unidades;
    });
  });
  return Object.keys(por).map(function(k){
    var o = por[k], mejor = null;
    Object.keys(o._porEstado).forEach(function(e){ if(mejor === null || o._porEstado[e] > o._porEstado[mejor]) mejor = e; });
    o.estado = mejor; delete o._porEstado;
    return o;
  }).sort(function(a, b){ return b.unidades - a.unidades; });
}

/* ── El forecast ─────────────────────────────────────────────────────────────
   opts:
     pipeline      filas de public.pipeline
     cotizaciones  filas de public.cotizaciones ({brand, qnum, lineas, borrada_at})
     cfg           cevenFcConfig(...)
     bases         cevenFcBaseCalibrada(...)  (opcional: sin esto, la base pura)
     ahora         Date
     marcas        ['poly', ...] o vacío = todas
     hastaMes      'YYYY-MM': solo cierres hasta ese mes (inclusive). Vacío = todos.
     estados       estados a incluir; vacío = todos los que tienen probabilidad.
     excluir       ['marca|idPipeline', …]: negocios que se sacan del cálculo por
                   completo (todas sus líneas). Es para sacar a mano una orden
                   puntual muy grande que distorsiona el forecast; no entra en los
                   totales ni cuenta como "sin cotización". */
function cevenFcConstruir(opts){
  var cfg = opts.cfg || cevenFcConfig();
  var ahora = opts.ahora || new Date();
  var marcas = (opts.marcas && opts.marcas.length) ? opts.marcas : null;
  var estadosOk = (opts.estados && opts.estados.length) ? opts.estados : Object.keys(cfg.prob);
  var excl = {};
  (opts.excluir || []).forEach(function(k){ excl[k] = 1; });

  var cotiz = {};
  (opts.cotizaciones || []).forEach(function(c){
    if(!c || c.borrada_at) return;
    cotiz[c.brand + '|' + c.qnum] = c;
  });

  var arts = {};
  var sinCotizacion = [];

  (opts.pipeline || []).forEach(function(fila){
    if(!fila) return;
    if(marcas && marcas.indexOf(fila.brand) === -1) return;
    if(excl[fila.brand + '|' + fila.id]) return;
    if(CEVEN_FC_TERMINALES.indexOf(fila.estado) !== -1 && !fila.skuStatus) return;

    var qn = fila.qNum;
    var c = (qn !== null && qn !== undefined) ? cotiz[fila.brand + '|' + parseInt(qn, 10)] : null;
    if(!c || !c.lineas || !c.lineas.length){
      if(CEVEN_FC_TERMINALES.indexOf(fila.estado) === -1) sinCotizacion.push(fila);
      return;
    }

    /* Las claves de línea (SKU|id) se arman sobre la lista de la opción vigente,
       con el mismo filtro de Tipo que usa el pipeline de cada marca. */
    var lineas = c.lineas;
    var ef = cevenOpcEfectivaDeFilas(lineas);
    var lista = lineas.filter(function(l){
      if(cevenOpcDe(l) !== ef) return false;
      return fila.brand === 'apple' ? (l['Tipo'] === 'producto' || l['Tipo'] === 'garantia') : true;
    });

    lista.forEach(function(ln, idx){
      var tipo = ln['Tipo'];
      if(tipo && tipo !== 'producto') return;                 // garantías, filas meta
      var key = cevenSkuLineKey(ln, idx);
      var estado = cevenSkuEstado(fila, key);
      if(CEVEN_FC_TERMINALES.indexOf(estado) !== -1) return;
      if(estadosOk.indexOf(estado) === -1) return;

      var mes = (fila.skuMesCierre && fila.skuMesCierre[key] !== undefined) ? fila.skuMesCierre[key] : (fila.mesCierre || '');
      if(opts.hastaMes && mes && mes > opts.hastaMes) return;

      var qty = parseFloat(ln['Cantidad']) || 0;
      var yaFacturada = (parseFloat(fila.skuArchivedQty && fila.skuArchivedQty[key]) || 0)
                      + (parseFloat(fila.skuPartialQty && fila.skuPartialQty[key]) || 0);
      var unidades = Math.max(0, qty - yaFacturada);
      if(unidades <= 0) return;

      var pr = cevenFcProbabilidad(fila, estado, ahora, cfg, opts.bases, mes);
      if(!pr) return;

      var precio = parseFloat(ln['P. Venta Unitario']) || 0;
      var est = unidades * pr.p;
      var sku = String(ln['SKU'] || '—');
      var ak = fila.brand + '|' + sku;
      var a = arts[ak] = arts[ak] || {
        brand: fila.brand, sku: sku, desc: ln['Descripción'] || '',
        total: 0, estimado: 0, montoTotal: 0, montoEstimado: 0, porMes: {}, negocios: []
      };
      if(!a.desc && ln['Descripción']) a.desc = ln['Descripción'];
      a.total += unidades; a.estimado += est;
      a.montoTotal += unidades * precio; a.montoEstimado += est * precio;
      var mk = mes || 'sin mes';
      var am = a.porMes[mk] = a.porMes[mk] || {total: 0, estimado: 0, montoTotal: 0, montoEstimado: 0};
      am.total += unidades; am.estimado += est;
      am.montoTotal += unidades * precio; am.montoEstimado += est * precio;
      a.negocios.push({
        brand: fila.brand, id: fila.id, qNum: fila.qNum, cliente: fila.cliente || '',
        proyecto: fila.proyecto || '', ejecutivo: fila.ejecutivo || '',
        estado: estado, mes: mk, unidades: unidades, monto: unidades * precio, prob: pr.p, estimado: est, detalle: pr
      });

    });
  });

  var articulos = Object.keys(arts).map(function(k){ return arts[k]; });
  var r = cevenFcResumir(articulos);
  return {articulos: articulos, totales: r.totales, porMes: r.porMes, porMarca: r.porMarca, sinCotizacion: sinCotizacion};
}
