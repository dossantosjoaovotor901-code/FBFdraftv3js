/* ===== FBF - Efeitos visuais de evento (neve, confete, fogos) ===== */
(function(){
'use strict';
var host = null;
function ensure(){
  if (host) return host;
  host = document.createElement('div');
  host.id = 'fxLayer';
  host.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:80;overflow:hidden';
  document.body.appendChild(host);
  return host;
}
function clear(){ if (host) host.innerHTML=''; }

var GLYPH = { snow:'*', confetti:'[]', hearts:'<3', leaves:'@', stars:'*', bubbles:'o', rain:'|', fireworks:'*' };

function spawn(kind, n){
  var h = ensure();
  for (var i=0;i<n;i++){
    var s = document.createElement('span');
    var size = 8 + Math.random()*14;
    var left = Math.random()*100;
    var dur = 5 + Math.random()*7;
    var delay = Math.random()*4;
    s.textContent = GLYPH[kind] || '*';
    s.style.cssText = 'position:absolute;left:'+left+'%;top:-6%;font-size:'+size+'px;opacity:.65;'
      + 'color:'+(kind==='hearts'?'#ff6b8a':kind==='leaves'?'#5ec46a':kind==='confetti'?['#e8c14a','#5b9dff','#ff5a5a','#37c46a'][i%4]:'#ffffff')
      + ';animation:fallfx '+dur+'s linear '+delay+'s infinite';
    h.appendChild(s);
  }
}

var style = document.createElement('style');
style.textContent = '@keyframes fallfx{0%{transform:translateY(-10vh) rotate(0)}100%{transform:translateY(112vh) rotate(360deg)}}';
document.head.appendChild(style);

window.FBF_applyFx = function(kind){
  clear();
  if (!kind || kind === 'none') return;
  spawn(kind, kind === 'fireworks' ? 26 : 34);
};
})();
