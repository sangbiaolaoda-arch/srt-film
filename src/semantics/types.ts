// 语义切片的统一货币类型（方案 §4 Phase 1/3）。
//
// 每个事件类型（比较 / 因果 / 否定 / 转折 / 变化）都落成同一个 SemanticSlice 形状，
// 这样 plan.ts 只产出一个 `semantic` 字段、stage.tsx 只按 `kind` 派发 moves，
// 不需要为每个事件维护一套平行的 Shot 字段。
//
// 引擎层（evaluateMotionPlan / auditMotionGeometry）只看 ElementGraph + MovePlan +
// RelationConstraint，与具体事件类型无关 —— 这正是「逻辑验算与浏览器实测各司其职」能成立的前提。

import type { Layout } from "../layouts/types";
import type { ElementGraph } from "../motion/elements";

/** 切片种类。每加一个 Phase 3 事件就在这里加一个成员。 */
export type SliceKind = "compare" | "causal" | "negation" | "contrast" | "change";

/** 所有语义切片共有的输出。具体事件可在此基础上加自己的计划字段（如 CompareSlice.plan）。 */
export interface SemanticSlice {
  /** 派发键：stage.tsx 与 movesFor/relationsFor 按它选编译逻辑 */
  kind: SliceKind;
  /** 仍是一个普通 Layout，进现有 pick/render/checkLayout 通路（方案 §0 原则 A：不平行重建） */
  layout: Layout;
  /** 元素图：组 + 子节点 + 最终几何 + 变换原点（画面坐标，1280×720） */
  graph: ElementGraph;
  /** 组 id → 组锚点（画面坐标），渲染层写进 data-group，验算层用作缩放原点 */
  anchors: Record<string, { x: number; y: number }>;
  /** 保持窗口相对于拍首的起点（秒）—— holds / 落位类断言从这里算 */
  holdOffset: number;
  /** 主体入场结束的相对时间（秒）—— final-order 等生效点 */
  settleOffset: number;
  /** 语义降级 / 资产未命中的记录（进报告） */
  notes: string[];
}
