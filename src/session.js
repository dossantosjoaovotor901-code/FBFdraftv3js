'use strict';
// Sessoes persistidas no banco (tabela sessions). O cookie guarda so o ID.
// Cache em memoria evita consultar o banco a cada requisicao; o "touch" (renovar validade) so grava de hora em hora.
const crypto = require('crypto');
const db = require('./db');
const cfg = require('./config');

const TTL = cfg.sessionDays * 24 * 3600 * 1000;
const TOUCH_EVERY = 3600 * 1000;
const mem = new Map(); // sid -> { data, expire, touched }

const newId = () => crypto.randomBytes(24).toString('base64url');

function create(data) {
  const sid = newId();
  const expire = Date.now() + TTL;
  db.exec('INSERT INTO sessions (sid, sess, expire) VALUES (?,?,?)', sid, JSON.stringify(data), expire);
  mem.set(sid, { data, expire, touched: Date.now() });
  return sid;
}

function read(sid) {
  if (!sid || typeof sid !== 'string' || sid.length > 100) return null;
  let e = mem.get(sid);
  if (!e) {
    const row = db.one('SELECT sess, expire FROM sessions WHERE sid=?', sid);
    if (!row) return null;
    let data = {};
    try { data = JSON.parse(row.sess) || {}; } catch { /* ignore */ }
    e = { data, expire: Number(row.expire), touched: Date.now() };
    mem.set(sid, e);
  }
  const now = Date.now();
  if (e.expire > 0 && e.expire < now) { destroy(sid); return null; }
  if (now - e.touched > TOUCH_EVERY) {
    e.touched = now;
    e.expire = now + TTL;
    db.exec('UPDATE sessions SET expire=? WHERE sid=?', e.expire, sid);
  }
  return e.data;
}

function destroy(sid) {
  if (!sid) return;
  mem.delete(sid);
  db.exec('DELETE FROM sessions WHERE sid=?', sid);
}

function purgeExpired() {
  const now = Date.now();
  db.exec('DELETE FROM sessions WHERE expire < ?', now);
  for (const [k, v] of mem) if (v.expire < now) mem.delete(k);
}

module.exports = { create, read, destroy, purgeExpired, maxAgeSec: Math.floor(TTL / 1000) };
