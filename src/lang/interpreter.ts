import type { BlockStmt, DeclStmt, Expr, FuncDef, Program, Stmt, VarType } from './ast';
import { errorAt, INTERNAL_ERROR_MESSAGE, LangError, makeDiagnostic, type Diagnostic, type Span } from './diagnostics';
import type { Cell, Dir, Pose, World } from '../sim/world';

// Tree-walking interpreter written as generators so a runner can pause
// between events: highlight a line, animate a move, wait out a delay.

export type RunEvent =
  | { type: 'line'; line: number }
  | { type: 'move'; line: number; from: Pose; to: Pose; crashed: boolean; blocked: Cell | null }
  | { type: 'turn'; line: number; from: Dir; to: Dir }
  | { type: 'checkpoint'; line: number; index: number }
  | { type: 'print'; line: number; text: string }
  | { type: 'delay'; line: number; ms: number };

export type RunStatus = 'goal' | 'crash' | 'error' | 'loop-limit' | 'step-limit';

export interface RunResult {
  status: RunStatus;
  error?: Diagnostic; // set for 'crash' and 'error'
  loops: number; // completed loop() calls
  passedGoal: boolean; // drove over the goal without stopping on it
}

export interface RunOptions {
  maxLoops?: number; // loop() calls before stopping
  maxIdleStatements?: number; // statements without robot movement
  maxCallDepth?: number;
  maxTotalStatements?: number; // hard cap for headless runs
}

export type RobotWorld = Pick<World, 'step' | 'turn' | 'distanceAhead'>;

const INT_MIN = -32768; // Arduino Uno int is 16 bits
const INT_MAX = 32767;
const LONG_MIN = -2147483648;
const LONG_MAX = 2147483647;

interface Slot {
  type: VarType;
  value: number | undefined; // undefined = declared without a value
  isConst: boolean;
}

class Env {
  private vars = new Map<string, Slot>();
  constructor(private parent: Env | null) {}
  declare(name: string, slot: Slot): void {
    this.vars.set(name, slot);
  }
  lookup(name: string): Slot {
    const s = this.vars.get(name) ?? this.parent?.lookup(name);
    if (!s) throw new Error(`internal: unresolved variable ${name}`);
    return s;
  }
}

// Ends the run early from deep inside the call stack.
class Stop {
  constructor(readonly status: RunStatus, readonly error?: Diagnostic) {}
}

interface Returned {
  value: number;
}

export function* runProgram(program: Program, world: RobotWorld, options: RunOptions = {}): Generator<RunEvent, RunResult, void> {
  const interp = new Interpreter(program, world, options);
  return yield* interp.run();
}

class Interpreter {
  private globals = new Env(null);
  private funcs = new Map<string, FuncDef>();
  private idle = 0;
  private total = 0;
  private depth = 0;
  private loops = 0;
  private passedGoal = false;
  private readonly maxLoops: number;
  private readonly maxIdle: number;
  private readonly maxDepth: number;
  private readonly maxTotal: number;

  constructor(private program: Program, private world: RobotWorld, opts: RunOptions) {
    this.maxLoops = opts.maxLoops ?? 500;
    this.maxIdle = opts.maxIdleStatements ?? 20000;
    this.maxDepth = opts.maxCallDepth ?? 100;
    this.maxTotal = opts.maxTotalStatements ?? Infinity;
    for (const item of program.items) {
      if (item.kind === 'func' && item.body) this.funcs.set(item.name, item);
    }
  }

  *run(): Generator<RunEvent, RunResult, void> {
    try {
      for (const item of this.program.items) {
        if (item.kind === 'decl') yield* this.declare(item, this.globals, true);
      }
      yield* this.callUser(this.funcs.get('setup')!, [], this.funcs.get('setup')!);
      const loop = this.funcs.get('loop')!;
      while (this.loops < this.maxLoops) {
        this.idle = 0;
        yield* this.callUser(loop, [], loop);
        this.loops++;
      }
      return this.result('loop-limit');
    } catch (e) {
      if (e instanceof Stop) return this.result(e.status, e.error);
      if (e instanceof LangError) return this.result('error', e.diagnostic);
      console.error(e);
      return this.result('error', makeDiagnostic('error', INTERNAL_ERROR_MESSAGE, null));
    }
  }

  private result(status: RunStatus, error?: Diagnostic): RunResult {
    const r: RunResult = { status, loops: this.loops, passedGoal: this.passedGoal };
    if (error) r.error = error;
    return r;
  }

  // ---- statements ----

  private *tick(line: number): Generator<RunEvent, void, void> {
    this.idle++;
    this.total++;
    if (this.total > this.maxTotal) throw new Stop('step-limit');
    if (this.idle > this.maxIdle) {
      throw errorAt(`Line ${line}: Your loop runs forever without moving the robot.`, { line, from: 0, to: 0 });
    }
    yield { type: 'line', line };
  }

  private *execBlock(body: Stmt[], env: Env): Generator<RunEvent, Returned | undefined, void> {
    for (const s of body) {
      const r = yield* this.exec(s, env);
      if (r) return r;
    }
    return undefined;
  }

  private *exec(s: Stmt, env: Env): Generator<RunEvent, Returned | undefined, void> {
    switch (s.kind) {
      case 'block':
        return yield* this.execBlock(s.body, new Env(env));
      case 'empty':
        return undefined;
      case 'expr':
        yield* this.tick(s.line);
        yield* this.eval(s.expr, env);
        return undefined;
      case 'decl':
        yield* this.tick(s.line);
        yield* this.declare(s, env, false);
        return undefined;
      case 'if': {
        yield* this.tick(s.line);
        const cond = yield* this.eval(s.test, env);
        if (cond !== 0) return yield* this.exec(s.then, new Env(env));
        if (s.else) return yield* this.exec(s.else, new Env(env));
        return undefined;
      }
      case 'while':
        for (;;) {
          yield* this.tick(s.line);
          if ((yield* this.eval(s.test, env)) === 0) return undefined;
          const r = yield* this.exec(s.body, new Env(env));
          if (r) return r;
        }
      case 'for': {
        const forEnv = new Env(env);
        if (s.init) {
          if (s.init.kind === 'decl') yield* this.declare(s.init, forEnv, false);
          else yield* this.eval(s.init.expr, forEnv);
        }
        for (;;) {
          yield* this.tick(s.line);
          if (s.test && (yield* this.eval(s.test, forEnv)) === 0) return undefined;
          const r = yield* this.exec(s.body, new Env(forEnv));
          if (r) return r;
          if (s.update) yield* this.eval(s.update, forEnv);
        }
      }
      case 'return': {
        yield* this.tick(s.line);
        const value = s.value ? yield* this.eval(s.value, env) : 0;
        return { value };
      }
    }
  }

  private *declare(d: DeclStmt, env: Env, isGlobal: boolean): Generator<RunEvent, void, void> {
    for (const decl of d.decls) {
      let value: number | undefined;
      if (decl.init) value = this.store(d.varType, yield* this.eval(decl.init, env), decl.name, decl.nameSpan);
      else if (isGlobal) value = 0; // globals start at 0 in C++
      env.declare(decl.name, { type: d.varType, value, isConst: d.isConst });
    }
  }

  // Convert a value for storage in a variable of `type`.
  private store(type: VarType, value: number, name: string, span: Span): number {
    if (type === 'bool') return value !== 0 ? 1 : 0;
    if (value > INT_MAX || value < INT_MIN) {
      const limit = value > INT_MAX ? 'only goes up to 32767' : 'only goes down to -32768';
      throw errorAt(`Line ${span.line}: '${name}' can't hold ${value}. On the Arduino, an int ${limit}.`, span);
    }
    return value;
  }

  // ---- expressions ----

  private *eval(e: Expr, env: Env): Generator<RunEvent, number, void> {
    switch (e.kind) {
      case 'num':
        return e.value;
      case 'bool':
        return e.value ? 1 : 0;
      case 'str':
        throw new Error('internal: string outside Serial.print');
      case 'ident': {
        const slot = env.lookup(e.name);
        if (slot.value === undefined) {
          throw errorAt(
            `Line ${e.line}: '${e.name}' doesn't have a value yet. Give it one when you create it, like int ${e.name} = 0;`,
            e,
          );
        }
        return slot.value;
      }
      case 'unary': {
        const v = yield* this.eval(e.arg, env);
        if (e.op === '!') return v === 0 ? 1 : 0;
        if (e.op === '-') return this.arith(-v, `-${v}`, [v], e);
        return v;
      }
      case 'logical': {
        const l = yield* this.eval(e.left, env);
        if (e.op === '&&' && l === 0) return 0;
        if (e.op === '||' && l !== 0) return 1;
        return (yield* this.eval(e.right, env)) !== 0 ? 1 : 0;
      }
      case 'binary': {
        const l = yield* this.eval(e.left, env);
        const r = yield* this.eval(e.right, env);
        return this.binary(e.op, l, r, e);
      }
      case 'assign': {
        const slot = env.lookup(e.target.name);
        const r = yield* this.eval(e.value, env);
        let v = r;
        if (e.op !== '=') {
          if (slot.value === undefined) yield* this.eval(e.target, env); // throws the "no value yet" error
          v = this.binary(e.op[0] as '+', slot.value!, r, e);
        }
        slot.value = this.store(slot.type, v, e.target.name, e);
        return slot.value;
      }
      case 'update': {
        const slot = env.lookup(e.target.name);
        const old = yield* this.eval(e.target, env);
        const v = this.binary(e.op === '++' ? '+' : '-', old, 1, e);
        slot.value = this.store(slot.type, v, e.target.name, e);
        return e.prefix ? slot.value : old;
      }
      case 'call':
        return yield* this.call(e, env);
      case 'method':
        yield* this.serial(e, env);
        return 0;
    }
  }

  private binary(op: string, l: number, r: number, span: Span): number {
    switch (op) {
      case '+': return this.arith(l + r, `${l} + ${r}`, [l, r], span);
      case '-': return this.arith(l - r, `${l} - ${r}`, [l, r], span);
      case '*': return this.arith(l * r, `${l} * ${r}`, [l, r], span);
      case '/':
      case '%':
        if (r === 0) throw errorAt(`Line ${span.line}: You can't divide by zero.`, span);
        // C++ integer division truncates toward zero; % keeps the sign of the left side.
        return this.arith(op === '/' ? Math.trunc(l / r) : l % r, `${l} ${op} ${r}`, [l, r], span);
      case '==': return l === r ? 1 : 0;
      case '!=': return l !== r ? 1 : 0;
      case '<': return l < r ? 1 : 0;
      case '>': return l > r ? 1 : 0;
      case '<=': return l <= r ? 1 : 0;
      case '>=': return l >= r ? 1 : 0;
    }
    throw new Error(`internal: unknown operator ${op}`);
  }

  // Math on two ints overflows past 32767 on the Arduino Uno. Numbers
  // written out larger than that are longs there, so allow those.
  private arith(result: number, text: string, operands: number[], span: Span): number {
    const isLong = operands.some((v) => v > INT_MAX || v < INT_MIN);
    const [min, max] = isLong ? [LONG_MIN, LONG_MAX] : [INT_MIN, INT_MAX];
    if (result > max || result < min) {
      const word = result > max ? 'big' : 'small';
      const limit = result > max ? max : min;
      throw errorAt(
        `Line ${span.line}: ${text} makes ${result}, which is too ${word} for an int on the Arduino. The limit is ${limit}.`,
        span,
      );
    }
    return result;
  }

  private *evalArgs(args: Expr[], env: Env): Generator<RunEvent, number[], void> {
    const values: number[] = [];
    for (const a of args) values.push(yield* this.eval(a, env));
    return values;
  }

  private *call(e: Extract<Expr, { kind: 'call' }>, env: Env): Generator<RunEvent, number, void> {
    const args = yield* this.evalArgs(e.args, env);
    const user = this.funcs.get(e.callee);
    if (user) return yield* this.callUser(user, args, e);
    return yield* this.builtin(e.callee, args, e);
  }

  private *callUser(f: FuncDef, args: number[], site: Span): Generator<RunEvent, number, void> {
    if (this.depth >= this.maxDepth) {
      throw errorAt(`Line ${site.line}: The function '${f.name}' keeps calling itself.`, site);
    }
    const env = new Env(this.globals);
    f.params.forEach((p, i) => {
      env.declare(p.name, { type: p.type, value: this.store(p.type, args[i], p.name, site), isConst: p.isConst });
    });
    this.depth++;
    const r = yield* this.execBlock((f.body as BlockStmt).body, env);
    this.depth--;
    if (f.returnType === 'void') return 0;
    if (!r) {
      throw errorAt(
        `Line ${f.line}: ${f.name} reached its end without a return. Add a return with a value, like return 0;`,
        f.nameSpan,
      );
    }
    if (f.returnType === 'bool') return r.value !== 0 ? 1 : 0;
    return this.store('int', r.value, `${f.name}()`, site);
  }

  private *builtin(name: string, args: number[], e: Span): Generator<RunEvent, number, void> {
    const line = e.line;
    switch (name) {
      case 'forward':
      case 'backward': {
        const n = args[0];
        if (n <= 0) throw errorAt(`Line ${line}: ${name} needs a number bigger than 0, but got ${n}.`, e);
        for (let i = 0; i < n; i++) {
          const r = this.world.step(name === 'forward' ? 1 : -1);
          this.idle = 0;
          yield { type: 'move', line, from: r.from, to: r.to, crashed: r.crashed, blocked: r.blocked };
          if (r.crashed) {
            throw new Stop('crash', makeDiagnostic('error', `Crashed into a wall on line ${line}.`, e));
          }
          if (r.checkpoint !== null) yield { type: 'checkpoint', line, index: r.checkpoint };
          // The goal counts only when the command ends on it. A real rover
          // doesn't know where the X is, so it wouldn't stop there either.
          if (r.onGoal && i === n - 1) throw new Stop('goal');
          if (r.onGoal) this.passedGoal = true;
        }
        return 0;
      }
      case 'turnLeft':
      case 'turnRight': {
        const t = this.world.turn(name === 'turnLeft' ? 'left' : 'right');
        this.idle = 0;
        yield { type: 'turn', line, from: t.from, to: t.to };
        return 0;
      }
      case 'distanceAhead':
        return this.world.distanceAhead();
      case 'delay': {
        const ms = args[0];
        if (ms < 0) throw errorAt(`Line ${line}: delay needs a number 0 or bigger, but got ${ms}.`, e);
        yield { type: 'delay', line, ms };
        return 0;
      }
    }
    throw new Error(`internal: unknown builtin ${name}`);
  }

  private *serial(e: Extract<Expr, { kind: 'method' }>, env: Env): Generator<RunEvent, void, void> {
    if (e.method === 'begin') {
      yield* this.eval(e.args[0], env);
      return;
    }
    let text = '';
    const arg = e.args[0];
    if (arg) text = arg.kind === 'str' ? arg.value : String(yield* this.eval(arg, env));
    if (e.method === 'println') text += '\n';
    yield { type: 'print', line: e.line, text };
  }
}
