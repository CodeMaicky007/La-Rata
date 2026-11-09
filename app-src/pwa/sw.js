// Service worker de La Rata: guarda la app para que abra al instante y funcione el modo de un solo móvil sin conexión.
// La partida en línea siempre va por la red (WebSocket); esto solo guarda los archivos de la app.
const CACHE = 'la-rata-__VERSION__';
const SHELL = ['/', '/una-pantalla.html', '/manifest.webmanifest', '/icono.svg', '/icono-192.png', '/icono-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin || url.pathname === '/ws' || url.pathname === '/salud') return;
  // Páginas: primero la red (para tener siempre la última versión), y si no hay red, la copia guardada.
  if (req.mode === 'navigate') {
    event.respondWith(fetch(req).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(url.pathname === '/' ? '/' : url.pathname, copy));
      return res;
    }).catch(() => caches.match(url.pathname === '/' ? '/' : url.pathname).then((r) => r || caches.match('/'))));
    return;
  }
  // Iconos y demás: la copia guardada si existe.
  event.respondWith(caches.match(req).then((hit) => hit || fetch(req)));
});
