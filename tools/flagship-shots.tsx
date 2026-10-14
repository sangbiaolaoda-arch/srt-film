// 一次性验收工具：把 14 套旗舰版式各渲一张完整 SVG，供 Chrome headless 截图拼印相。
// 用法: node tools/run-ts.mjs tools/flagship-shots.ts [输出目录]
import { mkdirSync, writeFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import React from "react";
import { LAYOUTS } from "../src/layouts/catalog";
import { LayoutSVG } from "../src/layouts/render";
import type { RenderContent } from "../src/layouts/types";

const out = process.argv[2] ?? ".tmp/flagship";
mkdirSync(out, { recursive: true });

// 演示内容与画廊同源：短句 / 数字 / 要点齐全，让每个版式都有内容可排。
const content: RenderContent = {
  headline: "回头才发现",
  subhead: "有些东西不必想起",
  bignum: "37",
  unit: "次",
  caption: "一条能说四十秒",
  left: "十年前",
  right: "现在",
  bullets: ["输入网址按下回车", "翻译成 IP 地址", "服务器返回页面"],
  numbers: [37, 12, 3],
  beat: 3,
};

const flag = LAYOUTS.filter((l) => l.id.startsWith("sp-"));
for (const l of flag) {
  const svg = renderToStaticMarkup(React.createElement(LayoutSVG, { layout: l, content }));
  writeFileSync(`${out}/${l.id}.svg`, svg);
  console.log(l.id);
}
console.log(`done ${flag.length}`);
