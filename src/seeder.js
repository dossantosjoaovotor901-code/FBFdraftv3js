'use strict';
// Importa os dados iniciais (public-import/*.jsonl). Idempotente: so cria o que falta e nunca apaga dados.
const fs = require('fs');
const path = require('path');
const db = require('./db');
const cfg = require('./config');
const settings = require('./settings');

function lines(file) {
  const f = path.join(cfg.importDir, file);
  if (!fs.existsSync(f)) throw new Error('Arquivo nao encontrado: public-import/' + file);
  return fs.readFileSync(f, 'utf8').split(/\r?\n/).filter((l) => l.trim() !== '').map((l) => {
    const o = JSON.parse(l);
    for (const k of Object.keys(o)) if (o[k] !== null && typeof o[k] === 'object') o[k] = JSON.stringify(o[k]);
    return o;
  });
}
const num = (o) => {
  if (o == null) return null;
  if (typeof o === 'number') return Math.trunc(o);
  const n = Number.parseFloat(String(o));
  return Number.isFinite(n) ? Math.round(n) : null;
};
const nz = (v) => (v === undefined ? null : v);

function seedRarities() {
  for (const m of lines('rarities.jsonl')) db.exec('INSERT INTO rarities (id, name, rank, active) VALUES (?,?,?,?)', num(m.id), m.name, num(m.rank), num(m.active));
}
function seedModels() {
  for (const m of lines('card_models.jsonl')) {
    db.exec('INSERT INTO card_models (id, name, rarity_id, bg_from, bg_to, border_color, text_color, effect, logo, pattern, layout, accent_color, name_bg, shine_color, bg_anim, bg_anim_speed, bg_image, active) '
      + 'VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
    num(m.id), m.name, nz(m.rarity_id), nz(m.bg_from), nz(m.bg_to), nz(m.border_color), nz(m.text_color), nz(m.effect), nz(m.logo), nz(m.pattern), nz(m.layout),
    nz(m.accent_color), nz(m.name_bg), nz(m.shine_color), nz(m.bg_anim), num(m.bg_anim_speed), nz(m.bg_image), num(m.active));
  }
}
function seedTeams() {
  for (const m of lines('teams.jsonl')) {
    db.exec('INSERT INTO teams (id, name, short_name, crest, country, league, color_primary, color_secondary, description, kit_style, kit_text_color, active) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
      num(m.id), m.name, nz(m.short_name), nz(m.crest), nz(m.country), nz(m.league), nz(m.color_primary), nz(m.color_secondary), nz(m.description),
      m.kit_style == null ? 'vertical' : m.kit_style, m.kit_text_color == null ? '#ffffff' : m.kit_text_color, num(m.active));
  }
}
function seedPlayers() {
  let added = 0;
  for (const m of lines('players.jsonl')) {
    const id = num(m.id);
    if (db.exists('SELECT 1 FROM players WHERE id=?', id)) continue;
    db.exec('INSERT INTO players (id, name, photo, overall, position, positions, country, team_id, rarity_id, model_id, is_gk, fin, pas, ctl, skl, def, jdc, gk_div, gk_han, gk_kic, gk_ref, gk_spd, gk_pos, '
      + 'exp_x3, exp_x4, exp_x5, exp_x7, avatar_mode, avatar_style, avatar_text, is_event, is_exclusive, exclusive_max, exclusive_resale, exclusive_price, group_id, card_type, description, active) '
      + 'VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
    id, m.name, nz(m.photo), num(m.overall), m.position, nz(m.positions), nz(m.country), nz(m.team_id), nz(m.rarity_id), nz(m.model_id), num(m.is_gk),
    num(m.fin), num(m.pas), num(m.ctl), num(m.skl), num(m.def), num(m.jdc), num(m.gk_div), num(m.gk_han), num(m.gk_kic), num(m.gk_ref), num(m.gk_spd), num(m.gk_pos),
    num(m.exp_x3), num(m.exp_x4), num(m.exp_x5), num(m.exp_x7), m.avatar_mode == null ? 'auto' : m.avatar_mode, m.avatar_style == null ? 'team' : m.avatar_style, nz(m.avatar_text),
    num(m.is_event), num(m.is_exclusive), nz(m.exclusive_max), num(m.exclusive_resale), nz(m.exclusive_price), nz(m.group_id), nz(m.card_type), nz(m.description), num(m.active));
    added++;
  }
  return added;
}
function seedFormations() {
  for (const m of lines('formations.jsonl')) db.exec('INSERT INTO formations (id, name, mode, slots_json, active) VALUES (?,?,?,?,?)', num(m.id), m.name, nz(m.mode), m.slots_json, num(m.active));
}
function seedPacks() {
  for (const m of lines('packs.jsonl')) {
    db.exec('INSERT INTO packs (id, name, art, price, card_count, rarity_odds, eligible_players, available_from, available_to, is_event, active) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
      num(m.id), m.name, nz(m.art), num(m.price), num(m.card_count), nz(m.rarity_odds), nz(m.eligible_players), nz(m.available_from), nz(m.available_to), num(m.is_event), num(m.active));
  }
}
function seedBots() {
  for (const m of lines('bot_teams.jsonl')) {
    if (db.exists('SELECT 1 FROM bot_teams WHERE key=?', String(m.key))) continue;
    db.exec('INSERT INTO bot_teams (id, key, name, crest, strength, attack, defense, gk, chemistry, reward, active, sort) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
      num(m.id), m.key, m.name, nz(m.crest), num(m.strength), nz(m.attack), nz(m.defense), nz(m.gk), num(m.chemistry), num(m.reward), num(m.active), num(m.sort));
  }
}
function seedDraftConfig() {
  for (const m of lines('draft_reward_config.jsonl')) {
    if (db.exists('SELECT 1 FROM draft_reward_config WHERE level=?', num(m.level))) continue;
    db.exec('INSERT INTO draft_reward_config (level, name, strength, coins, pack_id, pack_label) VALUES (?,?,?,?,?,?)',
      num(m.level), m.name, num(m.strength), num(m.coins), nz(m.pack_id), nz(m.pack_label));
  }
}
function seedSettings() {
  for (const m of lines('app_settings.jsonl')) {
    if (db.exists('SELECT 1 FROM app_settings WHERE key=?', String(m.key))) continue;
    db.exec('INSERT INTO app_settings (key, value) VALUES (?,?)', m.key, nz(m.value) == null ? null : String(m.value));
  }
}

function run() {
  if (!cfg.seedEnabled) { console.log('[FBF] seed desativado (FBF_SEED_ENABLED=false)'); return; }
  try {
    db.tx(() => {
      if (db.count('SELECT COUNT(*) FROM rarities') === 0) {
        console.log('[FBF] Banco vazio: importando dados iniciais...');
        seedRarities(); seedModels(); seedTeams(); seedPlayers(); seedFormations(); seedPacks(); seedBots(); seedDraftConfig(); seedSettings();
      } else {
        seedPlayers();   // ja tem base: importa so o que faltar
      }
    });
    settings.reload();
    console.log(`[FBF] Banco pronto: ${db.count('SELECT COUNT(*) FROM players')} jogadores, ${db.count('SELECT COUNT(*) FROM teams')} times, `
      + `${db.count('SELECT COUNT(*) FROM packs')} pacotes, ${db.count('SELECT COUNT(*) FROM formations')} formacoes.`);
  } catch (e) {
    console.error('[FBF] Falha ao importar dados iniciais:', e);
  }
}

module.exports = { run };
