/* ============================================================
   EXCEL DEL PIPELINE PARA LA MARCA  ·  compartido
   ------------------------------------------------------------
   Lo que baja el "⬇ Excel" del pipeline (23/10/2026). Ese archivo
   se le manda a la marca (a HP el de Poly/HP, a Apple el de Apple…),
   así que lleva SOLO lo que le sirve a ella y con formato:

     · Hoja "Pipeline": una fila por oportunidad — Canal, Cliente
       final, Oportunidad (OPG/REGI, en las marcas que lo usan),
       Cierre estimado, Estado y Monto USD — con título, totales,
       filtros y encabezado fijo.
     · Hoja "Productos": las líneas de cada oportunidad (SKU,
       descripción, cantidad, precio y total), solo de la opción
       vigente y solo productos (las garantías CevenCare son de
       Ceven, no de la marca).

   Queda AFUERA todo lo interno: link de Netsuite, N° de cotización,
   observaciones, ejecutivo, margen, estados por ítem y fecha de alta.

   El buildPipelineWorkbook() de cada marca NO se tocó: es el Excel
   interno que guarda el backup a carpeta (shared/backup-folder.js),
   y ahí sí sirve todo.

   Usa ExcelJS (vendor/exceljs.min.js) y no el SheetJS de siempre: la
   edición gratuita de SheetJS no escribe estilos. Se carga recién al
   exportar, una vez por sesión: son ~950 KB que no hace falta bajar
   para cotizar. Está en el precache del service worker, así que
   también anda sin conexión.

   Exporta lo que está EN PANTALLA (cevenPipeFilasVisibles), igual
   que el Excel anterior: los filtros y el mes archivado se respetan.

   Depende de: pipeline-ui.js (cevenPipeFilasVisibles),
   pipeline-status.js (cevenEstadoLabel), opciones.js
   (cevenOpcFilasDeCotiz), notify.js (showToast/showError) y, en
   tiempo de ejecución, getDB() de la marca.
   ============================================================ */

var _cevenExcelJSPromise = null;

// Carga vendor/exceljs.min.js una sola vez. La ruta es relativa a la página
// (todo cotizador cuelga un nivel abajo de la raíz).
function _cevenCargarExcelJS(){
  if(window.ExcelJS) return Promise.resolve(window.ExcelJS);
  if(_cevenExcelJSPromise) return _cevenExcelJSPromise;
  _cevenExcelJSPromise = new Promise(function(resolve, reject){
    var s = document.createElement('script');
    s.src = '../vendor/exceljs.min.js';
    s.onload = function(){ window.ExcelJS ? resolve(window.ExcelJS) : reject(new Error('ExcelJS no quedó cargado')); };
    s.onerror = function(){ _cevenExcelJSPromise = null; reject(new Error('No se pudo cargar el generador de Excel')); };
    document.head.appendChild(s);
  });
  return _cevenExcelJSPromise;
}

// 'YYYY-MM' -> Date del día 1 (UTC), para que Excel lo ordene y filtre como fecha.
function _cevenMesComoFecha(mk){
  var p = String(mk || '').split('-');
  if(p.length !== 2) return null;
  var y = parseInt(p[0], 10), m = parseInt(p[1], 10);
  if(!y || !m || m < 1 || m > 12) return null;
  return new Date(Date.UTC(y, m - 1, 1));
}

function _cevenNum(v){
  var n = (typeof v === 'number') ? v : parseFloat(v);
  return isNaN(n) ? 0 : n;
}

/* Las columnas de cada hoja, según la marca. `opg` solo existe en las marcas
   que lo declaran en pipeCols (Poly, Huawei, HP). */
function _cevenExcelColumnas(){
  var b = window.CEVEN_BRAND || {};
  var conOpg = (b.pipeCols || []).indexOf('opg') !== -1;
  var base = [
    { key: 'canal',    header: 'Canal',          width: 26 },
    { key: 'cliente',  header: 'Cliente final',  width: 32 }
  ];
  if(conOpg) base.push({ key: 'opg', header: 'Oportunidad', width: 20 });
  base.push({ key: 'cierre', header: 'Cierre estimado', width: 15, fecha: true });
  base.push({ key: 'estado', header: 'Estado',          width: 15 });
  return {
    pipeline: base.concat([{ key: 'monto', header: 'Monto USD', width: 15, plata: true }]),
    productos: base.concat([
      { key: 'sku',      header: 'SKU',                 width: 20 },
      { key: 'desc',     header: 'Descripción',         width: 46, wrap: true },
      { key: 'qty',      header: 'Cantidad',            width: 10, entero: true },
      { key: 'unit',     header: 'Precio unit. USD',    width: 15, plata: true },
      { key: 'total',    header: 'Total USD',           width: 15, plata: true }
    ])
  };
}

/* Los datos, sin formato: lo separa de ExcelJS para poder probarlo en Node. */
function cevenPipelineExcelDatos(filas, db){
  var oportunidades = [], productos = [];
  (filas || []).forEach(function(r){
    var comun = {
      canal:   r.cliente || '',
      cliente: r.proyecto || '',
      opg:     (r.opg && r.opg !== '—') ? r.opg : '',
      cierre:  _cevenMesComoFecha(r.mesCierre),
      estado:  (typeof cevenEstadoLabel === 'function') ? cevenEstadoLabel(r.estado || 'Cotizado') : (r.estado || 'Cotizado')
    };
    oportunidades.push(Object.assign({ monto: _cevenNum(r.monto) }, comun));
    if(!r.qNum || !db) return;
    cevenOpcFilasDeCotiz(db, r.qNum, ['producto']).forEach(function(l){
      var qty = _cevenNum(l['Cantidad']), unit = _cevenNum(l['P. Venta Unitario']);
      productos.push(Object.assign({
        sku: l['SKU'] || '', desc: l['Descripción'] || '',
        qty: qty, unit: unit, total: Math.round(qty * unit * 100) / 100
      }, comun));
    });
  });
  return { oportunidades: oportunidades, productos: productos };
}

// Una hoja con título, encabezado de la marca, filas cebradas, total y filtros.
function _cevenExcelHoja(wb, nombre, titulo, cols, filas, colTotal){
  var b = window.CEVEN_BRAND || {};
  var acento = String((b.theme && b.theme.accent) || '#1d1d1f').replace('#', '').toUpperCase();
  var suave  = String((b.theme && b.theme.soft)   || '#f5f5f7').replace('#', '').toUpperCase();
  var ws = wb.addWorksheet(nombre, { views: [{ state: 'frozen', ySplit: 3 }] });
  ws.columns = cols.map(function(c){ return { key: c.key, width: c.width }; });
  var nCols = cols.length;

  // Fila 1: título. Fila 2: subtítulo. Fila 3: encabezado.
  ws.mergeCells(1, 1, 1, nCols);
  var t = ws.getCell(1, 1);
  t.value = titulo;
  t.font = { bold: true, size: 15, color: { argb: 'FF' + acento } };
  ws.getRow(1).height = 24;

  ws.mergeCells(2, 1, 2, nCols);
  var hoy = new Date();
  ws.getCell(2, 1).value = 'Ceven · generado el ' + hoy.toLocaleDateString('es-AR')
    + ' · ' + filas.length + (filas.length === 1 ? ' fila' : ' filas');
  ws.getCell(2, 1).font = { size: 10, color: { argb: 'FF6E6E73' } };

  var head = ws.getRow(3);
  cols.forEach(function(c, i){
    var cell = head.getCell(i + 1);
    cell.value = c.header;
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + acento } };
    cell.alignment = { vertical: 'middle', horizontal: (c.plata || c.entero) ? 'right' : 'left' };
  });
  head.height = 20;

  filas.forEach(function(f, n){
    // Por clave de columna (ws.columns) y no como array: ExcelJS reconoce un
    // array con `instanceof`, que falla si el array viene de otro contexto.
    var valores = {};
    cols.forEach(function(c){ valores[c.key] = f[c.key] === undefined ? '' : f[c.key]; });
    var row = ws.addRow(valores);
    cols.forEach(function(c, i){
      var cell = row.getCell(i + 1);
      if(c.plata)  cell.numFmt = '#,##0.00';
      if(c.entero) cell.numFmt = '#,##0';
      if(c.fecha)  cell.numFmt = 'mmm yyyy';
      if(c.wrap)   cell.alignment = { wrapText: true, vertical: 'top' };
      if(n % 2 === 1) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + suave } };
      cell.border = { bottom: { style: 'hair', color: { argb: 'FFD2D2D7' } } };
    });
  });

  // Total con fórmula (sigue valiendo si la marca borra o filtra filas a mano).
  if(filas.length && colTotal){
    var iTot = cols.map(function(c){ return c.key; }).indexOf(colTotal) + 1;
    var desde = 4, hasta = 3 + filas.length;
    var tot = ws.addRow([]);
    tot.getCell(1).value = 'Total';
    var letra = ws.getColumn(iTot).letter;
    var suma = 0;
    filas.forEach(function(f){ suma += _cevenNum(f[colTotal]); });
    tot.getCell(iTot).value = { formula: 'SUBTOTAL(9,' + letra + desde + ':' + letra + hasta + ')', result: suma };
    tot.getCell(iTot).numFmt = '#,##0.00';
    for(var i = 1; i <= nCols; i++){
      var c = tot.getCell(i);
      c.font = { bold: true };
      c.border = { top: { style: 'thin', color: { argb: 'FF' + acento } } };
    }
  }

  ws.autoFilter = { from: { row: 3, column: 1 }, to: { row: 3 + filas.length, column: nCols } };
  ws.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 };
  return ws;
}

function cevenExportarPipelineMarca(){
  var filas = (typeof cevenPipeFilasVisibles === 'function') ? cevenPipeFilasVisibles() : [];
  if(!filas.length){ showToast('No hay oportunidades para exportar con los filtros actuales.'); return; }
  var b = window.CEVEN_BRAND || {};
  var marca = b.label || 'Pipeline';
  var db = (typeof getDB === 'function') ? getDB() : [];
  var datos = cevenPipelineExcelDatos(filas, db);
  var cols = _cevenExcelColumnas();

  _cevenCargarExcelJS().then(function(ExcelJS){
    var wb = new ExcelJS.Workbook();
    wb.creator = 'Ceven';
    wb.created = new Date();
    _cevenExcelHoja(wb, 'Pipeline', 'Pipeline ' + marca + ' · Ceven', cols.pipeline, datos.oportunidades, 'monto');
    if(datos.productos.length){
      _cevenExcelHoja(wb, 'Productos', 'Pipeline ' + marca + ' · detalle por producto', cols.productos, datos.productos, 'total');
    }
    return wb.xlsx.writeBuffer();
  }).then(function(buf){
    var hoy = new Date();
    var f = hoy.getFullYear() + '-' + String(hoy.getMonth() + 1).padStart(2, '0') + '-' + String(hoy.getDate()).padStart(2, '0');
    var blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'Ceven_' + String(marca).replace(/\s+/g, '_') + '_Pipeline_' + f + '.xlsx';
    document.body.appendChild(a);
    a.click();
    setTimeout(function(){ URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }).catch(function(e){
    showError('No se pudo armar el Excel: ' + ((e && e.message) || 'error desconocido'));
  });
}
