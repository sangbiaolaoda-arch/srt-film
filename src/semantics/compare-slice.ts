// 比较切片（方案 §4 Phase 1 的垂直切片）：把 VisualPlan 落成**可渲染、可验算**的三件套。
//
//   layout  —— 仍是一个普通 Layout（进现有 pick/render/checkLayout 通路，不是平行系统）
//   graph   —— 元素图：组 + 子节点 + 最终几何 + 变换原点
//   moves   —— 组级 MovePlan（绝对时间由 materialize 求出，与 MotionPlan.at 同一时基）
//
// 三条硬约束（方案 §3.3）在这里落地：
//   ① 同一实体的文字与图形是**一个组**，组是唯一位移来源（子节点 localTransform 恒为单位）；
//   ② 子节点的坐标是最终位置，组变换叠加其上 —— 不会父子各移动一遍；
//   ③ 每个 move 都带 reason；同一目标同一属性不许有未声明的时间重叠（validateMoves 查）。
//
// 时间基准：所有相对时间以「本拍起点」为 0，`k` 是按拍长的压缩系数 ——
// 短拍不截断动作，而是等比压缩，保证「入场 → 让位 → 主体入场 → 保持」的顺序不变。

import type { Layout, Slot, Tone } from "../layouts/types";
import type { FigureKind } from "../layouts/figures";
import type { ElementGraph, ElementNode, MovePlan, RelationConstraint, Box } from "../motion/elements";
import { resolveProfile } from "../styles/style-system";
import type { VisualPlan } from "./visual-plan";

export const COMPARE_LAYOUT_ID = "sem-compare-group-v1";

/** 元素图的节点 id 契约（渲染层与验算层都按这套 id 找对象）。 */
export const NODE = {
  headline: "headline",
  grpPrimary: "grp-primary",
  grpSecondary: "grp-secondary",
  figPrimary: "fig-primary",
  figSecondary: "fig-secondary",
  labelPrimary: "label-primary",
  labelSecondary: "label-secondary",
} as const;

export interface CompareSlice {
  plan: VisualPlan & { layout: Layout };
  /** 与本拍 shot 绑定的元素图（最终几何，画面坐标） */
  graph: ElementGraph;
  /** 组 id → 组锚点（画面坐标），渲染层写进 data-group，验算层用作缩放原点 */
  anchors: Record<string, { x: number; y: number }>;
  /** 保持窗口相对于拍首的起点（秒）—— holds/contrast/order 都从这里开始算 */
  holdOffset: number;
  /** 主体入场结束的相对时间（秒）—— final-order / primary-larger 的生效点 */
  settleOffset: number;
  /** 语义降级/资产未命中的记录（进报告） */
  notes: string[];
}

/* ── 归一化网格 → 画面坐标（与 constraints.ts slotBox 同一套数学）────────────── */
const COLS = 12;
const ROWS = 8;
const W = 1280;
const H = 720;

function px(box: [number, number, number, number]): Box {
  const [gx, gy, gw, gh] = box;
  return { x: (gx / COLS) * W, y: (gy / ROWS) * H, w: (gw / COLS) * W, h: (gh / ROWS) * H };
}

function union(a: Box, b: Box): Box {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
}

function center(b: Box): { x: number; y: number } {
  return { x: b.x + b.w / 2, y: b.y + b.h / 2 };
}

/* ── 几何模板：左/右两个位置。哪个实体去哪一侧由 VisualPlan 决定，不在这里写死 ──
 * 净空口径（rel-clearance-groups 要求 ≥40px）：两个组的**包围盒**间距必须够 ——
 * 组盒是图形盒与标签盒的并集，标签盒比图形盒宽（视觉上居中于图形之下），
 * 所以左右两组之间最接近的是「右侧标签左边界 vs 左侧标签右边界」。
 * 初版把图形放在 [1.4..4.5] 而标签放在 [1.15..4.75]，两标签只差 36px，运动中还会互相叠 13px
 * （实测报错）—— 这里把整体内收：图形 [1.6..4.3]、标签 [1.35..4.55]，
 * 于是两组标签之间净空 40px，图形之间净空远超 40px。 */
const LEFT = {
  figure: [1.6, 2.6, 2.7, 2.4] as [number, number, number, number],
  label: [1.35, 5.12, 3.2, 0.62] as [number, number, number, number],
};
const RIGHT_BIG = {
  // 主体位：更大（primaryScaleGreater 的几何来源），label 也宽一档
  figure: [7.7, 2.45, 2.9, 2.7] as [number, number, number, number],
  label: [7.45, 5.3, 3.5, 0.68] as [number, number, number, number],
};
const RIGHT_EQUAL = {
  figure: [7.6, 2.6, 2.7, 2.4] as [number, number, number, number],
  label: [7.35, 5.12, 3.2, 0.62] as [number, number, number, number],
};

/** 名词 → 具体图形（方案 §8.2 的一级回退；未命中记 unmapped，用中性几何代替）。 */
const FIGURE_WORDS: Array<{ re: RegExp; kind: FigureKind }> = [
  { re: /书|册|本子|读本/, kind: "fig-book" },
];

function figureFor(name: string): { kind: FigureKind; note?: string } {
  for (const f of FIGURE_WORDS) if (f.re.test(name)) return { kind: f.kind };
  return { kind: "fig-book", note: `「${name}」未命中具体图形资产，退回中性几何（unmapped）` };
}

interface SideSpec {
  side: "left" | "right";
  entity: { id: string; label: string };
  /** primary 位的几何更大 */
  big: boolean;
}

/** 构造布局 + 元素图。纯函数：同一 VisualPlan 永远得到同一份几何。 */
export function buildCompareSlice(plan: VisualPlan, shotId: string, opts: { hasCaption?: boolean } = {}): CompareSlice {
  const notes: string[] = [];
  const primarySide = plan.finalLayout.primarySide;
  const secondarySide = plan.finalLayout.secondarySide;
  const sides: SideSpec[] = [
    { side: primarySide, entity: { id: plan.entityIds.primary, label: plan.labels.primary }, big: plan.finalLayout.primaryScaleGreater },
    { side: secondarySide, entity: { id: plan.entityIds.secondary, label: plan.labels.secondary }, big: false },
  ];

  const slots: Slot[] = [];
  const nodes: ElementNode[] = [];
  const anchors: Record<string, { x: number; y: number }> = {};

  // ① 句首大标题（不参与组运动，仍由现有槽位入场动效驱动）
  const headlineBox: [number, number, number, number] = [0.6, 0.3, 10.8, 1.0];
  slots.push({ k: "headline", box: headlineBox, size: "l", tone: "ink", src: "headline" });
  nodes.push({
    id: NODE.headline,
    kind: "text",
    localTransform: { x: 0, y: 0, scaleX: 1, scaleY: 1, opacity: 1 },
    bounds: px(headlineBox),
    anchor: center(px(headlineBox)),
    role: "annotation",
  });

  // ② 两个实体组：图形 + 标签同组（这就是方案 §3.3 第 1 条）
  for (const s of sides) {
    const isPrimary = s.side === primarySide;
    const box = s.side === "left" ? LEFT : s.big ? RIGHT_BIG : RIGHT_EQUAL;
    const grpId = isPrimary ? NODE.grpPrimary : NODE.grpSecondary;
    const figId = isPrimary ? NODE.figPrimary : NODE.figSecondary;
    const labelId = isPrimary ? NODE.labelPrimary : NODE.labelSecondary;

    const fig = figureFor(s.entity.label);
    if (fig.note) notes.push(fig.note);
    const figBox = px(box.figure);
    const labelBox = px(box.label);

    slots.push({ k: "figure", box: box.figure, group: grpId, figure: fig.kind, tone: isPrimary ? "accent" : "ink", src: "none" });
    slots.push({
      k: "label",
      box: box.label,
      group: grpId,
      size: "l",
      tone: (isPrimary && plan.finalLayout.primaryContrastGreater ? "accent" : "ink") as Tone,
      align: "center",
      literal: s.entity.label,
      src: "none",
    });

    const grpBounds = union(figBox, labelBox);
    anchors[grpId] = center(figBox); // 缩放绕图形中心：观众看到的是图形在放大
    nodes.push({
      id: grpId,
      kind: "group",
      semanticEntityId: s.entity.id,
      localTransform: { x: 0, y: 0, scaleX: 1, scaleY: 1, opacity: 1 },
      bounds: grpBounds,
      anchor: anchors[grpId]!,
      role: isPrimary ? "primary" : "secondary",
    });
    nodes.push({
      id: figId,
      kind: "svg",
      semanticEntityId: s.entity.id,
      parentId: grpId,
      localTransform: { x: 0, y: 0, scaleX: 1, scaleY: 1, opacity: 1 },
      bounds: figBox,
      anchor: center(figBox),
      role: isPrimary ? "primary" : "secondary",
    });
    nodes.push({
      id: labelId,
      kind: "label",
      semanticEntityId: s.entity.id,
      parentId: grpId,
      localTransform: { x: 0, y: 0, scaleX: 1, scaleY: 1, opacity: 1 },
      bounds: labelBox,
      anchor: center(labelBox),
      role: isPrimary ? "primary" : "secondary",
    });
  }

  // ③ 中缝分隔线（结构件，不参与关系断言）
  slots.push({ k: "rule", box: [5.93, 3.1, 0.08, 1.8], tone: "hairline" });
  // ④ 尾句条：句子里第二个分句的落点，**只在真有尾句时才加槽**。
  //    没有尾句却留一个 caption 槽，槽位渲染会回落到 headline，画面底部重复一遍大标题。
  //    checkLayout 的「尾句装载」门禁要求有 caption 就必须有承载槽 —— 两条规则在这里同时满足。
  if (opts.hasCaption) {
    slots.push({ k: "caption", box: [0.6, 6.35, 10.8, 0.5], size: "s", tone: "dim", align: "center", src: "caption" });
  }

  const layout: Layout = {
    id: COMPARE_LAYOUT_ID,
    name: "语义比较 · 双实体组",
    group: "compare",
    // 组内子槽不吃槽位入场（由组级 MovePlan 统一驱动），这里只留标题/分隔线的兜底池
    enter: ["m-fade-up"],
    transition: "m-cross-dissolve",
    slots,
    groups: [
      { id: NODE.grpPrimary, entityId: plan.entityIds.primary, role: "primary", anchor: [anchors[NODE.grpPrimary]!.x, anchors[NODE.grpPrimary]!.y] },
      { id: NODE.grpSecondary, entityId: plan.entityIds.secondary, role: "secondary", anchor: [anchors[NODE.grpSecondary]!.x, anchors[NODE.grpSecondary]!.y] },
    ],
    note: `由语义模板 ${plan.templateId} 生成；组级运动唯一来源，子节点只用局部坐标`,
  };

  const settleOffset = baseOf(plan);
  return {
    plan: { ...plan, layout },
    graph: { shotId, nodes },
    anchors,
    holdOffset: settleOffset,
    settleOffset,
    notes,
  };
}

/* ── 编排时间表（相对拍首）─────────────────────────────────────────────────── */
/** 占优模板的基准节拍：入场 0.08–0.40、让位 0.40–0.92、主体入场 0.98–1.53、
 *  标签强调 1.60–1.90、其后保持。**落位点 = 1.90**：强调动效也属于「入场阶段」的一部分，
 *  holds/contrast/order 类断言从它开始算 —— 早于它就会把入场途中的姿态当成最终构图。
 *  中性模板更短：两条入场彼此错开，落位即结束（没有「让位」这一步）。 */
const WINNER_BASE = 1.9;
const NEUTRAL_BASE = 0.95;

function baseOf(plan: VisualPlan): number {
  return plan.templateId === "compare-center-handoff-v1" ? WINNER_BASE : NEUTRAL_BASE;
}

/** 按拍长把相对时间表压缩进拍内（dur 越短 k 越小）。 */
function compress(dur: number, base: number): number {
  const avail = Math.max(0.8, Math.min(dur - 0.3, 2.2));
  return Math.min(1, avail / base);
}

/**
 * 组级运动。绝对时间 = 拍在时间轴上的起点 at + 相对时间 × k。
 * 与 schedule 的 MotionPlan.at 同一时基（不另建累积游标）。
 */
export function compareMoves(slice: CompareSlice, at: number, dur: number): MovePlan[] {
  const winner = slice.plan.templateId === "compare-center-handoff-v1";
  const k = compress(dur, baseOf(slice.plan));
  const T = (rel: number) => Number((at + rel * k).toFixed(4));
  const D = (rel: number) => Number((rel * k).toFixed(4));
  const ev = slice.plan.eventId;

  if (winner) {
    return [
      {
        id: "mv-secondary-enter",
        targetId: NODE.grpSecondary,
        channel: "transform",
        start: T(0.08),
        duration: D(0.32),
        // 组变换只动**平移与不透明度**：组内任何子节点的世界位移都严格相同 ——
        // follows 才能在 x/y 两个通道上成立。组上做 scale 会让距锚点更远的标签
        // 多走一段（实测 5.87px 偏差），那是几何必然，不是缺陷，但不该混进「跟随」判据。
        from: { y: 6, opacity: 0 },
        to: { y: 0, opacity: 1 },
        ease: "power2.out",
        reason: "参照方先入场（轻微下沉后归位 + 淡入），给观众一个可比较的参照物",
        eventId: ev,
      },
      {
        id: "mv-secondary-yield",
        targetId: NODE.grpSecondary,
        channel: "transform",
        // 从入场结束那一刻起：上一段只动 y/opacity，这一段独占 x —— 两者时间首尾相接，
        // 同一属性不在时间上重叠（方案 §3.3 第 3 条：不允许未声明的重叠 tween）。
        // 位移幅度由几何决定：参照组左缘最终在 144，让位起点 = 144 + 100 = 244；
        // 主体组右缘最终在 1168，入场起点 = 1168 - 120 = 1048 → 全程最小净空
        // 100px，远超 40px 门禁（初版 140/140 实测把净空压到 29.3px）。
        start: T(0.4),
        duration: D(0.52),
        from: { x: 100 },
        to: { x: 0 },
        ease: "power2.out",
        reason: "参照方让位左移，把右侧焦点位空出来（模板的 secondary-yield 步骤）",
        eventId: ev,
      },
      {
        id: "mv-primary-enter",
        targetId: NODE.grpPrimary,
        channel: "transform",
        start: T(0.98),
        duration: D(0.55),
        from: { x: -120, y: 0, opacity: 0 },
        to: { x: 0, y: 0, opacity: 1 },
        ease: "power3.out",
        reason: "主体后入场，从右侧落位到右焦点位 —— 落位本身就是一次克制的强调",
        eventId: ev,
      },
      {
        // 显式局部动画（方案 §3.3 第 2 条）：尺度强调只落在主体标签上，
        // 不进入组的变换，也不动 x/y —— 因此不干扰 follows 的位移判据。
        id: "mx-primary-label-emphasis",
        targetId: NODE.labelPrimary,
        channel: "transform",
        start: T(1.6),
        duration: D(0.3),
        from: { scale: 1 },
        to: { scale: 1.08 },
        ease: "power2.out",
        reason: "主体标签一次性轻放大后保持（不是呼吸循环，也不是永久缩放）",
        eventId: ev,
      },
    ];
  }

  return [
    {
      id: "mv-primary-enter",
      targetId: NODE.grpPrimary,
      channel: "transform",
      start: T(0.08),
      duration: D(0.42),
      from: { x: 110, y: 0, opacity: 0 },
      to: { x: 0, y: 0, opacity: 1 },
      ease: "power2.out",
      reason: "主体先入场（中性模板：双方等权重，只有先后顺序，没有优劣暗示）",
      eventId: ev,
    },
    {
      id: "mv-secondary-enter",
      targetId: NODE.grpSecondary,
      channel: "transform",
      start: T(0.5),
      duration: D(0.45),
      from: { x: -110, y: 0, opacity: 0 },
      to: { x: 0, y: 0, opacity: 1 },
      ease: "power2.out",
      reason: "参照方随后入场，位移幅度与透明度终值和主体完全相同（不制造优胜者）",
      eventId: ev,
    },
  ];
}

/**
 * 关系约束 —— **全部由模板参数生成**（方案 §5.4）：谁和谁、哪个区间、允许多少。
 * 注意区间选择：
 *   · clearance（净空）覆盖全拍 —— 运动中也不许意外碰撞；
 *   · insideSafeArea / final-order / primary-larger / contrast 只覆盖落位后（hold）——
 *     入场途中元素本就在起点位置，那是有意的位移，不是越界。
 */
export function compareRelations(slice: CompareSlice, at: number, dur: number, style?: string): RelationConstraint[] {
  const winner = slice.plan.templateId === "compare-center-handoff-v1";
  const k = compress(dur, baseOf(slice.plan));
  const settle = Number((at + slice.settleOffset * k).toFixed(4));
  const end = Number((at + dur).toFixed(4));
  const prof = resolveProfile(style);
  const rels: RelationConstraint[] = [];

  // ① 文字跟随图形：同一实体的两个子节点必须成对移动
  for (const [grp, fig, label] of [
    [NODE.grpPrimary, NODE.figPrimary, NODE.labelPrimary],
    [NODE.grpSecondary, NODE.figSecondary, NODE.labelSecondary],
  ] as const) {
    rels.push({
      id: `rel-follow-${label}`,
      type: "follows",
      sourceIds: [fig, label],
      params: { maxDeviation: 1.5 },
      activeDuring: [at, end],
      severity: "error",
    });
    rels.push({
      id: `rel-hold-${grp}`,
      type: "holds",
      sourceIds: [grp],
      params: { maxDelta: 0.5 },
      activeDuring: [settle, end],
      severity: "error",
    });
  }

  // ② 净空：两个实体组全程不许意外重叠
  rels.push({
    id: "rel-clearance-groups",
    type: "clearanceAtLeast",
    sourceIds: [NODE.grpPrimary, NODE.grpSecondary],
    params: { min: 40 },
    activeDuring: [at, end],
    severity: "error",
  });

  // ③ 安全区：落位后全部关键对象必须在安全区内
  rels.push({
    id: "rel-safe-area",
    type: "insideSafeArea",
    sourceIds: [NODE.grpPrimary, NODE.grpSecondary, NODE.headline],
    params: { margin: 20, stageW: 1280, stageH: 720 },
    activeDuring: [settle, end],
    severity: "error",
  });

  // ④ 模板专属断言：方向、尺度、对比度（只在中性模板之外声明优劣）
  if (winner) {
    const primaryOnRight = slice.plan.finalLayout.primarySide === "right";
    rels.push({
      id: "rel-final-order",
      type: primaryOnRight ? "leftOf" : "rightOf",
      sourceIds: primaryOnRight ? [NODE.grpSecondary, NODE.grpPrimary] : [NODE.grpPrimary, NODE.grpSecondary],
      params: { minGap: 40 },
      activeDuring: [settle, end],
      severity: "error",
    });
    rels.push({
      id: "rel-primary-larger",
      type: "largerThan",
      sourceIds: [NODE.figPrimary, NODE.figSecondary],
      params: { minRatio: 1.1 },
      activeDuring: [settle, end],
      severity: "error",
    });
  }

  // ⑤ 可读性：落位后标签的**实际合成颜色**必须达标（大字 3:1，WCAG 2.2 大文本档）
  const primaryTone = slice.plan.finalLayout.primaryContrastGreater ? prof.tone.accent : prof.tone.ink;
  rels.push({
    id: "rel-contrast-primary",
    type: "contrastAtLeast",
    sourceIds: [NODE.labelPrimary],
    params: { min: 3, fg: primaryTone, bg: prof.tone.paper },
    activeDuring: [settle, end],
    severity: "error",
  });
  rels.push({
    id: "rel-contrast-secondary",
    type: "contrastAtLeast",
    sourceIds: [NODE.labelSecondary],
    params: { min: 3, fg: prof.tone.ink, bg: prof.tone.paper },
    activeDuring: [settle, end],
    severity: "warning",
  });

  return rels;
}

/** 主体/参照的最终世界盒（报告与断言用）。 */
export function finalBoxes(graph: ElementGraph): Record<string, Box> {
  const out: Record<string, Box> = {};
  for (const n of graph.nodes) out[n.id] = n.bounds;
  return out;
}
