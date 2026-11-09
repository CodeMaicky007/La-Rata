  // ---------- dibujos (SVG fijos, nunca datos del usuario) ----------
  const SUIT = {
    oros: '<svg viewBox="0 0 40 40"><circle cx="20" cy="20" r="17" fill="#e3b24c" stroke="#8a5a12" stroke-width="2"/><circle cx="20" cy="20" r="11.5" fill="none" stroke="#8a5a12" stroke-width="1.6"/><circle cx="20" cy="20" r="7" fill="#f3d58a" stroke="#b07a22" stroke-width="1.2"/><circle cx="20" cy="20" r="2.6" fill="#a8231b"/></svg>',
    copas: '<svg viewBox="0 0 40 40"><rect x="8" y="4" width="24" height="3.4" rx="1.7" fill="#e0ae4c" stroke="#8a5a12" stroke-width="1"/><path d="M9.5 7h21c0 9.5-4.2 15-10.5 15.6C13.7 22 9.5 16.5 9.5 7z" fill="#b3261e" stroke="#6e140f" stroke-width="1.5"/><path d="M13 9.5c.4 5 2.4 8.6 5.4 9.6" stroke="#f08a74" stroke-width="1.4" fill="none" stroke-linecap="round"/><rect x="18" y="22.5" width="4" height="7.5" fill="#e0ae4c" stroke="#8a5a12" stroke-width="1"/><path d="M11 36h18l-3.4-6H14.4z" fill="#e0ae4c" stroke="#8a5a12" stroke-width="1.2"/></svg>',
    espadas: '<svg viewBox="0 0 40 40"><path d="M20 1.5l3.6 6.5v19h-7.2V8z" fill="#d3dbe6" stroke="#2c4f8c" stroke-width="1.5"/><path d="M20 5v21" stroke="#2c4f8c" stroke-width="1" opacity=".6"/><path d="M8.5 26.5h23l-2 3.6h-19z" fill="#2c4f8c" stroke="#1a2f55" stroke-width="1"/><rect x="18" y="30" width="4" height="5.5" fill="#e0ae4c" stroke="#8a5a12" stroke-width="1"/><circle cx="20" cy="37.2" r="2.4" fill="#2c4f8c"/></svg>',
    bastos: '<svg viewBox="0 0 40 40"><path d="M16.5 38l-2.6-25.5C13.4 6.6 16.6 2 21 2c4.3 0 6.8 4.3 5.8 9.8L22.5 38z" fill="#a36a33" stroke="#5a3511" stroke-width="1.6"/><path d="M18 9c1-2 2.6-3 4.2-3" stroke="#d29a5e" stroke-width="1.5" fill="none" stroke-linecap="round"/><circle cx="15.4" cy="14" r="2.3" fill="#3d7a33" stroke="#22501c" stroke-width=".8"/><circle cx="25.4" cy="18.5" r="2.3" fill="#3d7a33" stroke="#22501c" stroke-width=".8"/><circle cx="16.6" cy="24.5" r="2" fill="#3d7a33" stroke="#22501c" stroke-width=".8"/><circle cx="23.6" cy="29" r="1.8" fill="#3d7a33" stroke="#22501c" stroke-width=".8"/></svg>',
  };
  const RAT = '<svg viewBox="0 0 64 40" aria-hidden="true"><path d="M8 33c-6 1-7-5-2-7" stroke="#f4ead3" stroke-width="2.2" fill="none" stroke-linecap="round"/><ellipse cx="27" cy="25" rx="18" ry="10.5" fill="#f4ead3"/><path d="M40 17c6-3 13-1 18 6-4 3-11 5-18 3z" fill="#f4ead3"/><circle cx="41" cy="13.5" r="5" fill="#f4ead3"/><circle cx="41" cy="13.5" r="2.4" fill="#e6a49b"/><circle cx="50" cy="20" r="1.5" fill="#6f140f"/><circle cx="58.5" cy="23" r="1.6" fill="#e6a49b"/><path d="M57 24l5 1M57 25l4.5 3" stroke="#f4ead3" stroke-width=".9" stroke-linecap="round"/><path d="M20 34l-2 4M34 34l1 4" stroke="#f4ead3" stroke-width="2.4" stroke-linecap="round"/></svg>';
  const RAT_SMALL = RAT.replace(/#f4ead3/g, '#e0ae4c');
  const CROWN = '<svg viewBox="0 0 48 36" aria-hidden="true"><path d="M4 30L2 8l11 9 11-15 11 15 11-9-2 22z" fill="currentColor" stroke="#7a4f12" stroke-width="2" stroke-linejoin="round"/><rect x="4" y="29" width="40" height="5" rx="2" fill="currentColor" stroke="#7a4f12" stroke-width="2"/><circle cx="24" cy="21" r="3" fill="#a8231b"/><circle cx="13" cy="23" r="2" fill="#2c4f8c"/><circle cx="35" cy="23" r="2" fill="#2c4f8c"/></svg>';
  const EMBLEM = {
    10: '<svg viewBox="0 0 40 40"><path d="M8 16c4-8 20-8 24 0-6-2-18-2-24 0z" fill="#a8231b" stroke="#6e140f" stroke-width="1.2"/><path d="M30 14c4-6 7-9 8-12-1 6-3 10-6 13z" fill="#e0ae4c" stroke="#8a5a12" stroke-width="1"/><circle cx="20" cy="25" r="8" fill="#f1c9a5" stroke="#8a5a12" stroke-width="1.2"/><path d="M14 38c0-5 3-7 6-7s6 2 6 7z" fill="#2c4f8c"/></svg>',
    11: '<svg viewBox="0 0 40 40"><path d="M10 38c-1-9 1-16 6-21l-3-6 6 3c3-4 9-6 13-4-2 2-2 4-1 6 3 3 3 7 0 9l-5-2c-2 4-2 9-1 15z" fill="#8a5a33" stroke="#4a2a10" stroke-width="1.3" stroke-linejoin="round"/><circle cx="27" cy="13" r="1.4" fill="#1d1812"/><path d="M17 15c-2 4-3 8-3 12" stroke="#e0ae4c" stroke-width="2" fill="none" stroke-linecap="round"/></svg>',
    12: CROWN.replace('currentColor', '#e0ae4c').replace('currentColor', '#e0ae4c'),
  };
  const ICON = {
    cambio: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 8h13l-3-3M20 16H7l3 3"/></svg>',
    ojo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M3 3l18 18M10.6 6.1A9.8 9.8 0 0 1 12 6c5 0 8.5 4 9.5 6-.5 1-1.5 2.4-2.9 3.6M6.6 7.6C4.6 8.9 3.2 10.7 2.5 12c1 2 4.5 6 9.5 6 1.6 0 3-.4 4.3-1"/></svg>',
    mano: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 11V5a2 2 0 0 1 4 0v5M11 10V4a2 2 0 0 1 4 0v6M15 10V6a2 2 0 0 1 4 0v8a7 7 0 0 1-7 7h-1a7 7 0 0 1-6-3.4L3 14a2 2 0 0 1 3.4-2L7 13"/></svg>',
    baraja: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><rect x="7" y="3" width="12" height="16" rx="2"/><path d="M5 6v13a2 2 0 0 0 2 2h9"/><path d="M13 8v6M10 11h6"/></svg>',
    quedar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12l5 5L20 7"/></svg>',
  };

  // Posiciones (% del recuadro) de los palos en las cartas de número, como en la baraja española.
  const PIP_LAYOUT = {
    2: [[50, 18], [50, 82]],
    3: [[50, 15], [50, 50], [50, 85]],
    4: [[28, 20], [72, 20], [28, 80], [72, 80]],
    5: [[28, 18], [72, 18], [50, 50], [28, 82], [72, 82]],
    6: [[28, 15], [72, 15], [28, 50], [72, 50], [28, 85], [72, 85]],
    7: [[28, 13], [72, 13], [50, 34], [28, 56], [72, 56], [28, 87], [72, 87]],
  };
  const PINTA_CORTES = { oros: 0, copas: 1, espadas: 2, bastos: 3 };
  const RANK_NAME = { 1: 'As', 10: 'Sota', 11: 'Caballo', 12: 'Rey' };

