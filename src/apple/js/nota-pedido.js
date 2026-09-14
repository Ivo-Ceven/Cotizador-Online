/* ============================================================================
   IMPORTAR NOTA DE PEDIDO / ORDEN DE VENTA (PDF)  ·  Apple
   ----------------------------------------------------------------------------
   Toma un PDF de nota de pedido y arma la cotizacion con cuatro datos: la razon
   social del cliente y, por linea, SKU + cantidad + precio unitario de venta.
   Todo lo demas (ejecutivo, mes de cierre, estado, condiciones) lo completa el
   vendedor a mano: no esta en el comprobante.

   ── EL PRECIO MANDA, EL MARGEN SE DEDUCE ───────────────────────────────────
   Es la diferencia con cualquier otra alta de productos. En el catalogo se
   elige un margen y de ahi sale el precio; aca el precio ya viene cerrado en el
   pedido y lo que se calcula es el margen que quedo contra el costo del price
   list (calcMargenFromPrice). Por eso la linea entra con `manualMargin:true`:
   si no, el primer recalculo de margen global le pisaria el precio pactado.

   Un SKU que no este en el price list NO se importa. Sin costo no hay margen, y
   una linea con margen 0 se cuela al pipeline y al Target como si fuera real.
   Se avisa cuales quedaron afuera para cargarlos y reimportar.

   ── POR QUE NO SE LEE EL TEXTO DEL PDF DE CORRIDO ──────────────────────────
   El stream de pdf.js devuelve los fragmentos en el orden en que se dibujaron,
   que no es el orden de lectura: las celdas de la tabla vienen desordenadas y
   una descripcion larga llega partida. _textoPorFilas() los reagrupa por
   coordenada Y (con 3 px de tolerancia, porque una misma fila no siempre cae
   en el mismo pixel) y los ordena por X.

   ── DE DONDE SALE pdf.js ───────────────────────────────────────────────────
   De vendor/, no de un CDN: la CSP de vercel.json es `script-src 'self'` y un
   <script> de cdnjs queda bloqueado SIN error visible. El worker
   (vendor/pdf.worker.min.js) lo pide pdf.js solo cuando hay que parsear, no al
   cargar la pagina, y `worker-src 'self'` lo permite.

   Depende de: vendor/pdf.min.js, shared/safe.js (cevenEsc), shared/notify.js,
   shared/opciones.js, shared/ui-core.js (goTo), js/catalog.js
   (_sumarProductoAItems / isCotizacionFOB), js/quote.js (calcMargenFromPrice /
   renderQ), js/pricing.js (getNac / getIVA).
   Se carga DESPUES de js/catalog.js y js/quote.js.
   ============================================================================ */

/* pdf.js necesita saber donde esta su worker. Se apunta al archivo local apenas
   carga el modulo: si se dejara para el momento del import, el primer intento
   fallaria con un error de worker que no dice nada util. */
(function(){
  if(typeof pdfjsLib !== 'undefined' && pdfjsLib.GlobalWorkerOptions){
    pdfjsLib.GlobalWorkerOptions.workerSrc = '../vendor/pdf.worker.min.js';
  }
})();

/* En el PDF los SKU vienen con guion donde el price list tiene barra
   (MGEC4LE-A → MGEC4LE/A). Se prueba tal cual primero, por si algun SKU no
   lleva barra. */
function normalizarSkuPedido(sku){
  var s = String(sku||'').trim().toUpperCase();
  var variantes = [s];
  var i = s.lastIndexOf('-');
  if(i > 0) variantes.push(s.slice(0,i) + '/' + s.slice(i+1));
  return variantes;
}

function buscarEnCatalogo(sku){
  var variantes = normalizarSkuPedido(sku);
  for(var v=0; v<variantes.length; v++){
    for(var i=0;i<products.length;i++){
      if(String(products[i].sku||'').trim().toUpperCase() === variantes[v]) return products[i];
    }
  }
  return null;
}

/* "4.871,00" → 4871.00 (punto de miles, coma decimal). */
function _numPedido(t){
  return parseFloat(String(t).replace(/\./g,'').replace(',','.')) || 0;
}

/* Reconstruye el texto en orden de lectura agrupando por coordenada Y. */
function _textoPorFilas(items){
  var filas = {};
  items.forEach(function(it){
    if(!it.str || !it.str.trim()) return;
    var y = Math.round(it.transform[5]);
    var clave = null;
    for(var k in filas){ if(Math.abs(parseInt(k) - y) <= 3){ clave = k; break; } }
    if(clave === null){ clave = String(y); filas[clave] = []; }
    filas[clave].push({x: it.transform[4], s: it.str});
  });
  return Object.keys(filas)
    .sort(function(a,b){ return parseInt(b) - parseInt(a); })   // de arriba hacia abajo
    .map(function(k){
      return filas[k].sort(function(a,b){ return a.x - b.x; })
                     .map(function(o){ return o.s; }).join(' ')
                     .replace(/\s+/g,' ').trim();
    });
}

function parsearNotaDePedido(texto){
  var res = { cliente:'', lineas:[], avisos:[] };

  /* Cliente: el PDF trae DOS "Razon Social" — la primera es la de Ceven, el
     emisor. Solo sirve la que dice explicitamente "Cliente". */
  var mCli = texto.match(/Raz[oó]n\s+Social\s+Cliente\s*:\s*([^\n]+)/i);
  if(mCli){
    /* La fila puede traer pegada la celda de la columna de al lado
       ("Moneda: US Dollar"). Se corta en la primera etiqueta siguiente. */
    var crudo = mCli[1];
    // Primero las etiquetas conocidas, que pueden ser de varias palabras.
    ['Domicilio:','CUIT:','Moneda:','Tel.:','Email:','IIBB:','Condicion','Medio de Pago:',
     'Terminos','Transporte:','Orden de Compra:','Fecha'].forEach(function(et){
      var i = crudo.indexOf(et);
      if(i > 0) crudo = crudo.slice(0, i);
    });
    // Y despues, por si aparece una etiqueta nueva, en el primer "palabra:" suelto.
    res.cliente = crudo
      .split(/\s+(?=[A-Za-zÁÉÍÓÚáéíóúÑñ.]+\s*:)/)[0]
      .replace(/\s{2,}/g,' ')
      .trim();
  }

  // Cada linea de producto arranca con: cantidad + SKU
  var reInicio = /(?:^|\n)\s*(\d{1,5})\s+([A-Z0-9]{4,}(?:[-\/][A-Z0-9]+)*)\s+/g;
  var marcas = [], m;
  while((m = reInicio.exec(texto)) !== null){
    marcas.push({ qty: parseInt(m[1]), sku: m[2], desde: m.index + m[0].length });
  }

  marcas.forEach(function(mk, i){
    var hasta = (i+1 < marcas.length) ? marcas[i+1].desde : texto.length;
    var bloque = texto.slice(mk.desde, hasta);
    /* Dentro del bloque, el par "US <unitario> US <total>". Se elige el par que
       verifica unitario × cantidad = total: asi no se confunde con subtotales,
       impuestos ni el total del comprobante. */
    var reImp = /US\$?\s*([\d.,]+)\s+US\$?\s*([\d.,]+)/g, mi, unit = null;
    while((mi = reImp.exec(bloque)) !== null){
      var u = _numPedido(mi[1]), t = _numPedido(mi[2]);
      if(u > 0 && t > 0 && Math.abs(u * mk.qty - t) <= Math.max(1, t * 0.01)){ unit = u; break; }
    }
    if(unit === null){ res.avisos.push('No se pudo leer el precio de ' + mk.sku + '.'); return; }
    res.lineas.push({ sku: mk.sku, qty: mk.qty, precio: unit });
  });

  return res;
}

/* Texto del PDF, ya en orden de lectura. Separado del import para poder
   probarlo sin un File ni un FileReader (ver scripts/check-nota-pedido.js). */
function _textoDeNotaPedido(buffer){
  return pdfjsLib.getDocument({data: new Uint8Array(buffer)}).promise.then(function(pdf){
    var paginas = [];
    for(var p=1; p<=pdf.numPages; p++){
      paginas.push(pdf.getPage(p).then(function(pg){ return pg.getTextContent(); }));
    }
    return Promise.all(paginas);
  }).then(function(contenidos){
    return contenidos.map(function(c){ return _textoPorFilas(c.items).join('\n'); }).join('\n');
  });
}

/* Arma las lineas de cotizacion a partir de lo parseado. Devuelve las que se
   pudieron armar y las que no, para poder avisar con detalle. */
function _lineasDeNotaPedido(datos){
  var agregadas = [], sinCatalogo = [];
  var fob = isCotizacionFOB();
  var mg  = (typeof getM === 'function') ? getM() : 0;
  datos.lineas.forEach(function(ln){
    var prod = buscarEnCatalogo(ln.sku);
    if(!prod){ sinCatalogo.push(ln); return; }
    /* La linea se arma con el MISMO camino que el catalogo y la flotante
       (_sumarProductoAItems): asi el nac, el IVA, el id y la opcion salen de un
       solo lugar y un SKU no puede entrar distinto segun por donde se cargo.
       Despues se pisan las dos cosas que el pedido si define. */
    var it = _sumarProductoAItems(prod, {mg: mg, fob: fob});
    it.qty = ln.qty;
    it.salePrice = ln.precio;
    it.itemMargin = calcMargenFromPrice(it.sellingBase, it.itemNac, ln.precio);
    // El precio viene cerrado en el pedido: un recalculo de margen global no lo toca.
    it.manualMargin = true;
    agregadas.push(it);
  });
  return { agregadas: agregadas, sinCatalogo: sinCatalogo };
}

function importarNotaPedidoPDF(file){
  if(!file) return;
  if(typeof pdfjsLib === 'undefined'){
    showErrorPopup('No cargó el lector de PDF (vendor/pdf.min.js). Recargá la página.');
    return;
  }
  if(!products || !products.length){
    showErrorPopup('Primero cargá la lista de precios: los SKU del PDF se buscan ahí para traer la descripción y el costo.');
    return;
  }

  var fr = new FileReader();
  fr.onerror = function(){ showErrorPopup('No se pudo leer el archivo.'); };
  fr.onload = function(e){
    _textoDeNotaPedido(e.target.result).then(function(texto){
      var datos = parsearNotaDePedido(texto);
      if(!datos.lineas.length){
        showErrorPopup('No se encontraron líneas de producto en el PDF. Se esperaba el formato de Nota de Pedido: '
          + 'cantidad, SKU y precio unitario por fila.');
        return;
      }

      /* Se importa sobre la opcion que se esta editando y se conserva la otra.
         El cotizador viejo reemplazaba `items` entero; aca eso borraria la
         Opcion B sin decirlo. */
      var opc = cevenOpcActiva();
      var previos = items.slice();
      var otraOpcion = items.filter(function(it){ return cevenOpcDe(it) !== opc; });
      var clienteAntes = document.getElementById('client').value;

      items = otraOpcion;
      var r = _lineasDeNotaPedido(datos);   // empuja sobre `items`

      if(!r.agregadas.length){
        items = previos;
        showErrorPopup('Ninguno de los ' + datos.lineas.length + ' SKU del PDF está en la lista de precios: '
          + r.sinCatalogo.map(function(l){ return l.sku; }).join(', ')
          + '. Cargá esos productos al catálogo y volvé a importar.');
        return;
      }

      if(datos.cliente) document.getElementById('client').value = datos.cliente;
      _qSortKey = null; _qSortDir = 1;
      renderQ();
      if(typeof renderWarranties === 'function') renderWarranties();
      goTo('quote');

      /* Se aplica y se ofrece deshacer, en vez de preguntar antes: es la regla
         de la app para lo destructivo (ver shared/notify.js). */
      var msg = '✓ ' + r.agregadas.length + ' línea(s) importada(s) en la Opción ' + cevenOpcLetra(opc)
              + (datos.cliente ? ' · Canal: ' + datos.cliente : '');
      notifyUndo(msg, function(){
        items = previos;
        document.getElementById('client').value = clienteAntes;
        renderQ();
        if(typeof renderWarranties === 'function') renderWarranties();
      });

      /* Lo que quedo afuera va en un cartel aparte y DESPUES del de exito: es
         una importacion parcial, y el vendedor tiene que poder ver que falta
         sin que se lo tape el toast. */
      if(r.sinCatalogo.length || datos.avisos.length){
        var det = [];
        if(r.sinCatalogo.length){
          det.push('Estos SKU no están en la lista de precios y NO se agregaron (sin costo no se puede calcular el margen): '
            + r.sinCatalogo.map(function(l){ return l.sku + ' (' + l.qty + ' u. a US ' + l.precio + ')'; }).join(', ') + '.');
        }
        if(datos.avisos.length) det.push(datos.avisos.join(' '));
        showErrorPopup('Importación parcial. ' + det.join(' '));
      }
    }).catch(function(err){
      showErrorPopup('No se pudo leer el PDF: ' + (err && err.message ? err.message : err));
    });
  };
  fr.readAsArrayBuffer(file);
}
