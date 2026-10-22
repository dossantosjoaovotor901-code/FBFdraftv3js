'use strict';
// Configuracoes chave/valor (tabela app_settings) - mesmas chaves de sempre.
const db = require('./db');

const DEFAULTS = {
  market_rules: 'Compre e venda cartas usando moedas FBF.\n'
    + 'A Loja da FBF troca as cartas em oferta a cada 7 dias.\n'
    + 'Cartas que estao no seu time nao podem ser vendidas: apague o time antes.\n'
    + 'Cada carta tem faixa de preco minima e maxima (baseada na nota): ninguem vende um craque por moedas de banana nem uma carta fraca por uma fortuna.\n'
    + 'A compra e definitiva e debitada na hora; nao ha estorno.',
  shop_size: '8',
  shop_refresh_days: '7',
  shop_price_mult: '12',
  card_value_base: '600',
  card_value_growth: '1.22',
  shop_markup_pct: '130',
  market_min_pct: '50',
  market_max_pct: '200',
  shop_refresh_minutes: '',
  shop_default_stock: '',
  shop_default_limit: '',
  bot_match_cooldown: '120',
  bot_match_daily_limit: '0',
  pvp_cooldown: '60',
  pvp_online_window: '70',
  online_reward: '150',
  quick_reward: '60',
  quick_cooldown: '60',
  draftrun_opponents: '',
  maintenance_on: '0',
  maintenance_message: 'Estamos em manutencao para melhorar o jogo. Voltamos em breve!',
  maintenance_until: '',
  draftrun_cooldown: '0',
  draft_option_weights: '',
  selfcard_enabled: '1',
  selfcard_max: '99',
  selfcard_xp_base: '6',
  selfcard_xp_exp: '1.35',
  selfcard_xp_win: '100',
  selfcard_xp_draw: '40',
  selfcard_xp_loss: '15',
  selfcard_xp_bot_pct: '40',
  selfcard_xp_draft_pct: '60',
  selfcard_buy_url: '',
  selfcard_pix_enabled: '1',
  selfcard_pix_key: '',
  selfcard_pix_name: '',
  selfcard_pix_price: '',
  selfcard_pix_info: 'Faca o Pix para a chave acima, envie o comprovante aqui e aguarde a liberacao da sua carta.',
  shop_last_refresh: '',
  shop_cycle: '0',
  market_min_price: '10',
  market_max_price: '1000000',
  cashshop_enabled: '1',
  cashshop_pix_key: '',
  cashshop_pix_name: '',
  cashshop_info: 'Faca o Pix do valor exato para a chave acima, envie o comprovante aqui e aguarde a aprovacao do admin para receber seu item.',
  ad_enabled: '1',
  ad_reward: '50',
  ad_cooldown: '60',
  ad_daily_limit: '20',
};

// Cache em memoria: as configs sao lidas dezenas de vezes por requisicao. set() invalida na hora.
let cache = null;
function load() {
  cache = new Map();
  for (const r of db.q('SELECT key, value FROM app_settings')) cache.set(r.key, r.value);
}

function get(key) {
  if (!cache) load();
  const v = cache.get(key);
  if (v !== undefined && v !== null) return v;
  return Object.prototype.hasOwnProperty.call(DEFAULTS, key) ? DEFAULTS[key] : null;
}

function getInt(key) {
  const n = Number.parseInt(String(get(key)).trim(), 10);
  if (Number.isFinite(n)) return n;
  const d = Number.parseInt(String(DEFAULTS[key]).trim(), 10);
  return Number.isFinite(d) ? d : 0;
}

function getFloat(key) {
  const n = Number.parseFloat(String(get(key)).trim());
  if (Number.isFinite(n)) return n;
  const d = Number.parseFloat(String(DEFAULTS[key]).trim());
  return Number.isFinite(d) ? d : 0;
}

function set(key, value) {
  const v = value == null ? null : String(value);
  const changed = db.exec("UPDATE app_settings SET value=?, updated_at=datetime('now','localtime') WHERE key=?", v, key);
  if (changed === 0) db.exec('INSERT INTO app_settings (key, value) VALUES (?,?)', key, v);
  if (!cache) load(); else cache.set(key, v);
}

/** Valor inteiro positivo da configuracao (ou null). */
function positiveInt(key) {
  const n = getInt(key);
  return n > 0 ? n : null;
}

/** Recarrega do banco (usado depois de importacoes). */
function reload() { cache = null; }

module.exports = { DEFAULTS, get, getInt, getFloat, set, positiveInt, reload };
