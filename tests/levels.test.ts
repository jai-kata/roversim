import { describe, expect, it } from 'vitest';
import { compile, type Program } from '../src/lang';
import { analyze, countCommands, loopIsEmpty, missingRequirements } from '../src/lang/analysis';
import { LEVELS, passesAllVariants, runHeadless, worldFor, type Level } from '../src/levels';
import { storage } from '../src/storage';

function program(src: string): Program {
  const c = compile(src);
  if (!c.ok) throw new Error(c.error.message);
  return c.program;
}

const level = (id: number): Level => LEVELS.find((l) => l.id === id)!;

// Everything the UI checks before it says "Made it." and marks a level done.
function completes(l: Level, src: string): boolean {
  const p = program(src);
  return (
    passesAllVariants(p, l) &&
    missingRequirements(p, l.requires).length === 0 &&
    (l.maxCommands === null || countCommands(p) <= l.maxCommands)
  );
}

const wrap = (setup: string, loop = '') => `void setup() {\n${setup}\n}\nvoid loop() {\n${loop}\n}\n`;

it('has the 8 MVP levels in order', () => {
  expect(LEVELS.map((l) => l.id)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  expect(LEVELS[7].title).toBe('Sandbox (more levels coming)');
});

describe.each(LEVELS.map((l) => [`${l.id}. ${l.title}`, l] as const))('level %s', (_, l) => {
  it('starter code compiles', () => {
    const c = compile(l.starterCode);
    expect(c.ok ? 'ok' : c.error.message).toBe('ok');
  });

  it('starter code compiles without warnings', () => {
    expect(compile(l.starterCode).warnings).toEqual([]);
  });

  it('has sane variants', () => {
    expect(l.variants.length).toBeGreaterThan(0);
    for (const v of l.variants) {
      const w = worldFor(l, v);
      expect(w.isBlocked(v.start.x, v.start.y)).toBe(false);
      if (v.goal) expect(w.isBlocked(v.goal.x, v.goal.y)).toBe(false);
      for (const c of v.checkpoints) expect(w.isBlocked(c.x, c.y)).toBe(false);
    }
  });

  it('solution passes every variant', () => {
    const p = program(l.solution);
    for (const v of l.variants) {
      expect(runHeadless(p, l, v).status).toBe(v.goal ? 'goal' : 'loop-limit');
    }
  });

  it('solution meets requires and maxCommands', () => {
    const p = program(l.solution);
    expect(missingRequirements(p, l.requires)).toEqual([]);
    if (l.maxCommands !== null) expect(countCommands(p)).toBeLessThanOrEqual(l.maxCommands);
  });

  it('instructions are at most two sentences', () => {
    expect(l.instructions.split(/[.?!](\s|$)/).filter((s) => s.trim()).length).toBeLessThanOrEqual(2);
  });

  if (l.variants.some((v) => v.goal)) {
    it('starter code does not already finish the level', () => {
      expect(completes(l, l.starterCode)).toBe(false);
    });
  }
});

describe('level rules catch shortcuts', () => {
  it('level 3: writing every stair out is too many commands', () => {
    const steps = Array.from({ length: 5 }, () => 'forward(1); turnRight(); forward(1); turnLeft();').join('\n');
    const p = program(wrap(steps));
    expect(passesAllVariants(p, level(3))).toBe(true);
    expect(completes(level(3), wrap(steps))).toBe(false);
  });

  it('level 4: plain numbers instead of a variable', () => {
    const src = wrap('forward(5); turnLeft(); forward(3); turnLeft(); forward(5);');
    expect(passesAllVariants(program(src), level(4))).toBe(true);
    expect(missingRequirements(program(src), ['variable'])).toEqual(['variable']);
  });

  it('level 5: driving the square without a loop', () => {
    const src = wrap('forward(2); turnRight(); forward(2); turnRight(); forward(2); turnRight(); forward(2);');
    expect(passesAllVariants(program(src), level(5))).toBe(true);
    expect(completes(level(5), src)).toBe(false);
  });

  it('level 5: corners out of order do not count', () => {
    const src = wrap('for (int i = 0; i < 4; i++) { turnRight(); turnRight(); turnRight(); }\nfor (int i = 0; i < 4; i++) { forward(2); turnLeft(); }');
    expect(passesAllVariants(program(src), level(5))).toBe(false);
  });

  it('level 6: a fixed distance only works on one hallway', () => {
    const results = level(6).variants.map((v) => runHeadless(program(wrap('forward(5);')), level(6), v).status);
    expect(results).toContain('goal');
    expect(results).toContain('crash');
    expect(completes(level(6), wrap('forward(5);'))).toBe(false);
  });

  it('level 7: always turning left only works on one side', () => {
    const src = wrap('forward(4); turnLeft(); forward(2);');
    const results = level(7).variants.map((v) => runHeadless(program(src), level(7), v).status);
    expect(results).toEqual(['goal', 'crash']);
  });

  it('level 7: the if/else version works too', () => {
    const src = wrap('forward(4);\nturnLeft();\nif (distanceAhead() > 0) {\n  forward(2);\n} else {\n  turnRight();\n  turnRight();\n  forward(2);\n}');
    expect(completes(level(7), src)).toBe(true);
  });
});

describe('analysis', () => {
  it('counts robot-command call sites, not executions', () => {
    const p = program(`
void hop() { forward(1); turnLeft(); }
void setup() {
  for (int i = 0; i < 10; i++) { hop(); }
  if (distanceAhead() > 0) { backward(1); } else { turnRight(); }
  delay(100);
}
void loop() {}`);
    expect(countCommands(p)).toBe(4);
  });

  it('finds each kind of requirement', () => {
    const p = program(`
int legs = 2;
void hop(int n) { forward(n); }
void setup() {
  for (int i = 0; i < 2; i++) { hop(legs); }
  while (distanceAhead() > 3) { turnLeft(); }
  if (legs > 1) { turnRight(); }
}
void loop() {}`);
    expect(analyze(p)).toMatchObject({ for: true, while: true, if: true, variable: true, function: true });
  });

  it('a for counter alone is not "using a variable"', () => {
    const p = program(wrap('for (int i = 0; i < 4; i++) { forward(2); turnRight(); }'));
    expect(analyze(p).variable).toBe(false);
  });

  it('a variable that is created but never used does not count', () => {
    expect(analyze(program(wrap('int legs = 5; forward(5);'))).variable).toBe(false);
  });

  it('a function that is never called does not count', () => {
    expect(analyze(program('void hop() { forward(1); }\n' + wrap('forward(1);'))).function).toBe(false);
  });

  it('detects an empty loop()', () => {
    expect(loopIsEmpty(program('void setup() {}\nvoid loop() {\n}'))).toBe(true);
    expect(loopIsEmpty(program('void setup() {}\nvoid loop() { ; }'))).toBe(true);
    expect(loopIsEmpty(program('void setup() {}\nvoid loop() { turnLeft(); }'))).toBe(false);
  });
});

describe('storage without localStorage', () => {
  it('works (and saves nothing) when storage is unavailable', () => {
    // Vitest runs in Node, where window/localStorage don't exist at all.
    expect(() => storage.saveCode(1, 'x')).not.toThrow();
    expect(storage.code(1)).toBeNull();
    expect(() => storage.markDone(1)).not.toThrow();
    expect(storage.isDone(1)).toBe(false);
    expect(storage.lastLevel()).toBeNull();
  });
});
