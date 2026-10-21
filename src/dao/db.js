'use strict';

const { DatabaseSync } = require('node:sqlite');
const { Row } = require('./row');

/**
 * Camada de acesso a dados (equivalente a dao/Db.java).
 * Usa o SQLite embutido do Node (node:sqlite), sincrono - o que serializa
 * naturalmente as operacoes (sem necessidade de FOR UPDATE).
 */

let handle = null;

// Traducao de SQL Postgres -> SQLite aplicada em tempo de execucao, para manter
// as strings SQL do backend originais praticamente iguais.
function translate(sql) {
  let s = sql;
  // data/hora atual formatada 'YYYY-MM-DD HH:MM:SS'
  s = s.replace(/to_char\(\s*now\(\)\s*,\s*'YYYY-MM-DD HH24:MI:SS'\s*\)/gi,
    "strftime('%Y-%m-%d %H:%M:%S','now','localtime')");
  s = s.replace(/\bnow\(\)/gi, "strftime('%Y-%m-%d %H:%M:%S','now','localtime')");
  // FOR UPDATE nao existe / nao e necessario no SQLite sincrono
  s = s.replace(/\s+FOR\s+UPDATE\b/gi, '');
  // ILIKE -> LIKE (SQLite LIKE ja e case-insensitive para ASCII)
  s = s.replace(/\bILIKE\b/gi, 'LIKE');
  return s;
}

// Normaliza parametros para tipos aceitos pelo node:sqlite.
function normParams(params) {
  return (params || []).map((v) => {
    if (v === undefined || v === null) return null;
    if (typeof v === 'boolean') return v ? 1 : 0;
    if (typeof v === 'number') return v;
    if (typeof v === 'bigint') return v;
    if (typeof v === 'string') return v;
    return String(v);
  });
}

function normOut(v) {
  if (typeof v === 'bigint') {
    return (v >= BigInt(Number.MIN_SAFE_INTEGER) && v <= BigInt(Number.MAX_SAFE_INTEGER)) ? Number(v) : v;
  }
  return v;
}

function rowFrom(obj) {
  if (!obj) return null;
  const m = {};
  for (const k of Object.keys(obj)) m[k.toLowerCase()] = normOut(obj[k]);
  return new Row(m);
}

const Db = {
  init(dbFile) {
    if (handle) return handle;
    handle = new DatabaseSync(dbFile);
    handle.exec('PRAGMA journal_mode = WAL;');
    handle.exec('PRAGMA foreign_keys = ON;');
    handle.exec('PRAGMA busy_timeout = 5000;');
    return handle;
  },

  handle() { return handle; },

  // -------------------- leitura --------------------
  q(sql, ...params) {
    const stmt = handle.prepare(translate(sql));
    const rows = stmt.all(...normParams(params));
    return rows.map(rowFrom);
  },

  one(sql, ...params) {
    const stmt = handle.prepare(translate(sql));
    const r = stmt.get(...normParams(params));
    return r ? rowFrom(r) : null;
  },

  scalar(sql, ...params) {
    const r = Db.one(sql, ...params);
    if (!r) return null;
    const keys = Object.keys(r.map);
    return keys.length ? r.map[keys[0]] : null;
  },

  count(sql, ...params) {
    const { toLong } = require('./row');
    return toLong(Db.scalar(sql, ...params));
  },

  exists(sql, ...params) {
    return Db.one(sql, ...params) !== null;
  },

  // -------------------- escrita --------------------
  exec(sql, ...params) {
    const stmt = handle.prepare(translate(sql));
    const info = stmt.run(...normParams(params));
    return Number(info.changes);
  },

  insert(sql, ...params) {
    const stmt = handle.prepare(translate(sql));
    const info = stmt.run(...normParams(params));
    return Number(info.lastInsertRowid);
  },

  // Executa SQL bruto (varias instrucoes), sem parametros.
  raw(sql) {
    handle.exec(translate(sql));
  },

  // -------------------- transacoes --------------------
  // node:sqlite e sincrono; a funcao recebe o mesmo objeto Db (metodos estaticos
  // ja operam sobre a mesma conexao). Equivale a Db.tx(fn) do Java.
  tx(fn) {
    handle.exec('BEGIN');
    try {
      const out = fn(handle);
      handle.exec('COMMIT');
      return out;
    } catch (e) {
      try { handle.exec('ROLLBACK'); } catch (_) { /* noop */ }
      throw e;
    }
  },
};

module.exports = { Db, translate };
