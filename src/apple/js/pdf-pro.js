/* ============================================================================
   PDF PRO  ·  Apple
   ----------------------------------------------------------------------------
   Documento A4 VERTICAL y multipagina: una tarjeta por familia, las garantias
   en su propia seccion y un cuadro de total desglosado al final. Convive con
   el boton "PDF" de al lado (js/pdf.js), que es otro documento y no se toca.

   ── POR QUE ESTE RASTERIZA Y EL OTRO NO ────────────────────────────────────
   shared/pdf-core.js cuenta que en 09/2026 los PDF de cotizacion pasaron al
   motor vectorial de shared/comprobante.js (jsPDF + autotable): texto que se
   selecciona y se busca, nitido a cualquier zoom. Este NO usa ese motor: arma
   HTML y lo rasteriza con html2canvas, como hacia el cotizador viejo.

   Es a proposito y tiene un costo conocido: el PDF Pro sale como IMAGEN, el
   texto no se selecciona ni se busca. Se acepta porque el documento es una
   pieza de venta con un diseño propio (tarjetas redondeadas, resumen en
   negativo, chips de color) que autotable no dibuja, y porque es el documento
   que el equipo ya venia usando. Si algun dia hay que elegir uno solo, el que
   se queda es el vectorial.

   ── LO SOLICITADO Y LA ALTERNATIVA ─────────────────────────────────────────
   El cotizador viejo tenia un checkbox por linea ("Cotizacion con
   Alternativas", `_pipeInclude`). Aca eso son las Opciones A/B de
   shared/opciones.js, que es el mismo concepto mejor resuelto y compartido por
   todas las marcas: lo SOLICITADO es la opcion vigente y la ALTERNATIVA es la
   otra. El criterio del documento no cambia — el total cuenta solo lo vigente
   y la alternativa se informa aparte, para comparar — y asi respeta la regla
   de docs/ARQUITECTURA.md: solo la opcion vigente suma.

   ── LAS GARANTIAS NO SUMAN AL TOTAL ────────────────────────────────────────
   Van en su seccion, con su propio subtotal, fuera del "Total de la
   operacion". Es lo mismo que hace el PDF vectorial ("opcionales y separadas
   de la cotizacion principal") y lo que hacia este documento salvo que el
   vendedor tildara una a mano. Son opcionales y los planes de un mismo equipo
   son excluyentes: sumarlos daria un total que el cliente nunca va a pagar.

   Depende de: vendor/html2canvas + vendor/jspdf, shared/safe.js (cevenEsc),
   shared/opciones.js, shared/ui-core.js (dp/getCur/_logo),
   shared/quote-core.js (getSortedItems), shared/pdf-core.js
   (cevenCondicionesDetalle, cevenNombreDocumento, cevenDescargarYAbrir,
   cevenPestanaEnEspera), js/catalog.js (FAMILY_ORDER/getProductFamily),
   js/quote.js (getSortedWarranties), js/quotes-db.js (doSave).
   Se carga DESPUES de js/pdf.js.
   ============================================================================ */

var PDFPRO_CSS = ':root{--bg:#f5f5f7;--card:#ffffff;--ink:#1d1d1f;--ink-soft:#6e6e73;--ink-faint:#aeaeb2;--line:#d2d2d7;--row-alt:#f5f5f7;--green:#1c7c3c;  --green-bg:#e6f4ea;--blue:#0071e3;   --blue-bg:#e8f1fd;--orange:#c84e00; --orange-bg:#fff0e8;--amber-bg:#fffbea; --amber-line:#f5c400; --amber-ink:#5c4a00}*{box-sizing:border-box}html,body{margin:0;padding:0}body{background:var(--bg);color:var(--ink);font-family:-apple-system,BlinkMacSystemFont,"SF Pro Display","Segoe UI",Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased;padding:0 0 60px}.sheet{max-width:980px;margin:0 auto;padding:48px 24px 0}.masthead{display:flex;align-items:flex-end;justify-content:space-between;gap:24px;margin-bottom:36px;padding-bottom:24px;border-bottom:1px solid var(--line);flex-wrap:wrap}.brand-logo{height:34px;width:auto;display:block;margin-bottom:10px}.title{font-size:34px;font-weight:650;letter-spacing:-.02em;margin:6px 0 4px;text-wrap:balance}.subtitle{font-size:16px;color:var(--ink-soft);font-weight:400}.masthead-right{text-align:right;font-size:13px;color:var(--ink-soft);line-height:1.6}.masthead-right strong{color:var(--ink);font-weight:600}.card{background:var(--card);border-radius:20px;padding:28px 32px;margin-bottom:20px;box-shadow:0 1px 2px rgba(0,0,0,.04), 0 8px 24px rgba(0,0,0,.04)}.card-head{display:flex;align-items:baseline;justify-content:space-between;gap:16px;margin-bottom:18px;flex-wrap:wrap}.card-name{font-size:20px;font-weight:650;letter-spacing:-.01em;margin:0}.card-name-sm{font-size:16px}.card-meta{font-size:13px;color:var(--ink-soft);margin:0}.badge{flex-shrink:0;padding:6px 14px;border-radius:100px;font-size:11.5px;font-weight:700;letter-spacing:.03em;white-space:nowrap}.badge-solicitado{background:var(--green-bg);color:var(--green)}.badge-alternativa{background:var(--blue-bg);color:var(--blue)}.badge-gl{background:var(--blue-bg);color:var(--blue)}.badge-cc{background:var(--orange-bg);color:var(--orange)}.tw{overflow-x:auto;border-radius:12px}table{width:100%;border-collapse:collapse;font-size:14px;border-radius:12px;overflow:hidden}thead tr{background:var(--ink)}thead th{color:#fff;font-weight:600;text-align:left;padding:11px 14px;font-size:12.5px;white-space:nowrap}thead th.num{text-align:right}thead th.mid{text-align:center}tbody td{padding:12px 14px;border-bottom:1px solid var(--line);vertical-align:top}tbody td.num{text-align:right;white-space:nowrap}tbody td.mid{text-align:center;white-space:nowrap}tbody tr:nth-child(even){background:var(--row-alt)}tbody tr:last-child td{border-bottom:none}.sku{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;color:var(--ink-soft);white-space:nowrap}.sku::after{content:" · ";font-family:inherit}.desc{line-height:1.4}span.desc{display:inline}.chip{display:inline-block;margin-left:8px;padding:3px 9px;border-radius:100px;font-size:10.5px;font-weight:700;letter-spacing:.03em}.chip-alt{background:var(--blue-bg);color:var(--blue)}.chip-sol{background:var(--green-bg);color:var(--green)}.chip-inc{background:var(--green-bg);color:var(--green)}.summary{background:var(--ink);color:#fff;border-radius:20px;padding:28px 32px;margin-top:28px}.summary .eyebrow{font-size:12px;text-transform:uppercase;letter-spacing:.08em;color:#9a9a9e;font-weight:600;margin-bottom:14px}.sline{display:flex;align-items:baseline;gap:16px;padding:10px 0;border-bottom:1px solid #3a3a3c}.sline .s-desc{flex:1;font-size:13px;color:#c7c7cc;line-height:1.45}.sline .s-desc b{color:#fff;font-weight:650}.sline .s-qty{flex-shrink:0;width:52px;text-align:right;font-size:12.5px;color:#9a9a9e}.sline .s-val{flex-shrink:0;width:110px;text-align:right;font-size:14px;font-weight:600;white-space:nowrap}.sline.s-total{border-bottom:none;border-top:1px solid #6e6e73;margin-top:6px;padding-top:14px}.sline.s-total .s-desc{font-size:16px;font-weight:650;color:#fff}.sline.s-total .s-val{font-size:26px;font-weight:700;letter-spacing:-.02em;width:auto}.s-note{text-align:right;font-size:12px;color:#9a9a9e;margin-top:2px}.s-excl{margin-top:18px;padding-top:16px;border-top:1px solid #3a3a3c;display:flex;flex-direction:column;gap:5px}.s-excl strong{font-size:10.5px;text-transform:uppercase;letter-spacing:.06em;color:#9a9a9e;font-weight:700}.s-excl span{font-size:12px;color:#8e8e93;line-height:1.5}.s-excl b{color:#c7c7cc;font-weight:600}.fn{background:var(--amber-bg);border:1px solid var(--amber-line);border-radius:12px;padding:12px 16px;font-size:12.5px;color:var(--amber-ink);margin-top:16px;line-height:1.55}.fn-suelta{margin-top:14px}.fn strong{display:block;text-transform:uppercase;font-size:10.5px;letter-spacing:.04em;margin-bottom:3px}.conditions{margin-top:24px;padding:22px 32px;background:var(--card);border-radius:20px;font-size:13px;color:var(--ink-soft);line-height:1.9}.conditions strong{color:var(--ink);font-weight:600}.footer{text-align:center;font-size:12px;color:var(--ink-soft);margin-top:28px}.section-label{font-size:12px;text-transform:uppercase;letter-spacing:.08em;color:var(--ink-soft);font-weight:700;margin:32px 0 12px;padding-left:4px}.section-label small{display:block;text-transform:none;letter-spacing:0;font-weight:400;font-size:12.5px;margin-top:4px}.card, .conditions{ box-shadow:none; border:1px solid var(--line); }.section-label{ font-size:10.5px; margin:22px 0 10px; }.section-label small{ font-size:10.5px; margin-top:3px; }.masthead{ margin-bottom:26px; padding-bottom:18px; }.brand-logo{ height:30px; margin-bottom:9px; }.title{ font-size:26px; margin:0 0 3px; }.subtitle{ font-size:13px; }.masthead-right{ font-size:10.5px; line-height:1.55; }.card{ padding:20px 24px; margin-bottom:16px; }.card-head{ margin-bottom:14px; }.card-name{ font-size:16px; }.card-name-sm{ font-size:13px; }.card-meta{ font-size:11px; }.badge{ font-size:9.5px; padding:5px 12px; }.tw{ overflow:visible; }table{ overflow:visible; border-radius:0; }table{ font-size:11px; table-layout:auto; }thead th{ padding:8px 11px; font-size:9.5px; }tbody td{ padding:8px 11px; }tbody td.num, tbody td.mid, thead th.num, thead th.mid{ width:1%; }.sku{ font-size:9.5px; }.chip{ font-size:8.5px; padding:2px 8px; margin-left:8px; }.summary{ padding:22px 26px; margin-top:18px; }.summary .eyebrow{ font-size:10px; margin-bottom:11px; }.sline{ padding:8px 0; gap:14px; }.sline .s-desc{ font-size:11px; }.sline .s-qty{ font-size:10px; width:44px; }.sline .s-val{ font-size:11.5px; width:88px; }.sline.s-total{ margin-top:5px; padding-top:12px; }.sline.s-total .s-desc{ font-size:13px; }.sline.s-total .s-val{ font-size:22px; width:auto; }.s-note{ font-size:10px; }.s-excl{ margin-top:14px; padding-top:12px; gap:4px; }.s-excl strong{ font-size:9px; }.s-excl span{ font-size:10px; line-height:1.5; }.fn{ font-size:10px; padding:11px 14px; margin-top:14px; line-height:1.5; }.fn-suelta{margin-top:14px}.fn strong{ font-size:9px; }.conditions{ padding:18px 24px; margin-top:18px; font-size:10.5px; line-height:1.8; }.footer{ font-size:9.5px; margin-top:20px; }.conditions .cd-ok{color:var(--green);font-weight:600}';

/* Escapado: el del monolito era una copia local; aca esta cevenEsc(). */
function _pdfProEsc(s){ return cevenEsc(s == null ? '' : s); }

/* Una linea es ALTERNATIVA cuando la cotizacion tiene dos opciones y esta no es
   la vigente. Sin Opcion B no hay contraste que marcar y no se sella nada. */
function _pdfProEsAlt(x, ef){
  return cevenOpcHayB() && cevenOpcDe(x) !== ef;
}

function buildPDFPro(){
  if(!items.length && !warrantyItems.length){ showToast('La cotización está vacía.'); return; }
  if(typeof html2canvas === 'undefined'){ showToast('Error: html2canvas no cargó.'); return; }
  var PDF = (window.jspdf && window.jspdf.jsPDF) || window.jsPDF || (window.jspdf && window.jspdf.default);
  if(!PDF){ showToast('Error: jsPDF no cargó.'); return; }

  /* Se guarda antes de exportar, igual que buildPDF(): si el vendedor cierra
     despues de mandar el PDF, lo que mando quedo registrado. */
  doSave(true);

  var ef       = cevenOpcEfectiva();
  var client   = document.getElementById('client').value;
  var exec     = document.getElementById('exec').value;
  var ob       = document.getElementById('obs').value;
  var proyecto = document.getElementById('proyecto').value;
  var effDate  = document.getElementById('eff-date').value || '';
  var qn       = cevenQNumFmt(qNum);

  var sorted = getSortedItems();

  /* --- agrupar por familia, respetando FAMILY_ORDER --- */
  var groups = {}, i, it;
  for(i=0;i<sorted.length;i++){
    var fam = getProductFamily(sorted[i]);
    if(!groups[fam]) groups[fam] = [];
    groups[fam].push(sorted[i]);
  }
  var fams = FAMILY_ORDER.filter(function(f){ return groups[f]; });
  for(var f in groups){ if(FAMILY_ORDER.indexOf(f)<0) fams.push(f); }

  /* --- dentro de cada familia: primero lo solicitado, despues la alternativa.
         Particion estable: no altera el orden relativo dentro de cada mitad. --- */
  for(i=0;i<fams.length;i++){
    var g = groups[fams[i]], pid = [], alt = [], k;
    for(k=0;k<g.length;k++){ (_pdfProEsAlt(g[k], ef) ? alt : pid).push(g[k]); }
    groups[fams[i]] = pid.concat(alt);
  }

  /* --- y lo mismo entre familias: una familia que es solo alternativa (p. ej.
         un MacBook Neo ofrecido como opcion frente al Air solicitado) va al
         final, aunque FAMILY_ORDER la ubique antes. Lo solicitado va primero. --- */
  var famPedidas = [], famOpcion = [];
  for(i=0;i<fams.length;i++){
    var gf = groups[fams[i]], tienePedido = false;
    for(var q=0;q<gf.length;q++){ if(!_pdfProEsAlt(gf[q], ef)){ tienePedido = true; break; } }
    (tienePedido ? famPedidas : famOpcion).push(fams[i]);
  }
  fams = famPedidas.concat(famOpcion);

  /* --- orden final de lectura del documento: sirve de referencia para el
         desglose del total y para el orden de las garantias --- */
  var ordenFinal = [], posProducto = {};
  for(i=0;i<fams.length;i++){
    var gg = groups[fams[i]];
    for(var m=0;m<gg.length;m++){
      var sig = gg[m].sku + '|' + gg[m].description;
      if(posProducto[sig] === undefined) posProducto[sig] = ordenFinal.length;
      ordenFinal.push(gg[m]);
    }
  }

  /* --- totales: solo cuenta lo solicitado (la opcion vigente) --- */
  var totalPedido = 0, totalAlt = 0, pedidos = [], alternativas = [];
  var hayAlternativas = cevenOpcHayB();
  for(i=0;i<ordenFinal.length;i++){
    it = ordenFinal[i];
    var sub = (it.salePrice||0) * (it.qty||0);
    if(_pdfProEsAlt(it, ef)){ totalAlt += sub; alternativas.push(it); }
    else { totalPedido += sub; pedidos.push(it); }
  }

  var html = '';

  /* ---------- masthead ---------- */
  html += '<div class="sheet"><div class="masthead"><div>'
       +  (_logo ? '<img class="brand-logo" src="'+_logo+'" alt="Ceven">' : '')
       +  '<div class="title">Productos recomendados</div>'
       +  (client ? '<div class="subtitle">'+_pdfProEsc(client)+'</div>' : '')
       +  '</div><div class="masthead-right">Cotización <strong>#'+_pdfProEsc(qn)+'</strong>'
       +  (exec ? '<br>Ejecutivo: <strong>'+_pdfProEsc(exec)+'</strong>' : '')
       +  (ob   ? '<br>'+_pdfProEsc(ob) : '')
       +  '</div></div>';

  /* ---------- una tarjeta por familia ---------- */
  for(var fi=0; fi<fams.length; fi++){
    var grp = groups[fams[fi]];

    html += '<div class="card"><div class="card-head"><div>'
         +  '<p class="card-name">'+_pdfProEsc(fams[fi])+'</p>'
         +  '<p class="card-meta">'+grp.length+(grp.length===1?' configuración cotizada':' configuraciones cotizadas')+'</p>'
         +  '</div></div>'
         +  '<div class="tw"><table><thead><tr><th>Descripción</th><th class="mid">Qty</th>'
         +  '<th class="num">P. Venta</th><th class="num">Total</th>'
         +  '<th class="mid">IVA/Imp.Int.</th><th class="mid">Disponib.</th></tr></thead><tbody>';

    for(i=0;i<grp.length;i++){
      it = grp[i];
      var esAlt = _pdfProEsAlt(it, ef);
      html += '<tr><td><span class="sku">'+_pdfProEsc(it.sku)+'</span><span class="desc">'+_pdfProEsc(it.description)+'</span>'
           +  (!hayAlternativas ? ''
                 : esAlt ? '<span class="chip chip-alt">ALTERNATIVA · OPCIÓN '+cevenOpcLetra(cevenOpcDe(it))+'</span>'
                         : '<span class="chip chip-sol">SOLICITADO</span>')
           +  '</td><td class="mid">'+_pdfProEsc(it.qty)+'</td>'
           +  '<td class="num">'+dp(it.salePrice)+'</td>'
           +  '<td class="num"><strong>'+dp(it.salePrice*it.qty)+'</strong></td>'
           +  '<td class="mid">'+_pdfProEsc(it.taxes||'—')+'</td>'
           +  '<td class="mid">'+_pdfProEsc(it.stock||'—')+'</td></tr>';
    }
    html += '</tbody></table></div></div>';
  }

  /* ---------- garantias: una tarjeta por equipo ---------- */
  // getSortedWarranties() ordena segun getSortedItems(); aca se reordena para
  // seguir el orden en que los equipos aparecen realmente en el documento.
  var sortedW = getSortedWarranties().slice();
  sortedW.sort(function(x, y){
    var px = posProducto[x.w._fromProduct]; if(px === undefined) px = 9999;
    var py = posProducto[y.w._fromProduct]; if(py === undefined) py = 9999;
    return px !== py ? px - py : x.origIdx - y.origIdx;
  });
  /* Las garantias de la opcion NO vigente no se imprimen: pertenecen a equipos
     que el documento ya presenta como alternativa, y repetirlas en la seccion
     de garantias (que no distingue opciones) confundiria. */
  sortedW = sortedW.filter(function(x){ return !_pdfProEsAlt(x.w, ef); });

  var totalWarr = 0;
  if(sortedW.length){
    var byEq = {}, eqOrder = [];
    for(i=0;i<sortedW.length;i++){
      var w = sortedW[i].w;
      var eq = w.equipo || '—';
      if(!byEq[eq]){ byEq[eq] = []; eqOrder.push(eq); }
      byEq[eq].push(w);
    }
    html += '<div class="section-label">Garantías extendidas — CevenCare'
         +  '<small>Opcionales. Se cotizan aparte y no están incluidas en el total de la operación.</small></div>';

    var hasCC = false;
    for(var ei=0; ei<eqOrder.length; ei++){
      var lista = byEq[eqOrder[ei]];
      html += '<div class="card"><div class="card-head"><div>'
           +  '<p class="card-name card-name-sm">'+_pdfProEsc(eqOrder[ei])+'</p>'
           +  '</div></div><div class="tw"><table><thead><tr><th>Plan</th>'
           +  '<th class="mid">Cobertura</th><th class="mid">Qty</th>'
           +  '<th class="num">P. Venta</th><th class="num">Total</th>'
           +  '<th class="mid">IVA</th></tr></thead><tbody>';
      for(i=0;i<lista.length;i++){
        var wi = lista[i];
        if(wi.canal === 'CC') hasCC = true;
        var pu = Math.round((wi.precio||0)*100)/100;
        totalWarr += pu * wi.cantidad;
        /* El canal decide la clase CSS del badge: se elige de una lista cerrada
           y NO se interpola el dato, que es lo que hacia el monolito
           (`badge-`+canal.toLowerCase()). */
        var badge = (wi.canal === 'CC') ? 'badge-cc' : 'badge-gl';
        html += '<tr><td><span class="sku">'+_pdfProEsc(wi.sku)+'</span>'
             +  '<span class="desc">'+(wi.canal==='CC'?'Complete Care':'Garantía Limitada Extendida')+'</span>'
             +  '</td>'
             +  '<td class="mid"><span class="badge '+badge+'">'+_pdfProEsc(wi.canal)+'</span> · '
             +  _pdfProEsc(wi['años'])+' '+(wi['años']===1?'año':'años')+'</td>'
             +  '<td class="mid">'+_pdfProEsc(wi.cantidad)+'</td>'
             +  '<td class="num">'+dp(pu)+'</td>'
             +  '<td class="num"><strong>'+dp(pu*wi.cantidad)+'</strong></td>'
             +  '<td class="mid">21%</td></tr>';
      }
      html += '</tbody></table></div></div>';
    }
    // La nota va como bloque aparte, no dentro de la tarjeta del ultimo equipo:
    // aplica a todos los planes CC de la cotizacion, no solo a los de ese equipo.
    if(hasCC){
      html += '<div class="fn fn-suelta"><strong>Nota — Planes CC (Complete Care)</strong>'
           +  'Incluyen cobertura de daños accidentales (1 evento por contrato) con un cargo por servicio a cargo del '
           +  'cliente: pantalla USD 99 (SKU DADIACC) · otros daños USD 249, o USD 149 para MacBook Neo (SKU OTDAACC).</div>';
    }
  }

  /* ---------- cuadro del total, al final y desglosado ---------- */
  html += '<div class="summary"><div class="eyebrow">La operación incluye</div>';
  for(i=0;i<pedidos.length;i++){
    it = pedidos[i];
    html += '<div class="sline"><span class="s-desc">'+_pdfProEsc(it.description)+'</span>'
         +  '<span class="s-qty">'+_pdfProEsc(it.qty)+' u.</span>'
         +  '<span class="s-val">'+dp(it.salePrice*it.qty)+'</span></div>';
  }
  html += '<div class="sline s-total"><span class="s-desc">Total de la operación</span>'
       +  '<span class="s-qty"></span><span class="s-val">'+dp(totalPedido)+'</span></div>'
       +  '<div class="s-note">+ IVA / Imp. Int. según corresponda</div>';

  if(alternativas.length || sortedW.length){
    html += '<div class="s-excl"><strong>No está incluido en este total</strong>';
    if(alternativas.length){
      var nombres = [];
      for(i=0;i<alternativas.length;i++) nombres.push(_pdfProEsc(alternativas[i].description));
      html += '<span>Alternativas cotizadas — '+nombres.join(' · ')+': <b>'+dp(totalAlt)+'</b>. '
           +  'Se cotizan para comparar; no se suman.</span>';
    }
    if(sortedW.length){
      html += '<span>Garantías extendidas CevenCare: <b>'+dp(totalWarr)+'</b> si se toman todas las cotizadas. '
           +  'Son opcionales y los planes de un mismo equipo son excluyentes — se contratan aparte.</span>';
    }
    html += '</div>';
  }
  html += '</div>';

  /* ---------- condiciones + pie ----------
     Las arma shared/pdf-core.js, igual que los otros dos documentos: incluye
     las lineas propias de la marca (`condicionesFijas`, el enrolamiento en
     Apple Business Manager) y resuelve la entrega libre, que leida del <select>
     saldria impresa como "__otra". */
  html += '<div class="conditions"><strong>Condiciones comerciales</strong><br>';
  var conds = cevenCondicionesDetalle(null);
  for(i=0;i<conds.length;i++){
    html += '<span class="'+(conds[i].destacar?'cd-ok':'')+'">'+_pdfProEsc(conds[i].texto)+'</span>'
         +  (i < conds.length-1 ? '<br>' : '');
  }
  html += '</div><div class="footer">Ceven S.A. · Argentina &amp; Uruguay</div></div>';

  downloadQuotePDFPro(html, cevenNombreDocumento(client, proyecto, effDate));
}

/* ----------------------------------------------------------------------------
   Rasteriza y pagina en A4 vertical.
   El documento puede ser mas alto que una pagina, asi que se corta — pero solo
   en los limites de los bloques de primer nivel (.card, .summary, .conditions)
   para que nunca se parta una tarjeta ni una tabla por la mitad.
   ---------------------------------------------------------------------------- */
function downloadQuotePDFPro(bodyHtml, fileName){
  if(typeof html2canvas === 'undefined'){ showToast('Error: html2canvas no cargó.'); return; }
  var PDF = (window.jspdf && window.jspdf.jsPDF) || window.jsPDF || (window.jspdf && window.jspdf.default);
  if(!PDF){ showToast('Error: jsPDF no cargó.'); return; }

  var MARGIN_MM = 14;
  var PX_PER_MM = 96/25.4;
  var CONTENT_W = Math.round((210 - 2*MARGIN_MM) * PX_PER_MM);   // ~688px
  var PAGE_H    = Math.round((297 - 2*MARGIN_MM) * PX_PER_MM);   // ~1016px

  /* html2canvas es asincrono: para cuando termina, el gesto del click ya se
     consumio y el navegador bloquea el window.open. Por eso la pestaña se abre
     ACA, todavia dentro del gesto, con un cartel de "generando" — ver
     cevenPestanaEnEspera() en shared/pdf-core.js. El PDF vectorial no la
     necesita porque se dibuja de forma sincronica. */
  var pestana = (typeof cevenPestanaEnEspera === 'function') ? cevenPestanaEnEspera(fileName) : null;

  // El documento se arma dentro de un iframe: montado en la pagina, el CSS
  // global de la app pisa los estilos del PDF (encabezados negros, anchos de
  // tabla). El iframe garantiza que solo apliquen los estilos de aca.
  var frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden','true');
  frame.style.cssText = 'position:absolute;left:-10000px;top:0;width:'+CONTENT_W+'px;height:100px;border:0;visibility:hidden';
  document.body.appendChild(frame);

  var fdoc = frame.contentDocument;
  fdoc.open();
  fdoc.write('<!doctype html><html><head><meta charset="utf-8"><style>'
    + PDFPRO_CSS
    + 'html,body{margin:0;padding:0;background:#fff}.sheet{max-width:none;padding:0}'
    + '</style></head><body>' + bodyHtml + '</body></html>');
  fdoc.close();

  showToast('⏳ Generando PDF Pro…');

  function limpiar(){ try{ frame.remove(); }catch(e){} }
  function fallar(err){
    limpiar();
    try{ if(pestana) pestana.close(); }catch(e){}
    showErrorPopup('No se pudo generar el PDF Pro: ' + (err && err.message ? err.message : err));
  }

  // Esperar a que el logo (data URI) este decodificado antes de rasterizar
  var imgs = Array.prototype.slice.call(fdoc.images);
  var espera = imgs.map(function(im){
    if(im.complete) return Promise.resolve();
    return new Promise(function(res){ im.onload = im.onerror = res; });
  });

  Promise.all(espera).then(function(){
    var sheet = fdoc.querySelector('.sheet') || fdoc.body;
    var totalH = Math.ceil(sheet.getBoundingClientRect().height);
    frame.style.height = (totalH + 40) + 'px';

    // Cortes validos: solo el borde inferior de cada bloque de primer nivel,
    // para no partir nunca una tarjeta ni una tabla por la mitad.
    var top = sheet.getBoundingClientRect().top;
    var stops = [], kids = sheet.children, k;
    for(k=0;k<kids.length;k++) stops.push(Math.ceil(kids[k].getBoundingClientRect().bottom - top));
    if(!stops.length || stops[stops.length-1] < totalH) stops.push(totalH);

    var cuts = [], ini = 0, prev = 0;
    for(k=0;k<stops.length;k++){
      if(stops[k] - ini > PAGE_H){
        if(prev > ini){ cuts.push(prev); ini = prev; }
        // un bloque mas alto que la hoja no tiene corte limpio posible
        while(stops[k] - ini > PAGE_H){ ini += PAGE_H; cuts.push(ini); }
      }
      prev = stops[k];
    }
    cuts.push(totalH);

    return html2canvas(fdoc.body, {scale:2, useCORS:true, backgroundColor:'#ffffff', logging:false})
      .then(function(canvas){ return {canvas:canvas, cuts:cuts}; });
  }).then(function(r){
    limpiar();
    var canvas = r.canvas, cuts = r.cuts;
    var SC  = canvas.width / CONTENT_W;
    var pdf = new PDF({unit:'mm', format:'a4', orientation:'portrait'});
    var desde = 0, p;
    for(p=0; p<cuts.length; p++){
      var hasta = cuts[p], hCss = hasta - desde;
      if(hCss <= 0) continue;
      var slice = document.createElement('canvas');
      slice.width  = canvas.width;
      slice.height = Math.round(hCss * SC);
      var ctx = slice.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, slice.width, slice.height);
      ctx.drawImage(canvas, 0, Math.round(desde*SC), canvas.width, slice.height,
                            0, 0,                    canvas.width, slice.height);
      if(p > 0) pdf.addPage();
      pdf.addImage(slice.toDataURL('image/jpeg', 0.95), 'JPEG',
                   MARGIN_MM, MARGIN_MM, 210 - 2*MARGIN_MM, hCss / PX_PER_MM);
      desde = hasta;
    }
    /* Se descarga Y se abre, igual que los otros dos documentos (el monolito
       solo hacia pdf.save()). El nombre ya viene armado por
       cevenNombreDocumento(): "<cliente> - <proyecto> - Ceven - <validez>". */
    cevenDescargarYAbrir(pdf.output('blob'), fileName + '.pdf', pestana);
    showToast('✓ PDF Pro descargado');
  }).catch(fallar);
}
