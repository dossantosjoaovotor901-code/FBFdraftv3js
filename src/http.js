'use strict';
// Servidor HTTP em Node puro: router, cookies, JSON, multipart, estaticos (com gzip/ETag).
const http = require('http');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const cfg = require('./config');
const session = require('./session');
const db = require('./db');
const { HttpError } = require('./util');

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.avif': 'image/avif', '.ico': 'image/x-icon',
  '.pdf': 'application/pdf', '.woff': 'font/woff', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.mp4': 'video/mp4', '.webm': 'video/webm',
};
const COMPRESSIBLE = /^(text\/|application\/(javascript|json)|image\/svg)/;

// ---------------- Router ----------------
const routes = [];
function add(method, pattern, handler) {
  const keys = [];
  const re = new RegExp('^' + pattern.replace(/\/:([A-Za-z_]+)/g, (_, k) => { keys.push(k); return '/([^/]+)'; }) + '/?$');
  routes.push({ method, re, keys, handler });
}
const router = {
  get: (p, h) => add('GET', p, h), post: (p, h) => add('POST', p, h),
  put: (p, h) => add('PUT', p, h), del: (p, h) => add('DELETE', p, h),
};

// ---------------- Contexto da requisicao ----------------
function parseCookies(h) {
  const out = {};
  if (!h) return out;
  for (const part of h.split(';')) {
    const i = part.indexOf('=');
    if (i < 1) continue;
    const k = part.slice(0, i).trim();
    if (!(k in out)) { try { out[k] = decodeURIComponent(part.slice(i + 1).trim()); } catch { out[k] = part.slice(i + 1).trim(); } }
  }
  return out;
}

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { reject(new HttpError(413, 'Corpo da requisicao grande demais')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

/** Parser multipart/form-data simples (campos de texto + arquivos em memoria). */
function parseMultipart(buf, boundary) {
  const fields = {}, files = {};
  const delim = Buffer.from('--' + boundary);
  let pos = buf.indexOf(delim);
  while (pos !== -1) {
    const start = pos + delim.length;
    if (buf[start] === 0x2d && buf[start + 1] === 0x2d) break;           // "--" final
    const hdrStart = start + 2;                                          // pula CRLF
    const hdrEnd = buf.indexOf('\r\n\r\n', hdrStart);
    if (hdrEnd === -1) break;
    const headers = buf.slice(hdrStart, hdrEnd).toString('utf8');
    const next = buf.indexOf(delim, hdrEnd + 4);
    if (next === -1) break;
    const data = buf.slice(hdrEnd + 4, next - 2);                        // remove CRLF antes do delimitador
    const name = /name="([^"]*)"/i.exec(headers);
    const fn = /filename="([^"]*)"/i.exec(headers);
    if (name) {
      if (fn) { if (fn[1] !== '' || data.length) files[name[1]] = { filename: fn[1], data }; }
      else fields[name[1]] = data.toString('utf8');
    }
    pos = next;
  }
  return { fields, files };
}

class Ctx {
  constructor(req, res, url) {
    this.req = req; this.res = res; this.url = url;
    this.query = Object.fromEntries(url.searchParams);
    this.params = {};
    this.cookies = parseCookies(req.headers.cookie);
    this.sid = this.cookies[cfg.cookieName] || null;
    this._user = undefined;
    this.setCookies = [];
    this._raw = null;
  }
  get user() {
    if (this._user === undefined) {
      this._user = null;
      const data = session.read(this.sid);
      const uid = data ? Number.parseInt(data.userId, 10) : 0;
      if (uid > 0) this._user = db.one('SELECT * FROM users WHERE id=?', uid);
    }
    return this._user;
  }
  requireUser() { const u = this.user; if (!u) throw new HttpError(401, 'Nao autenticado'); return u; }
  requireAdmin() {
    const u = this.requireUser();
    if (!u.is_admin) throw new HttpError(403, 'Acesso restrito a administradores');
    return u;
  }
  async raw(limit = 2 * 1024 * 1024) { if (!this._raw) this._raw = await readBody(this.req, limit); return this._raw; }
  /** Corpo JSON (objeto, array ou null se vazio). */
  async json() {
    const b = (await this.raw()).toString('utf8');
    if (!b.trim()) return null;
    try { return JSON.parse(b); } catch { throw new HttpError(400, 'JSON invalido'); }
  }
  async multipart() {
    const ct = this.req.headers['content-type'] || '';
    const m = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(ct);
    if (!/multipart\/form-data/i.test(ct) || !m) throw new HttpError(400, 'Envie o formulario como multipart/form-data');
    return parseMultipart(await this.raw(10 * 1024 * 1024), m[1] || m[2]);
  }
  setCookie(name, value, maxAgeSec) {
    let c = `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSec}`;
    if (cfg.secureCookie) c += '; Secure';
    this.setCookies.push(c);
  }
  redirect(location) { this.send(302, null, { Location: location }); }
  send(status, body, headers = {}) {
    const res = this.res;
    if (res.headersSent) return;
    const h = { 'X-Content-Type-Options': 'nosniff', ...headers };
    if (this.setCookies.length) h['Set-Cookie'] = this.setCookies;
    let buf = null;
    if (body !== null && body !== undefined) {
      if (Buffer.isBuffer(body)) buf = body;
      else { buf = Buffer.from(JSON.stringify(body)); h['Content-Type'] = 'application/json; charset=utf-8'; h['Cache-Control'] = 'no-store'; }
    }
    const ae = this.req.headers['accept-encoding'] || '';
    if (buf && buf.length > 1024 && /\bgzip\b/.test(ae) && COMPRESSIBLE.test(h['Content-Type'] || '') && !h['Content-Encoding']) {
      zlib.gzip(buf, { level: 4 }, (err, z) => {
        if (err) { res.writeHead(status, { ...h, 'Content-Length': buf.length }); res.end(buf); return; }
        h['Content-Encoding'] = 'gzip'; h.Vary = 'Accept-Encoding'; h['Content-Length'] = z.length;
        res.writeHead(status, h); res.end(z);
      });
      return;
    }
    if (buf) h['Content-Length'] = buf.length;
    res.writeHead(status, h);
    res.end(this.req.method === 'HEAD' ? undefined : buf);
  }
}

// ---------------- Estaticos ----------------
const gzCache = new Map();
function serveFile(ctx, file, opts = {}) {
  let st;
  try { st = fs.statSync(file); } catch { return false; }
  if (!st.isFile()) return false;
  const ext = path.extname(file).toLowerCase();
  const type = MIME[ext] || 'application/octet-stream';
  const etag = `W/"${st.size.toString(16)}-${Math.floor(st.mtimeMs).toString(16)}"`;
  const h = { 'Content-Type': type, ETag: etag, 'Last-Modified': st.mtime.toUTCString() };
  h['Cache-Control'] = opts.cache || (ext === '.html' ? 'no-cache' : /\.(js|css)$/.test(ext) ? 'public, max-age=300' : 'public, max-age=86400');
  if (opts.csp) h['Content-Security-Policy'] = opts.csp;
  if (ctx.req.headers['if-none-match'] === etag) { ctx.send(304, null, h); return true; }
  const ae = ctx.req.headers['accept-encoding'] || '';
  if (COMPRESSIBLE.test(type) && st.size > 1024 && /\bgzip\b/.test(ae)) {
    const key = file + '|' + etag;
    let z = gzCache.get(key);
    if (!z) { z = zlib.gzipSync(fs.readFileSync(file), { level: 6 }); if (gzCache.size > 300) gzCache.clear(); gzCache.set(key, z); }
    ctx.send(200, z, { ...h, 'Content-Encoding': 'gzip', Vary: 'Accept-Encoding' });
    return true;
  }
  if (ctx.req.method === 'HEAD') { ctx.send(200, null, { ...h, 'Content-Length': st.size }); return true; }
  const res = ctx.res;
  res.writeHead(200, { ...h, 'Content-Length': st.size, 'X-Content-Type-Options': 'nosniff' });
  fs.createReadStream(file).pipe(res);
  return true;
}

/** Resolve `rel` dentro de `base` (bloqueia ../). */
function safeJoin(base, rel) {
  let dec;
  try { dec = decodeURIComponent(rel); } catch { return null; }
  if (dec.includes('\0')) return null;
  const full = path.resolve(base, '.' + path.sep + dec);
  return full === base || full.startsWith(base + path.sep) ? full : null;
}

const UPLOAD_CSP = "default-src 'none'; style-src 'unsafe-inline'; sandbox";
function serveUpload(ctx, rel) {
  // /uploads/proofs/x -> <dir>/proofs/x ; /uploads/x -> <dir>/uploads/x (layout herdado) ou <dir>/x
  const cands = rel.startsWith('proofs/') ? [safeJoin(cfg.uploadDir, rel)]
    : [safeJoin(path.join(cfg.uploadDir, 'uploads'), rel), safeJoin(cfg.uploadDir, rel)];
  for (const f of cands) if (f && serveFile(ctx, f, { csp: UPLOAD_CSP, cache: 'public, max-age=86400' })) return true;
  return false;
}

// ---------------- Servidor ----------------
async function handle(req, res) {
  const url = new URL(req.url, 'http://x');
  const ctx = new Ctx(req, res, url);
  const t0 = Date.now();
  try {
    const p = url.pathname;
    const m = req.method === 'HEAD' ? 'GET' : req.method;
    for (const r of routes) {
      if (r.method !== m) continue;
      const mm = r.re.exec(p);
      if (!mm) continue;
      r.keys.forEach((k, i) => { ctx.params[k] = decodeURIComponent(mm[i + 1]); });
      const out = await r.handler(ctx);
      if (out !== undefined && !res.headersSent) ctx.send(200, out);
      return;
    }
    if (m === 'GET') {
      if (p === '/' || p === '/index.html') { if (serveFile(ctx, path.join(cfg.publicDir, 'index.html'))) return; }
      else if (p.startsWith('/uploads/')) { if (serveUpload(ctx, p.slice(9))) return; }
      else if (!p.startsWith('/api/') && !p.startsWith('/auth/')) {
        const f = safeJoin(cfg.publicDir, p);
        if (f && serveFile(ctx, f)) return;
      }
    }
    ctx.send(404, { error: 'Nao encontrado' });
  } catch (e) {
    if (e instanceof HttpError) ctx.send(e.status, { error: e.message });
    else {
      console.error(`[FBF] Erro em ${req.method} ${url.pathname}:`, e);
      ctx.send(500, { error: 'Erro interno: ' + (e && e.message ? e.message : 'desconhecido') });
    }
  } finally {
    if (cfg.logRequests) console.log(`${req.method} ${url.pathname} ${res.statusCode} ${Date.now() - t0}ms`);
  }
}

function createServer() {
  const server = http.createServer((req, res) => { handle(req, res).catch((e) => { console.error(e); try { res.end(); } catch { /* ignore */ } }); });
  server.keepAliveTimeout = 65_000;
  server.requestTimeout = 60_000;
  return server;
}

module.exports = { router, createServer, routes };
