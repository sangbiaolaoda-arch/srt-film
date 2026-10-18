// 变化切片（方案 §13 变化 / Phase 3 第四个事件类型）。
//
// 视觉模板 change-before-after-v1：之前在左（暗）、之后在右（大、亮），中间是变化箭头连线。
// 运动顺序：① 之前的状态先落位；② 变化连线出现 —— 转变在这里发生；
// ③ 之后的状态随连线完成后入场且更大更亮（变化的结果才是重点）。
// 关键断言「之后方不能在变化连线完成前就显现」由 revealAfter 承载（gate = 连线画完）。
//
// 与 causal 共用同一副「左右两组 + 中缝连线」骨架，差异只在：
// 之前方用 dim 调（暗，旧状态退后），之后方用 RIGHT_BIG + accent（大、亮）+ largerThan。

import type { Layout, Slot } from "../layouts/types";
import type { ElementNode, MovePlan, RelationConstraint } from "../motion/elements";
import { resolveProfile } from "../styles/style-system";
import { figureFor } from "./compare-slice";
import { px, union, center, LEFT, RIGHT_BIG, CONN, labelOf, LABEL_MAX_UNITS } from "./slice-geom";
import { CONFIDENCE_MIN, type SemanticEvent } from "./events";
import type { SemanticSlice } from "./types";

export const CHANGE_LAYOUT_ID = "sem-change-before-after-v1";

/** 元素图的节点 id 契约（渲染层按 data-group 找，验算层按 id 找）。 */
export const NODE = {
  headline: "headline",
  grpBefore: "grp-before",
  grpAfter: "grp-after",
  figBefore: "fig-before",
  figAfter: "fig-after",
  labelBefore: "label-before",
  labelAfter: "label-after",
  conn: "conn-change",
} as const;

export interface ChangePlan {
  templateId: string;
  eventId: string;
  labels: { before: string; after: string };
  entityIds: { before: string; after: string };
  motionSequence: string[];
  assertions: string[];
  degraded?: string;
}

export interface ChangeSlice extends SemanticSlice {
  kind: "change";
  plan: ChangePlan & { layout: Layout };
}

export function buildChangeSlice(plan: ChangePlan, shotId: string, opts: { hasCaption?: boolean } = {}): ChangeSlice {
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
    { grp: NODE.grpBefore, fig: NODE.figBefore, label: NODE.labelBefore, box: LEFT, ent: plan.entityIds.before, labelText: plan.labels.before, figTone: "dim" as const, labelTone: "dim" as const },
    { grp: NODE.grpAfter, fig: NODE.figAfter, label: NODE.labelAfter, box: RIGHT_BIG, ent: plan.entityIds.after, labelText: plan.labels.after, figTone: "accent" as const, labelTone: "accent" as const },
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
      bounds: grpBounds, anchor: anchors[s.grp]!, role: s.grp === NODE.grpAfter ? "primary" : "secondary",
    });
    nodes.push({
      id: s.fig, kind: "svg", semanticEntityId: s.ent, parentId: s.grp,
      localTransform: { x: 0, y: 0, scaleX: 1, scaleY: 1, opacity: 1 },
      bounds: figBox, anchor: center(figBox), role: s.grp === NODE.grpAfter ? "primary" : "secondary",
    });
    nodes.push({
      id: s.label, kind: "label", semanticEntityId: s.ent, parentId: s.grp,
      localTransform: { x: 0, y: 0, scaleX: 1, scaleY: 1, opacity: 1 },
      bounds: labelBox, anchor: center(labelBox), role: s.grp === NODE.grpAfter ? "primary" : "secondary",
    });
  }

  // ② 变化连线（自身成组，可被 scaleX 驱动；绕左端生长）
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
    id: CHANGE_LAYOUT_ID,
    name: "语义变化 · 前后对比",
    group: "change",
    enter: ["m-fade-up"],
    transition: "m-cross-dissolve",
    slots,
    groups: [
      { id: NODE.grpBefore, entityId: plan.entityIds.before, role: "secondary", anchor: [anchors[NODE.grpBefore]!.x, anchors[NODE.grpBefore]!.y] },
      { id: NODE.grpAfter, entityId: plan.entityIds.after, role: "primary", anchor: [anchors[NODE.grpAfter]!.x, anchors[NODE.grpAfter]!.y] },
      { id: NODE.conn, entityId: "", role: "annotation", anchor: [anchors[NODE.conn]!.x, anchors[NODE.conn]!.y] },
    ],
    note: `由语义模板 ${plan.templateId} 生成；之前→变化连线→之后，之后方不得早于连线完成`,
  };

  const settleOffset = 1.55;
  return {
    kind: "change",
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

export function changeMoves(slice: ChangeSlice, at: number, dur: number): MovePlan[] {
  const k = compress(dur, BASE);
  const T = (rel: number) => Number((at + rel * k).toFixed(4));
  const D = (rel: number) => Number((rel * k).toFixed(4));
  const ev = slice.plan.eventId;
  return [
    {
      id: "mv-before-enter",
      targetId: NODE.grpBefore,
      channel: "transform",
      start: T(0.08), duration: D(0.4),
      from: { y: 6, opacity: 0 }, to: { y: 0, opacity: 1 },
      ease: "power2.out",
      reason: "之前的状态先落位（旧状态是变化的起点，调性压暗退后）",
      eventId: ev,
    },
    {
      id: "mv-connector-draw",
      targetId: NODE.conn,
      channel: "transform",
      start: T(0.55), duration: D(0.4),
      from: { scaleX: 0, opacity: 0 }, to: { scaleX: 1, opacity: 1 },
      ease: "power2.out",
      reason: "变化连线出现 —— 转变在这里发生（scaleX 绕左端生长，方向由左指向右）",
      eventId: ev,
    },
    {
      id: "mv-after-enter",
      targetId: NODE.grpAfter,
      channel: "transform",
      start: T(1.0), duration: D(0.55),
      from: { x: -120, opacity: 0 }, to: { x: 0, opacity: 1 },
      ease: "power3.out",
      reason: "之后的状态随连线完成后入场且更大更亮 —— 变化的结果才是重点",
      eventId: ev,
    },
  ];
}

export function changeRelations(slice: ChangeSlice, at: number, dur: number, style?: string): RelationConstraint[] {
  const k = compress(dur, BASE);
  const settle = Number((at + slice.settleOffset * k).toFixed(4));
  const connEnd = Number((at + 0.95 * k).toFixed(4));
  const end = Number((at + dur).toFixed(4));
  const prof = resolveProfile(style);
  const rels: RelationConstraint[] = [];

  // ① 文字跟随图形（同组内子节点成对移动）
  for (const [grp, fig, label] of [
    [NODE.grpBefore, NODE.figBefore, NODE.labelBefore],
    [NODE.grpAfter, NODE.figAfter, NODE.labelAfter],
  ] as const) {
    rels.push({ id: `rel-follow-${label}`, type: "follows", sourceIds: [fig, label], params: { maxDeviation: 1.5 }, activeDuring: [at, end], severity: "error" });
    rels.push({ id: `rel-hold-${grp}`, type: "holds", sourceIds: [grp], params: { maxDelta: 0.5 }, activeDuring: [settle, end], severity: "error" });
  }

  // ② 变化顺序：之后方不能在连线完成前显现
  rels.push({
    id: "rel-change-order", type: "revealAfter", sourceIds: [NODE.grpAfter],
    params: { gateAt: connEnd }, activeDuring: [at, connEnd], severity: "error",
  });

  // ③ 方向：之前在左、之后在右；连线在两者之间
  rels.push({ id: "rel-before-left", type: "leftOf", sourceIds: [NODE.grpBefore, NODE.grpAfter], params: { minGap: 40 }, activeDuring: [settle, end], severity: "error" });
  rels.push({ id: "rel-conn-pos-1", type: "leftOf", sourceIds: [NODE.grpBefore, NODE.conn], params: { minGap: 0 }, activeDuring: [settle, end], severity: "error" });
  rels.push({ id: "rel-conn-pos-2", type: "leftOf", sourceIds: [NODE.conn, NODE.grpAfter], params: { minGap: 0 }, activeDuring: [settle, end], severity: "error" });

  // ④ 尺度：之后方图形更大（变化的结果才是重点）
  rels.push({ id: "rel-after-larger", type: "largerThan", sourceIds: [NODE.figAfter, NODE.figBefore], params: { minRatio: 1.1 }, activeDuring: [settle, end], severity: "error" });

  // ⑤ 净空：之前组与之后组全程不许意外重叠
  rels.push({ id: "rel-clearance-groups", type: "clearanceAtLeast", sourceIds: [NODE.grpBefore, NODE.grpAfter], params: { min: 40 }, activeDuring: [at, end], severity: "error" });

  // ⑥ 安全区：落位后关键对象都在安全区内
  rels.push({ id: "rel-safe-area", type: "insideSafeArea", sourceIds: [NODE.grpBefore, NODE.grpAfter, NODE.conn, NODE.headline], params: { margin: 20, stageW: 1280, stageH: 720 }, activeDuring: [settle, end], severity: "error" });

  // ⑦ 可读性：落位后标签实际合成颜色达标（WCAG 2.2 大文本 3:1；之前方是 dim 调，用 dim 前景）
  rels.push({
    id: `rel-contrast-${NODE.labelAfter}`, type: "contrastAtLeast", sourceIds: [NODE.labelAfter],
    params: { min: 3, fg: prof.tone.accent, bg: prof.tone.paper }, activeDuring: [settle, end], severity: "error",
  });
  rels.push({
    id: `rel-contrast-${NODE.labelBefore}`, type: "contrastAtLeast", sourceIds: [NODE.labelBefore],
    params: { min: 3, fg: prof.tone.dim, bg: prof.tone.paper }, activeDuring: [settle, end], severity: "warning",
  });

  return rels;
}

/**
 * 变化事件 → 视觉计划（与 planCausal 同一纪律：模板参数驱动断言）。
 * 语义不足（置信度低）返回 null，调用方降级为普通版式。
 */
export function planChange(ev: SemanticEvent): ChangePlan | null {
  if (ev.type !== "change" || ev.confidence < CONFIDENCE_MIN) return null;
  const before = ev.entities.find((e) => e.id === "ent-before");
  const after = ev.entities.find((e) => e.id === "ent-after");
  if (!before || !after) return null;

  const bl = labelOf(before.name);
  const al = labelOf(after.name);
  const degraded: string[] = [];
  if (ev.degraded) degraded.push(ev.degraded);
  if (bl.truncated) degraded.push(`之前标签「${before.name}」超 ${LABEL_MAX_UNITS} 字宽，截断为「${bl.label}」`);
  if (al.truncated) degraded.push(`之后标签「${after.name}」超 ${LABEL_MAX_UNITS} 字宽，截断为「${al.label}」`);

  return {
    templateId: "change-before-after-v1",
    eventId: ev.id,
    labels: { before: bl.label, after: al.label },
    entityIds: { before: before.id, after: after.id },
    motionSequence: ["before-enter", "connector-draw", "after-enter", "hold"],
    assertions: ["group-follow", "change-order", "before-left", "after-larger", "no-unintended-overlap", "hold-after-enter", "inside-safe-area"],
    degraded: degraded.length ? degraded.join("；") : undefined,
  };
}
