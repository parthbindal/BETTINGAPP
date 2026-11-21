"use client";

import { useEffect, useId, useRef, useSyncExternalStore } from "react";
import { cn } from "@/lib/utils";

/**
 * The EDGEWISE mark, assembled from particles.
 *
 * Sequence: loose dust drifts together into a turning sphere of electric-blue,
 * cyan and violet particles; the sphere unravels into the mark (outer nodes
 * first, then the six signals from the outside in, the core last); the core
 * ignites and a cyan sweep crosses the symbol. Afterwards the mark idles:
 * signals keep streaming inward and the core breathes.
 *
 * Viewers who prefer reduced motion get the static vector mark instead. The
 * loop pauses whenever the canvas is off screen or the tab is hidden.
 */

// Mark geometry in a 120 x 120 design space centred on (60, 60): six signals
// run from outer nodes toward one core. Shared with the static fallback.
const VECTORS: ReadonlyArray<readonly [number, number, number, number]> = [
  [106, 60, 75, 60],
  [83, 20.2, 68.5, 44.5],
  [37, 20.2, 51.5, 44.5],
  [14, 60, 45, 60],
  [37, 99.8, 51.5, 75.5],
  [83, 99.8, 68.5, 75.5],
];
const CORE_HALF = 17.7; // half-diagonal of the core diamond
const RING_R = 48;

// Brand palette: electric blue, cyan, violet, core white.
const PALETTE = ["#168BFF", "#42E8FF", "#815BFF", "#EAF6FF"] as const;
type Hue = 0 | 1 | 2 | 3;

// Timeline, in milliseconds of animation time.
const GATHER_MS = 950; // dust drifts together into the sphere
const SPHERE_MS = 1900; // the sphere turns until the flow begins
const FORM_MS = 1900; // window in which particles flow into the mark
const FLOW_MS = 1100; // one particle's own travel time
const FORMED_AT = SPHERE_MS + FORM_MS;
const IGNITE_MS = 950;
const SWEEP_EVERY_MS = 5600;
const SWEEP_MS = 1500;
const SIGNAL_MS = 2300; // one signal's trip along a vector

interface Particle {
  tx: number; // home in the mark, design units
  ty: number;
  sx: number; // home on the unit sphere
  sy: number;
  sz: number;
  qx: number; // scattered starting point, -1..1 of the box
  qy: number;
  delay: number; // 0..1 stagger across the formation window
  swirl: number; // signed curvature of the flow path, design units
  hue: Hue;
  size: number; // glow radius, design units
  alpha: number;
  phase: number;
  core: boolean;
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;
const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

/** Small seeded generator so the cloud looks the same on every load. */
function seeded(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildParticles(density: number): Particle[] {
  const rand = seeded(20261117);
  const n = (k: number) => Math.max(4, Math.round(k * density));
  const out: Particle[] = [];
  const add = (p: Pick<Particle, "tx" | "ty" | "delay" | "hue" | "size" | "alpha" | "core">) =>
    out.push({ ...p, sx: 0, sy: 0, sz: 0, qx: rand() * 2 - 1, qy: rand() * 2 - 1, swirl: (rand() - 0.5) * 34, phase: rand() * Math.PI * 2 });

  for (const [x1, y1, x2, y2] of VECTORS) {
    const len = Math.hypot(x2 - x1, y2 - y1);
    const nx = -(y2 - y1) / len;
    const ny = (x2 - x1) / len;
    const count = n(64);
    for (let i = 0; i < count; i++) {
      const t = i / (count - 1);
      const j = (rand() - 0.5) * 1.5;
      add({ tx: x1 + (x2 - x1) * t + nx * j, ty: y1 + (y2 - y1) * t + ny * j, delay: 0.12 + t * 0.4 + rand() * 0.06, hue: t < 0.45 ? 0 : 2, size: 0.55 + rand() * 0.3, alpha: 0.45 + t * 0.35, core: false });
    }
    for (let i = 0; i < n(18); i++) {
      const a = rand() * Math.PI * 2;
      const r = Math.sqrt(rand()) * 2;
      add({ tx: x1 + Math.cos(a) * r, ty: y1 + Math.sin(a) * r, delay: rand() * 0.12, hue: 1, size: 0.5 + rand() * 0.35, alpha: 0.8, core: false });
    }
  }

  // The core is a lit diamond: the fill stays inside the edge so its glow does
  // not blur the shape, and a crisp outline of particles defines the diamond.
  const fillHalf = CORE_HALF * 0.9;
  for (let i = 0; i < n(190); i++) {
    let dx = 0;
    let dy = 0;
    do {
      dx = (rand() * 2 - 1) * fillHalf;
      dy = (rand() * 2 - 1) * fillHalf;
    } while (Math.abs(dx) + Math.abs(dy) > fillHalf);
    const d = (Math.abs(dx) + Math.abs(dy)) / fillHalf; // 0 centre .. 1 edge
    add({ tx: 60 + dx, ty: 60 + dy, delay: 0.62 + rand() * 0.22 + (1 - d) * 0.16, hue: d < 0.3 ? 3 : 2, size: 0.35 + rand() * 0.25 + (1 - d) * 0.35, alpha: 0.2 + (1 - d) * 0.32, core: true });
  }
  const edge = n(26);
  const corners: ReadonlyArray<readonly [number, number]> = [
    [CORE_HALF, 0],
    [0, CORE_HALF],
    [-CORE_HALF, 0],
    [0, -CORE_HALF],
  ];
  for (let c = 0; c < 4; c++) {
    const [ax, ay] = corners[c]!;
    const [bx, by] = corners[(c + 1) % 4]!;
    for (let i = 0; i < edge; i++) {
      const t = i / edge;
      add({ tx: 60 + ax + (bx - ax) * t, ty: 60 + ay + (by - ay) * t, delay: 0.58 + rand() * 0.14, hue: 2, size: 0.42, alpha: 0.78, core: true });
    }
  }

  const ringN = n(110);
  for (let i = 0; i < ringN; i++) {
    const a = (i / ringN) * Math.PI * 2;
    add({ tx: 60 + Math.cos(a) * RING_R, ty: 60 + Math.sin(a) * RING_R, delay: rand() * 0.3, hue: 0, size: 0.4, alpha: 0.2, core: false });
  }

  // Give every particle a home on a Fibonacci sphere, shuffled so the flow
  // from sphere to mark reads as organic rather than in bands.
  const golden = Math.PI * (3 - Math.sqrt(5));
  const order = out.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [order[i], order[j]] = [order[j]!, order[i]!];
  }
  const total = out.length;
  order.forEach((k, i) => {
    const y = 1 - (i / (total - 1)) * 2;
    const r = Math.sqrt(1 - y * y);
    const th = i * golden;
    const p = out[k]!;
    p.sx = Math.cos(th) * r;
    p.sy = y;
    p.sz = Math.sin(th) * r;
  });
  return out;
}

function makeSprite(hex: string): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 64;
  const g = c.getContext("2d");
  if (!g) return c;
  const v = parseInt(hex.slice(1), 16);
  const rgb = `${v >> 16},${(v >> 8) & 255},${v & 255}`;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, `rgba(${rgb},1)`);
  grad.addColorStop(0.24, `rgba(${rgb},0.95)`);
  grad.addColorStop(0.5, `rgba(${rgb},0.3)`);
  grad.addColorStop(1, `rgba(${rgb},0)`);
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return c;
}

function draw(ctx: CanvasRenderingContext2D, ps: Particle[], sprites: HTMLCanvasElement[], T: number, css: number, dpr: number) {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, css, css);
  ctx.globalCompositeOperation = "lighter";

  const k = (css * 0.9) / 120; // design units to CSS pixels
  const off = (css - 120 * k) / 2;
  const c = css / 2;
  const R = css * 0.33;

  const ay = T * 0.00055;
  const tilt = 0.42;
  const cosY = Math.cos(ay);
  const sinY = Math.sin(ay);
  const cosT = Math.cos(tilt);
  const sinT = Math.sin(tilt);

  const gather = easeOutCubic(clamp01(T / GATHER_MS));
  const since = T - FORMED_AT;
  const formed = since >= 0;
  const settle = formed ? clamp01(since / 700) : 0;
  const ignite = formed ? clamp01(since / IGNITE_MS) : 0;
  const breathe = Math.sin(T * 0.0019);

  let sweepX = Number.NEGATIVE_INFINITY;
  if (since > 350) {
    const s = (since - 350) % SWEEP_EVERY_MS;
    if (s < SWEEP_MS) sweepX = -20 + (s / SWEEP_MS) * 160;
  }

  const sprite = (hue: Hue, x: number, y: number, r: number, a: number) => {
    if (a <= 0.004 || r <= 0) return;
    const w = r * 5.5;
    ctx.globalAlpha = a > 1 ? 1 : a;
    ctx.drawImage(sprites[hue]!, x - w / 2, y - w / 2, w, w);
  };

  for (const p of ps) {
    // Sphere home, turned and projected with a little perspective.
    const x0 = p.sx * cosY + p.sz * sinY;
    const z0 = -p.sx * sinY + p.sz * cosY;
    const y1 = p.sy * cosT - z0 * sinT;
    const z1 = p.sy * sinT + z0 * cosT;
    const persp = 1 / (1 - z1 * 0.3);
    const depth = (z1 + 1) / 2;
    const qx = c + p.qx * css * 0.55;
    const qy = c + p.qy * css * 0.55;
    const spx = qx + (c + x0 * R * persp - qx) * gather;
    const spy = qy + (c + y1 * R * persp - qy) * gather;
    const sphereA = p.alpha * (0.3 + depth * 0.7) * (0.2 + gather * 0.8);
    const sphereR = p.size * k * (0.65 + depth * 0.55);

    // Home in the mark, with a faint shimmer once it has formed.
    const jit = 0.35 * settle;
    const hx = off + (p.tx + Math.sin(T * 0.0011 + p.phase) * jit) * k;
    const hy = off + (p.ty + Math.cos(T * 0.0013 + p.phase * 1.3) * jit) * k;

    const begin = SPHERE_MS + p.delay * (FORM_MS - FLOW_MS);
    const u = clamp01((T - begin) / FLOW_MS);
    let x = spx;
    let y = spy;
    let a = sphereA;
    let r = sphereR;
    if (u > 0) {
      const e = easeInOutCubic(u);
      const dx = hx - spx;
      const dy = hy - spy;
      const len = Math.hypot(dx, dy) || 1;
      const bend = Math.sin(Math.PI * e) * p.swirl * k;
      x = spx + dx * e - (dy / len) * bend;
      y = spy + dy * e + (dx / len) * bend;
      a = sphereA + (p.alpha - sphereA) * e;
      r = sphereR + (p.size * k - sphereR) * e;
    }
    if (p.core && formed) {
      a *= 1 + (1 - ignite) * (1 - ignite) * 1.1 + breathe * 0.1 * settle;
      r *= 1 + breathe * 0.06 * settle;
    }
    sprite(p.hue, x, y, r, a);
    if (u >= 1) {
      const b = 1 - Math.abs(p.tx - sweepX) / 10;
      if (b > 0) sprite(1, x, y, r * 1.5, b * 0.5);
    }
  }

  if (formed) {
    const cx = off + 60 * k;
    const cy = off + 60 * k;
    sprite(2, cx, cy, 9 * k, (0.1 + 0.04 * breathe) * settle);
    if (ignite < 1) sprite(3, cx, cy, (3 + 9 * ignite) * k, (1 - ignite) ** 2 * 0.65);
    VECTORS.forEach(([x1, y1, x2, y2], i) => {
      for (let j = 0; j < 2; j++) {
        const t = (since / SIGNAL_MS + i / 6 + j / 2) % 1;
        const fade = Math.sin(Math.PI * t) * settle;
        sprite(1, off + (x1 + (x2 - x1) * t) * k, off + (y1 + (y2 - y1) * t) * k, 1.05 * k, 0.85 * fade);
      }
    });
  }

  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
}

function subscribeReducedMotion(onChange: () => void) {
  const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}
const prefersReducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const noReducedMotionOnServer = () => false;

/** The static vector mark: used for reduced motion and wherever no animation is wanted. */
export function StaticMark({ className }: { className?: string }) {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  return (
    <svg viewBox="0 0 120 120" fill="none" className={className} role="img" aria-label="EDGEWISE logo">
      <defs>
        <radialGradient id={`${id}core`} cx="50%" cy="44%" r="62%">
          <stop offset="0%" stopColor="#EAF6FF" />
          <stop offset="38%" stopColor="#42E8FF" />
          <stop offset="100%" stopColor="#815BFF" />
        </radialGradient>
        <linearGradient id={`${id}vec`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#168BFF" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#815BFF" />
        </linearGradient>
      </defs>
      <circle cx="60" cy="60" r={RING_R} stroke="rgba(22,139,255,0.16)" strokeWidth="1" />
      <g stroke={`url(#${id}vec)`} strokeWidth="2.8" strokeLinecap="round">
        {VECTORS.map(([x1, y1, x2, y2]) => (
          <line key={`${x1}-${y1}`} x1={x1} y1={y1} x2={x2} y2={y2} />
        ))}
      </g>
      <g fill="#42E8FF">
        {VECTORS.map(([x1, y1]) => (
          <circle key={`${x1}-${y1}`} cx={x1} cy={y1} r="2.6" />
        ))}
      </g>
      <rect x="47.5" y="47.5" width="25" height="25" rx="5" transform="rotate(45 60 60)" fill={`url(#${id}core)`} />
      <circle cx="60" cy="60" r="2.8" fill="#EAF6FF" />
    </svg>
  );
}

export function ParticleLogo({ className }: { className?: string }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const reduced = useSyncExternalStore(subscribeReducedMotion, prefersReducedMotion, noReducedMotionOnServer);

  useEffect(() => {
    if (reduced) return;
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !wrap || !ctx) return;

    const sprites = PALETTE.map(makeSprite);
    let css = wrap.clientWidth || 360;
    let dpr = Math.min(window.devicePixelRatio || 1, 2);
    const particles = buildParticles(css < 300 ? 0.55 : css < 380 ? 0.75 : 1);
    let raf = 0;
    let last = 0;
    let elapsed = 0;
    let running = false;
    let onScreen = true;

    const resize = () => {
      css = wrap.clientWidth || css;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(css * dpr);
      canvas.height = Math.round(css * dpr);
    };
    const frame = (now: number) => {
      if (!running) return;
      const dt = last ? Math.min(50, now - last) : 16;
      last = now;
      elapsed += dt;
      draw(ctx, particles, sprites, elapsed, css, dpr);
      raf = requestAnimationFrame(frame);
    };
    const start = () => {
      if (running || !onScreen || document.hidden) return;
      running = true;
      last = 0;
      raf = requestAnimationFrame(frame);
    };
    const stop = () => {
      running = false;
      cancelAnimationFrame(raf);
    };

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);
    const io = new IntersectionObserver(
      (entries) => {
        onScreen = entries.some((e) => e.isIntersecting);
        if (onScreen) start();
        else stop();
      },
      { threshold: 0.01 },
    );
    io.observe(wrap);
    const onVisibility = () => (document.hidden ? stop() : start());
    document.addEventListener("visibilitychange", onVisibility);
    start();

    return () => {
      stop();
      ro.disconnect();
      io.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [reduced]);

  return (
    <div ref={wrapRef} className={cn("relative aspect-square", className)}>
      {reduced ? (
        <StaticMark className="absolute inset-[5%] size-[90%] drop-shadow-[0_0_24px_rgba(22,139,255,0.35)]" />
      ) : (
        <canvas ref={canvasRef} className="absolute inset-0 size-full" role="img" aria-label="EDGEWISE logo: six market signals converging on one point" />
      )}
    </div>
  );
}
