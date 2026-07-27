/* ============================================================
   SERVICE WORKER  ·  Cotizadores Ceven
   ------------------------------------------------------------
   Vive en la RAÍZ del sitio para tener scope "/" (cubre el shell
   y todos los cotizadores por marca).

   Estrategia (misma para todos los archivos propios):
   "stale-while-revalidate" — se responde al instante con la copia
   cacheada y en paralelo se revalida contra la red para la próxima
   carga. Consecuencias buscadas:
     - la app abre instantánea y funciona sin conexión;
     - si se deploya sin tocar APP_VERSION, la versión nueva entra
       igual sola en la siguiente recarga (no queda pegada).

   El caché se llama con APP_VERSION (shared/config.js), la misma
   constante que muestra el zócalo de la app. Al subirla, este worker
   se reinstala, precachea TODO de nuevo y avisa a la página para que
   ofrezca "Actualizar" (ver shared/pwa.js).

   La versión se IMPORTA en vez de leerse de una query por dos razones:
     - el chequeo de actualización del navegador compara también los
       scripts importados, así que tocar APP_VERSION dispara el worker
       nuevo en la carga siguiente, sin intermediarios;
     - si la pasara la página, sería leyendo un config.js que sirve ESTE
       worker desde caché, y el bump tardaba dos cargas en notarse.

   NUNCA se toca lo que no es del mismo origin: los requests a
   Supabase (auth, REST, Edge Function) pasan derecho a la red.
   ============================================================ */

importScripts('./shared/config.js');

var VERSION = self.APP_VERSION || 'dev';
var CACHE   = 'ceven-v' + VERSION;

/* Archivos con ruta exacta: idénticos sirviendo local (python -m http.server)
   o en Vercel. Si uno falla, la instalación falla y se conserva el worker
   viejo (mejor eso que un caché a medias). */
var ASSETS = [
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
  './icons/favicon-32.png',

  './shared/config.js',
  './shared/auth.js',
  './shared/pwa.js',

  './vendor/xlsx.full.min.js',
  './vendor/html2canvas.min.js',
  './vendor/jspdf.umd.min.js',
  './vendor/jspdf.plugin.autotable.min.js',

  './apple/css/base.css',
  './apple/css/dark.css',
  './apple/css/cevencare.css',

  './apple/js/sync.js',
  './apple/js/state.js',
  './apple/js/utils.js',
  './apple/js/catalog.js',
  './apple/js/quote.js',
  './apple/js/nac.js',
  './apple/js/products.js',
  './apple/js/quotes-db.js',
  './apple/js/pipeline-data.js',
  './apple/js/backup.js',
  './apple/js/pipeline-core.js',
  './apple/js/archive-view.js',
  './apple/js/pipeline-view.js',
  './apple/js/pipeline-detail.js',
  './apple/js/backup-folder.js',
  './apple/js/history.js',
  './apple/js/pdf.js',
  './apple/js/warranties.js',
  './apple/js/undo.js',
  './apple/js/target.js',
  './apple/js/init.js',
  './apple/js/cevencare.js',

  './poly/css/base.css',
  './poly/css/dark.css',

  './poly/js/sync.js',
  './poly/js/state.js',
  './poly/js/utils.js',
  './poly/js/catalog.js',
  './poly/js/quote.js',
  './poly/js/products.js',
  './poly/js/quotes-db.js',
  './poly/js/pipeline-data.js',
  './poly/js/backup.js',
  './poly/js/pipeline-core.js',
  './poly/js/archive-view.js',
  './poly/js/pipeline-view.js',
  './poly/js/pipeline-detail.js',
  './poly/js/backup-folder.js',
  './poly/js/history.js',
  './poly/js/pdf.js',
  './poly/js/boot.js',
  './poly/js/undo.js',
  './poly/js/init.js'
];

/* Documentos: se piden las DOS variantes de cada uno porque `cleanUrls` de
   Vercel redirige "/x.html" → "/x", pero sirviendo local existe solo el .html.
   Cada una es best-effort: la que no exista en ese entorno simplemente no se
   cachea, y matchVariants() encuentra la otra igual. */
var DOCS = [
  './',
  './index.html',
  './apple/',
  './apple/index.html',
  './apple/cevencare.html',
  './apple/cevencare',
  './poly/',
  './poly/index.html'
];

/* Una respuesta redirigida (308 de cleanUrls) no puede devolverse tal cual a
   una navegación: el navegador la rechaza. Se la recrea sin la marca. */
async function unredirect(res){
  if(!res.redirected) return res;
  var body = await res.blob();
  return new Response(body, {status: res.status, statusText: res.statusText, headers: res.headers});
}

async function cacheOne(cache, url, required){
  try{
    var res = await fetch(url, {cache: 'reload'});   // 'reload' saltea el caché HTTP
    if(!res.ok) throw new Error(url + ' → HTTP ' + res.status);
    await cache.put(url, await unredirect(res));
  }catch(err){
    if(required) throw err;
    console.warn('[sw] no se pudo precachear (se ignora):', url, err);
  }
}

self.addEventListener('install', function(e){
  e.waitUntil((async function(){
    var cache = await caches.open(CACHE);
    await Promise.all(ASSETS.map(function(u){ return cacheOne(cache, u, true); }));
    await Promise.all(DOCS.map(function(u){ return cacheOne(cache, u, false); }));
    /* Sin skipWaiting(): el worker nuevo espera a que el usuario acepte
       "Actualizar" (recargar de prepo puede tirar una cotización a medio armar). */
  })());
});

self.addEventListener('activate', function(e){
  e.waitUntil((async function(){
    var names = await caches.keys();
    await Promise.all(names.map(function(n){
      return (n.indexOf('ceven-v') === 0 && n !== CACHE) ? caches.delete(n) : null;
    }));
    await self.clients.claim();
  })());
});

/* shared/pwa.js manda este mensaje cuando el usuario toca "Actualizar". */
self.addEventListener('message', function(e){
  if(e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
});

/* Busca en el caché tolerando las variantes de cleanUrls
   ("/apple/" ↔ "/apple/index.html", "/x.html" ↔ "/x"). */
async function matchVariants(cache, req, url){
  var hit = await cache.match(req, {ignoreSearch: true});
  if(hit) return hit;

  var p = url.pathname, alts = [];
  if(/\/index\.html$/.test(p))          alts.push(p.replace(/index\.html$/, ''));
  else if(/\.html$/.test(p))            alts.push(p.replace(/\.html$/, ''));
  else if(/\/$/.test(p))                alts.push(p + 'index.html');
  else if(!/\.[a-z0-9]+$/i.test(p))     alts.push(p + '.html', p + '/', p + '/index.html');

  for(var i = 0; i < alts.length; i++){
    var alt = await cache.match(alts[i], {ignoreSearch: true});
    if(alt) return alt;
  }
  return null;
}

async function revalidate(cache, req){
  var res;
  try{
    res = await fetch(req);
  }catch(err){
    return null;   // sin conexión: no es un error, se resuelve con el caché
  }
  /* Guardar va en su propio try a propósito: si el put falla (cuota llena, o una
     respuesta 206 que cache.put rechaza) la respuesta de red sigue siendo válida
     y hay que devolverla igual. Metido en el try del fetch, un put fallado la
     convertía en null y el usuario terminaba viendo un 503 estando online. */
  if(res && res.ok && res.type === 'basic'){   // 'basic' = mismo origin
    try{
      await cache.put(req, await unredirect(res.clone()));
    }catch(err){
      console.warn('[sw] no se pudo cachear (se sirve igual):', req.url, err);
    }
  }
  return res;
}

async function respond(e){
  var req = e.request;
  var url = new URL(req.url);
  var cache = await caches.open(CACHE);

  var hit = await matchVariants(cache, req, url);
  var net = revalidate(cache, req);

  if(hit){
    e.waitUntil(net);   // la revalidación sigue aunque ya respondimos
    return hit;
  }

  var res = await net;
  if(res) return res;

  /* Offline y sin copia: para una navegación, devolver el shell de la marca. */
  if(req.mode === 'navigate'){
    var brandFallback = url.pathname.indexOf('/apple/') === 0 ? './apple/'
                       : url.pathname.indexOf('/poly/') === 0  ? './poly/'
                       : './';
    var fb = await cache.match(brandFallback);
    if(fb) return fb;
  }
  return new Response('Sin conexión y sin copia guardada de este archivo.', {
    status: 503,
    statusText: 'Offline',
    headers: {'Content-Type': 'text/plain; charset=utf-8'}
  });
}

self.addEventListener('fetch', function(e){
  if(e.request.method !== 'GET') return;
  var url = new URL(e.request.url);
  if(url.origin !== self.location.origin) return;   // Supabase y demás: derecho a la red
  e.respondWith(respond(e));
});
