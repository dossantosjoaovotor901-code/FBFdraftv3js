'use strict';
// Motor de jogo: nota/quimica do elenco, forca por linha e simulacao de partida (Poisson).
const db = require('./db');
const cardlogic = require('./cardlogic');
const { parseArr } = require('./util');

const MODALITIES = new Set(['x3', 'x4', 'x5', 'x7']);
// Posicoes de futsal do FBF: GK, CM (VL) e ST (PV).
const ATK_POS = new Set(['ST', 'PV', 'CF', 'LW', 'RW', 'CAM', 'ATA']);
const MID_POS = new Set(['CM', 'VL', 'CDM', 'VOL', 'MC']);

function normModality(m) {
  m = m == null ? '' : String(m).trim().toLowerCase();
  return MODALITIES.has(m) ? m : null;
}

/** Modalidade a partir do rotulo da formacao salva (ex.: "x4 . 1-1-1"). */
function modalityOf(label) {
  const s = label == null ? '' : String(label).trim().toLowerCase();
  for (const m of MODALITIES) if (s.startsWith(m)) return m;
  return null;
}

function fits(p, pos) {
  if (!p || pos == null) return false;
  const main = p.position == null ? '' : String(p.position);
  if (pos.toLowerCase() === main.toLowerCase()) return true;
  const sec = p.positions == null ? '' : String(p.positions);
  for (const s of sec.split(',')) if (s.trim().toLowerCase() === String(pos).toLowerCase()) return true;
  return false;
}

function expOf(p, modality) {
  if (!modality) return 50;
  const v = p['exp_' + modality];
  return v == null ? 50 : Number(v);
}
const expAdjust = (p, modality) => (expOf(p, modality) - 50) * 0.3;

// ------------------------------------------------------------------
//  ENTROSAMENTO por ligacoes (mesmas regras de public/js/squad.js - manter iguais)
// ------------------------------------------------------------------
const ROW_TOL = 8;

/** Pares (i,j), i<j, de posicoes ligadas. xy[i] = [x, y]. */
function links(xy) {
  const n = xy.length;
  const order = [];
  for (let i = 0; i < n; i++) order.push(i);
  order.sort((a, b) => (xy[a][1] - xy[b][1]) || (a - b));
  const rows = [];
  let cur = null;
  let startY = 0;
  for (const idx of order) {
    if (cur === null || xy[idx][1] - startY > ROW_TOL) { cur = []; rows.push(cur); startY = xy[idx][1]; }
    cur.push(idx);
  }
  for (const r of rows) r.sort((a, b) => (xy[a][0] - xy[b][0]) || (a - b));
  const seen = new Set();
  const addLink = (a, b) => { if (a !== b) seen.add(Math.min(a, b) * n + Math.max(a, b)); };
  const nearestIn = (from, row) => {
    let best = Infinity;
    for (const j of row) best = Math.min(best, Math.abs(xy[from][0] - xy[j][0]));
    return row.filter((j) => Math.abs(Math.abs(xy[from][0] - xy[j][0]) - best) < 1e-9);
  };
  for (let ri = 0; ri < rows.length; ri++) {
    const r = rows[ri];
    for (let k = 0; k + 1 < r.length; k++) addLink(r[k], r[k + 1]);
    if (ri + 1 < rows.length) {
      const next = rows[ri + 1];
      for (const a of r) for (const b of nearestIn(a, next)) addLink(a, b);
      for (const b of next) for (const a of nearestIn(b, r)) addLink(a, b);
    }
  }
  return [...seen].sort((x, y) => x - y).map((k) => [Math.floor(k / n), k % n]);
}

const teamKey = (p) => (p && p.team_id != null ? String(p.team_id) : null);
function countryKey(p) {
  const c = p && p.country != null ? String(p.country).trim().toLowerCase() : null;
  return c ? c : null;
}
function linkValue(a, b, okA, okB) {
  if (!okA || !okB) return 0;
  const ta = teamKey(a), tb = teamKey(b);
  if (ta != null && ta === tb) return 2;
  const ca = countryKey(a), cb = countryKey(b);
  if (ca != null && ca === cb) return 1;
  return 0;
}

/** Entrosamento de cada posicao (0..3) e total (0..100). Retorna [total, c0, c1, ...]. */
function chemistry(players, positions, xy) {
  const n = players.length;
  const lk = links(xy);
  const ok = players.map((p, i) => !!p && fits(p, i < positions.length ? positions[i] : null));
  const out = new Array(n + 1).fill(0);
  let sumChem = 0;
  for (let i = 0; i < n; i++) {
    const p = players[i];
    let c = 0;
    if (p && ok[i]) {
      let tot = 0, cnt = 0;
      for (const e of lk) {
        if (e[0] !== i && e[1] !== i) continue;
        cnt++;
        const a = players[e[0]], b = players[e[1]];
        if (a && b) tot += linkValue(a, b, ok[e[0]], ok[e[1]]);
      }
      c = cnt === 0 ? 0 : Math.round(3.0 * tot / (2.0 * cnt));
      const t = teamKey(p);
      if (t != null) {
        let mates = 0;
        for (let j = 0; j < n; j++) if (j !== i && players[j] && t === teamKey(players[j])) mates++;
        if (mates >= 2) c = Math.min(3, c + 1);
      }
    }
    out[i + 1] = c;
    sumChem += c;
  }
  out[0] = n === 0 ? 0 : Math.max(0, Math.min(100, Math.round(100.0 * sumChem / (3.0 * n))));
  return out;
}

/** Nota e quimica de um elenco montado (formula antiga, por contagem). */
function evaluateLegacy(players, positions, modality) {
  const mod = normModality(modality);
  const filled = [], filledPos = [];
  for (let i = 0; i < players.length; i++) {
    if (players[i]) { filled.push(players[i]); filledPos.push(i < positions.length ? positions[i] : null); }
  }
  if (!filled.length) return [0, 0];
  let sum = 0, expSum = 0;
  for (let i = 0; i < filled.length; i++) {
    const p = filled[i];
    const exp = expOf(p, mod);
    expSum += exp;
    const expBonus = (exp - 50) * 0.3;
    const posPen = fits(p, filledPos[i]) ? 0 : 6;
    sum += Math.round(Number(p.overall) || 0) - posPen + expBonus;
  }
  const rating = Math.round(sum / filled.length);

  const teamCount = new Map();
  const countryCount = new Map();
  let posMatch = 0;
  for (let i = 0; i < filled.length; i++) {
    const p = filled[i];
    if (p.team_id != null) teamCount.set(p.team_id, (teamCount.get(p.team_id) || 0) + 1);
    const c = p.country;
    if (c != null && String(c).trim() !== '') countryCount.set(c, (countryCount.get(c) || 0) + 1);
    if (fits(p, filledPos[i])) posMatch++;
  }
  let chem = Math.round(posMatch * (30.0 / Math.max(players.length, 1)));
  for (const n of teamCount.values()) if (n > 1) chem += (n - 1) * 8;
  for (const n of countryCount.values()) if (n > 1) chem += (n - 1) * 4;
  if (mod != null) chem += Math.round((expSum / filled.length - 50) * 0.2);
  return [Math.max(0, rating), Math.max(0, Math.min(100, chem))];
}

/** Nota + quimica. Com coordenadas (xy), o entrosamento usa as ligacoes da formacao. */
function evaluate(players, positions, modality, xy) {
  const base = evaluateLegacy(players, positions, modality);
  if (!xy || xy.length !== players.length || !xy.length) return base;
  return [base[0], chemistry(players, positions, xy)[0]];
}

const PLAYER_WITH_RANK = 'SELECT p.*, COALESCE(r.rank, 0) AS rarity_rank FROM players p LEFT JOIN rarities r ON r.id = p.rarity_id';

/** Carrega jogadores completos (com rank) mantendo a ordem dos ids (ids ausentes sao ignorados). */
function loadPlayers(ids, onlyActive = false) {
  if (!ids.length) return [];
  const rows = db.q(`${PLAYER_WITH_RANK} WHERE p.id IN (${ids.map(() => '?').join(',')})${onlyActive ? ' AND p.active=1' : ''}`, ...ids);
  const byId = new Map(rows.map((r) => [r.id, r]));
  return ids.map((id) => byId.get(id)).filter(Boolean);
}

const avg = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 50);

/** Forca de um elenco por linha (slots_json de user_squads / draft_runs). */
function squadLines(slotsJson, chem, modality) {
  const ids = [];
  for (const o of parseArr(slotsJson)) {
    if (o && typeof o === 'object' && o.player_id != null) ids.push(Number(o.player_id));
  }
  // Um jogador por slot (mesmo se repetido, como na versao anterior: 1 consulta por slot).
  const rows = loadPlayers([...new Set(ids)]);
  const byId = new Map(rows.map((r) => [r.id, r]));
  const slots = ids.map((id) => byId.get(id)).filter(Boolean);
  return linesOf(slots, chem, modality);
}

/** Forca por linha a partir de uma lista de jogadores ja carregados. */
function linesOf(players, chem, modality) {
  const atk = [], def = [], gkArr = [], outfield = [];
  const scorers = [];
  const used = [];
  const activeAbilities = [];
  const procs = [];
  for (const p of players) {
    if (!p) continue;
    used.push(p);
    const pid = p.id == null ? 0 : Number(p.id);
    const eb = expAdjust(p, modality);
    const ov = Math.max(0, Math.round(Number(p.overall) || 0) + eb);
    // LOGICA DAS CARTAS: habilidades somam pontos na linha do proprio jogador.
    const cm = cardlogic.roll(p);
    for (const ab of cm.active) activeAbilities.push(ab);
    if (cm.active.length) procs.push([p.name || 'Jogador', cm.active.map((x) => x.name).join(', ')]);
    const pos = String(p.position || '').toUpperCase();
    const isGk = pos === 'GK' || !!Number(p.is_gk || 0);
    if (isGk) {
      gkArr.push(ov + cm.gk);
      if (cm.atk > 0) atk.push(ov * 0.5 + cm.atk);   // goleiro-libero ajuda a saida de bola
    } else if (ATK_POS.has(pos)) {
      const finRaw = p.fin == null ? Math.round(Number(p.overall) || 0) : Math.round(Number(p.fin) || 0);
      const fin = Math.max(0, finRaw + eb);
      atk.push((ov + fin) / 2 + cm.atk);
      if (cm.def > 0) def.push(ov * 0.4 + cm.def);
      scorers.push({ name: p.name || 'Jogador', weight: Math.max(1, fin === 0 ? ov : fin) * cm.scorer, id: pid });
    } else if (MID_POS.has(pos)) {
      atk.push(ov + cm.atk); def.push(ov + cm.def);
      scorers.push({ name: p.name || 'Jogador', weight: Math.max(1, ov * 0.5) * cm.scorer, id: pid });
    } else {
      def.push(ov + cm.def);
    }
    if (!isGk) outfield.push(ov);
  }
  const fallback = outfield.length ? avg(outfield) : 50;
  // Entrosamento pesa mais na forca de jogo (0.15) sem alterar a quimica EXIBIDA.
  const bonus = (Number(chem) || 0) * 0.15;
  const l = { attack: 0, defense: 0, gk: 0, scorers, players: used, synergies: [], procs };
  l.attack = (atk.length ? avg(atk) : fallback) + bonus;
  l.defense = (def.length ? avg(def) : fallback) + bonus;
  l.gk = gkArr.length ? avg(gkArr) : fallback;
  l.synergies = cardlogic.synergies(activeAbilities);
  for (const sy of l.synergies) { l.attack += sy.atk; l.defense += sy.def; l.gk += sy.gk; }
  return l;
}

const emptyLines = () => ({ attack: 0, defense: 0, gk: 0, scorers: [], players: [], synergies: [], procs: [] });

function poisson(lambda) {
  const L = Math.exp(-lambda);
  let k = 0, p = 1;
  do { k++; p *= Math.random(); } while (p > L);
  return Math.min(k - 1, 7);
}

/** Simula gols: ataque x (defesa*0.45 + goleiro*0.55). Devolve [golsMeus, golsDoOponente]. */
function simulateGoals(me, opp) {
  const myWall = opp.defense * 0.45 + opp.gk * 0.55;
  const opWall = me.defense * 0.45 + me.gk * 0.55;
  const myLambda = 1.3 * Math.exp(0.06 * (me.attack - myWall));
  const opLambda = 1.3 * Math.exp(0.06 * (opp.attack - opWall));
  return [poisson(myLambda), poisson(opLambda)];
}

function pickScorer(scorers) {
  if (!scorers || !scorers.length) return null;
  let total = 0; for (const s of scorers) total += s.weight;
  if (total <= 0) return scorers[0];
  let r = Math.random() * total;
  for (const s of scorers) { r -= s.weight; if (r <= 0) return s; }
  return scorers[0];
}

/** Assistente: qualquer jogador de linha do time, diferente do autor, ponderado por passe. */
function pickAssist(players, scorerId) {
  const cand = [], w = [];
  let total = 0;
  for (const p of players) {
    if (!p) continue;
    const pid = p.id == null ? 0 : Number(p.id);
    if (pid !== 0 && pid === scorerId) continue;
    const pos = String(p.position || '').toUpperCase();
    if (pos === 'GK' || Number(p.is_gk || 0)) continue;
    const pas = p.pas == null ? Math.round(Number(p.overall) || 0) : Math.round(Number(p.pas) || 0);
    const weight = Math.max(1, pas) * cardlogic.assistExpectation(p);
    cand.push(p); w.push(weight); total += weight;
  }
  if (!cand.length) return null;
  let r = Math.random() * total;
  for (let i = 0; i < cand.length; i++) { r -= w[i]; if (r <= 0) return cand[i]; }
  return cand[0];
}

function makeGoal(me, side, fallback) {
  const e = { me, min: 0, type: 'goal', scorerId: 0, scorerName: null, assistId: 0, assistName: null, text: '' };
  const sc = pickScorer(side ? side.scorers : null);
  if (sc) { e.scorerName = sc.name; e.scorerId = sc.id; } else e.scorerName = fallback;
  // Assistencia: outro jogador do mesmo time (ponderada por passe), ~68% das vezes.
  if (side && side.players && side.players.length > 1 && Math.random() < 0.68) {
    const a = pickAssist(side.players, e.scorerId);
    if (a) { e.assistName = a.name || 'Jogador'; e.assistId = a.id == null ? 0 : Number(a.id); }
  }
  e.text = '⚽ ' + e.scorerName + ' marcou!' + (e.assistName != null ? ' (assist. de ' + e.assistName + ')' : '');
  return e;
}

/** Eventos narrados da partida (minuto + autor do gol + assistencia). */
function buildEvents(myName, opName, myGoals, opGoals, my, opp) {
  const evs = [];
  for (let i = 0; i < myGoals; i++) evs.push(makeGoal(true, my, myName));
  for (let i = 0; i < opGoals; i++) evs.push(makeGoal(false, opp, opName));
  for (const e of evs) e.min = 1 + Math.floor(Math.random() * 90);
  evs.sort((a, b) => a.min - b.min);
  return evs;
}

/** Evento no formato que o simulador visual espera. */
function eventJson(e, flipped = false) {
  const mine = flipped ? !e.me : e.me;
  return {
    min: e.min, side: mine ? 'me' : 'op', type: e.type || 'goal', text: e.text,
    scorer: { id: e.scorerId, name: e.scorerName == null ? '' : e.scorerName },
    assist: e.assistName != null ? { id: e.assistId, name: e.assistName } : null,
  };
}

/** Reconhece a mesma pessoa em duas cartas (group_id) para nao repetir no time. */
function personKey(p) {
  if (!p) return null;
  const g = p.group_id;
  return g != null && String(g).trim() !== '' ? 'g' + g : 'p' + p.id;
}

function hasDuplicateSlots(slotsJson) {
  const seen = new Set();
  for (const o of parseArr(slotsJson)) {
    if (!o || typeof o !== 'object' || o.player_id == null) continue;
    const pid = Number(o.player_id);
    const p = db.one('SELECT id, group_id FROM players WHERE id=?', pid);
    const k = personKey(p) || 'p' + pid;
    if (seen.has(k)) return true;
    seen.add(k);
  }
  return false;
}

module.exports = {
  MODALITIES, normModality, modalityOf, fits, expAdjust, links, chemistry, evaluate, PLAYER_WITH_RANK, loadPlayers,
  squadLines, linesOf, emptyLines, simulateGoals, buildEvents, eventJson, personKey, hasDuplicateSlots,
};
