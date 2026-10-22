'use strict';
// Colecao, pacotes, loja/mercado.
const { router } = require('../http');
const db = require('../db');
const hydrate = require('../hydrate');
const packs = require('../packs');
const shop = require('../shop');
const economy = require('../economy');
const pricing = require('../pricing');
const settings = require('../settings');
const discord = require('../discord');
const { HttpError, orEmpty } = require('../util');

// ---------------- Colecao ----------------
router.get('/api/collection', (ctx) => {
  const u = ctx.requireUser();
  const { q, position, rarity_id, team_id, model_id, sort } = ctx.query;
  const uc = db.q('SELECT * FROM user_cards WHERE user_id=? ORDER BY acquired_at DESC, id DESC', u.id);
  const grouped = new Map();
  for (const c of uc) { if (!grouped.has(c.player_id)) grouped.set(c.player_id, []); grouped.get(c.player_id).push(c.id); }
  let items = [];
  for (const [pid, ids] of grouped) {
    const p = hydrate.player(pid);
    if (p) items.push({ player: p, count: ids.length, ids });
  }
  if (q && q.trim()) { const qq = q.toLowerCase(); items = items.filter((i) => String(i.player.name || '').toLowerCase().includes(qq)); }
  if (position && position.trim()) {
    const pos = position.toUpperCase();
    items = items.filter((i) => pos === String(i.player.position || '').toUpperCase() || String(i.player.positions || '').toUpperCase().includes(pos));
  }
  if (rarity_id) items = items.filter((i) => String(i.player.rarity_id) === rarity_id);
  if (team_id) items = items.filter((i) => String(i.player.team_id) === team_id);
  if (model_id) items = items.filter((i) => String(i.player.model_id) === model_id);
  const maxId = (ids) => Math.max(0, ...ids);
  if (sort === 'overall') items.sort((a, b) => b.player.overall - a.player.overall);
  else if (sort === 'rarity') { const rk = (i) => { const r = hydrate.rarityOf(i.player); return r ? r.rank : 0; }; items.sort((a, b) => rk(b) - rk(a)); }
  else items.sort((a, b) => maxId(b.ids) - maxId(a.ids));
  return {
    items: items.map((i) => ({ player: hydrate.toJson(i.player), count: i.count, user_card_ids: i.ids })),
    total: uc.length, unique: items.length,
  };
});

router.get('/api/collection/history', (ctx) => {
  const u = ctx.requireUser();
  return { history: db.q('SELECT uc.id, uc.acquired_at, uc.source, p.name player_name, p.overall FROM user_cards uc JOIN players p ON p.id=uc.player_id '
    + 'WHERE uc.user_id=? ORDER BY uc.acquired_at DESC, uc.id DESC LIMIT 200', u.id) };
});

// ---------------- Pacotes ----------------
router.get('/api/packs', () => ({
  packs: db.q('SELECT * FROM packs ORDER BY price ASC, id ASC').filter(packs.available).map((p) => ({
    id: p.id, name: p.name || '', art: orEmpty(p.art), price: p.price, card_count: p.card_count,
    color_from: orEmpty(p.color_from), color_to: orEmpty(p.color_to), color_accent: orEmpty(p.color_accent), tag: orEmpty(p.tag),
  })),
}));

const cardsOut = (given) => given.map((g) => {
  const p = hydrate.player(g.player_id);
  return p ? { user_card_id: g.user_card_id, player: hydrate.toJson(p) } : null;
}).filter(Boolean);

/** Abre um pacote: debita as moedas e entrega as cartas NA MESMA transacao. */
router.post('/api/packs/:id/open', (ctx) => {
  const u = ctx.requireUser();
  const pack = db.one('SELECT * FROM packs WHERE id=?', Number(ctx.params.id));
  if (!pack || !packs.available(pack)) throw new HttpError(404, 'Pacote indisponivel');
  const given = db.tx(() => {
    economy.applyCoins(u.id, -pack.price, 'pack', 'Abertura do pacote ' + (pack.name || ''));
    return packs.giveCards(u.id, pack, 'pack', pack.price);
  });
  discord.notifyIconCards(u.id, given.map((g) => g.player_id));
  return { ok: true, cards: cardsOut(given), coins: economy.coinsOf(u.id) };
});

router.get('/api/packs/inventory', (ctx) => {
  const u = ctx.requireUser();
  const rows = db.q('SELECT pack_id, COUNT(*) n FROM user_packs WHERE user_id=? AND opened_at IS NULL GROUP BY pack_id ORDER BY MIN(id) ASC', u.id);
  let total = 0;
  const items = rows.map((r) => {
    const p = db.one('SELECT id, name, art, card_count, color_from, color_to, color_accent, tag FROM packs WHERE id=?', r.pack_id);
    total += r.n;
    return {
      pack_id: r.pack_id, count: r.n, name: p ? p.name || 'Pacote' : 'Pacote removido', card_count: p ? p.card_count : 0,
      color_from: p ? orEmpty(p.color_from) : '', color_to: p ? orEmpty(p.color_to) : '', color_accent: p ? orEmpty(p.color_accent) : '',
      tag: p ? orEmpty(p.tag) : '', available: !!p,
    };
  });
  return { items, total };
});

/** Abre 1 pacote do inventario (gratis - ja foi ganho). */
router.post('/api/packs/inventory/:packId/open', (ctx) => {
  const u = ctx.requireUser();
  const packId = Number(ctx.params.packId);
  const pack = db.one('SELECT * FROM packs WHERE id=?', packId);
  if (!pack) throw new HttpError(404, 'Esse pacote foi removido pelo administrador.');
  const given = db.tx(() => {
    const pending = db.one('SELECT id FROM user_packs WHERE user_id=? AND pack_id=? AND opened_at IS NULL ORDER BY id ASC LIMIT 1', u.id, packId);
    if (!pending) throw new HttpError(400, 'Voce nao tem esse pacote para abrir.');
    db.exec("UPDATE user_packs SET opened_at=datetime('now','localtime') WHERE id=? AND opened_at IS NULL", pending.id);
    return packs.giveCards(u.id, pack, 'pack', 0);
  });
  discord.notifyIconCards(u.id, given.map((g) => g.player_id));
  const left = db.count('SELECT COUNT(*) FROM user_packs WHERE user_id=? AND pack_id=? AND opened_at IS NULL', u.id, packId);
  return { ok: true, cards: cardsOut(given), remaining: left, pending: packs.pending(u.id) };
});

// ---------------- Loja + mercado ----------------
router.get('/api/market/rules', () => ({
  rules: orEmpty(settings.get('market_rules')), min_price: settings.getInt('market_min_price'), max_price: settings.getInt('market_max_price'),
  min_pct: settings.getInt('market_min_pct'), max_pct: settings.getInt('market_max_pct'),
  refresh_days: Math.max(1, Math.round(shop.refreshMinutes() / 1440)), refresh_label: shop.humanInterval(shop.refreshMinutes()),
}));

router.get('/api/market/shop', (ctx) => {
  shop.ensureFresh();
  const u = ctx.user;
  const uid = u ? u.id : 0;
  const listings = [];
  for (const r of db.q("SELECT * FROM market_shop WHERE status='active' ORDER BY pinned DESC, price DESC, id ASC")) {
    const p = hydrate.player(r.player_id);
    if (!p) continue;
    const remaining = shop.remainingOf(r);
    const limit = Number(r.limit_per_user || 0) > 0 ? Number(r.limit_per_user) : null;
    const mine = limit == null ? 0 : shop.boughtBy('shop', r.id, uid);
    listings.push({
      id: r.id, price: r.price, pinned: !!r.pinned, unlimited: remaining == null, sold_out: remaining != null && remaining === 0,
      bought_by_me: mine, limit_reached: limit != null && mine >= limit, player: hydrate.toJson(p),
      remaining, limit_per_user: limit,
    });
  }
  const mins = shop.refreshMinutes();
  const nx = shop.nextRefresh();
  return {
    listings, events: shop.liveEvents().map((e) => shop.eventView(e, uid)), cycle: settings.getInt('shop_cycle'),
    rules: orEmpty(settings.get('market_rules')), refresh_minutes: mins, refresh_label: shop.humanInterval(mins),
    refresh_days: Math.max(1, Math.round(mins / 1440)), next_refresh: nx[0], ms_left: nx[1], server_time: new Date().toISOString(),
  };
});

router.post('/api/market/shop/event-items/:id/buy', (ctx) => ({ ok: true, coins: shop.buyEventItem(ctx.requireUser().id, Number(ctx.params.id)) }));
router.post('/api/market/shop/:id/buy', (ctx) => ({ ok: true, coins: shop.buyShopOffer(ctx.requireUser().id, Number(ctx.params.id)) }));

router.get('/api/market', () => {
  const out = [];
  for (const r of db.q("SELECT * FROM market_listings WHERE status='active' ORDER BY created_at DESC, id DESC LIMIT 200")) {
    const p = hydrate.player(r.player_id);
    if (!p) continue;
    const s = db.one('SELECT username, global_name FROM users WHERE id=?', r.seller_id);
    const seller = s ? (s.global_name && String(s.global_name).trim() ? s.global_name : s.username || '?') : '?';
    out.push({ id: r.id, price: r.price, seller, player: hydrate.toJson(p) });
  }
  return { listings: out };
});

router.get('/api/market/limits/:ucid', (ctx) => {
  const u = ctx.requireUser();
  const uc = db.one('SELECT player_id FROM user_cards WHERE id=? AND user_id=?', Number(ctx.params.ucid), u.id);
  if (!uc) throw new HttpError(404, 'Carta nao encontrada');
  const pl = db.one('SELECT id, name, overall, owner_user_id, is_exclusive, exclusive_resale FROM players WHERE id=?', uc.player_id);
  if (!pl) throw new HttpError(404, 'Jogador nao encontrado');
  const noResale = !!pl.is_exclusive && !(pl.exclusive_resale == null ? true : !!pl.exclusive_resale);
  const self = pl.owner_user_id != null;
  const lim = pricing.marketLimits(Math.round(pl.overall));
  return {
    player: { id: pl.id, name: pl.name || '', overall: pl.overall }, sellable: !self && !noResale,
    reason: noResale ? 'exclusive' : (self ? 'self' : ''), value: lim[0], min: lim[1], max: lim[2],
  };
});

router.get('/api/market/mine', (ctx) => {
  const u = ctx.requireUser();
  const out = [];
  for (const r of db.q('SELECT * FROM market_listings WHERE seller_id=? ORDER BY id DESC LIMIT 200', u.id)) {
    const p = hydrate.player(r.player_id);
    if (p) out.push({ id: r.id, price: r.price, status: r.status || 'active', player: hydrate.toJson(p) });
  }
  return { listings: out };
});

router.post('/api/market', async (ctx) => {
  const u = ctx.requireUser();
  const b = (await ctx.json()) || {};
  const ucid = typeof b.user_card_id === 'number' ? Math.trunc(b.user_card_id) : 0;
  const price = typeof b.price === 'number' ? Math.trunc(b.price) : 0;
  if (ucid <= 0) throw new HttpError(400, 'Carta invalida');
  return { ok: true, id: shop.createListing(u.id, ucid, price) };
});

router.post('/api/market/:id/buy', (ctx) => ({ ok: true, coins: shop.buyListing(ctx.requireUser().id, Number(ctx.params.id)) }));
router.post('/api/market/:id/cancel', (ctx) => { shop.cancelListing(ctx.requireUser().id, Number(ctx.params.id)); return { ok: true }; });
