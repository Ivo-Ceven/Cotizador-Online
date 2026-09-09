#!/usr/bin/env node
/* ============================================================================
   check-notify.js · Cotizadores Ceven
   ----------------------------------------------------------------------------
   src/shared/notify.js — enrutado de los carteles:
     · success / info        → cartel de esquina (showToast)
     · error / warning       → popup CENTRADO (showErrorPopup), salvo forceToast
     · notifyUndo()          → siempre cartel de esquina (forceToast)
   Corre la función REAL con un DOM de mentira.
   Uso:  node scripts/check-notify.js
   ========================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
let fallos = 0, corridas = 0;
function ok(cond, nombre, detalle){
  corridas++;
  if(cond){ console.log('  ✓ ' + nombre); return; }
  fallos++;
  console.error('  ✗ ' + nombre + (detalle ? ('\n      ' + detalle) : ''));
}

// ── DOM de mentira: lo justo para notify.js ──
function nodo(){
  const n = {
    _id: '', style: {}, _children: [], _html: '',
    get id(){ return this._id; }, set id(v){ this._id = v; },
    get innerHTML(){ return this._html; },
    set innerHTML(v){
      this._html = String(v);
      // Deducir los [data-*] que notify.js consulta con querySelector.
    },
    get parentNode(){ return this._parent || null; },
    appendChild(c){ c._parent = this; this._children.push(c); return c; },
    removeChild(c){ this._children = this._children.filter(x => x !== c); c._parent = null; return c; },
    addEventListener(){}, removeEventListener(){},
    set textContent(v){ this._text = String(v); }, get textContent(){ return this._text || ''; },
    querySelector(sel){
      // notify.js pide [data-txt], [data-ok], [data-action]. Devolvemos stubs
      // con onclick asignable; no se ejercitan clicks en este check.
      if(!this._qs) this._qs = {};
      if(!this._qs[sel]) this._qs[sel] = { set textContent(v){}, get textContent(){ return ''; }, onclick: null, style: {} };
      return this._qs[sel];
    }
  };
  return n;
}

function cargar(){
  const body = nodo();
  const registro = {};   // id -> nodo (lo que se hizo appendChild a body con id)
  body.appendChild = function(c){
    c._parent = body;
    body._children.push(c);
    if(c._id) registro[c._id] = c;
    return c;
  };
  const ctx = {
    console,
    setTimeout: () => 1, clearTimeout: () => {},
    document: {
      body,
      getElementById: id => registro[id] || null,
      createElement: () => nodo(),
      addEventListener(){}, removeEventListener(){}
    }
  };
  ctx.window = ctx; ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'src/shared/notify.js'), 'utf8'), ctx, { filename: 'notify.js' });
  ctx._body = body;
  ctx._registro = registro;
  return ctx;
}

// ¿Se abrió el popup centrado? ¿Con qué severidad?
function popup(e){
  const w = e._registro['ceven-error-modal'];
  if(!w || !w._parent) return null;   // sin parent = ya se removió (o nunca)
  const html = w._html || '';
  return {
    centrado: /align-items:center;justify-content:center/.test(w.style.cssText || ''),
    aviso: />Aviso<\/div>/.test(html),
    error: />Error<\/div>/.test(html),
    amber: /#fff4e0/.test(html)
  };
}
// ¿Se creó un cartel de esquina? (el contenedor con position bottom)
function toast(e){
  const s = e._registro['ceven-toast-stack'];
  return !!(s && s._children && s._children.length);
}

console.log('\nEnrutado de carteles · src/shared/notify.js\n');

/* ═══ 1 · Éxito e info: cartel de esquina, nunca popup ═════════════════════ */
console.log('1 · success / info → esquina');
{
  const e = cargar();
  e.showToast('✓ Guardado');
  ok(toast(e) && !popup(e), 'un "✓ ..." es cartel de esquina');
}
{
  const e = cargar();
  e.showToast('Sincronizado con el equipo');
  ok(toast(e) && !popup(e), 'un mensaje neutro (info) también');
}

/* ═══ 2 · Error: popup centrado rojo ══════════════════════════════════════ */
console.log('\n2 · error → popup centrado');
{
  const e = cargar();
  e.showToast('Error: no se pudo guardar');
  const p = popup(e);
  ok(p && p.centrado && p.error && !p.aviso, 'un "Error: ..." abre el popup centrado con título "Error"', JSON.stringify(p));
  ok(!toast(e), 'y NO deja además un cartel de esquina');
}
{
  const e = cargar();
  e.showError('cualquier cosa que vino de una excepción');
  ok(popup(e) && popup(e).error, 'showError() siempre abre el popup, aunque el texto no diga "error"');
}

/* ═══ 3 · Warning: popup centrado ámbar, título "Aviso" ═══════════════════ */
console.log('\n3 · warning → popup centrado "Aviso"');
[
  'No tenés permiso para eliminar esta cotización.',
  'Cargá el canal antes de agregar al pipeline.',
  'La cotización está vacía.',
  '⚠ Ojo: revisá los datos.',
  'La cotización #7 está en el pipeline. Quitala de ahí primero.'
].forEach(function(msg){
  const e = cargar();
  e.showToast(msg);
  const p = popup(e);
  ok(p && p.centrado && p.aviso && p.amber && !toast(e),
     '"' + msg.slice(0, 40) + '…" → popup "Aviso" ámbar', JSON.stringify(p));
});
{
  const e = cargar();
  e.showWarning('mensaje de aviso armado con datos dinámicos');
  ok(popup(e) && popup(e).aviso, 'showWarning() fuerza el popup "Aviso" aunque el texto no matchee ningún patrón');
}

/* ═══ 4 · forceToast: se queda en la esquina ═════════════════════════════ */
console.log('\n4 · forceToast deja el aviso en la esquina');
{
  const e = cargar();
  e.showToast('No tenés permiso para esto.', { forceToast: true });
  ok(toast(e) && !popup(e), 'un warning con forceToast:true vuelve a ser cartel de esquina');
}
{
  const e = cargar();
  e.notifyUndo('Eliminaste 2 cotización(es) — están en la papelera.');
  ok(toast(e) && !popup(e), 'notifyUndo() nunca abre el popup centrado (lleva forceToast)');
}
{
  // Aunque el texto del undo infiera como error/warning, sigue en la esquina.
  const e = cargar();
  e.notifyUndo('No se pudo deshacer del todo, ya no está en el historial.');
  ok(toast(e) && !popup(e), 'notifyUndo() con texto tipo error igual queda en la esquina');
}

console.log('\n' + (fallos
  ? ('✗ ' + fallos + ' de ' + corridas + ' fallaron\n')
  : ('✓ ' + corridas + '/' + corridas + ' OK\n')));
process.exit(fallos ? 1 : 0);
