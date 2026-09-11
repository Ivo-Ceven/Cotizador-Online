#!/usr/bin/env node
/* ============================================================================
   check-sync-colecciones.js · Cotizadores Ceven
   ----------------------------------------------------------------------------
   Banco de pruebas de shared/sync.js: el merge entre lo local y lo del equipo.

   POR QUE EXISTE
   --------------
   sync.js es la pieza de la que depende que no se pierdan datos, y no tenia
   NINGUN test: check-pipe-roundtrip.js solo prueba pickPipe/coerce, no la
   logica de merge. Eso alcanzaba mientras el archivo no se tocara.

   Se escribio para poder mover las cotizaciones del blob `cquotes` a una tabla
   fila por fila sin romper nada: las secciones 1 a 7 capturaron el
   comportamiento del pipeline ANTES del refactor y tienen que seguir dando
   exactamente lo mismo despues.

   Las secciones 8 a 11 son el problema que motivo todo el trabajo. Mientras el
   historial viajaba como un blob unico en app_settings, dos personas guardando
   con pocos segundos de diferencia se pisaban: la cotizacion de una
   desaparecia del servidor Y del navegador donde se habia creado, sin pasar por
   la papelera y sin un solo error. La seccion 8 lo reproducia; hoy verifica que
   ya no pasa.

   COMO FUNCIONA
   -------------
   Corre el sync.js REAL (no una copia) dentro de un `vm`, contra:
     · un localStorage simulado por navegador, con Storage.prototype de verdad
       —sync.js intercepta sobre el prototipo, no sobre la instancia—,
     · un Supabase de mentira en memoria (tablas `pipeline`, `cotizaciones` y
       `app_settings`) que entiende los upserts con Prefer: merge-duplicates,
       los DELETE con id=in.(...) y el unique (brand,qnum) que arbitra el
       numero, igual que PostgREST,
     · relojes manuales: los timers no corren solos, los dispara `avanzar()`,
     · eventos reales (`online`), porque es ahi donde sync.js resetea el backoff
       y drena la cola: es el camino de recuperacion que de verdad usa la app.

   Varios "navegadores" comparten el mismo servidor, que es como se reproducen
   las pisadas entre usuarios sin necesidad de dos maquinas.

   Uso:  node scripts/check-sync-colecciones.js
   Sale con codigo 1 si algo falla, para poder usarlo en un hook o en CI.
   ========================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const SYNC_SRC  = fs.readFileSync(path.join(ROOT, 'src/shared/sync.js'), 'utf8');
// quotes-store.js se carga ANTES que sync.js, igual que en los index.html: es
// el adaptador entre el array plano de `cquotes` y la fila por cotizacion.
const STORE_SRC = fs.readFileSync(path.join(ROOT, 'src/shared/quotes-store.js'), 'utf8');

let fallos = 0, corridas = 0;
function ok(cond, nombre, detalle){
  corridas++;
  if(cond){ console.log('  ✓ ' + nombre); return; }
  fallos++;
  console.error('  ✗ ' + nombre + (detalle ? ('\n      ' + detalle) : ''));
}

/* ============================================================================
   EL SERVIDOR DE MENTIRA
   ----------------------------------------------------------------------------
   Solo lo que sync.js usa de PostgREST. Cuenta los requests para poder afirmar
   cosas como "el seed no subio dos veces".
   ========================================================================== */
function nuevoServidor(){
  return {
    pipeline: [],        // {brand, id, ...}
    cotizaciones: [],    // {brand, id, qnum, lineas, ...}  PK (brand,id) + unique (brand,qnum)
    app_settings: [],    // {brand, key, value}
    reqs: { GET: 0, POST: 0, DELETE: 0 },
    caido: false,        // cuando esta en true todo request falla (red cortada)

    filas(tabla, brand){
      return this[tabla].filter(r => r.brand === brand);
    },
    cotiz(brand){
      return this.filas('cotizaciones', brand);
    },
    numerosDe(brand){
      return this.cotiz(brand).map(c => Number(c.qnum)).sort((a, b) => a - b);
    },
    setting(brand, key){
      const r = this.app_settings.find(x => x.brand === brand && x.key === key);
      return r ? r.value : null;
    },
    // Escribe una fila como si fuera otro usuario: no pasa por ningun navegador.
    ponerSetting(brand, key, value){
      const r = this.app_settings.find(x => x.brand === brand && x.key === key);
      if(r) r.value = value;
      else this.app_settings.push({ brand, key, value });
    },
    ponerPipe(brand, fila){
      const r = this.pipeline.find(x => x.brand === brand && String(x.id) === String(fila.id));
      if(r) Object.assign(r, fila, { brand });
      else this.pipeline.push(Object.assign({ brand }, fila));
    },

    /* El fetch que ven los navegadores. Devuelve una respuesta con la forma
       minima que sfetch() consume: {ok, status, json(), text()}. */
    fetch(url, opts){
      opts = opts || {};
      const metodo = (opts.method || 'GET').toUpperCase();
      this.reqs[metodo] = (this.reqs[metodo] || 0) + 1;
      if(this.caido) return Promise.reject(new Error('sin red'));

      const sinBase = String(url).replace(/^https?:\/\/[^/]+\/rest\/v1\//, '');
      const [ruta, qs] = sinBase.split('?');
      const q = new URLSearchParams(qs || '');
      const brand = (q.get('brand') || '').replace(/^eq\./, '');
      const tabla = ruta;

      const resp = (status, data) => Promise.resolve({
        ok: status >= 200 && status < 300,
        status,
        json: () => Promise.resolve(data),
        text: () => Promise.resolve(JSON.stringify(data))
      });

      if(!this[tabla]) return resp(404, { message: 'no existe ' + tabla });

      if(metodo === 'GET'){
        // Copia profunda: el cliente no puede mutar el servidor por referencia.
        return resp(200, JSON.parse(JSON.stringify(this.filas(tabla, brand))));
      }

      if(metodo === 'POST'){
        let filas;
        try{ filas = JSON.parse(opts.body); }catch(e){ return resp(400, { message: 'body ilegible' }); }
        if(!Array.isArray(filas)) filas = [filas];
        // PGRST102: un upsert en lote exige que todas las filas tengan las
        // mismas claves. sync.js depende de esto (por eso pickPipe emite
        // siempre el mismo set de columnas), asi que el simulador lo valida.
        if(filas.length > 1){
          const forma = Object.keys(filas[0]).sort().join(',');
          for(const f of filas){
            if(Object.keys(f).sort().join(',') !== forma){
              return resp(400, { code: 'PGRST102', message: 'All object keys must match' });
            }
          }
        }
        /* El unique (brand, qnum) de `cotizaciones`. Es el arbitro del numero:
           el upsert resuelve los choques de PK (brand,id) solo, asi que un
           23505 significa que OTRA cotizacion ya se quedo con ese numero.
           Se valida todo el lote antes de escribir nada: PostgREST aplica el
           POST en una transaccion. */
        if(tabla === 'cotizaciones'){
          for(const f of filas){
            const choca = this.cotizaciones.find(x =>
              x.brand === f.brand &&
              Number(x.qnum) === Number(f.qnum) &&
              String(x.id) !== String(f.id));
            if(choca){
              return resp(409, {
                code: '23505',
                message: 'duplicate key value violates unique constraint ' +
                  '"cotizaciones_qnum_unico" Key (brand, qnum)=(' + f.brand + ', ' + Number(f.qnum) + ') already exists.'
              });
            }
          }
        }
        for(const f of filas){
          if(tabla === 'app_settings'){ this.ponerSetting(f.brand, f.key, f.value); continue; }
          // La columna qnum es bigint: Postgres devuelve 2, no '0002'. Guardarlo
          // como numero es lo que ejercita el padCols del cliente en la vuelta.
          const fila = Object.assign({}, f);
          if(tabla === 'cotizaciones' && fila.qnum !== undefined && fila.qnum !== null){
            fila.qnum = Number(fila.qnum);
          }
          const prev = this[tabla].find(x => x.brand === fila.brand && String(x.id) === String(fila.id));
          if(prev) Object.assign(prev, fila);
          else this[tabla].push(fila);
        }
        return resp(201, null);
      }

      if(metodo === 'DELETE'){
        const inClause = q.get('id') || '';
        const m = /^in\.\((.*)\)$/.exec(inClause);
        if(!m) return resp(400, { message: 'DELETE sin id=in.()' });
        const ids = m[1].split(',').filter(Boolean).map(decodeURIComponent);
        this[tabla] = this[tabla].filter(
          r => !(r.brand === brand && ids.indexOf(String(r.id)) >= 0)
        );
        return resp(204, null);
      }

      return resp(405, { message: metodo });
    }
  };
}

/* ============================================================================
   UN NAVEGADOR
   ----------------------------------------------------------------------------
   Su localStorage, su reloj y una copia del sync.js real corriendo encima.
   `store` se puede compartir entre instancias para simular un F5 (mismo disco,
   modulo recargado de cero).
   ========================================================================== */
function nuevoNavegador(servidor, opts){
  opts = opts || {};
  const brand = opts.brand || 'apple';
  const prefix = opts.prefix !== undefined ? opts.prefix : '';
  const store = opts.store || {};

  /* Storage con prototipo de verdad: sync.js hace
       SP = window.Storage.prototype;  SP.setItem = function(k,v){...}
     y adentro compara `this !== window.localStorage`. Con un objeto literal el
     intercept no se instalaria y el test no probaria nada. */
  function Storage(){}
  Storage.prototype.getItem = function(k){ return (k in store) ? store[k] : null; };
  Storage.prototype.setItem = function(k, v){ store[k] = String(v); };
  Storage.prototype.removeItem = function(k){ delete store[k]; };
  const localStorage = new Storage();

  // Reloj manual: nada corre solo, todo lo dispara avanzar().
  let ahora = 0, seqTimer = 0;
  const timers = [];   // {id, at, fn, intervalo}

  const ctx = {
    console: {
      log(){}, warn(){}, error(){},                 // silencio salvo que se pida
      _real: console
    },
    JSON, Promise, Object, Array, String, Number, Boolean, Math, Date,
    URLSearchParams, Error, isNaN, parseInt, parseFloat, encodeURIComponent,
    decodeURIComponent,

    Storage,
    localStorage,
    sessionStorage: { getItem: () => null, setItem(){}, removeItem(){} },

    setTimeout(fn, ms){ const id = ++seqTimer; timers.push({ id, at: ahora + (ms || 0), fn }); return id; },
    clearTimeout(id){ const i = timers.findIndex(t => t.id === id); if(i >= 0) timers.splice(i, 1); },
    setInterval(fn, ms){ const id = ++seqTimer; timers.push({ id, at: ahora + (ms || 0), fn, intervalo: ms || 1 }); return id; },
    clearInterval(id){ const i = timers.findIndex(t => t.id === id); if(i >= 0) timers.splice(i, 1); },

    fetch: (url, o) => servidor.fetch(url, o),

    document: {
      readyState: 'complete',
      getElementById: () => null,
      addEventListener(){},
      visibilityState: 'visible'
    },
    CustomEvent: function(nombre, init){ this.type = nombre; this.detail = init && init.detail; },

    // Sesion siempre valida: el foco del test es el merge, no la auth.
    cevenIsValidSession: () => true,
    cevenGetSession: () => ({ access_token: 'token-de-prueba' })
  };

  ctx.window = ctx;
  ctx.globalThis = ctx;
  ctx.self = ctx;

  /* Listeners de verdad. sync.js se engancha a `online` y a `visibilitychange`
     para drenar la cola RESETEANDO el backoff: sin eso, una maquina que estuvo
     mucho tiempo sin red espera hasta 60 s para reintentar. Stubearlos hacia
     que el test midiera un camino de recuperacion que no es el real. */
  const oyentes = {};
  ctx.window.addEventListener = function(ev, fn){ (oyentes[ev] = oyentes[ev] || []).push(fn); };
  ctx.document.addEventListener = ctx.window.addEventListener;
  ctx.window.dispatchEvent = function(){ return true; };
  ctx._emitir = function(ev){ (oyentes[ev] || []).forEach(function(fn){ try{ fn({type: ev}); }catch(e){} }); };

  ctx.SUPABASE_URL = 'https://falso.supabase.co';
  ctx.SUPABASE_ANON_KEY = 'anon-de-prueba';

  ctx.cevenK = base => prefix + base;
  ctx.window.cevenK = ctx.cevenK;

  // cevenLsJSON es de shared/safe.js, que en la app se carga antes que sync.js.
  ctx.cevenLsJSON = function(k, porDefecto){
    const raw = localStorage.getItem(k);
    if(raw === null) return porDefecto;
    try{ const v = JSON.parse(raw); return (v === null || v === undefined) ? porDefecto : v; }
    catch(e){ return porDefecto; }
  };
  ctx.window.cevenLsJSON = ctx.cevenLsJSON;

  // La marca real de Apple, recortada a lo que sync.js consume.
  ctx.CEVEN_BRAND = Object.assign({
    id: brand,
    prefix: prefix,
    settingKeys: ['cquotes', 'cpl', 'carchive', 'cqc', 'cclientes'],
    pipeCols: ['id', 'fecha', 'qNum', 'cliente', 'proyecto', 'estado', 'monto', 'skuStatus', 'ovLink'],
    numCols: ['id', 'qNum', 'monto'],
    objCols: ['skuStatus'],
    nullableCols: ['ovLink', 'proyecto'],
    localOnlyCols: ['skuOvLinks'],
    padCols: { qNum: 4 },
    monotonicKeys: ['cqc']
  }, opts.brandOverrides || {});
  ctx.window.CEVEN_BRAND = ctx.CEVEN_BRAND;

  // crypto.randomUUID para los ids de cotizacion nueva; Uint8Array para el
  // fallback de quotes-store.js.
  ctx.crypto = require('crypto').webcrypto;
  ctx.Uint8Array = Uint8Array;
  // Los avisos al usuario se capturan en vez de mostrarse.
  ctx.toasts = [];
  ctx.showToast = function(m){ ctx.toasts.push(String(m)); };

  vm.createContext(ctx);
  vm.runInContext(STORE_SRC, ctx);
  vm.runInContext(SYNC_SRC, ctx);

  return {
    ctx,
    store,
    brand,
    toasts: ctx.toasts,
    k: base => prefix + base,

    // Las cotizaciones del cache local, agrupadas (una entrada por cotizacion).
    cotiz(){
      try{ return ctx.cevenQAgrupar(JSON.parse(store[prefix + 'cquotes'] || '[]')); }
      catch(e){ return []; }
    },
    numeros(){ return this.cotiz().map(c => String(c.qnum)).sort(); },

    /* Guarda una cotizacion como lo hace saveDB(): sella la identidad y escribe
       el array plano. `lineas` son filas de cquotes sin el numero. */
    guardarCotiz(qn, lineas){
      const plano = JSON.parse(store[prefix + 'cquotes'] || '[]');
      const nuevas = lineas.map(l => Object.assign({ 'N° Cotización': qn }, l));
      const sellado = ctx.cevenQSellar(plano.concat(nuevas), plano);
      ctx.localStorage.setItem(prefix + 'cquotes', JSON.stringify(sellado));
    },

    // Lee/escribe el localStorage como lo haria la app (pasando por el intercept).
    leer(base){ return store[prefix + base] === undefined ? null : store[prefix + base]; },
    leerJSON(base){ try{ return JSON.parse(store[prefix + base]); }catch(e){ return null; } },
    guardar(base, valor){
      // Por el PROTOTIPO, que es donde sync.js puso el intercept.
      ctx.localStorage.setItem(prefix + base, typeof valor === 'string' ? valor : JSON.stringify(valor));
    },

    pendientes(){ return ctx._syncPendingCount ? ctx._syncPendingCount() : 0; },

    // Dispara un evento del navegador (p.ej. 'online' cuando vuelve la red).
    async emitir(ev){ ctx._emitir(ev); await this.avanzar(1); },

    /* Avanza el reloj y dispara lo que venza, drenando las promesas entre
       medio. Sin el drenaje los .then() del fetch quedan colgados y el test ve
       un estado a medio aplicar. */
    async avanzar(ms){
      const hasta = ahora + (ms || 0);
      await drenar();
      // Mientras haya algo que venza dentro de la ventana, dispararlo en orden.
      for(;;){
        const vence = timers.filter(t => t.at <= hasta).sort((a, b) => a.at - b.at)[0];
        if(!vence) break;
        ahora = Math.max(ahora, vence.at);
        if(vence.intervalo) vence.at = ahora + vence.intervalo;
        else timers.splice(timers.indexOf(vence), 1);
        try{ vence.fn(); }catch(e){ ctx.console._real.error('timer exploto:', e); }
        await drenar();
      }
      ahora = hasta;
      await drenar();
    }
  };
}

// Deja correr las promesas pendientes (el fetch simulado resuelve en microtask).
function drenar(){
  return new Promise(resolve => setImmediate(() => setImmediate(resolve)));
}

// Arranca un navegador y deja que su bootstrap termine.
async function arrancar(servidor, opts){
  const nav = nuevoNavegador(servidor, opts);
  await nav.avanzar(1);
  return nav;
}

const POLL = 15000;   // POLL_MS de sync.js

/* ==========================================================================
   LAS PRUEBAS
   ========================================================================== */
(async function(){

console.log('\n1 · Seed: con la base vacia manda el localStorage');
{
  const srv = nuevoServidor();
  const nav = await arrancar(srv, {
    store: {
      cpipeline: JSON.stringify([{ id: 1, qNum: '0071', cliente: 'ACME', monto: 100 }]),
      cquotes:   JSON.stringify([{ 'N° Cotización': '0071', SKU: 'MBP' }])
    }
  });
  await nav.avanzar(POLL);

  ok(srv.filas('pipeline', 'apple').length === 1, 'la fila de pipeline local se sembro en el servidor');
  ok(srv.setting('apple', 'cquotes') !== null, 'y el blob de cquotes tambien');
  ok(nav.pendientes() === 0, 'no queda nada pendiente despues del seed');
}

console.log('\n2 · Bootstrap: el servidor gana, pero lo que solo esta local NO se pierde');
{
  const srv = nuevoServidor();
  // Otro equipo ya subio la fila 1 (con el cliente corregido) y la fila 2.
  srv.ponerPipe('apple', { id: 1, qNum: '0071', cliente: 'ACME S.A.', monto: 100, estado: 'Cotizado' });
  srv.ponerPipe('apple', { id: 2, qNum: '0072', cliente: 'Globex',    monto: 200, estado: 'Cotizado' });

  const nav = await arrancar(srv, {
    store: {
      // 1 desactualizada, y la 3 existe SOLO aca (se creo sin conexion).
      cpipeline: JSON.stringify([
        { id: 1, qNum: '0071', cliente: 'ACME', monto: 100, estado: 'Cotizado' },
        { id: 3, qNum: '0073', cliente: 'Initech', monto: 300, estado: 'Cotizado' }
      ])
    }
  });

  const local = nav.leerJSON('cpipeline');
  const porId = Object.fromEntries(local.map(r => [r.id, r]));
  ok(local.length === 3, 'quedan las tres filas', 'quedaron ' + local.length);
  ok(porId[1] && porId[1].cliente === 'ACME S.A.', 'la fila que ambos tienen la gana el servidor');
  ok(!!porId[2], 'la fila que solo tenia el servidor entra');
  ok(!!porId[3], 'la fila que solo estaba local SOBREVIVE');

  await nav.avanzar(POLL);
  ok(srv.filas('pipeline', 'apple').some(r => String(r.id) === '3'),
     'y ademas se sube al servidor');
}

console.log('\n3 · Poll: los cambios del equipo llegan solos');
{
  const srv = nuevoServidor();
  srv.ponerPipe('apple', { id: 1, qNum: '0071', cliente: 'ACME', monto: 100 });
  const nav = await arrancar(srv, {});
  ok((nav.leerJSON('cpipeline') || []).length === 1, 'arranca con la fila del servidor');

  // Otro usuario la edita y agrega otra.
  srv.ponerPipe('apple', { id: 1, qNum: '0071', cliente: 'ACME', monto: 999 });
  srv.ponerPipe('apple', { id: 4, qNum: '0074', cliente: 'Umbrella', monto: 400 });
  await nav.avanzar(POLL + 1);

  const local = nav.leerJSON('cpipeline') || [];
  const uno = local.find(r => String(r.id) === '1');
  ok(uno && Number(uno.monto) === 999, 'el poll trae la edicion del otro usuario');
  ok(local.length === 2, 'y la fila nueva');
}

console.log('\n4 · El poll NO pisa un cambio local sin confirmar');
{
  const srv = nuevoServidor();
  srv.ponerSetting('apple', 'cquotes', JSON.stringify([{ 'N° Cotización': '0071' }]));
  const nav = await arrancar(srv, {});
  srv.caido = true;                                     // se corta la red

  nav.guardar('cquotes', [{ 'N° Cotización': '0071' }, { 'N° Cotización': '0072' }]);
  await nav.avanzar(POLL * 2);                          // varios polls fallidos

  const local = nav.leerJSON('cquotes') || [];
  ok(local.length === 2, 'el cambio local sigue intacto aunque el push falle',
     'quedaron ' + local.length + ' filas');
  ok(nav.pendientes() >= 1, 'y se cuenta como pendiente');

  srv.caido = false;
  await nav.avanzar(POLL * 2);
  ok(JSON.parse(srv.setting('apple', 'cquotes')).length === 2,
     'cuando vuelve la red, sube');
  ok(nav.pendientes() === 0, 'y deja de estar pendiente');
}

console.log('\n5 · Los borrados se propagan');
{
  const srv = nuevoServidor();
  srv.ponerPipe('apple', { id: 1, qNum: '0071', cliente: 'ACME', monto: 100 });
  srv.ponerPipe('apple', { id: 2, qNum: '0072', cliente: 'Globex', monto: 200 });
  const nav = await arrancar(srv, {});
  ok((nav.leerJSON('cpipeline') || []).length === 2, 'arranca con dos filas');

  nav.guardar('cpipeline', (nav.leerJSON('cpipeline') || []).filter(r => String(r.id) !== '2'));
  await nav.avanzar(POLL);

  ok(srv.filas('pipeline', 'apple').length === 1, 'el DELETE llego al servidor');
  ok(!srv.filas('pipeline', 'apple').some(r => String(r.id) === '2'), 'y borro la fila correcta');
}

console.log('\n6 · La cola de pendientes sobrevive al F5');
{
  const srv = nuevoServidor();
  const store = {};
  const nav1 = await arrancar(srv, { store });
  srv.caido = true;
  nav1.guardar('cquotes', [{ 'N° Cotización': '0099', SKU: 'MBP' }]);
  await nav1.avanzar(1000);
  ok(store._sync_dirty !== undefined, 'el pendiente quedo anotado en disco');

  // F5: mismo disco, modulo de cero. El servidor tiene OTRA cosa.
  srv.caido = false;
  srv.ponerSetting('apple', 'cquotes', JSON.stringify([{ 'N° Cotización': '0001' }]));
  const nav2 = await arrancar(srv, { store });

  const local = nav2.leerJSON('cquotes') || [];
  ok(local.length === 1 && local[0]['N° Cotización'] === '0099',
     'tras el reload manda lo local, no lo del servidor',
     'quedo ' + JSON.stringify(local));
  await nav2.avanzar(POLL);
  ok(JSON.parse(srv.setting('apple', 'cquotes'))[0]['N° Cotización'] === '0099',
     'y termina subiendo');
}

console.log('\n7 · El contador de cotizaciones nunca retrocede (clave monotona)');
{
  const srv = nuevoServidor();
  srv.ponerSetting('apple', 'cqc', '40');
  const nav = await arrancar(srv, { store: { cqc: '90' } });
  ok(nav.leer('cqc') === '90', 'un servidor atrasado no baja el contador local');
  await nav.avanzar(POLL);
  ok(srv.setting('apple', 'cqc') === '90', 'y el local se impone en el servidor');

  srv.ponerSetting('apple', 'cqc', '150');
  await nav.avanzar(POLL + 1);
  ok(nav.leer('cqc') === '150', 'pero si el servidor va adelante, gana el servidor');
}

console.log('\n8 · EL BUG QUE MOTIVO TODO: dos usuarios guardando a la vez');
{
  /* Este es el caso que arranco el trabajo. Con `cquotes` como blob unico, la
     cotizacion de A desaparecia del servidor Y del propio navegador de A en
     cuanto B subia su copia vieja. Ahora cada cotizacion es una fila y las dos
     sobreviven. */
  const srv = nuevoServidor();
  const A = await arrancar(srv, { store: {} });
  A.guardarCotiz('0001', [{ SKU: 'VIEJA', Cantidad: 1 }]);
  await A.avanzar(1000);

  const B = await arrancar(srv, { store: {} });   // B parte del mismo estado
  ok(B.numeros().join(',') === '0001', 'B arranca viendo la #0001 de A');

  // A guarda la #0002 y la sube.
  A.guardarCotiz('0002', [{ SKU: 'DE-A', Cantidad: 1 }]);
  await A.avanzar(1000);
  ok(srv.numerosDe('apple').join(',') === '1,2', 'A subio su cotizacion');

  // B, que todavia no polleo, guarda la suya sobre su copia vieja.
  B.guardarCotiz('0003', [{ SKU: 'DE-B', Cantidad: 1 }]);
  await B.avanzar(1000);

  ok(srv.numerosDe('apple').join(',') === '1,2,3',
     'las TRES sobreviven en el servidor: B ya no pisa a A',
     'quedaron: ' + JSON.stringify(srv.numerosDe('apple')));

  // Y A no pierde nada cuando pollea.
  await A.avanzar(POLL + 1);
  ok(A.numeros().join(',') === '0001,0002,0003',
     'y A las ve todas, incluida la suya',
     'A tiene: ' + JSON.stringify(A.numeros()));

  // El blob se sigue escribiendo para los clientes sin actualizar...
  const blob = JSON.parse(srv.setting('apple', 'cquotes') || '[]');
  ok(blob.length > 0, 'el blob se sigue espejando (compatibilidad hacia atras)');
}

console.log('\n9 · El peor caso: la maquina rezagada que reconecta');
{
  /* El que borraba de a lotes: alguien queda con `cquotes` sucia (sin conexion,
     sesion vencida) y al reconectar subia su blob viejo, borrando todo lo que
     el equipo habia creado en el medio. Ahora solo sube SU fila. */
  const srv = nuevoServidor();
  const A = await arrancar(srv, { store: {} });
  A.guardarCotiz('0001', [{ SKU: 'BASE', Cantidad: 1 }]);
  await A.avanzar(1000);

  const B = await arrancar(srv, { store: {} });
  srv.caido = true;
  B.guardarCotiz('0002', [{ SKU: 'DE-B-OFFLINE', Cantidad: 1 }]);
  await B.avanzar(POLL * 3);                       // B lucha sin red un buen rato
  ok(B.pendientes() >= 1, 'B queda con su cotizacion sin subir');

  // Mientras tanto el equipo sigue trabajando.
  srv.caido = false;
  A.guardarCotiz('0003', [{ SKU: 'DE-A-1', Cantidad: 1 }]);
  await A.avanzar(1000);
  A.guardarCotiz('0004', [{ SKU: 'DE-A-2', Cantidad: 1 }]);
  await A.avanzar(1000);
  ok(srv.numerosDe('apple').join(',') === '1,3,4', 'el equipo creo dos mas mientras B estaba caido');

  // B reconecta. El evento 'online' resetea el backoff y drena la cola: es el
  // camino real de recuperacion, no esperar los 60 s del backoff.
  await B.emitir('online');
  await B.avanzar(POLL * 2);
  ok(srv.numerosDe('apple').join(',') === '1,2,3,4',
     'B sube la suya SIN borrar las del equipo',
     'quedaron: ' + JSON.stringify(srv.numerosDe('apple')));
  ok(B.numeros().join(',') === '0001,0002,0003,0004',
     'y ademas B recibe las que se perdio');
}

console.log('\n10 · Choque de numero: se renumera, no se pierde');
{
  /* Dos personas toman el #0002 sin verse. El unique (brand,qnum) de la tabla
     rebota con 23505 y el segundo renumera SU etiqueta. Las dos cotizaciones
     sobreviven porque su identidad es el id, no el numero. */
  const srv = nuevoServidor();
  const A = await arrancar(srv, { store: {} });
  const B = await arrancar(srv, { store: {} });

  A.guardarCotiz('0002', [{ SKU: 'DE-A', Cantidad: 1 }]);
  await A.avanzar(1000);
  B.guardarCotiz('0002', [{ SKU: 'DE-B', Cantidad: 7 }]);   // mismo numero, otro contenido
  await B.avanzar(POLL * 2);

  const nums = srv.numerosDe('apple');
  ok(nums.length === 2, 'quedan DOS cotizaciones en el servidor, no una',
     'quedaron: ' + JSON.stringify(nums));

  const skus = srv.cotiz('apple')
    .map(c => (c.lineas || []).map(l => l.SKU).join('')).sort();
  ok(skus.join(',') === 'DE-A,DE-B', 'y son la de A y la de B, ninguna pisada',
     'skus: ' + JSON.stringify(skus));
  ok(B.toasts.some(t => t.indexOf('0002') >= 0),
     'a B se le avisa que su numero cambio',
     'toasts: ' + JSON.stringify(B.toasts));
}

console.log('\n11 · Cotizaciones viejas (sin _qid) no se duplican ni se pisan');
{
  // Al actualizar, el cache local tiene cotizaciones sin identidad sellada. El
  // backfill del servidor les puso 'q<numero>'; el cliente tiene que llegar al
  // MISMO id para reconocerlas como la misma y no subir un duplicado.
  const srv = nuevoServidor();
  srv.cotizaciones.push({
    brand: 'apple', id: 'q0001', qnum: 1, cliente: 'ACME',
    lineas: [{ 'N° Cotización': '0001', SKU: 'VIEJA', Cantidad: 1 }]
  });
  const nav = await arrancar(srv, {
    store: { cquotes: JSON.stringify([{ 'N° Cotización': '0001', SKU: 'VIEJA', Cantidad: 1 }]) }
  });
  await nav.avanzar(POLL);
  ok(srv.cotiz('apple').length === 1, 'no se duplico: sigue habiendo una sola',
     'hay ' + srv.cotiz('apple').length);
  ok(nav.numeros().join(',') === '0001', 'y el cliente la ve una sola vez');
}
{
  /* El caso borde del plan: una cotizacion vieja que NUNCA sincronizo y que
     choca con otra distinta que el backfill ya subio con el mismo id derivado
     del numero. Sin reconciliacion, subirla pisaria la del servidor. */
  const srv = nuevoServidor();
  srv.cotizaciones.push({
    brand: 'apple', id: 'q0001', qnum: 1, cliente: 'DEL-SERVIDOR',
    lineas: [{ 'N° Cotización': '0001', SKU: 'DEL-SERVIDOR', Cantidad: 1 }]
  });
  const nav = await arrancar(srv, {
    store: { cquotes: JSON.stringify([{ 'N° Cotización': '0001', SKU: 'SOLO-LOCAL', Cantidad: 9 }]) }
  });
  await nav.avanzar(POLL * 2);

  const skus = srv.cotiz('apple')
    .map(c => (c.lineas || []).map(l => l.SKU).join('')).sort();
  ok(skus.length === 2, 'sobreviven LAS DOS: la del servidor y la local divergente',
     'quedaron: ' + JSON.stringify(skus));
  ok(skus.join(',') === 'DEL-SERVIDOR,SOLO-LOCAL', 'con su contenido intacto',
     'skus: ' + JSON.stringify(skus));
}

console.log('\n' + (fallos
  ? ('✗ ' + fallos + ' de ' + corridas + ' fallaron\n')
  : ('✓ ' + corridas + '/' + corridas + ' OK\n')));
process.exit(fallos ? 1 : 0);

})().catch(e => { console.error(e); process.exit(1); });
