/* ===== FBF - Paginas do jogo ===== */
(function(){
'use strict';
var C = window.FBFCards, esc = C.esc, api = window.FBF_api, icon = window.FBF_icon;
var P = window.FBF_PAGES;
function el(id){return document.getElementById(id);}
function fmt(n){ return (n||0).toLocaleString('pt-BR'); }
function loading(){ return '<div class="loader"><div class="ring"></div></div>'; }
function empty(t){ return '<div class="empty"><div class="big">'+icon('ball')+'</div>'+esc(t)+'</div>'; }

/* ---------------- HOME ---------------- */
var KIND_LABEL = {atk:'Ataque', mid:'Criacao', def:'Defesa', gk:'Goleiro'};
var TIER_LEGEND = [
  [1,'Comum','Funciona em 60% dos jogos. Efeito pequeno.'],
  [2,'Rara','Funciona em 45% dos jogos. Efeito bom.'],
  [3,'Epica','Funciona em 30% dos jogos. Efeito muito forte (OP).']
];
var RULES_LEGEND = [
  ['Nota abaixo de 80','Sem habilidade.'],
  ['Nota 80 a 87','Chance de vir com 1 habilidade Comum (35% a 50%).'],
  ['Nota 88 e 89','70% de chance de 1 habilidade Rara.'],
  ['Nota 90+','1 habilidade Comum garantida + 75% de chance de uma Epica.']
];
var SYN_LEGEND = [
  ['Dupla Letal','Finalizador + armador ativos no mesmo jogo: +ataque.'],
  ['Bloqueio Total','Zagueiro + goleiro ativos: +defesa e +goleiro.'],
  ['Trio Tecnico','3 habilidades de tecnica ativas: +ataque.'],
  ['Elenco Epico','2 habilidades Epicas ativas: bonus em tudo.']
];
function traitLegendHtml(){
  var h = '<h3 class="legend-sub" style="padding-top:18px">Quem recebe habilidade</h3><div class="legend-syn">';
  RULES_LEGEND.forEach(function(x){ h += '<div><b>'+esc(x[0])+'</b><span>'+esc(x[1])+'</span></div>'; });
  h += '</div><h3 class="legend-sub">Raridade e chance de funcionar</h3><div class="legend-syn">';
  TIER_LEGEND.forEach(function(t){ h += '<div><b><span class="tr tr-all tr-t'+t[0]+'">'+t[1].slice(0,3).toUpperCase()+'</span> '+esc(t[1])+'</b><span>'+esc(t[2])+'</span></div>'; });
  h += '</div><h3 class="legend-sub">Categorias</h3><div class="legend-syn">'
    + '<div><b><span class="tr tr-atk">ATQ</span> Ataque</b><span>Finalizacao e dribles: gols e ataque.</span></div>'
    + '<div><b><span class="tr tr-mid">MEI</span> Criacao</b><span>Passe e controle: assistencias e equilibrio.</span></div>'
    + '<div><b><span class="tr tr-def">DEF</span> Defesa</b><span>Desarme e jogo de corpo.</span></div>'
    + '<div><b><span class="tr tr-gk">GOL</span> Goleiro</b><span>Defesas e saida de bola.</span></div></div>'
    + '<h3 class="legend-sub">Sinergias</h3><div class="legend-syn">';
  SYN_LEGEND.forEach(function(x){ h += '<div><b>'+esc(x[0])+'</b><span>'+esc(x[1])+'</span></div>'; });
  return h + '</div>';
}
P.home = async function(root){
  var u = window.FBF_state.user;
  var r = await api('/collection?sort=overall');
  var best = (r.items||[]).slice(0,8);
  var name = esc(u.global_name||u.username);
  var html = '<section class="hero">'
    + '<div class="hero-txt">'
    +   '<span class="kicker">'+icon('ball')+' Temporada FBF</span>'
    +   '<h1 class="hero-title">Fala, <em>'+name+'</em>!</h1>'
    +   '<p class="hero-sub">Monte o time com as habilidades certas, abra pacotes e desafie outros treinadores online.</p>'
    +   '<div class="hero-cta"><button class="btn primary" data-goto="online">'+icon('ball')+' Jogar online</button>'
    +   '<button class="btn" data-goto="packs">'+icon('gift')+' Abrir pacotes</button></div>'
    + '</div>'
    + '<div class="hero-board" aria-label="Seu placar">'
    +   '<div class="hb-cell"><b>'+fmt(u.coins)+'</b><span>Moedas</span></div>'
    +   '<div class="hb-cell"><b>'+fmt(u.card_count)+'</b><span>Cartas</span></div>'
    +   '<div class="hb-cell"><b>'+fmt(u.packs_pending)+'</b><span>Pacotes</span></div>'
    + '</div>'
    + '</section>'
    + '<div class="section"><h2>Modos de jogo</h2><div class="grid cols3 tiles">'
    + shortcut('online','Online','Aleatorio, com seu time ou Draft Rapido','ball','01')
    + shortcut('bots','Bots','Draft Aleatorio e jogar contra os bots','shield','02')
    + shortcut('draft','Montar Draft','Use as suas cartas no Meu time','cards','03')
    + shortcut('packs','Pacotes','Abra pacotes e colecione cartas','gift','04')
    + shortcut('market','Mercado','Loja da FBF e mercado entre jogadores','coin','05')
    + shortcut('selfcard','Minha Carta','Sua carta pessoal evolutiva','user','06')
    + '</div></div>';
  if (best.length){
    html += '<div class="section"><h2>Seus craques</h2><div class="rail">';
    best.forEach(function(i){ html += '<div class="rail-item" data-card="'+i.player.id+'">'+C.render(i.player,'normal')+'</div>'; });
    html += '</div></div>';
  }
  html += '<div class="section"><details class="panel legend"><summary><span>'+icon('star')+' Habilidades e sinergias das cartas</span>'
    + '<small>Cartas de nota 80+ podem vir com habilidades. Cada uma tem raridade e uma chance de funcionar em cada jogo</small></summary>'
    + traitLegendHtml() + '</details></div>';
  root.innerHTML = html;
  root.querySelectorAll('[data-card]').forEach(function(n){
    n.onclick = function(){
      var it = best.filter(function(i){ return String(i.player.id)===n.getAttribute('data-card'); })[0];
      if (it) window.FBF_openModal(cardInfoHtml(it.player));
    };
  });
};
function shortcut(nav, title, sub, ic, num){
  return '<div class="tile" data-goto="'+nav+'">'
    + '<span class="tile-num">'+(num||'')+'</span>'
    + '<span class="tile-ic">'+icon(ic)+'</span>'
    + '<div class="tile-t">'+esc(title)+'</div>'
    + '<div class="tile-s">'+esc(sub)+'</div></div>';
}

/* ---------------- PACOTES ---------------- */
P.packs = async function(root){
  var data = await api('/packs');
  var inv = await api('/packs/inventory');
  var html = '<h1 class="page-title">'+icon('gift')+' Pacotes</h1>'
    + '<p class="page-sub">Abra pacotes para ganhar novas cartas. Toque num pacote para ver a abertura ao vivo.</p>';
  if (inv.total > 0){
    html += '<div class="section"><h2>Seus pacotes ('+inv.total+')</h2><div class="grid cols3">';
    inv.items.forEach(function(it){
      var t = packTier(it.name);
      var cv = packColorVars(it);
      html += '<button class="pk2 tier-'+t+'" data-inv="'+it.pack_id+'" data-name="'+esc(it.name)+'" data-tier="'+t+'" data-colors="'+esc(cv)+'" data-tag="'+esc(packTagFor(it))+'"'+(cv?' style="'+esc(cv)+'"':'')+'>'
        + '<span class="pk2-count">x'+it.count+'</span>'
        + packArtFor(it)
        + '<div class="pk2-nm">'+esc(it.name)+'</div>'
        + '<div class="pk2-meta"><span class="pk2-open">'+icon('gift')+' Abrir agora</span>'
        + '<span class="pk2-cc">'+it.card_count+' cartas</span></div>'
        + '</button>';
    });
    html += '</div></div>';
  }
  html += '<div class="section"><h2>Loja de pacotes</h2>';
  html += data.packs.length ? '<div class="grid cols3">' + data.packs.map(function(p){
    var t = packTier(p.name);
    var cv = packColorVars(p);
    return '<button class="pk2 tier-'+t+'" data-open="'+p.id+'" data-name="'+esc(p.name)+'" data-tier="'+t+'" data-colors="'+esc(cv)+'" data-tag="'+esc(packTagFor(p))+'"'+(cv?' style="'+esc(cv)+'"':'')+'>'
      + packArtFor(p)
      + '<div class="pk2-nm">'+esc(p.name)+'</div>'
      + '<div class="pk2-meta"><span class="pk2-pr">'+fmt(p.price)+' FBF</span>'
      + '<span class="pk2-cc">'+p.card_count+' cartas</span></div>'
      + '</button>';
  }).join('') + '</div>' : empty('Nenhum pacote disponivel.');
  html += '</div>';
  root.innerHTML = html;

  root.querySelectorAll('[data-open]').forEach(function(b){
    b.onclick = async function(){
      b.style.pointerEvents='none';
      try{
        var r = await api('/packs/'+b.getAttribute('data-open')+'/open',{method:'POST'});
        window.FBF_state.user.coins = r.coins; window.FBF_refreshTopbar();
        openPackReveal(b, r, root);
      }catch(e){ window.FBF_toast(e.message,'err'); b.style.pointerEvents=''; }
    };
  });
  root.querySelectorAll('[data-inv]').forEach(function(b){
    b.onclick = async function(){
      b.style.pointerEvents='none';
      try{
        var r = await api('/packs/inventory/'+b.getAttribute('data-inv')+'/open',{method:'POST'});
        window.FBF_syncUser();
        openPackReveal(b, r, root);
      }catch(e){ window.FBF_toast(e.message,'err'); b.style.pointerEvents=''; }
    };
  });
};

function openPackReveal(b, r, root){
  var cards = (r.cards||[]).map(function(c){return c.player;});
  var name = b.getAttribute('data-name');
  var tag = b.getAttribute('data-tag') || packTag(name);
  var colors = b.getAttribute('data-colors') || '';
  var opts = { name:name, tier:b.getAttribute('data-tier'), tag:tag, colors:colors,
    onClose:function(){ P.packs(root); } };
  if (window.FBF_openPack) window.FBF_openPack(cards, opts);
  else { window.FBF_showCards(cards); P.packs(root); }
}

function packTier(name){
  var n=(name||'').toLowerCase();
  if(/mutan/.test(n))return'mut';
  if(/prem|dourad/.test(n))return'prem';
  if(/espec/.test(n))return'spec';
  if(/our|gold/.test(n))return'gold';
  if(/prat|silver/.test(n))return'silver';
  return'bronze';
}
function packTag(name){
  var n=(name||'').toLowerCase();
  if(/mutan/.test(n))return'MUTANTE';
  if(/prem|dourad/.test(n))return'PREMIUM';
  if(/espec/.test(n))return'ESPECIAL';
  if(/our|gold/.test(n))return'OURO';
  if(/prat|silver/.test(n))return'PRATA';
  return'BRONZE';
}
function packArt(name){
  return '<div class="pk2-art"><span class="pk-crest">FBF</span>'
    + '<span class="pk-emblem">'+icon('shield')+'</span>'
    + '<span class="pk-band">'+esc(packTag(name))+'</span></div>';
}
// cores custom do pacote (sanitizadas) injetadas como CSS vars inline, SEM mudar o layout
function packHex(v){ return /^#[0-9a-fA-F]{6}$/.test(v||'') ? v : ''; }
function packColorVars(p){
  var cf=packHex(p.color_from), ct=packHex(p.color_to), ca=packHex(p.color_accent);
  var s='';
  if(cf) s+='--p1:'+cf+';';
  if(ct) s+='--p2:'+ct+';';
  if(ca) s+='--pa:'+ca+';';
  return s;
}
function packTagFor(p){ return (p.tag && (''+p.tag).trim()) ? (''+p.tag).trim().toUpperCase() : packTag(p.name); }
function packArtFor(p){
  return '<div class="pk2-art"><span class="pk-crest">FBF</span>'
    + '<span class="pk-emblem">'+icon('shield')+'</span>'
    + '<span class="pk-band">'+esc(packTagFor(p))+'</span></div>';
}

/* ---------------- MINHAS CARTAS ---------------- */
var colState = { q:'', sort:'overall', trait:'' };
P.collection = async function(root){
  var r = await api('/collection?sort='+(colState.sort==='power'?'overall':colState.sort)+'&q='+encodeURIComponent(colState.q));
  // LOGICA DAS CARTAS: filtro por categoria/raridade da habilidade e ordenacao por poder (no cliente).
  var cnt = {}, hasAny = false;
  (r.items||[]).forEach(function(i){ (i.player.traits||[]).forEach(function(t){
    hasAny = true; cnt['k:'+t.kind] = (cnt['k:'+t.kind]||0)+1; cnt['t:'+t.tier] = (cnt['t:'+t.tier]||0)+1; }); });
  if (colState.trait && !cnt[colState.trait]) colState.trait = '';
  if (colState.trait){
    var ft = colState.trait.split(':'), fk = ft[0], fv = ft[1];
    r.items = r.items.filter(function(i){ return (i.player.traits||[]).some(function(t){ return fk==='k' ? t.kind===fv : String(t.tier)===fv; }); });
  }
  if (colState.sort==='power') r.items = r.items.slice().sort(function(a,b){ return (b.player.power||b.player.overall)-(a.player.power||a.player.overall); });
  var chips = '';
  if (hasAny){
    function chip(key, label, n){ return '<button class="chip'+(colState.trait===key?' on':'')+'" data-trait="'+key+'">'+label+' <i>'+n+'</i></button>'; }
    chips = '<div class="chips"><button class="chip'+(colState.trait?'':' on')+'" data-trait="">Todas</button>';
    ['atk','mid','def','gk'].forEach(function(k){ if (cnt['k:'+k]) chips += chip('k:'+k, '<span class="tr tr-'+k+'">'+KIND_LABEL[k].slice(0,3).toUpperCase()+'</span>'+KIND_LABEL[k], cnt['k:'+k]); });
    [3,2,1].forEach(function(t){ if (cnt['t:'+t]) chips += chip('t:'+t, '<span class="tr tr-all tr-t'+t+'">'+['','COM','RAR','EPI'][t]+'</span>'+['','Comuns','Raras','Epicas'][t], cnt['t:'+t]); });
    chips += '</div>';
  }
  var html = '<h1 class="page-title">Minhas cartas</h1>'
    + '<p class="page-sub">'+fmt(r.total)+' cartas ('+fmt(r.unique)+' unicas)</p>'
    + '<div class="toolbar">'
    + '<input id="colQ" placeholder="Buscar jogador..." value="'+esc(colState.q)+'">'
    + '<select id="colSort"><option value="overall"'+(colState.sort==='overall'?' selected':'')+'>Melhor nota</option>'
    + '<option value="power"'+(colState.sort==='power'?' selected':'')+'>Maior poder (habilidades)</option>'
    + '<option value="rarity"'+(colState.sort==='rarity'?' selected':'')+'>Raridade</option>'
    + '<option value="recent"'+(colState.sort==='recent'?' selected':'')+'>Recentes</option></select></div>' + chips;
  html += r.items.length ? '<div class="grid players">' : empty('Voce ainda nao tem cartas. Abra um pacote!');
  r.items.forEach(function(i){
    html += '<div style="position:relative" data-card="'+i.player.id+'">'+C.render(i.player,'normal')
      + (i.count>1?'<span class="badge gold" style="position:absolute;top:6px;right:6px">x'+i.count+'</span>':'')+'</div>';
  });
  html += '</div>';
  root.innerHTML = html;
  el('colQ').oninput = function(){ clearTimeout(root.__t); var v=this.value; root.__t=setTimeout(function(){ colState.q=v; P.collection(root); },300); };
  el('colSort').onchange = function(){ colState.sort=this.value; P.collection(root); };
  root.querySelectorAll('[data-trait]').forEach(function(b){
    b.onclick = function(){ colState.trait = b.getAttribute('data-trait'); P.collection(root); };
  });
  root.querySelectorAll('[data-card]').forEach(function(n){
    n.onclick = function(){ var pid=n.getAttribute('data-card');
      var it=r.items.find(function(x){return String(x.player.id)===pid;});
      if (!it) return;
      var ucid = it.user_card_ids && it.user_card_ids[0];
      var extra = ucid ? '<div class="ci-sell"><button class="btn primary" id="sellBtn">Vender esta carta</button></div>' : '';
      window.FBF_openModal(cardInfoHtml(it.player, extra));
      var sb = document.getElementById('sellBtn');
      if (sb) sb.onclick = function(){ openSellForm(ucid, it.player, root); };
    };
  });
};

/* ---------------- INFO DA CARTA (secao de detalhes reaproveitavel) ---------------- */
function estValue(ov){ return Math.round(600 * Math.pow(1.22, (Number(ov)||0) - 75)); }

function attrRows(p){
  function r(lb, v){ v = (v==null||v==='')?0:v;
    return '<div class="ci-attr"><span class="ci-k">'+esc(lb)+'</span>'
      + '<span class="ci-bar"><i style="width:'+Math.max(0,Math.min(100,Number(v)))+'%"></i></span>'
      + '<span class="ci-v">'+esc(v)+'</span></div>'; }
  if (p.is_gk){
    return r('DIV',p.gk_div)+r('MAN',p.gk_han)+r('CHU',p.gk_kic)+r('REF',p.gk_ref)+r('VEL',p.gk_spd)+r('POS',p.gk_pos);
  }
  var fin = p.fin!=null && p.fin!=='' ? p.fin : p.sho;
  var ctl = p.ctl!=null && p.ctl!=='' ? p.ctl : p.dri;
  var skl = p.skl!=null && p.skl!=='' ? p.skl : p.dri;
  var jdc = p.jdc!=null && p.jdc!=='' ? p.jdc : p.phy;
  return r('FIN',fin)+r('PAS',p.pas)+r('CTL',ctl)+r('SKL',skl)+r('DEF',p.def)+r('JDC',jdc);
}

function traitInfoHtml(p){
  var list = p.traits || [];
  if (!list.length) return '<div class="ci-traits none">'+(Number(p.overall)<80
    ? 'Sem habilidade: so cartas de nota 80+ podem ter.' : 'Esta carta nao veio com habilidade (nem toda carta 80+ vem).')+'</div>';
  return '<div class="ci-traits"><div class="ci-th">Habilidades</div>' + list.map(function(t){
    return '<div class="ci-tr"><span class="tr tr-'+esc(t.kind)+' tr-t'+(t.tier||1)+'">'+esc(C.traitCode(t))+'</span>'
      + '<div><b>'+esc(t.name)+' <em class="tier-tag t'+(t.tier||1)+'">'+esc(t.tier_name||'')+' - '+esc(t.chance)+'%</em></b><p>'+esc(t.desc)+'</p></div></div>';
  }).join('') + '<div class="ci-note">A % e a chance de a habilidade funcionar em cada partida.</div></div>';
}

function cardInfoHtml(p, extra){
  var team = p.team ? (p.team.name||'') : '';
  var rar = p.rarity ? (p.rarity.name||'') : '';
  var posTxt = C.posList(p.positions) || C.pos(p.position);
  return '<div class="ci-wrap">'
    + '<div class="ci-card">'+C.render(p,'big')+'</div>'
    + '<div class="ci-info">'
    +   '<h3 class="ci-name">'+esc(p.name)+'</h3>'
    +   '<div class="ci-meta">'
    +     '<span class="pill">Nota '+esc(p.overall)+'</span>'
    +     (p.power && p.power!==p.overall ? '<span class="pill pill-power" title="Nota + bonus das habilidades">Poder '+esc(p.power)+'</span>' : '')
    +     (posTxt?'<span class="pill">'+esc(posTxt)+'</span>':'')
    +     (rar?'<span class="pill">'+esc(rar)+'</span>':'')
    +     (team?'<span class="pill">'+esc(team)+'</span>':'')
    +   '</div>'
    +   '<div class="ci-attrs">'+attrRows(p)+'</div>'
    +   traitInfoHtml(p)
    +   '<div class="ci-val"><span>Valor estimado</span><b>'+fmt(estValue(p.overall))+' FBF</b></div>'
    +   (extra||'')
    + '</div></div>';
}

/* Formulario de venda: preco minimo definido pela nota geral (overall) no servidor. */
async function openSellForm(ucid, player, root){
  var body = el('modalBody');
  body.innerHTML = loading();
  try{
    var d = await api('/market/limits/'+ucid);
    if (!d.sellable){
      body.innerHTML = '<div class="panel"><h3>Nao e possivel vender</h3>'
        + '<p style="color:var(--ink2);margin-top:8px">'
        + (d.reason==='exclusive'?'Esta carta exclusiva nao pode ser revendida.':'Esta carta pessoal nao pode ser vendida.')
        + '</p></div>';
      return;
    }
    var min=d.min, max=d.max;
    body.innerHTML = '<div class="sell-form">'
      + '<h3 style="margin-bottom:6px">Vender '+esc(player.name)+'</h3>'
      + '<p style="color:var(--ink2);font-size:13px">Nota '+esc(d.player.overall)+' - o preco minimo e definido pela nota geral da carta.</p>'
      + '<div class="toolbar" style="margin:14px 0">'
      +   '<div class="stat"><div class="n">'+fmt(d.value)+'</div><div class="l">Valor base</div></div>'
      +   '<div class="stat"><div class="n">'+fmt(min)+'</div><div class="l">Preco minimo</div></div>'
      +   '<div class="stat"><div class="n">'+fmt(max)+'</div><div class="l">Preco maximo</div></div>'
      + '</div>'
      + '<label style="font-size:13px;color:var(--ink2)">Preco de venda (FBF)</label>'
      + '<input id="sellPrice" type="number" min="'+min+'" max="'+max+'" step="1" value="'+min+'" style="width:100%;margin:6px 0 14px">'
      + '<button class="btn primary" id="sellConfirm" style="width:100%">Anunciar no mercado</button>'
      + '<div id="sellMsg" style="color:#e55;margin-top:10px;font-size:13px"></div></div>';
    el('sellConfirm').onclick = async function(){
      var btn=this; var price=parseInt(el('sellPrice').value,10)||0;
      var msg=el('sellMsg'); msg.textContent='';
      if (price<min || price>max){ msg.textContent='O preco deve ficar entre '+fmt(min)+' e '+fmt(max)+' FBF.'; return; }
      btn.disabled=true;
      try{
        await api('/market',{method:'POST',body:{user_card_id:ucid,price:price}});
        window.FBF_toast('Carta anunciada no mercado!','ok');
        window.FBF_closeModal();
        if (root) P.collection(root);
      }catch(e){ msg.textContent=(e && e.message)||'Erro ao anunciar'; btn.disabled=false; }
    };
  }catch(e){ body.innerHTML='<div class="panel">'+esc((e && e.message)||'Erro')+'</div>'; }
}

/* ---------------- CARTAS DO JOGO (catalogo completo) ---------------- */
var catState = { q:'', pos:'' };
P.catalog = async function(root){
  var r = await api('/players');
  var all = r.players || [];
  function draw(){
    var list = all.filter(function(p){
      if (catState.q && (p.name||'').toLowerCase().indexOf(catState.q.toLowerCase())<0) return false;
      if (catState.pos){
        var okPos = String(p.position||'').toUpperCase()===catState.pos
          || String(p.positions||'').toUpperCase().indexOf(catState.pos)>=0;
        if (!okPos) return false;
      }
      return true;
    });
    var html = '<h1 class="page-title">Cartas do jogo</h1>'
      + '<p class="page-sub">'+fmt(all.length)+' cartas no total - toque numa carta para ver os detalhes</p>'
      + '<div class="toolbar">'
      + '<input id="catQ" placeholder="Buscar jogador..." value="'+esc(catState.q)+'">'
      + '<select id="catPos"><option value="">Todas as posicoes</option>'
      +   ['GK','ZAG','LAT','VOL','MEI','ATA','PE','PD'].map(function(x){return '<option value="'+x+'"'+(catState.pos===x?' selected':'')+'>'+x+'</option>';}).join('')
      + '</select></div>';
    html += list.length ? '<div class="grid players">' : empty('Nenhuma carta encontrada.');
    list.forEach(function(p){ html += '<div data-cat="'+p.id+'">'+C.render(p,'normal')+'</div>'; });
    html += '</div>';
    root.innerHTML = html;
    el('catQ').oninput = function(){ clearTimeout(root.__t); var v=this.value; root.__t=setTimeout(function(){ catState.q=v; draw(); },300); };
    el('catPos').onchange = function(){ catState.pos=this.value; draw(); };
    root.querySelectorAll('[data-cat]').forEach(function(n){
      n.onclick = function(){ var pid=n.getAttribute('data-cat');
        var p = all.find(function(x){return String(x.id)===pid;});
        if (p) window.FBF_openModal(cardInfoHtml(p));
      };
    });
  }
  draw();
};

/* ---------------- PERFIL ---------------- */
P.profile = async function(root){
  var u = window.FBF_state.user;
  var h = await api('/match/history');
  var s = h.stats || {};
  var html = '<h1 class="page-title">Perfil</h1><p class="page-sub">'+esc(u.global_name||u.username)+'</p>'
    + '<div class="panel gold" style="display:flex;gap:18px;align-items:center;margin-bottom:22px">'
    + '<img src="'+esc(u.avatar_url||'/img/avatar.svg')+'" style="width:64px;height:64px;border-radius:50%;border:2px solid var(--ev-primary)">'
    + '<div><div style="font-weight:900;font-size:19px">'+esc(u.global_name||u.username)+'</div>'
    + '<div style="color:var(--ink2);font-size:13.5px">ID Discord: '+esc(u.discord_id||'-')+'</div>'
    + '<div class="badge gold" style="margin-top:6px">'+fmt(u.coins)+' FBF</div></div></div>'
    + '<div class="section"><h2>Estatisticas</h2><div class="toolbar">'
    + stat(s.played,'Partidas') + stat(s.wins,'Vitorias') + stat(s.draws,'Empates') + stat(s.losses,'Derrotas')
    + stat(s.goals_for,'Gols feitos') + stat(s.goals_against,'Gols sofridos') + stat(s.coins_won,'Moedas ganhas')
    + '</div></div>'
    + '<div class="section"><h2>Historico</h2>';
  if (h.matches && h.matches.length){
    html += '<div class="panel"><table><thead><tr><th>Adversario</th><th>Placar</th><th>Resultado</th><th>Recompensa</th></tr></thead><tbody>';
    h.matches.forEach(function(m){
      var cls = m.result==='win'?'ok':m.result==='loss'?'err':'';
      var lbl = m.result==='win'?'Vitoria':m.result==='loss'?'Derrota':'Empate';
      html += '<tr><td>'+esc(m.opp_label||'-')+'</td><td>'+m.my_goals+' x '+m.opp_goals+'</td>'
        + '<td><span class="badge '+cls+'">'+lbl+'</span></td><td>'+fmt(m.reward)+'</td></tr>';
    });
    html += '</tbody></table></div>';
  } else html += empty('Nenhuma partida jogada ainda.');
  html += '</div>'
    + '<div class="section"><h2>Conta</h2><button class="btn danger" id="logoutBtn">Sair da conta</button></div>';
  root.innerHTML = html;
  el('logoutBtn').onclick = async function(){
    try { await fetch('/auth/logout',{method:'POST',credentials:'same-origin'}); } catch(e){}
    location.hash=''; location.reload();
  };
};
function stat(n,l){ return '<div class="stat"><div class="n">'+fmt(n||0)+'</div><div class="l">'+esc(l)+'</div></div>'; }

/* ---------------- MERCADO / LOJA ---------------- */
P.market = async function(root){
  root.innerHTML = '<h1 class="page-title">Mercado</h1>'
    + '<div class="tabbar"><button class="active" data-mt="shop">Loja da FBF</button>'
    + '<button data-mt="players">Entre jogadores</button><button data-mt="mine">Minhas vendas</button><button data-mt="rules">Regras</button></div>'
    + '<div id="marketBody">'+loading()+'</div>';
  root.querySelectorAll('[data-mt]').forEach(function(b){
    b.onclick = function(){
      root.querySelectorAll('[data-mt]').forEach(function(x){x.classList.remove('active');});
      b.classList.add('active');
      var t = b.getAttribute('data-mt');
      if (t==='shop') shopTab(el('marketBody'));
      else if (t==='players') playersTab(el('marketBody'));
      else if (t==='mine') mineTab(el('marketBody'));
      else rulesTab(el('marketBody'));
    };
  });
  shopTab(el('marketBody'));
};
async function shopTab(body){
  body.innerHTML = loading();
  var d = await api('/market/shop');
  var html = '<p class="page-sub">Cartas do sistema. Nova rotacao a cada '+esc(d.refresh_label)+'.</p>';
  html += d.listings.length ? '' : empty('A loja esta vazia no momento.');
  d.listings.forEach(function(o){
    html += '<div class="panel" style="display:flex;gap:18px;align-items:center;margin-bottom:14px">'
      + '<div style="flex:none">'+C.render(o.player,'mini')+'</div>'
      + '<div style="flex:1;min-width:0">'
      + '<div style="font-weight:800;font-size:16px">'+esc(o.player.name)+'</div>'
      + '<div style="color:var(--ink2);font-size:13px;margin:4px 0">Nota '+o.player.overall+' - '+(o.unlimited?'Estoque ilimitado':(o.remaining)+' restantes')+'</div>'
      + '<div style="font-weight:900;color:var(--gold-light);font-size:17px">'+fmt(o.price)+' FBF</div></div>'
      + '<button class="btn primary" data-buy="'+o.id+'"'+(o.sold_out||o.limit_reached?' disabled':'')+'>'
      + (o.sold_out?'Esgotado':o.limit_reached?'Limite atingido':'Comprar')+'</button></div>';
  });
  body.innerHTML = html;
  body.querySelectorAll('[data-buy]').forEach(function(b){
    b.onclick = async function(){
      b.disabled = true;
      try{
        var r = await api('/market/shop/'+b.getAttribute('data-buy')+'/buy',{method:'POST'});
        window.FBF_state.user.coins = r.coins; window.FBF_refreshTopbar();
        window.FBF_toast('Compra realizada!','ok'); shopTab(body);
      }catch(e){ window.FBF_toast(e.message,'err'); b.disabled=false; }
    };
  });
}
async function playersTab(body){
  body.innerHTML = loading();
  var d = await api('/market');
  if (!d.listings.length){ body.innerHTML = empty('Nenhuma carta anunciada por jogadores.'); return; }
  var html = '';
  d.listings.forEach(function(l){
    html += '<div class="panel" style="display:flex;gap:18px;align-items:center;margin-bottom:14px">'
      + '<div style="flex:none">'+C.render(l.player,'mini')+'</div>'
      + '<div style="flex:1">'+
        '<div style="font-weight:800">'+esc(l.player.name)+'</div>'+
        '<div style="color:var(--ink2);font-size:13px">Vendedor: '+esc(l.seller)+' - Nota '+l.player.overall+'</div>'+
        '<div style="font-weight:900;color:var(--gold-light);margin-top:4px">'+fmt(l.price)+' FBF</div></div>'+
        '<button class="btn primary" data-mbuy="'+l.id+'">Comprar</button></div>';
  });
  body.innerHTML = html;
  body.querySelectorAll('[data-mbuy]').forEach(function(b){
    b.onclick = async function(){
      b.disabled=true;
      try{ var r = await api('/market/'+b.getAttribute('data-mbuy')+'/buy',{method:'POST'});
        window.FBF_toast('Carta adquirida!','ok'); if (r.coins!=null){window.FBF_state.user.coins=r.coins;window.FBF_refreshTopbar();}
        playersTab(body); }catch(e){ window.FBF_toast(e.message,'err'); b.disabled=false; }
    };
  });
}
async function mineTab(body){
  body.innerHTML = loading();
  var d = await api('/market/mine');
  var active = (d.listings||[]).filter(function(l){return l.status==='active';});
  var rest = (d.listings||[]).filter(function(l){return l.status!=='active';});
  if (!d.listings || !d.listings.length){ body.innerHTML = empty('Voce ainda nao colocou nenhuma carta a venda.'); return; }
  var html = '<p class="page-sub">Suas cartas anunciadas no mercado entre jogadores.</p>';
  function line(l, cancellable){
    var st = l.status==='sold'?'Vendida':l.status==='cancelled'?'Cancelada':'A venda';
    return '<div class="panel" style="display:flex;gap:18px;align-items:center;margin-bottom:14px">'
      + '<div style="flex:none">'+C.render(l.player,'mini')+'</div>'
      + '<div style="flex:1;min-width:0"><div style="font-weight:800">'+esc(l.player.name)+'</div>'
      + '<div style="color:var(--ink2);font-size:13px">Nota '+l.player.overall+' - '+st+'</div>'
      + '<div style="font-weight:900;color:var(--gold-light);margin-top:4px">'+fmt(l.price)+' FBF</div></div>'
      + (cancellable?'<button class="btn danger" data-mcancel="'+l.id+'">Cancelar</button>':'')+'</div>';
  }
  active.forEach(function(l){ html += line(l, true); });
  rest.forEach(function(l){ html += line(l, false); });
  body.innerHTML = html;
  body.querySelectorAll('[data-mcancel]').forEach(function(b){
    b.onclick = async function(){
      b.disabled=true;
      try{ await api('/market/'+b.getAttribute('data-mcancel')+'/cancel',{method:'POST'});
        window.FBF_toast('Anuncio cancelado. A carta voltou para a sua colecao.','ok'); mineTab(body);
      }catch(e){ window.FBF_toast((e && e.message)||'Erro','err'); b.disabled=false; }
    };
  });
}
async function rulesTab(body){
  var d = await api('/market/rules');
  body.innerHTML = '<div class="panel"><h3 style="margin-bottom:12px">Regras do mercado</h3>'
    + '<div style="color:var(--ink2);line-height:1.7;white-space:pre-line">'+esc(d.rules||'')+'</div>'
    + '<div class="toolbar" style="margin-top:18px">'
    + '<div class="stat"><div class="n">'+fmt(d.min_price)+'</div><div class="l">Preco minimo</div></div>'
    + '<div class="stat"><div class="n">'+fmt(d.max_price)+'</div><div class="l">Preco maximo</div></div>'
    + '<div class="stat"><div class="n">'+esc(d.refresh_label)+'</div><div class="l">Rotacao</div></div></div></div>';
}

/* Delega os atalhos da home */
document.addEventListener('click', function(e){
  var g = e.target.closest && e.target.closest('[data-goto]');
  if (g) window.FBF_navigate(g.getAttribute('data-goto'));
});
})();
