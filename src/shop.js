'use strict';
// Loja da FBF: rotacao automatica de cartas vendidas pelo sistema (estoque, limite por jogador,
// ofertas fixas, eventos da loja) + mercado entre jogadores.
const db = require('./db');
const settings = require('./settings');
const pricing = require('./pricing');
const economy = require('./economy');
const hydrate = require('./hydrate');
const { HttpError, parseIso } = require('./util');

const MIN = 60_000;

const refreshMinutes = () => {
  const m = Number.parseInt(String(settings.get('shop_refresh_minutes')).trim(), 10);
  if (Number.isFinite(m) && m > 0) return m;
  return Math.max(1, settings.getInt('shop_refresh_days')) * 1440;
};

function humanInterval(min) {
  if (min % 1440 === 0) return (min / 1440) + (min === 1440 ? ' dia' : ' dias');
  if (min % 60 === 0) return (min / 60) + (min === 60 ? ' hora' : ' horas');
  return min + ' min';
}

function msSince(iso) {
  if (iso == null || String(iso).trim() === '') return Infinity;
  const t = parseIso(iso);
  return t ? Date.now() - t : Infinity;
}

function isStale() {
  const rotating = db.count("SELECT COUNT(*) FROM market_shop WHERE status='active' AND pinned=0");
  if (rotating === 0) return true;
  return msSince(settings.get('shop_last_refresh')) >= refreshMinutes() * MIN;
}

/** Nova rotacao: aposenta as ofertas nao fixas e sorteia novas. */
function regenerate() {
  const size = Math.max(1, settings.getInt('shop_size'));
  const cycle = settings.getInt('shop_cycle') + 1;
  const stock = settings.positiveInt('shop_default_stock');
  const limit = settings.positiveInt('shop_default_limit');
  db.tx(() => {
    db.exec("UPDATE market_shop SET status='retired' WHERE status='active' AND pinned=0");
    const pinned = new Set(db.q("SELECT player_id FROM market_shop WHERE status='active' AND pinned=1").map((r) => r.player_id));
    const pool = db.q('SELECT id, overall FROM players WHERE active=1 AND COALESCE(is_event,0)=0 '
      + 'AND COALESCE(is_exclusive,0)=0 AND COALESCE(owner_user_id,0)=0 ORDER BY RANDOM() LIMIT ?', size + pinned.size);
    let inserted = 0;
    for (const p of pool) {
      if (pinned.has(p.id)) continue;
      if (inserted >= size) break;
      db.exec("INSERT INTO market_shop (player_id, price, cycle, status, stock, sold, limit_per_user, pinned) VALUES (?,?,?,'active',?,0,?,0)",
        p.id, pricing.shopPrice(p.overall), cycle, stock, limit);
      inserted++;
    }
    settings.set('shop_cycle', cycle);
    settings.set('shop_last_refresh', new Date().toISOString());
  });
  console.log(`[FBF] Loja rotacionada (ciclo ${cycle}, ${size} ofertas)`);
}

function ensureFresh() {
  if (isStale()) { regenerate(); return true; }
  return false;
}

/** [proxima data ISO, ms restantes]. */
function nextRefresh() {
  const last = settings.get('shop_last_refresh');
  let base = last && String(last).trim() ? parseIso(last) : 0;
  if (!base) base = Date.now();
  const next = base + refreshMinutes() * MIN;
  return [new Date(next).toISOString(), Math.max(0, next - Date.now())];
}

// ---------------- Estoque ----------------
/** Unidades restantes (null = ilimitado; 0 = esgotado). */
function remainingOf(row) {
  if (row.stock == null) return null;
  return Math.max(0, Number(row.stock) - Number(row.sold || 0));
}

function boughtBy(kind, itemId, userId) {
  if (!userId || userId <= 0) return 0;
  return db.count('SELECT COALESCE(SUM(qty),0) FROM shop_purchases WHERE kind=? AND item_id=? AND user_id=?', kind, itemId, userId);
}

// ---------------- Eventos da loja ----------------
function eventIsLive(e) {
  if (!e || !e.active) return false;
  const now = Date.now();
  const s = e.starts_at, en = e.ends_at;
  if (s && String(s).trim() && parseIso(s) > now) return false;
  if (en && String(en).trim() && parseIso(en) <= now) return false;
  return true;
}

const liveEvents = () => db.q('SELECT * FROM shop_events ORDER BY id DESC').filter(eventIsLive);

function eventView(e, uid) {
  const items = [];
  for (const it of db.q('SELECT * FROM shop_event_items WHERE event_id=? ORDER BY price DESC, id ASC', e.id)) {
    const remaining = remainingOf(it);
    const limit = Number(it.limit_per_user || 0) > 0 ? Number(it.limit_per_user) : null;
    const mine = limit == null ? 0 : boughtBy('event', it.id, uid);
    const v = {
      id: it.id, kind: it.kind || '', price: it.price,
      unlimited: remaining == null, sold_out: remaining != null && remaining === 0,
      bought_by_me: mine, limit_reached: limit != null && mine >= limit,
      remaining, limit_per_user: limit,
    };
    if (it.kind === 'card') {
      const p = hydrate.player(it.ref_id);
      if (!p) continue;
      v.player = hydrate.toJson(p);
    } else {
      const pk = db.one('SELECT id, name, art, card_count FROM packs WHERE id=?', it.ref_id);
      if (!pk) continue;
      v.pack = pk;
    }
    items.push(v);
  }
  const ends = e.ends_at;
  const msLeft = (ends == null || String(ends).trim() === '') ? null : Math.max(0, parseIso(ends) - Date.now());
  return {
    id: e.id, name: e.name || '', description: e.description || '', emoji: e.emoji || '', accent: e.accent || '',
    starts_at: e.starts_at || '', ends_at: ends == null ? '' : ends, items, ms_left: msLeft,
  };
}

// ---------------- Compra ----------------
/** Claim de estoque + limite por jogador (dentro da transacao). */
function claimStock(table, row, kind, uid) {
  const limit = Number(row.limit_per_user || 0) > 0 ? Number(row.limit_per_user) : null;
  if (limit != null) {
    const mine = db.count('SELECT COALESCE(SUM(qty),0) n FROM shop_purchases WHERE kind=? AND item_id=? AND user_id=?', kind, row.id, uid);
    if (mine >= limit) throw new HttpError(400, 'Voce ja atingiu o limite de compra desta oferta');
  }
  const upd = db.exec(`UPDATE ${table} SET sold = sold + 1 WHERE id=? AND (stock IS NULL OR sold < stock)`, row.id);
  if (upd === 0) throw new HttpError(409, 'Esgotado! Alguem comprou a ultima unidade.');
  db.exec('INSERT INTO shop_purchases (kind, item_id, user_id, qty) VALUES (?,?,?,1)', kind, row.id, uid);
}

function assertOffer(table, id, expectedStatus) {
  const r = db.one(`SELECT * FROM ${table} WHERE id=?`, id);
  if (!r) throw new HttpError(409, 'Oferta nao esta mais disponivel');
  if (expectedStatus && r.status !== undefined && r.status !== expectedStatus) throw new HttpError(409, 'Oferta nao esta mais disponivel');
  return r;
}

const coinsOf = (uid) => Number(db.one('SELECT coins FROM users WHERE id=?', uid).coins);

/** Compra de uma oferta da Loja. Devolve o saldo novo. */
function buyShopOffer(uid, offerId) {
  return db.tx(() => {
    const r = assertOffer('market_shop', offerId, 'active');
    const p = db.one('SELECT * FROM players WHERE id=?', r.player_id);
    if (!p) throw new HttpError(409, 'Oferta nao esta mais disponivel');
    // Exclusivas: limite de copias conferido no servidor.
    if (p.is_exclusive) {
      const max = p.exclusive_max;
      if (max != null && max > 0) {
        const issued = db.count('SELECT COUNT(*) FROM user_cards WHERE player_id=?', p.id);
        if (issued >= max) throw new HttpError(409, 'Edicao limitada esgotada.');
      }
    }
    economy.applyCoins(uid, -r.price, 'market_buy', 'Compra na Loja FBF: ' + (p.name || ''));
    claimStock('market_shop', r, 'shop', uid);
    db.exec('INSERT INTO user_cards (user_id, player_id, source) VALUES (?,?,?)', uid, p.id, 'market');
    return coinsOf(uid);
  });
}

/** Compra de um item de evento da Loja (carta ou pacote). */
function buyEventItem(uid, itemId) {
  return db.tx(() => {
    const it = assertOffer('shop_event_items', itemId, null);
    const ev = db.one('SELECT * FROM shop_events WHERE id=?', it.event_id);
    const now = Date.now();
    if (!ev || !ev.active) throw new HttpError(409, 'Este evento nao esta mais no ar.');
    const en = ev.ends_at;
    if (en && String(en).trim() && parseIso(en) <= now) throw new HttpError(409, 'Este evento ja terminou.');
    economy.applyCoins(uid, -it.price, 'market_buy', 'Compra em evento da Loja');
    claimStock('shop_event_items', it, 'event', uid);
    if (it.kind === 'card') {
      db.exec('INSERT INTO user_cards (user_id, player_id, source) VALUES (?,?,?)', uid, it.ref_id, 'market');
    } else {
      db.exec('INSERT INTO user_packs (user_id, pack_id, source, label) VALUES (?,?,?,?)', uid, it.ref_id, 'shop', 'Evento da Loja');
    }
    return coinsOf(uid);
  });
}

// ---------------- Mercado entre jogadores ----------------
/** Cria um anuncio. O preco minimo/maximo vem da nota geral via Pricing.marketLimits. */
function createListing(uid, userCardId, price) {
  return db.tx(() => {
    const uc = db.one('SELECT * FROM user_cards WHERE id=? AND user_id=?', userCardId, uid);
    if (!uc) throw new HttpError(404, 'Carta nao encontrada na sua colecao');
    const p = db.one('SELECT * FROM players WHERE id=?', uc.player_id);
    if (!p) throw new HttpError(404, 'Jogador nao encontrado');
    if (p.owner_user_id != null) throw new HttpError(400, 'Esta e uma carta pessoal e nao pode ser vendida');
    const noResale = p.is_exclusive && !(p.exclusive_resale == null ? true : !!p.exclusive_resale);
    if (noResale) throw new HttpError(400, 'Esta carta exclusiva nao pode ser revendida');
    if (db.one("SELECT id FROM market_listings WHERE user_card_id=? AND status='active'", userCardId)) {
      throw new HttpError(409, 'Esta carta ja esta anunciada');
    }
    // Limpa anuncios antigos (vendidos/cancelados) para liberar o UNIQUE(user_card_id).
    db.exec("DELETE FROM market_listings WHERE user_card_id=? AND status<>'active'", userCardId);
    const lim = pricing.marketLimits(Math.round(p.overall));
    if (price < lim[1]) throw new HttpError(400, `Preco abaixo do minimo (${lim[1]} FBF)`);
    if (price > lim[2]) throw new HttpError(400, `Preco acima do maximo (${lim[2]} FBF)`);
    return db.insert("INSERT INTO market_listings (user_card_id, seller_id, player_id, price, status) VALUES (?,?,?,?, 'active')",
      userCardId, uid, p.id, price);
  });
}

/** Compra de uma carta anunciada por outro jogador: transfere a posse e paga o vendedor. */
function buyListing(buyerId, listingId) {
  return db.tx(() => {
    const l = db.one('SELECT * FROM market_listings WHERE id=?', listingId);
    if (!l || (l.status || 'active') !== 'active') throw new HttpError(409, 'Anuncio nao esta mais disponivel');
    const sellerId = l.seller_id;
    if (sellerId === buyerId) throw new HttpError(400, 'Voce nao pode comprar sua propria carta');
    const price = Number(l.price);
    const bu = db.one('SELECT coins FROM users WHERE id=?', buyerId);
    if (!bu || Number(bu.coins) < price) throw new HttpError(400, 'Saldo insuficiente');
    const claimed = db.exec("UPDATE market_listings SET status='sold', buyer_id=?, sold_at=datetime('now','localtime') WHERE id=? AND status='active'", buyerId, listingId);
    if (claimed === 0) throw new HttpError(409, 'Alguem acabou de comprar esta carta.');
    const uc = db.one('SELECT * FROM user_cards WHERE id=? AND user_id=?', l.user_card_id, sellerId);
    if (!uc) throw new HttpError(409, 'A carta nao esta mais disponivel');
    economy.applyCoins(buyerId, -price, 'market_buy', 'Compra no mercado entre jogadores');
    economy.applyCoins(sellerId, price, 'market_sell', 'Venda no mercado entre jogadores');
    db.exec("UPDATE user_cards SET user_id=?, source='market', acquired_at=datetime('now','localtime') WHERE id=?", buyerId, l.user_card_id);
    return coinsOf(buyerId);
  });
}

/** Cancela um anuncio proprio ainda ativo; a carta continua com o vendedor. */
function cancelListing(uid, listingId) {
  db.tx(() => {
    const l = db.one('SELECT * FROM market_listings WHERE id=?', listingId);
    if (!l) throw new HttpError(404, 'Anuncio nao encontrado');
    if (l.seller_id !== uid) throw new HttpError(403, 'Este anuncio nao e seu');
    if ((l.status || 'active') !== 'active') throw new HttpError(409, 'Anuncio nao esta ativo');
    db.exec("UPDATE market_listings SET status='cancelled' WHERE id=?", listingId);
  });
}

module.exports = {
  refreshMinutes, humanInterval, isStale, regenerate, ensureFresh, nextRefresh, remainingOf, boughtBy,
  eventIsLive, liveEvents, eventView, buyShopOffer, buyEventItem, createListing, buyListing, cancelListing,
};
