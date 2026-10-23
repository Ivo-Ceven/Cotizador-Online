/* ============================================================
   SALIR DE LA COTIZACION  ·  compartido (Apple, Poly, Huawei, Legamaster)
   ------------------------------------------------------------
   La cotizacion en pantalla vivia en memoria hasta que alguien
   tocara "Nueva". Se iba al pipeline o al historial, se volvia, y
   seguia ahi la ultima — marcada como "la que se esta editando"
   (cevenEditandoQNum). El operativo, en vez de "Nueva", borraba
   los campos, cargaba otra y guardaba: doSave() lo tomaba como una
   edicion legitima de ese numero y PISABA la cotizacion anterior.

   Ahora salir del flujo de cotizacion (a historial, pipeline,
   estadisticas) la saca de la pantalla:
     · si esta guardada tal cual se ve, se limpia sin preguntar;
     · si tiene cambios sin guardar, se avisa antes de salir que se
       van a perder ("Seguir editando" / "Salir sin guardar").
   Al volver hay una cotizacion nueva, con numero nuevo.

   Cerrar la pestaña del navegador, recargar o irse a otra marca con
   cambios sin guardar dispara el aviso nativo del navegador
   (beforeunload): ahi no se puede mostrar un modal propio.

   "Sin guardar" = lo que hay en pantalla difiere de la huella que
   se tomo la ultima vez que se guardo, se abrio del historial o se
   empezo una nueva. La huella es el _snapshotQuoteState() de la
   marca (el mismo que usa "Deshacer"), sin el numero: renumerar por
   colision no es un cambio del usuario.

   Depende de: nav.js (cevenNav.setLeaveGuard), notify.js
   (confirmModal), quote-num.js y, en tiempo de EJECUCION, de
   _snapshotQuoteState() y nuevaCotizacion() de la marca.
   Se carga DESPUES de <marca>/js/quotes-db.js.
   ============================================================ */

// Vistas que son parte de armar la cotizacion: ir y volver entre ellas no es salir.
var CEVEN_Q_FLUJO = { quote: 1, catalog: 1, addprod: 1, nac: 1, qnac: 1 };

var _cevenQHuellaGuardada = null;

function _cevenQHuella(){
  if(typeof _snapshotQuoteState !== 'function') return null;
  var s = _snapshotQuoteState();
  delete s.qNum;
  return JSON.stringify(s);
}

// Las garantias CevenCare existen solo en Apple, y alcanzan solas para cotizar.
function cevenQTieneContenido(){
  return !!((typeof items !== 'undefined' && items.length) ||
            (typeof warrantyItems !== 'undefined' && warrantyItems.length));
}

/* Lo llaman doSave() (si escribio), editQuoteFromHistory() y nuevaCotizacion()
   de cada marca: lo que hay en pantalla pasa a ser "lo guardado". */
function cevenQMarcarGuardada(){
  _cevenQHuellaGuardada = _cevenQHuella();
}

function cevenQSinGuardar(){
  return cevenQTieneContenido() && _cevenQHuella() !== _cevenQHuellaGuardada;
}

/* Devuelve true si retiene la navegacion (quedo un aviso abierto); `seguir`
   la completa si el usuario elige salir igual. */
function _cevenQAlSalir(desde, hacia, seguir){
  if(!CEVEN_Q_FLUJO[desde] || CEVEN_Q_FLUJO[hacia]) return false;
  if(!cevenQTieneContenido() || typeof nuevaCotizacion !== 'function') return false;
  if(!cevenQSinGuardar()){
    nuevaCotizacion(true);
    return false;
  }
  var qn = cevenQNumFmt(qNum);
  var titulo = (window.CEVEN_BRAND && window.CEVEN_BRAND.qNumTitulo) || 'Cotización';
  var msg = cevenEsEdicionDe(qn)
    ? 'Los cambios a la ' + titulo.toLowerCase() + ' #' + cevenQNumVisible(qNum) + ' no están guardados.'
    : 'La ' + titulo.toLowerCase() + ' #' + cevenQNumVisible(qNum) + ' no está guardada.';
  confirmModal(
    msg + '\n\nSi salís ahora se pierde. Para conservarla, tocá "Seguir editando" y guardala.',
    function(){ nuevaCotizacion(true); seguir(); },
    { okLabel: 'Salir sin guardar', cancelLabel: 'Seguir editando', danger: true }
  );
  return true;
}

if(window.cevenNav && cevenNav.setLeaveGuard) cevenNav.setLeaveGuard(_cevenQAlSalir);

window.addEventListener('beforeunload', function(e){
  if(!cevenQSinGuardar()) return;
  e.preventDefault();
  e.returnValue = '';
});
