'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const g = require('../src/game');

/** Crea la partida, la empieza y deja cartas conocidas para cada jugador. */
function setup(names, config = {}) {
  const state = g.createGame(config);
  names.forEach((name, i) => g.addPlayer(state, { id: `p${i}`, token: `t${i}`, name }));
  g.startGame(state, 'p0', () => 0.5);
  return state;
}
function setCards(state, cards) { state.players.forEach((p, i) => { p.card = { ...cards[i] }; }); }
function keepAll(state) { while (state.phase === 'turns') g.keep(state, g.currentPlayerId(state)); }
const c = (rank, suit = 'oros') => ({ rank, suit });
const lives = (state) => state.players.map((p) => p.lives);

// ---------- baraja y configuración ----------

test('la baraja tiene 40 cartas únicas (sin 8 ni 9)', () => {
  const deck = g.createDeck();
  assert.equal(deck.length, 40);
  assert.equal(new Set(deck.map((x) => `${x.rank}-${x.suit}`)).size, 40);
  assert.ok(deck.every((x) => x.rank !== 8 && x.rank !== 9));
});

test('barajar no pierde ni duplica cartas', () => {
  const shuffled = g.shuffle(g.createDeck(), () => 0.3);
  assert.equal(new Set(shuffled.map((x) => `${x.rank}-${x.suit}`)).size, 40);
});

test('por defecto cada jugador empieza con 2 vidas y se pierde 1 por ronda', () => {
  assert.equal(g.DEFAULT_CONFIG.lives, 2);
  assert.equal(g.LIVES_LOST, 1);
  const state = setup(['Ana', 'Luis']);
  assert.deepEqual(lives(state), [2, 2]);
});

test('configuración inválida se rechaza y las claves antiguas se ignoran', () => {
  assert.throws(() => g.normalizeConfig({ lives: 0 }), g.GameError);
  assert.throws(() => g.normalizeConfig({ lives: 'dos' }), g.GameError);
  assert.throws(() => g.normalizeConfig({ minPlayers: 5, maxPlayers: 3 }), g.GameError);
  assert.throws(() => g.normalizeConfig({ maxPlayers: 11 }), g.GameError);
  const cfg = g.normalizeConfig({ lives: 3, tiePolicy: 'x', livesLostPerRound: 9 });
  assert.equal(cfg.lives, 3);
  assert.equal('tiePolicy' in cfg, false);
});

// ---------- sala ----------

test('no se puede empezar sin el mínimo de jugadores', () => {
  const state = g.createGame({ minPlayers: 3 });
  g.addPlayer(state, { id: 'a', token: 'ta', name: 'Ana' });
  g.addPlayer(state, { id: 'b', token: 'tb', name: 'Luis' });
  assert.throws(() => g.startGame(state, 'a'), /Faltan jugadores/);
});

test('solo el anfitrión configura, empieza y da el pelle', () => {
  const state = g.createGame();
  g.addPlayer(state, { id: 'a', token: 'ta', name: 'Ana' });
  g.addPlayer(state, { id: 'b', token: 'tb', name: 'Luis' });
  assert.throws(() => g.updateConfig(state, 'b', { lives: 3 }), /anfitrión/);
  assert.throws(() => g.startGame(state, 'b'), /anfitrión/);
  assert.throws(() => g.togglePelle(state, 'b', 'b'), /anfitrión/);
  assert.equal(g.togglePelle(state, 'a', 'b'), true);
  assert.equal(g.togglePelle(state, 'a', 'b'), false);
});

test('nombres duplicados (sin distinguir mayúsculas) se rechazan', () => {
  const state = g.createGame();
  g.addPlayer(state, { id: 'a', token: 'ta', name: 'Ana' });
  assert.throws(() => g.addPlayer(state, { id: 'b', token: 'tb', name: ' ana ' }), /ya está en uso/);
});

test('el anfitrión ordena los asientos y puede sacar a alguien de la sala', () => {
  const state = g.createGame();
  ['Ana', 'Luis', 'Eva'].forEach((n, i) => g.addPlayer(state, { id: `p${i}`, token: 't', name: n }));
  g.movePlayer(state, 'p0', 'p2', -1);
  assert.deepEqual(state.players.map((p) => p.name), ['Ana', 'Eva', 'Luis']);
  assert.throws(() => g.movePlayer(state, 'p1', 'p2', -1), /anfitrión/);
  assert.throws(() => g.kickPlayer(state, 'p0', 'p0'), /ti mismo/);
  g.kickPlayer(state, 'p0', 'p1');
  assert.equal(state.players.length, 2);
});

// ---------- reparto y turnos ----------

test('cada jugador recibe una carta distinta y el resto queda en el mazo', () => {
  const state = setup(['Ana', 'Luis', 'Eva']);
  assert.equal(new Set(state.players.map((p) => `${p.card.rank}-${p.card.suit}`)).size, 3);
  assert.equal(state.deck.length, 37);
  assert.equal(state.phase, 'turns');
});

test('empieza el siguiente a quien reparte y quien reparte juega el último', () => {
  const state = setup(['Ana', 'Luis', 'Eva']);
  assert.deepEqual(state.turnOrder, ['p1', 'p2', 'p0']);
});

test('un 12 no termina la ronda: se sigue jugando', () => {
  const state = setup(['Ana', 'Luis', 'Eva']);
  setCards(state, [c(12, 'copas'), c(5), c(7)]);
  g.keep(state, 'p1');
  assert.equal(state.phase, 'turns');
});

test('cambiar intercambia la carta con el siguiente y pasa el turno', () => {
  const state = setup(['Ana', 'Luis', 'Eva']);
  setCards(state, [c(7), c(3), c(10)]);
  g.swap(state, 'p1'); // Luis con Eva
  assert.deepEqual(state.players.map((p) => p.card.rank), [7, 10, 3]);
  assert.equal(g.currentPlayerId(state), 'p2');
});

test('el último de la lista cambia con el primero', () => {
  const state = setup(['Ana', 'Luis', 'Eva']);
  setCards(state, [c(7), c(3), c(10)]);
  g.keep(state, 'p1');
  g.keep(state, 'p2');
  // Le toca a Ana (asiento 0); su siguiente es Luis (asiento 1)
  g.swap(state, 'p0');
  assert.equal(state.history[0].reveals.find((r) => r.playerId === 'p0').card.rank, 3);
});

test('no se puede actuar fuera de turno', () => {
  const state = setup(['Ana', 'Luis']);
  assert.throws(() => g.keep(state, 'p0'), /No es tu turno/);
  assert.throws(() => g.swap(state, 'p0'), /No es tu turno/);
});

test('el anfitrión puede pasar el turno de quien no responde', () => {
  const state = setup(['Ana', 'Luis', 'Eva']);
  assert.throws(() => g.forceKeep(state, 'p2'), /anfitrión/);
  g.forceKeep(state, 'p0');
  assert.equal(g.currentPlayerId(state), 'p2');
});

// ---------- quién pierde ----------

test('pierde 1 vida quien tiene la carta más baja; nadie gana', () => {
  const state = setup(['Ana', 'Luis', 'Eva'], { lives: 5 });
  setCards(state, [c(7), c(2), c(10)]);
  keepAll(state);
  assert.deepEqual(state.history[0].losers, ['p1']);
  assert.deepEqual(lives(state), [5, 4, 5]);
  assert.equal('winners' in state.history[0], false);
});

test('el palo no importa: solo cuenta el número', () => {
  const state = setup(['Ana', 'Luis'], { lives: 5 });
  setCards(state, [c(4, 'espadas'), c(5, 'oros')]);
  keepAll(state);
  assert.deepEqual(state.history[0].losers, ['p0']);
});

test('si varios empatan con la carta más baja, pierden todos 1 vida', () => {
  const state = setup(['Ana', 'Luis', 'Eva'], { lives: 5 });
  setCards(state, [c(3), c(3, 'copas'), c(7)]);
  keepAll(state);
  assert.deepEqual(new Set(state.history[0].losers), new Set(['p0', 'p1']));
  assert.deepEqual(lives(state), [4, 4, 5]);
});

test('As de bastos: quien lo tiene pierde 2 vidas en total', () => {
  const state = setup(['Ana', 'Luis', 'Eva'], { lives: 5 });
  setCards(state, [c(1, 'bastos'), c(5), c(6)]);
  keepAll(state);
  assert.deepEqual(lives(state), [3, 5, 5]);
});

test('As de bastos empatado con otro As: el de bastos pierde 2 y el otro 1', () => {
  const state = setup(['Ana', 'Luis', 'Eva'], { lives: 5 });
  setCards(state, [c(1, 'bastos'), c(1, 'copas'), c(6)]);
  keepAll(state);
  assert.deepEqual(lives(state), [3, 4, 5]);
});

test('Rey de bastos: quien lo tiene gana 1 vida y la ronda sigue igual', () => {
  const state = setup(['Ana', 'Luis', 'Eva'], { lives: 5 });
  setCards(state, [c(12, 'bastos'), c(2), c(7)]);
  keepAll(state);
  assert.deepEqual(lives(state), [6, 4, 5]);
});

test('los otros reyes no dan vida', () => {
  const state = setup(['Ana', 'Luis'], { lives: 5 });
  setCards(state, [c(12, 'copas'), c(2)]);
  keepAll(state);
  assert.deepEqual(lives(state), [5, 4]);
});

test('con pelle, el Rey de bastos no da vida', () => {
  const state = setup(['Ana', 'Luis'], { lives: 5 });
  g.togglePelle(state, 'p0', 'p0');
  setCards(state, [c(12, 'bastos'), c(3)]);
  keepAll(state);
  assert.deepEqual(lives(state), [5, 4]);
  assert.equal(state.history[0].effects[0].blocked, true);
});

// ---------- levantar baraja ----------

test('quien reparte puede levantar baraja solo en su turno y con la carta más baja', () => {
  const state = setup(['Ana', 'Luis', 'Eva']);
  setCards(state, [c(2), c(6), c(7)]);
  state.deck = [c(5, 'copas')];
  assert.equal(g.canDraw(state, 'p0'), false); // aún no es su turno
  g.keep(state, 'p1');
  g.keep(state, 'p2');
  assert.equal(g.canDraw(state, 'p0'), true);
});

test('no puede levantar si no tiene la carta más baja', () => {
  const state = setup(['Ana', 'Luis']);
  setCards(state, [c(7), c(2)]);
  state.deck = [c(3)];
  g.keep(state, 'p1');
  assert.equal(g.canDraw(state, 'p0'), false);
  assert.throws(() => g.draw(state, 'p0'), /más baja/);
});

test('al levantar, si la carta nueva es mayor que la de otro, pierde ese otro', () => {
  const state = setup(['Ana', 'Luis', 'Eva'], { lives: 5 });
  setCards(state, [c(2), c(4), c(7)]);
  state.deck = [c(6)];
  g.keep(state, 'p1');
  g.keep(state, 'p2');
  g.draw(state, 'p0'); // Ana cambia su 2 por un 6; la más baja ahora es el 4 de Luis
  assert.deepEqual(state.history[0].losers, ['p1']);
  assert.deepEqual(lives(state), [5, 4, 5]);
});

test('al levantar, si la carta nueva sigue siendo la más baja, pierde quien reparte', () => {
  const state = setup(['Ana', 'Luis', 'Eva'], { lives: 5 });
  setCards(state, [c(3), c(5), c(7)]);
  state.deck = [c(2, 'espadas')];
  g.keep(state, 'p1');
  g.keep(state, 'p2');
  g.draw(state, 'p0');
  assert.deepEqual(state.history[0].losers, ['p0']);
});

// ---------- final de partida ----------

test('quien se queda sin vidas queda eliminado y gana el último que sobrevive', () => {
  const state = setup(['Ana', 'Luis'], { lives: 1 });
  setCards(state, [c(2), c(5)]);
  keepAll(state);
  assert.deepEqual(state.history[0].eliminated, ['p0']);
  assert.equal(state.phase, 'over');
  assert.equal(state.winnerId, 'p1');
});

test('si los últimos caen a la vez, siguen con 1 vida y repiten ronda entre ellos', () => {
  const state = setup(['Ana', 'Luis'], { lives: 1 });
  setCards(state, [c(3), c(3, 'copas')]);
  keepAll(state);
  assert.equal(state.history[0].tiebreak, true);
  assert.deepEqual(state.history[0].eliminated, []);
  assert.deepEqual(lives(state), [1, 1]);
  assert.equal(state.phase, 'reveal');
});

test('el desempate solo afecta a los últimos: si queda alguien vivo, los demás caen', () => {
  const state = setup(['Ana', 'Luis', 'Eva'], { lives: 1 });
  setCards(state, [c(3), c(3, 'copas'), c(7)]);
  keepAll(state);
  assert.deepEqual(new Set(state.history[0].eliminated), new Set(['p0', 'p1']));
  assert.equal(state.phase, 'over');
  assert.equal(state.winnerId, 'p2');
});

test('un eliminado ya no recibe carta ni turno', () => {
  const state = setup(['Ana', 'Luis', 'Eva'], { lives: 1 });
  setCards(state, [c(7), c(2), c(10)]);
  keepAll(state);
  g.nextRound(state, 'p0', () => 0.4);
  assert.equal(state.players[1].card, null);
  assert.equal(state.turnOrder.includes('p1'), false);
});

test('en la siguiente ronda reparte el siguiente jugador vivo', () => {
  const state = setup(['Ana', 'Luis', 'Eva'], { lives: 5 });
  keepAll(state);
  g.nextRound(state, 'p0', () => 0.2);
  assert.equal(state.round, 2);
  assert.equal(state.turnOrder[state.turnOrder.length - 1], 'p1');
});

// ---------- privacidad ----------

test('la vista de un jugador no incluye las cartas de los demás durante la ronda', () => {
  const state = setup(['Ana', 'Luis', 'Eva']);
  setCards(state, [c(7), c(2, 'espadas'), c(10)]);
  const view = g.publicView(state, 'p0');
  assert.deepEqual(view.you.card, { rank: 7, suit: 'oros' });
  assert.equal(view.revealed, null);
  const json = JSON.stringify(view);
  assert.equal(json.includes('espadas'), false);
  assert.ok(view.players.every((p) => !('card' in p)));
});

test('reiniciar la partida devuelve a la sala con los mismos jugadores', () => {
  const state = setup(['Ana', 'Luis'], { lives: 1 });
  setCards(state, [c(2), c(5)]);
  keepAll(state);
  g.restartLobby(state, 'p0');
  assert.equal(state.phase, 'lobby');
  assert.equal(state.players.length, 2);
  assert.equal(state.history.length, 0);
});
