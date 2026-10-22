'use strict';
// Desafio "Draft Run" (gauntlet).
const { router } = require('../http');
const db = require('../db');
const hydrate = require('../hydrate');
const runs = require('../draftrun');
const { parseArr } = require('../util');

function sessionJson(s) {
  if (!s) return { session: null };
  const slots = parseArr(s.slots_json).map((o) => {
    const opts = [];
    for (const raw of o.options || []) {
      const p = db.one('SELECT * FROM players WHERE id=?', Number(raw));
      if (p) opts.push(hydrate.toJson(p));
    }
    return {
      pos: o.pos || '', x: typeof o.x === 'number' ? o.x : 50, y: typeof o.y === 'number' ? o.y : 50,
      options: opts, pick: o.pick != null ? Number(o.pick) : null,
    };
  });
  // Mesmo formato do back antigo: campos soltos (id/label/modality/slots) na raiz.
  return { id: s.id, label: s.label || '', modality: s.modality || '', slots };
}

router.get('/api/draftrun/config', () => runs.config());
router.get('/api/draftrun/current', (ctx) => runs.currentView(ctx.requireUser().id));
router.get('/api/draftrun/session', (ctx) => sessionJson(runs.sessionView(ctx.requireUser().id)));

router.post('/api/draftrun/session', async (ctx) => {
  const u = ctx.requireUser();
  const b = (await ctx.json()) || {};
  const fid = typeof b.formation_id === 'number' ? Math.trunc(b.formation_id) : null;
  return sessionJson(runs.openSession(u.id, fid));
});

router.post('/api/draftrun/session/pick', async (ctx) => {
  const u = ctx.requireUser();
  const b = (await ctx.json()) || {};
  return sessionJson(runs.pick(u.id, Math.trunc(Number(b.slot)), Math.trunc(Number(b.player_id))));
});

router.post('/api/draftrun/session/cancel', (ctx) => { runs.cancelSession(ctx.requireUser().id); return { ok: true }; });
router.post('/api/draftrun/start', (ctx) => ({ ok: true, run: runs.runJson(runs.start(ctx.requireUser().id)) }));
router.post('/api/draftrun/play', (ctx) => runs.play(ctx.requireUser().id));
router.post('/api/draftrun/abandon', (ctx) => runs.abandon(ctx.requireUser().id));
