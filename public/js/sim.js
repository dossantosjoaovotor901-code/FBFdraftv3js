/* ===== FBF - Simulador de partida em TEMPO REAL (lances com cartas) =====
   Tela de resultado evoluida: o jogo roda ao vivo (relogio correndo em tempo
   real) e os gols vao aparecendo com as cartas reais do artilheiro e do
   assistente conforme os minutos passam. Usa window.FBFCards (C.render).
*/
(function(){
'use strict';
var C = window.FBFCards, esc = C.esc;
function fmt(n){ return (n||0).toLocaleString('pt-BR'); }
function indexCards(arr){ var m={}; (arr||[]).forEach(function(c){ if(c&&c.id!=null) m[String(c.id)]=c; }); return m; }
function findCard(m,id){ return (id!=null && m[String(id)]) ? m[String(id)] : null; }
function mini(c,name){ return c ? '<div class="sim-mini">'+C.render(c,'mini')+'</div>'
                               : '<div class="sim-chip">'+esc(name||'Jogador')+'</div>'; }

// ms por minuto de jogo. “Tempo real” = 1s por minuto (partida de ~90s).
var SPEEDS = { real:1000, normal:420, rapido:170 };
var DEFAULT_SP = 'real';

window.FBFSim = { show: show };

function show(out, r){
  r = r || {};
  var ev = (r.events||[]).slice().sort(function(a,b){ return (a.min||0)-(b.min||0); });
  var goals = ev.filter(function(e){ return (e.type||'goal')==='goal'; });
  var lin = r.lineup || {};
  var idxMe = indexCards(lin.me), idxOp = indexCards(lin.opp);

  var lbl = r.result==='win'?'VITORIA':r.result==='loss'?'DERROTA':'EMPATE';
  var cls = r.result==='win'?'ok':r.result==='loss'?'err':'';

  var html = ''
    + '<div class="section sim-wrap">'
    +   '<h2>Partida <span class="badge '+cls+'" id="simBadge" hidden>'+lbl+'</span></h2>'
    +   '<div class="sim-score">'
    +     '<div class="side"><div class="cr">'+esc(r.me.crest||'')+'</div><div class="nm">'+esc(r.me.name)+'</div></div>'
    +     '<div class="sim-center"><div class="sim-gl"><b id="simGa">0</b><span>:</span><b id="simGb">0</b></div>'
    +       '<div class="sim-clock" id="simClock">00\'</div></div>'
    +     '<div class="side"><div class="cr">'+esc(r.opp.crest||'')+'</div><div class="nm">'+esc(r.opp.name)+'</div></div>'
    +   '</div>'
    +   '<div class="sim-goalflash" id="simFlash"><div class="gf-big" id="simFlashTxt">\u26BD GOL!</div></div>'
    +   '<div class="sim-prog"><div class="bar" id="simBar"></div></div>'
    +   '<div class="sim-controls">'
    +     '<button class="btn primary" id="simPlay">\u25B6 Reproduzir</button>'
    +     (r.customControls != null ? r.customControls
          : '<button class="btn" id="simReset">\u21BA Reiniciar</button>'
          + '<button class="btn" id="simSkip">\u23ED Pular p/ o fim</button>')
    +     '<span class="sim-speed">Ritmo: '
    +       '<button class="btn ghost sp'+(DEFAULT_SP==='real'?' active':'')+'" data-sp="real">Tempo real</button>'
    +       '<button class="btn ghost sp'+(DEFAULT_SP==='normal'?' active':'')+'" data-sp="normal">Normal</button>'
    +       '<button class="btn ghost sp'+(DEFAULT_SP==='rapido'?' active':'')+'" data-sp="rapido">R\u00e1pido</button>'
    +     '</span>'
    +   '</div>'
    +   synergyBlock(r)
    +   '<div class="sim-feed" id="simFeed"><div class="sim-wait" id="simWait">Apite inicial\u2026 a partida vai come\u00e7ar.</div></div>'
    +   '<div id="simEnd"></div>'
    + '</div>';

  out.innerHTML = html;
  wire(out, goals, idxMe, idxOp, r);
}
/* LOGICA DAS CARTAS: sinergias ativas de cada time (calculadas no servidor). */
function synergyBlock(r){
  var sy = r.synergies || {}, me = sy.me || [], op = sy.opp || [];
  var pr = r.procs || {}, pme = pr.me || [], pop = pr.opp || [];
  if (!me.length && !op.length && !pme.length && !pop.length) return '';
  function col(list, procs, who, cls){
    var h = '<div class="syn-col '+cls+'"><span class="syn-who">'+esc(who)+'</span>';
    h += procs.map(function(x){ return '<span class="proc-chip" title="'+esc(x.player)+'">\u26A1 '+esc(x.player.split(' ')[0])+': '+esc(x.abilities)+'</span>'; }).join('');
    h += list.map(function(x){ return '<span class="syn-chip" title="'+esc(x.desc)+'">\u2605 '+esc(x.name)+'</span>'; }).join('');
    if (!procs.length && !list.length) h += '<span class="syn-none">nenhuma habilidade ativou</span>';
    return h + '</div>';
  }
  return '<div class="sim-syn">'+col(me, pme, r.me.name, 'me')+col(op, pop, r.opp.name, 'op')+'</div>';
}
function goalRow(e, idxMe, idxOp, r){
  var mine = e.side==='me';
  var idx = mine ? idxMe : idxOp;
  var sc = e.scorer||{}, as = e.assist;
  var scCard = findCard(idx, sc.id), asCard = as ? findCard(idx, as.id) : null;
  var who = mine ? r.me.name : r.opp.name;
  return '<div class="sim-goal-row '+(mine?'me':'op')+'">'
    +   '<div class="sim-min">'+e.min+'\''+'</div>'
    +   '<div class="sim-goal-body">'
    +     '<div class="sim-goal-tag">\u26BD GOL \u00b7 '+esc(who)+'</div>'
    +     '<div class="sim-cards">'
    +       '<div class="sim-cardcol"><span class="lb">Gol</span>'+mini(scCard, sc.name)+'</div>'
    +       (as ? '<div class="sim-arrow">\u2190</div><div class="sim-cardcol"><span class="lb">Assist\u00eancia</span>'+mini(asCard, as.name)+'</div>' : '')
    +     '</div>'
    +   '</div>'
    + '</div>';
}

function wire(out, goals, idxMe, idxOp, r){
  var clock = out.querySelector('#simClock');
  var bar   = out.querySelector('#simBar');
  var ga    = out.querySelector('#simGa'), gb = out.querySelector('#simGb');
  var feed  = out.querySelector('#simFeed');
  var wait  = out.querySelector('#simWait');
  var endBox= out.querySelector('#simEnd');
  var badge = out.querySelector('#simBadge');
  var playB = out.querySelector('#simPlay');

  var st = { min:0, gi:0, ia:0, ib:0, playing:false, done:false, speed:SPEEDS[DEFAULT_SP], timer:null };

  function pad(n){ return (n<10?'0':'')+n; }
  function setClock(m){ clock.textContent = pad(m)+'\''; var pct = Math.min(100, m/90*100);
    bar.style.width = pct+'%'; }

  // Gol "do nada": flash/pop surpresa, sem nenhum indicador antecipando o lance.
  var flash = out.querySelector('#simFlash'), flashTxt = out.querySelector('#simFlashTxt');
  var flashTO = null;
  function popFlash(mine){
    if (!flash) return;
    flashTxt.textContent = mine ? '\u26BD GOOOL!' : '\u26BD GOL do advers\u00e1rio';
    if (window.FBFAudio) window.FBFAudio.sfx('goal');
    flash.classList.remove('on'); void flash.offsetWidth; flash.classList.add('on');
    clearTimeout(flashTO);
    flashTO = setTimeout(function(){ flash.classList.remove('on'); }, 1100);
  }

  function addGoal(e){
    if (e.side==='me'){ st.ia++; ga.textContent=st.ia; } else { st.ib++; gb.textContent=st.ib; }
    if (wait){ wait.remove(); wait=null; }
    var row = document.createElement('div');
    row.innerHTML = goalRow(e, idxMe, idxOp, r);
    var node = row.firstElementChild;
    node.classList.add('pop');
    feed.insertBefore(node, feed.firstChild);
    popFlash(e.side==='me');
    flashScore();
  }
  function flashScore(){ var c=out.querySelector('.sim-gl'); if(!c) return; c.classList.remove('hit'); void c.offsetWidth; c.classList.add('hit'); }

  function reset(){
    clearInterval(st.timer);
    st.min=0; st.gi=0; st.ia=0; st.ib=0; st.playing=false; st.done=false;
    setClock(0); ga.textContent='0'; gb.textContent='0';
    feed.innerHTML = '<div class="sim-wait" id="simWait">Apite inicial\u2026 a partida vai come\u00e7ar.</div>';
    wait = out.querySelector('#simWait');
    endBox.innerHTML=''; badge.hidden=true;
    playB.innerHTML='\u25B6 Reproduzir';
  }

  function finish(){
    clearInterval(st.timer);
    st.playing=false; st.done=true;
    setClock(90);
    if (window.FBFAudio){
      window.FBFAudio.sfx('whistle');
      window.FBFAudio.sfx(r.result==='win'?'win':r.result==='loss'?'lose':'whistle');
    }
    ga.textContent=r.me.goals; gb.textContent=r.opp.goals;
    badge.hidden=false;
    playB.innerHTML='\u25B6 Reproduzir';
    if (st.ia===0 && st.ib===0 && wait){ wait.textContent='Sem gols nesta partida.'; }
    var h='<div class="sim-final">Fim de jogo \u00b7 '+r.me.goals+' x '+r.opp.goals+'</div>';
    if (r.endHtml != null){            /* tela de fim personalizada (ex.: Draft Aleatorio) */
      endBox.innerHTML = h + r.endHtml;
      if (typeof r.onEnd === 'function') r.onEnd(endBox);
      return;
    }
    if (r.reward) h+='<div class="badge gold" style="margin-top:12px;display:inline-block">Recompensa: '+fmt(r.reward)+' FBF</div>';
    if (r.selfcard && r.selfcard.gained) h+='<div class="badge" style="margin-top:12px;margin-left:8px;display:inline-block">Sua carta: +'+r.selfcard.gained+' XP</div>';
    h+='<div style="margin-top:16px"><button class="btn primary" id="playAgain">Jogar de novo</button></div>';
    endBox.innerHTML=h;
    var pa=out.querySelector('#playAgain');
    if (pa) pa.onclick=function(){ var b=document.querySelector('[data-bot]'); if(b) b.click(); };
  }

  function tick(){
    st.min++;
    if (st.min>=90){ finish(); return; }
    setClock(st.min);
    while (st.gi < goals.length && goals[st.gi].min <= st.min){ addGoal(goals[st.gi]); st.gi++; }
  }

  function play(){
    if (st.done) reset();
    if (st.playing){ st.playing=false; clearInterval(st.timer); playB.innerHTML='\u25B6 Continuar'; return; }
    st.playing=true; playB.innerHTML='\u2016 Pausar';
    if (st.min===0 && window.FBFAudio) window.FBFAudio.sfx('whistle');   /* apito inicial */
    clearInterval(st.timer);
    st.timer=setInterval(tick, st.speed);
  }

  playB.onclick = play;
  var rb = out.querySelector('#simReset'), sk = out.querySelector('#simSkip');
  if (rb) rb.onclick = function(){ reset(); };
  if (sk) sk.onclick = function(){
    clearInterval(st.timer);
    while (st.gi < goals.length){ addGoal(goals[st.gi]); st.gi++; }
    finish();
  };
  if (typeof r.onControls === 'function') r.onControls(out);
  out.querySelectorAll('.sim-speed .sp').forEach(function(b){
    b.onclick = function(){
      out.querySelectorAll('.sim-speed .sp').forEach(function(x){ x.classList.remove('active'); });
      b.classList.add('active');
      st.speed = SPEEDS[b.getAttribute('data-sp')] || SPEEDS.normal;
      if (st.playing){ clearInterval(st.timer); st.timer=setInterval(tick, st.speed); }
    };
  });

  // Inicia automaticamente ao abrir o resultado.
  setTimeout(play, 400);
}
})();
