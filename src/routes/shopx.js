'use strict';
// Carta pessoal (selfcard) e Lojinha premium (Pix + anuncios).
const { router } = require('../http');
const db = require('../db');
const hydrate = require('../hydrate');
const selfcard = require('../selfcard');
const cashshop = require('../cashshop');
const settings = require('../settings');
const discord = require('../discord');
const uploads = require('../uploads');
const { HttpError, orEmpty } = require('../util');

// ---------------- Carta pessoal ----------------
router.get('/api/selfcard', (ctx) => {
  const u = ctx.requireUser();
  return { config: selfcard.config(), card: selfcard.view(u.id) || null };
});

router.post('/api/selfcard/claim', async (ctx) => {
  const u = ctx.requireUser();
  const b = (await ctx.json()) || {};
  return { ok: true, card: selfcard.claim(u.id, b.code, b.name, b.position) };
});

router.get('/api/selfcard/buy-info', (ctx) => {
  const u = ctx.requireUser();
  return {
    pix: selfcard.pixConfig(), has_card: !!selfcard.row(u.id),
    last_order: db.one('SELECT * FROM selfcard_orders WHERE user_id=? ORDER BY id DESC LIMIT 1', u.id) || null,
  };
});

router.post('/api/selfcard/order', async (ctx) => {
  const u = ctx.requireUser();
  const { fields, files } = await ctx.multipart();
  if (!selfcard.enabled()) throw new HttpError(400, 'A carta pessoal esta desativada no momento.');
  const proofUrl = files.proof ? uploads.saveProof(files.proof, String(u.id)) : null;
  const id = db.insert("INSERT INTO selfcard_orders (user_id, card_name, position, proof_url, status) VALUES (?,?,?,?,'pending')",
    u.id, fields.card_name ?? null, fields.position ?? null, proofUrl);
  const order = db.one('SELECT * FROM selfcard_orders WHERE id=?', id);
  discord.announceSelfcardOrder(order, u);
  return { ok: true, order };
});

// ---------------- Lojinha ----------------
router.get('/api/cashshop', (ctx) => {
  const u = ctx.requireUser();
  const products = db.q('SELECT * FROM cash_products WHERE active=1 ORDER BY sort ASC, id ASC').map((p) => {
    const o = {
      id: p.id, kind: orEmpty(p.kind), title: orEmpty(p.title), description: orEmpty(p.description), image: orEmpty(p.image),
      price: p.price, effective_price: cashshop.effectivePrice(p), on_promo: cashshop.onPromo(p), promo_label: orEmpty(p.promo_label),
      badge: orEmpty(p.badge), qty: p.qty == null ? 1 : p.qty, coins_amount: p.coins_amount || 0, promo_price: p.promo_price ?? null,
    };
    if (p.kind === 'card' && p.ref_id != null) {
      const pl = hydrate.player(p.ref_id);
      o.player = pl ? hydrate.toJson(pl) : null;
    } else if (p.kind === 'pack' && p.ref_id != null) {
      o.pack = db.one('SELECT id, name, art, card_count FROM packs WHERE id=?', p.ref_id) || null;
    }
    return o;
  });
  return {
    enabled: cashshop.enabled(),
    pix: { key: orEmpty(settings.get('cashshop_pix_key')), name: orEmpty(settings.get('cashshop_pix_name')), info: orEmpty(settings.get('cashshop_info')) },
    ad: {
      enabled: cashshop.adEnabled(), reward: cashshop.adReward(), cooldown: cashshop.adCooldown(), daily_limit: cashshop.adDailyLimit(),
      used_today: cashshop.adsToday(u.id), cooldown_left: cashshop.adCooldownLeft(u.id),
    },
    products,
    last_order: db.one('SELECT * FROM cash_orders WHERE user_id=? ORDER BY id DESC LIMIT 1', u.id) || null,
  };
});

router.post('/api/cashshop/order', async (ctx) => {
  const u = ctx.requireUser();
  const { fields, files } = await ctx.multipart();
  const pid = Number.parseInt(String(fields.product_id || '').trim(), 10);
  if (!Number.isFinite(pid)) throw new HttpError(400, 'Produto invalido');
  if (!files.proof) throw new HttpError(400, 'Anexe o comprovante do Pix');
  const proofUrl = uploads.saveProof(files.proof, 'cash-' + u.id);
  const id = cashshop.createOrder(u.id, pid, proofUrl);
  const order = db.one('SELECT * FROM cash_orders WHERE id=?', id);
  try { discord.announceCashOrder(order, u); } catch { /* ignore */ }
  return { ok: true, order };
});

router.post('/api/cashshop/ad', (ctx) => {
  const u = ctx.requireUser();
  const coins = cashshop.watchAd(u.id);
  return { ok: true, coins, reward: cashshop.adReward(), used_today: cashshop.adsToday(u.id), cooldown_left: cashshop.adCooldownLeft(u.id) };
});
