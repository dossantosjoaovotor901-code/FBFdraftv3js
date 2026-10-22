'use strict';
// Lojinha premium (dinheiro real via Pix) + recompensa por assistir anuncio (moedas gratis).
// A entrega NUNCA acontece sozinha: so o admin libera o pedido.
const db = require('./db');
const settings = require('./settings');
const economy = require('./economy');
const { HttpError, minusHours, parseSqlTime } = require('./util');

const enabled = () => settings.get('cashshop_enabled') === '1';
const adEnabled = () => settings.get('ad_enabled') === '1';

/** Preco efetivo (promocional quando houver), em centavos. */
function effectivePrice(p) {
  const promo = p.promo_price;
  if (promo != null && promo > 0 && promo < p.price) return Number(promo);
  return Number(p.price);
}
const onPromo = (p) => p.promo_price != null && p.promo_price > 0 && p.promo_price < p.price;

/** Cria um pedido de compra (pendente) com o comprovante do Pix. */
function createOrder(uid, productId, proofUrl) {
  if (!enabled()) throw new HttpError(400, 'A lojinha esta desativada no momento.');
  const p = db.one('SELECT * FROM cash_products WHERE id=? AND active=1', productId);
  if (!p) throw new HttpError(404, 'Produto nao esta mais disponivel.');
  const amount = effectivePrice(p);
  return db.insert("INSERT INTO cash_orders (user_id, product_id, title, amount, proof_url, status) VALUES (?,?,?,?,?, 'pending')",
    uid, productId, p.title || '', amount, proofUrl);
}

/** Entrega o item do produto ao usuario (dentro de uma transacao). */
function deliver(uid, prod) {
  const kind = prod.kind || '';
  if (kind === 'coins') {
    const coins = Number(prod.coins_amount || 0);
    if (coins > 0) economy.applyCoins(uid, coins, 'cashshop', 'Lojinha: ' + (prod.title || 'moedas'));
  } else if (kind === 'card') {
    if (prod.ref_id == null) throw new HttpError(400, 'Produto sem carta vinculada.');
    db.exec("INSERT INTO user_cards (user_id, player_id, source) VALUES (?,?, 'cashshop')", uid, prod.ref_id);
  } else if (kind === 'pack') {
    if (prod.ref_id == null) throw new HttpError(400, 'Produto sem pacote vinculado.');
    const qty = Math.max(1, Number(prod.qty || 1));
    for (let i = 0; i < qty; i++) {
      db.exec('INSERT INTO user_packs (user_id, pack_id, source, label) VALUES (?,?,?,?)', uid, prod.ref_id, 'cashshop', prod.title || 'Lojinha');
    }
  } else {
    throw new HttpError(400, 'Tipo de produto invalido.');
  }
}

/** Admin aprova o pedido e o item e entregue na hora. */
function approveOrder(adminId, orderId) {
  db.tx(() => {
    const o = db.one('SELECT * FROM cash_orders WHERE id=?', orderId);
    if (!o) throw new HttpError(404, 'Pedido nao encontrado.');
    if ((o.status || 'pending') !== 'pending') throw new HttpError(409, 'Este pedido ja foi decidido.');
    const prod = db.one('SELECT * FROM cash_products WHERE id=?', o.product_id);
    if (!prod) throw new HttpError(409, 'O produto deste pedido nao existe mais.');
    deliver(o.user_id, prod);
    db.exec("UPDATE cash_orders SET status='approved', decided_at=datetime('now','localtime'), decided_by=? WHERE id=?", adminId, orderId);
  });
  console.log(`[FBF] Pedido da lojinha #${orderId} aprovado pelo admin ${adminId}`);
}

function rejectOrder(adminId, orderId, note) {
  const upd = db.exec("UPDATE cash_orders SET status='rejected', admin_note=?, decided_at=datetime('now','localtime'), decided_by=? WHERE id=? AND status='pending'",
    note, adminId, orderId);
  if (upd === 0) throw new HttpError(409, 'Pedido nao encontrado ou ja decidido.');
}

// ---------------- Anuncio (moedas gratis) ----------------
const adReward = () => Math.max(0, settings.getInt('ad_reward'));
const adCooldown = () => Math.max(0, settings.getInt('ad_cooldown'));
const adDailyLimit = () => { const n = settings.getInt('ad_daily_limit'); return n < 0 ? 0 : n; };

/** Quantos anuncios o usuario ja viu nas ultimas 24h. */
const adsToday = (uid) => db.count('SELECT COUNT(*) FROM ad_views WHERE user_id=? AND created_at >= ?', uid, minusHours(24));

/** Segundos restantes ate poder ver outro anuncio (0 = liberado). */
function adCooldownLeft(uid) {
  const last = db.one('SELECT created_at FROM ad_views WHERE user_id=? ORDER BY id DESC LIMIT 1', uid);
  if (!last) return 0;
  const lastMs = parseSqlTime(last.created_at);
  if (!lastMs) return 0;
  const elapsed = Math.floor((Date.now() - lastMs) / 1000);
  return Math.max(0, adCooldown() - elapsed);
}

/** Credita a recompensa do anuncio respeitando cooldown e limite diario. Devolve o saldo novo. */
function watchAd(uid) {
  if (!adEnabled()) throw new HttpError(400, 'Os anuncios estao desativados no momento.');
  const reward = adReward();
  if (reward <= 0) throw new HttpError(400, 'Nenhuma recompensa configurada.');
  const limit = adDailyLimit();
  if (limit > 0 && adsToday(uid) >= limit) throw new HttpError(429, 'Voce ja atingiu o limite de anuncios de hoje. Volte amanha!');
  const left = adCooldownLeft(uid);
  if (left > 0) throw new HttpError(429, `Aguarde ${left}s para ver outro anuncio.`);
  return db.tx(() => {
    db.exec('INSERT INTO ad_views (user_id, reward) VALUES (?,?)', uid, reward);
    return economy.applyCoins(uid, reward, 'ad_reward', 'Recompensa por assistir anuncio');
  });
}

module.exports = { enabled, adEnabled, effectivePrice, onPromo, createOrder, approveOrder, rejectOrder, adReward, adCooldown, adDailyLimit, adsToday, adCooldownLeft, watchAd };
