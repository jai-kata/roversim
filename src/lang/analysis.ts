import type { Expr, Program, Stmt } from './ast';

// Facts about the source code (not about running it), for level rules.

const MOVE_COMMANDS = new Set(['forward', 'backward', 'turnLeft', 'turnRight']);

export type Requirement = 'variable' | 'for' | 'while' | 'if' | 'function' | 'returns';

export interface Usage {
  commands: number; // robot-command call sites, not executions
  for: boolean;
  while: boolean;
  if: boolean;
  variable: boolean; // a variable (not a for counter) is created and read
  function: boolean; // a function besides setup/loop is called
  returns: boolean; // a function that gives back a value is called
}

export function analyze(program: Program): Usage {
  const u: Usage = { commands: 0, for: false, while: false, if: false, variable: false, function: false, returns: false };
  const declared = new Set<string>();
  const read = new Set<string>();
  const called = new Set<string>();

  const expr = (e: Expr | null): void => {
    if (!e) return;
    switch (e.kind) {
      case 'ident':
        read.add(e.name);
        return;
      case 'call':
        if (MOVE_COMMANDS.has(e.callee)) u.commands++;
        called.add(e.callee);
        e.args.forEach(expr);
        return;
      case 'method':
        e.args.forEach(expr);
        return;
      case 'unary':
        expr(e.arg);
        return;
      case 'binary':
      case 'logical':
        expr(e.left);
        expr(e.right);
        return;
      case 'assign':
        expr(e.value);
        return;
      default:
        return;
    }
  };

  const stmt = (s: Stmt | null): void => {
    if (!s) return;
    switch (s.kind) {
      case 'block':
        s.body.forEach(stmt);
        return;
      case 'decl':
        for (const d of s.decls) {
          declared.add(d.name);
          expr(d.init);
        }
        return;
      case 'expr':
        expr(s.expr);
        return;
      case 'if':
        u.if = true;
        expr(s.test);
        stmt(s.then);
        stmt(s.else);
        return;
      case 'while':
        u.while = true;
        expr(s.test);
        stmt(s.body);
        return;
      case 'for':
        u.for = true;
        // The counter in for (int i = 0; ...) doesn't count as "using a variable".
        if (s.init?.kind === 'decl') s.init.decls.forEach((d) => expr(d.init));
        else stmt(s.init);
        expr(s.test);
        expr(s.update);
        stmt(s.body);
        return;
      case 'return':
        expr(s.value);
        return;
      case 'empty':
        return;
    }
  };

  const own = new Set<string>();
  const giveBack = new Set<string>();
  for (const item of program.items) {
    if (item.kind === 'decl') stmt(item);
    else {
      if (item.body && item.name !== 'setup' && item.name !== 'loop') own.add(item.name);
      if (item.body && item.returnType !== 'void') giveBack.add(item.name);
      for (const p of item.params) declared.add(p.name);
      stmt(item.body);
    }
  }
  u.variable = [...declared].some((n) => read.has(n));
  u.function = [...own].some((n) => called.has(n));
  u.returns = [...giveBack].some((n) => called.has(n));
  return u;
}

export function countCommands(program: Program): number {
  return analyze(program).commands;
}

export function missingRequirements(program: Program, requires: Requirement[]): Requirement[] {
  const u = analyze(program);
  return requires.filter((r) => !u[r]);
}

// True when loop() has nothing in it, so "loop() ran 500 times" would
// only confuse someone who hasn't learned about loop() yet.
export function loopIsEmpty(program: Program): boolean {
  const loop = program.items.find((i) => i.kind === 'func' && i.name === 'loop' && i.body);
  return !loop || loop.kind !== 'func' || loop.body!.body.every((s) => s.kind === 'empty');
}
