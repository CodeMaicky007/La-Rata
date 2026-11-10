'use strict';

/**
 * Dónde viven las partidas.
 *  - Memoria: un solo servidor siempre encendido (Render, tu ordenador, pruebas).
 *  - Redis: varias copias del servidor a la vez (Vercel). Todas leen y escriben la misma
 *    partida y se avisan de cada cambio por un canal de Redis.
 *
 * Una sala guardada: { code, state, version, game, hist, recorded }.
 * Las conexiones (sockets) NO se guardan: cada copia del servidor conoce solo las suyas.
 */

const ROOM_TTL_S = 6 * 60 * 60; // una sala sin movimiento se borra a las 6 horas

class MemoryStore {
  constructor() {
    this.rooms = new Map();
    this.listeners = new Set();
    this.kind = 'memoria';
    const sweep = setInterval(() => {
      const limit = Date.now() - ROOM_TTL_S * 1000;
      for (const [code, room] of this.rooms) if (room.touched < limit) this.rooms.delete(code);
    }, 10 * 60 * 1000);
    sweep.unref();
  }

  async exists(code) { return this.rooms.has(code); }

  async get(code) {
    const room = this.rooms.get(code);
    return room ? JSON.parse(JSON.stringify(room.data)) : null;
  }

  async create(data) {
    if (this.rooms.has(data.code)) return false;
    this.rooms.set(data.code, { data: JSON.parse(JSON.stringify(data)), touched: Date.now() });
    return true;
  }

  /** Aplica `fn` a la sala y la guarda. Si `fn` lanza un error, no se guarda nada. */
  async mutate(code, fn) {
    const entry = this.rooms.get(code);
    if (!entry) return null;
    const room = JSON.parse(JSON.stringify(entry.data));
    const result = fn(room);
    room.version += 1;
    entry.data = room;
    entry.touched = Date.now();
    return { room: JSON.parse(JSON.stringify(room)), result };
  }

  async publish(code) { setImmediate(() => this.listeners.forEach((f) => f(code))); }
  onChange(fn) { this.listeners.add(fn); }
  async close() {}
}

class RedisStore {
  constructor(url, RedisClass) {
    const Redis = RedisClass || require('ioredis');
    const opts = { maxRetriesPerRequest: 3, enableReadyCheck: true, lazyConnect: false };
    this.db = new Redis(url, opts);
    this.sub = new Redis(url, opts);
    this.listeners = new Set();
    this.kind = 'redis';
    this.sub.on('message', (_channel, code) => this.listeners.forEach((f) => f(code)));
    this.ready = this.sub.subscribe('larata:cambios');
    for (const c of [this.db, this.sub]) c.on('error', (e) => console.error('Redis:', e.message));
  }

  key(code) { return `larata:sala:${code}`; }

  async exists(code) { return (await this.db.exists(this.key(code))) === 1; }

  async get(code) {
    const raw = await this.db.get(this.key(code));
    return raw ? JSON.parse(raw) : null;
  }

  async create(data) {
    const ok = await this.db.set(this.key(data.code), JSON.stringify(data), 'EX', ROOM_TTL_S, 'NX');
    return ok === 'OK';
  }

  /** Lee, cambia y guarda la sala con un candado, para que dos jugadas a la vez no se pisen. */
  async mutate(code, fn) {
    const lock = `larata:candado:${code}`;
    const token = Math.random().toString(36).slice(2);
    let got = false;
    for (let i = 0; i < 60 && !got; i++) {
      got = (await this.db.set(lock, token, 'PX', 4000, 'NX')) === 'OK';
      if (!got) await new Promise((r) => setTimeout(r, 40));
    }
    if (!got) throw new Error('La sala está ocupada, inténtalo otra vez');
    try {
      const raw = await this.db.get(this.key(code));
      if (!raw) return null;
      const room = JSON.parse(raw);
      const result = fn(room);
      room.version += 1;
      await this.db.set(this.key(code), JSON.stringify(room), 'EX', ROOM_TTL_S);
      return { room, result };
    } finally {
      // Solo se suelta el candado si sigue siendo nuestro.
      if ((await this.db.get(lock)) === token) await this.db.del(lock);
    }
  }

  async publish(code) { await this.db.publish('larata:cambios', code); }
  onChange(fn) { this.listeners.add(fn); }
  async close() { this.db.disconnect(); this.sub.disconnect(); }
}

/** Elige el almacén según el entorno: con REDIS_URL (o KV_URL de Vercel) usa Redis. */
function createStore(env = process.env) {
  const url = env.REDIS_URL || env.KV_URL;
  return url ? new RedisStore(url) : new MemoryStore();
}

module.exports = { MemoryStore, RedisStore, createStore, ROOM_TTL_S };
