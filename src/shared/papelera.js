/* ============================================================================
   PAPELERA  ·  compartida por todas las marcas
   ----------------------------------------------------------------------------
   Eliminar una cotización del historial la sacaba de `cquotes` y listo. Había
   un "Deshacer" en el cartel (notifyUndo), pero dura lo que dura el toast: si
   te diste cuenta al minuto siguiente, no había forma de recuperarla.

   Ahora la cotización pasa a `cpapelera` y se puede restaurar durante
   CEVEN_PAPELERA_DIAS días. El "Deshacer" del cartel sigue estando: es el
   camino rápido para el error inmediato, y no compite con esto.

   ── EL ORDEN DE LAS DOS ESCRITURAS IMPORTA ────────────────────────────────
   Borrar son dos escrituras: meter en `cpapelera` y sacar de `cquotes`. Se
   hace SIEMPRE en ese orden, y si la primera falla no se hace la segunda.

   Por dos motivos distintos, y los dos terminan en pérdida de datos si se
   invierte el orden:

     · **Cuota llena.** cevenLsSet() devuelve false cuando localStorage no
       entra. Sacando primero de `cquotes`, la cotización desaparecía de las
       dos partes.
     · **Sync.** `cquotes` y `cpapelera` son dos claves de app_settings con su
       propio last-write-wins: pueden subir uno sí y otro no. Con este orden,
       el peor caso es que la cotización quede en las dos partes (un duplicado,
       que se ve y se arregla). Al revés, el peor caso es que no quede en
       ninguna.

   ── SINCRONIZA COMO UNA CLAVE MÁS ─────────────────────────────────────────
   `cpapelera` está en `settingKeys` de cada brand.js, así que la papelera es
   del EQUIPO y no de un dispositivo: si borrás en la notebook, lo restaurás
   desde la PC. La purga es idempotente, así que no importa qué máquina la
   corra ni cuántas veces.

   Depende de: brand.js (cevenK), safe.js (cevenLsSet, cevenLsJSON), notify.js
   (showToast, confirmModal), auth.js (cevenCanEditQuote), ui-core.js (fD) y el
   getDB()/saveDB() de la marca — el mismo acoplamiento que ya tiene
   shared/comprobante.js.
   ========================================================================== */

var CEVEN_PAPELERA_DIAS = 30;
var CEVEN_PAPELERA_MS   = CEVEN_PAPELERA_DIAS * 24 * 60 * 60 * 1000;

function cevenPapeleraGet(){
  var p = window.cevenLsJSON(window.cevenK('cpapelera'), []);
  return Object.prototype.toString.call(p) === '[object Array]' ? p : [];
}

function cevenPapeleraSave(p){
  return window.cevenLsSet(window.cevenK('cpapelera'), JSON.stringify(p));
}

/* Días que le quedan a una entrada antes de que la purga se la lleve.
   Se redondea PARA ARRIBA: el día que vence todavía se puede restaurar, así
   que mostrar "0 días" mientras sigue estando sería mentira. Una entrada sin
   fecha válida (editada a mano, o de una versión futura) se trata como recién
   borrada en vez de como vencida: ante la duda, no se tira nada. */
function cevenPapeleraDiasRestantes(entrada){
  var t = Date.parse((entrada && entrada.borrada) || '');
  if(isNaN(t)) return CEVEN_PAPELERA_DIAS;
  return Math.max(0, Math.ceil((t + CEVEN_PAPELERA_MS - Date.now()) / 86400000));
}

function _papVencida(entrada){
  var t = Date.parse((entrada && entrada.borrada) || '');
  if(isNaN(t)) return false;          // ver cevenPapeleraDiasRestantes
  return (Date.now() - t) > CEVEN_PAPELERA_MS;
}

/* Saca lo vencido. Devuelve cuántas entradas se fueron.
   Solo escribe si REALMENTE venció algo: si no, cada carga de cada dispositivo
   marcaría la clave como sucia y dispararía un push al pedo. */
function cevenPapeleraPurgar(){
  var p = cevenPapeleraGet();
  var quedan = p.filter(function(e){ return !_papVencida(e); });
  if(quedan.length === p.length) return 0;
  cevenPapeleraSave(quedan);
  return p.length - quedan.length;
}

function _papEntrada(qn, filas){
  var primera = filas[0] || {};
  var total = 0;
  for(var i = 0; i < filas.length; i++) total += parseFloat(filas[i]['Total']) || 0;
  return {
    qn:        String(qn),
    borrada:   new Date().toISOString(),
    cliente:   primera['Cliente']   || '',
    proyecto:  primera['Proyecto']  || primera['OPG'] || '',
    ejecutivo: primera['Ejecutivo'] || '',
    fecha:     primera['Fecha']     || '',
    total:     total,
    filas:     filas
  };
}

/* Manda VARIAS cotizaciones a la papelera en UNA sola escritura.
   `grupos` es [{qn, filas}]. Devuelve true si se guardó: el llamador TIENE que
   respetarlo y no borrar de `cquotes` si dio false.

   Es una sola escritura y no una por cotización a propósito: borrando 10
   seleccionadas, si la número 7 falla por cuota quedaban 6 en la papelera con
   sus cotizaciones todavía en el historial. Guardando de una, o entran todas o
   no entra ninguna, y el historial no se toca.

   Si un número ya estaba en la papelera se reemplaza su entrada, no se agrega
   otra: pasa al borrar, restaurar y volver a borrar, y dos entradas del mismo
   número con distinta antigüedad no significan nada. */
function cevenPapeleraTirarVarias(grupos){
  grupos = (grupos || []).filter(function(g){ return g && g.filas && g.filas.length; });
  if(!grupos.length) return false;

  var nuevas = {};
  grupos.forEach(function(g){ nuevas[String(g.qn)] = 1; });

  var p = cevenPapeleraGet().filter(function(e){ return !nuevas[String(e.qn)]; });
  grupos.forEach(function(g){ p.push(_papEntrada(g.qn, g.filas)); });
  return cevenPapeleraSave(p);
}

// Una sola cotización: el caso corriente (el × de una tarjeta del historial).
function cevenPapeleraTirar(qn, filas){
  return cevenPapeleraTirarVarias([{ qn: qn, filas: filas }]);
}

/* Saca entradas de la papelera SIN preguntar ni restaurar nada. Lo usa el
   "Deshacer" del cartel: ese camino ya devolvió las filas a `cquotes` por su
   cuenta, y dejar además la copia en la papelera mostraría la cotización en
   los dos lados. No confundir con cevenPapeleraBorrarDef(), que es la acción
   destructiva del usuario y sí pregunta. */
function cevenPapeleraSacar(qns){
  var fuera = {};
  (qns || []).forEach(function(q){ fuera[String(q)] = 1; });
  var p = cevenPapeleraGet();
  var quedan = p.filter(function(e){ return !fuera[String(e.qn)]; });
  if(quedan.length !== p.length) cevenPapeleraSave(quedan);
  if(typeof renderPapelera === 'function') renderPapelera();
}

function cevenPapeleraEntrada(qn){
  var p = cevenPapeleraGet();
  for(var i = 0; i < p.length; i++) if(String(p[i].qn) === String(qn)) return p[i];
  return null;
}

/* Devuelve la cotización al historial. El orden vuelve a importar, y es el
   inverso del de borrar: primero se escribe `cquotes` y recién después se saca
   de la papelera. Si falla el guardado, la entrada sigue estando. */
function cevenPapeleraRestaurar(qn){
  var e = cevenPapeleraEntrada(qn);
  if(!e) return false;
  if(!cevenCanEditQuote(e.ejecutivo)){
    showToast('No tenés permiso para restaurar esta cotización.');
    return false;
  }

  /* El número ya existe en el historial: restaurar mezclaría las líneas de dos
     cotizaciones distintas bajo el mismo número, y eso no se ve hasta que
     alguien abre el PDF. Se corta acá y se dice por qué. */
  var db = getDB();
  for(var i = 0; i < db.length; i++){
    if(String(db[i]['N° Cotización']) === String(qn)){
      showToast('Ya existe una cotización #' + qn + ' en el historial. Renombrala o eliminala antes de restaurar esta.');
      return false;
    }
  }

  if(!saveDB(db.concat(e.filas))) return false;
  cevenPapeleraSave(cevenPapeleraGet().filter(function(x){ return String(x.qn) !== String(qn); }));
  showToast('Cotización #' + qn + ' restaurada al historial.');
  if(typeof renderHistory === 'function') renderHistory();
  return true;
}

/* Borrado definitivo de UNA entrada. Esto sí no tiene vuelta, así que pregunta
   con confirmModal() —sin temporizador— y no con el cartel de deshacer. */
function cevenPapeleraBorrarDef(qn){
  var e = cevenPapeleraEntrada(qn);
  if(!e) return;
  if(!cevenCanEditQuote(e.ejecutivo)){
    showToast('No tenés permiso para eliminar esta cotización.');
    return;
  }
  // Si todavía la referencia el pipeline, borrarla definitivamente la dejaría
  // como fila huérfana para siempre. Hay que quitarla del pipeline primero.
  var enPipe = (typeof cevenQuoteEnPipeline === 'function') && cevenQuoteEnPipeline(qn);
  if(enPipe){ showToast(_cevenBloqueoBorradoMsg(qn, enPipe)); return; }
  confirmModal('Eliminar definitivamente la cotización #' + qn + '. Esto no se puede deshacer.', function(){
    cevenPapeleraSave(cevenPapeleraGet().filter(function(x){ return String(x.qn) !== String(qn); }));
    showToast('Cotización #' + qn + ' eliminada definitivamente.');
    renderPapelera();
  }, { okLabel: 'Eliminar', danger: true });
}

/* Vaciar del todo. Solo saca lo que el usuario PUEDE eliminar: un vendedor no
   tiene por qué poder tirar a la basura las cotizaciones de otro solo porque
   están en la papelera compartida. Si quedó algo afuera se dice, en vez de
   dejar una papelera "vaciada" que sigue con cosas adentro sin explicación. */
function cevenPapeleraVaciar(){
  var p = cevenPapeleraGet();
  if(!p.length) return;
  var puedo = function(e){ return cevenCanEditQuote(e.ejecutivo); };
  // Las que todavía referencia el pipeline no se tiran: quedarían huérfanas.
  var enPipe = function(e){ return (typeof cevenQuoteEnPipeline === 'function') && !!cevenQuoteEnPipeline(e.qn); };
  var mios = p.filter(function(e){ return puedo(e) && !enPipe(e); });
  var trabadas = p.filter(function(e){ return puedo(e) && enPipe(e); }).length;
  if(!mios.length){
    showToast(trabadas
      ? (trabadas + ' cotización(es) siguen en el pipeline: quitalas de ahí antes de vaciar.')
      : 'No hay cotizaciones que puedas eliminar en la papelera.');
    return;
  }
  confirmModal('Eliminar definitivamente ' + mios.length + ' cotización(es) de la papelera. Esto no se puede deshacer.', function(){
    var quitar = {};
    mios.forEach(function(e){ quitar[String(e.qn)] = 1; });
    var resto = p.filter(function(e){ return !quitar[String(e.qn)]; });
    cevenPapeleraSave(resto);
    showToast(resto.length
      ? 'Papelera vaciada. Quedaron ' + resto.length + ' (de otros ejecutivos o todavía en el pipeline).'
      : 'Papelera vaciada.');
    renderPapelera();
  }, { okLabel: 'Eliminar', danger: true });
}

/* ── Vista ─────────────────────────────────────────────────────────────────
   Vive dentro del Historial, como un <details> cerrado: la papelera es el
   lugar al que se va a buscar algo puntual, no algo que haya que ver siempre.
   La llama renderHistory() de cada marca. */
function renderPapelera(){
  var box = document.getElementById('pap-body');
  if(!box) return;
  cevenPapeleraPurgar();

  var p = cevenPapeleraGet().slice().sort(function(a, b){
    return String(b.borrada || '').localeCompare(String(a.borrada || ''));   // lo último borrado, arriba
  });

  var n = document.getElementById('pap-n');
  if(n) n.textContent = p.length
    ? '· ' + p.length + (p.length === 1 ? ' cotización' : ' cotizaciones')
    : '· vacía';

  if(!p.length){
    box.innerHTML = '<div style="font-size:12px;color:#aeaeb2;padding:8px 0">'
      + 'No hay nada eliminado. Lo que borres del historial se guarda acá '
      + CEVEN_PAPELERA_DIAS + ' días.</div>';
    return;
  }

  var h = '<div style="display:flex;justify-content:space-between;align-items:baseline;gap:10px;margin-bottom:8px">'
    + '<span style="font-size:11px;color:#6e6e73">Se eliminan solas a los '
      + CEVEN_PAPELERA_DIAS + ' días de borradas.</span>'
    + '<button class="bo red" data-pap="vaciar" style="font-size:12px;padding:3px 10px">Vaciar papelera</button>'
    + '</div>';

  for(var i = 0; i < p.length; i++){
    var e = p[i];
    var dias = cevenPapeleraDiasRestantes(e);
    // Los últimos días en rojo: es el aviso de que se va a ir sola.
    var colorDias = dias <= 3 ? '#d70015' : '#6e6e73';
    var puede = cevenCanEditQuote(e.ejecutivo);
    var partes = [];
    if(e.cliente)  partes.push(cevenEsc(e.cliente));
    if(e.proyecto) partes.push(cevenEsc(e.proyecto));
    if(e.ejecutivo) partes.push(cevenEsc(e.ejecutivo));

    h += '<div style="display:flex;align-items:center;gap:10px;padding:7px 0;border-top:0.5px solid #f0f0f0;font-size:12.5px">'
      + '<span style="font-weight:600;white-space:nowrap">#' + cevenEsc(e.qn) + '</span>'
      + '<span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#6e6e73">'
        + (partes.join(' · ') || '<i>sin datos</i>')
      + '</span>'
      + '<span style="white-space:nowrap;font-variant-numeric:tabular-nums;color:#6e6e73">USD ' + cevenEsc(fD(e.total || 0)) + '</span>'
      + '<span style="white-space:nowrap;font-size:11px;color:' + colorDias + '">'
        + (dias === 1 ? 'queda 1 día' : 'quedan ' + dias + ' días')
      + '</span>'
      /* Sin permiso los botones no se dibujan en vez de dibujarse apagados: la
         papelera es compartida y ver dos botones muertos en cada fila ajena
         hace ruido. La comprobación de permiso igual se repite del lado de las
         funciones, que es donde tiene que estar. */
      + (puede
        ? '<button class="bs" data-pap="restaurar" data-qn="' + cevenEsc(e.qn) + '" title="Devolver al historial">↩ Restaurar</button>'
          + '<button class="bsr" data-pap="borrar" data-qn="' + cevenEsc(e.qn) + '" title="Eliminar definitivamente">×</button>'
        : '<span style="font-size:11px;color:#aeaeb2;white-space:nowrap">de otro ejecutivo</span>')
      + '</div>';
  }

  box.innerHTML = h;
}

/* Un solo listener sobre el contenedor, que no se reemplaza (lo que se repinta
   es su contenido) — mismo criterio que el resto de las tablas. */
(function(){
  function wire(){
    var box = document.getElementById('pap-body');
    if(!box || box._papBound) return;
    box._papBound = true;
    box.addEventListener('click', function(ev){
      var el = ev.target.closest ? ev.target.closest('[data-pap]') : null;
      if(!el || !box.contains(el)) return;
      var act = el.getAttribute('data-pap');
      if(act === 'vaciar')          cevenPapeleraVaciar();
      else if(act === 'restaurar')  cevenPapeleraRestaurar(el.getAttribute('data-qn'));
      else if(act === 'borrar')     cevenPapeleraBorrarDef(el.getAttribute('data-qn'));
    });
  }

  /* La purga corre en cada arranque y no solo al abrir el Historial: una
     cotización tiene que dejar de existir a los 30 días aunque nadie entre a
     mirar la papelera nunca. */
  function alArrancar(){
    wire();
    try{ cevenPapeleraPurgar(); }catch(e){ console.warn('[papelera] purga', e); }
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', alArrancar);
  else alArrancar();
})();
