/* ============================================================
   COTIZACIONES: EL PUENTE ENTRE EL CACHE Y LA TABLA
   ------------------------------------------------------------
   `cquotes` (localStorage) es un array PLANO: una fila por linea
   de producto, con los datos de la cotizacion repetidos en todas.
   Esa forma no se toca —la leen 156 llamadas a getDB()/saveDB()
   repartidas en 38 archivos— y sigue siendo el buffer offline.

   La tabla `cotizaciones` de Supabase, en cambio, tiene UNA FILA
   POR COTIZACION con sus lineas en un jsonb. Este modulo traduce
   entre las dos formas para que sync.js pueda diffear cotizacion
   por cotizacion, igual que ya hace con el pipeline.

   POR QUE, EN UNA LINEA
   ---------------------
   Mientras el historial viajaba como un blob unico en
   app_settings, el ultimo que subia borraba lo que los demas
   habian guardado desde su ultima lectura: cotizaciones que
   desaparecian sin pasar por la papelera y sin un solo error.
   Esta reproducido en scripts/check-sync-colecciones.js.

   LA IDEA CENTRAL: IDENTIDAD != ETIQUETA
   --------------------------------------
   Hasta ahora el numero hacia tres trabajos a la vez (identidad
   para la sync, clave de borrado/reinsercion y etiqueta para el
   cliente), y por eso un choque de numeros DESTRUIA datos. Aca se
   separan:

     · `_qid`  identidad. Se genera offline, no colisiona nunca y
               no cambia nunca. Viaja en TODAS las filas de la
               cotizacion, igual que `_opcEf` y `_estado`.
     · `qnum`  etiqueta. Si dos personas toman el mismo numero, el
               unique (brand, qnum) de la tabla rebota y se
               renumera. Se pierde el NUMERO, nunca la cotizacion.

   Depende de: brand.js (cevenK) y safe.js (cevenLsJSON).
   Se carga ANTES de shared/sync.js.
   ============================================================ */

/* Columna interna con la identidad. Prefijo `_` como el resto de las columnas
   que no van al Excel (`_estado`, `_opcEf`, `_base`…). */
var CEVEN_QID = '_qid';

/* Id de una cotizacion que ya existia cuando se migro a la tabla.
   TIENE que dar exactamente lo mismo que el backfill SQL de
   20260911100000_cotizaciones_tabla.sql ('q' || "N° Cotización"): si los dos
   lados no coinciden, la misma cotizacion entra dos veces. */
function cevenQIdLegacy(qn){ return 'q' + String(qn); }

/* Id de una cotizacion NUEVA. Tiene que ser un uuid y no 'q'+numero: si dos
   usuarios crean la #0105 a la vez y los dos la llamaran 'q0105', el upsert por
   PK (brand, id) haria que una pise a la otra —exactamente el bug que estamos
   sacando—. Con ids distintos entran las dos y es el unique de `qnum` el que
   arbitra la etiqueta. */
function cevenQNuevoId(){
  try{
    if(typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  }catch(e){}
  // Fallback para contextos no seguros (file://, http sin TLS), donde
  // crypto.randomUUID no existe. uuid v4 armado a mano.
  var b = null;
  try{
    if(typeof crypto !== 'undefined' && crypto.getRandomValues){
      b = new Uint8Array(16);
      crypto.getRandomValues(b);
    }
  }catch(e){ b = null; }
  if(!b){
    b = [];
    for(var i = 0; i < 16; i++) b.push(Math.floor(Math.random() * 256));
  }
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  var h = [];
  for(var j = 0; j < 16; j++) h.push((b[j] + 0x100).toString(16).slice(1));
  return h.slice(0,4).join('') + '-' + h.slice(4,6).join('') + '-' + h.slice(6,8).join('') +
         '-' + h.slice(8,10).join('') + '-' + h.slice(10,16).join('');
}

// El numero tal como se guarda en la fila ('0100'), pase lo que pase.
function cevenQNumDeFila(r){
  return (r && r['N° Cotización'] !== undefined && r['N° Cotización'] !== null)
    ? String(r['N° Cotización']) : '';
}

/* ---------- Agrupar: array plano -> una entrada por cotizacion ----------
   El `id` sale de `_qid` si la fila ya lo tiene. Si no —cotizacion guardada
   antes de esta version— se usa el id legacy, que es el mismo que le puso el
   backfill: asi las dos copias se reconocen como LA MISMA y no se duplican.

   El ORDEN DE LAS LINEAS se preserva tal cual viene. No es cosmetico: el
   lineKey de los overrides por SKU del pipeline es "SKU|indice" sobre esta
   lista, asi que reordenarla aplica los estados por SKU a la linea equivocada
   (ver docs/ARQUITECTURA.md). */
function cevenQAgrupar(flat){
  var porId = {}, orden = [];
  (flat || []).forEach(function(r){
    if(!r) return;
    var qn = cevenQNumDeFila(r);
    if(!qn) return;                       // fila sin numero: no es una cotizacion
    var id = r[CEVEN_QID] || cevenQIdLegacy(qn);
    if(!porId[id]){
      porId[id] = {
        id:          id,
        qnum:        qn,
        cliente:     r['Cliente']    || null,
        proyecto:    r['Proyecto']   || null,
        ejecutivo:   r['Ejecutivo']  || null,
        estado:      r['_estado']    || null,
        mesCierre:   r['Mes Cierre'] || null,
        cond: {
          pago:     r['Condición de pago']         || null,
          vigencia: r['Propuesta efectiva hasta']  || null,
          entrega:  r['Entrega']                   || null
        },
        lineas: []
      };
      orden.push(id);
    }
    porId[id].lineas.push(r);
  });
  return orden.map(function(id){ return porId[id]; });
}

/* ---------- Aplanar: entradas de cotizacion -> array plano ----------
   Devuelve exactamente la forma que espera getDB(), con `_qid` sellado en
   todas las filas. El orden ENTRE cotizaciones no importa (renderHistory
   ordena por numero descendente por su cuenta); el orden DENTRO de cada una
   se respeta. */
function cevenQAplanar(cotiz){
  var out = [];
  (cotiz || []).forEach(function(c){
    if(!c || !c.lineas) return;
    c.lineas.forEach(function(l){
      if(!l) return;
      // No se muta la fila original: el llamador puede estar usandola.
      var copia = Object.assign({}, l);
      copia[CEVEN_QID] = c.id;
      copia['N° Cotización'] = c.qnum;
      out.push(copia);
    });
  });
  return out;
}

/* ---------- Sellar: darle identidad a lo que todavia no la tiene ----------
   Lo llama saveDB() antes de escribir. Reglas, en orden:

     1. La fila ya trae `_qid`  -> se respeta.
     2. Otra fila del MISMO numero ya tiene `_qid` -> se reusa. Es el caso
        normal de re-guardar una cotizacion abierta del historial.
     3. El numero ya existia en el cache SIN `_qid` -> es una cotizacion
        anterior a esta version: le toca el id legacy, el mismo que el backfill.
     4. Numero que no existia -> cotizacion nueva -> uuid.

   La regla 3 es la que evita el duplicado: si a una cotizacion vieja que se
   re-guarda se le diera un uuid, entraria de nuevo al lado de la que el
   backfill ya subio como 'q<numero>'. */
function cevenQSellar(flat, cacheAnterior){
  var idPorNum = {}, numExistente = {};
  (cacheAnterior || []).forEach(function(r){
    var qn = cevenQNumDeFila(r);
    if(!qn) return;
    numExistente[qn] = 1;
    if(r[CEVEN_QID] && !idPorNum[qn]) idPorNum[qn] = r[CEVEN_QID];
  });
  // Un `_qid` que venga en el lote que se esta guardando tambien manda.
  (flat || []).forEach(function(r){
    var qn = cevenQNumDeFila(r);
    if(qn && r && r[CEVEN_QID] && !idPorNum[qn]) idPorNum[qn] = r[CEVEN_QID];
  });

  return (flat || []).map(function(r){
    if(!r) return r;
    var qn = cevenQNumDeFila(r);
    if(!qn || r[CEVEN_QID]) return r;
    var id = idPorNum[qn] || (numExistente[qn] ? cevenQIdLegacy(qn) : cevenQNuevoId());
    idPorNum[qn] = id;
    var copia = Object.assign({}, r);
    copia[CEVEN_QID] = id;
    return copia;
  });
}

/* ---------- Huella de contenido ----------
   Para decidir si la cotizacion local y la del servidor son LA MISMA. Se miran
   solo los campos que definen el negocio; no se compara el objeto entero
   porque el orden de las claves y las columnas internas hacen ruido. */
function cevenQHuella(lineas){
  return JSON.stringify((lineas || []).map(function(l){
    return [ l['SKU'] || '', l['Cantidad'] || '', l['P. Venta Unitario'] || '', l['Tipo'] || '' ];
  }));
}

/* ---------- Reconciliacion con el servidor (una sola vez, online) ----------
   El caso que resuelve: una cotizacion guardada ANTES de esta version y que
   nunca llego a sincronizar calcula el id legacy 'q0100'. Si el servidor ya
   tiene OTRA cotizacion distinta con ese mismo id (porque el backfill la tomo
   del blob), subir la local con Prefer: merge-duplicates PISARIA la del
   servidor — justo lo que estamos eliminando.

   Por eso el sellado definitivo de las cotizaciones viejas no se hace a ciegas
   al arrancar, sino ACA, cuando ya tenemos las filas del servidor en la mano:

     · el servidor no la tiene            -> se queda con el id legacy y se sube
     · el servidor la tiene, mismo contenido -> es la misma: se adopta el id
     · el servidor la tiene, contenido distinto -> DIVERGENTE: la local se
       queda con un uuid nuevo y un numero libre. Sobreviven LAS DOS.

   Devuelve {cotiz, renumeradas:[{de,a}]}. No escribe nada: decide. */
function cevenQReconciliar(localCotiz, serverRows){
  var srv = {}, maxNum = 0;
  function _ver(n){
    var v = parseInt(n, 10);
    if(!isNaN(v) && v > maxNum) maxNum = v;
  }
  (serverRows || []).forEach(function(s){
    if(!s || s.id == null) return;
    srv[s.id] = s;
    _ver(s.qnum);
  });
  (localCotiz || []).forEach(function(c){ _ver(c.qnum); });

  var renumeradas = [];
  var cotiz = (localCotiz || []).map(function(c){
    // Ya tiene identidad propia (uuid, o un legacy ya reconciliado): nada que hacer.
    if(!c.esLegacy) return c;
    var s = srv[c.id];
    if(!s) return c;                                   // el servidor no la conoce
    if(cevenQHuella(s.lineas) === cevenQHuella(c.lineas)) return c;   // es la misma

    // Divergente: se conservan las dos.
    maxNum += 1;
    var nuevoNum = String(maxNum).padStart(4, '0');
    renumeradas.push({ de: c.qnum, a: nuevoNum });
    return Object.assign({}, c, { id: cevenQNuevoId(), qnum: nuevoNum, esLegacy: false });
  });

  return { cotiz: cotiz, renumeradas: renumeradas };
}

/* Marca cuales de las agrupadas son "legacy" (id derivado del numero, no
   sellado en la fila). Es lo que cevenQReconciliar() necesita para saber a
   cuales mirar. */
function cevenQMarcarLegacy(cotiz, flat){
  var selladas = {};
  (flat || []).forEach(function(r){ if(r && r[CEVEN_QID]) selladas[r[CEVEN_QID]] = 1; });
  (cotiz || []).forEach(function(c){ c.esLegacy = !selladas[c.id]; });
  return cotiz;
}
