// Standalone SVG export of a spell's circle: the "sigil" of a piece of code.

import { roleColor } from '../stage/themes.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

export function sigilToSVG(geo, theme, { size = 1024, title } = {}) {
  const parts = [];
  const layer = (items) => items.map((it) => {
    const color = roleColor(theme, it.role);
    if (it.fill) return `<path d="${it.d}" fill="${color}"/>`;
    const dash = it.dash ? ` stroke-dasharray="${it.dash.join(' ')}"` : '';
    return `<path d="${it.d}" fill="none" stroke="${color}" stroke-width="${it.w}" stroke-linecap="round" stroke-linejoin="round"${dash}/>`;
  }).join('');
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="-1080 -1080 2160 2160" width="${size}" height="${size}">`);
  parts.push(`<title>${esc(title || geo.name)}</title>`);
  parts.push('<defs>');
  parts.push(`<radialGradient id="bg" cx="50%" cy="45%" r="70%"><stop offset="0" stop-color="${theme.bg0}"/><stop offset="1" stop-color="${theme.bg1}"/></radialGradient>`);
  if (theme.glow) parts.push('<filter id="glow" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="9" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>');
  parts.push('</defs>');
  parts.push('<rect x="-1080" y="-1080" width="2160" height="2160" fill="url(#bg)"/>');
  parts.push(`<g${theme.glow ? ' filter="url(#glow)"' : ''}>`);
  parts.push(`<g>${layer(geo.layers.band)}</g>`);
  parts.push(`<g>${layer(geo.layers.star)}</g>`);
  parts.push(`<g>${layer(geo.layers.core)}</g>`);
  parts.push('</g>');
  parts.push('</svg>');
  return parts.join('');
}
