/* ============================================================================
   OPCIONES DE UNA COTIZACIÓN  ·  compartido por todas las marcas
   ----------------------------------------------------------------------------
   Una cotización puede llevar DOS propuestas alternativas —Opción A y Opción B—
   y guardarse como una sola. El caso real: se le ofrecen al cliente dos armados
   (uno más caro y uno más económico) y él elige uno.

   ── LA REGLA QUE NO SE PUEDE ROMPER ────────────────────────────────────────
   **Solo UNA opción es la vigente y solo esa suma al pipeline, al Target y al
   Excel.** Si las dos sumaran, el forecast del equipo quedaría inflado con
   plata que nunca se va a facturar, y eso no se nota mirando la pantalla: se
   nota a fin de mes, cuando el total no cierra. Todo lo que agregue importes
   tiene que filtrar por `cevenOpcEfectiva()`.

   La opción vigente arranca en A y se cambia desde la cotización o desde la
   fila del pipeline (sin reabrir la cotización).

   ── MODELO ─────────────────────────────────────────────────────────────────
   Cada línea de la cotización lleva `opc` (1 = A, 2 = B). Una cotización de una
   sola opción es simplemente una en la que todas las líneas son 1 — por eso las
   cotizaciones viejas, que no tienen el campo, siguen funcionando: `cevenOpcDe()`
   devuelve 1 cuando no hay dato.

   En `cquotes` viajan dos campos por fila: la columna visible **`Opción`** (va
   al Excel) y **`_opcEf`**, la vigente de esa cotización. `_opcEf` se escribe en
   TODAS las filas, igual que `_estado`, para no depender de filas "meta" (Poly
   no las tiene).

   ── QUÉ NO ESTÁ ACÁ ────────────────────────────────────────────────────────
   Los totales los calcula cada marca y se le pasan a `cevenOpcPintarBarra()`:
   Apple suma garantías CevenCare y Poly no, y meter esa cuenta acá obligaría a
   un `if` por marca adentro de shared/.

   Depende de: safe.js (cevenEsc), notify.js (showToast/notifyUndo),
   ui-core.js (dp). Se carga ANTES de <marca>/js/quote.js.
   ========================================================================== */

var _qOpcActiva   = 1;   // la que se está editando en pantalla
var _qOpcEfectiva = 1;   // la que suma al pipeline / Target / Excel
var _qOpcHayB     = false;

/* La opción de una línea o de una fila de cquotes. Todo lo que no diga 2 es 1:
   las cotizaciones guardadas antes de 08/2026 no tienen el campo. */
function cevenOpcDe(x){
  if(!x) return 1;
  var n = (x.opc !== undefined && x.opc !== null) ? x.opc : x['Opción'];
  return (n === 2 || n === '2') ? 2 : 1;
}
function cevenOpcLetra(n){ return (n === 2) ? 'B' : 'A'; }

function cevenOpcActiva(){ return _qOpcActiva; }
function cevenOpcEfectiva(){ return _qOpcEfectiva; }
function cevenOpcHayB(){ return _qOpcHayB; }

// Todas las líneas de una opción. `arr` es el array de la marca (items,
// warrantyItems…): acá no se conoce ninguno.
function cevenOpcFiltrar(arr, n){
  if(!arr || !arr.length) return [];
  n = (n === 2) ? 2 : 1;
  return arr.filter(function(x){ return cevenOpcDe(x) === n; });
}

/* Vuelve al estado "una sola opción". Lo llama nuevaCotizacion() de cada marca:
   sin esto, arrancar una cotización nueva después de haber trabajado con dos
   opciones dejaba la pantalla en la solapa B, vacía y sin explicación. */
function cevenOpcReset(){
  _qOpcActiva = 1; _qOpcEfectiva = 1; _qOpcHayB = false;
}

/* Estado completo, para los snapshots de "Deshacer" (empezar una cotización
   nueva, copiar, cargar otra del historial). Sin esto, deshacer devolvía las
   líneas de las dos opciones pero la pantalla quedaba en "una sola opción" y las
   de la B desaparecían de la vista sin haberse borrado. */
function cevenOpcEstado(){
  return {activa: _qOpcActiva, ef: _qOpcEfectiva, hayB: _qOpcHayB};
}
function cevenOpcEstadoSet(st){
  if(!st){ cevenOpcReset(); return; }
  _qOpcHayB     = !!st.hayB;
  _qOpcEfectiva = (st.ef === 2 && _qOpcHayB) ? 2 : 1;
  _qOpcActiva   = (st.activa === 2 && _qOpcHayB) ? 2 : 1;
}

/* Estado a partir de las filas guardadas de una cotización (historial, papelera,
   pipeline). La vigente sale de `_opcEf`; si ninguna fila lo trae —cotización
   vieja— es la A. */
function cevenOpcCargarDeFilas(rows){
  cevenOpcReset();
  if(!rows || !rows.length) return;
  for(var i=0;i<rows.length;i++){
    if(cevenOpcDe(rows[i]) === 2){ _qOpcHayB = true; break; }
  }
  var ef = null;
  for(var j=0;j<rows.length;j++){
    var v = rows[j]['_opcEf'];
    if(v !== undefined && v !== null && v !== ''){ ef = (String(v) === '2') ? 2 : 1; break; }
  }
  _qOpcEfectiva = (ef === 2 && _qOpcHayB) ? 2 : 1;
  // Se abre en la vigente: es la que le importa a quien reabre la cotización.
  _qOpcActiva = _qOpcEfectiva;
}

// La vigente de una cotización ya guardada, sin tocar el estado de pantalla.
// La usan el pipeline y el comprobante, que leen cotizaciones que no están abiertas.
function cevenOpcEfectivaDeFilas(rows){
  if(!rows || !rows.length) return 1;
  var hayB = false;
  for(var i=0;i<rows.length;i++){ if(cevenOpcDe(rows[i]) === 2){ hayB = true; break; } }
  if(!hayB) return 1;
  for(var j=0;j<rows.length;j++){
    var v = rows[j]['_opcEf'];
    if(v !== undefined && v !== null && v !== '') return (String(v) === '2') ? 2 : 1;
  }
  return 1;
}
function cevenOpcHayBEnFilas(rows){
  if(!rows) return false;
  for(var i=0;i<rows.length;i++){ if(cevenOpcDe(rows[i]) === 2) return true; }
  return false;
}

/* LAS filas de una cotización guardada: las de su opción vigente, en orden.
   `tipos` es opcional (`['producto','garantia']`, `['producto']`…).

   **Todo lo que lea `cquotes` para hacer cuentas o para recorrer líneas tiene
   que pasar por acá.** Dos motivos:

   1. si no filtra, una cotización de dos opciones cuenta doble;
   2. el `lineKey` de los overrides por SKU del pipeline es `SKU|índice` sobre
      esta lista, así que si un lugar filtra y otro no, los índices se corren y
      los estados por SKU se aplican a la línea equivocada.

   Para las cotizaciones de una sola opción devuelve exactamente lo de siempre:
   todas sus filas son de la opción 1. */
function cevenOpcFilasDeCotiz(db, qn, tipos){
  var rows = (db||[]).filter(function(r){ return r['N° Cotización'] === qn; });
  var ef = cevenOpcEfectivaDeFilas(rows);
  return rows.filter(function(r){
    if(cevenOpcDe(r) !== ef) return false;
    return !tipos || tipos.indexOf(r['Tipo']) !== -1;
  });
}

/* ── ID ESTABLE DE LÍNEA (`_lid`) ─────────────────────────────────────────────
   El pipeline guarda estados, meses y entregas parciales POR ARTÍCULO, y los
   ata a una clave `SKU|<id de la línea>` (ver cevenSkuLineKey en
   pipeline-sku.js). Antes el id era la POSICIÓN de la línea en la cotización,
   y cualquier cosa que moviera una línea —reordenarla, insertar una, cambiar
   de opción A/B, listar con otro filtro de `Tipo`— corría todas las claves y
   los estados se aplicaban al artículo equivocado, sin avisar.

   Ahora cada línea lleva su propio `_lid`, que se genera UNA vez, viaja en la
   fila de cquotes (y por lo tanto en `cotizaciones.lineas`) y no cambia nunca:
   la posición deja de importar.

   Dos orígenes de id, que no pueden chocar:
     · NUEVO   'n' + aleatorio. Líneas creadas desde esta versión.
     · LEGADO  el índice (numérico) que la línea ya tenía como clave. Se
               "congela" al reabrir y re-guardar una cotización vieja, así las
               claves que el pipeline ya tenía siguen siendo válidas. */
function cevenLidNuevo(){
  var s = '';
  try{
    if(typeof crypto !== 'undefined' && crypto.getRandomValues){
      var b = new Uint8Array(6);
      crypto.getRandomValues(b);
      for(var i = 0; i < b.length; i++) s += (b[i] % 36).toString(36);
    }
  }catch(e){ s = ''; }
  while(s.length < 6) s += Math.floor(Math.random() * 36).toString(36);
  return 'n' + s;
}

/* El id de una línea de pantalla (item del cotizador). Se asigna al primer uso
   y queda en el item. */
function cevenLidDe(item){
  if(!item) return '';
  if(!item.lid) item.lid = cevenLidNuevo();
  return item.lid;
}

/* Los ids de las filas guardadas de una cotización, en el MISMO orden que
   `rows`, para armar los items al reabrirla. Una fila que ya trae `_lid` lo
   conserva; una vieja recibe el índice que tenía como clave (LEGADO) si es de
   la opción vigente, o uno nuevo si no tuvo nunca clave. '' = fila que no es
   una línea (meta). `tipos` tiene que ser el mismo filtro con que el pipeline
   de esa marca arma sus claves (Apple: ['producto','garantia']; el resto, sin
   filtro). Un id repetido dentro de la misma cotización —no debería pasar,
   pero una copia a mano lo puede dejar— se reasigna: dos líneas con la misma
   clave se pisarían el estado entre sí. */
function cevenLidsDeFilas(rows, tipos){
  var out = [], vistos = {}, n = 0;
  if(!rows) return out;
  var ef = cevenOpcEfectivaDeFilas(rows);
  for(var i = 0; i < rows.length; i++){
    var r = rows[i];
    var esLinea = !tipos || tipos.indexOf(r['Tipo']) !== -1;
    var enVigente = esLinea && cevenOpcDe(r) === ef;
    var lid = r['_lid'] ? String(r['_lid']) : '';
    if(!lid){
      if(!esLinea) lid = '';
      else if(enVigente) lid = String(n);
      else lid = cevenLidNuevo();
    }
    if(enVigente) n++;
    if(lid && vistos[lid]) lid = cevenLidNuevo();
    if(lid) vistos[lid] = 1;
    out.push(lid);
  }
  return out;
}

/* Sella una fila de cquotes con la opción de su línea y la vigente de la
   cotización, y con el id estable de la línea. Lo llama el doSave() de cada
   marca. */
function cevenOpcSellarFila(fila, item){
  fila['Opción'] = cevenOpcDe(item);
  fila['_opcEf'] = _qOpcEfectiva;
  if(item) fila['_lid'] = cevenLidDe(item);
  return fila;
}

/* ── Acciones de la barra ─────────────────────────────────────────────────── */

// Repinta la cotización entera después de tocar opciones. Cada marca define lo
// que tenga; las que no existen se saltean solas.
function _opcRepintar(){
  if(typeof renderQ === 'function') renderQ();
  if(typeof renderWarranties === 'function') renderWarranties();
  if(typeof renderPicker === 'function') renderPicker();
}

function cevenOpcVerA(){ cevenOpcVer(1); }
function cevenOpcVerB(){ cevenOpcVer(2); }
function cevenOpcVer(n){
  n = (n === 2) ? 2 : 1;
  if(n === 2 && !_qOpcHayB) return;
  if(_qOpcActiva === n) return;
  _qOpcActiva = n;
  _opcRepintar();
}

function cevenOpcAgregarB(){
  if(_qOpcHayB){ cevenOpcVer(2); return; }
  _qOpcHayB = true;
  _qOpcActiva = 2;
  _opcRepintar();
  showToast('Opción B agregada. Lo que cargues acá NO suma al pipeline hasta que la marques vigente.');
}

/* Borra la opción B entera (sus líneas). Se hace y se ofrece deshacer, como
   todo lo destructivo de la app. */
function cevenOpcBorrarB(){
  if(!_qOpcHayB) return;
  var snap = {};
  var listas = (window.CEVEN_BRAND && CEVEN_BRAND.quoteLists) ? CEVEN_BRAND.quoteLists : [];
  for(var i=0;i<listas.length;i++){
    snap[i] = listas[i].get().slice();
    listas[i].set(cevenOpcFiltrar(listas[i].get(), 1));
  }
  var efPrevia = _qOpcEfectiva;
  _qOpcHayB = false; _qOpcActiva = 1; _qOpcEfectiva = 1;
  _opcRepintar();
  notifyUndo('Eliminaste la Opción B.', function(){
    for(var k=0;k<listas.length;k++) listas[k].set(snap[k]);
    _qOpcHayB = true; _qOpcEfectiva = efPrevia; _qOpcActiva = 2;
    _opcRepintar();
  });
}

/* Marca cuál de las dos es la vigente. Es EL dato que decide qué monto ve el
   equipo en el pipeline, así que se avisa con un cartel. */
function cevenOpcMarcarVigente(n){
  n = (n === 2) ? 2 : 1;
  if(n === 2 && !_qOpcHayB) return;
  if(_qOpcEfectiva === n) return;
  var previa = _qOpcEfectiva;
  _qOpcEfectiva = n;
  _opcRepintar();
  notifyUndo('Opción ' + cevenOpcLetra(n) + ' marcada como vigente — es la que suma al pipeline. Guardá la cotización para que el equipo la vea.',
    function(){ _qOpcEfectiva = previa; _opcRepintar(); });
}

/* ── La barra ─────────────────────────────────────────────────────────────── */
/* `totales` es {1: totalA, 2: totalB} y lo calcula la marca: Apple suma las
   garantías CevenCare y Poly no tiene garantías.

   Con una sola opción NO se pintan solapas: queda un botón discreto para sumar
   la B. El 95% de las cotizaciones tiene una sola y no hay por qué cobrarles el
   ruido de una barra de pestañas. */
function cevenOpcBarraHTML(totales){
  totales = totales || {};
  var fmt = function(v){ return (typeof dp === 'function') ? dp(v||0) : String(v||0); };
  if(!_qOpcHayB){
    return '<div class="opc-bar opc-bar-sola">'
      + '<button type="button" class="opc-add" data-opc="addb" title="Cotizar una segunda alternativa dentro de esta misma cotización">＋ Agregar Opción B</button>'
      + '</div>';
  }
  var h = '<div class="opc-bar">';
  for(var n=1;n<=2;n++){
    var act = (_qOpcActiva === n), ef = (_qOpcEfectiva === n);
    h += '<button type="button" class="opc-tab'+(act?' on':'')+(ef?' ef':'')+'" data-opc="ver" data-opc-n="'+n+'">'
       +   '<span class="opc-tab-t">Opción ' + cevenOpcLetra(n) + '</span>'
       +   '<span class="opc-tab-i">' + cevenEsc(fmt(totales[n])) + '</span>'
       +   (ef ? '<span class="opc-chip" title="Es la que suma al pipeline y al Target">★ vigente</span>' : '')
       + '</button>';
  }
  h += '<div class="opc-acc">';
  if(_qOpcEfectiva !== _qOpcActiva){
    h += '<button type="button" class="bo" data-opc="vigente" data-opc-n="'+_qOpcActiva+'">★ Marcar Opción '+cevenOpcLetra(_qOpcActiva)+' como vigente</button>';
  }
  h += '<button type="button" class="bo red" data-opc="delb" title="Elimina la Opción B y sus líneas">Eliminar Opción B</button>'
    + '</div></div>';
  return h;
}

/* Pinta la barra dentro de #opc-bar-box. El listener se ata UNA vez al
   contenedor, que no se reemplaza: lo que se rehace es su contenido. */
function cevenOpcPintarBarra(totales){
  var box = document.getElementById('opc-bar-box');
  if(!box) return;
  box.innerHTML = cevenOpcBarraHTML(totales);
  if(box._opcBound) return;
  box._opcBound = true;
  box.addEventListener('click', function(ev){
    var el = ev.target.closest ? ev.target.closest('[data-opc]') : null;
    if(!el || !box.contains(el)) return;
    var n = parseInt(el.getAttribute('data-opc-n'), 10);
    switch(el.getAttribute('data-opc')){
      case 'ver':     cevenOpcVer(n); break;
      case 'addb':    cevenOpcAgregarB(); break;
      case 'delb':    cevenOpcBorrarB(); break;
      case 'vigente': cevenOpcMarcarVigente(n); break;
    }
  });
}

/* Aviso para el PDF y el comprobante: dos opciones son EXCLUYENTES. Sin esta
   línea, un cliente puede leer las dos tablas como si fueran dos partes de la
   misma compra y sumar los totales. */
function cevenOpcLeyenda(){
  return 'Opciones alternativas: A y B son propuestas excluyentes — se factura UNA sola.';
}

/* ── Desde el pipeline ────────────────────────────────────────────────────── */
/* La chapita de la fila del pipeline. Solo aparece si la cotización tiene dos
   opciones; dice cuál es la que está sumando. `attrs` lo arma la marca porque
   cada una direcciona sus filas distinto (`data-pact` en Apple, `data-act` en
   Poly). */
function cevenOpcChipPipeHTML(rows, attrs){
  if(!cevenOpcHayBEnFilas(rows)) return '';
  var ef = cevenOpcEfectivaDeFilas(rows);
  return '<button type="button" class="opc-pipe"'+(attrs||'')
    + ' title="Esta cotización tiene dos opciones y está sumando la Opción '+cevenOpcLetra(ef)
    + '. Clic para cambiar la vigente.">Opc. '+cevenOpcLetra(ef)+'</button>';
}

/* Cambia la opción vigente de una cotización YA GUARDADA, sellando TODAS sus
   filas de `cquotes`. Devuelve true si se escribió.

   No toca el pipeline: los números de la fila los recalcula cada marca, que es
   la que sabe qué columnas lleva (Apple, familias y margen ponderado; Poly, un
   monto). getDB()/saveDB() las define la marca, igual que en comprobante.js. */
function cevenOpcFijarEnDB(qn, nueva){
  nueva = (nueva === 2) ? 2 : 1;
  var db = getDB(), tocadas = 0;
  for(var i=0;i<db.length;i++){
    if(db[i]['N° Cotización'] === qn){ db[i]['_opcEf'] = nueva; tocadas++; }
  }
  if(!tocadas) return false;
  return saveDB(db) !== false;
}
