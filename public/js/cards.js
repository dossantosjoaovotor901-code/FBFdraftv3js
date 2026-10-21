/* =====================================================================
   FBF - Renderizador de cartas (NOVO modelo ESCUDO premium)
   Formato escudo com ponta central no topo/base, recortes laterais,
   moldura fina clara, nota + posicao no topo, nome centralizado e os
   6 atributos oficiais da FBF em DUAS colunas (3 + 3).
   ===================================================================== */
(function(){
  'use strict';
  var ICON = window.FBF_icon || function(){ return ''; };
  function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){
    return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}

  // ---- Posicoes (futsal: GK, VL = CM, PV = ST) ----
  var POS_LABEL = {GK:'GK', CM:'VL', ST:'PV', CB:'VL', LB:'VL', RB:'VL', CDM:'VL', CAM:'PV', LW:'PV', RW:'PV', CF:'PV'};
  function posLabel(code){ var c=String(code==null?'':code).trim(); return POS_LABEL[c.toUpperCase()] || c; }
  function posList(csv){ return String(csv||'').split(',').map(function(x){return x.trim();}).filter(Boolean).map(posLabel).join(', '); }

  var PATTERNS = ['none','rays','diagonal','dots','hex','carbon','crystal','discs'];
  var LAYOUTS  = ['classic','modern','compact','legend'];
  var EFFECTS  = ['none','shine','glow','metal','holo','prism'];
  var ANIMS    = ['none','aurora','flow','pulse','sparks','stars'];
  var ANIM_LABELS = {none:'Nenhuma',aurora:'Aurora',flow:'Fluxo',pulse:'Pulso',sparks:'Faiscas',stars:'Estrelas'};
  var ANIM_SPEED = {1:1.8, 2:1, 3:.55};

  // ---- 6 atributos oficiais FBF ----
  var ATTR_INFO = {
    fin:{label:'FIN', name:'Finalizacao', desc:'Precisao e eficiencia nos gols'},
    pas:{label:'PAS', name:'Passe', desc:'Criacao e distribuicao'},
    ctl:{label:'CTL', name:'Controle', desc:'Dominio e controle da bola'},
    skl:{label:'SKL', name:'Skill', desc:'Dribles, fintas e jogadas individuais'},
    def:{label:'DEF', name:'Defesa', desc:'Desarmes e interceptacoes'},
    jdc:{label:'JDC', name:'Jogo de Corpo', desc:'Protecao e disputas de espaco'}
  };
  var GK_ATTR_INFO = {
    div:{label:'DIV', name:'Defesa', desc:'Defesas dificeis e alcance'},
    man:{label:'MAN', name:'Manejo', desc:'Seguranca nas bolas agarradas'},
    chu:{label:'CHU', name:'Chute', desc:'Reposicao e lancamentos'},
    ref:{label:'REF', name:'Reflexo', desc:'Tempo de reacao no gol'},
    vel:{label:'VEL', name:'Velocidade', desc:'Agilidade para sair do gol'},
    gpos:{label:'POS', name:'Posicionamento', desc:'Leitura de jogada e cobertura'}
  };

  // ---- Bandeiras ----
  var COUNTRY_DATA = [
    'br|bra|Brasil|Brazil','ar|arg|Argentina','uy|ury|Uruguai|Uruguay','py|pry|Paraguai','cl|chl|Chile',
    'co|col|Colombia','pe|per|Peru','ec|ecu|Equador','ve|ven|Venezuela','bo|bol|Bolivia',
    'pt|prt|Portugal','es|esp|Espanha|Spain','fr|fra|Franca|France','it|ita|Italia|Italy',
    'de|deu|Alemanha|Germany','gb-eng|eng|Inglaterra|England','nl|nld|Holanda|Netherlands',
    'be|bel|Belgica|Belgium','hr|hrv|Croacia','rs|srb|Servia','ch|che|Suica','at|aut|Austria',
    'us|usa|Estados Unidos|EUA','mx|mex|Mexico','ca|can|Canada','jp|jpn|Japao|Japan',
    'kr|kor|Coreia do Sul','cn|chn|China','au|aus|Australia','ao|ago|Angola','mz|moz|Mocambique','cv|cpv|Cabo Verde'
  ];
  var COUNTRY_MAP = {}, COUNTRY_NAMES = [];
  function norm(s){return String(s||'').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');}
  COUNTRY_DATA.forEach(function(row){
    var a = row.split('|'), iso2 = a[0];
    COUNTRY_MAP[norm(iso2)] = iso2; COUNTRY_MAP[norm(a[1])] = iso2;
    a.slice(2).forEach(function(n){ COUNTRY_MAP[norm(n)] = iso2; });
    COUNTRY_NAMES.push(a[2]);
  });
  function flagCode(country){ return COUNTRY_MAP[norm(country)] || null; }
  function flagHtml(country){
    var code = flagCode(country);
    if (!code) return '';
    return '<div class="fc-flag"><img src="https://flagcdn.com/w40/'+code+'.png" alt="'+esc(country)+'" title="'+esc(country)+'"></div>';
  }

  // ---- Boneco estilo Haxball ----
  var hbSeq = 0;
  function initials(name){
    var w = String(name||'').trim().split(/\s+/).filter(Boolean);
    if (!w.length) return '?';
    if (w.length === 1) return w[0].slice(0,2).toUpperCase();
    return (w[0][0] + w[w.length-1][0]).toUpperCase();
  }
  var AVATAR_STYLES = ['vertical','diagonal','half','hoops','solid'];
  function haxball(p){
    var t = p.team || {};
    var c1 = esc(t.color_primary || '#d4af37');
    var c2 = esc(t.color_secondary || '#ffffff');
    var st = AVATAR_STYLES.indexOf(p.avatar_style) >= 0 ? p.avatar_style
           : (AVATAR_STYLES.indexOf(t.kit_style) >= 0 ? t.kit_style : 'vertical');
    var tc = esc(t.kit_text_color || '#ffffff');
    var txt = esc((p.avatar_text && String(p.avatar_text).trim().slice(0,2).toUpperCase()) || initials(p.name));
    var id = 'hb' + (++hbSeq);
    var stripes = '';
    if (st === 'vertical') stripes = '<rect x="30" width="14" height="100" fill="'+c2+'"/><rect x="56" width="14" height="100" fill="'+c2+'"/>';
    else if (st === 'diagonal') stripes = '<polygon points="-10,30 30,-10 110,70 70,110" fill="'+c2+'"/>';
    else if (st === 'half') stripes = '<rect x="50" width="50" height="100" fill="'+c2+'"/>';
    else if (st === 'hoops') stripes = '<rect y="26" width="100" height="14" fill="'+c2+'"/><rect y="58" width="100" height="14" fill="'+c2+'"/>';
    return '<svg class="hb-disc" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">'
      + '<defs><clipPath id="'+id+'"><circle cx="50" cy="50" r="44"/></clipPath></defs>'
      + '<g clip-path="url(#'+id+')"><rect width="100" height="100" fill="'+c1+'"/>'+stripes+'</g>'
      + '<circle cx="50" cy="50" r="44" fill="none" stroke="rgba(0,0,0,.55)" stroke-width="5"/>'
      + '<text x="50" y="50" dy=".35em" text-anchor="middle" font-family="Inter,Arial,sans-serif" '
      + 'font-size="'+(txt.length>1?34:42)+'" font-weight="900" fill="'+tc+'" stroke="#000" stroke-width="2.2" paint-order="stroke">'+txt+'</text>'
      + '</svg>';
  }

  function statRow(label,val,info){
    var tip = info ? (info.name+' - '+info.desc) : label;
    return '<span title="'+esc(tip)+'"><b>'+label+'</b><i>'+esc(val==null?0:val)+'</i></span>';
  }

  // ---- Habilidades das cartas (sorteadas no servidor: CardLogic.java) ----
  function traitCode(t){ return t.code || String(t.name||'?').slice(0,3).toUpperCase(); }
  function traitTip(t){
    return t.name+' ('+(t.tier_name||'')+(t.chance?' - ativa em '+t.chance+'% dos jogos':'')+') - '+t.desc;
  }
  function traitChip(t){
    return '<span class="tr tr-'+esc(t.kind||'all')+' tr-t'+(t.tier||1)+'" title="'+esc(traitTip(t))+'">'+esc(traitCode(t))+'</span>';
  }
  function traitsHtml(p, max){
    var list = Array.isArray(p.traits) ? p.traits : [];
    if (!list.length) return '';
    max = max || 3;
    var chips = list.slice(0, max).map(traitChip).join('');
    if (list.length > max) chips += '<span class="tr tr-more" title="'+esc(list.slice(max).map(function(t){return t.name;}).join(', '))+'">+'+(list.length-max)+'</span>';
    return '<div class="fc-traits">'+chips+'</div>';
  }

  /* Monta o HTML de uma carta de jogador. size: 'normal' | 'mini' | 'big' */
  function renderCard(p, size){
    size = size || 'normal';
    var m = p.model || {};
    var from = m.bg_from || '#f9e08a', to = m.bg_to || '#b98a1a';
    var border = m.border_color || '#a77c14', text = m.text_color || '#3a2a05';
    var accent = m.accent_color || border;
    var shine = m.shine_color || '#ffffff';
    var effect = (m.effect && m.effect !== 'none') ? ('effect-'+m.effect) : '';
    var pattern = (PATTERNS.indexOf(m.pattern) > 0) ? ('pat-'+m.pattern) : '';

    var style = '--c-from:'+esc(from)+';--c-to:'+esc(to)+';--c-border:'+esc(border)
      + ';--c-accent:'+esc(accent)+';--c-shine:'+esc(shine)+';color:'+esc(text)+';';
    var anim = ANIMS.indexOf(m.bg_anim) > 0 ? m.bg_anim : '';
    if (anim){
      var ac = /^#[0-9a-f]{3,8}$/i.test(m.bg_anim_color||'') ? m.bg_anim_color : accent;
      style += '--c-anim:'+esc(ac)+';--anim-k:'+(ANIM_SPEED[m.bg_anim_speed]||1)+';';
    }
    var excl = Number(p.is_exclusive) === 1;
    var mode = ['auto','photo','haxball'].indexOf(p.avatar_mode) >= 0 ? p.avatar_mode : 'auto';
    var useDisc = mode === 'haxball' || (mode === 'auto' && !p.photo);
    var photo = useDisc ? haxball(p)
      : p.photo ? '<img src="'+esc(p.photo)+'" alt="" onerror="this.style.display=\'none\'">'
      : '<span class="silhouette">'+ICON('ball')+'</span>';
    var crest = (p.team && p.team.crest)
      ? '<div class="fc-club"><img src="'+esc(p.team.crest)+'" alt="" onerror="this.style.display=\'none\'"></div>' : '';
    var flag = flagHtml(p.country);
    var logo = m.logo ? '<img class="fc-logo" src="'+esc(m.logo)+'" alt="" onerror="this.style.display=\'none\'">' : '';

    var stats;
    if (p.is_gk){
      stats = statRow('DIV',p.gk_div,GK_ATTR_INFO.div)+statRow('MAN',p.gk_han,GK_ATTR_INFO.man)+statRow('CHU',p.gk_kic,GK_ATTR_INFO.chu)
            + statRow('REF',p.gk_ref,GK_ATTR_INFO.ref)+statRow('VEL',p.gk_spd,GK_ATTR_INFO.vel)+statRow('POS',p.gk_pos,GK_ATTR_INFO.gpos);
    } else {
      var fin = p.fin!=null && p.fin!=='' ? p.fin : p.sho;
      var ctl = p.ctl!=null && p.ctl!=='' ? p.ctl : p.dri;
      var skl = p.skl!=null && p.skl!=='' ? p.skl : p.dri;
      var jdc = p.jdc!=null && p.jdc!=='' ? p.jdc : p.phy;
      stats = statRow('FIN',fin,ATTR_INFO.fin)+statRow('PAS',p.pas,ATTR_INFO.pas)+statRow('CTL',ctl,ATTR_INFO.ctl)
            + statRow('SKL',skl,ATTR_INFO.skl)+statRow('DEF',p.def,ATTR_INFO.def)+statRow('JDC',jdc,ATTR_INFO.jdc);
    }
    var rar = p.rarity ? p.rarity.name : '';
    var type = p.card_type ? String(p.card_type) : '';
    var nm = String(p.name||'');
    var nameCls = nm.length > 15 ? ' n-sm' : nm.length > 10 ? ' n-md' : '';
    var animLayer = anim ? '<span class="fc-bganim anim-'+anim+'" aria-hidden="true"><i></i><i></i></span>' : '';
    var bgImg = m.bg_image ? '<img class="fc-bgimg" src="'+esc(m.bg_image)+'" alt="" draggable="false" onerror="this.style.display=\'none\'">' : '';

    var rarCls = rar ? ' rar-' + norm(rar).replace(/[^a-z0-9]+/g,'-') : '';
    var delay = '--d:' + (Math.round(Math.random()*40)/10) + 's;';
    var SHAPE_PTS = '50,0 63,2.2 84,6.3 96,12.6 100,19.6 100,103.6 97,112 86,123.2 70,133 58,138 50,140 42,138 30,133 14,123.2 3,112 0,103.6 0,19.6 4,12.6 16,6.3 37,2.2';
    var frame = '<svg class="fc-frame" viewBox="0 0 100 140" preserveAspectRatio="none" aria-hidden="true">'
      + '<polygon class="f-out" points="'+SHAPE_PTS+'" transform="translate(50 70) scale(.985) translate(-50 -70)"/>'
      + '<polygon class="f-hi" points="'+SHAPE_PTS+'" transform="translate(50 70) scale(.968) translate(-50 -70)"/>'
      + '<polygon class="f-in" points="'+SHAPE_PTS+'" transform="translate(50 70) scale(.935) translate(-50 -70)"/>'
      + '</svg>';
    var fx = '<span class="fc-fx" aria-hidden="true"><span class="fc-foil"></span><span class="fc-glare"></span>'
      + '<span class="fc-sweep"></span><span class="fc-sparks"><i></i><i></i><i></i><i></i><i></i><i></i></span></span>';

    return '<div class="fc '+(size==='mini'?'mini':size==='big'?'big':'')+' '+pattern+' '+effect+rarCls+(excl?' is-exclusive':'')+(Array.isArray(p.traits)&&p.traits.length?' has-traits':'')+'" style="'+delay+style+'">'
      + '<span class="fc-glow" aria-hidden="true"></span>'
      + '<span class="fc-shield"><span class="fc-texture"></span></span>'
      + bgImg + animLayer + frame
      + '<div class="fc-body">'
      +   '<div class="fc-head">'
      +     '<div class="fc-side">'
      +       '<div class="fc-ov"><div class="ov">'+esc(p.overall)+'</div><div class="pos">'+esc(posLabel(p.position))+'</div></div>'
      +       '<div class="fc-meta">'+flag+crest+'</div>'
      +     '</div>'
      +     '<div class="fc-photo">'+photo+(size==='mini' ? '' : traitsHtml(p, size==='big' ? 4 : 3))+'</div>'
      +   '</div>'
      +   '<div class="fc-name'+nameCls+'" title="'+esc(nm)+'">'+esc(nm)+'</div>'
      +   (type?'<div class="fc-sub">'+esc(type)+'</div>':'')
      +   '<div class="fc-stats">'+stats+'</div>'
      +   ((logo||rar)?'<div class="fc-foot">'+logo+(rar?'<span class="fc-rar">'+esc(rar)+'</span>':'')+'</div>':'<div class="fc-foot"></div>')
      + '</div>'
      + fx
      + (excl?'<span class="fc-excl">EXCLUSIVA</span>':'')
      + '</div>';
  }

  /* ---- Tilt 3D + reflexo que seguem o mouse/dedo (delegado no documento) ---- */
  var tiltEl = null, raf = 0, lastEv = null;
  function tiltApply(){
    raf = 0;
    if (!tiltEl || !lastEv) return;
    var r = tiltEl.getBoundingClientRect();
    var x = Math.min(1, Math.max(0, (lastEv.clientX - r.left) / r.width));
    var y = Math.min(1, Math.max(0, (lastEv.clientY - r.top) / r.height));
    tiltEl.style.setProperty('--mx', (x*100).toFixed(1)+'%');
    tiltEl.style.setProperty('--my', (y*100).toFixed(1)+'%');
    tiltEl.style.setProperty('--ry', ((x-.5)*22).toFixed(2)+'deg');
    tiltEl.style.setProperty('--rx', ((.5-y)*18).toFixed(2)+'deg');
  }
  function tiltReset(el){
    if (!el) return;
    el.classList.remove('tilting');
    ['--mx','--my','--rx','--ry'].forEach(function(k){ el.style.removeProperty(k); });
  }
  if (window.matchMedia && !window.matchMedia('(prefers-reduced-motion: reduce)').matches){
    document.addEventListener('pointermove', function(e){
      var c = e.target && e.target.closest ? e.target.closest('.fc') : null;
      if (c && (c.classList.contains('mini') || c.closest('.ce-stage'))) c = null;
      if (c !== tiltEl){ tiltReset(tiltEl); tiltEl = c; if (c) c.classList.add('tilting'); }
      if (!c) return;
      lastEv = e;
      if (!raf) raf = requestAnimationFrame(tiltApply);
    }, {passive:true});
    document.documentElement.addEventListener('mouseleave', function(){ tiltReset(tiltEl); tiltEl = null; });
  }

  window.FBFCards = {
    pos: posLabel, posList: posList, POS_LABEL: POS_LABEL, render: renderCard, esc: esc,
    PATTERNS: PATTERNS, LAYOUTS: LAYOUTS, EFFECTS: EFFECTS, ANIMS: ANIMS, ANIM_LABELS: ANIM_LABELS,
    traitChip: traitChip, traitsHtml: traitsHtml, traitCode: traitCode,
    haxball: haxball, flagHtml: flagHtml, COUNTRY_NAMES: COUNTRY_NAMES, AVATAR_STYLES: AVATAR_STYLES,
    ATTR_INFO: ATTR_INFO, GK_ATTR_INFO: GK_ATTR_INFO
  };
})();
