import { describe, expect, it } from 'vitest';
import { compile, runProgram } from '../src/lang';
import { inSetup, printOf, run, runtimeError, world } from './helpers';

describe('interpreter: values and operators', () => {
  it.each([
    ['1 + 2 * 3', '7'],
    ['(1 + 2) * 3', '9'],
    ['7 / 2', '3'],
    ['-7 / 2', '-3'],
    ['7 % 3', '1'],
    ['-7 % 3', '-1'],
    ['10 - 4 - 3', '3'],
    ['3 < 4', '1'],
    ['3 >= 4', '0'],
    ['2 == 2', '1'],
    ['2 != 2', '0'],
    ['true', '1'],
    ['false', '0'],
    ['!0', '1'],
    ['!5', '0'],
    ['-(-4)', '4'],
    ['+4', '4'],
    ['1 && 0', '0'],
    ['1 || 0', '1'],
    ['3 && 4', '1'],
    ['40000', '40000'],
  ])('%s prints %s', (src, out) => {
    expect(printOf(`Serial.print(${src});`)).toBe(out);
  });

  it('short-circuits && and || (the right side never runs)', () => {
    const out = run(`
int hits = 0;
bool bump() { hits++; return true; }
void setup() {
  bool a = false && bump();
  bool b = true || bump();
  Serial.print(hits);
}
void loop() {}
`, world(), { maxLoops: 1 }).output;
    expect(out).toBe('0');
  });

  it('handles assignment, compound assignment, and ++/--', () => {
    expect(printOf(`
      int x = 5;
      x += 3; Serial.print(x); Serial.print(" ");
      x -= 1; Serial.print(x); Serial.print(" ");
      x *= 2; Serial.print(x); Serial.print(" ");
      x /= 4; Serial.print(x); Serial.print(" ");
      x %= 2; Serial.print(x); Serial.print(" ");
      int y = x++; Serial.print(y); Serial.print(x); Serial.print(" ");
      int z = ++x; Serial.print(z); Serial.print(x); Serial.print(" ");
      int w = x--; Serial.print(w); Serial.print(x); Serial.print(" ");
      int v = --x; Serial.print(v); Serial.print(x); Serial.print(" ");
      int a; int b; a = b = 7; Serial.print(a + b);
    `)).toBe('8 7 14 3 1 12 33 32 11 14');
  });

  it('stores bools as 0/1 and converts ints', () => {
    expect(printOf(`
      bool b = 5; Serial.print(b);
      int i = true; Serial.print(i);
      bool c = 0; Serial.print(c);
    `)).toBe('110');
  });

  it('prints with print and println', () => {
    expect(printOf('Serial.begin(9600); Serial.print("a"); Serial.println(1); Serial.println(); Serial.println("b");')).toBe('a1\n\nb\n');
  });

  it('globals start at 0 and are shared', () => {
    expect(run(`
int count;
const int STEP = 2;
void add() { count += STEP; }
void setup() { add(); add(); Serial.print(count); }
void loop() {}
`, world(), { maxLoops: 1 }).output).toBe('4');
  });
});

describe('interpreter: control flow', () => {
  it('runs if / else if / else', () => {
    const src = (n: number) => `
      int n = ${n};
      if (n < 0) { Serial.print("neg"); }
      else if (n == 0) Serial.print("zero");
      else { Serial.print("pos"); }`;
    expect(printOf(src(-1))).toBe('neg');
    expect(printOf(src(0))).toBe('zero');
    expect(printOf(src(4))).toBe('pos');
  });

  it('runs while loops', () => {
    expect(printOf('int i = 0; while (i < 4) { Serial.print(i); i++; }')).toBe('0123');
  });

  it('runs for loops with scoped counters', () => {
    expect(printOf(`
      for (int i = 0; i < 3; i++) { Serial.print(i); }
      for (int i = 10; i > 7; i--) Serial.print(i);
    `)).toBe('012' + '1098');
  });

  it('runs nested loops', () => {
    expect(printOf('for (int i = 0; i < 2; i++) { for (int j = 0; j < 2; j++) { Serial.print(i * 10 + j); Serial.print(" "); } }'))
      .toBe('0 1 10 11 ');
  });

  it('runs loop() repeatedly after setup()', () => {
    const { output, result } = run('void setup() { Serial.print("s"); }\nvoid loop() { Serial.print("L"); }', world(), { maxLoops: 4 });
    expect(output).toBe('sLLLL');
    expect(result).toEqual({ status: 'loop-limit', loops: 4, passedGoal: false });
  });

  it('stops after 500 loop() runs by default', () => {
    const { result } = run('void setup() {}\nvoid loop() { turnLeft(); }', world(), { maxLoops: undefined });
    expect(result.status).toBe('loop-limit');
    expect(result.loops).toBe(500);
  });

  it('return leaves setup and loop early', () => {
    const { output } = run('void setup() { Serial.print("a"); return; Serial.print("b"); }\nvoid loop() { Serial.print("c"); return; Serial.print("d"); }', world(), { maxLoops: 2 });
    expect(output).toBe('acc');
  });
});

describe('interpreter: scoping', () => {
  it('block variables shadow outer ones and disappear after the block', () => {
    expect(printOf(`
      int x = 1;
      { int x = 2; Serial.print(x); }
      Serial.print(x);
      if (true) { int x = 3; Serial.print(x); }
      Serial.print(x);
    `)).toBe('2131');
  });

  it('locals shadow globals', () => {
    expect(run(`
int x = 5;
void show() { Serial.print(x); }
void setup() { int x = 9; Serial.print(x); show(); }
void loop() {}
`, world(), { maxLoops: 1 }).output).toBe('95');
  });

  it('each loop() call gets fresh locals', () => {
    const { output } = run('void setup() {}\nvoid loop() { int n = 0; n++; Serial.print(n); }', world(), { maxLoops: 3 });
    expect(output).toBe('111');
  });
});

describe('interpreter: functions', () => {
  it('calls functions defined after use', () => {
    expect(run(`
void setup() { Serial.print(twice(4)); hello(); }
void loop() {}
int twice(int n) { return n * 2; }
void hello() { Serial.print("!"); }
`, world(), { maxLoops: 1 }).output).toBe('8!');
  });

  it('supports prototypes', () => {
    expect(run(`
int add(int a, int b);
void setup() { Serial.print(add(2, 3)); }
void loop() {}
int add(int a, int b) { return a + b; }
`, world(), { maxLoops: 1 }).output).toBe('5');
  });

  it('passes arguments by value', () => {
    expect(run(`
void bump(int n) { n++; }
void setup() { int a = 1; bump(a); Serial.print(a); }
void loop() {}
`, world(), { maxLoops: 1 }).output).toBe('1');
  });

  it('supports recursion within the depth limit', () => {
    expect(run(`
int fact(int n) { if (n <= 1) { return 1; } return n * fact(n - 1); }
void setup() { Serial.print(fact(7)); }
void loop() {}
`, world(), { maxLoops: 1 }).output).toBe('5040');
  });

  it('bool functions return 0/1', () => {
    expect(run(`
bool big(int n) { return n * 100; }
void setup() { Serial.print(big(3)); Serial.print(big(0)); }
void loop() {}
`, world(), { maxLoops: 1 }).output).toBe('10');
  });

  it('return inside a loop leaves the function', () => {
    expect(run(`
int firstOver(int limit) { for (int i = 0; i < 100; i++) { if (i * i > limit) { return i; } } return -1; }
void setup() { Serial.print(firstOver(50)); }
void loop() {}
`, world(), { maxLoops: 1 }).output).toBe('8');
  });
});

describe('interpreter: robot', () => {
  it('moves forward one cell per event', () => {
    const { events, world: w } = run(inSetup('forward(3);'), world(), { maxLoops: 1 });
    const moves = events.filter((e) => e.type === 'move');
    expect(moves).toHaveLength(3);
    expect(moves.map((m) => m.type === 'move' && `${m.to.x},${m.to.y}`)).toEqual(['1,5', '1,4', '1,3']);
    expect(w.pose).toEqual({ x: 1, y: 3, dir: 'N' });
  });

  it('turns and moves in the new heading', () => {
    const { world: w, events } = run(inSetup('turnRight(); forward(2); turnLeft(); turnLeft(); backward(1);'), world(), { maxLoops: 1 });
    expect(w.pose).toEqual({ x: 4, y: 6, dir: 'W' });
    const turns = events.filter((e) => e.type === 'turn').map((e) => e.type === 'turn' && `${e.from}>${e.to}`);
    expect(turns).toEqual(['N>E', 'E>N', 'N>W']);
  });

  it('reports distanceAhead', () => {
    const w = world({ walls: [[1, 2]] });
    expect(run(inSetup('Serial.print(distanceAhead()); turnRight(); Serial.print(distanceAhead()); turnRight(); Serial.print(distanceAhead());'), w, { maxLoops: 1 }).output)
      .toBe('361');
  });

  it('reports 0 when a wall is directly ahead', () => {
    const w = world({ walls: [[1, 5]] });
    expect(run(inSetup('Serial.print(distanceAhead());'), w, { maxLoops: 1 }).output).toBe('0');
  });

  it('crashes into walls with the line number', () => {
    const w = world({ walls: [[1, 4]] });
    const { result, events, world: after } = run('void setup() {\n  forward(1);\n  forward(5);\n}\nvoid loop() {}', w);
    expect(result.status).toBe('crash');
    expect(result.error?.message).toBe('Crashed into a wall on line 3.');
    expect(result.error?.line).toBe(3);
    expect(after.pose).toMatchObject({ x: 1, y: 5 });
    const last = events[events.length - 1];
    expect(last).toMatchObject({ type: 'move', crashed: true, blocked: { x: 1, y: 4 } });
  });

  it('crashes into the edge of the map', () => {
    const { result } = run(inSetup('backward(2);'));
    expect(result.status).toBe('crash');
  });

  it('stops when a move ends on the goal', () => {
    const w = world({ goal: { x: 1, y: 3 } });
    const { result, world: after, output } = run(inSetup('forward(3); Serial.print("after");'), w);
    expect(result).toMatchObject({ status: 'goal', passedGoal: false });
    expect(after.pose).toMatchObject({ x: 1, y: 3 });
    expect(output).toBe('');
  });

  it('does not stop when the rover drives over the goal', () => {
    // A real rover doesn't know where the X is, so forward(5) drives all 5 cells.
    const w = world({ goal: { x: 1, y: 3 } });
    const { result, world: after, output } = run(inSetup('forward(5); Serial.print("after");'), w, { maxLoops: 1 });
    expect(result).toMatchObject({ status: 'loop-limit', passedGoal: true });
    expect(after.pose).toMatchObject({ x: 1, y: 1 });
    expect(output).toBe('after');
  });

  it('stops on the goal at the end of a forward(1) inside a loop', () => {
    const w = world({ goal: { x: 1, y: 3 } });
    const { result } = run('void setup() {} void loop() { forward(1); }', w, { maxLoops: 10 });
    expect(result).toMatchObject({ status: 'goal', loops: 2 });
  });

  it('only counts the goal after checkpoints, in order', () => {
    const cps = [{ x: 1, y: 4 }, { x: 3, y: 4 }];
    // Drives over the goal before checkpoints are done, then comes back.
    const src = 'void setup() {\n forward(2); turnRight(); forward(2); turnLeft(); turnLeft(); forward(1); }\nvoid loop() {}';
    const w = world({ goal: { x: 2, y: 4 }, checkpoints: cps });
    const { result, events } = run(src, w);
    expect(events.filter((e) => e.type === 'checkpoint').map((e) => e.type === 'checkpoint' && e.index)).toEqual([0, 1]);
    expect(result.status).toBe('goal');
    expect(w.pose).toMatchObject({ x: 2, y: 4 });
  });

  it('ignores checkpoints visited out of order', () => {
    const cps = [{ x: 1, y: 3 }, { x: 1, y: 5 }];
    const w = world({ checkpoints: cps });
    run(inSetup('forward(1); forward(2);'), w, { maxLoops: 1 });
    expect(w.nextCheckpoint).toBe(1);
  });

  it('yields delay events', () => {
    const { events } = run(inSetup('delay(250);'), world(), { maxLoops: 1 });
    expect(events).toContainEqual({ type: 'delay', line: 2, ms: 250 });
  });

  it('yields a line event before each statement', () => {
    const src = 'void setup() {\n  int x = 1;\n  if (x) {\n    turnLeft();\n  }\n}\nvoid loop() {}';
    const lines = run(src, world(), { maxLoops: 1 }).events.filter((e) => e.type === 'line').map((e) => e.type === 'line' && e.line);
    expect(lines).toEqual([2, 3, 4]);
  });

  it('highlights a for loop header once per check', () => {
    const src = 'void setup() {\n  for (int i = 0; i < 2; i++) {\n    turnLeft();\n  }\n}\nvoid loop() {}';
    const lines = run(src, world(), { maxLoops: 1 }).events.filter((e) => e.type === 'line').map((e) => e.type === 'line' && e.line);
    expect(lines).toEqual([2, 3, 2, 3, 2]);
  });

  it('can be stopped by the runner at any event', () => {
    // The UI's Stop button calls return() on the generator.
    const c = compile('void setup() {}\nvoid loop() { forward(1); turnLeft(); }');
    if (!c.ok) throw new Error(c.error.message);
    const w = world();
    const gen = runProgram(c.program, w);
    let moves = 0;
    for (let step = gen.next(); !step.done; step = gen.next()) {
      if (step.value.type === 'move' && ++moves === 2) {
        gen.return(undefined as never);
      }
    }
    expect(moves).toBe(2);
    expect(w.pose).toMatchObject({ x: 0, y: 5 }); // forward, turnLeft, forward, then stopped
  });

  it('stops at the total statement cap for headless runs', () => {
    const { result } = run('void setup() { while (true) { turnLeft(); } }\nvoid loop() {}', world(), { maxTotalStatements: 1000 });
    expect(result.status).toBe('step-limit');
  });
});

describe('interpreter: runtime errors', () => {
  it('stops an infinite loop that never moves the robot', () => {
    const src = 'void setup() {\n  int x = 0;\n  while (x < 5) {\n    Serial.print(x);\n  }\n}\nvoid loop() {}';
    expect(runtimeError(src)).toMatch(/^Line [345]: Your loop runs forever without moving the robot\.$/);
  });

  it('does not count separate loop() runs toward the forever-loop limit', () => {
    const body = Array.from({ length: 50 }, () => 'x++;').join(' ');
    const { result } = run(`int x;\nvoid setup() {}\nvoid loop() { ${body} x = 0; }`, world(), { maxLoops: 500 });
    expect(result.status).toBe('loop-limit');
  });

  it('stops runaway recursion', () => {
    expect(runtimeError('void spin() {\n  spin();\n}\nvoid setup() { spin(); }\nvoid loop() {}')).toBe(
      "Line 2: The function 'spin' keeps calling itself.",
    );
  });

  it('rejects forward(0) and negative moves', () => {
    expect(runtimeError(inSetup('forward(0);'))).toBe('Line 2: forward needs a number bigger than 0, but got 0.');
    expect(runtimeError(inSetup('backward(-2);'))).toBe('Line 2: backward needs a number bigger than 0, but got -2.');
  });

  it('rejects negative delays', () => {
    expect(runtimeError(inSetup('delay(-5);'))).toBe('Line 2: delay needs a number 0 or bigger, but got -5.');
  });

  it('rejects dividing by zero', () => {
    expect(runtimeError(inSetup('int z = 0;\nint a = 5 / z;'))).toBe("Line 3: You can't divide by zero.");
    expect(runtimeError(inSetup('int a = 5 % 0;'))).toBe("Line 2: You can't divide by zero.");
  });

  it('rejects reading a local before it has a value', () => {
    expect(runtimeError(inSetup('int steps;\nforward(steps);'))).toBe(
      "Line 3: 'steps' doesn't have a value yet. Give it one when you create it, like int steps = 0;",
    );
    expect(runtimeError(inSetup('int n;\nn++;'))).toBe(
      "Line 3: 'n' doesn't have a value yet. Give it one when you create it, like int n = 0;",
    );
  });

  it('rejects int math that overflows on the Arduino', () => {
    expect(runtimeError(inSetup('delay(1000 * 60);'))).toBe(
      'Line 2: 1000 * 60 makes 60000, which is too big for an int on the Arduino. The limit is 32767.',
    );
    expect(runtimeError(inSetup('int x = 32767;\nx++;'))).toBe(
      'Line 3: 32767 + 1 makes 32768, which is too big for an int on the Arduino. The limit is 32767.',
    );
  });

  it('rejects storing a too-big number in an int', () => {
    expect(runtimeError(inSetup('int x = 40000;'))).toBe(
      "Line 2: 'x' can't hold 40000. On the Arduino, an int only goes up to 32767.",
    );
  });

  it('allows big literals where the Arduino would use a long', () => {
    expect(printOf('delay(60000); Serial.print(40000 + 1);')).toBe('40001');
  });

  it('rejects an int function that ends without returning', () => {
    expect(runtimeError('int f(int n) {\n  if (n > 0) { return 1; }\n}\nvoid setup() { Serial.print(f(0)); }\nvoid loop() {}')).toBe(
      'Line 1: f reached its end without a return. Add a return with a value, like return 0;',
    );
  });
});
