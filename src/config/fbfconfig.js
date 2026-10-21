'use strict';

// Configuracao do FBF (equivalente a config/FbfConfig.java + application.properties).
// Le de variaveis de ambiente (.env carregado em server.js) com trim defensivo
// para evitar \r / espacos colados nas credenciais do Discord (invalid_client).

function trim(v) { return v == null ? '' : String(v).trim(); }

function env(name, def) {
  const v = process.env[name];
  return v === undefined || v === null ? (def === undefined ? '' : def) : v;
}

const FbfConfig = {
  baseUrl() {
    return trim(env('FBF_BASE_URL', 'http://localhost:8080')).replace(/\/+$/, '');
  },
  clientId() { return trim(env('FBF_DISCORD_CLIENT_ID', '')); },
  clientSecret() { return trim(env('FBF_DISCORD_CLIENT_SECRET', '')); },
  callback() {
    const c = trim(env('FBF_DISCORD_CALLBACK_URL', ''));
    if (c) return c;
    const b = this.baseUrl();
    return b ? b + '/auth/discord/callback' : '';
  },
  discordConfigured() {
    return !!this.clientId() && !!this.clientSecret() && !!this.callback();
  },
  devEnabled() {
    return String(trim(env('FBF_DEV_LOGIN', 'false'))).toLowerCase() === 'true';
  },
  adminIdList() {
    const raw = trim(env('FBF_DISCORD_ADMIN_IDS', ''));
    if (!raw) return [];
    return raw.split(',').map((p) => trim(p)).filter((p) => p);
  },
  isAdminDiscordId(discordId) {
    const id = trim(discordId);
    if (!id) return false;
    return this.adminIdList().includes(id);
  },
  initialCoins() {
    const n = parseInt(trim(env('FBF_INITIAL_COINS', '1000')), 10);
    return Number.isNaN(n) ? 1000 : n;
  },
  uploadDir() {
    const d = trim(env('FBF_UPLOAD_DIR', 'uploads'));
    return d || 'uploads';
  },
  webhook() { return trim(env('FBF_DISCORD_WEBHOOK_URL', '')); },
  iconWebhook() {
    const v = trim(env('FBF_DISCORD_ICON_WEBHOOK_URL', ''));
    return v || this.webhook();
  },
  port() {
    const n = parseInt(trim(env('PORT', env('FBF_PORT', '8080'))), 10);
    return Number.isNaN(n) ? 8080 : n;
  },
  sessionCookie() { return trim(env('FBF_SESSION_COOKIE', 'fbf_sid')) || 'fbf_sid'; },
  sessionDays() {
    const n = parseInt(trim(env('FBF_SESSION_DAYS', '7')), 10);
    return Number.isNaN(n) ? 7 : n;
  },
  dbFile() { return trim(env('FBF_DB_FILE', 'data/fbf.sqlite')) || 'data/fbf.sqlite'; },
};

module.exports = { FbfConfig, trim };
