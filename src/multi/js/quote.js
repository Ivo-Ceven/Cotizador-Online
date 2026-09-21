/* ============================================================
   LA GRILLA DEL PEDIDO  ·  Cotizador multimarca
   ------------------------------------------------------------
   Una tabla con lineas de varias marcas. Dos decisiones de
   pantalla que vienen de como funciona el negocio:

   · Las lineas se AGRUPAN POR MARCA, con un separador y su
     subtotal. El pedido se cotiza junto pero se factura
     separado —cada marca emite su cotizacion—, asi que ver el
     subtotal de cada una no es decoracion: es el numero que va a
     terminar en el pipeline de esa marca.

   · Los controles de precio de arriba son los de LAS MARCAS
     PRESENTES. Si el pedido no tiene nada de Poly no hay
     selector de nivel, y si no tiene nada de Apple no hay
     margen. Mostrar controles que no mueven nada invita a
     tocarlos y a no entender por que no pasa nada.

   El precio de cada linea lo calcula el registro (js/marcas.js)
   con las formulas de su marca. Aca no hay ni una cuenta.

   Depende de: js/marcas.js, js/state.js, js/catalogo-multi.js,
   shared/quote-core.js, shared/opciones.js, shared/ui-core.js.
   ============================================================ */

/* ── Controles globales ──────────────────────────────────────────────────── */

/* El valor de los controles vive ACA y no solo en el DOM: la barra se rehace en
   cada render (las marcas presentes cambian al agregar o sacar lineas), asi que
   el <input> y el <select> se destruyen y se vuelven a crear. Sin la variable,
   el margen volveria a 0 y el nivel a vacio cada vez que se agrega un producto
   —y las lineas quedarian repriceadas con un valor que nadie eligio. */
var _margenGlobalValor = 0;
var _tierGlobalValor   = '';

// El margen con el que se cotizan las lineas de Apple.
function getMargenGlobal(){
  var el = document.getElementById('margen-global');
  if(!el) return _margenGlobalValor;
  var v = parseFloat(el.value);
  if(isNaN(v)) return _margenGlobalValor;
  return Math.min(80, Math.max(0, Math.round(v * 100) / 100));
}

// El nivel de precio con el que se cotizan las lineas de Poly.
function tierGlobalMulti(){
  var el = document.getElementById('tier-global');
  return el ? (el.value || '') : _tierGlobalValor;
}

// Los deja escritos en la variable, que es la que sobrevive al repintado.
function _sincronizarControles(){
  _margenGlobalValor = getMargenGlobal();
  _tierGlobalValor   = tierGlobalMulti();
}

/* Una cotizacion "FOB" no nacionaliza: es el unico punto de esta pantalla que
   mueve precios de Apple. La marca la detecta igual —por Observaciones— y el
   flag viaja a la fila del pipeline, porque Observaciones no llega ahi. */
function isCotizacionFOB(){
  var el = document.getElementById('obs');
  return /^\s*fob\b/i.test(el ? (el.value || '') : '');
}

/* El contexto que necesita el registro de marcas para poner precios. Es el
   mismo que arma cevenEmitirContexto() pero solo con lo que hace falta para
   calcular: si fueran dos contextos distintos, el precio de la pantalla y el
   precio emitido podrian no coincidir. */
function ctxPrecio(){
  return {
    margen: getMargenGlobal(),
    fob: isCotizacionFOB(),
    tierGlobal: tierGlobalMulti(),
    nacRates: nacRatesApple,
    catalogos: catalogos
  };
}

/* Repricea las lineas de UNA marca cuando cambia su control global. Solo esa
   marca: cambiar el margen de Apple no puede tocar una linea de Poly. */
function _repricearMarca(brand){
  var reg = cevenMultiMarca(brand);
  if(!reg || !reg.repricear) return 0;
  var ctx = ctxPrecio(), n = 0;
  for(var i=0;i<items.length;i++){
    if(items[i].brand !== brand) continue;
    if(reg.repricear(items[i], ctx)) n++;
  }
  return n;
}

function onMargenGlobalChange(){
  _sincronizarControles();
  var n = _repricearMarca('apple');
  renderQ();
  if(n) showToast('✓ ' + n + (n===1?' línea de Apple actualizada' : ' líneas de Apple actualizadas')
    + ' al ' + getMargenGlobal() + '% de margen.');
}

/* Repricea las lineas de TODAS las marcas que se cotizan por nivel, no solo las
   de Poly. Quien usa nivel lo dice su registro (cevenMultiUsaTier), asi que una
   marca nueva entra sola.

   El nivel global es UNO SOLO y se le pasa a todas: los niveles salen de la
   misma columna "Nivel de precio" del export de NetSuite, asi que Poly y Huawei
   comparten vocabulario y el mismo valor les sirve a las dos. Una marca cuyos
   niveles se llamen distinto simplemente no matchea y su repricear() devuelve
   false —no se rompe, no se mueve—; para esas lineas esta el selector propio de
   cada una. */
function _repricearTiers(){
  var marcas = cevenMultiMarcasConTier(items), n = 0;
  for(var i=0;i<marcas.length;i++) n += _repricearMarca(marcas[i]);
  return n;
}

function onTierGlobalMultiChange(){
  _sincronizarControles();
  var n = _repricearTiers();
  renderQ();
  var t = tierGlobalMulti();
  // Se recuerda el nivel con el que se le cotiza a este cliente, igual que Poly.
  var cli = (document.getElementById('client').value || '').trim();
  if(cli && t && typeof cevenClienteSet === 'function') cevenClienteSet(cli, {tier: t});
  if(n) showToast('✓ ' + n + (n===1?' línea actualizada a ' : ' líneas actualizadas a ')
    + cevenTierLabelMulti(t));
}

/* Al elegir el cliente se propone SU nivel, si el selector todavia esta vacio.
   Mismo criterio que aplicarTierDelCliente() en Poly: si el usuario ya eligio
   uno a mano, cambiarselo por atras seria peor que no ayudar. */
function aplicarTierDelCliente(){
  if(tierGlobalMulti()) return;
  var cli = (document.getElementById('client').value || '').trim();
  if(!cli || typeof cevenClienteTier !== 'function') return;
  var t = cevenClienteTier(cli);
  if(!t) return;
  _tierGlobalValor = t;
  var el = document.getElementById('tier-global');
  if(el) el.value = t;
  var n = _repricearTiers();
  renderQ();
  showToast('Nivel ' + cevenTierLabelMulti(t) + ' — el último que usaste con ' + cli
    + (n ? (' · ' + n + (n===1?' línea actualizada':' líneas actualizadas')) : ''));
}

/* Los niveles de una marca salen de su brand.js, no de una lista escrita aca.
   Como el multimarca no carga esos archivos, se leen del catalogo de esa marca:
   las claves de `precios` de cualquier producto son exactamente los niveles.

   Se recorre TODO el catalogo y se unen las claves, en vez de quedarse con las
   del primer producto que tenga precios. Ese atajo alcanzaba mientras los
   cuatro niveles del ERP estuvieran en todos los SKU, pero desde que existe el
   nivel DEAL (poly/js/catalog.js) hay niveles que solo tienen ALGUNOS
   productos: si el primero de la lista no estaba en un deal, "Deal" no
   aparecia en el selector aunque el catalogo tuviera 600 SKU con deal. */
// La union de los niveles de varias marcas, en orden, sin repetir. Es lo que
// ofrece el selector global cuando el pedido mezcla marcas por nivel.
function _nivelesDeMarcas(brands){
  var vistos = {}, out = [];
  (brands || []).forEach(function(b){
    nivelesDeMarca(b).forEach(function(v){
      if(vistos[v]) return;
      vistos[v] = 1;
      out.push(v);
    });
  });
  return out;
}

function nivelesDeMarca(brand){
  var lista = catalogos[brand] || [], vistos = {}, out = [];
  for(var i=0;i<lista.length;i++){
    var p = lista[i].precios;
    if(!p) continue;
    var ks = Object.keys(p);
    for(var k=0;k<ks.length;k++){
      if(vistos[ks[k]]) continue;
      vistos[ks[k]] = 1;
      out.push(ks[k]);
    }
  }
  /* DEAL siempre ultimo: es el nivel excepcional (solo algunos SKU, y con
     vencimiento), no uno mas de la lista del ERP. El orden de los otros cuatro
     es el del archivo, igual que antes. */
  out.sort(function(a,b){ return (a === 'DEAL') - (b === 'DEAL'); });
  return out;
}

// La etiqueta corta de un nivel: 'Ceven - Tier 2' se lee 'Tier 2'.
function cevenTierLabelMulti(v){
  if(v === CEVEN_TIER_MANUAL) return CEVEN_TIER_MANUAL_LBL;
  // El nivel DEAL se guarda en mayusculas (es la clave de `precios`); en
  // pantalla se lee como en el cotizador de Poly.
  if(v === 'DEAL') return 'Deal';
  return String(v || '').replace(/^Ceven\s*-\s*/, '');
}

/* Pinta la barra de controles con lo que corresponda a las marcas presentes.
   Se rehace en cada render porque las marcas presentes cambian al agregar o
   sacar lineas. */
function pintarControles(){
  var box = document.getElementById('ctrl-box');
  if(!box) return;
  var marcas = cevenMultiMarcasDe(items);
  var h = '';

  if(marcas.indexOf('apple') >= 0){
    h += '<div class="ctrl">'
      + '<label class="lbl" for="margen-global">Margen Apple</label>'
      + '<div style="display:flex;align-items:center;gap:6px">'
      +   '<input id="margen-global" type="number" min="0" max="80" step="0.25" value="'
      +     cevenEsc(_margenGlobalValor) + '" style="width:84px" onchange="onMargenGlobalChange()">'
      +   '<span style="font-size:13px;color:var(--ct2)">%</span>'
      + '</div></div>';
  }
  /* UN solo selector de nivel para todas las marcas que se cotizan asi, no uno
     por marca: los niveles salen de la misma columna del export de NetSuite, de
     modo que el vendedor elige "Tier 2" una vez y vale para el pedido entero.
     El rotulo nombra las marcas presentes para que se vea a que alcanza. */
  var conTier = cevenMultiMarcasConTier(items);
  if(conTier.length){
    var niveles = _nivelesDeMarcas(conTier), actual = tierGlobalMulti();
    h += '<div class="ctrl">'
      + '<label class="lbl" for="tier-global">Nivel de precio '
      +   cevenEsc(conTier.map(cevenMultiMarcaLabel).join(' / ')) + '</label>'
      + '<select id="tier-global" onchange="onTierGlobalMultiChange()" style="min-width:170px">'
      + '<option value=""' + (actual ? '' : ' selected') + '>— Elegir nivel —</option>';
    for(var i=0;i<niveles.length;i++){
      h += '<option value="' + cevenEsc(niveles[i]) + '"' + (niveles[i] === actual ? ' selected' : '') + '>'
         + cevenEsc(cevenTierLabelMulti(niveles[i])) + '</option>';
    }
    h += '</select></div>';
  }
  if(!h){
    h = '<div class="sub">Agregá productos y acá van a aparecer los controles de precio de cada marca.</div>';
  }
  box.innerHTML = h;
}

/* ── La grilla ───────────────────────────────────────────────────────────── */

// Total de una opcion. Lo consume la barra A/B (shared/opciones.js) y el pie.
function totalDeOpcion(n){
  var t = 0, its = cevenOpcFiltrar(items, n);
  for(var i=0;i<its.length;i++) t += (its[i].salePrice||0) * (its[i].qty||0);
  return t;
}

/* El <select> de nivel de UNA linea, con el precio de cada nivel al lado: el
   orden de los niveles NO implica cual es mas caro.

   Los niveles y los precios salen del catalogo de LA MARCA DE LA LINEA, no del
   de Poly: si se leyeran del de Poly, una linea de otra marca mostraria los
   niveles de Poly y un precio vacio al lado de cada uno.

   Que igual se llame a cevenPolyProducto()/cevenPolyTierEfectivo() NO es un
   descuido: son busqueda por SKU y resolucion de nivel propio-vs-global, dos
   cosas que no dependen de la marca. Las tres marcas por nivel tienen su copia
   byte a byte en su pricing-core.js; despachar cual usar segun it.brand seria
   mas codigo para el mismo resultado. Lo que SI depende de la marca es el
   CATALOGO, y ese entra por parametro. */
function tierSelectMultiHTML(it){
  var niveles = nivelesDeMarca(it.brand);
  if(!niveles.length) return '<span class="sub">—</span>';
  var prod = cevenPolyProducto(catalogos[it.brand] || [], it.sku);
  var precios = (prod && prod.precios) || {};
  var actual = cevenPolyTierEfectivo(it, tierGlobalMulti());
  var propio = !!it.tier && it.tier !== CEVEN_TIER_MANUAL;
  var h = '<select class="si" data-act="tier" data-id="' + cevenEsc(it.id) + '"'
        + ' style="width:100%;font-size:11px;padding:2px 4px'
        + (propio ? ';border-color:var(--acc);font-weight:600' : '') + '">';
  for(var i=0;i<niveles.length;i++){
    var v = niveles[i], p = precios[v];
    var txt = cevenTierLabelMulti(v) + (typeof p === 'number' ? ' · ' + fD(p) : ' · —');
    h += '<option value="' + cevenEsc(v) + '"' + (v === actual ? ' selected' : '') + '>' + cevenEsc(txt) + '</option>';
  }
  h += '<option value="' + CEVEN_TIER_MANUAL + '"' + (actual === CEVEN_TIER_MANUAL ? ' selected' : '') + '>'
     + cevenEsc(CEVEN_TIER_MANUAL_LBL) + '</option></select>';
  return h;
}

/* La celda de control de una linea, segun su marca. Las marcas por nivel eligen
   nivel; Apple muestra el margen con el que quedo (se edita con el margen global
   o escribiendo el precio a mano, que es como funciona en su cotizador).

   Que marca usa nivel lo dice el registro (cevenMultiUsaTier), no un `if` por
   marca: sumar una marca por nivel es agregarla a marcas.js y nada mas. */
function _celdaControl(it){
  if(cevenMultiUsaTier(it.brand)) return tierSelectMultiHTML(it);
  if(it.brand === 'apple'){
    var mg = (typeof it.itemMargin === 'number') ? it.itemMargin : 0;
    return '<span style="font-size:12px;color:var(--ct2)'
      + (it.manualMargin ? ';font-weight:600;color:var(--ct1)' : '') + '"'
      + (it.manualMargin ? ' title="Precio escrito a mano: el margen global ya no la mueve"' : '')
      + '>' + cevenEsc(mg) + '%' + (it.manualMargin ? ' ✎' : '') + '</span>';
  }
  return '<span class="sub">—</span>';
}

function renderQ(){
  // La grilla muestra SOLO la opcion que se esta editando. Las lineas de la
  // otra siguen en `items` y se guardan igual.
  var opc = cevenOpcActiva();
  cevenOpcPintarBarra({1: totalDeOpcion(1), 2: totalDeOpcion(2)});
  pintarControles();

  var visibles = cevenOpcFiltrar(getSortedItems(), opc);
  var html = '', gt = 0;

  /* Agrupadas por marca, en el orden del registro. Dentro de cada grupo se
     respeta el orden de la grilla (el sort de la cabecera o el de insercion). */
  var marcas = cevenMultiMarcasDe(visibles);
  for(var m=0;m<marcas.length;m++){
    var brand = marcas[m];
    var lineas = cevenMultiLineasDe(visibles, brand);
    if(!lineas.length) continue;
    var sub = 0;
    for(var s=0;s<lineas.length;s++) sub += (lineas[s].salePrice||0) * (lineas[s].qty||0);
    gt += sub;

    html += '<tr class="mk-sep"><td colspan="9">'
         +    '<span class="mk mk-' + cevenEsc(brand) + '">' + cevenEsc(cevenMultiMarcaLabel(brand)) + '</span>'
         +    '<span class="mk-sub">' + lineas.length + (lineas.length===1?' línea':' líneas') + ' · ' + cevenEsc(dp(sub)) + '</span>'
         +  '</td></tr>';

    for(var i=0;i<lineas.length;i++){
      var it = lineas[i];
      var sp = (it.salePrice === '' || it.salePrice == null) ? '' : it.salePrice;
      var priceRaw = (getCur()==='ARS' && sp!=='') ? Math.round(sp*getTC()) : sp;
      var pricePfx = getCur()==='ARS' ? 'ARS' : 'USD';
      var lineTotal = (sp===''?0:sp) * it.qty;
      var idA = cevenEsc(it.id);
      /* SKU y descripcion salen de catalogos que se sincronizan desde Supabase:
         van escapados si o si (una descripcion de Excel con <img onerror=...>
         se ejecutaba en la pantalla de todo el equipo). */
      html += '<tr>'
        + '<td style="font-weight:500">' + cevenEsc(it.sku) + '</td>'
        + '<td class="wrap">' + cevenEsc(it.description) + '</td>'
        + '<td style="text-align:right;white-space:nowrap">'
          + '<span class="qstepper">'
            + '<button class="qstep" data-act="qmenos" data-id="'+idA+'" title="Restar uno">−</button>'
            + '<input class="si" type="number" min="1" value="'+cevenEsc(it.qty)+'" data-act="qty" data-id="'+idA+'">'
            + '<button class="qstep" data-act="qmas" data-id="'+idA+'" title="Sumar uno">+</button>'
          + '</span>'
        + '</td>'
        + '<td style="overflow:visible">' + _celdaControl(it) + '</td>'
        + '<td style="text-align:right;white-space:nowrap;overflow:visible">'
          + '<div style="display:inline-flex;align-items:center;gap:4px">'
            + '<span style="font-size:11px;color:var(--ct2)">'+pricePfx+'</span>'
            + '<input class="si no-spin" type="text" inputmode="decimal" value="'+cevenEsc(priceRaw)+'" placeholder="0.00" style="width:96px;text-align:right;font-size:13px" data-act="price" data-id="'+idA+'">'
          + '</div>'
        + '</td>'
        + '<td style="text-align:right;font-weight:500">' + cevenEsc(dp(lineTotal)) + '</td>'
        + '<td style="text-align:center;white-space:nowrap;font-size:12px;color:var(--ct2)">' + cevenEsc(_ivaDeLinea(it)) + '</td>'
        + '<td style="text-align:center"><input class="si" type="text" value="'+cevenEsc(it.stock||'')+'" placeholder="—" style="width:100%" data-act="nota" data-id="'+idA+'"></td>'
        + '<td style="text-align:center;white-space:nowrap">'
          + '<button class="q-del" data-act="rm" data-id="'+idA+'" title="Sacar del pedido">🗑</button>'
        + '</td>'
        + '</tr>';
    }
  }

  // abrirPicker() y no openCat(): la subpantalla flotante deja elegir sin salir
  // del pedido (js/picker.js). openCat() sigue existiendo para la vista Catálogo
  // del menú, que es donde se ve el catálogo entero y se lo actualiza.
  html += '<tr><td colspan="9" style="padding:9px 10px">'
       +    '<button class="al" onclick="abrirPicker()"><span style="font-size:18px;line-height:1;font-weight:300">+</span> Agregar producto</button>'
       +  '</td></tr>';

  if(visibles.length){
    html += '<tr>'
      + '<td colspan="5" style="text-align:right;color:var(--ct2);font-size:13px;font-weight:500;padding:11px 10px;background:var(--c0);border-top:1px solid var(--cb)">Total del pedido</td>'
      + '<td style="text-align:right;font-size:15px;font-weight:600;padding:11px 10px;background:var(--c0);border-top:1px solid var(--cb)">' + dp(gt) + '</td>'
      + '<td colspan="3" style="background:var(--c0);border-top:1px solid var(--cb)"></td>'
      + '</tr>';
  }

  document.getElementById('qbody').innerHTML = html;
  _qBindDelegation();
  _pintarAvisoOpcion(opc);
  _pintarResumenMarcas();
}

// El IVA de la linea, con el nombre que le da cada marca a ese campo.
function _ivaDeLinea(it){
  return cevenFormatoIVA(it.iva || it.taxes) || '—';
}

/* Aviso cuando se edita la opcion que NO es la vigente: sin el, se carga media
   cotizacion en la B, se emite, y lo que baja a las marcas es la A. */
function _pintarAvisoOpcion(opc){
  var box = document.getElementById('opc-aviso-box');
  if(!box) return;
  if(!cevenOpcHayB() || opc === cevenOpcEfectiva()){ box.innerHTML = ''; return; }
  box.innerHTML = '<div class="opc-aviso">Estás editando la <b>Opción '+cevenOpcLetra(opc)+'</b>, '
    + 'que no es la vigente: a las marcas se emite la <b>Opción '+cevenOpcLetra(cevenOpcEfectiva())+'</b>.</div>';
}

/* Que se va a emitir y a donde. Es el resumen que evita la sorpresa: el pedido
   se ve como una tabla sola, pero al emitir se parte en una cotizacion por
   marca, cada una con su numero. */
function _pintarResumenMarcas(){
  var box = document.getElementById('emitir-resumen');
  if(!box) return;
  var vigentes = cevenOpcFiltrar(items, cevenOpcEfectiva());
  var marcas = cevenMultiMarcasDe(vigentes);
  if(!marcas.length){ box.innerHTML = ''; return; }
  var partes = marcas.map(function(b){
    var n = cevenMultiLineasDe(vigentes, b).length;
    var ya = emitidas[b];
    return '<span class="mk mk-'+cevenEsc(b)+'">'+cevenEsc(cevenMultiMarcaLabel(b))+'</span>'
      + '<span class="sub"> ' + n + (n===1?' línea':' líneas')
      + (ya ? (' · ya emitida como #' + cevenEsc(ya)) : '') + '</span>';
  });
  box.innerHTML = '<div class="emit-res"><b>Al emitir se crean ' + marcas.length
    + (marcas.length===1 ? ' cotización' : ' cotizaciones') + ':</b> ' + partes.join(' &nbsp;·&nbsp; ') + '</div>';
}

/* ── Edicion en la grilla ────────────────────────────────────────────────── */

function _qBindDelegation(){
  cevenDelegate('qbody', 'click', function(ev){
    var el = cevenActEl(ev, this);
    if(!el) return;
    var act = el.getAttribute('data-act'), id = el.getAttribute('data-id');
    if(act === 'rm') rmItem(id);
    /* Los pasos de cantidad leen del item y no del input: el valor del DOM
       puede estar a medio tipear, y un parseInt de "1" mientras alguien
       escribe "12" haria que el + salte a 2 en vez de a 13. */
    else if(act === 'qmas' || act === 'qmenos'){
      for(var i=0;i<items.length;i++){
        if(String(items[i].id) === String(id)){
          upQty(id, items[i].qty + (act === 'qmas' ? 1 : -1));
          break;
        }
      }
    }
  });
  cevenDelegate('qbody', 'change', function(ev){
    var el = cevenActEl(ev, this);
    if(!el) return;
    var act = el.getAttribute('data-act'), id = el.getAttribute('data-id');
    if(act === 'qty')        upQty(id, el.value);
    else if(act === 'price') upUnitPrice(id, el.value);
    else if(act === 'tier')  onTierLineaMultiChange(id, el.value);
    else if(act === 'nota')  upField(id, 'stock', el.value);
  });
}

function upQty(id, v){
  for(var i=0;i<items.length;i++){
    if(String(items[i].id) === String(id)) items[i].qty = Math.max(1, parseInt(v, 10) || 1);
  }
  renderQ();
}

/* Precio escrito a mano. Saca a la linea del control de su marca: en Poly pasa
   a MANUAL y en Apple queda con margen manual. Sin eso, el proximo cambio del
   nivel o del margen le pisaria el numero recien escrito. */
function upUnitPrice(id, v){
  var i, it = null;
  for(i=0;i<items.length;i++){ if(String(items[i].id) === String(id)){ it = items[i]; break; } }
  if(!it) return;

  if(String(v||'').trim() === ''){ it.salePrice = ''; renderQ(); return; }
  // cevenParseMoney (shared/safe.js): borrar todos los puntos multiplicaba por
  // 100 al reeditar un precio con decimales.
  var newP = cevenParseMoney(v);
  if(isNaN(newP) || newP < 0){ renderQ(); return; }
  var priceUSD = newP;
  if(getCur() === 'ARS'){
    var tc = getTC();
    // TC invalido: guardar el numero ARS como si fueran USD seria un ×1200 mudo.
    if(tc <= 0){ showErr('Cargá el tipo de cambio antes de tipear precios en ARS.'); renderQ(); return; }
    priceUSD = newP / tc;
  }
  it.salePrice = Math.round(priceUSD * 100) / 100;

  if(cevenMultiUsaTier(it.brand)) it.tier = CEVEN_TIER_MANUAL;
  if(it.brand === 'apple'){
    it.manualMargin = true;
    // El margen que quedo implicito en ese precio, con la misma inversa que usa
    // el cotizador de Apple: el pipeline lo necesita para el margen ponderado.
    it.itemMargin = cevenAppleMargenDePrecio(it.sellingBase, it.itemNac, it.salePrice);
  }
  renderQ();
}

function onTierLineaMultiChange(id, val){
  for(var i=0;i<items.length;i++){
    if(String(items[i].id) !== String(id)) continue;
    /* Elegir el mismo nivel que el global deja la linea SIGUIENDO al global
       (tier ''), no clavada: si no, cambiar el global despues no la moveria y
       el usuario no entenderia por que. Mismo criterio que Poly. */
    items[i].tier = (val === tierGlobalMulti()) ? '' : val;
    if(items[i].tier !== CEVEN_TIER_MANUAL){
      cevenPolyRepricear(items[i], catalogos.poly || [], tierGlobalMulti());
    }
    break;
  }
  renderQ();
}
