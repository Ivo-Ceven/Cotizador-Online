/* ============================================================
   HISTORIAL  ·  Cotizador multimarca
   ------------------------------------------------------------
   Los pedidos guardados. Igual que el de las marcas, con dos
   datos propios en la tarjeta:

   · las MARCAS que lleva el pedido, con su subtotal — que es lo
     que va a terminar en el pipeline de cada una;
   · a que numero se EMITIO en cada marca, si ya se emitio.
     Sin eso, el unico modo de saber si un pedido ya bajo a las
     marcas seria ir a buscarlo al pipeline de cada una.

   Eliminar NO tira las filas: pasan a la papelera del equipo y
   se pueden restaurar (shared/papelera.js).

   Depende de: js/quotes-db.js, js/marcas.js, shared/papelera.js.
   ============================================================ */

function updateHistBtns(){
  var cnt = Object.keys(histSel).length;
  var del = document.getElementById('hist-del-btn');
  if(del) del.style.display = cnt > 0 ? 'inline-block' : 'none';
  var pdf = document.getElementById('hist-pdf-btn');
  if(pdf) pdf.style.display = cnt > 0 ? 'inline-block' : 'none';
}

function toggleHistSel(qn, cb){
  if(cb.checked) histSel[qn] = true; else delete histSel[qn];
  updateHistBtns();
}

/* La papelera se escribe ANTES de tocar `cquotes`, y si falla no se borra nada
   — el porqué está en el encabezado de shared/papelera.js. */
function deleteSelected(){
  var keys = Object.keys(histSel);
  if(!keys.length) return;
  var db = getDB(), removed = [], newDb = [], porQn = {};
  for(var i=0;i<db.length;i++){
    var qn = db[i]['N° Cotización'];
    if(histSel[qn]){ removed.push(db[i]); (porQn[qn] = porQn[qn] || []).push(db[i]); }
    else newDb.push(db[i]);
  }
  if(!removed.length) return;
  var grupos = Object.keys(porQn).map(function(qn){ return {qn: qn, filas: porQn[qn]}; });
  if(!cevenPapeleraTirarVarias(grupos)) return;

  saveDB(newDb);
  histSel = {};
  updateHistBtns();
  renderHistory();
  notifyUndo('Eliminaste ' + keys.length + ' pedido(s) — están en la papelera.', function(){
    saveDB(getDB().concat(removed));
    cevenPapeleraSacar(Object.keys(porQn));
    renderHistory();
  });
}

function deleteQ(qn){
  var db = getDB();
  var first = null;
  for(var f=0;f<db.length;f++){ if(db[f]['N° Cotización'] === qn){ first = db[f]; break; } }
  if(first && !cevenCanEditQuote(first['Ejecutivo'])){
    showToast('No tenés permiso para eliminar este pedido.');
    return;
  }
  var removed = [], newDb = [];
  for(var i=0;i<db.length;i++){
    if(db[i]['N° Cotización'] === qn) removed.push(db[i]); else newDb.push(db[i]);
  }
  if(!removed.length) return;
  if(!cevenPapeleraTirar(qn, removed)) return;

  saveDB(newDb);
  delete histSel[qn];
  updateHistBtns();
  renderHistory();
  notifyUndo('Eliminaste el pedido ' + CEVEN_BRAND.qNumPrefijo + qn + ' — está en la papelera.', function(){
    saveDB(getDB().concat(removed));
    cevenPapeleraSacar([qn]);
    renderHistory();
  });
}

function clearHF(){
  ['hclient','hexec'].forEach(function(id){ var e = document.getElementById(id); if(e) e.value = ''; });
  renderHistory();
}

/* Las marcas de un pedido con su subtotal, para la tarjeta. Solo cuenta la
   opción VIGENTE: es la única que se va a emitir, y sumar las dos mostraría un
   total que nunca se va a facturar. */
function _marcasDeFilas(rows, opcEf){
  var acc = {};
  rows.forEach(function(r){
    if(cevenOpcDe(r) !== opcEf) return;
    var b = r['Marca'] || '';
    if(!b) return;
    acc[b] = (acc[b] || 0) + (parseFloat(r['Total']) || 0);
  });
  return cevenMultiMarcasIds().filter(function(b){ return acc[b] !== undefined; })
    .map(function(b){ return {brand: b, total: acc[b]}; });
}

function renderHistory(){
  var db = getDB(), wrap = document.getElementById('histwrap');
  if(!wrap) return;
  // Va ANTES del corte por historial vacío: la papelera puede tener cosas
  // justamente cuando el historial no tiene ninguna.
  if(typeof renderPapelera === 'function') renderPapelera();

  var execSel = document.getElementById('hexec');
  if(execSel){
    var cur = execSel.value, seen = {}, lista = [];
    db.forEach(function(r){
      var e = (r['Ejecutivo'] || '').trim();
      if(e && e !== '—' && !seen[e]){ seen[e] = 1; lista.push(e); }
    });
    lista.sort();
    execSel.innerHTML = '<option value="">Todos</option>' + lista.map(function(e){
      return '<option value="'+cevenEsc(e)+'"'+(e===cur?' selected':'')+'>'+cevenEsc(e)+'</option>';
    }).join('');
  }

  if(!db.length){
    wrap.innerHTML = '<div style="text-align:center;padding:36px;color:var(--ct3)">'
      + '<div style="font-size:26px;margin-bottom:6px">📭</div><p>No hay pedidos guardados.</p></div>';
    return;
  }

  var fc = (document.getElementById('hclient').value || '').toLowerCase();
  var fe = document.getElementById('hexec').value;

  var grouped = {};
  for(var i=0;i<db.length;i++){
    var k = db[i]['N° Cotización'] || '—';
    (grouped[k] = grouped[k] || []).push(db[i]);
  }
  /* Object.keys() devuelve primero las claves con forma de índice entero, así
     que a partir del pedido 1000 los nuevos saltaban al principio. Se ordena
     explícitamente por número, descendente. */
  var keys = Object.keys(grouped).sort(function(a,b){
    var na = parseInt(a,10), nb = parseInt(b,10);
    var va = isNaN(na), vb = isNaN(nb);
    if(va && vb) return String(b).localeCompare(String(a));
    if(va) return 1;
    if(vb) return -1;
    return nb - na;
  });

  var html = '';
  for(var ki=0;ki<keys.length;ki++){
    var qn = keys[ki], rows = grouped[qn], first = rows[0];
    var heno = ((first['Cliente']||'') + ' ' + (first['Proyecto']||'')).toLowerCase();
    if(fc && heno.indexOf(fc) === -1) continue;
    if(fe && first['Ejecutivo'] !== fe) continue;

    rows = rows.filter(function(r){
      return r['SKU'] && r['SKU'] !== 'undefined' && r['Descripción'] && r['Descripción'] !== 'undefined';
    });
    if(!rows.length) continue;

    var opcEf = cevenOpcEfectivaDeFilas(rows);
    var hayOpcB = cevenOpcHayBEnFilas(rows);
    var gt = 0;
    rows.forEach(function(r){ if(cevenOpcDe(r) === opcEf) gt += parseFloat(r['Total']) || 0; });

    var marcas = _marcasDeFilas(rows, opcEf);
    var emit = _emitidasDeFilas(rows);

    // Con dos opciones, primero las de la vigente: es lo que se cotizó de verdad.
    if(hayOpcB){
      rows = rows.slice().sort(function(a,b){
        return (cevenOpcDe(a) === opcEf ? 0 : 1) - (cevenOpcDe(b) === opcEf ? 0 : 1);
      });
    }

    var qnA = cevenEsc(qn);
    var trows = '', opcPintada = null, marcaPintada = null;
    for(var ri=0;ri<rows.length;ri++){
      var r = rows[ri];
      if(hayOpcB && cevenOpcDe(r) !== opcPintada){
        opcPintada = cevenOpcDe(r); marcaPintada = null;
        trows += '<tr><td colspan="6" style="background:var(--c3);font-size:10px;font-weight:700;'
          + 'text-transform:uppercase;letter-spacing:.6px;color:var(--ct1);padding:5px 10px">'
          + 'Opción ' + cevenOpcLetra(opcPintada)
          + (opcPintada === opcEf ? ' · vigente' : ' · alternativa (no se emite)') + '</td></tr>';
      }
      if(r['Marca'] !== marcaPintada){
        marcaPintada = r['Marca'];
        trows += '<tr><td colspan="6" style="padding:4px 10px;background:var(--c0)">'
          + '<span class="mk mk-'+cevenEsc(marcaPintada)+'">'+cevenEsc(cevenMultiMarcaLabel(marcaPintada))+'</span></td></tr>';
      }
      trows += '<tr><td>'+cevenEsc(r['SKU'])+'</td><td class="wrap">'+cevenEsc(r['Descripción'])+'</td>'
        + '<td style="text-align:center">'+cevenEsc(r['Cantidad'])+'</td>'
        + '<td style="text-align:center">'+cevenEsc(cevenFormatoIVA(r['IVA'])||'—')+'</td>'
        + '<td style="text-align:right">USD '+fI(parseFloat(r['P. Venta Unitario'])||0)+'</td>'
        + '<td style="text-align:right;font-weight:500">USD '+fI(parseFloat(r['Total'])||0)+'</td></tr>';
    }

    var chipsMarca = marcas.map(function(m){
      var ya = emit[m.brand];
      return '<span class="mk mk-'+cevenEsc(m.brand)+'">'+cevenEsc(cevenMultiMarcaLabel(m.brand))+'</span>'
        + '<span class="sub" style="margin-right:10px"> USD '+fI(m.total)
        + (ya ? (' · #'+cevenEsc(ya)) : ' · sin emitir') + '</span>';
    }).join('');

    var mia = (typeof cevenOwnsExecutive === 'function' && cevenOwnsExecutive(first['Ejecutivo'])) ? ' hist-mia' : '';
    html += '<div class="hist-card'+mia+'" style="background:var(--c1);border-radius:12px;border:0.5px solid var(--cb);margin-bottom:13px;overflow:hidden">'
      + '<div class="hist-card-hdr" style="display:flex;align-items:center;gap:10px;padding:11px 14px;background:var(--c0);flex-wrap:wrap">'
        + '<input type="checkbox"'+(histSel[qn]?' checked':'')+' data-act="sel" data-qn="'+qnA+'" style="width:auto">'
        + '<div style="font-size:15px;font-weight:600;flex:1">Pedido '+cevenEsc(CEVEN_BRAND.qNumPrefijo + qn)
          + (hayOpcB ? ' <span class="opc-chip" style="font-size:10px">2 opciones · vigente '+cevenOpcLetra(opcEf)+'</span>' : '')
        + '</div>'
        + '<div style="font-size:11px;color:var(--ct2)">'+cevenEsc(first['Fecha']||'')+' '+cevenEsc(first['Hora']||'')+'</div>'
        + '<button class="bs" data-act="pdf" data-qn="'+qnA+'" title="Descargar este pedido en PDF">📄 PDF</button>'
        + (cevenCanEditQuote(first['Ejecutivo']) ? '<button class="bs" data-act="edit" data-qn="'+qnA+'" title="Abrir para editar y re-emitir">✎ Abrir</button>' : '')
        + (cevenCanEditQuote(first['Ejecutivo']) ? '<button class="bsr" data-act="del" data-qn="'+qnA+'">✕</button>' : '')
      + '</div>'
      + '<div class="hist-card-info" style="display:flex;gap:16px;flex-wrap:wrap;padding:9px 14px;border-bottom:0.5px solid var(--cb);font-size:13px">'
        + '<div><span class="lbl">Cliente</span><strong>'+cevenEsc(first['Cliente']||'—')+'</strong></div>'
        + '<div><span class="lbl">Proyecto</span>'+cevenEsc(first['Proyecto']||'—')+'</div>'
        + '<div><span class="lbl">Ejecutivo</span>'+cevenEsc(first['Ejecutivo']||'—')+'</div>'
        + '<div style="margin-left:auto;text-align:right"><span class="lbl">Total'+(hayOpcB?' · Opción '+cevenOpcLetra(opcEf):'')+'</span><strong style="font-size:15px">USD '+fI(gt)+'</strong></div>'
      + '</div>'
      + '<div style="padding:8px 14px;border-bottom:0.5px solid var(--cb);font-size:12px">'+chipsMarca+'</div>'
      + '<div style="overflow-x:auto"><table style="min-width:560px">'
        + '<thead><tr><th>SKU</th><th>Descripción</th><th style="text-align:center">Qty</th><th style="text-align:center">IVA</th><th style="text-align:right">P. Venta Unit.</th><th style="text-align:right">Total</th></tr></thead>'
        + '<tbody>'+trows+'</tbody></table></div>'
      + '</div>';
  }

  wrap.innerHTML = html || '<div style="text-align:center;padding:24px;color:var(--ct3)"><p>Sin resultados con los filtros actuales.</p></div>';
  _histBindDelegation();
}

function _histBindDelegation(){
  cevenDelegate('histwrap', 'click', function(ev){
    var el = cevenActEl(ev, this);
    if(!el) return;
    var act = el.getAttribute('data-act'), qn = el.getAttribute('data-qn');
    if(act === 'edit') editarPedido(qn);
    else if(act === 'pdf') exportPedidoPDF(qn);
    else if(act === 'del') deleteQ(qn);
  });
  cevenDelegate('histwrap', 'change', function(ev){
    var el = cevenActEl(ev, this);
    if(!el) return;
    if(el.getAttribute('data-act') === 'sel') toggleHistSel(el.getAttribute('data-qn'), el);
  });
}
