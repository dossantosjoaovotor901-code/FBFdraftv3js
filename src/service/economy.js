'use strict';

// Moedas e auditoria (equivalente a Economy.java / src/economy.js).
// applyCoins e atomico: le o saldo, valida e grava na MESMA transacao,
// registrando a movimentacao em transactions.

const { db } = require('../dao/db');

class InsufficientFunds extends Error {
  constructor() { super('Saldo insuficiente'); this.name = 'InsufficientFunds'; this.insufficientFunds = true; }
}

// Debita/credita. amount negativo = debito. Lanca InsufficientFunds se faltar saldo.
// node:sqlite e sincrono; o tx() do db abre BEGIN/COMMIT/ROLLBACK e o callback
// usa o proprio db (o Java passava Connection, aqui e o mesmo objeto).
function applyCoins(userId, amount, type, reason) {
  return db.tx(() => {
    const row = db.one('SELECT coins FROM users WHERE id=?', userId);
    if (!row) throw new Error('Usuario nao encontrado');
    const balance = row.l('coins') + Number(amount);
    if (balance < 0) throw new InsufficientFunds();
    db.exec(
      "UPDATE users SET coins=?, updated_at=to_char(now(),'YYYY-MM-DD HH24:MI:SS') WHERE id=?",
      balance, userId
    );
    db.exec(
      'INSERT INTO transactions (user_id, amount, reason, type, balance_after) VALUES (?,?,?,?,?)',
      userId, amount, reason, type, balance
    );
    return balance;
  });
}

function coinsOf(userId) {
  const r = db.one('SELECT coins FROM users WHERE id=?', userId);
  return r == null ? 0 : r.l('coins');
}

function logAdmin(adminId, action, details) {
  db.exec('INSERT INTO admin_logs (admin_id, action, details) VALUES (?,?,?)', adminId, action, details);
}

module.exports = { InsufficientFunds, applyCoins, coinsOf, logAdmin };
