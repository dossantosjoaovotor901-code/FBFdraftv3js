/* =====================================================================
   FBF - Painel de Administracao (SIMPLIFICADO)
   Antes o admin tinha 6 arquivos separados (admin.js, admin2.js,
   shopadmin.js, exclusiveadmin.js, botsadmin.js, maintadmin.js,
   selfadmin.js) e abas escondidas. Agora e UMA tela com abas claras,
   busca em tudo e as acoes mais usadas em botoes grandes.
   ===================================================================== */
(function(){
'use strict';
var C = window.FBFCards, esc = C.esc, api = window.FBF_api, icon = window.FBF_icon;
var P = window.FBF_PAGES;
function el(id){return document.getElementById(id);}
function fmt(n){ return (n||0).toLocaleString('pt-BR'); }
function loading(){ return '<div class="loader"><div class="ring"></div></div>'; }

var TABS = [
  ['visao','Visao geral','chart'],
  ['cartas','Cartas','cards'],
  ['modelos','Modelos de carta','star'],
  ['pacotes','Pacotes','gift'],
  ['loja','Loja e mercado','coin'],
  ['lojinha','Lojinha (Pix)','gift'],
  ['usuarios','Jogadores','user'],
  ['times','Times','shield'],
  ['bots','Bots','ball'],
  ['sistema','Sistema','cog']
];
var activeTab = 'visao';

P.admin = async function(root){
  if (!(window.FBF_state.user && window.FBF_state.user.is_admin)){
    root.innerHTML = '<div class="empty">Acesso restrito a administradores.</div>'; return;
  }
  root.innerHTML = '<h1 class="page-title">Painel de Administracao</h1>'
    + '<p class="page-sub">Tudo em um lugar so. Escolha uma aba abaixo.</p>'
    + '<div class="tabbar" id="admTabs">'
    + TABS.map(function(t){ return '<button data-tab="'+t[0]+'"'+(t[0]===activeTab?' class="active"':'')+'>'+icon(t[2])+' '+t[1]+'</button>'; }).join('')
    + '</div><div id="admBody">'+loading()+'</div>';
  root.querySelectorAll('[data-tab]').forEach(function(b){
    b.onclick = function(){
      activeTab = b.getAttribute('data-tab');
      root.querySelectorAll('[data-tab]').forEach(function(x){ x.classList.remove('active'); });
      b.classList.add('active');
      render(root);
    };
  });
  render(root);
};

async function render(root){
  var body = el('admBody');
  body.innerHTML = loading();
  try{
    if (activeTab==='visao') await tabOverview(body);
    else if (activeTab==='cartas') await tabCards(body);
    else if (activeTab==='modelos') await tabModels(body);
    else if (activeTab==='pacotes') await tabPacks(body);
    else if (activeTab==='loja') await tabShop(body);
    else if (activeTab==='lojinha') await tabCashShop(body);
    else if (activeTab==='usuarios') await tabUsers(body);
    else if (activeTab==='times') await tabTeams(body);
    else if (activeTab==='bots') await tabBots(body);
    else if (activeTab==='sistema') await tabSystem(body);
  }catch(e){
    body.innerHTML = '<div class="panel"><b>Erro:</b> '+esc(e.message)+'</div>';
  }
}

/* ---------------- VISAO GERAL ---------------- */
async function tabOverview(body){
  var s = await api('/admin/stats');
  body.innerHTML = '<div class="toolbar">'
    + stat(s.users,'Jogadores') + stat(s.players,'Cartas no jogo') + stat(s.cards,'Cartas distribuidas')
    + stat(s.packs_opened,'Pacotes abertos') + stat(s.market_active,'Anuncios ativos')
    + stat(s.shop_active,'Ofertas na loja') + stat(s.matches,'Partidas') + stat(s.coins_total,'Moedas em circulacao')
    + '</div>'
    + '<div class="panel"><h3 style="margin-bottom:12px">Acoes rapidas</h3>'
    + '<div class="toolbar">'
    + '<button class="btn primary" id="qRefresh">'+icon('cog')+' Trocar ofertas da loja agora</button>'
    + '<button class="btn" id="qNewCard">'+icon('plus')+' Nova carta</button>'
    + '<button class="btn" id="qNewPack">'+icon('plus')+' Novo pacote</button>'
    + '<button class="btn" id="qNewModel">'+icon('plus')+' Novo modelo de carta</button>'
    + '</div></div>';
  el('qRefresh').onclick = async function(){
    if (!confirm('Trocar agora as cartas em oferta na loja?')) return;
    await api('/admin/shop/refresh',{method:'POST'}); window.FBF_toast('Loja rotacionada!','ok'); render(window.__admRoot);
  };
  el('qNewCard').onclick = function(){ activeTab='cartas'; switchTabAndOpen(); };
  el('qNewPack').onclick = function(){ activeTab='pacotes'; switchTabAndOpen(); };
  el('qNewModel').onclick = function(){ activeTab='modelos'; switchTabAndOpen(); };
}
function switchTabAndOpen(){
  var root = document.getElementById('app');
  P.admin(root).then(function(){ setTimeout(function(){
    var b = document.querySelector('#admBody [data-new]'); if (b) b.click();
  }, 350); });
}
function stat(n,l){ return '<div class="stat"><div class="n">'+fmt(n)+'</div><div class="l">'+esc(l)+'</div></div>'; }

/* ---------------- CARTAS (jogadores) ---------------- */
async function tabCards(body){
  var d = await api('/players?active=all');
  var f = await api('/formations');
  var rars = await api('/rarities');
  var models = await api('/models');
  var teams = await api('/teams');
  window.__admMaps = {
    rars: rars.rarities, models: models.models, teams: teams.teams
  };
  body.innerHTML = '<div class="toolbar">'
    + '<input id="pQ" placeholder="Buscar por nome..." style="min-width:220px">'
    + '<select id="pR"><option value="">Todas as raridades</option>'+rars.rarities.map(function(r){return '<option value="'+r.id+'">'+esc(r.name)+'</option>';}).join('')+'</select>'
    + '<button class="btn primary" data-new="1">'+icon('plus')+' Nova carta</button>'
    + '<button class="btn" data-bulk="1">'+icon('plus')+' Gerar em lote</button>'
    + '<button class="btn danger" data-wipe="1">Apagar todas</button></div>'
    + '<div class="panel"><table><thead><tr><th>Nota</th><th>Nome</th><th>Pos</th><th>Raridade</th><th>Time</th><th style="width:150px">Acoes</th></tr></thead>'
    + '<tbody id="pBody"></tbody></table></div>';
  var players = d.players;
  function paint(){
    var q = el('pQ').value.toLowerCase(), r = el('pR').value;
    var list = players.filter(function(p){
      if (q && p.name.toLowerCase().indexOf(q) < 0) return false;
      if (r && String(p.rarity_id)!==r) return false;
      return true;
    }).slice(0,300);
    el('pBody').innerHTML = list.map(function(p){
      return '<tr><td><b>'+(p.overall||0)+'</b></td><td>'+esc(p.name)+'</td><td>'+esc(C.pos(p.position))+'</td>'
        + '<td>'+(p.rarity?'<span class="badge gold">'+esc(p.rarity.name)+'</span>':'-')+'</td>'
        + '<td>'+esc(p.team? p.team.name : '-')+'</td>'
        + '<td><button class="btn sm" data-edit="'+p.id+'">Editar</button> '
        + '<button class="btn sm danger" data-del="'+p.id+'">Apagar</button></td></tr>';
    }).join('') || '<tr><td colspan="6" style="text-align:center;color:var(--ink2)">Nenhuma carta encontrada.</td></tr>';
    el('pBody').querySelectorAll('[data-edit]').forEach(function(b){
      var p = players.find(function(x){return String(x.id)===b.getAttribute('data-edit');});
      b.onclick = function(){ cardForm(p, body); };
    });
    el('pBody').querySelectorAll('[data-del]').forEach(function(b){
      b.onclick = async function(){
        if (!confirm('Desativar esta carta?')) return;
        await api('/admin/players/'+b.getAttribute('data-del'),{method:'DELETE'});
        window.FBF_toast('Carta desativada','ok'); render(document.getElementById('app'));
      };
    });
  }
  el('pQ').oninput = paint; el('pR').onchange = paint; paint();
  body.querySelector('[data-new]').onclick = function(){ cardForm(null, body); };
  body.querySelector('[data-bulk]').onclick = function(){ bulkForm(body); };
  body.querySelector('[data-wipe]').onclick = async function(){
    if (!confirm('Isto vai APAGAR TODAS as cartas do jogo (inclusive as que os jogadores possuem, o mercado e a loja). Nao da pra desfazer. Continuar?')) return;
    if (!confirm('Tem certeza mesmo? Confirmar apagar TUDO?')) return;
    try{
      var r = await api('/admin/players/wipe',{method:'POST',body:{}});
      window.FBF_toast('Apagadas '+(r.removed||0)+' cartas','ok'); render(document.getElementById('app'));
    }catch(e){ window.FBF_toast(e.message,'err'); }
  };
}

/* Geracao de cartas em lote: cola varios blocos NICK/POSICAO/FIN.../OVER de uma vez */
function bulkForm(body){
  var ph = 'Telly\nPOSICAO: pv\nFIN: 87\nPAS: 83\nCTL: 82\nSKL: 81\nDEF: 79\nJDC: 83\nOVER: 83';
  var html = '<h3 style="margin-bottom:8px">Gerar cartas em lote</h3>'
    + '<p class="page-sub" style="margin-bottom:12px">Cole um ou varios blocos (NICK, POSICAO, FIN, PAS, CTL, SKL, DEF, JDC, OVER). O sistema reconhece todos e cria de uma vez. A raridade sai da nota (OVER). Posicoes: pv=Atacante, vl=Meio, gk=Goleiro, todas=versatil.</p>'
    + '<textarea id="f_bulk" rows="14" style="width:100%;font-family:monospace;font-size:13px" placeholder="'+esc(ph)+'"></textarea>'
    + '<div class="toolbar" style="margin-top:14px"><button class="btn primary" id="f_bsave">Criar cartas</button>'
    + '<button class="btn" id="f_bcancel">Cancelar</button></div>';
  window.FBF_openModal(html);
  el('f_bcancel').onclick = window.FBF_closeModal;
  el('f_bsave').onclick = async function(){
    var text = v('f_bulk');
    if (!text.trim()){ window.FBF_toast('Cole os dados das cartas','err'); return; }
    try{
      var r = await api('/admin/players/bulk',{method:'POST',body:{text:text}});
      window.FBF_closeModal();
      window.FBF_toast('Criadas '+(r.created||0)+' cartas'+(r.errors?(' / avisos: '+r.errors):''),'ok');
      render(document.getElementById('app'));
    }catch(e){ window.FBF_toast(e.message,'err'); }
  };
}

/* =====================================================================
   EDITOR VISUAL DE CARTA
   A carta aparece ao vivo; clique em qualquer parte (nota, posicao, bandeira,
   escudo do time, foto, nome, tipo, cada atributo, raridade ou o fundo) e o
   painel ao lado mostra so o que aquela parte controla.
   ===================================================================== */
function cardForm(p, body){
  var maps = window.__admMaps || {};
  var rars = maps.rars||[], models = maps.models||[], teams = maps.teams||[];
  var isNew = !p;
  var GK_KEYS = [['gk_div','DIV','Defesa'],['gk_han','MAN','Manejo'],['gk_kic','CHU','Chute'],['gk_ref','REF','Reflexo'],['gk_spd','VEL','Velocidade'],['gk_pos','POS','Posicionamento']];
  var PL_KEYS = ['fin','pas','ctl','skl','def','jdc'];
  var POS_OPTS = [['GK','Goleiro (GK)'],['CM','Meio (VL)'],['ST','Atacante (PV)']];
  function normPos(c){ var l = C.pos(c); return l==='GK'?'GK' : l==='PV'?'ST' : 'CM'; }
  function num(x,def){ var n = parseInt(x,10); return isNaN(n)?def:Math.max(0,Math.min(99,n)); }
  function byId(list,id){ if (id==null||id==='') return null; return list.find(function(x){return String(x.id)===String(id);})||null; }

  var st = Object.assign({ name:'Novo Jogador', overall:75, position:'CM', positions:null, country:'Brasil', photo:null,
    team_id:null, rarity_id:null, model_id:null, is_gk:0, avatar_mode:'auto', avatar_style:'team', avatar_text:null,
    card_type:'Base', description:null, is_exclusive:0, exclusive_max:null, exclusive_price:null, exclusive_resale:1, active:1,
    fin:75,pas:75,ctl:75,skl:75,def:75,jdc:75, gk_div:75,gk_han:75,gk_kic:75,gk_ref:75,gk_spd:75,gk_pos:75 }, p||{});
  st.position = normPos(st.position);
  st.is_gk = Number(st.is_gk)?1:0; st.is_exclusive = Number(st.is_exclusive)?1:0;
  st.exclusive_resale = (st.exclusive_resale==null || Number(st.exclusive_resale))?1:0;
  st.active = (st.active==null || Number(st.active))?1:0;
  if (!st.positions) st.positions = st.position;
  else if (String(st.positions).split(',').map(function(x){return x.trim();}).indexOf(st.position)<0) st.positions += ','+st.position;
  var zone = 'name';

  function view(extra){
    var o = Object.assign({}, st, extra||{});
    o.team = byId(teams, o.team_id); o.rarity = byId(rars, o.rarity_id); o.model = byId(models, o.model_id);
    o.traits = []; o.is_gk = !!o.is_gk;
    return o;
  }
  function statKeys(){ return st.is_gk ? GK_KEYS.map(function(k){return k[0];}) : PL_KEYS; }
  function statMeta(key){
    if (st.is_gk){ var g = GK_KEYS.find(function(k){return k[0]===key;}); return g? {label:g[1], name:g[2], desc:C.GK_ATTR_INFO[{gk_div:'div',gk_han:'man',gk_kic:'chu',gk_ref:'ref',gk_spd:'vel',gk_pos:'gpos'}[key]].desc} : null; }
    var i = C.ATTR_INFO[key]; return i? {label:i.label, name:i.name, desc:i.desc} : null;
  }

  var html = '<h3 style="margin-bottom:4px">'+(isNew?'Nova carta':'Personalizar: <span id="ce_title">'+esc(p.name)+'</span>')+'</h3>'
    + '<p class="page-sub" style="margin-bottom:12px">Clique em uma parte da carta para mudar. As alteracoes aparecem na hora.</p>'
    + '<div class="ce">'
    +   '<div class="ce-left"><div class="ce-stage" id="ce_stage"></div>'
    +     '<div class="ce-chips" id="ce_chips"></div></div>'
    +   '<div class="ce-right"><div class="ce-zone" id="ce_zone"></div><div id="ce_panel"></div></div>'
    + '</div>'
    + '<div class="toolbar" style="margin-top:16px"><button class="btn primary" id="f_save">Salvar carta</button>'
    + '<button class="btn" id="f_cancel">Cancelar</button></div>';
  window.FBF_openModal(html);
  var mc = document.querySelector('#modal .modal-card'); if (mc) mc.classList.add('wide');
  function close(){ window.FBF_closeModal(); }
  el('f_cancel').onclick = close;

  /* ----- carta ao vivo ----- */
  function paintCard(){
    var stage = el('ce_stage'); if (!stage) return;
    stage.innerHTML = C.render(view(), 'big');
    var card = stage.querySelector('.fc'); if (!card) return;
    function tag(sel, z, all){
      var list = all ? card.querySelectorAll(sel) : [card.querySelector(sel)];
      Array.prototype.forEach.call(list, function(n,i){ if (n) n.setAttribute('data-zone', all ? z+':'+i : z); });
    }
    // marcadores vazios: bandeira, time e tipo ainda sem valor
    var side = card.querySelector('.fc-side');
    if (side && !card.querySelector('.fc-flag')) side.insertAdjacentHTML('beforeend','<div class="fc-flag ce-ph" title="Adicionar pais">+</div>');
    if (side && !card.querySelector('.fc-club')) side.insertAdjacentHTML('beforeend','<div class="fc-club ce-ph" title="Adicionar time">+</div>');
    if (!card.querySelector('.fc-sub')){ var nm = card.querySelector('.fc-name'); if (nm) nm.insertAdjacentHTML('afterend','<div class="fc-sub ce-ph">+ tipo</div>'); }
    tag('.fc-ov .ov','ov'); tag('.fc-ov .pos','pos'); tag('.fc-flag','country'); tag('.fc-club','team');
    tag('.fc-photo','photo'); tag('.fc-name','name'); tag('.fc-sub','sub'); tag('.fc-foot','rar');
    var keys = statKeys();
    Array.prototype.forEach.call(card.querySelectorAll('.fc-stats span'), function(n,i){ n.setAttribute('data-zone','stat:'+keys[i]); });
    markSel();
  }
  function markSel(){
    Array.prototype.forEach.call(document.querySelectorAll('#ce_stage .ce-sel'), function(n){ n.classList.remove('ce-sel'); });
    var z = (zone==='model') ? null : zone;
    if (z){ var t = document.querySelector('#ce_stage [data-zone="'+z+'"]'); if (t) t.classList.add('ce-sel'); }
    else { var c = document.querySelector('#ce_stage .fc'); if (c) c.classList.add('ce-sel'); }
    Array.prototype.forEach.call(document.querySelectorAll('#ce_chips button'), function(b){ b.classList.toggle('on', b.getAttribute('data-z')===zone); });
  }
  el('ce_stage').addEventListener('click', function(e){
    var t = e.target.closest ? e.target.closest('[data-zone]') : null;
    select(t ? t.getAttribute('data-zone') : 'model');
  });
  var CHIPS = [['model','Modelo / cor'],['rar','Raridade'],['country','Pais'],['team','Time'],['general','Geral']];
  el('ce_chips').innerHTML = CHIPS.map(function(c){ return '<button type="button" data-z="'+c[0]+'">'+c[1]+'</button>'; }).join('');
  el('ce_chips').addEventListener('click', function(e){ var b = e.target.closest('button'); if (b) select(b.getAttribute('data-z')); });

  function select(z){ zone = z; renderPanel(); markSel(); }

  /* ----- helpers do painel ----- */
  function bindText(id, key, opts){
    var i = el(id); if (!i) return;
    i.oninput = function(){ var val = i.value; st[key] = (opts&&opts.upper) ? val.toUpperCase() : val; if (key==='name' && el('ce_title')) el('ce_title').textContent = val; paintCard(); };
  }
  function bindSelect(id, fn){ var i = el(id); if (i) i.onchange = function(){ fn(i.value); paintCard(); }; }
  function slider(id, key, label){
    return '<div class="field"><label>'+esc(label)+'</label><div class="ce-num"><input type="range" id="'+id+'_r" min="0" max="99" value="'+num(st[key],0)+'">'
      + '<input type="number" id="'+id+'_n" min="0" max="99" value="'+num(st[key],0)+'"></div></div>';
  }
  function bindSlider(id, key, after){
    var r = el(id+'_r'), n = el(id+'_n'); if (!r||!n) return;
    function set(val){ st[key] = num(val,0); r.value = st[key]; n.value = st[key]; if (after) after(); paintCard(); }
    r.oninput = function(){ set(r.value); }; n.oninput = function(){ if (n.value==='') return; set(n.value); };
  }
  function opts(list, cur){ return list.map(function(x){ return '<option value="'+esc(x[0])+'"'+(String(x[0])===String(cur==null?'':cur)?' selected':'')+'>'+esc(x[1])+'</option>'; }).join(''); }
  function avg(){
    var ks = statKeys(); var s = 0; ks.forEach(function(k){ s += num(st[k],0); }); return Math.round(s/ks.length);
  }

  /* ----- painel de cada zona ----- */
  var TITLES = {name:'Nome',ov:'Nota (overall)',pos:'Posicao',country:'Pais / bandeira',team:'Time / escudo',photo:'Foto / avatar',sub:'Tipo da carta',rar:'Raridade',model:'Modelo (cores e moldura)',general:'Geral'};
  function renderPanel(){
    var zEl = el('ce_zone'), pan = el('ce_panel'); if (!pan) return;
    var h = '', t = TITLES[zone] || '';
    if (zone.indexOf('stat:')===0){ var key = zone.slice(5), meta = statMeta(key); t = meta? ('Atributo '+meta.label+' - '+meta.name) : 'Atributo'; }
    zEl.textContent = t;

    if (zone==='name'){
      h = '<div class="field"><label>Nome na carta</label><input id="p_name" value="'+esc(st.name)+'" maxlength="40"></div>'
        + '<p class="ce-help">Nomes com mais de 10 letras diminuem a fonte sozinhos.</p>';
    } else if (zone==='ov'){
      h = slider('p_ov','overall','Nota geral')
        + '<button class="btn sm" type="button" id="p_avg">Usar a media dos atributos ('+avg()+')</button>';
    } else if (zone==='pos'){
      var have = String(st.positions||'').split(',').map(function(x){return x.trim();}).filter(Boolean);
      h = '<div class="field"><label>Posicao principal (aparece na carta)</label><select id="p_pos">'+opts(POS_OPTS, st.position)+'</select></div>'
        + '<label class="ce-help" style="display:block;margin:10px 0 4px">Tambem pode jogar de:</label>'
        + '<div class="ce-checks">'+POS_OPTS.map(function(o){ return '<label><input type="checkbox" data-pp="'+o[0]+'"'+(have.indexOf(o[0])>=0?' checked':'')+'> '+o[1]+'</label>'; }).join('')+'</div>';
    } else if (zone==='country'){
      h = '<div class="field"><label>Pais</label><input id="p_country" list="ce_countries" value="'+esc(st.country||'')+'" placeholder="Ex.: Brasil"></div>'
        + '<datalist id="ce_countries">'+C.COUNTRY_NAMES.map(function(n){return '<option value="'+esc(n)+'">';}).join('')+'</datalist>'
        + '<p class="ce-help">Escolha um pais da lista para a bandeira aparecer. Deixe vazio para tirar.</p>';
    } else if (zone==='team'){
      h = '<div class="field"><label>Time</label><select id="p_team"><option value="">- sem time -</option>'+teams.map(function(t){return '<option value="'+t.id+'"'+(String(st.team_id)===String(t.id)?' selected':'')+'>'+esc(t.name)+'</option>';}).join('')+'</select></div>'
        + '<p class="ce-help">O time define o escudo e as cores do boneco quando nao ha foto.</p>';
    } else if (zone==='photo'){
      h = '<div class="field"><label>Mostrar</label><select id="p_amode">'+opts([['auto','Automatico (foto se tiver, senao boneco)'],['photo','Sempre a foto'],['haxball','Sempre o boneco Haxball']], st.avatar_mode||'auto')+'</select></div>'
        + '<div class="field"><label>Foto (URL)</label><input id="p_photo" value="'+esc(st.photo||'')+'" placeholder="https://..."></div>'
        + '<div class="toolbar"><label class="btn sm" style="cursor:pointer">Enviar imagem<input type="file" id="p_file" accept="image/*" hidden></label>'
        + '<button class="btn sm" type="button" id="p_nophoto">Remover foto</button></div>'
        + '<div class="row" style="margin-top:10px"><div class="field"><label>Estilo do boneco</label><select id="p_astyle">'+opts([['team','Do time'],['vertical','Listras'],['diagonal','Diagonal'],['half','Metade'],['hoops','Faixas'],['solid','Liso']], st.avatar_style||'team')+'</select></div>'
        + '<div class="field"><label>Letras no boneco</label><input id="p_atext" maxlength="2" value="'+esc(st.avatar_text||'')+'" placeholder="auto"></div></div>';
    } else if (zone==='sub'){
      h = '<div class="field"><label>Tipo / subtitulo</label><input id="p_sub" list="ce_types" value="'+esc(st.card_type||'')+'" maxlength="20" placeholder="Ex.: Base"></div>'
        + '<datalist id="ce_types"><option value="Base"><option value="Especial"><option value="Evento"><option value="Lenda"></datalist>'
        + '<p class="ce-help">Texto pequeno abaixo do nome. Deixe vazio para esconder.</p>';
    } else if (zone.indexOf('stat:')===0){
      var k = zone.slice(5), m = statMeta(k);
      h = slider('p_st', k, (m?m.label:k)) + '<p class="ce-help">'+esc(m?m.desc:'')+'</p>'
        + '<div class="ce-mini">'+statKeys().map(function(kk){ var mm = statMeta(kk); return '<button type="button" data-z="stat:'+kk+'"'+(kk===k?' class="on"':'')+'>'+esc(mm.label)+' <b>'+num(st[kk],0)+'</b></button>'; }).join('')+'</div>';
    } else if (zone==='rar'){
      h = '<div class="field"><label>Raridade</label><select id="p_rar"><option value="">- nenhuma -</option>'+rars.map(function(r){return '<option value="'+r.id+'"'+(String(st.rarity_id)===String(r.id)?' selected':'')+'>'+esc(r.name)+'</option>';}).join('')+'</select></div>'
        + '<p class="ce-help">A raridade aparece no rodape da carta e define a chance nos pacotes.</p>';
    } else if (zone==='model'){
      h = '<p class="ce-help" style="margin-top:0">Escolha o visual da carta:</p><div class="ce-models">'
        + '<button type="button" data-m="" class="'+(st.model_id==null?'on':'')+'"><span class="ce-none">Padrao</span></button>'
        + models.map(function(m){ return '<button type="button" data-m="'+m.id+'" class="'+(String(st.model_id)===String(m.id)?'on':'')+'" title="'+esc(m.name)+'">'+C.render(view({model_id:m.id}),'mini')+'<small>'+esc(m.name)+'</small></button>'; }).join('')
        + '</div><p class="ce-help">Para criar ou mudar as cores de um modelo, use a aba "Modelos de carta".</p>';
    } else if (zone==='general'){
      h = '<label class="ce-check"><input type="checkbox" id="p_gk"'+(st.is_gk?' checked':'')+'> E goleiro (usa os atributos de goleiro)</label>'
        + '<label class="ce-check"><input type="checkbox" id="p_active"'+(st.active?' checked':'')+'> Carta ativa no jogo</label>'
        + '<label class="ce-check"><input type="checkbox" id="p_excl"'+(st.is_exclusive?' checked':'')+'> Carta exclusiva</label>'
        + '<div id="p_exclbox" style="display:'+(st.is_exclusive?'block':'none')+'"><div class="row">'
        + '<div class="field"><label>Maximo de copias</label><input type="number" id="p_xmax" min="1" value="'+esc(st.exclusive_max==null?'':st.exclusive_max)+'"></div>'
        + '<div class="field"><label>Preco</label><input type="number" id="p_xprice" min="0" value="'+esc(st.exclusive_price==null?'':st.exclusive_price)+'"></div></div>'
        + '<label class="ce-check"><input type="checkbox" id="p_xresale"'+(st.exclusive_resale?' checked':'')+'> Pode revender no mercado</label></div>'
        + '<div class="field"><label>Descricao</label><textarea id="p_desc" rows="3" style="width:100%">'+esc(st.description||'')+'</textarea></div>';
    }
    pan.innerHTML = h;

    // ligacoes
    bindText('p_name','name'); bindText('p_sub','card_type');
    bindText('p_country','country');
    bindText('p_atext','avatar_text',{upper:true});
    bindText('p_photo','photo'); bindText('p_desc','description');
    bindSlider('p_ov','overall');
    if (el('p_avg')) el('p_avg').onclick = function(){ st.overall = avg(); renderPanel(); paintCard(); };
    bindSelect('p_pos', function(val){ st.position = val;
      var have = String(st.positions||'').split(',').filter(Boolean); if (have.indexOf(val)<0) have.push(val); st.positions = have.join(','); renderPanel(); });
    Array.prototype.forEach.call(pan.querySelectorAll('[data-pp]'), function(c){
      c.onchange = function(){
        var have = String(st.positions||'').split(',').filter(Boolean), z = c.getAttribute('data-pp'), i = have.indexOf(z);
        if (c.checked && i<0) have.push(z); if (!c.checked && i>=0) have.splice(i,1);
        if (!have.length) have = [st.position];
        st.positions = have.join(','); renderPanel();
      };
    });
    bindSelect('p_team', function(val){ st.team_id = val?Number(val):null; });
    bindSelect('p_rar', function(val){ st.rarity_id = val?Number(val):null; });
    bindSelect('p_amode', function(val){ st.avatar_mode = val; });
    bindSelect('p_astyle', function(val){ st.avatar_style = val; });
    if (zone.indexOf('stat:')===0) bindSlider('p_st', zone.slice(5), function(){ var c = el('ce_panel').querySelector('.ce-mini [data-z="'+zone+'"] b'); if (c) c.textContent = st[zone.slice(5)]; });
    Array.prototype.forEach.call(pan.querySelectorAll('.ce-mini [data-z]'), function(b){ b.onclick = function(){ select(b.getAttribute('data-z')); }; });
    Array.prototype.forEach.call(pan.querySelectorAll('[data-m]'), function(b){
      b.onclick = function(){ var id = b.getAttribute('data-m'); st.model_id = id?Number(id):null; renderPanel(); paintCard(); };
    });
    if (el('p_file')) el('p_file').onchange = async function(){
      var f = this.files && this.files[0]; if (!f) return;
      try{
        var fd = new FormData(); fd.append('image', f);
        var r = await api('/admin/upload',{method:'POST',body:fd});
        st.photo = r.url; if (st.avatar_mode==='haxball') st.avatar_mode = 'auto';
        renderPanel(); paintCard(); window.FBF_toast('Imagem enviada','ok');
      }catch(e){ window.FBF_toast(e.message,'err'); }
    };
    if (el('p_nophoto')) el('p_nophoto').onclick = function(){ st.photo = null; renderPanel(); paintCard(); };
    if (el('p_gk')) el('p_gk').onchange = function(){ st.is_gk = this.checked?1:0;
      if (st.is_gk){ st.position = 'GK'; if (String(st.positions||'').indexOf('GK')<0) st.positions = 'GK'; } paintCard(); };
    if (el('p_active')) el('p_active').onchange = function(){ st.active = this.checked?1:0; };
    if (el('p_excl')) el('p_excl').onchange = function(){ st.is_exclusive = this.checked?1:0; el('p_exclbox').style.display = this.checked?'block':'none'; paintCard(); };
    if (el('p_xmax')) el('p_xmax').oninput = function(){ st.exclusive_max = this.value===''?null:num(this.value,1); };
    if (el('p_xprice')) el('p_xprice').oninput = function(){ st.exclusive_price = this.value===''?null:Math.max(0,parseInt(this.value,10)||0); };
    if (el('p_xresale')) el('p_xresale').onchange = function(){ st.exclusive_resale = this.checked?1:0; };
  }

  paintCard(); renderPanel();

  el('f_save').onclick = async function(){
    var name = String(st.name||'').trim();
    if (!name){ window.FBF_toast('Digite o nome da carta','err'); select('name'); return; }
    var payload = {
      name: name, overall: num(st.overall,50), position: st.is_gk?'GK':st.position, positions: st.positions||st.position,
      country: String(st.country||'').trim()||null, photo: String(st.photo||'').trim()||null,
      team_id: st.team_id||null, rarity_id: st.rarity_id||null, model_id: st.model_id||null,
      is_gk: !!st.is_gk, avatar_mode: st.avatar_mode||'auto', avatar_style: st.avatar_style||'team',
      avatar_text: String(st.avatar_text||'').trim()||null, card_type: String(st.card_type||'').trim()||null,
      description: String(st.description||'').trim()||null, active: !!st.active,
      is_exclusive: !!st.is_exclusive, exclusive_max: st.is_exclusive?(st.exclusive_max||null):null,
      exclusive_price: st.is_exclusive?(st.exclusive_price||null):null, exclusive_resale: !!st.exclusive_resale
    };
    PL_KEYS.concat(GK_KEYS.map(function(k){return k[0];})).forEach(function(k){ payload[k] = num(st[k],0); });
    var btn = el('f_save'); btn.disabled = true;
    try{
      if (isNew) await api('/admin/players',{method:'POST',body:payload});
      else await api('/admin/players/'+p.id,{method:'PUT',body:payload});
      close(); window.FBF_toast('Carta salva!','ok'); render(document.getElementById('app'));
    }catch(e){ btn.disabled = false; window.FBF_toast('Nao salvou: '+e.message,'err'); }
  };
}

/* ---------------- MODELOS DE CARTA (o designer) ---------------- */
async function tabModels(body){
  var d = await api('/models');
  var rars = await api('/rarities');
  window.__admRars = rars.rarities;
  body.innerHTML = '<p class="page-sub">Cada modelo define o visual das cartas: cores, moldura, textura, efeito e animacao.</p>'
    + '<div class="toolbar"><button class="btn primary" data-new="1">'+icon('plus')+' Novo modelo</button></div>'
    + '<div class="grid cols3">'+ d.models.map(function(m){
        var fake = job(m);
        return '<div class="panel" style="text-align:center">'
          + '<div style="display:flex;justify-content:center;margin-bottom:10px">'+C.render(fake,'normal')+'</div>'
          + '<div style="font-weight:800;margin-bottom:8px">'+esc(m.name)+'</div>'
          + '<button class="btn sm" data-edit="'+m.id+'">Editar</button> '
          + '<button class="btn sm danger" data-del="'+m.id+'">Apagar</button></div>';
      }).join('') + '</div>';
  body.querySelector('[data-new]').onclick = function(){ modelForm(null, body); };
  body.querySelectorAll('[data-edit]').forEach(function(b){
    b.onclick = function(){ modelForm(d.models.find(function(x){return String(x.id)===b.getAttribute('data-edit');}), body); };
  });
  body.querySelectorAll('[data-del]').forEach(function(b){
    b.onclick = async function(){
      if (!confirm('Apagar este modelo?')) return;
      await api('/admin/models/'+b.getAttribute('data-del'),{method:'DELETE'});
      window.FBF_toast('Modelo apagado','ok'); render(document.getElementById('app'));
    };
  });
}
function job(m){
  return { name:'EXEMPLO', overall:92, position:'ST', country:'Brasil', card_type:'Base',
    fin:92,pas:88,ctl:90,skl:91,def:70,jdc:84, photo:null, avatar_mode:'haxball',
    team:{color_primary:'#e8c14a',color_secondary:'#1a1a1a',kit_style:'vertical'}, model:m, rarity:{name:'Exemplo'} };
}
function modelForm(m, body){
  var rars = window.__admRars || [];
  var isNew = !m;
  m = m || { name:'Novo modelo', bg_from:'#3a3550', bg_to:'#12121c', border_color:'#e8c14a', accent_color:'#e8c14a', text_color:'#ffffff', shine_color:'#ffffff', effect:'shine', pattern:'diagonal', layout:'modern', bg_anim:'none', bg_anim_color:'#e8c14a', bg_anim_speed:2 };
  function opts(list, cur){ return list.map(function(x){return '<option value="'+x[0]+'"'+(x[0]===cur?' selected':'')+'>'+x[1]+'</option>';}).join(''); }
  var html = '<h3 style="margin-bottom:16px">'+(isNew?'Novo modelo':'Editar: '+esc(m.name))+'</h3>'
    + '<div class="toolbar" style="margin-bottom:12px"><span style="align-self:center;color:var(--ink2);font-size:13px">Comecar de um modelo pronto:</span>'
    + '<button class="btn sm" type="button" data-preset="crystal">Cristal (azul+dourado)</button>'
    + '<button class="btn sm" type="button" data-preset="discs">Discos Dourados</button></div>'
    + '<div class="row">'+ fl('Nome','m_name',m.name)
    + '<div class="field"><label>Raridade</label><select id="m_rar"><option value="">-</option>'+rars.map(function(r){return '<option value="'+r.id+'"'+(m.rarity_id===r.id?' selected':'')+'>'+esc(r.name)+'</option>';}).join('')+'</select></div></div>'
    + '<div class="row">'+ fl('Cor inicial','m_from',m.bg_from,'color') + fl('Cor final','m_to',m.bg_to,'color')
    + fl('Cor da moldura','m_border',m.border_color||'#e8c14a','color') + fl('Cor de destaque','m_accent',m.accent_color||'#e8c14a','color') + '</div>'
    + '<div class="row">'+ fl('Cor do texto','m_text',m.text_color||'#ffffff','color') + fl('Cor do brilho/particulas','m_shine',m.shine_color||'#ffffff','color') + fl('Cor da animacao','m_animcolor',m.bg_anim_color||'#e8c14a','color') + '</div>'
    + '<div class="row"><div class="field"><label>Efeito</label><select id="m_effect">'+opts([['none','Nenhum'],['shine','Brilho'],['glow','Pulso'],['metal','Metalico'],['holo','Holografico'],['prism','Prisma (azul+dourado)']],m.effect)+'</select></div>'
    + '<div class="field"><label>Textura</label><select id="m_pattern">'+opts([['none','Nenhuma'],['rays','Raios'],['diagonal','Diagonal'],['dots','Pontos'],['hex','Hexagonal'],['carbon','Carbono'],['crystal','Cristal'],['discs','Discos']],m.pattern)+'</select></div>'
    + '<div class="field"><label>Animacao de fundo</label><select id="m_anim">'+opts([['none','Nenhuma'],['aurora','Aurora'],['flow','Fluxo'],['pulse','Pulso'],['sparks','Faiscas'],['stars','Estrelas']],m.bg_anim)+'</select></div>'
    + '<div class="field"><label>Velocidade da animacao</label><select id="m_anim_speed">'+opts([['1','Lenta'],['2','Normal'],['3','Rapida']],String(m.bg_anim_speed||2))+'</select></div></div>'
    + '<div class="row">'+ fl('Logo do modelo (URL)','m_logo',m.logo) + fl('Imagem de fundo (URL)','m_bgimg',m.bg_image) + '</div>'
    + '<div style="display:flex;justify-content:center;padding:16px 0" id="m_prev"></div>'
    + '<div class="toolbar"><button class="btn primary" id="m_save">Salvar modelo</button>'
    + '<button class="btn" id="m_cancel">Cancelar</button></div>';
  window.FBF_openModal(html);
  function collect(){
    return { name:v('m_name')||'Modelo', rarity_id:v('m_rar')||null, bg_from:v('m_from'), bg_to:v('m_to'),
      border_color:v('m_border'), accent_color:v('m_accent'), text_color:(v('m_text')||'#ffffff'),
      shine_color:(v('m_shine')||'#ffffff'),
      effect:v('m_effect'), pattern:v('m_pattern'), layout:(m.layout||'modern'),
      bg_anim:v('m_anim'), bg_anim_color:(v('m_animcolor')||'#e8c14a'), bg_anim_speed:parseInt(v('m_anim_speed')||2,10), logo:v('m_logo')||null, bg_image:v('m_bgimg')||null };
  }
  function prev(){ el('m_prev').innerHTML = C.render(job(Object.assign({}, m, collect())), 'normal'); }
  document.querySelectorAll('#modalBody input,#modalBody select').forEach(function(i){ i.oninput = prev; i.onchange = prev; });
  // Modelos prontos que replicam as cartas de referencia (cristal e discos dourados).
  var PRESETS = {
    crystal: { bg_from:'#1b3b7a', bg_to:'#0a1838', border_color:'#e8c14a', accent_color:'#ffd86b', text_color:'#ffffff', shine_color:'#fff3c0', bg_anim_color:'#ffd86b', effect:'prism', pattern:'crystal', bg_anim:'none', bg_anim_speed:2 },
    discs:   { bg_from:'#15356e', bg_to:'#081127', border_color:'#e8c14a', accent_color:'#f2c14a', text_color:'#ffffff', shine_color:'#ffe9a6', bg_anim_color:'#e8c14a', effect:'prism', pattern:'discs', bg_anim:'sparks', bg_anim_speed:2 }
  };
  function applyPreset(p){
    function setv(id,val){ var i = el(id); if (i!=null && val!=null) i.value = val; }
    setv('m_from',p.bg_from); setv('m_to',p.bg_to); setv('m_border',p.border_color); setv('m_accent',p.accent_color);
    setv('m_text',p.text_color); setv('m_shine',p.shine_color); setv('m_animcolor',p.bg_anim_color);
    setv('m_effect',p.effect); setv('m_pattern',p.pattern); setv('m_anim',p.bg_anim); setv('m_anim_speed',String(p.bg_anim_speed));
    prev();
  }
  document.querySelectorAll('#modalBody [data-preset]').forEach(function(b){
    b.onclick = function(){ applyPreset(PRESETS[b.getAttribute('data-preset')]); };
  });
  prev();
  el('m_cancel').onclick = window.FBF_closeModal;
  el('m_save').onclick = async function(){
    var payload = collect();
    try{
      if (isNew) await api('/admin/models',{method:'POST',body:payload});
      else await api('/admin/models/'+m.id,{method:'PUT',body:payload});
      window.FBF_closeModal(); window.FBF_toast('Modelo salvo!','ok'); render(document.getElementById('app'));
    }catch(e){ window.FBF_toast(e.message,'err'); }
  };
}

/* ---------------- PACOTES ---------------- */
async function tabPacks(body){
  var d = await api('/admin/packs');
  body.innerHTML = '<div class="toolbar"><button class="btn primary" data-new="1">'+icon('plus')+' Novo pacote</button></div>'
    + '<div class="panel"><table><thead><tr><th>Nome</th><th>Preco</th><th>Cartas</th><th>Ativo</th><th style="width:150px">Acoes</th></tr></thead><tbody>'
    + d.packs.map(function(p){
        return '<tr><td>'+esc(p.name)+'</td><td>'+fmt(p.price)+'</td><td>'+p.card_count+'</td>'
          + '<td>'+(p.active?'<span class="badge ok">Sim</span>':'<span class="badge err">Nao</span>')+'</td>'
          + '<td><button class="btn sm" data-edit="'+p.id+'">Editar</button> <button class="btn sm" data-del="'+p.id+'">Desativar</button> <button class="btn sm danger" data-purge="'+p.id+'">Apagar</button></td></tr>';
      }).join('') + '</tbody></table></div>';
  body.querySelector('[data-new]').onclick = function(){ packForm(null, body); };
  body.querySelectorAll('[data-edit]').forEach(function(b){ b.onclick = function(){ packForm(d.packs.find(function(x){return String(x.id)===b.getAttribute('data-edit');}), body); }; });
  body.querySelectorAll('[data-del]').forEach(function(b){
    b.onclick = async function(){ if(!confirm('Desativar pacote?'))return; await api('/admin/packs/'+b.getAttribute('data-del'),{method:'DELETE'}); window.FBF_toast('Pacote desativado','ok'); render(document.getElementById('app')); };
  });
  body.querySelectorAll('[data-purge]').forEach(function(b){
    b.onclick = async function(){
      if(!confirm('Apagar o pacote de vez? O historico de aberturas desse pacote tambem sera removido. Essa acao nao pode ser desfeita.'))return;
      try{
        await api('/admin/packs/'+b.getAttribute('data-purge')+'/purge',{method:'DELETE'});
        window.FBF_toast('Pacote apagado','ok'); render(document.getElementById('app'));
      }catch(e){ window.FBF_toast(e.message||'Nao foi possivel apagar o pacote','err'); }
    };
  });
}
function oddsToMap(s){
  var m = {};
  if (!s) return m;
  try{ var o = JSON.parse(s); for (var k in o){ var n = Number(o[k]); if(!isNaN(n)) m[String(k)] = n; } return m; }
  catch(e){
    // formato amigavel "id: peso" por linha
    s.split(/\r?\n/).forEach(function(ln){ var mt = ln.split(':'); if(mt.length>=2){ var id=mt[0].replace(/[^0-9]/g,''); var w=Number(mt[1]); if(id&&!isNaN(w)) m[id]=w; } });
    return m;
  }
}
async function packForm(p, body){
  var isNew = !p;
  p = p || { name:'Novo pacote', price:1000, card_count:3, active:true, allow_dupes:1, guaranteed_count:0, min_overall:0, max_overall:0 };
  var rarData = await api('/admin/rarities');
  var playersData = await api('/players');
  var rarities = (rarData.rarities||[]).filter(function(r){ return r.active!==0; });
  var players = (playersData.players || []).slice().sort(function(a,c){ return (c.overall||0)-(a.overall||0); });
  var oddsMap = oddsToMap(p.rarity_odds);
  var selected = parseIds(p.eligible_players);
  var selSet = {}; selected.forEach(function(id){ selSet[id]=true; });
  var cf = p.color_from||'', ct = p.color_to||'', ca = p.color_accent||'';

  function hx(v,def){ return /^#?[0-9a-fA-F]{6}$/.test(v||'') ? (v.charAt(0)==='#'?v:'#'+v) : def; }
  function playerRows(filter){
    var q = (filter||'').toLowerCase();
    return players.filter(function(pl){ return !q || (pl.name||'').toLowerCase().indexOf(q)>=0; }).slice(0,400).map(function(pl){
      return '<label style="display:flex;gap:8px;align-items:center;padding:4px 6px;border-bottom:1px solid var(--line,#2a2a3a);font-size:13px">'
        + '<input type="checkbox" data-pid="'+pl.id+'" style="width:auto"'+(selSet[pl.id]?' checked':'')+'>'
        + '<b style="min-width:34px;text-align:center">'+(pl.overall||0)+'</b>'
        + '<span style="flex:1">'+esc(pl.name)+'</span>'
        + '<span style="color:var(--ink2);min-width:40px;text-align:right">'+esc(C.pos(pl.position))+'</span></label>';
    }).join('') || '<div style="padding:10px;color:var(--ink2)">Nenhuma carta encontrada.</div>';
  }
  var oddsRows = rarities.map(function(r){
    return '<div style="display:flex;gap:8px;align-items:center;margin-bottom:4px">'
      + '<span style="flex:1;font-size:13px">'+esc(r.name)+' <span style="color:var(--ink2)">#'+r.id+'</span></span>'
      + '<input type="number" min="0" step="1" data-odd="'+r.id+'" value="'+(oddsMap[String(r.id)]!=null?oddsMap[String(r.id)]:0)+'" style="width:90px"></div>';
  }).join('');
  var gOpts = '<option value="">- nenhuma -</option>' + rarities.map(function(r){
    return '<option value="'+r.id+'"'+(String(p.guaranteed_rarity_id)===String(r.id)?' selected':'')+'>'+esc(r.name)+'</option>';
  }).join('');

  var html = '<h3 style="margin-bottom:16px">'+(isNew?'Novo pacote':'Editar: '+esc(p.name))+'</h3>'
    + '<div class="row">'+ fl('Nome','k_name',p.name) + fl('Preco (moedas)','k_price',p.price,'number') + fl('Qtd. cartas','k_cc',p.card_count,'number') + '</div>'
    + '<div class="panel" style="margin:8px 0;padding:12px"><h4 style="margin-bottom:8px">Visual (mesmo layout — so cores/legenda)</h4>'
      + '<div class="row">'
      + '<div class="field"><label>Cor 1 (gradiente)</label><input id="k_cf" type="color" value="'+hx(cf,'#0a2342')+'" style="height:42px;padding:2px"></div>'
      + '<div class="field"><label>Cor 2 (gradiente)</label><input id="k_ct" type="color" value="'+hx(ct,'#1a5fb4')+'" style="height:42px;padding:2px"></div>'
      + '<div class="field"><label>Cor da faixa/tag</label><input id="k_ca" type="color" value="'+hx(ca,'#f5c542')+'" style="height:42px;padding:2px"></div>'
      + '</div>'
      + '<label style="display:flex;gap:8px;align-items:center;font-size:13px;margin-bottom:8px"><input type="checkbox" id="k_cuse" style="width:auto"'+((cf||ct||ca)?' checked':'')+'> Usar cores personalizadas (desmarcado = cores padrao pelo nome)</label>'
      + fl('Legenda/Tag (ex: ESPECIAL, LENDARIO)','k_tag',p.tag||'')
      + '<div id="k_prev" style="height:60px;border-radius:12px;margin-top:8px;display:flex;align-items:center;justify-content:center;font-weight:800;color:#fff;text-shadow:0 1px 3px rgba(0,0,0,.6)">PREVIEW</div>'
      + '</div>'
    + '<div class="panel" style="margin:8px 0;padding:12px"><h4 style="margin-bottom:8px">Probabilidades por raridade (peso relativo)</h4>'
      + '<div style="color:var(--ink2);font-size:12px;margin-bottom:8px">Quanto maior o peso, maior a chance. A chance e o peso dividido pela soma dos pesos.</div>'
      + oddsRows + '</div>'
    + '<div class="panel" style="margin:8px 0;padding:12px"><h4 style="margin-bottom:8px">Regras de sorteio</h4>'
      + '<div class="row">'
      + '<div class="field"><label>Raridade garantida</label><select id="k_grar">'+gOpts+'</select></div>'
      + fl('Qtd. garantida (cartas)','k_gcnt',p.guaranteed_count||0,'number')
      + '</div>'
      + '<div class="row">'+ fl('Nota minima (0 = sem limite)','k_minov',p.min_overall||0,'number') + fl('Nota maxima (0 = sem limite)','k_maxov',p.max_overall||0,'number') + '</div>'
      + '<label style="display:flex;gap:8px;align-items:center;font-size:13px"><input type="checkbox" id="k_dupes" style="width:auto"'+((p.allow_dupes==null||p.allow_dupes)?' checked':'')+'> Permitir cartas repetidas no mesmo pacote</label>'
      + '</div>'
    + '<div class="field"><label>Cartas elegiveis <span style="color:var(--ink2)">— marque as cartas; se vazio, usa todas que batem com as regras</span></label>'
      + '<input id="k_psearch" placeholder="Buscar carta por nome..." style="width:100%;margin-bottom:6px">'
      + '<div style="font-size:12px;color:var(--ink2);margin-bottom:6px" id="k_count">'+selected.length+' carta(s) selecionada(s)</div>'
      + '<div id="k_plist" style="max-height:240px;overflow:auto;border:1px solid var(--line,#2a2a3a);border-radius:8px">'+playerRows('')+'</div></div>'
    + '<div class="row">'+ fl('Disponivel de (opcional, ISO)','k_from',p.available_from||'') + fl('Disponivel ate (opcional, ISO)','k_to',p.available_to||'') + '</div>'
    + '<div style="display:flex;gap:16px;margin:8px 0">'
      + '<label style="display:flex;gap:8px;align-items:center;font-size:13px"><input type="checkbox" id="k_active" style="width:auto"'+(p.active?' checked':'')+'> Ativo</label>'
      + '<label style="display:flex;gap:8px;align-items:center;font-size:13px"><input type="checkbox" id="k_event" style="width:auto"'+(p.is_event?' checked':'')+'> Pacote de evento</label>'
      + '</div>'
    + '<div class="toolbar"><button class="btn primary" id="k_save">Salvar</button><button class="btn" id="k_cancel">Cancelar</button></div>';
  window.FBF_openModal(html);

  function updPrev(){
    var use = el('k_cuse').checked;
    var c1 = use ? el('k_cf').value : '#0a2342';
    var c2 = use ? el('k_ct').value : '#1a5fb4';
    var c3 = use ? el('k_ca').value : '#f5c542';
    var pv = el('k_prev');
    pv.style.background = 'linear-gradient(135deg,'+c1+','+c2+')';
    pv.style.boxShadow = 'inset 0 0 0 3px '+c3;
    pv.textContent = (v('k_tag')||'PREVIEW').toUpperCase();
  }
  ['k_cf','k_ct','k_ca','k_cuse','k_tag'].forEach(function(id){ var e=el(id); if(e){ e.oninput=updPrev; e.onchange=updPrev; } });
  updPrev();

  function bindRows(){
    el('k_plist').querySelectorAll('[data-pid]').forEach(function(cb){
      cb.onchange = function(){ selSet[cb.getAttribute('data-pid')] = cb.checked; refreshCount(); };
    });
  }
  function refreshCount(){ var n=0; for (var k in selSet) if (selSet[k]) n++; el('k_count').textContent = n+' carta(s) selecionada(s)'; }
  bindRows();
  el('k_psearch').oninput = function(){ el('k_plist').innerHTML = playerRows(el('k_psearch').value); bindRows(); };
  el('k_cancel').onclick = window.FBF_closeModal;
  el('k_save').onclick = async function(){
    var odds = {};
    document.querySelectorAll('[data-odd]').forEach(function(i){ var w=Number(i.value)||0; if(w>0) odds[i.getAttribute('data-odd')] = w; });
    var ids = []; for (var k in selSet) if (selSet[k]) ids.push(parseInt(k,10));
    var use = el('k_cuse').checked;
    var payload = {
      name:v('k_name'), price:parseInt(v('k_price'),10)||0, card_count:parseInt(v('k_cc'),10)||1,
      rarity_odds: JSON.stringify(odds),
      eligible_players: ids.length ? JSON.stringify(ids) : '',
      color_from: use ? el('k_cf').value : '', color_to: use ? el('k_ct').value : '', color_accent: use ? el('k_ca').value : '',
      tag: v('k_tag'),
      guaranteed_rarity_id: v('k_grar') ? parseInt(v('k_grar'),10) : 0,
      guaranteed_count: parseInt(v('k_gcnt'),10)||0,
      allow_dupes: el('k_dupes').checked, min_overall: parseInt(v('k_minov'),10)||0, max_overall: parseInt(v('k_maxov'),10)||0,
      available_from: v('k_from')||'', available_to: v('k_to')||'',
      active: el('k_active').checked, is_event: el('k_event').checked
    };
    try{ if(isNew) await api('/admin/packs',{method:'POST',body:payload}); else await api('/admin/packs/'+p.id,{method:'PUT',body:payload});
      window.FBF_closeModal(); window.FBF_toast('Pacote salvo!','ok'); render(document.getElementById('app'));
    }catch(e){ window.FBF_toast(e.message,'err'); }
  };
}

/* ---------------- LOJA E MERCADO ---------------- */
async function tabShop(body){
  var d = await api('/admin/shop');
  body.innerHTML = '<div class="toolbar">'
    + '<div class="stat"><div class="n">'+d.cycle+'</div><div class="l">Rotacao atual</div></div>'
    + '<div class="stat"><div class="n">'+esc(d.refresh_label)+'</div><div class="l">Troca a cada</div></div>'
    + '<button class="btn primary" id="s_refresh">'+icon('cog')+' Trocar ofertas agora</button></div>'
    + '<div class="panel" style="margin-bottom:20px"><h3 style="margin-bottom:12px">Ofertas ativas</h3>'
    + '<table><thead><tr><th>Carta</th><th>Preco</th><th>Estoque</th><th>Vendidos</th><th></th></tr></thead><tbody>'
    + d.offers.map(function(o){
        return '<tr><td>'+esc(o.player? o.player.name : '-')+' ('+(o.player?o.player.overall:'')+')</td>'
          + '<td><input type="number" style="width:100px" data-price="'+o.id+'" value="'+o.price+'"></td>'
          + '<td>'+(o.unlimited?'ilimitado':o.remaining)+'</td><td>'+o.sold+'</td>'
          + '<td><button class="btn sm danger" data-rm="'+o.id+'">Remover</button></td></tr>';
      }).join('') + '</tbody></table></div>'
    + '<div class="panel"><h3 style="margin-bottom:12px">Regras e precos do mercado</h3>'
    + '<div class="field"><label>Regras exibidas aos jogadores</label><textarea id="s_rules" rows="5"></textarea></div>'
    + '<div class="row">'+ fl('Preco minimo','s_minp',d.config? '' : '') + fl('Preco maximo','s_maxp','') + '</div>'
    + '<button class="btn primary" id="s_save">Salvar regras</button></div>';
  // carrega valores atuais das regras
  var rules = await api('/market/rules');
  el('s_rules').value = rules.rules||''; el('s_minp').value = rules.min_price; el('s_maxp').value = rules.max_price;
  el('s_refresh').onclick = async function(){ if(!confirm('Trocar as ofertas da loja agora?'))return; await api('/admin/shop/refresh',{method:'POST'}); window.FBF_toast('Loja rotacionada!','ok'); render(document.getElementById('app')); };
  el('s_save').onclick = async function(){
    await api('/admin/shop/config',{method:'PUT',body:{ rules:el('s_rules').value, min_price:parseInt(el('s_minp').value,10), max_price:parseInt(el('s_maxp').value,10) }});
    window.FBF_toast('Regras salvas!','ok');
  };
  body.querySelectorAll('[data-price]').forEach(function(i){
    i.onchange = async function(){ await api('/admin/shop/offers/'+i.getAttribute('data-price'),{method:'PUT',body:{price:parseInt(i.value,10)}}); window.FBF_toast('Preco atualizado','ok'); };
  });
  body.querySelectorAll('[data-rm]').forEach(function(b){
    b.onclick = async function(){ await api('/admin/shop/offers/'+b.getAttribute('data-rm'),{method:'DELETE'}); window.FBF_toast('Oferta removida','ok'); render(document.getElementById('app')); };
  });
}

/* ---------------- LOJINHA (Pix + anuncios) ---------------- */
function csReais(cents){ return ((Number(cents)||0)/100).toFixed(2); }
function csCents(reais){ var v = parseFloat(String(reais).replace(',','.')); return isNaN(v)?0:Math.round(v*100); }

async function tabCashShop(body){
  var d = await api('/admin/cashshop');
  var c = d.config||{};
  var on = function(v){ return (v==='1'||v===1||v===true); };

  var cfgHtml = '<div class="panel" style="margin-bottom:20px"><h3 style="margin-bottom:12px">Configuracao da Lojinha</h3>'
    + '<label style="display:flex;gap:8px;align-items:center;margin-bottom:12px"><input type="checkbox" id="cs_enabled"'+(on(c.enabled)?' checked':'')+'> Lojinha ativada</label>'
    + '<div class="row">'
    + '<div class="field"><label>Chave Pix</label><input id="cs_pixkey" value="'+esc(c.pix_key||'')+'"></div>'
    + '<div class="field"><label>Nome do recebedor</label><input id="cs_pixname" value="'+esc(c.pix_name||'')+'"></div>'
    + '</div>'
    + '<div class="field"><label>Instrucoes exibidas ao jogador</label><textarea id="cs_info" rows="3">'+esc(c.info||'')+'</textarea></div>'
    + '<h3 style="margin:16px 0 10px">Anuncios (moedas gratis)</h3>'
    + '<label style="display:flex;gap:8px;align-items:center;margin-bottom:12px"><input type="checkbox" id="cs_aden"'+(on(c.ad_enabled)?' checked':'')+'> Anuncios ativados</label>'
    + '<div class="row">'
    + '<div class="field"><label>Moedas por anuncio</label><input type="number" id="cs_adrw" value="'+(c.ad_reward||0)+'"></div>'
    + '<div class="field"><label>Cooldown (segundos)</label><input type="number" id="cs_adcd" value="'+(c.ad_cooldown||0)+'"></div>'
    + '<div class="field"><label>Limite por dia (0 = ilimitado)</label><input type="number" id="cs_adlim" value="'+(c.ad_daily_limit||0)+'"></div>'
    + '</div>'
    + '<button class="btn primary" id="cs_savecfg">Salvar configuracao</button></div>';

  var kindOpts = function(sel){ return ['pack','card','coins'].map(function(k){ return '<option value="'+k+'"'+(k===sel?' selected':'')+'>'+k+'</option>'; }).join(''); };
  function prodRow(p){
    p = p||{};
    return '<tr data-pid="'+(p.id||'')+'">'
      + '<td><input style="width:150px" data-f="title" value="'+esc(p.title||'')+'"></td>'
      + '<td><select data-f="kind">'+kindOpts(p.kind||'pack')+'</select></td>'
      + '<td><input type="number" style="width:70px" data-f="ref_id" value="'+(p.ref_id!=null?p.ref_id:'')+'" title="ID do pacote/carta"></td>'
      + '<td><input type="number" step="0.01" style="width:80px" data-f="price" value="'+csReais(p.price)+'"></td>'
      + '<td><input type="number" step="0.01" style="width:80px" data-f="promo_price" value="'+(p.promo_price!=null?csReais(p.promo_price):'')+'"></td>'
      + '<td><input style="width:90px" data-f="promo_label" value="'+esc(p.promo_label||'')+'"></td>'
      + '<td><input style="width:80px" data-f="badge" value="'+esc(p.badge||'')+'"></td>'
      + '<td><input type="number" style="width:50px" data-f="qty" value="'+(p.qty!=null?p.qty:1)+'"></td>'
      + '<td><input type="number" style="width:70px" data-f="coins_amount" value="'+(p.coins_amount||0)+'"></td>'
      + '<td><input type="number" style="width:50px" data-f="sort" value="'+(p.sort||0)+'"></td>'
      + '<td style="text-align:center"><input type="checkbox" data-f="active"'+(on(p.active)?' checked':'')+'></td>'
      + '<td style="white-space:nowrap">'+(p.id
          ? '<button class="btn sm primary" data-save="'+p.id+'">Salvar</button> <button class="btn sm danger" data-del="'+p.id+'">X</button>'
          : '<button class="btn sm primary" data-create="1">Criar</button>')+'</td>'
      + '</tr>';
  }

  var prodHtml = '<div class="panel" style="margin-bottom:20px"><h3 style="margin-bottom:6px">Produtos (precos em R$)</h3>'
    + '<p style="color:var(--ink2);font-size:12.5px;margin-bottom:10px">Tipo: <b>pack</b>=pacote, <b>card</b>=carta, <b>coins</b>=moedas. ID = id do pacote/carta vinculada. Preco promo + rotulo ativam a promocao.</p>'
    + '<div style="overflow:auto"><table><thead><tr><th>Titulo</th><th>Tipo</th><th>ID ref</th><th>Preco</th><th>Promo</th><th>Rotulo</th><th>Selo</th><th>Qtd</th><th>Moedas</th><th>Ordem</th><th>Ativo</th><th></th></tr></thead>'
    + '<tbody id="cs_prodbody">'
    + (d.products||[]).map(prodRow).join('')
    + prodRow({kind:'pack',qty:1,active:1})
    + '</tbody></table></div></div>';

  var ordHtml = '<div class="panel"><h3 style="margin-bottom:12px">Pedidos aguardando aprovacao ('+(d.orders?d.orders.length:0)+')</h3>'
    + ((d.orders&&d.orders.length)
      ? '<table><thead><tr><th>#</th><th>Jogador</th><th>Produto</th><th>Valor</th><th>Comprovante</th><th></th></tr></thead><tbody>'
        + d.orders.map(function(o){
            var name = esc(o.global_name||o.username||('user '+o.user_id));
            return '<tr><td>'+o.id+'</td><td>'+name+'</td><td>'+esc(o.title||'')+'</td><td>R$ '+csReais(o.amount)+'</td>'
              + '<td>'+(o.proof_url?('<a href="'+esc(o.proof_url)+'" target="_blank" rel="noopener">ver</a>'):'-')+'</td>'
              + '<td style="white-space:nowrap"><button class="btn sm primary" data-ap="'+o.id+'">Aprovar</button> <button class="btn sm danger" data-rj="'+o.id+'">Recusar</button></td></tr>';
          }).join('') + '</tbody></table>'
      : '<p style="color:var(--ink2)">Nenhum pedido pendente.</p>')
    + '</div>';

  body.innerHTML = cfgHtml + prodHtml + ordHtml;

  // salvar config
  el('cs_savecfg').onclick = async function(){
    await api('/admin/cashshop/config',{method:'POST',body:{
      cashshop_enabled: el('cs_enabled').checked?'1':'0',
      cashshop_pix_key: el('cs_pixkey').value,
      cashshop_pix_name: el('cs_pixname').value,
      cashshop_info: el('cs_info').value,
      ad_enabled: el('cs_aden').checked?'1':'0',
      ad_reward: String(parseInt(el('cs_adrw').value,10)||0),
      ad_cooldown: String(parseInt(el('cs_adcd').value,10)||0),
      ad_daily_limit: String(parseInt(el('cs_adlim').value,10)||0)
    }});
    window.FBF_toast('Configuracao salva!','ok');
  };

  // coleta os campos de uma linha de produto
  function collect(tr){
    var o = {};
    tr.querySelectorAll('[data-f]').forEach(function(i){
      var f = i.getAttribute('data-f');
      if (i.type==='checkbox'){ o[f] = i.checked?1:0; return; }
      var v = i.value.trim();
      if (f==='price'||f==='promo_price'){ o[f] = (v===''? (f==='promo_price'?null:0) : csCents(v)); return; }
      if (f==='ref_id'){ o[f] = (v===''?null:parseInt(v,10)); return; }
      if (f==='qty'||f==='coins_amount'||f==='sort'){ o[f] = parseInt(v,10)||0; return; }
      o[f] = v;
    });
    return o;
  }

  body.querySelectorAll('[data-save]').forEach(function(b){
    b.onclick = async function(){
      var tr = b.closest('tr');
      await api('/admin/cashshop/products/'+b.getAttribute('data-save'),{method:'PUT',body:collect(tr)});
      window.FBF_toast('Produto salvo!','ok'); render(document.getElementById('app'));
    };
  });
  body.querySelectorAll('[data-del]').forEach(function(b){
    b.onclick = async function(){
      if(!confirm('Remover este produto da lojinha?'))return;
      await api('/admin/cashshop/products/'+b.getAttribute('data-del'),{method:'DELETE'});
      window.FBF_toast('Produto removido','ok'); render(document.getElementById('app'));
    };
  });
  body.querySelectorAll('[data-create]').forEach(function(b){
    b.onclick = async function(){
      var tr = b.closest('tr');
      var o = collect(tr);
      if (!o.title){ window.FBF_toast('Informe o titulo','err'); return; }
      await api('/admin/cashshop/products',{method:'POST',body:o});
      window.FBF_toast('Produto criado!','ok'); render(document.getElementById('app'));
    };
  });
  body.querySelectorAll('[data-ap]').forEach(function(b){
    b.onclick = async function(){
      if(!confirm('Aprovar o pedido e liberar o item ao jogador?'))return;
      await api('/admin/cashshop/orders/'+b.getAttribute('data-ap')+'/approve',{method:'POST'});
      window.FBF_toast('Pedido aprovado e item liberado!','ok'); render(document.getElementById('app'));
    };
  });
  body.querySelectorAll('[data-rj]').forEach(function(b){
    b.onclick = async function(){
      var note = prompt('Motivo da recusa (opcional):','');
      if (note===null) return;
      await api('/admin/cashshop/orders/'+b.getAttribute('data-rj')+'/reject',{method:'POST',body:{note:note}});
      window.FBF_toast('Pedido recusado','ok'); render(document.getElementById('app'));
    };
  });
}

/* ---------------- JOGADORES (usuarios) ---------------- */
async function tabUsers(body){
  var d = await api('/admin/users');
  body.innerHTML = '<div class="panel"><table><thead><tr><th>ID</th><th>Nome</th><th>Moedas</th><th>Cartas</th><th>Admin</th><th style="width:230px">Acoes</th></tr></thead><tbody>'
    + d.users.map(function(u){
        return '<tr><td>'+u.id+'</td><td>'+esc(u.global_name||u.username)+'</td><td>'+fmt(u.coins)+'</td><td>'+u.cards+'</td>'
          + '<td>'+(u.is_admin?'<span class="badge admin">Sim</span>':'-')+'</td>'
          + '<td><button class="btn sm" data-coin="'+u.id+'">Dar moedas</button> '
          + '<button class="btn sm" data-card="'+u.id+'">Dar carta</button> '
          + '<button class="btn sm" data-adm="'+u.id+'">'+(u.is_admin?'Remover admin':'Tornar admin')+'</button></td></tr>';
      }).join('') + '</tbody></table></div>';
  body.querySelectorAll('[data-coin]').forEach(function(b){
    b.onclick = async function(){
      var v = prompt('Quantas moedas dar? (use numero negativo para tirar)','1000');
      if (v===null) return;
      await api('/admin/users/'+b.getAttribute('data-coin')+'/coins',{method:'POST',body:{amount:parseInt(v,10)||0, reason:'Ajuste do admin'}});
      window.FBF_toast('Moedas ajustadas','ok'); render(document.getElementById('app'));
    };
  });
  body.querySelectorAll('[data-card]').forEach(function(b){
    b.onclick = async function(){
      var pid = prompt('ID da carta (jogador) a entregar:');
      if (!pid) return;
      await api('/admin/users/'+b.getAttribute('data-card')+'/cards',{method:'POST',body:{player_ids:[parseInt(pid,10)]}});
      window.FBF_toast('Carta entregue','ok'); render(document.getElementById('app'));
    };
  });
  body.querySelectorAll('[data-adm]').forEach(function(b){
    b.onclick = async function(){
      var u = d.users.find(function(x){return String(x.id)===b.getAttribute('data-adm');});
      await api('/admin/users/'+u.id+'/admin',{method:'POST',body:{admin:!u.is_admin}});
      window.FBF_toast('Permissao atualizada','ok'); render(document.getElementById('app'));
    };
  });
}

/* ---------------- TIMES (escudos/identidade) ---------------- */
async function tabTeams(body){
  var d = await api('/teams');
  var teams = d.teams || [];
  body.innerHTML = '<p class="page-sub">Cadastre os times (nome + escudo). Eles podem ser usados nas cartas e nos bots.</p>'
    + '<div class="toolbar"><button class="btn primary" data-new="1">'+icon('plus')+' Novo time</button></div>'
    + '<div class="panel"><table><thead><tr><th>Escudo</th><th>Nome</th><th>Pais</th><th>Liga</th><th style="width:150px">Acoes</th></tr></thead><tbody>'
    + teams.map(function(t){
        var cr = t.crest ? (/^https?:|^\/|^data:/.test(t.crest) ? '<img src="'+esc(t.crest)+'" style="width:26px;height:26px;object-fit:contain;border-radius:5px">' : esc(t.crest)) : '-';
        return '<tr><td style="font-size:20px">'+cr+'</td><td>'+esc(t.name)+'</td><td>'+esc(t.country||'-')+'</td><td>'+esc(t.league||'-')+'</td>'
          + '<td><button class="btn sm" data-edit="'+t.id+'">Editar</button> <button class="btn sm danger" data-del="'+t.id+'">Apagar</button></td></tr>';
      }).join('') + '</tbody></table></div>';
  body.querySelector('[data-new]').onclick = function(){ teamForm(null, body); };
  body.querySelectorAll('[data-edit]').forEach(function(btn){
    btn.onclick = function(){ teamForm(teams.find(function(x){return String(x.id)===btn.getAttribute('data-edit');}), body); };
  });
  body.querySelectorAll('[data-del]').forEach(function(btn){
    btn.onclick = async function(){ if(!confirm('Apagar time? As cartas vinculadas ficam sem time.'))return; await api('/admin/teams/'+btn.getAttribute('data-del'),{method:'DELETE'}); window.FBF_toast('Time apagado','ok'); render(document.getElementById('app')); };
  });
}
function teamForm(t, body){
  var isNew = !t;
  t = t || { name:'', crest:'', country:'', league:'', color_primary:'#1f6feb', color_secondary:'#0b2545', kit_style:'vertical' };
  var html = '<h3 style="margin-bottom:16px">'+(isNew?'Novo time':'Editar: '+esc(t.name))+'</h3>'
    + '<div class="row">'+ fl('Nome','t_name',t.name) + fl('Escudo (emoji ou URL da imagem)','t_crest',t.crest) + '</div>'
    + '<div class="row">'+ fl('Pais','t_country',t.country) + fl('Liga','t_league',t.league) + '</div>'
    + '<div class="row">'+ fl('Cor primaria','t_cp',t.color_primary||'#1f6feb','color') + fl('Cor secundaria','t_cs',t.color_secondary||'#0b2545','color') + '</div>'
    + '<div class="toolbar"><button class="btn primary" id="t_save">Salvar</button><button class="btn" id="t_cancel">Cancelar</button></div>';
  window.FBF_openModal(html);
  el('t_cancel').onclick = window.FBF_closeModal;
  el('t_save').onclick = async function(){
    var payload = { name:v('t_name')||'Time', crest:v('t_crest')||null, country:v('t_country')||null, league:v('t_league')||null,
      color_primary:v('t_cp'), color_secondary:v('t_cs') };
    try{
      if (isNew) await api('/admin/teams',{method:'POST',body:payload});
      else await api('/admin/teams/'+t.id,{method:'PUT',body:payload});
      window.FBF_closeModal(); window.FBF_toast('Time salvo!','ok'); render(document.getElementById('app'));
    }catch(e){ window.FBF_toast(e.message,'err'); }
  };
}

/* ---------------- BOTS ---------------- */
async function tabBots(body){
  var d = await api('/admin/bots');
  body.innerHTML = '<div class="panel" style="margin-bottom:20px"><h3 style="margin-bottom:12px">Espera entre partidas</h3>'
    + '<div class="row">'+ fl('Segundos de espera','b_cd',d.config.cooldown,'number') + fl('Limite diario (0 = sem limite)','b_dl',d.config.daily_limit,'number') + '</div>'
    + '<button class="btn primary" id="b_cfg">Salvar</button></div>'
    + '<div class="toolbar"><button class="btn primary" id="b_new">'+icon('plus')+' Novo bot</button></div>'
    + '<div class="panel"><table><thead><tr><th>Nome</th><th>Forca</th><th>Cartas reais</th><th>Recompensa</th><th>Ativo</th><th style="width:150px">Acoes</th></tr></thead><tbody>'
    + d.bots.map(function(b){
        var nc = countIds(b.card_ids);
        var cartas = nc>0 ? '<span class="badge ok">'+nc+' cartas</span>' : '<span class="badge">numerico</span>';
        return '<tr><td>'+esc(b.crest||'')+' '+esc(b.name)+'</td><td>'+b.strength+'</td><td>'+cartas+'</td><td>'+fmt(b.reward)+'</td>'
          + '<td>'+(b.active?'<span class="badge ok">Sim</span>':'<span class="badge err">Nao</span>')+'</td>'
          + '<td><button class="btn sm" data-edit="'+b.id+'">Editar</button> <button class="btn sm danger" data-del="'+b.id+'">Apagar</button></td></tr>';
      }).join('') + '</tbody></table></div>';
  el('b_cfg').onclick = async function(){
    await api('/admin/bots/config',{method:'PUT',body:{cooldown:parseInt(el('b_cd').value,10)||0, daily_limit:parseInt(el('b_dl').value,10)||0}});
    window.FBF_toast('Configuracao salva','ok');
  };
  el('b_new').onclick = function(){ botForm(null, body); };
  body.querySelectorAll('[data-edit]').forEach(function(btn){
    btn.onclick = function(){ botForm(d.bots.find(function(x){return String(x.id)===btn.getAttribute('data-edit');}), body); };
  });
  body.querySelectorAll('[data-del]').forEach(function(btn){
    btn.onclick = async function(){ if(!confirm('Apagar bot?'))return; await api('/admin/bots/'+btn.getAttribute('data-del'),{method:'DELETE'}); window.FBF_toast('Bot apagado','ok'); render(document.getElementById('app')); };
  });
}

/* Le um JSON de ids ("[1,2,3]") de forma tolerante. */
function parseIds(s){
  if (!s) return [];
  if (Array.isArray(s)) return s.map(Number).filter(function(n){return !isNaN(n);});
  try{ var a = JSON.parse(s); return Array.isArray(a) ? a.map(Number).filter(function(n){return !isNaN(n);}) : []; }
  catch(e){ return []; }
}
function countIds(s){ return parseIds(s).length; }

async function botForm(b, body){
  var isNew = !b;
  b = b || { name:'Novo bot', crest:'\uD83E\uDD16', strength:75, reward:120, chemistry:60, team_id:null, card_ids:null };
  var teamsData = await api('/teams');
  var playersData = await api('/players');
  var teams = teamsData.teams || [];
  var players = (playersData.players || []).slice().sort(function(a,c){ return (c.overall||0)-(a.overall||0); });
  var selected = parseIds(b.card_ids);
  var selSet = {}; selected.forEach(function(id){ selSet[id]=true; });

  function playerRows(filter){
    var q = (filter||'').toLowerCase();
    return players.filter(function(p){ return !q || (p.name||'').toLowerCase().indexOf(q)>=0; }).slice(0,400).map(function(p){
      return '<label class="bp-row" style="display:flex;gap:8px;align-items:center;padding:4px 6px;border-bottom:1px solid var(--line,#2a2a3a);font-size:13px">'
        + '<input type="checkbox" data-pid="'+p.id+'" style="width:auto"'+(selSet[p.id]?' checked':'')+'>'
        + '<b style="min-width:34px;text-align:center">'+(p.overall||0)+'</b>'
        + '<span style="flex:1">'+esc(p.name)+'</span>'
        + '<span style="color:var(--ink2);min-width:40px;text-align:right">'+esc(C.pos(p.position))+'</span></label>';
    }).join('') || '<div style="padding:10px;color:var(--ink2)">Nenhuma carta encontrada.</div>';
  }

  var html = '<h3 style="margin-bottom:16px">'+(isNew?'Novo bot':'Editar bot: '+esc(b.name))+'</h3><div class="row">'
    + fl('Nome','bb_name',b.name) + fl('Escudo (emoji/URL)','bb_crest',b.crest) + fl('Forca','bb_str',b.strength,'number') + '</div>'
    + '<div class="row">'+ fl('Recompensa (vitoria)','bb_rew',b.reward,'number') + fl('Quimica (entrosamento)','bb_chem',b.chemistry,'number')
    + '<div class="field"><label>Time (escudo/identidade)</label><select id="bb_team"><option value="">- nenhum -</option>'
      + teams.map(function(t){return '<option value="'+t.id+'"'+(String(b.team_id)===String(t.id)?' selected':'')+'>'+esc(t.name)+'</option>';}).join('')+'</select></div>'
    + '</div>'
    + '<div class="field"><label>Jogadores do bot (cartas REAIS) <span style="color:var(--ink2)">— marque as cartas; se vazio, o bot usa o modelo numerico</span></label>'
    + '<input id="bb_psearch" placeholder="Buscar carta por nome..." style="width:100%;margin-bottom:6px">'
    + '<div style="font-size:12px;color:var(--ink2);margin-bottom:6px" id="bb_count">'+selected.length+' carta(s) selecionada(s)</div>'
    + '<div id="bb_plist" style="max-height:280px;overflow:auto;border:1px solid var(--line,#2a2a3a);border-radius:8px">'+playerRows('')+'</div></div>'
    + '<div class="toolbar" style="margin-top:16px"><button class="btn primary" id="bb_save">Salvar</button><button class="btn" id="bb_cancel">Cancelar</button></div>';
  window.FBF_openModal(html);

  function bindRows(){
    el('bb_plist').querySelectorAll('[data-pid]').forEach(function(cb){
      cb.onchange = function(){ selSet[cb.getAttribute('data-pid')] = cb.checked; refreshCount(); };
    });
  }
  function refreshCount(){
    var n = 0; for (var k in selSet) if (selSet[k]) n++;
    el('bb_count').textContent = n+' carta(s) selecionada(s)';
  }
  bindRows();
  el('bb_psearch').oninput = function(){ el('bb_plist').innerHTML = playerRows(el('bb_psearch').value); bindRows(); };
  el('bb_cancel').onclick = window.FBF_closeModal;
  el('bb_save').onclick = async function(){
    var ids = [];
    for (var k in selSet) if (selSet[k]) ids.push(parseInt(k,10));
    var payload = { name:v('bb_name'), crest:v('bb_crest'), strength:parseInt(v('bb_str'),10)||70,
      reward:parseInt(v('bb_rew'),10)||100, chemistry:parseInt(v('bb_chem'),10)||40,
      team_id: v('bb_team')?parseInt(v('bb_team'),10):null, card_ids: JSON.stringify(ids) };
    try{
      if (isNew) await api('/admin/bots',{method:'POST',body:payload});
      else await api('/admin/bots/'+b.id,{method:'PUT',body:payload});
      window.FBF_closeModal(); window.FBF_toast('Bot salvo','ok'); render(document.getElementById('app'));
    }catch(e){ window.FBF_toast(e.message,'err'); }
  };
}

/* ---------------- SISTEMA ---------------- */
async function tabSystem(body){
  var m = await api('/admin/maintenance');
  body.innerHTML = '<div class="panel" style="margin-bottom:20px"><h3 style="margin-bottom:12px">Modo manutencao</h3>'
    + '<label style="display:flex;gap:8px;align-items:center;margin-bottom:12px;font-size:14px"><input type="checkbox" id="mn_on" style="width:auto"'+(m.on?' checked':'')+'> Ativar manutencao (so admins jogam)</label>'
    + '<div class="field"><label>Mensagem</label><textarea id="mn_msg" rows="3">'+esc(m.message||'')+'</textarea></div>'
    + '<button class="btn primary" id="mn_save">Salvar</button></div>'
    + '<div class="panel"><h3 style="margin-bottom:12px">Recompensas do Draft Aleatorio</h3><div id="drLv">'+loading()+'</div></div>';
  el('mn_save').onclick = async function(){
    await api('/admin/maintenance',{method:'PUT',body:{on:el('mn_on').checked, message:el('mn_msg').value}});
    window.FBF_toast('Manutencao atualizada','ok');
  };
  var lv = await api('/admin/draft-rewards');
  el('drLv').innerHTML = '<table><thead><tr><th>Nivel</th><th>Nome</th><th>Forca</th><th>Moedas</th><th>Pacote</th></tr></thead><tbody>'
    + lv.levels.map(function(l){
        return '<tr><td>'+(l.level+1)+'</td><td>'+esc(l.name)+'</td><td>'+l.strength+'</td><td>'+l.coins+'</td><td>'+esc(l.pack_label||'-')+'</td></tr>';
      }).join('') + '</tbody></table>';
}

/* ---------------- Helpers ---------------- */
function v(id){ var e=el(id); return e? e.value : ''; }
function fl(label,id,val,type){
  return '<div class="field"><label>'+esc(label)+'</label><input id="'+id+'" type="'+(type||'text')+'" value="'+esc(val==null?'':val)+'"></div>';
}
})();
