import './style.css';
import { createEditor } from './editor';
import type { Program, RunResult } from './lang';
import { analyze, loopIsEmpty, missingRequirements, type Requirement } from './lang/analysis';
import { LEVELS, passesAllVariants, worldFor, type Level, type LevelVariant } from './levels';
import { renderReference } from './reference';
import { Runner, type RunnerState } from './runner';
import { SerialMonitor } from './serial';
import { SimView } from './sim/view';
import type { World } from './sim/world';
import { storage } from './storage';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const levelSelect = $<HTMLSelectElement>('level');
const canvas = $<HTMLCanvasElement>('sim');
const buttons = {
  run: $<HTMLButtonElement>('run'),
  step: $<HTMLButtonElement>('step'),
  stop: $<HTMLButtonElement>('stop'),
  reset: $<HTMLButtonElement>('reset'),
  resetCode: $<HTMLButtonElement>('reset-code'),
};
const speedInput = $<HTMLInputElement>('speed');
const speedOut = $<HTMLOutputElement>('speed-out');

const REQUIREMENT_MESSAGES: Record<Requirement, string> = {
  variable: 'Made it, but this level wants you to use a variable, like int legs = 2; and then forward(legs);',
  for: 'Made it, but this level wants you to use a for loop.',
  while: 'Made it, but this level wants you to use a while loop.',
  if: 'Made it, but this level wants you to use an if.',
  function: 'Made it, but this level wants you to write and use your own function.',
  returns: 'Made it, but this level wants you to use a function that gives back a value, like leftIsOpen().',
};

storage.migrate();
let level: Level = LEVELS.find((l) => l.id === storage.lastLevel()) ?? LEVELS[0];
let variant: LevelVariant = level.variants[0];
let world: World | null = null; // the one being run, to see which circles it reached

const serial = new SerialMonitor($('serial'));
const view = new SimView(canvas, $('sim-box'));

let saveTimer = 0;
const editor = createEditor($('editor'), '', {
  onRun: () => runner.run(),
  onChange: () => {
    if (runner.state === 'running' || runner.state === 'paused') runner.stop('Stopped because the code changed.');
    const id = level.id;
    const code = editor.getCode();
    clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => storage.saveCode(id, code), 300);
  },
});

const speed = () => 2 ** Number(speedInput.value);

const runner = new Runner({
  editor,
  view,
  serial,
  speed,
  // Every run shows a random version of the map.
  prepare: () => {
    variant = level.variants[Math.floor(Math.random() * level.variants.length)];
    view.load(mapOf(variant));
  },
  newWorld: () => (world = worldFor(level, variant)),
  onState: updateButtons,
  onFinish: showResult,
});

function mapOf(v: LevelVariant) {
  return { w: level.grid.w, h: level.grid.h, ...v };
}

function updateButtons(state: RunnerState): void {
  buttons.run.disabled = state === 'running';
  buttons.stop.disabled = state === 'idle' || state === 'done';
  if (state === 'idle') describe('');
}

function describe(result: string): void {
  canvas.setAttribute('aria-label', `Simulator. ${view.describe()}${result ? ' ' + result : ''}`);
}

function showResult(result: RunResult, program: Program): void {
  let message: string;
  let kind: 'result' | 'error' = 'result';
  switch (result.status) {
    case 'goal':
      view.markSuccess();
      message = judgeSuccess(program);
      break;
    case 'crash':
    case 'error':
      message = result.error!.message;
      kind = 'error';
      editor.showError(result.error!);
      break;
    default: {
      const hasGoal = variant.goal !== null;
      const nextCircle = world?.nextCheckpoint ?? 0;
      if (hasGoal && result.passedGoal) {
        message = "The rover drove over the X but didn't stop on it.";
      } else if (hasGoal && nextCircle < variant.checkpoints.length) {
        message = `The X only counts after the circles, and the rover hasn't been to circle ${nextCircle + 1}.`;
      } else if (loopIsEmpty(program)) {
        message = hasGoal ? "The code finished, but the rover didn't reach the X." : 'The code finished.';
      } else {
        message = hasGoal
          ? `loop() ran ${result.loops} times and the rover never reached the X.`
          : `loop() ran ${result.loops} times, so the simulator stopped.`;
      }
    }
  }
  serial.note(message, kind);
  describe(message);
}

// The rover reached the goal on the map shown. Check the level's rules.
function judgeSuccess(program: Program): string {
  if (level.variants.length > 1 && !passesAllVariants(program, level)) {
    return 'It worked this time, but the map changes. Can your code handle any version?';
  }
  const missing = missingRequirements(program, level.requires);
  if (missing.length > 0) return REQUIREMENT_MESSAGES[missing[0]];
  const n = analyze(program).commands;
  if (level.maxCommands !== null && n > level.maxCommands) {
    return `Made it, but you used ${n} commands. This level wants ${level.maxCommands} or fewer.`;
  }
  storage.markDone(level.id);
  fillLevelSelect();
  return `Made it. You used ${n} command${n === 1 ? '' : 's'}.`;
}

function fillLevelSelect(): void {
  levelSelect.replaceChildren(
    ...LEVELS.map((l) => new Option(`${l.id}. ${l.title}${storage.isDone(l.id) ? ' (done)' : ''}`, String(l.id))),
  );
  levelSelect.value = String(level.id);
}

// After level 7 the instructions stop introducing commands, so the
// Commands list opens by itself the first time someone gets there.
const FIRST_HARD_LEVEL = 8;
const commands = $<HTMLDetailsElement>('commands');
renderReference($('commands-list'));
document.addEventListener('click', (e) => {
  // Picking level 8 from the menu opens the list, so that click doesn't close it.
  const t = e.target as Node;
  if (commands.open && !commands.contains(t) && t !== levelSelect) commands.open = false;
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && commands.open) {
    commands.open = false;
    commands.querySelector('summary')!.focus();
  }
});

function loadLevel(l: Level): void {
  clearTimeout(saveTimer);
  level = l;
  variant = l.variants[0];
  storage.setLastLevel(l.id);
  $('level-title').textContent = `${l.id}. ${l.title}`;
  $('level-text').textContent = l.instructions;
  const note = $('level-note');
  note.textContent = l.note ?? '';
  note.hidden = !l.note;
  $('level-hint').textContent = l.hint;
  if (l.id >= FIRST_HARD_LEVEL && !storage.commandsShown()) {
    storage.markCommandsShown();
    commands.open = true;
  }
  view.load(mapOf(variant));
  runner.reset();
  editor.load(storage.code(l.id) ?? l.starterCode);
  serial.clear();
  levelSelect.value = String(l.id);
  describe('');
}

levelSelect.addEventListener('change', () => {
  const l = LEVELS.find((x) => String(x.id) === levelSelect.value);
  if (l) loadLevel(l);
});

buttons.run.addEventListener('click', () => runner.run());
buttons.step.addEventListener('click', () => runner.step());
buttons.stop.addEventListener('click', () => runner.stop());
buttons.reset.addEventListener('click', () => {
  runner.reset();
  describe('');
});
buttons.resetCode.addEventListener('click', () => {
  runner.reset();
  editor.replace(level.starterCode);
  editor.showError(null);
  storage.clearCode(level.id);
  clearTimeout(saveTimer);
  serial.clear();
  serial.note('Code reset to the start of this level. Ctrl+Z brings yours back.', 'result');
});

const showSpeed = () => {
  speedOut.value = `${speed()}x`;
};
speedInput.addEventListener('input', showSpeed);
showSpeed();

// Ctrl+Enter runs from anywhere on the page. The editor handles its own.
document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && !e.defaultPrevented) {
    e.preventDefault();
    runner.run();
  }
});

fillLevelSelect();
loadLevel(level);
