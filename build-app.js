'use strict';
/**
 * Construye todo lo que se publica:
 *  - public/                   la app instalable que sirve el servidor (index.html, una-pantalla.html, PWA)
 *  - dist/la-rata-app.html     un solo móvil que se pasa de mano en mano (archivo suelto)
 * Uso: node build-app.js
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root = __dirname;
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
// Comprueba que todos los <script> de una página compilan antes de escribirla.
function checkScripts(f, text) {
  if (!f.endsWith('.html')) return;
  for (const m of text.matchAll(/<script>([\s\S]*?)<\/script>/g)) {
    try { new Function(m[1]); } catch (e) { throw new Error(`Error de sintaxis en ${f}: ${e.message}`); }
  }
}
const write = (f, text) => { checkScripts(f, text); fs.mkdirSync(path.dirname(path.join(root, f)), { recursive: true }); fs.writeFileSync(path.join(root, f), text); console.log(f, Buffer.byteLength(text), 'bytes'); };

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
const logo = 'data:image/webp;base64,' + fs.readFileSync(path.join(root, 'public/logo.webp')).toString('base64');
const inlineCards = (html) => html.replace('<div id="app"></div>', () => `<script>window.LARATA_CARTAS=${JSON.stringify(cartas)};window.LARATA_LOGO=${JSON.stringify(logo)};</script>\n<div id="app"></div>`);

const single = fill('app-src/la-rata-app.html');
write('dist/la-rata-app.html', inlineCards(single));

// App instalable
const index = fill('app-src/la-rata-server.html');
write('public/index.html', index);
write('public/una-pantalla.html', `<!doctype html>\n<html lang="es">\n<head>\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n<link rel="manifest" href="/manifest.webmanifest">\n<link rel="icon" href="/icono-192.png" type="image/png">\n</head>\n<body>\n${single}\n</body>\n</html>\n`);
const version = crypto.createHash('sha256').update(index + single + Object.keys(cartas).join()).digest('hex').slice(0, 10);
write('public/sw.js', read('app-src/pwa/sw.js').replace('__VERSION__', version));
write('public/manifest.webmanifest', read('app-src/pwa/manifest.webmanifest'));
// Los iconos PNG de la app salen del logo (public/icono-*.png) y se guardan en el repositorio.

// Ejemplo sin servidor (intro, menú, tienda, recompensas...), con cartas y logo incrustados.
const demo = inlineCards(index).replace('<script>window.LARATA_CARTAS=', '<script>window.LARATA_DEMO=true;window.LARATA_CARTAS=');
write('dist/la-rata-menu-ejemplo.html', demo);
// Versión para publicar como artefacto: sin <html>/<head>/<body> ni manifiesto.
const head = demo.slice(demo.indexOf('<head>') + 6, demo.indexOf('</head>'))
  .replace(/<meta charset[^>]*>\s*/, '').replace(/<meta name="viewport"[^>]*>\s*/, '')
  .replace(/<link rel="manifest"[^>]*>\s*/, '').replace(/<link rel="(icon|apple-touch-icon)"[^>]*>\s*/g, '');
const body = demo.slice(demo.indexOf('<body>') + 6, demo.indexOf('</body>'));
write('dist/la-rata-menu-artefacto.html', `${head}\n<meta name="claude:viewport-fit-sides" content="cover">\n${body}`);
