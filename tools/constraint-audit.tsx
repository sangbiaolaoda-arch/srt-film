// 布局约束干跑（Phase 6 调试信息）：把全部 catalog 版式过一遍约束检查器。
// 用法: node tools/run-ts.mjs tools/constraint-audit.tsx
// custom 满版画面（v2 板/专属场景）自己管构图，跳过 —— 与 plan.ts 门禁同规则。
import { LAYOUTS } from "../src/layouts/catalog";
import { checkLayout } from "../src/layouts/constraints";
import type { RenderContent } from "../src/layouts/types";

const demo: RenderContent = {
  headline: "系统自动规划视觉内容",
  bullets: ["第一要点", "第二要点", "第三要点"],
  numbers: [85, 120, 3.2],
  bignum: "85",
  beat: 1,
};

const slotLayouts = LAYOUTS.filter((l) => !l.custom);
let errs = 0;
let warns = 0;
for (const l of slotLayouts) {
  const r = checkLayout(l, demo);
  for (const e of r.errors) {
    errs++;
    console.log(`ERR ${l.id}: ${e}`);
  }
  for (const w of r.warnings) {
    warns++;
    console.log(`WRN ${l.id}: ${w}`);
  }
}
console.log(`\n${slotLayouts.length} 个槽位版式 → 硬错误 ${errs} / 告警 ${warns}`);
