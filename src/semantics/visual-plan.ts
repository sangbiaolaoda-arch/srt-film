// 视觉模板层（方案 §5.3 / §5.4）：语义事件 → 可验证的视觉意图。
//
// 关键设计（方案明确禁止的写法这里都不出现）：
//   · 不把「winner.x > loser.x」写死在 compare 类型里 —— 布局方向、主次、尺度、断言
//     全部由**模板参数**给出，断言由参数派生（不同模板可以给出不同答案）。
//   · 语义不足（否定 / 可测量维度 / 置信度低）时退回中性并列，不制造优胜者。
//   · 标签只做「去标点 + 截断」这类形式处理，不改写原文（溯源门禁的上游约束）。

import { CONFIDENCE_MIN, entitiesOf, type SemanticEvent } from "./events";
import { stripPunct } from "../core/text";

/** 可被验算的断言 id。每个 id 对应 motion/elements.ts 里的关系类型。 */
export type AssertionId =
  | "group-follow"
  | "final-order"
  | "primary-larger"
  | "contrast-minimum"
  | "no-unintended-overlap"
  | "hold-after-enter"
  | "inside-safe-area";

export interface VisualPlan {
  templateId: string;
  eventId: string;
  /** 主体/参照在画面上的标签（已去标点，可能被截断，截断会记进 degraded） */
  labels: { primary: string; secondary: string };
  /** primary/secondary 各自绑定的实体 id */
  entityIds: { primary: string; secondary: string };
  /** 谁是主体（原文主语）—— 与「谁是赢家」分开记账 */
  subjectIsPrimary: boolean;
  finalLayout: {
    primarySide: "left" | "right";
    secondarySide: "left" | "right";
    primaryScaleGreater: boolean;
    primaryContrastGreater: boolean;
  };
  motionSequence: string[];
  assertions: AssertionId[];
  /** 非空 = 有降级；值是原因（报告要能读出来为什么这样画） */
  degraded?: string;
}

/** 标签安全长度（字宽）：超过就截断，截断必须记录 —— 画面不许静默丢字。 */
const LABEL_MAX_UNITS = 10;

function widthOf(text: string): number {
  let n = 0;
  for (const ch of text) n += ch.codePointAt(0)! > 0xff ? 1 : 0.5;
  return n;
}

function labelOf(name: string): { label: string; truncated: boolean } {
  const clean = stripPunct(name);
  if (widthOf(clean) <= LABEL_MAX_UNITS) return { label: clean, truncated: false };
  // 按字宽截断（不切半个字）
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

/**
 * 比较句 → 视觉计划。
 * 语义不足时返回 null（调用方降级为普通版式），**不**返回一个假装中性的对照 ——
 * 「能不能画对照」与「谁占优」是两件事，前者由 layout 决定，后者由下面的 polarity 决定。
 */
export function planComparison(ev: SemanticEvent): VisualPlan | null {
  if (ev.type !== "compare" || ev.confidence < CONFIDENCE_MIN) return null;
  const ents = entitiesOf(ev);
  if (!ents) return null;

  // 赢家：只有 polarity 明确时才存在。unknown（可测量维度/否定）= 没有赢家。
  const winner: "subject" | "reference" | null =
    ev.polarity === "positive" ? "subject" : ev.polarity === "negative" ? "reference" : null;
  const primaryEnt = winner === "reference" ? ents.reference : ents.subject;
  const secondaryEnt = winner === "reference" ? ents.subject : ents.reference;

  const pl = labelOf(primaryEnt.name);
  const sl = labelOf(secondaryEnt.name);
  const degraded: string[] = [];
  if (ev.degraded) degraded.push(ev.degraded);
  if (pl.truncated) degraded.push(`主体标签「${primaryEnt.name}」超 ${LABEL_MAX_UNITS} 字宽，截断为「${pl.label}」`);
  if (sl.truncated) degraded.push(`参照标签「${secondaryEnt.name}」超 ${LABEL_MAX_UNITS} 字宽，截断为「${sl.label}」`);

  const base = {
    eventId: ev.id,
    labels: { primary: pl.label, secondary: sl.label },
    entityIds: { primary: primaryEnt.id, secondary: secondaryEnt.id },
    subjectIsPrimary: primaryEnt.role === "subject",
  };

  if (!winner) {
    // 中性并列：等权重、等尺度、不下优劣断言（方案的「退回中性对照」）
    return {
      ...base,
      templateId: "compare-neutral-two-up-v1",
      finalLayout: { primarySide: "left", secondarySide: "right", primaryScaleGreater: false, primaryContrastGreater: false },
      motionSequence: ["subject-enter", "reference-enter", "hold"],
      assertions: ["group-follow", "inside-safe-area", "no-unintended-overlap", "hold-after-enter", "contrast-minimum"],
      degraded: [...degraded, "比较方向不可判定（否定或可测量维度），按中性并列呈现，不声明优劣"].join("；"),
    };
  }

  // 占优模板：主体/赢家后入场、落右、强对比、尺度更大 —— 但这只是**本模板**的选择
  return {
    ...base,
    templateId: "compare-center-handoff-v1",
    finalLayout: { primarySide: "right", secondarySide: "left", primaryScaleGreater: true, primaryContrastGreater: true },
    motionSequence: ["secondary-enter", "secondary-yield", "primary-enter", "hold"],
    assertions: [
      "group-follow",
      "final-order",
      "primary-larger",
      "contrast-minimum",
      "no-unintended-overlap",
      "hold-after-enter",
      "inside-safe-area",
    ],
    degraded: degraded.length ? degraded.join("；") : undefined,
  };
}
