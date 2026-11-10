'use strict';

/**
 * Servidor de LA RATA.
 *  - Sirve la app instalable (carpeta public/).
 *  - Lleva las salas y las sincroniza por WebSocket (/ws). Cada jugador recibe solo su carta (snapshot.js).
 *  - Las partidas se guardan en un almacén (store.js): en memoria con un solo servidor (Render, local)
 *    o en Redis cuando hay varias copias del servidor (Vercel). Cada copia conoce solo sus conexiones;
 *    cuando una sala cambia, el almacén avisa a todas y cada una manda el estado a sus jugadores.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');
const game = require('./game');
const { snapshotFor, historyEntry } = require('./snapshot');
const { createStore } = require('./store');

const PORT = Number(process.env.PORT) || 3000;
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const ROOM_CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // sin caracteres que se confundan (0/O, 1/I/L)
const ROOM_CODE_LENGTH = 5;
const LOBBY_GRACE_MS = 2 * 60 * 1000;   // margen para volver antes de perder el sitio en la sala
const HOST_GRACE_MS = 45 * 1000;        // si quien lleva la mesa se cae en plena partida, otro toma el mando
const HEARTBEAT_MS = 25 * 1000;         // mantiene vivas las conexiones detrás de proxies

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
};

const newId = () => crypto.randomBytes(5).toString('hex');
const newToken = () => crypto.randomBytes(16).toString('hex');
const normCode = (code) => String(code || '').trim().toUpperCase();

function send(ws, message) {
  if (ws && ws.readyState === ws.OPEN) ws.send(JSON.stringify(message));
}

/** Guarda la ronda recién terminada en el historial compacto de la sala. */
function recordRound(room) {
  const s = room.state;
  if (s.phase !== 'turns' && s.history.length && room.recorded !== s.history.length) {
    room.recorded = s.history.length;
    room.hist.push(historyEntry(s));
  }
}

function createAppServer(options = {}) {
  const store = options.store || createStore();
  const startedAt = Date.now();
  /** Conexiones de ESTA copia del servidor: código de sala → (jugador → socket). */
  const local = new Map();

  // ---------- conexiones locales ----------

  function attachLocal(code, playerId, ws) {
    if (!local.has(code)) local.set(code, new Map());
    const sockets = local.get(code);
    const previous = sockets.get(playerId);
    if (previous && previous !== ws) {
      previous.playerId = null;
      previous.roomCode = null;
      try { previous.close(4000, 'Sesión abierta en otro sitio'); } catch (_) { /* ya cerrado */ }
    }
    sockets.set(playerId, ws);
    ws.roomCode = code;
    ws.playerId = playerId;
  }

  function detachLocal(ws) {
    const sockets = local.get(ws.roomCode);
    if (!sockets || sockets.get(ws.playerId) !== ws) return false;
    sockets.delete(ws.playerId);
    if (!sockets.size) local.delete(ws.roomCode);
    return true;
  }

  /** Cuando una sala cambia (aquí o en otra copia), manda el estado a los jugadores conectados aquí. */
  async function deliver(code) {
    const sockets = local.get(code);
    if (!sockets || !sockets.size) return;
    const room = await store.get(code);
    for (const [playerId, ws] of [...sockets]) {
      if (!room || !room.state.players.some((p) => p.id === playerId)) {
        // Ya no está en la sala (le han sacado o la sala ha caducado).
        sockets.delete(playerId);
        if (room) send(ws, { type: 'kicked' });
        ws.playerId = null;
        ws.roomCode = null;
        continue;
      }
      send(ws, { type: 'state', snap: snapshotFor(room, playerId) });
    }
  }
  store.onChange((code) => { deliver(code).catch((e) => console.error('Error al enviar el estado:', e)); });

  // ---------- acceso a las salas ----------

  async function makeRoomCode() {
    for (let attempt = 0; attempt < 200; attempt++) {
      let code = '';
      for (let i = 0; i < ROOM_CODE_LENGTH; i++) code += ROOM_CODE_CHARS[crypto.randomInt(ROOM_CODE_CHARS.length)];
      if (!(await store.exists(code))) return code;
    }
    throw new Error('No se pudo generar un código de sala');
  }

  /** Cambia una sala guardada y avisa a todos. Si `fn` lanza un error del juego, no se guarda nada. */
  async function mutate(code, fn, missing = 'No existe ninguna sala con ese código') {
    const out = await store.mutate(code, fn);
    if (!out) throw new game.GameError(missing);
    await store.publish(code);
    return out;
  }

  function mine(ws) {
    if (!ws.roomCode || !ws.playerId) throw new game.GameError('No estás en ninguna sala');
    return ws.roomCode;
  }

  /** Acción de un jugador sobre su sala. */
  const onMyRoom = (fn) => async (ws, msg) => {
    const code = mine(ws);
    await mutate(code, (room) => fn(room, ws.playerId, msg), 'La sala ya no existe');
  };

  /** Marca una conexión nueva de un jugador (sirve para saber cuál de sus conexiones es la vigente). */
  function connect(room, playerId) {
    const p = room.state.players.find((x) => x.id === playerId);
    p.conn = newId();
    game.setConnected(room.state, playerId, true);
    return p.conn;
  }

  // ---------- acciones de la app ----------

  const handlers = {
    async create(ws, msg) {
      const state = game.createGame(msg.config || {});
      const player = game.addPlayer(state, { id: newId(), token: newToken(), name: msg.name });
      const code = await makeRoomCode();
      const room = { code, state, version: 0, game: 1, hist: [], recorded: 0 };
      ws.conn = connect(room, player.id);
      if (!(await store.create(room))) throw new Error('No se pudo crear la sala');
      attachLocal(code, player.id, ws);
      send(ws, { type: 'joined', code, token: player.token, playerId: player.id });
      await store.publish(code);
    },

    async join(ws, msg) {
      const code = normCode(msg.code);
      const { result: player } = await mutate(code, (room) => {
        if (room.state.phase !== 'lobby') throw new game.GameError('La partida ya ha empezado. Espera a la siguiente.');
        const p = game.addPlayer(room.state, { id: newId(), token: newToken(), name: msg.name });
        ws.conn = connect(room, p.id);
        return { id: p.id, token: p.token };
      });
      attachLocal(code, player.id, ws);
      send(ws, { type: 'joined', code, token: player.token, playerId: player.id });
      await deliver(code);
    },

    async resume(ws, msg) {
      const code = normCode(msg.code);
      const { result: player } = await mutate(code, (room) => {
        const p = room.state.players.find((x) => typeof msg.token === 'string' && x.token === msg.token);
        if (!p) throw new game.GameError('Tu sitio en esa sala ya no existe');
        ws.conn = connect(room, p.id);
        return { id: p.id, token: p.token };
      });
      attachLocal(code, player.id, ws);
      send(ws, { type: 'joined', code, token: player.token, playerId: player.id });
      await deliver(code);
    },

    config: onMyRoom((room, me, msg) => {
      const c = msg.config || {};
      const patch = {};
      if ('lives' in c) patch.lives = c.lives;
      game.updateConfig(room.state, me, patch);
    }),
    move: onMyRoom((room, me, msg) => game.movePlayer(room.state, me, msg.target, msg.delta)),
    kick: onMyRoom((room, me, msg) => game.kickPlayer(room.state, me, msg.target)),
    start: onMyRoom((room, me) => { game.startGame(room.state, me); room.hist = []; room.recorded = 0; recordRound(room); }),
    keep: onMyRoom((room, me) => { game.keep(room.state, me); recordRound(room); }),
    swap: onMyRoom((room, me) => { game.swap(room.state, me); recordRound(room); }),
    draw: onMyRoom((room, me) => { game.draw(room.state, me); recordRound(room); }),
    skip: onMyRoom((room, me) => { game.forceKeep(room.state, me); recordRound(room); }),
    next: onMyRoom((room, me) => { game.nextRound(room.state, me); recordRound(room); }),
    pelle: onMyRoom((room, me, msg) => game.togglePelle(room.state, me, msg.target)),
    rematch: onMyRoom((room, me) => {
      game.restartLobby(room.state, me);
      room.game += 1;
      game.startGame(room.state, me);
      room.hist = [];
      room.recorded = 0;
      recordRound(room);
    }),
    lobby: onMyRoom((room, me) => {
      game.restartLobby(room.state, me);
      room.game += 1;
      room.hist = [];
      room.recorded = 0;
    }),

    async leave(ws) {
      const code = mine(ws);
      const me = ws.playerId;
      detachLocal(ws);
      ws.playerId = null;
      ws.roomCode = null;
      await mutate(code, (room) => {
        if (room.state.phase === 'lobby') game.removePlayer(room.state, me);
        else game.setConnected(room.state, me, false);
      }, 'La sala ya no existe');
    },
  };

  /** Al cerrarse una conexión: se marca como desconectado y se programan los plazos de cortesía. */
  async function onClose(ws) {
    const code = ws.roomCode;
    const me = ws.playerId;
    const conn = ws.conn;
    if (!code || !me || !detachLocal(ws)) return;
    const isCurrent = (room) => {
      const p = room.state.players.find((x) => x.id === me);
      return p && p.conn === conn && !p.connected;
    };
    const out = await store.mutate(code, (room) => {
      const p = room.state.players.find((x) => x.id === me);
      if (p && p.conn === conn) game.setConnected(room.state, me, false);
      return { phase: room.state.phase, host: room.state.hostId === me };
    });
    if (!out) return;
    await store.publish(code);

    if (out.result.phase === 'lobby') {
      setTimeout(() => {
        mutate(code, (room) => {
          if (room.state.phase === 'lobby' && isCurrent(room)) game.removePlayer(room.state, me);
        }).catch(() => {});
      }, LOBBY_GRACE_MS).unref();
    } else if (out.result.host) {
      setTimeout(() => {
        mutate(code, (room) => {
          if (room.state.hostId !== me || !isCurrent(room)) return;
          const heir = room.state.players.find((p) => p.connected && p.alive) || room.state.players.find((p) => p.connected);
          if (heir) game.setHost(room.state, heir.id);
        }).catch(() => {});
      }, HOST_GRACE_MS).unref();
    }
  }

  // ---------- HTTP ----------

  function serveStatic(req, res) {
    let urlPath;
    try {
      urlPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    } catch (_) {
      res.writeHead(400).end('Solicitud no válida');
      return;
    }

    if (urlPath === '/salud' || urlPath === '/api/salud' || urlPath === '/api/ws') {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify({ ok: true, almacen: store.kind, arrancado: new Date(startedAt).toISOString() }));
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
      const cache = ['.png', '.svg', '.ico', '.webp'].includes(ext) ? 'public, max-age=604800' : 'no-cache';
      res.writeHead(200, {
        'Content-Type': MIME[ext] || 'application/octet-stream',
        'Cache-Control': cache,
        'X-Content-Type-Options': 'nosniff',
      });
      res.end(data);
    });
  }

  // ---------- servidor ----------

  const server = http.createServer(serveStatic);
  // Sin ruta fija: en Render llega por /ws y en Vercel por /api/ws (el cliente siempre usa /ws).
  const wss = new WebSocketServer({ server, maxPayload: 16 * 1024 });

  wss.on('connection', (ws) => {
    ws.playerId = null;
    ws.roomCode = null;
    ws.isAlive = true;
    ws.queue = Promise.resolve(); // los mensajes de un jugador se atienden en orden
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
      ws.queue = ws.queue.then(() => handler(ws, msg)).catch((err) => {
        if (err && err.userError) send(ws, { type: 'error', message: err.message, action: msg.type });
        else {
          console.error('Error interno:', err);
          send(ws, { type: 'error', message: 'Error interno del servidor' });
        }
      });
    });

    ws.on('close', () => {
      ws.queue = ws.queue.then(() => onClose(ws)).catch((e) => console.error('Error al cerrar:', e));
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
  server.store = store;

  return server;
}

if (require.main === module) {
  const server = createAppServer();
  server.listen(PORT, () => {
    console.log(`LA RATA escuchando en el puerto ${PORT} (partidas en ${server.store.kind})`);
  });
}

module.exports = { createAppServer };
