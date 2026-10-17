#!/usr/bin/env node
// gen-storyboard-cues.mjs — 让 SRT 成为唯一时间源（改字幕 → 重新生成 CUES → 幕边界自动跟随）
//
// 背景：storyboard.js 的 CUES 是手抄的 138 条字幕。手抄就会漂移：
// SRT 改了、错字改了、断句改了，画面里的时间轴却还是旧的，而且没人会发现。
// 这个脚本把「抄」变成「生成 + 校验」：
//
//   node tools/gen-storyboard-cues.mjs --check    # 校验（CI/提交前跑，漂移就非 0 退出）
//   node tools/gen-storyboard-cues.mjs --write    # 重新生成 CUES 块
//   node tools/gen-storyboard-cues.mjs --srt <path> [--check|--write]
//
// 只改 `export const CUES = [...]` 这一段；SCENES 的 cue 区间不动
// （幕边界是导演判断，不由字幕推导）。若字幕条数变化，脚本会报错并要求人工确认幕区间。

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
const argOf = (n, d) => { const i = argv.indexOf(n); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const SRT = resolve(argOf("--srt", join(ROOT, "../../examples/12-endowment-effect.srt")));
const FILE = resolve(argOf("--file", join(ROOT, "src/storyboard.js")));
const WRITE = argv.includes("--write");
const CHECK = argv.includes("--check") || !WRITE;

/** 排版规范化：直引号 → 中文弯引号（成对切换）。SRT 源文件是直引号，
 *  画面需要中文排版的弯引号；生成时统一，才能做到「重新生成 = 零 diff」。 */
function typo(s) {
  let dq = 0, sq = 0;
  return s.replace(/["']/g, (ch) => (ch === '"'
    ? (dq++ % 2 === 0 ? "“" : "”")
    : (sq++ % 2 === 0 ? "‘" : "’")));
}

/** 解析 SRT：返回 [{ id, start, end, text }]（秒，三位小数）。 */
function parseSrt(raw) {
  const blocks = raw.replace(/\r/g, "").split(/\n\n+/);
  const cues = [];
  for (const block of blocks) {
    const lines = block.split("\n").filter((l) => l.trim() !== "");
    if (lines.length < 2) continue;
    const idxLine = lines[0].trim();
    if (!/^\d+$/.test(idxLine)) continue;
    const t = lines[1].match(/(\d{2}):(\d{2}):(\d{2})[,.](\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2})[,.](\d{3})/);
    if (!t) continue;
    const sec = (h, m, s, ms) => Math.round((+h * 3600 + +m * 60 + +s + +ms / 1000) * 1000) / 1000;
    const text = typo(lines.slice(2).join(" ").replace(/<[^>]+>/g, "").trim());
    cues.push({ id: +idxLine, start: sec(t[1], t[2], t[3], t[4]), end: sec(t[5], t[6], t[7], t[8]), text });
  }
  return cues;
}

const q = (s) => `'${s.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
const fmt = (n) => n.toFixed(3);

const cues = parseSrt(readFileSync(SRT, "utf8"));
if (cues.length === 0) { console.error("SRT 解析为空：", SRT); process.exit(2); }
const ids = cues.map((c) => c.id);
for (let i = 0; i < ids.length; i++) if (ids[i] !== i + 1) { console.error(`SRT 序号不连续：第 ${i + 1} 条是 ${ids[i]}`); process.exit(2); }

const block = `export const CUES = [\n${cues.map((c) => `  [${c.id},${fmt(c.start)},${fmt(c.end)},${q(c.text)}],`).join("\n")}\n].map(([id, start, end, text]) => ({ id, start, end, text, dur: end - start }));`;

const src = readFileSync(FILE, "utf8");
const m = src.match(/export const CUES = \[[\s\S]*?\]\.map\(\(\[id, start, end, text\]\) => \(\{ id, start, end, text, dur: end - start \}\)\);/);
if (!m) { console.error("storyboard.js 里没找到 CUES 块（格式变了？）"); process.exit(2); }

// 逐条比较（文本/时间/条数），给出可读差异
const current = src.match(/export const CUES = \[([\s\S]*?)\]\.map/);
const curCount = current ? (current[1].match(/^\s*\[/gm) || []).length : -1;
const diffs = [];
const re = /\[(\d+),([\d.]+),([\d.]+),'((?:[^'\\]|\\.)*)'\]/g;
const old = new Map();
let mm;
while ((mm = re.exec(current ? current[1] : ""))) old.set(+mm[1], { start: +mm[2], end: +mm[3], text: mm[4].replace(/\\'/g, "'") });
for (const c of cues) {
  const o = old.get(c.id);
  if (!o) { diffs.push(`+ 新增 #${c.id}`); continue; }
  if (Math.abs(o.start - c.start) > 1e-6 || Math.abs(o.end - c.end) > 1e-6) diffs.push(`~ #${c.id} 时间 ${o.start}~${o.end} → ${c.start}~${c.end}`);
  if (o.text !== c.text) diffs.push(`~ #${c.id} 文本「${o.text}」→「${c.text}」`);
}
for (const id of old.keys()) if (!cues.some((c) => c.id === id)) diffs.push(`- 删除 #${id}`);

if (CHECK) {
  if (curCount !== cues.length) { console.error(`✗ 条数不一致：storyboard=${curCount}，SRT=${cues.length}（幕区间 cue:[a,b] 需人工确认）`); process.exit(1); }
  if (diffs.length === 0) { console.log(`✓ CUES 与 SRT 一致（${cues.length} 条）—— ${SRT}`); process.exit(0); }
  console.error(`✗ CUES 与 SRT 漂移 ${diffs.length} 处：\n${diffs.slice(0, 20).join("\n")}\n（跑 --write 重新生成）`);
  process.exit(1);
}

writeFileSync(FILE, src.replace(m[0], block));
console.log(`✓ 已重写 CUES：${cues.length} 条 → ${FILE}`);
