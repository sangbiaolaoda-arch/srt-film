// 跨镜头连续性层（Phase 7）：前一镜头的形状/位置/颜色向下一镜头继承或转化。
//
// 做法：每拍带一个「母版标记」（motif）—— 形状与角落按叙事角色定（角色即镜头
// 任务，标记承载任务语汇），色调按是否带主数字定（数字是跨拍继承最常见的载体）。
// 当本拍与上一拍共享数字（shot.continuity 非空）时，本拍画面画出上一拍标记的
// ghost（形状/位置/颜色全部继承上拍，包括上拍的风格档取色），再用虚线接到本拍
// 标记 —— 继承关系直接可见，且可被抽样检查（见 tests/continuity.test.ts）。
//
// 画在 canvas 上而不是 SVG 层里：renderFrame 是预览与导出唯一的共用入口，
// 且 v2 满版板（custom）绕过 DecorLayer，只有 canvas 叠加层能无差别覆盖两类版式。

import type { Shot } from "../core/shot";
import type { NarrativeRole } from "../core/compose";
import { resolveProfile } from "../styles/style-system";
import { MOTION_BY_ID } from "../motion/catalog";
import { STAGE_W, STAGE_H } from "./frame";

/** 两色按 t 线性插值（#rrggbb → #rrggbb）。继承标记在转场窗口里从「上拍色」migrate 到
 *  「本拍色」，让观众看到颜色承接，不只是形状到位。 */
function lerpColor(a: string, b: string, t: number): string {
  const pa = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(a);
  const pb = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(b);
  if (!pa || !pb) return a;
  const c = (i: number) => Math.round(parseInt(pa[i]!, 16) + (parseInt(pb[i]!, 16) - parseInt(pa[i]!, 16)) * t);
  return `#${[1, 2, 3].map((i) => c(i).toString(16).padStart(2, "0")).join("")}`;
}

const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
/** 位置/颜色迁移用 inOutCubic：两端慢、中间快，落位感更像「滑过去」而非「淡过去」。 */
const EASE = { inOutCubic: (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2) };

export type MotifShape = "circle" | "square" | "bar" | "split" | "triangle" | "arrow" | "ring";
export type MotifCorner = "tl" | "tr" | "bl" | "br";
export type MotifTone = "ink" | "accent";

export interface Motif {
  shape: MotifShape;
  corner: MotifCorner;
  tone: MotifTone;
}

/** 角色 → 形状：七个角色七种形状，互异（相邻拍角色不同时标记必然不同）。 */
const ROLE_SHAPE: Record<NarrativeRole, MotifShape> = {
  hook: "circle",
  definition: "square",
  evidence: "bar",
  comparison: "split",
  explanation: "triangle",
  consequence: "arrow",
  conclusion: "ring",
};

/** 角色 → 角落：固定表，不轮转 —— 同一角色在全片里始终占同一个角落，继承才有锚点。
 *  约束（qa-frames 实测后加的）：HANDOFF 的每一个承接对都必须跨角 —— 否则 ghost
 *  与自标记同角重叠、连接线零长度，「继承」退化成「一个标记换形状」。
 *  角落是 4 个、角色是 7 个，必有角色共享角落；能共享的只能是**没有 HANDOFF 边**
 *  的配对（否则继承退化）。现表下 14 个承接对全部跨角；共享角落的配对
 *  （hook/evidence 同 tl、definition/explanation 同 br、comparison/conclusion 同 tr）
 *  之间都无承接边。
 *  历史：曾为解锁 definition→consequence 把 definition 从 tr 改到 br —— 原先
 *  definition 与 consequence 同占 tr，那条边永远跨不了角，推论拍在论证段接不上前拍。
 *  开场（hook）与定版（conclusion）分占 tl/tr，首尾不再同角（附带的语汇红利让位给
 *  论证链连续性，更值得）。 */
const ROLE_CORNER: Record<NarrativeRole, MotifCorner> = {
  hook: "tl",
  definition: "br",
  evidence: "tl",
  comparison: "tr",
  explanation: "br",
  consequence: "bl",
  conclusion: "tr",
};

/** 母版标记：纯函数。同 shot 进同 motif 出 —— seek 确定性的第一来源。 */
export function motifOf(shot: Shot): Motif {
  const role = shot.narrative?.role ?? "explanation";
  return {
    shape: ROLE_SHAPE[role] ?? "triangle",
    corner: ROLE_CORNER[role] ?? "tl",
    tone: shot.content.bignum ? "accent" : "ink",
  };
}

export interface ContinuityFrame {
  /** 本拍自己的标记 */
  self: Motif;
  /** 继承来的上一拍标记（continuity 非空且存在上一拍时才有） */
  ghost?: { motif: Motif; shared: string[] };
}

/** 连续性决策：纯函数。任意 seek 到同一拍得到同一描述（无时间依赖、无累积状态）。 */
export function continuityAt(shots: Shot[], active: number): ContinuityFrame | undefined {
  const shot = shots[active];
  if (!shot) return undefined;
  const self = motifOf(shot);
  const prev = active > 0 ? shots[active - 1] : undefined;
  const shared = shot.continuity;
  if (!prev || !shared || shared.length === 0) return { self };
  return { self, ghost: { motif: motifOf(prev), shared } };
}

/** 标记中心（舞台坐标 1280×720）：四角外框带 —— 64px 版心边距之外，
 *  与 decor 的角标（registration marks）同一语汇，不抢内容。 */
const CORNER_POS: Record<MotifCorner, [number, number]> = {
  tl: [36, 36],
  tr: [1244, 36],
  bl: [36, 684],
  br: [1244, 684],
};
const R = 14;

function drawShape(
  ctx: CanvasRenderingContext2D,
  shape: MotifShape,
  cx: number,
  cy: number,
  r: number,
  color: string,
  alpha: number,
  hollow: boolean,
): void {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1.5, r * 0.3);
  ctx.beginPath();
  switch (shape) {
    case "circle":
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      break;
    case "square":
      ctx.rect(cx - r * 0.86, cy - r * 0.86, r * 1.72, r * 1.72);
      break;
    case "bar":
      ctx.rect(cx - r, cy - r * 0.34, r * 2, r * 0.68);
      break;
    case "split":
      ctx.rect(cx - r * 0.92, cy - r * 0.86, r * 0.78, r * 1.72);
      ctx.rect(cx + r * 0.14, cy - r * 0.86, r * 0.78, r * 1.72);
      break;
    case "triangle":
      ctx.moveTo(cx, cy - r);
      ctx.lineTo(cx + r * 0.92, cy + r * 0.75);
      ctx.lineTo(cx - r * 0.92, cy + r * 0.75);
      ctx.closePath();
      break;
    case "ring":
      ctx.arc(cx, cy, r * 0.7, 0, Math.PI * 2);
      ctx.stroke(); // 环永远是空心：实心环就和圆无异
      ctx.restore();
      return;
    case "arrow": {
      const w = r * 0.42;
      ctx.moveTo(cx - r, cy);
      ctx.lineTo(cx + r * 0.5, cy);
      ctx.moveTo(cx + r * 0.5, cy - w);
      ctx.lineTo(cx + r, cy);
      ctx.lineTo(cx + r * 0.5, cy + w);
      ctx.stroke(); // 箭头是线条语汇，不填充
      ctx.restore();
      return;
    }
  }
  if (hollow) ctx.stroke();
  else ctx.fill();
  ctx.restore();
}

/** 把连续性画进 ctx。调用点：renderFrame 的 SVG 层之后、后期层之前。
 *  t 用于转场窗口内的形态继承 morph（继承标记迁移到本拍角 + 颜色承接）。 */
export function drawContinuity(
  ctx: CanvasRenderingContext2D,
  shots: Shot[],
  active: number,
  W: number,
  H: number,
  t = 0,
): void {
  const frame = continuityAt(shots, active);
  if (!frame) return;
  const shot = shots[active]!;
  const kx = W / STAGE_W;
  const ky = H / STAGE_H;
  const k = W / STAGE_W;
  const p = resolveProfile(shot.layout.style);

  const [sx, sy] = CORNER_POS[frame.self.corner];
  const scx = sx * kx;
  const scy = sy * ky;

  if (frame.ghost) {
    const prev = shots[active - 1]!;
    // ghost 用上一拍的风格档取色 —— 「颜色继承」的字面含义：继承过来的东西
    // 保持它自己的颜色，而不是被本拍风格重新染色。
    const pp = resolveProfile(prev.layout.style);
    const [gx, gy] = CORNER_POS[frame.ghost.motif.corner];
    let gcx = gx * kx;
    let gcy = gy * ky;
    let ghostColor = pp.tone[frame.ghost.motif.tone]!;
    let ghostAlpha = 0.26;

    // 转场窗口内的「形态继承」morph（方法论 §6：遮罩只能隐藏切换，形态继承/运动承接
    // 才能构成更深的连续性）。m-shape-match 的 0.55s 窗口里，继承标记从它自己的角
    // **迁移**到本拍标记的角，颜色也 lerp 到本拍色 —— 观众看到的是「上拍标记变成下拍
    // 标记」，而不是角落里一个静止的 ghost 配一次交叉溶解。窗口结束后回落到静态角 ghost。
    const morphDur = MOTION_BY_ID.get("m-shape-match")?.dur ?? 0.55;
    const winStart = shot.tlStart ?? shot.start;
    const mt = clamp((t - winStart) / morphDur, 0, 1);
    if (mt > 0 && mt < 1) {
      const e = EASE.inOutCubic(mt);
      const [sxRaw, syRaw] = CORNER_POS[frame.self.corner];
      gcx = lerp(gcx, sxRaw * kx, e);
      gcy = lerp(gcy, syRaw * ky, e);
      ghostColor = lerpColor(ghostColor, p.tone[frame.self.tone]!, e);
      // 迁移途中更亮（它就是此刻的视觉焦点），末端落位时淡出 —— 直接并回本拍实面标记，
      // 不回弹到静态角 ghost（否则窗口尾会「啪」地跳回角落，观众看到一次硬跳变）。
      // alpha：0.55（起点，半透承接）→ 0.85（中段，焦点）→ 0（落位，被实面标记接管）。
      ghostAlpha = lerp(0.55, 0.85, Math.min(1, mt * 2)) * (1 - e);
    }

    // 连接线：上一拍标记 → 本拍标记（继承的视觉证据）。morph 时线随 ghost 起点移动。
    // 参数经画素探针标定：2.5px/0.55 虚线在色带上方可辨（1.5px/0.3 几乎不可读）。
    ctx.save();
    ctx.globalAlpha = 0.55;
    ctx.strokeStyle = p.tone.dim;
    ctx.lineWidth = Math.max(2, 2.5 * k);
    ctx.setLineDash([9 * k, 7 * k]);
    ctx.beginPath();
    ctx.moveTo(gcx, gcy);
    ctx.lineTo(scx, scy);
    ctx.stroke();
    ctx.restore();
    drawShape(ctx, frame.ghost.motif.shape, gcx, gcy, R * k, ghostColor, ghostAlpha, true);
  }

  drawShape(ctx, frame.self.shape, scx, scy, R * k, p.tone[frame.self.tone], 0.62, false);
}
