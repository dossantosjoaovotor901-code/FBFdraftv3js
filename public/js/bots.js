/* ===== FBF - Aba Bots (player-facing) =====
   Reune os dois modos de jogo contra a maquina em um so lugar:
     1) Draft Aleatorio  -> delega ao P.draftgame (SEM cooldown)
     2) Meu Time vs Bots -> escolhe um bot e simula a partida (COM cooldown)
   Segue os padroes do projeto: P.<name>=async(root), window.FBF_api,
   window.FBF_toast, window.FBFSim para o simulador visual. */
(function(){
'use strict';
var C = window.FBFCards, esc = C.esc, api = window.FBF_api, icon = window.FBF_icon;
var P = window.FBF_PAGES;
function el(id){ return document.getElementById(id); }
function loading(){ return '<div class="loader"><div class="ring"></div></div>'; }
function fmt(n){ return (n||0).toLocaleString('pt-BR'); }

// Guarda a sub-aba escolhida para nao perder o contexto ao re-renderizar.
var botsTab = 'team';
var botCdTimer = null;

P.bots = async function(root){
  var html = '<h1 class="page-title">Bots</h1>'
    + '<p class="page-sub">Jogue contra a maquina: monte um Draft Aleatorio na hora ou enfrente os bots com o seu time salvo.</p>'
    + '<div class="on-tabs" id="botsTabs" role="tablist">'
    +   '<button class="on-tab' + (botsTab==='team'?' active':'') + '" data-bt="team" role="tab">' + icon('ball') + '<span>Meu Time vs Bots</span></button>'
    +   '<button class="on-tab' + (botsTab==='random'?' active':'') + '" data-bt="random" role="tab">' + icon('cards') + '<span>Draft Aleatorio</span></button>'
    + '</div>'
    + '<div id="botsPane"></div>';
  root.innerHTML = html;

  root.querySelectorAll('[data-bt]').forEach(function(btn){
    btn.onclick = function(){
      botsTab = btn.getAttribute('data-bt');
      root.querySelectorAll('[data-bt]').forEach(function(b){ b.classList.toggle('active', b===btn); });
      renderPane(el('botsPane'));
    };
  });

  renderPane(el('botsPane'));
};

function renderPane(pane){
  if (!pane) return;
  if (botsTab === 'random'){
    // Draft Aleatorio: SEM cooldown. Reusa o fluxo ja existente.
    pane.innerHTML = loading();
    if (typeof P.draftgame === 'function'){ P.draftgame(pane); }
    else { pane.innerHTML = '<div class="panel"><b>Modo indisponivel.</b></div>'; }
    return;
  }
  renderTeamVsBots(pane);
}

/* -------- Meu Time (salvo) vs Bots -- COM cooldown/limite diario -------- */
async function renderTeamVsBots(pane){
  pane.innerHTML = loading();
  var t, o;
  try {
    t = await api('/draft/team');
    o = await api('/match/opponents');
  } catch(e){
    pane.innerHTML = '<div class="panel"><b>'+esc(e.message||'Erro ao carregar os bots.')+'</b></div>';
    return;
  }

  if (!t.squad){
    pane.innerHTML = '<div class="panel gold"><b>Voce ainda nao tem um time salvo.</b>'
      + '<p style="color:var(--ink2);margin:8px 0 14px">Monte o seu time em "Montar Draft" para enfrentar os bots. (Ou use o <b>Draft Aleatorio</b> aqui ao lado, que nao precisa de time salvo.)</p>'
      + '<button class="btn primary" data-goto="draft">Montar meu time</button></div>';
    return;
  }

  var html = '<div class="panel" style="margin-bottom:20px"><div style="font-weight:800">Seu time: '+esc(t.squad.squad_name||'Meu time')+' '+esc(t.squad.squad_crest||'')+'</div>'
    + '<div style="color:var(--ink2);font-size:13px">Nota '+t.squad.rating+' - Quimica '+t.squad.chemistry+'</div></div>';

  if (o.cooldown && o.cooldown.limit_reached)
    html += '<div class="badge err" style="margin-bottom:14px;display:inline-block">Limite diario de partidas contra bots atingido</div>';
  else if (o.cooldown && o.cooldown.wait > 0)
    html += '<div class="badge gold" id="botCd" style="margin-bottom:14px;display:inline-block">Aguarde '+o.cooldown.wait+'s para jogar contra um bot de novo</div>';

  html += '<div class="section"><h2>Escolha o adversario</h2><div class="grid cols3">';
  (o.bots||[]).forEach(function(b){
    html += '<div class="panel" style="text-align:center;cursor:pointer" data-bot="'+esc(b.key)+'">'
      + '<div style="font-size:38px">'+esc(b.crest||icon('ball'))+'</div>'
      + '<div style="font-weight:800;margin:6px 0">'+esc(b.label)+'</div>'
      + '<div style="color:var(--ink2);font-size:13px">Forca '+b.strength+'</div>'
      + '<div class="badge gold" style="margin-top:8px">Vitoria: '+fmt(b.reward)+' FBF</div></div>';
  });
  html += '</div></div><div id="matchOut"></div><div id="matchRank"></div>';
  pane.innerHTML = html;

  startBotCd((o.cooldown && o.cooldown.wait) || 0);

  pane.querySelectorAll('[data-bot]').forEach(function(n){
    n.onclick = async function(){
      var key = n.getAttribute('data-bot');
      var out = el('matchOut');
      out.innerHTML = loading();
      try{
        var r = await api('/match/play',{method:'POST',body:{type:'bot', difficulty:key}});
        if (window.FBF_state && window.FBF_state.user){ window.FBF_state.user.coins = r.coins; }
        if (window.FBF_refreshTopbar) window.FBF_refreshTopbar();
        showResult(out, r);
        out.scrollIntoView({behavior:'smooth', block:'start'});
        // Recarrega os cooldowns/limite apos jogar.
        refreshCooldown();
      }catch(e){
        out.innerHTML = '<div class="panel"><b>'+esc(e.message)+'</b></div>';
        refreshCooldown();
      }
    };
  });

  // Ranking dos treinadores.
  try{
    var rank = await api('/match/ranking');
    var rh = '<div class="section"><h2>Ranking de treinadores</h2>';
    if (rank.ranking && rank.ranking.length){
      rh += '<div class="panel"><table><thead><tr><th>#</th><th>Treinador</th><th>Pts</th><th>V</th><th>E</th><th>D</th></tr></thead><tbody>';
      rank.ranking.forEach(function(x){
        rh += '<tr'+(x.me?' style="background:rgba(232,193,74,.08)"':'')+'><td>'+x.rank+'</td>'
          + '<td>'+esc(x.crest||'')+' '+esc(x.name)+'</td><td><b>'+x.points+'</b></td>'
          + '<td>'+x.wins+'</td><td>'+x.draws+'</td><td>'+x.losses+'</td></tr>';
      });
      rh += '</tbody></table></div>';
    } else rh += '<div class="empty">Ninguem jogou ainda.</div>';
    rh += '</div>';
    var rankBox = el('matchRank');
    if (rankBox) rankBox.innerHTML = rh;
  }catch(e){ /* ranking e opcional */ }
}

// Reconsulta apenas os cooldowns/limite sem redesenhar a lista toda.
async function refreshCooldown(){
  try{
    var o = await api('/match/opponents');
    var old = el('botCd'); if (old) old.remove();
    if (o.cooldown && o.cooldown.wait > 0){
      var pane = el('botsPane'); if (!pane) return;
      var badge = document.createElement('div');
      badge.className = 'badge gold'; badge.id = 'botCd';
      badge.style.cssText = 'margin-bottom:14px;display:inline-block';
      badge.textContent = 'Aguarde '+o.cooldown.wait+'s para jogar contra um bot de novo';
      var sec = pane.querySelector('.section'); if (sec) pane.insertBefore(badge, sec);
      startBotCd(o.cooldown.wait);
    }
  }catch(e){ /* ignore */ }
}

// Contador do cooldown descendo segundo a segundo.
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

function showResult(out, r){
  // Usa o simulador visual (campo + lances com cartas) quando disponivel.
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
})();
