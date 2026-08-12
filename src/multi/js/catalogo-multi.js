/* ============================================================
   CATALOGO UNIFICADO  ·  Cotizador multimarca
   ------------------------------------------------------------
   El multimarca NO tiene catalogo propio: lee el de cada marca y
   los junta en una sola lista donde cada producto lleva su
   `brand`. Es de SOLO LECTURA — no hay carga de Excel, ni alta
   de articulos, ni edicion de precios. Eso se hace en el
   cotizador de cada marca, que es su duenio.

   POR QUE SE PUEDE LEER EL CATALOGO DE OTRA MARCA
   Las policies de `app_settings` son `using (ceven_is_staff())`,
   sin filtro de marca: cualquier cuenta @ceven.com lee las
   claves de todas. Por eso alcanza UN request y no hace falta
   tocar la base. (Ver docs/BASE-DE-DATOS.md.)

   OFFLINE
   La app es una PWA offline-first, asi que lo que baja se cachea
   en `multi_cpl_cache` y al arrancar se pinta primero el cache y
   despues se refresca. Sin eso, abrir el multimarca sin conexion
   mostraria un catalogo vacio, que se lee como "no hay
   productos" y no como "no hay red".

   ⚠ El cache NO entra en settingKeys de brand.js: es una copia
   de datos que ya se sincronizan por su marca. Subirlo otra vez
   duplicaria el price list entero en app_settings.

   Depende de: brand.js (cevenK), safe.js, config.js, auth.js
   (cevenGetSession), notify.js (showToast).
   ============================================================ */

/* Las marcas cuyo catalogo se junta. Salen del registro (js/marcas.js) y no de
   una lista escrita aca: sumar HP es agregarla alla, en un solo lugar. */
function _catMarcas(){
  return (typeof cevenMultiMarcasIds === 'function') ? cevenMultiMarcasIds() : [];
}

var CEVEN_CAT_CACHE_KEY = 'cpl_cache';   // se le antepone el prefijo de la marca

// Catalogos crudos por marca: {apple: [...], poly: [...]}. Lo lee el registro
// de marcas para poder repricear una linea de Poly.
var catalogos = {};

// Tasas de nacionalizacion de Apple (su clave `cnac`). El precio de una linea
// de Apple no se puede calcular sin esto.
var nacRatesApple = {};

// Cuando se bajo el catalogo por ultima vez (ISO), para poder mostrarlo.
var catalogoISO = '';

/* ── Cache local ─────────────────────────────────────────────────────────── */

function _catGuardarCache(){
  var payload = {iso: catalogoISO, catalogos: catalogos, nac: nacRatesApple};
  // cevenLsSet avisa si la cuota esta llena en vez de fallar callado: el price
  // list de Apple son varios MB y es el candidato numero uno a no entrar.
  if(!window.cevenLsSet(window.cevenK(CEVEN_CAT_CACHE_KEY), JSON.stringify(payload))){
    if(typeof showToast === 'function'){
      showToast('No se pudo guardar el catálogo para uso sin conexión (almacenamiento lleno).');
    }
  }
}

function _catLeerCache(){
  var c = window.cevenLsJSON(window.cevenK(CEVEN_CAT_CACHE_KEY), null);
  if(!c || typeof c !== 'object') return false;
  catalogos    = (c.catalogos && typeof c.catalogos === 'object') ? c.catalogos : {};
  nacRatesApple = (c.nac && typeof c.nac === 'object') ? c.nac : {};
  catalogoISO  = c.iso || '';
  _catRearmar();
  return products.length > 0;
}

/* ── Armado de la lista unificada ────────────────────────────────────────── */

/* Un producto de cualquier marca, con `brand` adentro. El id tiene que ser
   unico ENTRE MARCAS: dos marcas pueden tener el mismo SKU y, sin el prefijo,
   agregar uno agregaria el otro. Por eso es 'marca|sku' y no el id que cada
   catalogo trae. */
function _catNormalizar(p, brand){
  var copia = JSON.parse(JSON.stringify(p));
  copia.brand = brand;
  copia.id = brand + '|' + p.sku;
  return copia;
}

function _catRearmar(){
  products = [];
  _catMarcas().forEach(function(brand){
    var lista = catalogos[brand];
    if(!lista || !lista.length) return;
    for(var i=0;i<lista.length;i++){
      if(!lista[i] || !lista[i].sku) continue;   // fila corrupta del price list
      products.push(_catNormalizar(lista[i], brand));
    }
  });
}

/* ── Bajada desde Supabase ───────────────────────────────────────────────── */

/* Un solo request por las claves de todas las marcas: los catalogos y la tabla
   NAC de Apple juntos. Son dos ida y vuelta menos, y sobre todo evita el estado
   intermedio en el que hay catalogo de Apple pero todavia no sus tasas — que
   daria precios calculados con la NAC del 20% por defecto.

   ⚠ Las claves van CON el prefijo de cada marca (`cpl` en Apple, `poly_cpl` en
   Poly): es lo que guarda la columna `key`. Ver cevenMultiClave() en marcas.js
   — pedirlas sin prefijo devolvia solo Apple, en silencio. */
function _catURL(){
  var marcas = _catMarcas().join(',');
  var claves = cevenMultiClaves(['cpl', 'cnac']).join(',');
  return SUPABASE_URL + '/rest/v1/app_settings'
       + '?select=brand,key,value'
       + '&brand=in.(' + encodeURIComponent(marcas) + ')'
       + '&key=in.(' + encodeURIComponent(claves) + ')';
}

function _catHeaders(){
  var sess = (typeof cevenGetSession === 'function') ? cevenGetSession() : null;
  var h = {'apikey': SUPABASE_ANON_KEY, 'Accept': 'application/json'};
  if(sess && sess.access_token) h['Authorization'] = 'Bearer ' + sess.access_token;
  return h;
}

/* Trae los catalogos. Devuelve una promesa que resuelve en true si se
   actualizo. NO tira: sin red o sin sesion se queda con el cache y avisa, que
   es lo que corresponde en una PWA offline-first. */
function cargarCatalogos(silencioso){
  if(!window.SUPABASE_URL){
    if(!silencioso && typeof showToast === 'function') showToast('Base de datos no configurada: el catálogo no se puede bajar.');
    return Promise.resolve(false);
  }
  return fetch(_catURL(), {headers: _catHeaders()})
    .then(function(r){
      if(!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    })
    .then(function(filas){
      /* Un GET que falla y uno que devuelve vacio NO son lo mismo: si la
         respuesta viene sin filas se conserva el cache en vez de dejar el
         catalogo en cero. Es la misma distincion que sync.js aprendio a la
         mala (ver ARQUITECTURA.md, "Reglas del bootstrap"). */
      if(!filas || !filas.length) return false;
      var huboCpl = false;
      filas.forEach(function(f){
        var val = null;
        try{ val = JSON.parse(f.value); }catch(e){ return; }
        /* La clave se compara contra la de ESA marca, con su prefijo. Un
           `f.key === 'cpl'` a secas descartaba la fila de Poly aunque hubiera
           llegado — el mismo bug que la URL, y arreglar uno solo no alcanzaba. */
        if(f.key === cevenMultiClave(f.brand, 'cpl')){
          if(Object.prototype.toString.call(val) === '[object Array]'){
            catalogos[f.brand] = val;
            huboCpl = true;
          }
        } else if(f.brand === 'apple' && f.key === cevenMultiClave('apple', 'cnac')){
          if(val && typeof val === 'object') nacRatesApple = val;
        }
      });
      if(!huboCpl) return false;
      catalogoISO = new Date().toISOString();
      _catRearmar();
      _catGuardarCache();
      return true;
    })
    .catch(function(e){
      if(!silencioso && typeof showToast === 'function'){
        showToast('No se pudo actualizar el catálogo (' + e.message + '). Se usa la última copia bajada.');
      }
      return false;
    });
}

/* Arranque: primero el cache (pinta al toque, y es lo unico que hay sin
   conexion) y despues el refresco. El orden importa — al reves, la pantalla
   arranca vacia y parpadea. */
function initCatalogos(){
  var hayCache = _catLeerCache();
  if(hayCache && typeof renderCat === 'function') renderCat();
  return cargarCatalogos(hayCache).then(function(actualizo){
    if(actualizo && typeof renderCat === 'function') renderCat();
    if(!actualizo && !hayCache && typeof showToast === 'function'){
      showToast('No hay catálogo todavía: abrí el cotizador de cada marca al menos una vez para que se sincronice.');
    }
    _catPintarSello();
    return actualizo;
  });
}

// Cuantos productos hay por marca, para el encabezado del catalogo.
function catalogoResumen(){
  var out = [];
  _catMarcas().forEach(function(b){
    var n = (catalogos[b] || []).length;
    if(n) out.push(cevenMultiMarcaLabel(b) + ' ' + n);
  });
  return out.join(' · ');
}

function _catPintarSello(){
  var el = document.getElementById('cat-sello');
  if(!el) return;
  var resumen = catalogoResumen();
  if(!resumen){ el.textContent = 'Sin catálogo'; return; }
  var cuando = '';
  if(catalogoISO){
    var d = new Date(catalogoISO);
    if(!isNaN(d.getTime())) cuando = ' · actualizado ' + d.toLocaleDateString('es-AR') + ' ' +
      d.toLocaleTimeString('es-AR', {hour:'2-digit', minute:'2-digit'});
  }
  el.textContent = resumen + cuando;
}

// Producto de la lista unificada por su id ('marca|sku').
function productoPorId(id){
  for(var i=0;i<products.length;i++){ if(String(products[i].id) === String(id)) return products[i]; }
  return null;
}
