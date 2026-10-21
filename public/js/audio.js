/* ===== FBF - Audio: efeitos sonoros + musica de fundo (Web Audio, procedural) =====
   Nao usa arquivos externos (sem licenciamento): todos os sons sao gerados em
   tempo real pela Web Audio API. As preferencias (liga/desliga + volumes) ficam
   salvas no localStorage e sao ajustaveis na aba Configuracao. A musica so
   comeca apos o primeiro gesto do usuario (politica de autoplay dos navegadores).
*/
(function(){
'use strict';

var KEY = 'fbf_audio_v1';
var DEF = { music:true, sfx:true, master:0.8, musicVol:0.35, sfxVol:0.7 };
var S = load();
function load(){ try{ return Object.assign({}, DEF, JSON.parse(localStorage.getItem(KEY)||'{}')); }catch(e){ return Object.assign({}, DEF); } }
function save(){ try{ localStorage.setItem(KEY, JSON.stringify(S)); }catch(e){} }

var ctx=null, master=null, musicBus=null, sfxBus=null;
function ensure(){
  if (ctx) return ctx;
  var AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  master = ctx.createGain();  master.gain.value  = S.master;   master.connect(ctx.destination);
  musicBus = ctx.createGain(); musicBus.gain.value = S.music?S.musicVol:0; musicBus.connect(master);
  sfxBus = ctx.createGain();   sfxBus.gain.value   = S.sfxVol;   sfxBus.connect(master);
  return ctx;
}
function resume(){ if (ctx && ctx.state==='suspended'){ try{ ctx.resume(); }catch(e){} } }

/* ---------- blocos de som ---------- */
function tone(freq, start, dur, type, peak, bus){
  var o=ctx.createOscillator(), g=ctx.createGain();
  o.type=type||'sine'; o.frequency.setValueAtTime(freq, start);
  g.gain.setValueAtTime(0.0001, start);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0005, peak||0.3), start+0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, start+dur);
  o.connect(g); g.connect(bus||sfxBus); o.start(start); o.stop(start+dur+0.03);
}
function noise(start, dur, type, freq, q, peak, bus){
  var len=Math.max(1, Math.floor(ctx.sampleRate*dur));
  var b=ctx.createBuffer(1, len, ctx.sampleRate), d=b.getChannelData(0);
  for (var i=0;i<len;i++) d[i]=Math.random()*2-1;
  var src=ctx.createBufferSource(); src.buffer=b;
  var f=ctx.createBiquadFilter(); f.type=type||'bandpass'; f.frequency.value=freq||1200; f.Q.value=q||1;
  var g=ctx.createGain(); g.gain.setValueAtTime(Math.max(0.0005,peak||0.2), start);
  g.gain.exponentialRampToValueAtTime(0.0001, start+dur);
  src.connect(f); f.connect(g); g.connect(bus||sfxBus); src.start(start); src.stop(start+dur);
}
function crowd(start, dur, peak){
  /* torcida: ruido filtrado com swell (sobe e desce) */
  var len=Math.max(1, Math.floor(ctx.sampleRate*dur));
  var b=ctx.createBuffer(1, len, ctx.sampleRate), d=b.getChannelData(0);
  for (var i=0;i<len;i++) d[i]=(Math.random()*2-1);
  var src=ctx.createBufferSource(); src.buffer=b;
  var lp=ctx.createBiquadFilter(); lp.type='lowpass'; lp.frequency.value=900; lp.Q.value=0.7;
  var g=ctx.createGain();
  g.gain.setValueAtTime(0.0001, start);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0005,peak||0.25), start+dur*0.3);
  g.gain.exponentialRampToValueAtTime(0.0001, start+dur);
  src.connect(lp); lp.connect(g); g.connect(sfxBus); src.start(start); src.stop(start+dur);
}

/* ---------- efeitos sonoros ---------- */
function sfx(name){
  if (!S.sfx || !ensure()) return;
  resume();
  var t=ctx.currentTime;
  switch(name){
    case 'click':   tone(620, t, 0.07, 'triangle', 0.18); break;
    case 'nav':     tone(500, t, 0.09, 'sine', 0.16); tone(760, t+0.05, 0.08, 'sine', 0.13); break;
    case 'buy':     tone(784, t, 0.10, 'square', 0.14); tone(1175, t+0.08, 0.14, 'square', 0.12); break;
    case 'error':   tone(220, t, 0.18, 'sawtooth', 0.16); tone(180, t+0.08, 0.20, 'sawtooth', 0.14); break;
    case 'whistle':
      tone(2350, t, 0.22, 'square', 0.10); tone(2360, t, 0.22, 'square', 0.10);
      noise(t, 0.22, 'bandpass', 2300, 9, 0.06); break;
    case 'win':
      [523.25,659.25,783.99,1046.50].forEach(function(f,i){ tone(f, t+i*0.11, 0.30, 'triangle', 0.17); }); break;
    case 'lose':
      [392.00,329.63,261.63].forEach(function(f,i){ tone(f, t+i*0.14, 0.34, 'sawtooth', 0.14); }); break;
    case 'goal':
      crowd(t, 1.6, 0.30);
      [523.25,659.25,783.99,1046.50,1318.51].forEach(function(f,i){ tone(f, t+0.04+i*0.085, 0.45, 'sawtooth', 0.16); });
      tone(2350, t, 0.18, 'square', 0.07); /* apito curto de validacao */
      break;
  }
}

/* ---------- musica de fundo (ambiente de estadio, loop procedural) ---------- */
function midi(n){ return 440*Math.pow(2,(n-69)/12); }
var BPM=72;
var CHORDS=[[57,60,64,69],[55,59,62,67],[53,57,60,65],[52,55,59,64]]; /* Am F C G (grave) */
var ARP=[0,2,1,3,2,1];
var mus={ on:false, timer:null, next:0, step:0, chord:0 };
function pad(freq, t, dur){
  var o=ctx.createOscillator(), o2=ctx.createOscillator(), g=ctx.createGain();
  o.type='sine'; o2.type='triangle';
  o.frequency.value=freq; o2.frequency.value=freq*1.003; /* leve detune */
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.09, t+dur*0.4);
  g.gain.exponentialRampToValueAtTime(0.0001, t+dur);
  o.connect(g); o2.connect(g); g.connect(musicBus);
  o.start(t); o2.start(t); o.stop(t+dur+0.05); o2.stop(t+dur+0.05);
}
function bell(freq, t){
  var o=ctx.createOscillator(), g=ctx.createGain();
  o.type='triangle'; o.frequency.value=freq;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.05, t+0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t+0.7);
  o.connect(g); g.connect(musicBus); o.start(t); o.stop(t+0.75);
}
function scheduler(){
  if (!ctx) return;
  var spb=60/BPM, eighth=spb/2;
  while (mus.next < ctx.currentTime + 0.25){
    var ch=CHORDS[mus.chord];
    if (mus.step % 8 === 0){ ch.forEach(function(m){ pad(midi(m-12), mus.next, spb*4); }); }
    var note=ch[ARP[mus.step % ARP.length] % ch.length];
    bell(midi(note), mus.next);
    mus.next += eighth; mus.step++;
    if (mus.step % 8 === 0){ mus.chord=(mus.chord+1)%CHORDS.length; }
  }
}
function startMusic(){
  if (!S.music || !ensure()) return;
  resume();
  if (musicBus) musicBus.gain.setTargetAtTime(S.musicVol, ctx.currentTime, 0.2);
  if (mus.on) return;
  mus.on=true; mus.next=ctx.currentTime+0.1; mus.step=0; mus.chord=0;
  scheduler();
  mus.timer=setInterval(scheduler, 120);
}
function stopMusic(){
  if (musicBus && ctx) musicBus.gain.setTargetAtTime(0, ctx.currentTime, 0.15);
  if (mus.timer){ clearInterval(mus.timer); mus.timer=null; }
  mus.on=false;
}

/* ---------- API publica ---------- */
window.FBFAudio = {
  settings: function(){ return Object.assign({}, S); },
  sfx: sfx,
  startMusic: startMusic,
  stopMusic: stopMusic,
  isMusicPlaying: function(){ return !!mus.on; },
  setMusicOn: function(on){ S.music=!!on; save(); if (on) startMusic(); else stopMusic(); },
  setSfxOn: function(on){ S.sfx=!!on; save(); if (on) sfx('click'); },
  setMaster: function(v){ S.master=clamp(v); save(); if (master&&ctx) master.gain.setTargetAtTime(S.master, ctx.currentTime, 0.05); },
  setMusicVol: function(v){ S.musicVol=clamp(v); save(); if (musicBus&&ctx&&S.music) musicBus.gain.setTargetAtTime(S.musicVol, ctx.currentTime, 0.05); },
  setSfxVol: function(v){ S.sfxVol=clamp(v); save(); if (sfxBus&&ctx) sfxBus.gain.setTargetAtTime(S.sfxVol, ctx.currentTime, 0.05); if (S.sfx) sfx('click'); }
};
function clamp(v){ v=parseFloat(v); if (isNaN(v)) v=0; return Math.max(0, Math.min(1, v)); }

/* ---------- gatilho por gesto + cliques globais ---------- */
function firstGesture(){
  ensure(); resume();
  if (S.music) startMusic();
  window.removeEventListener('pointerdown', firstGesture);
  window.removeEventListener('keydown', firstGesture);
}
window.addEventListener('pointerdown', firstGesture, { once:false });
window.addEventListener('keydown', firstGesture, { once:false });

/* som sutil ao clicar em botoes / itens de menu */
document.addEventListener('click', function(e){
  var t=e.target;
  if (!t || !t.closest) return;
  if (t.closest('[data-nav],[data-goto],[data-goto3]')){ sfx('nav'); return; }
  if (t.closest('.btn,button')){ sfx('click'); }
});
})();
