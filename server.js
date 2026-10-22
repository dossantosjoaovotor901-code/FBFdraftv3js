'use strict';
// FBF Football Draft - backend em Node puro (sem dependencias npm).
const [maj, min] = process.versions.node.split('.').map(Number);
if (maj < 22 || (maj === 22 && min < 13)) {
  console.error(`[FBF] Node ${process.versions.node} e antigo demais. Use Node 22.13 ou superior (precisa do node:sqlite).`);
  process.exit(1);
}

const cfg = require('./src/config');
const db = require('./src/db');
const session = require('./src/session');
const seeder = require('./src/seeder');
const { createServer } = require('./src/http');

db.init();
if (cfg.seedEnabled) seeder.run();

for (const r of ['public', 'draft', 'draftrun', 'online', 'collection', 'shopx', 'admin']) require('./src/routes/' + r);

const server = createServer();
server.listen(cfg.port, cfg.host, () => {
  console.log(`[FBF] Online em http://${cfg.host}:${cfg.port} (Node ${process.versions.node}, banco ${cfg.dbPath})`);
  if (!cfg.discordConfigured()) console.log('[FBF] Login Discord nao configurado (defina FBF_DISCORD_*). FBF_DEV_LOGIN=' + cfg.devLogin);
});

// Rotinas periodicas
const timers = [
  setInterval(() => { try { session.purgeExpired(); } catch (e) { console.error(e); } }, 3600_000),
  setInterval(() => {
    try {
      db.exec("DELETE FROM online_rooms WHERE status IN ('cancelled','expired','done') AND updated_at < datetime('now','localtime','-1 day')");
      db.exec("UPDATE online_rooms SET status='expired' WHERE status='waiting' AND updated_at < datetime('now','localtime','-10 minutes')");
    } catch (e) { console.error(e); }
  }, 600_000),
];
timers.forEach((t) => t.unref());

let closing = false;
function shutdown(sig) {
  if (closing) return;
  closing = true;
  console.log(`[FBF] ${sig}: encerrando...`);
  server.close(() => { try { db.close(); } catch { /* ignore */ } process.exit(0); });
  setTimeout(() => { try { db.close(); } catch { /* ignore */ } process.exit(0); }, 8000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('unhandledRejection', (e) => console.error('[FBF] unhandledRejection', e));
