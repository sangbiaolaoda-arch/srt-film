// 能力覆盖地图（不只看版式）：叙事角色、bignum 强调、HANDOFF 承接边、
// 数字净化上下文 —— 找「全语料 0 命中」的真实缺口。
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { plan } from "../src/core/plan";
import { HANDOFF } from "../src/core/compose";

const files = [
  "01-explanatory-tech.srt", "02-narrative-emotion.srt", "03-data-comparison.srt",
  "04-longform-3min.srt", "05-kaojin-60s.srt", "06-history-events.srt",
  "08-forgetting-20s.srt", "10-reasoning-chain.srt", "11-visual-density.srt",
];

const roles: Record<string, number> = {};
const handoffEdges: Record<string, number> = {};
const bignumShots = 0;
let total = 0;
const decContexts = new Set<string>(); // 数字前后语境种类

for (const f of files) {
  const { shots } = plan(readFileSync(resolve(process.cwd(), "examples", f), "utf-8"), "");
  for (let i = 0; i < shots.length; i++) {
    const s = shots[i]!;
    total++;
    const r = s.narrative.role;
    roles[r] = (roles[r] ?? 0) + 1;
    if (s.content.bignum) decContexts.add(`bignum:${r}`);
    if (i > 0) {
      const prev = shots[i - 1]!;
      const edge = `${prev.narrative.role}→${r}`;
      if (HANDOFF[prev.narrative.role]?.includes(r)) {
        handoffEdges[edge] = (handoffEdges[edge] ?? 0) + 1;
      }
    }
  }
}

console.log(`总计 ${total} 拍 / 7 文件\n`);
console.log("叙事角色命中：");
for (const r of ["hook", "explanation", "definition", "evidence", "comparison", "consequence", "conclusion"]) {
  console.log(`  ${r.padEnd(13)} ${roles[r] ?? 0}`);
}
const allHandoff: string[] = [];
for (const [from, tos] of Object.entries(HANDOFF)) for (const t of tos) allHandoff.push(`${from}→${t}`);
console.log("\nHANDOFF 承接边命中（共需 ${} 条）：".replace("${}", String(allHandoff.length)));
for (const e of allHandoff) console.log(`  ${e.padEnd(28)} ${handoffEdges[e] ?? 0}`);
const unused = allHandoff.filter((e) => !handoffEdges[e]);
console.log(`\n未命中边：${unused.length ? unused.join("、") : "无（全覆盖）"}`);
console.log(`\nbignum 强调拍上下文：${[...decContexts].join("、") || "无"}`);