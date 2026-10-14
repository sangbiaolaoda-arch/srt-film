// 版式体检：把「设计规则」变成可测量的数字。
// 出处（本轮 Agent-Reach 实抓）：
//   Adobe《How to design a poster》Step 3 — 三级层级：hook / context / detail，
//     最常见的低级错误是「所有元素一样重」，没有主角；
//   https://www.adobe.com/express/learn/blog/poster-layout-design
//   Affinity《Grid design for editorial and web layouts》— 层级靠字号跨度，
//     不靠网格细分；留白要「比感觉需要的更多」。
//   https://www.affinity.studio/blog/grid-design-for-editorial-and-web-layouts
//   Affinity/magpublish — 每条规则都可被打破一次，但必须先有规则。
//
// 用法: node tools/run-ts.mjs tools/layout-audit.ts

import { LAYOUTS } from "../src/layouts/catalog";
import type { SizeCode } from "../src/layouts/types";

const PX: Record<SizeCode, number> = { xs: 14, s: 18, m: 24, l: 34, xl: 48, xxl: 72, huge: 104, mega: 168 };
const TEXT_KINDS = new Set([
  "headline", "subhead", "kicker", "text", "quote", "attribution", "literal", "caption",
  "bignum", "num2", "unit", "delta", "label", "source", "meta", "badge",
]);

/** hook 门槛：至少一个文字槽到 xl（48px / 720 高 ≈ 6.7%）。 */
const HOOK_MIN = PX.xl;
/** 层级跨度门槛：主槽 / 次槽 ≥ 2 —— 一个「步进」的下限（Adobe 海报指南：
 *  层级要清楚到「一眼知道先看哪」；2 倍是能读出来的最小步进）。 */
const RATIO_MIN = 2;
/** 若最大字号已到 xxl（72）及以上，则整屏同号也算成立（海报式大字版）。 */
const BOLD_ENOUGH = PX.xxl;

interface Row {
  id: string;
  group: string;
  flag: boolean;
  max: number;
  min: number;
  /** 主槽 / 次槽 的跨度 —— 层级真正的度量。拿最小字号（页脚级小字）比会把
   *  「主与次本来就是 2 倍步进」的正常版式误判成「平」。 */
  ratio: number;
  hook: boolean;
  blocks: number;
  cover: number;
}

const rows: Row[] = [];
for (const l of LAYOUTS) {
  if (l.custom) continue; // 专属手绘场景不走槽位系统
  const sizes = l.slots.filter((s) => TEXT_KINDS.has(s.k)).map((s) => PX[s.size ?? "m"]);
  if (sizes.length === 0) continue;
  const max = Math.max(...sizes);
  const min = Math.min(...sizes);
  // 次高字号：把同号的合并成一档，取第二档
  const tiers = [...new Set(sizes)].sort((a, b) => b - a);
  const second = tiers[1] ?? max;
  const cols = l.cols ?? 12;
  const rws = l.rows ?? 8;
  const blocks = l.slots.filter((s) => s.k === "panel").length + (l.bg ? 1 : 0);
  // 最大文字槽占画面面积比（判断文字是否只是「小贴纸」）
  const big = l.slots
    .filter((s) => TEXT_KINDS.has(s.k) && PX[s.size ?? "m"] === max)
    .map((s) => (s.box[2] / cols) * (s.box[3] / rws))
    .sort((a, b) => b - a)[0] ?? 0;
  rows.push({
    id: l.id, group: l.group, flag: !!l.flagship,
    max, min, ratio: max / second, hook: max >= HOOK_MIN, blocks, cover: big,
  });
}

const total = rows.length;
const noHook = rows.filter((r) => !r.hook);
const flat = rows.filter((r) => r.hook && r.ratio < RATIO_MIN && r.max < BOLD_ENOUGH);
const small = rows.filter((r) => r.cover < 0.12 && r.hook);
const plainBg = rows.filter((r) => r.blocks === 0);

const pct = (n: number) => `${((n / total) * 100).toFixed(0)}%`;

console.log(`版式总数（含文字槽）：${total}`);
console.log(`旗舰：${rows.filter((r) => r.flag).length}`);
console.log(`\n[1] 无主角（最大字号 < 48px）：${noHook.length}  ${pct(noHook.length)}`);
console.log(`[2] 层级过平（最大/最小 < ${RATIO_MIN}）：${flat.length}  ${pct(flat.length)}`);
console.log(`[3] 主角过小（最大文字槽占屏 < 12%）：${small.length}  ${pct(small.length)}`);
console.log(`[4] 无块面（panel/bg 都没有）：${plainBg.length}  ${pct(plainBg.length)}`);

const show = (name: string, list: Row[]) => {
  if (list.length === 0) return;
  console.log(`\n--- ${name}（前 18）---`);
  for (const r of list.slice(0, 18)) {
    console.log(
      `${r.flag ? "F" : " "} ${r.id.padEnd(22)} ${r.group.padEnd(10)} max=${String(r.max).padStart(3)} min=${String(r.min).padStart(2)} ratio=${r.ratio.toFixed(1).padStart(4)} cover=${(r.cover * 100).toFixed(0)}%`,
    );
  }
};
show("无主角", noHook);
show("层级过平", flat);
show("主角过小", small);

// 旗舰单独过一遍：它们是新构图的样板，必须全过
const flagBad = rows.filter((r) => r.flag && (!r.hook || (r.ratio < RATIO_MIN && r.max < BOLD_ENOUGH)));
console.log(`\n旗舰不合格：${flagBad.length}` + (flagBad.length ? ` → ${flagBad.map((r) => r.id).join(", ")}` : ""));
