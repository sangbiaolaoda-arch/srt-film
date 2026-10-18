// 全片运动验算门禁（方案 §12 Phase 2：「先让错误能被检测」）。
//
// 与 motion-geometry-audit.ts 的分工：
//   · audit.ts  = 夹具层（3 合法 + 11 反向），证明**检查器本身**可信（反向必须全抓）；
//   · 本文件    = 语料层（真实 SRT → plan() → 每个语义拍逐输出帧验算），
//                证明**真实成片**满足跟随/保持/边界/净空/方向/对比度断言。
//
// 时基与演出严格同源：stage.tsx 用 buildMotionSchedule 的 plans[i].at/dur 编译组级
// MovePlan（dispatch.movesFor），这里走同一函数取 at/dur —— 两处各算一遍时间就是
// 缺陷 5 的老路（schedule.ts 注释里记着）。
//
// 用法：
//   node tools/run-ts.mjs tools/motion-qa.ts                 # 全部 examples/*.srt
//   node tools/run-ts.mjs tools/motion-qa.ts examples/13-compare-book.srt
//   node tools/run-ts.mjs tools/motion-qa.ts --self-test     # 门禁自检：注入破坏必须被抓
// 退出码：任一语义拍有 error 级违反 → 1（门禁）；只有 warning → 0 但列出。

import { readFileSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { plan } from "../src/core/plan.ts";
import { buildMotionSchedule } from "../src/motion/schedule.ts";
import { auditMotionGeometry, type ElementGraph, type GeometryViolation, type MovePlan, type RelationConstraint } from "../src/motion/elements.ts";
import { movesFor, relationsFor } from "../src/semantics/dispatch.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = resolve(ROOT, ".tmp/motion-qa");
mkdirSync(OUT, { recursive: true });

const args = process.argv.slice(2);
const selfTest = args.includes("--self-test");
const fileArgs = args.filter((a) => !a.startsWith("--"));
const files = fileArgs.length > 0
  ? fileArgs.map((a) => resolve(ROOT, a))
  : readdirSync(resolve(ROOT, "examples"))
      .filter((f) => f.endsWith(".srt"))
      .sort()
      .map((f) => resolve(ROOT, "examples", f));

interface ShotResult {
  corpus: string;
  beat: number;
  layoutId: string;
  kind: string;
  templateId: string;
  framesChecked: number;
  relationChecks: number;
  errors: number;
  warnings: number;
  violations: GeometryViolation[];
  /** --self-test：往这份真实计划里注入一处破坏，门禁必须报错（防空检查器，方案 §4.5） */
  injected?: { name: string; caught: boolean; firstError: string };
}

/**
 * 破坏注入（self-test）：对**真实语料的真实计划**做破坏，而不是对夹具做破坏。
 * 每个语义拍注入一种它自己结构上必然存在的错：
 *   · compare：主体标签脱离组（follows 必炸）
 *   · causal：结果组入场提前到连线完成前（revealAfter 必炸）
 * 返回新的 graph/moves/relations（深拷贝，不污染原计划）。
 */
function injectBreak(kind: string, graph: ElementGraph, moves: MovePlan[], relations: RelationConstraint[]) {
  const g: ElementGraph = JSON.parse(JSON.stringify(graph));
  const mv: MovePlan[] = JSON.parse(JSON.stringify(moves));
  if (kind === "compare") {
    for (const n of g.nodes) if (n.id === "label-primary") n.parentId = undefined;
    return { g, mv, name: "主体标签脱离组", expectRelation: "rel-follow-label-primary" };
  }
  if (kind === "causal") {
    // 把结果入场提前到 t=连线完成之前：revealAfter 断言「结果不得早于因果连接完成」
    const eff = mv.find((m) => m.id === "mv-effect-enter");
    if (eff) {
      eff.start = Math.max(0, eff.start - 1.2);
      eff.from = { ...eff.from, opacity: 1 };
      eff.to = { ...eff.to, opacity: 1 };
    }
    return { g, mv, name: "结果早于连线完成就显现", expectRelation: "rel-causal-order" };
  }
  return null;
}

const results: ShotResult[] = [];
let totalSemantic = 0;
let totalShots = 0;
let exitCode = 0;

for (const file of files) {
  const srt = readFileSync(file, "utf8");
  const corpus = basename(file, ".srt");
  const r = plan(srt);
  if (r.problems.length > 0) {
    console.log(`✗ ${corpus}：规划门禁有 ${r.problems.length} 个问题 —— 先修规划再验运动（${r.problems[0]}）`);
    exitCode = 1;
    continue;
  }
  totalShots += r.shots.length;
  const sched = buildMotionSchedule(r.shots);
  const semanticShots = r.shots.filter((s) => s.semantic);
  totalSemantic += semanticShots.length;

  for (const shot of semanticShots) {
    const i = r.shots.indexOf(shot);
    const mp = sched.plans[i]!;
    const moves = movesFor(shot.semantic!, mp.at, mp.dur);
    const relations = relationsFor(shot.semantic!, mp.at, mp.dur, shot.layout.style);
    const rep = auditMotionGeometry(shot.semantic!.graph, moves, relations, {
      from: mp.at,
      to: mp.at + mp.dur,
      fps: 30,
      maxViolationsPerRelation: 5,
    });
    const errors = rep.violations.filter((v) => v.severity === "error");
    const warnings = rep.violations.filter((v) => v.severity !== "error");
    const res: ShotResult = {
      corpus,
      beat: shot.content.beat,
      layoutId: shot.layout.id,
      kind: shot.semantic!.kind,
      templateId: shot.semantic!.plan.templateId,
      framesChecked: rep.framesChecked,
      relationChecks: rep.relationChecks,
      errors: errors.length,
      warnings: warnings.length,
      violations: rep.violations,
    };
    results.push(res);
    const tag = errors.length > 0 ? "✗" : "✓";
    console.log(
      `  ${tag} ${corpus} 拍${shot.content.beat} [${shot.semantic!.kind}/${shot.semantic!.plan.templateId}] ` +
        `${rep.framesChecked}帧/${rep.relationChecks}检查 错误=${errors.length} 告警=${warnings.length}`,
    );
    for (const v of errors.slice(0, 3)) {
      console.log(`      ${v.relationId}@${v.at.toFixed(2)}s(f${v.frame}) ${v.detail}`);
    }
    if (errors.length > 0) exitCode = 1;

    // 门禁自检：对真实计划注入一处破坏，必须被对应关系抓到。
    // 空检查器（注入破坏也不报错）比漏检更危险 —— 方案 §4.5 的原话。
    if (selfTest) {
      const inj = injectBreak(shot.semantic!.kind, shot.semantic!.graph, moves, relations);
      if (!inj) {
        console.log(`      ⚠ self-test：kind=${shot.semantic!.kind} 没有对应注入策略`);
        exitCode = 1;
      } else {
        const bad = auditMotionGeometry(inj.g, inj.mv, relations, { from: mp.at, to: mp.at + mp.dur, fps: 30, maxViolationsPerRelation: 2 });
        const caught = bad.violations.some((v) => v.relationId === inj.expectRelation && v.severity === "error");
        res.injected = { name: inj.name, caught, firstError: bad.violations.find((v) => v.severity === "error")?.detail ?? "" };
        console.log(`      ${caught ? "✓" : "✗"} 注入「${inj.name}」→ ${inj.expectRelation} ${caught ? "被抓到" : "**没抓到 —— 门禁失效**"}`);
        if (!caught) exitCode = 1;
      }
    }
  }
}

writeFileSync(
  resolve(OUT, "motion-qa.json"),
  JSON.stringify({ corpora: files.length, shots: totalShots, semanticShots: totalSemantic, results }, null, 2),
);
console.log(
  `\n语料 ${files.length} 个 · ${totalShots} 拍 · 语义接管 ${totalSemantic} 拍（覆盖率 ${totalShots ? ((totalSemantic / totalShots) * 100).toFixed(0) : 0}%）`,
);
console.log(`报告 → .tmp/motion-qa/motion-qa.json`);
console.log(exitCode === 0 ? "✓ 全部语义拍逐帧验算通过" : "✗ 有语义拍验算失败");
process.exit(exitCode);
