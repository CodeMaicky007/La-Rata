'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const WebSocket = require('ws');
const { createAppServer } = require('../src/server');

const openClients = [];

function startServer() {
  return new Promise((resolve) => {
    const server = createAppServer();
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

function teardown(server) {
  for (const c of openClients.splice(0)) c.ws.terminate();
  return new Promise((resolve) => { server.close(() => resolve()); server.closeAllConnections(); });
}

/** Cliente de prueba: guarda todo lo recibido y permite esperar a una condición. */
function client(port) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  const inbox = [];
  const waiters = [];
  openClients.push({ ws });
  ws.on('message', (raw) => {
    const msg = JSON.parse(raw.toString());
    inbox.push(msg);
    for (const w of [...waiters]) if (w.test(msg)) { waiters.splice(waiters.indexOf(w), 1); w.resolve(msg); }
  });
  const ready = new Promise((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject); });
  return {
    ws, inbox, ready,
    send: (obj) => ws.send(JSON.stringify(obj)),
    next(predicate, timeoutMs = 2000) {
      const found = inbox.find(predicate);
      if (found) return Promise.resolve(found);
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Timeout esperando mensaje')), timeoutMs);
        waiters.push({ test: predicate, resolve: (m) => { clearTimeout(timer); resolve(m); } });
      });
    },
    snapWhere(fn) { return this.next((m) => m.type === 'state' && fn(m.snap)).then((m) => m.snap); },
    lastSnap() { const s = inbox.filter((m) => m.type === 'state'); return s.length ? s[s.length - 1].snap : null; },
  };
}

test('partida completa: sala, asientos, cartas privadas, cambio, revelado y reconexión', async (t) => {
  const realRandom = Math.random;
  Math.random = () => 0.5; // reparto determinista sin 12
  t.after(() => { Math.random = realRandom; });
  const { server, port } = await startServer();
  t.after(() => teardown(server));

  const ana = client(port); const luis = client(port); const eva = client(port);
  await Promise.all([ana.ready, luis.ready, eva.ready]);

  ana.send({ type: 'create', name: 'Ana' });
  const anaJ = await ana.next((m) => m.type === 'joined');
  assert.match(anaJ.code, /^[A-Z2-9]{5}$/);
  luis.send({ type: 'join', code: anaJ.code.toLowerCase(), name: 'Luis' }); // el código no distingue mayúsculas
  const luisJ = await luis.next((m) => m.type === 'joined');
  eva.send({ type: 'join', code: anaJ.code, name: 'Eva' });
  const evaJ = await eva.next((m) => m.type === 'joined');

  const lobby = await ana.snapWhere((s) => s.k === 'sala' && s.lobby.length === 3);
  assert.equal(lobby.host, anaJ.playerId);
  assert.deepEqual(lobby.lobby.map((x) => x.n), ['Ana', 'Luis', 'Eva']);

  // Ordenar asientos: Eva sube por encima de Luis
  luis.send({ type: 'move', target: evaJ.playerId, delta: -1 });
  assert.match((await luis.next((m) => m.type === 'error')).message, /anfitrión/);
  ana.send({ type: 'move', target: evaJ.playerId, delta: -1 });
  await eva.snapWhere((s) => s.k === 'sala' && s.lobby[1].n === 'Eva');

  ana.send({ type: 'config', config: { lives: 2, lost: 1 } });
  await luis.snapWhere((s) => s.cfg.lives === 2);
  ana.send({ type: 'start' });

  const sA = await ana.snapWhere((s) => s.k === 'juego' && s.ph === 'turns');
  const sL = await luis.snapWhere((s) => s.k === 'juego' && s.ph === 'turns');
  const sE = await eva.snapWhere((s) => s.k === 'juego' && s.ph === 'turns');

  // Cada uno recibe SOLO su carta
  for (const [snap, id] of [[sA, anaJ.playerId], [sL, luisJ.playerId], [sE, evaJ.playerId]]) {
    assert.deepEqual(Object.keys(snap.c), [id]);
    assert.equal(snap.res, undefined);
  }
  const cards = [sA.c[anaJ.playerId], sL.c[luisJ.playerId], sE.c[evaJ.playerId]];
  assert.equal(new Set(cards).size, 3);
  // Y ninguna carta ajena aparece en lo que recibe Luis
  const luisJson = JSON.stringify(sL);
  for (const other of [cards[0], cards[2]]) assert.equal(luisJson.includes(`"${other}"`), false);

  // Orden de mesa: Ana, Eva, Luis → juega primero Eva, después Luis, y Ana (quien reparte) la última
  assert.deepEqual(sA.to, [evaJ.playerId, luisJ.playerId, anaJ.playerId]);
  assert.equal(sA.cur, evaJ.playerId);

  // Eva cambia con el siguiente (Luis): Eva recibe la carta de Luis y Luis la de Eva
  eva.send({ type: 'swap' });
  const afterE = await eva.snapWhere((s) => s.k === 'juego' && s.ac.length === 1);
  const afterL = await luis.snapWhere((s) => s.k === 'juego' && s.ac.length === 1);
  assert.equal(afterE.c[evaJ.playerId], cards[1]);
  assert.equal(afterL.c[luisJ.playerId], cards[2]);
  assert.deepEqual(afterL.ac[0], ['swap', evaJ.playerId, luisJ.playerId]);

  // Fuera de turno no se puede
  ana.send({ type: 'keep' });
  assert.match((await ana.next((m) => m.type === 'error' && /turno/.test(m.message))).message, /No es tu turno/);

  // El anfitrión pasa el turno de Luis; Ana se queda y se revela
  ana.send({ type: 'skip' });
  await ana.snapWhere((s) => s.k === 'juego' && s.cur === anaJ.playerId);
  ana.send({ type: 'keep' });
  const rev = await luis.snapWhere((s) => s.k === 'juego' && s.ph !== 'turns');
  assert.equal(rev.c, undefined);
  assert.equal(rev.res.rv.length, 3);
  assert.equal(rev.hi.length, 1);

  // Siguiente ronda (solo el anfitrión)
  luis.send({ type: 'next' });
  assert.match((await luis.next((m) => m.type === 'error' && /anfitrión/.test(m.message))).message, /anfitrión/);

  // Luis se cae y vuelve con su token: recupera su sitio
  luis.ws.close();
  await ana.snapWhere((s) => s.pl && s.pl.find((p) => p.p === luisJ.playerId).on === false);
  const luis2 = client(port);
  await luis2.ready;
  luis2.send({ type: 'resume', code: anaJ.code, token: luisJ.token });
  const back = await luis2.next((m) => m.type === 'joined');
  assert.equal(back.playerId, luisJ.playerId);
  await ana.snapWhere((s) => s.pl && s.pl.find((p) => p.p === luisJ.playerId).on === true);
});

test('el anfitrión puede sacar a alguien de la sala y se le avisa', async (t) => {
  const { server, port } = await startServer();
  t.after(() => teardown(server));
  const a = client(port); const b = client(port);
  await Promise.all([a.ready, b.ready]);
  a.send({ type: 'create', name: 'Ana' });
  const aj = await a.next((m) => m.type === 'joined');
  b.send({ type: 'join', code: aj.code, name: 'Luis' });
  const bj = await b.next((m) => m.type === 'joined');
  a.send({ type: 'kick', target: bj.playerId });
  await b.next((m) => m.type === 'kicked');
  await a.snapWhere((s) => s.k === 'sala' && s.lobby.length === 1);
});

test('token falso, código inexistente y nombre vacío se rechazan', async (t) => {
  const { server, port } = await startServer();
  t.after(() => teardown(server));
  const a = client(port);
  await a.ready;
  a.send({ type: 'create', name: '   ' });
  assert.match((await a.next((m) => m.type === 'error')).message, /entre 1 y 20/);
  a.send({ type: 'join', code: 'ZZZZZ', name: 'Ana' });
  assert.match((await a.next((m) => m.type === 'error' && /código/.test(m.message))).message, /No existe/);
  a.send({ type: 'resume', code: 'ZZZZZ', token: 'x' });
  await a.next((m) => m.type === 'error' && m.message !== undefined && a.inbox.filter((x) => x.type === 'error').length >= 3);
});

test('el servidor responde en /salud y sirve la app', async (t) => {
  const { server, port } = await startServer();
  t.after(() => teardown(server));
  const res = await fetch(`http://127.0.0.1:${port}/salud`);
  assert.equal(res.status, 200);
  assert.equal((await res.json()).ok, true);
  const bad = await fetch(`http://127.0.0.1:${port}/..%2Fpackage.json`);
  assert.equal(bad.status, 403);
});
