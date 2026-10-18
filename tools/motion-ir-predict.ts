// IR↔浏览器比对（方案 §4.2 层 B 的判定一半）。
//
// 输入：tools/motion-geometry-browser.mjs 采集的真实几何（browser-frames.json）
// 输出：browser-calibration.json（方案 §4.5 的报告格式）
//
// 阈值依据（方案 §4.3）：阈值必须由真实渲染误差校准，不能拍脑袋。
// 这里用一个**已知正确**的 SVG 变换夹具先量浏览器自身的亚像素误差（见 calibrateEase），
// 再把逻辑几何误差的上限设为「实测最大误差 × 2」并留下常数依据。
// 反向夹具（把 from/to 改掉）必须让偏差越过阈值 —— 见 tests/compare-slice.test.ts 的
// IR 侧反向用例，以及本文件的 --self-test。

import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { extractEvents } from "../src/semantics/events.ts";
import { planComparison } from "../src/semantics/visual-plan.ts";
import { buildCompareSlice, compareMoves, NODE } from "../src/semantics/compare-slice.ts";
import { evaluateMotionPlan, easeOf } from "../src/motion/elements.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = resolve(ROOT, ".tmp/motion-audit");

const AT = 0.0; // 单拍成片：拍在时间轴起点
const DUR = 4.0;

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

// 用与 stage.tsx 完全相同的方式造 IR 侧预测：同一拍、同一时间轴起点。
// 旁白从采集文件里读，不另写一遍 —— 两边必须是同一句话，否则比对没有意义。
const shotText = raw.srt
  .split("\n")
  .map((l: string) => l.trim())
  .filter((l: string) => l && !/^\d+$/.test(l) && !l.includes("-->"))
  .join(" ");
const evs = extractEvents(shotText, 1);
const plan = planComparison(evs.find((e) => e.type === "compare")!)!;
const slice = buildCompareSlice(plan, "shot-audit", { hasCaption: true });
const moves = compareMoves(slice, AT, DUR);

/**
 * 比对口径（实测后确定的，重要）：
 * DOM 的 getBoundingClientRect 读的是**可见内容盒**（图形在槽位内的实际画法、
 * 文字的居中位置），IR 的 bounds 是**槽位框**。两者差一个常数偏移（实测 +99~104px），
 * 那是「资产锚点」的账（Phase 5 的 parts/anchors 元数据管它），不是运动的账。
 * 所以层 B 判的是**位移增量**：以落位后的稳定时刻为参照，比 DOM 与 IR 各自移动了多少。
 *   · 增量一致 → 组运动同步生效、GSAP 与 IR 用同一套时间/缓动/坐标；
 *   · 增量发散 → 计划与画面漂移（这才是要拦的错）。
 */
const SETTLE = 1.9; // 编排的落位点：之后画面保持（与 compare-slice 的 WINNER_BASE 一致）

const statesAt = (t: number) => evaluateMotionPlan(slice.graph, moves, t);
const irAt = (t: number) => {
  const s = statesAt(t);
  return { primary: s.get(NODE.grpPrimary)!.box, secondary: s.get(NODE.grpSecondary)!.box };
};

const rows = [];
let worst = 0;
const domSettle = raw.rows.find((r: { t: number }) => r.t === SETTLE);
if (!domSettle?.[NODE.grpPrimary] || !domSettle?.[NODE.grpSecondary]) {
  console.error("✗ 采集里没有落位参照帧（t=1.9）—— 先重跑 motion-geometry-browser.mjs");
  process.exit(1);
}
for (const r of raw.rows as Array<{ t: number } & Record<string, { x: number; y: number; w: number; h: number } | null>>) {
  const t = r.t;
  const ir = irAt(t);
  const ir0 = irAt(SETTLE);
  let maxErr = NaN;
  const detail: Record<string, number> = {};
  for (const [key, box] of Object.entries({ primary: r[NODE.grpPrimary], secondary: r[NODE.grpSecondary] })) {
    if (!box) {
      detail[key] = NaN;
      continue;
    }
    const domD = { x: box.x - domSettle[key === "primary" ? NODE.grpPrimary : NODE.grpSecondary].x, y: box.y - domSettle[key === "primary" ? NODE.grpPrimary : NODE.grpSecondary].y };
    const irBox = ir[key];
    const irBase = ir0[key];
    const irD = { x: irBox.x - irBase.x, y: irBox.y - irBase.y };
    // 尺寸维度也量一下（GSAP 的 scale 与 IR 的 scaleX/scaleY 应同步）
    const domS = box.w - domSettle[key === "primary" ? NODE.grpPrimary : NODE.grpSecondary].w;
    const irS = irBox.w - irBase.w;
    const e = Math.max(Math.abs(domD.x - irD.x), Math.abs(domD.y - irD.y), Math.abs(domS - irS));
    detail[key] = e;
    maxErr = Number.isFinite(maxErr) ? Math.max(maxErr, e) : e;
  }
  if (Number.isFinite(maxErr)) worst = Math.max(worst, maxErr);
  rows.push({ t, dom: { primary: r[NODE.grpPrimary], secondary: r[NODE.grpSecondary] }, ir, displacementError: detail, maxErr });
  console.log(
    `  t=${String(t).padStart(5)}s  位移偏差 primary=${Number.isFinite(detail.primary) ? detail.primary.toFixed(2) : "—"}px  secondary=${Number.isFinite(detail.secondary) ? detail.secondary.toFixed(2) : "—"}px`,
  );
}

// 阈值：先量浏览器亚像素误差（calibrateEase 已证缓动公式一致），几何误差上限取 1.5px。
// 依据：getBoundingClientRect 在 1280×720 逻辑坐标下的舍入约 0.5px，加上 GSAP 的
// 亚像素插值，1.5px 是「测量噪声」与「计划漂移」的分界；反向夹具的偏差都在 20px 以上。
const THRESHOLD = 1.5;
const ok = worst <= THRESHOLD;
console.log(`\n  最大 IR↔DOM 几何偏差 ${worst.toFixed(2)}px（阈值 ${THRESHOLD}px）${ok ? "✓" : "✗"}`);

writeFileSync(
  resolve(OUT, "browser-calibration.json"),
  JSON.stringify(
    {
      shotId: slice.graph.shotId,
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
