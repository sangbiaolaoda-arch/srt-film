// canvas 特效层：只做 SVG 做不好的事 —— 上千对象、像素级混合、3D 投影、递归嵌套。
// 全部是「给定 (t, seed) 必然输出同一画面」的纯过程（导出可复现）。

import { mulberry32 } from "../core/rng";

export interface FxOpts {
  w: number;
  h: number;
  /** 拍内秒数 */
  t: number;
  /** 该拍总时长（秒），用于归一化进度 */
  dur: number;
  seed: number;
  accent: string;
  ink: string;
  dim: string;
}

interface Particle {
  ox: number;
  oy: number; // 起始（相对中心的归一化坐标）
  tx: number;
  ty: number; // 目标
  size: number;
  delay: number;
  tone: number; // 0..1 决定用 accent 还是 ink
  spin: number;
}

const cache = new Map<string, Particle[]>();

function buildParticles(key: string, seed: number, count: number, layout: "ring" | "grid" | "scatter"): Particle[] {
  const hit = cache.get(key);
  if (hit) return hit;
  const rnd = mulberry32(seed);
  const list: Particle[] = [];
  for (let i = 0; i < count; i++) {
    let tx: number;
    let ty: number;
    if (layout === "ring") {
      const a = (i / count) * Math.PI * 2;
      const rr = 0.34 + 0.1 * Math.sin(i * 2.399);
      tx = Math.cos(a) * rr;
      ty = Math.sin(a) * rr * 0.62;
    } else if (layout === "grid") {
      const cols = Math.ceil(Math.sqrt(count));
      const c = i % cols;
      const r = Math.floor(i / cols);
      tx = (c / (cols - 1) - 0.5) * 0.72;
      ty = (r / (cols - 1) - 0.5) * 0.6;
    } else {
      tx = (rnd() - 0.5) * 0.86;
      ty = (rnd() - 0.5) * 0.7;
    }
    const a0 = rnd() * Math.PI * 2;
    const r0 = 0.75 + rnd() * 0.7;
    list.push({
      ox: Math.cos(a0) * r0,
      oy: Math.sin(a0) * r0 * 0.7,
      tx,
      ty,
      size: 2.8 + rnd() * 5.6,
      delay: (i / count) * 0.42 + rnd() * 0.2,
      tone: rnd(),
      spin: 0.4 + rnd() * 1.6,
    });
  }
  cache.set(key, list);
  return list;
}

function mix(a: string, b: string, t: number): string {
  // 极简 linear-GB 插值：输入为 #rrggbb
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  const out = pa.map((v, i) => Math.round(v + ((pb[i] ?? v) - v) * t));
  return `rgb(${out.join(",")})`;
}

const easeOutQuint = (x: number): number => 1 - Math.pow(1 - x, 5);
const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);

/**
 * ① 粒子场。
 * converge —— 从四周汇聚到位（弧线入位）
 * vortex   —— 绕中心旋转的漩涡
 * burst    —— 从中心炸散
 */
export function particleField(ctx: CanvasRenderingContext2D, o: FxOpts, mode: "converge" | "vortex" | "burst", count = 420): void {
  const layout = mode === "converge" ? "ring" : mode === "burst" ? "scatter" : "grid";
  const parts = buildParticles(`${o.seed}:${count}:${layout}`, o.seed, count, layout);
  const cx = o.w / 2;
  const cy = o.h / 2;
  const scale = Math.min(o.w, o.h);
  const p = clamp01(o.t / Math.max(o.dur, 0.001));

  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (const pt of parts) {
    let x: number;
    let y: number;
    let alpha: number;

    if (mode === "vortex") {
      const a = o.t * 1.4 * pt.spin + Math.atan2(pt.ty, pt.tx);
      const rr = (0.16 + 0.36 * (0.5 + 0.5 * Math.sin(o.t * 1.6 + pt.spin * 3))) * (0.6 + 0.4 * p);
      x = cx + Math.cos(a) * rr * scale;
      y = cy + Math.sin(a * 1.15) * rr * scale * 0.8;
      alpha = 0.5 + 0.45 * (0.5 + 0.5 * Math.sin(o.t * 3 + pt.spin * 2));
    } else {
      const q = clamp01((p - pt.delay) / 0.55);
      const e = easeOutQuint(q);
      if (mode === "converge") {
        const arc = Math.sin(q * Math.PI) * 0.24 * (pt.ox > 0 ? 1 : -1);
        x = cx + (pt.ox + (pt.tx - pt.ox) * e) * scale * 0.8;
        y = cy + (pt.oy + (pt.ty - pt.oy) * e + arc) * scale * 0.8;
      } else {
        const k = 1 + easeOutQuint(p) * 2.2;
        x = cx + pt.tx * scale * k;
        y = cy + pt.ty * scale * k;
      }
      alpha = Math.min(1, q * 2) * (mode === "burst" ? 1 - p * 0.85 : 1);
    }

    if (alpha <= 0.02) continue;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = pt.tone > 0.72 ? o.accent : pt.tone > 0.4 ? mix(o.dim, o.accent, 0.35) : o.ink;
    const s = pt.size * (mode === "burst" ? 1 - p * 0.5 : 1);
    ctx.beginPath();
    ctx.arc(x, y, Math.max(0.4, s), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** ② 发光叠加：中心脉冲光 + 边缘辉光，用 lighter 叠在已有画面上。 */
export function glowPulse(ctx: CanvasRenderingContext2D, o: FxOpts, strength = 0.5): void {
  const p = clamp01(o.t / Math.max(o.dur, 0.001));
  const pulse = 0.5 + 0.5 * Math.sin(o.t * 3.4);
  const fade = Math.sin(p * Math.PI); // 进出都收，避免硬边
  const cx = o.w / 2;
  const cy = o.h / 2;
  const r = Math.min(o.w, o.h) * 0.72;

  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
  g.addColorStop(0, `rgba(255,250,235,${0.16 * strength * fade * (0.6 + pulse * 0.4)})`);
  g.addColorStop(0.26, hexToRgba(o.accent, 0.22 * strength * fade));
  g.addColorStop(1, hexToRgba(o.accent, 0));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, o.w, o.h);
  ctx.restore();
}

/** ③ 3D 投影：正二十面体线框（旋转矩阵 + 透视除 + 按边长连边）。 */
export function polyhedron(ctx: CanvasRenderingContext2D, o: FxOpts, radius = 0.26): void {
  const phi = (1 + Math.sqrt(5)) / 2;
  const V: [number, number, number][] = [
    [-1, phi, 0], [1, phi, 0], [-1, -phi, 0], [1, -phi, 0],
    [0, -1, phi], [0, 1, phi], [0, -1, -phi], [0, 1, -phi],
    [phi, 0, -1], [phi, 0, 1], [-phi, 0, -1], [-phi, 0, 1],
  ];
  const p = clamp01(o.t / Math.max(o.dur, 0.001));
  const rx = o.t * 0.9;
  const ry = o.t * 1.2;
  const R = Math.min(o.w, o.h) * radius * (1 + Math.sin(p * Math.PI) * 0.22);
  const depth = 3.6;

  const proj = V.map((v) => {
    const y1 = v[1] * Math.cos(rx) - v[2] * Math.sin(rx);
    const z1 = v[1] * Math.sin(rx) + v[2] * Math.cos(rx);
    const x2 = v[0] * Math.cos(ry) + z1 * Math.sin(ry);
    const z2 = -v[0] * Math.sin(ry) + z1 * Math.cos(ry);
    const s = R / (depth + z2 * 0.5);
    return { x: x2 * s, y: y1 * s, z: z2 };
  });

  ctx.save();
  ctx.translate(o.w / 2, o.h / 2);
  ctx.globalCompositeOperation = "lighter";
  ctx.lineWidth = 1.6;
  for (let i = 0; i < V.length; i++) {
    for (let j = i + 1; j < V.length; j++) {
      const a = V[i]!;
      const b = V[j]!;
      const d = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
      if (d > 2.3) continue;
      const depthFade = 0.25 + 0.55 * clamp01((1.6 - (proj[i]!.z + proj[j]!.z) / 2) / 3.2);
      ctx.globalAlpha = depthFade * clamp01(o.t / 0.5);
      ctx.strokeStyle = mix(o.dim, o.accent, depthFade);
      ctx.beginPath();
      ctx.moveTo(proj[i]!.x, proj[i]!.y);
      ctx.lineTo(proj[j]!.x, proj[j]!.y);
      ctx.stroke();
    }
  }
  ctx.globalAlpha = clamp01(o.t / 0.5);
  for (const q of proj) {
    ctx.fillStyle = o.accent;
    ctx.beginPath();
    ctx.arc(q.x, q.y, 3.2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/**
 * ④ 无限嵌套：同心方框隧道，逐层推进。Z = zoom^f 的指数式穿越。
 * 每层带一圈描边，越深处越淡 —— 做出「一直往里走」的错觉。
 */
export function nestedTunnel(ctx: CanvasRenderingContext2D, o: FxOpts, zoom = 2.4, layers = 9): void {
  const cx = o.w / 2;
  const cy = o.h / 2;
  const base = Math.min(o.w, o.h) * 0.62;
  const travel = (o.t / Math.max(o.dur, 0.001)) * 1.2;

  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (let i = layers; i >= 0; i--) {
    const z = Math.pow(zoom, i - travel - layers);
    const size = base * z * Math.pow(zoom, layers);
    if (size < 6 || size > Math.max(o.w, o.h) * 3) continue;
    const fade = clamp01(1 - i / layers) * 0.55;
    const rot = travel * 0.5 + i * 0.06;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rot);
    ctx.globalAlpha = fade;
    ctx.strokeStyle = i % 3 === 0 ? o.accent : o.dim;
    ctx.lineWidth = Math.max(1, size * 0.006);
    const half = size / 2;
    ctx.strokeRect(-half, -half * 0.62, size, size * 0.62);
    ctx.restore();
  }
  ctx.restore();
}

export function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}
