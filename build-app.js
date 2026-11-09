'use strict';
/**
 * Construye todo lo que se publica:
 *  - public/                   la app instalable que sirve el servidor (index.html, una-pantalla.html, PWA)
 *  - dist/la-rata-app.html     un solo móvil que se pasa de mano en mano (archivo suelto)
 *  - dist/la-rata-online.html  versión para la sala en tiempo real de Claude (sin servidor propio)
 * Uso: node build-app.js        (los iconos PNG se generan con: node build-app.js --iconos)
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root = __dirname;
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const write = (f, text) => { fs.mkdirSync(path.dirname(path.join(root, f)), { recursive: true }); fs.writeFileSync(path.join(root, f), text); console.log(f, Buffer.byteLength(text), 'bytes'); };

const parts = { '/*GAME_JS*/': read('src/game.js'), '/*BASE_CSS*/': read('app-src/base.css'), '/*CARDS_JS*/': read('app-src/cards.js') };
function fill(src) {
  let html = read(src);
  for (const [mark, text] of Object.entries(parts)) if (html.includes(mark)) html = html.replace(mark, () => text);
  if (/\/\*(GAME_JS|BASE_CSS|CARDS_JS)\*\//.test(html)) throw new Error(`Marcador sin sustituir en ${src}`);
  return html;
}

const single = fill('app-src/la-rata-app.html');
write('dist/la-rata-app.html', single);
write('dist/la-rata-online.html', fill('app-src/la-rata-online.html'));

// App instalable
const index = fill('app-src/la-rata-server.html');
write('public/index.html', index);
write('public/una-pantalla.html', `<!doctype html>\n<html lang="es">\n<head>\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n<link rel="manifest" href="/manifest.webmanifest">\n<link rel="icon" href="/icono.svg" type="image/svg+xml">\n</head>\n<body>\n${single}\n</body>\n</html>\n`);
const version = crypto.createHash('sha256').update(index + single).digest('hex').slice(0, 10);
write('public/sw.js', read('app-src/pwa/sw.js').replace('__VERSION__', version));
write('public/manifest.webmanifest', read('app-src/pwa/manifest.webmanifest'));
write('public/icono.svg', read('app-src/pwa/icono.svg'));

if (process.argv.includes('--iconos')) {
  // Necesita Playwright (solo en desarrollo). Los PNG resultantes se guardan en el repositorio.
  const { chromium } = require('playwright');
  (async () => {
    const svg = read('app-src/pwa/icono.svg');
    const browser = await chromium.launch();
    const page = await browser.newPage();
    const shot = async (size, file, pad) => {
      await page.setViewportSize({ width: size, height: size });
      const inner = pad ? `<div style="width:100%;height:100%;background:#0b2e22;display:grid;place-items:center"><div style="width:${100 - pad * 2}%;height:${100 - pad * 2}%">${svg.replace('<svg ', '<svg width="100%" height="100%" ')}</div></div>` : svg.replace('<svg ', '<svg width="100%" height="100%" ');
      await page.setContent(`<html><body style="margin:0;width:${size}px;height:${size}px">${inner}</body></html>`);
      await page.screenshot({ path: path.join(root, file) });
      console.log(file);
    };
    await shot(192, 'public/icono-192.png');
    await shot(512, 'public/icono-512.png');
    await shot(512, 'public/icono-maskable-512.png', 10);
    await shot(180, 'public/icono-180.png');
    await browser.close();
  })();
}
