// 槽级动效体检（缺陷 5）：conflict（属性冲突）+ overrun（动效跑出拍外）。
//
// 两件事分开看：
//   conflict —— 同一个槽上两条 tween 同时写同一个属性，先写的被后写盖掉；
//   overrun  —— tween 跑过了本拍的尾巴。这是本项目踩过一次的坑（ambient yoyo
//               总长 2×dur 撑爆 timeline），槽级 mx 是同一处的另一个漏网方向：
//               buildMotionSchedule 算 running 时只算了入场/拍级动效，没算 mx。
//
// 用法: node tools/run-ts.mjs tools/motion-audit.ts

import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { LAYOUTS } from "../src/layouts/catalog";
import { V2_LAYOUTS } from "../src/layouts/v2";
import { plan } from "../src/core/plan";
import { buildMotionSchedule, slotTweens, type MotionPlan } from "../src/motion/schedule";
import { slotConflicts, describeConflict } from "../src/motion/conflict";
import type { Layout, RenderContent } from "../src/layouts/types";
import type { Shot } from "../src/core/shot";

const root = resolve(import.meta.dirname, "..");

function shotOf(layout: Layout, dur: number): Shot {
  const content: RenderContent = {
    headline: "测试标题", subhead: "", caption: "", bullets: [],
    numbers: [], numberTokens: [], bignum: undefined, unit: "", beat: 1,
  };
  return { layout, content, start: 0, end: dur, cueIds: [] };
}

/** 跑出拍外：tween 终点超过本拍终点多少秒。 */
function overruns(layout: Layout, mp: MotionPlan): string[] {
  const out: string[] = [];
  const shotEnd = mp.at + mp.dur;
  layout.slots.forEach((slot, k) => {
    for (const tw of slotTweens(mp, k, slot)) {
      const over = tw.at + tw.dur - shotEnd;
      if (over > 0.01) out.push(`槽 ${k} ${tw.motion}(${tw.role}) 超出 ${over.toFixed(2)}s`);
    }
  });
  return out;
}

/* ── [A] 全库合成扫描 ───────────────────────────────────────────── */
const DURS = [1.5, 3, 8];
const all = [...LAYOUTS, ...V2_LAYOUTS];
const hits: string[] = [];
let withMx = 0;
for (const layout of all) {
  if (!layout.slots.some((s) => s.mx)) continue;
  withMx++;
  for (const dur of DURS) {
    const { plans } = buildMotionSchedule([shotOf(layout, dur)]);
    for (const c of slotConflicts(layout, plans[0]!)) hits.push(`${layout.id} dur=${dur} ${describeConflict(c)}`);
  }
}
console.log(`[A] 版式 ${all.length}（catalog ${LAYOUTS.length} + v2 ${V2_LAYOUTS.length}），含槽级 mx 的 ${withMx}`);
console.log(`    属性冲突命中 ${hits.length} 条`);
for (const h of hits.slice(0, 20)) console.log(`      ${h}`);

/* ── [B] 真实语料（plan → schedule）────────────────────────────── */
const files = readdirSync(resolve(root, "examples")).filter((f) => f.endsWith(".srt")).sort();
let conflictN = 0;
const overRows: string[] = [];
let shotN = 0;
for (const f of files) {
  const ov = f.replace(/\.srt$/, ".json");
  let ovRaw = "";
  try { ovRaw = readFileSync(resolve(root, "examples", ov), "utf-8"); } catch { /* 无覆写 */ }
  const { shots, problems } = plan(readFileSync(resolve(root, "examples", f), "utf-8"), ovRaw);
  if (problems.length) {
    console.log(`    ${f}：门禁已有 ${problems.length} 条问题（跳过运动体检）`);
    continue;
  }
  const { plans } = buildMotionSchedule(shots);
  shotN += shots.length;
  plans.forEach((p, i) => {
    const layout = shots[i]!.layout;
    const cs = slotConflicts(layout, p);
    conflictN += cs.length;
    for (const c of cs) console.log(`    [冲突] ${f} 拍 ${shots[i]!.content.beat} ${layout.id} ${describeConflict(c)}`);
    for (const o of overruns(layout, p)) overRows.push(`${f.padEnd(26)} 拍 ${String(shots[i]!.content.beat).padStart(2)} ${layout.id.padEnd(22)} ${o}`);
  });
}
console.log(`\n[B] ${files.length} 条语料 / ${shotN} 拍`);
console.log(`    属性冲突 ${conflictN} 条`);
console.log(`    跑出拍外 ${overRows.length} 条`);
for (const o of overRows.slice(0, 30)) console.log(`      ${o}`);
