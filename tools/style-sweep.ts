// 风格分布诊断：打印四段真实语料的逐拍风格判定，用来校准海报风阈值。
// 用法: node tools/run-ts.mjs /tools/style-sweep.ts
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { parseSRT } from "../src/core/srt";
import { planBeats } from "../src/core/beats";
import { composeScenes } from "../src/core/compose";
import { buildContent } from "../src/core/content";
import { planStyles } from "../src/layouts/pick";

const dir = resolve(import.meta.dirname, "../examples");

for (const f of readdirSync(dir).filter((x) => x.endsWith(".srt")).sort()) {
  const beats = planBeats(parseSRT(readFileSync(resolve(dir, f), "utf8")));
  const contents = beats.map((b) => buildContent(composeScenes([b])[0]!, b, false));
  const planned = planStyles(contents);
  const tag = (s: string): string => (s === "chart-motion" ? "图表" : s === "flat-vector" ? "扁平" : "编辑");
  const tally: Record<string, number> = {};
  for (const d of planned) tally[d.style] = (tally[d.style] ?? 0) + 1;
  const tallyStr = (["editorial", "flat-vector", "chart-motion"] as const)
    .map((k) => `${tag(k)} ${tally[k] ?? 0}`)
    .join(" / ");
  console.log(`\n${f}  ${beats.length} 拍 → ${tallyStr}`);
  planned.forEach((d, i) => {
    const star = d.style === "editorial" ? " " : "★";
    console.log(`  ${String(i + 1).padStart(2, "0")} ${star}${tag(d.style)} 分=${String(d.score).padStart(5)} ${d.reason} ｜ ${contents[i]!.headline.replace(/\n/g, " / ").slice(0, 26)}`);
  });
}
