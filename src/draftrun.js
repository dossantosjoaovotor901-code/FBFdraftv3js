'use strict';
// Draft Aleatorio (modo gauntlet): escolhe a formacao -> o servidor sorteia 5 cartas por posicao
// (escolha definitiva) -> sequencia de dificuldades -> UMA recompensa no fim (a da maior vencida).
const db = require('./db');
const engine = require('./engine');
const cardlogic = require('./cardlogic');
const selfCard = require('./selfcard');
const playerRepo = require('./playerrepo');
const hydrate = require('./hydrate');
const { HttpError, parseArr, shuffle } = require('./util');

const OPTIONS_PER_SLOT = 5;
const RunError = HttpError;

// ---------------- Configuracao / estado ----------------
const levels = () => db.q('SELECT * FROM draft_reward_config ORDER BY level ASC');
const current = (userId) => db.one("SELECT * FROM draft_runs WHERE user_id=? AND status='active' ORDER BY id DESC LIMIT 1", userId);

function config() {
  return {
    levels: levels().map((l) => ({ level: l.level, name: l.name || '', strength: l.strength, coins: l.coins, pack_label: l.pack_label || '' })),
  };
}

function runJson(run) {
  return {
    id: run.id, status: run.status || 'active', level: run.level, wins: run.wins, coins_won: run.coins_won,
    packs_won: run.packs_won, rating: run.rating, chemistry: run.chemistry, formation: run.formation || '',
    ended_reason: run.ended_reason || '', reward_coins: run.reward_coins, reward_pack_label: run.reward_pack_label || '',
    reward_claimed: !!run.reward_claimed,
  };
}

const numOr = (o, k, def) => (o && typeof o[k] === 'number' ? o[k] : def);

function currentView(userId) {
  const run = current(userId);
  if (!run) return { run: null };
  const rj = runJson(run);
  rj.squad = parseArr(run.slots_json).map((o) => {
    const p = o && o.player_id != null ? hydrate.player(Number(o.player_id)) : null;
    return { pos: (o && o.pos) || '', x: numOr(o, 'x', 50), y: numOr(o, 'y', 50), player: p ? hydrate.toJson(p) : null };
  });
  rj.modality = engine.modalityOf(run.formation) || '';
  return { run: rj };
}

// ---------------- Sessao de escolhas sorteada no servidor ----------------
const sessionView = (userId) => db.one("SELECT * FROM draft_sessions WHERE user_id=? AND status='open' ORDER BY id DESC LIMIT 1", userId);

/** Sorteia 5 cartas DISTINTAS para uma posicao: prioriza quem joga nela, nunca repete a mesma pessoa no mesmo sorteio. */
function drawOptions(pool, pos, usedPeople) {
  const shuffled = shuffle(pool.slice());
  const out = [];
  const inThis = new Set();
  for (let pass = 0; pass < 2 && out.length < OPTIONS_PER_SLOT; pass++) {
    for (const p of shuffled) {
      if (out.length >= OPTIONS_PER_SLOT) break;
      if (pass === 0 && !engine.fits(p, pos)) continue;
      const k = engine.personKey(p);
      if (usedPeople.has(k) || inThis.has(k)) continue;
      inThis.add(k);
      out.push(p);
    }
  }
  for (const k of inThis) usedPeople.add(k);
  return out;
}

/** Abre a sessao com a formacao escolhida. Se ja existir uma aberta (escolhas definitivas), devolve ela. */
function openSession(userId, formationId) {
  const existing = sessionView(userId);
  if (existing) return existing;
  if (current(userId)) throw new RunError(400, 'Voce ja tem uma sequencia em andamento.');
  if (formationId == null) throw new RunError(400, 'Escolha a formacao.');
  const f = db.one('SELECT * FROM formations WHERE id=? AND active=1 AND mode IS NOT NULL', formationId);
  if (!f) throw new RunError(400, 'Formacao indisponivel.');
  const def = parseArr(f.slots_json);
  const pool = playerRepo.drawPool();
  if (!pool.length) throw new RunError(400, 'Sem jogadores disponiveis.');
  const usedPeople = new Set();
  const slots = def.map((d) => {
    const pos = (d && d.pos) || '';
    const opts = drawOptions(pool, pos, usedPeople);
    return { pos, x: numOr(d, 'x', 50), y: numOr(d, 'y', 50), options: opts.map((p) => p.id), pick: null };
  });
  const label = (f.mode || '') + ' . ' + (f.name || '');
  const id = db.insert("INSERT INTO draft_sessions (user_id, formation_id, label, modality, slots_json, status) VALUES (?,?,?,?,?,'open')",
    userId, f.id, label, f.mode, JSON.stringify(slots));
  return db.one('SELECT * FROM draft_sessions WHERE id=?', id);
}

function pick(userId, slot, playerId) {
  const s = sessionView(userId);
  if (!s) throw new RunError(400, 'Nenhuma sessao aberta.');
  const arr = parseArr(s.slots_json);
  if (!Number.isInteger(slot) || slot < 0 || slot >= arr.length) throw new RunError(400, 'Posicao invalida.');
  const o = arr[slot];
  if (o.pick != null) throw new RunError(400, 'Essa posicao ja foi escolhida. A escolha e definitiva.');
  const ok = (o.options || []).some((v) => Number(v) === playerId);
  if (!ok) throw new RunError(400, 'Essa carta nao foi sorteada para esta posicao.');
  arr[slot] = { ...o, pick: playerId };
  db.exec('UPDATE draft_sessions SET slots_json=? WHERE id=?', JSON.stringify(arr), s.id);
  return db.one('SELECT * FROM draft_sessions WHERE id=?', s.id);
}

const cancelSession = (userId) => db.exec("UPDATE draft_sessions SET status='cancelled' WHERE user_id=? AND status='open'", userId);

// ---------------- Iniciar / jogar / abandonar ----------------
function start(userId) {
  const s = sessionView(userId);
  if (!s) throw new RunError(400, 'Escolha as cartas antes de comecar.');
  if (current(userId)) throw new RunError(400, 'Voce ja tem uma sequencia em andamento.');
  const arr = parseArr(s.slots_json);
  const chosen = [], pos = [], xy = [], slots = [];
  for (const o of arr) {
    if (o.pick == null) throw new RunError(400, 'Preencha todas as posicoes.');
    const pid = Number(o.pick);
    const p = db.one('SELECT * FROM players WHERE id=?', pid);
    if (!p) throw new RunError(400, 'Jogador invalido.');
    chosen.push(p);
    pos.push(o.pos || '');
    const x = numOr(o, 'x', 50), y = numOr(o, 'y', 50);
    xy.push([x, y]);
    slots.push({ pos: o.pos || '', x, y, player_id: pid });
  }
  const ev = engine.evaluate(chosen, pos, s.modality, xy);
  return db.tx(() => {
    const id = db.insert("INSERT INTO draft_runs (user_id, status, level, formation, slots_json, rating, chemistry) VALUES (?,'active',0,?,?,?,?)",
      userId, s.label || '', JSON.stringify(slots), ev[0], ev[1]);
    db.exec("UPDATE draft_sessions SET status='used' WHERE id=?", s.id);
    return db.one('SELECT * FROM draft_runs WHERE id=?', id);
  });
}

function lineupJson(l) {
  const arr = [];
  if (l && l.players) {
    for (const p of l.players) {
      if (!p) continue;
      const full = p.id != null ? hydrate.player(p.id) : null;
      arr.push(full ? hydrate.toJson(full) : p);
    }
  }
  return arr;
}

/** Fecha a sequencia e paga UMA recompensa: a da maior dificuldade vencida. O UPDATE com status='active' impede pagar duas vezes. */
function settle(userId, runId, wins, reason, lv) {
  const economy = require('./economy');
  const cfg = (wins > 0 && lv.length) ? lv[Math.min(wins, lv.length) - 1] : null;
  const r = { coins: 0, packLabel: '', packId: 0, level: -1, levelName: '', balance: -1 };
  if (cfg) {
    const pack = pickRewardPack(cfg);
    r.coins = Number(cfg.coins) || 0;
    r.level = cfg.level;
    r.levelName = cfg.name || '';
    if (pack) { r.packId = pack.id; r.packLabel = pack.name || cfg.pack_label || 'Pacote'; }
  }
  let closedNow = false;
  const balance = db.tx(() => {
    const closed = db.exec("UPDATE draft_runs SET status='finished', ended_reason=?, wins=?, updated_at=datetime('now','localtime') WHERE id=? AND status='active'",
      reason, wins, runId);
    if (closed === 0) return -1;            // ja encerrada: nao paga de novo
    closedNow = true;
    if (!cfg) return -1;                    // sem vitorias: sem recompensa
    const bal = r.coins > 0 ? economy.applyCoins(userId, r.coins, 'draft', 'Draft Aleatorio - ' + r.levelName) : -1;
    if (r.packId > 0) {
      db.exec('INSERT INTO user_packs (user_id, pack_id, source, label) VALUES (?,?,?,?)', userId, r.packId, 'draft', r.packLabel);
    }
    db.exec('UPDATE draft_runs SET coins_won=?, packs_won=?, reward_coins=?, reward_pack_id=?, reward_pack_label=?, reward_claimed=1 WHERE id=?',
      r.coins, r.packId > 0 ? 1 : 0, r.coins, r.packId > 0 ? r.packId : null, r.packLabel, runId);
    return bal;
  });
  if (!closedNow || !cfg) return { coins: 0, packLabel: '', packId: 0, level: -1, levelName: '', balance: -1 };
  r.balance = balance;
  return r;
}

function pickRewardPack(cfg) {
  if (cfg.pack_id != null) {
    const p = db.one('SELECT * FROM packs WHERE id=?', cfg.pack_id);
    if (p) return p;
  }
  const label = cfg.pack_label;
  if (label && String(label).trim()) return db.one('SELECT * FROM packs WHERE name LIKE ? LIMIT 1', '%' + label + '%');
  return null;
}

const given = (r) => r.coins > 0 || r.packId > 0;
const rewardJson = (r) => ({ coins: r.coins, pack_label: r.packLabel || '', level: r.level, level_name: r.levelName || '', given: given(r) });
const packsPending = (userId) => db.count('SELECT COUNT(*) FROM user_packs WHERE user_id=? AND opened_at IS NULL', userId);

/** Joga a partida da dificuldade atual da sequencia. */
function play(userId) {
  const run = current(userId);
  if (!run) throw new RunError(400, 'Nenhuma sequencia ativa.');
  const lv = levels();
  const total = lv.length;
  const level = run.level;
  if (level < 0 || level >= total) throw new RunError(400, 'Nivel invalido.');
  const cfg = lv[level];

  const my = engine.squadLines(run.slots_json, run.chemistry, engine.modalityOf(run.formation));
  const opp = engine.emptyLines();
  opp.attack = cfg.strength + (Math.random() * 6 - 3);
  opp.defense = cfg.strength + (Math.random() * 6 - 3);
  opp.gk = cfg.strength + (Math.random() * 6 - 3);

  const g = engine.simulateGoals(my, opp);
  const result = g[0] > g[1] ? 'win' : (g[0] < g[1] ? 'loss' : 'draw');
  const events = engine.buildEvents('Seu time', cfg.name || 'Adversario', g[0], g[1], my, opp);

  let wins = run.wins;
  let endedReason = null;
  let nextLevel = null;
  if (result === 'win') {
    wins++;
    if (level + 1 >= total) endedReason = 'champion'; else nextLevel = level + 1;
  } else {
    endedReason = result;   // "draw" ou "loss"
  }

  // Guarda o progresso (sem pagar nada ainda: so ha recompensa no fim).
  db.exec("UPDATE draft_runs SET level=?, wins=?, updated_at=datetime('now','localtime') WHERE id=? AND status='active'",
    nextLevel != null ? nextLevel : level, wins, run.id);

  let reward = null;
  if (endedReason != null) reward = settle(userId, run.id, wins, endedReason, lv);
  try { selfCard.addXp(userId, result, 'draft'); } catch { /* ignore */ }

  const b = {
    ok: true, result,
    me: { name: 'Seu time', goals: g[0] },
    opp: { name: cfg.name || 'Adversario', goals: g[1] },
    events: events.map((e) => engine.eventJson(e)),
    lineup: { me: lineupJson(my), opp: lineupJson(opp) },
    synergies: { me: cardlogic.synergiesJson(my.synergies), opp: cardlogic.synergiesJson(opp.synergies) },
    procs: { me: cardlogic.procsJson(my.procs), opp: cardlogic.procsJson(opp.procs) },
    level, level_name: cfg.name || '', wins, ended: endedReason != null,
    next_level: nextLevel,
  };
  if (endedReason != null) b.ended_reason = endedReason;
  b.reward = reward ? rewardJson(reward) : null;
  if (reward && reward.balance >= 0) b.coins = reward.balance;
  b.packs_pending = packsPending(userId);
  return b;
}

/** Encerra a sequencia pagando a recompensa da maior dificuldade vencida ate agora. */
function abandon(userId) {
  const run = current(userId);
  const b = { ok: true };
  if (!run) { b.reward = null; return b; }
  const r = settle(userId, run.id, run.wins, 'abandoned', levels());
  b.reward = rewardJson(r);
  if (r.balance >= 0) b.coins = r.balance;
  b.packs_pending = packsPending(userId);
  return b;
}

module.exports = { RunError, levels, current, config, currentView, runJson, sessionView, openSession, pick, cancelSession, start, play, abandon };
