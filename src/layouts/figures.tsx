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

import type { Style } from "./types";

export type FigureKind =
  | "fig-curve-pain"   // 痛感随距离衰减
  | "fig-fork"         // 岔路：靠近 / 远离
  | "fig-balance"      // 两难天平
  | "fig-checklist"    // 操作清单逐条勾选
  | "fig-corridor"     // 无尽走廊
  | "fig-dim"          // 明灭衰减：代价与收益一起归零
  | "fig-scurve"       // 损失厌恶价值函数（前景理论）
  | "fig-weigh-bars"   // 同额不同权的感知柱
  | "fig-converge"     // 同一源头
  | "fig-receipt";     // 收据

export const FIGURE_KINDS: FigureKind[] = [
  "fig-curve-pain", "fig-fork", "fig-balance", "fig-checklist", "fig-corridor",
  "fig-dim", "fig-scurve", "fig-weigh-bars", "fig-converge", "fig-receipt",
];

interface Palette {
  ink: string;
  dim: string;
  accent: string;
  hairline: string;
}

/** 图形色板与 render.tsx 的两套主题保持同色，但不 import —— 避免与渲染器互相依赖。 */
const PALETTE: Record<Style, Palette> = {
  editorial: { ink: "#1c1b18", dim: "#8a867c", accent: "#c8401f", hairline: "rgba(28,27,24,0.18)" },
  poster: { ink: "#eceae6", dim: "#8b8a9c", accent: "#38e8c6", hairline: "rgba(236,234,230,0.2)" },
};

interface FigCtx extends Palette {
  w: number;
  h: number;
}

/** 采样一条函数曲线成折线，32 段足够平滑且输出稳定。 */
function curve(pts: Array<[number, number]>): string {
  return pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(2)} ${p[1].toFixed(2)}`).join(" ");
}

/** 画一个碗（天平托盘 / 汇聚的容器）。 */
function bowl(cx: number, cy: number, r: number): string {
  return `M${cx - r} ${cy} A${r} ${r} 0 0 0 ${cx + r} ${cy}`;
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
        <line x1={x0} y1={y0} x2={x1} y2={y0} stroke={dim} strokeWidth={1.5} />
        <line x1={x0} y1={y0} x2={x0} y2={y1} stroke={dim} strokeWidth={1.5} />
      </g>
      <path d={curve(pts)} fill="none" stroke={accent} strokeWidth={3.5} strokeLinecap="round" data-part="" />
      <g data-part="">
        <line x1={x0} y1={y1} x2={x1} y2={y1} stroke={hairline} strokeWidth={1} strokeDasharray="5 5" />
        <line x1={near} y1={nearY} x2={near} y2={y0} stroke={hairline} strokeWidth={1} strokeDasharray="4 4" />
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
      <path d={`M${xs} ${cy} L${mid} ${cy}`} fill="none" stroke={ink} strokeWidth={4} strokeLinecap="round" data-part="" />
      <path d={`M${mid} ${cy} L${xe} ${up}`} fill="none" stroke={accent} strokeWidth={4} strokeLinecap="round" data-part="" />
      <path d={`M${mid} ${cy} L${xe} ${dn}`} fill="none" stroke={dim} strokeWidth={4} strokeLinecap="round" data-part="" />
      <circle cx={mid} cy={cy} r={9} fill={accent} data-part="" />
      <circle cx={xe} cy={up} r={7} fill={accent} data-part="" />
      <circle cx={xe} cy={dn} r={7} fill="none" stroke={dim} strokeWidth={3} data-part="" />
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
      <line x1={lx} y1={ly} x2={rx} y2={ry} stroke={ink} strokeWidth={4} strokeLinecap="round" data-part="" />
      <circle cx={cx} cy={cy} r={8} fill={accent} data-part="" />
      <path d={`M${lx} ${ly} L${lx} ${ly + drop}`} stroke={hairline} strokeWidth={1.5} data-part="" />
      <path d={`M${rx} ${ry} L${rx} ${ry + drop}`} stroke={hairline} strokeWidth={1.5} data-part="" />
      <path d={bowl(lx, ly + drop, w * 0.13)} fill="none" stroke={accent} strokeWidth={3.5} strokeLinecap="round" data-part="" />
      <path d={bowl(rx, ry + drop, w * 0.13)} fill="none" stroke={dim} strokeWidth={3.5} strokeLinecap="round" data-part="" />
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
            <rect x={bx} y={y} width={bw} height={bh} fill="none" stroke={i === 0 ? accent : dim} strokeWidth={2.5} />
            <path
              d={`M${bx + bw * 0.2} ${y + bh * 0.55} L${bx + bw * 0.44} ${y + bh * 0.8} L${bx + bw * 0.82} ${y + bh * 0.2}`}
              fill="none"
              stroke={accent}
              strokeWidth={3}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <rect x={bx + bw + w * 0.05} y={y + bh * 0.36} width={barW} height={bh * 0.26} fill={ink} opacity={0.78} />
            <line x1={bx} y1={y + rowH * 0.82} x2={w * 0.94} y2={y + rowH * 0.82} stroke={hairline} strokeWidth={1} />
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
            strokeWidth={i === 0 ? 3.5 : 2}
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
      <line x1={w * 0.03} y1={baseTop} x2={w * 0.97} y2={baseTop} stroke={hairline} strokeWidth={1} />
      <line x1={w * 0.03} y1={baseBot} x2={w * 0.97} y2={baseBot} stroke={hairline} strokeWidth={1} />
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
      <line x1={w * 0.04} y1={cy} x2={w * 0.96} y2={cy} stroke={hairline} strokeWidth={1.5} />
      <line x1={cx} y1={h * 0.06} x2={cx} y2={h * 0.94} stroke={hairline} strokeWidth={1.5} />
      <path d={curve(loss)} fill="none" stroke={accent} strokeWidth={4} strokeLinecap="round" data-part="" />
      <path d={curve(gain)} fill="none" stroke={ink} strokeWidth={4} strokeLinecap="round" data-part="" />
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
      <line x1={w * 0.06} y1={base} x2={w * 0.94} y2={base} stroke={dim} strokeWidth={2} />
      <rect x={lx} y={base - h * 0.22} width={bw} height={h * 0.22} fill={ink} opacity={0.72} data-part="" />
      <rect x={rxp} y={base - h * 0.56} width={bw} height={h * 0.56} fill={accent} data-part="" />
      <text x={lx + bw / 2} y={base - h * 0.22 - 12} fontSize={15} fill={ink} textAnchor="middle" fontFamily="sans-serif" data-part="">
        捡 100
      </text>
      <text x={rxp + bw / 2} y={base - h * 0.56 - 12} fontSize={15} fill={accent} textAnchor="middle" fontFamily="sans-serif" data-part="">
        丢 100
      </text>
      <line x1={w * 0.06} y1={base - h * 0.8} x2={w * 0.94} y2={base - h * 0.8} stroke={hairline} strokeWidth={1} strokeDasharray="5 5" />
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
      <path d={`M${w * 0.06} ${h * 0.12} Q${cx * 0.7} ${h * 0.2} ${cx} ${cy}`} fill="none" stroke={ink} strokeWidth={3.5} strokeLinecap="round" data-part="" />
      <path d={`M${w * 0.06} ${h * 0.88} Q${cx * 0.7} ${h * 0.8} ${cx} ${cy}`} fill="none" stroke={accent} strokeWidth={3.5} strokeLinecap="round" data-part="" />
      <path d={`M${cx} ${cy} L${stopX} ${cy}`} fill="none" stroke={accent} strokeWidth={4.5} strokeLinecap="round" data-part="" />
      <circle cx={cx} cy={cy} r={11} fill={accent} data-part="" />
      <circle cx={cx} cy={cy} r={20} fill="none" stroke={hairline} strokeWidth={2} data-part="" />
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
      <path d={d} fill="none" stroke={ink} strokeWidth={3} data-part="" />
      {Array.from({ length: rows }, (_, i) => {
        const y = y0 + (h * 0.5 / rows) * (i + 1) + h * 0.04;
        return (
          <g key={i} data-part="">
            <text x={x0 + 14} y={y} fontSize={13} fill={dim} fontFamily="sans-serif">
              {`项 ${i + 1}`}
            </text>
            <line x1={x0 + 62} y1={y - 4} x2={x1 - 52} y2={y - 4} stroke={hairline} strokeWidth={1} strokeDasharray="3 3" />
            <line x1={x1 - 44} y1={y - 4} x2={x1 - 14} y2={y - 4} stroke={dim} strokeWidth={1.5} />
          </g>
        );
      })}
      <line x1={x0 + 14} y1={y0 + h * 0.64} x2={x1 - 14} y2={y0 + h * 0.64} stroke={ink} strokeWidth={1.5} />
      <line x1={x0 + 14} y1={y0 + h * 0.72} x2={x1 - 30} y2={y0 + h * 0.72} stroke={accent} strokeWidth={5} data-part="" />
      <text x={x0 + 14} y={y0 + h * 0.62 - 8} fontSize={13} fill={dim} fontFamily="sans-serif" data-part="">
        合计
      </text>
    </g>
  );
}

function render(c: FigCtx, kind: FigureKind): JSX.Element {
  switch (kind) {
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
  }
}

export interface FigureProps {
  kind: FigureKind;
  w: number;
  h: number;
  style?: Style;
}

export function Figure(props: FigureProps): JSX.Element {
  const { kind, w, h, style = "editorial" } = props;
  const p = PALETTE[style];
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox={`0 0 ${w} ${h}`} width={w} height={h}>
      {render({ w, h, ...p }, kind)}
    </svg>
  );
}
