'use strict';

// Conversoes equivalentes a Db.toLong / toInt / toDouble do backend Java.
function toLong(o) {
  if (o === null || o === undefined) return 0;
  if (typeof o === 'bigint') return Number(o);
  if (typeof o === 'number') return Math.trunc(o);
  if (typeof o === 'boolean') return o ? 1 : 0;
  const n = parseInt(String(o).trim(), 10);
  return Number.isNaN(n) ? 0 : n;
}

function toInt(o) {
  if (o === null || o === undefined) return 0;
  if (typeof o === 'bigint') return Number(o);
  if (typeof o === 'number') return Math.round(o);
  if (typeof o === 'boolean') return o ? 1 : 0;
  const n = parseFloat(String(o).trim());
  return Number.isNaN(n) ? 0 : Math.round(n);
}

function toDouble(o) {
  if (o === null || o === undefined) return 0;
  if (typeof o === 'bigint') return Number(o);
  if (typeof o === 'number') return o;
  if (typeof o === 'boolean') return o ? 1 : 0;
  const n = parseFloat(String(o).trim());
  return Number.isNaN(n) ? 0 : n;
}

/**
 * Uma linha do banco com acesso tipado (equivalente a dao/Row.java).
 * As chaves do objeto cru vem em minusculas (snake_case) do SQLite.
 */
class Row {
  constructor(map) {
    this.map = map || {};
  }

  has(k) { return Object.prototype.hasOwnProperty.call(this.map, String(k).toLowerCase()); }

  get(k) {
    const v = this.map[String(k).toLowerCase()];
    return v === undefined ? null : v;
  }

  str(k) {
    const v = this.get(k);
    return v === null ? null : String(v);
  }

  strOr(k, def) {
    const v = this.str(k);
    return v === null ? def : v;
  }

  i(k) { return toInt(this.get(k)); }

  iOr(k, def) {
    const v = this.get(k);
    return v === null ? def : toInt(v);
  }

  l(k) { return toLong(this.get(k)); }

  lOrNull(k) {
    const v = this.get(k);
    return v === null ? null : toLong(v);
  }

  iOrNull(k) {
    const v = this.get(k);
    return v === null ? null : toInt(v);
  }

  d(k) { return toDouble(this.get(k)); }

  dOrNull(k) {
    const v = this.get(k);
    return v === null ? null : toDouble(v);
  }

  bool(k) { return this.i(k) !== 0; }

  boolOr(k, def) {
    const v = this.get(k);
    return v === null ? def : toInt(v) !== 0;
  }
}

module.exports = { Row, toLong, toInt, toDouble };
