// 单帧渲染：把「离屏 SVG 的当前状态 + 当前拍的特效」合成到一块 canvas。
// 这是 v3 的核心 —— 播放和导出调用的是同一个函数，所以两者必然一致。

import type { Shot } from "../core/shot";
import { hashSeed } from "../core/rng";
import { layerOpacity, rasterizeLayer } from "./rasterize";
import { POST_EDITORIAL, POST_POSTER, applyPost } from "./post";
import { type FxOpts, glowPulse, nestedTunnel, particleField, polyhedron } from "./effects";

export const STAGE_W = 1280;
export const STAGE_H = 720;
export const STAGE_FPS = 30;

/** 编辑风纸白底 */
export const PAPER = "#faf9f6";
/** 海报风暗底 */
export const DARK = "#0b0b0f";
/** 海报风强调色 */
export const POSTER_ACCENT = "#38e8c6";
export const POSTER_HOT = "#ff3fa4";
export const POSTER_DIM = "#46465a";

export interface FrameInput {
  ctx: CanvasRenderingContext2D;
  svg: SVGSVGElement;
  shots: Shot[];
  /** 时间轴时间（秒），不是 SRT 绝对时间 */
  t: number;
  /** 整数帧号，驱动颗粒与粒子偏移（保证确定性） */
  frame: number;
}

/** 时间轴时间 → 拍序号 */
export function shotAt(shots: Shot[], t: number): number {
  let idx = 0;
  for (let i = 0; i < shots.length; i++) {
    const start = shots[i]!.tlStart ?? shots[i]!.start;
    if (t >= start - 1e-6) idx = i;
    else break;
  }
  return idx;
}

function drawFx(ctx: CanvasRenderingContext2D, shot: Shot, t: number, w: number, h: number): void {
  const layout = shot.layout;
  const fx = layout.fx ?? "glow";
  if (fx === "none") return;

  const start = shot.tlStart ?? shot.start;
  const local = Math.max(0, t - start);
  const o: FxOpts = {
    w,
    h,
    t: local,
    dur: Math.max(shot.end - shot.start, 0.8),
    seed: (hashSeed(layout.id) ^ Math.imul(shot.content.beat, 7919)) >>> 0,
    accent: layout.fxAccent ?? POSTER_ACCENT,
    ink: POSTER_DIM,
    dim: POSTER_DIM,
  };
  const strength = layout.fxStrength ?? 0.6;

  switch (fx) {
    case "particles-converge": particleField(ctx, o, "converge", 380); break;
    case "particles-vortex": particleField(ctx, o, "vortex", 300); break;
    case "particles-burst": particleField(ctx, o, "burst", 340); break;
    case "polyhedron": polyhedron(ctx, o, 0.24); break;
    case "tunnel": nestedTunnel(ctx, o, 2.3, 9); break;
    case "glow": break;
    default: break;
  }
  glowPulse(ctx, o, strength);
}

/** 把一帧画进 ctx。调用前需先把 GSAP 时间轴 seek 到位。
 *  输出尺寸跟随 ctx.canvas，光栅化也按该分辨率进行（放大不错、缩小不糊）。 */
export async function renderFrame(input: FrameInput): Promise<void> {
  const { ctx, svg, shots, t, frame } = input;
  const W = ctx.canvas.width;
  const H = ctx.canvas.height;
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";

  const active = shotAt(shots, t);
  const shot = shots[active];
  const style = shot?.layout.style ?? "editorial";

  const bgOf = (s?: Shot): string =>
    s?.layout.paper ?? ((s?.layout.style ?? "editorial") === "poster" ? DARK : PAPER);

  // 1. 底色。
  // 相邻两拍交叠 0.25s（下一拍的入场与上一拍的出场同时进行）。底色**不能**在这 0.25s
  // 的起点瞬切到下一拍：此刻上一拍的图层还立着（出场动效到 tlEnd 才结束），它的深色字
  // 一旦压在下一拍的浅底色上（或反过来）就两边都看不见 —— 实测 8 个跨风格转场里 7 个
  // 会闪出 3~7 帧空屏（内容像素占比最低掉到 0.02%）。这跟 stage.tsx「交叠 0.25s →
  // 交叉溶解，无黑场」的声明是矛盾的。
  // 所以底色也参与交叉溶解：先铺上一拍的底色，再按**这一拍入场图层的不透明度**把这一拍
  // 的底色叠上去。同风格转场两色相同，只走一次 fillRect，与改动前逐像素一致。
  const bg = bgOf(shot);
  const bgPrev = bgOf(shots[active - 1]);
  if (bg === bgPrev) {
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);
  } else {
    ctx.fillStyle = bgPrev;
    ctx.fillRect(0, 0, W, H);
    ctx.save();
    ctx.globalAlpha = Math.min(1, Math.max(0, layerOpacity(svg, active)));
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }

  // 2. 海报风：canvas 特效（背景层，在文字之下）
  if (style === "poster" && shot) drawFx(ctx, shot, t, W, H);

  // 3. SVG 层：只画真正可见的（通常 1 层，交叉溶解期 2 层）
  const lo = Math.max(0, active - 1);
  const hi = Math.min(shots.length - 1, active + 1);
  for (let i = lo; i <= hi; i++) {
    const op = layerOpacity(svg, i);
    if (op <= 0.012) continue;
    const img = await rasterizeLayer(svg, i, W, H);
    if (!img) continue;
    ctx.save();
    ctx.globalAlpha = op;
    ctx.drawImage(img, 0, 0, W, H);
    ctx.restore();
  }

  // 4. 后期层
  applyPost(ctx, W, H, style === "poster" ? POST_POSTER : POST_EDITORIAL, frame);
}
