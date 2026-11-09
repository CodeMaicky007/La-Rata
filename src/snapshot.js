'use strict';

/**
 * Lo que el servidor manda a UN jugador. Formato compacto que entiende la app.
 * Regla de oro: durante la ronda solo va la carta de quien lo recibe (`c`).
 * Las cartas de los demás solo viajan cuando la ronda ya está revelada (`res`).
 */
const G = require('./game');

const enc = (c) => (c ? `${c.rank}${c.suit[0]}` : null);

function roundSummary(state, entryIndex) {
  const e = state.history[entryIndex];
  return {
    r: e.round,
    lo: e.losers,                 // quienes tenían la carta más baja
    tb: e.tiebreak ? 1 : 0,       // los últimos cayeron a la vez: se repite ronda entre ellos
    el: e.eliminated,
    rv: e.reveals.map((x) => [x.playerId, enc(x.card)]),
    ef: e.effects.map((f) => [f.playerId, f.label, f.lives, f.blocked ? 1 : 0]),
    la: e.livesAfter,
    lb: Object.fromEntries(e.reveals.map((x) => [x.playerId, e.livesBefore[x.playerId]])),
    ac: e.actions.map((a) => [a.type, a.playerId, a.neighborId || null]),
  };
}

function snapshotFor(room, viewerId) {
  const s = room.state;
  const cfg = {
    lives: s.config.lives,
    min: s.config.minPlayers,
    max: s.config.maxPlayers,
  };
  const base = { v: room.version, sid: `${room.code}:${room.game}`, code: room.code, me: viewerId, host: s.hostId, cfg };

  if (s.phase === 'lobby') {
    return Object.assign(base, {
      k: 'sala',
      lobby: s.players.map((p) => ({ p: p.id, n: p.name })),
      on: s.players.filter((p) => p.connected).map((p) => p.id),
    });
  }

  const viewer = s.players.find((p) => p.id === viewerId);
  const snap = Object.assign(base, {
    k: 'juego',
    ph: s.phase,
    r: s.round,
    dk: s.deck.length,
    to: s.turnOrder,
    ti: s.turnIdx,
    cur: G.currentPlayerId(s),
    pl: s.players.map((p) => ({ p: p.id, n: p.name, l: p.lives, a: p.alive, pe: p.pelle, on: p.connected })),
    ac: s.roundActions.map((a) => [a.type, a.playerId, a.neighborId || null]),
    // Solo se le dice a quien puede levantar baraja; el resto no recibe esa pista.
    cd: s.phase === 'turns' && G.canDraw(s, viewerId) ? viewerId : null,
    win: s.winnerId,
    hi: room.hist.slice(-6),
  });
  if (s.phase === 'turns' && viewer && viewer.card) snap.c = { [viewerId]: enc(viewer.card) };
  if (s.phase !== 'turns' && s.history.length) snap.res = roundSummary(s, s.history.length - 1);
  return snap;
}

/** Entrada compacta del historial de la partida (para el marcador). */
function historyEntry(state) {
  const e = state.history[state.history.length - 1];
  return { r: e.round, lo: e.losers, tb: e.tiebreak ? 1 : 0, rv: e.reveals.map((x) => [x.playerId, enc(x.card)]), la: e.livesAfter };
}

module.exports = { snapshotFor, historyEntry, enc };
