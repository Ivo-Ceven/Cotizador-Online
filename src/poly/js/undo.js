// ── PIPELINE UNDO ──
var _pipeUndoStack = [];

function pushPipeUndo(id){
  var pipe = getPipeline();
  for(var i=0;i<pipe.length;i++){
    if(pipe[i].id === id){
      _pipeUndoStack.push(JSON.parse(JSON.stringify(pipe[i])));
      if(_pipeUndoStack.length > 30) _pipeUndoStack.shift();
      break;
    }
  }
  updatePipeUndoBtn();
}

// Para deshacer una fila RECIÉN INSERTADA (no había nada antes que snapshotear):
// el marcador _wasInserted le dice a undoPipelineChange() que la borre en vez
// de reemplazarla.
function pushPipeUndoInsert(id){
  _pipeUndoStack.push({id: id, _wasInserted: true});
  if(_pipeUndoStack.length > 30) _pipeUndoStack.shift();
  updatePipeUndoBtn();
}

// Para deshacer una fila RECIÉN ELIMINADA por completo: guardar la fila entera
// (tal como estaba antes de borrarla) para poder reinsertarla.
function pushPipeUndoRemove(row){
  var snap = JSON.parse(JSON.stringify(row));
  snap._wasRemoved = true;
  _pipeUndoStack.push(snap);
  if(_pipeUndoStack.length > 30) _pipeUndoStack.shift();
  updatePipeUndoBtn();
}

function undoPipelineChange(){
  if(!_pipeUndoStack.length) return;
  var prev = _pipeUndoStack.pop();
  var pipe = getPipeline();
  if(prev._wasInserted){
    pipe = pipe.filter(function(r){ return r.id !== prev.id; });
  } else if(prev._wasRemoved){
    delete prev._wasRemoved;
    pipe.push(prev);
  } else {
    for(var i=0;i<pipe.length;i++){
      if(pipe[i].id === prev.id){ pipe[i] = prev; break; }
    }
  }
  savePipeline(pipe);
  renderPipeline();
  updatePipeUndoBtn();
}

function updatePipeUndoBtn(){
  var btn = document.getElementById('pipe-undo-btn');
  if(btn) btn.disabled = (_pipeUndoStack.length === 0);
}

