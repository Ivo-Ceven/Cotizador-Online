/* ============================================================
   CLIENTES-DB · tabla `clientes` real (Supabase), compartida por
   Apple/Poly/Multi
   ------------------------------------------------------------
   Complementa a clientes.js — no lo reemplaza. clientes.js sigue
   siendo la ficha local (blob en app_settings) que recuerda el
   último tier usado con un cliente y llena el datalist offline;
   esto agrega lo que ese blob no puede dar: un id real, compartido
   entre dispositivos sin depender del last-write-wins de las
   settings, con mail/tier/margen que puede leer server-side una
   Edge Function con service_role (el portal de clientes-canal).

   El flujo en cada marca:
     1. Al cambiar el campo Cliente se llama a cevenClienteCambio()
        (cableado en el mismo onchange que aplicarTierDelCliente()
        donde ya existe; en Apple, que no tiene esa función, va solo).
     2. Eso resuelve-o-crea la fila en `clientes` (upsert por
        nombre_norm, el mismo criterio de cevenNormClient()) y
        cachea {nombreNorm, id} en memoria.
     3. cevenClienteIdParaNombre(nombre) devuelve ese id SOLO si el
        nombre pedido normaliza igual que el último resuelto — si
        no, null: nunca se aplica el id de un cliente a la fila de
        otro por una carrera entre el fetch y un cambio de campo.
     4. Cada pipeline-core.js/emitir.js lee ese id al armar la fila
        de pipeline. null es un resultado esperado (todavía no se
        resolvió, o falló la red) y nunca bloquea el guardado.

   Nada de acá tira: toda función que hable con la red devuelve
   null/[] ante cualquier error — esto vive al costado del flujo de
   guardado, nunca puede trabarlo.

   Depende de: shared/config.js (SUPABASE_URL), shared/auth.js
   (cevenAuthedFetch), shared/clientes.js (cevenNormClient), shared/
   safe.js (cevenEsc). Se carga después de los tres.
   ============================================================ */

var _cevenClientesDbCache = null;   // último listado completo (memoria, no localStorage)
var _cevenClienteResuelto = null;   // {nombreNorm, id} de la última resolución exitosa

// Function, no `var` a nivel de módulo: SUPABASE_URL vive en config.js, que
// carga bien antes en la página real, pero armar la URL a nivel de módulo
// acopla el orden de <script> entre archivos sin necesidad. Resuelta adentro
// de una función, cualquier caller la pide cuando ya está definida.
function _cevenClientesRest(){ return SUPABASE_URL + '/rest/v1/clientes'; }

/* Todos los clientes (hasta 500), cacheados en memoria para no pegarle a la
   red en cada tecla del datalist. Se invalida al crear/actualizar uno. */
function cevenClientesDbListar(){
  if(_cevenClientesDbCache) return Promise.resolve(_cevenClientesDbCache);
  var url = _cevenClientesRest() + '?select=id,nombre,email,poly_tier,apple_margen&order=nombre.asc&limit=500';
  return cevenAuthedFetch(url, {method:'GET'}).then(function(rows){
    _cevenClientesDbCache = Array.isArray(rows) ? rows : [];
    return _cevenClientesDbCache;
  }).catch(function(){ return []; });
}

/* Suma los nombres de `clientes` al <datalist> que ya llenó
   cevenRefreshClienteDatalist() (clientes.js, con el blob local). Se llama
   DESPUÉS de esa función: si la red falla o tarda, el datalist ya tiene lo
   local y esto solo agrega lo que haya de más. */
function cevenClientesDbRefreshDatalist(){
  var dl = document.getElementById('cliente-datalist');
  if(!dl) return;
  cevenClientesDbListar().then(function(rows){
    var vistos = {}, opts = dl.querySelectorAll('option'), i;
    for(i=0;i<opts.length;i++) vistos[cevenNormClient(opts[i].value)] = 1;
    var nuevas = '';
    rows.forEach(function(r){
      var k = cevenNormClient(r.nombre);
      if(!k || vistos[k]) return;
      vistos[k] = 1;
      nuevas += '<option value="' + cevenEsc(r.nombre) + '">';
    });
    if(nuevas) dl.innerHTML += nuevas;
  });
}

/* Resuelve (o crea) la fila de `clientes` para el nombre tal cual lo escribió
   el usuario. Upsert idempotente por nombre_norm (índice único de la tabla):
   si ya existía, esto SOLO actualiza la grafía visible de `nombre` — nunca
   pisa tier/email/margen ya cargados, porque esos campos no van en el body. */
function cevenClienteDbResolver(nombreCrudo){
  var crudo = String(nombreCrudo == null ? '' : nombreCrudo).trim();
  if(!crudo) return Promise.resolve(null);
  var url = _cevenClientesRest() + '?on_conflict=nombre_norm&select=id,nombre,email,poly_tier,apple_margen';
  return cevenAuthedFetch(url, {
    method: 'POST',
    headers: {'Prefer': 'resolution=merge-duplicates,return=representation'},
    body: JSON.stringify({nombre: crudo})
  }).then(function(rows){
    _cevenClientesDbCache = null;   // invalida el listado cacheado
    return (Array.isArray(rows) && rows[0]) ? rows[0] : null;
  }).catch(function(){ return null; });
}

/* El id resuelto para `nombre`, o null. Devuelve null tanto si todavía no se
   resolvió como si `nombre` cambió desde la última resolución — nunca aplica
   el id de un cliente a la fila de otro. */
function cevenClienteIdParaNombre(nombre){
  if(!_cevenClienteResuelto) return null;
  var k = cevenNormClient(nombre);
  return (k && _cevenClienteResuelto.nombreNorm === k) ? _cevenClienteResuelto.id : null;
}

/* Cablear en el onchange del campo Cliente de cada marca. Dispara la
   resolución en segundo plano; nunca bloquea la pantalla ni el guardado —
   si todavía no terminó cuando se guarda, cevenClienteIdParaNombre()
   devuelve null y quien llama sigue con el texto libre de siempre. */
function cevenClienteCambio(){
  var el = document.getElementById('client');
  var nombre = el ? el.value : '';
  var k = cevenNormClient(nombre);
  if(_cevenClienteResuelto && _cevenClienteResuelto.nombreNorm !== k) _cevenClienteResuelto = null;
  if(!k) return;
  cevenClienteDbResolver(nombre).then(function(ficha){
    if(!ficha) return;
    // El campo puede haber cambiado mientras esperábamos la red: solo se
    // aplica si sigue diciendo lo mismo que cuando se pidió.
    var actual = document.getElementById('client');
    var kActual = cevenNormClient(actual ? actual.value : '');
    if(kActual === k) _cevenClienteResuelto = {nombreNorm: k, id: ficha.id};
    cevenClientesDbRefreshDatalist();
  });
}
