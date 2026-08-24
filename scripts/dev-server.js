#!/usr/bin/env node
/* ============================================================================
   dev-server.js · Cotizadores Ceven — servidor local de prueba
   ----------------------------------------------------------------------------
   Sirve src/ como lo hace Vercel: mismo outputDirectory, mismo cleanUrls y los
   MISMOS headers de vercel.json (incluida la CSP). Que la CSP sea la misma es
   el punto: sin ella, algo que en local anda perfecto puede quedar bloqueado
   recién en producción.

   Sin dependencias: node scripts/dev-server.js [puerto]

   Ojo con el service worker: la estrategia es stale-while-revalidate, así que
   un archivo editado se ve recién en la SEGUNDA recarga. Para desarrollar,
   DevTools → Application → Service Workers → "Update on reload".
   ========================================================================== */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const ROOT = path.resolve(__dirname, '..');
const RAIZ = path.join(ROOT, 'src');          // vercel.json → outputDirectory
const PUERTO = parseInt(process.argv[2], 10) || 8080;

const CSP = "default-src 'self'; base-uri 'none'; object-src 'none'; "
  + "frame-ancestors 'self'; form-action 'self'; script-src 'self' 'unsafe-inline'; "
  + "style-src 'self' 'unsafe-inline'; "
  + "img-src 'self' data: blob: https://store.storeimages.cdn-apple.com; "
  + "font-src 'self' data:; connect-src 'self' https://iqewnebpdyctexavtpmt.supabase.co; "
  + "frame-src 'self' blob:; worker-src 'self'; manifest-src 'self'";

const MIME = {
  '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8',
  '.css':'text/css; charset=utf-8',   '.json':'application/json; charset=utf-8',
  '.webmanifest':'application/manifest+json; charset=utf-8',
  '.svg':'image/svg+xml', '.png':'image/png', '.jpg':'image/jpeg', '.jpeg':'image/jpeg',
  '.webp':'image/webp', '.ico':'image/x-icon', '.woff2':'font/woff2', '.woff':'font/woff',
  '.map':'application/json; charset=utf-8', '.txt':'text/plain; charset=utf-8',
  '.pdf':'application/pdf', '.xlsx':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
};

function esArchivo(p){ try{ return fs.statSync(p).isFile(); }catch(e){ return false; } }

/* Resolución de rutas igual que Vercel con cleanUrls:
     /            → /index.html
     /poly/       → /poly/index.html
     /poly        → /poly/index.html  (o /poly.html si existiera)
   Devuelve null si no hay nada, para responder 404 en vez de servir otra cosa. */
function resolver(pathname){
  const limpio = decodeURIComponent(pathname).replace(/\\/g, '/');
  // Nada de subir de directorio: el server sirve SOLO src/.
  const destino = path.normalize(path.join(RAIZ, limpio));
  if(destino !== RAIZ && !destino.startsWith(RAIZ + path.sep)) return null;
  if(esArchivo(destino)) return destino;
  const indice = path.join(destino, 'index.html');
  if(esArchivo(indice)) return indice;
  const conHtml = destino + '.html';
  if(esArchivo(conHtml)) return conHtml;
  return null;
}

const server = http.createServer(function(req, res){
  const pathname = url.parse(req.url).pathname || '/';
  const archivo = resolver(pathname);
  const inicio = Date.now();

  function log(codigo, extra){
    console.log('  ' + String(codigo) + '  ' + req.method + ' ' + pathname
      + (extra ? ('  ' + extra) : '') + '  (' + (Date.now() - inicio) + 'ms)');
  }

  if(!archivo){
    /* api/asistente.js es una Función de Vercel, no un archivo estático: acá no
       corre. Se contesta explícito para que el asistente IA falle con un cartel
       entendible en vez de con un 404 de HTML parseado como JSON. */
    if(pathname.indexOf('/api/') === 0){
      res.writeHead(501, {'Content-Type':'application/json; charset=utf-8'});
      res.end(JSON.stringify({message:'El asistente IA es una Función de Vercel y no corre en el server local.'}));
      log(501, '(función de Vercel)');
      return;
    }
    res.writeHead(404, {'Content-Type':'text/plain; charset=utf-8'});
    res.end('404 — no existe ' + pathname + ' dentro de src/');
    log(404);
    return;
  }

  const ext = path.extname(archivo).toLowerCase();
  const headers = {
    'Content-Type': MIME[ext] || 'application/octet-stream',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'SAMEORIGIN',
    'Referrer-Policy': 'same-origin',
    'Content-Security-Policy': CSP,
    'Cross-Origin-Opener-Policy': 'same-origin',
    // En desarrollo NADA se cachea en el navegador: lo único que puede servir
    // una versión vieja es el service worker, y eso se controla desde DevTools.
    'Cache-Control': 'no-store'
  };
  // El worker necesita este header para tomar scope "/" (igual que en vercel.json).
  if(pathname === '/sw.js') headers['Service-Worker-Allowed'] = '/';

  fs.readFile(archivo, function(err, buf){
    if(err){
      res.writeHead(500, {'Content-Type':'text/plain; charset=utf-8'});
      res.end('500 — ' + err.message);
      log(500, err.code);
      return;
    }
    headers['Content-Length'] = buf.length;
    res.writeHead(200, headers);
    res.end(req.method === 'HEAD' ? undefined : buf);
    log(200, path.relative(RAIZ, archivo).replace(/\\/g,'/'));
  });
});

server.on('error', function(err){
  if(err.code === 'EADDRINUSE'){
    console.error('\n✗ El puerto ' + PUERTO + ' está ocupado. Probá: node ' +
      path.basename(__filename) + ' ' + (PUERTO + 1) + '\n');
    process.exit(1);
  }
  throw err;
});

server.listen(PUERTO, '127.0.0.1', function(){
  console.log('\n  Cotizadores Ceven — server local');
  console.log('  sirviendo ' + RAIZ);
  console.log('\n    Shell / login   http://localhost:' + PUERTO + '/');
  console.log('    Poly            http://localhost:' + PUERTO + '/poly/');
  console.log('    Apple           http://localhost:' + PUERTO + '/apple/');
  console.log('    Multimarca      http://localhost:' + PUERTO + '/multi/');
  console.log('    Portal cliente  http://localhost:' + PUERTO + '/portal/');
  console.log('    Tareas          http://localhost:' + PUERTO + '/tareas/');
  console.log('\n  Ctrl+C para parar.\n');
});
