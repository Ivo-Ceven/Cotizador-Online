/* ============================================================
   EDITAR PROYECTO REGI · asignar productos del catálogo
   ------------------------------------------------------------
   Botón "✎ Editar" de cada fila del pipeline REGI (pipeline-regi.js)
   abre esta subpantalla flotante: mismo shell que picker.js (arriba el
   catálogo con un `+` por producto, abajo lo asignado), pero es un
   carrito PROPIO —_rpCarrito, no `items`— que se guarda directo en
   Supabase (poly_regi_pipeline_productos) en vez de convertirse en una
   cotización real. El proyecto REGI sigue sin tener una cotización de
   Ceven detrás; lo único editable es esta asignación.

   Por qué un carrito aparte y no reusar picker.js: `items` es la
   cotización que se está armando en la pantalla de Poly (o no hay
   ninguna abierta), y agregarle líneas ahí mezclaría dos cosas sin
   relación — "lo que se está cotizando ahora" y "lo que se le asignó a
   este proyecto REGI". Guardar-y-listo, sin pasar por armar-cotización.

   El monto de este carrito (`productosMonto` en pipeline-regi.js) REEMPLAZA
   al `amount` que trae el Excel de HP en toda la UI en cuanto hay al menos
   un producto asignado — no conviven como dos KPI separados (pedido del
   usuario). Ver la cabecera de pipeline-regi.js.

   Depende de: shared/auth.js (cevenAuthedFetch, cevenCanUsePipeline,
   cevenSessionUser), shared/config.js (SUPABASE_URL), shared/safe.js
   (cevenEsc), shared/notify.js (showToast), shared/ui-core.js
   (fI, fD, showErr), shared/nav.js (cevenNav, opcional), poly/js/catalog.js
   (products, getFilteredCon, _pintarFiltroRubro, bindRubros,
   _catPreciosHTML), poly/js/tiers.js (cevenTiers, tierGlobal),
   poly/js/pricing-core.js (cevenPolyPrecioDe, cevenPolyProducto,
   CEVEN_TIER_MANUAL, CEVEN_TIER_MANUAL_LBL), poly/js/pipeline-regi.js
   (window._regiPipeRows, window._regiProductosTotales). Se carga
   DESPUÉS de todos esos.
   ============================================================ */

var _rpOpd = null;          // opd del proyecto en edición, null si está cerrado
var _rpCarrito = [];        // [{sku, description, cantidad, tier, precioUnitario}]
var _rpRendered = [];       // resultados de búsqueda de la última pasada, direccionados por data-rpi
var _rpAbierto = false;
// true recién cuando _rpCarrito refleja lo que YA hay guardado (o se
// confirmó que no hay nada). Mientras está en false, guardarRegiProductos()
// se niega a guardar: si guardara con el carrito todavía vacío por estar
// cargando (o por haber fallado la carga), el DELETE+INSERT de "Guardar"
// borraría productos ya asignados sin que el usuario supiera que existían.
var _rpListo = false;

function _cevenRegiProdRest(path){ return SUPABASE_URL + '/rest/v1/' + path; }

/* ── Abrir / cerrar ──────────────────────────────────────────────────────── */

function abrirRegiEditor(opd){
  if(!opd) return;
  if(!cevenCanUsePipeline()){ showToast('Tu rol no permite editar proyectos REGI.'); return; }
  var row = (window._regiPipeRows || []).filter(function(r){ return r.opd === opd; })[0];
  if(!row){ showToast('No se encontró ese proyecto — puede haber salido en una reimportación.'); return; }
  if(!products.length){ showToast('Todavía no hay catálogo cargado. Importá el catálogo de Poly primero.'); return; }

  var m = document.getElementById('regi-prod-modal');
  if(!m) return;

  _rpOpd = opd;
  _rpCarrito = [];
  _rpAbierto = true;
  _rpListo = false;

  document.getElementById('rp-proyecto-nombre').textContent = row.proyecto || row.cliente || opd;
  var info = [];
  if(row.cliente) info.push(row.cliente);
  if(row.regi) info.push('REGI ' + row.regi);
  // montoArchivo, no `row.monto`: éste último puede YA ser la sumatoria de
  // productos de una edición anterior (reemplaza al del archivo en toda la
  // UI, ver pipeline-regi.js) — mostrarlo acá como "archivo HP" mentiría.
  info.push('Monto archivo HP: USD ' + fI(row.montoArchivo || 0));
  document.getElementById('rp-proyecto-info').textContent = info.join(' · ');

  var body = document.getElementById('rp-body');
  if(body) body.innerHTML = '<tr><td colspan="4" style="text-align:center;color:#aeaeb2;padding:22px">Cargando…</td></tr>';
  var cart = document.getElementById('rp-cart');
  if(cart) cart.innerHTML = '<div class="pk-vacio">Cargando…</div>';

  m.style.display = 'flex';
  if(window.cevenNav) cevenNav.openOverlay(cerrarRegiEditor);
  renderRegiEditorBusqueda();

  _cevenRegiProdFetchCarrito(opd).then(function(carrito){
    // Si mientras tanto se cerró o se abrió OTRO proyecto, no pisa lo que
    // se esté viendo (mismo criterio que renderRegiPipeline con la vista).
    if(!_rpAbierto || _rpOpd !== opd) return;
    _rpCarrito = carrito;
    _rpListo = true;
    _pintarRegiCarrito();
  }).catch(function(e){
    if(!_rpAbierto || _rpOpd !== opd) return;
    // _rpListo se queda en false a propósito: ver el comentario de su
    // declaración. Cerrar y reabrir reintenta la carga.
    showErr('No se pudieron cargar los productos ya asignados: ' + ((e && e.message) || 'error desconocido'));
  });

  var s = document.getElementById('rp-search');
  if(s){ s.value = ''; setTimeout(function(){ s.focus(); }, 30); }
}

function cerrarRegiEditor(){
  var m = document.getElementById('regi-prod-modal');
  if(m) m.style.display = 'none';
  _rpAbierto = false;
  _rpOpd = null;
  if(window.cevenNav) cevenNav.notifyClosed(cerrarRegiEditor);
}

function _cevenRegiProdFetchCarrito(opd){
  var url = _cevenRegiProdRest('poly_regi_pipeline_productos')
    + '?select=sku,descripcion,cantidad,precio_unitario&opd=eq.' + encodeURIComponent(opd)
    + '&order=id.asc';
  return cevenAuthedFetch(url, {method: 'GET'}).then(function(rows){
    return (Array.isArray(rows) ? rows : []).map(function(r){
      return {
        sku: r.sku, description: r.descripcion || '',
        cantidad: Number(r.cantidad) || 1,
        // El nivel no se guarda en la base (solo sku/cantidad/precio):
        // al reabrir se muestra como Custom, que es la verdad — no hay
        // forma de saber con qué nivel se cargó cada línea. El precio sí
        // se conserva tal cual.
        tier: CEVEN_TIER_MANUAL,
        precioUnitario: Number(r.precio_unitario) || 0
      };
    });
  });
}

/* ── Buscador / catálogo (mitad de arriba) ──────────────────────────────── */

function renderRegiEditorBusqueda(){
  if(!_rpAbierto) return;
  _pintarFiltroRubro(document.getElementById('rp-rubro'));
  var filtered = getFilteredCon(document.getElementById('rp-search'), document.getElementById('rp-rubro'));
  _rpRendered = filtered;
  var html = '';
  for(var i=0;i<filtered.length;i++) html += _rpRowHTML(filtered[i], i);
  document.getElementById('rp-body').innerHTML = html
    || '<tr><td colspan="4" style="text-align:center;color:#aeaeb2;padding:22px">Sin resultados</td></tr>';
}

function _rpRowAt(i){
  var n = parseInt(i, 10);
  return (isNaN(n) || !_rpRendered[n]) ? null : _rpRendered[n];
}

function _rpEnCarrito(sku){
  for(var i=0;i<_rpCarrito.length;i++){ if(_rpCarrito[i].sku === sku) return true; }
  return false;
}

function _rpRowHTML(p, idx){
  var enc = _rpEnCarrito(p.sku);
  return '<tr class="crow pk-row'+(enc?' enq':'')+'" data-rpi="'+idx+'">'
    + '<td style="text-align:center;overflow:visible">'
      + '<button class="'+(enc?'bs cat-quitar':'bd cat-sumar')+'" data-act="rp-add" data-rpi="'+idx+'"'
        + (enc ? ' disabled' : '')
        + ' title="'+(enc?'Ya está asignado a este proyecto':'Asignar al proyecto')+'"'
        + ' style="padding:3px 10px;font-size:13px;line-height:1.2">'+(enc?'✓':'+')+'</button>'
    + '</td>'
    + '<td style="font-weight:500">'+cevenEsc(p.sku)+'</td>'
    + '<td class="wrap">'+cevenEsc(p.description)+'</td>'
    + '<td style="text-align:right;color:#6e6e73;white-space:nowrap">'+_catPreciosHTML(p)+'</td>'
    + '</tr>';
}

/* Agrega un producto al carrito con el precio del nivel global vigente (el
   mismo que usa agregarUno() en catalog.js). Sin nivel global elegido, o sin
   precio en ese nivel, se intenta el precio de deal antes de dejarlo en 0
   para completar a mano — un SKU en deal casi siempre es justo el que
   interesa cargar acá. */
function _rpAgregar(idx){
  var p = _rpRowAt(idx);
  if(!p || _rpEnCarrito(p.sku)) return;
  var t = tierGlobal();
  var precio = cevenPolyPrecioDe(p, t);
  if(precio === null){
    var precioDeal = p.precios && p.precios[CEVEN_TIER_DEAL];
    if(typeof precioDeal === 'number'){ precio = precioDeal; t = CEVEN_TIER_DEAL; }
    else { precio = 0; t = CEVEN_TIER_MANUAL; }
  }
  _rpCarrito.push({sku: p.sku, description: p.description, cantidad: 1, tier: t, precioUnitario: precio});
  renderRegiEditorBusqueda();
  _pintarRegiCarrito();
}

/* Saca del carrito TODAS las líneas de ese SKU — mismo criterio que
   quitarDeCotizacion() en catalog.js: el botón dice si el SKU está o no
   está, así que sacarlo tiene que sacarlo entero. */
function _rpQuitarSku(sku){
  var antes = _rpCarrito.length;
  _rpCarrito = _rpCarrito.filter(function(it){ return it.sku !== sku; });
  if(_rpCarrito.length === antes) return;
  renderRegiEditorBusqueda();
  _pintarRegiCarrito();
}

/* ── Carrito (mitad de abajo) ─────────────────────────────────────────────
   El nivel de precio SÍ se puede elegir por línea, igual que en una
   cotización real (tierSelectHTML de poly/js/tiers.js) — pero es una copia
   más chica y no la original, porque esa opera sobre `items` con `it.id` y
   acá cada línea vive en `_rpCarrito` direccionada por índice. */

function _rpTierSelectHTML(linea, li){
  var tiers = cevenTiers();
  if(!tiers.length) return '';
  var prod = cevenPolyProducto(products, linea.sku);
  var pr = (prod && prod.precios) || {};
  var deal = (prod && prod.deal) || null;
  var actual = linea.tier || CEVEN_TIER_MANUAL;
  var h = '<select class="si" name="rp-tier-'+li+'" data-rp-act="tier" data-li="'+li+'" style="font-size:11px;padding:2px 4px;max-width:130px">';
  for(var i=0;i<tiers.length;i++){
    var v = tiers[i].v, pv = pr[v];
    // El nivel DEAL solo se ofrece si el SKU está en deal (o ya está en ese
    // nivel): mismo criterio que tierSelectHTML, ver su comentario.
    if(tiers[i].deal && typeof pv !== 'number' && v !== actual) continue;
    var txt = tiers[i].lbl + (typeof pv === 'number' ? ' · ' + fD(pv) : ' · —');
    if(tiers[i].deal && deal && deal.fin){
      txt += ' · ' + (cevenDealVencido(deal) ? '⚠ venció ' : 'hasta ') + cevenDealFechaTxt(deal.fin);
    }
    h += '<option value="'+cevenEsc(v)+'"'+(v===actual?' selected':'')+'>'+cevenEsc(txt)+'</option>';
  }
  h += '<option value="'+CEVEN_TIER_MANUAL+'"'+(actual===CEVEN_TIER_MANUAL?' selected':'')+'>'+cevenEsc(CEVEN_TIER_MANUAL_LBL)+'</option>';
  h += '</select>';
  return h;
}

function _pintarRegiCarrito(){
  var box = document.getElementById('rp-cart');
  if(!box) return;
  var total = 0, html = '';
  for(var i=0;i<_rpCarrito.length;i++){
    var it = _rpCarrito[i];
    var sub = (it.precioUnitario || 0) * (it.cantidad || 0);
    total += sub;
    html += '<div class="pk-line">'
      + '<span class="pk-line-sku" title="'+cevenEsc(it.description)+'">'+cevenEsc(it.sku)+'</span>'
      + _rpTierSelectHTML(it, i)
      // Cantidad: stepper Y tipeo directo, mismo patrón que la tabla
      // principal de la cotización (poly/js/quote.js, .qstepper) — escribir
      // 12 de una es más rápido que apretar + doce veces. Bajar de 1 a mano
      // no saca la línea (clampea a 1): para eso está la papelera, que el
      // input la borre de sorpresa sería otra cosa.
      + '<span class="qstepper">'
        + '<button class="qstep" data-rp-act="menos" data-li="'+i+'" title="Restar uno">−</button>'
        + '<input class="si" type="number" min="1" name="rp-cantidad-'+i+'" value="'+cevenEsc(it.cantidad)+'" data-rp-act="cantidad" data-li="'+i+'">'
        + '<button class="qstep" data-rp-act="mas" data-li="'+i+'" title="Sumar uno">+</button>'
      + '</span>'
      + '<input type="number" min="0" step="0.01" class="si" name="rp-precio-'+i+'" data-rp-act="precio" data-li="'+i+'" value="'+(it.precioUnitario||0)+'" style="width:82px;font-size:12px;padding:2px 4px" title="Precio unitario — se puede escribir a mano">'
      // Siempre USD, como el resto del pipeline REGI: dp() convierte a ARS
      // según el toggle de moneda de la cotización en curso, y esta
      // asignación no tiene nada que ver con esa cotización (puede ni
      // haber ninguna abierta). Usar dp() acá mezclaría un estado ajeno.
      + '<span class="pk-line-imp">'+(sub ? cevenEsc('USD '+fI(sub)) : '<i>sin precio</i>')+'</span>'
      + '<button class="pk-del" data-rp-act="quitar" data-li="'+i+'" title="Sacar del proyecto">×</button>'
    + '</div>';
  }
  document.getElementById('rp-cart-n').textContent = _rpCarrito.length;
  box.innerHTML = html || '<div class="pk-vacio">Todavía no asignaste ningún producto. Tocá <b>+</b> en un producto de arriba.</div>';
  document.getElementById('rp-total').textContent = _rpCarrito.length ? ('USD ' + fI(total)) : '—';
}

/* ── Guardar ──────────────────────────────────────────────────────────────
   Reemplazo, no diff: se borra todo lo que ese `opd` tenía guardado y se
   inserta el carrito actual entero. Mismo criterio de "reemplazo, no
   acumulación" que ya usa _procesarRegiPipelineExcel() para la tabla padre
   — acá alcanzan dos llamadas REST porque el volumen por proyecto es bajo
   (unas pocas líneas), no hace falta un upsert con marca de tiempo. */
function guardarRegiProductos(){
  if(!_rpOpd) return;
  if(!cevenCanUsePipeline()){ showToast('Tu rol no permite editar proyectos REGI.'); return; }
  if(!_rpListo){ showToast('Todavía se están cargando los productos ya asignados — esperá un segundo y probá de nuevo.'); return; }
  var opd = _rpOpd;
  var quien = (typeof cevenSessionUser === 'function') ? (cevenSessionUser() || null) : null;
  var filas = _rpCarrito.filter(function(it){ return (it.cantidad||0) > 0; }).map(function(it){
    return {
      opd: opd, sku: it.sku, descripcion: it.description,
      cantidad: it.cantidad, precio_unitario: it.precioUnitario || 0,
      created_by: quien
    };
  });

  cevenAuthedFetch(_cevenRegiProdRest('poly_regi_pipeline_productos') + '?opd=eq.' + encodeURIComponent(opd), {method: 'DELETE'})
    .then(function(){
      if(!filas.length) return;
      return cevenAuthedFetch(_cevenRegiProdRest('poly_regi_pipeline_productos'), {
        method: 'POST',
        headers: {Prefer: 'return=minimal'},
        body: JSON.stringify(filas)
      });
    })
    .then(function(){
      var total = filas.reduce(function(s, f){ return s + f.cantidad * f.precio_unitario; }, 0);
      window._regiProductosTotales = window._regiProductosTotales || {};
      window._regiProductosTotales[opd] = total;
      // Actualiza la fila ya en memoria en vez de refetchear todo el
      // pipeline REGI: más rápido, y no hay riesgo de pisar un filtro o
      // una búsqueda que se esté escribiendo en el buscador. `monto` es el
      // que se ve y se suma en toda la UI (pipeline-regi.js): con productos
      // pasa a ser esta sumatoria, reemplazando al del archivo de HP; sin
      // productos (carrito vaciado) vuelve a ser `montoArchivo`.
      (window._regiPipeRows || []).forEach(function(r){
        if(r.opd !== opd) return;
        r.productosMonto = total;
        r.monto = total > 0 ? total : (r.montoArchivo || 0);
      });
      cerrarRegiEditor();
      if(typeof renderPipeline === 'function') renderPipeline();
      showToast('✓ Productos guardados: ' + filas.length + (filas.length === 1 ? ' línea' : ' líneas') + ' · USD ' + fI(total));
    })
    .catch(function(e){
      showErr('No se pudo guardar la asignación de productos: ' + ((e && e.message) || 'error desconocido'));
    });
}

/* ── Cableado ─────────────────────────────────────────────────────────────
   Los listeners se atan UNA vez al contenedor, que no se reemplaza: el que
   se repinta es su contenido. Mismo patrón que picker.js. */
(function(){
  function wire(){
    var m = document.getElementById('regi-prod-modal');
    if(!m) return;

    m.addEventListener('click', function(ev){
      if(ev.target === m || (ev.target.closest && ev.target.closest('[data-rp-cerrar]'))) cerrarRegiEditor();
    });

    var body = document.getElementById('rp-body');
    if(body) body.addEventListener('click', function(ev){
      var el = ev.target.closest ? ev.target.closest('[data-act="rp-add"]') : null;
      if(!el || !body.contains(el)) return;
      _rpAgregar(el.getAttribute('data-rpi'));
    });

    var cart = document.getElementById('rp-cart');
    if(cart){
      cart.addEventListener('click', function(ev){
        var el = ev.target.closest ? ev.target.closest('[data-rp-act]') : null;
        if(!el || !cart.contains(el)) return;
        var li = parseInt(el.getAttribute('data-li'), 10);
        var linea = _rpCarrito[li];
        if(!linea) return;
        var act = el.getAttribute('data-rp-act');
        if(act === 'quitar'){ _rpQuitarSku(linea.sku); return; }
        else if(act === 'mas'){ linea.cantidad = (linea.cantidad||0) + 1; }
        else if(act === 'menos'){
          linea.cantidad = (linea.cantidad||0) - 1;
          if(linea.cantidad < 1){ _rpQuitarSku(linea.sku); return; }
        }
        _pintarRegiCarrito();
      });
      cart.addEventListener('change', function(ev){
        var el = ev.target.closest ? ev.target.closest('[data-rp-act]') : null;
        if(!el || !cart.contains(el)) return;
        var li = parseInt(el.getAttribute('data-li'), 10);
        var linea = _rpCarrito[li];
        if(!linea) return;
        var act = el.getAttribute('data-rp-act');
        if(act === 'tier'){
          linea.tier = el.value;
          if(el.value !== CEVEN_TIER_MANUAL){
            var precio = cevenPolyPrecioDe(cevenPolyProducto(products, linea.sku), el.value);
            if(precio !== null) linea.precioUnitario = precio;
          }
          _pintarRegiCarrito();
        } else if(act === 'precio'){
          // Escribir un precio a mano pasa la línea a Custom — mismo
          // contrato que marcarManual() en tiers.js: si no, el próximo
          // cambio de nivel le pisaría el precio recién escrito.
          linea.tier = CEVEN_TIER_MANUAL;
          linea.precioUnitario = Math.max(0, parseFloat(el.value) || 0);
          _pintarRegiCarrito();
        } else if(act === 'cantidad'){
          // Clampea a 1 en vez de sacar la línea — mismo criterio que
          // upQty() en quote.js: escribir 0 o borrar el campo no es un
          // gesto de "sacar esto", es un campo a medio completar.
          linea.cantidad = Math.max(1, parseInt(el.value, 10) || 1);
          _pintarRegiCarrito();
        }
      });
    }

    var s = document.getElementById('rp-search');
    if(s) s.addEventListener('input', renderRegiEditorBusqueda);
    bindRubros(document.getElementById('rp-rubro'), renderRegiEditorBusqueda);
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire);
  else wire();
})();
