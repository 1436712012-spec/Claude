import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tokenize, SpellError } from '../src/lang/lexer.js';
import { parse } from '../src/lang/parser.js';
import { perform } from '../src/lang/interpreter.js';
import { EXAMPLES } from '../src/lang/examples.js';

const run = (src, limits) => perform(parse(src), limits);
const value = (src) => run(src).result;

test('lexer: operators, full-width punctuation and CJK keywords', () => {
  const t = tokenize('a <= b && c（1，2）');
  assert.deepEqual(t.map((x) => x.value), ['a', '<=', 'b', 'and', 'c', '(', 1, ',', 2, ')', null]);
  const z = tokenize('若n<2则n否则m');
  assert.deepEqual(z.map((x) => x.value), ['if', 'n', '<', 2, 'then', 'n', 'else', 'm', null]);
});

test('lexer: unknown characters throw with a span, lenient mode keeps going', () => {
  assert.throws(() => tokenize('1 @ 2'), (e) => e instanceof SpellError && e.start === 2);
  const t = tokenize('1 @ 2', { lenient: true });
  assert.equal(t[1].type, 'error');
});

test('arithmetic precedence and associativity', () => {
  assert.equal(value('cast 1 + 2 * 3'), 7);
  assert.equal(value('cast (1 + 2) * 3'), 9);
  assert.equal(value('cast 2 ^ 3 ^ 2'), 512);
  assert.equal(value('cast -2 ^ 2'), -4);
  assert.equal(value('cast 10 - 3 - 2'), 5);
  assert.equal(value('cast -7 % 3'), 2);
  assert.equal(value('cast 1 < 2 and not (3 < 2)'), true);
});

test('comparison chains are rejected', () => {
  assert.throws(() => parse('cast 1 < 2 < 3'), /比较不能连写/);
});

test('every example compiles and yields its known answer', () => {
  const expected = {
    fib: 13, hanoi: 31, factorial: 479001600, collatz: 111, pascal: 20,
    mutual: false, ackermann: 7, power: 1594323, gcd: 21, prime: true, hanzi: 8,
  };
  for (const ex of EXAMPLES) {
    const r = run(ex.code);
    if (ex.id === 'crack') {
      assert.ok(r.error, 'crack should fail');
      assert.match(r.error.message, /除以零/);
      continue;
    }
    if (ex.id === 'newton') {
      assert.ok(Math.abs(r.result - Math.SQRT2) < 1e-12);
      continue;
    }
    assert.equal(r.error, null, `${ex.id}: ${r.error?.message}`);
    assert.equal(r.result, expected[ex.id], ex.id);
  }
});

test('trace is well formed: balanced enter/exit and call/return', () => {
  const r = run(EXAMPLES.find((e) => e.id === 'fib').code);
  const stack = [];
  const calls = [];
  for (const e of r.events) {
    if (e.type === 'enter') stack.push(`${e.frame}:${e.node}`);
    if (e.type === 'exit') assert.equal(stack.pop(), `${e.frame}:${e.node}`);
    if (e.type === 'call') calls.push(e.child);
    if (e.type === 'return') assert.equal(calls.pop(), e.frame);
  }
  assert.equal(stack.length, 0);
  assert.equal(calls.length, 0);
  // fib(7) makes 41 invocations; frames include the cast frame
  assert.equal(r.frames.length, 42);
  assert.equal(r.frames[0].weight, 42);
});

test('each node is evaluated at most once per frame', () => {
  for (const ex of EXAMPLES) {
    const r = run(ex.code);
    const seen = new Set();
    for (const e of r.events) {
      if (e.type !== 'enter') continue;
      const k = `${e.frame}:${e.node}`;
      assert.ok(!seen.has(k), `${ex.id} re-entered ${k}`);
      seen.add(k);
    }
  }
});

test('short circuit leaves the right side unevaluated', () => {
  const p = parse('cast false and (1 / 0 == 1)');
  const r = perform(p);
  assert.equal(r.error, null);
  assert.equal(r.result, false);
  const entered = new Set(r.events.filter((e) => e.type === 'enter').map((e) => e.node));
  assert.equal(entered.size, 2); // the `and` node and the literal false
});

test('static resolution: unknown names, arity, binding kinds', () => {
  assert.throws(() => parse('spell f(x) = y\ncast f(1)'), (e) => e.kind === 'name' && /未知的符文/.test(e.message));
  assert.throws(() => parse('spell f(x) = x\ncast f(1, 2)'), (e) => e.kind === 'arity');
  assert.throws(() => parse('cast g(1)'), /未知的咒语/);
  assert.throws(() => parse('spell f(x) = x'), /还没有 cast/);
  const p = parse('spell f(a, b) = let c = a + b in c * b\ncast f(1, 2)');
  const vars = p.sigils[0].nodes.filter((n) => n.type === 'Var');
  assert.deepEqual(vars.map((v) => [v.name, v.bind.kind]), [['a', 'param'], ['b', 'param'], ['c', 'let'], ['b', 'param']]);
});

test('runtime errors carry frame and node, and mark frames broken', () => {
  const r = run('spell f(n) = if n == 0 then 1 / n else f(n - 1)\ncast f(3)');
  assert.ok(r.error);
  const last = r.events[r.events.length - 1];
  assert.equal(last.type, 'error');
  assert.equal(r.frames[last.frame].spell, 'f');
  assert.ok(r.frames.every((f) => f.status === 'broken'));
});

test('runaway recursion is caught by the depth limit', () => {
  const r = run('spell forever(n) = forever(n + 1)\ncast forever(0)');
  assert.ok(r.error);
  assert.match(r.error.message, /递归超过/);
});

test('oversized rituals are truncated but still report the true result', () => {
  const r = run('spell fib(n) = if n < 2 then n else fib(n - 1) + fib(n - 2)\ncast fib(20)');
  assert.equal(r.truncated, true);
  assert.equal(r.result, 6765);
  assert.ok(r.frames.length <= 1500);
});
