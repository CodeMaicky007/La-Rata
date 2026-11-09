'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const g = require('../src/game');

// Reparte con semillas hasta que nadie tenga un 12 (que ganaría la ronda al instante).
function setup(names, config = {}) {
  for (const seed of [0.5, 0.1, 0.2, 0.3, 0.7, 0.9, 0.42, 0.13]) {
    const state = g.createGame(config);
    names.forEach((name, i) => g.addPlayer(state, { id: `p${i}`, token: `t${i}`, name }));
    g.startGame(state, 'p0', () => seed);
    if (state.phase === 'turns') return state;
  }
  throw new Error('No se pudo preparar la partida sin 12');
}

// Todos se quedan con su carta hasta que la ronda termina.
function keepAll(state) {
  while (state.phase === 'turns') g.keep(state, g.currentPlayerId(state));
}

function setCards(state, cards) {
  state.players.forEach((p, i) => { p.card = { ...cards[i] }; });
}

const c = (rank, suit = 'oros') => ({ rank, suit });

test('la baraja tiene 40 cartas únicas', () => {
  const deck = g.createDeck();
  assert.equal(deck.length, 40);
  assert.equal(new Set(deck.map((x) => `${x.rank}-${x.suit}`)).size, 40);
});

test('barajar no pierde ni duplica cartas', () => {
  const deck = g.createDeck();
  const shuffled = g.shuffle(deck, () => 0.3);
  assert.equal(shuffled.length, 40);
  assert.deepEqual(new Set(shuffled.map((x) => `${x.rank}-${x.suit}`)), new Set(deck.map((x) => `${x.rank}-${x.suit}`)));
});

test('configuración inválida se rechaza', () => {
  assert.throws(() => g.normalizeConfig({ lives: 0 }), g.GameError);
  assert.throws(() => g.normalizeConfig({ lives: 'dos' }), g.GameError);
  assert.throws(() => g.normalizeConfig({ minPlayers: 5, maxPlayers: 3 }), g.GameError);
  assert.throws(() => g.normalizeConfig({ tiePolicy: 'otra' }), g.GameError);
  assert.throws(() => g.normalizeConfig({ maxPlayers: 11 }), g.GameError);
});

test('por defecto cada jugador empieza con 2 vidas', () => {
  assert.equal(g.DEFAULT_CONFIG.lives, 2);
  const state = setup(['Ana', 'Luis']);
  assert.ok(state.players.every((p) => p.lives === 2));
});

test('no se puede empezar sin el mínimo de jugadores', () => {
  const state = g.createGame({ minPlayers: 3 });
  g.addPlayer(state, { id: 'a', token: 'ta', name: 'Ana' });
  g.addPlayer(state, { id: 'b', token: 'tb', name: 'Luis' });
  assert.throws(() => g.startGame(state, 'a'), /Faltan jugadores/);
});

test('solo el anfitrión puede configurar, empezar y marcar el pelle', () => {
  const state = g.createGame();
  g.addPlayer(state, { id: 'a', token: 'ta', name: 'Ana' });
  g.addPlayer(state, { id: 'b', token: 'tb', name: 'Luis' });
  assert.throws(() => g.updateConfig(state, 'b', { lives: 3 }), /anfitrión/);
  assert.throws(() => g.startGame(state, 'b'), /anfitrión/);
});

test('nombres duplicados (sin distinguir mayúsculas) se rechazan', () => {
  const state = g.createGame();
  g.addPlayer(state, { id: 'a', token: 'ta', name: 'Ana' });
  assert.throws(() => g.addPlayer(state, { id: 'b', token: 'tb', name: ' ana ' }), /ya está en uso/);
});

test('cada jugador recibe una carta distinta al empezar', () => {
  const state = setup(['Ana', 'Luis', 'Eva']);
  const cards = state.players.map((p) => `${p.card.rank}-${p.card.suit}`);
  assert.equal(new Set(cards).size, 3);
  assert.equal(state.deck.length, 37);
});

test('el turno empieza por el siguiente al que reparte y quien empieza juega el último', () => {
  const state = setup(['Ana', 'Luis', 'Eva']);
  assert.deepEqual(state.turnOrder, ['p1', 'p2', 'p0']);
  assert.equal(g.currentPlayerId(state), 'p1');
});

test('gana la carta más baja y los demás pierden vidas configurables', () => {
  const state = setup(['Ana', 'Luis', 'Eva'], { lives: 5, livesLostPerRound: 2 });
  setCards(state, [c(7), c(2), c(10)]);
  keepAll(state);

  assert.equal(state.phase, 'reveal');
  const last = state.history[0];
  assert.deepEqual(last.winners, ['p1']);
  assert.deepEqual(new Set(last.losers), new Set(['p0', 'p2']));
  assert.equal(state.players[0].lives, 3);
  assert.equal(state.players[1].lives, 5);
  assert.equal(state.players[2].lives, 3);
});

test('As de bastos resta 2 vidas al jugador que lo tiene al revelar', () => {
  const state = setup(['Ana', 'Luis', 'Eva'], { lives: 5, livesLostPerRound: 1 });
  setCards(state, [c(1, 'bastos'), c(5), c(6)]);
  keepAll(state);

  assert.deepEqual(state.history[0].winners, ['p0']);
  assert.equal(state.players[0].lives, 3); // pierde 2 por el As de bastos (gana la ronda)
  assert.equal(state.players[1].lives, 4);
  assert.equal(state.players[2].lives, 4);
  assert.equal(state.history[0].effects[0].label, 'As de bastos');
});

test('Rey de bastos suma 1 vida al jugador que lo tiene', () => {
  const state = setup(['Ana', 'Luis'], { lives: 5, livesLostPerRound: 1 });
  setCards(state, [c(12, 'bastos'), c(3)]);
  keepAll(state);

  // Ana tiene un 12: gana; Luis pierde 1; Ana suma 1 por el Rey de bastos.
  assert.deepEqual(state.history[0].winners, ['p0']);
  assert.equal(state.players[0].lives, 6);
  assert.equal(state.players[1].lives, 4);
});

test('el pelle impide recuperar vida con el Rey de bastos', () => {
  const state = setup(['Ana', 'Luis'], { lives: 5, livesLostPerRound: 1 });
  g.togglePelle(state, 'p0', 'p0');
  setCards(state, [c(12, 'bastos'), c(3)]);
  keepAll(state);
  assert.equal(state.players[0].lives, 5);
  assert.equal(state.history[0].effects[0].blocked, true);
});

test('solo el anfitrión puede marcar el pelle', () => {
  const state = setup(['Ana', 'Luis']);
  assert.throws(() => g.togglePelle(state, 'p1', 'p1'), /anfitrión/);
  assert.equal(g.togglePelle(state, 'p0', 'p1'), true);
  assert.equal(g.togglePelle(state, 'p0', 'p1'), false);
});

test('un 12 gana la ronda de inmediato al intercambiar', () => {
  const state = setup(['Ana', 'Luis', 'Eva'], { lives: 5, livesLostPerRound: 1 });
  setCards(state, [c(7), c(2), c(12, 'copas')]);
  // Luis (primero) cambia con Eva (la siguiente): Luis recibe el 12.
  g.swap(state, 'p1');
  assert.equal(state.phase, 'reveal');
  assert.equal(state.history[0].byTwelve, true);
  assert.deepEqual(state.history[0].winners, ['p1']);
});

test('swap solo intercambia con el siguiente jugador', () => {
  const state = setup(['Ana', 'Luis', 'Eva']);
  setCards(state, [c(7), c(3), c(10)]);
  g.swap(state, 'p1'); // Luis con Eva (siguiente)
  assert.equal(state.players[1].card.rank, 10);
  assert.equal(state.players[2].card.rank, 3);
  assert.equal(state.players[0].card.rank, 7); // Ana no cambia
  assert.equal(g.currentPlayerId(state), 'p2');
});

test('un 12 repartido al empezar gana la ronda sin turnos', () => {
  let state = null;
  for (const seed of [0.05, 0.15, 0.25, 0.35, 0.45, 0.55, 0.65, 0.75, 0.85, 0.95]) {
    const s = g.createGame({ lives: 3 });
    ['Ana', 'Luis'].forEach((n, i) => g.addPlayer(s, { id: `p${i}`, token: `t${i}`, name: n }));
    g.startGame(s, 'p0', () => seed);
    if (s.phase !== 'turns') { state = s; break; }
  }
  assert.ok(state, 'debe existir una semilla con 12 repartido');
  assert.equal(state.history[0].byTwelve, true);
});

test('no se puede actuar fuera de turno', () => {
  const state = setup(['Ana', 'Luis']);
  assert.throws(() => g.keep(state, 'p0'), /No es tu turno/);
  assert.throws(() => g.swap(state, 'p0'), /No es tu turno/);
});

test('la ronda termina cuando han actuado todos', () => {
  const state = setup(['Ana', 'Luis', 'Eva']);
  g.keep(state, 'p1');
  assert.equal(state.phase, 'turns');
  g.keep(state, 'p2');
  assert.equal(state.phase, 'turns');
  g.keep(state, 'p0');
  assert.equal(state.phase, 'reveal');
});

test('la siguiente ronda empieza por el jugador siguiente al que reparte', () => {
  const state = setup(['Ana', 'Luis', 'Eva']);
  keepAll(state);
  for (const seed of [0.2, 0.1, 0.3, 0.7, 0.9]) {
    const copy = JSON.parse(JSON.stringify(state));
    g.nextRound(copy, 'p0', () => seed);
    if (copy.phase === 'turns') { Object.assign(state, copy); break; }
  }
  assert.equal(state.round, 2);
  assert.equal(state.turnOrder[state.turnOrder.length - 1], 'p1');
});

test('empate en la carta más baja: política "todos ganan"', () => {
  const state = setup(['Ana', 'Luis', 'Eva'], { lives: 5, tiePolicy: 'empate_todos_ganan' });
  setCards(state, [c(3), c(3, 'copas'), c(7)]);
  keepAll(state);
  assert.deepEqual(new Set(state.history[0].winners), new Set(['p0', 'p1']));
  assert.deepEqual(state.history[0].losers, ['p2']);
});

test('empate en la carta más baja: política "todos pierden"', () => {
  const state = setup(['Ana', 'Luis', 'Eva'], { lives: 5, tiePolicy: 'empate_todos_pierden' });
  setCards(state, [c(3), c(3, 'copas'), c(7)]);
  keepAll(state);
  assert.deepEqual(state.history[0].winners, []);
  assert.deepEqual(new Set(state.history[0].losers), new Set(['p0', 'p1']));
  assert.equal(state.players[2].lives, 5);
});

test('un jugador sin vidas queda eliminado y el último vivo gana la partida', () => {
  const state = setup(['Ana', 'Luis'], { lives: 1, livesLostPerRound: 1 });
  setCards(state, [c(2), c(5)]);
  keepAll(state);
  assert.deepEqual(state.history[0].eliminated, ['p1']);
  assert.equal(state.players[1].alive, false);
  assert.equal(state.phase, 'over');
  assert.equal(state.winnerId, 'p0');
});

test('quien empieza con la carta más baja puede levantar baraja, solo al final', () => {
  const state = setup(['Ana', 'Luis', 'Eva'], { lives: 5, livesLostPerRound: 1 });
  setCards(state, [c(2), c(6), c(7)]);
  state.deck = [c(3, 'copas'), c(5)];
  g.keep(state, 'p1');
  assert.equal(g.canDraw(state, 'p0'), false); // aún no es su turno final
  g.keep(state, 'p2');
  assert.equal(g.canDraw(state, 'p0'), true);
  g.draw(state, 'p0');
  // Ana se queda con el 3 de copas: gana la ronda con la carta más baja.
  assert.deepEqual(state.history[0].winners, ['p0']);
  assert.equal(state.history[0].reveals.find((r) => r.playerId === 'p0').card.rank, 3);
});

test('levantar baraja con carta robada mayor que la más baja de otro penaliza a ese jugador', () => {
  const state = setup(['Ana', 'Luis', 'Eva'], { lives: 5, livesLostPerRound: 1 });
  setCards(state, [c(2), c(4), c(7)]);
  state.deck = [c(6)];
  g.keep(state, 'p1');
  g.keep(state, 'p2');
  g.draw(state, 'p0'); // roba 6; la más baja de los otros es 4 (Luis) → Luis pierde
  assert.equal(state.phase, 'reveal');
  assert.ok(state.history[0].losers.includes('p1'));
  assert.equal(state.players[1].lives, 4);
});

test('no puede levantar baraja quien no empieza, ni fuera de su turno final', () => {
  const state = setup(['Ana', 'Luis']);
  setCards(state, [c(7), c(2)]);
  state.deck = [c(3)];
  assert.throws(() => g.draw(state, 'p0'), /No es tu turno/);
  g.keep(state, 'p1');
  assert.equal(g.canDraw(state, 'p1'), false);
});

test('la vista de un jugador no incluye las cartas de los demás durante la ronda', () => {
  const state = setup(['Ana', 'Luis', 'Eva']);
  setCards(state, [c(7), c(2, 'espadas'), c(10)]);
  const view = g.publicView(state, 'p0');
  assert.deepEqual(view.you.card, { rank: 7, suit: 'oros' });
  assert.equal(view.revealed, null);
  const serialized = JSON.stringify(view);
  assert.equal(serialized.includes('espadas'), false);
  assert.equal(serialized.includes('"rank":2'), false);
  assert.equal(serialized.includes('"rank":10'), false);
  assert.ok(view.players.every((p) => !('card' in p)));
});

test('las cartas se revelan a todos al terminar la ronda', () => {
  const state = setup(['Ana', 'Luis']);
  setCards(state, [c(7), c(2, 'espadas')]);
  keepAll(state);
  const view = g.publicView(state, 'p0');
  assert.equal(view.revealed.length, 2);
  assert.equal(view.revealed.find((r) => r.playerId === 'p1').card.suit, 'espadas');
});

test('el siguiente jugador solo aparece en la vista de quien tiene el turno', () => {
  const state = setup(['Ana', 'Luis', 'Eva']);
  assert.equal(g.publicView(state, 'p1').you.next, 'p2');
  assert.equal(g.publicView(state, 'p0').you.next, null);
});

test('las vidas de jugadores eliminados nunca quedan negativas en la vista', () => {
  const state = setup(['Ana', 'Luis'], { lives: 1, livesLostPerRound: 3 });
  setCards(state, [c(2), c(5)]);
  keepAll(state);
  assert.equal(g.publicView(state, 'p0').players[1].lives, 0);
});

test('reiniciar la partida devuelve a la sala con los mismos jugadores', () => {
  const state = setup(['Ana', 'Luis'], { lives: 1, livesLostPerRound: 1 });
  setCards(state, [c(2), c(5)]);
  keepAll(state);
  g.restartLobby(state, 'p0');
  assert.equal(state.phase, 'lobby');
  assert.equal(state.players.length, 2);
  assert.equal(state.history.length, 0);
});

test('el anfitrión ordena los asientos en la sala y el orden se respeta al jugar', () => {
  const state = g.createGame();
  ['Ana', 'Luis', 'Eva'].forEach((n, i) => g.addPlayer(state, { id: `p${i}`, token: 't', name: n }));
  g.movePlayer(state, 'p0', 'p2', -1); // Eva sube: Ana, Eva, Luis
  assert.deepEqual(state.players.map((p) => p.name), ['Ana', 'Eva', 'Luis']);
  assert.throws(() => g.movePlayer(state, 'p1', 'p2', -1), /anfitrión/);
  g.movePlayer(state, 'p0', 'p0', -1); // ya está arriba: no cambia
  assert.equal(state.players[0].name, 'Ana');
});

test('el anfitrión puede sacar a alguien de la sala pero no a sí mismo', () => {
  const state = g.createGame();
  ['Ana', 'Luis'].forEach((n, i) => g.addPlayer(state, { id: `p${i}`, token: 't', name: n }));
  assert.throws(() => g.kickPlayer(state, 'p0', 'p0'), /ti mismo/);
  g.kickPlayer(state, 'p0', 'p1');
  assert.equal(state.players.length, 1);
});

test('el anfitrión puede pasar el turno de quien no responde', () => {
  const state = setup(['Ana', 'Luis', 'Eva']);
  assert.equal(g.currentPlayerId(state), 'p1');
  assert.throws(() => g.forceKeep(state, 'p2'), /anfitrión/);
  g.forceKeep(state, 'p0');
  assert.equal(g.currentPlayerId(state), 'p2');
  assert.equal(state.roundActions[0].type, 'keep');
});
