'use strict';
// Helpers pequenos e sem dependencias.

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

const pad = (n) => (n < 10 ? '0' : '') + n;

/** 'YYYY-MM-DD HH:MM:SS' no fuso do processo (mesmo formato antigo das colunas TEXT de data). */
function fmtTs(d) {
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' +
    pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
}
const now = () => fmtTs(new Date());
const minusSeconds = (s) => fmtTs(new Date(Date.now() - s * 1000));
const minusHours = (h) => fmtTs(new Date(Date.now() - h * 3600 * 1000));

/** Converte 'YYYY-MM-DD HH:MM:SS' (local) em epoch ms. 0 se invalido. */
function parseSqlTime(s) {
  if (s == null) return 0;
  s = String(s).trim();
  if (!s) return 0;
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/.exec(s);
  if (!m) return 0;
  return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]).getTime();
}

/** ISO com fuso (2026-01-01T10:00:00Z) ou local sem fuso (com espaco ou T, segundos opcionais). 0 se invalido. */
function parseIso(s) {
  if (s == null) return 0;
  s = String(s).trim();
  if (!s) return 0;
  const loc = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?$/.exec(s);
  if (loc) return new Date(+loc[1], +loc[2] - 1, +loc[3], +loc[4], +loc[5], +(loc[6] || 0)).getTime();
  const t = Date.parse(s);
  return Number.isNaN(t) ? 0 : t;
}

const isBlank = (s) => s == null || String(s).trim() === '';

function toInt(o) {
  if (o == null) return 0;
  if (typeof o === 'number') return Number.isFinite(o) ? Math.trunc(o) : 0;
  const n = Number.parseFloat(String(o).trim());
  return Number.isFinite(n) ? Math.round(n) : 0;
}
const toLong = toInt;
function toNum(o) {
  if (o == null) return 0;
  if (typeof o === 'number') return o;
  const n = Number.parseFloat(String(o).trim());
  return Number.isFinite(n) ? n : 0;
}

/** JSON.parse seguro: devolve {} (objeto) ou [] (array) quando invalido. */
function parseObj(s) {
  if (s == null || s === '') return {};
  if (typeof s === 'object') return s;
  try { const v = JSON.parse(s); return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; } catch { return {}; }
}
function parseArr(s) {
  if (s == null || String(s).trim() === '') return [];
  if (Array.isArray(s)) return s;
  try { const v = JSON.parse(s); return Array.isArray(v) ? v : []; } catch { return []; }
}
/** Lista de ids (aceita JSON '[1,2,"3"]'). */
function longList(raw) {
  const out = [];
  if (raw == null) return out;
  for (const v of parseArr(raw)) {
    const n = typeof v === 'number' ? Math.trunc(v) : Number.parseInt(String(v).replace(/"/g, '').trim(), 10);
    if (Number.isFinite(n)) out.push(n);
  }
  return out;
}

// ---- leitura tolerante de campos do corpo JSON (mesma semantica do JSON-P getString/getInt) ----
const bStr = (b, k, def = null) => (b && typeof b[k] === 'string' ? b[k] : def);
const bInt = (b, k, def = 0) => (b && typeof b[k] === 'number' ? Math.trunc(b[k]) : def);
const bBool = (b, k, def = false) => (b && typeof b[k] === 'boolean' ? b[k] : def);
const has = (b, k) => !!b && Object.prototype.hasOwnProperty.call(b, k);
function intOrNull(b, k) {
  if (!b || b[k] == null) return null;
  const v = b[k];
  if (typeof v === 'number') return Math.trunc(v);
  if (typeof v === 'string') { const n = Number.parseFloat(v); return Number.isFinite(n) ? Math.round(n) : null; }
  return null;
}
function longOrNull(b, k) {
  if (!b || b[k] == null) return null;
  return typeof b[k] === 'number' ? Math.trunc(b[k]) : null;
}
/** Como longOrNull, mas aceita string numerica (usado nas rotas de draft). */
function longLoose(b, k) {
  if (!b || b[k] == null) return null;
  const v = b[k];
  if (typeof v === 'number') return Math.trunc(v);
  const n = Number.parseInt(String(v), 10);
  return Number.isFinite(n) ? n : null;
}
const orEmpty = (s) => (s == null ? '' : s);

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
  }
  return arr;
}
const randInt = (n) => Math.floor(Math.random() * n);

module.exports = {
  HttpError, now, fmtTs, minusSeconds, minusHours, parseSqlTime, parseIso, isBlank, toInt, toLong, toNum,
  parseObj, parseArr, longList, bStr, bInt, bBool, has, intOrNull, longOrNull, longLoose, orEmpty, shuffle, randInt,
};
