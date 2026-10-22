#!/usr/bin/env node
'use strict';
// Importa os dados do banco H2 antigo (Quarkus) para o SQLite novo.
//
// 1) No servidor antigo, gere o dump SQL do H2 (com o app PARADO):
//      java -cp h2-*.jar org.h2.tools.Script -url jdbc:h2:file:./data/fbf -user sa -password sa -script dump.sql
//    (o h2-*.jar fica em ~/.m2/repository/com/h2database/h2/<versao>/)
// 2) Importe:   node tools/migrate-h2.js dump.sql [--db ./data/fbf.db] [--replace]
//    --replace apaga o conteudo atual das tabelas importadas (use num banco novo/seedado).
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--'));
const flag = (n) => args.includes(n);
const dbArg = args.indexOf('--db');
if (!file) { console.error('Uso: node tools/migrate-h2.js dump.sql [--db caminho.db] [--replace]'); process.exit(1); }
if (dbArg >= 0) process.env.FBF_DB_PATH = args[dbArg + 1];

const db = require('../src/db');
db.init();

const text = fs.readFileSync(file, 'utf8');

// ---------- tokenizer de valores ----------
function decodeEsc(s) {   // STRINGDECODE / U&'' : \uXXXX \\ \n \t ...
  return s.replace(/\\(u[0-9a-fA-F]{4}|[\\"'nrtbf])/g, (_, g) => {
    if (g[0] === 'u') return String.fromCharCode(parseInt(g.slice(1), 16));
    return { n: '\n', r: '\r', t: '\t', b: '\b', f: '\f' }[g] ?? g;
  });
}

function decodeU(s) {      // U&'...' : \XXXX, \+XXXXXX e \\
  return s.replace(/\\(\\|\+[0-9a-fA-F]{6}|[0-9a-fA-F]{4})/g, (_, g) => {
    if (g === '\\') return '\\';
    return String.fromCodePoint(parseInt(g[0] === '+' ? g.slice(1) : g, 16));
  });
}

/** Le um literal SQL a partir de i. Retorna [valor, proximoIndice]. */
function readValue(s, i) {
  while (/\s/.test(s[i])) i++;
  const rest = s.slice(i, i + 40);
  if (s[i] === "'") return readString(s, i, false);
  let m;
  if ((m = /^U&'/i.exec(rest))) { const [v, j] = readString(s, i + 2, false); return [decodeU(v), j]; }
  if ((m = /^STRINGDECODE\(\s*'/i.exec(rest))) {
    const [v, j] = readString(s, i + m[0].length - 1, true);
    return [v, skipTo(s, j, ')')];
  }
  if ((m = /^(?:TIMESTAMP|DATE|TIME)(?:\s+WITH(?:OUT)?\s+TIME\s+ZONE)?\s+'([^']*)'/i.exec(rest))) {
    return [m[1].replace('T', ' ').replace(/\.\d+/, '').replace(/[+-]\d\d(:\d\d)?$/, '').trim(), i + m[0].length];
  }
  if ((m = /^X'([0-9a-fA-F]*)'/.exec(rest))) return [Buffer.from(m[1], 'hex'), i + m[0].length];
  if ((m = /^NULL\b/i.exec(rest))) return [null, i + 4];
  if ((m = /^TRUE\b/i.exec(rest))) return [1, i + 4];
  if ((m = /^FALSE\b/i.exec(rest))) return [0, i + 5];
  if ((m = /^CAST\(/i.exec(rest))) {            // CAST(x AS tipo)
    const [v, j] = readValue(s, i + 5);
    return [v, skipTo(s, j, ')')];
  }
  if ((m = /^-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(rest))) {
    const n = m[0];
    return [/^-?\d+$/.test(n) && Math.abs(Number(n)) > Number.MAX_SAFE_INTEGER ? BigInt(n) : Number(n), i + n.length];
  }
  throw new Error('Valor SQL nao reconhecido: ' + rest);
}
function readString(s, i, esc) {          // s[i] === "'"
  let out = '';
  i++;
  for (;;) {
    const c = s[i];
    if (c === undefined) throw new Error('String nao terminada');
    if (c === "'") { if (s[i + 1] === "'") { out += "'"; i += 2; continue; } i++; break; }
    out += c; i++;
  }
  return [esc ? decodeEsc(out) : out, i];
}
function skipTo(s, i, ch) { while (s[i] !== ch) i++; return i + 1; }

/** Le "(v1, v2, ...)" a partir de i. */
function readTuple(s, i) {
  while (s[i] !== '(') i++;
  i++;
  const vals = [];
  for (;;) {
    const [v, j] = readValue(s, i);
    vals.push(v);
    i = j;
    while (/\s/.test(s[i])) i++;
    if (s[i] === ',') { i++; continue; }
    if (s[i] === ')') return [vals, i + 1];
    throw new Error('Tupla invalida perto de: ' + s.slice(i, i + 40));
  }
}

// ---------- importacao ----------
const tables = new Map();   // nome -> colunas existentes no SQLite
for (const r of db.q("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")) {
  tables.set(r.name.toLowerCase(), db.q(`PRAGMA table_info(${r.name})`).map((c) => c.name));
}

const re = /INSERT INTO\s+(?:"?PUBLIC"?\.)?"?([A-Za-z0-9_]+)"?\s*\(([^)]*)\)\s*VALUES/gi;
const stats = {}, skipped = {};
const cleared = new Set();

db.script('PRAGMA foreign_keys = OFF');
db.script('BEGIN');
try {
  let m;
  while ((m = re.exec(text))) {
    const table = m[1].toLowerCase();
    const cols = m[2].split(',').map((c) => c.trim().replace(/"/g, '').toLowerCase());
    let i = re.lastIndex;
    const known = tables.get(table);
    const tuples = [];
    for (;;) {
      const [vals, j] = readTuple(text, i);
      tuples.push(vals);
      i = j;
      while (/\s/.test(text[i])) i++;
      if (text[i] === ',') { i++; continue; }
      break;   // ';'
    }
    re.lastIndex = i;
    if (!known) { skipped[table] = (skipped[table] || 0) + tuples.length; continue; }
    if (flag('--replace') && !cleared.has(table)) { db.exec(`DELETE FROM ${table}`); cleared.add(table); }
    const idx = cols.map((c, k) => (known.includes(c) ? k : -1));
    const useCols = cols.filter((_, k) => idx[k] >= 0);
    if (!useCols.length) continue;
    const sql = `INSERT OR REPLACE INTO ${table} (${useCols.map((c) => `"${c}"`).join(',')}) VALUES (${useCols.map(() => '?').join(',')})`;
    for (const t of tuples) {
      db.exec(sql, ...idx.filter((k) => k >= 0).map((k) => t[k]));
      stats[table] = (stats[table] || 0) + 1;
    }
  }
  db.script('COMMIT');
} catch (e) {
  db.script('ROLLBACK');
  console.error('Falhou, nada foi importado:', e.message);
  process.exit(1);
}
db.script('PRAGMA foreign_keys = ON');
const bad = db.q('PRAGMA foreign_key_check');
console.log('Importado:');
for (const [t, n] of Object.entries(stats)) console.log(`  ${t}: ${n}`);
if (Object.keys(skipped).length) console.log('Tabelas ignoradas (nao existem no novo schema):', skipped);
if (bad.length) console.log(`Aviso: ${bad.length} referencias (FK) quebradas, ex.: ${JSON.stringify(bad[0])}`);
db.close();
