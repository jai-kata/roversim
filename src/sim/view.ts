import { circle, line, rect, rng } from './sketch';
import type { Cell, Dir, Pose, WorldConfig } from './world';

// Draws the world on graph paper and animates the rover. Holds no game
// logic: the interpreter has already decided where the rover ends up.

const ANGLE: Record<Dir, number> = { N: 0, E: Math.PI / 2, S: Math.PI, W: (3 * Math.PI) / 2 };
const ORDER: Dir[] = ['N', 'E', 'S', 'W'];
const DIR_WORDS: Record<Dir, string> = { N: 'up', E: 'right', S: 'down', W: 'left' };
const MARGIN = 16;
const BUMP_FRAMES = [0.12, 0.2, 0.1]; // cells toward the wall

interface Colors {
  paper: string;
  ink: string;
  pencil: string;
  graph: string;
  graphMajor: string;
  highlighter: string;
  redpen: string;
}

export class SimView {
  private ctx: CanvasRenderingContext2D;
  private colors: Colors;
  private cfg!: WorldConfig;
  private rover = { x: 0, y: 0, angle: 0 };
  private dir: Dir = 'N';
  private bump = { x: 0, y: 0 };
  private trail: Cell[] = [];
  private crashAt: { cell: Cell; blocked: Cell } | null = null;
  private success = false;
  private cell = 0;
  private ox = 0;
  private oy = 0;
  private width = 0;
  private height = 0;
  private cancelCurrent: (() => void) | null = null;
  readonly reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  constructor(private canvas: HTMLCanvasElement, box: HTMLElement) {
    this.ctx = canvas.getContext('2d')!;
    const css = getComputedStyle(document.documentElement);
    const v = (name: string) => css.getPropertyValue(name).trim();
    this.colors = {
      paper: v('--paper'), ink: v('--ink'), pencil: v('--pencil'), graph: v('--graph'),
      graphMajor: v('--graph-major'), highlighter: v('--highlighter'), redpen: v('--redpen'),
    };
    // Size once now too: resize callbacks don't fire while a tab is hidden.
    this.resize(box);
    new ResizeObserver(() => this.resize(box)).observe(box);
  }

  load(cfg: WorldConfig): void {
    this.cfg = cfg;
    this.reset();
  }

  reset(): void {
    this.cancel();
    if (!this.cfg) return;
    const s = this.cfg.start;
    this.rover = { x: s.x, y: s.y, angle: ANGLE[s.dir] };
    this.dir = s.dir;
    this.bump = { x: 0, y: 0 };
    this.trail = [{ x: s.x, y: s.y }];
    this.crashAt = null;
    this.success = false;
    this.draw();
  }

  // Finish any running animation instantly.
  cancel(): void {
    this.cancelCurrent?.();
  }

  describe(): string {
    const x = Math.round(this.rover.x);
    const y = Math.round(this.rover.y);
    return `Rover at column ${x + 1}, row ${y + 1}, facing ${DIR_WORDS[this.dir]}.`;
  }

  async move(from: Pose, to: Pose, ms: number): Promise<void> {
    await this.animate(ms, (t) => {
      this.rover.x = from.x + (to.x - from.x) * t;
      this.rover.y = from.y + (to.y - from.y) * t;
    });
    this.trail.push({ x: to.x, y: to.y });
    this.draw();
  }

  async turn(from: Dir, to: Dir, ms: number): Promise<void> {
    const start = this.rover.angle;
    const right = (ORDER.indexOf(to) - ORDER.indexOf(from) + 4) % 4 === 1;
    const end = start + (right ? Math.PI / 2 : -Math.PI / 2);
    this.dir = to;
    await this.animate(ms, (t) => {
      this.rover.angle = start + (end - start) * t;
    });
    this.rover.angle = ((end % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  }

  // A quick bump toward the wall, then a red scribble where it hit.
  async crash(at: Pose, blocked: Cell): Promise<void> {
    const dx = blocked.x - at.x;
    const dy = blocked.y - at.y;
    if (!this.reducedMotion.matches) {
      for (const b of BUMP_FRAMES) {
        this.bump = { x: dx * b, y: dy * b };
        this.draw();
        await this.animate(40, () => {});
      }
    }
    this.bump = { x: 0, y: 0 };
    this.crashAt = { cell: { x: at.x, y: at.y }, blocked };
    this.draw();
  }

  markSuccess(): void {
    this.success = true;
    this.draw();
  }

  // Runs frame(t) for t in [0, 1] over ms. Jumps straight to the end with
  // reduced motion, but still waits so the pace stays the same.
  private animate(ms: number, frame: (t: number) => void): Promise<void> {
    this.cancel();
    return new Promise((resolve) => {
      const start = performance.now();
      let raf = 0;
      let timer = 0;
      const finish = () => {
        cancelAnimationFrame(raf);
        clearTimeout(timer);
        this.cancelCurrent = null;
        frame(1);
        this.draw();
        resolve();
      };
      this.cancelCurrent = finish;
      if (this.reducedMotion.matches || ms <= 0) {
        frame(1);
        this.draw();
        timer = window.setTimeout(finish, ms);
        return;
      }
      const tick = (now: number) => {
        const t = Math.min(1, (now - start) / ms);
        if (t >= 1) return finish();
        frame(t);
        this.draw();
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
      // Browsers pause animation frames in hidden tabs. The timer makes
      // sure the run still moves on instead of waiting forever.
      timer = window.setTimeout(finish, ms + 50);
    });
  }

  private resize(box: HTMLElement): void {
    const dpr = window.devicePixelRatio || 1;
    this.width = box.clientWidth;
    this.height = box.clientHeight;
    this.canvas.style.width = `${this.width}px`;
    this.canvas.style.height = `${this.height}px`;
    this.canvas.width = Math.round(this.width * dpr);
    this.canvas.height = Math.round(this.height * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (this.cfg) this.draw();
  }

  // ---- drawing ----

  private center(c: Cell): [number, number] {
    return [this.ox + (c.x + 0.5) * this.cell, this.oy + (c.y + 0.5) * this.cell];
  }

  draw(): void {
    if (!this.cfg || this.width === 0) return;
    const { ctx, colors: k } = this;
    const { w, h } = this.cfg;
    this.cell = Math.max(4, Math.floor(Math.min((this.width - 2 * MARGIN) / w, (this.height - 2 * MARGIN) / h)));
    this.ox = Math.round((this.width - this.cell * w) / 2);
    this.oy = Math.round((this.height - this.cell * h) / 2);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.fillStyle = k.paper;
    ctx.fillRect(0, 0, this.width, this.height);

    this.drawPaper();
    if (this.success) this.drawTrail(k.highlighter, this.cell * 0.35, false);
    for (const [x, y] of this.cfg.walls) this.drawWall(x, y);
    ctx.strokeStyle = k.pencil;
    ctx.lineWidth = 1.5;
    rect(ctx, this.ox, this.oy, this.cell * w, this.cell * h, rng(99), 1);
    if (this.cfg.goal) this.drawGoal(this.cfg.goal);
    this.cfg.checkpoints.forEach((c, i) => this.drawCheckpoint(c, i + 1));
    if (!this.success) this.drawTrail(k.pencil, 1.5, true);
    if (this.crashAt) this.drawScribble(this.crashAt.cell, this.crashAt.blocked);
    this.drawRover();
  }

  private drawPaper(): void {
    const { ctx, cell, ox, oy } = this;
    const { w, h } = this.cfg;
    const crisp = (v: number) => Math.round(v) + 0.5;
    ctx.lineWidth = 1;
    for (const major of [false, true]) {
      ctx.strokeStyle = major ? this.colors.graphMajor : this.colors.graph;
      ctx.beginPath();
      for (let i = 0; i <= w * 4; i++) {
        if ((i % 4 === 0) !== major) continue;
        const x = crisp(ox + (i * cell) / 4);
        ctx.moveTo(x, oy);
        ctx.lineTo(x, oy + h * cell);
      }
      for (let i = 0; i <= h * 4; i++) {
        if ((i % 4 === 0) !== major) continue;
        const y = crisp(oy + (i * cell) / 4);
        ctx.moveTo(ox, y);
        ctx.lineTo(ox + w * cell, y);
      }
      ctx.stroke();
    }
  }

  private drawWall(x: number, y: number): void {
    const { ctx, cell } = this;
    const px = this.ox + x * cell;
    const py = this.oy + y * cell;
    const r = rng(x, y, 1);
    ctx.save();
    ctx.beginPath();
    ctx.rect(px, py, cell, cell);
    ctx.clip();
    ctx.strokeStyle = this.colors.pencil;
    ctx.lineWidth = 1;
    const gap = cell / 6;
    for (let d = gap / 2; d < cell * 2; d += gap) {
      line(ctx, px + d - cell, py + cell, px + d, py, r, 1.2, 1);
    }
    ctx.restore();
    ctx.strokeStyle = this.colors.pencil;
    ctx.lineWidth = 1.2;
    rect(ctx, px, py, cell, cell, rng(x, y, 2), 1.6);
  }

  private drawGoal(g: Cell): void {
    const { ctx, cell } = this;
    const [cx, cy] = this.center(g);
    const r = rng(g.x, g.y, 3);
    const a = cell * 0.2;
    ctx.strokeStyle = this.colors.ink;
    ctx.lineWidth = 2;
    line(ctx, cx - a, cy - a, cx + a, cy + a, r, 1.5);
    line(ctx, cx + a, cy - a, cx - a, cy + a, r, 1.5);
    circle(ctx, cx, cy, cell * 0.36, r, 2);
  }

  private drawCheckpoint(c: Cell, n: number): void {
    const { ctx, cell } = this;
    const [cx, cy] = this.center(c);
    ctx.strokeStyle = this.colors.pencil;
    ctx.fillStyle = this.colors.pencil;
    ctx.lineWidth = 1.2;
    circle(ctx, cx, cy, cell * 0.28, rng(c.x, c.y, 4), 1.5);
    ctx.font = `${Math.round(cell * 0.3)}px Arial, Helvetica, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(n), cx, cy + 1);
  }

  // Polyline through visited cells to the rover. The pencil version fades
  // out toward the start.
  private drawTrail(color: string, width: number, fade: boolean): void {
    const { ctx } = this;
    const pts = this.trail.map((c) => this.center(c));
    const [rx, ry] = this.center(this.rover);
    const last = pts[pts.length - 1];
    if (!last || last[0] !== rx || last[1] !== ry) pts.push([rx, ry]);
    if (pts.length < 2) return;
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    for (let i = 1; i < pts.length; i++) {
      const age = pts.length - 1 - i;
      ctx.globalAlpha = fade ? Math.max(0.25, 1 - age * 0.06) : 1;
      ctx.beginPath();
      ctx.moveTo(pts[i - 1][0], pts[i - 1][1]);
      ctx.lineTo(pts[i][0], pts[i][1]);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  private drawScribble(at: Cell, blocked: Cell): void {
    const { ctx, cell } = this;
    const [cx, cy] = this.center(at);
    const dx = blocked.x - at.x;
    const dy = blocked.y - at.y;
    const ex = cx + dx * cell * 0.5;
    const ey = cy + dy * cell * 0.5;
    const r = rng(blocked.x, blocked.y, 5);
    ctx.strokeStyle = this.colors.redpen;
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i <= 7; i++) {
      const along = (i / 7 - 0.5) * cell * 0.6;
      const across = (i % 2 ? 1 : -1) * cell * 0.07 + (r() - 0.5) * 2;
      const px = ex + dy * along + dx * across;
      const py = ey + dx * along + dy * across;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();
  }

  private drawRover(): void {
    const { ctx, cell: s } = this;
    const [cx, cy] = this.center({ x: this.rover.x + this.bump.x, y: this.rover.y + this.bump.y });
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(this.rover.angle);
    // Paper-colored fill so whatever is underneath (the X, the trail)
    // doesn't show through and turn the rover into a scribble.
    ctx.fillStyle = this.colors.paper;
    ctx.fillRect(-0.24 * s, -0.33 * s, 0.48 * s, 0.66 * s);
    ctx.fillRect(-0.4 * s, -0.27 * s, 0.11 * s, 0.54 * s);
    ctx.fillRect(0.29 * s, -0.27 * s, 0.11 * s, 0.54 * s);
    ctx.strokeStyle = this.colors.ink;
    ctx.lineWidth = 2;
    const j = 0.8;
    rect(ctx, -0.24 * s, -0.33 * s, 0.48 * s, 0.66 * s, rng(7, 1), j); // body
    rect(ctx, -0.4 * s, -0.27 * s, 0.11 * s, 0.54 * s, rng(7, 2), j); // left wheel
    rect(ctx, 0.29 * s, -0.27 * s, 0.11 * s, 0.54 * s, rng(7, 3), j); // right wheel
    const r = rng(7, 4);
    line(ctx, 0, -0.24 * s, -0.13 * s, -0.04 * s, r, j); // front triangle
    line(ctx, -0.13 * s, -0.04 * s, 0.13 * s, -0.04 * s, r, j);
    line(ctx, 0.13 * s, -0.04 * s, 0, -0.24 * s, r, j);
    ctx.restore();
  }
}
