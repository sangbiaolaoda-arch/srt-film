// fx 压字门禁：特效层（画在内容之上的「镜头前的空气」）不许把文字笔画改掉。
//
// 与 visual-ab 的分工：visual-ab 证明「fx 层确实在画面里、确实在动」；
// 本门禁证明「它没盖在字上」。两者方向相反，缺一个都不行 ——
// 只做前者，特效越"有效"越容易糊住字；只做后者，特效可以干脆不画。
//
// 量法：同一拍、同一时刻，开 fx / 关 fx 各渲染一次，只在**文字槽矩形内**相减。
// 矩形由渲染端自己的 textKeepouts() 算出（页面 import /src/render/frame.ts），
// 不在这里重抄一份网格换算 —— 抄一份就会漂移（本项目第三次栽在"两份实现"上）。
//
// 用法:
//   node tools/fx-text-gate.mjs [--url http://localhost:5211/index.html] \
//        [--srt examples/01-explanatory-tech.srt] [--out .tmp/fx-text] [--selftest]
// --selftest：置 __noFxMask 关掉避让，门禁**必须**失败（证明它真的在查这件事）。
// 前置：dev server 在跑。退出码：任一拍超标 / 语料里没有可测拍 → 1。

import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { makeAb } from "./lib/ab.mjs";
import { luma } from "./lib/metrics.mjs";

const argv = process.argv.slice(2);
const argOf = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const flag = (k) => argv.includes(k);
const ROOT = process.cwd();
const { ab, ev, sleep } = makeAb({ root: ROOT, log: ".tmp/fx-text-gate.log" });
const url = argOf("--url", "http://localhost:5211/index.html");
const srtPath = argOf("--srt", "examples/01-explanatory-tech.srt");
const outDir = resolve(ROOT, argOf("--out", ".tmp/fx-text"));
const SELFTEST = flag("--selftest");

/* ── 门槛（都带实测依据）───────────────────────────────────────────────────── */
// ① 戳洞（主判据）：Δluma > 25 的像素占比。修前（无避让）01 语料 v2-strata 两拍
//    5.03%/5.01%（>8 口径），单像素最狠被改 93~115 级亮度 —— 深色粒子直接盖在笔画上；
//    修后 0.002%~0.024%。门槛 0.1%：离修后 4 倍、离修前 50 倍。
const MAX_HIT25_PCT = 0.1;
// ② 雾度（辅助）：文字区内平均 |Δluma|。这一条量的是「整片淡雾」而不是单点戳洞
//    —— 漩涡类 fx（v2-duo / particles-vortex）粒子铺得广而淡，修后 03 拍 10 实测
//    1.232，单点最深只有 26 级（仍在阈值下），观感是薄雾不是脏点。
//    门槛 1.5：修后最高 1.232（1.2 倍余量）、修前 2.6~2.8（1.8 倍距离）、
//    完全无害的 paper-sheen 层基线 0.4~0.5（3 倍）。
const MAX_BOX_MEAN = 1.5;

const HELPERS = `
window.__fxt = {
  raf: () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
  at: async (t) => { window.__stage.pause(); window.__stage.seek(t); await window.__fxt.raf(); await new Promise(r => setTimeout(r, 220)); await window.__fxt.raf(); },
  spans: () => window.__stage.shots.map((s, i) => ({
    i, beat: s.content.beat, start: s.tlStart ?? s.start, end: s.end,
    fx: s.layout.fx, layout: s.layout.id,
  })),
  saveFx: () => { window.__fxtSaved = window.__stage.shots.map((s) => s.layout.fx); return "ok"; },
  setFx: (on) => { window.__stage.shots.forEach((s, i) => { s.layout = Object.assign({}, s.layout, { fx: on ? window.__fxtSaved[i] : "none" }); }); },
  // 矩形取自渲染端同一份实现，避免"门禁一套、渲染另一套"。
  rects: async (i, w, h) => {
    const m = await import("/src/render/frame.ts");
    return m.textKeepouts(window.__stage.shots[i].layout, w, h);
  },
  grabBoxes: (rects) => {
    const c = window.__stage.canvas;
    const g = c.getContext("2d");
    const out = [];
    for (const r of rects) {
      const x0 = Math.max(0, Math.round(r.x)), y0 = Math.max(0, Math.round(r.y));
      const w = Math.min(c.width - x0, Math.round(r.w)), h = Math.min(c.height - y0, Math.round(r.h));
      if (w <= 0 || h <= 0) continue;
      const d = g.getImageData(x0, y0, w, h).data;
      for (let i = 0; i < d.length; i += 4) out.push(d[i], d[i+1], d[i+2]);
    }
    return out;
  },
};`;

const openR = await ab(["open", url]);
if (openR.code !== 0) { console.error("打不开页面：", (openR.err || openR.out).slice(-300)); process.exit(1); }
await ab(["set", "viewport", "1600", "1000"]);
await sleep(2500);
console.log(`载入 ${srtPath}:`, await ev(`
  (() => { const x = new XMLHttpRequest(); x.open("GET", ${JSON.stringify(srtPath)}, false); x.send(null);
    document.querySelector("#srt-input").value = x.responseText; document.querySelector("#btn-load").click(); return "loaded"; })()`));
await sleep(3500);
await ev(HELPERS);
await ev(`window.__noFxMask = ${SELFTEST ? "true" : "false"}; "mask ${SELFTEST ? "OFF" : "ON"}"`);
const spans = await ev(`JSON.stringify(window.__fxt.spans())`);
if (!Array.isArray(spans) || spans.length === 0) { console.error("规划没出来：", JSON.stringify(spans)); process.exit(1); }
await ev(`window.__fxt.saveFx()`);

const canvas = await ev(`JSON.stringify({ w: window.__stage.canvas.width, h: window.__stage.canvas.height })`);
console.log(`共 ${spans.length} 拍 · canvas ${canvas.w}×${canvas.h} · 文字避让 ${SELFTEST ? "关闭（反向自测）" : "开启"}`);

const rows = [];
for (const s of spans) {
  if (!s.fx || s.fx === "none") continue;
  const t = Math.round((s.start + (s.end - s.start) * 0.45) * 1000) / 1000;
  const r = await ev(`
    (async () => {
      const P = window.__fxt, t = ${t}, i = ${s.i};
      const rects = await P.rects(i, ${canvas.w}, ${canvas.h});
      if (!rects.length) return JSON.stringify({ rects: 0 });
      P.setFx(true); await P.at(t);
      const ON = P.grabBoxes(rects);
      P.setFx(false); await P.at(t);
      const OFF = P.grabBoxes(rects);
      P.setFx(true);
      return JSON.stringify({ rects: rects.length, ON, OFF });
    })()`);
  if (!r) { console.log(`拍 ${s.beat} 没取到`); continue; }
  if (!r.rects) { rows.push({ beat: s.beat, layout: s.layout, fx: s.fx, why: "该拍没有文字槽，不适用", na: true }); continue; }
  const n = Math.min(r.ON.length, r.OFF.length) / 3;
  let sum = 0, hit = 0, mx = 0;
  for (let k = 0; k < n; k++) {
    const a = luma(r.ON[k*3], r.ON[k*3+1], r.ON[k*3+2]);
    const b = luma(r.OFF[k*3], r.OFF[k*3+1], r.OFF[k*3+2]);
    const d = Math.abs(a - b);
    sum += d; if (d > 25) hit++; if (d > mx) mx = d;
  }
  const mean = sum / n;
  const hitPct = (hit / n) * 100;
  const ok = hitPct <= MAX_HIT25_PCT && mean <= MAX_BOX_MEAN;
  rows.push({ beat: s.beat, layout: s.layout, fx: s.fx, rects: r.rects, px: Math.round(n), mean, hitPct, max: mx, ok });
  console.log(`拍 ${String(s.beat).padStart(2,"0")} ${s.layout.padEnd(18)} ${s.fx.padEnd(20)} 文字槽 ${r.rects} · 区内均差 ${mean.toFixed(3)} · >25 占 ${hitPct.toFixed(3)}% · max ${mx.toFixed(0)} ${ok ? "✓" : "✗ 超标"}`);
}

const tested = rows.filter((r) => !r.na && !r.why);
const bad = rows.filter((r) => r.ok === false);
const noCover = tested.length === 0;

mkdirSync(outDir, { recursive: true });
writeFileSync(resolve(outDir, "report.json"), JSON.stringify({ srt: srtPath, selftest: SELFTEST, rows }, null, 2));

console.log("");
if (SELFTEST) {
  // 反向自测：关掉避让后**必须**有拍超标，否则这条门禁是摆设。
  const caught = bad.length > 0;
  console.log(caught
    ? `✓ 反向自测通过：关掉避让后 ${bad.length}/${tested.length} 拍超标（门禁确实在查颗粒压字）`
    : "✗ 反向自测失败：关掉文字避让后竟然没有一拍超标 —— 这条门禁没有在查它该查的东西");
  process.exit(caught ? 0 : 1);
}
if (noCover) { console.log("✗ 本语料没有「带文字的 fx 拍」，门禁未被验证"); process.exit(1); }
if (bad.length) { console.log(`✗ ${bad.length}/${tested.length} 拍超标：fx 压在字上`); process.exit(1); }
console.log(`✓ ${tested.length} 拍全部达标（>25 的像素 ≤ ${MAX_HIT25_PCT}%、区内均差 ≤ ${MAX_BOX_MEAN}）`);
