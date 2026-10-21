'use strict';

// Usuario da requisicao atual (equivalente a CurrentUser.java / middleware.js).
// NUNCA confia no navegador: o usuario e sempre recarregado do banco pelo ID
// guardado na sessao do servidor. Uma instancia por requisicao.

const { db } = require('../dao/db');
const sessions = require('./sessions');

function makeCurrentUser(sidFromCookie) {
  let user = null;
  let resolved = false;
  let sid = sidFromCookie || null;

  function get() {
    if (!resolved) {
      resolved = true;
      const data = sessions.read(sid);
      if (data) {
        const raw = data.userId;
        let uid = 0;
        if (raw != null) { const n = parseInt(String(raw), 10); if (!Number.isNaN(n)) uid = n; }
        if (uid > 0) {
          user = db.one('SELECT * FROM users WHERE id=?', uid);
          sessions.touch(sid);
        }
      }
    }
    return user;
  }

  return {
    get,
    id() { const u = get(); return u == null ? 0 : u.l('id'); },
    logged() { return get() != null; },
    isAdmin() { const u = get(); return !!(u && u.bool('is_admin')); },
    sid() { get(); return sid; },
    invalidate() { if (sid) sessions.destroy(sid); user = null; },
  };
}

module.exports = { makeCurrentUser };
