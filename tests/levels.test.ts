import { describe, expect, it, vi } from 'vitest';
import { compile, type Program } from '../src/lang';
import { analyze, countCommands, loopIsEmpty, missingRequirements } from '../src/lang/analysis';
import { LEVELS, passesAllVariants, runHeadless, worldFor, type Level } from '../src/levels';
import { runProgram } from '../src/lang';
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

it('has 14 levels and then the sandbox, in order', () => {
  expect(LEVELS.map((l) => l.id)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);
  expect(LEVELS[14].title).toBe('Sandbox');
});

// Status on each version of the map.
const statuses = (l: Level, src: string) => l.variants.map((v) => runHeadless(program(src), l, v).status);

// Index of the next circle the rover needed when the run ended.
function circlesReached(l: Level, src: string): number {
  const w = worldFor(l, l.variants[0]);
  const gen = runProgram(program(src), w, { maxTotalStatements: 200000 });
  while (!gen.next().done);
  return w.nextCheckpoint;
}

const RIGHT_HAND = wrap('', 'turnRight();\nwhile (distanceAhead() == 0) { turnLeft(); }\nforward(1);');
const LEFT_HAND = wrap('', 'turnLeft();\nwhile (distanceAhead() == 0) { turnRight(); }\nforward(1);');
const BOUNCE = wrap('', 'if (distanceAhead() > 0) { forward(1); } else { turnRight(); }');

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

  it('level 1: the old answer and stopping on the X too early do not finish', () => {
    expect(completes(level(1), wrap('forward(3);'))).toBe(false);
    expect(completes(level(1), wrap('forward(2);'))).toBe(false);
    expect(circlesReached(level(1), wrap('forward(2);'))).toBe(0);
  });

  it('level 1: the starter code explains each part of a program', () => {
    const comments = level(1)
      .starterCode.split('\n')
      .filter((line) => line.includes('//'))
      .join('\n');
    for (const part of ['commands', 'setup()', '{', '}', '( )', ';', 'loop()']) {
      expect(comments).toContain(part);
    }
  });

  it('level 8: writing every bump out is too many commands and no function', () => {
    const bump = (n: number) => `turnLeft(); forward(1); turnRight(); forward(${n}); turnRight(); forward(1); turnLeft();`;
    const src = wrap(`${bump(2)} forward(2); ${bump(4)} forward(2); ${bump(3)}`);
    expect(passesAllVariants(program(src), level(8))).toBe(true);
    expect(missingRequirements(program(src), ['function'])).toEqual(['function']);
    expect(countCommands(program(src))).toBeGreaterThan(9);
  });

  it('level 9: writing the spiral out is too many commands', () => {
    const sides = [1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6].map((n) => `forward(${n}); turnRight();`).join('\n');
    expect(passesAllVariants(program(wrap(sides)), level(9))).toBe(true);
    expect(completes(level(9), wrap(sides))).toBe(false);
  });

  it('level 9: nested loops work too', () => {
    const src = wrap('for (int n = 1; n <= 6; n++) {\n  for (int k = 0; k < 2; k++) {\n    forward(n);\n    turnRight();\n  }\n}');
    expect(completes(level(9), src)).toBe(true);
  });

  it('level 10: forgetting that the rover can already be in the middle', () => {
    const src = wrap(`
int up = distanceAhead();
turnRight(); turnRight();
int down = distanceAhead();
int rows = (down - up) / 2;
if (rows > 0) { forward(rows); } else { backward(-rows); }
turnRight();
int left = distanceAhead();
turnRight(); turnRight();
int right = distanceAhead();
int cols = (right - left) / 2;
if (cols > 0) { forward(cols); } else { backward(-cols); }`);
    expect(statuses(level(10), src)).toContain('error');
    expect(statuses(level(10), src)).toContain('goal');
  });

  it('level 10: driving to a wall and back half the room works too', () => {
    const half = 'if (distanceAhead() > 0) { forward(distanceAhead()); }\nturnRight(); turnRight();\nforward(distanceAhead() / 2);';
    expect(completes(level(10), wrap(`${half}\nturnRight();\n${half}`))).toBe(true);
  });

  it('level 11: driving around the edge misses the circles', () => {
    expect(statuses(level(11), BOUNCE).every((s) => s !== 'goal')).toBe(true);
  });

  it('level 11: the plain if/else version works but uses too many commands', () => {
    const src =
      'bool up = true;\n' +
      wrap('', 'while (distanceAhead() > 0) { forward(1); }\nif (up) { turnRight(); forward(1); turnRight(); } else { turnLeft(); forward(1); turnLeft(); }\nup = !up;');
    expect(passesAllVariants(program(src), level(11))).toBe(true);
    expect(completes(level(11), src)).toBe(false);
  });

  it('level 11: three right turns instead of a left fits in 4 commands', () => {
    const src =
      'int turns = 1;\n' +
      wrap('', 'while (distanceAhead() > 0) { forward(1); }\nfor (int i = 0; i < turns; i++) { turnRight(); }\nforward(1);\nfor (int i = 0; i < turns; i++) { turnRight(); }\nturns = 4 - turns;');
    expect(completes(level(11), src)).toBe(true);
  });

  it('level 12: turning right at every wall gets lost', () => {
    expect(completes(level(12), BOUNCE)).toBe(false);
  });

  it('level 12: the left-hand rule works too', () => {
    expect(completes(level(12), LEFT_HAND)).toBe(true);
  });

  it('level 13: maze code never finds the X out in the open', () => {
    expect(statuses(level(13), RIGHT_HAND).every((s) => s !== 'goal')).toBe(true);
    expect(statuses(level(13), LEFT_HAND).every((s) => s !== 'goal')).toBe(true);
  });

  it('level 13: one fixed route only fits one map', () => {
    const src = wrap('forward(1); turnLeft(); forward(5); turnRight(); forward(7); turnRight(); forward(4);');
    expect(statuses(level(13), src)).toContain('crash');
    expect(completes(level(13), src)).toBe(false);
  });

  it('level 14: following the wall the whole way misses the X', () => {
    expect(completes(level(14), RIGHT_HAND)).toBe(false);
    expect(completes(level(14), LEFT_HAND)).toBe(false);
  });

  it('level 14: heading straight for the X gets stuck', () => {
    const greedy = (first: string, second: string) => `
int x = 0;
int y = 0;
int dir = 0;
void face(int d) { while (dir != d) { turnRight(); dir = (dir + 1) % 4; } }
void step() { forward(1); if (dir == 0) y++; if (dir == 1) x++; if (dir == 2) y--; if (dir == 3) x--; }
bool open(int d) { face(d); return distanceAhead() > 0; }
void setup() {}
void loop() {
  bool moved = false;
  if (!moved && ${first}) { step(); moved = true; }
  if (!moved && ${second}) { step(); moved = true; }
  if (!moved) { turnRight(); dir = (dir + 1) % 4; if (distanceAhead() > 0) { step(); } }
}`;
    const right = 'x < 8 && open(1)';
    const up = 'y < 5 && open(0)';
    expect(completes(level(14), greedy(right, up))).toBe(false);
    expect(completes(level(14), greedy(up, right))).toBe(false);
  });

  it('level 14: following the wall with the left hand works too', () => {
    const swap = (src: string, from: string, to: string) => {
      expect(src).toContain(from);
      return src.replace(from, to);
    };
    let src = level(14).solution;
    src = swap(src, 'while (distanceAhead() == 0) {\n    left();\n  }\n  step();', 'while (distanceAhead() == 0) {\n    right();\n  }\n  step();');
    src = swap(src, 'right();\n      while (distanceAhead() == 0) {\n        left();', 'left();\n      while (distanceAhead() == 0) {\n        right();');
    expect(completes(level(14), src)).toBe(true);
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

describe('storage saved by v0.4', () => {
  it('moves sandbox code to level 15 and drops the old level 1 code, once', () => {
    const data = new Map<string, string>();
    vi.stubGlobal('window', {
      localStorage: {
        getItem: (k: string) => data.get(k) ?? null,
        setItem: (k: string, v: string) => data.set(k, v),
        removeItem: (k: string) => data.delete(k),
      },
    });
    try {
      storage.saveCode(1, 'forward(3);');
      storage.saveCode(4, 'int legs = 5;');
      storage.saveCode(8, 'turnLeft();');
      storage.setLastLevel(8);
      storage.migrate();
      expect(storage.code(1)).toBeNull();
      expect(storage.code(4)).toBe('int legs = 5;');
      expect(storage.code(8)).toBeNull();
      expect(storage.code(15)).toBe('turnLeft();');
      expect(storage.lastLevel()).toBe(15);

      storage.saveCode(1, 'forward(4);');
      storage.saveCode(8, 'bump(2);');
      storage.migrate();
      expect(storage.code(1)).toBe('forward(4);');
      expect(storage.code(8)).toBe('bump(2);');
    } finally {
      vi.unstubAllGlobals();
    }
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
