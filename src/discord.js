'use strict';
// Avisos no Discord via Webhook. Tudo "best effort": nunca derruba a requisicao do jogador.
const cfg = require('./config');
const db = require('./db');
const hydrate = require('./hydrate');
const { orEmpty } = require('./util');

const RARITY_COLOR = { Icon: 0xf1c40f, Lendario: 0x9b59b6, Hero: 0xe67e22, Ouro: 0xd4af37, Prata: 0xbdc3c7, Bronze: 0xcd7f32, Pessoal: 0x1abc9c };
const rarityColor = (name) => (name && RARITY_COLOR[name]) || 0x5865F2;
const trim = (v) => (v == null ? '' : String(v).trim());

function absUrl(u) {
  u = trim(u);
  if (!u) return null;
  if (/^https?:\/\//i.test(u)) return u;
  if (!cfg.baseUrl) return null;
  return cfg.baseUrl + (u.startsWith('/') ? '' : '/') + u;
}

async function post(url, payload) {
  url = trim(url);
  if (!url) return 'no_webhook';
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10_000),
    });
    if (r.status >= 300) {
      const body = await r.text().catch(() => '');
      console.warn(`[FBF] Webhook Discord respondeu ${r.status}: ${body.slice(0, 300)}`);
      return 'http_' + r.status;
    }
    return 'ok';
  } catch (e) {
    console.warn('[FBF] Falha ao enviar webhook Discord: ' + e.message);
    return 'network';
  }
}

/** Dispara sem esperar (a resposta ao jogador nao depende do Discord). */
function sendEmbed(embed, webhook, username) {
  const payload = { embeds: [embed] };
  if (username) payload.username = username;
  post(webhook, payload).catch(() => {});
}

const field = (name, value, inline) => ({ name, value, inline });
const n = (v) => (v == null || v === '' ? '0' : String(v));
const whoOf = (u, def) => {
  if (!u) return def;
  const g = trim(u.global_name);
  return g || trim(u.username) || def;
};

function announceIconCard(p, winnerName) {
  if (!p) return;
  let rar = p.rarity_name;
  if (rar == null) { const r = hydrate.rarityOf(p); rar = r ? r.name || '' : ''; }
  const embed = {
    title: `Carta ${rar} conquistada!`,
    description: `**${trim(winnerName) || 'Um treinador'}** acabou de garantir uma carta **${rar}**!`,
    color: rarityColor(rar),
  };
  const fields = [field('Jogador', trim(p.name), true), field('Nota', String(Math.round(p.overall || 0)), true),
    field('Posicao', trim(p.position) || '-', true)];
  if (p.is_gk) {
    fields.push(field(`DIV ${n(p.gk_div)} | MAN ${n(p.gk_han)} | CHU ${n(p.gk_kic)}`, `REF ${n(p.gk_ref)} | VEL ${n(p.gk_spd)} | POS ${n(p.gk_pos)}`, false));
  } else {
    const fin = p.fin != null ? p.fin : p.sho;
    const ctl = p.ctl != null ? p.ctl : p.dri;
    const skl = p.skl != null ? p.skl : p.dri;
    const jdc = p.jdc != null ? p.jdc : p.phy;
    fields.push(field(`FIN ${n(fin)} | PAS ${n(p.pas)} | CTL ${n(ctl)}`, `SKL ${n(skl)} | DEF ${n(p.def)} | JDC ${n(jdc)}`, false));
  }
  const t = hydrate.teamOf(p);
  if (t) fields.push(field('Time', trim(t.name), true));
  if (p.country != null) fields.push(field('Pais', trim(p.country), true));
  embed.fields = fields;
  embed.footer = { text: 'FBF Football Draft' };
  embed.timestamp = new Date().toISOString();
  const img = absUrl(p.photo);
  if (img) embed.image = { url: img };
  sendEmbed(embed, cfg.iconWebhook, null);
}

/** Avisa no Discord as cartas Icon entre as ganhas. Chamado em TODOS os pontos onde o usuario ganha cartas. */
function notifyIconCards(userId, playerIds) {
  try {
    if (!cfg.iconWebhook || !playerIds || !playerIds.length) return;
    const u = db.one('SELECT username, global_name FROM users WHERE id=?', userId);
    const winner = whoOf(u, 'Um treinador');
    const seen = new Set();
    for (const pid of playerIds) {
      if (pid == null || seen.has(pid)) continue;
      seen.add(pid);
      const p = db.one('SELECT * FROM players WHERE id=?', pid);
      if (!p) continue;
      const r = hydrate.rarityOf(p);
      if (!r || r.name !== 'Icon') continue;
      announceIconCard(p, winner);
    }
  } catch (e) {
    console.warn('[FBF] notifyIconCards falhou: ' + e.message);
  }
}

function announceSelfcardOrder(order, user) {
  if (!cfg.webhook) return;
  const embed = {
    title: 'Novo pedido de carta pessoal (PIX)',
    description: `**${whoOf(user, 'Um jogador')}** enviou um comprovante e aguarda a liberacao da carta.`,
    color: rarityColor('Pessoal'),
  };
  const fields = [field('Pedido', '#' + order.id, true), field('Nome da carta', trim(order.card_name) || '-', true),
    field('Posicao', trim(order.position) || '-', true)];
  if (user && user.discord_id != null) fields.push(field('Discord ID', trim(user.discord_id), true));
  embed.fields = fields;
  embed.footer = { text: 'FBF Football Draft - Aprove no painel admin' };
  embed.timestamp = new Date().toISOString();
  const img = absUrl(order.proof_url);
  if (img) embed.image = { url: img };
  sendEmbed(embed, cfg.webhook, 'FBF Football Draft');
}

const BRL = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function announceCashOrder(order, user) {
  if (!cfg.webhook || !order) return;
  const embed = {
    title: 'Nova compra na Lojinha (PIX)',
    description: `**${whoOf(user, 'Um jogador')}** enviou um comprovante e aguarda a liberacao do item.`,
    color: 0x2ecc71,
  };
  const fields = [field('Pedido', '#' + order.id, true), field('Produto', trim(order.title) || '-', true),
    field('Valor', 'R$ ' + BRL.format((Number(order.amount) || 0) / 100), true)];
  if (user && user.discord_id != null) fields.push(field('Discord ID', trim(user.discord_id), true));
  embed.fields = fields;
  embed.footer = { text: 'FBF Football Draft - Aprove no painel admin (aba Lojinha)' };
  embed.timestamp = new Date().toISOString();
  const img = absUrl(order.proof_url);
  if (img) embed.image = { url: img };
  sendEmbed(embed, cfg.webhook, 'FBF Football Draft');
}

module.exports = { notifyIconCards, announceSelfcardOrder, announceCashOrder, absUrl, orEmpty };
