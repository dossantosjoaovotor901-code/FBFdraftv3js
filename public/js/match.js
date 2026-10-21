/* ===== FBF - Jogar (partidas contra bot, ranking, recompensas) ===== */
(function(){
'use strict';
var C = window.FBFCards, esc = C.esc, api = window.FBF_api, icon = window.FBF_icon;
var P = window.FBF_PAGES;
function el(id){return document.getElementById(id);}
function loading(){ return '<div class="loader"><div class="ring"></div></div>'; }
function fmt(n){ return (n||0).toLocaleString('pt-BR'); }

P.match = async function(root){
  var t = await api('/draft/team');
  var o = await api('/match/opponents');
  var rw = await api('/match/rewards');
  var html = '<h1 class="page-title">Jogar</h1><p class="page-sub">Enfrente os bots da arena. O resultado e simulado no servidor.</p>';

  if (!t.squad){
    html += '<div class="panel gold"><b>Voce ainda nao tem um time salvo.</b>'
      + '<p style="color:var(--ink2);margin:8px 0 14px">Monte o seu time em "Montar Draft" para poder jogar.</p>'
      + '<button class="btn primary" data-goto2="draft">Montar meu time</button></div>';
    root.innerHTML = html;
    return;
  }

  html += '<div class="panel" style="margin-bottom:20px"><div style="font-weight:800">Seu time: '+esc(t.squad.squad_name||'Meu time')+' '+esc(t.squad.squad_crest||'')+'</div>'
    + '<div style="color:var(--ink2);font-size:13px">Nota '+t.squad.rating+' - Quimica '+t.squad.chemistry+'</div></div>';

  if (o.cooldown && o.cooldown.limit_reached)
    html += '<div class="badge err" style="margin-bottom:14px;display:inline-block">Limite diario de partidas contra bots atingido</div>';
  else if (o.cooldown && o.cooldown.wait > 0)
    html += '<div class="badge gold" id="botCd" style="margin-bottom:14px;display:inline-block">Aguarde '+o.cooldown.wait+'s para jogar contra um bot de novo</div>';

  html += '<div class="section"><h2>Escolha o adversario</h2><div class="grid cols3">';
  o.bots.forEach(function(b){
    html += '<div class="panel" style="text-align:center;cursor:pointer" data-bot="'+esc(b.key)+'">'
      + '<div style="font-size:38px">'+esc(b.crest||icon('ball'))+'</div>'
      + '<div style="font-weight:800;margin:6px 0">'+esc(b.label)+'</div>'
      + '<div style="color:var(--ink2);font-size:13px">Forca '+b.strength+'</div>'
      + '<div class="badge gold" style="margin-top:8px">Vitoria: '+fmt(b.reward)+' FBF</div></div>';
  });
  html += '</div></div><div id="matchOut"></div>'
    + '<div class="section" id="onlineSec"><h2>Jogadores online <button class="btn ghost" id="onlineRefresh" style="float:right;padding:4px 10px;font-size:12px">Atualizar</button></h2>'
    + '<p class="page-sub" style="margin-top:0">Desafie outro treinador em uma partida de <b>draft aleatorio</b> (cartas reais sorteadas pelo servidor). Ha um intervalo de 1 minuto entre desafios.</p>'
    + '<div id="onlineList"></div></div>'
    + '<div id="matchRank"></div>';
  root.innerHTML = html;

  // Contador do cooldown dos bots correndo em tempo real (igual ao do PvP).
  startBotCd((o.cooldown && o.cooldown.wait) || 0);

  root.querySelectorAll('[data-bot]').forEach(function(n){
    n.onclick = async function(){
      var key = n.getAttribute('data-bot');
      var out = el('matchOut');
      out.innerHTML = loading();
      try{
        var r = await api('/match/play',{method:'POST',body:{type:'bot', difficulty:key}});
        window.FBF_state.user.coins = r.coins; window.FBF_refreshTopbar();
        showResult(out, r);
      }catch(e){ out.innerHTML = '<div class="panel"><b>'+esc(e.message)+'</b></div>'; }
    };
  });

  var rank = await api('/match/ranking');
  html = '<div class="section"><h2>Ranking de treinadores</h2>';
  if (rank.ranking.length){
    html += '<div class="panel"><table><thead><tr><th>#</th><th>Treinador</th><th>Pts</th><th>V</th><th>E</th><th>D</th></tr></thead><tbody>';
    rank.ranking.forEach(function(x){
      html += '<tr'+(x.me?' style="background:rgba(232,193,74,.08)"':'')+'><td>'+x.rank+'</td>'
        + '<td>'+esc(x.crest||'')+' '+esc(x.name)+'</td><td><b>'+x.points+'</b></td>'
        + '<td>'+x.wins+'</td><td>'+x.draws+'</td><td>'+x.losses+'</td></tr>';
    });
    html += '</tbody></table></div>';
  } else html += '<div class="empty">Ninguem jogou ainda.</div>';
  html += '</div>';
  // Idempotente: escreve no container dedicado (nunca duplica, mesmo se a pagina re-renderizar).
  var rankBox = el('matchRank');
  if (rankBox) rankBox.innerHTML = html;

  var refreshBtn = el('onlineRefresh');
  if (refreshBtn) refreshBtn.onclick = function(){ renderOnline(); };
  renderOnline();
  if (onlineTimer) clearInterval(onlineTimer);
  onlineTimer = setInterval(function(){ if (el('onlineList')) renderOnline(); else clearInterval(onlineTimer); }, 20000);
};

var onlineTimer = null;
var cdTimer = null;
var botCdTimer = null;

// Faz o aviso "Aguarde Ns para jogar contra um bot" descer segundo a segundo.
function startBotCd(wait){
  if (botCdTimer) clearInterval(botCdTimer);
  if (!wait || wait <= 0) return;
  var left = wait;
  botCdTimer = setInterval(function(){
    left--;
    var b = el('botCd');
    if (!b){ clearInterval(botCdTimer); return; }
    if (left <= 0){ clearInterval(botCdTimer); b.remove(); return; }
    b.textContent = 'Aguarde '+left+'s para jogar contra um bot de novo';
  }, 1000);
}

async function renderOnline(){
  var box = el('onlineList');
  if (!box) return;
  var data;
  try { data = await api('/match/online'); } catch(e){ box.innerHTML = '<div class="empty">Nao foi possivel carregar os jogadores online.</div>'; return; }
  var wait = data.wait || 0;
  var cdNote = wait > 0
    ? '<div class="badge gold" id="pvpCd" style="margin-bottom:12px;display:inline-block">Aguarde '+wait+'s para desafiar de novo</div>'
    : '';
  if (!data.players || !data.players.length){
    box.innerHTML = cdNote + '<div class="empty">Nenhum outro treinador online agora. Chame alguem para entrar!</div>';
    startCd(wait);
    return;
  }
  var html = cdNote + '<div class="grid cols3">';
  data.players.forEach(function(p){
    html += '<div class="panel" style="text-align:center">'
      + '<div style="font-size:34px">'+esc(p.crest||'')+'</div>'
      + '<div style="font-weight:800;margin:6px 0">'+esc(p.name)+'</div>'
      + '<div style="color:var(--ink2);font-size:13px">'+(p.rating?('Nota '+p.rating):'Sem time salvo')+'</div>'
      + '<button class="btn primary" style="margin-top:10px" data-challenge="'+p.id+'" data-name="'+esc(p.name)+'"'+(wait>0?' disabled':'')+'>Desafiar</button>'
      + '</div>';
  });
  html += '</div>';
  box.innerHTML = html;
  startCd(wait);
  box.querySelectorAll('[data-challenge]').forEach(function(n){
    n.onclick = async function(){
      var oid = n.getAttribute('data-challenge');
      var out = el('matchOut');
      out.innerHTML = loading();
      try{
        var r = await api('/match/challenge',{method:'POST',body:{opponent_id:Number(oid)}});
        window.FBF_state.user.coins = r.coins; window.FBF_refreshTopbar();
        showResult(out, r);
        out.scrollIntoView({behavior:'smooth', block:'start'});
        renderOnline();
      }catch(e){ out.innerHTML = '<div class="panel"><b>'+esc(e.message)+'</b></div>'; renderOnline(); }
    };
  });
}

function startCd(wait){
  if (cdTimer) clearInterval(cdTimer);
  if (!wait || wait <= 0) return;
  var left = wait;
  cdTimer = setInterval(function(){
    left--;
    var b = el('pvpCd');
    if (left <= 0 || !b){ clearInterval(cdTimer); if (el('onlineList')) renderOnline(); return; }
    b.textContent = 'Aguarde '+left+'s para desafiar de novo';
  }, 1000);
}

function showResult(out, r){
  // Simulador visual (campo aereo + lances com cartas). Fallback para a lista simples.
  if (window.FBFSim && window.FBFSim.show){ try { window.FBFSim.show(out, r); return; } catch(e){ /* fallback abaixo */ } }
  var lbl = r.result==='win'?'VITORIA':r.result==='loss'?'DERROTA':'EMPATE';
  var cls = r.result==='win'?'ok':r.result==='loss'?'err':'';
  var html = '<div class="section"><h2>Resultado <span class="badge '+cls+'">'+lbl+'</span></h2>'
    + '<div class="scoreboard">'
    + '<div class="side"><div class="cr">'+esc(r.me.crest||'')+'</div><div class="nm">'+esc(r.me.name)+'</div><div class="gl">'+r.me.goals+'</div></div>'
    + '<div style="font-size:22px;font-weight:900;color:var(--ink2)">X</div>'
    + '<div class="side"><div class="cr">'+esc(r.opp.crest||'')+'</div><div class="nm">'+esc(r.opp.name)+'</div><div class="gl">'+r.opp.goals+'</div></div>'
    + '</div>';
  if (r.reward){ html += '<div class="badge gold" style="margin-top:12px;display:inline-block">Recompensa: '+fmt(r.reward)+' FBF</div>'; }
  if (r.selfcard && r.selfcard.gained){ html += '<div class="badge" style="margin-top:12px;display:inline-block">Sua carta: +'+r.selfcard.gained+' XP</div>'; }
  html += '<div class="timeline">';
  (r.events||[]).forEach(function(e){
    html += '<div class="ev'+(e.side==='op'?' op':'')+'"><span class="mn">'+e.min+"'</span><span>"+esc(e.text)+'</span></div>';
  });
  html += '</div><button class="btn primary" style="margin-top:16px" id="playAgain">Jogar de novo</button></div>';
  out.innerHTML = html;
  if (el('playAgain')) el('playAgain').onclick = function(){
    var b = document.querySelector('[data-bot]');
    if (b) b.click();
  };
}

document.addEventListener('click', function(e){
  var g = e.target.closest && e.target.closest('[data-goto2]');
  if (g) window.FBF_navigate(g.getAttribute('data-goto2'));
});
})();
