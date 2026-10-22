'use strict';
// Moedas e auditoria. applyCoins le o saldo, valida e grava na MESMA transacao do chamador.
const db = require('./db');
const { HttpError } = require('./util');

class InsufficientFunds extends HttpError {
  constructor() { super(400, 'Saldo insuficiente'); }
}

/** Debita/credita. amount negativo = debito. Lanca InsufficientFunds se faltar saldo. Devolve o novo saldo. */
function applyCoins(userId, amount, type, reason) {
  return db.tx(() => {
    const row = db.one('SELECT coins FROM users WHERE id=?', userId);
    if (!row) throw new Error('Usuario nao encontrado');
    const balance = Number(row.coins) + Number(amount);
    if (balance < 0) throw new InsufficientFunds();
    db.exec("UPDATE users SET coins=?, updated_at=datetime('now','localtime') WHERE id=?", balance, userId);
    db.exec('INSERT INTO transactions (user_id, amount, reason, type, balance_after) VALUES (?,?,?,?,?)',
      userId, amount, reason, type, balance);
    return balance;
  });
}

function coinsOf(userId) {
  const r = db.one('SELECT coins FROM users WHERE id=?', userId);
  return r ? Number(r.coins) : 0;
}

function logAdmin(adminId, action, details) {
  db.exec('INSERT INTO admin_logs (admin_id, action, details) VALUES (?,?,?)', adminId, action, details);
}

module.exports = { applyCoins, coinsOf, logAdmin, InsufficientFunds };
