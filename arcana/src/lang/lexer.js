// Lexer for the Arcana incantation language.
// Produces tokens with exact source spans so every later stage (parser,
// circle layout, editor highlighting) can point back at the original text.

export class SpellError extends Error {
  /**
   * @param {string} message human readable (Chinese) message
   * @param {number} start source offset where the problem begins
   * @param {number} end source offset (exclusive)
   * @param {'syntax'|'name'|'arity'|'runtime'|'limit'} kind
   */
  constructor(message, start = 0, end = start + 1, kind = 'syntax') {
    super(message);
    this.start = start;
    this.end = Math.max(end, start + 1);
    this.kind = kind;
  }
}

export const KEYWORDS = new Map(Object.entries({
  spell: 'spell', cast: 'cast', if: 'if', then: 'then', else: 'else',
  let: 'let', in: 'in', and: 'and', or: 'or', not: 'not',
  true: 'true', false: 'false',
  // Chinese aliases: the same language, written the way a library spirit would.
  咒: 'spell', 施: 'cast', 若: 'if', 则: 'then', 否则: 'else', 令: 'let', 于: 'in',
  且: 'and', 或: 'or', 非: 'not', 真: 'true', 假: 'false',
}));

// Full-width punctuation typed through a CJK input method is accepted as-is.
const FULLWIDTH = {
  '（': '(', '）': ')', '，': ',', '＝': '=', '＋': '+', '－': '-', '＊': '*',
  '／': '/', '％': '%', '＜': '<', '＞': '>', '！': '!', '＾': '^',
  '×': '*', '÷': '/', '≤': '<=', '≥': '>=', '≠': '!=', '−': '-',
};

const OPERATORS = ['==', '!=', '<=', '>=', '&&', '||', '+', '-', '*', '/', '%', '^', '<', '>', '!', '(', ')', ',', '='];

const IDENT_START = /[\p{L}_]/u;
const IDENT_PART = /[\p{L}\p{N}_']/u;

/**
 * @typedef {{type:'num'|'ident'|'kw'|'op'|'comment'|'error'|'eof', value:any, start:number, end:number}} Token
 * @param {string} src
 * @param {{lenient?: boolean, comments?: boolean}} [opts]
 *   lenient: never throw; unknown characters become `error` tokens (used by the highlighter).
 *   comments: emit comment tokens instead of skipping them.
 * @returns {Token[]}
 */
export function tokenize(src, opts = {}) {
  const { lenient = false, comments = false } = opts;
  const out = [];
  let i = 0;
  const n = src.length;
  while (i < n) {
    const ch = src[i];
    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r' || ch === '　') { i++; continue; }
    // comments: `#` or `//` to end of line
    if (ch === '#' || (ch === '/' && src[i + 1] === '/')) {
      const s = i;
      while (i < n && src[i] !== '\n') i++;
      if (comments) out.push({ type: 'comment', value: src.slice(s, i), start: s, end: i });
      continue;
    }
    if (ch >= '0' && ch <= '9') {
      const s = i;
      while (i < n && src[i] >= '0' && src[i] <= '9') i++;
      if (src[i] === '.' && src[i + 1] >= '0' && src[i + 1] <= '9') {
        i++;
        while (i < n && src[i] >= '0' && src[i] <= '9') i++;
      }
      out.push({ type: 'num', value: Number(src.slice(s, i)), start: s, end: i });
      continue;
    }
    if (IDENT_START.test(ch)) {
      const s = i;
      // Chinese keywords are single characters (or 否则); split them off so that
      // `若n<2则n` style dense writing still works.
      const kw2 = src.slice(i, i + 2);
      if (kw2 === '否则') { out.push({ type: 'kw', value: 'else', start: i, end: i + 2 }); i += 2; continue; }
      if (isCjkKeyword(ch)) { out.push({ type: 'kw', value: KEYWORDS.get(ch), start: i, end: i + 1 }); i++; continue; }
      i++;
      while (i < n && IDENT_PART.test(src[i]) && !isCjkKeyword(src[i]) && src.slice(i, i + 2) !== '否则') i++;
      const word = src.slice(s, i);
      if (KEYWORDS.has(word)) out.push({ type: 'kw', value: KEYWORDS.get(word), start: s, end: i });
      else out.push({ type: 'ident', value: word, start: s, end: i });
      continue;
    }
    const fw = FULLWIDTH[ch];
    if (fw) { out.push({ type: 'op', value: fw, start: i, end: i + 1 }); i++; continue; }
    let matched = null;
    for (const op of OPERATORS) {
      if (src.startsWith(op, i)) { matched = op; break; }
    }
    if (matched) {
      const value = matched === '&&' ? 'and' : matched === '||' ? 'or' : matched;
      out.push({ type: 'op', value, start: i, end: i + matched.length });
      i += matched.length;
      continue;
    }
    if (lenient) { out.push({ type: 'error', value: ch, start: i, end: i + 1 }); i++; continue; }
    throw new SpellError(`无法识别的字符 “${ch}”`, i, i + 1, 'syntax');
  }
  out.push({ type: 'eof', value: null, start: n, end: n });
  return out;
}

// Single-character CJK keywords. These are reserved: an identifier never
// contains them, which is what lets Chinese code be written without spaces.
const CJK_KW = new Set(['咒', '施', '若', '则', '令', '于', '且', '或', '非', '真', '假']);
function isCjkKeyword(ch) { return CJK_KW.has(ch); }

/** Convert a source offset to 1-based line/column. */
export function lineCol(src, offset) {
  let line = 1, col = 1;
  for (let i = 0; i < offset && i < src.length; i++) {
    if (src[i] === '\n') { line++; col = 1; } else col++;
  }
  return { line, col };
}
