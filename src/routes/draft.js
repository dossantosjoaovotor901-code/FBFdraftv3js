'use strict';
// "Meu time" (draft) e partidas contra bots + ranking.
const { router } = require('../http');
const db = require('../db');
const hydrate = require('../hydrate');
const engine = require('../engine');
const economy = require('../economy');
const selfcard = require('../selfcard');
const settings = require('../settings');
const cardlogic = require('../cardlogic');
const { HttpError, parseSqlTime, parseArr, minusHours, longOrNull, orEmpty, isBlank } = require('../util');

const SHIELD = '\u{1F6E1}️';
const numOr = (v, d) => (typeof v === 'number' && Number.isFinite(v) ? v : d);

/** Cartas do usuario que nao estao anunciadas no mercado. */
const myAvailableCards = (uid) => db.q(
  "SELECT uc.id user_card_id, uc.player_id FROM user_cards uc WHERE uc.user_id=? "
  + "AND uc.id NOT IN (SELECT user_card_id FROM market_listings WHERE status='active') ORDER BY uc.id ASC", uid);

const slotsOf = (body) => (body && Array.isArray(body.slots) ? body.slots.filter((s) => s && typeof s === 'object' && !Array.isArray(s)) : []);

router.get('/api/draft/my-cards', (ctx) => {
  const u = ctx.requireUser();
  const grouped = new Map();
  for (const c of myAvailableCards(u.id)) {
    if (!grouped.has(c.player_id)) grouped.set(c.player_id, []);
    grouped.get(c.player_id).push(c.user_card_id);
  }
  const items = [];
  let total = 0;
  for (const [pid, ids] of grouped) {
    const p = hydrate.player(pid);
    if (!p) continue;
    items.push({ player: hydrate.toJson(p), user_card_ids: ids });
    total += ids.length;
  }
  items.sort((a, b) => (b.player.overall || 0) - (a.player.overall || 0));
  return { items, total };
});

router.post('/api/draft/evaluate', async (ctx) => {
  ctx.requireUser();
  const body = (await ctx.json()) || {};
  const slots = slotsOf(body);
  const players = slots.map((s) => { const id = longOrNull(s, 'player_id'); return id == null ? null : hydrate.player(id); });
  const positions = slots.map((s) => (typeof s.pos === 'string' ? s.pos : ''));
  const ev = engine.evaluate(players, positions, typeof body.modality === 'string' ? body.modality : null);
  return { rating: ev[0], chemistry: ev[1] };
});

router.post('/api/draft/save', async (ctx) => {
  const u = ctx.requireUser();
  const body = (await ctx.json()) || {};
  if (body.mode !== 'own') throw new HttpError(400, 'O time fixo so pode ser montado com as suas cartas.');
  const formationId = longOrNull(body, 'formation_id');
  const f = formationId == null ? null : db.one('SELECT * FROM formations WHERE id=? AND active=1', formationId);
  if (!f) throw new HttpError(400, 'Formacao invalida');
  const def = parseArr(f.slots_json);
  const slots = slotsOf(body);
  if (slots.length !== def.length) throw new HttpError(400, 'Elenco nao corresponde a formacao');

  const owned = new Map();
  for (const c of myAvailableCards(u.id)) owned.set(c.user_card_id, c.player_id);
  const players = [], positions = [], cardIds = [], playerIds = [];
  const usedPeople = new Set(), usedCards = new Set();
  for (let i = 0; i < slots.length; i++) {
    const s = slots[i], d = def[i];
    if (!d || String(d.pos || '') !== String(s.pos || '')) throw new HttpError(400, 'Elenco nao corresponde a formacao');
    const ucid = longOrNull(s, 'user_card_id');
    if (ucid == null) throw new HttpError(400, 'Preencha todas as posicoes');
    if (!owned.has(ucid)) throw new HttpError(400, 'Carta invalida ou indisponivel (esta a venda ou nao e sua).');
    if (usedCards.has(ucid)) throw new HttpError(400, 'A mesma carta foi usada duas vezes.');
    usedCards.add(ucid);
    const pid = owned.get(ucid);
    const p = hydrate.player(pid);
    if (!p) throw new HttpError(400, 'Jogador invalido');
    const key = engine.personKey(p);
    if (usedPeople.has(key)) throw new HttpError(400, `O mesmo jogador nao pode ocupar duas posicoes (${p.name || ''}).`);
    usedPeople.add(key);
    players.push(p); positions.push(String(s.pos || '')); cardIds.push(ucid); playerIds.push(pid);
  }
  const modality = f.mode;
  const xy = def.map((d) => [numOr(d.x, 50), numOr(d.y, 50)]);
  const ev = engine.evaluate(players, positions, modality, xy);
  const label = (modality ? modality + ' . ' : '') + (f.name || '');
  const slotsJson = JSON.stringify(def.map((d, i) => ({
    pos: String(slots[i].pos || '').replace(/[\\"]/g, ''), x: numOr(d.x, 50), y: numOr(d.y, 50), player_id: playerIds[i], user_card_id: cardIds[i],
  })));
  return db.tx(() => {
    const draftId = db.insert('INSERT INTO drafts (user_id, formation, mode, slots_json, rating, chemistry) VALUES (?,?,?,?,?,?)',
      u.id, label, 'own', slotsJson, ev[0], ev[1]);
    const ex = db.one('SELECT user_id FROM user_squads WHERE user_id=?', u.id);
    if (ex) {
      db.exec("UPDATE user_squads SET formation=?, mode=?, slots_json=?, rating=?, chemistry=?, updated_at=datetime('now','localtime') WHERE user_id=?",
        label, 'own', slotsJson, ev[0], ev[1], u.id);
    } else {
      db.exec('INSERT INTO user_squads (user_id, formation, mode, slots_json, rating, chemistry, squad_name, squad_crest) VALUES (?,?,?,?,?,?,?,?)',
        u.id, label, 'own', slotsJson, ev[0], ev[1], null, SHIELD);
    }
    return { ok: true, draft_id: draftId, rating: ev[0], chemistry: ev[1] };
  });
});

router.get('/api/draft/team', (ctx) => {
  const u = ctx.requireUser();
  const sq = db.one('SELECT * FROM user_squads WHERE user_id=?', u.id);
  if (!sq || sq.rating <= 0 || sq.mode !== 'own') {
    return { squad: null, identity: sq ? { squad_name: orEmpty(sq.squad_name), squad_crest: orEmpty(sq.squad_crest) } : null };
  }
  const mine = new Set(myAvailableCards(u.id).map((c) => c.user_card_id));
  let broken = 0;
  const slots = parseArr(sq.slots_json).map((s) => {
    const ucid = longOrNull(s, 'user_card_id');
    const owned = ucid == null || mine.has(ucid);
    if (!owned) broken++;
    const pid = longOrNull(s, 'player_id');
    const p = pid != null ? hydrate.player(pid) : null;
    return { pos: s.pos || '', x: numOr(s.x, 50), y: numOr(s.y, 50), owned, user_card_id: ucid, player: p ? hydrate.toJson(p) : null };
  });
  return {
    squad: {
      formation: orEmpty(sq.formation), mode: orEmpty(sq.mode), rating: sq.rating, chemistry: sq.chemistry,
      squad_name: orEmpty(sq.squad_name), squad_crest: orEmpty(sq.squad_crest), updated_at: orEmpty(sq.updated_at), slots, broken,
    },
  };
});

router.del('/api/draft/team', (ctx) => {
  const u = ctx.requireUser();
  db.exec("UPDATE user_squads SET formation=NULL, mode=NULL, slots_json='[]', rating=0, chemistry=0, updated_at=datetime('now','localtime') WHERE user_id=?", u.id);
  return { ok: true };
});

router.get('/api/draft/crests', () => ({
  presets: [SHIELD, '⚽', '\u{1F3C6}', '\u{1F985}', '\u{1F981}', '\u{1F409}', '\u{1F43A}', '\u{1F42F}', '\u{1F40E}', '\u{1F418}', '\u{1F531}', '⭐', '\u{1F525}', '⚡', '\u{1F451}', '\u{1F31F}'],
  teams: db.q("SELECT name, crest FROM teams WHERE crest IS NOT NULL AND crest<>''").map((t) => ({ name: orEmpty(t.name), crest: orEmpty(t.crest) })),
}));

router.post('/api/draft/team-meta', async (ctx) => {
  const u = ctx.requireUser();
  const body = (await ctx.json()) || {};
  const sq = db.one('SELECT * FROM user_squads WHERE user_id=?', u.id);
  if (!sq) throw new HttpError(400, 'Monte e salve um time primeiro.');
  let name = typeof body.squad_name === 'string' ? body.squad_name : sq.squad_name;
  name = name == null ? null : name.trim().slice(0, 40);
  if (name === '') name = null;
  let crest = typeof body.squad_crest === 'string' ? body.squad_crest.trim() : sq.squad_crest;
  if (!crest) crest = SHIELD;
  else if (!/^https?:\/\/[^\s'"<>]+$/i.test(crest) && [...crest].length > 4 && crest.length > 4) crest = sq.squad_crest;
  if (crest && crest.length > 400) crest = crest.slice(0, 400);
  db.exec('UPDATE user_squads SET squad_name=?, squad_crest=? WHERE user_id=?', name, crest, u.id);
  return { ok: true, squad_name: name || '', squad_crest: crest };
});

// ---------------- Partidas vs Bot ----------------
const PVP_BASE = 150;
const rewardFor = (base, result) => Math.round(base * (result === 'win' ? 1 : result === 'draw' ? 0.4 : 0.15));
const jitter = (v, fb) => (v == null ? fb : v) + (Math.random() * 6 - 3);

function botCrest(b) {
  if (!isBlank(b.crest)) return b.crest;
  if (b.team_id != null) {
    const t = db.one('SELECT crest FROM teams WHERE id=?', b.team_id);
    if (t && !isBlank(t.crest)) return t.crest;
  }
  return '\u{1F916}';
}

function cooldownJson(uid) {
  const cd = Math.max(0, settings.getInt('bot_match_cooldown'));
  const lim = Math.max(0, settings.getInt('bot_match_daily_limit'));
  const last = db.one("SELECT created_at FROM matches WHERE user_id=? AND opp_type='bot' ORDER BY id DESC LIMIT 1", uid);
  let wait = 0;
  if (cd > 0 && last) {
    const t = parseSqlTime(last.created_at);
    if (t > 0) wait = Math.max(0, Math.ceil((t + cd * 1000 - Date.now()) / 1000));
  }
  const today = db.count("SELECT COUNT(*) FROM matches WHERE user_id=? AND opp_type='bot' AND created_at >= ?", uid, minusHours(24));
  return { wait, cooldown: cd, daily_limit: lim, today, limit_reached: lim > 0 && today >= lim };
}

function botLines(b) {
  const ids = [];
  for (const v of parseArr(b.card_ids)) { const n = Number(v); if (Number.isFinite(n) && n > 0) ids.push(Math.trunc(n)); }
  if (ids.length) {
    const players = engine.loadPlayers(ids, true);
    if (players.length >= 2) return engine.linesOf(players, Math.max(0, b.chemistry == null ? 40 : b.chemistry), null);
  }
  const l = engine.emptyLines();
  const chem = b.chemistry == null ? 40 : b.chemistry;
  l.attack = jitter(b.attack, b.strength) + chem * 0.15;
  l.defense = jitter(b.defense, b.strength);
  l.gk = jitter(b.gk, b.strength);
  return l;
}

function lineupJson(l) {
  const out = [];
  for (const p of (l && l.players) || []) {
    if (!p) continue;
    const full = p.id != null ? hydrate.player(p.id) : null;
    out.push(full ? hydrate.toJson(full) : { ...p });
  }
  return out;
}

const BOTS = () => db.q('SELECT * FROM bot_teams WHERE active=1 ORDER BY sort ASC, id ASC');

router.get('/api/match/opponents', (ctx) => {
  const u = ctx.requireUser();
  return {
    bots: BOTS().map((b) => ({ key: orEmpty(b.key), label: orEmpty(b.name), strength: b.strength, reward: b.reward, crest: botCrest(b) })),
    cooldown: cooldownJson(u.id),
  };
});

router.post('/api/match/play', async (ctx) => {
  const u = ctx.requireUser();
  const body = (await ctx.json()) || {};
  const type = typeof body.type === 'string' ? body.type : 'bot';
  if (type === 'user') throw new HttpError(400, 'Partidas contra jogadores ficam na aba Online.');
  const sq = db.one('SELECT * FROM user_squads WHERE user_id=?', u.id);
  if (!sq || sq.rating <= 0) throw new HttpError(400, 'Monte e salve seu time antes de jogar.');
  if (engine.hasDuplicateSlots(sq.slots_json)) throw new HttpError(400, 'Seu time tem a mesma carta em mais de uma posicao. Ajuste em Meu time.');
  const diff = typeof body.difficulty === 'string' ? body.difficulty : null;
  let bot = diff ? db.one('SELECT * FROM bot_teams WHERE key=? AND active=1', diff) : null;
  if (!bot) bot = BOTS()[0];
  if (!bot) throw new HttpError(400, 'Nenhum bot disponivel no momento.');
  const cdn = cooldownJson(u.id);
  if (cdn.limit_reached) throw new HttpError(429, `Limite diario de partidas contra bots atingido (${cdn.daily_limit}).`);
  if (cdn.wait > 0) throw new HttpError(429, `Aguarde ${cdn.wait}s para jogar contra um bot de novo.`);

  const myName = !isBlank(sq.squad_name) ? sq.squad_name : (!isBlank(u.global_name) ? u.global_name : (u.username || 'Time'));
  const myCrest = isBlank(sq.squad_crest) ? SHIELD : sq.squad_crest;
  const myLines = engine.squadLines(sq.slots_json, sq.chemistry, engine.modalityOf(sq.formation));
  const oppLines = botLines(bot);
  const [myGoals, opGoals] = engine.simulateGoals(myLines, oppLines);
  const result = myGoals > opGoals ? 'win' : myGoals < opGoals ? 'loss' : 'draw';
  const events = engine.buildEvents(myName, bot.name || 'Bot', myGoals, opGoals, myLines, oppLines);

  let reward = rewardFor(bot.reward, result);
  let coins;
  try { coins = economy.applyCoins(u.id, reward, 'match', `Partida vs ${bot.name || 'Bot'} (${result})`); }
  catch { reward = 0; coins = economy.coinsOf(u.id); }
  db.exec('INSERT INTO matches (user_id, opp_type, opp_label, my_goals, opp_goals, result, reward) VALUES (?,?,?,?,?,?,?)',
    u.id, 'bot', bot.name || 'Bot', myGoals, opGoals, result, reward);
  const xp = selfcard.addXp(u.id, result, 'bot');
  return {
    ok: true,
    me: { name: myName, crest: myCrest, goals: myGoals, rating: sq.rating },
    opp: { name: bot.name || 'Bot', crest: botCrest(bot), goals: opGoals },
    events: events.map((e) => engine.eventJson(e)),
    lineup: { me: lineupJson(myLines), opp: lineupJson(oppLines) },
    synergies: { me: cardlogic.synergiesJson(myLines.synergies), opp: cardlogic.synergiesJson(oppLines.synergies) },
    procs: { me: cardlogic.procsJson(myLines.procs), opp: cardlogic.procsJson(oppLines.procs) },
    result, reward, coins, selfcard: xp || null,
  };
});

router.get('/api/match/history', (ctx) => {
  const u = ctx.requireUser();
  const matches = db.q('SELECT * FROM matches WHERE user_id=? ORDER BY id DESC LIMIT 50', u.id);
  const stats = db.one("SELECT COUNT(*) played, COALESCE(SUM(CASE WHEN result='win' THEN 1 ELSE 0 END),0) wins, "
    + "COALESCE(SUM(CASE WHEN result='draw' THEN 1 ELSE 0 END),0) draws, COALESCE(SUM(CASE WHEN result='loss' THEN 1 ELSE 0 END),0) losses, "
    + 'COALESCE(SUM(my_goals),0) goals_for, COALESCE(SUM(opp_goals),0) goals_against, COALESCE(SUM(reward),0) coins_won FROM matches WHERE user_id=?', u.id);
  return { matches, stats };
});

router.get('/api/match/rewards', () => ({
  rewards: [
    ...BOTS().map((b) => ({ key: orEmpty(b.key), label: orEmpty(b.name), strength: b.strength,
      win: rewardFor(b.reward, 'win'), draw: rewardFor(b.reward, 'draw'), loss: rewardFor(b.reward, 'loss') })),
    { key: 'pvp', label: 'Multiplayer (PvP)', strength: null, win: rewardFor(PVP_BASE, 'win'), draw: rewardFor(PVP_BASE, 'draw'), loss: rewardFor(PVP_BASE, 'loss') },
  ],
}));

router.get('/api/match/ranking', (ctx) => {
  const u = ctx.requireUser();
  const rows = db.q("SELECT user_id, SUM(CASE WHEN result='win' THEN 1 ELSE 0 END) wins, SUM(CASE WHEN result='draw' THEN 1 ELSE 0 END) draws, "
    + "SUM(CASE WHEN result='loss' THEN 1 ELSE 0 END) losses, COUNT(*) played, COALESCE(SUM(my_goals),0) gf, COALESCE(SUM(opp_goals),0) ga, "
    + "SUM(CASE WHEN result='win' THEN 3 WHEN result='draw' THEN 1 ELSE 0 END) points FROM matches GROUP BY user_id");
  const list = rows.map((r) => {
    const sq = db.one('SELECT squad_name, squad_crest FROM user_squads WHERE user_id=?', r.user_id);
    const usr = db.one('SELECT username, global_name FROM users WHERE id=?', r.user_id);
    const name = sq && !isBlank(sq.squad_name) ? sq.squad_name : (usr ? (!isBlank(usr.global_name) ? usr.global_name : usr.username || 'Treinador') : 'Treinador');
    const crest = sq && !isBlank(sq.squad_crest) ? sq.squad_crest : SHIELD;
    return { user_id: r.user_id, name, crest, points: r.points, wins: r.wins, draws: r.draws, losses: r.losses, played: r.played,
      gf: r.gf, ga: r.ga, gd: r.gf - r.ga, me: r.user_id === u.id };
  });
  list.sort((a, b) => b.points - a.points || b.gd - a.gd || b.wins - a.wins);
  return { ranking: list.map((o, i) => ({ ...o, rank: i + 1 })) };
});

module.exports = { rewardFor, PVP_BASE, lineupJson };
