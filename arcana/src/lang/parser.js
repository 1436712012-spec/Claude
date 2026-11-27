// Pratt parser + static resolver for the Arcana language.
//
//   spell fib(n) = if n < 2 then n else fib(n - 1) + fib(n - 2)
//   cast fib(7)
//
// Every AST node carries a global `id`, its source span, and after resolution
// variables know exactly which parameter seal or `let` binding feeds them.
// That static knowledge is what lets the magic circle draw data-flow channels.

import { tokenize, SpellError } from './lexer.js';

export const BUILTINS = {
  abs: { arity: 1, fn: Math.abs },
  floor: { arity: 1, fn: Math.floor },
  ceil: { arity: 1, fn: Math.ceil },
  round: { arity: 1, fn: Math.round },
  sqrt: { arity: 1, fn: (x) => { if (x < 0) throw new Error('sqrt 的参数不能为负'); return Math.sqrt(x); } },
  min: { arity: 2, fn: Math.min },
  max: { arity: 2, fn: Math.max },
};

// binding power table (higher binds tighter)
const BINARY = {
  or: 10, and: 20,
  '==': 30, '!=': 30, '<': 30, '<=': 30, '>': 30, '>=': 30,
  '+': 40, '-': 40,
  '*': 50, '/': 50, '%': 50,
  '^': 70, // right associative, above unary (so -2^2 = -(2^2))
};
const UNARY_BP = 60;

/** Child nodes in evaluation order. */
export function childrenOf(node) {
  switch (node.type) {
    case 'Unary': return [node.arg];
    case 'Binary': return [node.left, node.right];
    case 'If': return [node.cond, node.then, node.else];
    case 'Let': return [node.value, node.body];
    case 'Call': return node.args;
    default: return [];
  }
}

/**
 * Parse and resolve a whole program.
 * @param {string} source
 */
export function parse(source) {
  const toks = tokenize(source);
  let p = 0;
  let nextId = 0;

  const peek = () => toks[p];
  const next = () => toks[p++];
  const isOp = (v) => toks[p].type === 'op' && toks[p].value === v;
  const isKw = (v) => toks[p].type === 'kw' && toks[p].value === v;
  const describe = (t) => t.type === 'eof' ? '结尾' : `“${source.slice(t.start, t.end)}”`;
  function expectOp(v, what) {
    const t = peek();
    if (t.type === 'op' && t.value === v) return next();
    throw new SpellError(`这里应当是 “${v}”${what ? `（${what}）` : ''}，却遇到了 ${describe(t)}`, t.start, t.end);
  }
  function expectKw(v, what) {
    const t = peek();
    if (t.type === 'kw' && t.value === v) return next();
    throw new SpellError(`这里应当是关键字 ${v}${what ? `（${what}）` : ''}，却遇到了 ${describe(t)}`, t.start, t.end);
  }
  function expectIdent(what) {
    const t = peek();
    if (t.type === 'ident') return next();
    throw new SpellError(`这里需要一个名字${what ? `（${what}）` : ''}，却遇到了 ${describe(t)}`, t.start, t.end);
  }
  const mk = (type, props, start, end) => ({ type, id: nextId++, start, end, ...props });

  function parseExpr(minBp = 0) {
    let left = parsePrefix();
    for (;;) {
      const t = peek();
      let op = null;
      if (t.type === 'op' && BINARY[t.value] !== undefined) op = t.value;
      else if (t.type === 'kw' && (t.value === 'and' || t.value === 'or')) op = t.value;
      if (!op) break;
      const bp = BINARY[op];
      if (bp < minBp) break;
      // comparisons are non-associative: `a < b < c` is rejected for clarity
      if (bp === 30 && left.type === 'Binary' && BINARY[left.op] === 30 && !left.paren) {
        throw new SpellError('比较不能连写，请用 and 连接两次比较', t.start, t.end);
      }
      next();
      const rightBp = op === '^' ? bp : bp + 1;
      const right = parseExpr(rightBp);
      left = mk('Binary', { op, left, right }, left.start, right.end);
    }
    return left;
  }

  function parsePrefix() {
    const t = peek();
    if (t.type === 'num') { next(); return mk('Num', { value: t.value }, t.start, t.end); }
    if (t.type === 'kw' && (t.value === 'true' || t.value === 'false')) {
      next(); return mk('Bool', { value: t.value === 'true' }, t.start, t.end);
    }
    if (t.type === 'op' && t.value === '-') {
      next(); const arg = parseExpr(UNARY_BP);
      return mk('Unary', { op: '-', arg }, t.start, arg.end);
    }
    if ((t.type === 'op' && t.value === '!') || (t.type === 'kw' && t.value === 'not')) {
      next(); const arg = parseExpr(UNARY_BP);
      return mk('Unary', { op: 'not', arg }, t.start, arg.end);
    }
    if (t.type === 'op' && t.value === '(') {
      next();
      const e = parseExpr(0);
      const close = expectOp(')', '括号需要闭合');
      e.paren = true;
      // keep the node's own span, but remember the parenthesised extent
      e.outerStart = t.start; e.outerEnd = close.end;
      return e;
    }
    if (t.type === 'kw' && t.value === 'if') {
      next();
      const cond = parseExpr(0);
      expectKw('then', 'if 之后需要 then');
      const thenB = parseExpr(0);
      expectKw('else', '每个 if 都需要 else 分支');
      const elseB = parseExpr(0);
      return mk('If', { cond, then: thenB, else: elseB }, t.start, elseB.end);
    }
    if (t.type === 'kw' && t.value === 'let') {
      next();
      const name = expectIdent('let 绑定的名字');
      expectOp('=', 'let 名字之后');
      const value = parseExpr(0);
      expectKw('in', 'let 绑定之后需要 in');
      const body = parseExpr(0);
      return mk('Let', { name: name.value, nameStart: name.start, nameEnd: name.end, value, body }, t.start, body.end);
    }
    if (t.type === 'ident') {
      next();
      if (isOp('(')) {
        next();
        const args = [];
        if (!isOp(')')) {
          for (;;) {
            args.push(parseExpr(0));
            if (isOp(',')) { next(); continue; }
            break;
          }
        }
        const close = expectOp(')', '参数列表需要闭合');
        return mk('Call', { name: t.value, args, nameStart: t.start, nameEnd: t.end }, t.start, close.end);
      }
      return mk('Var', { name: t.value }, t.start, t.end);
    }
    if (t.type === 'eof') throw new SpellError('咒文在这里意外结束了，还缺一个表达式', t.start, t.end);
    if (t.type === 'kw') throw new SpellError(`关键字 ${describe(t)} 不能出现在这里`, t.start, t.end);
    throw new SpellError(`这里需要一个表达式，却遇到了 ${describe(t)}`, t.start, t.end);
  }

  const spells = [];
  let cast = null;
  while (peek().type !== 'eof') {
    const t = peek();
    if (isKw('spell')) {
      next();
      const name = expectIdent('咒语的名字');
      expectOp('(', '咒语名之后是参数列表');
      const params = [];
      if (!isOp(')')) {
        for (;;) {
          const pt = expectIdent('参数名');
          params.push({ name: pt.value, start: pt.start, end: pt.end });
          if (isOp(',')) { next(); continue; }
          break;
        }
      }
      expectOp(')', '参数列表需要闭合');
      expectOp('=', '参数之后用 = 引出咒语本体');
      const body = parseExpr(0);
      spells.push({ kind: 'spell', name: name.value, nameStart: name.start, nameEnd: name.end, params, body, start: t.start, end: body.end });
      continue;
    }
    if (isKw('cast')) {
      next();
      const body = parseExpr(0);
      if (cast) throw new SpellError('一段咒文只能有一次 cast（施放）', t.start, body.end);
      cast = { kind: 'cast', name: 'cast', params: [], body, start: t.start, end: body.end };
      continue;
    }
    throw new SpellError(`顶层只能是 spell（定义咒语）或 cast（施放），却遇到了 ${describe(t)}`, t.start, t.end);
  }

  const program = { source, spells, cast, spellMap: new Map(), nodeCount: nextId };
  resolve(program);
  return program;
}

/** Static checks + binding resolution. Mutates the AST in place. */
function resolve(program) {
  const { spells, source } = program;
  for (const s of spells) {
    if (program.spellMap.has(s.name)) throw new SpellError(`咒语 “${s.name}” 被定义了两次`, s.nameStart, s.nameEnd, 'name');
    program.spellMap.set(s.name, s);
    const seen = new Set();
    for (const p of s.params) {
      if (seen.has(p.name)) throw new SpellError(`参数 “${p.name}” 重复了`, p.start, p.end, 'name');
      seen.add(p.name);
    }
  }
  if (!program.cast) {
    const end = source.length;
    throw new SpellError('咒文还没有 cast：用 cast 写下要施放的表达式，例如 cast fib(7)', Math.max(0, end - 1), end, 'syntax');
  }

  const sigils = [...spells, program.cast];
  sigils.forEach((sg, i) => { sg.index = i; });
  for (const sg of sigils) {
    const nodes = [];
    const walk = (node, scope, parentIdx, depth) => {
      node.idx = nodes.length;
      node.parentIdx = parentIdx;
      node.depth = depth;
      nodes.push(node);
      switch (node.type) {
        case 'Var': {
          const b = lookup(scope, node.name);
          if (!b) {
            const hint = program.spellMap.has(node.name) || BUILTINS[node.name] ? `；“${node.name}” 是咒语，调用时要写括号` : '';
            throw new SpellError(`未知的符文 “${node.name}”：它既不是参数，也不是 let 绑定${hint}`, node.start, node.end, 'name');
          }
          node.bind = b;
          break;
        }
        case 'Let': {
          walk(node.value, scope, node.idx, depth + 1);
          walk(node.body, { name: node.name, bind: { kind: 'let', id: node.id, idx: node.idx }, up: scope }, node.idx, depth + 1);
          return;
        }
        case 'Call': {
          const sp = program.spellMap.get(node.name);
          if (sp) {
            node.target = 'spell';
            if (sp.params.length !== node.args.length) {
              throw new SpellError(`咒语 “${node.name}” 需要 ${sp.params.length} 个参数，这里给了 ${node.args.length} 个`, node.start, node.end, 'arity');
            }
          } else if (BUILTINS[node.name]) {
            node.target = 'builtin';
            if (BUILTINS[node.name].arity !== node.args.length) {
              throw new SpellError(`内建符文 “${node.name}” 需要 ${BUILTINS[node.name].arity} 个参数，这里给了 ${node.args.length} 个`, node.start, node.end, 'arity');
            }
          } else {
            throw new SpellError(`未知的咒语 “${node.name}”：先用 spell 定义它`, node.nameStart, node.nameEnd, 'name');
          }
          break;
        }
        default: break;
      }
      for (const c of childrenOf(node)) walk(c, scope, node.idx, depth + 1);
    };
    let scope = null;
    sg.params.forEach((p, i) => { scope = { name: p.name, bind: { kind: 'param', index: i }, up: scope }; });
    walk(sg.body, scope, -1, 0);
    sg.nodes = nodes;
    sg.text = source.slice(sg.start, sg.end).replace(/\s+/g, ' ').trim();
  }
  program.sigils = sigils;
}

function lookup(scope, name) {
  for (let s = scope; s; s = s.up) if (s.name === name) return s.bind;
  return null;
}

/** Short label for a node, shown next to its glyph. */
export function nodeLabel(node) {
  switch (node.type) {
    case 'Num': return formatNumber(node.value);
    case 'Bool': return node.value ? 'true' : 'false';
    case 'Var': return node.name;
    case 'Unary': return node.op === '-' ? '−' : 'not';
    case 'Binary': return ({ '*': '×', '/': '÷', '-': '−', '<=': '≤', '>=': '≥', '!=': '≠' })[node.op] || node.op;
    case 'If': return 'if';
    case 'Let': return `let ${node.name}`;
    case 'Call': return node.name;
    default: return '?';
  }
}

export function formatNumber(v) {
  if (!Number.isFinite(v)) return String(v);
  if (Number.isInteger(v)) return Math.abs(v) >= 1e15 ? v.toExponential(3) : String(v);
  const s = v.toPrecision(6);
  return s.includes('e') ? s : s.replace(/\.?0+$/, '');
}

export function formatValue(v) {
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'number') return formatNumber(v);
  return String(v);
}
