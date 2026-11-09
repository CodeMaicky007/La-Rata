'use strict';
/**
 * Construye todo lo que se publica:
 *  - public/                   la app instalable que sirve el servidor (index.html, una-pantalla.html, PWA)
 *  - dist/la-rata-app.html     un solo móvil que se pasa de mano en mano (archivo suelto)
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

// Las versiones de un solo archivo llevan las cartas incrustadas (no pueden pedirlas al servidor).
const cartasDir = path.join(root, 'public/cartas');
const cartas = {};
for (const f of fs.readdirSync(cartasDir).filter((f) => f.endsWith('.webp')).sort()) {
  cartas[f.replace('.webp', '')] = 'data:image/webp;base64,' + fs.readFileSync(path.join(cartasDir, f)).toString('base64');
}
if (Object.keys(cartas).length !== 40) throw new Error('Faltan cartas en public/cartas (hay ' + Object.keys(cartas).length + ')');
const inlineCards = (html) => html.replace('<div id="app"></div>', () => `<script>window.LARATA_CARTAS=${JSON.stringify(cartas)};</script>\n<div id="app"></div>`);

const single = fill('app-src/la-rata-app.html');
write('dist/la-rata-app.html', inlineCards(single));

// App instalable
const index = fill('app-src/la-rata-server.html');
write('public/index.html', index);
write('public/una-pantalla.html', `<!doctype html>\n<html lang="es">\n<head>\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n<link rel="manifest" href="/manifest.webmanifest">\n<link rel="icon" href="/icono.svg" type="image/svg+xml">\n</head>\n<body>\n${single}\n</body>\n</html>\n`);
const version = crypto.createHash('sha256').update(index + single + Object.keys(cartas).join()).digest('hex').slice(0, 10);
write('public/sw.js', read('app-src/pwa/sw.js').replace('__VERSION__', version));
write('public/manifest.webmanifest', read('app-src/pwa/manifest.webmanifest'));
// Icono: el dorso de los naipes (cruz de Borgoña) sobre fondo oscuro con franja rojigualda.
const sym = new Function(`${read('app-src/cards.js')}; return { CARD_BACK };`)();
const icono = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs><radialGradient id="f" cx="50%" cy="30%" r="80%"><stop offset="0" stop-color="#3a0d16"/><stop offset="1" stop-color="#0e0a0b"/></radialGradient></defs>
  <rect width="512" height="512" fill="url(#f)"/>
  <rect y="452" width="512" height="15" fill="#c8102e"/><rect y="467" width="512" height="30" fill="#f1bf00"/><rect y="497" width="512" height="15" fill="#c8102e"/>
  <g transform="translate(256 236) rotate(-9) translate(-130 -200)">
    <rect x="6" y="10" width="260" height="400" rx="20" fill="#000" opacity=".35"/>
    <svg width="260" height="400" viewBox="0 0 200 308">${sym.CARD_BACK.replace(/^<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '')}</svg>
  </g>
</svg>`;
write('app-src/pwa/icono.svg', icono);
write('public/icono.svg', icono);

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
