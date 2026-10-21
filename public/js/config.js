/* ===== FBF - Aba Configuracao (som & musica) ===== */
(function(){
'use strict';
var esc = window.FBFCards.esc, icon = window.FBF_icon;
var P = window.FBF_PAGES;
function el(id){ return document.getElementById(id); }
function A(){ return window.FBFAudio; }

function pct(v){ return Math.round((v||0)*100); }

P.config = async function(root){
  var a = A();
  var s = a ? a.settings() : { music:true, sfx:true, master:0.8, musicVol:0.35, sfxVol:0.7 };
  var avail = !!a;

  var g = window.FBFGfx ? window.FBFGfx.settings() : { lite:true, anim:true };

  var visualHtml = '<div class="section"><h2>'+icon('star')+' Visual</h2>'
    + '<p class="page-sub" style="margin:-6px 0 16px">Deixe a interface mais leve e limpa, do jeito que preferir.</p>'
    + '<div class="panel cfg-panel">'
    +   '<div class="cfg-row">'
    +     '<div class="cfg-lb">'+icon('cog')+' <div><b>Modo simples</b><span>Menos brilhos e efeitos nas cartas. Visual limpo e rapido.</span></div></div>'
    +     switchHtml('cfgLite', g.lite)
    +   '</div>'
    +   '<hr class="cfg-hr">'
    +   '<div class="cfg-row">'
    +     '<div class="cfg-lb">'+icon('cards')+' <div><b>Animacoes</b><span>Transicoes e movimentos das cartas e menus.</span></div></div>'
    +     switchHtml('cfgAnim', g.anim)
    +   '</div>'
    + '</div></div>';

  var html = '<h1 class="page-title">'+icon('cog')+' Configuracao</h1>'
    + '<p class="page-sub">Ajuste o visual, os efeitos sonoros e a musica de fundo do jogo. '
    + 'Suas preferencias ficam salvas neste dispositivo.</p>'
    + visualHtml;

  if (!avail){
    html += '<div class="panel"><b>Seu navegador nao suporta audio Web Audio.</b>'
      + '<p style="color:var(--ink2);margin-top:8px">Os controles de som nao estao disponiveis aqui.</p></div>';
    root.innerHTML = html; wireVisual(); return;
  }

  html += '<div class="panel cfg-panel">'
    + '<div class="cfg-row">'
    +   '<div class="cfg-lb">'+icon('music')+' <div><b>Musica de fundo</b><span>Trilha ambiente de estadio em loop</span></div></div>'
    +   switchHtml('cfgMusic', s.music)
    + '</div>'
    + '<div class="cfg-row range'+(s.music?'':' off')+'" id="cfgMusicVolRow">'
    +   '<div class="cfg-lb"><div><b>Volume da musica</b><span id="cfgMusicVolLb">'+pct(s.musicVol)+'%</span></div></div>'
    +   '<input type="range" min="0" max="100" value="'+pct(s.musicVol)+'" id="cfgMusicVol" class="cfg-range">'
    + '</div>'
    + '<hr class="cfg-hr">'
    + '<div class="cfg-row">'
    +   '<div class="cfg-lb">'+icon('sound')+' <div><b>Efeitos sonoros</b><span>Gols, apito, cliques e compras</span></div></div>'
    +   switchHtml('cfgSfx', s.sfx)
    + '</div>'
    + '<div class="cfg-row range'+(s.sfx?'':' off')+'" id="cfgSfxVolRow">'
    +   '<div class="cfg-lb"><div><b>Volume dos efeitos</b><span id="cfgSfxVolLb">'+pct(s.sfxVol)+'%</span></div></div>'
    +   '<input type="range" min="0" max="100" value="'+pct(s.sfxVol)+'" id="cfgSfxVol" class="cfg-range">'
    + '</div>'
    + '<hr class="cfg-hr">'
    + '<div class="cfg-row range">'
    +   '<div class="cfg-lb"><div><b>Volume geral</b><span id="cfgMasterLb">'+pct(s.master)+'%</span></div></div>'
    +   '<input type="range" min="0" max="100" value="'+pct(s.master)+'" id="cfgMaster" class="cfg-range">'
    + '</div>'
    + '</div>';

  html += '<div class="section" style="margin-top:22px"><h2>Testar sons</h2>'
    + '<div class="toolbar">'
    +   '<button class="btn" data-test="goal">'+icon('ball')+' Gol</button>'
    +   '<button class="btn" data-test="whistle">'+icon('trophy')+' Apito</button>'
    +   '<button class="btn" data-test="win">'+icon('star')+' Vitoria</button>'
    +   '<button class="btn" data-test="buy">'+icon('coin')+' Compra</button>'
    +   '<button class="btn" data-test="click">Clique</button>'
    + '</div>'
    + '<p class="page-sub" style="margin-top:4px">Dica: a musica comeca automaticamente apos a sua primeira interacao na pagina.</p>'
    + '</div>';

  root.innerHTML = html;
  wireVisual();

  // Musica on/off
  el('cfgMusic').onchange = function(){
    a.setMusicOn(this.checked);
    el('cfgMusicVolRow').classList.toggle('off', !this.checked);
  };
  // Efeitos on/off
  el('cfgSfx').onchange = function(){
    a.setSfxOn(this.checked);
    el('cfgSfxVolRow').classList.toggle('off', !this.checked);
  };
  // Volumes
  el('cfgMusicVol').oninput = function(){ var v=this.value/100; a.setMusicVol(v); el('cfgMusicVolLb').textContent=this.value+'%'; };
  el('cfgSfxVol').oninput   = function(){ var v=this.value/100; el('cfgSfxVolLb').textContent=this.value+'%'; a.setSfxVol(v); };
  el('cfgMaster').oninput   = function(){ var v=this.value/100; a.setMaster(v); el('cfgMasterLb').textContent=this.value+'%'; };
  // Testes
  root.querySelectorAll('[data-test]').forEach(function(b){
    b.onclick = function(){ a.sfx(b.getAttribute('data-test')); };
  });
};

function wireVisual(){
  var g = window.FBFGfx;
  var lite = el('cfgLite'), anim = el('cfgAnim');
  if (g && lite) lite.onchange = function(){ g.setLite(this.checked); };
  if (g && anim) anim.onchange = function(){ g.setAnim(this.checked); };
}

function switchHtml(id, on){
  return '<label class="cfg-switch"><input type="checkbox" id="'+id+'"'+(on?' checked':'')+'><span class="cfg-slider"></span></label>';
}
})();
