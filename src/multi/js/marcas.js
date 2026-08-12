/* ============================================================
   REGISTRO DE MARCAS  ·  Cotizador multimarca
   ------------------------------------------------------------
   El ÚNICO lugar del multimarca que sabe cómo se comporta cada
   marca. Es el espejo de `brand.js`: allá una app declara "soy
   Apple"; acá una app que las cruza declara "así se trata una
   línea de Apple".

   Todo lo que dependa de la marca vive en esta tabla. Si aparece
   un `if (linea.brand === 'apple')` en cualquier otro archivo de
   src/multi/, va mal: el lugar es acá, igual que en shared/ el
   lugar es brand.js.

   ⚠ NINGUNA fórmula se escribe acá. Los precios, la familia y
   los agregados de pipeline salen de `apple/js/pricing-core.js`
   y `poly/js/pricing-core.js` — los mismos archivos que usan los
   cotizadores de esas marcas. Si se copiara la cuenta, el mismo
   SKU saldría a dos precios distintos según por dónde se cotizó,
   y eso se descubre cuando el cliente compara los dos PDF.

   Cada marca declara:

     label        cómo se lee en pantalla
     controles    qué controles de precio necesita en la barra de
                  la cotización ('margen' en Apple, 'tier' en Poly)
     nuevaLinea   producto del catálogo → línea de la cotización
     repricear    recalcula el precio cuando cambia un control
     filaCquotes  línea → fila del `cquotes` DE ESA MARCA
     filaPipeline líneas → campos de la fila de pipeline DE ESA MARCA

   Los dos últimos son los que usa `emitir.js`. Tienen que escribir
   exactamente las mismas claves que el doSave()/addToPipeline() de
   la marca: si falta una, la cotización emitida se ve rara recién
   cuando alguien la abre desde el historial de esa marca.

   Depende de: apple/js/pricing-core.js, poly/js/pricing-core.js,
   shared/quote-num.js (cevenQNumFmt).
   ============================================================ */

/* El contexto que reciben todas estas funciones lo arma emitir.js/quote.js:

   {fecha, hora, cliente, proyecto, ejecutivo, obs, mesCierre, estado,
    payMode, effDate, delivery,        · condiciones comerciales
    qn,                                · el número EN ESA MARCA, ya formateado
    multiQNum,                         · 'M-0042', para poder volver
    margen, fob,                       · Apple
    tierGlobal,                        · Poly
    nacRates,                          · tabla NAC sincronizada de Apple
    catalogos}                         · {apple:[...], poly:[...]}                */

var CEVEN_MULTI_MARCAS = {

  /* ── APPLE ───────────────────────────────────────────────────────────────
     Precio = costo del price list + % nacionalización ÷ margen. Es el mismo
     número que muestra la pantalla "Price list" del cotizador de Apple: el
     multimarca no inventa precios, toma los de la marca.

     Sin overrides de NAC por cotización (eso vive en la app de Apple) y sin
     garantías CevenCare: las dos cosas se agregan ahí si hacen falta. */
  apple: {
    label: 'Apple',
    // Prefijo de sus claves en localStorage Y en la columna `key` de
    // app_settings. El de Apple es '' por historia (fue la primera marca).
    prefix: '',
    controles: ['margen'],

    nuevaLinea: function(p, ctx){
      // FOB o producto con la nacionalización ya incluida en el costo ⇒ NAC 0.
      var nac = (ctx.fob || p.nacIncluded) ? 0 : cevenAppleNac(p, ctx.nacRates, null);
      var mg  = ctx.margen || 0;
      return {
        brand: 'apple',
        sku: p.sku, description: p.description,
        lob: p.lob || '', modelCol: p.modelCol || '',
        sellingBase: p.sellingPrice, itemNac: nac, itemMargin: mg,
        salePrice: cevenAppleCalcP(p.sellingPrice, nac, mg),
        qty: 1, stock: '',
        taxes: cevenAppleIVA(p.lob, CEVEN_APPLE_IVA_MAP),
        nacIncluded: !!p.nacIncluded,
        manualMargin: false
      };
    },

    /* Cambió el margen global: se recalculan las líneas que NO tienen precio
       escrito a mano. Mismo criterio que recalcMarginsFromGlobal() en Apple:
       pisarle al vendedor un precio que acaba de escribir es peor que no
       actualizar nada. */
    repricear: function(it, ctx){
      if(it.manualMargin) return false;
      var nuevo = cevenAppleCalcP(it.sellingBase, it.itemNac, ctx.margen || 0);
      if(it.salePrice === nuevo) return false;
      it.itemMargin = ctx.margen || 0;
      it.salePrice = nuevo;
      return true;
    },

    /* Las claves son EXACTAMENTE las de doSave() en apple/js/quotes-db.js. Las
       que empiezan con `_` son internas (no salen al Excel) pero las lee el
       cotizador al reabrir la cotización desde el historial: sin `_base` y
       `_nac` no puede recalcular el precio si cambia el margen. */
    filaCquotes: function(it, ctx){
      return {
        'N° Cotización': ctx.qn, 'Fecha': ctx.fecha, 'Hora': ctx.hora,
        'Cliente': ctx.cliente, 'Proyecto': ctx.proyecto, 'Ejecutivo': ctx.ejecutivo,
        'Observaciones': ctx.obs, 'Mes Cierre': ctx.mesCierre,
        'Condición de pago': ctx.payMode, 'Propuesta efectiva hasta': ctx.effDate,
        'Entrega': ctx.delivery,
        /* Lo emitido es SIEMPRE una cotización de una sola opción: el
           multimarca puede tener A y B, pero a la marca baja la vigente. */
        'Opción': 1, '_opcEf': 1,
        'SKU': it.sku, 'Descripción': it.description, 'Cantidad': it.qty,
        'Disponibilidad': it.stock || '—', 'IVA': it.taxes || '',
        'Margen %': it.itemMargin,
        'P. Venta Unitario': it.salePrice, 'Total': it.salePrice * it.qty,
        'Tipo': 'producto',
        '_base': it.sellingBase, '_nac': it.itemNac, '_lob': it.lob || '',
        '_taxes': it.taxes || '', '_estado': ctx.estado,
        '_nacIncluded': !!it.nacIncluded, '_manualMg': !!it.manualMargin,
        // De dónde vino. No lo usa el cotizador de Apple; sirve para rastrear
        // una línea hasta el pedido que la originó.
        '_multi': ctx.multiQNum
      };
    },

    // Cantidades y montos por familia + margen ponderado: la misma función que
    // usa addToPipeline() de Apple.
    filaPipeline: function(its, ctx){
      return cevenAppleAgregados(its, [], CEVEN_APPLE_MODEL_CATEGORY);
    },

    /* Campos de la fila de pipeline que NO son cuentas. `esFOB` va en la fila y
       no se deduce del texto: Observaciones no viaja al pipeline, y sin el flag
       la nacionalización al 0% se pierde del lado de Apple. */
    pipelineExtra: function(ctx){
      return { esFOB: !!ctx.fob };
    }
  },

  /* ── POLY ────────────────────────────────────────────────────────────────
     Precio = el del nivel (Tier 1/2/3 o Negocios Especiales) en el catálogo.
     El nivel sale del selector global, o del propio de la línea si tiene. */
  poly: {
    label: 'Poly',
    prefix: 'poly_',
    controles: ['tier'],

    nuevaLinea: function(p, ctx){
      var it = {
        brand: 'poly',
        sku: p.sku, description: p.description,
        iva: p.iva || '', qty: 1, salePrice: '', stock: '',
        tier: ''            // '' = sigue al nivel global
      };
      cevenPolyRepricear(it, ctx.catalogos.poly, ctx.tierGlobal);
      return it;
    },

    // Cambió el nivel global: mueve solo las que lo siguen (las de nivel propio
    // y las MANUAL quedan intactas, igual que en el cotizador de Poly).
    repricear: function(it, ctx){
      if(it.tier) return false;
      return cevenPolyRepricear(it, ctx.catalogos.poly, ctx.tierGlobal);
    },

    // Claves de doSave() en poly/js/quotes-db.js.
    filaCquotes: function(it, ctx){
      var sp = (it.salePrice === '' || it.salePrice == null) ? 0 : it.salePrice;
      return {
        'N° Cotización': ctx.qn, 'Fecha': ctx.fecha, 'Hora': ctx.hora,
        'Cliente': ctx.cliente, 'OPG': ctx.opg || '—', 'Proyecto': ctx.proyecto,
        'Ejecutivo': ctx.ejecutivo, 'Observaciones': ctx.obs,
        'Mes Cierre': ctx.mesCierre,
        'Condición de pago': ctx.payMode, 'Propuesta efectiva hasta': ctx.effDate,
        'Entrega': ctx.delivery,
        'Opción': 1, '_opcEf': 1,
        'Nivel de precio': cevenPolyTierEfectivo(it, ctx.tierGlobal),
        'SKU': it.sku, 'Descripción': it.description, 'Cantidad': it.qty,
        'Nota': it.stock || '—', 'IVA': it.iva || '',
        'P. Venta Unitario': it.salePrice, 'Total': sp * it.qty,
        'Tipo': 'producto', '_estado': ctx.estado,
        '_multi': ctx.multiQNum
      };
    },

    // Poly no tiene familias ni margen: la fila lleva un monto y nada más.
    filaPipeline: function(its, ctx){
      return { monto: cevenPolyMonto(its) };
    },

    /* `opg` es el número de precio especial que asigna la marca y `factura`
       guarda el link a Netsuite (se llama así por historia, ver poly/brand.js).
       Los dos son NULL al emitir: son seguimiento posterior, y una re-emisión
       NO los pisa. */
    pipelineExtra: function(ctx){
      return { opg: ctx.opg || null, factura: null };
    }
  }
};

// Las marcas que el multimarca conoce, en orden de presentación.
function cevenMultiMarcasIds(){ return Object.keys(CEVEN_MULTI_MARCAS); }

/* ⚠ LA CLAVE DE `app_settings` LLEVA EL PREFIJO DE LA MARCA.

   La columna `key` guarda la clave REAL de localStorage, no el nombre base:
   `sync.js` le aplica `cevenK()` antes de subir (sync.js:73-80 y :564). O sea
   que el catálogo de Poly está en `(poly, 'poly_cpl')` y el de Apple en
   `(apple, 'cpl')` — este último solo porque el prefijo de Apple es ''.

   Pedir `key=eq.cpl` devuelve Apple y NADA de las demás marcas, sin error: la
   fila simplemente no existe. Ese fue el bug del 12/08/2026, que hacía que el
   multimarca mostrara únicamente productos de Apple.

   NO sirve `window.cevenK()` acá: en esta página prefija con `multi_`, que es
   el prefijo del multimarca y no el de la marca que se está leyendo. */
function cevenMultiClave(brand, base){
  var m = cevenMultiMarca(brand);
  return (m ? (m.prefix || '') : '') + base;
}

/* Todas las claves de una lista de bases, para armar un `key=in.(...)` que
   alcance a todas las marcas. Sumar HP es agregarla al registro y nada más. */
function cevenMultiClaves(bases){
  var out = [];
  cevenMultiMarcasIds().forEach(function(b){
    (bases || []).forEach(function(base){
      var k = cevenMultiClave(b, base);
      if(out.indexOf(k) < 0) out.push(k);
    });
  });
  return out;
}

function cevenMultiMarca(id){ return CEVEN_MULTI_MARCAS[id] || null; }

/* La etiqueta de una marca. Un id desconocido se devuelve tal cual en vez de
   caer a '' o a 'Apple': mostrar el valor crudo permite darse cuenta;
   mostrarlo como otra marca lo esconde. Mismo criterio que cevenEstadoLabel(). */
function cevenMultiMarcaLabel(id){
  var m = cevenMultiMarca(id);
  return m ? m.label : String(id || '');
}

// Las marcas presentes en un juego de líneas, en el orden del registro.
function cevenMultiMarcasDe(items){
  var hay = {}, out = [];
  (items || []).forEach(function(it){ if(it && it.brand) hay[it.brand] = 1; });
  cevenMultiMarcasIds().forEach(function(id){ if(hay[id]) out.push(id); });
  // Una línea de una marca que el registro no conoce no se puede emitir, pero
  // tampoco se esconde: se devuelve para que el llamador pueda avisar.
  Object.keys(hay).forEach(function(id){ if(out.indexOf(id) < 0) out.push(id); });
  return out;
}

// Las líneas de UNA marca. Es el reparto que hace la emisión.
function cevenMultiLineasDe(items, brand){
  return (items || []).filter(function(it){ return it && it.brand === brand; });
}
