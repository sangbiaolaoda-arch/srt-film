// morph 功能探针（不依赖浏览器）：把真实的 drawContinuity 在转场窗口内逐点 seek，
// 记录 ghost 标记（连接线起点）的坐标轨迹，确认它确实从「上拍角」迁移到「本拍角」，
// 且窗口中点落在两角正中。等价于 qa-frames.mjs 在连续性转场里逐点采样 t 后量坐标，
// 但不需要 agent-browser / 无头浏览器，直接吃真实渲染函数。
//
// 用法：node tools/run-ts.mjs tools/verify-morph.ts
import { drawContinuity, motifOf } from "../src/render/continuity";
import type { Shot, Layout, RenderContent } from "../src/core/shot";
import type { NarrativeRole } from "../src/core/compose";

// 记录型 ctx 桩：只截 moveTo / lineTo / arc / rect / fill / stroke 的坐标与样式。
interface Call { m: string; a: unknown[]; fill?: unknown; stroke?: unknown; alpha?: number }
class Rec {
  calls: Call[] = [];
  globalAlpha = 1; fillStyle = ""; strokeStyle = ""; lineWidth = 1;
  save() { this.log("save"); } restore() { this.log("restore"); }
  beginPath() { this.log("beginPath"); } closePath() { this.log("closePath"); }
  arc(...a: number[]) { this.log("arc", ...a); }
  rect(...a: number[]) { this.log("rect", ...a); }
  moveTo(...a: number[]) { this.log("moveTo", ...a); }
  lineTo(...a: number[]) { this.log("lineTo", ...a); }
  setLineDash(...a: number[]) { this.log("setLineDash", ...a); }
  fill() { this.log("fill", this.fillStyle, this.globalAlpha); }
  stroke() { this.log("stroke", this.strokeStyle, this.globalAlpha); }
  private log(m: string, ...a: unknown[]) { this.calls.push({ m, a, fill: this.fillStyle, stroke: this.strokeStyle, alpha: this.globalAlpha }); }
}
const asCtx = (r: Rec) => r as unknown as CanvasRenderingContext2D;

const layout = (style: string, id: string): Layout =>
  ({ id, name: id, group: "statement", enter: [], slots: [], style } as unknown as Layout);
const content = (): RenderContent => ({ headline: "x", subhead: "", caption: "", bullets: [], numbers: [], numberTokens: [], bignum: undefined, unit: "", beat: 1 } as unknown as RenderContent);
const shot = (role: NarrativeRole, style: string, start: number, continuity?: string[]): Shot =>
  ({ layout: layout(style, role), content: content(), start, end: start + 2, tlStart: start, narrative: { role, purpose: "p", forbidden: [] }, continuity } as unknown as Shot);

// prev=definition(br:1244,684) → cur=hook(tl:36,36)，带承接
const prev = shot("definition", "editorial", 0);
const cur = shot("hook", "chart-motion", 10, ["承接上拍definition"]);
const W = 1280, H = 720;

// 取 ghost 标记位置：drawContinuity 里连接线 moveTo 的第一段就是 ghost 当前位置
function ghostPos(t: number): [number, number] {
  const r = new Rec();
  drawContinuity(asCtx(r), [prev, cur], 1, W, H, t);
  const mv = r.calls.find((c) => c.m === "moveTo");
  if (!mv) throw new Error(`t=${t} 没有 moveTo（ghost 未画？）`);
  return [mv.a[0] as number, mv.a[1] as number];
}

const DUR = 0.55; // m-shape-match 时长（与 catalog 一致）
const winStart = cur.tlStart!;
const samples = [0, 0.14, 0.275, 0.41, 0.55, 0.8].map((o) => winStart + o);

const p0 = ghostPos(winStart);            // mt=0 → 应停在 上拍角
const p1 = ghostPos(winStart + DUR);      // mt=1 → 仍停 上拍角（窗口后回落静态 ghost）
const mid = ghostPos(winStart + DUR / 2); // mt=0.5 → 两角正中

console.log("上拍角 definition(br) =", motifOf(prev).corner, "→ 期望 (1244,684)");
console.log("本拍角 hook(tl)       =", motifOf(cur).corner, "→ 期望 (36,36)");
console.log("");
console.log("t=winStart      ghost =", p0.map((n) => n.toFixed(0)));
for (const t of samples) {
  if (Math.abs(t - winStart) < 1e-9) continue;
  const p = ghostPos(t);
  const mt = Math.min(1, Math.max(0, (t - winStart) / DUR));
  console.log(`t=${t.toFixed(3)} (mt=${mt.toFixed(2)})  ghost = (${p[0].toFixed(0)}, ${p[1].toFixed(0)})`);
}
console.log("t=winStart+0.55 ghost =", p1.map((n) => n.toFixed(0)));

// 断言
const approx = (a: number, b: number, e = 2) => Math.abs(a - b) <= e;
const midExpected: [number, number] = [(1244 + 36) / 2, (684 + 36) / 2];
let ok = true;
if (!approx(p0[0], 1244) || !approx(p0[1], 684)) { ok = false; console.log("✗ 窗口前未停在上拍角"); }
if (!approx(mid[0], midExpected[0], 3) || !approx(mid[1], midExpected[1], 3)) { ok = false; console.log(`✗ 中点未落两角正中：得到 (${mid[0].toFixed(0)},${mid[1].toFixed(0)}) 期望 (${midExpected[0]},${midExpected[1]})`); }
// 单调性：窗口内（mt=0.25,0.5,0.75）x 单调从 1244 降到 36，无回弹
const xs = [0.14, 0.275, 0.41].map((o) => ghostPos(winStart + o)[0]);
for (let i = 1; i < xs.length; i++) if (xs[i] > xs[i - 1] + 1) { ok = false; console.log(`✗ 窗口内 x 非单调下降 @${i}`); }
// 落位淡出：迁移标记在窗口内（mt=0.75）应已接近透明（被本拍实面标记接管）。
// ghost 标记是 drawContinuity 里的第 2 个 stroke 调用（第 1 个是连接线，用 dim 色）；
// 第 2 个 stroke 用 lerp 后的 ghostColor，其 alpha 即迁移标记的不透明度。
function ghostAlphaAt(t: number): number {
  const r = new Rec();
  drawContinuity(asCtx(r), [prev, cur], 1, W, H, t);
  const strokes = r.calls.filter((c) => c.m === "stroke");
  return (strokes[1]?.alpha ?? 1) as number;
}
const aMid = ghostAlphaAt(winStart + DUR * 0.5);
const aEnd = ghostAlphaAt(winStart + DUR * 0.75);
if (aMid < 0.4 || aMid > 0.95) { ok = false; console.log(`✗ 窗口中点 ghost alpha 异常：${aMid.toFixed(3)}（期望 ~0.55→0.85 中段）`); }
if (aEnd > 0.12) { ok = false; console.log(`✗ 窗口末 (mt=0.75) ghost 未淡出（alpha=${aEnd.toFixed(3)}），落位时会硬跳`); }
console.log(`ghost alpha：mt=0.5=${aMid.toFixed(2)}  mt=0.75=${aEnd.toFixed(3)}（趋近 0 = 淡出并入本拍标记）`);
console.log(ok ? "\n✓ morph 轨迹正确：ghost 在转场窗口内从上拍角迁移到本拍角，中点居中，窗口末淡出并入本拍标记（无回弹）" : "\n✗ morph 轨迹有误");
process.exit(ok ? 0 : 1);
