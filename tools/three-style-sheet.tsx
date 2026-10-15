// 三系风格对照样片：同一段 SRT 在 editorial / flat-vector / chart-motion 三系下各跑一遍
// 完整规划链（用导演覆写把全片风格钉死），逐拍用同一个 LayoutSVG 渲染，产出三联对照
// contact sheet。这是「真实多风格而非换色」的肉眼验收口 —— 同一拍旁白，三种构图语法。
//
// 用法:
//   node tools/run-ts.mjs tools/three-style-sheet.tsx [SRT路径] [输出HTML路径]
// 例:
//   node tools/run-ts.mjs tools/three-style-sheet.tsx examples/01-explanatory-tech.srt dist/three-style-sheet.html

import { writeFileSync, readFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import React from "react";
import { plan } from "../src/core/plan";
import { LayoutSVG } from "../src/layouts/render";
import { PROFILE_ORDER, profileLabel } from "../src/styles/style-system";
import type { StyleProfileId } from "../src/styles/style-system";

const root = resolve(import.meta.dirname, "..");
const srtPath = resolve(root, process.argv[2] ?? "examples/01-explanatory-tech.srt");
const outPath = resolve(root, process.argv[3] ?? "dist/three-style-sheet.html");
const srt = readFileSync(srtPath, "utf-8");
const srtName = srtPath.split(/[\\/]/).pop() ?? "sample";

// 全局覆写：把每一拍风格钉成目标风格。拍号 key 覆盖足够大的范围，多余 key 被 plan 忽略。
function forceStyle(style: StyleProfileId): string {
  const ov: Record<string, { style: StyleProfileId }> = {};
  for (let i = 1; i <= 400; i++) ov[String(i)] = { style };
  return JSON.stringify(ov);
}

// 三系各跑一遍完整规划链。
const perStyle = PROFILE_ORDER.map((style) => {
  const { shots, problems } = plan(srt, forceStyle(style));
  return { style, shots, problems };
});

const beatCount = perStyle[0]!.shots.length;
for (const { style, shots, problems } of perStyle) {
  const wrong = shots.filter((s) => (s.layout.style ?? "editorial") !== style).length;
  console.log(
    `${profileLabel(style)}（${style}）: ${shots.length} 拍，风格不符 ${wrong} 拍` +
      `${problems.length ? `，门禁问题 ${problems.length}` : "，门禁通过"}`,
  );
  for (const p of problems) console.log("    - " + p);
}

// 同一拍旁白 → 三张 SVG。
const svgByStyle = perStyle.map(({ shots }) =>
  shots.map((s) => renderToStaticMarkup(React.createElement(LayoutSVG, { layout: s.layout, content: s.content }))),
);
const headline = (i: number): string => {
  const h = perStyle[0]!.shots[i]!.content.headline.replace(/\n+/g, " ");
  return h.length > 40 ? h.slice(0, 40) + "…" : h;
};

const legend = PROFILE_ORDER.map((s) => `<span class="tag" data-style="${s}">${profileLabel(s)}</span>`).join("");

const beats = Array.from({ length: beatCount }, (_, i) => {
  const cells = perStyle
    .map(({ style }, si) => {
      const svg = svgByStyle[si]![i]!;
      return `<div class="cell" data-style="${style}"><div class="cell-tag">${profileLabel(style)}</div><div class="frame">${svg}</div></div>`;
    })
    .join("");
  return `<section class="beat"><div class="beat-head"><span class="beat-no">拍 ${String(i + 1).padStart(2, "0")}</span><span class="beat-line">${headline(i)}</span></div><div class="cells">${cells}</div></section>`;
}).join("\n");

const html = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>三系风格对照 · ${srtName}</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { margin: 0; padding: 24px; background: #f4f2ee; color: #1d1a16;
         font-family: "Source Han Sans SC","Noto Sans SC","PingFang SC","Microsoft YaHei",sans-serif; }
  header h1 { font-size: 20px; margin: 0 0 6px; }
  header p { margin: 0 0 14px; color: #5b564e; font-size: 13px; line-height: 1.6; }
  .legend { display: flex; gap: 10px; margin: 0 0 20px; flex-wrap: wrap; }
  .tag { font-size: 12px; padding: 3px 10px; border-radius: 999px; border: 1px solid rgba(0,0,0,.14); background: #fff; }
  .beat { margin: 0 0 26px; }
  .beat-head { display: flex; align-items: baseline; gap: 10px; margin: 0 0 8px; }
  .beat-no { font-size: 12px; font-weight: 700; color: #c8401f; letter-spacing: .04em; }
  .beat-line { font-size: 13px; color: #3a3630; }
  .cells { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
  .cell { background: #fff; border: 1px solid rgba(0,0,0,.1); border-radius: 8px; overflow: hidden; }
  .cell-tag { font-size: 11px; padding: 5px 10px; color: #fff; }
  .cell[data-style="editorial"] .cell-tag { background: #1d1a16; }
  .cell[data-style="flat-vector"] .cell-tag { background: #ff5a3c; }
  .cell[data-style="chart-motion"] .cell-tag { background: #1f6feb; }
  .frame svg { width: 100%; height: auto; display: block; }
  @media (max-width: 900px) { .cells { grid-template-columns: 1fr; } }
</style>
</head>
<body>
<header>
  <h1>三系风格对照 · ${srtName}</h1>
  <p>同一段 SRT、同一拍旁白，分别用<b>导演覆写</b>把全片风格钉死为下面三系，各跑一遍完整规划链后逐拍渲染。
     三列构图语法、图形表现、运动气质不同 —— 验证「真实多风格，不是换色皮」。</p>
  <div class="legend">${legend}</div>
</header>
${beats}
</body>
</html>
`;

mkdirp(outPath);
writeFileSync(outPath, html, "utf-8");
console.log(`\n✓ 写出 ${beatCount} 拍 × ${PROFILE_ORDER.length} 系对照 → ${outPath}`);

function mkdirp(file: string): void {
  const dir = file.split(/[\\/]/).slice(0, -1).join("/");
  if (dir) mkdirSync(dir, { recursive: true });
}
