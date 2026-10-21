/* =====================================================================
   FBF - Elenco: entrosamento + campo estilo Ultimate Team
   ---------------------------------------------------------------------
   REGRAS (mesmas do back-end: GameEngine.java - mantenha os dois iguais)

   1) LIGACOES: as posicoes da formacao sao agrupadas em linhas pela
      coordenada Y (tolerancia 8). Cada jogador liga com:
        - o vizinho do lado na mesma linha;
        - o jogador mais proximo (em X) da linha logo a frente e da linha
          logo atras (empates ligam com todos os empatados).

   2) FORCA DE UMA LIGACAO (somente se os dois estao na posicao certa):
        2 = VERDE    mesmo time
        1 = AMARELO  mesmo pais
        0 = VERMELHO nada em comum (ou alguem fora de posicao)

   3) ENTROSAMENTO DO JOGADOR (0 a 3):
        fora de posicao ............ 0
        senao: round(3 * soma das ligacoes / (2 * numero de ligacoes))
        bonus +1 (maximo 3) se ao menos 2 outros do elenco sao do mesmo time

   4) ENTROSAMENTO DO TIME (0 a 100):
        round(100 * soma do entrosamento dos jogadores / (3 * posicoes))

   5) NOTA: media de (overall - 6 se fora de posicao + (exp na modalidade - 50) * 0.3)
   ===================================================================== */
(function(root){
  'use strict';

  var ROW_TOL = 8;

  function same(a, b){ return Math.abs(a - b) < 1e-9; }

  /* slots: [{x,y}]  ->  [[i,j], ...] (i<j, sem repetidos, ordenado) */
  function links(slots){
    var n = slots.length, order = [], i;
    for (i = 0; i < n; i++) order.push(i);
    order.sort(function(a, b){ return (slots[a].y - slots[b].y) || (a - b); });
    var rows = [], cur = null, startY = 0;
    order.forEach(function(idx){
      if (!cur || slots[idx].y - startY > ROW_TOL){ cur = []; rows.push(cur); startY = slots[idx].y; }
      cur.push(idx);
    });
    rows.forEach(function(r){ r.sort(function(a, b){ return (slots[a].x - slots[b].x) || (a - b); }); });

    var seen = {}, out = [];
    function add(a, b){
      if (a === b) return;
      var lo = Math.min(a, b), hi = Math.max(a, b), k = lo + '-' + hi;
      if (seen[k]) return; seen[k] = 1; out.push([lo, hi]);
    }
    function nearest(from, row){
      var best = Infinity, res = [];
      row.forEach(function(j){ var d = Math.abs(slots[from].x - slots[j].x); if (d < best) best = d; });
      row.forEach(function(j){ if (same(Math.abs(slots[from].x - slots[j].x), best)) res.push(j); });
      return res;
    }
    rows.forEach(function(r, ri){
      for (var k = 0; k + 1 < r.length; k++) add(r[k], r[k+1]);
      var next = rows[ri + 1];
      if (next){
        r.forEach(function(a){ nearest(a, next).forEach(function(b){ add(a, b); }); });
        next.forEach(function(b){ nearest(b, r).forEach(function(a){ add(a, b); }); });
      }
    });
    out.sort(function(p, q){ return (p[0] - q[0]) || (p[1] - q[1]); });
    return out;
  }

  function inPos(p, pos){
    if (!p || !pos) return false;
    var want = String(pos).toUpperCase();
    if (String(p.position || '').toUpperCase() === want) return true;
    return String(p.positions || '').split(',').some(function(s){ return s.trim().toUpperCase() === want; });
  }
  function teamOf(p){ return p && p.team_id != null && p.team_id !== '' ? String(p.team_id) : null; }
  function countryOf(p){ var c = p && p.country ? String(p.country).trim().toLowerCase() : ''; return c || null; }

  function linkValue(a, b, okA, okB){
    if (!okA || !okB) return 0;
    var ta = teamOf(a), tb = teamOf(b);
    if (ta && ta === tb) return 2;
    var ca = countryOf(a), cb = countryOf(b);
    if (ca && ca === cb) return 1;
    return 0;
  }

  /* slots: [{pos,x,y,player|null}], modality: 'x3'|'x4'|'x5'|'x7'|null */
  function evaluate(slots, modality){
    var n = slots.length, lk = links(slots), i;
    var ok = slots.map(function(s){ return !!s.player && inPos(s.player, s.pos); });
    var edges = lk.map(function(e){
      var a = slots[e[0]].player, b = slots[e[1]].player;
      var filled = !!a && !!b;
      return { a: e[0], b: e[1], filled: filled, v: filled ? linkValue(a, b, ok[e[0]], ok[e[1]]) : null };
    });
    var chems = [], sumChem = 0;
    for (i = 0; i < n; i++){
      var p = slots[i].player, c = 0;
      if (p && ok[i]){
        var tot = 0, cnt = 0;
        edges.forEach(function(e){
          if (e.a === i || e.b === i){ cnt++; if (e.filled) tot += e.v; }
        });
        c = cnt ? Math.round(3 * tot / (2 * cnt)) : 0;
        var t = teamOf(p);
        if (t){
          var mates = 0;
          for (var j = 0; j < n; j++) if (j !== i && slots[j].player && teamOf(slots[j].player) === t) mates++;
          if (mates >= 2) c = Math.min(3, c + 1);
        }
      }
      chems.push(c); sumChem += c;
    }
    var chemistry = n ? Math.round(100 * sumChem / (3 * n)) : 0;

    var sum = 0, f = 0;
    for (i = 0; i < n; i++){
      var q = slots[i].player; if (!q) continue;
      var exp = modality && q['exp_' + modality] != null ? Number(q['exp_' + modality]) : 50;
      sum += Number(q.overall || 0) - (ok[i] ? 0 : 6) + (exp - 50) * 0.3;
      f++;
    }
    var rating = f ? Math.max(0, Math.round(sum / f)) : 0;
    return { rating: rating, chemistry: Math.max(0, Math.min(100, chemistry)), chems: chems, edges: edges, inPos: ok };
  }

  function stars(rating){
    var s = Math.max(0, Math.min(5, (rating - 55) / 8));
    s = Math.round(s * 2) / 2;
    var out = '';
    for (var i = 1; i <= 5; i++) out += s >= i ? '<i class="st on"></i>' : (s >= i - .5 ? '<i class="st half"></i>' : '<i class="st"></i>');
    return '<span class="stars" title="'+s+' de 5">' + out + '</span>';
  }

  function modalityOf(label){
    var m = /^\s*(x[3457])/i.exec(String(label || ''));
    return m ? m[1].toLowerCase() : null;
  }

  /* ---------------- Visual ---------------- */
  function barHtml(ev){
    return '<div class="squad-bar">'
      + '<div class="sb-item"><b class="sb-num">'+ev.rating+'</b><span class="sb-lb">Nota</span>'+stars(ev.rating)+'</div>'
      + '<div class="sb-item"><b class="sb-num chem">'+ev.chemistry+'</b><span class="sb-lb">Entrosamento</span>'
      +   '<span class="meter" title="Entrosamento '+ev.chemistry+' de 100"><i style="width:'+ev.chemistry+'%"></i></span></div>'
      + '</div>';
  }
  function legendHtml(){
    return '<div class="chem-legend">'
      + '<span><i class="lg g"></i>Mesmo time</span>'
      + '<span><i class="lg y"></i>Mesmo pais</span>'
      + '<span><i class="lg r"></i>Sem ligacao</span>'
      + '</div>';
  }

  /* slots: [{pos,x,y,player}], opts: {modality, active, interactive, label(fn pos->txt), render(fn player->html)} */
  function fieldHtml(slots, opts){
    opts = opts || {};
    var ev = evaluate(slots, opts.modality);
    var h = '<div class="field-view squad-field">';
    h += '<div class="pitch-lines" aria-hidden="true">'
       + '<span class="pl-box top"></span><span class="pl-box bot"></span>'
       + '<span class="pl-arc top"></span><span class="pl-arc bot"></span>'
       + '<span class="pl-spot top"></span><span class="pl-spot bot"></span></div>';
    h += '<svg class="chem-lines" viewBox="0 0 100 150" preserveAspectRatio="none" aria-hidden="true">';
    ev.edges.forEach(function(e){
      var A = slots[e.a], B = slots[e.b];
      var cls = !e.filled ? 'lk-x' : e.v === 2 ? 'lk-g' : e.v === 1 ? 'lk-y' : 'lk-r';
      var pts = 'x1="'+A.x+'" y1="'+(dy(A.y)*1.5)+'" x2="'+B.x+'" y2="'+(dy(B.y)*1.5)+'"';
      h += '<line class="lk-bg" '+pts+'/><line class="lk '+cls+'" '+pts+'/>';
    });
    h += '</svg>';
    slots.forEach(function(s, i){
      var c = ev.chems[i], has = !!s.player;
      var lbl = opts.label ? opts.label(s.pos) : s.pos;
      h += '<div class="slot'+(opts.active === i ? ' active' : '')+(has ? '' : ' vazio')+'" '
        + (opts.interactive ? 'data-slot="'+i+'" ' : '')
        + 'style="left:'+s.x+'%;top:'+dy(s.y)+'%" title="'+(has ? esc(s.player.name) : esc(lbl))+'">';
      h += has ? opts.render(s.player)
               : '<div class="empty-slot"><span class="es-ball"></span><b>'+esc(lbl)+'</b></div>';
      h += '<div class="slot-tag c'+(has ? c : 'x')+'"><b>'+esc(lbl)+'</b>'
         + '<span class="cdots"><i></i><i></i><i></i></span></div>';
      h += '</div>';
    });
    h += '</div>';
    return { html: h, ev: ev };
  }
  function dy(y){ return +(6 + y * 0.86).toFixed(2); } /* afasta do fundo p/ caber a etiqueta */
  function esc(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){
    return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }

  var api = { links: links, evaluate: evaluate, stars: stars, modalityOf: modalityOf,
              barHtml: barHtml, legendHtml: legendHtml, fieldHtml: fieldHtml, inPos: inPos };
  root.FBFSquad = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
