// image 组满版插画验收：6 套板 × 3 系各渲一张 SVG（接触印相素材）。
// 用法: node tools/run-ts.mjs tools/im-shots.tsx [输出目录]
import { mkdirSync, writeFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import React from "react";
import { IM_LAYOUTS } from "../src/layouts/im-board";
import { LayoutSVG } from "../src/layouts/render";
import type { RenderContent } from "../src/layouts/types";
import type { StyleProfileId } from "../src/styles/style-system";

const out = process.argv[2] ?? ".tmp/im-board";
mkdirSync(`${out}/boards`, { recursive: true });

const demo: RenderContent = {
  headline: "服务器返回 HTML，耗时 120 毫秒",
  subhead: "这一步叫 DNS 查询",
  bignum: "120",
  unit: "毫秒",
  caption: "浏览器先要解决地址问题",
  left: "十年前",
  right: "现在",
  bullets: ["输入网址按下回车", "翻译成 IP 地址", "服务器返回页面"],
  numbers: [120, 85, 3],
  numberTokens: [
    { raw: "120 毫秒", value: 120, kind: "measure" },
    { raw: "85%", value: 85, kind: "measure" },
    { raw: "3 步", value: 3, kind: "measure" },
  ],
  beat: 3,
};

const STYLES: StyleProfileId[] = ["editorial", "flat-vector", "chart-motion"];

for (const l of IM_LAYOUTS) {
  for (const sid of STYLES) {
    const svg = renderToStaticMarkup(
      React.createElement(LayoutSVG, { layout: { ...l, style: sid }, content: demo }),
    );
    writeFileSync(`${out}/boards/${l.id}-${sid}.svg`, svg);
  }
}
console.log(`done boards=${IM_LAYOUTS.length} × styles=${STYLES.length} → ${out}/boards`);
