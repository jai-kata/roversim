// Run a sketch headlessly and print what happened.
//
//   npm run try -- examples/square.ino
//   npm run try -- examples/square.ino --trace          (every event)
//   npm run try -- my.ino --goal 1,3 --walls 2,2;3,3    (custom map)
//
// The default map is an open 8x8 grid with the rover at (1,6) facing north.
import { readFileSync } from 'node:fs';
import { compile, runProgram } from '../src/lang';
import { World, type Cell } from '../src/sim/world';

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--') && !/^\d/.test(a));
if (!file) {
  console.log('Usage: npm run try -- <sketch.ino> [--trace] [--goal x,y] [--walls x,y;x,y] [--loops n]');
  process.exit(1);
}
const flag = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? null : args[i + 1];
};
const cell = (s: string): Cell => {
  const [x, y] = s.split(',').map(Number);
  return { x, y };
};

const source = readFileSync(file, 'utf8');
const c = compile(source);
for (const w of c.warnings) console.log(`warning  ${w.message}`);
if (!c.ok) {
  console.log(`error    ${c.error.message}`);
  if (c.error.line !== null) console.log(`         > ${source.split('\n')[c.error.line - 1].trim()}`);
  process.exit(1);
}

const goal = flag('goal');
const walls = flag('walls');
const world = new World({
  w: 8,
  h: 8,
  start: { x: 1, y: 6, dir: 'N' },
  goal: goal ? cell(goal) : null,
  walls: walls ? walls.split(';').map((s) => { const p = cell(s); return [p.x, p.y] as [number, number]; }) : [],
  checkpoints: [],
});

const trace = args.includes('--trace');
const gen = runProgram(c.program, world, { maxLoops: Number(flag('loops') ?? 500) });
let output = '';
let step = gen.next();
while (!step.done) {
  const e = step.value;
  if (e.type === 'print') output += e.text;
  if (trace) {
    const { type, ...rest } = e;
    console.log(`${type.padEnd(10)} ${JSON.stringify(rest)}`);
  }
  step = gen.next();
}

if (output) console.log(`--- Serial Monitor ---\n${output.replace(/\n$/, '')}\n----------------------`);
const r = step.value;
console.log(`result   ${r.status}${r.error ? `: ${r.error.message}` : ''} (loop() ran ${r.loops} times)`);
console.log(`rover    at (${world.pose.x},${world.pose.y}) facing ${world.pose.dir}`);
