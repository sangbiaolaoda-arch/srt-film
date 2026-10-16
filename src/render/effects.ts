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
  /**
   * 底色是否亮色。三系底色（#f2ede4 / #fbf7f0 / #ffffff）**全都是亮的**，
   * 而 lighter「加光」在亮底上叠深色 = 零增量、叠近白 = 还是白 —— 实测带 fx 的
   * 板（旧 catalog 50 个 P() + v2 四套）在成片里看不到任何特效，用户评「敷衍」。
   * 亮底改走正常混合 + 深色/彩色 tone：把粒子读作「纸上的墨点/浮尘」而不是「光」。
   */
  onLight: boolean;
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
  ctx.globalCompositeOperation = o.onLight ? "source-over" : "lighter";
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
    // 亮底上深色点的视觉重量远大于暗底上的光点，同 alpha 会过火 —— 压到一半。
    ctx.globalAlpha = o.onLight ? alpha * 0.5 : alpha;
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
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
  if (o.onLight) {
    // 亮底上「加光」不成立：底色已接近白，叠暖白仍是白、叠深色则变脏。
    // 改读作「纸上晕开的一团色」—— 仍是中心浓、边缘收，但走正常混合。
    ctx.globalCompositeOperation = "source-over";
    g.addColorStop(0, hexToRgba(o.accent, 0.1 * strength * fade * (0.65 + pulse * 0.35)));
    g.addColorStop(0.45, hexToRgba(o.accent, 0.045 * strength * fade));
    g.addColorStop(1, hexToRgba(o.accent, 0));
  } else {
    ctx.globalCompositeOperation = "lighter";
    g.addColorStop(0, `rgba(255,250,235,${0.16 * strength * fade * (0.6 + pulse * 0.4)})`);
    g.addColorStop(0.26, hexToRgba(o.accent, 0.22 * strength * fade));
    g.addColorStop(1, hexToRgba(o.accent, 0));
  }
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
  ctx.globalCompositeOperation = o.onLight ? "source-over" : "lighter";
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
  ctx.globalCompositeOperation = o.onLight ? "source-over" : "lighter";
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

/**
 * ⑤ 浮尘漂移：亮底上的微粒缓漂 —— 编辑风的「纸面浮尘」、扁平风的「色粉颗粒」。
 *
 * 与粒子场的分工：粒子场是**叙事**的（汇聚/漩涡/炸散，有起点有终点，配「变化」的拍）；
 * 浮尘是**背景**的 —— 不汇聚不旋转，只缓慢上浮 + 横向摆动，像空气里悬着的尘。
 * 画面主体完全不受干扰，素底上只多一层呼吸。这是编辑风唯一拿得出手的动效语言：
 * 它克制到「不细看会以为画面是静的」，但两块画面并排时立刻能看出差别。
 *
 * 位置是 t 的**纯函数**（上浮用取模循环，不是逐帧累加），所以 seek 到任意时刻都可复现。
 */
export function driftMotes(ctx: CanvasRenderingContext2D, o: FxOpts, count = 96, strength = 1): void {
  const p = clamp01(o.t / Math.max(o.dur, 0.001));
  const fade = Math.sin(p * Math.PI); // 进出都收，跨拍不硬边
  if (fade <= 0.02) return;
  const rnd = mulberry32(o.seed ^ 0x51ed270b);
  const scale = o.w / 1280;
  const k = clamp01(strength);

  ctx.save();
  ctx.globalCompositeOperation = "source-over";
  for (let i = 0; i < count; i++) {
    const x0 = rnd();
    const y0 = rnd();
    const r = 0.55 + rnd() * 1.3;
    const phase = rnd() * Math.PI * 2;
    const rise = 0.012 + rnd() * 0.05; // 归一化高度/秒
    const sway = 0.004 + rnd() * 0.014;
    const tone = rnd();
    const y = (((y0 - o.t * rise) % 1) + 1) % 1;
    const x = (x0 + Math.sin(o.t * 0.32 + phase) * sway) * o.w;
    // 峰值（单点对比度）才是浮尘的可见性指标：它是稀疏小点，均差天然很低（0.05% 面积覆盖）。
    // 系数按「dim 在纸白上约 104 级色差 × alpha」反推 —— 目标峰值 30 上下：看得出来，但不抢字。
    ctx.globalAlpha = (0.35 + r * 0.25) * fade * k;
    ctx.fillStyle = tone > 0.86 ? o.accent : tone > 0.62 ? o.dim : o.ink;
    ctx.beginPath();
    ctx.arc(x, y * o.h, r * scale, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/**
 * ⑥ 网格脉冲：一条扫描带自上而下扫过，带内的横网格线依次被点亮，像仪器逐行采样。
 *
 * 步长与板内自绘网格同为 40px，所以亮的线正好落在**既有**网格上 —— 读作网格在呼吸，
 * 而不是又多了一层网格（图表风最忌讳给测量画面加装饰）。
 *
 * 早先画的是「交点脉冲」（波前上的格点变亮），A/B 实测运动量 0.010 —— 百来个 1.5px
 * 的点只覆盖 0.08% 画面，等于没有。**线才是网格的本体**，也让「大面积低对比」成立。
 */
export function gridPulse(ctx: CanvasRenderingContext2D, o: FxOpts, step = 40, strength = 1): void {
  const p = clamp01(o.t / Math.max(o.dur, 0.001));
  const fade = Math.sin(p * Math.PI);
  if (fade <= 0.02) return;
  const s = o.w / 1280;
  const stepPx = step * s;
  const k = clamp01(strength);
  const front = (-0.15 + p * 1.3) * o.h;
  const band = o.h * 0.22; // 带内约 8 条横线

  ctx.save();
  ctx.globalCompositeOperation = "source-over";
  ctx.strokeStyle = o.accent;
  for (let y = stepPx / 2; y < o.h; y += stepPx) {
    const d = Math.abs(y - front) / band;
    if (d >= 1) continue;
    ctx.globalAlpha = (1 - d) * (1 - d) * 0.55 * fade * k;
    ctx.lineWidth = Math.max(1, 1.3 * s);
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(o.w, y);
    ctx.stroke();
  }
  // 扫描头：一条比网格更亮的线，让「正在扫」有明确的当前位置。
  if (front > -2 && front < o.h + 2) {
    ctx.globalAlpha = 0.5 * fade * k;
    ctx.lineWidth = Math.max(1.4, 2.2 * s);
    ctx.beginPath();
    ctx.moveTo(0, front);
    ctx.lineTo(o.w, front);
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * ⑦ 纸面掠光：一条极淡的斜向色带缓慢掠过画面，像纸在光下被翻动时的那道反光。
 *
 * 为什么编辑风需要它：浮尘（drift-motes）是**稀疏小点** —— 覆盖不到 0.1% 的画面，
 * 峰值再高也只是「几个灰点」，单帧看不出、成片里也看不出。实测过：把浮尘的峰值从
 * 14 拉到 66（26% 对比度），开/关两帧并排仍然肉眼无差。
 * 掠光是**大面积低对比**：覆盖两成画面、带内色差只有几级 —— 一眼能看到「有东西掠过」，
 * 又不脏不抢字。「克制」的正确解法是大面积 + 低对比，不是小面积 + 高对比。
 */
export function paperSheen(ctx: CanvasRenderingContext2D, o: FxOpts, strength = 1): void {
  const p = clamp01(o.t / Math.max(o.dur, 0.001));
  const fade = Math.sin(p * Math.PI);
  if (fade <= 0.02) return;
  const diag = Math.hypot(o.w, o.h);
  const half = diag * 0.14; // 带宽约 0.28×对角 → 覆盖两成上下画面
  const nx = Math.cos(-0.52);
  const ny = Math.sin(-0.52);
  const cx = o.w * (-0.2 + p * 1.4);
  const cy = o.h * (-0.15 + p * 1.3);
  ctx.save();
  ctx.globalCompositeOperation = "source-over";
  const g = ctx.createLinearGradient(cx - nx * half, cy - ny * half, cx + nx * half, cy + ny * half);
  g.addColorStop(0, hexToRgba(o.accent, 0));
  g.addColorStop(0.5, hexToRgba(o.accent, 0.075 * strength * fade));
  g.addColorStop(1, hexToRgba(o.accent, 0));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, o.w, o.h);
  ctx.restore();
}

/** 文字避让矩形（画布像素）。由 frame.ts 从版式的文字槽算出。 */
export interface TextKeepout {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * 把文字矩形从**特效层**里羽化擦掉。
 *
 * 为什么需要它：fx 层在内容之上（Phase 9 的定位 —— 「镜头前的空气」，画在 SVG 之下
 * 会被满版板整个盖住）。但粒子是**深色实心点**：飘到字上就把笔画戳出一个个洞，
 * 实测 v2-strata 的 headline 矩形内 5% 的像素被改了 8 级以上、最狠一处改了 93 级
 * —— 底衬修的是「字压在色带上」，颗粒是另一层，底衬挡不住。
 *
 * 为什么用「羽化衰减」而不是 clip 或跳过：clip 出的是硬边，粒子会被切成半圆，
 * 一眼假；跳过会让粒子在文字边缘凭空消失。羽化 = 靠近字就淡出；再留一点残留，
 * 文字区不出现「干净的洞」。羽化半径跟着画面尺寸走（1280 宽时 16px，导出 1920 时 24px）。
 *
 * 衰减强度由调用方按 fx 类型给：实心粒子（戳洞元凶）重擦 0.9，雾状层
 * （glow / paper-sheen / grid-pulse，本就无害的大面积低对比）轻擦 0.6 ——
 * 统一用一个强度，要么雾状层被削太狠、要么粒子残留太多，两头不讨好。
 *
 * 调用方必须先在一块**离屏**画布上画特效 —— 在主画布上直接 destination-out
 * 会把底下的 SVG 内容一起擦掉。
 */
export function maskOutText(ctx: CanvasRenderingContext2D, rects: readonly TextKeepout[], w: number, erase = 0.9): void {
  if (rects.length === 0) return;
  ctx.save();
  ctx.globalCompositeOperation = "destination-out";
  ctx.filter = `blur(${Math.round(w / 80)}px)`;
  // 擦 90% 而不是 100%：粒子场常以画面中心为家（converge 的环正好落在横贯全幅的
  // 文字槽矩形里），全擦会把整幅氛围一起擦没（实测 beat1 全画面 fx 贡献 2.157 →
  // 0.526，目视橙/蓝带上干干净净）。留 10% —— 粒子改动最狠 115 级亮度 × 0.1 = 12，
  // 远低于可读性阈值 25，字保得住；氛围也在。
  ctx.fillStyle = `rgba(0,0,0,${erase})`;
  for (const r of rects) ctx.fillRect(r.x, r.y, r.w, r.h);
  ctx.restore();
}

export function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}
