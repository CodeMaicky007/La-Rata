'use strict';

/**
 * Lógica pura de LA RATA. No conoce sockets ni HTTP.
 * El servidor usa publicView() para decidir qué ve cada jugador:
 * nadie recibe las cartas de los demás durante la ronda.
 *
 * Convenciones:
 *  - Los asientos son los índices de state.players (orden de entrada en la sala).
 *  - El "siguiente" de un jugador es el asiento siguiente vivo (seat + 1). Es con quien puede intercambiar.
 *  - El orden de turnos sigue ese sentido y termina con quien empieza la ronda.
 */

const SUITS = ['oros', 'copas', 'espadas', 'bastos'];
// Valores de la baraja española de 40 cartas (sin 8 y 9).
const RANKS = [1, 2, 3, 4, 5, 6, 7, 10, 11, 12];
const MAX_LIVES = 99;
const MAX_PLAYERS_LIMIT = 10;

/*
 * REGLAS DE LA RONDA
 *  - Nadie gana la ronda: pierde LIVES_LOST vida quien tiene la carta más baja.
 *    Si varios empatan con la más baja, pierden todos.
 *  - As de bastos: quien lo tiene pierde 2 vidas EN TOTAL (en lugar de la vida normal).
 *  - Rey de bastos: quien lo tiene gana 1 vida, salvo si tiene el pelle.
 *  - Gana la partida el último que siga con vidas. Si los últimos caen a la vez,
 *    se les deja con 1 vida y repiten ronda entre ellos (desempate).
 * PARÁMETROS
 *  - lives: vidas iniciales (2 por defecto, configurable en la sala).
 */
const LIVES_LOST = 1;
const DEFAULT_CONFIG = Object.freeze({
  lives: 2,
  minPlayers: 2,
  maxPlayers: 8,
});

// Cartas especiales. Se aplican al revelar, a quien tenga la carta en ese momento.
//  - mode 'total': sustituye a la pérdida normal (el As de bastos quita 2 en total).
//  - mode 'suma': se suma a lo demás.
const SPECIAL_EFFECTS = Object.freeze([
  { suit: 'bastos', rank: 1, lives: -2, mode: 'total', label: 'As de bastos', blockedByPelle: false },
  { suit: 'bastos', rank: 12, lives: 1, mode: 'suma', label: 'Rey de bastos', blockedByPelle: true },
]);

class GameError extends Error {
  constructor(message) {
    super(message);
    this.name = 'GameError';
    this.userError = true; // mensaje seguro para mostrar al jugador
  }
}

function fail(message) {
  return new GameError(message);
}

function specialEffectFor(card) {
  return SPECIAL_EFFECTS.find((e) => e.suit === card.suit && e.rank === card.rank) || null;
}

function createDeck() {
  const deck = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) deck.push({ suit, rank });
  }
  return deck;
}

function shuffle(items, rng = Math.random) {
  const a = items.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function normalizeConfig(patch = {}, base = DEFAULT_CONFIG) {
  const c = { ...base };
  // Solo se aceptan claves conocidas; el resto se ignora.
  for (const key of Object.keys(DEFAULT_CONFIG)) {
    if (patch && key in patch) c[key] = patch[key];
  }
  for (const key of ['lives', 'minPlayers', 'maxPlayers']) {
    if (!Number.isInteger(c[key])) throw fail(`El valor de ${key} debe ser un número entero`);
  }
  if (c.lives < 1 || c.lives > MAX_LIVES) throw fail(`Las vidas iniciales deben estar entre 1 y ${MAX_LIVES}`);
  if (c.minPlayers < 2) throw fail('Se necesitan al menos 2 jugadores');
  if (c.maxPlayers > MAX_PLAYERS_LIMIT) throw fail(`Máximo ${MAX_PLAYERS_LIMIT} jugadores`);
  if (c.minPlayers > c.maxPlayers) throw fail('El mínimo de jugadores no puede superar al máximo');
  return c;
}

function sanitizeName(name) {
  const clean = typeof name === 'string' ? name.replace(/\s+/g, ' ').trim() : '';
  if (clean.length < 1 || clean.length > 20) throw fail('El nombre debe tener entre 1 y 20 caracteres');
  return clean;
}

function createGame(configPatch = {}) {
  return {
    phase: 'lobby', // lobby | turns | reveal | over
    config: normalizeConfig(configPatch),
    players: [], // { id, token, name, lives, alive, card, connected, pelle }
    hostId: null,
    round: 0,
    starterSeat: 0,
    deck: [], // cartas no repartidas en la ronda actual
    turnOrder: [], // ids de jugadores que actúan en la ronda actual, en orden
    turnIdx: 0,
    roundActions: [], // acciones públicas de la ronda (sin revelar cartas)
    revealed: [], // cartas de la última ronda revelada
    history: [],
    winnerId: null,
  };
}

// ---------- helpers de consulta ----------

function playerById(state, id) {
  return state.players.find((p) => p.id === id) || null;
}

function seatOf(state, id) {
  return state.players.findIndex((p) => p.id === id);
}

function alivePlayers(state) {
  return state.players.filter((p) => p.alive);
}

function currentPlayerId(state) {
  return state.phase === 'turns' ? state.turnOrder[state.turnIdx] : null;
}

/** Jugadores que participan en la ronda actual (en orden de turno). */
function participants(state) {
  return state.turnOrder.map((id) => playerById(state, id));
}

/** Siguiente asiento vivo en la dirección `step` (+1 o -1), distinto de `seat`. */
function neighborSeat(state, seat, step) {
  const n = state.players.length;
  for (let k = 1; k < n; k++) {
    const s = (((seat + step * k) % n) + n) % n;
    if (state.players[s].alive) return s;
  }
  return null;
}

function requireHost(state, actorId) {
  if (state.hostId !== actorId) throw fail('Solo el anfitrión puede hacer esto');
}

function requirePhase(state, ...phases) {
  if (!phases.includes(state.phase)) throw fail('Esta acción no está disponible ahora');
}

/** Puede levantar baraja: quien empieza la ronda, en su turno final, con la carta más baja de la mesa. */
function canDraw(state, playerId) {
  if (state.phase !== 'turns') return false;
  if (state.turnOrder[state.turnOrder.length - 1] !== playerId) return false;
  if (state.turnIdx !== state.turnOrder.length - 1) return false;
  const ps = participants(state);
  const me = playerById(state, playerId);
  if (!me || !me.card) return false;
  const minRank = Math.min(...ps.map((p) => p.card.rank));
  return me.card.rank === minRank && state.deck.length > 0;
}

// ---------- sala (lobby) ----------

function addPlayer(state, { id, token, name }) {
  requirePhase(state, 'lobby');
  if (state.players.length >= state.config.maxPlayers) throw fail('La sala está llena');
  const clean = sanitizeName(name);
  if (state.players.some((p) => p.name.toLowerCase() === clean.toLowerCase())) {
    throw fail('Ese nombre ya está en uso en esta sala');
  }
  const player = {
    id,
    token,
    name: clean,
    lives: state.config.lives,
    alive: true,
    card: null,
    connected: true,
    pelle: false,
  };
  state.players.push(player);
  if (!state.hostId) state.hostId = id;
  return player;
}

function removePlayer(state, id) {
  requirePhase(state, 'lobby');
  state.players = state.players.filter((p) => p.id !== id);
  if (state.hostId === id) state.hostId = state.players[0] ? state.players[0].id : null;
}

function setConnected(state, id, connected) {
  const p = playerById(state, id);
  if (p) p.connected = connected;
}

function updateConfig(state, actorId, patch) {
  requireHost(state, actorId);
  requirePhase(state, 'lobby');
  state.config = normalizeConfig(patch, state.config);
  return state.config;
}

/** El anfitrión marca o quita el pelle a un jugador. */
/** El anfitrión mueve a un jugador un asiento arriba (-1) o abajo (+1) en la sala, para que el orden coincida con la mesa real. */
function movePlayer(state, actorId, targetId, delta) {
  requireHost(state, actorId);
  requirePhase(state, 'lobby');
  if (delta !== -1 && delta !== 1) throw fail('Movimiento no válido');
  const i = seatOf(state, targetId);
  if (i < 0) throw fail('Jugador no encontrado');
  const j = i + delta;
  if (j < 0 || j >= state.players.length) return;
  [state.players[i], state.players[j]] = [state.players[j], state.players[i]];
}

/** El anfitrión saca a un jugador de la sala de espera. */
function kickPlayer(state, actorId, targetId) {
  requireHost(state, actorId);
  requirePhase(state, 'lobby');
  if (targetId === actorId) throw fail('No puedes sacarte a ti mismo');
  if (!playerById(state, targetId)) throw fail('Jugador no encontrado');
  removePlayer(state, targetId);
}

/** El anfitrión juega "me la quedo" por el jugador de turno (por ejemplo, si se ha desconectado). */
function forceKeep(state, actorId) {
  requireHost(state, actorId);
  requirePhase(state, 'turns');
  keep(state, currentPlayerId(state));
}

/** Pasa el papel de anfitrión a otro jugador (por ejemplo, si el anfitrión se desconecta). */
function setHost(state, playerId) {
  if (!playerById(state, playerId)) throw fail('Jugador no encontrado');
  state.hostId = playerId;
}

function togglePelle(state, actorId, targetId) {
  requireHost(state, actorId);
  const target = playerById(state, targetId);
  if (!target) throw fail('Jugador no encontrado');
  target.pelle = !target.pelle;
  return target.pelle;
}

// ---------- rondas ----------

function startRound(state, rng) {
  const alive = alivePlayers(state);
  const deck = shuffle(createDeck(), rng);
  alive.forEach((p, i) => { p.card = deck[i]; });
  state.deck = deck.slice(alive.length);

  // Orden de turnos: juega primero el siguiente al que empieza la ronda, y el que empieza la ronda juega el último.
  const n = state.players.length;
  const order = [];
  for (let k = 1; k <= n; k++) {
    const seat = (state.starterSeat + k) % n;
    if (state.players[seat].alive) order.push(state.players[seat].id);
  }

  state.round += 1;
  state.turnOrder = order;
  state.turnIdx = 0;
  state.roundActions = [];
  state.revealed = [];
  state.phase = 'turns';
}

function startGame(state, actorId, rng = Math.random) {
  requireHost(state, actorId);
  requirePhase(state, 'lobby');
  if (state.players.length < state.config.minPlayers) {
    throw fail(`Faltan jugadores (mínimo ${state.config.minPlayers})`);
  }
  for (const p of state.players) {
    p.lives = state.config.lives;
    p.alive = true;
    p.card = null;
    p.pelle = false;
  }
  state.starterSeat = 0;
  startRound(state, rng);
}

/** Vuelve a la sala tras una partida terminada, conservando jugadores y configuración. */
function restartLobby(state, actorId) {
  requireHost(state, actorId);
  requirePhase(state, 'over');
  Object.assign(state, {
    phase: 'lobby',
    round: 0,
    starterSeat: 0,
    deck: [],
    turnOrder: [],
    turnIdx: 0,
    roundActions: [],
    revealed: [],
    history: [],
    winnerId: null,
  });
  for (const p of state.players) p.pelle = false;
}

function nextRound(state, actorId, rng = Math.random) {
  requireHost(state, actorId);
  requirePhase(state, 'reveal');
  state.starterSeat = neighborSeat(state, state.starterSeat, +1);
  startRound(state, rng);
}

function assertTurn(state, actorId) {
  requirePhase(state, 'turns');
  if (currentPlayerId(state) !== actorId) throw fail('No es tu turno');
}

function advanceTurn(state) {
  state.turnIdx += 1;
  if (state.turnIdx >= state.turnOrder.length) resolveRound(state);
}

function keep(state, actorId) {
  assertTurn(state, actorId);
  state.roundActions.push({ type: 'keep', playerId: actorId });
  advanceTurn(state);
}

/** Intercambia tu carta con la del siguiente jugador (el que juega después de ti). */
function swap(state, actorId) {
  assertTurn(state, actorId);
  const seat = seatOf(state, actorId);
  const neighborIdx = neighborSeat(state, seat, +1);
  if (neighborIdx === null) throw fail('No hay siguiente jugador con quien intercambiar');

  const me = state.players[seat];
  const other = state.players[neighborIdx];
  [me.card, other.card] = [other.card, me.card];

  // Pública, pero sin revelar qué carta se ha movido.
  state.roundActions.push({ type: 'swap', playerId: actorId, neighborId: other.id });
  advanceTurn(state);
}

/**
 * Levantar baraja: quien reparte (juega el último), si tiene la carta más baja, coge la carta
 * de arriba del mazo y se queda con ella. Después se revela y pierde quien tenga la más baja,
 * así que si la carta nueva es mayor que la de otro, pierde ese otro.
 */
function draw(state, actorId) {
  assertTurn(state, actorId);
  if (!canDraw(state, actorId)) {
    if (state.turnOrder[state.turnOrder.length - 1] !== actorId) {
      throw fail('Solo puede levantar baraja quien reparte, en su turno');
    }
    if (state.deck.length === 0) throw fail('La baraja está vacía');
    throw fail('Solo puede levantar baraja quien tiene la carta más baja');
  }
  playerById(state, actorId).card = state.deck.shift();
  state.roundActions.push({ type: 'draw', playerId: actorId });
  advanceTurn(state);
}

/** Cierre de ronda: revela, quita vidas a la carta más baja, aplica las cartas especiales y elimina. */
function resolveRound(state) {
  const ps = participants(state);
  const reveals = ps.map((p) => ({ playerId: p.id, name: p.name, seat: seatOf(state, p.id), card: { ...p.card } }));
  const livesBefore = {};
  for (const p of state.players) livesBefore[p.id] = p.lives;

  // Pierde quien tiene la carta más baja (todos los empatados).
  const minRank = Math.min(...reveals.map((r) => r.card.rank));
  const losers = reveals.filter((r) => r.card.rank === minRank).map((r) => r.playerId);

  const delta = Object.fromEntries(ps.map((p) => [p.id, losers.includes(p.id) ? -LIVES_LOST : 0]));
  const effects = [];
  for (const r of reveals) {
    const effect = specialEffectFor(r.card);
    if (!effect) continue;
    const holder = playerById(state, r.playerId);
    if (effect.blockedByPelle && holder.pelle) {
      effects.push({ playerId: r.playerId, label: effect.label, lives: 0, blocked: true });
      continue;
    }
    if (effect.mode === 'total') delta[r.playerId] = effect.lives;
    else delta[r.playerId] += effect.lives;
    effects.push({ playerId: r.playerId, label: effect.label, lives: effect.lives, blocked: false, mode: effect.mode });
  }
  for (const p of ps) p.lives += delta[p.id];

  let eliminated = ps.filter((p) => p.lives <= 0).map((p) => p.id);
  let tiebreak = false;
  if (eliminated.length && eliminated.length === alivePlayers(state).length) {
    // Los últimos caen a la vez: siguen con 1 vida y repiten ronda entre ellos.
    tiebreak = true;
    for (const id of eliminated) playerById(state, id).lives = 1;
    eliminated = [];
  }
  for (const id of eliminated) {
    const p = playerById(state, id);
    p.lives = 0;
    p.alive = false;
  }

  const livesAfter = {};
  for (const p of state.players) livesAfter[p.id] = p.lives;

  state.history.push({
    round: state.round,
    minRank,
    reveals,
    losers,
    effects,
    eliminated,
    tiebreak,
    livesBefore,
    livesAfter,
    actions: state.roundActions.slice(),
  });

  for (const p of state.players) p.card = null;
  state.deck = [];
  state.revealed = reveals;

  const alive = alivePlayers(state);
  if (alive.length <= 1) {
    state.phase = 'over';
    state.winnerId = alive[0] ? alive[0].id : null;
  } else {
    state.phase = 'reveal';
  }
}

// ---------- vista por jugador ----------

/**
 * Estado que se envía a un jugador concreto. Solo incluye su propia carta
 * durante la ronda. Las cartas de todos se muestran únicamente tras revelar.
 */
function publicView(state, viewerId) {
  const viewer = playerById(state, viewerId);
  const current = currentPlayerId(state);

  let next = null;
  if (viewer && current === viewerId) {
    const nextSeat = neighborSeat(state, seatOf(state, viewerId), +1);
    next = nextSeat === null ? null : state.players[nextSeat].id;
  }

  const revealing = state.phase === 'reveal' || state.phase === 'over';

  return {
    phase: state.phase,
    round: state.round,
    deckCount: state.deck.length,
    config: { ...state.config },
    hostId: state.hostId,
    winnerId: state.winnerId,
    currentPlayerId: current,
    players: state.players.map((p, seat) => ({
      id: p.id,
      name: p.name,
      seat,
      lives: p.lives,
      alive: p.alive,
      connected: p.connected,
      pelle: p.pelle,
      hasCard: p.card !== null,
      isHost: p.id === state.hostId,
    })),
    you: viewer
      ? {
          id: viewer.id,
          card: viewer.card ? { ...viewer.card } : null,
          isHost: viewer.id === state.hostId,
          canAct: current === viewer.id,
          canDraw: canDraw(state, viewer.id),
          next,
        }
      : null,
    revealed: revealing ? state.revealed.map((r) => ({ ...r, card: { ...r.card } })) : null,
    roundActions: state.roundActions.map((a) => ({ ...a })),
    history: state.history,
  };
}

const API = {
  SUITS,
  RANKS,
  LIVES_LOST,
  DEFAULT_CONFIG,
  SPECIAL_EFFECTS,
  GameError,
  createDeck,
  shuffle,
  specialEffectFor,
  normalizeConfig,
  createGame,
  addPlayer,
  removePlayer,
  setConnected,
  updateConfig,
  togglePelle,
  movePlayer,
  kickPlayer,
  forceKeep,
  setHost,
  startGame,
  restartLobby,
  nextRound,
  keep,
  swap,
  draw,
  publicView,
  currentPlayerId,
  canDraw,
};

if (typeof module !== 'undefined' && module.exports) module.exports = API;
if (typeof window !== 'undefined') window.LaRataGame = API;
