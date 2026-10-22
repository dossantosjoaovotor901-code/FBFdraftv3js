'use strict';
// Painel de administracao (/api/admin/*). Todas as rotas exigem admin logado.
const { router } = require('../http');
const db = require('../db');
const settings = require('../settings');
const economy = require('../economy');
const shop = require('../shop');
const pricing = require('../pricing');
const cashshop = require('../cashshop');
const uploads = require('../uploads');
const hydrate = require('../hydrate');
const { HttpError, bStr, bInt, bBool, has, intOrNull, longOrNull, orEmpty } = require('../util');

const A = '/api/admin';
/** Registra uma rota admin: exige admin, passa (ctx, admin). */
function route(method, path, fn) {
  router[method](A + path, (ctx) => fn(ctx, ctx.requireAdmin()));
}
const logA = (admin, action, details) => economy.logAdmin(admin.id, action, details);
const okId = (id) => ({ ok: true, id });
const OK = { ok: true };
const flagOf = (v) => (v === true || (typeof v === 'number' && v !== 0) ? 1 : 0);
/** 1/0 se a chave veio no corpo; null se ausente (para COALESCE). */
const flag = (b, k) => (has(b, k) && b[k] != null ? flagOf(b[k]) : null);
const body = async (ctx) => {
  const b = await ctx.json();
  return b && typeof b === 'object' ? b : {};
};
/** UPDATE tabela SET col=COALESCE(?,col)... WHERE id=? (ausente/null mantem o valor). */
function coalesce(table, id, pairs) {
  db.exec(`UPDATE ${table} SET ${pairs.map(([c]) => `${c}=COALESCE(?,${c})`).join(', ')} WHERE id=?`, ...pairs.map(([, v]) => v), id);
}

// ---------------- Upload ----------------
router.post(A + '/upload', async (ctx) => {
  ctx.requireAdmin();
  const { files } = await ctx.multipart();
  if (!files.image) throw new HttpError(400, 'Nenhum arquivo enviado');
  return { url: uploads.saveImage(files.image) };
});

// ---------------- Dashboard ----------------
route('get', '/stats', () => ({
  users: db.count('SELECT COUNT(*) FROM users'), players: db.count('SELECT COUNT(*) FROM players'),
  cards: db.count('SELECT COUNT(*) FROM user_cards'), packs_opened: db.count('SELECT COUNT(*) FROM pack_openings'),
  market_active: db.count("SELECT COUNT(*) FROM market_listings WHERE status='active'"),
  shop_active: db.count("SELECT COUNT(*) FROM market_shop WHERE status='active'"),
  matches: db.count('SELECT COUNT(*) FROM matches'), coins_total: db.count('SELECT COALESCE(SUM(coins),0) FROM users'),
}));

// ---------------- Raridades ----------------
route('get', '/rarities', () => ({ rarities: db.q('SELECT * FROM rarities ORDER BY rank ASC') }));
route('post', '/rarities', async (ctx, adm) => {
  const b = await body(ctx);
  const id = db.insert('INSERT INTO rarities (name, rank, active) VALUES (?,?,?)', bStr(b, 'name', 'Nova'), bInt(b, 'rank', 0), bBool(b, 'active', true) ? 1 : 0);
  logA(adm, 'rarity.create', 'id=' + id);
  hydrate.clearRefCache();
  return okId(id);
});
route('put', '/rarities/:id', async (ctx, adm) => {
  const b = await body(ctx), id = Number(ctx.params.id);
  coalesce('rarities', id, [['name', bStr(b, 'name')], ['rank', intOrNull(b, 'rank')], ['active', flag(b, 'active')]]);
  logA(adm, 'rarity.update', 'id=' + id);
  hydrate.clearRefCache();
  return okId(id);
});
route('del', '/rarities/:id', (ctx, adm) => {
  const id = Number(ctx.params.id);
  db.exec('DELETE FROM rarities WHERE id=?', id);
  logA(adm, 'rarity.delete', 'id=' + id);
  hydrate.clearRefCache();
  return okId(id);
});

// ---------------- Modelos de carta ----------------
const MODEL_TEXT = ['bg_from', 'bg_to', 'border_color', 'text_color', 'effect', 'logo', 'pattern', 'layout', 'accent_color', 'name_bg', 'shine_color'];
route('get', '/models', () => ({ models: db.q('SELECT * FROM card_models ORDER BY id ASC') }));
route('post', '/models', async (ctx, adm) => {
  const b = await body(ctx);
  const id = db.insert('INSERT INTO card_models (name, rarity_id, bg_from, bg_to, border_color, text_color, effect, logo, pattern, layout, accent_color, '
    + 'name_bg, shine_color, bg_anim, bg_anim_color, bg_anim_speed, bg_image, active) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
  bStr(b, 'name', 'Modelo'), longOrNull(b, 'rarity_id'), ...MODEL_TEXT.map((k) => bStr(b, k)),
  bStr(b, 'bg_anim', 'none'), bStr(b, 'bg_anim_color'), bInt(b, 'bg_anim_speed', 2), bStr(b, 'bg_image'), bBool(b, 'active', true) ? 1 : 0);
  logA(adm, 'model.create', 'id=' + id);
  hydrate.clearRefCache();
  return okId(id);
});
route('put', '/models/:id', async (ctx, adm) => {
  const b = await body(ctx), id = Number(ctx.params.id);
  coalesce('card_models', id, [
    ['name', bStr(b, 'name')], ['rarity_id', longOrNull(b, 'rarity_id')], ...MODEL_TEXT.map((k) => [k, bStr(b, k)]),
    ['bg_anim', bStr(b, 'bg_anim')], ['bg_anim_color', bStr(b, 'bg_anim_color')], ['bg_anim_speed', intOrNull(b, 'bg_anim_speed')],
    ['bg_image', bStr(b, 'bg_image')], ['active', flag(b, 'active')],
  ]);
  logA(adm, 'model.update', 'id=' + id);
  hydrate.clearRefCache();
  return okId(id);
});
route('del', '/models/:id', (ctx, adm) => {
  const id = Number(ctx.params.id);
  db.tx(() => { db.exec('UPDATE players SET model_id=NULL WHERE model_id=?', id); db.exec('DELETE FROM card_models WHERE id=?', id); });
  logA(adm, 'model.delete', 'id=' + id);
  hydrate.clearRefCache();
  return okId(id);
});

// ---------------- Times ----------------
const TEAM_TEXT = ['short_name', 'crest', 'country', 'league', 'color_primary', 'color_secondary'];
route('get', '/teams', () => ({ teams: db.q('SELECT * FROM teams ORDER BY name ASC') }));
route('post', '/teams', async (ctx, adm) => {
  const b = await body(ctx);
  const id = db.insert('INSERT INTO teams (name, short_name, crest, country, league, color_primary, color_secondary, kit_style, kit_text_color, active) VALUES (?,?,?,?,?,?,?,?,?,1)',
    bStr(b, 'name', 'Time'), ...TEAM_TEXT.map((k) => bStr(b, k)), bStr(b, 'kit_style', 'vertical'), bStr(b, 'kit_text_color', '#ffffff'));
  logA(adm, 'team.create', 'id=' + id);
  hydrate.clearRefCache();
  return okId(id);
});
route('put', '/teams/:id', async (ctx, adm) => {
  const b = await body(ctx), id = Number(ctx.params.id);
  coalesce('teams', id, [['name', bStr(b, 'name')], ...TEAM_TEXT.map((k) => [k, bStr(b, k)]),
    ['kit_style', bStr(b, 'kit_style')], ['kit_text_color', bStr(b, 'kit_text_color')], ['active', flag(b, 'active')]]);
  logA(adm, 'team.update', 'id=' + id);
  hydrate.clearRefCache();
  return okId(id);
});
route('del', '/teams/:id', (ctx, adm) => {
  const id = Number(ctx.params.id);
  db.tx(() => { db.exec('UPDATE players SET team_id=NULL WHERE team_id=?', id); db.exec('DELETE FROM teams WHERE id=?', id); });
  logA(adm, 'team.delete', 'id=' + id);
  hydrate.clearRefCache();
  return okId(id);
});

// ---------------- Jogadores ----------------
const P_TEXT = new Set(['name', 'photo', 'position', 'positions', 'country', 'avatar_mode', 'avatar_style', 'avatar_text', 'card_type', 'description']);
const P_LONG = new Set(['team_id', 'rarity_id', 'model_id']);
const P_INT = new Set(['overall', 'fin', 'pas', 'ctl', 'skl', 'def', 'jdc', 'gk_div', 'gk_han', 'gk_kic', 'gk_ref', 'gk_spd', 'gk_pos', 'exclusive_max', 'exclusive_price']);
const P_BOOL = new Set(['is_gk', 'is_exclusive', 'exclusive_resale', 'active']);
const P_REQUIRED = new Set(['name', 'position', 'overall']);

function insertPlayer(b) {
  return db.insert('INSERT INTO players (name, photo, overall, position, positions, country, team_id, rarity_id, model_id, is_gk, fin, pas, ctl, skl, def, jdc, '
    + 'gk_div, gk_han, gk_kic, gk_ref, gk_spd, gk_pos, active, owner_user_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,NULL)',
  bStr(b, 'name', 'Jogador'), bStr(b, 'photo'), bInt(b, 'overall', 50), bStr(b, 'position', 'CM'), bStr(b, 'positions', ''), bStr(b, 'country'),
  longOrNull(b, 'team_id'), longOrNull(b, 'rarity_id'), longOrNull(b, 'model_id'), bBool(b, 'is_gk', false) ? 1 : 0,
  bInt(b, 'fin'), bInt(b, 'pas'), bInt(b, 'ctl'), bInt(b, 'skl'), bInt(b, 'def'), bInt(b, 'jdc'),
  bInt(b, 'gk_div'), bInt(b, 'gk_han'), bInt(b, 'gk_kic'), bInt(b, 'gk_ref'), bInt(b, 'gk_spd'), bInt(b, 'gk_pos'));
}

/** Grava exatamente os campos enviados: null/"" LIMPA o campo. Campos ausentes ficam como estao. */
function applyPlayerFields(id, b) {
  const sets = [], vals = [];
  for (const k of Object.keys(b)) {
    let val;
    const isNull = b[k] == null;
    if (P_TEXT.has(k)) { let t = isNull || typeof b[k] !== 'string' ? null : b[k]; if (t != null && t.trim() === '') t = null; val = t; }
    else if (P_LONG.has(k)) val = longOrNull(b, k);
    else if (P_INT.has(k)) val = intOrNull(b, k);
    else if (P_BOOL.has(k)) { if (isNull) continue; val = flagOf(b[k]); }
    else continue;
    if (val == null && P_REQUIRED.has(k)) continue;
    sets.push(`${k}=?`); vals.push(val);
  }
  if (!sets.length) return false;
  db.exec(`UPDATE players SET ${sets.join(', ')} WHERE id=?`, ...vals, id);
  hydrate.clearRefCache();
  return true;
}

route('post', '/players', async (ctx, adm) => {
  const b = await body(ctx);
  const id = db.tx(() => { const i = insertPlayer(b); applyPlayerFields(i, b); return i; });
  hydrate.clearRefCache();
  logA(adm, 'player.create', 'id=' + id);
  return okId(id);
});

route('put', '/players/:id', async (ctx, adm) => {
  const b = await body(ctx), id = Number(ctx.params.id);
  if (!db.exists('SELECT id FROM players WHERE id=?', id)) throw new HttpError(404, 'Carta nao encontrada');
  if (!applyPlayerFields(id, b)) throw new HttpError(400, 'Nada para salvar');
  logA(adm, 'player.update', 'id=' + id);
  return okId(id);
});

route('del', '/players/:id', (ctx, adm) => {
  const id = Number(ctx.params.id);
  db.exec('UPDATE players SET active=0 WHERE id=?', id);
  hydrate.clearRefCache();
  logA(adm, 'player.delete', 'id=' + id);
  return okId(id);
});

// Geracao em lote: cola varios blocos (NICK / POSICAO / FIN / PAS / CTL / SKL / DEF / JDC / OVER).
const cleanNick = (s) => s.replace(/^(nick|jogador|player)\s*:\s*/i, '').trim().replace(/\s*\([^)]*\)\s*$/, '').trim();
const numIn = (s) => { const m = /(\d+)/.exec(s); return m ? parseInt(m[1], 10) : 0; };
const slugify = (name) => (name.normalize('NFKD').replace(/\p{M}/gu, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'player');

route('post', '/players/bulk', async (ctx, adm) => {
  const b = await body(ctx);
  const ls = String(bStr(b, 'text', '')).split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  let created = 0;
  const errors = [];
  db.tx(() => {
    for (let i = 0; i < ls.length; i++) {
      if (!/^FIN\s*:.*/i.test(ls[i])) continue;
      if (i < 2) { errors.push(`Falta NICK/POSICAO antes de '${ls[i]}'`); continue; }
      const posLine = ls[i - 1], nameLine = ls[i - 2];
      if (!posLine.toUpperCase().includes('POSI')) { errors.push(`Posicao ausente antes de '${ls[i]}'`); continue; }
      if (i + 6 >= ls.length) { errors.push(`Bloco incompleto em '${nameLine}' (faltam atributos/OVER)`); continue; }
      const name = cleanNick(nameLine);
      if (!name) { errors.push(`Nome vazio perto de '${ls[i]}'`); continue; }
      const posVal = (posLine.includes(':') ? posLine.slice(posLine.indexOf(':') + 1) : posLine).toLowerCase().replace(/[^a-z]/g, '');
      let position = 'CM', positions = 'CM';
      if (posVal.startsWith('gk')) { position = 'GK'; positions = 'GK'; }
      else if (posVal.startsWith('pv')) { position = 'ST'; positions = 'ST'; }
      else if (posVal.startsWith('vl')) { position = 'CM'; positions = 'CM'; }
      else if (posVal.startsWith('todas')) { position = 'CM'; positions = 'GK,CM,ST'; }
      const [fin, pas, ctl, skl, dfn, jdc] = [0, 1, 2, 3, 4, 5].map((o) => numIn(ls[i + o]));
      let over = numIn(ls[i + 6]);
      if (over <= 0) over = Math.round((fin + pas + ctl + skl + dfn + jdc) / 6);
      let rar, mdl;   // raridade/modelo pelo OVER (mesma legenda do jogo)
      if (over >= 90) { rar = 96; mdl = 99; } else if (over >= 85) { rar = 95; mdl = 98; } else if (over >= 80) { rar = 94; mdl = 97; }
      else if (over >= 70) { rar = 92; mdl = 95; } else { rar = 91; mdl = 94; }
      // Se a raridade/modelo "magicos" nao existem neste banco, deixa em branco em vez de quebrar a FK.
      if (!db.exists('SELECT 1 FROM rarities WHERE id=?', rar)) rar = null;
      if (!db.exists('SELECT 1 FROM card_models WHERE id=?', mdl)) mdl = null;
      db.insert("INSERT INTO players (name, overall, position, positions, rarity_id, model_id, is_gk, fin, pas, ctl, skl, def, jdc, group_id, card_type, active) VALUES (?,?,?,?,?,?,0,?,?,?,?,?,?,?,'Base',1)",
        name, over, position, positions, rar, mdl, fin, pas, ctl, skl, dfn, jdc, slugify(name));
      created++;
    }
  });
  hydrate.clearRefCache();
  logA(adm, 'player.bulk', 'created=' + created);
  return { ok: true, created, errors: errors.join(' | ') };
});

// Apaga TODAS as cartas (reset). A UI pede confirmacao antes.
route('post', '/players/wipe', (ctx, adm) => {
  let removed = 0;
  try { removed = db.count('SELECT COUNT(*) FROM players'); } catch { /* ignore */ }
  for (const s of ['DELETE FROM user_cards', 'DELETE FROM market_listings', 'DELETE FROM pack_openings', 'DELETE FROM self_cards',
    'DELETE FROM market_shop', 'DELETE FROM shop_purchases', 'DELETE FROM draft_sessions', 'DELETE FROM players']) {
    try { db.exec(s); } catch (e) { console.warn(`[FBF] wipe: ${s} -> ${e.message}`); }
  }
  hydrate.clearRefCache();
  logA(adm, 'player.wipe', 'removed=' + removed);
  return { ok: true, removed };
});

// ---------------- Pacotes ----------------
const PACK_TEXT = ['art', 'rarity_odds', 'eligible_players', 'available_from', 'available_to', 'color_from', 'color_to', 'color_accent', 'tag'];
route('get', '/packs', () => ({ packs: db.q('SELECT * FROM packs ORDER BY price ASC') }));
route('post', '/packs', async (ctx, adm) => {
  const b = await body(ctx);
  const id = db.insert('INSERT INTO packs (name, art, price, card_count, rarity_odds, eligible_players, available_from, available_to, is_event, color_from, color_to, '
    + 'color_accent, tag, guaranteed_rarity_id, guaranteed_count, allow_dupes, min_overall, max_overall, active) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
  bStr(b, 'name', 'Pacote'), bStr(b, 'art'), bInt(b, 'price'), bInt(b, 'card_count', 1), bStr(b, 'rarity_odds', '{}'), bStr(b, 'eligible_players'),
  bStr(b, 'available_from'), bStr(b, 'available_to'), bBool(b, 'is_event') ? 1 : 0, bStr(b, 'color_from'), bStr(b, 'color_to'), bStr(b, 'color_accent'),
  bStr(b, 'tag'), longOrNull(b, 'guaranteed_rarity_id'), bInt(b, 'guaranteed_count'), bBool(b, 'allow_dupes', true) ? 1 : 0,
  bInt(b, 'min_overall'), bInt(b, 'max_overall'), bBool(b, 'active', true) ? 1 : 0);
  logA(adm, 'pack.create', 'id=' + id);
  return okId(id);
});
route('put', '/packs/:id', async (ctx, adm) => {
  const b = await body(ctx), id = Number(ctx.params.id);
  coalesce('packs', id, [
    ['name', bStr(b, 'name')], ['art', bStr(b, 'art')], ['price', intOrNull(b, 'price')], ['card_count', intOrNull(b, 'card_count')],
    ['rarity_odds', bStr(b, 'rarity_odds')], ['eligible_players', bStr(b, 'eligible_players')], ['available_from', bStr(b, 'available_from')],
    ['available_to', bStr(b, 'available_to')], ['is_event', flag(b, 'is_event')], ['color_from', bStr(b, 'color_from')], ['color_to', bStr(b, 'color_to')],
    ['color_accent', bStr(b, 'color_accent')], ['tag', bStr(b, 'tag')], ['guaranteed_rarity_id', longOrNull(b, 'guaranteed_rarity_id')],
    ['guaranteed_count', intOrNull(b, 'guaranteed_count')], ['allow_dupes', flag(b, 'allow_dupes')], ['min_overall', intOrNull(b, 'min_overall')],
    ['max_overall', intOrNull(b, 'max_overall')], ['active', flag(b, 'active')],
  ]);
  logA(adm, 'pack.update', 'id=' + id);
  return okId(id);
});
route('del', '/packs/:id', (ctx, adm) => {
  const id = Number(ctx.params.id);
  db.exec('UPDATE packs SET active=0 WHERE id=?', id);
  logA(adm, 'pack.delete', 'id=' + id);
  return okId(id);
});
// Apaga o pacote de vez (e referencias, para nao sobrar ponteiro quebrado).
route('del', '/packs/:id/purge', (ctx, adm) => {
  const id = Number(ctx.params.id);
  db.tx(() => {
    db.exec('DELETE FROM pack_openings WHERE pack_id=?', id);
    db.exec("UPDATE cash_products SET active=0 WHERE kind='pack' AND ref_id=?", id);
    db.exec('UPDATE draft_reward_config SET pack_id=NULL WHERE pack_id=?', id);
    db.exec('DELETE FROM user_packs WHERE pack_id=?', id);
    db.exec('DELETE FROM packs WHERE id=?', id);
  });
  logA(adm, 'pack.purge', 'id=' + id);
  return okId(id);
});

// ---------------- Usuarios / cartas ----------------
route('get', '/users', () => ({
  users: db.q('SELECT u.id, u.discord_id, u.username, u.global_name, u.coins, u.is_admin, (SELECT COUNT(*) FROM user_cards c WHERE c.user_id=u.id) cards FROM users u ORDER BY u.id ASC')
    .map((r) => ({ id: r.id, discord_id: orEmpty(r.discord_id), username: orEmpty(r.username), global_name: orEmpty(r.global_name), coins: r.coins, is_admin: !!r.is_admin, cards: r.cards })),
}));
route('post', '/users/:id/coins', async (ctx, adm) => {
  const b = await body(ctx), id = Number(ctx.params.id);
  if (typeof b.amount !== 'number') throw new HttpError(400, 'Informe a quantidade');
  const amount = Math.trunc(b.amount);
  const coins = economy.applyCoins(id, amount, 'admin_adjust', bStr(b, 'reason', 'Ajuste do admin'));
  logA(adm, 'coins.adjust', `user=${id} amount=${amount}`);
  return { ok: true, coins };
});
route('post', '/users/:id/admin', async (ctx, adm) => {
  const b = await body(ctx), id = Number(ctx.params.id);
  db.exec('UPDATE users SET is_admin=? WHERE id=?', bBool(b, 'admin', true) ? 1 : 0, id);
  logA(adm, 'user.admin', 'user=' + id);
  return okId(id);
});
route('get', '/users/:id/cards', (ctx) => ({
  cards: db.q('SELECT uc.id user_card_id, uc.acquired_at, uc.source, p.* FROM user_cards uc JOIN players p ON p.id=uc.player_id WHERE uc.user_id=? ORDER BY uc.id DESC', Number(ctx.params.id)),
}));
route('post', '/users/:id/cards', async (ctx, adm) => {
  const b = await body(ctx), id = Number(ctx.params.id);
  const granted = db.tx(() => {
    const out = [];
    for (const v of Array.isArray(b.player_ids) ? b.player_ids : []) {
      const pid = Math.trunc(Number(v));
      if (!Number.isFinite(pid) || !db.exists('SELECT 1 FROM players WHERE id=?', pid)) throw new HttpError(400, 'Jogador invalido: ' + v);
      out.push({ user_card_id: db.insert("INSERT INTO user_cards (user_id, player_id, source) VALUES (?,?,'admin')", id, pid), player_id: pid });
    }
    return out;
  });
  logA(adm, 'cards.grant', 'user=' + id);
  return { ok: true, granted };
});
route('del', '/users/:id/cards/:cardId', (ctx, adm) => {
  const id = Number(ctx.params.id), cardId = Number(ctx.params.cardId);
  db.exec('DELETE FROM user_cards WHERE id=? AND user_id=?', cardId, id);
  logA(adm, 'cards.revoke', `user=${id} card=${cardId}`);
  return okId(cardId);
});
route('get', '/transactions', () => ({ transactions: db.q('SELECT t.*, u.username FROM transactions t JOIN users u ON u.id=t.user_id ORDER BY t.id DESC LIMIT 200') }));
route('get', '/logs', () => ({ logs: db.q('SELECT l.*, u.username FROM admin_logs l JOIN users u ON u.id=l.admin_id ORDER BY l.id DESC LIMIT 200') }));

// ---------------- Loja (rotacao, ofertas, eventos) ----------------
route('get', '/shop', () => {
  const offers = db.q("SELECT * FROM market_shop WHERE status='active' ORDER BY pinned DESC, id ASC").map((r) => ({
    id: r.id, price: r.price, pinned: !!r.pinned, sold: r.sold,
    player: db.one('SELECT id, name, overall, photo FROM players WHERE id=?', r.player_id) || {},
    stock: r.stock ?? null, remaining: shop.remainingOf(r) ?? null, limit_per_user: Number(r.limit_per_user || 0) > 0 ? r.limit_per_user : null,
  }));
  return {
    offers, events: db.q('SELECT * FROM shop_events ORDER BY id DESC'), cycle: settings.getInt('shop_cycle'),
    refresh_minutes: shop.refreshMinutes(), refresh_label: shop.humanInterval(shop.refreshMinutes()), last_refresh: orEmpty(settings.get('shop_last_refresh')),
    config: {
      size: settings.getInt('shop_size'), refresh_days: settings.getInt('shop_refresh_days'), markup_pct: settings.getFloat('shop_markup_pct'),
      default_stock: orEmpty(settings.get('shop_default_stock')), default_limit: orEmpty(settings.get('shop_default_limit')),
    },
  };
});
route('put', '/shop/config', async (ctx, adm) => {
  const b = await body(ctx);
  for (const [k, key] of [['size', 'shop_size'], ['refresh_days', 'shop_refresh_days'], ['markup_pct', 'shop_markup_pct'], ['default_stock', 'shop_default_stock'],
    ['default_limit', 'shop_default_limit'], ['rules', 'market_rules'], ['min_price', 'market_min_price'], ['max_price', 'market_max_price']]) {
    if (has(b, k) && b[k] != null) settings.set(key, b[k]);
  }
  logA(adm, 'shop.config', 'ok');
  return OK;
});
route('post', '/shop/refresh', (ctx, adm) => { shop.regenerate(); logA(adm, 'shop.refresh', 'ok'); return OK; });
route('post', '/shop/offers', async (ctx, adm) => {
  const b = await body(ctx);
  const pid = Math.trunc(Number(b.player_id));
  if (!Number.isFinite(pid)) throw new HttpError(400, 'Jogador invalido');
  const p = db.one('SELECT overall FROM players WHERE id=?', pid);
  if (!p) throw new HttpError(404, 'Jogador nao encontrado');
  const price = typeof b.price === 'number' ? Math.trunc(b.price) : pricing.shopPrice(Math.round(p.overall));
  const id = db.insert("INSERT INTO market_shop (player_id, price, cycle, status, stock, sold, limit_per_user, pinned) VALUES (?,?,?,'active',?,0,?,?)",
    pid, price, settings.getInt('shop_cycle'), intOrNull(b, 'stock'), intOrNull(b, 'limit_per_user'), bBool(b, 'pinned') ? 1 : 0);
  logA(adm, 'shop.offer.add', 'id=' + id);
  return okId(id);
});
route('put', '/shop/offers/:id', async (ctx, adm) => {
  const b = await body(ctx), id = Number(ctx.params.id);
  coalesce('market_shop', id, [['price', longOrNull(b, 'price')], ['stock', intOrNull(b, 'stock')], ['limit_per_user', intOrNull(b, 'limit_per_user')],
    ['pinned', flag(b, 'pinned')], ['status', bStr(b, 'status')]]);
  logA(adm, 'shop.offer.update', 'id=' + id);
  return okId(id);
});
route('del', '/shop/offers/:id', (ctx, adm) => {
  const id = Number(ctx.params.id);
  db.exec("UPDATE market_shop SET status='retired' WHERE id=?", id);
  logA(adm, 'shop.offer.delete', 'id=' + id);
  return okId(id);
});

// ---------------- Eventos do site ----------------
const EV_TEXT = ['description', 'emoji', 'bg_effect', 'theme_primary', 'theme_dark', 'theme_light', 'page_bg', 'banner_text', 'banner_bg', 'banner_color', 'pack_ids', 'card_ids', 'starts_at', 'ends_at'];
route('get', '/events', () => ({ events: db.q('SELECT * FROM events ORDER BY id DESC') }));
route('post', '/events', async (ctx, adm) => {
  const b = await body(ctx);
  const id = db.insert(`INSERT INTO events (name, ${EV_TEXT.join(', ')}, active) VALUES (?,${EV_TEXT.map(() => '?').join(',')},?)`,
    bStr(b, 'name', 'Evento'), ...EV_TEXT.map((k) => bStr(b, k, k === 'bg_effect' ? 'none' : null)), bBool(b, 'active') ? 1 : 0);
  logA(adm, 'event.create', 'id=' + id);
  return okId(id);
});
route('put', '/events/:id', async (ctx, adm) => {
  const b = await body(ctx), id = Number(ctx.params.id);
  coalesce('events', id, [['name', bStr(b, 'name')], ...EV_TEXT.map((k) => [k, bStr(b, k)]), ['active', flag(b, 'active')]]);
  logA(adm, 'event.update', 'id=' + id);
  return okId(id);
});
route('del', '/events/:id', (ctx, adm) => {
  const id = Number(ctx.params.id);
  db.exec('DELETE FROM events WHERE id=?', id);
  logA(adm, 'event.delete', 'id=' + id);
  return okId(id);
});

// ---------------- Bots ----------------
route('get', '/bots', () => ({
  bots: db.q('SELECT * FROM bot_teams ORDER BY sort ASC'),
  config: { cooldown: settings.getInt('bot_match_cooldown'), daily_limit: settings.getInt('bot_match_daily_limit') },
}));
route('put', '/bots/config', async (ctx, adm) => {
  const b = await body(ctx);
  if (has(b, 'cooldown') && b.cooldown != null) settings.set('bot_match_cooldown', Math.trunc(Number(b.cooldown)));
  if (has(b, 'daily_limit') && b.daily_limit != null) settings.set('bot_match_daily_limit', Math.trunc(Number(b.daily_limit)));
  logA(adm, 'bots.config', 'ok');
  return OK;
});
route('post', '/bots', async (ctx, adm) => {
  const b = await body(ctx);
  const id = db.insert('INSERT INTO bot_teams (key, name, crest, strength, attack, defense, gk, chemistry, reward, active, sort, team_id, card_ids) VALUES (?,?,?,?,?,?,?,?,?,1,?,?,?)',
    bStr(b, 'key', 'bot' + Date.now()), bStr(b, 'name', 'Bot'), bStr(b, 'crest', '\u{1F916}'), bInt(b, 'strength', 70),
    intOrNull(b, 'attack'), intOrNull(b, 'defense'), intOrNull(b, 'gk'), bInt(b, 'chemistry', 40), bInt(b, 'reward', 100), bInt(b, 'sort', 9),
    longOrNull(b, 'team_id'), bStr(b, 'card_ids'));
  logA(adm, 'bot.create', 'id=' + id);
  return okId(id);
});
route('put', '/bots/:id', async (ctx, adm) => {
  const b = await body(ctx), id = Number(ctx.params.id);
  coalesce('bot_teams', id, [['name', bStr(b, 'name')], ['crest', bStr(b, 'crest')], ['strength', intOrNull(b, 'strength')], ['attack', intOrNull(b, 'attack')],
    ['defense', intOrNull(b, 'defense')], ['gk', intOrNull(b, 'gk')], ['chemistry', intOrNull(b, 'chemistry')], ['reward', intOrNull(b, 'reward')],
    ['active', flag(b, 'active')], ['sort', intOrNull(b, 'sort')], ['team_id', longOrNull(b, 'team_id')], ['card_ids', bStr(b, 'card_ids')]]);
  logA(adm, 'bot.update', 'id=' + id);
  return okId(id);
});
route('del', '/bots/:id', (ctx, adm) => {
  const id = Number(ctx.params.id);
  db.exec('DELETE FROM bot_teams WHERE id=?', id);
  logA(adm, 'bot.delete', 'id=' + id);
  return okId(id);
});

// ---------------- Manutencao ----------------
route('get', '/maintenance', () => ({
  on: settings.get('maintenance_on') === '1', message: orEmpty(settings.get('maintenance_message')), until: orEmpty(settings.get('maintenance_until')),
}));
route('put', '/maintenance', async (ctx, adm) => {
  const b = await body(ctx);
  if (has(b, 'on')) settings.set('maintenance_on', flagOf(b.on) ? '1' : '0');
  if (has(b, 'message')) settings.set('maintenance_message', b.message == null ? '' : String(b.message));
  if (has(b, 'until')) settings.set('maintenance_until', b.until == null ? '' : String(b.until));
  logA(adm, 'maintenance.set', 'ok');
  return OK;
});

// ---------------- Recompensas do Draft Aleatorio ----------------
route('get', '/draft-rewards', () => ({ levels: db.q('SELECT * FROM draft_reward_config ORDER BY level ASC') }));
route('put', '/draft-rewards', async (ctx, adm) => {
  const arr = await ctx.json();
  if (!Array.isArray(arr)) throw new HttpError(400, 'Dados invalidos');
  db.tx(() => {
    for (const b of arr) {
      if (!b || typeof b !== 'object') continue;
      db.exec('UPDATE draft_reward_config SET name=COALESCE(?,name), strength=COALESCE(?,strength), coins=COALESCE(?,coins), pack_label=COALESCE(?,pack_label) WHERE level=?',
        bStr(b, 'name'), intOrNull(b, 'strength'), intOrNull(b, 'coins'), bStr(b, 'pack_label'), bInt(b, 'level'));
    }
  });
  logA(adm, 'draft.rewards', 'ok');
  return OK;
});

// ---------------- Lojinha premium ----------------
route('get', '/cashshop', () => ({
  config: {
    enabled: settings.get('cashshop_enabled'), pix_key: orEmpty(settings.get('cashshop_pix_key')), pix_name: orEmpty(settings.get('cashshop_pix_name')),
    info: orEmpty(settings.get('cashshop_info')), ad_enabled: settings.get('ad_enabled'), ad_reward: settings.getInt('ad_reward'),
    ad_cooldown: settings.getInt('ad_cooldown'), ad_daily_limit: settings.getInt('ad_daily_limit'),
  },
  products: db.q('SELECT * FROM cash_products ORDER BY sort ASC, id ASC'),
  orders: db.q("SELECT co.*, u.username, u.global_name, u.discord_id FROM cash_orders co JOIN users u ON u.id=co.user_id WHERE co.status='pending' ORDER BY co.id ASC LIMIT 100"),
}));
route('post', '/cashshop/config', async (ctx, adm) => {
  const b = await body(ctx);
  for (const k of ['cashshop_enabled', 'cashshop_pix_key', 'cashshop_pix_name', 'cashshop_info', 'ad_enabled', 'ad_reward', 'ad_cooldown', 'ad_daily_limit']) {
    if (has(b, k) && b[k] != null) settings.set(k, typeof b[k] === 'boolean' ? (b[k] ? '1' : '0') : typeof b[k] === 'number' ? Math.trunc(b[k]) : String(b[k]));
  }
  logA(adm, 'cashshop.config', 'ok');
  return OK;
});
route('post', '/cashshop/products', async (ctx, adm) => {
  const b = await body(ctx);
  const n = (k, d) => { const v = intOrNull(b, k); return v == null ? d : v; };
  const id = db.insert('INSERT INTO cash_products (kind, ref_id, title, description, image, price, promo_price, promo_label, badge, qty, coins_amount, active, sort) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',
    bStr(b, 'kind', 'pack'), longOrNull(b, 'ref_id'), bStr(b, 'title', 'Novo produto'), bStr(b, 'description'), bStr(b, 'image'), n('price', 0),
    longOrNull(b, 'promo_price'), bStr(b, 'promo_label'), bStr(b, 'badge'), n('qty', 1), n('coins_amount', 0), n('active', 1), n('sort', 0));
  logA(adm, 'cashshop.product.create', '#' + id);
  return okId(id);
});
route('put', '/cashshop/products/:id', async (ctx, adm) => {
  const b = await body(ctx), id = Number(ctx.params.id);
  db.exec('UPDATE cash_products SET kind=COALESCE(?,kind), ref_id=COALESCE(?,ref_id), title=COALESCE(?,title), description=COALESCE(?,description), image=COALESCE(?,image), '
    + 'price=COALESCE(?,price), promo_price=?, promo_label=?, badge=?, qty=COALESCE(?,qty), coins_amount=COALESCE(?,coins_amount), active=COALESCE(?,active), sort=COALESCE(?,sort) WHERE id=?',
  bStr(b, 'kind'), longOrNull(b, 'ref_id'), bStr(b, 'title'), bStr(b, 'description'), bStr(b, 'image'), longOrNull(b, 'price'),
  longOrNull(b, 'promo_price'), bStr(b, 'promo_label'), bStr(b, 'badge'), intOrNull(b, 'qty'), longOrNull(b, 'coins_amount'), intOrNull(b, 'active'), intOrNull(b, 'sort'), id);
  logA(adm, 'cashshop.product.update', '#' + id);
  return OK;
});
route('del', '/cashshop/products/:id', (ctx, adm) => {
  const id = Number(ctx.params.id);
  db.exec('DELETE FROM cash_products WHERE id=?', id);
  logA(adm, 'cashshop.product.delete', '#' + id);
  return OK;
});
route('post', '/cashshop/orders/:id/approve', (ctx, adm) => {
  const id = Number(ctx.params.id);
  cashshop.approveOrder(adm.id, id);
  logA(adm, 'cashshop.order.approve', '#' + id);
  return OK;
});
route('post', '/cashshop/orders/:id/reject', async (ctx, adm) => {
  const b = await body(ctx), id = Number(ctx.params.id);
  cashshop.rejectOrder(adm.id, id, bStr(b, 'note'));
  logA(adm, 'cashshop.order.reject', '#' + id);
  return OK;
});
