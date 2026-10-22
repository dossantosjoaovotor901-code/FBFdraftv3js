'use strict';
// Smoke test: sobe o servidor com banco temporario e exercita as rotas principais.
const { spawn } = require('child_process');
const fs = require('fs'), os = require('os'), path = require('path');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fbf-'));
const PORT = 3900 + Math.floor(Math.random() * 90);
const base = `http://127.0.0.1:${PORT}`;
const srv = spawn(process.execPath, ['--no-warnings', path.join(__dirname, '..', 'server.js')], {
  env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1', FBF_DB_PATH: path.join(dir, 't.db'), FBF_UPLOAD_DIR: path.join(dir, 'up'), FBF_DEV_LOGIN: 'true' },
  stdio: ['ignore', 'pipe', 'inherit'],
});
let ready; const up = new Promise((r) => { ready = r; });
srv.stdout.on('data', (d) => { if (String(d).includes('Online em')) ready(); });

let pass = 0, fail = 0;
const ok = (c, msg, extra) => { if (c) pass++; else { fail++; console.log('  FAIL:', msg, extra !== undefined ? JSON.stringify(extra).slice(0, 300) : ''); } };

class Client {
  constructor() { this.cookie = ''; }
  async req(method, url, body, raw) {
    const headers = { cookie: this.cookie };
    let b = body;
    if (body && !raw) { headers['content-type'] = 'application/json'; b = JSON.stringify(body); }
    const r = await fetch(base + url, { method, headers, body: b, redirect: 'manual' });
    const sc = r.headers.getSetCookie?.() || [];
    for (const c of sc) { const kv = c.split(';')[0]; this.cookie = kv.endsWith('=') ? '' : kv; }
    const t = await r.text();
    let j = null; try { j = JSON.parse(t); } catch { /* not json */ }
    return { status: r.status, json: j, text: t };
  }
  get(u) { return this.req('GET', u); }
  post(u, b) { return this.req('POST', u, b ?? {}); }
  put(u, b) { return this.req('PUT', u, b ?? {}); }
  del(u) { return this.req('DELETE', u); }
}

(async () => {
  await up;
  const adm = new Client(), a = new Client(), b = new Client();

  console.log('# publico / auth');
  let r = await adm.get('/api/health'); ok(r.json.backend === 'node', 'health', r.json);
  r = await adm.get('/'); ok(r.status === 200 && r.text.includes('<html'), 'index', r.status);
  r = await adm.get('/api/me'); ok(r.json.user === null, 'me anon', r.json);
  r = await adm.get('/api/collection'); ok(r.status === 401, 'collection 401', r.status);
  r = await adm.get('/api/admin/stats'); ok(r.status === 401, 'admin 401', r.status);
  r = await adm.post('/auth/dev-login', { username: 'Chefe', discord_id: 'dev-chefe', admin: true }); ok(r.json.ok, 'dev login admin', r);
  r = await a.post('/auth/dev-login', { username: 'Ana' }); ok(r.json.ok, 'login a');
  r = await b.post('/auth/dev-login', { username: 'Beto' }); ok(r.json.ok, 'login b');
  r = await a.get('/api/admin/stats'); ok(r.status === 403, 'admin 403 p/ comum', r.status);
  r = await a.get('/api/me'); ok(r.json.user && r.json.user.coins > 0, 'moedas iniciais', r.json);
  const coins0 = r.json.user.coins;
  r = await adm.get('/api/admin/stats'); ok(r.json.users === 3, 'stats', r.json);

  console.log('# admin: jogadores');
  r = await adm.get('/api/rarities'); const rars = r.json.rarities; ok(rars.length > 0, 'raridades');
  r = await adm.get('/api/models'); ok(r.json.models.length > 0, 'modelos');
  r = await adm.get('/api/teams'); ok(r.json.teams.length > 0, 'times');
  const pos = ['GK', 'CB', 'CB', 'LB', 'RB', 'CM', 'CM', 'CAM', 'LW', 'RW', 'ST', 'ST', 'GK', 'CM', 'ST', 'CB'];
  const ids = [];
  for (let i = 0; i < 24; i++) {
    const p = pos[i % pos.length];
    r = await adm.post('/api/admin/players', { name: `Jog ${i}`, position: p, positions: p, overall: 60 + (i % 30), rarity_id: rars[i % rars.length].id, is_gk: p === 'GK', fin: 70, pas: 70, ctl: 70 });
    ok(r.json.ok, 'criar jogador', r); ids.push(r.json.id);
  }
  r = await adm.put(`/api/admin/players/${ids[0]}`, { photo: null, description: 'x' }); ok(r.json.ok, 'update player', r);
  r = await adm.post('/api/admin/players/bulk', { text: 'NICK: Bulk (KUN)\nPOSICAO: pv\nFIN: 80\nPAS: 70\nCTL: 71\nSKL: 72\nDEF: 40\nJDC: 60\nOVER: 82\n' });
  ok(r.json.ok && r.json.created === 1, 'bulk', r.json);
  r = await adm.get('/api/players'); ok(r.json.players.length === 25, 'listar jogadores', r.json.players.length);
  r = await a.get(`/api/players/${ids[1]}`); ok(r.json.player && r.json.player.name === 'Jog 1', 'player by id', r.json);

  console.log('# pacotes / colecao');
  r = await a.get('/api/packs'); ok(r.json.packs.length > 0, 'packs');
  const pack = r.json.packs.sort((x, y) => x.price - y.price)[0];
  await adm.post(`/api/admin/users/${r.json ? 2 : 2}/coins`, { amount: 100000, reason: 'teste' });
  r = await a.get('/api/me'); const uidA = r.json.user.id;
  await adm.post(`/api/admin/users/${uidA}/coins`, { amount: 100000 });
  for (let i = 0; i < 4; i++) { r = await a.post(`/api/packs/${pack.id}/open`); ok(r.json.ok && r.json.cards.length > 0, 'abrir pack', r.json); }
  r = await a.get('/api/collection'); ok(r.json.total >= 4, 'colecao', r.json.total);
  r = await a.get('/api/me/live'); ok(r.json.card_count === r.json.card_count && r.json.coins > 0, 'live', r.json);
  // da cartas suficientes para os dois times
  for (const [cl, nm] of [[a, 'a'], [b, 'b']]) {
    const me = (await cl.get('/api/me')).json.user;
    await adm.post(`/api/admin/users/${me.id}/cards`, { player_ids: ids.slice(0, 16) });
    await adm.post(`/api/admin/users/${me.id}/coins`, { amount: 50000 });
  }

  console.log('# draft / meu time');
  r = await a.get('/api/formations'); const fs_ = r.json.formations; ok(fs_.length > 0, 'formacoes');
  const f = fs_[0];
  const def = JSON.parse(f.slots_json);
  r = await a.get('/api/draft/my-cards'); ok(r.json.items.length > 0, 'my-cards', r.json.total);
  async function build(cl, form) {
    const d = JSON.parse(form.slots_json);
    const cards = (await cl.get('/api/draft/my-cards')).json.items;
    const pool = cards.map((i) => ({ pid: i.player.id, uc: [...i.user_card_ids], pos: i.player.position }));
    const slots = [], used = new Set();
    for (const s of d) {
      const cand = pool.find((p) => p.uc.length && !used.has(p.pid) && p.pos === s.pos) || pool.find((p) => p.uc.length && !used.has(p.pid));
      used.add(cand.pid);
      slots.push({ pos: s.pos, user_card_id: cand.uc.shift(), player_id: cand.pid });
    }
    return cl.post('/api/draft/save', { mode: 'own', formation_id: form.id, slots });
  }
  r = await build(a, f); ok(r.json.ok && r.json.rating > 0, 'salvar time A', r);
  r = await build(b, f); ok(r.json.ok, 'salvar time B', r);
  r = await a.post('/api/draft/save', { mode: 'own', formation_id: f.id, slots: def.map((s) => ({ pos: s.pos })) }); ok(r.status === 400, 'save invalido', r.status);
  r = await a.get('/api/draft/team'); ok(r.json.squad && r.json.squad.slots.length === def.length, 'team', r.json);
  r = await a.post('/api/draft/team-meta', { squad_name: 'Ana FC', squad_crest: '⚽' }); ok(r.json.ok && r.json.squad_name === 'Ana FC', 'team-meta', r.json);
  r = await a.get('/api/draft/crests'); ok(r.json.presets.length === 16, 'crests');
  r = await a.post('/api/draft/evaluate', { slots: [{ pos: 'ST', player_id: ids[10] }], modality: null }); ok(typeof r.json.rating === 'number', 'evaluate', r.json);

  console.log('# partida vs bot');
  r = await a.get('/api/match/opponents'); ok(r.json.bots.length > 0, 'opponents', r.json);
  r = await a.post('/api/match/play', { type: 'bot', difficulty: r.json.bots[0].key });
  ok(r.json.ok && ['win', 'draw', 'loss'].includes(r.json.result) && Array.isArray(r.json.events), 'play', r);
  r = await a.get('/api/match/history'); ok(r.json.matches.length >= 1 && r.json.stats.played >= 1, 'history', r.json);
  r = await a.get('/api/match/ranking'); ok(r.json.ranking.length >= 1, 'ranking');
  r = await a.get('/api/match/rewards'); ok(r.json.rewards.length > 1, 'rewards');

  console.log('# online');
  r = await a.get('/api/online/overview'); ok(r.json.squad && r.json.online_reward, 'overview', r.json);
  r = await a.post('/api/online/queue', { mode: 'team' }); ok(r.json.status === 'searching', 'a busca', r.json);
  r = await b.post('/api/online/queue', { mode: 'team' }); ok(r.json.status === 'matched' && r.json.match.ok, 'b pareia', r.json);
  r = await a.get('/api/online/queue'); ok(r.json.status === 'matched' && r.json.match.me.name === 'Ana FC', 'a recebe', r.json);
  r = await a.get('/api/online/queue'); ok(r.json.status === 'idle', 'a idle');
  r = await a.post('/api/online/queue', { mode: 'random' }); ok(r.json.status === 'searching', 'random a', r.json);
  r = await b.post('/api/online/queue', { mode: 'random' }); ok(r.json.status === 'matched', 'random b', r.json);
  await a.get('/api/online/queue');
  r = await a.post('/api/online/queue', { mode: 'random' }); ok(r.json.status === 'searching', 'random a2');
  r = await a.post('/api/online/queue/cancel'); ok(r.json.status === 'idle', 'cancel');
  const uidB = (await b.get('/api/me')).json.user.id;
  r = await a.get('/api/online/players'); ok(r.json.players.length >= 1, 'online players');
  r = await a.post('/api/online/quick', { opponent_id: uidB }); ok(r.json.ok, 'quick', r);
  r = await a.post('/api/online/quick', { opponent_id: uidB }); ok(r.status === 429 || r.json.ok, 'quick cooldown', r.status);

  console.log('# mercado / loja');
  r = await a.get('/api/market/shop'); ok(Array.isArray(r.json.listings), 'shop', r.json);
  r = await adm.post('/api/admin/shop/refresh'); ok(r.json.ok, 'shop refresh', r);
  r = await a.get('/api/market/shop'); ok(r.json.listings.length > 0, 'shop populada', r.json.listings.length);
  if (r.json.listings.length) { const l = r.json.listings[0]; const rr = await a.post(`/api/market/shop/${l.id}/buy`); ok(rr.json.ok || rr.status === 400, 'comprar na loja', rr); }
  const col = (await b.get('/api/draft/my-cards')).json.items;
  const sellable = col.find((i) => i.user_card_ids.length > 1) || col[col.length - 1];
  r = await b.get(`/api/market/limits/${sellable.user_card_ids[0]}`); ok(r.json.sellable !== undefined, 'limits', r.json);
  r = await b.post('/api/market', { user_card_id: sellable.user_card_ids[0], price: r.json.min }); ok(r.json.ok, 'anunciar', r);
  const lid = r.json.id;
  r = await a.get('/api/market'); ok(r.json.listings.some((l) => l.id === lid), 'listagem');
  r = await a.post(`/api/market/${lid}/buy`); ok(r.json.ok, 'comprar', r);
  r = await b.get('/api/market/mine'); ok(r.json.listings.length >= 1, 'mine');

  console.log('# draft run');
  r = await a.get('/api/draftrun/config'); ok(r.json, 'dr config', r.json);
  r = await a.get('/api/draftrun/current'); ok('run' in r.json, 'dr current', r.json);
  r = await a.post('/api/draftrun/session', { formation_id: f.id }); ok(r.status === 200 && r.json.slots, 'dr session', r);
  if (r.json.slots) {
    for (let i = 0; i < r.json.slots.length; i++) {
      const s = (await a.get('/api/draftrun/session')).json.slots[i];
      if (s.pick == null && s.options.length) { const pr = await a.post('/api/draftrun/session/pick', { slot: i, player_id: s.options[0].id }); ok(pr.status === 200, 'dr pick', pr); }
    }
    r = await a.post('/api/draftrun/start'); ok(r.json.ok, 'dr start', r);
    r = await a.post('/api/draftrun/play'); ok(r.status === 200, 'dr play', r);
    r = await a.post('/api/draftrun/abandon'); ok(r.status === 200, 'dr abandon', r);
  }

  console.log('# carta pessoal / lojinha');
  r = await a.get('/api/selfcard'); ok(r.json.config, 'selfcard', r.json);
  r = await a.get('/api/selfcard/buy-info'); ok('pix' in r.json, 'buy-info', r.json);
  r = await a.post('/api/selfcard/claim', { code: 'XXXX' }); ok(r.status >= 400, 'claim invalido', r.status);
  r = await a.get('/api/cashshop'); ok(r.json && 'products' in r.json, 'cashshop', r.json);
  await adm.post('/api/admin/cashshop/config', { cashshop_enabled: '1', cashshop_pix_key: 'k' });
  r = await adm.post('/api/admin/cashshop/products', { kind: 'coins', title: 'Moedas', price: 500, coins_amount: 1000 }); ok(r.json.ok, 'produto', r);
  const prodId = r.json.id;
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  const fd = new FormData(); fd.append('product_id', String(prodId)); fd.append('proof', new Blob([png], { type: 'image/png' }), 'c.png');
  r = await a.req('POST', '/api/cashshop/order', fd, true); ok(r.json && r.json.ok, 'pedido pix', r);
  if (r.json && r.json.order) {
    ok(/^\/uploads\/proofs\/.+\.png$/.test(r.json.order.proof_url), 'ext png', r.json.order.proof_url);
    const pr = await a.get(r.json.order.proof_url); ok(pr.status === 200, 'serve upload', pr.status);
    const before = (await a.get('/api/me')).json.user.coins;
    r = await adm.post(`/api/admin/cashshop/orders/${r.json.order.id}/approve`); ok(r.json.ok, 'aprovar', r);
    const after = (await a.get('/api/me')).json.user.coins; ok(after === before + 1000, 'creditou moedas', [before, after]);
  }
  const fd2 = new FormData(); fd2.append('image', new Blob([png], { type: 'image/png' }), 'x.png');
  r = await adm.req('POST', '/api/admin/upload', fd2, true); ok(r.json && /^\/uploads\//.test(r.json.url), 'admin upload', r);
  r = await a.get('/api/cashshop/xx'); ok(r.status === 404, '404 api', r.status);

  console.log('# admin geral');
  for (const u of ['packs', 'users', 'transactions', 'logs', 'shop', 'events', 'bots', 'maintenance', 'draft-rewards', 'cashshop']) {
    r = await adm.get('/api/admin/' + u); ok(r.status === 200, 'admin ' + u, r.status);
  }
  r = await adm.put('/api/admin/maintenance', { on: true, message: 'm' }); ok(r.json.ok, 'maint set');
  r = await a.get('/api/maintenance'); ok(r.json.on === true, 'maint on', r.json);
  await adm.put('/api/admin/maintenance', { on: false });
  r = await adm.post('/api/admin/events', { name: 'Ev', active: true, pack_ids: JSON.stringify([pack.id]) }); ok(r.json.ok, 'event create', r);
  r = await a.get('/api/event/active'); ok(r.json.event && r.json.event.packs.length === 1, 'event active', r.json);
  r = await adm.post('/api/admin/bots', { name: 'Bot X', key: 'botx', card_ids: JSON.stringify(ids.slice(0, 5)) }); ok(r.json.ok, 'bot create', r);
  r = await a.post('/api/match/play', { type: 'bot', difficulty: 'botx' }); ok(r.status === 200 || r.status === 429, 'bot cartas reais', r.status);
  r = await adm.del(`/api/admin/players/${ids[2]}`); ok(r.json.ok, 'soft delete');
  r = await a.post('/auth/logout'); ok(r.json.ok, 'logout');
  r = await a.get('/api/me'); ok(r.json.user === null, 'sessao encerrada');
  r = await adm.get('/api/admin/%2e%2e/%2e%2e/etc/passwd'); ok(r.status !== 200 || !r.text.includes('root:'), 'path traversal');
  r = await adm.get('/css/../../package.json'); ok(!r.text.includes('"engines"'), 'traversal estatico', r.status);

  console.log(`\n${pass} ok, ${fail} falhas`);
})().catch((e) => { console.error(e); fail++; }).finally(() => { srv.kill('SIGTERM'); setTimeout(() => process.exit(fail ? 1 : 0), 500); });
