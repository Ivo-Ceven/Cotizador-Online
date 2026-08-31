/* ============================================================
   PRIMITIVAS SEGURAS  ·  compartidas por todas las marcas
   ------------------------------------------------------------
   Dos cosas que el codigo hacia mal en todos lados:

   1) localStorage.setItem envuelto en try{}catch(e){} vacio. Cuando
      se llenaba la cuota, el guardado fallaba en silencio y la app
      igual mostraba "guardado". cevenLsSet() devuelve booleano y
      avisa al usuario; el llamador TIENE que respetar el resultado.

   2) Datos de la base concatenados crudos en innerHTML. Como el
      pipeline y el price list se sincronizan entre todo el equipo,
      un cliente llamado <img src=x onerror=...> se ejecutaba en el
      navegador de todos. cevenEsc() escapa antes de interpolar.
   ============================================================ */

/* Escapa texto para interpolar en HTML (nodo o atributo).
   Usar SIEMPRE con cualquier valor que venga de la base, de un
   Excel importado o de un input del usuario. */
window.cevenEsc = function(s){
  if(s === null || s === undefined) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
};

/* Convierte las denominaciones históricas de IVA a una alícuota visible. */
window.cevenFormatoIVA = function(v){
  var s = String(v == null ? '' : v).trim();
  if(!s) return '';
  if(/reducid/i.test(s)) return '10,5%';
  if(/general/i.test(s)) return '21%';
  return s
    .replace(/(\d+)[\.,](\d+)\s*%/g, '$1,$2%')
    .replace(/(\d+)\s*%/g, '$1%');
};

/* Escribe en localStorage. Devuelve true si se guardo, false si no.
   NUNCA falla en silencio: ante cuota llena avisa al usuario. */
window.cevenLsSet = function(key, value){
  try{
    localStorage.setItem(key, value);
    return true;
  }catch(err){
    var lleno = err && (err.name === 'QuotaExceededError' ||
                        err.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
                        err.code === 22 || err.code === 1014);
    console.error('[storage] no se pudo guardar "' + key + '"', err);
    var msg = lleno
      ? '⚠ No se pudo guardar: el almacenamiento del navegador esta lleno.\n\n' +
        'Exporta un backup y borra cotizaciones viejas antes de seguir trabajando.'
      : '⚠ No se pudo guardar "' + key + '". Revisa la consola.';
    // showToast puede no existir todavia segun el orden de carga
    if(typeof showToast === 'function') showToast(msg);
    else alert(msg);
    return false;
  }
};

/* Parsea un importe tipeado por el usuario, tolerando formato es-AR y en-US.

   El bug que motivo esto: el input se renderizaba con el numero crudo de JS
   ("1041.67") pero el parser borraba TODOS los puntos asumiendo separador de
   miles, asi que reeditar un precio lo multiplicaba por 100. Las dos marcas
   tenian la misma linea.

   Regla: el ultimo separador (. o ,) es DECIMAL solo si le siguen 1 o 2
   digitos; en cualquier otro caso es separador de miles.
     "1041.67"    -> 1041.67      "1.041,67"  -> 1041.67
     "1,041"      -> 1041         "1.250.000" -> 1250000
     "USD 1.234,56" -> 1234.56    "-24,5"     -> -24.5
   Devuelve NaN si no hay ningun digito. */
window.cevenParseMoney = function(v){
  if(typeof v === 'number') return isFinite(v) ? v : NaN;
  if(v === null || v === undefined) return NaN;
  var s = String(v).trim();
  if(!s) return NaN;
  var neg = s.charAt(0) === '-';
  s = s.replace(/[^0-9.,]/g, '');            // fuera "USD", "$", espacios, NBSP
  if(!/[0-9]/.test(s)) return NaN;
  var lastDot = s.lastIndexOf('.');
  var lastCom = s.lastIndexOf(',');
  var sep = lastDot > lastCom ? lastDot : lastCom;
  var intPart = s, decPart = '';
  if(sep !== -1){
    var tail = s.slice(sep + 1);
    if(tail.length === 1 || tail.length === 2){ intPart = s.slice(0, sep); decPart = tail; }
  }
  intPart = intPart.replace(/[.,]/g, '');
  var n = parseFloat((intPart || '0') + (decPart ? '.' + decPart : ''));
  if(isNaN(n)) return NaN;
  return neg ? -n : n;
};

/* Lee y parsea JSON de localStorage sin romper la app si esta corrupto. */
window.cevenLsJSON = function(key, fallback){
  var raw = null;
  try{ raw = localStorage.getItem(key); }catch(e){}
  if(raw === null || raw === undefined) return fallback;
  try{ return JSON.parse(raw); }
  catch(err){
    console.error('[storage] JSON invalido en "' + key + '" — se usa el valor por defecto', err);
    return fallback;
  }
};
