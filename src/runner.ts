import type { Editor } from './editor';
import { compile, runProgram, type Program, type RunEvent, type RunResult } from './lang';
import type { SerialMonitor } from './serial';
import type { SimView } from './sim/view';
import type { World } from './sim/world';

// Feeds interpreter events to the editor, simulator, and Serial Monitor,
// waiting for each animation so the highlighted line matches the rover.

export type RunnerState = 'idle' | 'running' | 'paused' | 'done';

// Durations at 1x speed.
const MOVE_MS = 450;
const TURN_MS = 350;
const LINE_MS = 150;
// After this many statements in a row without the rover moving, stop
// pausing on each line. Otherwise an endless loop would take minutes to
// reach the "runs forever" check.
const SLOW_IDLE_LINES = 40;
const BATCH = 500; // events per frame while fast-forwarding

export interface RunnerHooks {
  editor: Editor;
  view: SimView;
  serial: SerialMonitor;
  speed: () => number;
  prepare: () => void; // called once the code compiles, before a run starts
  newWorld: () => World;
  onState: (state: RunnerState) => void;
  onFinish: (result: RunResult, program: Program) => void;
}

export class Runner {
  state: RunnerState = 'idle';
  private gen: Generator<RunEvent, RunResult, void> | null = null;
  private program: Program | null = null;
  private stepping = false;
  private runId = 0;
  private wake: (() => void) | null = null;
  private idleLines = 0;

  constructor(private h: RunnerHooks) {}

  run(): void {
    if (this.state === 'running') {
      this.stepping = false;
      return;
    }
    if (this.state === 'paused') {
      this.stepping = false;
      this.resume();
      return;
    }
    this.start(false);
  }

  // One statement at a time. While running, Step pauses at the next line.
  step(): void {
    if (this.state === 'running') {
      this.stepping = true;
      return;
    }
    if (this.state === 'paused') {
      this.stepping = true;
      this.resume();
      return;
    }
    this.start(true);
  }

  stop(message = 'Stopped.'): void {
    if (this.state !== 'running' && this.state !== 'paused') return;
    this.end();
    this.h.editor.highlightLine(null);
    this.h.serial.note(message, 'result');
    this.setState('done');
  }

  reset(): void {
    this.end();
    this.h.view.reset();
    this.h.editor.highlightLine(null);
    this.setState('idle');
  }

  private start(stepping: boolean): void {
    this.end();
    const { editor, serial, view } = this.h;
    serial.clear();
    editor.showError(null);
    editor.highlightLine(null);
    view.reset();

    const c = compile(editor.getCode());
    for (const w of c.warnings) serial.note(w.message, 'warning');
    if (!c.ok) {
      serial.note(c.error.message, 'error');
      editor.showError(c.error);
      this.setState('done');
      return;
    }
    this.program = c.program;
    this.h.prepare();
    this.gen = runProgram(c.program, this.h.newWorld());
    this.stepping = stepping;
    this.idleLines = 0;
    this.resume();
  }

  private resume(): void {
    this.setState('running');
    void this.pump(this.runId);
  }

  // Cancel whatever is running: generator, animation, and any wait.
  private end(): void {
    this.runId++;
    this.gen?.return(undefined as never);
    this.gen = null;
    this.h.view.cancel();
    this.wake?.();
  }

  private setState(s: RunnerState): void {
    this.state = s;
    this.h.onState(s);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
      const timer = window.setTimeout(done, ms);
      const self = this;
      function done() {
        clearTimeout(timer);
        if (self.wake === done) self.wake = null;
        resolve();
      }
      this.wake = done;
    });
  }

  private async pump(id: number): Promise<void> {
    const { editor, view, serial } = this.h;
    let batch = 0;
    while (id === this.runId && this.gen) {
      const step = this.gen.next();
      if (step.done) {
        this.finish(step.value);
        return;
      }
      const e = step.value;
      const speed = this.h.speed();

      switch (e.type) {
        case 'line':
          this.idleLines++;
          if (this.stepping) {
            editor.highlightLine(e.line);
            this.setState('paused');
            return;
          }
          if (this.idleLines <= SLOW_IDLE_LINES) {
            editor.highlightLine(e.line);
            await this.sleep(LINE_MS / speed);
          } else if (++batch >= BATCH) {
            batch = 0;
            editor.highlightLine(e.line);
            await this.sleep(0);
          }
          break;
        case 'move':
          this.idleLines = 0;
          if (e.crashed && e.blocked) await view.crash(e.from, e.blocked);
          else await view.move(e.from, e.to, MOVE_MS / speed);
          break;
        case 'turn':
          this.idleLines = 0;
          await view.turn(e.from, e.to, TURN_MS / speed);
          break;
        case 'print':
          serial.write(e.text);
          break;
        case 'delay':
          await this.sleep(e.ms / speed);
          break;
        case 'checkpoint':
          break;
      }
    }
  }

  private finish(result: RunResult): void {
    this.gen = null;
    this.h.editor.highlightLine(null);
    this.setState('done');
    this.h.onFinish(result, this.program!);
  }
}
