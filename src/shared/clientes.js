/* ============================================================
   CLIENTES  ·  compartido por todas las marcas
   ------------------------------------------------------------
   Ficha por cliente. Hoy guarda una sola cosa —el nivel de
   precio con el que se le cotiza— pero nace como ficha y no
   como "un campo suelto" a proposito: el proximo paso previsto
   es una tabla de clientes con condiciones de pago, CUIT, etc.
   Agregar un campo tiene que ser agregar una clave aca, sin
   mover nada de lo que ya usa esto.

   Se guarda en `cclientes` (con el prefijo de la marca) y
   sincroniza como una clave mas de app_settings. Es un blob
   chico —una entrada por cliente— asi que el last-write-wins
   de las settings no molesta como si molestaria en cquotes.

   La clave es el nombre NORMALIZADO con cevenNormClient(), el
   mismo criterio con el que el pipeline agrupa: "ACME S.A." y
   "acme s.a. " son el mismo cliente y tienen que compartir
   ficha. Se guarda ademas la grafia con la que se lo vio por
   ultima vez, para poder mostrarlo como lo escribe el usuario.

   ⚠ cevenNormClient() VIVE ACA, y no en pipeline-group.js como
   hasta el 12/08/2026. La dependencia iba al reves —el modulo
   del cliente dependia del modulo del pipeline—, asi que una
   pagina con clientes pero SIN pipeline se cargaba entera y
   recien reventaba al guardar:

     Uncaught ReferenceError: cevenNormClient is not defined
         at cevenClienteSet (clientes.js:47)

   Le paso al multimarca, que no tiene pipeline propio (emite a
   las marcas). Ahora el pipeline depende del cliente, que es el
   sentido correcto: el pipeline AGRUPA por cliente, no lo define.

   Depende de: brand.js (cevenK), safe.js (cevenLsSet,
   cevenLsJSON).
   Se carga ANTES de pipeline-group.js.
   ============================================================ */

/* La forma canonica de un nombre de cliente. El campo es texto libre: sin esto,
   "Coca Cola", "coca cola" y "Coca Cola " son tres clientes distintos para
   cualquier agrupacion y para cualquier ficha.

   Los guiones y la puntuacion NO se tocan: "Coca-Cola" y "Coca Cola" pueden ser
   dos razones sociales distintas de verdad, y unir de mas es peor que unir de
   menos — se pierde plata de vista abajo del cliente equivocado. */
function cevenNormClient(s){
  return String(s == null ? '' : s).trim().toLowerCase().replace(/\s+/g, ' ');
}

function cevenGetClientes(){
  var c = window.cevenLsJSON(window.cevenK('cclientes'), {});
  return (c && typeof c === 'object' && !(c instanceof Array)) ? c : {};
}

function cevenSaveClientes(c){
  return window.cevenLsSet(window.cevenK('cclientes'), JSON.stringify(c));
}

/* La ficha de un cliente, o null. `nombre` entra crudo, como lo escribio el
   usuario: la normalizacion es interna. */
function cevenClienteFicha(nombre){
  var k = cevenNormClient(nombre);
  if(!k) return null;
  return cevenGetClientes()[k] || null;
}

/* Guarda/actualiza campos de la ficha SIN pisar los que no se pasan: cuando
   mañana existan condiciones de pago, guardar el tier no puede borrarlas. */
function cevenClienteSet(nombre, campos){
  var crudo = String(nombre == null ? '' : nombre).trim();
  var k = cevenNormClient(crudo);
  if(!k) return false;
  var todos = cevenGetClientes();
  var f = todos[k] || {};
  for(var c in campos){ if(campos[c] !== undefined) f[c] = campos[c]; }
  f.nombre = crudo || f.nombre;      // ultima grafia vista, para mostrar
  todos[k] = f;
  return cevenSaveClientes(todos);
}

// Nivel de precio con el que se le cotiza a este cliente ('' si no hay ficha).
function cevenClienteTier(nombre){
  var f = cevenClienteFicha(nombre);
  return (f && f.tier) || '';
}

/* Lista de nombres de clientes conocidos, para el <datalist> del formulario.
   Se arma con las fichas MAS lo que ya aparece en el pipeline y en el
   historial: con la base recien migrada no hay fichas todavia, y un
   autocompletado vacio no ayuda a nadie. */
function cevenClientesConocidos(){
  var seen = {}, out = [];
  function _add(n){
    n = String(n == null ? '' : n).trim();
    if(!n || n === '—') return;
    var k = cevenNormClient(n);
    if(!k || seen[k]) return;
    seen[k] = 1; out.push(n);
  }
  var fichas = cevenGetClientes();
  Object.keys(fichas).forEach(function(k){ _add(fichas[k].nombre || k); });
  try{ if(typeof getPipeline === 'function') getPipeline().forEach(function(r){ _add(r.cliente); }); }catch(e){}
  try{ if(typeof getDB === 'function') getDB().forEach(function(r){ _add(r['Cliente']); }); }catch(e){}
  out.sort(function(a, b){ return a.localeCompare(b); });
  return out;
}

/* Refresca el <datalist> del campo Cliente. Mismo criterio que el de OPG
   (refreshOpgDatalist): reduce el riesgo de que un typo cree un cliente
   "nuevo" que despues aparece como un grupo aparte en el pipeline. */
function cevenRefreshClienteDatalist(){
  var dl = document.getElementById('cliente-datalist');
  if(!dl) return;
  dl.innerHTML = cevenClientesConocidos().map(function(n){
    return '<option value="' + cevenEsc(n) + '">';
  }).join('');
}
