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
  const poster = planned.filter((d) => d.style === "poster").length;
  console.log(`\n${f}  ${beats.length} 拍 → 海报风 ${poster} 拍（${Math.round((poster / beats.length) * 100)}%）`);
  planned.forEach((d, i) => {
    const mark = d.style === "poster" ? "★海报" : "  编辑";
    console.log(`  ${String(i + 1).padStart(2, "0")} ${mark} 分=${String(d.score).padStart(5)} ${d.reason} ｜ ${contents[i]!.headline.replace(/\n/g, " / ").slice(0, 26)}`);
  });
}
