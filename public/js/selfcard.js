/* ===== FBF - Minha Carta (carta pessoal evolutiva + Pix) ===== */
(function(){
'use strict';
var C = window.FBFCards, esc = C.esc, api = window.FBF_api, icon = window.FBF_icon;
var P = window.FBF_PAGES;
function el(id){return document.getElementById(id);}
function loading(){ return '<div class="loader"><div class="ring"></div></div>'; }

P.selfcard = async function(root){
  var d = await api('/selfcard');
  var buy = await api('/selfcard/buy-info');
  var html = '<h1 class="page-title">Minha Carta</h1>'
    + '<p class="page-sub">Sua carta pessoal evolui conforme voce joga.</p>';

  if (d.card){
    var c = d.card;
    html += '<div style="display:flex;gap:26px;flex-wrap:wrap;align-items:flex-start">'
      + '<div>'+C.render(c.player,'big')+'</div>'
      + '<div class="panel" style="flex:1;min-width:260px">'
      + '<div style="font-weight:900;font-size:20px;margin-bottom:6px">'+esc(c.player.name)+'</div>'
      + '<div class="badge gold" style="margin-bottom:14px">Nivel '+c.level+' / '+c.max+'</div>'
      + (c.at_max ? '<div style="color:var(--gold-light);font-weight:700">Nivel maximo alcancado!</div>'
        : '<div style="margin-bottom:8px;color:var(--ink2);font-size:13.5px">XP: '+c.xp+' / '+c.need+'</div>'
          + '<div style="height:9px;background:var(--bg2);border-radius:6px;overflow:hidden">'
          + '<div style="height:100%;width:'+Math.min(100,Math.round(c.xp/Math.max(1,c.need)*100))+'%;background:linear-gradient(90deg,var(--ev-dark),var(--ev-primary))"></div></div>')
      + '<p style="color:var(--ink2);font-size:13px;margin-top:16px;line-height:1.6">Jogue partidas para ganhar XP e evoluir sua carta. Ela muda de raridade conforme a nota sobe.</p>'
      + '</div></div>';
    root.innerHTML = html;
    return;
  }

  html += '<div class="grid cols2">';
  // Resgate por codigo
  html += '<div class="panel"><h3 style="margin-bottom:12px">Resgatar com codigo</h3>'
    + '<div class="field"><label>Codigo</label><input id="scCode" placeholder="FBF-XXXX-XXXX"></div>'
    + '<div class="field"><label>Nome da carta</label><input id="scName" placeholder="Seu nome" maxlength="16"></div>'
    + '<div class="field"><label>Posicao</label><select id="scPos"><option value="CM">Volante (VL)</option><option value="ST">Pivo (PV)</option><option value="GK">Goleiro (GK)</option></select></div>'
    + '<button class="btn primary" style="width:100%" id="scClaim">Resgatar carta</button></div>';
  // Compra por Pix
  if (buy.pix && buy.pix.enabled){
    html += '<div class="panel gold"><h3 style="margin-bottom:12px">Comprar por Pix</h3>'
      + '<div style="font-size:13.5px;line-height:1.8;color:var(--ink2)">'
      + '<div>Chave Pix: <b style="color:var(--ink)">'+esc(buy.pix.pix_key||'-')+'</b></div>'
      + '<div>Recebedor: <b style="color:var(--ink)">'+esc(buy.pix.pix_name||'-')+'</b></div>'
      + '<div>Valor: <b style="color:var(--gold-light)">'+esc(buy.pix.price||'-')+'</b></div></div>'
      + '<p style="color:var(--ink2);font-size:13px;margin:12px 0">'+esc(buy.pix.info||'')+'</p>'
      + '<div class="field"><label>Nome da carta</label><input id="pxName" placeholder="Seu nome" maxlength="16"></div>'
      + '<div class="field"><label>Posicao</label><select id="pxPos"><option value="CM">Volante (VL)</option><option value="ST">Pivo (PV)</option><option value="GK">Goleiro (GK)</option></select></div>'
      + '<div class="field"><label>Comprovante (imagem/PDF)</label><input type="file" id="pxProof" accept="image/*,.pdf"></div>'
      + '<button class="btn primary" style="width:100%" id="pxSend">Enviar pedido</button></div>';
  }
  html += '</div>';
  if (buy.last_order){
    var st = buy.last_order.status;
    var cls = st==='approved'?'ok':st==='rejected'?'err':'';
    html += '<div class="panel" style="margin-top:20px"><b>Seu ultimo pedido</b> <span class="badge '+cls+'">'+esc(st)+'</span>'
      + '<div style="color:var(--ink2);font-size:13px;margin-top:6px">'+esc(buy.last_order.card_name||'')+' - '+esc(buy.last_order.created_at||'')+'</div></div>';
  }
  root.innerHTML = html;

  if (el('scClaim')) el('scClaim').onclick = async function(){
    try{
      await api('/selfcard/claim',{method:'POST',body:{code:el('scCode').value, name:el('scName').value, position:el('scPos').value}});
      window.FBF_toast('Carta resgatada!','ok'); P.selfcard(root);
    }catch(e){ window.FBF_toast(e.message,'err'); }
  };
  if (el('pxSend')) el('pxSend').onclick = async function(){
    var f = el('pxProof').files[0];
    if (!f){ window.FBF_toast('Anexe o comprovante','err'); return; }
    var fd = new FormData();
    fd.append('card_name', el('pxName').value);
    fd.append('position', el('pxPos').value);
    fd.append('proof', f);
    try{
      await api('/selfcard/order',{method:'POST', body:fd});
      window.FBF_toast('Pedido enviado! Aguarde a aprovacao.','ok'); P.selfcard(root);
    }catch(e){ window.FBF_toast(e.message,'err'); }
  };
};
})();
