/* ============================================================
   NUMERO DE COTIZACION  ·  compartido por todas las marcas
   ------------------------------------------------------------
   El contador vive en localStorage (`cqc`, con el prefijo de la
   marca) y se sincroniza al equipo como una clave mas de
   app_settings. Eso alcanzaba mientras hubiera un solo usuario;
   con varios se repetian numeros por tres caminos distintos:

   1) El contador se incrementaba EN CADA CARGA DE PAGINA
      (state.js), no al crear una cotizacion. Y como sync.js se
      carga ANTES que state.js, ese setItem dejaba la clave
      "sucia" antes de que terminara el bootstrap; mergeSettings()
      saltea las claves sucias, asi que el contador LOCAL siempre
      le ganaba al del equipo y se lo imponia. Un navegador con
      localStorage limpio arrancaba en #0001 y bajaba a todos a 1.

   2) El poll escribia el valor del servidor sin comparar
      magnitud, asi que el contador podia RETROCEDER y reusar
      numeros ya emitidos. Lo arregla `monotonicKeys` en brand.js,
      que sync.js resuelve con Math.max en vez de pisar.

   3) Un contador atrasado por cualquiera de los dos motivos
      anteriores devolvia un numero YA USADO.

   La respuesta a (3) es no confiar solo en el contador:
   cevenNextQNum() devuelve max(contador, mayor numero que existe
   de verdad) + 1. Con eso el contador se auto-repara.

   Por que NO una sequence en Postgres (que seria lo obvio): la
   app es una PWA que funciona offline —ver ARQUITECTURA.md— y
   pedirle el numero al servidor haria que no se pueda cotizar sin
   conexion, que es justo el caso donde quedan las colisiones.

   Depende de: brand.js (cevenK), safe.js (cevenLsSet) y, en
   tiempo de EJECUCION, de getDB/getPipeline/getArchive de la
   marca. Se carga ANTES de <marca>/js/state.js.
   ============================================================ */

/* El numero de la cotizacion que se esta editando. Era un global IMPLICITO
   creado en state.js (`qNum = ...` sin var), que es como sobrevivio tanto
   tiempo sin que nadie viera de donde salia. */
var qNum = 0;

function cevenQNumKey(){ return window.cevenK('cqc'); }

// Lee el contador crudo. No es JSON y tolera cualquier cosa guardada.
function cevenLeerContador(){
  var raw = null;
  try{ raw = localStorage.getItem(cevenQNumKey()); }catch(e){}
  return parseInt(raw, 10) || 0;
}

/* El mayor numero que EXISTE, mirando las tres fuentes donde puede haber uno:
   el historial de cotizaciones, el pipeline y el archivo mensual.

   getDB() hace JSON.parse de varios MB: esto se llama solo al asignar un numero
   o al arrancar, NUNCA en un render ni en un oninput. */
function cevenMayorQNumUsado(){
  var max = 0;
  function _ver(v){
    var n = parseInt(v, 10);
    if(!isNaN(n) && n > max) max = n;
  }
  try{
    if(typeof getDB === 'function') getDB().forEach(function(r){ _ver(r['N° Cotización']); });
  }catch(e){}
  try{
    if(typeof getPipeline === 'function') getPipeline().forEach(function(r){ _ver(r.qNum); });
  }catch(e){}
  try{
    if(typeof getArchive === 'function'){
      var a = getArchive() || {};
      Object.keys(a).forEach(function(m){
        (a[m] || []).forEach(function(r){ _ver(r.qNum); });
      });
    }
  }catch(e){}
  return max;
}

// El proximo numero libre. NO lo persiste: ver cevenReservarQNum().
function cevenNextQNum(){
  return Math.max(cevenLeerContador(), cevenMayorQNumUsado()) + 1;
}

/* Sube el contador hasta `n`, nunca lo baja. El "nunca lo baja" no es paranoia:
   editQuoteFromHistory() setea qNum al numero de una cotizacion vieja, y sin
   este guard guardarla moveria el contador para atras y las proximas
   cotizaciones reusarian numeros. */
function cevenAnotarQNum(n){
  n = parseInt(n, 10) || 0;
  if(n <= cevenLeerContador()) return;
  window.cevenLsSet(cevenQNumKey(), String(n));
}

// Toma el proximo numero libre y lo deja reservado.
function cevenReservarQNum(){
  var n = cevenNextQNum();
  cevenAnotarQNum(n);
  return n;
}

// Formato unico del numero: '0071'. Estaba repetido en ~8 lugares.
function cevenQNumFmt(n){ return String(n).padStart(4, '0'); }

/* ---- Guardar sobre un numero que ya existe ----------------------------------
   doSave(true) borra las filas que tengan el numero y reinserta. Eso es lo
   correcto cuando estas re-guardando TU cotizacion (la abriste del historial y
   la editaste), y es destructivo cuando el numero es de OTRO: dos usuarios que
   tomaron el mismo numero, el segundo que guarda borra la cotizacion del
   primero sin decir nada.

   Distinguir los dos casos por el contenido (mismo cliente? mismo ejecutivo?)
   da falsos positivos apenas cambias un campo. Lo que si es inequivoco es de
   donde salio el numero: editQuoteFromHistory() marca cual se abrio para
   editar; cualquier otro numero que ya exista es una colision. */
var _cevenQNumEditando = null;

function cevenEditandoQNum(qn){
  _cevenQNumEditando = (qn === undefined || qn === null) ? null : String(qn);
}
function cevenEsEdicionDe(qn){
  return _cevenQNumEditando !== null && String(qn) === _cevenQNumEditando;
}

// Pinta el numero en el encabezado de la cotizacion.
function cevenPintarQNum(){
  var el = document.getElementById('qnum');
  if(el) el.textContent = 'Cotización #' + cevenQNumFmt(qNum);
}

/* Recalcula el numero que se le va a asignar a la cotizacion en curso.

   Corre desde shared/init.js, o sea con TODOS los modulos cargados: state.js
   —que es donde se muestra por primera vez— se carga antes que quotes-db.js y
   pipeline-store.js, asi que ahi todavia no existen getDB() ni getPipeline() y
   solo se puede leer el contador.

   Solo actua si la cotizacion esta vacia: si el usuario ya empezo a cargar
   items, cambiarle el numero abajo de los pies seria peor que dejarlo. */
function cevenRefrescarQNum(){
  if(typeof items !== 'undefined' && items && items.length) return;
  var n = cevenNextQNum();
  if(n === qNum) return;
  qNum = n;
  cevenPintarQNum();
}
