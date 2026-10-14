// 全语料覆盖扫描：统计每个 SRT 的选版结果，找出 v2 覆盖缺口
// 用法：node tools/run-ts.mjs tools/coverage-scan.ts
import { readFileSync } from "node:fs";
import { plan } from "../src/core/plan";
import { V2_LAYOUTS } from "../src/layouts/v2";

const files = [
  "01-explanatory-tech.srt",
  "02-narrative-emotion.srt",
  "03-data-comparison.srt",
  "04-longform-3min.srt",
  "05-kaojin-60s.srt",
  "08-forgetting-20s.srt",
];

const v2Ids = new Set(V2_LAYOUTS.map((l) => l.id));
let total = 0, v2hit = 0;
const gapByGroup = new Map<string, number>();
const v2Use = new Map<string, number>();

for (const f of files) {
  const { shots } = plan(readFileSync(`examples/${f}`, "utf-8"), "");
  const legacy: string[] = [];
  for (const s of shots) {
    total++;
    v2Use.set(s.layout.id, (v2Use.get(s.layout.id) ?? 0) + 1);
    if (v2Ids.has(s.layout.id)) { v2hit++; continue; }
    legacy.push(s.layout.id);
    const g = s.layout.group;
    gapByGroup.set(g, (gapByGroup.get(g) ?? 0) + 1);
  }
  const nV2 = shots.length - legacy.length;
  console.log(`${f.padEnd(28)} ${String(shots.length).padStart(3)}拍  v2命中 ${String(nV2).padStart(3)}  回退旧库 ${String(legacy.length).padStart(3)}${legacy.length ? "  [" + [...new Set(legacy)].join(" ") + "]" : ""}`);
}

console.log(`\n总计 ${total} 拍：v2 覆盖 ${v2hit}（${((v2hit / total) * 100).toFixed(0)}%），回退 ${total - v2hit}`);
console.log("\n回退拍的旧库 group 分布（铺量缺口）：");
[...gapByGroup.entries()].sort((a, b) => b[1] - a[1]).forEach(([g, n]) => console.log(`  ${g.padEnd(16)} ${n} 拍`));
console.log("\nv2 池内使用分布：");
[...v2Use.entries()].filter(([id]) => v2Ids.has(id)).sort((a, b) => b[1] - a[1]).forEach(([id, n]) => console.log(`  ${id.padEnd(16)} ${n} 拍`));
