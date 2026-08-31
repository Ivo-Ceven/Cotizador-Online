var PIPE_MOTIVOS_PERDIDA = [
  'Por precio',
  'Por stock',
  'Por solución no compatible',
  'El proyecto se canceló',
  'Otro motivo'
];

function abrirModalMotivoPerdida(onConfirm, onCancel){
  var old = document.getElementById('ceven-generic-modal');
  if(old) old.parentNode.removeChild(old);
  var wrap = document.createElement('div');
  wrap.id = 'ceven-generic-modal';
  wrap.style.cssText = 'position:fixed;inset:0;z-index:100000;background:rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;font-family:-apple-system,BlinkMacSystemFont,sans-serif';
  wrap.innerHTML =
    '<div style="background:#fff;border:0.5px solid #d2d2d7;border-radius:16px;padding:22px;width:380px;max-width:92vw;box-shadow:0 10px 40px rgba(0,0,0,.15)">'
      + '<div style="font-size:15px;font-weight:600;color:#1d1d1f;margin-bottom:14px">Motivo de pérdida</div>'
      + '<select data-motivo style="border:0.5px solid #d2d2d7;border-radius:8px;padding:9px 11px;font-size:14px;width:100%;outline:none;margin-bottom:10px;box-sizing:border-box;font-family:inherit;background:#fff">'
        + PIPE_MOTIVOS_PERDIDA.map(function(m){ return '<option value="'+cevenEsc(m)+'">'+cevenEsc(m)+'</option>'; }).join('')
      + '</select>'
      + '<textarea data-detalle rows="3" placeholder="Comentario para feedback (opcional)" style="border:0.5px solid #d2d2d7;border-radius:8px;padding:9px 11px;font-size:14px;width:100%;outline:none;margin-bottom:14px;box-sizing:border-box;font-family:inherit;resize:vertical"></textarea>'
      + '<div style="display:flex;gap:8px;justify-content:flex-end">'
        + '<button data-cancel style="border:0.5px solid #d2d2d7;border-radius:980px;padding:8px 16px;font-size:13px;font-weight:500;cursor:pointer;background:#fff;color:#1d1d1f;font-family:inherit">Cancelar</button>'
        + '<button data-ok style="border:none;border-radius:980px;padding:8px 16px;font-size:13px;font-weight:600;cursor:pointer;background:#d70015;color:#fff;font-family:inherit">Marcar Perdido</button>'
      + '</div>'
    + '</div>';
  document.body.appendChild(wrap);
  function close(){ if(wrap.parentNode) wrap.parentNode.removeChild(wrap); }
  wrap.querySelector('[data-ok]').onclick = function(){
    var motivo = wrap.querySelector('[data-motivo]').value;
    var detalle = wrap.querySelector('[data-detalle]').value.trim();
    close();
    onConfirm({motivo: motivo, detalle: detalle});
  };
  wrap.querySelector('[data-cancel]').onclick = function(){ close(); if(onCancel) onCancel(); };
  wrap.onclick = function(ev){ if(ev.target===wrap){ close(); if(onCancel) onCancel(); } };
}
