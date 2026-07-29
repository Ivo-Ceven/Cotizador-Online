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
