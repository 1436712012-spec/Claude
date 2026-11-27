// Links that lead to the one book holding a sentence. The hash carries the
// text itself (hex-encoded UTF-8, so it is a plain #name), never the address:
// the address is recomputed on arrival, and the bijection makes it stable.

const MAX = 240;

export function encodeShare(libId, text) {
  const bytes = new TextEncoder().encode(text.slice(0, MAX));
  let hex = '';
  for (const b of bytes) hex += b.toString(16).padStart(2, '0');
  return (libId === 'han' ? 'h-' : 'l-') + hex;
}

export function decodeShare(hash) {
  const m = /^#?([lh])-([0-9a-f]{2,})$/i.exec(hash || '');
  if (!m || m[2].length % 2) return null;
  const bytes = new Uint8Array(m[2].length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(m[2].substr(i * 2, 2), 16);
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return text ? { lib: m[1].toLowerCase() === 'h' ? 'han' : 'latin', text } : null;
  } catch {
    return null;
  }
}

export function setShareHash(name) {
  try {
    history.replaceState(null, '', '#' + name);
  } catch {
    location.hash = name;
  }
}
