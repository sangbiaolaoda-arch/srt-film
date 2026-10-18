// 语义切片共享几何（方案 §4 Phase 1/3）。
//
// 此前 px/union/center 在 compare-slice / causal-slice 各抄一份，Phase 3 剩余
// 三族（否定/转折/变化）继续用同一套数学 —— 抽到一处，防止五份副本漂移。
// 网格口径与 constraints.ts 的 slotBox 一致：12×8 归一化网格 → 1280×720 画面。
//
// 双侧几何模板（净空口径，rel-clearance-groups 要求两组包围盒 ≥40px）：
//   组盒 = 图形盒 ∪ 标签盒，标签盒比图形盒宽（视觉上居中于图形之下），
//   所以左右两组之间最接近的是「右侧标签左缘 vs 左侧标签右缘」。
//   初版把图形放在 [1.4..4.5] 而标签放在 [1.15..4.75]，两标签只差 36px，运动中还会
//   互相叠 13px（实测报错）—— 内收成图形 [1.6..4.3]、标签 [1.35..4.55]，
//   于是两组标签之间净空 40px，图形之间净空远超 40px。
//   右侧有两档：RIGHT_EQUAL（等权重，因果结果位）与 RIGHT_BIG（强调位，
//   compare 主体 / 否定确证方 / 转折转折方 / 变化之后方共用 —— largerThan 的几何来源）。

import { stripPunct } from "../core/text";
import type { Box } from "../motion/elements";

export const COLS = 12;
export const ROWS = 8;
export const W = 1280;
export const H = 720;

export type GridBox = [number, number, number, number];

export function px(box: GridBox): Box {
  const [gx, gy, gw, gh] = box;
  return { x: (gx / COLS) * W, y: (gy / ROWS) * H, w: (gw / COLS) * W, h: (gh / ROWS) * H };
}

export function union(a: Box, b: Box): Box {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
}

export function center(b: Box): { x: number; y: number } {
  return { x: b.x + b.w / 2, y: b.y + b.h / 2 };
}

export function widthOf(text: string): number {
  let n = 0;
  for (const ch of text) n += ch.codePointAt(0)! > 0xff ? 1 : 0.5;
  return n;
}

export const LEFT = {
  figure: [1.6, 2.6, 2.7, 2.4] as GridBox,
  label: [1.35, 5.12, 3.2, 0.62] as GridBox,
};
export const RIGHT_EQUAL = {
  figure: [7.6, 2.6, 2.7, 2.4] as GridBox,
  label: [7.35, 5.12, 3.2, 0.62] as GridBox,
};
export const RIGHT_BIG = {
  // 强调位：更大（largerThan 的几何来源），label 也宽一档
  figure: [7.7, 2.45, 2.9, 2.7] as GridBox,
  label: [7.45, 5.3, 3.5, 0.68] as GridBox,
};

/** 中缝连线：桥接左侧图形右缘(~4.55 格)与右侧组左缘，垂直居中对齐图形中心(~342px)。
 *  右端收在 7.25 格(773px)——对 RIGHT_EQUAL 标签左缘(7.35 格)留 10px 净空，
 *  对更宽的 RIGHT_BIG 标签左缘(7.45 格)留 21px。初版伸到 7.6 格会与结果标签重叠。 */
export const CONN: GridBox = [4.8, 3.75, 2.45, 0.12];

/** 标签最大字宽（字宽单位，全角 1 / 半角 0.5）。超过则截断，截断记进 degraded。 */
export const LABEL_MAX_UNITS = 10;

/** 标签安全截断（不改写原文，只剥句读符号；截断与否由调用方记 degraded）。 */
export function labelOf(name: string): { label: string; truncated: boolean } {
  const clean = stripPunct(name);
  if (widthOf(clean) <= LABEL_MAX_UNITS) return { label: clean, truncated: false };
  let out = "";
  let u = 0;
  for (const ch of clean) {
    const w = ch.codePointAt(0)! > 0xff ? 1 : 0.5;
    if (u + w > LABEL_MAX_UNITS) break;
    out += ch;
    u += w;
  }
  return { label: out, truncated: true };
}
