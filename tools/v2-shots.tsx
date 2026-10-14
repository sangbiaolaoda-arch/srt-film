// v2 验收工具：13 套满版板式各渲一张 + 02 语料全拍走默认管线（无覆写）逐拍渲一张。
// 用法: node tools/run-ts.mjs tools/v2-shots.tsx [输出目录]
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import React from "react";
import { V2_LAYOUTS } from "../src/layouts/v2";
import { LayoutSVG } from "../src/layouts/render";
import { plan } from "../src/core/plan";
import type { RenderContent } from "../src/layouts/types";

const out = process.argv[2] ?? ".tmp/v2";
mkdirSync(`${out}/boards`, { recursive: true });
mkdirSync(`${out}/corpus02`, { recursive: true });

const demo: RenderContent = {
  headline: "回头才发现",
  subhead: "有些东西不必想起",
  bignum: "37",
  unit: "次",
  caption: "一条能说四十秒",
  left: "十年前",
  right: "现在",
  bullets: ["输入网址按下回车", "翻译成 IP 地址", "服务器返回页面"],
  numbers: [37, 12, 3],
  numberTokens: [
    { raw: "37 次", value: 37, kind: "measure" },
    { raw: "12 秒", value: 12, kind: "span" },
    { raw: "3 步", value: 3, kind: "measure" },
  ],
  beat: 3,
};

for (const l of V2_LAYOUTS) {
  const svg = renderToStaticMarkup(React.createElement(LayoutSVG, { layout: l, content: demo }));
  writeFileSync(`${out}/boards/${l.id}.svg`, svg);
}

// 02 语料：默认管线，零覆写 —— 看自动挑选落在哪
const srt = readFileSync("examples/02-narrative-emotion.srt", "utf-8");
const { shots, problems } = plan(srt, "");
if (problems.length > 0) console.log("门禁问题:", problems);
const ids: string[] = [];
shots.forEach((s, i) => {
  const svg = renderToStaticMarkup(React.createElement(LayoutSVG, { layout: s.layout, content: s.content }));
  writeFileSync(`${out}/corpus02/${String(i + 1).padStart(2, "0")}-${s.layout.id}.svg`, svg);
  ids.push(`${i + 1}:${s.layout.id}`);
});
console.log(ids.join("\n"));

// 03 数据语料：bars 的主场 —— 验证满版数据条与组级帽
mkdirSync(`${out}/corpus03`, { recursive: true });
const srt3 = readFileSync("examples/03-data-comparison.srt", "utf-8");
const { shots: shots3 } = plan(srt3, "");
const ids3: string[] = [];
shots3.forEach((s, i) => {
  const svg = renderToStaticMarkup(React.createElement(LayoutSVG, { layout: s.layout, content: s.content }));
  writeFileSync(`${out}/corpus03/${String(i + 1).padStart(2, "0")}-${s.layout.id}.svg`, svg);
  ids3.push(`${i + 1}:${s.layout.id}`);
});
console.log(ids3.join("\n"));
console.log(`done boards=${V2_LAYOUTS.length} corpus02=${shots.length} corpus03=${shots3.length}`);
