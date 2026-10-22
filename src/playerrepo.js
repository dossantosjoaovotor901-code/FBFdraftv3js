'use strict';
// Consultas de jogadores/cartas (pacotes, loja, draft, mercado).
const db = require('./db');
const { randInt } = require('./util');

const BASE_WHERE = 'active=1 AND COALESCE(is_exclusive,0)=0 AND COALESCE(owner_user_id,0)=0';

/** Jogadores elegiveis para sorteios (ativos, sem exclusivas, sem cartas pessoais). So as colunas leves. */
function drawPool() {
  return db.q(`SELECT id, position, positions, group_id, is_gk, overall, name FROM players WHERE ${BASE_WHERE}`);
}

function candidateIds(rarityId, eligible, minOv, maxOv, exclude) {
  let sql = `SELECT id FROM players WHERE ${BASE_WHERE}`;
  const args = [];
  if (rarityId != null) { sql += ' AND rarity_id=?'; args.push(rarityId); }
  if (minOv != null && minOv > 0) { sql += ' AND overall>=?'; args.push(minOv); }
  if (maxOv != null && maxOv > 0) { sql += ' AND overall<=?'; args.push(maxOv); }
  if (eligible && eligible.length) {
    sql += ' AND id IN (' + eligible.map(() => '?').join(',') + ')';
    args.push(...eligible);
  }
  const rows = db.q(sql, ...args);
  const out = [];
  for (const r of rows) {
    if (exclude && exclude.has(r.id)) continue;
    out.push(r.id);
  }
  return out;
}

/**
 * Sorteia uma carta de uma raridade honrando faixa de nota e cartas ja usadas.
 * Sem candidatos na raridade pedida, cai para a raridade mais proxima e, por fim, qualquer carta elegivel.
 */
function pickPlayer(rarityId, eligible, minOv = null, maxOv = null, exclude = null) {
  let ids = candidateIds(rarityId, eligible, minOv, maxOv, exclude);
  if (!ids.length && rarityId != null) {
    const target = db.one('SELECT rank FROM rarities WHERE id=?', rarityId);
    if (target) {
      const others = db.q('SELECT id, rank FROM rarities WHERE active=1 AND id<>?', rarityId);
      others.sort((a, b) => Math.abs(a.rank - target.rank) - Math.abs(b.rank - target.rank));
      for (const o of others) {
        ids = candidateIds(o.id, eligible, minOv, maxOv, exclude);
        if (ids.length) break;
      }
    }
  }
  if (!ids.length) ids = candidateIds(null, eligible, minOv, maxOv, exclude);
  // Ultimo recurso: se a exclusao de repetidos esvaziou tudo, permite repetir.
  if (!ids.length && exclude && exclude.size) ids = candidateIds(rarityId, eligible, minOv, maxOv, null);
  if (!ids.length) ids = candidateIds(null, eligible, null, null, null);
  if (!ids.length) return null;
  return ids[randInt(ids.length)];
}

module.exports = { drawPool, candidateIds, pickPlayer };
