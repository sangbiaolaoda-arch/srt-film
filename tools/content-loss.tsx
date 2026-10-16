// 内容不丢门禁：每一句旁白都必须在画面上找得到。
//
// 为什么要它（与尾句门禁同族，是它的通用版）：本项目已经三次栽在同一类坑上——
// ① 竖排 headline slice 静默丢字；② bullets slice(0,22) 静默切字；③ 无 caption 槽
// 的版式吃掉尾句。三次都过了 tsc、过了单元测试、e2e 全绿，**只有逐句核对画面才能
// 发现**。单个版式的门禁（checkLayout 的 textFit）只能查「已知槽放不下」，
// 查不了「这句话压根没人承载」。
//
// 判据只有一条：把每拍真实内容灌进真实版式渲染，逐条核对 ——
//   bullets 的每一条分句 → 必须在画面文字里（长度 ≥2 才算一句，splitBullets 的契约）
//   caption（第二分句）    → 必须在画面里
// 归一化按「画面最终呈现的字符」比对（去全部空白与标点），三轮误报修正见 progress.md：
//   直接 includes 漏判（长句被断行成多个 tspan）；只去空白仍误判（clean() 剥掉
//   《》「」再画）；两边都归一化才可信。
//
// 范围限定：**槽位版式**（非 custom）。v2 满版场景按设计只画 headline 的一个子集
// （左/右/数字主角 + 页脚），那是它自己的取舍契约，由 render-contract 文档与 v2 门禁管。
// 把它们算进来会得到 154 条误报 —— 一个报 154 条的断言等于没有断言。
//
// 用法: node tools/run-ts.mjs tools/content-loss.tsx [--verbose]
// 退出码：有文案在画面上找不到 → 1。

import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { plan } from "../src/core/plan";
import { LayoutSVG } from "../src/layouts/render";
import { stripPunct } from "../src/core/text";
import { readdirSync } from "node:fs";
import { resolve } from "node:path";

const EXAMPLES = resolve(import.meta.dirname, "../examples");
const verbose = process.argv.includes("--verbose");

/** 画面最终呈现的字符：去掉全部空白与标点/符号。 */
const norm = (s: string): string => s.replace(/[\s\p{P}\p{S}]/gu, "");
const svgText = (svg: string): string => norm(svg.replace(/<[^>]+>/g, ""));

const files = readdirSync(EXAMPLES).filter((f) => f.endsWith(".srt")).sort();
if (files.length === 0) {
  console.error("examples/ 下没有 .srt 语料 —— 门禁拒绝「跑过了但什么都没测」");
  process.exit(1);
}

let checked = 0;
let shotsChecked = 0;
const lost: string[] = [];

/* 门禁自带的固定用例：真实语料里能触发截断的样本极少（实测 9 语料只有 1 条
 * 超 22 字的 bullet，且它所在的拍未必落槽位版式）—— 只靠语料，门禁的判别力就
 * 取决于运气。这里用一条合成长条目走窄槽，**保证断言永远在被检验**：
 * 渲染端一旦把它切掉，这里立刻失败。（这是门禁反向验证必须自带的样本，
 *  不能只靠「把代码改坏试试」—— 那次 slice 加回去，语料里恰好没有对应拍。）*/
let fixedCaseOk = false;
{
  const narrow = {
    id: "gate-selftest", name: "门禁自检窄槽", group: "list" as const,
    enter: ["m-fade-up"] as const,
    slots: [{ k: "bullets" as const, box: [1, 2, 1.5, 3] as [number, number, number, number], size: "m" as const }],
  };
  const long = "这是一条刻意写得非常长的条目用来检验渲染端是否还会静默切字";
  const rendered = svgText(renderToStaticMarkup(createElement(LayoutSVG, {
    layout: narrow,
    content: { headline: long, subhead: "", caption: "", bullets: [long], numbers: [], numberTokens: [], beat: 1 } as never,
  })));
  fixedCaseOk = rendered.includes(norm(long));
}

for (const f of files) {
  const { shots, problems } = plan(readFileSync(resolve(EXAMPLES, f), "utf8"), "");
  if (problems.length) {
    console.error(`${f}: 规划门禁已有 ${problems.length} 条问题，先修规划再核对画面`);
    process.exit(1);
  }
  for (const s of shots) {
    if (s.layout.custom) continue;
    shotsChecked++;
    const svg = svgText(renderToStaticMarkup(createElement(LayoutSVG, { layout: s.layout, content: s.content })));
    const c = s.content;
    // headline 槽按契约只画首个句读（displayHeadline）—— 整句查会误报；
    // 「后续分句有没有别的槽承载」由下面逐条覆盖。
    const items: [string, string][] = [];
    for (const seg of c.bullets ?? []) if (seg && seg.trim().length >= 2) items.push(["分句", seg]);
    if (c.caption && c.caption.trim().length >= 2) items.push(["caption", c.caption]);
    for (const [kind, raw] of items) {
      const n = norm(stripPunct(raw));
      if (!n) continue;
      checked++;
      if (!svg.includes(n)) {
        const head = n.slice(0, 10);
        lost.push(`${f} 拍${c.beat} ${s.layout.id} [${kind}] ${svg.includes(head) ? "截断" : "整段缺失"}：${raw.slice(0, 30)}`);
      }
    }
  }
}

if (lost.length === 0 && !fixedCaseOk) {
  lost.push("固定用例：长条目在窄槽里渲染不全（门禁自检失败 —— 断言本身失效了）");
}
if (lost.length === 0) {
  console.log(`✓ 内容不丢：${shotsChecked} 拍（槽位版式）· ${checked} 条文案全部在画面上`);
  process.exit(0);
}
console.log(`✗ ${lost.length}/${checked} 条文案在画面上找不到：`);
for (const l of lost) console.log("  " + l);
if (!verbose) console.log("（加 --verbose 看逐拍明细）");
process.exit(1);