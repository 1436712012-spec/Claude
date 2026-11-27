// Presenting astronomically large coordinates to humans.

export function fmtInt(n) {
  return n.toLocaleString('en-US');
}

/** { text, sup } where sup is a power of ten exponent, or exact value. */
export function coordParts(c) {
  const m = c.magnitude();
  const sign = c.neg ? '−' : '';
  if (m.exact !== null) return { exact: true, text: sign + fmtInt(m.exact), digits: m.digits };
  const e = Math.floor(m.log10);
  const mant = Math.pow(10, m.log10 - e);
  return { exact: false, text: `${sign}${mant.toFixed(2)}`, exp: fmtInt(e), digits: m.digits };
}

export function coordHTML(c) {
  const p = coordParts(c);
  if (p.exact) return `<span class="num">${p.text}</span>`;
  return `<span class="num">≈ ${p.text}<span class="x">×</span>10<sup>${p.exp}</sup></span>`;
}

/** The coordinate written in the library's own alphabet, most significant first. */
export function coordGlyphs(lib, c, max = 14) {
  const L = c.sigLength();
  if (L === 0) return lib.id === 'latin' ? 'a' : lib.glyphs[0];
  let s = '';
  const n = Math.min(max, L);
  for (let i = L - 1; i >= L - n; i--) s += lib.glyphs[c.mag[i]];
  if (lib.id === 'latin') s = s.replace(/ /g, '·');
  else s = s.replace(/　/g, '〇');
  return (c.neg ? '−' : '') + s + (L > n ? '…' : '');
}

/** The complete glyph name (can be hundreds of thousands of characters). */
export function coordFullGlyphs(lib, c) {
  const L = c.sigLength();
  const codes = new Uint16Array(Math.max(1, L));
  for (let i = 0; i < L; i++) codes[i] = lib.codes[c.mag[L - 1 - i]];
  let s = '';
  for (let i = 0; i < codes.length; i += 8192) s += String.fromCharCode.apply(null, codes.subarray(i, i + 8192));
  if (lib.id === 'latin') s = s.replace(/ /g, '·');
  return (c.neg ? '−' : '') + (L ? s : lib.glyphs[0]);
}

export function pow10HTML(x) {
  const e = Math.floor(x);
  const m = Math.pow(10, x - e);
  return `${m.toFixed(2)}<span class="x">×</span>10<sup>${fmtInt(e)}</sup>`;
}
