/* ============================================================
   PIPELINE · ESTADO POR LÍNEA DE PRODUCTO  ·  compartido
   ------------------------------------------------------------
   Una fila del pipeline es UN PROYECTO = UNA COTIZACIÓN, y su columna
   `estado` vale para todos sus artículos. Desde el 03/09/2026 un artículo
   puede tener un estado PROPIO que pisa al del proyecto: cambiar el estado
   de arriba sigue moviendo a todos los ítems, menos a los que tengan uno
   configurado en particular.

   Ese override vive en `pipeline."skuStatus"` (jsonb), columna que ya
   existía en Supabase desde 07/2026 — la usaba solo Apple. Este archivo
   saca de Apple la parte que no depende de su facturación parcial para que
   Poly y Legamaster la usen igual, sin migración y sin copiar código.

   LA CLAVE DE UNA LÍNEA es `SKU + '|' + índice` sobre la lista que devuelve
   cevenOpcFilasDeCotiz() (o sea, solo la opción VIGENTE). Es la convención
   que Apple ya tiene en producción y por eso no se cambia. Su límite
   conocido: si alguien reordena las líneas desde el cotizador, los
   overrides quedan apuntando a la línea equivocada. Borrar una línea SÍ
   está cubierto — para eso está cevenSkuReindex().

   Depende de: shared/safe.js (cevenEsc) y shared/pipeline-status.js
   (cevenEstadoValores, cevenEstadoLabel). Se carga DESPUÉS de los dos y
   ANTES de <marca>/js/pipeline-view.js.
   ============================================================ */

/* El cevenActEl() de shared/ui-core.js pero para `data-dact`, el namespace de
   las acciones POR LÍNEA.

   Hace falta uno propio porque la fila desplegada vive adentro de #pipe-body,
   que ya tiene el listener de las acciones de FILA (data-act + data-k contra el
   registro de nodos). Con un solo atributo, un botón del detalle entraría por
   el handler de la fila y se resolvería contra el nodo equivocado — o contra
   ninguno, en silencio. Apple ya lo resolvió así; esto es lo mismo, compartido. */
function cevenSkuActEl(ev, container){
  var el = ev.target;
  while(el && el !== container){
    if(el.getAttribute && el.getAttribute('data-dact')) return el;
    el = el.parentNode;
  }
  return null;
}

/* La clave de una línea dentro de su cotización. `idx` es la posición en la
   lista de la opción vigente, no en `cquotes` entero. */
function cevenSkuLineKey(ln, idx){
  return String((ln && ln['SKU']) || '') + '|' + idx;
}

function cevenSkuTieneOverrides(row){
  return !!(row && row.skuStatus && Object.keys(row.skuStatus).length);
}

/* LA HERENCIA: el estado de una línea es el suyo propio si lo tiene, y si no
   el del proyecto. Es la única función que debería leer `skuStatus` para
   mostrar algo. */
function cevenSkuEstado(row, lineKey){
  var raiz = (row && row.estado) || 'Cotizado';
  if(!row || !row.skuStatus) return raiz;
  var v = row.skuStatus[lineKey];
  return v === undefined ? raiz : v;
}

/* Los estados que puede tomar una LÍNEA: el embudo completo menos
   'Proyecto', que describe a la cotización entera y no a un SKU suelto
   (mismo criterio que apple/js/pipeline-detail.js). */
function cevenSkuEstadoValores(){
  return cevenEstadoValores().filter(function(s){ return s !== 'Proyecto'; });
}

/* Las <option> del <select> de una línea. Un estado guardado que no esté en
   la lista (dato viejo, o el propio 'Proyecto' heredado de un proyecto que
   está en esa etapa) se agrega igual: si no, el <select> se dibuja en la
   primera opción y el próximo change guardaría un estado que nadie eligió. */
function cevenSkuEstadoOptions(sel){
  var vals = cevenSkuEstadoValores();
  if(sel && vals.indexOf(sel) === -1) vals = vals.concat([sel]);
  var h = '';
  for(var i = 0; i < vals.length; i++){
    h += '<option value="' + cevenEsc(vals[i]) + '"' + (vals[i] === sel ? ' selected' : '') + '>'
       + cevenEsc(cevenEstadoLabel(vals[i])) + '</option>';
  }
  return h;
}

/* Fija el estado propio de una línea sobre `row`, EN MEMORIA (no guarda).
   `lineKeysTodas` son las claves de todas las líneas de esa cotización.
   Devuelve true si algo cambió.

   Dos colapsos, los dos para no dejar overrides que digan lo mismo que la
   raíz —un mapa con basura adentro haría que la fila se vea "con estados
   particulares" cuando en realidad no los tiene:

   1. Cotización de UNA sola línea: no existe el concepto de estado
      particular ahí, el estado de esa línea ES el del proyecto.
   2. Si tras el cambio TODAS las líneas quedan en el mismo estado, eso ya es
      el estado del proyecto: se sube a `estado` y el mapa se borra. */
function cevenSkuEstadoSet(row, lineKey, nuevo, lineKeysTodas){
  if(!row || !lineKey || !nuevo) return false;
  var todas = lineKeysTodas || [];
  if(cevenSkuEstado(row, lineKey) === nuevo) return false;

  if(todas.length <= 1){
    row.estado = nuevo;
    delete row.skuStatus;
    return true;
  }

  if(!row.skuStatus) row.skuStatus = {};
  row.skuStatus[lineKey] = nuevo;

  var primero = cevenSkuEstado(row, todas[0]);
  var todasIguales = todas.every(function(lk){ return cevenSkuEstado(row, lk) === primero; });
  if(todasIguales){
    row.estado = primero;
    delete row.skuStatus;
    return true;
  }

  for(var i = 0; i < todas.length; i++){
    if(row.skuStatus[todas[i]] === row.estado) delete row.skuStatus[todas[i]];
  }
  if(!Object.keys(row.skuStatus).length) delete row.skuStatus;
  return true;
}

/* Saca el estado propio de una línea: vuelve a heredar el del proyecto. */
function cevenSkuLimpiar(row, lineKey){
  if(!row || !row.skuStatus) return false;
  if(row.skuStatus[lineKey] === undefined) return false;
  delete row.skuStatus[lineKey];
  if(!Object.keys(row.skuStatus).length) delete row.skuStatus;
  return true;
}

/* Cuántas líneas tienen HOY un estado distinto al del proyecto. Es lo que
   se muestra en la fila para avisar que el estado de arriba no es el de
   todos sus ítems. */
function cevenSkuCuantosPropios(row, lines){
  if(!row || !row.skuStatus || !lines) return 0;
  var raiz = row.estado || 'Cotizado';
  var n = 0;
  for(var i = 0; i < lines.length; i++){
    var v = row.skuStatus[cevenSkuLineKey(lines[i], i)];
    if(v !== undefined && v !== raiz) n++;
  }
  return n;
}

/* Corre los índices de las claves `SKU|idx` después de BORRAR una línea.
   Sin esto, sacar un artículo del medio deja todos los overrides de abajo
   apuntando a la línea equivocada, en silencio.

   `lineasAntes` es la lista COMPLETA tal como estaba antes del borrado, y
   `idxBorrado` la posición que se fue. `mapas` son los nombres de las
   propiedades de `row` con claves `SKU|idx` (en Poly/Legamaster es solo
   'skuStatus'; en Apple son siete). */
function cevenSkuReindex(row, mapas, lineasAntes, idxBorrado){
  if(!row || !lineasAntes) return;
  (mapas || []).forEach(function(nombre){
    var mapa = row[nombre];
    if(!mapa || typeof mapa !== 'object') return;
    var nuevo = {};
    for(var i = 0; i < lineasAntes.length; i++){
      if(i === idxBorrado) continue;                       // la línea que se fue
      var viejo = cevenSkuLineKey(lineasAntes[i], i);
      if(!Object.prototype.hasOwnProperty.call(mapa, viejo)) continue;
      nuevo[cevenSkuLineKey(lineasAntes[i], i < idxBorrado ? i : i - 1)] = mapa[viejo];
    }
    if(Object.keys(nuevo).length) row[nombre] = nuevo;
    else delete row[nombre];
  });
}

/* Reparte el monto de la fila entre los estados efectivos de sus líneas:
   `{estado: monto}`. Es lo que hace que un estado por ítem se vea en los
   KPI del dashboard y no solo en la fila desplegada.

   La suma del resultado da EXACTAMENTE `row.monto`, siempre. El monto de la
   fila es una foto del momento de agregarla al pipeline y la cotización pudo
   editarse después —el detalle ya avisa de ese descuadre—, así que la
   diferencia entre el total y la suma de las líneas se le imputa al estado
   del proyecto en vez de aparecer o desaparecer del dashboard. */
function cevenSkuRepartoPorEstado(row, lines){
  var raiz = (row && row.estado) || 'Cotizado';
  var total = Number(row && row.monto) || 0;
  var out = {};
  function sumar(st, m){ out[st] = (out[st] || 0) + m; }

  if(!cevenSkuTieneOverrides(row) || !lines || !lines.length){
    sumar(raiz, total);
    return out;
  }

  var acum = 0;
  for(var i = 0; i < lines.length; i++){
    var sub = (parseFloat(lines[i]['P. Venta Unitario']) || 0) * (parseInt(lines[i]['Cantidad'], 10) || 1);
    acum += sub;
    sumar(cevenSkuEstado(row, cevenSkuLineKey(lines[i], i)), sub);
  }
  var resto = total - acum;
  if(Math.abs(resto) > 0.005) sumar(raiz, resto);
  return out;
}

/* Los estados presentes en una fila: uno solo si no hay overrides, varios si
   los hay. Lo usa el filtro de estado del pipeline —una fila entra si
   ALGUNO de sus estados matchea— y el archivado automático. */
function cevenSkuEstadosDe(row, lines){
  return Object.keys(cevenSkuRepartoPorEstado(row, lines));
}
