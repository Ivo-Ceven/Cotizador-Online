/* ============================================================
   PRICING · NÚCLEO  ·  Apple
   ------------------------------------------------------------
   Las cuentas de Apple SIN pantalla: no leen un input, no tocan
   el DOM y no dependen de ninguna global de la app. Todo lo que
   necesitan entra por parámetro.

   Existe por el cotizador MULTIMARCA (src/multi/), que cotiza
   SKUs de Apple sin ser la app de Apple: necesita el mismo
   precio, la misma familia y los mismos agregados de pipeline
   que esta marca, y la única forma de garantizar que no
   divergan es que sea EL MISMO código. Duplicar la fórmula
   terminaría en dos precios distintos para el mismo SKU — el
   cliente recibiría un PDF y el pipeline diría otra cosa.

   Es el mismo movimiento que ya se hizo con _pipeAgregados()
   cuando aparecieron las opciones A/B: una sola cuenta, varios
   llamadores.

   `apple/js/pricing.js` y `apple/js/pipeline-core.js` son ahora
   los envoltorios que le pasan las globales de la pantalla
   (nacRates, quoteNacOverrides, IVA_MAP, MODEL_CATEGORY).

   Depende de: nada. Se carga ANTES de apple/js/state.js, que
   toma de acá las tres tablas.
   ============================================================ */

/* ── Tablas ──────────────────────────────────────────────────────────────
   Viven acá y no en state.js porque son datos de PRICING, y el multimarca
   los necesita sin cargar el resto del estado de la app de Apple. state.js
   las sigue exponiendo con sus nombres de siempre (NAC_DEF, MODEL_CATEGORY,
   IVA_MAP) para no tocar los ~20 lugares que ya las usan. */

// % de nacionalización por defecto, por modelo (LOB). Es el PRESET: lo que
// el usuario edita en la pantalla de Nacionalización vive en `cnac`.
var CEVEN_APPLE_NAC_DEF = {"AirTag":29,"Apple TV":29,"Apple TV Accessories":29,"Creativity":33,"Displays & Mounts":33,"Headphones & Speakers":48,"iMac":24,"iPad":19,"iPad Air":19,"iPad Air 11":19,"iPad Air 13":19,"iPad mini":19,"iPad Pro 11":19,"iPad Pro 13":19,"iPhone":6,"Mac English":24,"Mac Spanish":24,"Mac mini":6,"Mac Studio":24,"MacBook Air 13":24,"MacBook Air 15":24,"MacBook Neo":25,"MacBook Pro 14":24,"MacBook Pro 16":24,"Mice & Keyboards":33,"Power & Cables":40,"Watch":40,"Watch SE 3":40,"Watch Series 11":40,"Watch Ultra 3":40};

// Tabla de categorías por Model (LOB) — fuente de verdad para el pipeline.
var CEVEN_APPLE_MODEL_CATEGORY = {
  'AirTag':'acc','Apple TV':'acc','Apple TV Accessories':'acc',
  'Creativity':'acc','Displays & Mounts':'acc','Headphones & Speakers':'acc',
  'Mice & Keyboards':'acc','Power & Cables':'acc',
  'Watch':'acc','Watch SE 3':'acc','Watch Series 11':'acc','Watch Ultra 3':'acc',
  // 'Mac English' y 'Mac Spanish' NO están aquí: se usan tanto para Macs con
  // teclado en español/inglés como para accesorios → el fallback por descripción
  // los distingue correctamente (un MacBook tiene "MacBook" en el nombre; un
  // Magic Keyboard/Mouse/Trackpad no).
  'iMac':'mac','Mac mini':'mac','Mac Studio':'mac',
  'MacBook Air 13':'mac','MacBook Air 15':'mac','MacBook Neo':'mac',
  'MacBook Pro 14':'mac','MacBook Pro 16':'mac',
  'iPad':'ipad','iPad Air':'ipad','iPad Air 11':'ipad','iPad Air 13':'ipad',
  'iPad mini':'ipad','iPad Pro 11':'ipad','iPad Pro 13':'ipad',
  'iPhone 15':'iphone','iPhone 16':'iphone','iPhone 16 Plus':'iphone',
  'iPhone 16e':'iphone','iPhone 17':'iphone','iPhone 17 Pro':'iphone',
  'iPhone 17 Pro Max':'iphone','iPhone 17e':'iphone',
  'iPhone Air':'iphone'
};

var CEVEN_APPLE_IVA_MAP = {"Accessories":"21%","TV & Home":"21%","Mac":"10.5%","Mac English":"10.5%","Mac Spanish":"10.5%","iPad":"10.5%","iPhone":"10.5% + 21%","Watch":"21%"};


/* ── Precio ──────────────────────────────────────────────────────────────
   costo base + % nacionalización, dividido por (1 − margen).
   El clamp de mg a 99 evita la división por cero: con margen 100 el precio
   sería infinito y la cotización saldría con "Infinity". */
function cevenAppleCalcP(base, nac, mg){
  if(mg >= 100) mg = 99;
  return Math.round((base||0) * (1 + (nac||0)/100) / (1 - (mg||0)/100));
}

/* Margen exacto a partir de un precio de venta dado: la inversa de calcP().

   El margen NEGATIVO se conserva: vender bajo el costo nacionalizado es una
   pérdida real y tiene que llegar así al pipeline y al Target Anual. Antes se
   clampeaba a 0 y el margen ponderado salía inflado (18,2% en vez de 16,0%). */
function cevenAppleMargenDePrecio(base, nac, price){
  if(!price || price <= 0) return 0;
  var costoNac = base * (1 + (nac||0)/100);
  if(costoNac <= 0) return 0;
  var mg = (1 - costoNac/price) * 100;
  if(mg < -100) mg = -100; // piso: precio de venta ridículo / dato corrupto
  if(mg > 99) mg = 99;
  return Math.round(mg * 100) / 100; // 2 decimales
}

/* ── Nacionalización ─────────────────────────────────────────────────────
   El % de un producto. Se busca en tres campos por orden de confianza (LOB,
   Model, descripción) y en cada uno primero el override de la cotización y
   después la tabla global; dentro de cada tabla gana la clave MÁS LARGA que
   esté contenida en el texto, para que 'iPad Pro 13' le gane a 'iPad'.

   `overrides` es opcional: el multimarca no tiene overrides por cotización.
   Sin match devuelve 20, que es el default histórico. */
function cevenAppleNac(p, tasas, overrides){
  p = p || {}; tasas = tasas || {}; overrides = overrides || {};
  var sources = [(p.lob||''), (p.modelCol||''), (p.description||'')];
  for(var s=0;s<sources.length;s++){
    var src = sources[s];
    if(!src) continue;
    if(overrides[src] !== undefined) return overrides[src];
    if(tasas[src] !== undefined) return tasas[src];
    var lo = src.toLowerCase();
    var mejor = _cevenAppleClaveMasLarga(overrides, lo);
    if(mejor !== null) return overrides[mejor];
    mejor = _cevenAppleClaveMasLarga(tasas, lo);
    if(mejor !== null) return tasas[mejor];
  }
  return 20;
}

// La clave más larga de `mapa` que esté contenida en `textoLower`, o null.
function _cevenAppleClaveMasLarga(mapa, textoLower){
  var keys = Object.keys(mapa), mejor = null, mejorLen = 0;
  for(var i=0;i<keys.length;i++){
    var k = keys[i].toLowerCase();
    if(textoLower.indexOf(k) !== -1 && k.length > mejorLen){ mejor = keys[i]; mejorLen = k.length; }
  }
  return mejor;
}

/* ── IVA ─────────────────────────────────────────────────────────────────
   Mismo criterio de "la clave más larga que matchea". */
function cevenAppleIVA(lob, mapa){
  mapa = mapa || {};
  if(mapa[lob] !== undefined) return mapa[lob];
  var mejor = _cevenAppleClaveMasLarga(mapa, (lob||'').toLowerCase());
  return mejor !== null ? mapa[mejor] : '';
}

/* ── Familia (Mac / iPhone / iPad / accesorio) ───────────────────────────
   La descripción manda por sobre el LOB: `lob` se corrompe si se guarda el
   modal de edición con el modelo en blanco (el select cae a la primera opción
   del catálogo, p. ej. "AirTag") y el ítem terminaba contado como accesorio. */
function cevenAppleCategoria(item, mapa){
  item = item || {}; mapa = mapa || {};
  var desc = ((item.description || '') + ' ' + (item.modelCol || '')).toLowerCase();
  var esAccesorio = /keyboard|mouse|pencil|case|cover|cable|adapter|folio/i.test(desc);
  if(/\biphone\b/.test(desc) && !esAccesorio) return 'iphone';
  if(/\bipad\b/.test(desc)   && !esAccesorio) return 'ipad';
  if(/\bmacbook\b|\bimac\b|\bmac\s*(mini|studio|pro|neo)\b|\bmbp(ro)?\b|\bmba(ir)?\b/i.test(desc)) return 'mac';
  var lob = (item.lob || '').trim();
  if(mapa[lob]) return mapa[lob];
  return 'acc';
}

/* ── Agregados de una fila de pipeline ───────────────────────────────────
   Cantidades y montos por familia, total y margen ponderado, a partir de un
   juego de líneas. Lo llaman TRES caminos —agregar al pipeline, cambiar la
   opción vigente y ahora la emisión del multimarca— y tienen que dar
   exactamente lo mismo: si se desincronizaran, la fila diría un total que la
   cotización no dice. */
function cevenAppleAgregados(its, wrs, mapa){
  its = its || []; wrs = wrs || [];
  var qMac=0, qIph=0, qIpad=0, qAcc=0;
  var montoMac=0, montoIph=0, montoIpad=0, montoAcc=0;
  var sumMargenMonto = 0, sumMonto = 0;
  for(var i=0;i<its.length;i++){
    var c = cevenAppleCategoria(its[i], mapa);
    var q = its[i].qty || 1;
    var lm = (its[i].salePrice||0) * q;
    if(c==='mac'){ qMac += q; montoMac += lm; }
    else if(c==='iphone'){ qIph += q; montoIph += lm; }
    else if(c==='ipad'){ qIpad += q; montoIpad += lm; }
    else { qAcc += q; montoAcc += lm; }   // accesorios = todo lo demás
    // Margen ponderado: suma(margen_línea × monto_línea) / suma(monto_línea).
    var lineMargen = (typeof its[i].itemMargin === 'number') ? its[i].itemMargin : 0;
    sumMargenMonto += lineMargen * lm;
    sumMonto += lm;
  }
  // Servicios = las garantías CevenCare. El multimarca no las tiene y pasa [].
  var qServ = 0, montoServ = 0;
  for(var j=0;j<wrs.length;j++){
    qServ += (wrs[j].cantidad||1);
    montoServ += (wrs[j].precio||0) * (wrs[j].cantidad||1);
  }
  return {
    qMac: qMac, qIph: qIph, qIpad: qIpad, qAcc: qAcc, qServ: qServ,
    montoMac: Math.round(montoMac), montoIph: Math.round(montoIph),
    montoIpad: Math.round(montoIpad), montoAcc: Math.round(montoAcc),
    montoServ: Math.round(montoServ),
    monto: Math.round(sumMonto + montoServ),
    margenPond: sumMonto > 0 ? Math.round((sumMargenMonto / sumMonto) * 100) / 100 : null
  };
}
