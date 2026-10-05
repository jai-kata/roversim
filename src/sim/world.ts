// Headless grid world. The interpreter drives it synchronously; the canvas
// (Phase 2) only animates the events the interpreter yields.

export type Dir = 'N' | 'E' | 'S' | 'W';

export interface Cell {
  x: number;
  y: number;
}

export interface Pose extends Cell {
  dir: Dir;
}

export interface WorldConfig {
  w: number;
  h: number;
  start: Pose;
  goal: Cell | null;
  walls: [number, number][];
  checkpoints: Cell[]; // must be visited in order before the goal counts
}

export interface StepResult {
  from: Pose;
  to: Pose;
  crashed: boolean;
  blocked: Cell | null; // the wall or off-grid cell the rover hit
  checkpoint: number | null; // index of the checkpoint just reached
  onGoal: boolean; // standing on the goal with every checkpoint done
}

const DELTA: Record<Dir, Cell> = { N: { x: 0, y: -1 }, E: { x: 1, y: 0 }, S: { x: 0, y: 1 }, W: { x: -1, y: 0 } };
const ORDER: Dir[] = ['N', 'E', 'S', 'W'];

export class World {
  readonly w: number;
  readonly h: number;
  readonly goal: Cell | null;
  readonly checkpoints: Cell[];
  private walls: Set<string>;
  pose: Pose;
  nextCheckpoint = 0;
  trail: Cell[];

  constructor(readonly config: WorldConfig) {
    this.w = config.w;
    this.h = config.h;
    this.goal = config.goal;
    this.checkpoints = config.checkpoints;
    this.walls = new Set(config.walls.map(([x, y]) => `${x},${y}`));
    this.pose = { ...config.start };
    this.trail = [{ x: config.start.x, y: config.start.y }];
  }

  isBlocked(x: number, y: number): boolean {
    return x < 0 || y < 0 || x >= this.w || y >= this.h || this.walls.has(`${x},${y}`);
  }

  // Move one cell forward (+1) or backward (-1).
  step(sign: 1 | -1): StepResult {
    const from = { ...this.pose };
    const d = DELTA[from.dir];
    const x = from.x + d.x * sign;
    const y = from.y + d.y * sign;
    if (this.isBlocked(x, y)) {
      return { from, to: from, crashed: true, blocked: { x, y }, checkpoint: null, onGoal: false };
    }
    this.pose = { x, y, dir: from.dir };
    this.trail.push({ x, y });

    let checkpoint: number | null = null;
    const cp = this.checkpoints[this.nextCheckpoint];
    if (cp && cp.x === x && cp.y === y) {
      checkpoint = this.nextCheckpoint;
      this.nextCheckpoint++;
    }
    const onGoal = !!this.goal && this.goal.x === x && this.goal.y === y && this.nextCheckpoint === this.checkpoints.length;
    return { from, to: { ...this.pose }, crashed: false, blocked: null, checkpoint, onGoal };
  }

  turn(side: 'left' | 'right'): { from: Dir; to: Dir } {
    const from = this.pose.dir;
    const i = ORDER.indexOf(from);
    const to = ORDER[(i + (side === 'right' ? 1 : 3)) % 4];
    this.pose = { ...this.pose, dir: to };
    return { from, to };
  }

  // Empty cells before the next wall or edge. 0 means blocked right ahead.
  distanceAhead(): number {
    const d = DELTA[this.pose.dir];
    let n = 0;
    let { x, y } = this.pose;
    for (;;) {
      x += d.x;
      y += d.y;
      if (this.isBlocked(x, y)) return n;
      n++;
    }
  }
}
