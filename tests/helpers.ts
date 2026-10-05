import { compile, runProgram, type RunEvent, type RunOptions, type RunResult } from '../src/lang';
import { World, type WorldConfig } from '../src/sim/world';

export const OPEN_8x8: WorldConfig = {
  w: 8,
  h: 8,
  start: { x: 1, y: 6, dir: 'N' },
  goal: null,
  walls: [],
  checkpoints: [],
};

export function world(overrides: Partial<WorldConfig> = {}): World {
  return new World({ ...OPEN_8x8, ...overrides });
}

export interface Outcome {
  result: RunResult;
  events: RunEvent[];
  output: string;
  world: World;
}

// Compile and run to completion. Throws if compilation fails.
export function run(source: string, w: World = world(), opts: RunOptions = {}): Outcome {
  const c = compile(source);
  if (!c.ok) throw new Error(`compile failed: ${c.error.message}`);
  const events: RunEvent[] = [];
  const gen = runProgram(c.program, w, { maxLoops: 3, ...opts });
  let step = gen.next();
  while (!step.done) {
    events.push(step.value);
    step = gen.next();
  }
  const output = events.filter((e) => e.type === 'print').map((e) => (e as { text: string }).text).join('');
  return { result: step.value, events, output, world: w };
}

// Wrap statements in setup() with an empty loop().
export function inSetup(body: string): string {
  return `void setup() {\n${body}\n}\nvoid loop() {\n}\n`;
}

// Print output of a setup()-only program.
export function printOf(body: string): string {
  return run(inSetup(body), world(), { maxLoops: 1 }).output;
}

export function compileError(source: string): string {
  const c = compile(source);
  if (c.ok) throw new Error('expected a compile error, but it compiled');
  return c.error.message;
}

export function compileErrorLine(source: string): number | null {
  const c = compile(source);
  if (c.ok) throw new Error('expected a compile error, but it compiled');
  return c.error.line;
}

export function warningsOf(source: string): string[] {
  return compile(source).warnings.map((w) => w.message);
}

export function runtimeError(source: string, w: World = world(), opts: RunOptions = {}): string {
  const { result } = run(source, w, opts);
  if (!result.error) throw new Error(`expected a runtime error, got status ${result.status}`);
  return result.error.message;
}
