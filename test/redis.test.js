'use strict';

// Dos copias del servidor (como en Vercel) que comparten las partidas por Redis.
// Ana se conecta a una copia y Luis a otra: tienen que jugar la misma partida.
const test = require('node:test');
const assert = require('node:assert/strict');
const WebSocket = require('ws');
const RedisMock = require('ioredis-mock');
const { createAppServer } = require('../src/server');
const { RedisStore } = require('../src/store');

function listen(server) {
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server.address().port)));
}

function client(port, opened) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  opened.push(ws);
  const inbox = [];
  const waiters = [];
  ws.on('message', (raw) => {
    const msg = JSON.parse(raw.toString());
    inbox.push(msg);
    for (const w of [...waiters]) if (w.test(msg)) { waiters.splice(waiters.indexOf(w), 1); w.resolve(msg); }
  });
  return {
    ready: new Promise((r) => ws.once('open', r)),
    send: (o) => ws.send(JSON.stringify(o)),
    next(pred, ms = 3000) {
      const hit = inbox.find(pred);
      if (hit) return Promise.resolve(hit);
      return new Promise((resolve, reject) => {
        const t = setTimeout(() => reject(new Error('Timeout esperando mensaje')), ms);
        waiters.push({ test: pred, resolve: (m) => { clearTimeout(t); resolve(m); } });
      });
    },
    snap(fn) { return this.next((m) => m.type === 'state' && fn(m.snap)).then((m) => m.snap); },
  };
}

test('dos copias del servidor con Redis juegan la misma partida', async (t) => {
  const realRandom = Math.random;
  Math.random = () => 0.5;
  const url = 'redis://localhost:6390';
  const storeA = new RedisStore(url, RedisMock);
  const storeB = new RedisStore(url, RedisMock);
  await Promise.all([storeA.ready, storeB.ready]);
  const A = createAppServer({ store: storeA });
  const B = createAppServer({ store: storeB });
  const [pa, pb] = await Promise.all([listen(A), listen(B)]);
  const opened = [];
  t.after(async () => {
    Math.random = realRandom;
    for (const ws of opened) ws.terminate();
    await Promise.all([A, B].map((s) => new Promise((r) => { s.close(() => r()); s.closeAllConnections(); })));
    await storeA.close();
    await storeB.close();
  });

  const ana = client(pa, opened);
  const luis = client(pb, opened);
  await Promise.all([ana.ready, luis.ready]);

  ana.send({ type: 'create', name: 'Ana' });
  const aj = await ana.next((m) => m.type === 'joined');
  luis.send({ type: 'join', code: aj.code, name: 'Luis' });
  const lj = await luis.next((m) => m.type === 'joined');

  // Ana (copia A) ve a Luis (copia B) en la sala
  await ana.snap((s) => s.k === 'sala' && s.lobby.length === 2);

  ana.send({ type: 'start' });
  const sa = await ana.snap((s) => s.k === 'juego' && s.ph === 'turns');
  const sl = await luis.snap((s) => s.k === 'juego' && s.ph === 'turns');
  assert.deepEqual(Object.keys(sa.c), [aj.playerId]);
  assert.deepEqual(Object.keys(sl.c), [lj.playerId]);

  // Juega primero Luis (el siguiente a quien reparte): cambia con Ana
  assert.equal(sl.cur, lj.playerId);
  const cartaAna = sa.c[aj.playerId];
  const cartaLuis = sl.c[lj.playerId];
  luis.send({ type: 'swap' });
  const ana2 = await ana.snap((s) => s.k === 'juego' && s.ac.length === 1);
  const luis2 = await luis.snap((s) => s.k === 'juego' && s.ac.length === 1);
  assert.equal(ana2.c[aj.playerId], cartaLuis);
  assert.equal(luis2.c[lj.playerId], cartaAna);

  // Ana termina la ronda; los dos ven el revelado
  ana.send({ type: 'keep' });
  const ra = await ana.snap((s) => s.k === 'juego' && s.ph !== 'turns');
  const rl = await luis.snap((s) => s.k === 'juego' && s.ph !== 'turns');
  assert.equal(ra.res.rv.length, 2);
  assert.deepEqual(ra.res, rl.res);

  // Luis se reconecta a la OTRA copia y recupera su sitio
  const luisB = client(pa, opened);
  await luisB.ready;
  luisB.send({ type: 'resume', code: aj.code, token: lj.token });
  const back = await luisB.next((m) => m.type === 'joined');
  assert.equal(back.playerId, lj.playerId);
  const s3 = await luisB.snap((s) => s.k === 'juego');
  assert.equal(s3.r, 1);
});
