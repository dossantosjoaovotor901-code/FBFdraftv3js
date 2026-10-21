/* ===== FBF - Lojinha (compra com Pix dinheiro real + anuncio por moedas) ===== */
(function(){
'use strict';
var C = window.FBFCards, esc = C.esc, api = window.FBF_api, icon = window.FBF_icon;
var P = window.FBF_PAGES;
function el(id){return document.getElementById(id);}

/* centavos -> "R$ 9,90" */
function brl(cents){
  cents = Number(cents)||0;
  return 'R$ ' + (cents/100).toFixed(2).replace('.', ',');
}

function kindLabel(k){
  if (k==='coins') return 'Moedas';
  if (k==='card') return 'Carta';
  if (k==='pack') return 'Pacote';
  return 'Item';
}

function productCard(p){
  var promo = p.on_promo;
  var price = Number(p.effective_price||p.price||0);
  var full = Number(p.price||0);
  var media = '';
  if (p.player){ media = '<div style="display:flex;justify-content:center;margin-bottom:8px">'+C.render(p.player,'mini')+'</div>'; }
  else if (p.image){ media = '<div style="height:120px;background:url('+esc(p.image)+') center/cover;border-radius:12px;margin-bottom:10px"></div>'; }
  else { media = '<div style="height:120px;display:flex;align-items:center;justify-content:center;font-size:44px;background:var(--bg2);border-radius:12px;margin-bottom:10px">'+icon(p.kind==='coins'?'coin':'gift')+'</div>'; }

  var badges = '';
  if (p.badge) badges += '<span class="badge gold" style="margin-right:6px">'+esc(p.badge)+'</span>';
  if (promo) badges += '<span class="badge err">'+esc(p.promo_label||'PROMO')+'</span>';

  var priceHtml = promo
    ? '<span style="text-decoration:line-through;color:var(--ink2);font-size:13px;margin-right:8px">'+brl(full)+'</span>'
      + '<b style="color:var(--gold-light);font-size:19px">'+brl(price)+'</b>'
    : '<b style="color:var(--ink);font-size:19px">'+brl(price)+'</b>';

  return '<div class="panel'+(promo?' gold':'')+'" style="display:flex;flex-direction:column">'
    + media
    + '<div style="margin-bottom:4px">'+badges+'</div>'
    + '<div style="font-weight:900;font-size:16px">'+esc(p.title||'Item')+'</div>'
    + '<div style="color:var(--ink2);font-size:12.5px;margin:4px 0 2px">'+esc(kindLabel(p.kind))
      + (p.kind==='pack'&&p.qty>1?(' x'+p.qty):'')
      + (p.kind==='coins'&&p.coins_amount?(' ('+p.coins_amount+' moedas)'):'')+'</div>'
    + (p.description?('<div style="color:var(--ink2);font-size:12.5px;line-height:1.5;margin-bottom:8px">'+esc(p.description)+'</div>'):'')
    + '<div style="margin-top:auto;display:flex;align-items:center;justify-content:space-between;padding-top:10px">'
    + '<div>'+priceHtml+'</div>'
    + '<button class="btn primary csBuy" data-id="'+p.id+'" data-title="'+esc(p.title||'')+'" data-price="'+price+'">Comprar</button>'
    + '</div></div>';
}

P.cashshop = async function(root){
  var d = await api('/cashshop');
  var html = '<h1 class="page-title">Lojinha</h1>'
    + '<p class="page-sub">Compre pacotes, cartas e moedas com Pix &mdash; ou assista a um anuncio e ganhe moedas de graca.</p>';

  if (!d.enabled){
    root.innerHTML = html + '<div class="panel"><b>A lojinha esta fechada no momento.</b><p style="color:var(--ink2);margin-top:8px">Volte mais tarde!</p></div>';
    return;
  }

  /* ----- Anuncio (moedas gratis) ----- */
  if (d.ad && d.ad.enabled){
    var a = d.ad;
    var blocked = (a.daily_limit>0 && a.used_today>=a.daily_limit);
    var cd = a.cooldown_left>0;
    var disabled = blocked || cd;
    var note = blocked ? ('Limite diario atingido ('+a.used_today+'/'+a.daily_limit+'). Volte amanha!')
      : cd ? ('Aguarde '+a.cooldown_left+'s para o proximo anuncio.')
      : ('Ganhe '+a.reward+' moedas assistindo um anuncio.'
         + (a.daily_limit>0?(' ('+a.used_today+'/'+a.daily_limit+' hoje)'):''));
    html += '<div class="panel" style="margin-bottom:20px;display:flex;gap:16px;align-items:center;flex-wrap:wrap">'
      + '<div style="font-size:32px">'+icon('coin')+'</div>'
      + '<div style="flex:1;min-width:180px"><div style="font-weight:900">Moedas gratis</div>'
      + '<div style="color:var(--ink2);font-size:13px" id="adNote">'+esc(note)+'</div></div>'
      + '<button class="btn primary" id="adBtn"'+(disabled?' disabled style="opacity:.5;cursor:not-allowed"':'')+'>Assistir anuncio</button>'
      + '</div>';
  }

  /* ----- Produtos ----- */
  if (d.products && d.products.length){
    html += '<div class="grid cols3" id="csGrid">';
    d.products.forEach(function(p){ html += productCard(p); });
    html += '</div>';
  } else {
    html += '<div class="panel"><b>Nenhum produto disponivel ainda.</b></div>';
  }

  /* ----- Ultimo pedido ----- */
  if (d.last_order){
    var st = d.last_order.status;
    var cls = st==='approved'?'ok':st==='rejected'?'err':'';
    var stlb = st==='approved'?'Aprovado':st==='rejected'?'Recusado':'Aguardando';
    html += '<div class="panel" style="margin-top:20px"><b>Seu ultimo pedido</b> <span class="badge '+cls+'">'+esc(stlb)+'</span>'
      + '<div style="color:var(--ink2);font-size:13px;margin-top:6px">'+esc(d.last_order.title||'')+' - '+brl(d.last_order.amount)+' - '+esc(d.last_order.created_at||'')+'</div>'
      + (d.last_order.admin_note?('<div style="color:var(--ink2);font-size:12.5px;margin-top:4px">Obs: '+esc(d.last_order.admin_note)+'</div>'):'')
      + '</div>';
  }

  root.innerHTML = html;

  /* ----- Acao: comprar (abre modal Pix) ----- */
  root.querySelectorAll('.csBuy').forEach(function(b){
    b.onclick = function(){ openPix(root, d.pix||{}, b.getAttribute('data-id'), b.getAttribute('data-title'), b.getAttribute('data-price')); };
  });

  /* ----- Acao: assistir anuncio ----- */
  if (el('adBtn')) el('adBtn').onclick = function(){ runAd(root); };
};

/* Modal de compra por Pix com upload do comprovante */
function openPix(root, pix, id, title, price){
  var html = '<h3 style="margin-bottom:4px">Comprar: '+esc(title)+'</h3>'
    + '<div class="badge gold" style="margin-bottom:14px">'+brl(price)+'</div>'
    + '<div style="font-size:13.5px;line-height:1.8;color:var(--ink2);margin-bottom:12px">'
    + '<div>Chave Pix: <b style="color:var(--ink)">'+esc(pix.key||'-')+'</b></div>'
    + '<div>Recebedor: <b style="color:var(--ink)">'+esc(pix.name||'-')+'</b></div>'
    + (pix.info?('<div style="margin-top:8px">'+esc(pix.info)+'</div>'):'')+'</div>'
    + '<p style="font-size:12.5px;color:var(--ink2);margin-bottom:10px">1) Pague o valor na chave Pix acima. 2) Anexe o comprovante. 3) O admin libera o item apos conferir.</p>'
    + '<div class="field"><label>Comprovante (imagem/PDF)</label><input type="file" id="csProof" accept="image/*,.pdf"></div>'
    + '<button class="btn primary" id="csSend" style="width:100%;margin-top:8px">Enviar pedido</button>';
  window.FBF_openModal(html);
  document.getElementById('csSend').onclick = async function(){
    var f = document.getElementById('csProof').files[0];
    if (!f){ window.FBF_toast('Anexe o comprovante do Pix','err'); return; }
    var fd = new FormData();
    fd.append('product_id', id);
    fd.append('proof', f);
    try{
      await api('/cashshop/order',{method:'POST', body:fd});
      window.FBF_toast('Pedido enviado! Aguarde a aprovacao.','ok');
      window.FBF_closeModal(); P.cashshop(root);
    }catch(e){ window.FBF_toast(e.message,'err'); }
  };
}

/* "Assiste" o anuncio (simulado) e credita as moedas no backend */
function runAd(root){
  var secs = 5;
  var html = '<div style="text-align:center">'
    + '<h3 style="margin-bottom:10px">Anuncio</h3>'
    + '<div style="height:150px;background:var(--bg2);border-radius:12px;display:flex;align-items:center;justify-content:center;font-weight:900;font-size:22px;color:var(--ink2)">Publicidade</div>'
    + '<div style="margin-top:14px;color:var(--ink2);font-size:13px" id="adTimer">Aguarde '+secs+'s...</div>'
    + '<button class="btn primary" id="adClaim" style="width:100%;margin-top:14px;opacity:.5;cursor:not-allowed" disabled>Resgatar moedas</button>'
    + '</div>';
  window.FBF_openModal(html);
  var timerEl = document.getElementById('adTimer');
  var timer = setInterval(function(){
    secs--;
    if (!document.getElementById('adTimer')){ clearInterval(timer); return; }
    if (secs<=0){
      clearInterval(timer);
      document.getElementById('adTimer').textContent = 'Pronto! Resgate suas moedas.';
      var b = document.getElementById('adClaim'); b.disabled=false; b.style.opacity='1'; b.style.cursor='pointer';
    } else {
      document.getElementById('adTimer').textContent = 'Aguarde '+secs+'s...';
    }
  }, 1000);
  document.getElementById('adClaim').onclick = async function(){
    try{
      var r = await api('/cashshop/ad',{method:'POST'});
      window.FBF_toast('+'+r.reward+' moedas!','ok');
      window.FBF_closeModal();
      P.cashshop(root);
    }catch(e){ window.FBF_toast(e.message,'err'); window.FBF_closeModal(); }
  };
}
})();
