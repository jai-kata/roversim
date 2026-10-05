// Hand-drawn lines. Each shape gets its own seeded random generator so the
// wobble is identical every frame; re-randomizing would flicker.

export type Rng = () => number;

export function rng(...seed: number[]): Rng {
  let a = seed.reduce((h, n) => Math.imul(h ^ (n | 0), 2654435761) + 0x9e3779b9, 0x2545f491) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// A line drawn in 2 slightly offset passes, each bowed a little.
export function line(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, r: Rng, jitter = 1, passes = 2): void {
  const len = Math.hypot(x2 - x1, y2 - y1) || 1;
  const nx = -(y2 - y1) / len;
  const ny = (x2 - x1) / len;
  const j = () => (r() - 0.5) * 2 * jitter;
  ctx.beginPath();
  for (let p = 0; p < passes; p++) {
    const bow = (r() - 0.5) * Math.min(len * 0.05, jitter * 3);
    const mx = (x1 + x2) / 2 + nx * bow;
    const my = (y1 + y2) / 2 + ny * bow;
    ctx.moveTo(x1 + j(), y1 + j());
    ctx.quadraticCurveTo(mx, my, x2 + j(), y2 + j());
  }
  ctx.stroke();
}

export function rect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: Rng, jitter = 1): void {
  line(ctx, x, y, x + w, y, r, jitter);
  line(ctx, x + w, y, x + w, y + h, r, jitter);
  line(ctx, x + w, y + h, x, y + h, r, jitter);
  line(ctx, x, y + h, x, y, r, jitter);
}

// A circle that doesn't quite close on itself, like one drawn by hand.
export function circle(ctx: CanvasRenderingContext2D, cx: number, cy: number, radius: number, r: Rng, jitter = 1): void {
  const start = r() * Math.PI * 2;
  const sweep = Math.PI * 2 + 0.3 + r() * 0.3;
  const wobble = [r(), r(), r()].map((v) => (v - 0.5) * jitter * 1.5);
  ctx.beginPath();
  for (let i = 0; i <= 40; i++) {
    const a = start + (sweep * i) / 40;
    const rad = radius + wobble[0] * Math.sin(a * 2) + wobble[1] * Math.cos(a * 3) + wobble[2] * (i / 40);
    const px = cx + Math.cos(a) * rad;
    const py = cy + Math.sin(a) * rad;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.stroke();
}
