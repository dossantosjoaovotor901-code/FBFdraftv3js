'use strict';
// Carta pessoal evolutiva ("Minha Carta"): comeca com nota 1 e evolui jogando.
const crypto = require('crypto');
const db = require('./db');
const settings = require('./settings');
const hydrate = require('./hydrate');
const { HttpError, parseArr } = require('./util');

const POSITIONS = ['GK', 'CM', 'ST'];
const RARITY_STEPS = [[95, 'Icon'], [90, 'Lendario'], [87, 'Hero'], [83, 'Ouro'], [79, 'Prata'], [0, 'Bronze']];

const enabled = () => settings.get('selfcard_enabled') === '1';
const num = (key, def) => { const v = settings.getFloat(key); return v <= 0 ? def : v; };
const maxLevel = () => Math.max(2, Math.min(99, Math.round(num('selfcard_max', 99))));
const needFor = (level) => Math.max(1, Math.round(num('selfcard_xp_base', 6) * Math.pow(level, num('selfcard_xp_exp', 1.35))));

function rarityName(ov) {
  for (const [min, name] of RARITY_STEPS) if (ov >= min) return name;
  return 'Bronze';
}

const row = (userId) => db.one('SELECT sc.*, p.overall FROM self_cards sc JOIN players p ON p.id=sc.player_id WHERE sc.user_id=?', userId);

function view(userId) {
  const r = row(userId);
  if (!r) return null;
  const max = maxLevel();
  const level = Math.round(r.overall);
  const atMax = level >= max;
  return {
    player: hydrate.toJson(hydrate.player(r.player_id)),
    level, max, at_max: atMax,
    xp: atMax ? 0 : r.xp,
    need: atMax ? 0 : needFor(level),
  };
}

/** Aplica nota/raridade/atributos ao jogador conforme a carta evolui. */
function applyLevel(playerId, ov) {
  const rar = db.one('SELECT id FROM rarities WHERE name=?', rarityName(ov));
  const model = rar ? db.one('SELECT id FROM card_models WHERE rarity_id=? AND active=1 ORDER BY id LIMIT 1', rar.id) : null;
  const p = db.one('SELECT is_gk FROM players WHERE id=?', playerId);
  const gk = !!(p && p.is_gk);
  const line = gk ? 0 : ov;
  const keep = gk ? ov : 0;
  db.exec('UPDATE players SET overall=?, rarity_id=COALESCE(?,rarity_id), model_id=COALESCE(?,model_id), '
    + 'fin=?,pas=?,ctl=?,skl=?,def=?,jdc=?,pac=?,sho=?,dri=?,phy=?, '
    + 'gk_div=?,gk_han=?,gk_kic=?,gk_ref=?,gk_spd=?,gk_pos=? WHERE id=?',
  ov, rar ? rar.id : null, model ? model.id : null,
  line, line, line, line, line, line, line, line, line, line,
  keep, keep, keep, keep, keep, keep, playerId);
  hydrate.clearRefCache();
}

function cleanName(raw, fallback) {
  let n = (raw == null || String(raw).trim() === '') ? fallback : String(raw);
  n = n.replace(/\s+/g, ' ').trim();
  if (n.length < 2 || n.length > 16) throw new HttpError(400, 'O nome da carta precisa ter de 2 a 16 caracteres.');
  if (!/^[\p{L}\p{N} ._-]+$/u.test(n)) throw new HttpError(400, 'Use apenas letras, numeros, espaco, ponto, traco e _ no nome.');
  return n;
}

/** Cria a carta pessoal de um usuario. */
function createCard(userId, name, position) {
  const u = db.one('SELECT id, discord_id, username, global_name, avatar FROM users WHERE id=?', userId);
  if (!u) throw new HttpError(404, 'Usuario nao encontrado.');
  if (row(userId)) throw new HttpError(400, 'Voce ja tem a sua carta pessoal.');
  const pos = position == null ? 'CM' : String(position).trim().toUpperCase();
  if (!POSITIONS.includes(pos)) throw new HttpError(400, 'Posicao invalida.');
  const nm = cleanName(name, u.global_name && String(u.global_name).trim() ? u.global_name : (u.username || 'Jogador'));
  let photo = null;
  if (u.avatar && String(u.avatar).trim()) photo = `https://cdn.discordapp.com/avatars/${u.discord_id}/${u.avatar}.png`;
  const rar = db.one("SELECT id FROM rarities WHERE name='Bronze'");
  const isGk = pos === 'GK' ? 1 : 0;
  const pid = db.insert('INSERT INTO players (name, photo, overall, position, positions, rarity_id, is_gk, active, group_id, card_type, avatar_mode, avatar_style, owner_user_id, description) '
    + 'VALUES (?,?,?,?,?,?,?,0,?,?,?,?,?,?)',
  nm, photo, 1, pos, '', rar ? rar.id : null, isGk, 'self-' + userId, 'Pessoal', 'auto', 'team', userId, 'Carta pessoal evolutiva');
  applyLevel(pid, 1);
  db.exec('INSERT INTO self_cards (user_id, player_id, xp) VALUES (?,?,0)', userId, pid);
  db.exec("INSERT INTO user_cards (user_id, player_id, source) VALUES (?,?, 'selfcard')", userId, pid);
  return pid;
}

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function pickChars(n) {
  let s = '';
  for (let i = 0; i < n; i++) s += ALPHABET[crypto.randomInt(ALPHABET.length)];
  return s;
}
const genCode = () => 'FBF-' + pickChars(4) + '-' + pickChars(4);

/** Resgate por codigo. */
function claim(userId, code, name, position) {
  if (!enabled()) throw new HttpError(400, 'A carta pessoal esta desativada no momento.');
  const c = code == null ? '' : String(code).trim().toUpperCase();
  if (!c) throw new HttpError(400, 'Digite o codigo de resgate.');
  db.tx(() => {
    if (row(userId)) throw new HttpError(400, 'Voce ja tem a sua carta pessoal.');
    const rc = db.one("SELECT * FROM redeem_codes WHERE code=? AND kind='selfcard'", c);
    if (!rc) throw new HttpError(404, 'Codigo invalido.');
    if (rc.used_by != null) throw new HttpError(400, 'Este codigo ja foi usado.');
    createCard(userId, name, position);
    const upd = db.exec("UPDATE redeem_codes SET used_by=?, used_at=datetime('now','localtime') WHERE id=? AND used_by IS NULL", userId, rc.id);
    if (upd === 0) throw new HttpError(400, 'Este codigo ja foi usado.');
  });
  return view(userId);
}

/** Soma XP depois de uma partida. source: bot | pvp | online | draft */
function addXp(userId, result, source) {
  if (!enabled()) return null;
  const r = row(userId);
  if (!r) return null;
  const max = maxLevel();
  if (r.overall >= max) return { gained: 0, leveled: false, level: Math.round(r.overall), at_max: true };
  const pct = source === 'bot' ? num('selfcard_xp_bot_pct', 40) : source === 'draft' ? num('selfcard_xp_draft_pct', 60) : 100;
  const base = result === 'win' ? num('selfcard_xp_win', 100) : result === 'draw' ? num('selfcard_xp_draw', 40) : result === 'loss' ? num('selfcard_xp_loss', 15) : 0;
  const gained = Math.max(0, Math.round(base * pct / 100));
  let level = Math.round(r.overall);
  let xp = r.xp + gained;
  let leveled = false;
  while (level < max && xp >= needFor(level)) { xp -= needFor(level); level++; leveled = true; }
  if (level >= max) xp = 0;
  db.exec('UPDATE self_cards SET xp=? WHERE user_id=?', xp, userId);
  if (leveled) {
    applyLevel(r.player_id, level);
    refreshSquad(userId, r.player_id);
  }
  return { gained, leveled, level, xp, need: level >= max ? 0 : needFor(level), at_max: level >= max };
}

/** Marca o "Meu time" para recalculo se ele usa a carta pessoal. */
function refreshSquad(userId, playerId) {
  const sq = db.one('SELECT * FROM user_squads WHERE user_id=?', userId);
  if (!sq) return;
  const uses = parseArr(sq.slots_json).some((o) => o && typeof o === 'object' && o.player_id != null && Number(o.player_id) === playerId);
  if (!uses) return;
  db.exec("UPDATE user_squads SET updated_at=datetime('now','localtime') WHERE user_id=?", userId);
}

const orEmpty = (s) => (s == null ? '' : s);

function config() {
  return {
    enabled: enabled(), max: maxLevel(), buy_url: orEmpty(settings.get('selfcard_buy_url')),
    xp: {
      win: num('selfcard_xp_win', 100), draw: num('selfcard_xp_draw', 40), loss: num('selfcard_xp_loss', 15),
      bot_pct: num('selfcard_xp_bot_pct', 40), draft_pct: num('selfcard_xp_draft_pct', 60),
    },
  };
}

function pixConfig() {
  return {
    enabled: enabled() && settings.get('selfcard_pix_enabled') === '1',
    pix_key: orEmpty(settings.get('selfcard_pix_key')),
    pix_name: orEmpty(settings.get('selfcard_pix_name')),
    price: orEmpty(settings.get('selfcard_pix_price')),
    info: orEmpty(settings.get('selfcard_pix_info')),
  };
}

module.exports = { POSITIONS, enabled, maxLevel, needFor, rarityName, row, view, applyLevel, cleanName, createCard, genCode, claim, addXp, config, pixConfig };
