// 全语料路由回归：把每个语料的每拍版式/风格/度量值数列出来。
// 用途：trace.ts 改了数字抽取（万/亿层 + 单位表扩充），必须确认**没有**语料的
// 拍被意外改路由（尤其：不该进图表板的拍进了图表板）。数字是确定性的，可直接比对。
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { plan } from "../src/core/plan";
import { normalizeSeries } from "../src/core/units";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FILES = [
  "01-explanatory-tech.srt", "02-narrative-emotion.srt", "03-data-comparison.srt",
  "04-longform-3min.srt", "05-kaojin-60s.srt", "06-history-events.srt",
  "08-forgetting-20s.srt", "09-photo-demo.srt", "10-reasoning-chain.srt",
  "11-visual-density.srt",
];

let charts = 0, falls = 0;
for (const f of FILES) {
  let shots;
  try {
    ({ shots } = plan(readFileSync(resolve(ROOT, "examples", f), "utf-8"), ""));
  } catch (e) {
    console.log(`### ${f}: 规划失败 ${(e as Error).message}`);
    continue;
  }
  const rows: string[] = [];
  shots.forEach((s, i) => {
    const toks = (s.content.numberTokens ?? []) as { kind: string; raw: string; value: number; unit?: string }[];
    const measures = toks.filter((t) => t.kind === "measure");
    const series = normalizeSeries(measures);
    const isChart = s.layout.group === "chart";
    if (isChart) charts++;
    if (isChart && !series.chartable) {
      falls++;
      rows.push(`   ⚠ 拍${i + 1} ${s.layout.id} 但 series 不可作图：${series.reason}`);
    }
    if (measures.length >= 2) {
      rows.push(`  拍${String(i + 1).padStart(2)} ${s.layout.id.padEnd(18)} measures=${measures.length} chartable=${series.chartable}${series.reason ? " (" + series.reason + ")" : ""}`);
    }
  });
  console.log(`### ${f}  ${shots.length} 拍`);
  if (rows.length) console.log(rows.join("\n"));
}
console.log(`\n图表组拍共 ${charts} 个；其中 series 判不可作图的 ${falls} 个（>0 说明有拍被路由到图表板却画不出图）`);
