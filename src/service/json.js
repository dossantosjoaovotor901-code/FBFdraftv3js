'use strict';

// Helpers de JSON (equivalente a service/Json.java). No Node usamos objetos
// simples + JSON.stringify; estes helpers cobrem parse tolerante e utilidades.

function parse(s) {
  if (s === null || s === undefined || s === '') return {};
  try {
    const v = JSON.parse(s);
    return (v && typeof v === 'object' && !Array.isArray(v)) ? v : {};
  } catch (e) {
    return {};
  }
}

function parseArray(s) {
  if (s === null || s === undefined || String(s).trim() === '') return [];
  try {
    const v = JSON.parse(s);
    return Array.isArray(v) ? v : [];
  } catch (e) {
    return [];
  }
}

// Le uma lista de inteiros de um campo (aceita array JS, ou string com JSON array).
function longList(raw) {
  const out = [];
  if (raw === null || raw === undefined) return out;
  let arr;
  if (Array.isArray(raw)) arr = raw;
  else {
    const s = String(raw).trim();
    if (!s || !s.startsWith('[')) return out;
    arr = parseArray(s);
  }
  for (const v of arr) {
    const n = parseInt(String(v).replace(/"/g, '').trim(), 10);
    if (!Number.isNaN(n)) out.push(n);
  }
  return out;
}

function escape(s) {
  if (s === null || s === undefined) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Sessoes: '{"a":"1"}' <-> Map string->string
function decodeMap(s) {
  const o = parse(s);
  const out = {};
  for (const k of Object.keys(o)) {
    const v = o[k];
    if (v === null || v === undefined) out[k] = null;
    else if (typeof v === 'string') out[k] = v;
    else out[k] = String(v);
  }
  return out;
}

function encode(m) {
  const o = {};
  if (m) for (const k of Object.keys(m)) o[k] = m[k] === undefined ? null : m[k];
  return JSON.stringify(o);
}

module.exports = { parse, parseArray, longList, escape, decodeMap, encode };
