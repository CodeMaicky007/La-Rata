'use strict';

/**
 * Servidor de LA RATA.
 *  - Sirve la app instalable (carpeta public/).
 *  - Lleva las salas y las partidas en memoria y las sincroniza por WebSocket (/ws).
 *  - Cada jugador recibe solo su propia carta (ver snapshot.js).
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');
const game = require('./game');
const { snapshotFor, historyEntry } = require('./snapshot');

const PORT = Number(process.env.PORT) || 3000;
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const ROOM_CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // sin caracteres que se confundan (0/O, 1/I/L)
const ROOM_CODE_LENGTH = 5;
const LOBBY_GRACE_MS = 2 * 60 * 1000;   // margen para volver antes de perder el sitio en la sala
const HOST_GRACE_MS = 45 * 1000;        // si el anfitrión se cae en plena partida, otro toma el mando
const EMPTY_ROOM_TTL_MS = 60 * 60 * 1000;
const HEARTBEAT_MS = 25 * 1000;         // mantiene vivas las conexiones detrás de proxies

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
};

/** @type {Map<string, any>} */
const rooms = new Map();
const startedAt = Date.now();

// ---------- utilidades ----------

function makeRoomCode() {
  for (let attempt = 0; attempt < 200; attempt++) {
    let code = '';
    for (let i = 0; i < ROOM_CODE_LENGTH; i++) code += ROOM_CODE_CHARS[crypto.randomInt(ROOM_CODE_CHARS.length)];
    if (!rooms.has(code)) return code;
  }
  throw new Error('No se pudo generar un código de sala');
}

const newId = () => crypto.randomBytes(5).toString('hex');
const newToken = () => crypto.randomBytes(16).toString('hex');

function send(ws, message) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(message));
}

function broadcast(room) {
  room.version += 1;
  for (const [playerId, ws] of room.sockets) send(ws, { type: 'state', snap: snapshotFor(room, playerId) });
}

function getRoom(code) {
  const room = rooms.get(String(code || '').trim().toUpperCase());
  if (!room) throw new game.GameError('No existe ninguna sala con ese código');
  return room;
}

function requireRoom(ws) {
  if (!ws.roomCode || !ws.playerId) throw new game.GameError('No estás en ninguna sala');
  const room = rooms.get(ws.roomCode);
  if (!room) throw new game.GameError('La sala ya no existe');
  return room;
}

function scheduleRoomCleanup(room) {
  clearTimeout(room.cleanupTimer);
  if (room.state.players.some((p) => p.connected)) return;
  room.cleanupTimer = setTimeout(() => rooms.delete(room.code), EMPTY_ROOM_TTL_MS);
  room.cleanupTimer.unref();
}

/** Guarda la ronda recién terminada en el historial compacto de la sala. */
function afterAction(room) {
  const s = room.state;
  if (s.phase !== 'turns' && s.history.length && room.recorded !== s.history.length) {
    room.recorded = s.history.length;
    room.hist.push(historyEntry(s));
  }
  broadcast(room);
}

function attach(room, ws, playerId) {
  const previous = room.sockets.get(playerId);
  if (previous && previous !== ws) {
    previous.playerId = null;
    previous.roomCode = null;
    try { previous.close(4000, 'Sesión abierta en otro sitio'); } catch (_) { /* ya cerrado */ }
  }
  room.sockets.set(playerId, ws);
  ws.roomCode = room.code;
  ws.playerId = playerId;
  game.setConnected(room.state, playerId, true);
  for (const timers of [room.lobbyTimers, room.hostTimers]) {
    clearTimeout(timers.get(playerId));
    timers.delete(playerId);
  }
  clearTimeout(room.cleanupTimer);
}

function detach(room, ws) {
  const playerId = ws.playerId;
  if (!playerId || room.sockets.get(playerId) !== ws) return;
  room.sockets.delete(playerId);
  game.setConnected(room.state, playerId, false);

  if (room.state.phase === 'lobby') {
    const timer = setTimeout(() => {
      room.lobbyTimers.delete(playerId);
      if (room.sockets.has(playerId) || room.state.phase !== 'lobby') return;
      game.removePlayer(room.state, playerId);
      broadcast(room);
      scheduleRoomCleanup(room);
    }, LOBBY_GRACE_MS);
    timer.unref();
    room.lobbyTimers.set(playerId, timer);
  } else if (room.state.hostId === playerId) {
    const timer = setTimeout(() => {
      room.hostTimers.delete(playerId);
      if (room.sockets.has(playerId) || room.state.hostId !== playerId) return;
      const heir = room.state.players.find((p) => p.connected && p.alive) || room.state.players.find((p) => p.connected);
      if (heir) { game.setHost(room.state, heir.id); broadcast(room); }
    }, HOST_GRACE_MS);
    timer.unref();
    room.hostTimers.set(playerId, timer);
  }
  scheduleRoomCleanup(room);
  broadcast(room);
}

function joinedMessage(room, player) {
  return { type: 'joined', code: room.code, token: player.token, playerId: player.id };
}

// ---------- acciones de la app ----------

const handlers = {
  create(ws, msg) {
    const state = game.createGame(msg.config || {});
    const player = game.addPlayer(state, { id: newId(), token: newToken(), name: msg.name });
    const code = makeRoomCode();
    const room = {
      code, state, version: 0, game: 1, hist: [], recorded: 0,
      sockets: new Map(), lobbyTimers: new Map(), hostTimers: new Map(), cleanupTimer: null,
    };
    rooms.set(code, room);
    attach(room, ws, player.id);
    send(ws, joinedMessage(room, player));
    broadcast(room);
  },

  join(ws, msg) {
    const room = getRoom(msg.code);
    if (room.state.phase !== 'lobby') throw new game.GameError('La partida ya ha empezado. Espera a la siguiente.');
    const player = game.addPlayer(room.state, { id: newId(), token: newToken(), name: msg.name });
    attach(room, ws, player.id);
    send(ws, joinedMessage(room, player));
    broadcast(room);
  },

  resume(ws, msg) {
    const room = getRoom(msg.code);
    const player = room.state.players.find((p) => typeof msg.token === 'string' && p.token === msg.token);
    if (!player) throw new game.GameError('Tu sitio en esa sala ya no existe');
    attach(room, ws, player.id);
    send(ws, joinedMessage(room, player));
    broadcast(room);
  },

  config(ws, msg) {
    const room = requireRoom(ws);
    const c = msg.config || {};
    const patch = {};
    if ('lives' in c) patch.lives = c.lives;
    if ('lost' in c) patch.livesLostPerRound = c.lost;
    if ('tie' in c) patch.tiePolicy = c.tie;
    game.updateConfig(room.state, ws.playerId, patch);
    broadcast(room);
  },

  move(ws, msg) {
    const room = requireRoom(ws);
    game.movePlayer(room.state, ws.playerId, msg.target, msg.delta);
    broadcast(room);
  },

  kick(ws, msg) {
    const room = requireRoom(ws);
    game.kickPlayer(room.state, ws.playerId, msg.target);
    const kicked = room.sockets.get(msg.target);
    if (kicked) {
      room.sockets.delete(msg.target);
      send(kicked, { type: 'kicked' });
      kicked.playerId = null;
      kicked.roomCode = null;
    }
    broadcast(room);
  },

  start(ws) {
    const room = requireRoom(ws);
    game.startGame(room.state, ws.playerId);
    room.hist = [];
    room.recorded = 0;
    afterAction(room);
  },

  keep(ws) { const room = requireRoom(ws); game.keep(room.state, ws.playerId); afterAction(room); },
  swap(ws) { const room = requireRoom(ws); game.swap(room.state, ws.playerId); afterAction(room); },
  draw(ws) { const room = requireRoom(ws); game.draw(room.state, ws.playerId); afterAction(room); },
  skip(ws) { const room = requireRoom(ws); game.forceKeep(room.state, ws.playerId); afterAction(room); },
  next(ws) { const room = requireRoom(ws); game.nextRound(room.state, ws.playerId); afterAction(room); },

  pelle(ws, msg) {
    const room = requireRoom(ws);
    game.togglePelle(room.state, ws.playerId, msg.target);
    broadcast(room);
  },

  rematch(ws) {
    const room = requireRoom(ws);
    game.restartLobby(room.state, ws.playerId);
    room.game += 1;
    game.startGame(room.state, ws.playerId);
    room.hist = [];
    room.recorded = 0;
    afterAction(room);
  },

  lobby(ws) {
    const room = requireRoom(ws);
    game.restartLobby(room.state, ws.playerId);
    room.game += 1;
    room.hist = [];
    room.recorded = 0;
    broadcast(room);
  },

  leave(ws) {
    const room = requireRoom(ws);
    const playerId = ws.playerId;
    if (room.state.phase === 'lobby') game.removePlayer(room.state, playerId);
    else game.setConnected(room.state, playerId, false);
    room.sockets.delete(playerId);
    ws.playerId = null;
    ws.roomCode = null;
    scheduleRoomCleanup(room);
    broadcast(room);
  },
};

// ---------- HTTP ----------

function serveStatic(req, res) {
  let urlPath;
  try {
    urlPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  } catch (_) {
    res.writeHead(400).end('Solicitud no válida');
    return;
  }

  if (urlPath === '/salud') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ ok: true, salas: rooms.size, arrancado: new Date(startedAt).toISOString() }));
    return;
  }

  const relative = urlPath === '/' ? 'index.html' : urlPath.replace(/^\/+/, '');
  const filePath = path.normalize(path.join(PUBLIC_DIR, relative));
  if (!filePath.startsWith(PUBLIC_DIR + path.sep)) {
    res.writeHead(403).end('Prohibido');
    return;
  }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('No encontrado');
      return;
    }
    const ext = path.extname(filePath);
    // Iconos e imágenes se pueden guardar en caché; la app y el service worker siempre se revisan.
    const cache = ext === '.png' || ext === '.svg' || ext === '.ico' ? 'public, max-age=604800' : 'no-cache';
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': cache,
      'X-Content-Type-Options': 'nosniff',
    });
    res.end(data);
  });
}

// ---------- servidor ----------

function createAppServer() {
  const server = http.createServer(serveStatic);
  const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 16 * 1024 });

  wss.on('connection', (ws) => {
    ws.playerId = null;
    ws.roomCode = null;
    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });

    ws.on('message', (raw) => {
      let msg;
      try { msg = JSON.parse(raw.toString()); } catch (_) {
        send(ws, { type: 'error', message: 'Mensaje no válido' });
        return;
      }
      if (msg && msg.type === 'ping') { send(ws, { type: 'pong' }); return; }
      const handler = Object.prototype.hasOwnProperty.call(handlers, msg && msg.type) ? handlers[msg.type] : null;
      if (!handler) {
        send(ws, { type: 'error', message: 'Acción desconocida' });
        return;
      }
      try {
        handler(ws, msg);
      } catch (err) {
        if (err && err.userError) send(ws, { type: 'error', message: err.message, action: msg.type });
        else {
          console.error('Error interno:', err);
          send(ws, { type: 'error', message: 'Error interno del servidor' });
        }
      }
    });

    ws.on('close', () => {
      const room = rooms.get(ws.roomCode);
      if (room) detach(room, ws);
    });
  });

  const beat = setInterval(() => {
    for (const ws of wss.clients) {
      if (!ws.isAlive) { ws.terminate(); continue; }
      ws.isAlive = false;
      try { ws.ping(); } catch (_) { /* cerrado */ }
    }
  }, HEARTBEAT_MS);
  beat.unref();
  server.on('close', () => clearInterval(beat));

  return server;
}

if (require.main === module) {
  createAppServer().listen(PORT, () => {
    console.log(`LA RATA escuchando en el puerto ${PORT}`);
  });
}

module.exports = { createAppServer };
