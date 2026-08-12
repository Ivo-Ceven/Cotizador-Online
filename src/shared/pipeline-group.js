/* ============================================================
   PIPELINE · AGRUPACION POR CLIENTE  ·  compartido
   ------------------------------------------------------------
   La tabla del pipeline pasa de plana a Cliente -> Proyecto ->
   Articulos. Aca vive lo que NO depende de la marca: agrupar,
   normalizar el nombre del cliente, acumular los totales del
   grupo y el registro de nodos que reemplaza al direccionamiento
   por indice.

   El render de la fila NO esta aca y no deberia estar: Poly tiene
   9 columnas planas y Apple 14, con unidades por familia, margen
   ponderado, filas virtuales por override de SKU y facturacion
   parcial. Eso no es la misma tabla con otras columnas.

   Depende de: brand.js (pipeColCount), safe.js (cevenEsc),
   clientes.js (cevenNormClient).
   Se carga DESPUES de clientes.js y ANTES de <marca>/js/pipeline-view.js.
   ============================================================ */

/* ---- Registro de nodos ------------------------------------------------------
   Antes los handlers referenciaban la fila por INDICE dentro de un array
   temporal (`window._pipeRows` + `data-i`). Con la tabla agrupada ese indice
   deja de identificar nada: hay filas de grupo intercaladas y el orden cambia.

   Pasar el id por un data-* tampoco sirve: lo convierte en string, y
   updatePipelineStatus() y compania comparan con === contra el id original
   (numerico, sincronizado desde Supabase). Un `data-id="123"` romperia todo en
   silencio.

   La solucion es que por el DOM viaje una CLAVE opaca y el registro devuelva el
   OBJETO original, con su id intacto. */
window._pipeNodes = window._pipeNodes || {};

function cevenPipeNodeReset(){ window._pipeNodes = {}; }

function cevenPipeNodeAdd(key, node){
  window._pipeNodes[key] = node;
  return key;
}

function cevenPipeNodeAt(key){
  if(key === null || key === undefined) return null;
  return window._pipeNodes[key] || null;
}

/* Clave de nodo: '<scope>|<kind>~<parte>'.

   scope : ''           el pipeline activo
           'a:2026-07'  un mes archivado
   kind  : 'c' grupo de cliente  ·  'r' fila (proyecto/cotizacion)

   El scope mantiene separada la expansion del archivo de la del pipeline
   —que es lo que ya hacia la clave compuesta 'arch__<mes>__<id>'— y la `parte`
   de un grupo es su INDICE en la pasada, nunca el nombre del cliente: ese viene
   de la base y puede traer cualquier caracter, incluido el delimitador. */
function cevenPipeKey(scope, kind, parte){
  return (scope || '') + '|' + kind + '~' + parte;
}

/* Abre/cierra un nodo. window._pipeExpanded es un mapa plano {clave: true} que
   ya aceptaba claves string. Se borra en vez de guardar `false` para que no
   acumule entradas muertas a lo largo de la sesion.

   No se persiste a localStorage a proposito: se sincronizaria al equipo entero
   y todos verian abrirse las filas de otro. */
function togglePipeNode(key){
  window._pipeExpanded = window._pipeExpanded || {};
  if(window._pipeExpanded[key]) delete window._pipeExpanded[key];
  else window._pipeExpanded[key] = true;
  renderPipeline();
}

function cevenPipeAbierto(key){
  return !!(window._pipeExpanded && window._pipeExpanded[key]);
}

/* ---- Clientes ---------------------------------------------------------------
   La forma canonica de un nombre de cliente —cevenNormClient()— vive en
   `shared/clientes.js`, que es el modulo del cliente: el pipeline AGRUPA por
   cliente, no lo define. Estuvo aca hasta el 12/08/2026 y la dependencia iba al
   reves (clientes.js dependia del pipeline), lo que dejaba a cualquier pagina
   sin pipeline —el multimarca— llamando a una funcion que no existia. Ver el
   comentario en clientes.js.

   Se agrupa por esa clave y se MUESTRA la grafia mas frecuente, que es la que el
   usuario escribio mas veces y por lo tanto la que reconoce.

   Agrupa filas ya FILTRADAS por cliente.

   El orden es filtrar -> agrupar (no al reves): asi los totales del encabezado
   siempre coinciden con las filas que se ven abajo, que es la falla clasica de
   las tablas agrupadas.

   Devuelve [{clave, label, rows, monto, n}], donde `clave` es la normalizada y
   `label` la grafia mas frecuente. */
function cevenPipeGroupBy(rows, opts){
  opts = opts || {};
  var campoMonto = opts.monto || 'monto';
  var mapa = {}, orden = [];

  for(var i = 0; i < rows.length; i++){
    var r = rows[i];
    var crudo = String(r.cliente == null ? '' : r.cliente).trim();
    var k = cevenNormClient(crudo);
    // Las filas sin cliente van juntas en su propio grupo en vez de perderse.
    if(!k || k === '—'){ k = '(sin cliente)'; crudo = 'Sin cliente'; }

    if(!mapa[k]){
      mapa[k] = { clave: k, label: crudo, rows: [], monto: 0, n: 0, _grafias: {} };
      orden.push(k);
    }
    var g = mapa[k];
    g.rows.push(r);
    g.n++;
    g.monto += (Number(r[campoMonto]) || 0);
    g._grafias[crudo] = (g._grafias[crudo] || 0) + 1;
  }

  return orden.map(function(k){
    var g = mapa[k];
    // La grafia mas usada gana; con empate, la primera que aparecio.
    var mejor = g.label, max = 0;
    for(var graf in g._grafias){
      if(g._grafias[graf] > max){ max = g._grafias[graf]; mejor = graf; }
    }
    g.label = mejor;
    delete g._grafias;
    return g;
  });
}

/* Las filas del ultimo render, en el orden en que se ven: recorre los grupos del
   registro y concatena sus filas.

   Lo usa el export a Excel, que antes bajaba `getPipeline()` ENTERO ignorando
   los filtros activos y la vista de mes archivado. Incluye las filas de los
   grupos colapsados a proposito: lo plegado sigue siendo parte de lo filtrado,
   y exportar solo lo desplegado sorprenderia.

   Si todavia no se renderizo nada (exportar sin haber entrado al pipeline), cae
   al pipeline entero — que es lo que hacia siempre. */
function cevenPipeFilasVisibles(){
  var nodos = window._pipeNodes || {};
  var out = [];
  Object.keys(nodos).forEach(function(k){
    var n = nodos[k];
    if(n && n.kind === 'c' && n.grupo && n.grupo.rows) out = out.concat(n.grupo.rows);
  });
  return out.length ? out : getPipeline();
}

/* Ordena los GRUPOS con el mismo criterio con el que se ordenan las filas
   adentro, agregado: monto suma, fechaISO el mas reciente, mesCierre el que
   cierra antes, estado el mas avanzado del embudo, cliente el nombre. */
function cevenPipeSortGroups(grupos, col, dir){
  var mult = (dir === 'asc') ? 1 : -1;

  function agg(g){
    if(col === 'cliente')  return null;                 // se compara por label
    if(col === 'monto')    return g.monto;
    var vals = g.rows.map(function(r){ return r[col]; })
                     .filter(function(v){ return v !== undefined && v !== null && v !== ''; });
    if(!vals.length) return null;
    if(col === 'estado'){
      return Math.max.apply(null, vals.map(function(v){ return cevenEstadoRank(v); }));
    }
    if(col === 'mesCierre'){                            // el que cierra antes
      return vals.sort()[0];
    }
    return vals.sort()[vals.length - 1];                // fechaISO y demas: el mayor
  }

  return grupos.slice().sort(function(a, b){
    if(col === 'cliente') return mult * a.label.localeCompare(b.label);
    var av = agg(a), bv = agg(b);
    // Los grupos sin dato van SIEMPRE al final, ordene como ordene: si no,
    // invertir el orden los sube arriba de todo y tapan lo que se busca.
    if(av === null && bv === null) return 0;
    if(av === null) return 1;
    if(bv === null) return -1;
    var cmp = (typeof av === 'number' && typeof bv === 'number')
      ? (av - bv)
      : String(av).localeCompare(String(bv));
    return mult * cmp;
  });
}

/* El <tr> de encabezado de un grupo. Lo unico que varia por marca es el
   colspan, que sale de brand.pipeColCount. */
function cevenPipeGroupRow(g, key, abierto){
  var cols = (window.CEVEN_BRAND && window.CEVEN_BRAND.pipeColCount) || 9;
  var proy = g.n + (g.n === 1 ? ' proyecto' : ' proyectos');

  // Distribucion por estado, para leer de un vistazo en que anda el cliente.
  var porEstado = {};
  g.rows.forEach(function(r){
    var e = r.estado || 'Cotizado';
    porEstado[e] = (porEstado[e] || 0) + 1;
  });
  var chips = '';
  cevenEstadoValores().forEach(function(e){
    if(!porEstado[e]) return;
    var c = cevenEstadoPill(e);
    chips += '<span class="' + cevenSpillClass(e) + '" style="background:' + c.bg + ';color:' + c.fg
      + ';border-radius:980px;padding:1px 8px;font-size:10px;font-weight:600;margin-left:5px;white-space:nowrap">'
      + cevenEsc(cevenEstadoLabel(e)) + ' ' + porEstado[e] + '</span>';
  });

  return '<tr class="pipe-grp" data-act="expcli" data-k="' + cevenEsc(key) + '" style="cursor:pointer">'
    + '<td colspan="' + cols + '" style="padding:9px 12px;background:#f0f0f3;border-top:0.5px solid #d2d2d7">'
      + '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">'
        + '<span style="font-size:11px;width:12px;display:inline-block">' + (abierto ? '▼' : '▶') + '</span>'
        + '<strong style="font-size:13px">' + cevenEsc(g.label) + '</strong>'
        + '<span style="font-size:11px;color:#6e6e73">' + proy + '</span>'
        + '<span style="flex:1"></span>'
        + chips
        + '<strong style="font-size:13px;white-space:nowrap">USD ' + fI(g.monto) + '</strong>'
      + '</div>'
    + '</td></tr>';
}
