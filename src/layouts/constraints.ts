// 布局约束引擎（Phase 6 第一刀）：槽位几何边界 + 实体重叠 + 文字装载量估算。
//
// 纯函数、无 DOM —— plan() 门禁（src/core/plan.ts）与测试共用。
// custom 满版画面（v2 板 / 专属场景）自己管构图与断行，不在此查（与 plan.ts 的
// skipHeadlineWidth 同思路）。
//
// 三类检查：
//   ① 画布边界（硬错误）：槽位框不得超出 1280×720 —— 出去的部分在成片里直接丢失。
//   ② 实体重叠（告警）：panel/chart/figure/bignum 等占空间的槽互相压。文字浮在
//      panel 上是构图不是碰撞，所以文字槽不参与重叠判定。
//   ③ 文字装载量（硬错误/告警）：用与渲染器同一把尺子（core/text 的 FONT_SIZE +
//      wrapText）估算文字排完占多高；超出槽高 1.25 倍是硬错误（必然裁切/出画），
//      超出 1 倍是告警（贴边，还能看）。
//
// 阈值是启发式不是证明：估算按全角 1 / 半角 0.55 字宽，真实字体度量会有出入。
// 它的职责是「不让明显的溢出静默发生」，不是替代浏览器实测。

import type { Layout, RenderContent, Slot, SlotKind } from "./types";
import { FONT_SIZE, wrapText, stripPunct } from "../core/text";
import { displayHeadline } from "../core/compose";

export const STAGE_W = 1280;
export const STAGE_H = 720;

export interface Box { x: number; y: number; w: number; h: number }

/** 槽位归一化网格 → 画面坐标。与 render.tsx SlotNode 同一套数学（12×8 → 1280×720）。 */
export function slotBox(slot: Slot, cols = 12, rows = 8): Box {
  const [gx, gy, gw, gh] = slot.box;
  return {
    x: (gx / cols) * STAGE_W,
    y: (gy / rows) * STAGE_H,
    w: (gw / cols) * STAGE_W,
    h: (gh / rows) * STAGE_H,
  };
}

/** 占空间的实体槽（互相压才算问题）。frame/vignette 是边框、rule/divider 是细条，
 *  内容是它们的「内部」而不是碰撞方；bignum/num2 是数字文字（浮在 panel 上是
 *  卡片设计）—— 都不进此表。 */
const SOLID_KINDS: ReadonlySet<SlotKind> = new Set<SlotKind>([
  "panel", "chart", "figure", "image", "asset", "device", "icon",
  "dotmatrix", "clock", "calendar", "photo",
]);

/** 真正渲染文字的槽（与 render.tsx SlotNode 的 default/文本分支对齐）。
 *  rule/divider/arrow/progress/axis 等结构件不渲染文字；delta 渲染算出来的 +N%；
 *  tags/pills 是逐格切片文字（另有一套自适应）—— 都不在此查。 */
const TEXT_KINDS: ReadonlySet<SlotKind> = new Set<SlotKind>([
  "headline", "text", "quote", "caption", "subhead", "attribution", "source",
  "unit", "literal", "badge", "kicker", "label", "meta", "bignum", "num2",
  "bullets", "listnum", "checklist",
]);

export interface LayoutReport {
  /** 硬错误：进 plan() 的 problems 门禁（不拦截等于静默丢失画面元素） */
  errors: string[];
  /** 告警：进调试面板/干跑报告，不拦截播放 */
  warnings: string[];
}

const TOL = 2; // px 容差：抗浮点与作者满版意图（panel 贴边是常见构图）

export function checkLayout(layout: Layout, content?: RenderContent): LayoutReport {
  const errors: string[] = [];
  const warnings: string[] = [];
  const cols = layout.cols ?? 12;
  const rows = layout.rows ?? 8;
  const boxes = layout.slots.map((s) => slotBox(s, cols, rows));

  // ① 画布边界 + 退化尺寸
  layout.slots.forEach((slot, i) => {
    const b = boxes[i]!;
    if (b.w <= 0 || b.h <= 0) {
      errors.push(`槽 ${i}（${slot.k}）尺寸退化：${b.w.toFixed(0)}×${b.h.toFixed(0)}px`);
      return;
    }
    if (b.x < -TOL || b.y < -TOL || b.x + b.w > STAGE_W + TOL || b.y + b.h > STAGE_H + TOL) {
      errors.push(
        `槽 ${i}（${slot.k}）超出画布：x=${b.x.toFixed(0)} y=${b.y.toFixed(0)} ${b.w.toFixed(0)}×${b.h.toFixed(0)}（画布 ${STAGE_W}×${STAGE_H}）`,
      );
    }
  });

  // ② 实体重叠（重叠面积超过较小者的 5% 才报 —— 贴边摆放是常见意图）
  const solids = boxes
    .map((b, i) => ({ b, i }))
    .filter(({ i }) => SOLID_KINDS.has(layout.slots[i]!.k));
  for (let a = 0; a < solids.length; a++) {
    for (let c = a + 1; c < solids.length; c++) {
      const A = solids[a]!, B = solids[c]!;
      const ov = overlapArea(A.b, B.b);
      const min = Math.min(area(A.b), area(B.b));
      if (min > 0 && ov / min > 0.05) {
        warnings.push(
          `实体槽 ${A.i}（${layout.slots[A.i]!.k}）与 ${B.i}（${layout.slots[B.i]!.k}）重叠 ${Math.round((ov / min) * 100)}%`,
        );
      }
    }
  }

  // ③ 文字装载量（有 content 才查 —— 没有内容就无从估算）
  if (content) {
    layout.slots.forEach((slot, i) => {
      if (!TEXT_KINDS.has(slot.k)) return;
      const b = boxes[i]!;
      const msg = textFit(slot, b, content);
      if (!msg) return;
      // "!" 前缀 = 硬错误（渲染器必然裁切/出画）；其余 = 告警
      const body = `槽 ${i}（${slot.k}）${msg.startsWith("!") ? msg.slice(1) : msg}`;
      (msg.startsWith("!") ? errors : warnings).push(body);
    });
  }

  return { errors, warnings };
}

function area(b: Box): number {
  return Math.max(0, b.w) * Math.max(0, b.h);
}

function overlapArea(a: Box, b: Box): number {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}

/** 与 render.tsx slotText 同映射（镜像自 2026-10-15；改渲染映射时同步这里）。 */
function slotTextOf(slot: Slot, c: RenderContent): string {
  if (slot.literal) return slot.literal;
  switch (slot.src) {
    case "headline": return c.headline;
    case "subhead": return c.subhead ?? c.caption ?? c.headline;
    case "caption": return c.caption ?? c.subhead ?? c.headline;
    case "left": return c.left ?? c.headline;
    case "right": return c.right ?? c.caption ?? c.headline;
    case "bignum": return c.bignum ?? "";
    case "none": return "";
    default: break;
  }
  switch (slot.k) {
    case "headline": case "text": case "quote": return c.headline;
    case "subhead": return c.subhead ?? c.caption ?? c.headline;
    case "kicker": case "label": case "badge": case "meta": return "";
    case "bignum": return c.bignum ?? "";
    case "unit": return c.unit ?? "";
    case "caption": return c.caption ?? c.headline;
    case "attribution": return c.caption ?? "旁白";
    case "source": return "数据来自旁白";
    default: return c.headline;
  }
}

/** 与 render.tsx items() 同映射。 */
function itemsOf(content: RenderContent, n: number): string[] {
  const src = content.bullets.filter(Boolean);
  if (src.length >= 1) return src.slice(0, n);
  return [content.headline];
}

/**
 * 文字装载量估算。返回 null = 没问题；"!..." = 硬错误；"..." = 告警。
 * 竖排槽查「缩字号后仍放不下的字数」—— 钳制的兜底是丢字，丢字必须大声失败。
 */
function textFit(slot: Slot, b: Box, content: RenderContent): string | null {
  // bignum/num2 渲染的是数字（render.tsx numericValue），不是文案 —— 按数字估算
  const numeric = slot.k === "bignum" || slot.k === "num2";
  const raw = numeric ? content.bignum ?? String(content.numbers[0] ?? "") : slotTextOf(slot, content);
  if (!raw) return null;
  const isHeadlineLike = slot.k === "headline" || slot.k === "text" || slot.k === "quote";
  const t = numeric ? raw : isHeadlineLike ? stripPunct(displayHeadline(raw)) : stripPunct(raw);
  if (!t) return null;

  // 列表：自然行高总和 vs 槽高（渲染器会把行高压进槽内，压过头就是行距消失）
  if (slot.k === "bullets" || slot.k === "listnum" || slot.k === "checklist") {
    const list = itemsOf(content, slot.k === "bullets" ? 3 : 4).map(stripPunct);
    const size = FONT_SIZE[slot.size ?? "m"];
    const need = list.length * size * 1.32;
    if (need > b.h * 1.25) return `!列表溢出：${list.length} 行需 ${need.toFixed(0)}px > 槽高 ${b.h.toFixed(0)}px`;
    if (need > b.h) return `列表贴边：${list.length} 行需 ${need.toFixed(0)}px ≈ 槽高 ${b.h.toFixed(0)}px`;
    return null;
  }

  // 单块文字：字号先镜像 render.tsx 的短句放大公式（不同字号量不出准高度）
  const base = FONT_SIZE[slot.size ?? "m"];
  let fs: number = base;
  if (isHeadlineLike) {
    const units = Array.from(t).reduce((n, ch) => n + (ch.codePointAt(0)! > 0xff ? 1 : 0.55), 0);
    if (units > 0 && units <= 8) {
      fs = Math.max(fs, Math.min((b.w / units) * 0.86, b.h / 1.45, 340));
    }
  }

  // 竖排（画法 E01）：与渲染同数学 —— 缩字号到放得下或触底，量残余字数。
  // 旧实现这里直接 return null（「竖排不可能竖向溢出」），于是渲染器
  // slice(0, maxChars) 的静默丢字从来没被门禁看见：09 语料拍 11
  // 「手写的笔记留在桌上」9 字只画出 6 字，plan-dry 却全绿。
  if (slot.vertical) {
    const fsFloorV = Math.max(24, base * 0.5);
    const charsN = Array.from(t).length;
    let fsV: number = base;
    while (fsV > fsFloorV && charsN * fsV * 1.16 > b.h) {
      fsV = Math.max(fsFloorV, fsV * 0.9);
    }
    const fitN = Math.max(2, Math.floor(b.h / (fsV * 1.16)));
    if (charsN > fitN) {
      return `!竖排截断：${charsN} 字只放得下 ${fitN} 字（字号已缩到 ${fsV.toFixed(0)}px 仍触底）`;
    }
    return null;
  }

  // 单行类（数字/小标）：不换行，只查横向宽度
  const SINGLE_LINE: ReadonlySet<SlotKind> = new Set<SlotKind>([
    "bignum", "num2", "delta", "unit", "kicker", "label", "badge", "meta", "literal", "source", "attribution",
  ]);
  if (SINGLE_LINE.has(slot.k)) {
    const units = Array.from(t).reduce((n, ch) => n + (ch.codePointAt(0)! > 0xff ? 1 : 0.55), 0);
    const need = units * fs;
    if (need > b.w * 1.08) return `单行文字超宽：「${t.slice(0, 12)}」约 ${need.toFixed(0)}px > 槽宽 ${b.w.toFixed(0)}px`;
    return null;
  }

  // 块文字：镜像 render.tsx 的高度钳制后再量高度（缩字号重排，触底为止）——
  // 不镜像的话，渲染器已经自适应放下的文案会被检查器误报成溢出。
  // 注意：渲染器用 wrapMarked（强调段按放大字宽计），这里用 wrapText，
  // 强调密集的标题行数会略低估 —— 1.25 倍硬错误阈值就是留给这点误差的。
  const fsFloor = Math.max(24, base * 0.5);
  let rowsN = wrapText(t, fs, b.w).length;
  while (fs > fsFloor && rowsN * fs * 1.32 > b.h) {
    fs = Math.max(fsFloor, fs * 0.9);
    rowsN = wrapText(t, fs, b.w).length;
  }
  const need = rowsN * fs * 1.32;
  if (need > b.h * 1.25) return `!文字溢出：${rowsN} 行约 ${need.toFixed(0)}px > 槽高 ${b.h.toFixed(0)}px`;
  if (need > b.h) return `文字贴边：${rowsN} 行约 ${need.toFixed(0)}px ≈ 槽高 ${b.h.toFixed(0)}px`;
  return null;
}
