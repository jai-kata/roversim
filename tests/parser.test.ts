import { describe, expect, it } from 'vitest';
import type { Expr, FuncDef, Stmt } from '../src/lang/ast';
import type { Diagnostic } from '../src/lang/diagnostics';
import { parse } from '../src/lang/parser';
import { tokenize } from '../src/lang/tokenizer';

function program(src: string) {
  const warnings: Diagnostic[] = [];
  return parse(tokenize(src), warnings);
}

function setupBody(body: string): Stmt[] {
  const p = program(`void setup() {\n${body}\n}`);
  return (p.items[0] as FuncDef).body!.body;
}

function expr(src: string): Expr {
  const s = setupBody(`${src};`)[0];
  if (s.kind !== 'expr') throw new Error('not an expression statement');
  return s.expr;
}

// Compact S-expression view of an expression tree.
function show(e: Expr): string {
  switch (e.kind) {
    case 'num': return String(e.value);
    case 'bool': return String(e.value);
    case 'str': return JSON.stringify(e.value);
    case 'ident': return e.name;
    case 'unary': return `(${e.op} ${show(e.arg)})`;
    case 'binary':
    case 'logical': return `(${e.op} ${show(e.left)} ${show(e.right)})`;
    case 'assign': return `(${e.op} ${e.target.name} ${show(e.value)})`;
    case 'update': return e.prefix ? `(${e.op}pre ${e.target.name})` : `(${e.op}post ${e.target.name})`;
    case 'call': return `(call ${e.callee}${e.args.map((a) => ' ' + show(a)).join('')})`;
    case 'method': return `(${e.object}.${e.method}${e.args.map((a) => ' ' + show(a)).join('')})`;
  }
}

describe('parser: program structure', () => {
  it('parses functions, globals, and prototypes', () => {
    const p = program('int steps = 3;\nvoid dance();\nint twice(int n, bool b) { return n * 2; }\nvoid setup() {}\nvoid loop() {}');
    expect(p.items.map((i) => (i.kind === 'func' ? `func:${i.name}:${i.body ? 'def' : 'proto'}` : 'decl'))).toEqual([
      'decl', 'func:dance:proto', 'func:twice:def', 'func:setup:def', 'func:loop:def',
    ]);
    const twice = p.items[2] as FuncDef;
    expect(twice.returnType).toBe('int');
    expect(twice.params.map((x) => `${x.type} ${x.name}`)).toEqual(['int n', 'bool b']);
  });

  it('accepts void in an empty parameter list', () => {
    const f = program('void setup(void) {}').items[0] as FuncDef;
    expect(f.params).toEqual([]);
  });

  it('treats boolean as bool', () => {
    const s = setupBody('boolean done = false;')[0];
    expect(s).toMatchObject({ kind: 'decl', varType: 'bool' });
  });

  it('ignores stray semicolons at top level', () => {
    expect(program('void setup() {};\n;').items).toHaveLength(1);
  });

  it('records the line of each statement', () => {
    const body = setupBody('forward(1);\n\nturnLeft();');
    expect(body.map((s) => s.line)).toEqual([2, 4]);
  });
});

describe('parser: statements', () => {
  it('parses declarations with several names', () => {
    const s = setupBody('int a = 1, b, c = a + 2;')[0];
    expect(s.kind).toBe('decl');
    if (s.kind === 'decl') expect(s.decls.map((d) => `${d.name}=${d.init ? show(d.init) : '-'}`)).toEqual(['a=1', 'b=-', 'c=(+ a 2)']);
  });

  it('parses const', () => {
    expect(setupBody('const int n = 4;')[0]).toMatchObject({ kind: 'decl', isConst: true });
  });

  it('parses if / else if / else', () => {
    const s = setupBody('if (a) { x(); } else if (b) y(); else { z(); }')[0];
    expect(s.kind).toBe('if');
    if (s.kind !== 'if') return;
    expect(s.else?.kind).toBe('if');
    if (s.else?.kind === 'if') expect(s.else.else?.kind).toBe('block');
  });

  it('parses while', () => {
    expect(setupBody('while (distanceAhead() > 0) forward(1);')[0]).toMatchObject({ kind: 'while' });
  });

  it('parses for with a declaration', () => {
    const s = setupBody('for (int i = 0; i < 4; i++) { forward(1); }')[0];
    expect(s.kind).toBe('for');
    if (s.kind !== 'for') return;
    expect(s.init?.kind).toBe('decl');
    expect(show(s.test!)).toBe('(< i 4)');
    expect(show(s.update!)).toBe('(++post i)');
  });

  it('parses for with every part empty', () => {
    expect(setupBody('for (;;) forward(1);')[0]).toMatchObject({ kind: 'for', init: null, test: null, update: null });
  });

  it('parses for with an expression init', () => {
    const s = setupBody('for (i = 0; i < 2; i += 1) {}')[0];
    if (s.kind === 'for') expect(s.init?.kind).toBe('expr');
  });

  it('parses return with and without a value', () => {
    const p = program('int f() { return 1 + 2; }\nvoid g() { return; }');
    const f = (p.items[0] as FuncDef).body!.body[0];
    const g = (p.items[1] as FuncDef).body!.body[0];
    expect(f.kind === 'return' && f.value && show(f.value)).toBe('(+ 1 2)');
    expect(g).toMatchObject({ kind: 'return', value: null });
  });

  it('parses empty statements', () => {
    expect(setupBody(';')[0].kind).toBe('empty');
  });
});

describe('parser: expressions', () => {
  it.each([
    ['1 + 2 * 3', '(+ 1 (* 2 3))'],
    ['(1 + 2) * 3', '(* (+ 1 2) 3)'],
    ['10 - 4 - 3', '(- (- 10 4) 3)'],
    ['a / b % c', '(% (/ a b) c)'],
    ['a < b == c > d', '(== (< a b) (> c d))'],
    ['a || b && c', '(|| a (&& b c))'],
    ['!a && -b', '(&& (! a) (- b))'],
    ['a = b = 3', '(= a (= b 3))'],
    ['x += 2 * y', '(+= x (* 2 y))'],
    ['x -= 1', '(-= x 1)'],
    ['++x', '(++pre x)'],
    ['x--', '(--post x)'],
    ['-x++', '(- (++post x))'],
    ['forward(n + 1)', '(call forward (+ n 1))'],
    ['f(1, g(2), 3)', '(call f 1 (call g 2) 3)'],
    ['Serial.println("hi")', '(Serial.println "hi")'],
    ['Serial.println()', '(Serial.println)'],
    ['true != false', '(!= true false)'],
  ])('%s', (src, tree) => {
    expect(show(expr(src))).toBe(tree);
  });
});
