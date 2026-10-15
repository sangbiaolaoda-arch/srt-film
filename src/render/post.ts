// 后期层：屏幕空间叠加。全部确定性（给定帧号必得同一结果），导出可复现。
// 只做 canvas 擅长的四种：颗粒 / 暗角 / 扫描线 / 暖色滤镜。
// 色差（chromatic aberration）刻意不在这里 —— 它需要通道分离，成本高；
// 改为在 SVG 层对文字双份偏移绘制，更便宜也更可控。

import { mulberry32 } from "../core/rng";
import type { StyleProfileId } from "../styles/style-system";

export interface PostConfig {
  /** 颗粒强度 0..1 */
  grain: number;
  /** 暗角强度 0..1 */
  vignette: number;
  /** 扫描线强度 0..1 */
  scanline: number;
  /** 暖色滤镜强度 0..1 */
  warm: number;
  /** 颗粒在深底上要更亮，浅底上更暗 —— 由调用方按风格给 */
  grainBlend?: "overlay" | "soft-light";
}

/** 编辑风：一层可感知的「纸感」+ 轻微暗角，让静止帧也有呼吸。 */
export const POST_EDITORIAL: PostConfig = { grain: 0.06, vignette: 0.12, scanline: 0, warm: 0.02 };

/** 扁平矢量叙事风：明快，略带胶片质感与暗角，但比编辑风更亮。 */
export const POST_FLATVECTOR: PostConfig = { grain: 0.11, vignette: 0.28, scanline: 0.03, warm: 0, grainBlend: "overlay" };

/** 图表动态图形风：极轻颗粒、近乎无暗角，保持「屏幕截图」般的干净数据感。 */
export const POST_CHARTMOTION: PostConfig = { grain: 0.04, vignette: 0.08, scanline: 0, warm: 0.02 };

export const POST_NONE: PostConfig = { grain: 0, vignette: 0, scanline: 0, warm: 0 };

/** 按风格档返回对应的后期配置。 */
export function postForStyle(style: StyleProfileId): PostConfig {
  switch (style) {
    case "flat-vector": return POST_FLATVECTOR;
    case "chart-motion": return POST_CHARTMOTION;
    case "editorial":
    default: return POST_EDITORIAL;
  }
}

const GRAIN_SIZE = 160;
let grainTile: HTMLCanvasElement | null = null;

function getGrainTile(): HTMLCanvasElement {
  if (grainTile) return grainTile;
  const c = document.createElement("canvas");
  c.width = GRAIN_SIZE;
  c.height = GRAIN_SIZE;
  const g = c.getContext("2d")!;
  const img = g.createImageData(GRAIN_SIZE, GRAIN_SIZE);
  const rnd = mulberry32(0x9e3779b9);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = rnd() * 255;
    img.data[i] = v;
    img.data[i + 1] = v;
    img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  grainTile = c;
  return c;
}

/** 把后期层叠到 ctx 上。frame 必须是整数帧号（保证确定性）。 */
export function applyPost(ctx: CanvasRenderingContext2D, w: number, h: number, cfg: PostConfig, frame: number): void {
  const prevOp = ctx.globalCompositeOperation;
  const prevAlpha = ctx.globalAlpha;

  if (cfg.warm > 0) {
    ctx.save();
    ctx.globalCompositeOperation = "multiply";
    ctx.globalAlpha = cfg.warm;
    ctx.fillStyle = "#c9a86a";
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }

  if (cfg.grain > 0) {
    const tile = getGrainTile();
    // 每帧偏移不同 → 颗粒「活」起来；用整数运算保证同帧必同偏移
    const ox = (Math.imul(frame, 37) % GRAIN_SIZE + GRAIN_SIZE) % GRAIN_SIZE;
    const oy = (Math.imul(frame, 91) % GRAIN_SIZE + GRAIN_SIZE) % GRAIN_SIZE;
    ctx.save();
    ctx.globalCompositeOperation = cfg.grainBlend ?? "overlay";
    ctx.globalAlpha = cfg.grain;
    ctx.translate(-ox, -oy);
    const pat = ctx.createPattern(tile, "repeat")!;
    ctx.fillStyle = pat;
    ctx.fillRect(0, 0, w + GRAIN_SIZE, h + GRAIN_SIZE);
    ctx.restore();
  }

  if (cfg.scanline > 0) {
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    ctx.globalAlpha = cfg.scanline;
    ctx.fillStyle = "#ffffff";
    for (let y = 0; y < h; y += 7) ctx.fillRect(0, y + 3, w, 1);
    ctx.restore();
  }

  if (cfg.vignette > 0) {
    const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.34, w / 2, h / 2, Math.max(w, h) * 0.78);
    g.addColorStop(0, "rgba(0,0,0,0)");
    g.addColorStop(1, `rgba(8,6,12,${cfg.vignette})`);
    ctx.save();
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }

  ctx.globalCompositeOperation = prevOp;
  ctx.globalAlpha = prevAlpha;
}
