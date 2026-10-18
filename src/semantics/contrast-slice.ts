// 转折切片（方案 §13 转折/让步 / Phase 3 第三个事件类型）。
//
// 视觉模板 contrast-turn-v1：让步方在左、转折方在右（更大），中间有转折标记连线。
// 运动顺序：① 让步先落位（先把对方的话摆出来）；② 转折标记出现 —— 话锋从这里转向；
// ③ 转折方随标记完成后入场且几何更大（话锋的落点才是重点）。
// 关键断言「转折方不能在标记完成前就显现」由 revealAfter 承载（gate = 连线画完）。
//
// 与 causal 共用同一副「左右两组 + 中缝连线」骨架，差异只在：
// 转折方用 RIGHT_BIG（更大）+ largerThan 断言（让步是铺垫，不是并列）。

import type { Layout, Slot } from "../layouts/types";
import type { ElementNode, MovePlan, RelationConstraint } from "../motion/elements";
import { resolveProfile } from "../styles/style-system";
import { figureFor } from "./compare-slice";
import { px, union, center, LEFT, RIGHT_BIG, CONN, labelOf, LABEL_MAX_UNITS } from "./slice-geom";
import { CONFIDENCE_MIN, type SemanticEvent } from "./events";
import type { SemanticSlice } from "./types";

export const CONTRAST_LAYOUT_ID = "sem-contrast-turn-v1";

/** 元素图的节点 id 契约（渲染层按 data-group 找，验算层按 id 找）。 */
export const NODE = {
  headline: "headline",
  grpConcession: "grp-concession",
  grpTurn: "grp-turn",
  figConcession: "fig-concession",
  figTurn: "fig-turn",
  labelConcession: "label-concession",
  labelTurn: "label-turn",
  conn: "conn-contrast",
} as const;

export interface ContrastPlan {
  templateId: string;
  eventId: string;
  labels: { concession: string; turn: string };
  entityIds: { concession: string; turn: string };
  motionSequence: string[];
  assertions: string[];
  degraded?: string;
}

export interface ContrastSlice extends SemanticSlice {
  kind: "contrast";
  plan: ContrastPlan & { layout: Layout };
}

export function buildContrastSlice(plan: ContrastPlan, shotId: string, opts: { hasCaption?: boolean } = {}): ContrastSlice {
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
    { grp: NODE.grpConcession, fig: NODE.figConcession, label: NODE.labelConcession, box: LEFT, ent: plan.entityIds.concession, labelText: plan.labels.concession, figTone: "ink" as const, labelTone: "ink" as const },
    { grp: NODE.grpTurn, fig: NODE.figTurn, label: NODE.labelTurn, box: RIGHT_BIG, ent: plan.entityIds.turn, labelText: plan.labels.turn, figTone: "accent" as const, labelTone: "accent" as const },
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
      bounds: grpBounds, anchor: anchors[s.grp]!, role: s.grp === NODE.grpTurn ? "primary" : "secondary",
    });
    nodes.push({
      id: s.fig, kind: "svg", semanticEntityId: s.ent, parentId: s.grp,
      localTransform: { x: 0, y: 0, scaleX: 1, scaleY: 1, opacity: 1 },
      bounds: figBox, anchor: center(figBox), role: s.grp === NODE.grpTurn ? "primary" : "secondary",
    });
    nodes.push({
      id: s.label, kind: "label", semanticEntityId: s.ent, parentId: s.grp,
      localTransform: { x: 0, y: 0, scaleX: 1, scaleY: 1, opacity: 1 },
      bounds: labelBox, anchor: center(labelBox), role: s.grp === NODE.grpTurn ? "primary" : "secondary",
    });
  }

  // ② 转折标记连线（自身成组，可被 scaleX 驱动；绕左端生长）
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
    id: CONTRAST_LAYOUT_ID,
    name: "语义转折 · 让步-转折",
    group: "contrast",
    enter: ["m-fade-up"],
    transition: "m-cross-dissolve",
    slots,
    groups: [
      { id: NODE.grpConcession, entityId: plan.entityIds.concession, role: "secondary", anchor: [anchors[NODE.grpConcession]!.x, anchors[NODE.grpConcession]!.y] },
      { id: NODE.grpTurn, entityId: plan.entityIds.turn, role: "primary", anchor: [anchors[NODE.grpTurn]!.x, anchors[NODE.grpTurn]!.y] },
      { id: NODE.conn, entityId: "", role: "annotation", anchor: [anchors[NODE.conn]!.x, anchors[NODE.conn]!.y] },
    ],
    note: `由语义模板 ${plan.templateId} 生成；让步→转折标记→转折方，转折方不得早于标记完成`,
  };

  const settleOffset = 1.55;
  return {
    kind: "contrast",
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

export function contrastMoves(slice: ContrastSlice, at: number, dur: number): MovePlan[] {
  const k = compress(dur, BASE);
  const T = (rel: number) => Number((at + rel * k).toFixed(4));
  const D = (rel: number) => Number((rel * k).toFixed(4));
  const ev = slice.plan.eventId;
  return [
    {
      id: "mv-concession-enter",
      targetId: NODE.grpConcession,
      channel: "transform",
      start: T(0.08), duration: D(0.4),
      from: { y: 6, opacity: 0 }, to: { y: 0, opacity: 1 },
      ease: "power2.out",
      reason: "让步方先落位（先把对方的话摆出来，转折才有对象）",
      eventId: ev,
    },
    {
      id: "mv-connector-draw",
      targetId: NODE.conn,
      channel: "transform",
      start: T(0.55), duration: D(0.4),
      from: { scaleX: 0, opacity: 0 }, to: { scaleX: 1, opacity: 1 },
      ease: "power2.out",
      reason: "转折标记出现 —— 话锋从这里转向（scaleX 绕左端生长，方向由左指向右）",
      eventId: ev,
    },
    {
      id: "mv-turn-enter",
      targetId: NODE.grpTurn,
      channel: "transform",
      start: T(1.0), duration: D(0.55),
      from: { x: -120, opacity: 0 }, to: { x: 0, opacity: 1 },
      ease: "power3.out",
      reason: "转折方随标记完成后入场且更大 —— 话锋落点才是这段话的重点",
      eventId: ev,
    },
  ];
}

export function contrastRelations(slice: ContrastSlice, at: number, dur: number, style?: string): RelationConstraint[] {
  const k = compress(dur, BASE);
  const settle = Number((at + slice.settleOffset * k).toFixed(4));
  const connEnd = Number((at + 0.95 * k).toFixed(4));
  const end = Number((at + dur).toFixed(4));
  const prof = resolveProfile(style);
  const rels: RelationConstraint[] = [];

  // ① 文字跟随图形（同组内子节点成对移动）
  for (const [grp, fig, label] of [
    [NODE.grpConcession, NODE.figConcession, NODE.labelConcession],
    [NODE.grpTurn, NODE.figTurn, NODE.labelTurn],
  ] as const) {
    rels.push({ id: `rel-follow-${label}`, type: "follows", sourceIds: [fig, label], params: { maxDeviation: 1.5 }, activeDuring: [at, end], severity: "error" });
    rels.push({ id: `rel-hold-${grp}`, type: "holds", sourceIds: [grp], params: { maxDelta: 0.5 }, activeDuring: [settle, end], severity: "error" });
  }

  // ② 转折顺序：转折方不能在标记完成前显现
  rels.push({
    id: "rel-contrast-order", type: "revealAfter", sourceIds: [NODE.grpTurn],
    params: { gateAt: connEnd }, activeDuring: [at, connEnd], severity: "error",
  });

  // ③ 方向：让步在左、转折在右；标记在两者之间
  rels.push({ id: "rel-concession-left", type: "leftOf", sourceIds: [NODE.grpConcession, NODE.grpTurn], params: { minGap: 40 }, activeDuring: [settle, end], severity: "error" });
  rels.push({ id: "rel-conn-pos-1", type: "leftOf", sourceIds: [NODE.grpConcession, NODE.conn], params: { minGap: 0 }, activeDuring: [settle, end], severity: "error" });
  rels.push({ id: "rel-conn-pos-2", type: "leftOf", sourceIds: [NODE.conn, NODE.grpTurn], params: { minGap: 0 }, activeDuring: [settle, end], severity: "error" });

  // ④ 尺度：转折方图形更大（让步是铺垫，落点才是重点）
  rels.push({ id: "rel-turn-larger", type: "largerThan", sourceIds: [NODE.figTurn, NODE.figConcession], params: { minRatio: 1.1 }, activeDuring: [settle, end], severity: "error" });

  // ⑤ 净空：让步组与转折组全程不许意外重叠
  rels.push({ id: "rel-clearance-groups", type: "clearanceAtLeast", sourceIds: [NODE.grpConcession, NODE.grpTurn], params: { min: 40 }, activeDuring: [at, end], severity: "error" });

  // ⑥ 安全区：落位后关键对象都在安全区内
  rels.push({ id: "rel-safe-area", type: "insideSafeArea", sourceIds: [NODE.grpConcession, NODE.grpTurn, NODE.conn, NODE.headline], params: { margin: 20, stageW: 1280, stageH: 720 }, activeDuring: [settle, end], severity: "error" });

  // ⑦ 可读性：落位后标签实际合成颜色达标（WCAG 2.2 大文本 3:1）
  rels.push({
    id: `rel-contrast-${NODE.labelTurn}`, type: "contrastAtLeast", sourceIds: [NODE.labelTurn],
    params: { min: 3, fg: prof.tone.accent, bg: prof.tone.paper }, activeDuring: [settle, end], severity: "error",
  });
  rels.push({
    id: `rel-contrast-${NODE.labelConcession}`, type: "contrastAtLeast", sourceIds: [NODE.labelConcession],
    params: { min: 3, fg: prof.tone.ink, bg: prof.tone.paper }, activeDuring: [settle, end], severity: "warning",
  });

  return rels;
}

/**
 * 转折事件 → 视觉计划（与 planCausal 同一纪律：模板参数驱动断言）。
 * 语义不足（置信度低）返回 null，调用方降级为普通版式。
 */
export function planContrast(ev: SemanticEvent): ContrastPlan | null {
  if (ev.type !== "contrast" || ev.confidence < CONFIDENCE_MIN) return null;
  const concession = ev.entities.find((e) => e.id === "ent-concession");
  const turn = ev.entities.find((e) => e.id === "ent-turn");
  if (!concession || !turn) return null;

  const cl = labelOf(concession.name);
  const tl = labelOf(turn.name);
  const degraded: string[] = [];
  if (ev.degraded) degraded.push(ev.degraded);
  if (cl.truncated) degraded.push(`让步标签「${concession.name}」超 ${LABEL_MAX_UNITS} 字宽，截断为「${cl.label}」`);
  if (tl.truncated) degraded.push(`转折标签「${turn.name}」超 ${LABEL_MAX_UNITS} 字宽，截断为「${tl.label}」`);

  return {
    templateId: "contrast-turn-v1",
    eventId: ev.id,
    labels: { concession: cl.label, turn: tl.label },
    entityIds: { concession: concession.id, turn: turn.id },
    motionSequence: ["concession-enter", "connector-draw", "turn-enter", "hold"],
    assertions: ["group-follow", "contrast-order", "concession-left", "turn-larger", "no-unintended-overlap", "hold-after-enter", "inside-safe-area"],
    degraded: degraded.length ? degraded.join("；") : undefined,
  };
}
