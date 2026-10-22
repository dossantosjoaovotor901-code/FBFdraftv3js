'use strict';
// LOGICA DAS CARTAS - habilidades por faixa de nota, com RARIDADE e CHANCE.
//   nota < 80   : nenhuma habilidade
//   nota 80..87 : chance de 1 habilidade COMUM   (35% 80-83 / 50% 84-87)
//   nota 88..89 : chance de 1 habilidade RARA    (70%)
//   nota 90+    : 1 COMUM garantida + 75% de uma EPICA
// As habilidades sao sorteadas UMA vez, de forma estavel (semente = id da carta).
// Na partida cada habilidade so funciona com uma chance (COMUM 60%, RARA 45%, EPICA 30%).
const { seededFor } = require('./javarandom');

const MIN_OVERALL = 80;
const RARE_FROM = 88;
const EPIC_FROM = 90;
const GET_CHANCE_80 = 35;
const GET_CHANCE_84 = 50;
const GET_CHANCE_RARE = 70;
const GET_CHANCE_EPIC = 75;
const PROC = [0, 60, 45, 30];
const TIER_NAME = ['', 'Comum', 'Rara', 'Epica'];

function a(key, code, name, kind, tier, family, stat, atk, def, gk, scorer, assist, desc) {
  return Object.freeze({ key, code, name, kind, tier, family, stat, atk, def, gk, scorer, assist, desc,
    chance: PROC[tier], value: atk + def + gk });
}

const CATALOG = [
  // ATAQUE
  a('chute_colocado', 'CHC', 'Chute Colocado', 'atk', 1, 'finisher', 'fin', 1.5, 0, 0, 1.15, 1, 'Chute colocado: um pouco mais de gols.'),
  a('artilheiro', 'ART', 'Artilheiro', 'atk', 2, 'finisher', 'fin', 3, 0, 0, 1.4, 1, 'Finalizacao letal: marca mais e reforca o ataque.'),
  a('matador', 'MAT', 'Matador', 'atk', 3, 'finisher', 'fin', 5, 0, 0, 1.8, 1, 'Decide jogos: muito mais gols e ataque dominante.'),
  a('drible_curto', 'DRC', 'Drible Curto', 'atk', 1, 'dribble', 'skl', 1, 0, 0, 1, 1, 'Drible curto desequilibra de leve.'),
  a('driblador', 'DRI', 'Driblador', 'atk', 2, 'dribble', 'skl', 2.5, 0, 0, 1.1, 1, 'Dribles e fintas abrem a defesa adversaria.'),
  a('magico', 'MAG', 'Magico', 'atk', 3, 'dribble', 'skl', 4.5, 0, 0, 1.25, 1, 'Jogadas impossiveis: ataque muito perigoso.'),
  // CRIACAO / MEIO
  a('passe_seguro', 'PSS', 'Passe Seguro', 'mid', 1, 'playmaker', 'pas', 1, 0, 0, 1, 1.15, 'Passes seguros: mais assistencias.'),
  a('maestro', 'MAE', 'Maestro', 'mid', 2, 'playmaker', 'pas', 2, 0, 0, 1, 1.5, 'Passe refinado: cria e assiste mais.'),
  a('camisa10', 'C10', 'Camisa 10', 'mid', 3, 'playmaker', 'pas', 4, 0, 0, 1, 2, 'Cerebro do time: assistencias e ataque em alto nivel.'),
  a('primeiro_toque', 'PTQ', 'Primeiro Toque', 'mid', 1, 'control', 'ctl', .5, .5, 0, 1, 1, 'Bom controle: ajuda um pouco nas duas pontas.'),
  a('cerebro', 'CER', 'Cerebro', 'mid', 2, 'control', 'ctl', 1.5, 1.5, 0, 1, 1, 'Controle total: equilibra ataque e defesa.'),
  a('maestro_total', 'MTT', 'Maestro Total', 'mid', 3, 'control', 'ctl', 3, 3, 0, 1, 1.2, 'Domina o meio: ataque e defesa no topo.'),
  // DEFESA
  a('desarme_limpo', 'DSL', 'Desarme Limpo', 'def', 1, 'wall', 'def', 0, 1.5, 0, 1, 1, 'Desarmes limpos: defesa um pouco mais firme.'),
  a('muralha', 'MUR', 'Muralha', 'def', 2, 'wall', 'def', 0, 3, 0, 1, 1, 'Fecha a defesa do time.'),
  a('xerife', 'XER', 'Xerife', 'def', 3, 'wall', 'def', 0, 5, 0, 1, 1, 'Ninguem passa: defesa blindada.'),
  a('corpo_firme', 'CFR', 'Corpo Firme', 'def', 1, 'bruiser', 'jdc', .5, 1, 0, 1, 1, 'Protege a bola e ganha disputas.'),
  a('tanque', 'TAN', 'Tanque', 'def', 2, 'bruiser', 'jdc', 1, 2, 0, 1, 1, 'Jogo de corpo forte: defesa e presenca no ataque.'),
  a('trator', 'TRA', 'Trator', 'def', 3, 'bruiser', 'jdc', 2, 3.5, 0, 1, 1, 'Passa por cima: defesa e ataque pelo fisico.'),
  // GOLEIRO
  a('defesa_segura', 'DSG', 'Defesa Segura', 'gk', 1, 'keeper', 'gk_dr', 0, 0, 2, 1, 1, 'Defesas seguras: goleiro um pouco melhor.'),
  a('paredao', 'PAR', 'Paredao', 'gk', 2, 'keeper', 'gk_dr', 0, 0, 4, 1, 1, 'Reflexo e defesas dificeis: reforca muito o gol.'),
  a('muro', 'MRO', 'Muro', 'gk', 3, 'keeper', 'gk_dr', 0, 0, 7, 1, 1, 'Quase intransponivel: o gol vira um muro.'),
  a('reposicao', 'REP', 'Reposicao', 'gk', 1, 'libero', 'gk_kic', 1, 0, .5, 1, 1, 'Reposicao precisa: ajuda a saida de bola.'),
  a('rei_area', 'REI', 'Rei da Area', 'gk', 2, 'libero', 'gk_pos', 0, 0, 3, 1, 1, 'Domina a area: gol bem mais seguro.'),
  a('libero_mestre', 'LIB', 'Goleiro-Libero', 'gk', 3, 'libero', 'gk_kic', 2, 0, 4, 1, 1, 'Defende e comeca o ataque: gol e saida de bola.'),
];

// ---------------- leitura segura dos atributos (mesmos fallbacks do front) ----------------
function raw(p, k, fallback) {
  let v = p[k];
  if ((v == null || v === 0) && fallback != null && p[fallback] != null) v = p[fallback];
  return v == null ? 0 : Math.trunc(Number(v)) || 0;
}
function statValue(p, key) {
  switch (key) {
    case 'fin': return raw(p, 'fin', 'sho');
    case 'ctl': return raw(p, 'ctl', 'dri');
    case 'skl': return raw(p, 'skl', 'dri');
    case 'jdc': return raw(p, 'jdc', 'phy');
    case 'gk_dr': return Math.max(raw(p, 'gk_div', null), raw(p, 'gk_ref', null));
    default: return raw(p, key, null);
  }
}
function isGk(p) {
  return String(p.position || '').toUpperCase() === 'GK' || !!Number(p.is_gk || 0);
}

function pick(p, gk, tier, avoidStat, r) {
  const cand = [];
  const w = [];
  let total = 0;
  for (const ab of CATALOG) {
    if (ab.tier !== tier || (ab.kind === 'gk') !== gk) continue;
    if (avoidStat != null && ab.stat === avoidStat) continue;
    const v = Math.max(1, statValue(p, ab.stat) - 40);
    const wt = v * v;
    cand.push(ab); w.push(wt); total += wt;
  }
  if (!cand.length) return null;
  let x = r.nextDouble() * total;
  for (let i = 0; i < cand.length; i++) { x -= w[i]; if (x <= 0) return cand[i]; }
  return cand[cand.length - 1];
}

const abCache = new Map();
function cacheKey(p) {
  return [p.id, p.name, p.overall, p.position, p.is_gk, p.fin, p.sho, p.ctl, p.dri, p.skl, p.jdc, p.phy, p.pas, p.def,
    p.gk_div, p.gk_ref, p.gk_kic, p.gk_pos].join('|');
}

/** Habilidades da carta (estaveis). Vazio para nota < 80. */
function abilitiesOf(p) {
  if (!p) return [];
  const ov = Math.trunc(Number(p.overall)) || 0;
  if (ov < MIN_OVERALL) return [];
  const key = cacheKey(p);
  const hit = abCache.get(key);
  if (hit) return hit;
  const out = [];
  const gk = isGk(p);
  const r = seededFor(p.id == null ? null : p.id, p.name, 1);
  if (ov >= EPIC_FROM) {
    const epic = r.nextInt(100) < GET_CHANCE_EPIC ? pick(p, gk, 3, null, r) : null;
    const common = pick(p, gk, 1, epic == null ? null : epic.stat, r);
    if (common) out.push(common);
    if (epic) out.push(epic);
  } else if (ov >= RARE_FROM) {
    if (r.nextInt(100) < GET_CHANCE_RARE) { const x = pick(p, gk, 2, null, r); if (x) out.push(x); }
  } else {
    const chance = ov >= 84 ? GET_CHANCE_84 : GET_CHANCE_80;
    if (r.nextInt(100) < chance) { const x = pick(p, gk, 1, null, r); if (x) out.push(x); }
  }
  if (abCache.size > 30000) abCache.clear();
  abCache.set(key, out);
  return out;
}

/** Sorteia (uma vez por partida) quais habilidades da carta funcionam. */
function roll(p) {
  const m = { atk: 0, def: 0, gk: 0, scorer: 1, assist: 1, active: [] };
  for (const ab of abilitiesOf(p)) {
    if (Math.floor(Math.random() * 100) >= ab.chance) continue;
    m.atk += ab.atk; m.def += ab.def; m.gk += ab.gk;
    m.scorer *= ab.scorer; m.assist *= ab.assist;
    m.active.push(ab);
  }
  return m;
}

/** Peso esperado de assistencia (sem sorteio) - so para escolher o assistente. */
function assistExpectation(p) {
  let m = 1;
  for (const ab of abilitiesOf(p)) m *= 1 + (ab.assist - 1) * ab.chance / 100.0;
  return m;
}

function synergies(active) {
  let fin = false, play = false, wall = false, keeper = false, tech = 0, epic = 0;
  for (const ab of active) {
    switch (ab.family) {
      case 'finisher': fin = true; break;
      case 'playmaker': play = true; break;
      case 'wall': wall = true; break;
      case 'keeper': keeper = true; break;
      case 'dribble': case 'control': tech++; break;
      default: break;
    }
    if (ab.tier === 3) epic++;
  }
  const out = [];
  if (fin && play) out.push({ key: 'dupla_letal', name: 'Dupla Letal', desc: 'Finalizador + armador ativos juntos: mais ataque.', atk: 1.5, def: 0, gk: 0 });
  if (wall && keeper) out.push({ key: 'bloqueio', name: 'Bloqueio Total', desc: 'Zagueiro + goleiro ativos juntos: defesa e gol mais fortes.', atk: 0, def: 1.5, gk: 1 });
  if (tech >= 3) out.push({ key: 'trio_tecnico', name: 'Trio Tecnico', desc: 'Tres habilidades de tecnica ativas: mais ataque.', atk: 1, def: 0, gk: 0 });
  if (epic >= 2) out.push({ key: 'epico', name: 'Elenco Epico', desc: 'Duas habilidades epicas ativas: bonus em todas as linhas.', atk: 1, def: 1, gk: 1 });
  return out;
}

// ---------------- JSON ----------------
const abilityJson = (ab) => ({ key: ab.key, code: ab.code, name: ab.name, kind: ab.kind, tier: ab.tier,
  tier_name: TIER_NAME[ab.tier], chance: ab.chance, desc: ab.desc });
const traitsJson = (list) => list.map(abilityJson);
const synergiesJson = (list) => (list || []).map((s) => ({ key: s.key, name: s.name, desc: s.desc }));
const procsJson = (procs) => (procs || []).map((x) => ({ player: x[0], abilities: x[1] }));

/** Poder = nota + valor ESPERADO das habilidades (efeito x chance). So informativo. */
function power(p, list) {
  let bonus = 0;
  for (const ab of list) bonus += ab.value * ab.chance / 100.0;
  return (p ? Math.trunc(Number(p.overall)) || 0 : 0) + Math.round(bonus / 2.0);
}

function addTo(obj, p) {
  const list = abilitiesOf(p);
  obj.traits = traitsJson(list);
  obj.power = power(p, list);
}

module.exports = { CATALOG, abilitiesOf, roll, assistExpectation, synergies, synergiesJson, procsJson, traitsJson, power, addTo, TIER_NAME };
