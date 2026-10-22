'use strict';
// Pacotes: sorteio de raridade/carta, entrega de cartas e inventario de pacotes fechados.
const db = require('./db');
const playerRepo = require('./playerrepo');
const discord = require('./discord');
const { parseIso, parseObj, longList, toNum } = require('./util');

function available(pack) {
  if (!pack || !pack.active) return false;
  const now = Date.now();
  const from = pack.available_from, to = pack.available_to;
  if (from && String(from).trim() && parseIso(from) > now) return false;
  if (to && String(to).trim() && parseIso(to) < now) return false;
  return true;
}

/** Sorteio de raridade pelos pesos do pacote ({rarity_id: peso}). 100% no servidor. */
function pickRarityId(odds) {
  const keys = Object.keys(odds || {});
  if (!keys.length) return null;
  let total = 0;
  for (const k of keys) total += odds[k];
  if (total <= 0) return null;
  let r = Math.random() * total;
  let last = null;
  for (const k of keys) {
    const id = Number.parseInt(k.trim(), 10);
    last = Number.isFinite(id) ? id : null;
    r -= odds[k];
    if (r <= 0) return last;
  }
  return last;
}

function oddsOf(pack) {
  const out = {};
  const raw = pack.rarity_odds;
  if (raw == null || String(raw).trim() === '') return out;
  const o = parseObj(raw);
  for (const k of Object.keys(o)) {
    const v = typeof o[k] === 'number' ? o[k] : Number.parseFloat(o[k]);
    if (Number.isFinite(v)) out[k] = v;
  }
  return out;
}

const eligibleOf = (pack) => longList(pack.eligible_players);

/**
 * Decide, slot a slot, QUAL carta cai: raridade garantida (guaranteed_rarity_id) nas N primeiras,
 * demais slots pelos pesos (rarity_odds), faixa de nota (min/max_overall) e repeticao (allow_dupes).
 */
function rollPlayers(pack) {
  const odds = oddsOf(pack);
  const eligible = eligibleOf(pack);
  const n = Math.max(1, Math.trunc(toNum(pack.card_count)) || 1);
  const minOv = Math.trunc(toNum(pack.min_overall));
  const maxOv = Math.trunc(toNum(pack.max_overall));
  const allowDupes = pack.allow_dupes == null ? true : Number(pack.allow_dupes) !== 0;
  let gRar = pack.guaranteed_rarity_id == null ? null : Number(pack.guaranteed_rarity_id);
  if (gRar != null && gRar <= 0) gRar = null;
  const gCount = Math.max(0, Math.trunc(toNum(pack.guaranteed_count)));
  const used = allowDupes ? null : new Set();
  const out = [];
  for (let i = 0; i < n; i++) {
    const rid = (i < gCount && gRar != null) ? gRar : pickRarityId(odds);
    const pid = playerRepo.pickPlayer(rid, eligible, minOv, maxOv, used);
    if (pid == null) continue;
    if (used) used.add(pid);
    out.push(pid);
  }
  return out;
}

/** Grava as cartas sorteadas (use dentro de db.tx se precisar de atomicidade). Devolve [{user_card_id, player_id}]. */
function giveCards(userId, pack, source, pricePaid) {
  const rolled = rollPlayers(pack);
  const given = [];
  for (const pid of rolled) {
    const ucId = db.insert('INSERT INTO user_cards (user_id, player_id, source) VALUES (?,?,?)', userId, pid, source || 'pack');
    given.push({ user_card_id: ucId, player_id: pid });
  }
  if (pack.id > 0) {
    db.exec('INSERT INTO pack_openings (user_id, pack_id, price_paid, cards_json) VALUES (?,?,?,?)',
      userId, pack.id, pricePaid || 0, JSON.stringify(given));
  }
  return given;
}

/** Gera as cartas de um pacote e credita ao usuario (NAO debita moedas). */
function grantPack(userId, pack, source) {
  const given = db.tx(() => giveCards(userId, pack, source, 0));
  discord.notifyIconCards(userId, given.map((g) => g.player_id));
  return given;
}

/** Entrega N pacotes fechados ao inventario (aba Pacotes). */
function addToInventory(userId, packId, source, label, qty) {
  db.tx(() => {
    for (let i = 0; i < Math.max(1, qty); i++) {
      db.exec('INSERT INTO user_packs (user_id, pack_id, source, label) VALUES (?,?,?,?)', userId, packId, source, label);
    }
  });
}

const pending = (userId) => db.count('SELECT COUNT(*) FROM user_packs WHERE user_id=? AND opened_at IS NULL', userId);

module.exports = { available, pickRarityId, oddsOf, eligibleOf, rollPlayers, giveCards, grantPack, addToInventory, pending };
