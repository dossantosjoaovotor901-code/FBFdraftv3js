'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const cfg = require('./config');
const { HttpError } = require('./util');

/** Descobre o tipo real pelo conteudo (nao confia no nome enviado). */
function sniff(buf) {
  if (buf.length > 4 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return '.png';
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return '.jpg';
  if (buf.length > 4 && buf.slice(0, 4).toString() === 'GIF8') return '.gif';
  if (buf.length > 12 && buf.slice(0, 4).toString() === 'RIFF' && buf.slice(8, 12).toString() === 'WEBP') return '.webp';
  if (buf.length > 4 && buf.slice(0, 4).toString() === '%PDF') return '.pdf';
  return null;
}

/** Comprovante (imagem/PDF). Devolve a URL publica. */
function saveProof(file, prefix) {
  const ext = sniff(file.data);
  if (!ext) throw new HttpError(400, 'Envie o comprovante como imagem (PNG, JPG, WEBP, GIF) ou PDF.');
  const dir = path.join(cfg.uploadDir, 'proofs');
  fs.mkdirSync(dir, { recursive: true });
  const name = `${prefix}-${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`;
  fs.writeFileSync(path.join(dir, name), file.data);
  return '/uploads/proofs/' + name;
}

/** Imagem enviada pelo admin (cartas, escudos...). Mantem a extensao original se for segura. */
function saveImage(file) {
  const sn = sniff(file.data);
  let ext = sn && sn !== '.pdf' ? sn : null;
  if (!ext) {
    const o = path.extname(file.filename || '').toLowerCase();
    if (['.svg', '.avif', '.ico'].includes(o)) ext = o;
  }
  if (!ext) throw new HttpError(400, 'Formato de imagem nao suportado.');
  const dir = path.join(cfg.uploadDir, 'uploads');
  fs.mkdirSync(dir, { recursive: true });
  const name = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}${ext}`;
  fs.writeFileSync(path.join(dir, name), file.data);
  return '/uploads/' + name;
}

module.exports = { saveProof, saveImage };
