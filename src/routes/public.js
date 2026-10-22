'use strict';
// Auth (Discord OAuth2 + dev-login), perfil, sistema e catalogo publico.
const crypto = require('crypto');
const { router } = require('../http');
const db = require('../db');
const cfg = require('../config');
const session = require('../session');
const economy = require('../economy');
const settings = require('../settings');
const hydrate = require('../hydrate');
const { HttpError, now, longOrNull, longList, orEmpty } = require('../util');

const DISCORD_API = 'https://discord.com/api';

// ---------------- Auth ----------------
router.get('/auth/config', () => ({ discord: cfg.discordConfigured(), dev: cfg.devLogin }));

router.get('/auth/discord', (ctx) => {
  if (!cfg.discordConfigured()) {
    console.error('[FBF] Login Discord nao configurado: defina FBF_DISCORD_CLIENT_ID, FBF_DISCORD_CLIENT_SECRET e FBF_DISCORD_CALLBACK_URL');
    return ctx.redirect('/?error=config');
  }
  const state = crypto.randomBytes(16).toString('base64url');
  const sid = session.create({ oauthState: state });
  ctx.setCookie(cfg.cookieName, sid, session.maxAgeSec);
  const q = new URLSearchParams({ client_id: cfg.clientId, redirect_uri: cfg.callback, response_type: 'code', scope: 'identify email', state });
  ctx.redirect(`${DISCORD_API}/oauth2/authorize?${q}`);
});

/** Cria/atualiza o usuario e concede a recompensa inicial UMA unica vez. */
function upsertUser(profile) {
  const discordId = String(profile.id);
  const username = profile.username || 'Jogador';
  const globalName = profile.global_name || null;
  const avatar = profile.avatar || null;
  const email = profile.email || null;
  const isAdmin = cfg.isAdminDiscordId(discordId);
  return db.tx(() => {
    const ex = db.one('SELECT * FROM users WHERE discord_id=?', discordId);
    if (ex) {
      db.exec("UPDATE users SET username=?, global_name=?, avatar=?, email=?, is_admin=CASE WHEN ? THEN 1 ELSE is_admin END, updated_at=datetime('now','localtime') WHERE id=?",
        username, globalName, avatar, email, isAdmin, ex.id);
      return ex.id;
    }
    const id = db.insert('INSERT INTO users (discord_id, username, global_name, avatar, email, coins, is_admin, initial_reward_given) VALUES (?,?,?,?,?,0,?,0)',
      discordId, username, globalName, avatar, email, isAdmin);
    economy.applyCoins(id, cfg.initialCoins, 'reward', 'Recompensa inicial de boas-vindas');
    db.exec('UPDATE users SET initial_reward_given=1 WHERE id=?', id);
    return id;
  });
}

router.get('/auth/discord/callback', async (ctx) => {
  const { code, state, error } = ctx.query;
  if (error) return ctx.redirect('/?error=' + (error === 'access_denied' ? 'denied' : 'oauth'));
  if (!code) return ctx.redirect('/?error=no_code');
  // Confere o state (protecao contra CSRF) guardado na sessao.
  const sess = session.read(ctx.sid);
  const expected = sess ? sess.oauthState : null;
  if (ctx.sid) session.destroy(ctx.sid);
  if (!expected || expected !== state) return ctx.redirect('/?error=state');
  try {
    const tr = await fetch(DISCORD_API + '/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: new URLSearchParams({ client_id: cfg.clientId, client_secret: cfg.clientSecret, grant_type: 'authorization_code', code, redirect_uri: cfg.callback }),
      signal: AbortSignal.timeout(15_000),
    });
    const token = await tr.json().catch(() => ({}));
    if (!token.access_token) {
      console.error(`[FBF] Discord recusou o token: ${tr.status} ${token.error || ''} ${token.error_description || ''}`);
      return ctx.redirect('/?error=token');
    }
    const mr = await fetch(DISCORD_API + '/users/@me', { headers: { Authorization: 'Bearer ' + token.access_token }, signal: AbortSignal.timeout(15_000) });
    const profile = await mr.json().catch(() => ({}));
    if (!mr.ok || !profile.id) { console.error('[FBF] Discord nao devolveu o perfil: ' + mr.status); return ctx.redirect('/?error=profile'); }
    const userId = upsertUser(profile);
    ctx.setCookie(cfg.cookieName, session.create({ userId: String(userId), discordId: String(profile.id) }), session.maxAgeSec);
    ctx.redirect('/');
  } catch (e) {
    console.error('[FBF] Erro no OAuth Discord', e);
    ctx.redirect('/?error=oauth');
  }
});

router.post('/auth/dev-login', async (ctx) => {
  if (!cfg.devLogin) throw new HttpError(403, 'Login de desenvolvimento desativado');
  const b = (await ctx.json()) || {};
  const username = typeof b.username === 'string' && b.username ? b.username : 'Treinador';
  const discordId = typeof b.discord_id === 'string' && b.discord_id ? b.discord_id : 'dev-' + username;
  const userId = upsertUser({ id: discordId, username, global_name: username });
  if (b.admin === true) db.exec('UPDATE users SET is_admin=1 WHERE id=?', userId);
  ctx.setCookie(cfg.cookieName, session.create({ userId: String(userId), discordId }), session.maxAgeSec);
  const u = db.one('SELECT id, username FROM users WHERE id=?', userId);
  return { ok: true, user: { id: u.id, username: u.username } };
});

router.post('/auth/logout', (ctx) => {
  if (ctx.sid) session.destroy(ctx.sid);
  ctx.setCookie(cfg.cookieName, '', 0);
  return { ok: true };
});

// ---------------- Perfil ----------------
function publicUser(u) {
  const uid = u.id;
  const avatarUrl = u.avatar && String(u.avatar).trim() ? `https://cdn.discordapp.com/avatars/${u.discord_id}/${u.avatar}.png` : null;
  const team = u.main_team_id != null ? db.one('SELECT * FROM teams WHERE id=?', u.main_team_id) : null;
  return {
    id: uid, discord_id: u.discord_id || '', username: u.username || '', global_name: u.global_name || '',
    coins: u.coins, is_admin: !!u.is_admin,
    card_count: db.count('SELECT COUNT(*) FROM user_cards WHERE user_id=?', uid),
    packs_pending: db.count('SELECT COUNT(*) FROM user_packs WHERE user_id=? AND opened_at IS NULL', uid),
    avatar_url: avatarUrl, main_team: team || null,
  };
}

router.get('/api/me', (ctx) => (ctx.user ? { user: publicUser(ctx.user) } : { user: null }));

router.get('/api/me/live', (ctx) => {
  const u = ctx.user;
  if (!u) return { user: null };
  try { db.exec('UPDATE users SET last_seen=? WHERE id=?', now(), u.id); } catch { /* ignore */ }
  return {
    user_id: u.id, coins: u.coins,
    card_count: db.count('SELECT COUNT(*) FROM user_cards WHERE user_id=?', u.id),
    packs_pending: db.count('SELECT COUNT(*) FROM user_packs WHERE user_id=? AND opened_at IS NULL', u.id),
    is_admin: !!u.is_admin,
  };
});

router.post('/api/me/main-team', async (ctx) => {
  const u = ctx.requireUser();
  const b = (await ctx.json()) || {};
  db.exec('UPDATE users SET main_team_id=? WHERE id=?', longOrNull(b, 'team_id'), u.id);
  return { ok: true };
});

// ---------------- Sistema ----------------
router.get('/api/maintenance', () => ({
  on: settings.get('maintenance_on') === '1', message: orEmpty(settings.get('maintenance_message')), until: orEmpty(settings.get('maintenance_until')),
}));

router.get('/api/health', () => {
  try {
    return { ok: true, backend: 'node', database: 'ok', players: db.count('SELECT COUNT(*) FROM players'), users: db.count('SELECT COUNT(*) FROM users') };
  } catch (e) { throw new HttpError(500, e.message); }
});

router.get('/api/sessions/purge', () => { session.purgeExpired(); return { ok: true }; });

// ---------------- Catalogo publico ----------------
router.get('/api/players', (ctx) => {
  const { q, position, rarity_id, team_id, model_id, min_overall, active } = ctx.query;
  const rows = db.q('SELECT * FROM players WHERE COALESCE(owner_user_id,0)=0 ORDER BY overall DESC, name ASC');
  const ql = q ? q.toLowerCase() : null;
  const pos = position ? position.toUpperCase() : null;
  const out = [];
  for (const p of rows) {
    if (active !== 'all' && !p.active) continue;
    if (ql && !String(p.name || '').toLowerCase().includes(ql)) continue;
    if (pos && pos !== String(p.position || '').toUpperCase() && !String(p.positions || '').toUpperCase().includes(pos)) continue;
    if (rarity_id && Number(rarity_id) !== p.rarity_id) continue;
    if (team_id && Number(team_id) !== p.team_id) continue;
    if (model_id && Number(model_id) !== p.model_id) continue;
    if (min_overall && p.overall < Number(min_overall)) continue;
    out.push(hydrate.toJson(p));
  }
  return { players: out };
});

router.get('/api/players/:id', (ctx) => {
  const p = hydrate.player(Number(ctx.params.id));
  if (!p) throw new HttpError(404, 'Jogador nao encontrado');
  return { player: hydrate.toJson(p) };
});
router.get('/api/teams', () => ({ teams: db.q('SELECT * FROM teams ORDER BY name ASC') }));
router.get('/api/rarities', () => ({ rarities: db.q('SELECT * FROM rarities ORDER BY rank ASC') }));
router.get('/api/models', () => ({ models: db.q('SELECT * FROM card_models ORDER BY id ASC') }));
router.get('/api/formations', () => ({ formations: db.q('SELECT * FROM formations WHERE active=1 ORDER BY mode ASC, id ASC') }));

function liveEvent() {
  const n = now();
  for (const e of db.q('SELECT * FROM events WHERE active=1 ORDER BY id DESC')) {
    const s = e.starts_at, en = e.ends_at;
    if (s && String(s).trim() && s > n) continue;
    if (en && String(en).trim() && en < n) continue;
    return e;
  }
  return null;
}

function eventJson(e) {
  const packs = [];
  for (const id of longList(e.pack_ids)) {
    const p = db.one('SELECT id, name, art, price, card_count FROM packs WHERE active=1 AND id=?', id);
    if (p) packs.push({ id: p.id, name: p.name || '', art: orEmpty(p.art), price: p.price, card_count: p.card_count });
  }
  const cards = [];
  for (const id of longList(e.card_ids)) {
    const p = db.one('SELECT * FROM players WHERE active=1 AND id=?', id);
    if (p) cards.push(hydrate.toJson(p));
  }
  return {
    id: e.id, name: e.name || '', description: e.description || '', emoji: e.emoji || '', bg_effect: e.bg_effect || 'none',
    theme: { primary: orEmpty(e.theme_primary), dark: orEmpty(e.theme_dark), light: orEmpty(e.theme_light), page_bg: orEmpty(e.page_bg) },
    banner: { text: orEmpty(e.banner_text), bg: orEmpty(e.banner_bg), color: orEmpty(e.banner_color) },
    packs, cards,
  };
}
router.get('/api/event/active', () => {
  const e = liveEvent();
  return { event: e ? eventJson(e) : null };
});

module.exports = { upsertUser };
