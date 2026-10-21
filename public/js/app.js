/* ===== FBF - Aplicacao SPA (shell, login, navegacao, avisos) ===== */
(function(){
'use strict';
var C = window.FBFCards;
var esc = C.esc;
var icon = window.FBF_icon||function(){return '';};
var state = { user:null };
window.FBF_state = state;

function $(sel,root){return (root||document).querySelector(sel);}
function el(id){return document.getElementById(id);}

/* ---------- API ---------- */
async function api(path, opts){
  opts = opts || {};
  var o = { method: opts.method||'GET', headers:{}, credentials:'same-origin' };
  if (opts.body && !(opts.body instanceof FormData)){
    o.headers['Content-Type']='application/json'; o.body=JSON.stringify(opts.body);
  } else if (opts.body) { o.body = opts.body; o.method = opts.method||'POST'; }
  var r = await fetch('/api'+path, o);
  var data = null;
  try { data = await r.json(); } catch(e){}
  if (!r.ok){
    if (r.status===503 && data && data.maintenance && !(state.user && state.user.is_admin)) renderMaintenance(data);
    throw new Error((data&&data.error)||('Erro '+r.status));
  }
  return data;
}
window.FBF_api = api;

function toast(msg, kind){
  var t = document.createElement('div');
  t.className = 'toast '+(kind||'');
  t.textContent = msg;
  el('toasts').appendChild(t);
  setTimeout(function(){ t.style.opacity='0'; t.style.transition='.4s'; setTimeout(function(){t.remove();},400); }, 3400);
}
window.FBF_toast = toast;
function loading(){ return '<div class="loader"><div class="ring"></div></div>'; }
function empty(txt){ return '<div class="empty"><div class="big">'+icon('ball')+'</div>'+esc(txt)+'</div>'; }
function openModal(html){ el('modalBody').innerHTML = html; el('modal').classList.remove('hidden'); }
function closeModal(){ el('modal').classList.add('hidden'); el('modalBody').innerHTML=''; var mc=document.querySelector('#modal .modal-card'); if(mc) mc.classList.remove('wide'); }
window.FBF_closeModal = closeModal;
window.FBF_openModal = openModal;
window.FBF_fmt = function(n){ return (n||0).toLocaleString('pt-BR'); };

/* ---------- Manutencao ---------- */
var maintState = { on:false };
function fmtDateTime(iso){ var d=new Date(iso); return isNaN(d)?'':d.toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'}); }
function renderMaintenance(m){
  maintState = { on:true, message:m.message, until:m.until };
  el('topbar').classList.add('hidden');
  var bn = el('bottomnav'); if (bn) bn.classList.add('hidden');
  var modal = el('modal'); if (modal) modal.classList.add('hidden');
  el('app').innerHTML = '<div class="login-wrap"><div class="login-card">'
    + '<span class="logo">FBF</span><h2>Em manutencao</h2>'
    + '<p>'+esc(m.message||'Voltamos em breve!')+'</p>'
    + (m.until ? '<p style="font-weight:700">Previsao de retorno: '+esc(fmtDateTime(m.until))+'</p>' : '')
    + '<button class="btn primary" id="maintRetry" style="width:100%;margin-top:10px">Verificar novamente</button>'
    + (state.user ? '<button class="btn ghost" id="maintOut" style="width:100%;margin-top:8px">Sair</button>' : '')
    + '</div></div>';
  el('maintRetry').onclick = function(){ checkMaintenance(true); };
  var out = el('maintOut');
  if (out) out.onclick = async function(){ try{ await fetch('/auth/logout',{method:'POST',credentials:'same-origin'}); }catch(e){} location.hash=''; location.reload(); };
}
async function checkMaintenance(manual){
  try{
    var r = await fetch('/api/maintenance',{credentials:'same-origin'}); var m = await r.json();
    if (!m.on){ location.reload(); return; }
    if (manual) toast('Ainda em manutencao.','err');
  }catch(e){}
}
function adminMaintBar(on){
  var b = el('maintBar');
  if (!on){ if (b) b.remove(); return; }
  if (!b){ b = document.createElement('div'); b.id = 'maintBar';
    b.style.cssText = 'background:#b3261e;color:#fff;text-align:center;font-weight:800;padding:6px 10px;font-size:13px;position:sticky;top:0;z-index:50';
    document.body.insertBefore(b, document.body.firstChild); }
  b.textContent = 'MANUTENCAO ATIVA - so administradores conseguem jogar agora';
}

/* ---------- Boot ---------- */
async function boot(){
  try { var mr = await fetch('/api/maintenance',{credentials:'same-origin'}); maintState = await mr.json(); } catch(e){ maintState = { on:false }; }
  try { var r = await api('/me'); state.user = r.user; } catch(e){ state.user = null; }
  if (maintState.on && state.user && !state.user.is_admin){ renderMaintenance(maintState); startLive(); return; }
  if (!state.user){ renderLogin(); return; }
  if (maintState.on && state.user.is_admin) adminMaintBar(true);
  el('topbar').classList.remove('hidden');
  var bn = el('bottomnav'); if (bn) bn.classList.remove('hidden');
  refreshTopbar();
  if (state.user.is_admin) el('nav-admin').classList.remove('hidden');
  bindNav();
  startLive();
  if (window.FBF_loadEvent) window.FBF_loadEvent();
  var hash = location.hash.replace('#','') || 'home';
  navigate(hash);
}

function refreshTopbar(){
  var u = state.user;
  el('topCoins').innerHTML = window.FBF_fmt(u.coins)+' <b>FBF</b>';
  el('topName').textContent = u.global_name || u.username;
  if (u.avatar_url) el('topAvatar').src = u.avatar_url;
  refreshPackBadge();
}
window.FBF_refreshTopbar = refreshTopbar;
function refreshPackBadge(){
  var n = (state.user && state.user.packs_pending) || 0;
  document.querySelectorAll('[data-nav="packs"]').forEach(function(a){
    var b = a.querySelector('.nav-badge');
    if (!n){ if (b) b.remove(); return; }
    if (!b){ b = document.createElement('span'); b.className = 'nav-badge'; a.appendChild(b); }
    b.textContent = n;
  });
}
window.FBF_refreshPackBadge = refreshPackBadge;

/* ---------- Login ---------- */
var LOGIN_ERRORS = {
  config:  'Login com Discord nao configurado no servidor (faltam as credenciais no application.properties).',
  denied:  'Voce cancelou a autorizacao no Discord. Tente novamente.',
  no_code: 'O Discord nao devolveu o codigo de acesso. Tente novamente.',
  state:   'A sessao de login expirou ou e invalida. Tente entrar de novo.',
  token:   'O Discord recusou o login. Confira o Client Secret e se o Redirect cadastrado e identico ao fbf.discord.callback-url.',
  profile: 'Nao consegui ler seu perfil do Discord. Tente novamente.',
  session: 'Nao consegui salvar sua sessao. Tente novamente.',
  oauth:   'Erro ao entrar com o Discord. Tente novamente em instantes.'
};
async function renderLogin(){
  el('topbar').classList.add('hidden');
  var bn = el('bottomnav'); if (bn) bn.classList.add('hidden');
  var errKey = new URLSearchParams(location.search).get('error');
  if (errKey) history.replaceState(null, '', location.pathname + location.hash);
  var cfg = { discord:true, dev:false };
  try { var cr = await fetch('/auth/config',{credentials:'same-origin'}); if (cr.ok) cfg = await cr.json(); } catch(e){}
  var devBox = '';
  if (cfg.dev){
    devBox = '<div class="dev-login"><p style="font-size:13px;margin-bottom:10px;color:var(--ink2)">Ambiente de desenvolvimento</p>'
      + '<div class="field"><input id="devUser" placeholder="Nome de usuario de teste" value="Treinador"></div>'
      + '<label style="font-size:13px;display:flex;gap:8px;align-items:center;margin-bottom:10px;color:var(--ink2)"><input type="checkbox" id="devAdmin" style="width:auto"> Entrar como administrador</label>'
      + '<button class="btn primary" style="width:100%" id="devBtn">Entrar (dev)</button></div>';
  }
  var errBox = errKey ? '<div class="login-error" style="background:rgba(255,90,90,.12);color:#ffb3b3;border:1px solid rgba(255,90,90,.35)">'
    + esc(LOGIN_ERRORS[errKey] || 'Nao foi possivel entrar. Tente novamente.') + '</div>' : '';
  var maintWarn = maintState && maintState.on ? '<div class="login-error" style="background:rgba(255,90,90,.12);color:#ffb3b3;border:1px solid rgba(255,90,90,.35)"><b>Em manutencao.</b> '+esc(maintState.message||'')+' Somente administradores conseguem entrar agora.</div>' : '';
  var cfgWarn = !cfg.discord ? '<div class="login-error" style="background:rgba(232,193,74,.1);color:#ffe9a8;border:1px solid rgba(232,193,74,.35)">O login com Discord ainda nao foi configurado pelo administrador do site.</div>' : '';
  el('app').innerHTML = '<div class="login-wrap"><div class="login-card">'
    + '<span class="logo">FBF</span><h2>Football Draft</h2>'
    + '<p>Monte seu Draft, abra pacotes e colecione cartas. Entre com sua conta do Discord.</p>'
    + errBox + maintWarn + cfgWarn
    + '<button class="discord-btn" id="discordBtn"'+(cfg.discord?'':' disabled')+'>Entrar com Discord</button>'
    + devBox + '</div></div>';
  el('discordBtn').onclick = function(){ this.disabled = true; this.textContent = 'Redirecionando...'; location.href='/auth/discord'; };
  var devBtn = el('devBtn');
  if (devBtn) devBtn.onclick = async function(){
    try{
      var r = await fetch('/auth/dev-login',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({username:el('devUser').value||'Treinador', admin:el('devAdmin').checked})});
      if(!r.ok){ var d=await r.json(); toast(d.error||'Login de desenvolvimento desativado','err'); return; }
      location.hash=''; location.reload();
    }catch(e){ toast('Erro no login de teste','err'); }
  };
}

/* ---------- Navegacao ---------- */
var PAGES = {};
window.FBF_PAGES = PAGES;
/* Marca o hash que a propria navegacao vai gravar, para o listener de
   'hashchange' nao disparar um segundo navigate() (evita renderizar a pagina
   duas vezes - era o que duplicava o "Ranking de treinadores" na tela Jogar). */
var navLock = null;
function bindNav(){
  document.querySelectorAll('[data-nav]').forEach(function(a){
    a.onclick = function(){
      var n = a.getAttribute('data-nav');
      el('mainnav').classList.remove('open');
      navigate(n);
    };
  });
  el('menuToggle').onclick = function(){ el('mainnav').classList.toggle('open'); };
  el('modalClose').onclick = closeModal;
  el('modal').onclick = function(e){ if (e.target === el('modal')) closeModal(); };
}
function navigate(name){
  var u = state.user;
  if (!u){ renderLogin(); return; }
  navLock = name;
  location.hash = name;
  document.querySelectorAll('[data-nav]').forEach(function(a){
    a.classList.toggle('active', a.getAttribute('data-nav') === name);
  });
  var P = PAGES[name] || PAGES.home;
  if (!P){ el('app').innerHTML = empty('Pagina em construcao.'); return; }
  el('app').innerHTML = loading();
  P(el('app')).catch(function(e){
    el('app').innerHTML = '<div class="panel"><b>Erro ao carregar a pagina.</b><p style="color:var(--ink2);margin-top:8px">'+esc(e.message||e)+'</p></div>';
  });
}
window.FBF_navigate = navigate;

/* ---------- "Tempo real" (polling leve) ---------- */
/* O backend Quarkus nao mantem SSE; o front consulta /api/me/live a cada 15s
   e atualiza saldo/cartas/pacotes, mantendo a mesma sensacao de tempo real. */
var liveTimer = null;
function startLive(){
  if (liveTimer) clearInterval(liveTimer);
  liveTimer = setInterval(async function(){
    if (!state.user) return;
    try {
      var r = await fetch('/api/me/live',{credentials:'same-origin'});
      if (!r.ok) return;
      var d = await r.json();
      if (!d || !d.user_id) return;
      if (d.coins !== state.user.coins || d.packs_pending !== state.user.packs_pending){
        state.user.coins = d.coins; state.user.packs_pending = d.packs_pending; state.user.card_count = d.card_count;
        refreshTopbar();
      }
    } catch(e){}
  }, 15000);
}
window.FBF_syncUser = async function(){
  try { var r = await api('/me'); if (r && r.user){ state.user = r.user; refreshTopbar(); } } catch(e){}
};

/* ---------- Evento visual (tema/efeito/banner) ---------- */
window.FBF_applyEvent = function(ev){
  var root = document.documentElement;
  if (!ev){ root.style.removeProperty('--ev-primary'); root.style.removeProperty('--ev-dark'); root.style.removeProperty('--ev-light');
    document.body.style.removeProperty('--page-bg'); el('eventBanner').classList.add('hidden'); return; }
  var t = ev.theme || {};
  if (t.primary) root.style.setProperty('--ev-primary', t.primary);
  if (t.dark) root.style.setProperty('--ev-dark', t.dark);
  if (t.light) root.style.setProperty('--ev-light', t.light);
  if (t.page_bg) document.body.style.setProperty('--page-bg', t.page_bg);
  var bn = ev.banner || {};
  if (bn.text){ el('eventBanner').innerHTML = (ev.emoji?esc(ev.emoji)+' ':'')+esc(bn.text);
    el('eventBanner').style.background = bn.bg || 'linear-gradient(90deg,var(--ev-dark),var(--ev-primary))';
    el('eventBanner').style.color = bn.color || '#161207';
    el('eventBanner').classList.remove('hidden');
  } else el('eventBanner').classList.add('hidden');
};
window.FBF_loadEvent = async function(){
  try { var r = await fetch('/api/event/active',{credentials:'same-origin'}); var d = await r.json();
    if (window.FBF_applyEvent) window.FBF_applyEvent(d.event); } catch(e){}
};

/* ---------- Revelacao de carta concedida ---------- */
window.FBF_showCards = function(cards){
  if (!cards || !cards.length) return;
  var html = '<h3 style="margin-bottom:14px">Cartas conquistadas!</h3><div class="pack-reveal">';
  cards.forEach(function(p, i){
    html += '<div style="animation-delay:'+(i*0.09)+'s">'+C.render(p,'normal')+'</div>';
  });
  html += '</div>';
  openModal(html);
};

/* ---------- Abertura de pacote AO VIVO (walkout) ---------- */
window.FBF_openPack = function(cards, opts){
  opts = opts || {};
  if (!cards || !cards.length){ if (opts.onClose) opts.onClose(); return; }
  var esc = (window.FBFCards && window.FBFCards.esc) || function(s){ return String(s==null?'':s); };
  var ic = window.FBF_icon || function(){ return ''; };
  var A = window.FBFAudio;
  var tier = opts.tier || 'bronze';
  var tag = opts.tag || tier.toUpperCase();
  var noAnim = document.documentElement.classList.contains('gfx-noanim');

  var best = cards.reduce(function(a,b){
    return (Number(b.overall)||0) > (Number(a.overall)||0) ? b : a; }, cards[0]);

  var ov = document.createElement('div');
  ov.className = 'po-overlay tier-' + tier;
  if (opts.colors && /^[-#0-9a-fA-F:;p ]+$/.test(opts.colors)) ov.setAttribute('style', opts.colors);
  ov.innerHTML =
      '<div class="po-beam"></div>'
    + '<button class="po-skip" type="button" id="poSkip">Pular</button>'
    + '<div class="po-stage">'
    +   '<button class="po-pack" type="button" aria-label="Abrir pacote">'
    +     '<div class="po-pack-art"><span class="pk-crest">FBF</span>'
    +       '<span class="pk-emblem">'+ic('shield')+'</span>'
    +       '<span class="pk-band">'+esc(tag)+'</span></div>'
    +     '<div class="po-pack-name">'+esc(opts.name||'Pacote')+'</div>'
    +     '<div class="po-hint">Toque para abrir</div>'
    +   '</button>'
    +   '<div class="po-cards"></div>'
    + '</div>'
    + '<div class="po-bar hidden"><button class="btn primary" id="poDone">Continuar</button></div>';
  document.body.appendChild(ov);
  document.body.style.overflow = 'hidden';

  var packBtn = ov.querySelector('.po-pack');
  var cardsBox = ov.querySelector('.po-cards');
  var bar = ov.querySelector('.po-bar');
  var beam = ov.querySelector('.po-beam');
  var timers = [];
  var opened = false;

  function close(){
    timers.forEach(clearTimeout);
    document.body.style.overflow = '';
    ov.remove();
    if (opts.onClose) opts.onClose();
  }
  function buildCards(){
    cardsBox.innerHTML = cards.map(function(p, i){
      return '<div class="po-card'+(p===best?' po-best':'')+'" style="--d:'+(i*0.5)+'s">'
        + C.render(p, 'normal') + '</div>';
    }).join('');
  }
  function finishNow(){
    timers.forEach(clearTimeout); timers = [];
    packBtn.style.display = 'none';
    buildCards();
    cardsBox.classList.add('show','instant');
    bar.classList.remove('hidden');
  }
  function burst(){
    if (opened) return; opened = true;
    if (A && A.sfx) A.sfx('win');
    beam.classList.add('on');
    if (noAnim){ finishNow(); return; }
    packBtn.classList.add('open');
    buildCards();
    timers.push(setTimeout(function(){
      packBtn.style.display = 'none';
      cardsBox.classList.add('show');
    }, 500));
    cards.forEach(function(p, i){
      timers.push(setTimeout(function(){
        if (A && A.sfx) A.sfx(p===best ? 'goal' : 'click');
      }, 680 + i*500));
    });
    timers.push(setTimeout(function(){
      bar.classList.remove('hidden');
    }, 680 + cards.length*500));
  }

  packBtn.onclick = burst;
  ov.querySelector('#poSkip').onclick = function(){ if (!opened){ opened = true; if (A && A.sfx) A.sfx('win'); beam.classList.add('on'); } finishNow(); };
  ov.querySelector('#poDone').onclick = close;
};

window.addEventListener('hashchange', function(){
  var h = location.hash.replace('#','')||'home';
  if (h === navLock){ navLock = null; return; }
  if (state.user) navigate(h);
});

document.addEventListener('DOMContentLoaded', boot);
})();
