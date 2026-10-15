// 像素级 A/B：同一拍的同一时刻，开/关 canvas 特效各渲染一次，比较像素差。
//
// 为什么需要它：印相把 1280×720 缩到几十像素宽，浮尘/脉冲这种「素底上的呼吸」
// 在印相里根本看不出来 —— 而这一刀要回答的恰恰是「特效到底有没有出现在成片里」。
// 差值为 0 = 特效没生效（亮底 + lighter 的老毛病）；差值明显且随时刻变化 = 生效。
//
// 用法:
//   node tools/fx-ab.mjs --url http://127.0.0.1:5211/index.html [--srt examples/03-data-comparison.srt]
//                        [--shots 1,2,3,8,10] [--out .tmp/fx-ab]
// 前置：dist 已 build、静态服务在跑、SRT 可被页面同源 GET。
// 退出码：任一拍没测出差异 → 1。

import { spawn } from "node:child_process";
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const argv = process.argv.slice(2);
const argOf = (k, d) => {
  const i = argv.indexOf(k);
  return i >= 0 ? argv[i + 1] : d;
};
const ROOT = process.cwd();
const url = argOf("--url", "http://127.0.0.1:5211/index.html");
const srtPath = argOf("--srt", "examples/03-data-comparison.srt");
const shots = argOf("--shots", "1,2,3,8,10").split(",").map((s) => Number(s.trim()));
const outDir = resolve(ROOT, argOf("--out", ".tmp/fx-ab"));

/* ── agent-browser 调用（与 qa-frames / e2e-export 同一套发现逻辑）────────── */
function resolveAB() {
  if (process.env.AGENT_BROWSER_BIN) return { cmd: process.env.AGENT_BROWSER_BIN, pre: [] };
  for (const d of (process.env.PATH || "").split(";").filter(Boolean)) {
    for (const ext of ["", ".cmd", ".exe"]) {
      const shim = join(d, `agent-browser${ext}`);
      if (!existsSync(shim)) continue;
      const js = join(d, "node_modules", "agent-browser", "bin", "agent-browser.js");
      if (existsSync(js)) return { cmd: process.execPath, pre: [js] };
      if (ext === ".cmd") return { cmd: process.env.ComSpec || "cmd.exe", pre: ["/c", shim] };
      return { cmd: shim, pre: [] };
    }
  }
  return { cmd: "agent-browser", pre: [] };
}
const LOG = join(ROOT, ".tmp/fx-ab.log");
function run(cmd, args, { input } = {}) {
  return new Promise((res) => {
    mkdirSync(join(ROOT, ".tmp"), { recursive: true });
    const fd = openSync(LOG, "a");
    const from = statSync(LOG).size;
    const finish = (code, extra = {}) => {
      try { closeSync(fd); } catch {}
      let out = "";
      try { out = readFileSync(LOG).subarray(from).toString("utf8"); } catch {}
      res({ code, out, ...extra });
    };
    const p = spawn(cmd, args, { stdio: ["pipe", fd, fd] });
    p.on("error", (e) => finish(-1, { err: String(e?.message || e) }));
    p.on("close", (c) => finish(c));
    if (input !== undefined) p.stdin.write(input);
    p.stdin.end();
  });
}
const AB = resolveAB();
const ab = (args, opts = {}) => run(AB.cmd, [...AB.pre, ...args], opts);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const unwrap = (s) => {
  let v = s;
  for (let i = 0; i < 8 && typeof v === "string"; i++) {
    const t = v.trim();
    try { v = JSON.parse(t); } catch { break; }
  }
  return v;
};
const ev = async (js) => unwrap((await ab(["eval", "--stdin"], { input: js })).out);

/* ── 页面内：取像素指纹 / 开关 fx / seek ─────────────────────────────────── */
const PAGE_HELPERS = `
window.__fxab = {
  raf: () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
  // 每 4 个像素取一档，够算差异又不必搬 3.7MB。
  grab: () => {
    const c = window.__stage.canvas;
    const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
    const out = new Array(Math.floor(d.length / 16) * 3);
    let k = 0;
    for (let i = 0; i + 3 < d.length; i += 16) { out[k++] = d[i]; out[k++] = d[i + 1]; out[k++] = d[i + 2]; }
    return out;
  },
  at: async (t) => { window.__stage.pause(); window.__stage.seek(t); await window.__fxab.raf(); await new Promise(r => setTimeout(r, 220)); await window.__fxab.raf(); return window.__fxab.grab(); },
  stashFx: () => { window.__fxSaved = window.__stage.shots.map((s) => s.layout.fx); },
  setFx: (v) => { window.__stage.shots.forEach((s) => { s.layout = Object.assign({}, s.layout, { fx: v }); }); },
  restoreFx: () => { window.__stage.shots.forEach((s, i) => { s.layout = Object.assign({}, s.layout, { fx: window.__fxSaved[i] }); }); },
  spans: () => window.__stage.shots.map((s) => ({ beat: s.content.beat, start: s.tlStart ?? s.start, end: s.end, fx: s.layout.fx })),
};
"ok"`;

const srt = readFileSync(resolve(ROOT, srtPath), "utf8");

console.log(`打开 ${url}`);
const r1 = await ab(["open", url]);
if (r1.code !== 0) {
  console.error("打不开页面：", (r1.err || r1.out).slice(-300));
  process.exit(1);
}
await ab(["set", "viewport", "1600", "1000"]);
await sleep(2500);

// 载入语料（页面同源 GET 自己那份 examples）
const loadJs = `
  (() => {
    const x = new XMLHttpRequest();
    x.open("GET", ${JSON.stringify(srtPath)}, false);
    x.send(null);
    document.querySelector("#srt-input").value = x.responseText;
    document.querySelector("#btn-load").click();
    return "loaded";
  })()`;
console.log("载入语料:", await ev(loadJs));
await sleep(3500);
await ev(PAGE_HELPERS);

const spans = await ev(`JSON.stringify(window.__fxab.spans())`);
if (!Array.isArray(spans) || spans.length === 0) {
  console.error("规划没出来：", JSON.stringify(spans));
  process.exit(1);
}
console.log(`共 ${spans.length} 拍`);

const rows = [];
await ev(`window.__fxab.stashFx(); "ok"`);
for (const beat of shots) {
  const s = spans.find((x) => x.beat === beat);
  if (!s) { rows.push({ beat, ok: false, why: "该拍不存在" }); continue; }
  const mid = (f) => Math.round((s.start + (s.end - s.start) * f) * 1000) / 1000;
  const t = mid(0.45), t1 = mid(0.22), t2 = mid(0.78);

  // 两组度量：
  //  静态 —— 同时刻开/关 fx 的差：证明「特效存在」，峰值即它的对比度。
  //  运动 —— 先做 (开 − 关) 把内容整层减掉，只剩纯 fx 层；再比较两个时刻的 fx 层。
  //          这样机位推近、入场动画这些大信号全部抵消，剩下的就是特效自己的位移。
  //          （直接比 t1→t2 的整帧差是错的：拍 8 的机位推近让开/关两版都差 52，
  //            fx 的贡献被淹没，甚至出现负值。）
  const probe = await ev(`
    (async () => {
      const t = ${t}, t1 = ${t1}, t2 = ${t2};
      const P = window.__fxab;
      P.restoreFx();
      const A = await P.at(t), A1 = await P.at(t1), A2 = await P.at(t2);
      P.setFx("none");
      const B = await P.at(t), B1 = await P.at(t1), B2 = await P.at(t2);
      P.restoreFx();
      let st = 0, mx = 0, mv = 0, moved = 0;
      for (let i = 0; i < A.length; i++) {
        const d = Math.abs(A[i] - B[i]);
        st += d;
        if (d > mx) mx = d;
        // 纯 fx 层：A−B 与各自的差值，再取两时刻之差的幅度
        const f = Math.abs((A1[i] - B1[i]) - (A2[i] - B2[i]));
        mv += f;
        if (f > 4) moved++;
      }
      const n = A.length;
      return JSON.stringify({ mean: st / n, max: mx, motion: mv / n, movedPct: (moved / n) * 100, samples: n });
    })()`);

  // 门槛：静态 0.05（画面里确实有它）· 运动量 0.1 —— 远高于确定性渲染的噪声底，
  // 而「视觉上等于没有」的旧交点版实测只有 0.010（一个数量级之差）。
  const ok = Number(probe?.mean ?? 0) > 0.05 && Number(probe?.motion ?? 0) > 0.1;
  rows.push({ beat, t, fx: s.fx, ok, ...probe });
  console.log(
    `拍 ${String(beat).padStart(2, "0")}  fx=${String(s.fx).padEnd(17)}` +
    `静态均差 ${Number(probe?.mean ?? 0).toFixed(3)} 峰值 ${String(probe?.max ?? 0).padStart(3)}` +
    `  |  纯 fx 层运动量 ${Number(probe?.motion ?? 0).toFixed(3)}` +
    `（${Number(probe?.movedPct ?? 0).toFixed(1)}% 样本在动）  ${ok ? "✓" : "⚠"}`,
  );
}

mkdirSync(outDir, { recursive: true });
const bad = rows.filter((r) => !r.ok);
const md = [
  "# 特效 A/B：静态存在性 + 纯 fx 层运动量",
  "",
  `页面 ${url} · 语料 ${srtPath} · 每 4 像素采样`,
  "",
  "两条都要过：静态均差 > 0.05（特效确实进了画面）· 纯 fx 层运动量 > 0.1（它真的在动，不是一张贴上去的静图）。",
  "运动量的算法是 `|(开(t1) − 关(t1)) − (开(t2) − 关(t2))|` —— 先减掉内容只留 fx 层，再看两时刻的差，机位推近与入场动画全部抵消。",
  "门槛依据：确定性渲染下噪声底远低于 0.01；而「肉眼等于没有」的版本（网格交点脉冲 / 稀疏浮尘）实测只有 0.010–0.02，与合格值差一个数量级。",
  "",
  "| 拍 | fx | 静态均差 | 峰值 | fx 层运动量 | 运动样本% | 判定 |",
  "|---|---|---|---|---|---|---|",
  ...rows.map((r) =>
    `| ${r.beat} | ${r.fx} | ${Number(r.mean ?? 0).toFixed(3)} | ${r.max ?? 0} | ${Number(r.motion ?? 0).toFixed(3)} | ${Number(r.movedPct ?? 0).toFixed(1)} | ${r.ok ? "过" : "⚠ 不过"} |`),
  "",
  bad.length === 0
    ? `**全部 ${rows.length} 拍都过** —— 特效既进了画面，也确实在动。`
    : `**${bad.length}/${rows.length} 拍不过**：${bad.map((r) => `拍 ${r.beat}`).join("、")}`,
];
writeFileSync(join(outDir, "report.md"), md.join("\n"), "utf8");
console.log(`\n报告 ${join(outDir, "report.md")}`);
process.exit(bad.length === 0 ? 0 : 1);
