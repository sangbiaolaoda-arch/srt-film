// 几何验算 CLI（方案 §4.5 的报告格式 + §12 Phase 2 的「错误必须能被检测」）。
//
// 输出两类报告，都落到 .tmp/motion-audit/：
//   ① legal.json  —— 合法比较切片的逐帧验算（应当全绿；不绿说明检查器或模板有问题）
//   ② illegal-*.json —— 每个反向夹具一份（必须报错并定位到对象/时间/偏差）
//
// 为什么在 node 里跑而不是浏览器：IR 验算（方案 §4.2 层 A）按定义是纯函数计算，
// 浏览器那层（层 B）在 motion-geometry-browser 里做，两者互补不互相替代。

import { mkdirSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { extractEvents } from "../src/semantics/events.ts";
import { planComparison } from "../src/semantics/visual-plan.ts";
import {
  buildCompareSlice,
  compareMoves,
  compareRelations,
  NODE,
} from "../src/semantics/compare-slice.ts";
import { auditMotionGeometry, type ElementGraph, type MovePlan, type RelationConstraint } from "../src/motion/elements.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = resolve(ROOT, ".tmp/motion-audit");
mkdirSync(OUT, { recursive: true });

/** 与 stage.tsx 相同的时基假设：拍长 4.0s（SRT 区间），拍在时间轴起点 at=1.0。 */
const AT = 1.0;
const DUR = 4.0;

function build(text: string) {
  const evs = extractEvents(text, 7);
  const cmp = evs.find((e) => e.type === "compare")!;
  const plan = planComparison(cmp)!;
  const slice = buildCompareSlice(plan, "shot-audit", { hasCaption: true });
  return { graph: slice.graph, moves: compareMoves(slice, AT, DUR), relations: compareRelations(slice, AT, DUR, "editorial") };
}

interface Case {
  id: string;
  text: string;
  /** 反向夹具：对合法产物做一处破坏，必须被报告抓到 */
  break?: (g: { graph: ElementGraph; moves: MovePlan[]; relations: RelationConstraint[] }) => void;
}

const CASES: Case[] = [
  { id: "legal-winner", text: "精装书比平装书好，字大行疏，读起来不费劲。" },
  { id: "legal-neutral", text: "精装书比平装书贵。" },
  { id: "legal-negated", text: "精装书并不比平装书好。" },
  {
    id: "illegal-detached-child",
    text: "精装书比平装书好，字大行疏，读起来不费劲。",
    // 反向 1（方案 §4.5）：把组内标签从组里摘出来 —— 它不再跟随图形
    break: ({ graph }) => {
      for (const n of graph.nodes) if (n.id === NODE.labelPrimary) n.parentId = undefined;
    },
  },
  {
    id: "illegal-child-drift",
    text: "精装书比平装书好，字大行疏，读起来不费劲。",
    // 反向 2：子节点额外位移 20px（父子重复位移的同义写法）
    break: ({ graph }) => {
      for (const n of graph.nodes) if (n.id === NODE.figSecondary) n.localTransform = { ...n.localTransform, x: 20 };
    },
  },
  {
    id: "illegal-hold-drift",
    text: "精装书比平装书好，字大行疏，读起来不费劲。",
    // 反向 3：保持阶段加入 6px 上下漂移 —— 一条没有 reason、落在 holds 区间内的 move
    break: ({ graph, moves }) => {
      const grp = graph.nodes.find((n) => n.id === NODE.grpPrimary)!;
      moves.push({
        id: "mv-undeclared-drift",
        targetId: grp.id,
        channel: "transform",
        start: 3.2,
        duration: 0.6,
        from: { y: 0 },
        to: { y: 6 },
        ease: "sine.inOut",
        reason: "（未声明）",
        eventId: "ev-7-compare-adj",
      });
    },
  },
  {
    id: "illegal-overlap",
    text: "精装书比平装书好，字大行疏，读起来不费劲。",
    // 反向 4：两个主对象意外重叠 —— 把主体组整体搬到参照组位置上。
    // （初版把参照组左移 200px，实测触发的是「出安全区」而不是「净空」——
    //  夹具必须打中它声称要打中的那条关系，否则等于没测。）
    break: ({ graph }) => {
      const target = graph.nodes.find((n) => n.id === NODE.grpSecondary)!.bounds;
      const shift = target.x - graph.nodes.find((n) => n.id === NODE.grpPrimary)!.bounds.x;
      for (const n of graph.nodes) {
        if (n.id === NODE.grpPrimary || n.parentId === NODE.grpPrimary) n.bounds = { ...n.bounds, x: n.bounds.x + shift };
      }
    },
  },
  {
    id: "illegal-out-of-safe-area",
    text: "精装书比平装书好，字大行疏，读起来不费劲。",
    // 反向 5：把主体组推出安全区
    break: ({ graph }) => {
      for (const n of graph.nodes) if (n.parentId === NODE.grpPrimary) n.bounds = { ...n.bounds, x: 1290 };
      for (const n of graph.nodes) if (n.id === NODE.grpPrimary) n.bounds = { ...n.bounds, x: 1290 };
    },
  },
  {
    id: "illegal-direction-flip",
    text: "精装书比平装书好，字大行疏，读起来不费劲。",
    // 反向 6：比较方向反转（主体画到左边）
    break: ({ graph }) => {
      for (const n of graph.nodes) {
        if (n.parentId === NODE.grpPrimary) n.bounds = { ...n.bounds, x: 128 };
      }
      for (const n of graph.nodes) if (n.id === NODE.grpPrimary) n.bounds = { ...n.bounds, x: 128 };
    },
  },
  {
    id: "illegal-easing-mismatch",
    text: "精装书比平装书好，字大行疏，读起来不费劲。",
    // 反向 7（方案 §4.5）：计划用了 IR 不认识的缓动 —— 计划与实现必然不一致
    break: ({ moves }) => {
      for (const m of moves) if (m.id === "mv-primary-enter") m.ease = "elastic.out(1,0.3)";
    },
  },
];

let failures = 0;
const summary: Array<{ id: string; expect: "pass" | "fail"; got: string }> = [];

for (const c of CASES) {
  const { graph, moves, relations } = build(c.text);
  c.break?.({ graph, moves, relations });
  const rep = auditMotionGeometry(graph, moves, relations, { from: AT, to: AT + DUR, fps: 30 });
  const expectFail = !!c.break;
  const errors = rep.violations.filter((v) => v.severity === "error");
  const ok = expectFail ? errors.length > 0 : errors.length === 0;
  if (!ok) failures++;
  summary.push({ id: c.id, expect: expectFail ? "fail" : "pass", got: errors.length ? `fail(${errors.length})` : "pass" });
  writeFileSync(resolve(OUT, `${c.id}.json`), JSON.stringify(rep, null, 2));
  const tag = ok ? "✓" : "✗";
  console.log(`${tag} ${c.id} —— ${errors.length ? errors[0].detail : "无违反"}`);
  if (errors.length > 0) {
    console.log(`    [首条] 关系=${errors[0].relationId} 时间=${errors[0].at}s 帧=${errors[0].frame} 偏差=${errors[0].detail}`);
  }
}

console.log("\n汇总：", summary.map((s) => `${s.id}:${s.expect}/${s.got}`).join("  "));
console.log(failures === 0 ? "全部夹具符合预期" : `${failures} 个夹具不符合预期`);
process.exit(failures === 0 ? 0 : 1);
