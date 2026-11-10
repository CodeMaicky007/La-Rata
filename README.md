# La Rata

Juego de cartas multijugador con baraja española. Cada jugador juega desde su móvil con una app instalable. El servidor lleva la partida y solo envía a cada móvil su propia carta.

## Cómo está hecho

| Parte | Dónde | Qué hace |
|---|---|---|
| Motor del juego | `src/game.js` | Reglas, turnos, vidas, cartas especiales. Sin red. |
| Lo que ve cada jugador | `src/snapshot.js` | Estado compacto por jugador: solo su carta durante la ronda. |
| Servidor | `src/server.js` | Sirve la app, salas con código de 5 letras, WebSocket en `/api/ws`, reconexión, `/salud`. |
| Almacén de partidas | `src/store.js` | En memoria (un servidor) o en Redis (varias copias, Vercel). |
| Vercel | `vercel.json` | Vercel arranca `src/server.js` como servidor Node (con WebSocket) y sirve `public/`. |
| App instalable | `app-src/la-rata-server.html` → `public/` | Interfaz del móvil (PWA: manifiesto, service worker, iconos). |
| Un solo móvil | `app-src/la-rata-app.html` → `public/una-pantalla.html` | Modo pasar el móvil de mano en mano, funciona sin conexión. |
| Pruebas | `test/` | Reglas y una partida completa contra el servidor real. |

Los archivos de `public/` se generan con `npm run build` a partir de `app-src/` y se suben al repositorio, así que el servidor no necesita construir nada al arrancar.

## En tu ordenador

Necesitas [Node.js](https://nodejs.org) 20 o superior.

```bash
npm install
npm start          # http://localhost:3000
npm test           # 39 pruebas (incluye dos servidores compartiendo Redis)
npm run build      # tras cambiar algo en app-src/ o src/game.js
```

Para probar con móviles en tu misma wifi, abre `http://IP-DE-TU-ORDENADOR:3000`. Para instalar la app en el móvil hace falta HTTPS, que da el servidor en internet (abajo).

## Ponerlo en internet

### Vercel (recomendado)

1. En [vercel.com](https://vercel.com): **Add New → Project → Import** el repositorio `la-rata`. No hay que cambiar nada: `vercel.json` ya lo configura (arranca `src/server.js` y sirve `public/`).
2. En el proyecto: **Storage → Create Database → Upstash Redis** (plan gratuito) y conéctala al proyecto. Añade la variable `REDIS_URL` (o `KV_URL`) que usa el servidor para guardar las partidas.
3. **Deployments → Redeploy** para que la variable se aplique. Comprueba `https://…vercel.app/salud`: debe decir `"almacen":"redis"`.

Por qué hace falta Redis: Vercel arranca varias copias del servidor y corta cada conexión a los 5 minutos (la app se reconecta sola). Con Redis todas las copias comparten las partidas y se avisan de cada cambio. Sin Redis funciona, pero una partida puede perderse si dos jugadores caen en copias distintas.

### Render

**New → Blueprint** y elige el repositorio: `render.yaml` crea el servicio. Allí es un único servidor y guarda las partidas en memoria; no necesita Redis. El plan gratuito se duerme tras 15 minutos sin uso.

También hay un `Dockerfile` por si prefieres otro proveedor.

## Reglas del juego

1. Baraja española de 40 cartas (As al 7, Sota 10, Caballo 11, Rey 12). De 2 a 8 jugadores.
2. Cada jugador empieza con 2 vidas (configurable en la sala).
3. Cada jugador recibe una carta y solo ve la suya.
4. Reparte el primero de la lista y luego va rotando. Empieza a jugar el siguiente a quien reparte; quien reparte juega el último.
5. En tu turno: te la quedas, o la cambias con el siguiente de la lista (el último con el primero).
6. Quien reparte, en su turno y solo si tiene la carta más baja, puede levantar baraja: se queda la carta de arriba del mazo.
7. Al final se enseñan las cartas. Nadie gana la ronda: **pierde 1 vida quien tiene la carta más baja**. Si varios empatan, pierden todos. El palo no importa.
8. As de bastos: quien lo tiene pierde 2 vidas en total.
9. Rey de bastos: quien lo tiene gana 1 vida, salvo si tiene el pelle. Los demás reyes no hacen nada.
10. El pelle lo da a mano quien lleva la mesa (pendiente de definir cómo se consigue).
11. Sin vidas quedas fuera. Gana el último que siga con vidas. Si los últimos caen a la vez, siguen con 1 vida y repiten ronda entre ellos.
