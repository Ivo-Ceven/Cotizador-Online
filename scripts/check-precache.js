#!/usr/bin/env node
/* ============================================================
   Valida la lista de precache de src/sw.js.  Uso:  node scripts/check-precache.js
   ------------------------------------------------------------
   Por qué existe: el install del service worker es todo-o-nada. Si una sola ruta
   de ASSETS no existe, el install falla, el worker nuevo NUNCA activa y los
   usuarios dejan de recibir actualizaciones EN SILENCIO — sin error visible en la
   app. Como no hay build que arme la lista, se mantiene a mano y hay que
   chequearla cada vez que se agrega, renombra o borra un .js/.css.

   Chequea tres cosas:
     1. toda ruta de ASSETS existe en disco;
     2. todo .js/.css que cargan los HTML está en ASSETS (nada sin cachear);
     3. no hay .js/.css en disco olvidado fuera de la lista.

   Sale con código 1 si algo está mal.
   ============================================================ */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'src');
const sw = fs.readFileSync(path.join(SRC, 'sw.js'), 'utf8');

function list(name) {
  const m = sw.match(new RegExp('var ' + name + '\\s*=\\s*\\[([\\s\\S]*?)\\];'));
  if (!m) throw new Error('no se encontró la lista ' + name + ' en src/sw.js');
  return [...m[1].matchAll(/'([^']+)'/g)].map(x => x[1]);
}

const ASSETS = list('ASSETS');
let errores = 0;
const fallo = msg => { console.error('  ✗ ' + msg); errores++; };

// 1. Toda ruta de ASSETS existe
for (const u of ASSETS) {
  if (!fs.existsSync(path.join(SRC, u.replace(/^\.\//, '')))) {
    fallo('ASSETS apunta a un archivo que no existe: ' + u);
  }
}

// 2. Todo js/css que cargan los HTML está precacheado
const paginas = { 'index.html': '', 'apple/index.html': 'apple/', 'apple/cevencare.html': 'apple/', 'poly/index.html': 'poly/' };
for (const [pagina, base] of Object.entries(paginas)) {
  const html = fs.readFileSync(path.join(SRC, pagina), 'utf8');
  const refs = [...html.matchAll(/(?:src|href)="([^"]+\.(?:js|css))"/g)].map(x => x[1]);
  for (const ref of refs) {
    const rel = './' + path.posix.normalize(base + ref);
    if (!ASSETS.includes(rel)) fallo(pagina + ' carga ' + ref + ' pero ' + rel + ' no está en ASSETS');
  }
}

// 3. Nada olvidado en disco
const IGNORAR = ['./sw.js'];   // el worker no se precachea a sí mismo
const enDisco = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const f = path.join(dir, e.name);
    if (e.isDirectory()) walk(f);
    else if (/\.(js|css)$/.test(e.name)) enDisco.push('./' + path.relative(SRC, f).split(path.sep).join('/'));
  }
})(SRC);
for (const f of enDisco) {
  if (!ASSETS.includes(f) && !IGNORAR.includes(f)) fallo('existe en disco pero no está en ASSETS de sw.js: ' + f);
}

if (errores) {
  console.error('\n' + errores + ' problema(s). Corregí la lista ASSETS en src/sw.js.');
  process.exit(1);
}
console.log('✓ precache OK: ' + ASSETS.length + ' rutas, todas existen; nada sin cachear ni olvidado.');
