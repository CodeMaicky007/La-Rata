# La Rata

Juego de cartas multijugador con baraja española. Cada jugador juega desde su móvil con una app instalable. El servidor lleva la partida y solo envía a cada móvil su propia carta.

## Cómo está hecho

| Parte | Dónde | Qué hace |
|---|---|---|
| Motor del juego | `src/game.js` | Reglas, turnos, vidas, cartas especiales. Sin red. |
| Lo que ve cada jugador | `src/snapshot.js` | Estado compacto por jugador: solo su carta durante la ronda. |
| Servidor | `src/server.js` | Sirve la app, salas con código de 5 letras, WebSocket en `/ws`, reconexión, `/salud`. |
| App instalable | `app-src/la-rata-server.html` → `public/` | Interfaz del móvil (PWA: manifiesto, service worker, iconos). |
| Un solo móvil | `app-src/la-rata-app.html` → `public/una-pantalla.html` | Modo pasar el móvil de mano en mano, funciona sin conexión. |
| Pruebas | `test/` | Reglas y una partida completa contra el servidor real. |

Los archivos de `public/` se generan con `npm run build` a partir de `app-src/` y se suben al repositorio, así que el servidor no necesita construir nada al arrancar.

## En tu ordenador

Necesitas [Node.js](https://nodejs.org) 20 o superior.

```bash
npm install
npm start          # http://localhost:3000
npm test           # 38 pruebas
npm run build      # tras cambiar algo en app-src/ o src/game.js
```

Para probar con móviles en tu misma wifi, abre `http://IP-DE-TU-ORDENADOR:3000`. Para instalar la app en el móvil hace falta HTTPS, que da el servidor en internet (abajo).

## Ponerlo en internet (Render, gratis)

1. Sube esta carpeta a un repositorio de GitHub.
2. En [render.com](https://render.com): **New → Blueprint** y elige el repositorio. Render lee `render.yaml` y crea el servicio.
3. Cuando termine, la app queda en `https://la-rata-XXXX.onrender.com`. Comprueba `…/salud`: debe responder `{"ok":true,…}`.

Cada `git push` a la rama principal vuelve a publicar la app sola. El plan gratuito se duerme tras 15 minutos sin uso; la primera visita tarda un minuto en despertarlo. Las partidas viven en memoria: si el servidor se reinicia, se pierden las que estaban en curso.

También hay un `Dockerfile` por si prefieres otro proveedor (Railway, Fly.io, un VPS).

## Reglas implementadas

- Cada uno recibe una carta y solo ve la suya.
- Por turnos: te la quedas o la cambias con el siguiente de la lista (el último con el primero). Quien reparte en cada ronda (va rotando) juega el último.
- Quien reparte, si tiene la carta más baja, puede levantar baraja. Si la carta que saca es mayor que la más baja de otro, ese otro pierde.
- Gana la carta más baja. Un 12 gana la ronda al momento.
- As de bastos: −2 vidas. Rey de bastos: +1 vida, salvo con pelle (lo da quien lleva la mesa, desde el marcador).
- Vidas iniciales configurables (2 por defecto). Sin vidas quedas fuera; gana el último vivo.
- Empate en la carta más baja: configurable (los empatados ganan, o los empatados pierden).
