// 数据图表模块（Phase 6）：20 种图表全部吃 profile token，不写死颜色。
//
// 两条硬规则：
// 1. 比例准确 —— 原始值（可能是 120、3.2 这种量级）一律先 min-max 归一再映射到
//    绘图区。直接拿原始值乘槽高会把柱子画出画布（修于 2026-10-15）。
// 2. 标签可读且不误导 —— 只有比例语义直白的图（line / bar / area / histogram）
//    在图表风（profile.axis）下标注坐标轴与数值；累积类（waterfall / stack）与
//    变换类（multi-line / candle）的刻度不是原始值域，标了等于说谎，不标。

import type { StyleProfile } from "../styles/style-system";

export type ChartKind =
  | "line-up" | "line-down" | "line-multi" | "bar-v" | "bar-h" | "bar-stack"
  | "bar-group" | "area" | "pie" | "donut" | "scatter" | "bubble"
  | "waterfall" | "candle" | "heatmap" | "radar" | "gauge" | "histogram";

export interface ChartProps {
  kind: ChartKind;
  w: number;
  h: number;
  seed?: number;
  tone?: "ink" | "accent";
  values?: number[];
  /** 风格档：色板与图形语法（轴 / 等宽数字）的唯一来源 */
  profile: StyleProfile;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (Math.imul(t ^ (t >>> 7), 61 | t) ^ t) >>> 0;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gen(seed: number, n: number, lo = 0, hi = 1): number[] {
  const r = mulberry32(seed);
  const a: number[] = [];
  for (let i = 0; i < n; i++) a.push(lo + (hi - lo) * r());
  return a;
}

function pick(values: number[] | undefined, seed: number, n: number, lo = 0, hi = 1): number[] {
  if (values && values.length) {
    const a = values.slice(0, n);
    const r = mulberry32(seed + 97);
    while (a.length < n) a.push(lo + (hi - lo) * r());
    return a;
  }
  return gen(seed, n, lo, hi);
}

interface Ctx {
  w: number; h: number; seed: number;
  main: string; accent: string; soft: string; soft2: string;
  /** 图表风：画基准轴 + 刻度/柱值标签（等宽数字） */
  axis: boolean; fontNum: string;
  values?: number[];
}
interface Box { x0: number; y0: number; iw: number; ih: number; }

function box(c: Ctx): Box {
  return { x0: c.w * 0.08, y0: c.h * 0.08, iw: c.w * 0.84, ih: c.h * 0.84 };
}

function extent(a: number[]): [number, number] {
  let lo = a[0]!;
  let hi = a[0]!;
  for (const v of a) { if (v < lo) lo = v; if (v > hi) hi = v; }
  return [lo, hi];
}

/** min-max 归一：[0..1 比例值, lo, hi]。span=0（全部等值）时归 1 画平线。 */
function scale(a: number[]): [number[], number, number] {
  const [lo, hi] = extent(a);
  const span = hi - lo || 1;
  return [a.map((v) => (v - lo) / span), lo, hi];
}

/** #rrggbb → rgba()：把 ink 调成两档浅色（网格线、弱填充、刻度字）。 */
function alpha(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

/** 刻度/柱值标签的数字格式：整数原样，小数一位（不多位浮点噪声）。 */
function fmt(v: number): string {
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}

/** 轴标签字号：随图高缩放在 10..15px，槽位再小也保可读下限。 */
function tickFs(b: Box): number {
  return Math.max(10, Math.min(15, b.ih * 0.055));
}

function linePath(pts: Array<[number, number]>): string {
  return pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(2)} ${p[1].toFixed(2)}`).join(" ");
}

function arcD(cx: number, cy: number, r: number, a0: number, a1: number): string {
  const x1 = cx + r * Math.cos(a0), y1 = cy + r * Math.sin(a0);
  const x2 = cx + r * Math.cos(a1), y2 = cy + r * Math.sin(a1);
  const big = a1 - a0 > Math.PI ? 1 : 0;
  return `M${x1.toFixed(2)} ${y1.toFixed(2)} A${r.toFixed(2)} ${r.toFixed(2)} 0 ${big} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
}

function sectorD(cx: number, cy: number, r: number, a0: number, a1: number): string {
  const x1 = cx + r * Math.cos(a0), y1 = cy + r * Math.sin(a0);
  const x2 = cx + r * Math.cos(a1), y2 = cy + r * Math.sin(a1);
  const big = a1 - a0 > Math.PI ? 1 : 0;
  return `M${cx} ${cy} L${x1.toFixed(2)} ${y1.toFixed(2)} A${r.toFixed(2)} ${r.toFixed(2)} 0 ${big} 1 ${x2.toFixed(2)} ${y2.toFixed(2)} Z`;
}

/**
 * 基准坐标轴 + 三档刻度（hi/mid/lo 真实值，等宽字体）—— 图表风的「数据感」签名。
 * 只由比例语义直白的图调用（见文件头规则 2）。
 */
function axisTicks(c: Ctx, b: Box, lo: number, hi: number): JSX.Element {
  const fs = tickFs(b);
  const mid = (lo + hi) / 2;
  return (
    <g fontFamily={c.fontNum} fontSize={fs} fill={c.soft2}>
      <line x1={b.x0} y1={b.y0 + b.ih} x2={b.x0 + b.iw} y2={b.y0 + b.ih} stroke={c.soft2} strokeWidth={1} />
      {[hi, mid, lo].map((v, i) => (
        <g key={i}>
          {i > 0 && <line x1={b.x0} y1={b.y0 + b.ih * (i / 2)} x2={b.x0 + b.iw} y2={b.y0 + b.ih * (i / 2)} stroke={c.soft} strokeWidth={1} />}
          <text x={b.x0 - 8} y={b.y0 + b.ih * (i / 2) + fs * 0.35} textAnchor="end">{fmt(v)}</text>
        </g>
      ))}
    </g>
  );
}

function lineChart(c: Ctx, dir: 1 | -1): JSX.Element {
  const n = 8;
  const b = box(c);
  const r = mulberry32(c.seed);
  const raw = c.values && c.values.length >= 2
    ? c.values.slice(0, n)
    : Array.from({ length: n }, (_, i) =>
        0.12 + (dir === 1 ? i / (n - 1) : 1 - i / (n - 1)) * 0.72 + (r() - 0.5) * 0.16);
  const m = raw.length;
  const [nv, lo, hi] = scale(raw);
  const pts: Array<[number, number]> = nv.map((v, i) => [
    b.x0 + (b.iw * i) / (m - 1),
    b.y0 + b.ih - v * b.ih,
  ]);
  const last = pts[pts.length - 1]!;
  return (
    <g>
      {c.axis && axisTicks(c, b, lo, hi)}
      <path d={linePath(pts)} fill="none" stroke={c.main} strokeWidth={2} strokeLinejoin="round" />
      {pts.slice(0, -1).map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r={3} fill={c.main} />)}
      <circle cx={last[0]} cy={last[1]} r={5} fill={c.accent} />
      {c.axis && (
        <text x={last[0]} y={last[1] - 10} fontSize={tickFs(b)} fill={c.accent} fontFamily={c.fontNum} textAnchor="end" fontWeight={700}>
          {fmt(raw[m - 1]!)}
        </text>
      )}
    </g>
  );
}

function multiLine(c: Ctx): JSX.Element {
  const n = 8;
  const b = box(c);
  const op = [1, 0.24, 0.12];
  const groups = [0, 1, 2].map((k) => {
    const r = mulberry32(c.seed + k * 31);
    return c.values && c.values.length >= n
      ? c.values.slice(0, n).map((v, i) => Math.max(0.05, Math.min(0.95, v * (0.7 + k * 0.15) + (r() - 0.5) * 0.12)))
      : Array.from({ length: n }, (_, i) => 0.15 + (i / (n - 1)) * 0.65 + (r() - 0.5) * 0.2);
  });
  const [lo, hi] = extent(groups.flat());
  return (
    <g fill="none">
      {groups.map((raw, k) => {
        const pts: Array<[number, number]> = raw.map((v, i) => [
          b.x0 + (b.iw * i) / (n - 1),
          b.y0 + b.ih - ((v - lo) / (hi - lo || 1)) * b.ih,
        ]);
        return <path key={k} d={linePath(pts)} stroke={c.main} strokeOpacity={op[k]} strokeWidth={k === 0 ? 2 : 1.5} strokeLinejoin="round" />;
      })}
    </g>
  );
}

function barV(c: Ctx): JSX.Element {
  const n = 7;
  const b = box(c);
  const raw = pick(c.values, c.seed, n, 0.15, 0.95);
  const [nv, lo, hi] = scale(raw);
  const slot = b.iw / n, bw = slot * 0.6;
  const fs = tickFs(b);
  return (
    <g>
      {c.axis && axisTicks(c, b, lo, hi)}
      {nv.map((v, i) => (
        <rect key={i} x={b.x0 + slot * i + (slot - bw) / 2} y={b.y0 + b.ih - v * b.ih} width={bw} height={v * b.ih} fill={c.main} />
      ))}
      {c.axis && nv.map((v, i) => (
        <text key={`v${i}`} x={b.x0 + slot * i + slot / 2} y={b.y0 + b.ih - v * b.ih - 6} fontSize={fs} fill={c.soft2} fontFamily={c.fontNum} textAnchor="middle">{fmt(raw[i]!)}</text>
      ))}
    </g>
  );
}

function barH(c: Ctx): JSX.Element {
  const n = 5;
  const b = box(c);
  const raw = pick(c.values, c.seed, n, 0.2, 0.95);
  const [nv] = scale(raw);
  const label = b.iw * 0.3, avail = b.iw - label;
  const rowH = b.ih / n, bh = rowH * 0.55;
  const fs = tickFs(b);
  return (
    <g>
      {nv.map((v, i) => (
        <rect key={i} x={b.x0 + label} y={b.y0 + rowH * i + (rowH - bh) / 2} width={avail * v} height={bh} fill={c.main} />
      ))}
      {c.axis && nv.map((v, i) => (
        <text key={`v${i}`} x={b.x0 + label + avail * v + 6} y={b.y0 + rowH * i + rowH / 2 + fs * 0.35} fontSize={fs} fill={c.soft2} fontFamily={c.fontNum}>{fmt(raw[i]!)}</text>
      ))}
    </g>
  );
}

function barStack(c: Ctx): JSX.Element {
  const g = 4, s = 3;
  const b = box(c);
  const flat = pick(c.values, c.seed, g * s, 0.2, 1);
  const op = [1, 0.24, 0.12];
  const slot = b.iw / g, bw = slot * 0.56;
  return (
    <g>
      {Array.from({ length: g }, (_, i) => {
        const seg: [number, number, number] = [flat[i * s]!, flat[i * s + 1]!, flat[i * s + 2]!];
        const sum = seg[0] + seg[1] + seg[2] || 1;
        const x = b.x0 + slot * i + (slot - bw) / 2;
        let yTop = b.y0 + b.ih;
        return (
          <g key={i}>
            {seg.map((v, k) => {
              const hh = (v / sum) * b.ih;
              yTop -= hh;
              return <rect key={k} x={x} y={yTop} width={bw} height={hh} fill={c.main} fillOpacity={op[k]} />;
            })}
          </g>
        );
      })}
    </g>
  );
}

function barGroup(c: Ctx): JSX.Element {
  const g = 4, per = 2;
  const b = box(c);
  const raw = pick(c.values, c.seed, g * per, 0.15, 0.95);
  const [nv] = scale(raw);
  const op = [1, 0.24];
  const slot = b.iw / g, gap = slot * 0.12, bw = (slot - gap * 3) / per;
  return (
    <g>
      {Array.from({ length: g }, (_, i) => (
        <g key={i}>
          {Array.from({ length: per }, (_, k) => {
            const v = nv[i * per + k]!;
            return <rect key={k} x={b.x0 + slot * i + gap * (k + 1) + bw * k} y={b.y0 + b.ih - v * b.ih} width={bw} height={v * b.ih} fill={c.main} fillOpacity={op[k]} />;
          })}
        </g>
      ))}
    </g>
  );
}

function areaChart(c: Ctx): JSX.Element {
  const n = 7;
  const b = box(c);
  const raw = c.values && c.values.length >= 2 ? c.values.slice(0, n) : gen(c.seed, n, 0.2, 0.9);
  const m = raw.length;
  const [nv, lo, hi] = scale(raw);
  const pts: Array<[number, number]> = nv.map((v, i) => [
    b.x0 + (b.iw * i) / (m - 1),
    b.y0 + b.ih - v * b.ih,
  ]);
  const gid = `grad-${c.seed}-${Math.round(c.w)}-${Math.round(c.h)}`;
  const d = linePath(pts);
  const filled = `${d} L${(b.x0 + b.iw).toFixed(2)} ${(b.y0 + b.ih).toFixed(2)} L${b.x0.toFixed(2)} ${(b.y0 + b.ih).toFixed(2)} Z`;
  return (
    <g>
      {c.axis && axisTicks(c, b, lo, hi)}
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={c.main} stopOpacity={0.24} />
          <stop offset="1" stopColor={c.main} stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={filled} fill={`url(#${gid})`} stroke="none" />
      <path d={d} fill="none" stroke={c.main} strokeWidth={2} strokeLinejoin="round" />
    </g>
  );
}

function pie(c: Ctx): JSX.Element {
  const b = box(c);
  const cx = c.w / 2, cy = c.h / 2;
  const r = Math.min(b.iw, b.ih) / 2;
  const vals = pick(c.values, c.seed, 4, 0.4, 1);
  const sum = vals.reduce((a, v) => a + v, 0) || 1;
  const fills = [c.main, c.soft2, c.soft, c.accent];
  let a0 = -Math.PI / 2;
  return (
    <g>
      {vals.map((v, i) => {
        const a1 = a0 + (v / sum) * Math.PI * 2;
        const el = <path key={i} d={sectorD(cx, cy, r, a0, a1)} fill={fills[i]} />;
        a0 = a1;
        return el;
      })}
    </g>
  );
}

function donut(c: Ctx): JSX.Element {
  const b = box(c);
  const cx = c.w / 2, cy = c.h / 2;
  const r = Math.min(b.iw, b.ih) / 2;
  const rw = r * 0.34, rr = r - rw / 2;
  const t = c.values && c.values.length
    ? Math.max(0, Math.min(1, c.values[0]!))
    : 0.35 + mulberry32(c.seed)() * 0.45;
  const a0 = -Math.PI / 2;
  return (
    <g>
      <circle cx={cx} cy={cy} r={rr} fill="none" stroke={c.soft} strokeWidth={rw} />
      <path d={arcD(cx, cy, rr, a0, a0 + t * Math.PI * 2)} fill="none" stroke={c.accent} strokeWidth={rw} strokeLinecap="round" />
    </g>
  );
}

function scatter(c: Ctx): JSX.Element {
  const n = 20;
  const b = box(c);
  const [nxs] = scale(gen(c.seed, n, 0, 1));
  const [nys] = scale(c.values && c.values.length >= n ? c.values.slice(0, n) : gen(c.seed + 101, n, 0, 1));
  const px = (v: number) => b.x0 + v * b.iw;
  const py = (v: number) => b.y0 + (1 - v) * b.ih;
  const mx = nxs.reduce((a, v) => a + v, 0) / n;
  const my = nys.reduce((a, v) => a + v, 0) / n;
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) { const dx = nxs[i]! - mx; num += dx * (nys[i]! - my); den += dx * dx; }
  const slope = num / (den || 1);
  const icpt = my - slope * mx;
  const yAt = (x: number) => Math.max(0, Math.min(1, icpt + slope * x));
  return (
    <g>
      <line x1={px(0)} y1={py(yAt(0))} x2={px(1)} y2={py(yAt(1))} stroke={c.accent} strokeWidth={2} />
      {nxs.map((x, i) => <circle key={i} cx={px(x)} cy={py(nys[i]!)} r={3} fill={c.main} fillOpacity={0.6} />)}
    </g>
  );
}

function bubble(c: Ctx): JSX.Element {
  const n = 12;
  const b = box(c);
  const xs = gen(c.seed, n, 0.08, 0.92);
  const ys = gen(c.seed + 13, n, 0.08, 0.92);
  const rs = gen(c.seed + 29, n, 0, 1);
  const base = Math.min(b.iw, b.ih) * 0.11;
  const rmax = rs.reduce((a, v) => Math.max(a, v), 0) || 1;
  return (
    <g>
      {xs.map((x, i) => (
        <circle key={i} cx={b.x0 + x * b.iw} cy={b.y0 + ys[i]! * b.ih} r={base * (0.4 + rs[i]! / rmax)} fill={c.main} fillOpacity={0.24} stroke={c.main} strokeWidth={1} />
      ))}
    </g>
  );
}

function waterfall(c: Ctx): JSX.Element {
  const n = 5;
  const b = box(c);
  const steps = c.values && c.values.length >= n ? c.values.slice(0, n) : gen(c.seed, n, -0.55, 0.9);
  const totals: number[] = [0];
  let acc = 0;
  for (const v of steps) { acc += v; totals.push(acc); }
  const lo = Math.min(0, ...totals), hi = Math.max(0.5, ...totals);
  const span = hi - lo || 1;
  const yOf = (v: number) => b.y0 + b.ih - ((v - lo) / span) * b.ih;
  const slot = b.iw / n, bw = slot * 0.55;
  return (
    <g>
      {steps.map((v, i) => {
        const a = totals[i]!, bb = totals[i + 1]!;
        const x = b.x0 + slot * i + (slot - bw) / 2;
        return (
          <g key={i}>
            <rect x={x} y={yOf(Math.max(a, bb))} width={bw} height={Math.abs(yOf(a) - yOf(bb))} fill={v >= 0 ? c.main : c.accent} />
            {i < n - 1 && <line x1={x + bw} y1={yOf(bb)} x2={b.x0 + slot * (i + 1) + (slot - bw) / 2} y2={yOf(bb)} stroke={c.soft2} strokeWidth={1} />}
          </g>
        );
      })}
    </g>
  );
}

function candle(c: Ctx): JSX.Element {
  const n = 10;
  const b = box(c);
  const r = mulberry32(c.seed);
  const opens: number[] = [], closes: number[] = [], highs: number[] = [], lows: number[] = [];
  let base = 0.5;
  for (let i = 0; i < n; i++) {
    const open = base;
    const close = Math.max(0.05, Math.min(0.95, open + (r() - 0.5) * 0.35));
    highs.push(Math.min(0.98, Math.max(open, close) + r() * 0.12));
    lows.push(Math.max(0.02, Math.min(open, close) - r() * 0.12));
    opens.push(open);
    closes.push(close);
    base = close;
  }
  if (c.values && c.values.length >= n) {
    for (let i = 0; i < n; i++) {
      const v = c.values[i]!;
      opens[i] = v; closes[i] = v;
      highs[i] = Math.min(0.99, v + 0.08);
      lows[i] = Math.max(0.01, v - 0.08);
    }
  }
  const [lo, hi] = extent([...lows, ...highs]);
  const yOf = (v: number) => b.y0 + b.ih - ((v - lo) / (hi - lo || 1)) * b.ih;
  const slot = b.iw / n, bw = slot * 0.5;
  return (
    <g>
      {opens.map((open, i) => {
        const close = closes[i]!, up = close >= open, col = up ? c.main : c.accent;
        const x = b.x0 + slot * i + slot / 2;
        const yT = yOf(Math.max(open, close)), yB = yOf(Math.min(open, close));
        return (
          <g key={i}>
            <line x1={x} y1={yOf(highs[i]!)} x2={x} y2={yOf(lows[i]!)} stroke={col} strokeWidth={1.4} />
            <rect x={x - bw / 2} y={yT} width={bw} height={Math.max(1, yB - yT)} fill={up ? col : "none"} stroke={col} strokeWidth={1.4} />
          </g>
        );
      })}
    </g>
  );
}

function heatmap(c: Ctx): JSX.Element {
  const cols = 7, rows = 5;
  const b = box(c);
  const vals = pick(c.values, c.seed, cols * rows, 0, 1);
  const op = [0.08, 0.16, 0.28, 0.5, 0.85];
  const cw = b.iw / cols, ch = b.ih / rows, gap = Math.min(cw, ch) * 0.08;
  return (
    <g>
      {vals.map((v, i) => (
        <rect key={i} x={b.x0 + cw * (i % cols) + gap / 2} y={b.y0 + ch * Math.floor(i / cols) + gap / 2} width={cw - gap} height={ch - gap} fill={c.main} fillOpacity={op[Math.min(4, Math.floor(v * 5))]} />
      ))}
    </g>
  );
}

function radar(c: Ctx): JSX.Element {
  const n = 5;
  const b = box(c);
  const cx = c.w / 2, cy = c.h / 2;
  const R = Math.min(b.iw, b.ih) / 2;
  const vals = pick(c.values, c.seed, n, 0.3, 1);
  const ang = (i: number) => -Math.PI / 2 + (Math.PI * 2 * i) / n;
  const pt = (i: number, t: number): [number, number] => [cx + R * t * Math.cos(ang(i)), cy + R * t * Math.sin(ang(i))];
  return (
    <g>
      {[0.25, 0.5, 0.75, 1].map((t, i) => (
        <path key={i} d={linePath(Array.from({ length: n }, (_, j) => pt(j, t))) + " Z"} fill="none" stroke={c.soft} strokeWidth={1} />
      ))}
      {Array.from({ length: n }, (_, i) => {
        const p = pt(i, 1);
        return <line key={i} x1={cx} y1={cy} x2={p[0]} y2={p[1]} stroke={c.soft} strokeWidth={1} />;
      })}
      <path d={linePath(Array.from({ length: n }, (_, i) => pt(i, Math.max(0.05, Math.min(1, vals[i]!))))) + " Z"} fill={c.main} fillOpacity={0.24} stroke={c.main} strokeWidth={2} />
    </g>
  );
}

function gauge(c: Ctx): JSX.Element {
  const b = box(c);
  const cx = c.w / 2;
  const R = Math.max(1, Math.min(b.iw / 2, b.ih));
  const cy = b.y0 + b.ih;
  const tw = Math.max(6, R * 0.22);
  const t = c.values && c.values.length
    ? Math.max(0, Math.min(1, c.values[0]!))
    : 0.25 + mulberry32(c.seed)() * 0.55;
  const a0 = Math.PI;
  const na = a0 + t * Math.PI;
  return (
    <g>
      <path d={arcD(cx, cy, R - tw / 2, a0, Math.PI * 2)} fill="none" stroke={c.soft} strokeWidth={tw} strokeLinecap="round" />
      <path d={arcD(cx, cy, R - tw / 2, a0, na)} fill="none" stroke={c.main} strokeWidth={tw} strokeLinecap="round" />
      <line x1={cx} y1={cy} x2={cx + (R - tw) * Math.cos(na)} y2={cy + (R - tw) * Math.sin(na)} stroke={c.accent} strokeWidth={Math.max(2, R * 0.04)} strokeLinecap="round" />
      <circle cx={cx} cy={cy} r={Math.max(3, R * 0.07)} fill={c.main} />
    </g>
  );
}

function histogram(c: Ctx): JSX.Element {
  const n = 8;
  const b = box(c);
  const raw = pick(c.values, c.seed, n, 0.15, 1);
  const [nv, lo, hi] = scale(raw);
  const bw = b.iw / n;
  const fs = tickFs(b);
  return (
    <g>
      {c.axis && axisTicks(c, b, lo, hi)}
      {nv.map((v, i) => (
        <rect key={i} x={b.x0 + bw * i} y={b.y0 + b.ih - v * b.ih} width={bw} height={v * b.ih} fill={c.main} fillOpacity={0.24} stroke={c.main} strokeWidth={1} />
      ))}
      {c.axis && nv.map((v, i) => (
        <text key={`v${i}`} x={b.x0 + bw * i + bw / 2} y={b.y0 + b.ih - v * b.ih - 6} fontSize={fs} fill={c.soft2} fontFamily={c.fontNum} textAnchor="middle">{fmt(raw[i]!)}</text>
      ))}
    </g>
  );
}

function render(c: Ctx, kind: ChartKind): JSX.Element {
  switch (kind) {
    case "line-up": return lineChart(c, 1);
    case "line-down": return lineChart(c, -1);
    case "line-multi": return multiLine(c);
    case "bar-v": return barV(c);
    case "bar-h": return barH(c);
    case "bar-stack": return barStack(c);
    case "bar-group": return barGroup(c);
    case "area": return areaChart(c);
    case "pie": return pie(c);
    case "donut": return donut(c);
    case "scatter": return scatter(c);
    case "bubble": return bubble(c);
    case "waterfall": return waterfall(c);
    case "candle": return candle(c);
    case "heatmap": return heatmap(c);
    case "radar": return radar(c);
    case "gauge": return gauge(c);
    case "histogram": return histogram(c);
  }
}

/** 全部图表种类（注册表校验用）。 */
export const CHART_KINDS: ChartKind[] = [
  "line-up", "line-down", "line-multi", "bar-v", "bar-h", "bar-stack",
  "bar-group", "area", "pie", "donut", "scatter", "bubble",
  "waterfall", "candle", "heatmap", "radar", "gauge", "histogram",
];

export function Chart(props: ChartProps): JSX.Element {
  const { kind, w, h, seed = 1, tone = "ink", profile: p } = props;
  const main = tone === "accent" ? p.accent : p.ink;
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox={"0 0 " + w + " " + h} width={w} height={h}>
      {render({
        w, h, seed, main,
        accent: p.accent,
        soft: alpha(p.ink, 0.12),
        soft2: alpha(p.ink, 0.24),
        axis: p.axis,
        fontNum: p.fontNum,
        values: props.values,
      }, kind)}
    </svg>
  );
}
