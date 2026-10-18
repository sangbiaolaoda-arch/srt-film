// 语义切片派发（方案 §4 Phase 3）：按 SemanticSlice.kind 选编译逻辑。
//
// plan.ts 只产出一个 `semantic` 字段，stage.tsx 只调 movesFor/relationsFor ——
// 每加一个 Phase 3 事件，只在这里加一个 case，不需要给 Shot 加平行字段、也不需要
// 在舞台里写一串 if/else 分支。引擎层（evaluateMotionPlan / auditMotionGeometry）始终只看
// ElementGraph + MovePlan + RelationConstraint，与具体事件类型无关。

import type { MovePlan, RelationConstraint } from "../motion/elements";
import type { SemanticSlice } from "./types";
import { compareMoves, compareRelations } from "./compare-slice";
import { causalMoves, causalRelations } from "./causal-slice";

export function movesFor(slice: SemanticSlice, at: number, dur: number): MovePlan[] {
  switch (slice.kind) {
    case "compare":
      return compareMoves(slice as Parameters<typeof compareMoves>[0], at, dur);
    case "causal":
      return causalMoves(slice as Parameters<typeof causalMoves>[0], at, dur);
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
    default:
      return [];
  }
}
