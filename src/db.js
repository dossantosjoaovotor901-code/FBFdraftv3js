'use strict';
// Camada de dados sobre o SQLite embutido do Node (node:sqlite) - zero dependencias.
// Tudo e SINCRONO: nao ha pool, nao ha FOR UPDATE, e uma transacao nunca se mistura com outra.
const fs = require('fs');
const path = require('path');
const cfg = require('./config');

let DatabaseSync;
try {
  ({ DatabaseSync } = require('node:sqlite'));
} catch (e) {
  console.error('\n[FBF] Este Node nao tem o modulo "node:sqlite". Use Node 22.13+ (recomendado: Node 24 LTS).');
  console.error('      Versao atual: ' + process.version + '\n');
  process.exit(1);
}

fs.mkdirSync(path.dirname(cfg.dbPath), { recursive: true });
const conn = new DatabaseSync(cfg.dbPath);
conn.exec([
  'PRAGMA journal_mode = WAL',
  'PRAGMA synchronous = NORMAL',
  'PRAGMA foreign_keys = ON',
  'PRAGMA busy_timeout = 5000',
  'PRAGMA cache_size = -16384',      // ~16 MB de cache de paginas
  'PRAGMA temp_store = MEMORY',
  'PRAGMA mmap_size = 134217728',
].join(';'));

const cache = new Map();
function prep(sql) {
  let st = cache.get(sql);
  if (!st) {
    if (cache.size > 400) cache.clear();
    st = conn.prepare(sql);
    cache.set(sql, st);
  }
  return st;
}

/** Normaliza os parametros: boolean -> 0/1, undefined -> null, inteiro -> BigInt (coluna INTEGER de verdade). */
function bind(params) {
  const out = new Array(params.length);
  for (let i = 0; i < params.length; i++) {
    let v = params[i];
    if (v === undefined || v === null) v = null;
    else if (typeof v === 'boolean') v = v ? 1n : 0n;
    else if (typeof v === 'number') {
      if (!Number.isFinite(v)) v = null;
      else if (Number.isInteger(v)) v = BigInt(v);
    }
    out[i] = v;
  }
  return out;
}

let txDepth = 0;
const plain = (r) => (r ? { ...r } : null);

const db = {
  raw: conn,

  /** SELECT -> array de objetos. */
  q(sql, ...params) { return prep(sql).all(...bind(params)).map(plain); },
  /** Primeira linha (ou null). */
  one(sql, ...params) { return plain(prep(sql).get(...bind(params))); },
  scalar(sql, ...params) {
    const r = prep(sql).get(...bind(params));
    if (!r) return null;
    for (const k in r) return r[k];
    return null;
  },
  count(sql, ...params) { return Number(db.scalar(sql, ...params)) || 0; },
  exists(sql, ...params) { return !!prep(sql).get(...bind(params)); },
  /** INSERT/UPDATE/DELETE -> linhas afetadas. */
  exec(sql, ...params) { return Number(prep(sql).run(...bind(params)).changes); },
  /** INSERT -> id gerado. */
  insert(sql, ...params) { return Number(prep(sql).run(...bind(params)).lastInsertRowid); },
  /** Varias instrucoes SQL sem parametros. */
  script(sql) { conn.exec(sql); },

  /** Executa fn() dentro de uma transacao (commit no fim, rollback se lancar). Chamadas aninhadas reaproveitam a externa. */
  tx(fn) {
    if (txDepth > 0) return fn();
    conn.exec('BEGIN IMMEDIATE');
    txDepth = 1;
    try {
      const r = fn();
      conn.exec('COMMIT');
      return r;
    } catch (e) {
      try { conn.exec('ROLLBACK'); } catch { /* ignore */ }
      throw e;
    } finally {
      txDepth = 0;
    }
  },

  close() { try { conn.exec('PRAGMA wal_checkpoint(TRUNCATE)'); conn.close(); } catch { /* ignore */ } },
};

/** Aplica o schema (idempotente). */
db.init = function init() {
  const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  conn.exec(sql);
};

module.exports = db;
