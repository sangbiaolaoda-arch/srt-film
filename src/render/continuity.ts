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
import { STAGE_W, STAGE_H } from "./frame";

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
 *  现表下 8 个承接对全部跨角；开场（hook）与定版（conclusion）同占左上，
 *  首尾呼应是附带的语汇红利。 */
const ROLE_CORNER: Record<NarrativeRole, MotifCorner> = {
  hook: "tl",
  definition: "tr",
  evidence: "br",
  comparison: "bl",
  explanation: "bl",
  consequence: "tr",
  conclusion: "tl",
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

/** 把连续性画进 ctx。调用点：renderFrame 的 SVG 层之后、后期层之前。 */
export function drawContinuity(
  ctx: CanvasRenderingContext2D,
  shots: Shot[],
  active: number,
  W: number,
  H: number,
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
    const gcx = gx * kx;
    const gcy = gy * ky;
    // 连接线：上一拍标记 → 本拍标记（继承的视觉证据）。
    // 参数经画素探针标定：1.5px/alpha 0.3 的细虚线落在色带噪声底以下（实测
    // x=36 列与邻列无差异），继承关系等于没画 —— 加到 2.5px/0.55 才可读。
    // 连接线：上一拍标记 → 本拍标记（继承的视觉证据）。2.5px/0.55 虚线：
    // 1.5px/0.3 在色带上几乎不可读（继承关系等于没画），这一档经画素探针
    // 在正确拍上复测可辨（x=36 列系统性暗于参照列）。
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
    drawShape(ctx, frame.ghost.motif.shape, gcx, gcy, R * k, pp.tone[frame.ghost.motif.tone], 0.26, true);
  }

  drawShape(ctx, frame.self.shape, scx, scy, R * k, p.tone[frame.self.tone], 0.62, false);
}
