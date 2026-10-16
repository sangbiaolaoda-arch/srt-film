// 概念图形：把旁白里的抽象关系画成结构图，而不是拿随机曲线冒充数据。
//
// 为什么单独一层：charts.tsx 的 20 种图表吃的是 `content.numbers`（从本拍旁白提取的
// 数字），这份稿子全文阿拉伯数字为 0、中文只有「一百块 / 一次」，图表版式因此被
// needs 门禁全数拦下 —— 这是对的（没有数字就画折线 = 让画面声称一个不存在的形状）。
// 但「素」的问题不在数据，在于画面缺第二层信息。所以这里补的是**不依赖数据**的
// 示意图形：曲线的形状来自旁白的隐喻（越近越疼 / 损失比收益陡），几何来自逻辑
// （汇聚 / 分岔 / 天平），每一张都能在旁白里指出它对应哪一句。
//
// 硬约束与 assets.tsx 一致：纯 SVG，禁 <image> / foreignObject / 外链，否则污染
// canvas 导出。所有几何只画 path/line/circle/rect/polygon —— 这样 apply.ts 的
// m-stroke-draw / m-rise-lines 能自动把它们变成「生长」动画。

import { useId } from "react";
import type { Style } from "./types";

export type FigureKind =
  | "fig-halftone-fade" // 网点渐隐：从左到右逐点消失
  | "fig-radial-burst"  // 放射脉冲：极坐标调制的长短线 + 边缘渐隐遮罩
  | "fig-spiral"        // 阿基米德螺旋：绕不出去的循环
  | "fig-waves"         // 相位叠加：两个来源合成为一条
  | "fig-curve-pain"   // 痛感随距离衰减
  | "fig-fork"         // 岔路：靠近 / 远离
  | "fig-balance"      // 两难天平
  | "fig-checklist"    // 操作清单逐条勾选
  | "fig-corridor"     // 无尽走廊
  | "fig-dim"          // 明灭衰减：代价与收益一起归零
  | "fig-scurve"       // 损失厌恶价值函数（前景理论）
  | "fig-weigh-bars"   // 同额不同权的感知柱
  | "fig-converge"     // 同一源头
  | "fig-receipt"      // 收据
  | "fig-flatline"     // 从未疼过的心电图：一条平线 vs 一条起伏线
  | "fig-door"         // 心里的后门：墙 + 开着的门缝 + 透出的光
  | "fig-clash"        // 价格向前 vs 止损闸
  | "fig-question"     // 设问：大问号 + 分叉轴 + 未选中的两端
  | "fig-path-end"     // 路走到尽头：透视路径 + 终点标记
  | "fig-quote-frame"; // 引语：成对的大引号 + 引用范围框

export const FIGURE_KINDS: FigureKind[] = [
  "fig-halftone-fade", "fig-radial-burst", "fig-spiral", "fig-waves",
  "fig-curve-pain", "fig-fork", "fig-balance", "fig-checklist", "fig-corridor",
  "fig-dim", "fig-scurve", "fig-weigh-bars", "fig-converge", "fig-receipt",
  "fig-flatline", "fig-door", "fig-clash",
  "fig-question", "fig-path-end", "fig-quote-frame",
];

interface Palette {
  ink: string;
  dim: string;
  accent: string;
  hairline: string;
}

/** 图形色板与 style-system 的三系风格保持同色，但不 import —— 避免与渲染器互相依赖。 */
const PALETTE: Record<Style, Palette> = {
  editorial: { ink: "#1c1b18", dim: "#8a867c", accent: "#c8401f", hairline: "rgba(28,27,24,0.18)" },
  // accent 与 style-system 的 accent 同值（本模块刻意不 import 它）：压纸白 ≥3.0。
  "flat-vector": { ink: "#15233b", dim: "#7b8499", accent: "#ff3e1b", hairline: "rgba(21,35,59,0.18)" },
  "chart-motion": { ink: "#10243a", dim: "#5b6b80", accent: "#eb6200", hairline: "rgba(16,36,58,0.2)" },
};

interface FigCtx extends Palette {
  w: number;
  h: number;
  /** 线宽系数：随槽位尺寸缩放（320px 高度基准 = 1x），图形放大后线不显稀。 */
  lw: number;
  /**
   * 本实例的唯一前缀。用于 `<defs>` 里的 pattern / gradient / mask 的 id。
   * 23 拍图层共存于同一份 DOM —— 两个图形用同一个 id，`url(#id)` 会全部指向
   * 先出现的那个定义，后一个图形被前一个的渐变污染（画法手册 T19）。
   */
  uid: string;
}

/** 采样一条函数曲线成折线，32 段足够平滑且输出稳定。 */
function curve(pts: Array<[number, number]>): string {
  return pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(2)} ${p[1].toFixed(2)}`).join(" ");
}

/** 画一个碗（天平托盘 / 汇聚的容器）。 */
function bowl(cx: number, cy: number, r: number): string {
  return `M${cx - r} ${cy} A${r} ${r} 0 0 0 ${cx + r} ${cy}`;
}

// ───────────────────────── 00a 网点渐隐 ─────────────────────────
// 语义：从「还在乎」到「没有了」——不是被一刀切断，是自己一层层淡下去。
// 画法：**逐点绘制**而不是用 pattern。两个理由：① 每个点都是独立元素，可以带
// data-part 被逐个驱动（手册的跨领域基线：几何必须可寻址）；② pattern 的 id 在
// 23 拍共存 DOM 里会互相污染。密度与半径、透明度三通道同向递减，才是「渐隐」
// 而不是「变淡」。
function figHalftoneFade(c: FigCtx): JSX.Element {
  const { w, h, ink, dim, accent } = c;
  const top = h * 0.16, bot = h * 0.88;
  // 网格自适应：点间距按短边定，随槽位宽高比自动增减列数 —— 网格永远是接近正方形
  const cell = Math.min(w, h) / 7.5;
  const cols = Math.max(7, Math.round(w / cell));
  const rows = Math.max(4, Math.round((bot - top) / cell));
  const gapX = w / (cols + 1);
  const gapY = (bot - top) / (rows + 1);
  const base = Math.min(gapX, gapY) * 0.44;
  return (
    <g>
      {Array.from({ length: rows }, (_, r) =>
        Array.from({ length: cols }, (_, q) => {
          const t = q / (cols - 1);
          const fade = Math.pow(1 - t, 1.6);
          if (fade < 0.05) return null;
          // 确定性微扰（不是随机）—— 网点要有手绘的呼吸感，但每次渲染必须一致
          const wobble = 1 + 0.16 * Math.sin(r * 2.1 + q * 0.7);
          return (
            <circle
              key={`${r}-${q}`}
              cx={gapX * (q + 1)}
              cy={top + gapY * (r + 1) + Math.sin(q * 0.5) * gapY * 0.12}
              r={base * (0.3 + 0.7 * fade) * wobble}
              fill={ink}
              opacity={0.12 + 0.74 * fade}
              data-part=""
            />
          );
        }),
      )}
      <line x1={2} y1={h * 0.1} x2={2} y2={h * 0.94} stroke={accent} strokeWidth={c.lw * 4} data-part="" />
      <text x={w * 0.04} y={h * 0.07} fontSize={14} fill={accent} fontFamily="sans-serif" data-part="">
        还在乎
      </text>
      <text x={w * 0.98} y={h * 0.07} fontSize={14} fill={dim} textAnchor="end" fontFamily="sans-serif" data-part="">
        没有了
      </text>
    </g>
  );
}

// ───────────────────────── 00b 放射脉冲 ─────────────────────────
// 语义：向外扩散的一次脉冲 —— 心动、被注视、亮起来的那一下。
// 画法：极坐标。36 条射线的长度按 `|sin(2.5θ)|` 调制出花瓣节奏（不是等长的齿轮），
// 外层套一个 radialGradient 做的遮罩让线端渐隐（硬边会让脉冲显得像刺）。
// 遮罩 id 带 uid 前缀 —— 这是 23 拍共存 DOM 的硬要求。
function figRadialBurst(c: FigCtx): JSX.Element {
  const { w, h, ink, dim, accent, uid } = c;
  const cx = w * 0.5, cy = h * 0.52;
  const r0 = Math.min(w, h) * 0.1;
  const rMax = Math.min(w, h) * 0.46;
  const n = 36;
  const gid = `${uid}-burst-fade`;
  const mid = `${uid}-burst-mask`;
  return (
    <g>
      <defs>
        <radialGradient id={gid} gradientUnits="userSpaceOnUse" cx={cx} cy={cy} r={rMax * 1.14}>
          <stop offset="0.42" stopColor="#fff" stopOpacity="1" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
        <mask id={mid} maskUnits="userSpaceOnUse" x={0} y={0} width={w} height={h}>
          <rect x={0} y={0} width={w} height={h} fill={`url(#${gid})`} />
        </mask>
      </defs>
      <g mask={`url(#${mid})`}>
        {Array.from({ length: n }, (_, i) => {
          const a = (i / n) * Math.PI * 2 - Math.PI / 2;
          const k = 0.4 + 0.6 * Math.abs(Math.sin(2.5 * a + 0.7));
          const r1 = r0 + (rMax - r0) * k;
          return (
            <line
              key={i}
              x1={cx + Math.cos(a) * r0}
              y1={cy + Math.sin(a) * r0}
              x2={cx + Math.cos(a) * r1}
              y2={cy + Math.sin(a) * r1}
              stroke={i % 3 === 0 ? accent : dim}
              strokeWidth={i % 3 === 0 ? c.lw * 3 : c.lw * 2}
              strokeLinecap="round"
              data-part=""
            />
          );
        })}
      </g>
      <circle cx={cx} cy={cy} r={r0 * 0.46} fill={accent} data-part="" />
      <circle cx={cx} cy={cy} r={r0 * 0.84} fill="none" stroke={ink} strokeWidth={c.lw * 1.5} opacity={0.45} data-part="" />
    </g>
  );
}

// ───────────────────────── 00c 螺旋 ─────────────────────────
// 语义：一路绕出去，却始终在同一圈里 —— 漫长、没有尽头。
// 画法：阿基米德螺旋 r = kθ，采样 180 段。y 轴压到 0.92 是为了补偿视觉上圆的
// 竖向拉伸感（同一个 r 在屏幕上看会比横向更大）。
function figSpiral(c: FigCtx): JSX.Element {
  const { w, h, ink, dim, accent } = c;
  const cx = w * 0.5, cy = h * 0.5;
  const rMax = Math.min(w, h) * 0.45;
  const thEnd = 4.2 * Math.PI * 2;
  const pts: Array<[number, number]> = [];
  for (let i = 0; i <= 180; i++) {
    const t = i / 180;
    const th = t * thEnd;
    const r = rMax * (0.06 + 0.94 * t);
    pts.push([cx + Math.cos(th) * r, cy + Math.sin(th) * r * 0.92]);
  }
  // 首尾两点直接算，避免越界索引（noUncheckedIndexedAccess）
  const sx = cx + rMax * 0.06, sy = cy;
  const ex = cx + Math.cos(thEnd) * rMax, ey = cy + Math.sin(thEnd) * rMax * 0.92;
  return (
    <g>
      <path d={curve(pts)} fill="none" stroke={dim} strokeWidth={c.lw * 2.5} strokeLinecap="round" data-part="" />
      <circle cx={sx} cy={sy} r={7} fill={accent} data-part="" />
      <circle cx={ex} cy={ey} r={5} fill={ink} data-part="" />
    </g>
  );
}

// ───────────────────────── 00d 相位叠加 ─────────────────────────
// 语义：两个来源合成为一条 —— 你分不出哪一段是痛、哪一段是幸福。
// 画法：两条频率不同的分量波（2 倍与 3 倍频）逐点相加，合成线因此出现包络起伏
// （拍频）。这是「叠加」最直观的视觉证据：不只是叠在一起，是真的合成了新波形。
function figWaves(c: FigCtx): JSX.Element {
  const { w, h, ink, dim, accent, hairline } = c;
  const x0 = w * 0.06, x1 = w * 0.94;
  const midY = h * 0.5;
  const amp = h * 0.26;
  const N = 96;
  const at = (i: number) => x0 + (i / N) * (x1 - x0);
  const a: Array<[number, number]> = [];
  const b: Array<[number, number]> = [];
  const sum: Array<[number, number]> = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const ya = Math.sin(t * Math.PI * 2 * 2) * amp * 0.36;
    const yb = Math.sin(t * Math.PI * 2 * 3) * amp * 0.3;
    a.push([at(i), midY + ya]);
    b.push([at(i), midY + yb]);
    sum.push([at(i), midY + (ya + yb) * 1.32]);
  }
  return (
    <g>
      <line x1={x0} y1={midY} x2={x1} y2={midY} stroke={hairline} strokeWidth={c.lw * 1} strokeDasharray="5 5" data-part="" />
      <path d={curve(a)} fill="none" stroke={dim} strokeWidth={c.lw * 2} strokeDasharray="6 5" data-part="" />
      <path d={curve(b)} fill="none" stroke={dim} strokeWidth={c.lw * 2} strokeDasharray="2 5" data-part="" />
      <path d={curve(sum)} fill="none" stroke={accent} strokeWidth={c.lw * 4} strokeLinecap="round" data-part="" />
      <text x={x0} y={h * 0.1} fontSize={14} fill={ink} fontFamily="sans-serif" data-part="">
        两种感受
      </text>
      <text x={x1} y={h * 0.97} fontSize={14} fill={accent} textAnchor="end" fontFamily="sans-serif" data-part="">
        合成的那一条
      </text>
    </g>
  );
}

// ───────────────────────── 01 痛感曲线 ─────────────────────────
// 语义：拍 01「如果靠近一个人注定会疼」。横轴是距离，纵轴是痛感；
// 曲线左端陡起 —— 越靠近，痛感不是线性增长，而是陡然升高。
function figCurvePain(c: FigCtx): JSX.Element {
  const { w, h, dim, accent, hairline } = c;
  const x0 = w * 0.14, x1 = w * 0.94;
  const y0 = h * 0.86, y1 = h * 0.12;
  const pts: Array<[number, number]> = [];
  for (let i = 0; i <= 32; i++) {
    const t = i / 32;
    const px = x0 + t * (x1 - x0);
    const py = y0 - Math.exp(-2.9 * t) * (y0 - y1);
    pts.push([px, py]);
  }
  const near = x0 + 0.12 * (x1 - x0);
  const nearY = y0 - Math.exp(-2.9 * 0.12) * (y0 - y1);
  return (
    <g>
      <g data-part="">
        <line x1={x0} y1={y0} x2={x1} y2={y0} stroke={dim} strokeWidth={c.lw * 1.5} />
        <line x1={x0} y1={y0} x2={x0} y2={y1} stroke={dim} strokeWidth={c.lw * 1.5} />
      </g>
      <path d={curve(pts)} fill="none" stroke={accent} strokeWidth={c.lw * 3.5} strokeLinecap="round" data-part="" />
      <g data-part="">
        <line x1={x0} y1={y1} x2={x1} y2={y1} stroke={hairline} strokeWidth={c.lw * 1} strokeDasharray="5 5" />
        <line x1={near} y1={nearY} x2={near} y2={y0} stroke={hairline} strokeWidth={c.lw * 1} strokeDasharray="4 4" />
      </g>
      <circle cx={near} cy={nearY} r={7} fill={accent} data-part="" />
      <text x={x1} y={y0 + 22} fontSize={14} fill={dim} textAnchor="end" fontFamily="sans-serif" data-part="">
        距离 →
      </text>
      <text x={x0 - 10} y={y1 + 4} fontSize={14} fill={dim} textAnchor="end" fontFamily="sans-serif" data-part="">
        痛感
      </text>
      <text x={near} y={y0 + 22} fontSize={14} fill={accent} textAnchor="middle" fontFamily="sans-serif" data-part="">
        靠近
      </text>
    </g>
  );
}

// ───────────────────────── 02 岔路 ─────────────────────────
// 语义：拍 02「那你还要不要靠近？」一条路走到分岔点，裂成两条。
function figFork(c: FigCtx): JSX.Element {
  const { w, h, ink, dim, accent } = c;
  const xs = w * 0.08, xe = w * 0.92;
  const mid = w * 0.46;
  const cy = h * 0.5;
  const up = h * 0.18, dn = h * 0.82;
  return (
    <g>
      <path d={`M${xs} ${cy} L${mid} ${cy}`} fill="none" stroke={ink} strokeWidth={c.lw * 4} strokeLinecap="round" data-part="" />
      <path d={`M${mid} ${cy} L${xe} ${up}`} fill="none" stroke={accent} strokeWidth={c.lw * 4} strokeLinecap="round" data-part="" />
      <path d={`M${mid} ${cy} L${xe} ${dn}`} fill="none" stroke={dim} strokeWidth={c.lw * 4} strokeLinecap="round" data-part="" />
      <circle cx={mid} cy={cy} r={9} fill={accent} data-part="" />
      <circle cx={xe} cy={up} r={7} fill={accent} data-part="" />
      <circle cx={xe} cy={dn} r={7} fill="none" stroke={dim} strokeWidth={c.lw * 3} data-part="" />
      <text x={xe} y={up - 16} fontSize={15} fill={accent} textAnchor="end" fontFamily="sans-serif" data-part="">
        靠近
      </text>
      <text x={xe} y={dn + 30} fontSize={15} fill={dim} textAnchor="end" fontFamily="sans-serif" data-part="">
        退开
      </text>
    </g>
  );
}

// ───────────────────────── 03 两难天平 ─────────────────────────
// 语义：拍 07「这是个两难」。梁倾斜、两端都挂着东西 —— 不是选轻的一边
// 就没事，而是两边都真实存在。
function figBalance(c: FigCtx): JSX.Element {
  const { w, h, ink, dim, accent, hairline } = c;
  const cx = w * 0.5, cy = h * 0.26;
  const armL = w * 0.36;
  const tilt = h * 0.14;
  const lx = cx - armL, ly = cy + tilt;
  const rx = cx + armL, ry = cy - tilt;
  const drop = h * 0.24;
  return (
    <g>
      <path d={`M${cx} ${cy + 10} L${cx - 16} ${h * 0.86} L${cx + 16} ${h * 0.86} Z`} fill={dim} opacity={0.5} data-part="" />
      <line x1={lx} y1={ly} x2={rx} y2={ry} stroke={ink} strokeWidth={c.lw * 4} strokeLinecap="round" data-part="" />
      <circle cx={cx} cy={cy} r={8} fill={accent} data-part="" />
      <path d={`M${lx} ${ly} L${lx} ${ly + drop}`} stroke={hairline} strokeWidth={c.lw * 1.5} data-part="" />
      <path d={`M${rx} ${ry} L${rx} ${ry + drop}`} stroke={hairline} strokeWidth={c.lw * 1.5} data-part="" />
      <path d={bowl(lx, ly + drop, w * 0.13)} fill="none" stroke={accent} strokeWidth={c.lw * 3.5} strokeLinecap="round" data-part="" />
      <path d={bowl(rx, ry + drop, w * 0.13)} fill="none" stroke={dim} strokeWidth={c.lw * 3.5} strokeLinecap="round" data-part="" />
      <text x={lx} y={ly + drop + 40} fontSize={15} fill={accent} textAnchor="middle" fontFamily="sans-serif" data-part="">
        靠近的痛
      </text>
      <text x={rx} y={ry + drop + 40} fontSize={15} fill={dim} textAnchor="middle" fontFamily="sans-serif" data-part="">
        远离的空
      </text>
    </g>
  );
}

// ───────────────────────── 04 操作清单 ─────────────────────────
// 语义：拍 08「不主动，不投入，不说满，留一手」。四条被逐条打勾的规则。
function figChecklist(c: FigCtx): JSX.Element {
  const { w, h, ink, dim, accent, hairline } = c;
  const n = 4;
  const rowH = h / n;
  const bx = w * 0.06;
  const bw = h * 0.11;
  return (
    <g>
      {Array.from({ length: n }, (_, i) => {
        const y = rowH * i + rowH * 0.12;
        const bh = rowH * 0.6;
        const barW = w * (0.5 - i * 0.05);
        return (
          <g key={i} data-part="">
            <rect x={bx} y={y} width={bw} height={bh} fill="none" stroke={i === 0 ? accent : dim} strokeWidth={c.lw * 2.5} />
            <path
              d={`M${bx + bw * 0.2} ${y + bh * 0.55} L${bx + bw * 0.44} ${y + bh * 0.8} L${bx + bw * 0.82} ${y + bh * 0.2}`}
              fill="none"
              stroke={accent}
              strokeWidth={c.lw * 3}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <rect x={bx + bw + w * 0.05} y={y + bh * 0.36} width={barW} height={bh * 0.26} fill={ink} opacity={0.78} />
            <line x1={bx} y1={y + rowH * 0.82} x2={w * 0.94} y2={y + rowH * 0.82} stroke={hairline} strokeWidth={c.lw * 1} />
          </g>
        );
      })}
    </g>
  );
}

// ───────────────────────── 05 无尽走廊 ─────────────────────────
// 语义：拍 12「更安静的、更长的、没有尽头的那种」。同心矩形向消失点收缩。
function figCorridor(c: FigCtx): JSX.Element {
  const { w, h, accent, hairline, dim } = c;
  const cx = w * 0.5, cy = h * 0.46;
  const n = 9;
  return (
    <g>
      {Array.from({ length: n }, (_, i) => {
        const k = Math.pow(0.76, i);
        const rw = w * 0.88 * k;
        const rh = h * 0.86 * k;
        return (
          <rect
            key={i}
            x={cx - rw / 2}
            y={cy - rh / 2}
            width={rw}
            height={rh}
            fill="none"
            stroke={i === 0 ? accent : i < 3 ? dim : hairline}
            strokeWidth={i === 0 ? c.lw * 3.5 : c.lw * 2}
            data-part=""
          />
        );
      })}
      <circle cx={cx} cy={cy} r={4} fill={accent} data-part="" />
    </g>
  );
}

// ───────────────────────── 06 明灭衰减 ─────────────────────────
// 语义：拍 13「不投入确实不会失恋，但你也不会心动」。两排竖条一起衰减到零 ——
// 代价消掉了，收益也一起消掉了。
function figDim(c: FigCtx): JSX.Element {
  const { w, h, accent, dim, hairline, ink } = c;
  const n = 9;
  const gap = w / (n + 1);
  const barW = gap * 0.42;
  const baseTop = h * 0.46;
  const baseBot = h * 0.58;
  return (
    <g>
      {Array.from({ length: n }, (_, i) => {
        const t = i / (n - 1);
        const decay = 1 - t * 0.86;
        const hh = h * 0.3 * decay;
        const cx = gap * (i + 1);
        return (
          <g key={i} data-part="">
            <rect x={cx - barW / 2} y={baseTop - hh} width={barW} height={hh} fill={accent} opacity={0.9 - t * 0.5} />
            <rect x={cx - barW / 2} y={baseBot} width={barW} height={hh * 0.82} fill={ink} opacity={0.55 - t * 0.4} />
          </g>
        );
      })}
      <line x1={w * 0.03} y1={baseTop} x2={w * 0.97} y2={baseTop} stroke={hairline} strokeWidth={c.lw * 1} />
      <line x1={w * 0.03} y1={baseBot} x2={w * 0.97} y2={baseBot} stroke={hairline} strokeWidth={c.lw * 1} />
      <text x={w * 0.03} y={baseTop - h * 0.34} fontSize={14} fill={accent} fontFamily="sans-serif" data-part="">
        失恋的风险
      </text>
      <text x={w * 0.03} y={baseBot + h * 0.36} fontSize={14} fill={dim} fontFamily="sans-serif" data-part="">
        心动的可能
      </text>
    </g>
  );
}

// ───────────────────────── 07 损失厌恶曲线 ─────────────────────────
// 语义：拍 18「心理学上有个东西叫损失厌恶」。前景理论的价值函数：
// 收益段平缓上凸，损失段陡峭下凹 —— 同样大小的得失，损失带来的位移更大。
function figSCurve(c: FigCtx): JSX.Element {
  const { w, h, accent, dim, hairline, ink } = c;
  const cx = w * 0.42, cy = h * 0.5;
  const rx = w * 0.5, ry = h * 0.42;
  const gain: Array<[number, number]> = [];
  const loss: Array<[number, number]> = [];
  for (let i = 0; i <= 16; i++) {
    const t = i / 16;
    gain.push([cx + t * rx, cy - Math.pow(t, 0.62) * ry]);
    loss.push([cx - t * rx, cy + Math.pow(t, 0.62) * ry * 1.62]);
  }
  return (
    <g>
      <line x1={w * 0.04} y1={cy} x2={w * 0.96} y2={cy} stroke={hairline} strokeWidth={c.lw * 1.5} />
      <line x1={cx} y1={h * 0.06} x2={cx} y2={h * 0.94} stroke={hairline} strokeWidth={c.lw * 1.5} />
      <path d={curve(loss)} fill="none" stroke={accent} strokeWidth={c.lw * 4} strokeLinecap="round" data-part="" />
      <path d={curve(gain)} fill="none" stroke={ink} strokeWidth={c.lw * 4} strokeLinecap="round" data-part="" />
      <circle cx={cx} cy={cy} r={6} fill={accent} data-part="" />
      <text x={w * 0.94} y={cy - 14} fontSize={15} fill={ink} textAnchor="end" fontFamily="sans-serif" data-part="">
        捡到
      </text>
      <text x={w * 0.94} y={h * 0.96} fontSize={15} fill={accent} textAnchor="end" fontFamily="sans-serif" data-part="">
        丢掉
      </text>
      <text x={w * 0.06} y={cy - 14} fontSize={13} fill={dim} fontFamily="sans-serif" data-part="">
        同样大小
      </text>
      <text x={w * 0.06} y={cy + 26} fontSize={13} fill={dim} fontFamily="sans-serif" data-part="">
        位移差这么多
      </text>
    </g>
  );
}

// ───────────────────────── 08 感知权重柱 ─────────────────────────
// 语义：拍 19「丢一百块和捡一百块，你记住的永远是丢的那一次」。
// 两个金额一样，画出来的高度不一样 —— 高的是感知，不是金额。
function figWeighBars(c: FigCtx): JSX.Element {
  const { w, h, accent, dim, hairline, ink } = c;
  const base = h * 0.84;
  const bw = w * 0.16;
  const lx = w * 0.2, rxp = w * 0.6;
  return (
    <g>
      <line x1={w * 0.06} y1={base} x2={w * 0.94} y2={base} stroke={dim} strokeWidth={c.lw * 2} />
      <rect x={lx} y={base - h * 0.22} width={bw} height={h * 0.22} fill={ink} opacity={0.72} data-part="" />
      <rect x={rxp} y={base - h * 0.56} width={bw} height={h * 0.56} fill={accent} data-part="" />
      <text x={lx + bw / 2} y={base - h * 0.22 - 12} fontSize={15} fill={ink} textAnchor="middle" fontFamily="sans-serif" data-part="">
        捡 100
      </text>
      <text x={rxp + bw / 2} y={base - h * 0.56 - 12} fontSize={15} fill={accent} textAnchor="middle" fontFamily="sans-serif" data-part="">
        丢 100
      </text>
      <line x1={w * 0.06} y1={base - h * 0.8} x2={w * 0.94} y2={base - h * 0.8} stroke={hairline} strokeWidth={c.lw * 1} strokeDasharray="5 5" />
      <text x={w * 0.94} y={base - h * 0.8 - 8} fontSize={13} fill={dim} textAnchor="end" fontFamily="sans-serif" data-part="">
        记忆权重
      </text>
    </g>
  );
}

// ───────────────────────── 09 同一源头 ─────────────────────────
// 语义：拍 20「痛苦和幸福来自同一个源头：你在乎」。两条线汇到一个点，
// 再从那个点出一条 —— 分不出哪段是痛、哪段是幸福。
function figConverge(c: FigCtx): JSX.Element {
  const { w, h, accent, hairline, ink } = c;
  const cx = w * 0.46, cy = h * 0.5;
  const stopX = w * 0.84;
  return (
    <g>
      <path d={`M${w * 0.06} ${h * 0.12} Q${cx * 0.7} ${h * 0.2} ${cx} ${cy}`} fill="none" stroke={ink} strokeWidth={c.lw * 3.5} strokeLinecap="round" data-part="" />
      <path d={`M${w * 0.06} ${h * 0.88} Q${cx * 0.7} ${h * 0.8} ${cx} ${cy}`} fill="none" stroke={accent} strokeWidth={c.lw * 3.5} strokeLinecap="round" data-part="" />
      <path d={`M${cx} ${cy} L${stopX} ${cy}`} fill="none" stroke={accent} strokeWidth={c.lw * 4.5} strokeLinecap="round" data-part="" />
      <circle cx={cx} cy={cy} r={11} fill={accent} data-part="" />
      <circle cx={cx} cy={cy} r={20} fill="none" stroke={hairline} strokeWidth={c.lw * 2} data-part="" />
      <text x={w * 0.06} y={h * 0.12 - 12} fontSize={15} fill={ink} fontFamily="sans-serif" data-part="">
        幸福
      </text>
      <text x={w * 0.06} y={h * 0.88 + 26} fontSize={15} fill={accent} fontFamily="sans-serif" data-part="">
        痛苦
      </text>
      <text x={stopX} y={cy - 16} fontSize={15} fill={accent} textAnchor="end" fontFamily="sans-serif" data-part="">
        你在乎
      </text>
    </g>
  );
}

// ───────────────────────── 10 收据 ─────────────────────────
// 语义：拍 23「痛苦不是幸福的代价，是你在乎过的收据」。一张打出来的凭条。
function figReceipt(c: FigCtx): JSX.Element {
  const { w, h, accent, dim, hairline, ink } = c;
  const x0 = w * 0.24, x1 = w * 0.76;
  const y0 = h * 0.06, y1 = h * 0.9;
  const teeth = 10;
  const tw = (x1 - x0) / teeth;
  let d = `M${x0} ${y0} L${x1} ${y0} L${x1} ${y1}`;
  for (let i = 0; i < teeth; i++) {
    const a = x1 - tw * i;
    const b = a - tw / 2;
    d += ` L${b} ${y1 + (i % 2 === 0 ? -8 : 8)} L${a - tw} ${y1}`;
  }
  d += " Z";
  const rows = 4;
  return (
    <g>
      <path d={d} fill="none" stroke={ink} strokeWidth={c.lw * 3} data-part="" />
      {Array.from({ length: rows }, (_, i) => {
        const y = y0 + (h * 0.5 / rows) * (i + 1) + h * 0.04;
        return (
          <g key={i} data-part="">
            <text x={x0 + 14} y={y} fontSize={13} fill={dim} fontFamily="sans-serif">
              {`项 ${i + 1}`}
            </text>
            <line x1={x0 + 62} y1={y - 4} x2={x1 - 52} y2={y - 4} stroke={hairline} strokeWidth={c.lw * 1} strokeDasharray="3 3" />
            <line x1={x1 - 44} y1={y - 4} x2={x1 - 14} y2={y - 4} stroke={dim} strokeWidth={c.lw * 1.5} />
          </g>
        );
      })}
      <line x1={x0 + 14} y1={y0 + h * 0.64} x2={x1 - 14} y2={y0 + h * 0.64} stroke={ink} strokeWidth={c.lw * 1.5} />
      <line x1={x0 + 14} y1={y0 + h * 0.72} x2={x1 - 30} y2={y0 + h * 0.72} stroke={accent} strokeWidth={c.lw * 5} data-part="" />
      <text x={x0 + 14} y={y0 + h * 0.62 - 8} fontSize={13} fill={dim} fontFamily="sans-serif" data-part="">
        合计
      </text>
    </g>
  );
}

// ───────────────────────── 11 平线（从未疼过） ─────────────────────────
// 语义：拍 03「一个从来没有为谁疼过的人，到底是活得通透」。
// 上方一条几乎无波动的线（从未疼过的人生），下方一条起伏剧烈的线（疼过的人生）
// —— 两条线的反差本身就是论点：平，既可能是通透，也可能是空白。
function figFlatline(c: FigCtx): JSX.Element {
  const { w, h, ink, dim, accent } = c;
  const x0 = w * 0.06, x1 = w * 0.96;
  const yFlat = h * 0.34, yWave = h * 0.76;
  // 平线：只有呼吸级的微起伏
  const flat: Array<[number, number]> = [];
  for (let i = 0; i <= 32; i++) {
    const t = i / 32;
    flat.push([x0 + t * (x1 - x0), yFlat + Math.sin(t * Math.PI * 2) * 1.6]);
  }
  // 起伏线：有峰值有谷底，疼过的人生
  const wavePts: Array<[number, number]> = [
    [x0, yWave], [w * 0.14, yWave - h * 0.16], [w * 0.22, yWave + h * 0.04],
    [w * 0.34, yWave - h * 0.26], [w * 0.46, yWave + h * 0.08],
    [w * 0.6, yWave - h * 0.2], [w * 0.74, yWave - h * 0.02],
    [w * 0.86, yWave - h * 0.3], [x1, yWave],
  ];
  return (
    <g>
      <path d={curve(flat)} fill="none" stroke={ink} strokeWidth={c.lw * 2.5} data-part="" />
      <circle cx={x1} cy={yFlat} r={6} fill={accent} data-part="" />
      <path d={curve(wavePts)} fill="none" stroke={dim} strokeWidth={c.lw * 2} strokeDasharray="6 5" data-part="" />
    </g>
  );
}

// ───────────────────────── 12 后门 ─────────────────────────
// 语义：拍 09「喜欢一个人的时候先在心里留个后门」。
// 一堵墙留一个门洞，门扇向外敞开，一道光从门缝里透进来 —— 后门是退路，也是光。
function figDoor(c: FigCtx): JSX.Element {
  const { w, h, ink, dim, accent, hairline } = c;
  const wx = w * 0.42;                       // 墙所在竖线
  const top = h * 0.08, bot = h * 0.94;
  const dh = bot - top;                      // 门洞高
  const dw = w * 0.13;                       // 门洞宽
  const dx = wx, dy = top + dh * 0.12;       // 门洞左上
  // 门扇：绕左铰链向外开 55°
  const rad = (55 * Math.PI) / 180;
  const sw = dw * 0.96;
  const hx = dx, hy = dy + dh * 0.98;        // 铰链（门洞左下）
  const ex = hx + sw * Math.sin(rad);
  const ey = hy - sw * Math.cos(rad);
  return (
    <g>
      {/* 墙：左右两段 + 砖缝 */}
      <line x1={wx} y1={top} x2={wx} y2={dy} stroke={ink} strokeWidth={c.lw * 3.5} data-part="" />
      <line x1={wx} y1={dy + dh * 0.98} x2={wx} y2={bot} stroke={ink} strokeWidth={c.lw * 3.5} data-part="" />
      <line x1={wx - w * 0.3} y1={top} x2={wx} y2={top} stroke={ink} strokeWidth={c.lw * 3.5} data-part="" />
      <line x1={wx - w * 0.3} y1={bot} x2={wx} y2={bot} stroke={ink} strokeWidth={c.lw * 3.5} data-part="" />
      <line x1={wx - w * 0.3} y1={top} x2={wx - w * 0.3} y2={bot} stroke={ink} strokeWidth={c.lw * 3.5} data-part="" />
      {[0.24, 0.48, 0.72].map((t) => (
        <line key={t} x1={wx - w * 0.3} y1={top + dh * t} x2={wx} y2={top + dh * t} stroke={hairline} strokeWidth={c.lw * 1} data-part="" />
      ))}
      {/* 门洞光：从门缝向右下张开 */}
      <polygon
        points={`${dx},${dy + dh * 0.1} ${dx + dw}, ${dy + dh * 0.98} ${dx + w * 0.42},${dy + dh * 1.06}`}
        fill={accent}
        opacity={0.14}
        data-part=""
      />
      {/* 门扇与门框 */}
      <line x1={hx} y1={hy} x2={ex} y2={ey} stroke={ink} strokeWidth={c.lw * 3} data-part="" />
      <line x1={ex} y1={ey} x2={dx + dw * 0.1} y2={dy + dh * 0.06} stroke={dim} strokeWidth={c.lw * 1.5} strokeDasharray="5 4" data-part="" />
      <rect x={dx} y={dy} width={dw} height={dh * 0.98} fill="none" stroke={accent} strokeWidth={c.lw * 2.5} data-part="" />
    </g>
  );
}

// ───────────────────────── 13 价格 vs 止损闸 ─────────────────────────
// 语义：拍 21「这种疼是价格，可以付；但亏损必须有底线」。
// 左侧箭头一路向右（愿意付的价格），撞上右侧一道止损失闸 —— 边界不是懦弱，是设计。
function figClash(c: FigCtx): JSX.Element {
  const { w, h, ink, dim, accent } = c;
  const yMid = h * 0.52;
  const gateX = w * 0.82;
  const arrowY = yMid;
  const tipX = gateX - w * 0.035;
  return (
    <g>
      {/* 止损闸：粗竖线 + 底座 + 顶部短盖 */}
      <line x1={gateX} y1={h * 0.1} x2={gateX} y2={h * 0.9} stroke={accent} strokeWidth={c.lw * 7} data-part="" />
      <line x1={gateX - w * 0.045} y1={h * 0.9} x2={gateX + w * 0.045} y2={h * 0.9} stroke={accent} strokeWidth={c.lw * 4} data-part="" />
      <line x1={gateX - w * 0.03} y1={h * 0.1} x2={gateX + w * 0.03} y2={h * 0.1} stroke={accent} strokeWidth={c.lw * 4} data-part="" />
      {/* 前进的箭头：杆 + 尖 */}
      <line x1={w * 0.05} y1={arrowY} x2={tipX - 20} y2={arrowY} stroke={ink} strokeWidth={c.lw * 5} data-part="" />
      <polygon points={`${tipX},${arrowY} ${tipX - 26},${arrowY - 15} ${tipX - 26},${arrowY + 15}`} fill={ink} data-part="" />
      {/* 箭头刻度：价格一路上探，每格一次加价 */}
      {[0.16, 0.3, 0.44, 0.58].map((t) => (
        <line key={t} x1={w * t} y1={arrowY - 12} x2={w * t} y2={arrowY + 12} stroke={dim} strokeWidth={c.lw * 2} data-part="" />
      ))}
      {/* 撞击碎线 */}
      <g stroke={dim} strokeWidth={c.lw * 2}>
        <line x1={tipX + 4} y1={arrowY - 22} x2={tipX + 16} y2={arrowY - 34} data-part="" />
        <line x1={tipX + 8} y1={arrowY} x2={tipX + 24} y2={arrowY} data-part="" />
        <line x1={tipX + 4} y1={arrowY + 22} x2={tipX + 16} y2={arrowY + 34} data-part="" />
      </g>
    </g>
  );
}

// ───────────────────────── 14 设问 ─────────────────────────
// 语义：拍 04「还是这辈子从来没真正在乎过什么」。大问号压在上方，下面一条
// 分叉轴 —— 两种人生摆在轴的两端，问号悬在中间：这就是那个没有答案的设问。
function figQuestion(c: FigCtx): JSX.Element {
  const { w, h, ink, dim, accent, hairline } = c;
  const cx = w * 0.5;
  const r = Math.min(w, h) * 0.22;
  const cy = h * 0.34;
  // 问号的钩：3/4 圆弧 + 向下的短竖
  const hook = `M${cx - r} ${cy} A${r} ${r} 0 1 1 ${cx + r * 0.35} ${cy + r * 0.62}`;
  const stem = `M${cx + r * 0.35} ${cy + r * 0.62} L${cx + r * 0.35} ${cy + r * 1.05}`;
  const axY = h * 0.82;
  return (
    <g>
      <path d={hook} fill="none" stroke={ink} strokeWidth={c.lw * 7} strokeLinecap="round" data-part="" />
      <path d={stem} fill="none" stroke={ink} strokeWidth={c.lw * 7} strokeLinecap="round" data-part="" />
      <circle cx={cx + r * 0.35} cy={cy + r * 1.5} r={7} fill={ink} data-part="" />
      {/* 分叉轴：两端各一个候选，中间悬空 */}
      <line x1={w * 0.08} y1={axY} x2={w * 0.92} y2={axY} stroke={hairline} strokeWidth={c.lw * 2} data-part="" />
      <circle cx={w * 0.14} cy={axY} r={6} fill={dim} data-part="" />
      <circle cx={w * 0.86} cy={axY} r={6} fill={accent} data-part="" />
      <line x1={w * 0.5} y1={axY - 14} x2={w * 0.5} y2={axY + 14} stroke={accent} strokeWidth={c.lw * 3} data-part="" />
    </g>
  );
}

// ───────────────────────── 15 路到尽头 ─────────────────────────
// 语义：拍 15「文学里有人把这条路走到了头」。透视路面收束到尽头的门框
// —— 路不是断了，是走到了一块到头的墙。
function figPathEnd(c: FigCtx): JSX.Element {
  const { w, h, ink, dim, accent, hairline } = c;
  const vx = w * 0.5, vy = h * 0.3;      // 尽头（灭点）
  const bw = w * 0.42, by = h * 0.96;    // 近端路面宽度与位置
  const gw = w * 0.1, gh = h * 0.14;     // 尽头门框
  const ties = 7;
  return (
    <g>
      <line x1={vx - bw / 2} y1={by} x2={vx} y2={vy} stroke={dim} strokeWidth={c.lw * 2.5} data-part="" />
      <line x1={vx + bw / 2} y1={by} x2={vx} y2={vy} stroke={dim} strokeWidth={c.lw * 2.5} data-part="" />
      {Array.from({ length: ties }, (_, i) => {
        const t = (i + 1) / (ties + 1);
        const y = by + (vy - by) * t;
        const hw = (bw / 2) * (1 - t);
        return <line key={i} x1={vx - hw} y1={y} x2={vx + hw} y2={y} stroke={hairline} strokeWidth={c.lw * 2} data-part="" />;
      })}
      <rect x={vx - gw / 2} y={vy - gh} width={gw} height={gh} fill="none" stroke={accent} strokeWidth={c.lw * 4} data-part="" />
      <line x1={vx - gw * 0.9} y1={vy - gh} x2={vx + gw * 0.9} y2={vy - gh} stroke={ink} strokeWidth={c.lw * 3} data-part="" />
    </g>
  );
}

// ───────────────────────── 16 引语框 ─────────────────────────
// 语义：拍 10「这些人真的过得更好吗」—— 这是被引述的设问，不是叙述者的判断。
// 成对的大引号把一个空的引用范围框起来：答案不在画面里。
function figQuoteFrame(c: FigCtx): JSX.Element {
  const { w, h, dim, accent, hairline } = c;
  // 逗号形引号：小圆 + 下垂尾
  const mark = (x: number, y: number, s: number, fill: string) =>
    `M${x} ${y} c 0 ${-s * 0.52} ${s * 0.36} ${-s * 0.86} ${s * 0.86} ${-s * 0.86} ` +
    `l 0 ${s * 0.42} c ${-s * 0.3} 0 ${-s * 0.46} ${s * 0.18} ${-s * 0.46} ${s * 0.44} ` +
    `l ${s * 0.46} 0 l 0 ${s * 0.44} l ${-s * 0.86} 0 z`;
  const s = Math.min(w * 0.16, h * 0.3);
  const rx = w * 0.88 - s * 2.05; // 右引号锚点
  return (
    <g>
      <path d={mark(w * 0.12, h * 0.42, s, dim)} fill={dim} data-part="" />
      <path d={mark(w * 0.12 + s * 1.05, h * 0.42, s, dim)} fill={dim} data-part="" />
      {/* 右引号 = 左引号绕自身中心旋转 180°（下引号 ” 的形态） */}
      <path
        d={mark(rx, h * 0.42, s, accent)}
        fill={accent}
        transform={`rotate(180 ${rx + s * 0.43} ${h * 0.42 - s * 0.2})`}
        data-part=""
      />
      <rect x={w * 0.08} y={h * 0.56} width={w * 0.84} height={h * 0.36} fill="none" stroke={hairline} strokeWidth={c.lw * 2} strokeDasharray="8 6" data-part="" />
    </g>
  );
}

function render(c: FigCtx, kind: FigureKind): JSX.Element {
  switch (kind) {
    case "fig-halftone-fade": return figHalftoneFade(c);
    case "fig-radial-burst": return figRadialBurst(c);
    case "fig-spiral": return figSpiral(c);
    case "fig-waves": return figWaves(c);
    case "fig-curve-pain": return figCurvePain(c);
    case "fig-fork": return figFork(c);
    case "fig-balance": return figBalance(c);
    case "fig-checklist": return figChecklist(c);
    case "fig-corridor": return figCorridor(c);
    case "fig-dim": return figDim(c);
    case "fig-scurve": return figSCurve(c);
    case "fig-weigh-bars": return figWeighBars(c);
    case "fig-converge": return figConverge(c);
    case "fig-receipt": return figReceipt(c);
    case "fig-flatline": return figFlatline(c);
    case "fig-door": return figDoor(c);
    case "fig-clash": return figClash(c);
    case "fig-question": return figQuestion(c);
    case "fig-path-end": return figPathEnd(c);
    case "fig-quote-frame": return figQuoteFrame(c);
  }
}

export interface FigureProps {
  kind: FigureKind;
  w: number;
  h: number;
  /** 槽位落点（舞台坐标系）。嵌套 svg 缺省 x/y=0 —— 缺了它所有图形都挤到画布左上角。 */
  x?: number;
  y?: number;
  style?: Style;
}

export function Figure(props: FigureProps): JSX.Element {
  const { kind, w, h, x, y, style = "editorial" } = props;
  const p = PALETTE[style];
  // useId 保证同一份 DOM 里每个实例拿到不同前缀；冒号在 url(#id) 里要清掉。
  const uid = `f${useId().replace(/:/g, "")}`;
  // 线宽随槽位尺寸缩放：全屏 720px 高 ≈ 2.25x，小卡 420px ≈ 1.3x，线永远不会显稀。
  const lw = Math.max(1, Math.min(w, h) / 320);
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox={`0 0 ${w} ${h}`} width={w} height={h} x={x} y={y}>
      {render({ w, h, uid, lw, ...p }, kind)}
    </svg>
  );
}
