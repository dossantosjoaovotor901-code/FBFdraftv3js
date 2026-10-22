'use strict';
// Monta o objeto completo de uma carta para o front (colunas snake_case + team/rarity/model + traits/power).
const db = require('./db');
const cardlogic = require('./cardlogic');

const TTL = 60_000;
function makeCache(sql) {
  const m = new Map();
  return {
    get(id) {
      if (id == null) return null;
      const c = m.get(id);
      const t = Date.now();
      if (c && t - c.at < TTL) return c.row;
      const row = db.one(sql, id);
      m.set(id, { row, at: t });
      return row;
    },
    clear() { m.clear(); },
  };
}
const teams = makeCache('SELECT id, name, short_name, crest, country, color_primary, color_secondary, kit_style, kit_text_color FROM teams WHERE id=?');
const rarities = makeCache('SELECT * FROM rarities WHERE id=?');
const models = makeCache('SELECT * FROM card_models WHERE id=?');

/** Limpa os caches de referencia (admin editou times/raridades/modelos). */
function clearRefCache() { teams.clear(); rarities.clear(); models.clear(); }

const player = (id) => db.one('SELECT * FROM players WHERE id=?', id);
const teamOf = (p) => (p ? teams.get(p.team_id) : null);
const rarityOf = (p) => (p ? rarities.get(p.rarity_id) : null);
const modelOf = (p) => (p ? models.get(p.model_id) : null);

function toJson(p) {
  if (!p) return {};
  const o = { ...p };
  o.team = teamOf(p) || null;
  o.rarity = rarityOf(p) || null;
  o.model = modelOf(p) || null;
  cardlogic.addTo(o, p);
  return o;
}

module.exports = { player, teamOf, rarityOf, modelOf, toJson, clearRefCache };
