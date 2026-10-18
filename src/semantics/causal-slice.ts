// 因果切片（方案 §5.3 因果 A→B / Phase 3 第一个事件类型）。
//
// 视觉模板 causal-chain-v1：原因在左、结果在右、两者之间有方向连线。
// 运动顺序（方案 §11 基准语料 case 4「因为 A，所以发生 B」）：
//   ① 原因先落位；② 连线出现，建立因果通路；③ 结果随因果连接完成后入场。
// 关键断言「结果不能在因果连接完成前就显现」由新增的 revealAfter 关系承载
// （方案 §5.3：B 的显现不能早于该模板要求的因果连接完成）。
//
// 与 compare 切片共用同一套引擎（evaluateMotionPlan / auditMotionGeometry），
// 只是 NODE 契约、几何与关系不同 —— 这正是「逻辑验算与浏览器实测各司其职」能成立的前提。

import type { Layout, Slot } from "../layouts/types";
import type { ElementNode, MovePlan, RelationConstraint } from "../motion/elements";
import { resolveProfile } from "../styles/style-system";
import { figureFor } from "./compare-slice";
import { px, union, center, LEFT, RIGHT_EQUAL, CONN, labelOf, LABEL_MAX_UNITS } from "./slice-geom";
import { CONFIDENCE_MIN, type SemanticEvent } from "./events";
import type { SemanticSlice } from "./types";

export const CAUSAL_LAYOUT_ID = "sem-causal-chain-v1";

/** 元素图的节点 id 契约（渲染层按 data-group 找，验算层按 id 找）。 */
export const NODE = {
  headline: "headline",
  grpCause: "grp-cause",
  grpEffect: "grp-effect",
  figCause: "fig-cause",
  figEffect: "fig-effect",
  labelCause: "label-cause",
  labelEffect: "label-effect",
  conn: "conn-causal",
} as const;

export interface CausalPlan {
  templateId: string;
  eventId: string;
  labels: { cause: string; effect: string };
  entityIds: { cause: string; effect: string };
  motionSequence: string[];
  assertions: string[];
  degraded?: string;
}

export interface CausalSlice extends SemanticSlice {
  kind: "causal";
  plan: CausalPlan & { layout: Layout };
}

/* ── 归一化网格 → 画面坐标与双侧几何模板见 slice-geom.ts（两族共用一份，防漂移）── */

export function buildCausalSlice(plan: CausalPlan, shotId: string, opts: { hasCaption?: boolean } = {}): CausalSlice {
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
    { grp: NODE.grpCause, fig: NODE.figCause, label: NODE.labelCause, box: LEFT, ent: plan.entityIds.cause, labelText: plan.labels.cause, big: false },
    { grp: NODE.grpEffect, fig: NODE.figEffect, label: NODE.labelEffect, box: RIGHT_EQUAL, ent: plan.entityIds.effect, labelText: plan.labels.effect, big: false },
  ];

  for (const s of sides) {
    const fig = figureFor(s.labelText);
    if (fig.note) notes.push(fig.note);
    const figBox = px(s.box.figure);
    const labelBox = px(s.box.label);
    slots.push({ k: "figure", box: s.box.figure, group: s.grp, figure: fig.kind, tone: "ink", src: "none" });
    slots.push({
      k: "label", box: s.box.label, group: s.grp, size: "l", tone: "ink", align: "center",
      literal: s.labelText, src: "none",
    });
    const grpBounds = union(figBox, labelBox);
    anchors[s.grp] = center(figBox);
    nodes.push({
      id: s.grp, kind: "group", semanticEntityId: s.ent,
      localTransform: { x: 0, y: 0, scaleX: 1, scaleY: 1, opacity: 1 },
      bounds: grpBounds, anchor: anchors[s.grp]!, role: "primary",
    });
    nodes.push({
      id: s.fig, kind: "svg", semanticEntityId: s.ent, parentId: s.grp,
      localTransform: { x: 0, y: 0, scaleX: 1, scaleY: 1, opacity: 1 },
      bounds: figBox, anchor: center(figBox), role: "primary",
    });
    nodes.push({
      id: s.label, kind: "label", semanticEntityId: s.ent, parentId: s.grp,
      localTransform: { x: 0, y: 0, scaleX: 1, scaleY: 1, opacity: 1 },
      bounds: labelBox, anchor: center(labelBox), role: "primary",
    });
  }

  // ② 因果连线（自身成组，可被 connector-draw 驱动；scaleX 绕左端生长）
  const connBox = px(CONN);
  slots.push({ k: "rule", box: CONN, group: NODE.conn, tone: "accent", src: "none" });
  anchors[NODE.conn] = { x: connBox.x, y: center(connBox).y };
  nodes.push({
    id: NODE.conn, kind: "shape",
    localTransform: { x: 0, y: 0, scaleX: 1, scaleY: 1, opacity: 1 },
    bounds: connBox, anchor: anchors[NODE.conn]!, role: "annotation",
  });

  // ③ 尾句（只在真有 caption 时加，避免底部重复大标题）
  if (opts.hasCaption) {
    slots.push({ k: "caption", box: [0.6, 6.35, 10.8, 0.5], size: "s", tone: "dim", align: "center", src: "caption" });
  }

  const layout: Layout = {
    id: CAUSAL_LAYOUT_ID,
    name: "语义因果 · 因果链",
    group: "causal",
    enter: ["m-fade-up"],
    transition: "m-cross-dissolve",
    slots,
    groups: [
      { id: NODE.grpCause, entityId: plan.entityIds.cause, role: "primary", anchor: [anchors[NODE.grpCause]!.x, anchors[NODE.grpCause]!.y] },
      { id: NODE.grpEffect, entityId: plan.entityIds.effect, role: "primary", anchor: [anchors[NODE.grpEffect]!.x, anchors[NODE.grpEffect]!.y] },
      { id: NODE.conn, entityId: "", role: "annotation", anchor: [anchors[NODE.conn]!.x, anchors[NODE.conn]!.y] },
    ],
    note: `由语义模板 ${plan.templateId} 生成；原因→连线→结果，结果不得早于连线完成`,
  };

  const settleOffset = 1.55;
  return {
    kind: "causal",
    plan: { ...plan, layout },
    layout,
    graph: { shotId, nodes },
    anchors,
    holdOffset: settleOffset,
    settleOffset,
    notes,
  };
}

/* ── 编排时间表（相对拍首）─────────────────────────────────────────────────── */
const BASE = 1.55;
function compress(dur: number, base: number): number {
  const avail = Math.max(0.8, Math.min(dur - 0.3, 2.2));
  return Math.min(1, avail / base);
}

export function causalMoves(slice: CausalSlice, at: number, dur: number): MovePlan[] {
  const k = compress(dur, BASE);
  const T = (rel: number) => Number((at + rel * k).toFixed(4));
  const D = (rel: number) => Number((rel * k).toFixed(4));
  const ev = slice.plan.eventId;
  return [
    {
      id: "mv-cause-enter",
      targetId: NODE.grpCause,
      channel: "transform",
      start: T(0.08), duration: D(0.4),
      from: { y: 6, opacity: 0 }, to: { y: 0, opacity: 1 },
      ease: "power2.out",
      reason: "原因先落位（轻微下沉后归位 + 淡入），给观众一个可追踪的起因",
      eventId: ev,
    },
    {
      id: "mv-connector-draw",
      targetId: NODE.conn,
      channel: "transform",
      start: T(0.55), duration: D(0.4),
      from: { scaleX: 0, opacity: 0 }, to: { scaleX: 1, opacity: 1 },
      ease: "power2.out",
      reason: "连线出现，建立从原因到结果的因果通路（scaleX 绕左端生长，方向由左指向右）",
      eventId: ev,
    },
    {
      id: "mv-effect-enter",
      targetId: NODE.grpEffect,
      channel: "transform",
      start: T(1.0), duration: D(0.55),
      from: { x: -120, opacity: 0 }, to: { x: 0, opacity: 1 },
      ease: "power3.out",
      reason: "结果随因果连接完成后入场 —— 显现晚于连线完成，是因果顺序的视觉依据",
      eventId: ev,
    },
  ];
}

export function causalRelations(slice: CausalSlice, at: number, dur: number, style?: string): RelationConstraint[] {
  const k = compress(dur, BASE);
  const settle = Number((at + slice.settleOffset * k).toFixed(4));
  const connEnd = Number((at + 0.95 * k).toFixed(4));
  const end = Number((at + dur).toFixed(4));
  const prof = resolveProfile(style);
  const rels: RelationConstraint[] = [];

  // ① 文字跟随图形（同组内子节点成对移动）
  for (const [grp, fig, label] of [
    [NODE.grpCause, NODE.figCause, NODE.labelCause],
    [NODE.grpEffect, NODE.figEffect, NODE.labelEffect],
  ] as const) {
    rels.push({ id: `rel-follow-${label}`, type: "follows", sourceIds: [fig, label], params: { maxDeviation: 1.5 }, activeDuring: [at, end], severity: "error" });
    rels.push({ id: `rel-hold-${grp}`, type: "holds", sourceIds: [grp], params: { maxDelta: 0.5 }, activeDuring: [settle, end], severity: "error" });
  }

  // ② 因果顺序：结果不能在连线完成前显现（revealAfter 由模板参数驱动时间点）
  rels.push({
    id: "rel-causal-order", type: "revealAfter", sourceIds: [NODE.grpEffect],
    params: { gateAt: connEnd }, activeDuring: [at, connEnd], severity: "error",
  });

  // ③ 方向：原因在左、结果在右；连线在两者之间
  rels.push({ id: "rel-cause-left", type: "leftOf", sourceIds: [NODE.grpCause, NODE.grpEffect], params: { minGap: 40 }, activeDuring: [settle, end], severity: "error" });
  rels.push({ id: "rel-conn-pos-1", type: "leftOf", sourceIds: [NODE.grpCause, NODE.conn], params: { minGap: 0 }, activeDuring: [settle, end], severity: "error" });
  rels.push({ id: "rel-conn-pos-2", type: "leftOf", sourceIds: [NODE.conn, NODE.grpEffect], params: { minGap: 0 }, activeDuring: [settle, end], severity: "error" });

  // ④ 净空：原因组与结果组全程不许意外重叠
  rels.push({ id: "rel-clearance-groups", type: "clearanceAtLeast", sourceIds: [NODE.grpCause, NODE.grpEffect], params: { min: 40 }, activeDuring: [at, end], severity: "error" });

  // ⑤ 安全区：落位后关键对象都在安全区内
  rels.push({ id: "rel-safe-area", type: "insideSafeArea", sourceIds: [NODE.grpCause, NODE.grpEffect, NODE.conn, NODE.headline], params: { margin: 20, stageW: 1280, stageH: 720 }, activeDuring: [settle, end], severity: "error" });

  // ⑥ 可读性：落位后标签实际合成颜色达标（WCAG 2.2 大文本 3:1）
  for (const label of [NODE.labelCause, NODE.labelEffect]) {
    rels.push({
      id: `rel-contrast-${label}`, type: "contrastAtLeast", sourceIds: [label],
      params: { min: 3, fg: prof.tone.ink, bg: prof.tone.paper }, activeDuring: [settle, end], severity: "warning",
    });
  }

  return rels;
}

/**
 * 因果事件 → 视觉计划（与 planComparison 同一纪律：模板参数驱动断言，不写死方向）。
 * 语义不足（置信度低）返回 null，调用方降级为普通版式。
 */
export function planCausal(ev: SemanticEvent): CausalPlan | null {
  if (ev.type !== "cause_effect" || ev.confidence < CONFIDENCE_MIN) return null;
  const cause = ev.entities.find((e) => e.id === "ent-cause");
  const effect = ev.entities.find((e) => e.id === "ent-effect");
  if (!cause || !effect) return null;

  const cl = labelOf(cause.name);
  const el = labelOf(effect.name);
  const degraded: string[] = [];
  if (ev.degraded) degraded.push(ev.degraded);
  if (cl.truncated) degraded.push(`原因标签「${cause.name}」超 ${LABEL_MAX_UNITS} 字宽，截断为「${cl.label}」`);
  if (el.truncated) degraded.push(`结果标签「${effect.name}」超 ${LABEL_MAX_UNITS} 字宽，截断为「${el.label}」`);

  return {
    templateId: "causal-chain-v1",
    eventId: ev.id,
    labels: { cause: cl.label, effect: el.label },
    entityIds: { cause: cause.id, effect: effect.id },
    motionSequence: ["cause-enter", "connector-draw", "effect-enter", "hold"],
    assertions: ["group-follow", "causal-order", "cause-left", "no-unintended-overlap", "hold-after-enter", "inside-safe-area"],
    degraded: degraded.length ? degraded.join("；") : undefined,
  };
}
