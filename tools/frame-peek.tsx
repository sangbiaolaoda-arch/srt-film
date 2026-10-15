// 单帧细看：把某一拍用指定风格 1:1（1280×720）渲染成独立页面，供无头浏览器截图验收。
// 与 three-style-sheet 共用同一条真实链路（plan + LayoutSVG），所见即导出所见。
//
// 用法:
//   node tools/run-ts.mjs tools/frame-peek.tsx <SRT> <风格> <拍号...> [输出HTML]
// 例:
//   node tools/run-ts.mjs tools/frame-peek.tsx examples/01-explanatory-tech.srt chart-motion 3 5 8 dist/peek-cm.html

import { writeFileSync, readFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import React from "react";
import { plan } from "../src/core/plan";
import { LayoutSVG } from "../src/layouts/render";
import { PROFILE_ORDER, profileLabel } from "../src/styles/style-system";
import type { StyleProfileId } from "../src/styles/style-system";

const root = resolve(import.meta.dirname, "..");
const srtPath = resolve(root, process.argv[2] ?? "examples/01-explanatory-tech.srt");
const styleArg = (process.argv[3] ?? "chart-motion") as StyleProfileId;
const beatNos = (process.argv[4] ?? "1")
  .split(",")
  .map((s) => Number(s.trim()))
  .filter((n) => Number.isFinite(n) && n >= 1);
const outPath = resolve(root, process.argv[5] ?? `dist/peek-${styleArg}.html`);

if (!PROFILE_ORDER.includes(styleArg)) {
  console.error(`风格必须是 ${PROFILE_ORDER.join(" / ")}，收到: ${styleArg}`);
  process.exit(1);
}

const srt = readFileSync(srtPath, "utf-8");
const srtName = srtPath.split(/[\\/]/).pop() ?? "sample";

const ov: Record<string, { style: StyleProfileId }> = {};
for (let i = 1; i <= 400; i++) ov[String(i)] = { style: styleArg };
const { shots, problems } = plan(srt, JSON.stringify(ov));
if (problems.length) for (const p of problems) console.log("门禁问题: " + p);

const frames = beatNos
  .map((n) => shots[n - 1])
  .filter(Boolean)
  .map(
    (s, i) => `<section class="f">
  <div class="f-head">拍 ${String(beatNos[i]!).padStart(2, "0")} · ${profileLabel(styleArg)} · 版式 ${s.layout.id}</div>
  ${renderToStaticMarkup(React.createElement(LayoutSVG, { layout: s.layout, content: s.content }))}
</section>`,
  )
  .join("\n");

const html = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>单帧细看 · ${profileLabel(styleArg)} · ${srtName}</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { margin: 0; padding: 20px; background: #2a2926; font-family: "Source Han Sans SC","Noto Sans SC","PingFang SC",sans-serif; }
  .f { margin: 0 auto 20px; width: 1280px; }
  .f-head { font-size: 13px; color: #d8d4cc; padding: 6px 2px 8px; }
  .f svg { width: 1280px; height: 720px; display: block; border: 1px solid rgba(255,255,255,.12); }
</style>
</head>
<body>
${frames}
</body>
</html>
`;

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, html, "utf-8");
console.log(`✓ ${frames ? beatNos.length : 0} 帧 · ${profileLabel(styleArg)} · ${srtName} → ${outPath}`);
