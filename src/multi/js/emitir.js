/* ============================================================
   EMITIR A CADA MARCA  ·  Cotizador multimarca
   ------------------------------------------------------------
   El corazón del multimarca: un pedido con líneas de varias
   marcas se convierte en UNA COTIZACIÓN REAL POR MARCA, con su
   número, sus filas en el historial de esa marca y su fila en su
   pipeline.

   POR QUÉ NO ALCANZA CON LA FILA DE PIPELINE
   Se escriben las dos cosas —`cquotes` y `pipeline`— porque la
   fila sola queda hueca: el detalle por SKU, el Excel de la
   marca y el archivo mensual leen `cquotes`. Una fila que no se
   puede expandir se ve como un bug, no como una fila.

   EL FORECAST LO MIDEN LAS MARCAS
   La fila del pedido (brand='multi') existe para seguir el
   pedido completo; la plata se cuenta en el pipeline de cada
   marca, que es donde se factura. Como cada app filtra
   `brand=eq.<marca>`, nunca se mezclan.

   ── LA PARTE DELICADA ────────────────────────────────────────
   `cquotes` viaja como UN BLOB por marca con last-write-wins
   (ver ARQUITECTURA.md). Emitir es leer-modificar-escribir el
   historial de OTRA marca, así que si alguien guarda en esa
   marca en la misma ventana, una de las dos escrituras se
   pierde. Tres cosas lo hacen tolerable:

     1. la lectura es inmediatamente antes de la escritura;
     2. el resultado se informa POR MARCA, así que se ve cuál
        salió y cuál no — no hay transacción posible entre dos
        blobs y una tabla, y fingir que la hay es peor;
     3. re-emitir es IDEMPOTENTE: recuperarse de una escritura
        perdida es un clic.

   Las filas de `pipeline` no sufren esto: van fila por fila con
   upsert sobre la PK (brand, id).

   ── SEPARACIÓN A PROPÓSITO ───────────────────────────────────
   `cevenEmitirPlan()` es PURO: recibe el estado remoto y
   devuelve exactamente qué se va a escribir, sin tocar la red.
   Todo lo que puede salir mal en la lógica —numeración, reparto,
   re-emisión, qué campos se conservan— se prueba en Node con
   scripts/check-emitir.js. La capa REST de abajo solo transporta.

   Depende de: js/marcas.js, shared/quote-num.js (cevenQNumFmt),
   config.js, auth.js (cevenGetSession), notify.js (showToast).
   ============================================================ */

/* ══════════════════════════════════════════════════════════════════════════
   PLANIFICADOR (puro)
   ══════════════════════════════════════════════════════════════════════════ */

/* El mayor número de cotización que EXISTE en una marca, mirando las dos
   fuentes que hay del lado del servidor. Es la misma idea que
   cevenMayorQNumUsado() de shared/quote-num.js, pero sobre datos remotos: el
   multimarca no tiene el localStorage de la otra marca.

   Sin esto, un contador atrasado —que pasa: `cqc` se sincroniza como una clave
   más y puede llegar viejo— haría que la emisión reuse un número y pise la
   cotización de otro. */
function cevenEmitirMayorQNum(cquotes, pipeline){
  var max = 0;
  function _ver(v){
    var n = parseInt(v, 10);
    if(!isNaN(n) && n > max) max = n;
  }
  (cquotes || []).forEach(function(r){ _ver(r['N° Cotización']); });
  (pipeline || []).forEach(function(r){ _ver(r.qNum); });
  return max;
}

/* El número que le toca a esta marca.

   Si el pedido YA se emitió a esta marca, se reusa ese número: tomar uno nuevo
   dejaría dos cotizaciones de la misma cosa en el pipeline y el forecast
   contaría la plata dos veces. Si es la primera vez, el próximo libre. */
function cevenEmitirNumero(remoto, yaEmitido){
  if(yaEmitido) return parseInt(yaEmitido, 10) || 0;
  var contador = parseInt(remoto.cqc, 10) || 0;
  return Math.max(contador, cevenEmitirMayorQNum(remoto.cquotes, remoto.pipeline)) + 1;
}

/* Id de fila de pipeline. `Date.now()` a secas colisiona entre dos usuarios que
   emiten en el mismo milisegundo y la PK es (brand, id): el upsert pisaría una
   fila con la otra. Tiene que quedar ENTERO — la columna es bigint. */
function cevenEmitirNuevoId(){
  return Date.now() * 1000 + Math.floor(Math.random() * 1000);
}

/* Los campos de la fila de pipeline que son iguales en todas las marcas. Lo
   propio de cada una (familias y margen en Apple, OPG y Netsuite en Poly) lo
   agregan filaPipeline() y pipelineExtra() del registro. */
function _emitirFilaComun(qn, ctx, now){
  return {
    fecha: now.fecha,
    fechaISO: now.iso,
    qNum: qn,
    cliente: ctx.cliente,
    proyecto: ctx.proyecto || '—',
    ejecutivo: ctx.ejecutivo || '—',
    mesCierre: ctx.mesCierre || '',
    estado: ctx.estado || 'Cotizado',
    moneda: 'USD'
  };
}

/* El plan para UNA marca. `remoto` es {cqc, cquotes, pipeline} de esa marca tal
   como está en el servidor; `yaEmitido` es el número que este pedido ya usó ahí
   (o null). Devuelve qué escribir, sin escribir nada. */
function cevenEmitirPlanMarca(brand, lineas, ctx, remoto, yaEmitido){
  var reg = cevenMultiMarca(brand);
  if(!reg) return {brand: brand, error: 'El multimarca no sabe cotizar la marca "' + brand + '".'};
  if(!lineas || !lineas.length) return null;

  remoto = remoto || {};
  var qNumNum = cevenEmitirNumero(remoto, yaEmitido);
  var qn = cevenQNumFmt(qNumNum);
  var now = {fecha: ctx.fecha, iso: ctx.fechaISO};
  var ctxMarca = Object.assign({}, ctx, {qn: qn});

  /* cquotes: se sacan las filas de ESTE número y se reinsertan. Es lo que hace
     idempotente a la re-emisión — dos emisiones seguidas dejan el historial
     igual, no duplicado. Al ser un número que este pedido ya usó, borrar es
     seguro; si es nuevo, el filtro no saca nada. */
  var base = (remoto.cquotes || []).filter(function(r){ return r['N° Cotización'] !== qn; });
  var filasNuevas = lineas.map(function(it){ return reg.filaCquotes(it, ctxMarca); });

  /* pipeline: la fila se busca por número. Si ya existe se le actualizan los
     datos de la COTIZACIÓN y se le conservan los de SEGUIMIENTO — estado, mes
     de cierre, link de OV/Netsuite e id—, que son del vendedor de esa marca y
     no del pedido. Es el mismo criterio de addToPipeline() cuando la
     cotización ya estaba en el pipeline. */
  var previa = null;
  (remoto.pipeline || []).forEach(function(r){ if(String(r.qNum) === String(qn) || parseInt(r.qNum,10) === qNumNum) previa = r; });

  var fila = _emitirFilaComun(qn, ctx, now);
  Object.assign(fila, reg.filaPipeline(lineas, ctxMarca));
  if(reg.pipelineExtra) Object.assign(fila, reg.pipelineExtra(ctxMarca));
  fila.brand = brand;

  if(previa){
    fila.id        = previa.id;
    fila.estado    = previa.estado || fila.estado;
    fila.mesCierre = previa.mesCierre || fila.mesCierre;
    if(previa.ovLink !== undefined)  fila.ovLink  = previa.ovLink;
    if(previa.factura !== undefined) fila.factura = previa.factura;
    if(previa.opg)                   fila.opg     = previa.opg;
  } else {
    fila.id = cevenEmitirNuevoId();
  }

  return {
    brand:    brand,
    qn:       qn,
    qNumNum:  qNumNum,
    esNueva:  !previa,
    reemision: !!yaEmitido,
    cquotes:  base.concat(filasNuevas),
    lineas:   filasNuevas.length,
    pipeRow:  fila,
    /* El contador solo puede SUBIR. editQuoteFromHistory() enseñó por qué:
       bajarlo hace que las próximas cotizaciones reusen números. */
    cqcNuevo: Math.max(parseInt(remoto.cqc, 10) || 0, qNumNum)
  };
}

/* El plan completo: una entrada por marca presente en el pedido, en el orden
   del registro. `remotos` es {apple:{...}, poly:{...}} y `emitidas` el mapa de
   lo que este pedido ya emitió. */
function cevenEmitirPlan(items, ctx, remotos, emitidasPrevias){
  emitidasPrevias = emitidasPrevias || {};
  var out = [];
  cevenMultiMarcasDe(items).forEach(function(brand){
    var plan = cevenEmitirPlanMarca(
      brand,
      cevenMultiLineasDe(items, brand),
      ctx,
      (remotos || {})[brand],
      emitidasPrevias[brand]
    );
    if(plan) out.push(plan);
  });
  return out;
}

/* ══════════════════════════════════════════════════════════════════════════
   CAPA REST (transporte)
   ══════════════════════════════════════════════════════════════════════════ */

function _emRest(){ return SUPABASE_URL + '/rest/v1/'; }

function _emHeaders(extra){
  var sess = (typeof cevenGetSession === 'function') ? cevenGetSession() : null;
  var h = {
    'apikey': SUPABASE_ANON_KEY,
    'Content-Type': 'application/json',
    'Accept': 'application/json'
  };
  if(sess && sess.access_token) h['Authorization'] = 'Bearer ' + sess.access_token;
  return Object.assign(h, extra || {});
}

/* El estado remoto de las marcas a las que se va a emitir: su contador, su
   historial y las filas de pipeline que hacen falta para no pisar seguimiento.

   Se pide TODO junto y ANTES de escribir nada: cuanto más corta la ventana
   entre leer y escribir, menos chance de pisarle el historial a alguien. */
function cevenEmitirLeerRemoto(brands){
  var lista = brands.join(',');
  /* ⚠ Con el prefijo de cada marca: la columna `key` guarda la clave REAL de
     localStorage (`poly_cquotes`, no `cquotes`). Ver cevenMultiClave() en
     marcas.js. Sin esto, para Poly volvía vacío y la emisión creía que su
     historial y su contador estaban en cero — o sea que le asignaba el número
     0001 y le pisaba la primera cotización de la marca. */
  var claves = cevenMultiClaves(['cquotes', 'cqc']).join(',');
  var pSettings = fetch(_emRest() + 'app_settings?select=brand,key,value'
      + '&brand=in.(' + encodeURIComponent(lista) + ')'
      + '&key=in.(' + encodeURIComponent(claves) + ')',
      {headers: _emHeaders()})
    .then(function(r){ if(!r.ok) throw new Error('historial: HTTP ' + r.status); return r.json(); });

  var pPipe = fetch(_emRest() + 'pipeline?select=brand,id,qNum,estado,mesCierre,ovLink,factura,opg'
      + '&brand=in.(' + encodeURIComponent(lista) + ')',
      {headers: _emHeaders()})
    .then(function(r){ if(!r.ok) throw new Error('pipeline: HTTP ' + r.status); return r.json(); });

  return Promise.all([pSettings, pPipe]).then(function(res){
    var out = {};
    brands.forEach(function(b){ out[b] = {cqc: 0, cquotes: [], pipeline: []}; });
    (res[0] || []).forEach(function(f){
      if(!out[f.brand]) return;
      // Igual que arriba: la clave se compara con el prefijo de ESA marca.
      if(f.key === cevenMultiClave(f.brand, 'cqc')){
        out[f.brand].cqc = parseInt(f.value, 10) || 0;
      } else if(f.key === cevenMultiClave(f.brand, 'cquotes')){
        try{
          var v = JSON.parse(f.value);
          if(Object.prototype.toString.call(v) === '[object Array]') out[f.brand].cquotes = v;
        }catch(e){}
      }
    });
    (res[1] || []).forEach(function(r){
      if(out[r.brand]) out[r.brand].pipeline.push(r);
    });
    return out;
  });
}

/* Escribe el plan de UNA marca. El orden importa: primero el historial, después
   el pipeline. Si se cortara en el medio es preferible una cotización sin fila
   —que se ve enseguida y se arregla re-emitiendo— que una fila sin cotización,
   que se ve como una fila rota que no expande. */
function cevenEmitirEscribirMarca(plan){
  /* ⚠ La clave se escribe CON el prefijo de la marca destino, que es la que su
     cotizador va a leer. Escribir `(poly, 'cquotes')` no da error: crea una fila
     fantasma que Poly NUNCA lee, así que la cotización emitida no aparecería
     jamás en esa marca y el problema sería invisible desde acá. */
  var settings = [
    {brand: plan.brand, key: cevenMultiClave(plan.brand, 'cquotes'), value: JSON.stringify(plan.cquotes)},
    {brand: plan.brand, key: cevenMultiClave(plan.brand, 'cqc'),     value: String(plan.cqcNuevo)}
  ];
  return fetch(_emRest() + 'app_settings', {
      method: 'POST',
      headers: _emHeaders({'Prefer': 'resolution=merge-duplicates,return=minimal'}),
      body: JSON.stringify(settings)
    })
    .then(function(r){
      if(!r.ok) return r.text().then(function(t){ throw new Error('historial de ' + plan.brand + ': ' + r.status + ' ' + t); });
      return fetch(_emRest() + 'pipeline', {
        method: 'POST',
        headers: _emHeaders({'Prefer': 'resolution=merge-duplicates,return=minimal'}),
        body: JSON.stringify([plan.pipeRow])
      });
    })
    .then(function(r){
      if(!r.ok) return r.text().then(function(t){ throw new Error('pipeline de ' + plan.brand + ': ' + r.status + ' ' + t); });
      return true;
    });
}

/* ══════════════════════════════════════════════════════════════════════════
   ACCIÓN
   ══════════════════════════════════════════════════════════════════════════ */

/* El contexto que necesitan el registro de marcas y el planificador, leído de
   la pantalla. Vive acá y no repartido para que emitir y previsualizar no
   puedan discrepar. */
function cevenEmitirContexto(){
  var _v = function(id){ var e = document.getElementById(id); return e ? (e.value || '') : ''; };
  var now = new Date();
  return {
    fecha: now.toLocaleDateString('es-AR'),
    hora:  now.toLocaleTimeString('es-AR', {hour:'2-digit', minute:'2-digit'}),
    fechaISO: now.toISOString(),
    cliente:   _v('client').trim() || '—',
    proyecto:  _v('proyecto').trim() || '—',
    opg:       _v('opg').trim(),
    ejecutivo: (typeof cevenExecActual === 'function' ? cevenExecActual() : _v('exec')) || '—',
    obs:       _v('obs') || '—',
    mesCierre: (typeof getMesCierre === 'function') ? getMesCierre() : '',
    estado:    _v('quote-estado') || 'Cotizado',
    payMode:   (typeof cevenPayMode === 'function') ? cevenPayMode() : '',
    effDate:   _v('eff-date'),
    delivery:  (typeof cevenDelivery === 'function') ? cevenDelivery() : '',
    multiQNum: cevenQNumVisible(qNum),
    margen:    (typeof getMargenGlobal === 'function') ? getMargenGlobal() : 0,
    fob:       (typeof isCotizacionFOB === 'function') ? isCotizacionFOB() : false,
    tierGlobal: (typeof tierGlobalMulti === 'function') ? tierGlobalMulti() : '',
    nacRates:  nacRatesApple,
    catalogos: catalogos
  };
}

/* Emite el pedido. Solo la opción VIGENTE: si bajaran las dos, cada marca
   contaría plata de una alternativa que nunca se va a facturar. */
function emitirAMarcas(){
  if(!cevenCanUsePipeline()){ showToast('Tu rol no permite emitir a las marcas.'); return; }

  var vigentes = cevenOpcFiltrar(items, cevenOpcEfectiva());
  if(!vigentes.length){
    showToast('La Opción ' + cevenOpcLetra(cevenOpcEfectiva()) + ' es la vigente y está vacía.');
    return;
  }
  var ctx = cevenEmitirContexto();
  if(ctx.cliente === '—'){ showToast('Cargá el nombre del cliente antes de emitir.'); return; }
  if(ctx.proyecto === '—'){ showToast('Cargá el proyecto antes de emitir: Poly lo necesita para su pipeline.'); return; }
  if(typeof cevenRequireExec === 'function' && !cevenRequireExec()) return;

  var brands = cevenMultiMarcasDe(vigentes);
  var desconocidas = brands.filter(function(b){ return !cevenMultiMarca(b); });
  if(desconocidas.length){
    showToast('Hay líneas de una marca que no se puede emitir: ' + desconocidas.join(', ') + '.');
    return;
  }

  // El pedido se guarda ANTES de emitir: si algo falla después, el pedido ya
  // existe y se puede volver a intentar sin recargarlo.
  if(!doSave(true)) return;

  showToast('Emitiendo a ' + brands.map(cevenMultiMarcaLabel).join(' y ') + '…');

  cevenEmitirLeerRemoto(brands)
    .then(function(remotos){
      var planes = cevenEmitirPlan(vigentes, ctx, remotos, emitidas);
      // En serie y no en paralelo: dos marcas escriben en tablas distintas pero
      // el error de una tiene que poder cortar sin dejar la otra a medias.
      return planes.reduce(function(cadena, plan){
        return cadena.then(function(hechos){
          return cevenEmitirEscribirMarca(plan)
            .then(function(){
              emitidas[plan.brand] = plan.qn;
              hechos.push({plan: plan, ok: true});
              return hechos;
            }, function(e){
              hechos.push({plan: plan, ok: false, error: e.message});
              return hechos;
            });
        });
      }, Promise.resolve([]));
    })
    .then(function(hechos){
      // Se re-guarda el pedido para que `_emitidas` quede en su historial: es lo
      // que hace que la próxima emisión pise en vez de duplicar.
      doSave(true);
      _emitirAvisar(hechos);
      if(typeof renderQ === 'function') renderQ();
    })
    .catch(function(e){
      showToast('No se pudo emitir: ' + e.message + '. El pedido quedó guardado; probá de nuevo.');
    });
}

/* El resultado, marca por marca. Nunca un "listo" genérico: con dos marcas y
   una que falló, el vendedor tiene que saber CUÁL quedó. */
function _emitirAvisar(hechos){
  var ok = hechos.filter(function(h){ return h.ok; });
  var mal = hechos.filter(function(h){ return !h.ok; });
  var partes = ok.map(function(h){
    return cevenMultiMarcaLabel(h.plan.brand) + ' #' + h.plan.qn + (h.plan.reemision ? ' (actualizada)' : '');
  });
  if(!mal.length){
    showToast('✓ ' + partes.join(' · ') + (partes.length > 1 ? ' creadas.' : ' creada.'));
    return;
  }
  var falla = mal.map(function(h){ return cevenMultiMarcaLabel(h.plan.brand); }).join(', ');
  showToast((partes.length ? ('✓ ' + partes.join(' · ') + '. ') : '')
    + '✗ Falló ' + falla + ': ' + mal[0].error + '. Volvé a emitir para reintentar (no se duplica).');
}
