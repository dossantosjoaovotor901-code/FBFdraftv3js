'use strict';

// Configuracoes chave/valor (tabela app_settings) - equivalente a Settings.java
// / src/settings.js original. Mesmos nomes de chave p/ nao migrar dados.

const { db } = require('../dao/db');

// Valores padrao (identicos ao DEFAULTS do Java / settings.js original).
const DEFAULTS = {
  market_rules:
    'Compre e venda cartas usando moedas FBF.\n' +
    'A Loja da FBF troca as cartas em oferta a cada 7 dias.\n' +
    'Cartas que estao no seu time nao podem ser vendidas: apague o time antes.\n' +
    'Cada carta tem faixa de preco minima e maxima (baseada na nota): ninguem vende um craque por moedas de banana nem uma carta fraca por uma fortuna.\n' +
    'A compra e definitiva e debitada na hora; nao ha estorno.',
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

function get(key) {
  const r = db.one('SELECT value FROM app_settings WHERE key=?', key);
  if (r && r.get('value') != null) return r.str('value');
  return DEFAULTS[key] !== undefined ? DEFAULTS[key] : null;
}

function getInt(key) {
  const v = get(key);
  const n = parseInt(String(v).trim(), 10);
  if (!Number.isNaN(n)) return n;
  const d = parseInt(String(DEFAULTS[key]).trim(), 10);
  return Number.isNaN(d) ? 0 : d;
}

function getFloat(key) {
  const v = get(key);
  const n = parseFloat(String(v).trim());
  if (!Number.isNaN(n)) return n;
  const d = parseFloat(String(DEFAULTS[key]).trim());
  return Number.isNaN(d) ? 0 : d;
}

function set(key, value) {
  const v = value == null ? null : String(value);
  const changed = db.exec(
    "UPDATE app_settings SET value=?, updated_at=to_char(now(),'YYYY-MM-DD HH24:MI:SS') WHERE key=?",
    v, key
  );
  if (changed === 0) {
    db.exec('INSERT INTO app_settings (key, value) VALUES (?,?)', key, v);
  }
}

function positiveInt(key) {
  const n = getInt(key);
  return n > 0 ? n : null;
}

function now() {
  const d = new Date();
  const p = (x) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ` +
    `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

module.exports = { DEFAULTS, get, getInt, getFloat, set, positiveInt, now };
