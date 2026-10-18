// 否定切片（方案 §13 否定 / Phase 3 第二个事件类型）。
//
// 视觉模板 negation-strike-v1：被否定的说法在左（小），确证的事实
// 在右（大）。运动顺序（先立后破，破之后立）：
//   ① 被否定的说法先落位；② 删除线划过它 —— 否定动作本身；
//   ③ 确证方随删除线完成后入场，且几何更大。
// 关键断言「确证方不能在删除线完成前就显现」由 revealAfter 承载
// （gate = 删除线画完的时刻；与因果的 revealAfter 同一机制、不同 gate）。
//
// 与 compare/causal 共用同一套引擎（evaluateMotionPlan / auditMotionGeometry），
// 只是 NODE 契约、几何与关系不同 —— 引擎层与具体事件类型无关。
//
// 注意：删除线盖在被否定标签**上方**（有意重叠），所以它不参与 leftOf/clearance
// 方向类关系，只受 insideSafeArea 约束 —— 与因果连线（在两组**之间**）不同。

import type { Layout, Slot } from "../layouts/types";
import type { ElementNode, MovePlan, RelationConstraint } from "../motion/elements";
import { resolveProfile } from "../styles/style-system";
import { figureFor } from "./compare-slice";
import { px, union, center, LEFT, RIGHT_BIG, labelOf, LABEL_MAX_UNITS } from "./slice-geom";
import { CONFIDENCE_MIN, type SemanticEvent } from "./events";
import type { SemanticSlice } from "./types";

export const NEGATION_LAYOUT_ID = "sem-negation-strike-v1";

/** 元素图的节点 id 契约（渲染层按 data-group 找，验算层按 id 找）。 */
export const NODE = {
  headline: "headline",
  grpNegated: "grp-negated",
  grpAffirm: "grp-affirm",
  figNegated: "fig-negated",
  figAffirm: "fig-affirm",
  labelNegated: "label-negated",
  labelAffirm: "label-affirm",
  strike: "strike-negated",
} as const;

export interface NegationPlan {
  templateId: string;
  eventId: string;
  labels: { negated: string; affirm: string };
  entityIds: { negated: string; affirm: string };
  motionSequence: string[];
  assertions: string[];
  degraded?: string;
}

export interface NegationSlice extends SemanticSlice {
  kind: "negation";
  plan: NegationPlan & { layout: Layout };
}

export function buildNegationSlice(plan: NegationPlan, shotId: string, opts: { hasCaption?: boolean } = {}): NegationSlice {
  const notes: string[] = [];
  const slots: Slot[] = [];
  const nodes: ElementNode[] = [];
  const anchors: Record<string, { x: number; y: number }> = {};

  // ① 句首大标题（不参与组运动）
  const headlineBox: [number, number, number, number] = [0.6, 0.3, 10.8, 1.0];
  slots.push({ k: "headline", box: headlineBox, size: "l", tone: "ink", src: "headline" });
  nodes.push({
    id: NODE.headline, kind: "text",
    localTransform: { x: 0, y: 0, scaleX: 1, scaleY: 1, opacity: 1 },
    bounds: px(headlineBox), anchor: center(px(headlineBox)), role: "annotation",
  });

  const sides = [
    { grp: NODE.grpNegated, fig: NODE.figNegated, label: NODE.labelNegated, box: LEFT, ent: plan.entityIds.negated, labelText: plan.labels.negated, figTone: "ink" as const, labelTone: "ink" as const },
    { grp: NODE.grpAffirm, fig: NODE.figAffirm, label: NODE.labelAffirm, box: RIGHT_BIG, ent: plan.entityIds.affirm, labelText: plan.labels.affirm, figTone: "accent" as const, labelTone: "accent" as const },
  ];

  for (const s of sides) {
    const fig = figureFor(s.labelText);
    if (fig.note) notes.push(fig.note);
    const figBox = px(s.box.figure);
    const labelBox = px(s.box.label);
    slots.push({ k: "figure", box: s.box.figure, group: s.grp, figure: fig.kind, tone: s.figTone, src: "none" });
    slots.push({
      k: "label", box: s.box.label, group: s.grp, size: "l", tone: s.labelTone, align: "center",
      literal: s.labelText, src: "none",
    });
    const grpBounds = union(figBox, labelBox);
    anchors[s.grp] = center(figBox);
    nodes.push({
      id: s.grp, kind: "group", semanticEntityId: s.ent,
      localTransform: { x: 0, y: 0, scaleX: 1, scaleY: 1, opacity: 1 },
      bounds: grpBounds, anchor: anchors[s.grp]!, role: s.grp === NODE.grpAffirm ? "primary" : "secondary",
    });
    nodes.push({
      id: s.fig, kind: "svg", semanticEntityId: s.ent, parentId: s.grp,
      localTransform: { x: 0, y: 0, scaleX: 1, scaleY: 1, opacity: 1 },
      bounds: figBox, anchor: center(figBox), role: s.grp === NODE.grpAffirm ? "primary" : "secondary",
    });
    nodes.push({
      id: s.label, kind: "label", semanticEntityId: s.ent, parentId: s.grp,
      localTransform: { x: 0, y: 0, scaleX: 1, scaleY: 1, opacity: 1 },
      bounds: labelBox, anchor: center(labelBox), role: s.grp === NODE.grpAffirm ? "primary" : "secondary",
    });
  }

  // ② 删除线：盖在被否定标签垂直中线上的强调线（独立组，可被 scaleX 驱动，绕左端划过）
  const strikeBox: [number, number, number, number] = [1.45, 5.39, 3.0, 0.08];
  slots.push({ k: "rule", box: strikeBox, group: NODE.strike, tone: "accent", src: "none" });
  anchors[NODE.strike] = { x: px(strikeBox).x, y: center(px(strikeBox)).y };
  nodes.push({
    id: NODE.strike, kind: "shape",
    localTransform: { x: 0, y: 0, scaleX: 1, scaleY: 1, opacity: 1 },
    bounds: px(strikeBox), anchor: anchors[NODE.strike]!, role: "annotation",
  });

  // ③ 尾句（只在真有 caption 时加，避免底部重复大标题）
  if (opts.hasCaption) {
    slots.push({ k: "caption", box: [0.6, 6.35, 10.8, 0.5], size: "s", tone: "dim", align: "center", src: "caption" });
  }

  const layout: Layout = {
    id: NEGATION_LAYOUT_ID,
    name: "语义否定 · 先破后立",
    group: "negation",
    enter: ["m-fade-up"],
    transition: "m-cross-dissolve",
    slots,
    groups: [
      { id: NODE.grpNegated, entityId: plan.entityIds.negated, role: "secondary", anchor: [anchors[NODE.grpNegated]!.x, anchors[NODE.grpNegated]!.y] },
      { id: NODE.grpAffirm, entityId: plan.entityIds.affirm, role: "primary", anchor: [anchors[NODE.grpAffirm]!.x, anchors[NODE.grpAffirm]!.y] },
      { id: NODE.strike, entityId: "", role: "annotation", anchor: [anchors[NODE.strike]!.x, anchors[NODE.strike]!.y] },
    ],
    note: `由语义模板 ${plan.templateId} 生成；被否定说法→删除线→确证方，确证方不得早于删除线完成`,
  };

  const settleOffset = 1.55;
  return {
    kind: "negation",
    plan: { ...plan, layout },
    layout,
    graph: { shotId, nodes },
    anchors,
    holdOffset: settleOffset,
    settleOffset,
    notes,
  };
}

/* ── 编排时间表（相对拍首，与 causal 同一压缩纪律）─────────────────────────── */
const BASE = 1.55;
function compress(dur: number, base: number): number {
  const avail = Math.max(0.8, Math.min(dur - 0.3, 2.2));
  return Math.min(1, avail / base);
}

export function negationMoves(slice: NegationSlice, at: number, dur: number): MovePlan[] {
  const k = compress(dur, BASE);
  const T = (rel: number) => Number((at + rel * k).toFixed(4));
  const D = (rel: number) => Number((rel * k).toFixed(4));
  const ev = slice.plan.eventId;
  return [
    {
      id: "mv-negated-enter",
      targetId: NODE.grpNegated,
      channel: "transform",
      start: T(0.08), duration: D(0.4),
      from: { y: 6, opacity: 0 }, to: { y: 0, opacity: 1 },
      ease: "power2.out",
      reason: "被否定的说法先落位（先立后破：先给观众那个要被推翻的说法）",
      eventId: ev,
    },
    {
      id: "mv-strike-draw",
      targetId: NODE.strike,
      channel: "transform",
      start: T(0.55), duration: D(0.4),
      from: { scaleX: 0, opacity: 0 }, to: { scaleX: 1, opacity: 1 },
      ease: "power2.out",
      reason: "删除线划过被否定的说法 —— 否定动作本身（scaleX 绕左端，方向从左向右）",
      eventId: ev,
    },
    {
      id: "mv-affirm-enter",
      targetId: NODE.grpAffirm,
      channel: "transform",
      start: T(1.0), duration: D(0.55),
      from: { x: -120, opacity: 0 }, to: { x: 0, opacity: 1 },
      ease: "power3.out",
      reason: "确证方随删除线完成后入场且更大 —— 先破后立的视觉依据",
      eventId: ev,
    },
  ];
}

export function negationRelations(slice: NegationSlice, at: number, dur: number, style?: string): RelationConstraint[] {
  const k = compress(dur, BASE);
  const settle = Number((at + slice.settleOffset * k).toFixed(4));
  const strikeEnd = Number((at + 0.95 * k).toFixed(4));
  const end = Number((at + dur).toFixed(4));
  const prof = resolveProfile(style);
  const rels: RelationConstraint[] = [];

  // ① 文字跟随图形（同组内子节点成对移动）
  for (const [grp, fig, label] of [
    [NODE.grpNegated, NODE.figNegated, NODE.labelNegated],
    [NODE.grpAffirm, NODE.figAffirm, NODE.labelAffirm],
  ] as const) {
    rels.push({ id: `rel-follow-${label}`, type: "follows", sourceIds: [fig, label], params: { maxDeviation: 1.5 }, activeDuring: [at, end], severity: "error" });
    rels.push({ id: `rel-hold-${grp}`, type: "holds", sourceIds: [grp], params: { maxDelta: 0.5 }, activeDuring: [settle, end], severity: "error" });
  }

  // ② 否定顺序：确证方不能在删除线完成前显现
  rels.push({
    id: "rel-negation-order", type: "revealAfter", sourceIds: [NODE.grpAffirm],
    params: { gateAt: strikeEnd }, activeDuring: [at, strikeEnd], severity: "error",
  });

  // ③ 方向：被否定在左、确证在右（删除线盖在左侧标签上，不参与方向关系）
  rels.push({ id: "rel-neg-left", type: "leftOf", sourceIds: [NODE.grpNegated, NODE.grpAffirm], params: { minGap: 40 }, activeDuring: [settle, end], severity: "error" });

  // ④ 尺度：确证方图形更大（破之后立 —— 强调的是留下的事实）
  rels.push({ id: "rel-affirm-larger", type: "largerThan", sourceIds: [NODE.figAffirm, NODE.figNegated], params: { minRatio: 1.1 }, activeDuring: [settle, end], severity: "error" });

  // ⑤ 净空：被否定组与确证组全程不许意外重叠
  rels.push({ id: "rel-clearance-groups", type: "clearanceAtLeast", sourceIds: [NODE.grpNegated, NODE.grpAffirm], params: { min: 40 }, activeDuring: [at, end], severity: "error" });

  // ⑥ 安全区：落位后关键对象都在安全区内（删除线也管）
  rels.push({ id: "rel-safe-area", type: "insideSafeArea", sourceIds: [NODE.grpNegated, NODE.grpAffirm, NODE.strike, NODE.headline], params: { margin: 20, stageW: 1280, stageH: 720 }, activeDuring: [settle, end], severity: "error" });

  // ⑦ 可读性：落位后标签实际合成颜色达标（WCAG 2.2 大文本 3:1）
  rels.push({
    id: `rel-contrast-${NODE.labelAffirm}`, type: "contrastAtLeast", sourceIds: [NODE.labelAffirm],
    params: { min: 3, fg: prof.tone.accent, bg: prof.tone.paper }, activeDuring: [settle, end], severity: "error",
  });
  rels.push({
    id: `rel-contrast-${NODE.labelNegated}`, type: "contrastAtLeast", sourceIds: [NODE.labelNegated],
    params: { min: 3, fg: prof.tone.ink, bg: prof.tone.paper }, activeDuring: [settle, end], severity: "warning",
  });

  return rels;
}

/**
 * 否定事件 → 视觉计划（与 planCausal 同一纪律：模板参数驱动断言）。
 * 语义不足（置信度低）返回 null，调用方降级为普通版式。
 */
export function planNegation(ev: SemanticEvent): NegationPlan | null {
  if (ev.type !== "negation" || ev.confidence < CONFIDENCE_MIN) return null;
  const negated = ev.entities.find((e) => e.id === "ent-negated");
  const affirm = ev.entities.find((e) => e.id === "ent-affirm");
  if (!negated || !affirm) return null;

  const nl = labelOf(negated.name);
  const al = labelOf(affirm.name);
  const degraded: string[] = [];
  if (ev.degraded) degraded.push(ev.degraded);
  if (nl.truncated) degraded.push(`被否定标签「${negated.name}」超 ${LABEL_MAX_UNITS} 字宽，截断为「${nl.label}」`);
  if (al.truncated) degraded.push(`确证标签「${affirm.name}」超 ${LABEL_MAX_UNITS} 字宽，截断为「${al.label}」`);

  return {
    templateId: "negation-strike-v1",
    eventId: ev.id,
    labels: { negated: nl.label, affirm: al.label },
    entityIds: { negated: negated.id, affirm: affirm.id },
    motionSequence: ["negated-enter", "strike-draw", "affirm-enter", "hold"],
    assertions: ["group-follow", "negation-order", "negated-left", "affirm-larger", "no-unintended-overlap", "hold-after-enter", "inside-safe-area"],
    degraded: degraded.length ? degraded.join("；") : undefined,
  };
}
