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

function undoPipelineChange(){
  if(!_pipeUndoStack.length) return;
  var prev = _pipeUndoStack.pop();
  var pipe = getPipeline();
  for(var i=0;i<pipe.length;i++){
    if(pipe[i].id === prev.id){ pipe[i] = prev; break; }
  }
  savePipeline(pipe);
  renderPipeline();
  updatePipeUndoBtn();
}

function updatePipeUndoBtn(){
  var btn = document.getElementById('pipe-undo-btn');
  if(btn) btn.disabled = (_pipeUndoStack.length === 0);
}

