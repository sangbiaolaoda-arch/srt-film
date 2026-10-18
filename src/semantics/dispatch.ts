// 语义切片派发（方案 §4 Phase 3）：按 SemanticSlice.kind 选编译逻辑。
//
// plan.ts 只产出一个 `semantic` 字段，stage.tsx 只调 movesFor/relationsFor ——
// 每加一个 Phase 3 事件，只在这里加 case，不需要给 Shot 加平行字段、也不需要
// 在舞台里写一串 if/else 分支。引擎层（evaluateMotionPlan / auditMotionGeometry）始终只看
// ElementGraph + MovePlan + RelationConstraint，与具体事件类型无关。

import type { MovePlan, RelationConstraint } from "../motion/elements";
import type { SemanticSlice } from "./types";
import type { SemanticEvent, EventType } from "./events";
import { planComparison } from "./visual-plan";
import { buildCompareSlice, compareMoves, compareRelations } from "./compare-slice";
import { planCausal, buildCausalSlice, causalMoves, causalRelations } from "./causal-slice";
import { planNegation, buildNegationSlice, negationMoves, negationRelations } from "./negation-slice";
import { planContrast, buildContrastSlice, contrastMoves, contrastRelations } from "./contrast-slice";
import { planChange, buildChangeSlice, changeMoves, changeRelations } from "./change-slice";

export function movesFor(slice: SemanticSlice, at: number, dur: number): MovePlan[] {
  switch (slice.kind) {
    case "compare":
      return compareMoves(slice as Parameters<typeof compareMoves>[0], at, dur);
    case "causal":
      return causalMoves(slice as Parameters<typeof causalMoves>[0], at, dur);
    case "negation":
      return negationMoves(slice as Parameters<typeof negationMoves>[0], at, dur);
    case "contrast":
      return contrastMoves(slice as Parameters<typeof contrastMoves>[0], at, dur);
    case "change":
      return changeMoves(slice as Parameters<typeof changeMoves>[0], at, dur);
    default:
      return [];
  }
}

export function relationsFor(slice: SemanticSlice, at: number, dur: number, style?: string): RelationConstraint[] {
  switch (slice.kind) {
    case "compare":
      return compareRelations(slice as Parameters<typeof compareRelations>[0], at, dur, style);
    case "causal":
      return causalRelations(slice as Parameters<typeof causalRelations>[0], at, dur, style);
    case "negation":
      return negationRelations(slice as Parameters<typeof negationRelations>[0], at, dur, style);
    case "contrast":
      return contrastRelations(slice as Parameters<typeof contrastRelations>[0], at, dur, style);
    case "change":
      return changeRelations(slice as Parameters<typeof changeRelations>[0], at, dur, style);
    default:
      return [];
  }
}

/** 依族尝试把语义事件落成切片：比较 → 因果 → 否定 → 转折 → 变化（与 extractEvents 同序）。
 *  命中第一个可执行的即返回；全部落空返回 null（拍走普通选版）。
 *  plan.ts 只消费这个函数 —— 每加一个事件类型，只有本文件需要跟着改。 */
export function buildSemanticSlice(
  events: SemanticEvent[],
  shotId: string,
  hasCaption: boolean,
): { slice: SemanticSlice; templateId: string; eventId: string; assertions: string[] } | null {
  const families: Array<{ type: EventType; tryPlan: (ev: SemanticEvent) => { templateId: string; eventId: string; assertions: string[] } | null; build: (plan: never, shotId: string, opts: { hasCaption?: boolean }) => SemanticSlice }> = [
    {
      type: "compare",
      tryPlan: (ev) => planComparison(ev),
      build: (p, id, o) => buildCompareSlice(p as Parameters<typeof buildCompareSlice>[0], id, o),
    },
    {
      type: "cause_effect",
      tryPlan: (ev) => planCausal(ev),
      build: (p, id, o) => buildCausalSlice(p as Parameters<typeof buildCausalSlice>[0], id, o),
    },
    {
      type: "negation",
      tryPlan: (ev) => planNegation(ev),
      build: (p, id, o) => buildNegationSlice(p as Parameters<typeof buildNegationSlice>[0], id, o),
    },
    {
      type: "contrast",
      tryPlan: (ev) => planContrast(ev),
      build: (p, id, o) => buildContrastSlice(p as Parameters<typeof buildContrastSlice>[0], id, o),
    },
    {
      type: "change",
      tryPlan: (ev) => planChange(ev),
      build: (p, id, o) => buildChangeSlice(p as Parameters<typeof buildChangeSlice>[0], id, o),
    },
  ];

  for (const fam of families) {
    const ev = events.find((e) => e.type === fam.type);
    if (!ev) continue;
    const plan = fam.tryPlan(ev);
    if (!plan) continue;
    const slice = fam.build(plan as never, shotId, { hasCaption });
    return { slice, templateId: plan.templateId, eventId: ev.id, assertions: plan.assertions };
  }
  return null;
}
