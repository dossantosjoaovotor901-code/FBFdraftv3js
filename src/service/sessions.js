'use strict';

// Sessoes persistidas no banco (tabela sessions) - equivalente a
// SessionService.java (session-store.js + express-session do Node original).
// O cookie guarda apenas o ID da sessao; os dados ficam no servidor.

const crypto = require('node:crypto');
const { db } = require('../dao/db');
const json = require('./json');
const { FbfConfig } = require('../config/fbfconfig');

function cookieName() { return FbfConfig.sessionCookie(); }
function days() { return FbfConfig.sessionDays(); }
function ttlMillis() { return days() * 24 * 60 * 60 * 1000; }

function randomId() {
  return crypto.randomBytes(24).toString('base64url');
}

// Grava/atualiza os dados da sessao.
function save(sid, jsonStr, expireAt) {
  const changed = db.exec('UPDATE sessions SET sess=?, expire=? WHERE sid=?', jsonStr, expireAt, sid);
  if (changed === 0) {
    db.exec('INSERT INTO sessions (sid, sess, expire) VALUES (?,?,?)', sid, jsonStr, expireAt);
  }
}

// Cria uma sessao nova e devolve { sid, cookie } (string Set-Cookie).
function newSession(data) {
  const sid = randomId();
  save(sid, json.encode(data || {}), Date.now() + ttlMillis());
  return { sid, cookie: buildCookie(sid, Math.floor(ttlMillis() / 1000)) };
}

function buildCookie(sid, maxAgeSeconds) {
  const parts = [
    `${cookieName()}=${sid}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
  ];
  if (maxAgeSeconds != null) parts.push(`Max-Age=${maxAgeSeconds}`);
  return parts.join('; ');
}

function clearCookie() {
  return `${cookieName()}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

// Le os dados da sessao (ou null se nao existir/expirada).
function read(sid) {
  if (!sid) return null;
  const row = db.one('SELECT sess, expire FROM sessions WHERE sid=?', sid);
  if (!row) return null;
  const expire = row.l('expire');
  if (expire > 0 && expire < Date.now()) {
    destroy(sid);
    return null;
  }
  return json.decodeMap(row.str('sess'));
}

function touch(sid) {
  if (!sid) return;
  db.exec('UPDATE sessions SET expire=? WHERE sid=?', Date.now() + ttlMillis(), sid);
}

function destroy(sid) {
  if (!sid) return;
  db.exec('DELETE FROM sessions WHERE sid=?', sid);
}

// Remove sessoes expiradas (limpeza periodica).
function purgeExpired() {
  db.exec('DELETE FROM sessions WHERE expire < ?', Date.now());
}

module.exports = {
  cookieName, days, ttlMillis, newSession, buildCookie, clearCookie,
  save, read, touch, destroy, purgeExpired,
};
