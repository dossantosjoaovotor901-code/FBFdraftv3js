'use strict';
// Aba ONLINE: fila (aleatorio / meu time) e Draft Rapido.
// Os handlers sao sincronos (node:sqlite) e o Node roda em uma thread so; por isso nao precisa de lock:
// nenhum outro request entra entre a leitura da fila e o pareamento.
const { router } = require('../http');
const db = require('../db');
const hydrate = require('../hydrate');
const engine = require('../engine');
const economy = require('../economy');
const selfcard = require('../selfcard');
const settings = require('../settings');
const cardlogic = require('../cardlogic');
const playerrepo = require('../playerrepo');
const { HttpError, now, minusSeconds, parseSqlTime, isBlank, shuffle, randInt } = require('../util');
const { rewardFor, lineupJson } = require('./draft');

const TICKET_ALIVE_S = 12;
const SEARCH_TIMEOUT_S = 120;
const SHIELD = '\u{1F6E1}️';

const onlineBase = () => Math.max(0, settings.getInt('online_reward'));
const quickBase = () => Math.max(0, settings.getInt('quick_reward'));
const quickCooldown = () => Math.max(0, settings.getInt('quick_cooldown'));
const rewardJson = (base) => ({ win: rewardFor(base, 'win'), draw: rewardFor(base, 'draw'), loss: rewardFor(base, 'loss') });

function heartbeat(uid) { try { db.exec('UPDATE users SET last_seen=? WHERE id=?', now(), uid); } catch { /* ignore */ } }

const squadName = (sq, usr) => {
  if (sq && !isBlank(sq.squad_name)) return sq.squad_name;
  if (usr && !isBlank(usr.global_name)) return usr.global_name;
  return usr ? usr.username || 'Treinador' : 'Treinador';
};
const squadCrest = (sq) => (sq && !isBlank(sq.squad_crest) ? sq.squad_crest : SHIELD);

function quickWait(uid) {
  const cd = quickCooldown();
  if (cd <= 0) return 0;
  const last = db.one("SELECT created_at FROM matches WHERE user_id=? AND opp_type='quick' ORDER BY id DESC LIMIT 1", uid);
  if (!last) return 0;
  const t = parseSqlTime(last.created_at);
  if (t <= 0) return 0;
  return Math.max(0, Math.ceil((t + cd * 1000 - Date.now()) / 1000));
}
const secondsSince = (s) => { const t = parseSqlTime(s); return t <= 0 ? 0 : Math.max(0, Math.floor((Date.now() - t) / 1000)); };

// ---------------- Times ----------------
function squadProblem(sq) {
  if (!sq || sq.rating <= 0) return 'Monte e salve seu time em "Montar Draft" antes de jogar com ele.';
  if (engine.hasDuplicateSlots(sq.slots_json)) return 'Seu time tem a mesma carta em mais de uma posicao. Ajuste em Meu time.';
  return null;
}

function teamSide(uid, usr) {
  const sq = db.one('SELECT * FROM user_squads WHERE user_id=?', uid);
  if (squadProblem(sq)) throw new Error('time invalido');
  return {
    id: uid, name: squadName(sq, usr), crest: squadCrest(sq), rating: sq.rating, formation: sq.formation || '',
    lines: engine.squadLines(sq.slots_json, sq.chemistry, engine.modalityOf(sq.formation)),
  };
}

function randomDraftLines(pool) {
  const gks = [], out = [];
  for (const p of pool) (String(p.position || '').toUpperCase() === 'GK' || p.is_gk ? gks : out).push(p);
  shuffle(gks); shuffle(out);
  const chosen = [];
  const used = new Set();
  if (gks.length) { chosen.push(gks[0]); used.add(engine.personKey(gks[0])); }
  for (const p of out) {
    if (chosen.length >= 5) break;
    const k = engine.personKey(p);
    if (!used.has(k)) { used.add(k); chosen.push(p); }
  }
  // drawPool traz so colunas leves: carrega as linhas completas dos escolhidos.
  const full = engine.loadPlayers(chosen.map((p) => p.id));
  return engine.linesOf(full, 45 + randInt(26), null);
}

function randomSide(uid, usr, pool) {
  const sq = db.one('SELECT squad_name, squad_crest FROM user_squads WHERE user_id=?', uid);
  const lines = randomDraftLines(pool);
  let sum = 0, n = 0;
  for (const p of lines.players) if (p) { sum += Math.round(p.overall); n++; }
  return { id: uid, name: squadName(sq, usr), crest: squadCrest(sq), rating: n ? Math.round(sum / n) : 0, formation: 'Sorteado', lines };
}

function play(a, b) {
  const [ag, bg] = engine.simulateGoals(a.lines, b.lines);
  const result = ag > bg ? 'win' : ag < bg ? 'loss' : 'draw';
  const oppResult = result === 'win' ? 'loss' : result === 'loss' ? 'win' : 'draw';
  return { aGoals: ag, bGoals: bg, result, oppResult, events: engine.buildEvents(a.name, b.name, ag, bg, a.lines, b.lines) };
}

function payload(me, op, res, flipped, reward, coins, xp) {
  const myGoals = flipped ? res.bGoals : res.aGoals, opGoals = flipped ? res.aGoals : res.bGoals;
  return {
    ok: true,
    me: { name: me.name, crest: me.crest, goals: myGoals, rating: me.rating, formation: me.formation },
    opp: { name: op.name, crest: op.crest, goals: opGoals, rating: op.rating, formation: op.formation },
    events: res.events.map((e) => engine.eventJson(e, flipped)),
    lineup: { me: lineupJson(me.lines), opp: lineupJson(op.lines) },
    synergies: { me: cardlogic.synergiesJson(me.lines.synergies), opp: cardlogic.synergiesJson(op.lines.synergies) },
    procs: { me: cardlogic.procsJson(me.lines.procs), opp: cardlogic.procsJson(op.lines.procs) },
    result: flipped ? res.oppResult : res.result, reward, coins, selfcard: xp || null,
  };
}

function pay(uid, reward, desc) {
  try { return [reward, economy.applyCoins(uid, reward, 'match', desc)]; } catch { return [0, economy.coinsOf(uid)]; }
}

const INSERT_MATCH = 'INSERT INTO matches (user_id, opp_type, opp_label, my_goals, opp_goals, result, reward, created_at) VALUES (?,?,?,?,?,?,?,?)';

/** Fecha a partida pareada: simula, paga os dois e guarda a visao do dono do ticket. */
function startMatch(ticket, me, op, mode) {
  return db.tx(() => {
    const res = play(me, op);
    const base = onlineBase();
    const [rewardMe, coinsMe] = pay(me.id, rewardFor(base, res.result), `Online vs ${op.name} (${res.result})`);
    const [rewardOp, coinsOp] = pay(op.id, rewardFor(base, res.oppResult), `Online vs ${me.name} (${res.oppResult})`);
    const n = now();
    db.exec(INSERT_MATCH, me.id, 'online', op.name, res.aGoals, res.bGoals, res.result, rewardMe, n);
    db.exec(INSERT_MATCH, op.id, 'online', me.name, res.bGoals, res.aGoals, res.oppResult, rewardOp, n);
    const xpMe = selfcard.addXp(me.id, res.result, 'bot');
    let xpOp = null;
    try { xpOp = selfcard.addXp(op.id, res.oppResult, 'bot'); } catch { /* ignore */ }
    const forOwner = { ...payload(op, me, res, true, rewardOp, coinsOp, xpOp), mode };
    db.exec("UPDATE online_rooms SET status='matched', p2_id=?, p1_json=?, updated_at=? WHERE id=?", me.id, JSON.stringify(forOwner), n, ticket.id);
    return { ...payload(me, op, res, false, rewardMe, coinsMe, xpMe), mode };
  });
}

function deliver(t, uid) {
  let m = {};
  try { m = JSON.parse(t.p1_json || '{}'); } catch { /* ignore */ }
  db.exec("UPDATE online_rooms SET status='done', updated_at=? WHERE id=?", now(), t.id);
  return { status: 'matched', match: { ...m, coins: economy.coinsOf(uid) } };
}

const ticketOf = (uid) => db.one("SELECT * FROM online_rooms WHERE type='queue' AND p1_id=? AND status IN ('waiting','matched') ORDER BY id DESC LIMIT 1", uid);

// ---------------- Rotas ----------------
router.get('/api/online/overview', (ctx) => {
  const u = ctx.requireUser();
  heartbeat(u.id);
  const sq = db.one('SELECT * FROM user_squads WHERE user_id=?', u.id);
  return {
    squad: sq && sq.rating > 0 ? { name: squadName(sq, u), crest: squadCrest(sq), rating: sq.rating, chemistry: sq.chemistry, formation: sq.formation || '' } : null,
    online_reward: rewardJson(onlineBase()),
    quick: { cooldown: quickCooldown(), wait: quickWait(u.id), reward: rewardJson(quickBase()) },
  };
});

router.get('/api/online/players', (ctx) => {
  const u = ctx.requireUser();
  heartbeat(u.id);
  const since = minusSeconds(Math.max(15, settings.getInt('pvp_online_window')));
  const squads = new Map(db.q('SELECT user_id, squad_name, squad_crest, rating FROM user_squads').map((s) => [s.user_id, s]));
  const list = db.q('SELECT id, username, global_name, last_seen FROM users WHERE id<>?', u.id).map((r) => {
    const sq = squads.get(r.id);
    return { id: r.id, name: squadName(sq, r), crest: squadCrest(sq), rating: sq ? sq.rating : 0, online: !!r.last_seen && String(r.last_seen) >= since };
  });
  list.sort((a, b) => (b.online - a.online) || a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  return { players: list, cooldown: quickCooldown(), wait: quickWait(u.id), reward: rewardJson(quickBase()) };
});

router.post('/api/online/quick', async (ctx) => {
  const u = ctx.requireUser();
  const body = (await ctx.json()) || {};
  const oppId = typeof body.opponent_id === 'number' ? Math.trunc(body.opponent_id) : 0;
  if (oppId <= 0) throw new HttpError(400, 'Escolha um jogador para desafiar.');
  if (oppId === u.id) throw new HttpError(400, 'Voce nao pode desafiar a si mesmo.');
  const opp = db.one('SELECT id, username, global_name FROM users WHERE id=?', oppId);
  if (!opp) throw new HttpError(404, 'Jogador nao encontrado.');
  const pool = playerrepo.drawPool();
  if (pool.length < 2) throw new HttpError(400, 'Nao ha cartas suficientes para o draft.');
  const wait = quickWait(u.id);
  if (wait > 0) throw new HttpError(429, `Aguarde ${wait}s para usar o Draft Rapido de novo.`);
  return db.tx(() => {
    const me = randomSide(u.id, u, pool), op = randomSide(oppId, opp, pool);
    const res = play(me, op);
    const [reward, coins] = pay(u.id, rewardFor(quickBase(), res.result), `Draft Rapido vs ${op.name} (${res.result})`);
    db.exec(INSERT_MATCH, u.id, 'quick', op.name, res.aGoals, res.bGoals, res.result, reward, now());
    const xp = selfcard.addXp(u.id, res.result, 'bot');
    return { ...payload(me, op, res, false, reward, coins, xp), wait: quickCooldown() };
  });
});

router.post('/api/online/queue', async (ctx) => {
  const u = ctx.requireUser();
  const body = (await ctx.json()) || {};
  const mode = body.mode;
  if (mode !== 'random' && mode !== 'team') throw new HttpError(400, 'Modo invalido.');
  heartbeat(u.id);
  let key;
  if (mode === 'team') {
    const sq = db.one('SELECT * FROM user_squads WHERE user_id=?', u.id);
    const problem = squadProblem(sq);
    if (problem) throw new HttpError(400, problem);
    key = 'team:' + (engine.modalityOf(sq.formation) || '');
  } else {
    if (playerrepo.drawPool().length < 2) throw new HttpError(400, 'Nao ha cartas suficientes para o draft aleatorio.');
    key = 'random';
  }
  const mine = ticketOf(u.id);
  if (mine && mine.status === 'matched') return deliver(mine, u.id);
  db.exec("UPDATE online_rooms SET status='cancelled', updated_at=? WHERE type='queue' AND status='waiting' AND p1_id=?", now(), u.id);
  const others = db.q("SELECT * FROM online_rooms WHERE type='queue' AND status='waiting' AND code=? AND p1_id<>? AND updated_at>=? ORDER BY id ASC LIMIT 10",
    key, u.id, minusSeconds(TICKET_ALIVE_S));
  for (const t of others) {
    const oppUser = db.one('SELECT id, username, global_name FROM users WHERE id=?', t.p1_id);
    if (!oppUser) continue;
    let me, op;
    try {
      if (mode === 'team') { me = teamSide(u.id, u); op = teamSide(t.p1_id, oppUser); }
      else { const pool = playerrepo.drawPool(); me = randomSide(u.id, u, pool); op = randomSide(t.p1_id, oppUser, pool); }
    } catch {
      db.exec("UPDATE online_rooms SET status='cancelled', updated_at=? WHERE id=?", now(), t.id);
      continue;
    }
    return { status: 'matched', match: startMatch(t, me, op, mode) };
  }
  const n = now();
  db.exec('INSERT INTO online_rooms (code, type, mode, status, p1_id, created_at, updated_at) VALUES (?,?,?,?,?,?,?)', key, 'queue', mode, 'waiting', u.id, n, n);
  return { status: 'searching', mode, elapsed: 0 };
});

router.get('/api/online/queue', (ctx) => {
  const u = ctx.requireUser();
  heartbeat(u.id);
  const t = ticketOf(u.id);
  if (!t) return { status: 'idle' };
  if (t.status === 'matched') return deliver(t, u.id);
  const elapsed = secondsSince(t.created_at);
  if (elapsed >= SEARCH_TIMEOUT_S) {
    db.exec("UPDATE online_rooms SET status='expired', updated_at=? WHERE id=?", now(), t.id);
    return { status: 'timeout' };
  }
  db.exec('UPDATE online_rooms SET updated_at=? WHERE id=?', now(), t.id);
  const others = db.count("SELECT COUNT(*) FROM online_rooms WHERE type='queue' AND status='waiting' AND code=? AND p1_id<>? AND updated_at>=?",
    t.code || '', u.id, minusSeconds(TICKET_ALIVE_S));
  return { status: 'searching', mode: t.mode || '', elapsed, others };
});

router.post('/api/online/queue/cancel', (ctx) => {
  const u = ctx.requireUser();
  const t = ticketOf(u.id);
  if (t && t.status === 'matched') return deliver(t, u.id);
  db.exec("UPDATE online_rooms SET status='cancelled', updated_at=? WHERE type='queue' AND status='waiting' AND p1_id=?", now(), u.id);
  return { status: 'idle' };
});
