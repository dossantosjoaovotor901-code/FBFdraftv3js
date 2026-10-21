/* =====================================================================
   FBF - Preferencias de grafico / visual (modo simples + animacoes)
   Carregado cedo para aplicar as classes antes da UI renderizar.
   Salva apenas neste dispositivo (localStorage).
   ===================================================================== */
(function(){
  'use strict';
  var KEY_LITE = 'fbf_gfx_lite';   // modo simples (menos graficos)
  var KEY_ANIM = 'fbf_gfx_anim';   // animacoes ligadas/desligadas

  function read(key, def){
    try {
      var v = localStorage.getItem(key);
      if (v === null) return def;
      return v === '1';
    } catch(e){ return def; }
  }
  function write(key, on){
    try { localStorage.setItem(key, on ? '1' : '0'); } catch(e){}
  }

  // Padrao: modo simples LIGADO (visual limpo) e animacoes LIGADAS.
  var state = {
    lite: read(KEY_LITE, true),
    anim: read(KEY_ANIM, true)
  };

  function apply(){
    var r = document.documentElement;
    r.classList.toggle('gfx-lite', !!state.lite);
    r.classList.toggle('gfx-noanim', !state.anim);
  }
  apply();

  window.FBFGfx = {
    settings: function(){ return { lite: state.lite, anim: state.anim }; },
    setLite: function(on){ state.lite = !!on; write(KEY_LITE, state.lite); apply(); },
    setAnim: function(on){ state.anim = !!on; write(KEY_ANIM, state.anim); apply(); }
  };
})();
