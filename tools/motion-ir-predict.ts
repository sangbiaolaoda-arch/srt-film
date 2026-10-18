// IR↔浏览器比对（方案 §4.2 层 B 的判定一半）。
//
// 输入：tools/motion-geometry-browser.mjs 采集的真实几何（browser-frames.json）
// 输出：browser-calibration.json（方案 §4.5 的报告格式）
//
// 预测侧重建与**演出严格同源**：plan(srt) → buildMotionSchedule → movesFor(semantic)
// —— 与 stage.tsx 编译 GSAP 时走的是同一串函数。任何一处不同源，比对结论都不成立。
//
// 阈值依据（方案 §4.3）：
//   · 缓动公式自检（selfTest）先证 IR 与 GSAP 用同一个解析式（偏差 0）；
//   · getBoundingClientRect 在 1280×720 逻辑坐标下的舍入约 0.5px + GSAP 亚像素插值
//     → 1.5px 是「测量噪声」与「计划漂移」的分界（反向夹具偏差都在 20px 以上）；
//   · 当前样本的实测最差值写进报告，扩样（多模板/DPR/字体降级）后再收紧。

import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { plan } from "../src/core/plan.ts";
import { buildMotionSchedule } from "../src/motion/schedule.ts";
import { movesFor } from "../src/semantics/dispatch.ts";
import { evaluateMotionPlan, easeOf } from "../src/motion/elements.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = resolve(ROOT, ".tmp/motion-audit");

function selfTest() {
  // 已知正确：power2.out 在 p=0.5 的值 = 1-(0.5)^3 = 0.875
  const e = easeOf("power2.out")!;
  const err = Math.abs(e(0.5) - 0.875);
  console.log(`缓动自检：power2.out(0.5)=${e(0.5)}，与 GSAP 公式偏差 ${err.toExponential(2)}`);
  if (err > 1e-12) {
    console.error("✗ IR 缓动与 GSAP 公式不一致 —— 层 B 的比对失去意义");
    process.exit(1);
  }
}

selfTest();

const raw = JSON.parse(readFileSync(resolve(OUT, "browser-frames.json"), "utf8"));

// ── 预测侧：与演出同源重建（plan → schedule → dispatch） ──
const r = plan(raw.srt);
if (r.problems.length > 0) {
  console.error("✗ 规划门禁有问题，先修规划：", r.problems[0]);
  process.exit(1);
}
const shot = r.shots[raw.shotIndex];
if (!shot?.semantic) {
  console.error("✗ 采集指向的拍没有语义切片 —— 重跑 motion-geometry-browser.mjs");
  process.exit(1);
}
const sched = buildMotionSchedule(r.shots);
const mp = sched.plans[raw.shotIndex]!;
const moves = movesFor(shot.semantic, mp.at, mp.dur);

/**
 * 比对口径（实测后确定的，重要）：
 * DOM 的 getBoundingClientRect 读的是**可见内容盒**（图形在槽位内的实际画法、
 * 文字的居中位置），IR 的 bounds 是**槽位框**。两者差一个常数偏移（实测 +99~104px），
 * 那是「资产锚点」的账（Phase 5 的 parts/anchors 元数据管它），不是运动的账。
 * 所以层 B 判的是**位移增量**：以落位后的稳定时刻为参照，比 DOM 与 IR 各自移动了多少。
 *   · 增量一致 → 组运动同步生效、GSAP 与 IR 用同一套时间/缓动/坐标；
 *   · 增量发散 → 计划与画面漂移（这才是要拦的错）。
 */
// 参照时刻 = 全部 move 结束的那一刻（此后进入 holds 区间，画面必须稳定）。
// 不硬编码 1.9 —— 短拍的 compress 会把编排压进拍内，硬编码会越出拍尾。
const lastEnd = Math.max(...moves.map((m) => m.start + m.duration));
const REF_T = Number((lastEnd - 1e-4).toFixed(4));

const statesAt = (t: number) => evaluateMotionPlan(shot.semantic!.graph, moves, t);

const refRow = raw.rows.find((row: { t: number; boxes: Record<string, unknown> }) => row.t >= REF_T && Object.keys(row.boxes).length > 0);
if (!refRow) {
  console.error(`✗ 采集里没有落位参照帧（REF_T≈${REF_T.toFixed(2)}，样点 ${raw.times.join("/")}）—— 重跑采集并确认 TIMES 覆盖该拍的编排尾`);
  process.exit(1);
}
const refIr = statesAt(REF_T);

const rows: unknown[] = [];
let worst = 0;
for (const row of raw.rows as Array<{ t: number; boxes: Record<string, { x: number; y: number; w: number; h: number }> }>) {
  const ir = statesAt(row.t);
  const ir0 = refIr;
  let maxErr = NaN;
  const detail: Record<string, number> = {};
  for (const [gid, box] of Object.entries(row.boxes)) {
    const irBox = ir.get(gid);
    const irBase = ir0.get(gid);
    const refBox = refRow.boxes[gid];
    if (!irBox || !irBase || !refBox) {
      detail[gid] = NaN;
      continue;
    }
    const domD = { x: box.x - refBox.x, y: box.y - refBox.y };
    const irD = { x: irBox.box.x - irBase.box.x, y: irBox.box.y - irBase.box.y };
    const domS = box.w - refBox.w;
    const irS = irBox.box.w - irBase.box.w;
    const e = Math.max(Math.abs(domD.x - irD.x), Math.abs(domD.y - irD.y), Math.abs(domS - irS));
    detail[gid] = e;
    maxErr = Number.isFinite(maxErr) ? Math.max(maxErr, e) : e;
  }
  if (Number.isFinite(maxErr)) worst = Math.max(worst, maxErr);
  rows.push({ t: row.t, dom: row.boxes, ir: Object.fromEntries([...ir.entries()].map(([k, v]) => [k, v.box])), displacementError: detail, maxErr });
  console.log(
    `  t=${String(row.t).padStart(5)}s  ` + Object.entries(detail).map(([k, v]) => `${k}=${Number.isFinite(v) ? v.toFixed(2) : "—"}`).join("  "),
  );
}

const THRESHOLD = 1.5;
const ok = worst <= THRESHOLD;
console.log(`\n  最大 IR↔DOM 位移偏差 ${worst.toFixed(2)}px（阈值 ${THRESHOLD}px）${ok ? "✓" : "✗"}`);

writeFileSync(
  resolve(OUT, "browser-calibration.json"),
  JSON.stringify(
    {
      shotId: shot.semantic.graph.shotId,
      kind: shot.semantic.kind,
      templateId: shot.semantic.plan.templateId,
      fps: 30,
      threshold: THRESHOLD,
      samples: rows.length,
      maxLogicalPixelError: Number(worst.toFixed(2)),
      pass: ok,
      rows,
    },
    null,
    2,
  ),
);
console.log(`  报告 → .tmp/motion-audit/browser-calibration.json`);
process.exit(ok ? 0 : 1);
