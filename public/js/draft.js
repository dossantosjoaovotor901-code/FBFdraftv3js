/* ===== FBF - Montar Draft / Meu time / Draft Aleatorio ===== */
(function(){
'use strict';
var C = window.FBFCards, esc = C.esc, api = window.FBF_api, icon = window.FBF_icon;
var P = window.FBF_PAGES;
function el(id){return document.getElementById(id);}
function loading(){ return '<div class="loader"><div class="ring"></div></div>'; }
function empty(t){ return '<div class="empty"><div class="big">'+icon('ball')+'</div>'+esc(t)+'</div>'; }

/* ---------------- MEU TIME (montar com as suas cartas) ---------------- */
var own = { formation:null, formations:[], slots:[], cards:[], poolQuery:'', poolFitOnly:false };

P.draft = async function(root){
  var f = await api('/formations');
  own.formations = f.formations || [];
  var t = await api('/draft/team');
  var c = await api('/draft/my-cards');
  own.cards = c.items || [];

  var html = '<h1 class="page-title">Montar Draft</h1>'
    + '<p class="page-sub">Monte seu time usando as cartas que voce possui.</p>';

  if (t.squad){
    var fv = window.FBFSquad.fieldHtml((t.squad.slots||[]).map(function(x){ return {pos:x.pos,x:x.x,y:x.y,player:x.player}; }),
      { modality: window.FBFSquad.modalityOf(t.squad.formation), label: C.pos, render: function(p){ return C.render(p,'mini'); } });
    var teamName = esc(t.squad.squad_name||'Meu time') + ' ' + esc(t.squad.squad_crest||'');
    html += '<div class="draft-studio view">'
      + '<div class="ds-pitch"><div class="panel gold pitch-panel">'
      +   '<div class="pitch-head"><span class="pitch-form">'+esc(t.squad.formation)+'</span>'
      +   '<span class="pitch-count">'+teamName+'</span></div>'
      +   fv.html + '</div></div>'
      + '<aside class="ds-side">'
      +   window.FBFSquad.barHtml(fv.ev)
      +   '<div class="panel ds-info">'
      +     '<div class="di-row"><span class="di-lb">Time</span><span class="di-val">'+teamName+'</span></div>'
      +     '<div class="di-row"><span class="di-lb">Formacao</span><span class="di-val">'+esc(t.squad.formation)+'</span></div>'
      +     '<div class="di-row"><span class="di-lb">Nota geral</span><span class="di-val">'+t.squad.rating+'</span></div>'
      +     '<div class="di-row"><span class="di-lb">Entrosamento</span><span class="di-val">'+t.squad.chemistry+'</span></div>'
      +     (t.squad.broken?'<div class="di-row"><span class="badge err">'+t.squad.broken+' carta(s) indisponivel(is)</span></div>':'')
      +   '</div>'
      +   window.FBFSquad.legendHtml()
      +   '<div class="ds-actions"><button class="btn primary block" id="editTeam">Editar time</button>'
      +   '<button class="btn danger block" id="delTeam">Apagar time</button></div>'
      + '</aside></div>';
    root.innerHTML = html;
    el('delTeam').onclick = async function(){
      if (!confirm('Apagar o time? Seu nome e escudo sao mantidos.')) return;
      await api('/draft/team',{method:'DELETE'});
      window.FBF_toast('Time apagado','ok'); P.draft(root);
    };
    el('editTeam').onclick = function(){ mountEditor(root); };
    return;
  }

  html += '<div class="panel" style="margin-bottom:20px"><h3 style="margin-bottom:12px">Escolha a formacao</h3><div id="formPick"></div></div>';
  root.innerHTML = html;
  mountEditor(root);
};

function mountEditor(root){
  var byMode = {};
  own.formations.forEach(function(f){ (byMode[f.mode] = byMode[f.mode]||[]).push(f); });
  var modes = Object.keys(byMode);
  var pick = el('formPick') || (function(){ var d=document.createElement('div'); d.id='formPick'; root.appendChild(d); return d; })();
  var html = '<div class="toolbar">';
  modes.forEach(function(m, i){
    byMode[m].forEach(function(f, j){
      html += '<button class="btn sm'+(i===0&&j===0?' primary':'')+'" data-fid="'+f.id+'">'+esc(m+' - '+f.name)+'</button>';
    });
  });
  html += '</div>';
  pick.innerHTML = html;
  pick.querySelectorAll('[data-fid]').forEach(function(b){
    b.onclick = function(){
      pick.querySelectorAll('[data-fid]').forEach(function(x){x.classList.remove('primary');});
      b.classList.add('primary');
      startFill(parseInt(b.getAttribute('data-fid'),10), root);
    };
  });
  if (modes.length) startFill(byMode[modes[0]][0].id, root);
}

function startFill(formationId, root){
  var f = own.formations.find(function(x){ return x.id===formationId; });
  if (!f) return;
  own.formation = f;
  own.slots = JSON.parse(f.slots_json||'[]').map(function(s){ return { pos:s.pos, x:s.x, y:s.y, user_card_id:null }; });
  var wrap = el('fillWrap');
  if (!wrap){ wrap = document.createElement('div'); wrap.id='fillWrap'; wrap.style.marginTop='18px'; root.appendChild(wrap); }
  paintField(wrap, root);
}

function currentSlots(){
  return own.slots.map(function(s){
    return { pos:s.pos, x:s.x, y:s.y, player: s.user_card_id ? findCard(s.user_card_id) : null };
  });
}
function paintField(wrap, root){
  wrap.__root = root;
  var Q = window.FBFSquad;
  var fv = Q.fieldHtml(currentSlots(), { modality: own.formation && own.formation.mode, active: activeSlot, interactive: true,
    label: C.pos, render: function(p){ return C.render(p,'mini'); } });
  var fm = own.formation || {};
  var total = own.slots.length;
  var filled = own.slots.filter(function(s){ return s.user_card_id; }).length;
  var pct = total ? Math.round(100*filled/total) : 0;
  var activePos = own.slots[activeSlot] ? C.pos(own.slots[activeSlot].pos) : '-';

  var html = '<div class="draft-studio">'
    + '<div class="ds-pitch"><div class="panel gold pitch-panel">'
    +   '<div class="pitch-head"><span class="pitch-form">'+esc((fm.mode||'')+' \u00b7 '+(fm.name||''))+'</span>'
    +   '<span class="pitch-count">'+filled+'/'+total+' posicoes</span></div>'
    +   fv.html
    + '</div></div>'
    + '<aside class="ds-side">'
    +   Q.barHtml(fv.ev)
    +   '<div class="panel ds-info">'
    +     '<div class="di-row"><span class="di-lb">Formacao</span><span class="di-val">'+esc((fm.mode||'')+' '+(fm.name||''))+'</span></div>'
    +     '<div class="di-row"><span class="di-lb">Posicoes preenchidas</span><span class="di-val">'+filled+'/'+total+'</span></div>'
    +     '<div class="di-row"><span class="di-lb">Posicao em edicao</span><span class="di-val">'+esc(activePos)+'</span></div>'
    +     '<div class="ds-progress"><span class="di-lb">Progresso do draft</span><div class="pbar"><i style="width:'+pct+'%"></i></div></div>'
    +   '</div>'
    +   Q.legendHtml()
    +   '<div class="ds-actions">'
    +     '<button class="btn primary block" id="saveSquad">Salvar time</button>'
    +     '<button class="btn block" id="clearSquad">Limpar selecao</button>'
    +   '</div>'
    + '</aside>'
    + '<section class="ds-pool">'
    +   '<div class="pool-head"><h3>Jogadores disponiveis</h3>'
    +   '<span class="pool-hint">Selecionando para <b>'+esc(activePos)+'</b></span></div>'
    +   '<div class="toolbar">'
    +     '<input type="text" id="poolSearch" placeholder="Buscar jogador..." value="'+esc(own.poolQuery||'')+'">'
    +     '<label style="display:inline-flex;align-items:center;gap:7px;font-weight:700;font-size:13.5px;color:var(--ink2)">'
    +       '<input type="checkbox" id="poolFit" style="width:auto"'+(own.poolFitOnly?' checked':'')+'> Apenas compativeis</label>'
    +   '</div>'
    +   '<div class="grid players" id="cardPool"></div>'
    + '</section>'
    + '</div>';
  wrap.innerHTML = html;

  wrap.querySelectorAll('[data-slot]').forEach(function(n){
    n.onclick = function(){ activeSlot = parseInt(n.getAttribute('data-slot'),10); paintField(wrap, root); };
  });
  paintPool(wrap);
  var sInp = el('poolSearch');
  if (sInp) sInp.oninput = function(){ own.poolQuery = sInp.value; paintPool(wrap); };
  var fChk = el('poolFit');
  if (fChk) fChk.onchange = function(){ own.poolFitOnly = fChk.checked; paintPool(wrap); };
  el('clearSquad').onclick = function(){
    own.slots.forEach(function(s){ s.user_card_id = null; });
    paintField(wrap, root);
  };
  el('saveSquad').onclick = async function(){
    var payload = own.slots.map(function(s){ return { pos:s.pos, user_card_id:s.user_card_id }; });
    if (payload.some(function(s){ return !s.user_card_id; })){ window.FBF_toast('Preencha todas as posicoes','err'); return; }
    try{
      var r = await api('/draft/save',{method:'POST',body:{mode:'own', formation_id:own.formation.id, slots:payload}});
      window.FBF_toast('Time salvo! Nota '+r.rating+' - Quimica '+r.chemistry,'ok');
      P.draft(root);
    }catch(e){ window.FBF_toast(e.message,'err'); }
  };
}

var activeSlot = 0;
function paintPool(wrap){
  var s = own.slots[activeSlot];
  var used = {};
  own.slots.forEach(function(x){ if (x.user_card_id) used[x.user_card_id]=1; });
  var pos = s ? s.pos : null;
  var q = (own.poolQuery||'').trim().toLowerCase();
  var list = own.cards.filter(function(i){
    return i.user_card_ids.some(function(id){ return !used[id]; });
  });
  if (q) list = list.filter(function(i){ return String(i.player.name||'').toLowerCase().indexOf(q) >= 0; });
  if (own.poolFitOnly) list = list.filter(function(i){ return fits(i.player,pos); });
  list.sort(function(a,b){
    var fa = fits(a.player,pos)?1:0, fb = fits(b.player,pos)?1:0;
    return (fb-fa) || (b.player.overall - a.player.overall);
  });
  var pool = el('cardPool');
  if (!pool) return;
  if (!list.length){ pool.innerHTML = empty(q||own.poolFitOnly?'Nenhuma carta encontrada com esse filtro.':'Nenhuma carta disponivel.'); return; }
  pool.innerHTML = list.map(function(i){
    var id = i.user_card_ids.filter(function(x){ return !used[x]; })[0];
    var ok = fits(i.player,pos);
    return '<div class="pool-pick'+(ok?'':' off')+'" data-pick="'+id+'">'+C.render(i.player,'mini')
      + (ok?'<span class="badge ok ok-tag">OK</span>':'')+'</div>';
  }).join('');
  pool.querySelectorAll('[data-pick]').forEach(function(n){
    n.onclick = function(){
      own.slots[activeSlot].user_card_id = parseInt(n.getAttribute('data-pick'),10);
      activeSlot = Math.min(activeSlot+1, own.slots.length-1);
      paintField(wrap, wrap.__root || wrap);
    };
  });
}
function findCard(ucid){ for (var i=0;i<own.cards.length;i++){ if (own.cards[i].user_card_ids.indexOf(ucid)>=0) return own.cards[i].player; } return null; }
function fits(p, pos){
  if (!pos) return false;
  var POS = C.POS_LABEL;
  var lbl = C.pos(pos);
  if (C.pos(p.position) === lbl) return true;
  return String(p.positions||'').split(',').map(function(x){return C.pos(x.trim());}).indexOf(lbl) >= 0;
}
/* ---------------- DRAFT ALEATORIO (sequencia de dificuldades) ----------------
   Fluxo: inicio (4 dificuldades) -> escolher formacao -> campo com 5 cartas por
   posicao (escolha definitiva) -> iniciar sequencia -> jogar dificuldade a dificuldade.
   Recompensa UNICA no fim: a da maior dificuldade vencida (nao soma). */
var DG_COLORS = ['#3b82f6','#1f9d57','#e08a00','#c8372d'];
var DG_MODES = ['x3','x4','x5','x7'];

P.draftgame = async function(root){
  window.scrollTo(0, 0);
  var cur = await api('/draftrun/current');
  if (cur.run && cur.run.status === 'active') return dgRun(root, cur.run);
  var s = await api('/draftrun/session');
  if (s && s.slots) return dgFill(root, s);
  return dgHome(root);
};

function dgPackTxt(l){ return l.pack_label || 'Pacote'; }
function dgSync(r){
  var u = window.FBF_state && window.FBF_state.user;
  if (!u) return;
  if (r && r.coins != null) u.coins = r.coins;
  if (r && r.packs_pending != null) u.packs_pending = r.packs_pending;
  window.FBF_refreshTopbar();
}

/* ---- 1) Inicio: as 4 dificuldades ---- */
async function dgHome(root){
  var cfg = await api('/draftrun/config');
  var lv = cfg.levels || [];
  var html = '<h1 class="page-title">'+icon('trophy')+' Draft Aleatorio</h1>'
    + '<p class="page-sub">Monte um time temporario com cartas sorteadas e vença as dificuldades em sequencia. '
    + 'No fim da sequencia voce recebe <b>uma unica recompensa</b>: a da <b>maior dificuldade que venceu</b> (moedas + 1 pacote). '
    + 'As recompensas <b>nao se somam</b>. O pacote vai para a aba <b>Pacotes</b> e fica acumulando ate voce abrir. '
    + 'Este modo <b>nao</b> mexe no seu "Meu time".</p>'
    + '<div class="dg-levels">';
  lv.forEach(function(l, i){
    html += '<div class="dg-lv" style="--lvc:'+DG_COLORS[i % 4]+'">'
      + '<div class="dg-lv-head"><span class="dg-num">'+(i+1)+'</span><b>'+esc(l.name)+'</b></div>'
      + '<div class="dg-str">Forca adversario ~'+l.strength+'</div>'
      + '<div class="dg-rw"><span class="badge gold">+'+l.coins+' FBF</span>'
      + '<span class="badge dg-pk">'+icon('gift')+' '+esc(dgPackTxt(l))+'</span></div>'
      + '<div class="dg-note">Se esta for a maior que voce vencer</div></div>';
  });
  html += '</div><div class="toolbar" style="margin-top:22px">'
    + '<button class="btn primary" id="dgStart">Montar time e começar</button>'
    + '<button class="btn" id="dgPacks">'+icon('gift')+' Meus pacotes</button></div>';
  root.innerHTML = html;
  el('dgStart').onclick = function(){ dgFormations(root); };
  el('dgPacks').onclick = function(){ window.FBF_navigate('packs'); };
}

/* ---- 2) Escolher formacao (x3, x4, x5, x7) ---- */
async function dgFormations(root){
  window.scrollTo(0, 0);
  var r = await api('/formations');
  var by = {};
  (r.formations || []).forEach(function(f){ if (f.mode) (by[f.mode] = by[f.mode] || []).push(f); });
  var modes = DG_MODES.filter(function(m){ return by[m]; })
    .concat(Object.keys(by).filter(function(m){ return DG_MODES.indexOf(m) < 0; }));
  var html = '<h1 class="page-title">Draft Aleatorio</h1>'
    + '<p class="page-sub">Escolha o formato e a formacao do seu time temporario. As cartas sao sorteadas <b>uma vez</b> e cada escolha e <b>definitiva</b>.</p>'
    + '<div class="toolbar" style="margin-bottom:14px"><button class="btn sm" id="dgBack">← Voltar</button></div>';
  if (!modes.length) html += empty('Nenhuma formacao disponivel.');
  modes.forEach(function(m){
    html += '<div class="panel dg-mode"><h3><b>'+esc(m.toUpperCase())+'</b> <span>· '+m.slice(1)+' contra '+m.slice(1)+'</span></h3><div class="dg-forms">';
    by[m].forEach(function(f){
      var n = JSON.parse(f.slots_json || '[]').length;
      html += '<button class="dg-form" data-fid="'+f.id+'"><b>'+esc(f.name)+'</b><span>'+n+' cartas</span></button>';
    });
    html += '</div></div>';
  });
  root.innerHTML = html;
  el('dgBack').onclick = function(){ dgHome(root); };
  root.querySelectorAll('[data-fid]').forEach(function(b){
    b.onclick = async function(){
      root.querySelectorAll('[data-fid]').forEach(function(x){ x.disabled = true; });
      try{
        var s = await api('/draftrun/session', {method:'POST', body:{formation_id: parseInt(b.getAttribute('data-fid'),10)}});
        dgFill(root, s);
      }catch(e){
        window.FBF_toast(e.message, 'err');
        root.querySelectorAll('[data-fid]').forEach(function(x){ x.disabled = false; });
      }
    };
  });
}

/* ---- 3) Campo: toque na posicao e escolha 1 entre 5 cartas ---- */
function dgFill(root, s){
  var Q = window.FBFSquad;
  var total = s.slots.length;
  function pickedOf(sl){
    if (sl.pick == null) return null;
    for (var i = 0; i < sl.options.length; i++) if (sl.options[i].id === sl.pick) return sl.options[i];
    return null;
  }
  function paint(){
    var slots = s.slots.map(function(sl){ return { pos: sl.pos, x: sl.x, y: sl.y, player: pickedOf(sl) }; });
    var filled = slots.filter(function(x){ return x.player; }).length;
    var fv = Q.fieldHtml(slots, { modality: s.modality, interactive: true, label: C.pos,
      render: function(p){ return C.render(p, 'mini'); } });
    var title = String(s.label || '').replace(' . ', ' · ');
    root.innerHTML = '<h1 class="page-title">Draft Aleatorio · '+esc(s.modality)+' · '+esc(String(s.label||'').split(' . ')[1] || '')+'</h1>'
      + '<p class="page-sub">Toque em cada posicao e escolha 1 entre '+(s.slots[0] ? s.slots[0].options.length : 5)+' cartas ('+filled+'/'+total+'). '
      + '<b>As cartas ja estao sorteadas e a escolha e definitiva.</b></p>'
      + '<div class="draft-studio dg-studio">'
      + '<div class="ds-pitch"><div class="panel gold pitch-panel">'
      +   '<div class="pitch-head"><span class="pitch-form">'+esc(title)+'</span><span class="pitch-count">'+filled+'/'+total+' posicoes</span></div>'
      +   fv.html + '</div></div>'
      + '<aside class="ds-side"><div class="panel ds-info">'
      +   '<h3 style="margin-bottom:12px">Elenco temporario</h3>'
      +   '<div class="dg-stats"><div><b>'+fv.ev.rating+'</b><span>Nota geral</span></div><div><b>'+fv.ev.chemistry+'</b><span>Quimica</span></div></div>'
      +   '<div class="di-row"><span class="di-lb">'+filled+' de '+total+' posicoes preenchidas</span></div>'
      +   '<div class="ds-actions">'
      +     '<button class="btn primary block" id="dgGo"'+(filled === total ? '' : ' disabled')+'>Iniciar sequencia</button>'
      +     '<button class="btn block" id="dgCancel">Cancelar este Draft</button>'
      +   '</div></div>' + Q.legendHtml() + '</aside></div>';

    root.querySelectorAll('[data-slot]').forEach(function(n){
      var i = parseInt(n.getAttribute('data-slot'), 10);
      if (s.slots[i].pick != null) { n.style.cursor = 'default'; return; }   /* definitiva */
      n.style.cursor = 'pointer';
      n.onclick = function(){ openPicker(i); };
    });
    el('dgCancel').onclick = async function(){
      if (!confirm('Cancelar este Draft? As cartas sorteadas serao perdidas.')) return;
      try{ await api('/draftrun/session/cancel', {method:'POST'}); }catch(e){}
      dgHome(root);
    };
    el('dgGo').onclick = async function(){
      this.disabled = true;
      try{
        await api('/draftrun/start', {method:'POST'});
        window.FBF_toast('Time montado! Boa sorte.', 'ok');
        P.draftgame(root);
      }catch(e){ window.FBF_toast(e.message, 'err'); this.disabled = false; }
    };
  }

  function openPicker(i){
    var sl = s.slots[i], chosen = null;
    var h = '<h3 style="margin-bottom:4px">Escolha 1 carta — '+esc(C.pos(sl.pos))+'</h3>'
      + '<p style="color:var(--ink2);font-size:13px;margin-bottom:14px">A escolha e definitiva.</p>'
      + '<div class="grid players dg-opts">'
      + sl.options.map(function(p){
          return '<div class="pool-pick" data-opt="'+p.id+'">'+C.render(p, 'mini')+'</div>';
        }).join('')
      + '</div><button class="btn primary block" id="dgOk" style="margin-top:16px" disabled>Confirmar escolha</button>';
    window.FBF_openModal(h);
    var body = el('modalBody');
    body.querySelectorAll('[data-opt]').forEach(function(n){
      n.onclick = function(){
        chosen = parseInt(n.getAttribute('data-opt'), 10);
        body.querySelectorAll('[data-opt]').forEach(function(x){ x.classList.toggle('dg-sel', x === n); });
        el('dgOk').disabled = false;
      };
    });
    el('dgOk').onclick = async function(){
      if (chosen == null) return;
      this.disabled = true;
      try{
        var ns = await api('/draftrun/session/pick', {method:'POST', body:{slot:i, player_id:chosen}});
        s = ns;
        window.FBF_closeModal();
        paint();
      }catch(e){ window.FBF_toast(e.message, 'err'); this.disabled = false; }
    };
  }
  paint();
}

/* ---- 4) Sequencia em andamento ---- */
async function dgRun(root, run){
  var cfg = await api('/draftrun/config');
  var lv = cfg.levels || [];
  var Q = window.FBFSquad;
  var wins = run.wins, cur = run.level;
  var best = wins > 0 ? lv[Math.min(wins, lv.length) - 1] : null;

  var html = '<h1 class="page-title">'+icon('trophy')+' Draft Aleatorio</h1>'
    + '<p class="page-sub">Sequencia em andamento — '+esc(String(run.formation||'').replace(' . ',' · '))+'</p>'
    + '<div class="dg-levels">';
  lv.forEach(function(l, i){
    var st = i < wins ? 'done' : (i === cur ? 'now' : 'lock');
    html += '<div class="dg-lv '+st+'" style="--lvc:'+DG_COLORS[i % 4]+'">'
      + '<div class="dg-lv-head"><span class="dg-num">'+(st==='done' ? icon('check') : (i+1))+'</span><b>'+esc(l.name)+'</b></div>'
      + '<div class="dg-str">Forca adversario ~'+l.strength+'</div>'
      + '<div class="dg-rw"><span class="badge gold">+'+l.coins+' FBF</span><span class="badge dg-pk">'+icon('gift')+' '+esc(dgPackTxt(l))+'</span></div>'
      + '<div class="dg-note">'+(st==='done' ? 'Vencida' : st==='now' ? 'Proxima partida' : 'Bloqueada')+'</div></div>';
  });
  html += '</div>';

  var fv = Q.fieldHtml((run.squad || []).map(function(x){ return { pos:x.pos, x:x.x, y:x.y, player:x.player }; }),
    { modality: run.modality || null, label: C.pos, render: function(p){ return C.render(p, 'mini'); } });

  html += '<div class="draft-studio view dg-studio" style="margin-top:22px">'
    + '<div class="ds-pitch"><div class="panel gold pitch-panel">'
    +   '<div class="pitch-head"><span class="pitch-form">'+esc(String(run.formation||'').replace(' . ',' · '))+'</span>'
    +   '<span class="pitch-count">'+wins+' vitoria(s)</span></div>'+fv.html+'</div></div>'
    + '<aside class="ds-side">'+Q.barHtml(fv.ev)
    +   '<div class="panel ds-info">'
    +     '<div class="di-row"><span class="di-lb">Recompensa garantida</span></div>'
    +     (best
          ? '<div class="dg-rw" style="margin:6px 0 8px"><span class="badge gold">+'+best.coins+' FBF</span><span class="badge dg-pk">'+icon('gift')+' '+esc(dgPackTxt(best))+'</span></div>'
            + '<div class="dg-note">Da maior dificuldade vencida: '+esc(best.name)+'. Nao soma com as outras.</div>'
          : '<div class="dg-note">Venca a primeira dificuldade para garantir uma recompensa.</div>')
    +     '<div class="ds-actions">'
    +       '<button class="btn primary block" id="dgPlay">Jogar — '+esc(lv[cur] ? lv[cur].name : '')+'</button>'
    +       '<button class="btn danger block" id="dgQuit">'+(best ? 'Encerrar e receber recompensa' : 'Abandonar')+'</button>'
    +     '</div></div></aside></div>';
  root.innerHTML = html;

  el('dgQuit').onclick = async function(){
    var msg = best ? 'Encerrar a sequencia agora e receber a recompensa de "'+best.name+'"?' : 'Abandonar a sequencia atual? Voce nao recebera recompensa.';
    if (!confirm(msg)) return;
    try{
      var r = await api('/draftrun/abandon', {method:'POST'});
      dgSync(r);
      P.draftgame(root);
      if (r.reward && r.reward.given) dgEndModal({ ended_reason:'abandoned', wins:wins, reward:r.reward });
    }catch(e){ window.FBF_toast(e.message, 'err'); }
  };

  el('dgPlay').onclick = async function(){
    this.disabled = true;
    try{
      var r = await api('/draftrun/play', {method:'POST'});
      dgMatch(root, r);
    }catch(e){ window.FBF_toast(e.message, 'err'); this.disabled = false; }
  };
}

/* Partida ao vivo (mesmo simulador da partida contra o bot) */
function dgMatch(root, r){
  window.scrollTo(0, 0);
  root.innerHTML = '<h1 class="page-title">'+icon('trophy')+' Draft Aleatorio \u00b7 '+esc(r.level_name)+'</h1><div id="dgMatch"></div>';
  function leave(){ dgSync(r); P.draftgame(root); }   /* moedas/pacotes so mudam no topo ao sair da partida */
  var nextBtn = null;   /* so habilita quando a partida terminar */
  var sim = Object.assign({}, r, {
    reward: null,
    customControls: '<button class="btn primary" id="dgNextMatch" disabled title="Disponivel quando a partida terminar">'+(r.ended ? 'Voltar ao Draft' : 'Proxima partida')+' \u25B6</button>',
    onControls: function(box){ nextBtn = box.querySelector('#dgNextMatch'); if (nextBtn) nextBtn.onclick = leave; },
    endHtml: dgOutcomeHtml(r) + (r.ended && r.reward && r.reward.pack_label
      ? '<div style="margin-top:16px"><button class="btn" id="dgPk">'+icon('gift')+' Ver pacotes</button></div>' : ''),
    onEnd: function(box){
      dgSync(r);
      if (nextBtn){ nextBtn.disabled = false; }   /* fim do jogo: libera avancar/voltar ao draft */
      var pk = box.querySelector('#dgPk');
      if (pk) pk.onclick = function(){ window.FBF_navigate('packs'); };
    }
  });
  if (window.FBFSim && window.FBFSim.show) window.FBFSim.show(el('dgMatch'), sim);
}

function dgOutcomeHtml(r){
  if (!r.ended) {
    return '<p style="margin-top:14px;color:var(--ink2)">Dificuldade vencida! Siga para a proxima partida. '
      + 'A recompensa so e entregue no fim e vale a da <b>maior dificuldade vencida</b>.</p>';
  }
  var why = { champion:'Voce venceu todas as dificuldades!', loss:'Voce perdeu e a sequencia terminou.',
              draw:'Empate: a sequencia terminou.', abandoned:'Sequencia encerrada.' }[r.ended_reason] || 'Sequencia encerrada.';
  var h = '<div class="dg-final"><b>'+esc(why)+'</b>';
  if (r.reward && r.reward.given) {
    h += '<div style="margin-top:8px">Recompensa de <b>'+esc(r.reward.level_name)+'</b> (maior dificuldade vencida):</div>'
      + '<div class="dg-rw" style="margin-top:8px"><span class="badge gold">+'+r.reward.coins+' FBF</span>'
      + (r.reward.pack_label ? '<span class="badge dg-pk">'+icon('gift')+' '+esc(r.reward.pack_label)+'</span>' : '')+'</div>'
      + (r.reward.pack_label ? '<div class="dg-note" style="margin-top:8px">O pacote foi para a aba Pacotes.</div>' : '');
  } else {
    h += '<div class="dg-note" style="margin-top:6px">Nenhuma dificuldade vencida, entao nao ha recompensa desta vez.</div>';
  }
  return h + '</div>';
}
function dgEndModal(r){
  window.FBF_openModal('<h3 style="margin-bottom:10px">Draft Aleatorio</h3>'+dgOutcomeHtml(Object.assign({ended:true}, r))
    + '<button class="btn primary block" id="dgX" style="margin-top:16px">Fechar</button>');
  el('dgX').onclick = function(){ window.FBF_closeModal(); };
}
})();

/* ---------------- MEU TIME (aba dedicada) ---------------- */
(function(){
  var C2 = window.FBFCards, esc2 = C2.esc, api2 = window.FBF_api;
  var P2 = window.FBF_PAGES;
  function id2(x){return document.getElementById(x);}
  P2.team = async function(root){
    var t = await api2('/draft/team');
    var html = '<h1 class="page-title">Meu Time</h1><p class="page-sub">O elenco que voce salva em "Montar Draft" aparece aqui.</p>';
    if (!t.squad){
      html += '<div class="panel gold"><b>Voce ainda nao montou seu time.</b>'
        + '<p style="color:var(--ink2);margin:8px 0 14px">Use as suas cartas para montar o elenco.</p>'
        + '<button class="btn primary" data-goto3="draft">Montar meu time</button></div>';
      root.innerHTML = html;
      return;
    }
    var fv2 = window.FBFSquad.fieldHtml((t.squad.slots || []).map(function(x){ return {pos:x.pos,x:x.x,y:x.y,player:x.player}; }),
      { modality: window.FBFSquad.modalityOf(t.squad.formation), label: C2.pos, render: function(p){ return C2.render(p, 'mini'); } });
    var teamName2 = esc2(t.squad.squad_name || 'Meu time') + ' ' + esc2(t.squad.squad_crest || '');
    html += '<div class="draft-studio view">'
      + '<div class="ds-pitch"><div class="panel gold pitch-panel">'
      +   '<div class="pitch-head"><span class="pitch-form">'+esc2(t.squad.formation)+'</span>'
      +   '<span class="pitch-count">'+teamName2+'</span></div>'
      +   fv2.html + '</div></div>'
      + '<aside class="ds-side">'
      +   window.FBFSquad.barHtml(fv2.ev)
      +   '<div class="panel ds-info">'
      +     '<div class="di-row"><span class="di-lb">Time</span><span class="di-val">'+teamName2+'</span></div>'
      +     '<div class="di-row"><span class="di-lb">Formacao</span><span class="di-val">'+esc2(t.squad.formation)+'</span></div>'
      +     '<div class="di-row"><span class="di-lb">Nota geral</span><span class="di-val">'+t.squad.rating+'</span></div>'
      +     '<div class="di-row"><span class="di-lb">Entrosamento</span><span class="di-val">'+t.squad.chemistry+'</span></div>'
      +   '</div>'
      +   window.FBFSquad.legendHtml()
      +   '<div class="ds-actions"><button class="btn primary block" data-goto3="draft">Editar time</button></div>'
      + '</aside></div>';
    root.innerHTML = html;
  };
  document.addEventListener('click', function(e){
    var g = e.target.closest && e.target.closest('[data-goto3]');
    if (g) window.FBF_navigate(g.getAttribute('data-goto3'));
  });
})();
