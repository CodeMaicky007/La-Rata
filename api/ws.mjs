// Función de Vercel: el servidor de La Rata (WebSocket en /api/ws y /ws, salud en /salud).
// Las partidas se guardan en Redis (variable REDIS_URL o KV_URL que añade la integración de Upstash).
import servidor from '../src/server.js';

export default servidor.createAppServer();
