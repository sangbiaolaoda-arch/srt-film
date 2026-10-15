// 单帧渲染：把「离屏 SVG 的当前状态 + 当前拍的特效」合成到一块 canvas。
// 这是 v3 的核心 —— 播放和导出调用的是同一个函数，所以两者必然一致。

import type { Shot } from "../core/shot";
import { hashSeed } from "../core/rng";
import { layerOpacity, rasterizeLayer } from "./rasterize";
import { applyPost, postForStyle } from "./post";
import { drawContinuity } from "./continuity";
import { type FxOpts, driftMotes, glowPulse, gridPulse, nestedTunnel, paperSheen, particleField, polyhedron } from "./effects";
import { ensurePhoto } from "../assets/photos";
import { resolveProfile } from "../styles/style-system";

export const STAGE_W = 1280;
export const STAGE_H = 720;
export const STAGE_FPS = 30;

export interface FrameInput {
  ctx: CanvasRenderingContext2D;
  svg: SVGSVGElement;
  shots: Shot[];
  /** 时间轴时间（秒），不是 SRT 绝对时间 */
  t: number;
  /** 整数帧号，驱动颗粒与粒子偏移（保证确定性） */
  frame: number;
}

/** 拍内机位缩放：预览在 stage.tsx 套在舞台 SVG 上，导出链路（rasterizeLayer）不序列化它，
 *  所以这里在绘制每层时补上，保证预览/导出同源。scaleFrom→scaleTo 随拍内进度线性插值。 */
export function cameraScale(shot: Shot | undefined, t: number): number {
  const cam = shot?.layout.camera;
  if (!cam) return 1;
  const start = shot.tlStart ?? shot.start;
  const local = Math.max(0, t - start);
  const dur = Math.max(shot.end - shot.start, 0.8);
  const p = Math.min(1, Math.max(0, local / dur));
  const from = cam.scaleFrom ?? 1;
  const to = cam.scaleTo ?? from;
  return from + (to - from) * p;
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

/** 把版式上的 fxAccent（"ember"/"steel"/"accent" 等 profile 色键）解析成实际颜色。 */
function fxAccentOf(layout: Shot["layout"]): string {
  const p = resolveProfile(layout.style);
  const key = layout.fxAccent;
  if (key && key in p) return (p as unknown as Record<string, string>)[key]!;
  return p.ember;
}

/** 底色是否亮：相对亮度 > 0.55。三系名义底色都在 0.9 以上；暗底定版式会低到 0.15 以下。
 *  判据取**这一拍的实际底色**（layout.paper 覆写优先），不是 profile 的名义底色。 */
function isLightPaper(hex: string): boolean {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.55;
}

function drawFx(ctx: CanvasRenderingContext2D, shot: Shot, t: number, w: number, h: number): void {
  const layout = shot.layout;
  const fx = layout.fx ?? "glow";
  if (fx === "none") return;

  const start = shot.tlStart ?? shot.start;
  const local = Math.max(0, t - start);
  const p = resolveProfile(layout.style);
  const o: FxOpts = {
    w,
    h,
    t: local,
    dur: Math.max(shot.end - shot.start, 0.8),
    seed: (hashSeed(layout.id) ^ Math.imul(shot.content.beat, 7919)) >>> 0,
    accent: fxAccentOf(layout),
    ink: p.tone.dim,
    dim: p.tone.dim,
    onLight: isLightPaper(layout.paper ?? p.paper),
  };
  const strength = layout.fxStrength ?? 0.6;

  switch (fx) {
    case "particles-converge": particleField(ctx, o, "converge", 540); break;
    case "particles-vortex": particleField(ctx, o, "vortex", 440); break;
    case "particles-burst": particleField(ctx, o, "burst", 480); break;
    case "polyhedron": polyhedron(ctx, o, 0.24); break;
    case "tunnel": nestedTunnel(ctx, o, 2.3, 9); break;
    case "glow": break;
    // 数量跟着 density token 走（编辑风 154 / 扁平风 190）：浮尘的「密度」和装饰层
    // 的网格疏密是同一个旋钮，不该各定一套。
    case "drift-motes": driftMotes(ctx, o, Math.round(70 + p.density * 240), strength); break;
    case "grid-pulse": gridPulse(ctx, o, 40, strength); break;
    case "paper-sheen": paperSheen(ctx, o, strength); break;
    default: break;
  }
  // 光晕只跟光效系 fx：浮尘／脉冲／掠光是「素底上的呼吸」，再叠中央一团暖色就变脏了。
  if (fx !== "drift-motes" && fx !== "grid-pulse" && fx !== "paper-sheen") glowPulse(ctx, o, strength);
}

/**
 * 图像层（baseline-audit 缺陷 6）：photo 槽的真照片，画在 SVG 之下 —— 照片是底，
 * 文字与图形浮在其上。必须由 canvas 直画：rasterize.ts 走「SVG 序列化 → blob →
 * new Image()」，而浏览器规定 SVG 以 image 方式加载时不能引用任何外部资源，
 * 照片进不了那条管线（这也是素材层一直禁 <image> 的根因）。
 * 随所属图层的不透明度走（交叉溶解时照片跟着一起淡入淡出），并继承该拍的机位缩放。
 */
async function drawPhotos(ctx: CanvasRenderingContext2D, shot: Shot, op: number, W: number, H: number, t: number): Promise<void> {
  if (op <= 0.012) return;
  const layout = shot.layout;
  const cols = layout.cols ?? 12;
  const rows = layout.rows ?? 8;
  const prof = resolveProfile(layout.style);
  const paper = layout.paper ?? prof.paper;
  const cam = cameraScale(shot, t);

  for (const slot of layout.slots) {
    if (slot.k !== "photo") continue;
    const id = slot.photo ?? shot.photo;
    if (!id) continue;
    const img = await ensurePhoto(id);
    const [gx, gy, gw, gh] = slot.box;
    const x = (gx / cols) * W;
    const y = (gy / rows) * H;
    const bw = (gw / cols) * W;
    const bh = (gh / rows) * H;

    ctx.save();
    if (cam !== 1) {
      ctx.translate(W / 2, H / 2);
      ctx.scale(cam, cam);
      ctx.translate(-W / 2, -H / 2);
    }
    ctx.beginPath();
    ctx.rect(x, y, bw, bh);
    ctx.clip();
    if (img) {
      // cover 铺满 + 焦点裁切（crop 0..1：0 贴左/上，1 贴右/下，缺省居中）
      const [cx, cy] = slot.crop ?? [0.5, 0.5];
      const k = Math.max(bw / img.naturalWidth, bh / img.naturalHeight);
      const dw = img.naturalWidth * k;
      const dh = img.naturalHeight * k;
      ctx.globalAlpha = op;
      ctx.drawImage(img, x + (bw - dw) * cx, y + (bh - dh) * cy, dw, dh);
    } else {
      // 照片没加载出来（只可能是故障）：素色块降级 —— 画面仍是完整的，且每次运行一致
      ctx.globalAlpha = op;
      ctx.fillStyle = prof.tone.dim;
      ctx.fillRect(x, y, bw, bh);
    }
    // 纸色罩：把照片压回纸面调性，深色字才压得住（编辑风的「克制」：图要像印上去的）
    const tint = slot.tint ?? 0.5;
    if (tint > 0) {
      ctx.globalAlpha = tint * op;
      ctx.fillStyle = paper;
      ctx.fillRect(x, y, bw, bh);
    }
    ctx.restore();
  }
}

/** 把一帧画进 ctx。调用前需先把 GSAP 时间轴 seek 到位。
 *  输出尺寸跟随 ctx.canvas，光栅化也按该分辨率进行（放大不错、缩小不糊）。 */
export async function renderFrame(input: FrameInput): Promise<void> {  const { ctx, svg, shots, t, frame } = input;
  const W = ctx.canvas.width;
  const H = ctx.canvas.height;
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";

  const active = shotAt(shots, t);
  const shot = shots[active];
  const style = shot?.layout.style ?? "editorial";

  const bgOf = (s?: Shot): string =>
    s?.layout.paper ?? resolveProfile(s?.layout.style).paper;

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

  // 可见层窗口（交叉溶解期最多 2 层）：图像层与 SVG 层共用同一个窗口。
  const lo = Math.max(0, active - 1);
  const hi = Math.min(shots.length - 1, active + 1);

  // 1.5 图像层（缺陷 6）：photo 槽的真照片。在 SVG 之下、底色之上 —— 照片是底。
  //  交叉溶解期两层各画各的（各自跟随所属图层的不透明度）。
  for (let i = lo; i <= hi; i++) {
    const shot2 = shots[i]!;
    if (!shot2.layout.slots.some((sl) => sl.k === "photo")) continue;
    await drawPhotos(ctx, shot2, layerOpacity(svg, i), W, H, t);
  }

  // 2. SVG 层：只画真正可见的（通常 1 层，交叉溶解期 2 层）
  for (let i = lo; i <= hi; i++) {
    const op = layerOpacity(svg, i);
    if (op <= 0.012) continue;
    const img = await rasterizeLayer(svg, i, W, H);
    if (!img) continue;
    const s = cameraScale(shots[i], t);
    ctx.save();
    if (s !== 1) {
      ctx.translate(W / 2, H / 2);
      ctx.scale(s, s);
      ctx.translate(-W / 2, -H / 2);
    }
    ctx.globalAlpha = op;
    ctx.drawImage(img, 0, 0, W, H);
    ctx.restore();
  }

  // 2.5 跨镜头连续性层（Phase 7）：与上一拍共享数字时，上一拍的母版标记以 ghost
  // 形态（形状/位置/颜色全继承上拍）进入本拍，虚线接到本拍标记 ——「前一镜头的
  // 形状/位置/颜色向下一镜头继承」由此可见、可抽样检查。canvas 直画：预览与导出
  // 同走 renderFrame，同一描述同一像素；v2 满版板（custom）也照常覆盖。
  // 位置压在特效层之下：继承标记是**内容**，不该被前景浮尘盖住。
  if (shot) drawContinuity(ctx, shots, active, W, H);

  // 3. canvas 特效层：画在**内容之上**、后期之下 —— 「镜头前的空气」。
  //    此前它在 SVG 之下，实测被满版板整个盖住（strata 五条色带铺满 1360×760，
  //    开/关特效的像素差是 0.000），素底板也只能从空白缝隙里透出一点。浮尘与粒子
  //    在真实镜头里本就在前景，放在内容之上既合语汇，也让 19 个板式的动效一致可见。
  if (shot && shot.layout.fx && shot.layout.fx !== "none") drawFx(ctx, shot, t, W, H);

  // 4. 后期层
  applyPost(ctx, W, H, postForStyle(style), frame);
}
