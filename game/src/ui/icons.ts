// Hand-drawn-feeling line icons for every item. Soft strokes, pastel fills.

const S = (body: string) =>
  `<svg viewBox="0 0 64 64" fill="none" stroke="#4a4560" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg">${body}</svg>`;

export const ICONS: Record<string, string> = {
  nightlight: S(`
    <circle cx="32" cy="27" r="19" fill="#ffe9c7" stroke="none" opacity=".55"/>
    <path d="M22 30c0-7 4.5-12 10-12s10 5 10 12v6H22z" fill="#fff4dc"/>
    <path d="M27 24c1.5-2 3-3 5-3" stroke="#e8b878"/>
    <rect x="24" y="36" width="16" height="6" rx="2" fill="#bfe3dc"/>
    <path d="M28 42v6M36 42v6M26 48h12"/>
    <path d="M32 9v3M15 16l2 2M49 16l-2 2M11 30h3M50 30h3" stroke="#e8b878"/>`),
  plane: S(`
    <path d="M8 34 56 12 40 52 31 38z" fill="#fffdf6"/>
    <path d="M56 12 31 38l-2 12 8-8" fill="#eef3f6"/>
    <path d="M8 34l23 4" />
    <path d="M10 48c4-2 8-2 12 0" stroke="#9ccfe0" stroke-dasharray="2 5"/>`),
  musicbox: S(`
    <rect x="12" y="30" width="40" height="20" rx="3" fill="#f6c9d4"/>
    <path d="M12 30l6-8h28l6 8" fill="#fde3ea"/>
    <path d="M20 40h24" stroke="#fff" />
    <circle cx="32" cy="40" r="3" fill="#fff8e6"/>
    <path d="M52 38h5v6" />
    <path d="M38 8v12" /><ellipse cx="35" cy="20" rx="4" ry="3" fill="#4a4560"/><path d="M38 8c4 1 6 4 5 7"/>`),
  pillow: S(`
    <path d="M10 22c6-6 38-6 44 0 3 8 3 16 0 22-6 6-38 6-44 0-3-6-3-14 0-22z" fill="#eef1fb"/>
    <path d="M18 26c8 4 20 4 28 0" stroke="#c9cfe8"/>
    <path d="M10 22l-3-3M54 22l3-3M10 44l-3 3M54 44l3 3"/>`),
  milk: S(`
    <path d="M24 10h16v6l4 6v28a4 4 0 0 1-4 4H24a4 4 0 0 1-4-4V22l4-6z" fill="#fffdf6"/>
    <path d="M24 16h16" />
    <path d="M20 32h24v10H20z" fill="#f9d3dc" stroke="none"/>
    <path d="M30 4c0 2 2 3 2 5M36 3c0 2 2 3 2 5" stroke="#c9cfe8"/>`),
  candy: S(`
    <circle cx="32" cy="32" r="11" fill="#ffd2dc"/>
    <path d="M25 26c4 4 10 8 14 12M27 40c2-6 6-10 12-12" stroke="#fff" />
    <path d="M21 32 8 24v16zM43 32l13-8v16z" fill="#c8ece3"/>`),
  photo: S(`
    <rect x="13" y="10" width="38" height="44" rx="2" fill="#fffdf6" transform="rotate(-6 32 32)"/>
    <rect x="18" y="15" width="28" height="26" fill="#cfe9f0" transform="rotate(-6 32 32)" stroke="none"/>
    <path d="M20 37l8-8 6 6 4-4 7 7" transform="rotate(-6 32 32)" stroke="#7fb3c4"/>
    <circle cx="38" cy="22" r="3" fill="#ffe3a6" stroke="none" transform="rotate(-6 32 32)"/>`),
  fan: S(`
    <circle cx="32" cy="26" r="16" fill="#e5f4f0"/>
    <path d="M32 26c-2-8 2-12 6-11 2 4-2 9-6 11zM32 26c8-1 11 3 10 7-4 1-8-3-10-7zM32 26c-5 6-10 5-11 1 2-4 7-3 11-1z" fill="#bfe3dc"/>
    <circle cx="32" cy="26" r="2.5" fill="#4a4560"/>
    <path d="M32 42v8M24 52h16"/>`),
  sticker: S(`
    <path d="M32 8l6.5 14.5L54 24l-11.5 10.5L46 50l-14-8-14 8 3.5-15.5L10 24l15.5-1.5z" fill="#ffe7a3"/>
    <path d="M26 30c1 2 3 2 4 0M34 30c1 2 3 2 4 0" />
    <path d="M28 37c2 2 6 2 8 0" stroke="#e59aaa"/>`),
  snack: S(`
    <path d="M16 26h28v14a10 10 0 0 1-10 10h-8a10 10 0 0 1-10-10z" fill="#f2dccb"/>
    <path d="M44 30h4a5 5 0 0 1 0 10h-5"/>
    <path d="M24 12c0 3 3 4 3 8M32 10c0 3 3 4 3 8" stroke="#c9b3a2"/>`),
};
