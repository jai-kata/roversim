import type { DeclStmt, Expr, FuncDef, Program, ReturnType, Stmt, VarType } from './ast';
import { BUILTINS, BUILTIN_EXAMPLES, RESERVED_FUNCTION_NAMES, SERIAL_METHODS } from './builtins';
import {
  capitalMessage, caseMismatch, errorAt, makeDiagnostic, suggest, type Diagnostic, type Span,
} from './diagnostics';

// Static checks that run after parsing and before anything executes.
// Stops at the first error (beginners fix one thing at a time); collects
// warnings along the way.

interface VarInfo {
  type: VarType;
  isConst: boolean;
  line: number;
}

type ExprType = VarType | 'void' | 'string';

class Scope {
  vars = new Map<string, VarInfo>();
  constructor(readonly parent: Scope | null) {}
  lookup(name: string): VarInfo | null {
    return this.vars.get(name) ?? this.parent?.lookup(name) ?? null;
  }
  allNames(): string[] {
    return [...this.vars.keys(), ...(this.parent?.allNames() ?? [])];
  }
}

export function check(program: Program, warnings: Diagnostic[]): void {
  new Checker(program, warnings).run();
}

class Checker {
  private funcs = new Map<string, FuncDef>();
  private current: FuncDef | null = null;
  private usesSerialOutput: Span | null = null;
  private usesSerialBegin = false;

  constructor(private program: Program, private warnings: Diagnostic[]) {}

  run(): void {
    this.collectFunctions();
    this.checkEntryPoints();

    const globals = new Scope(null);
    for (const item of this.program.items) {
      if (item.kind === 'decl') {
        this.checkDecl(item, globals, true);
      } else if (item.body) {
        // A function sees only the globals declared above it, like real C++.
        const snapshot = new Scope(null);
        globals.vars.forEach((v, k) => snapshot.vars.set(k, v));
        this.checkFunction(item, snapshot);
      }
    }

    if (this.usesSerialOutput && !this.usesSerialBegin) {
      this.warn(
        `Line ${this.usesSerialOutput.line}: On the real rover, Serial.print only shows up if setup() has Serial.begin(9600);`,
        this.usesSerialOutput,
      );
    }
  }

  private warn(message: string, span: Span): void {
    this.warnings.push(makeDiagnostic('warning', message, span));
  }

  // ---- functions ----

  private collectFunctions(): void {
    const defined = new Map<string, FuncDef>();
    for (const item of this.program.items) {
      if (item.kind !== 'func') continue;
      const name = item.name;
      const l = item.nameSpan.line;
      if (Object.prototype.hasOwnProperty.call(BUILTINS, name)) {
        throw errorAt(`Line ${l}: '${name}' is already a built-in command. Pick a different name for your function.`, item.nameSpan);
      }
      if (RESERVED_FUNCTION_NAMES.has(name)) {
        throw errorAt(`Line ${l}: '${name}' is used by the Arduino itself. Pick a different name for your function.`, item.nameSpan);
      }
      const existing = this.funcs.get(name);
      if (existing && !sameSignature(existing, item)) {
        throw errorAt(
          `Line ${l}: There's already a function called '${name}' on line ${existing.nameSpan.line}. Give this one a different name.`,
          item.nameSpan,
        );
      }
      if (item.body) {
        const prevDef = defined.get(name);
        if (prevDef) {
          throw errorAt(
            `Line ${l}: There's already a function called '${name}' on line ${prevDef.nameSpan.line}. Give this one a different name.`,
            item.nameSpan,
          );
        }
        defined.set(name, item);
        this.funcs.set(name, item);
      } else if (!existing) {
        this.funcs.set(name, item);
      }
    }
    for (const [name, f] of this.funcs) {
      if (!f.body) {
        throw errorAt(`Line ${f.nameSpan.line}: '${name}' is declared here but never written. Add its { } part.`, f.nameSpan);
      }
    }
  }

  private checkEntryPoints(): void {
    for (const [name, what] of [
      ['setup', 'Your code needs a void setup() { } part. It runs once at the start.'],
      ['loop', "Your code needs a void loop() { } part. It can be empty, but it has to be there."],
    ] as const) {
      const f = this.funcs.get(name);
      if (!f) {
        const wrongCase = caseMismatch(name, this.funcs.keys());
        if (wrongCase) {
          const def = this.funcs.get(wrongCase)!;
          throw errorAt(capitalMessage(def.nameSpan.line, wrongCase, name), def.nameSpan);
        }
        throw errorAt(what, null);
      }
      if (f.returnType !== 'void' || f.params.length > 0) {
        throw errorAt(`Line ${f.nameSpan.line}: ${name} must be written exactly as void ${name}().`, f.nameSpan);
      }
    }
  }

  private checkFunction(f: FuncDef, globals: Scope): void {
    this.current = f;
    const scope = new Scope(globals);
    for (const p of f.params) {
      this.declare(scope, p.name, p.nameSpan, { type: p.type, isConst: p.isConst, line: p.nameSpan.line });
    }
    // The body's outer block shares the parameters' scope, as in C++.
    for (const s of f.body!.body) this.checkStmt(s, scope);
    this.current = null;
  }

  // ---- variables ----

  private declare(scope: Scope, name: string, span: Span, info: VarInfo): void {
    const l = span.line;
    if (Object.prototype.hasOwnProperty.call(BUILTINS, name) || this.funcs.has(name) || name === 'Serial') {
      throw errorAt(`Line ${l}: '${name}' is already a command name. Pick a different name for this variable.`, span);
    }
    const existing = scope.vars.get(name);
    if (existing) {
      throw errorAt(
        `Line ${l}: You already created '${name}' on line ${existing.line}. To change it, leave off the type, like ${name} = 5;`,
        span,
      );
    }
    scope.vars.set(name, info);
  }

  private checkDecl(d: DeclStmt, scope: Scope, isGlobal: boolean): void {
    for (const decl of d.decls) {
      if (decl.init) {
        if (isGlobal) this.checkGlobalInit(decl.init);
        this.checkValue(decl.init, scope);
      }
      this.declare(scope, decl.name, decl.nameSpan, { type: d.varType, isConst: d.isConst, line: decl.nameSpan.line });
    }
  }

  private checkGlobalInit(e: Expr): void {
    const found = findCall(e);
    if (found) {
      throw errorAt(
        `Line ${found.line}: A variable outside any function can only start with a plain value, like int steps = 3;`,
        found,
      );
    }
  }

  private resolveVar(name: string, span: Span, scope: Scope): VarInfo {
    const v = scope.lookup(name);
    if (v) return v;
    const l = span.line;
    if (Object.prototype.hasOwnProperty.call(BUILTINS, name)) {
      throw errorAt(`Line ${l}: ${name} is a command, so it needs ( ) after it, like ${BUILTIN_EXAMPLES[name]}`, span);
    }
    const f = this.funcs.get(name);
    if (f) {
      const example = `${name}(${f.params.map(() => '1').join(', ')});`;
      throw errorAt(`Line ${l}: ${name} is a command, so it needs ( ) after it, like ${example}`, span);
    }
    if (name === 'Serial') {
      throw errorAt(`Line ${l}: Serial needs a command after it, like Serial.println(x);`, span);
    }
    const wrongCase = caseMismatch(name, [...scope.allNames(), ...Object.keys(BUILTINS), ...this.funcs.keys()]);
    if (wrongCase) throw errorAt(capitalMessage(l, name, wrongCase), span);
    throw errorAt(`Line ${l}: You used '${name}' before creating it. Try: int ${name} = 3;`, span);
  }

  // ---- statements ----

  private checkStmt(s: Stmt, scope: Scope): void {
    switch (s.kind) {
      case 'block': {
        const inner = new Scope(scope);
        for (const st of s.body) this.checkStmt(st, inner);
        return;
      }
      case 'empty':
        return;
      case 'decl':
        this.checkDecl(s, scope, false);
        return;
      case 'expr':
        this.checkExprStatement(s.expr, scope);
        return;
      case 'if':
        this.checkCondition(s.test, scope);
        this.checkStmt(s.then, new Scope(scope));
        if (s.else) this.checkStmt(s.else, new Scope(scope));
        return;
      case 'while':
        this.checkCondition(s.test, scope);
        this.checkStmt(s.body, new Scope(scope));
        return;
      case 'for': {
        const forScope = new Scope(scope);
        if (s.init) this.checkStmt(s.init, forScope);
        if (s.test) this.checkCondition(s.test, forScope);
        if (s.update) this.checkExpr(s.update, forScope, false);
        this.checkStmt(s.body, new Scope(forScope));
        return;
      }
      case 'return':
        this.checkReturn(s, scope);
        return;
    }
  }

  private checkReturn(s: Extract<Stmt, { kind: 'return' }>, scope: Scope): void {
    const f = this.current!;
    const l = s.line;
    if (f.returnType === 'void') {
      if (s.value) {
        throw errorAt(`Line ${l}: ${f.name} is a void function, so its return can't give back a value. Just write return;`, s);
      }
      return;
    }
    if (!s.value) {
      const example = f.returnType === 'bool' ? 'return true;' : 'return 0;';
      throw errorAt(`Line ${l}: ${f.name} has to give back a value, like ${example}`, s);
    }
    this.checkValue(s.value, scope);
  }

  private checkCondition(test: Expr, scope: Scope): void {
    if (test.kind === 'assign' && test.op === '=') {
      this.warn(`Line ${test.line}: Did you mean == ? A single = changes the variable.`, test);
    }
    this.checkValue(test, scope);
  }

  private checkExprStatement(e: Expr, scope: Scope): void {
    if (e.kind === 'binary' && (e.op === '==' || e.op === '!=')) {
      this.warn(`Line ${e.line}: This line compares two things but doesn't change anything. Did you mean = ?`, e);
    }
    this.checkExpr(e, scope, false);
  }

  // ---- expressions ----

  // An expression whose value is used (not a bare statement).
  private checkValue(e: Expr, scope: Scope): VarType {
    const t = this.checkExpr(e, scope, true);
    return t as VarType;
  }

  private checkExpr(e: Expr, scope: Scope, valueNeeded: boolean): ExprType {
    switch (e.kind) {
      case 'num':
        return 'int';
      case 'bool':
        return 'bool';
      case 'str':
        throw errorAt(`Line ${e.line}: Text in quotes can only go inside Serial.print( ) or Serial.println( ).`, e);
      case 'ident':
        return this.resolveVar(e.name, e, scope).type;
      case 'unary':
        this.checkValue(e.arg, scope);
        return e.op === '!' ? 'bool' : 'int';
      case 'binary':
        this.checkValue(e.left, scope);
        this.checkValue(e.right, scope);
        return ['+', '-', '*', '/', '%'].includes(e.op) ? 'int' : 'bool';
      case 'logical':
        this.checkValue(e.left, scope);
        this.checkValue(e.right, scope);
        return 'bool';
      case 'assign': {
        const v = this.writableVar(e.target.name, e.target, scope);
        this.checkValue(e.value, scope);
        return v.type;
      }
      case 'update': {
        const v = this.writableVar(e.target.name, e.target, scope);
        if (v.type === 'bool') {
          throw errorAt(`Line ${e.line}: ${e.op} only works on int variables, and '${e.target.name}' is a bool.`, e);
        }
        return 'int';
      }
      case 'call':
        return this.checkCall(e, scope, valueNeeded);
      case 'method':
        return this.checkMethod(e, scope, valueNeeded);
    }
  }

  private writableVar(name: string, span: Span, scope: Scope): VarInfo {
    const v = this.resolveVar(name, span, scope);
    if (v.isConst) throw errorAt(`Line ${span.line}: '${name}' is const, so it can't be changed.`, span);
    return v;
  }

  private checkCall(e: Extract<Expr, { kind: 'call' }>, scope: Scope, valueNeeded: boolean): ExprType {
    const name = e.callee;
    const l = e.line;
    let returns: ReturnType;

    if (Object.prototype.hasOwnProperty.call(BUILTINS, name)) {
      const b = BUILTINS[name];
      if (e.args.length !== b.params) throw errorAt(`Line ${l}: ${b.usage}`, e);
      returns = b.returns;
    } else {
      const f = this.funcs.get(name);
      if (!f) this.unknownFunction(name, e.calleeSpan, scope);
      if (e.args.length !== f.params.length) {
        const n = f.params.length;
        const msg =
          n === 0
            ? `${name} doesn't take any values. Write ${name}();`
            : `${name} needs ${n} value${n === 1 ? '' : 's'} in its ( ), but got ${e.args.length}.`;
        throw errorAt(`Line ${l}: ${msg}`, e);
      }
      returns = f.returnType;
    }

    for (const a of e.args) this.checkValue(a, scope);
    if (valueNeeded && returns === 'void') {
      throw errorAt(`Line ${l}: ${name}() doesn't give back a value, so it can't be used here.`, e);
    }
    return returns;
  }

  private unknownFunction(name: string, span: Span, scope: Scope): never {
    const l = span.line;
    if (scope.lookup(name)) throw errorAt(`Line ${l}: '${name}' is a variable, not a command.`, span);
    const commands = [...Object.keys(BUILTINS), ...this.funcs.keys()];
    const wrongCase = caseMismatch(name, commands);
    if (wrongCase) throw errorAt(capitalMessage(l, name, wrongCase), span);
    const close = suggest(name, commands);
    const hint = close ? ` Did you mean '${close}'?` : '';
    throw errorAt(`Line ${l}: There's no command called '${name}'.${hint}`, span);
  }

  private checkMethod(e: Extract<Expr, { kind: 'method' }>, scope: Scope, valueNeeded: boolean): ExprType {
    const l = e.line;
    if (e.object !== 'Serial') {
      if (e.object.toLowerCase() === 'serial') throw errorAt(capitalMessage(l, e.object, 'Serial'), e.objectSpan);
      throw errorAt(`Line ${l}: The dot (.) only works with Serial, like Serial.println(x);`, e.objectSpan);
    }
    const names = Object.keys(SERIAL_METHODS);
    const info = SERIAL_METHODS[e.method];
    if (!Object.prototype.hasOwnProperty.call(SERIAL_METHODS, e.method)) {
      const wrongCase = caseMismatch(e.method, names);
      if (wrongCase) throw errorAt(capitalMessage(l, e.method, wrongCase), e.methodSpan);
      const close = suggest(e.method, names);
      const hint = close ? ` Did you mean '${close}'?` : '';
      throw errorAt(`Line ${l}: Serial doesn't have a command called '${e.method}'.${hint}`, e.methodSpan);
    }
    if (e.args.length < info.minArgs || e.args.length > info.maxArgs) throw errorAt(`Line ${l}: ${info.usage}`, e);

    if (e.method === 'begin') {
      this.usesSerialBegin = true;
      this.checkValue(e.args[0], scope);
    } else {
      this.usesSerialOutput ??= e;
      for (const a of e.args) if (a.kind !== 'str') this.checkValue(a, scope);
    }
    if (valueNeeded) {
      throw errorAt(`Line ${l}: Serial.${e.method}() doesn't give back a value, so it can't be used here.`, e);
    }
    return 'void';
  }
}

function sameSignature(a: FuncDef, b: FuncDef): boolean {
  return (
    a.returnType === b.returnType &&
    a.params.length === b.params.length &&
    a.params.every((p, i) => p.type === b.params[i].type)
  );
}

function findCall(e: Expr): Expr | null {
  switch (e.kind) {
    case 'call':
    case 'method':
      return e;
    case 'unary':
      return findCall(e.arg);
    case 'binary':
    case 'logical':
      return findCall(e.left) ?? findCall(e.right);
    case 'assign':
      return findCall(e.value);
    default:
      return null;
  }
}
