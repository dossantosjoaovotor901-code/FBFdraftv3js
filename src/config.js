'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

/** Le um arquivo .env simples (KEY=VALUE). Nao sobrescreve variaveis ja definidas no ambiente. */
function loadEnvFile(file) {
  let txt;
  try { txt = fs.readFileSync(file, 'utf8'); } catch { return; }
  for (const raw of txt.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
    if (process.env[key] === undefined) process.env[key] = val;
  }
}
loadEnvFile(path.join(process.cwd(), '.env'));
if (path.resolve(process.cwd()) !== ROOT) loadEnvFile(path.join(ROOT, '.env'));

const env = (k, def = '') => {
  const v = process.env[k];
  return v === undefined || v === null ? def : String(v).trim();   // trim defensivo (\r / espacos colados)
};
const bool = (k, def) => {
  const v = env(k, '');
  if (v === '') return def;
  return ['1', 'true', 'yes', 'on', 'sim'].includes(v.toLowerCase());
};
const num = (k, def) => {
  const n = Number.parseInt(env(k, ''), 10);
  return Number.isFinite(n) ? n : def;
};
const resolveP = (p) => (path.isAbsolute(p) ? p : path.resolve(process.cwd(), p));

const baseUrl = env('FBF_BASE_URL', 'http://localhost:8080').replace(/\/+$/, '');
const callbackRaw = env('FBF_DISCORD_CALLBACK_URL', '');
const webhook = env('FBF_DISCORD_WEBHOOK_URL', '');

const cfg = {
  ROOT,
  port: num('PORT', num('FBF_PORT', 8080)),
  host: env('HOST', '0.0.0.0'),
  baseUrl,
  clientId: env('FBF_DISCORD_CLIENT_ID', ''),
  clientSecret: env('FBF_DISCORD_CLIENT_SECRET', ''),
  callback: callbackRaw || (baseUrl ? baseUrl + '/auth/discord/callback' : ''),
  adminIds: env('FBF_DISCORD_ADMIN_IDS', '').split(',').map((s) => s.trim()).filter(Boolean),
  webhook,
  iconWebhook: env('FBF_DISCORD_ICON_WEBHOOK_URL', '') || webhook,
  devLogin: bool('FBF_DEV_LOGIN', false),
  initialCoins: num('FBF_INITIAL_COINS', 1000),
  uploadDir: resolveP(env('FBF_UPLOAD_DIR', './uploads')),
  dbPath: resolveP(env('FBF_DB_PATH', './data/fbf.sqlite')),
  cookieName: env('FBF_SESSION_COOKIE', 'fbf_sid'),
  sessionDays: Math.max(1, num('FBF_SESSION_DAYS', 7)),
  seedEnabled: bool('FBF_SEED_ENABLED', true),
  publicDir: path.join(ROOT, 'public'),
  importDir: path.join(ROOT, 'seed'),
  secureCookie: bool('FBF_COOKIE_SECURE', /^https:/i.test(baseUrl)),
  logRequests: bool('FBF_LOG_REQUESTS', false),
};
cfg.discordConfigured = () => !!(cfg.clientId && cfg.clientSecret && cfg.callback);
cfg.isAdminDiscordId = (id) => !!id && cfg.adminIds.includes(String(id).trim());

module.exports = cfg;
