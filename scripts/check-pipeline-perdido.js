#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const MARCAS = ['apple', 'poly', 'legamaster'];
const MOTIVOS = ['Por precio', 'Por stock', 'Por solución no compatible', 'El proyecto se canceló', 'Otro motivo'];
let fallos = 0, corridas = 0;

function ok(cond, nombre, detalle){
  corridas++;
  if(cond){ console.log('  ✓ ' + nombre); return; }
  fallos++;
  console.error('  ✗ ' + nombre + (detalle ? '\n      ' + detalle : ''));
}

function cargar(marca){
  const ctx = {
    console,
    document: { getElementById: () => null, createElement: () => ({}), body: {appendChild: () => {}} },
    cevenCanEditPipelineRow: () => true,
    showToast: () => {},
    pushPipeUndo: id => { ctx.undoId = id; },
    tryAutoMerge: () => {},
    savePipeline: pipe => { ctx.guardado = JSON.parse(JSON.stringify(pipe)); },
    renderPipeline: () => { ctx.renderizo = true; }
  };
  ctx.window = ctx;
  ctx.globalThis = ctx;
  ctx._pipe = [{id: 1, ejecutivo: 'AM', estado: 'Cotizado'}];
  ctx.getPipeline = () => ctx._pipe;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'src/shared/pipeline-perdido.js'), 'utf8'), ctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'src', marca, 'js/pipeline-detail.js'), 'utf8'), ctx);
  ctx.tryAutoMerge = () => {};
  return ctx;
}

console.log('\nMotivo de pérdida en pipelines comerciales\n');
ok(JSON.stringify(cargar('apple').PIPE_MOTIVOS_PERDIDA) === JSON.stringify(MOTIVOS),
   'las opciones requeridas están disponibles en el modal');

for(const marca of MARCAS){
  console.log('\n' + marca.toUpperCase());
  const e = cargar(marca);
  let confirmar;
  e.abrirModalMotivoPerdida = (onConfirm, onCancel) => { confirmar = onConfirm; e.cancelar = onCancel; };
  e.updatePipelineStatus(1, 'Perdido');
  ok(typeof confirmar === 'function', 'elegir Perdido abre el selector de motivo');
  ok(!e.guardado, 'no guarda antes de confirmar el motivo');
  confirmar({motivo: 'Por stock', detalle: 'Sin disponibilidad local'});
  ok(e._pipe[0].estado === 'Perdido', 'guarda el estado Perdido');
  ok(e._pipe[0].perdidoMotivo && e._pipe[0].perdidoMotivo.motivo === 'Por stock'
    && e._pipe[0].perdidoMotivo.detalle === 'Sin disponibilidad local',
  'guarda motivo y comentario opcional');
  ok(e.undoId === 1 && e.renderizo, 'registra undo y vuelve a renderizar');

  e.renderizo = false;
  e.updatePipelineStatus(1, 'Cotizado');
  ok(e._pipe[0].estado === 'Cotizado' && !e._pipe[0].perdidoMotivo,
     'al salir de Perdido elimina el motivo anterior');
}

console.log('\n' + (fallos ? '✗ ' + fallos + ' de ' + corridas + ' fallaron' : '✓ ' + corridas + '/' + corridas + ' OK'));
process.exit(fallos ? 1 : 0);
