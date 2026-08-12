/* ============================================================
   EL EQUIPO  ·  compartido
   ------------------------------------------------------------
   Quiénes son las personas de Ceven, para poder elegir una en un
   campo. Hoy lo usa el Ejecutivo del multimarca.

   ── DE DÓNDE SALE Y POR QUÉ DE AHÍ ──────────────────────────
   De la RPC `ceven_equipo()` (migración 04/08/2026): devuelve
   email, nombre y rol de las cuentas @ceven.com, es
   `security definer` —`auth.users` no es legible por
   `authenticated`— y lleva el filtro `ceven_is_staff()` adentro.

   Es la ÚNICA fuente que un no-admin puede leer. La Edge Function
   `admin-users` valida server-side `caller.email === admin@ceven.com`
   y responde 403 a todos los demás: armar la lista con ella habría
   dejado el selector vacío para todo el mundo menos una persona,
   que es justamente el problema que esto viene a resolver.

   ── LA CACHÉ ES COMPARTIDA CON EL TABLERO DE TAREAS ─────────
   Misma clave (`ceven_equipo_cache`) y misma forma
   ({email, nombre, rol}) que `shared/todos.js`. Es el mismo dato
   pedido a la misma RPC: compartirlo hace que el selector arranque
   con la lista puesta —incluso sin conexión— si ya se abrió el
   tablero alguna vez, y evita dos copias que se contradigan.

   La clave NO lleva el prefijo de marca (`cevenK()`): el equipo es
   de Ceven, no de Apple ni de Poly.

   Depende de: auth.js (cevenAuthedFetch, cevenIsValidSession),
   config.js (SUPABASE_URL).
   ============================================================ */

// Los roles que pueden figurar como ejecutivo de una cotización. Un `lector`
// no cotiza, así que ponerlo en la lista sería ofrecer un dueño que después no
// va a poder tocar lo que se le asignó.
var CEVEN_ROLES_COTIZAN = ['admin', 'ventas'];

var CEVEN_EQUIPO_KEY = 'ceven_equipo_cache';

/* Lo cacheado. Defensivo a propósito: lo escriben dos módulos (este y
   todos.js), así que se valida la forma en vez de confiar. */
function cevenEquipoCache(){
  var raw = null;
  try{ raw = localStorage.getItem(CEVEN_EQUIPO_KEY); }catch(e){ return []; }
  if(!raw) return [];
  var arr = null;
  try{ arr = JSON.parse(raw); }catch(e){ return []; }
  if(Object.prototype.toString.call(arr) !== '[object Array]') return [];
  return arr.filter(function(u){ return u && typeof u === 'object' && u.email; })
            .map(function(u){
              return {
                email:  String(u.email || ''),
                nombre: String(u.nombre || String(u.email || '').split('@')[0] || ''),
                rol:    String(u.rol || '')
              };
            });
}

/* Pide la lista al servidor y la deja cacheada. NO rechaza nunca: sin red, sin
   sesión o con la RPC todavía sin aplicar devuelve lo que haya en caché. Un
   error acá no puede dejar un selector vacío — el llamador siempre completa con
   los nombres que ya tiene a mano. */
function cevenEquipoRefrescar(){
  if(typeof cevenIsValidSession !== 'function' || !cevenIsValidSession()) return Promise.resolve(cevenEquipoCache());
  if(!window.SUPABASE_URL || typeof cevenAuthedFetch !== 'function') return Promise.resolve(cevenEquipoCache());

  return cevenAuthedFetch(SUPABASE_URL + '/rest/v1/rpc/ceven_equipo', {method: 'POST', body: '{}'})
    .then(function(filas){
      /* Una respuesta vacía NO pisa la caché. Es la misma distinción que
         aprendió sync.js: "no llegó nada" y "no hay nadie" se ven igual desde
         acá, y tratarlas igual borra la lista real ante cualquier tropiezo. */
      if(Object.prototype.toString.call(filas) !== '[object Array]' || !filas.length) return cevenEquipoCache();
      var lista = filas.map(function(u){
        return {
          email:  String(u.email || ''),
          nombre: String(u.nombre || String(u.email || '').split('@')[0] || ''),
          rol:    String(u.rol || '')
        };
      }).filter(function(u){ return !!u.email; });
      try{ localStorage.setItem(CEVEN_EQUIPO_KEY, JSON.stringify(lista)); }catch(e){}
      return lista;
    })
    .catch(function(){ return cevenEquipoCache(); });
}

/* Los nombres que pueden cotizar, ordenados. Se devuelve el NOMBRE y no el mail
   porque es lo que guardan las cotizaciones y el pipeline desde siempre
   (`Ejecutivo`), y con lo que compara `cevenOwnsExecutive()`. */
function cevenEquipoVendedores(lista){
  var gente = lista || cevenEquipoCache();
  var vistos = {}, out = [];
  gente.forEach(function(u){
    if(CEVEN_ROLES_COTIZAN.indexOf(u.rol) < 0) return;
    var n = (u.nombre || '').trim();
    if(!n || vistos[n.toLowerCase()]) return;
    vistos[n.toLowerCase()] = 1;
    out.push(n);
  });
  return out.sort(function(a, b){ return a.localeCompare(b, 'es'); });
}

/* Llena un <select> de ejecutivo. `extras` son nombres que hay que ofrecer
   igual aunque no estén en el equipo: quién está logueado, los que ya figuran
   en cotizaciones viejas (gente que pudo haberse dado de baja) y el que está
   elegido en este momento. Sin eso, abrir una cotización vieja le cambiaría el
   ejecutivo al vaciarse el <select>.

   NUNCA lo deshabilita: elegir a otro ejecutivo es la razón de existir del
   campo. `cevenApplyVendorAutofill()` (auth.js) sí lo bloquea para los no-admin
   en Apple y Poly; el multimarca no lo llama. */
function cevenLlenarExec(sel, extras){
  sel = sel || document.getElementById('exec');
  if(!sel) return;

  var actual = sel.value || '';
  var vistos = {}, lista = [];
  function _add(n){
    n = (n == null ? '' : String(n)).trim();
    if(!n || n === '—') return;
    var k = n.toLowerCase();
    if(vistos[k]) return;
    vistos[k] = 1;
    lista.push(n);
  }

  cevenEquipoVendedores().forEach(_add);
  if(typeof cevenMyNombre === 'function') _add(cevenMyNombre());
  (extras || []).forEach(_add);
  _add(actual);
  lista.sort(function(a, b){ return a.localeCompare(b, 'es'); });

  var h = '<option value="">Seleccionar ejecutivo</option>';
  for(var i=0;i<lista.length;i++){
    h += '<option value="' + cevenEsc(lista[i]) + '">' + cevenEsc(lista[i]) + '</option>';
  }
  sel.innerHTML = h;
  sel.value = actual;      // lo elegido sobrevive al repintado
  sel.disabled = false;
}
