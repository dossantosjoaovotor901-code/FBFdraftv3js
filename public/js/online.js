/* ===== FBF - Aba ONLINE =====
   Tres modos contra outros treinadores:
   - Draft Aleatorio     : fila de busca, times sorteados pelo servidor
   - Draft com meu time  : fila de busca, cada um joga com o "Meu time" salvo
   - Draft Rapido        : lista com todos os jogadores, desafio direto (sem fila),
                           recompensa menor e cooldown de 1 minuto
   O resultado e sempre decidido no servidor; aqui so mostramos. */
(function(){
'use strict';
var C = window.FBFCards, esc = C.esc, api = window.FBF_api, icon = window.FBF_icon;
var P = window.FBF_PAGES;
function el(id){ return document.getElementById(id); }
function loading(){ return '<div class="loader"><div class="ring"></div></div>'; }
function fmt(n){ return (n||0).toLocaleString('pt-BR'); }
function toast(m, t){ if (window.FBF_toast) window.FBF_toast(m, t); }

var MODES = {
  random: { title:'Draft Aleatório', ic:'trophy',
            sub:'Você e o adversário recebem um time sorteado com cartas reais do jogo. Sorte e estratégia decidem.' },
  team:   { title:'Draft com meu time', ic:'shield',
            sub:'Cada um joga com o time salvo em "Meu time". Quem tiver o melhor elenco leva vantagem.' },
  quick:  { title:'Draft Rápido', ic:'ball',
            sub:'Veja todos os jogadores, escolha um e desafie na hora — sem procurar partida. Recompensa menor e intervalo de 1 minuto entre desafios.' }
};
var tab = 'random';
var T = { poll:null, search:null, cd:null, vs:null, list:null };

function stopTimers(){
  Object.keys(T).forEach(function(k){ if (T[k]){ clearInterval(T[k]); T[k] = null; } });
}
function rewardBadges(r){
  if (!r) return '';
  return '<span class="badge gold">Vitória: '+fmt(r.win)+' FBF</span> '
       + '<span class="badge">Empate: '+fmt(r.draw)+' FBF</span> '
       + '<span class="badge">Derrota: '+fmt(r.loss)+' FBF</span>';
}

/* ============================== PAGINA ============================== */
P.online = async function(root){
  stopTimers();
  window.scrollTo(0, 0);
  // Se ja existe uma busca (ou uma partida pronta) volta direto para ela.
  try {
    var q = await api('/online/queue');
    if (q.status === 'searching') return renderSearching(root, q);
    if (q.status === 'matched') return renderFound(root, q.match, q.match.mode);
  } catch(e){ /* segue para o hub */ }
  return renderHub(root);
};
// Links antigos (#match) caem na aba nova.
P.match = async function(){ window.FBF_navigate('online'); };

/* ============================== HUB ============================== */
async function renderHub(root){
  stopTimers();
  var ov = await api('/online/overview');
  var html = '<h1 class="page-title">'+icon('ball')+' Online</h1>'
    + '<p class="page-sub">Enfrente outros treinadores. O resultado é sorteado no servidor e vale para o ranking.</p>'
    + '<div class="on-tabs" role="tablist">';
  Object.keys(MODES).forEach(function(k){
    html += '<button class="on-tab'+(tab===k?' active':'')+'" data-tab="'+k+'" role="tab">'+icon(MODES[k].ic)+'<span>'+MODES[k].title+'</span></button>';
  });
  html += '</div><div id="onPane" class="on-pane"></div><div id="onOut"></div><div id="matchRank"></div>';
  root.innerHTML = html;

  root.querySelectorAll('[data-tab]').forEach(function(b){
    b.onclick = function(){
      tab = b.getAttribute('data-tab');
      root.querySelectorAll('[data-tab]').forEach(function(x){ x.classList.toggle('active', x === b); });
      paintPane(ov);
    };
  });
  paintPane(ov);
  paintRanking();
}

function paintPane(ov){
  if (T.cd){ clearInterval(T.cd); T.cd = null; }
  if (T.list){ clearInterval(T.list); T.list = null; }
  var pane = el('onPane');
  if (!pane) return;
  if (tab === 'quick') return paintQuick(pane, ov);

  var m = MODES[tab];
  var html = '<div class="panel on-mode"><h2>'+esc(m.title)+'</h2><p class="on-sub">'+esc(m.sub)+'</p>'
    + '<div class="on-rw">'+rewardBadges(ov.online_reward)+'</div>';
  var blocked = false;
  if (tab === 'team'){
    if (ov.squad){
      html += '<div class="on-myteam"><span class="on-crest">'+esc(ov.squad.crest||'')+'</span>'
        + '<div><b>'+esc(ov.squad.name)+'</b><div class="on-meta">'+esc(ov.squad.formation)+' · Nota '+ov.squad.rating+' · Química '+ov.squad.chemistry+'</div></div></div>';
    } else {
      blocked = true;
      html += '<div class="on-warn"><b>Você ainda não tem um time salvo.</b> Monte seu time para jogar com ele.</div>';
    }
  }
  html += '<div class="toolbar" style="margin:16px 0 0">'
    + (blocked
        ? '<button class="btn primary" data-goto2="draft">Montar meu time</button>'
        : '<button class="btn primary" id="onSearch">'+icon('ball')+' Procurar jogadores</button>')
    + (tab === 'team' && ov.squad ? '<button class="btn" data-goto3="team">Ver meu time</button>' : '')
    + '</div></div>';
  pane.innerHTML = html;
  var sb = el('onSearch');
  if (sb) sb.onclick = function(){ startSearch(tab, sb); };
}

async function startSearch(mode, btn){
  btn.disabled = true;
  try {
    var r = await api('/online/queue', {method:'POST', body:{mode: mode}});
    var root = el('app');
    if (r.status === 'matched') return renderFound(root, r.match, mode);
    renderSearching(root, r);
  } catch(e){
    toast(e.message, 'err');
    btn.disabled = false;
  }
}

/* ============================== PROCURANDO JOGADORES ============================== */
function renderSearching(root, q){
  stopTimers();
  window.scrollTo(0, 0);
  var mode = q.mode || tab;
  var m = MODES[mode] || MODES.random;
  var started = Date.now() - (q.elapsed||0) * 1000;
  root.innerHTML = '<h1 class="page-title">'+icon('ball')+' Online</h1>'
    + '<div class="panel gold on-search" id="onSearching">'
    +   '<div class="on-radar"><span></span><span></span><span></span><div class="on-radar-ic">'+icon(m.ic)+'</div></div>'
    +   '<h2>Procurando jogadores…</h2>'
    +   '<p class="on-sub">'+esc(m.title)+' · <b id="onElapsed">00:00</b></p>'
    +   '<p class="on-sub" id="onOthers">Aguardando um adversário entrar na fila. Fique nesta tela.</p>'
    +   '<button class="btn danger" id="onCancel">Cancelar busca</button>'
    + '</div>';

  function tickClock(){
    var s = Math.floor((Date.now() - started) / 1000), e = el('onElapsed');
    if (!e){ clearInterval(T.search); T.search = null; return; }
    e.textContent = (s < 600 ? '0' : '') + Math.floor(s/60) + ':' + (s%60 < 10 ? '0' : '') + (s%60);
  }
  T.search = setInterval(tickClock, 1000);
  tickClock();

  var busy = false;
  async function poll(){
    if (busy) return;
    if (!el('onSearching')){            // saiu da tela: cancela a busca no servidor
      clearInterval(T.poll); T.poll = null;
      try { await api('/online/queue/cancel', {method:'POST', body:{}}); } catch(e){}
      return;
    }
    busy = true;
    try {
      var r = await api('/online/queue');
      if (r.status === 'matched'){ stopTimers(); return renderFound(root, r.match, mode); }
      if (r.status === 'timeout' || r.status === 'idle'){
        stopTimers();
        toast(r.status === 'timeout' ? 'Nenhum jogador encontrado agora. Tente de novo em instantes.' : 'Busca encerrada.', 'err');
        return renderHub(root);
      }
      var o = el('onOthers');
      if (o && r.others > 0) o.textContent = r.others + ' jogador(es) na fila — pareando…';
    } catch(e){ /* falha de rede: tenta de novo no proximo ciclo */ }
    busy = false;
  }
  T.poll = setInterval(poll, 2000);

  el('onCancel').onclick = async function(){
    this.disabled = true;
    stopTimers();
    try {
      var r = await api('/online/queue/cancel', {method:'POST', body:{}});
      if (r.status === 'matched') return renderFound(root, r.match, mode);
    } catch(e){}
    renderHub(root);
  };
}

/* ============================== PARTIDA ENCONTRADA ============================== */
function lineupHtml(list){
  return (list||[]).map(function(c){ return '<div class="on-card">'+C.render(c,'mini')+'</div>'; }).join('');
}
function teamBlock(t, list, cls){
  return '<div class="on-team '+cls+'">'
    + '<div class="on-crest big">'+esc(t.crest||'')+'</div>'
    + '<div class="on-tname">'+esc(t.name)+'</div>'
    + '<div class="on-meta">'+(t.formation ? esc(t.formation)+' · ' : '')+'Nota '+(t.rating||'-')+'</div>'
    + '<div class="on-lineup">'+lineupHtml(list)+'</div></div>';
}

function renderFound(root, m, mode){
  stopTimers();
  window.scrollTo(0, 0);
  var left = 10, started = false;
  var title = (MODES[m.mode || mode] || MODES.random).title;
  root.innerHTML = '<h1 class="page-title">'+icon('ball')+' Partida encontrada!</h1>'
    + '<p class="page-sub">'+esc(title)+'. Confira os dois times — a bola rola já.</p>'
    + '<div id="onMatchBox"><div class="panel on-vs">'
    +   teamBlock(m.me, (m.lineup||{}).me, 'me')
    +   '<div class="on-x">VS</div>'
    +   teamBlock(m.opp, (m.lineup||{}).opp, 'op')
    + '</div>'
    + '<div class="toolbar" style="margin-top:16px;justify-content:center">'
    +   '<span class="badge gold" id="onCount">Começa em '+left+'s</span>'
    +   '<button class="btn primary" id="onGo">Começar agora</button></div></div>';

  function go(){
    if (started) return; started = true;
    if (T.vs){ clearInterval(T.vs); T.vs = null; }
    playMatch(root, m, mode);
  }
  T.vs = setInterval(function(){
    left--;
    var c = el('onCount');
    if (!c){ clearInterval(T.vs); T.vs = null; return; }
    if (left <= 0) return go();
    c.textContent = 'Começa em '+left+'s';
  }, 1000);
  el('onGo').onclick = go;
}

function playMatch(root, m, mode){
  root.innerHTML = '<h1 class="page-title">'+icon('ball')+' Online</h1><div id="onOut"></div>';
  showResult(el('onOut'), m, mode, function(){ renderHub(root); });
}

/* ============================== RESULTADO (simulador) ============================== */
function showResult(out, r, mode, backFn){
  var again = mode === 'random' || mode === 'team';
  r.endHtml = (r.selfcard && r.selfcard.gained ? '<div class="badge" style="margin:12px 8px 0 0;display:inline-block">Sua carta: +'+r.selfcard.gained+' XP</div>' : '')
    + (r.reward ? '<div class="badge gold" style="margin-top:12px;display:inline-block">Recompensa: '+fmt(r.reward)+' FBF</div>' : '')
    + '<div class="toolbar" style="margin-top:16px">'
    + (again ? '<button class="btn primary" id="onAgain">Procurar de novo</button>' : '')
    + '<button class="btn" id="onBack">Voltar ao Online</button></div>';
  r.onEnd = function(box){
    if (r.coins != null && window.FBF_state && window.FBF_state.user){
      window.FBF_state.user.coins = r.coins; window.FBF_refreshTopbar();
    }
    var b = box.querySelector('#onBack'), a = box.querySelector('#onAgain');
    if (b) b.onclick = backFn;
    if (a) a.onclick = function(){
      a.disabled = true;
      api('/online/queue', {method:'POST', body:{mode: mode}}).then(function(q){
        var root = el('app');
        if (q.status === 'matched') renderFound(root, q.match, mode); else renderSearching(root, q);
      }).catch(function(e){ toast(e.message, 'err'); a.disabled = false; });
    };
  };
  if (window.FBFSim && window.FBFSim.show){ window.FBFSim.show(out, r); }
  else { out.innerHTML = '<div class="panel"><b>'+esc(r.me.name)+' '+r.me.goals+' x '+r.opp.goals+' '+esc(r.opp.name)+'</b></div>'; r.onEnd(out); }
}

/* ============================== DRAFT RAPIDO ============================== */
async function paintQuick(pane, ov){
  pane.innerHTML = '<div class="panel on-mode"><h2>'+esc(MODES.quick.title)+'</h2><p class="on-sub">'+esc(MODES.quick.sub)+'</p>'
    + '<div class="on-rw">'+rewardBadges(ov.quick.reward)+'</div>'
    + '<div id="onQuickCd"></div>'
    + '<div class="toolbar" style="margin:14px 0 0"><input id="onFilter" type="search" placeholder="Buscar jogador..." style="flex:1;min-width:160px">'
    + '<button class="btn sm" id="onReload">Atualizar</button></div>'
    + '<div id="onPlayers" class="on-players">'+loading()+'</div></div>';

  var data = null, wait = ov.quick.wait || 0;
  function paintCd(){
    var b = el('onQuickCd'); if (!b) return;
    b.innerHTML = wait > 0
      ? '<div class="badge gold" style="margin-top:14px;display:inline-block">Aguarde '+wait+'s para desafiar de novo</div>' : '';
    pane.querySelectorAll('[data-challenge]').forEach(function(n){ n.disabled = wait > 0; });
  }
  function startCd(){
    if (T.cd){ clearInterval(T.cd); T.cd = null; }
    paintCd();
    if (wait <= 0) return;
    T.cd = setInterval(function(){
      wait--;
      if (!el('onQuickCd')){ clearInterval(T.cd); T.cd = null; return; }
      if (wait <= 0){ clearInterval(T.cd); T.cd = null; }
      paintCd();
    }, 1000);
  }
  function paintList(){
    var box = el('onPlayers'); if (!box || !data) return;
    var f = (el('onFilter').value || '').trim().toLowerCase();
    var list = data.players.filter(function(p){ return !f || p.name.toLowerCase().indexOf(f) >= 0; });
    if (!list.length){ box.innerHTML = '<div class="empty">'+(data.players.length ? 'Nenhum jogador com esse nome.' : 'Ainda não há outros treinadores cadastrados.')+'</div>'; return; }
    var h = '';
    list.forEach(function(p){
      h += '<div class="on-pl"><span class="on-dot'+(p.online?' on':'')+'" title="'+(p.online?'Online':'Offline')+'"></span>'
        + '<span class="on-crest">'+esc(p.crest||'')+'</span>'
        + '<div class="on-pl-n"><b>'+esc(p.name)+'</b><small>'+(p.rating?('Nota '+p.rating):'Sem time salvo')+(p.online?' · online':'')+'</small></div>'
        + '<button class="btn primary sm" data-challenge="'+p.id+'">Desafiar</button></div>';
    });
    box.innerHTML = h;
    paintCd();
    box.querySelectorAll('[data-challenge]').forEach(function(n){
      n.onclick = function(){ challenge(n.getAttribute('data-challenge')); };
    });
  }
  async function load(){
    try {
      data = await api('/online/players');
      wait = data.wait || 0;
      paintList(); startCd();
    } catch(e){
      var box = el('onPlayers'); if (box) box.innerHTML = '<div class="empty">Não foi possível carregar os jogadores.</div>';
    }
  }
  async function challenge(oid){
    pane.querySelectorAll('[data-challenge]').forEach(function(n){ n.disabled = true; });
    var out = el('onOut');
    out.innerHTML = loading();
    try {
      var r = await api('/online/quick', {method:'POST', body:{opponent_id: Number(oid)}});
      wait = r.wait || ov.quick.cooldown || 60;
      showResult(out, r, 'quick', function(){ out.innerHTML = ''; window.scrollTo({top:0, behavior:'smooth'}); });
      out.scrollIntoView({behavior:'smooth', block:'start'});
      startCd();
    } catch(e){
      out.innerHTML = '<div class="panel"><b>'+esc(e.message)+'</b></div>';
      load();
    }
  }
  el('onFilter').oninput = paintList;
  el('onReload').onclick = load;
  await load();
  T.list = setInterval(function(){ if (el('onPlayers') && !el('onFilter').value) load(); else if (!el('onPlayers')){ clearInterval(T.list); T.list = null; } }, 30000);
}

/* ============================== RANKING ============================== */
async function paintRanking(){
  var box = el('matchRank'); if (!box) return;
  try {
    var rank = await api('/match/ranking');
    var html = '<div class="section"><h2>Ranking de treinadores</h2>';
    if (rank.ranking.length){
      html += '<div class="panel"><table><thead><tr><th>#</th><th>Treinador</th><th>Pts</th><th>V</th><th>E</th><th>D</th></tr></thead><tbody>';
      rank.ranking.forEach(function(x){
        html += '<tr'+(x.me?' style="background:rgba(232,193,74,.08)"':'')+'><td>'+x.rank+'</td>'
          + '<td>'+esc(x.crest||'')+' '+esc(x.name)+'</td><td><b>'+x.points+'</b></td>'
          + '<td>'+x.wins+'</td><td>'+x.draws+'</td><td>'+x.losses+'</td></tr>';
      });
      html += '</tbody></table></div>';
    } else html += '<div class="empty">Ninguém jogou ainda.</div>';
    box.innerHTML = html + '</div>';
  } catch(e){ box.innerHTML = ''; }
}

})();
