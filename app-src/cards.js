  // ---------- naipes y símbolos (compartido por todas las versiones de la app) ----------
  // Cartas: baraja española de Basquetteur (Wikimedia Commons), CC BY-SA 3.0.
  // Retocadas: oros con moneda clásica en lugar del logotipo de GNU. Ver CREDITOS.md.

  const RANK_NAME = { 1: 'As', 10: 'Sota', 11: 'Caballo', 12: 'Rey' };
  const ROJO = '#c8102e';
  const GUALDA = '#f1bf00';

  /** Ruta de la imagen de una carta. Las versiones de un solo archivo la llevan incrustada. */
  function cardSrc(card) {
    const key = `${card.suit}-${String(card.rank).padStart(2, '0')}`;
    const inline = typeof window !== 'undefined' && window.LARATA_CARTAS;
    return (inline && inline[key]) || `/cartas/${key}.webp`;
  }

  /** Precarga las 40 cartas para que se den la vuelta sin esperas. */
  function preloadCards() {
    for (const suit of ['oros', 'copas', 'espadas', 'bastos']) {
      for (const rank of [1, 2, 3, 4, 5, 6, 7, 10, 11, 12]) { const i = new Image(); i.decoding = 'async'; i.src = cardSrc({ suit, rank }); }
    }
  }

  /**
   * Cruz de Borgoña: dos troncos nudosos en aspa de esquina a esquina.
   * Devuelve los <g> en un lienzo W×H (sin <svg>), para componer banderas, dorsos e iconos.
   */
  function cruzBorgona(W, H, color, grosor) {
    const D = Math.hypot(W, H);
    const ang = Math.atan2(H, W) * 180 / Math.PI;
    const t = grosor / 2;
    const k = D * 0.055;           // tamaño de cada nudo
    const brazo = () => {
      let d = `M${-D / 2} ${-t}H${D / 2}V${t}H${-D / 2}Z`;
      // nudos alternos a cada lado del tronco, inclinados hacia fuera como ramas cortadas
      [-0.36, -0.22, -0.08, 0.08, 0.22, 0.36].forEach((f, i) => {
        const x = f * D;
        const s = i % 2 === 0 ? -1 : 1;
        d += `M${x - k * 0.9} ${s * t}L${x - k * 0.5} ${s * (t + k * 0.85)}L${x + k * 0.35} ${s * (t + k * 0.85)}L${x + k * 0.1} ${s * t}Z`;
      });
      return d;
    };
    const p = brazo();
    return `<g transform="translate(${W / 2} ${H / 2})" fill="${color}"><path transform="rotate(${ang})" d="${p}"/><path transform="rotate(${-ang})" d="${p}"/></g>`;
  }

  const RAT_PATH = '<path d="M8 33c-6 1-7-5-2-7" stroke="currentColor" stroke-width="2.4" fill="none" stroke-linecap="round"/><ellipse cx="27" cy="25" rx="18" ry="10.5"/><path d="M40 17c6-3 13-1 18 6-4 3-11 5-18 3z"/><circle cx="41" cy="13.5" r="5"/><path d="M20 34l-2 4M34 34l1 4" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>';

  /** Bandera de la cruz de Borgoña (proporción 3:2). */
  const FLAG_BORGONA = `<svg viewBox="0 0 300 200" aria-hidden="true"><rect width="300" height="200" fill="#fff"/>${cruzBorgona(300, 200, ROJO, 34)}</svg>`;
  /** Bandera de España (franjas 1:2:1). */
  const FLAG_ESPANA = `<svg viewBox="0 0 300 200" aria-hidden="true"><rect width="300" height="200" fill="${ROJO}"/><rect y="50" width="300" height="100" fill="${GUALDA}"/></svg>`;

  /**
   * Dorsos de los naipes. El de la cruz de Borgoña es el de serie; el resto se compran en la Tienda.
   * Cada dorso es un SVG de 200×308 con marco, dibujo y medallón con la rata.
   */
  const DORSOS = (() => {
    const W = 200, H = 308;
    const rata = (fondo, rata, aro) => `<circle cx="${W / 2}" cy="${H / 2}" r="34" fill="${fondo}" stroke="${aro}" stroke-width="5"/><circle cx="${W / 2}" cy="${H / 2}" r="27" fill="none" stroke="rgba(255,255,255,.6)" stroke-width="2"/><svg x="${W / 2 - 24}" y="${H / 2 - 16}" width="48" height="32" viewBox="0 0 64 42" fill="${rata}" color="${rata}">${RAT_PATH}</svg>`;
    const marco = (papel, a, b) => `<rect width="${W}" height="${H}" fill="${papel}"/><rect x="9" y="9" width="${W - 18}" height="${H - 18}" rx="8" fill="none" stroke="${a}" stroke-width="5"/><rect x="16" y="16" width="${W - 32}" height="${H - 32}" rx="5" fill="none" stroke="${b}" stroke-width="3"/>`;
    const rombos = (id, fondo, linea) => `<defs><pattern id="${id}" width="16" height="16" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="16" height="16" fill="${fondo}"/><rect width="3" height="16" fill="${linea}"/><rect width="16" height="3" fill="${linea}"/></pattern></defs><rect x="22" y="22" width="${W - 44}" height="${H - 44}" rx="4" fill="url(#${id})"/>`;
    const svg = (inner) => `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">${inner}</svg>`;
    return {
      borgona: { nombre: 'Cruz de Borgoña', precio: 0, svg: svg(`${marco('#fffdf7', ROJO, GUALDA)}<svg x="22" y="22" width="${W - 44}" height="${H - 44}" viewBox="0 0 ${W - 44} ${H - 44}">${cruzBorgona(W - 44, H - 44, ROJO, 24)}</svg>${rata(GUALDA, ROJO, ROJO)}`) },
      clasico: { nombre: 'Clásico rojo', precio: 100, svg: svg(`${marco('#fffdf7', '#9e1b1b', '#9e1b1b')}${rombos('dr', '#b3121f', '#d9545c')}${rata('#fffdf7', '#9e1b1b', '#9e1b1b')}`) },
      azul: { nombre: 'Clásico azul', precio: 100, svg: svg(`${marco('#fffdf7', '#1d3f8a', '#1d3f8a')}${rombos('da', '#24499e', '#5f80cf')}${rata('#fffdf7', '#1d3f8a', '#1d3f8a')}`) },
      tapete: { nombre: 'Tapete', precio: 150, svg: svg(`${marco('#0b4a22', '#f6c64a', '#b77d12')}<rect x="22" y="22" width="${W - 44}" height="${H - 44}" rx="4" fill="#146a33"/><g fill="none" stroke="rgba(246,198,74,.35)" stroke-width="2"><ellipse cx="100" cy="154" rx="62" ry="110"/><ellipse cx="100" cy="154" rx="48" ry="92"/></g>${rata('#f6c64a', '#0b4a22', '#b77d12')}`) },
      espana: { nombre: 'Rojigualda', precio: 250, svg: svg(`${marco('#fffdf7', '#b77d12', '#f6c64a')}<rect x="22" y="22" width="${W - 44}" height="66" fill="${ROJO}"/><rect x="22" y="88" width="${W - 44}" height="132" fill="${GUALDA}"/><rect x="22" y="220" width="${W - 44}" height="66" fill="${ROJO}"/>${rata(ROJO, GUALDA, '#b77d12')}`) },
      noche: { nombre: 'Noche', precio: 300, svg: svg(`${marco('#120c08', '#c99a3a', '#6d4507')}${rombos('dn', '#1d140c', '#3a2a14')}${rata('#120c08', '#f6c64a', '#c99a3a')}`) },
      oro: { nombre: 'Oro macizo', precio: 500, svg: svg(`${marco('#f6c64a', '#6d4507', '#fff1b0')}${rombos('do', '#e0a52a', '#ffe08a')}${rata('#6d4507', '#ffe08a', '#fff1b0')}`) },
    };
  })();
  /** Dorso equipado por este jugador (se guarda en su móvil). */
  function dorsoActual() {
    try { const p = JSON.parse(localStorage.getItem('larata-perfil') || 'null'); if (p && DORSOS[p.dorso]) return DORSOS[p.dorso].svg; } catch (_) { /* sin almacenamiento */ }
    return DORSOS.borgona.svg;
  }
  const CARD_BACK = DORSOS.borgona.svg;

  /** Logo del juego (imagen). Las versiones de un solo archivo lo llevan incrustado. */
  function logoSrc() { return (typeof window !== 'undefined' && window.LARATA_LOGO) || '/logo.webp'; }
  /** Marca de la cabecera: el logo en pequeño + nombre. */
  const LOGO = `<img src="${logoSrc()}" alt=""><span class="logo-texto">La Rata</span>`;
  const RAT_SMALL = LOGO; // compatibilidad con plantillas antiguas
  const RAT = `<svg viewBox="0 0 64 42" fill="${GUALDA}" color="${GUALDA}" aria-hidden="true">${RAT_PATH}</svg>`;

  const CROWN = '<svg viewBox="0 0 48 36" aria-hidden="true"><path d="M4 30L2 8l11 9 11-15 11 15 11-9-2 22z" fill="#f1bf00" stroke="#7a5600" stroke-width="2" stroke-linejoin="round"/><rect x="4" y="29" width="40" height="5" rx="2" fill="#f1bf00" stroke="#7a5600" stroke-width="2"/><circle cx="24" cy="21" r="3" fill="#c8102e"/><circle cx="13" cy="23" r="2" fill="#c8102e"/><circle cx="35" cy="23" r="2" fill="#c8102e"/></svg>';
  const ICON = {
    cambio: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 8h13l-3-3M20 16H7l3 3"/></svg>',
    ojo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M3 3l18 18M10.6 6.1A9.8 9.8 0 0 1 12 6c5 0 8.5 4 9.5 6-.5 1-1.5 2.4-2.9 3.6M6.6 7.6C4.6 8.9 3.2 10.7 2.5 12c1 2 4.5 6 9.5 6 1.6 0 3-.4 4.3-1"/></svg>',
    mano: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 11V5a2 2 0 0 1 4 0v5M11 10V4a2 2 0 0 1 4 0v6M15 10V6a2 2 0 0 1 4 0v8a7 7 0 0 1-7 7h-1a7 7 0 0 1-6-3.4L3 14a2 2 0 0 1 3.4-2L7 13"/></svg>',
    baraja: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><rect x="7" y="3" width="12" height="16" rx="2"/><path d="M5 6v13a2 2 0 0 0 2 2h9"/><path d="M13 8v6M10 11h6"/></svg>',
    quedar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12l5 5L20 7"/></svg>',
    jugar: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5v15a1 1 0 0 0 1.5.86l12-7.5a1 1 0 0 0 0-1.72l-12-7.5A1 1 0 0 0 7 4.5z" fill="currentColor"/></svg>',
    grupo: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="12" cy="7.5" r="3.5"/><path d="M5 20c0-3.9 3.1-7 7-7s7 3.1 7 7z"/><circle cx="5" cy="9" r="2.5" opacity=".75"/><circle cx="19" cy="9" r="2.5" opacity=".75"/><path d="M0.5 19c0-2.8 2-5 4.5-5 .9 0 1.7.2 2.4.7A8 8 0 0 0 4.3 19z" opacity=".75"/><path d="M23.5 19c0-2.8-2-5-4.5-5-.9 0-1.7.2-2.4.7A8 8 0 0 1 19.7 19z" opacity=".75"/></svg>',
    movil: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="6" y="2" width="12" height="20" rx="3"/><path d="M11 18h2"/></svg>',
    libro: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"/><path d="M4 21V5M9 8h6M9 12h6"/></svg>',
    ajustes: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M13.7 2l.5 2.6c.7.2 1.3.5 1.9.9l2.4-1.2 2.4 2.4-1.2 2.4c.4.6.7 1.2.9 1.9l2.6.5v3.4l-2.6.5c-.2.7-.5 1.3-.9 1.9l1.2 2.4-2.4 2.4-2.4-1.2c-.6.4-1.2.7-1.9.9l-.5 2.6h-3.4l-.5-2.6c-.7-.2-1.3-.5-1.9-.9l-2.4 1.2-2.4-2.4 1.2-2.4c-.4-.6-.7-1.2-.9-1.9L1 13.7v-3.4l2.6-.5c.2-.7.5-1.3.9-1.9L3.3 5.5l2.4-2.4 2.4 1.2c.6-.4 1.2-.7 1.9-.9L10.3 2zM12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z"/></svg>',
    casa: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2.5l10 8.5h-3v10h-5v-6h-4v6H5V11H2z"/></svg>',
    persona: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="12" cy="8" r="4.5"/><path d="M3 21c0-4.4 4-8 9-8s9 3.6 9 8z"/></svg>',
    llave: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12h10M10 8l4 4-4 4"/><path d="M14 4h5a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-5"/></svg>',
    corona: '<svg viewBox="0 0 48 36" fill="currentColor" aria-hidden="true"><path d="M4 30L2 8l11 9 11-15 11 15 11-9-2 22z"/><rect x="4" y="29" width="40" height="5" rx="2"/></svg>',
    trofeo: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 3h10v2h3a1 1 0 0 1 1 1c0 3.3-2.1 5.5-4.6 5.9A5 5 0 0 1 13 14.9V17h3v2H8v-2h3v-2.1a5 5 0 0 1-3.4-3C5.1 11.5 3 9.3 3 6a1 1 0 0 1 1-1h3zm0 4H5.1c.3 1.6 1.2 2.6 2.2 3A9 9 0 0 1 7 7zm10 0c0 1-.1 2-.3 3 1-.4 1.9-1.4 2.2-3z"/><rect x="6" y="20" width="12" height="2" rx="1"/></svg>',
    laurel: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M7 20c-3-2-4.5-5.5-4-9.5M17 20c3-2 4.5-5.5 4-9.5"/><path d="M4 9c1-1 2.5-1 3 .5M3.5 13c1.2-.6 2.6 0 2.8 1.5M5.5 17c1.2-.4 2.4.4 2.4 1.8M20 9c-1-1-2.5-1-3 .5M20.5 13c-1.2-.6-2.6 0-2.8 1.5M18.5 17c-1.2-.4-2.4.4-2.4 1.8"/></svg>',
    tienda: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M3 9l1.5-5h15L21 9a3 3 0 0 1-6 0 3 3 0 0 1-6 0 3 3 0 0 1-6 0z"/><path d="M4.5 12.5V21h15v-8.5a4.6 4.6 0 0 1-3-.7 4.7 4.7 0 0 1-4.5.6 4.7 4.7 0 0 1-4.5-.6 4.6 4.6 0 0 1-3 .7zM9 15h6v6H9z" fill-rule="evenodd"/></svg>',
    carrito: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 3h3l2.5 12h11l2-8H6.2"/><circle cx="9" cy="19.5" r="1.6"/><circle cx="17" cy="19.5" r="1.6"/></svg>',
    barras: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="3" y="11" width="4.5" height="10" rx="1"/><rect x="9.75" y="4" width="4.5" height="17" rx="1"/><rect x="16.5" y="8" width="4.5" height="13" rx="1"/></svg>',
    tendencia: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/></svg>',
    mundo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.5 3.8 5.5 3.8 9s-1.3 6.5-3.8 9c-2.5-2.5-3.8-5.5-3.8-9S9.5 5.5 12 3z"/></svg>',
    amigos: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="9" cy="8" r="4"/><path d="M1.5 20c0-4 3.4-7 7.5-7s7.5 3 7.5 7z"/><circle cx="17" cy="9" r="3.2" opacity=".8"/><path d="M17.8 13.2c2.7.4 4.7 2.9 4.7 5.8h-4.5c0-2.3-.8-4.3-2.1-5.6.6-.2 1.2-.3 1.9-.2z" opacity=".8"/></svg>',
    podio: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8.5 9h7v12h-7zM2 13h6v8H2zm14 3h6v5h-6z"/><path d="M12 2l1 2 2.2.3-1.6 1.5.4 2.2-2-1-2 1 .4-2.2L8.8 4.3 11 4z"/></svg>',
    regalo: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M3 8h18v4H3zM4 13h7v8H4zm9 0h7v8h-7zM11 8h2v13h-2z"/><path d="M12 8C10 4 6.5 3.5 6.5 5.8 6.5 7.5 9 8 12 8zm0 0c2-4 5.5-4.5 5.5-2.2C17.5 7.5 15 8 12 8z"/></svg>',
    estrella: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2.5l2.9 6 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.2 1.3-6.6-4.9-4.6 6.6-.8z"/></svg>',
    compartir: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4"/></svg>',
  };

  /** Un naipe que se puede girar. `card` null = solo el dorso. */
  function naipe(card, opts) {
    const o = opts || {};
    const kids = [h('div', { class: 'dorso', html: o.dorso ? DORSOS[o.dorso].svg : dorsoActual() })];
    if (card) {
      const img = h('img', { src: cardSrc(card), alt: '', draggable: 'false', decoding: 'async' });
      kids.push(h('div', { class: 'cara' }, img));
    }
    const name = card ? `${RANK_NAME[card.rank] || card.rank} de ${card.suit}` : '';
    return h('div', { class: `naipe ${o.up ? 'boca-arriba' : ''} ${o.cls || ''}`.trim(), role: 'img', 'aria-label': card && o.up ? name : 'Carta boca abajo' },
      h('div', { class: 'naipe-in' }, kids));
  }

  /** Franja rojigualda decorativa. */
  function franja(cls) { return h('div', { class: `franja ${cls || ''}`.trim(), 'aria-hidden': 'true' }); }
