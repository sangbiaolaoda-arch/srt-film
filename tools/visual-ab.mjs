// 视觉层 A/B 门禁：每个 canvas 叠加层都必须用像素证明「我确实在画面里」。
//
// 为什么需要它（本项目已经连踩三次同一个坑，每次形态不同）：
//   ① fx 层   —— 用 lighter 混合，而三系底色全是亮底 → 叠什么都没增量（Phase 9 前）
//   ② fx 层   —— 画在 SVG 之下，被 v2 满版板整个盖住 → 开/关像素差 0.000（Phase 9）
//   ③ 照片层 —— 画在 WashLayer 三层不透明满幅 rect 之下 → 像素差 0.000（2026-10-16）
// 三次的共同点：**代码路径存在、类型检查过、单元测试过、e2e 全绿，唯独画面里没有**。
// 静态检查看不出「画在了错误的层上」，只有像素差能抓到。
//
// 所以本门禁的判据只有一条：把某一层关掉再渲染同一时刻，像素差必须非零
// （fx 层另加一条：它必须真的在动）。差值为 0 = 这一层对画面的贡献是零 = 失败。
//
// 四层的关法：
//   fx        —— layout.fx = "none"（合法的显式关闭，wangji 专属场景就在用）
//   photo     —— 抹掉 slot.photo 与 shot.photo，走 drawPhotos 的素色块降级分支
//   continuity—— shot.continuity = []（ghost 继承标记消失，自标记仍在）
//   post      —— __noPost 钩子（frame.ts 读同一个全局，QA 专用，产品逻辑不依赖）
//
// 用法:
//   node tools/visual-ab.mjs --url http://127.0.0.1:5211/index.html \
//       [--srt examples/09-photo-demo.srt] [--layers fx,photo,continuity,post] \
//       [--shots 1,2,3] [--out .tmp/visual-ab]
// 前置：dev server（或 dist 静态服务）在跑，页面同源能 GET 到 examples/*.srt。
// 退出码：任一层没测出差异、或某一层在语料里无可测拍 → 1。

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
const srtPath = argOf("--srt", "examples/09-photo-demo.srt");
const layerArg = argOf("--layers", "fx,photo,continuity,post");
const layers = layerArg.split(",").map((s) => s.trim()).filter(Boolean);
const outDir = resolve(ROOT, argOf("--out", ".tmp/visual-ab"));
const shotsArg = argOf("--shots", "");

/* ── 门槛（都带实测依据，不是拍的）──────────────────────────────────────────── */
// fx：Phase 9 定。静态 0.05 = 画面里确实有它；运动量 0.1 远高于确定性渲染的噪声底，
// 而「肉眼等于没有」的旧版（网格交点脉冲 / 稀疏浮尘）实测只有 0.010–0.02，差一个数量级。
const FX_MEAN = 0.05;
const FX_MOTION = 0.1;
// photo：照片是大面积元素。修前（被 wash 盖死）实测 0.000，修后 19.9–54.6 ——
// 取 2.0 是「必须有一片像样的图」的下限，不是「有就行」。
const PHOTO_MEAN = 2.0;
// continuity：ghost 标记**故意是安静的** —— 形状 alpha 0.26、连接线 2.5px/0.55
// （continuity.ts 的探针注释：1.5px/0.3 落在色带噪声底以下，「等于没画」）。
// 所以它的设计贡献本来就小：09 语料唯一覆盖拍实测 0.036（连接线贡献大头）。
// 门槛取 0.015：约为实测值的四成，离「不存在」的 0.000 有 2.4 倍余量。
// 注意这个层的真正保险是**覆盖检查** —— ghost 只出现在共享数字的拍上，
// 若 enrichNarrative 不再派生 continuity，覆盖数归零，门禁直接失败。
const CONT_MEAN = 0.015;
// post：颗粒 0.04–0.11 alpha 全幅 + 暗角，强度低但覆盖全画面。
const POST_MEAN = 0.15;
const THRESHOLD = { fx: { mean: FX_MEAN, motion: FX_MOTION }, photo: { mean: PHOTO_MEAN }, continuity: { mean: CONT_MEAN }, post: { mean: POST_MEAN } };
const LAYER_ZH = { fx: "特效层", photo: "照片层", continuity: "连续性层", post: "后期层" };

/* ── agent-browser 调用（与 qa-frames / e2e-export / fx-ab 同一套发现逻辑）────── */
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
const LOG = join(ROOT, ".tmp/visual-ab.log");
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

/* ── 页面内：取像素指纹 / 逐层开关 / seek ──────────────────────────────────── */
const PAGE_HELPERS = `
window.__vab = {
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
  at: async (t) => { window.__stage.pause(); window.__stage.seek(t); await window.__vab.raf(); await new Promise(r => setTimeout(r, 220)); await window.__vab.raf(); return window.__vab.grab(); },
  // 每拍的层适用性与开关所需的原始值。
  spans: () => window.__stage.shots.map((s) => ({
    beat: s.content.beat,
    start: s.tlStart ?? s.start,
    end: s.end,
    fx: s.layout.fx,
    photoSlots: s.layout.slots.filter((sl) => sl.k === "photo").length,
    photoId: s.photo ?? null,
    continuity: (s.continuity || []).length,
  })),
  stash: () => {
    window.__vabSaved = window.__stage.shots.map((s) => ({
      fx: s.layout.fx,
      photo: s.photo,
      continuity: s.continuity ? s.continuity.slice() : s.continuity,
      slots: s.layout.slots.map((sl) => sl.photo),
    }));
  },
  restore: () => {
    const sv = window.__vabSaved;
    window.__stage.shots.forEach((s, i) => {
      const v = sv[i];
      // slots 逐槽重建：catalog 的 layout 是跨拍共享对象，不能原地改。
      // 重复 restore 也安全 —— 下标与 v.slots 对齐，且只在副本上重建。
      s.layout = Object.assign({}, s.layout, {
        fx: v.fx,
        slots: s.layout.slots.map((sl, j) => (sl.k === "photo" ? Object.assign({}, sl, { photo: v.slots[j] }) : sl)),
      });
      s.photo = v.photo;
      s.continuity = v.continuity;
    });
    window.__noPost = false;
  },
  setLayer: (layer, on) => {
    const sv = window.__vabSaved;
    if (layer === "post") { window.__noPost = !on; return; }
    window.__stage.shots.forEach((s, i) => {
      const v = sv[i];
      if (layer === "fx") s.layout = Object.assign({}, s.layout, { fx: on ? v.fx : "none" });
      if (layer === "photo") {
        s.photo = on ? v.photo : undefined;
        s.layout = Object.assign({}, s.layout, {
          slots: s.layout.slots.map((sl, j) => (sl.k === "photo" ? Object.assign({}, sl, { photo: on ? v.slots[j] : undefined }) : sl)),
        });
      }
      if (layer === "continuity") s.continuity = on ? v.continuity : [];
    });
  },
  warmPhotos: async () => {
    const m = await import("/src/assets/photos.ts");
    const ids = window.__stage.shots.map((s) => s.photo).filter(Boolean);
    for (const id of new Set(ids)) await m.ensurePhoto(id);
    return "warmed " + new Set(ids).size;
  },
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

const spans = await ev(`JSON.stringify(window.__vab.spans())`);
if (!Array.isArray(spans) || spans.length === 0) {
  console.error("规划没出来：", JSON.stringify(spans));
  process.exit(1);
}
console.log(`共 ${spans.length} 拍；预热照片：`, await ev(`window.__vab.warmPhotos()`));
await ev(`window.__vab.stash(); "ok"`);

/* ── 挑拍：显式 --shots 优先；否则每层取最多 3 拍（首/中/尾，摊开）───────────── */
const applicable = (layer, s) => {
  if (layer === "fx") return !!s.fx && s.fx !== "none";
  if (layer === "photo") return s.photoSlots > 0;
  if (layer === "continuity") return s.continuity > 0;
  return true; // post：每拍都有
};
let picks;
if (shotsArg) {
  picks = shotsArg.split(",").map((s) => Number(s.trim()));
} else {
  const set = new Set();
  for (const layer of layers) {
    const hits = spans.filter((s) => applicable(layer, s));
    if (hits.length === 0) continue;
    for (const s of [hits[0], hits[Math.floor(hits.length / 2)], hits[hits.length - 1]]) set.add(s.beat);
  }
  picks = [...set].sort((a, b) => a - b);
}

/* ── 覆盖检查：要测的层在语料里必须有可测拍，否则门禁形同虚设 ───────────────── */
const coverage = [];
for (const layer of layers) {
  const hits = spans.filter((s) => applicable(layer, s));
  coverage.push({ layer, n: hits.length, beats: hits.map((s) => s.beat) });
  if (hits.length === 0) console.log(`⚠ ${LAYER_ZH[layer]}（${layer}）：本语料没有可测拍，该层未被验证`);
}

/* ── 逐拍逐层测量 ─────────────────────────────────────────────────────────── */
const rows = [];
for (const beat of picks) {
  const s = spans.find((x) => x.beat === beat);
  if (!s) { rows.push({ beat, layer: "-", ok: false, why: "该拍不存在" }); continue; }
  const mid = (f) => Math.round((s.start + (s.end - s.start) * f) * 1000) / 1000;
  const t = mid(0.45), t1 = mid(0.22), t2 = mid(0.78);
  const mine = layers.filter((l) => applicable(l, s));

  const probe = await ev(`
    (async () => {
      const t = ${t}, t1 = ${t1}, t2 = ${t2};
      const P = window.__vab;
      const mine = ${JSON.stringify(mine)};
      const out = {};
      P.restore();
      const ON = await P.at(t);
      for (const layer of mine) {
        P.setLayer(layer, false);
        const OFF = await P.at(t);
        let st = 0, mx = 0;
        for (let i = 0; i < ON.length; i++) {
          const d = Math.abs(ON[i] - OFF[i]);
          st += d;
          if (d > mx) mx = d;
        }
        const n = ON.length;
        const rec = { mean: st / n, max: mx };
        if (layer === "fx") {
          P.setLayer(layer, true);
          const A1 = await P.at(t1), A2 = await P.at(t2);
          P.setLayer(layer, false);
          const B1 = await P.at(t1), B2 = await P.at(t2);
          let mv = 0, moved = 0;
          for (let i = 0; i < A1.length; i++) {
            const f = Math.abs((A1[i] - B1[i]) - (A2[i] - B2[i]));
            mv += f;
            if (f > 4) moved++;
          }
          rec.motion = mv / n;
          rec.movedPct = (moved / n) * 100;
        }
        out[layer] = rec;
        P.restore();
      }
      return JSON.stringify(out);
    })()`);

  for (const layer of mine) {
    const r = probe?.[layer];
    if (!r) { rows.push({ beat, layer, ok: false, why: "没测到" }); continue; }
    const th = THRESHOLD[layer];
    const ok = r.mean > th.mean && (th.motion === undefined || r.motion > th.motion);
    rows.push({ beat, layer, ok, ...r });
  }
  const brief = mine
    .map((l) => `${LAYER_ZH[l]} ${Number(probe?.[l]?.mean ?? 0).toFixed(3)}${probe?.[l]?.motion !== undefined ? `/动 ${Number(probe[l].motion).toFixed(3)}` : ""}`)
    .join(" · ");
  console.log(`拍 ${String(beat).padStart(2, "0")}  ${brief}`);
}

/* ── 报告 ─────────────────────────────────────────────────────────────────── */
mkdirSync(outDir, { recursive: true });
const bad = rows.filter((r) => !r.ok);
const noCover = coverage.filter((c) => c.n === 0);
const md = [
  "# 视觉层 A/B：像素存在性门禁",
  "",
  `页面 ${url} · 语料 ${srtPath} · 每 4 像素采样 · 拍 ${picks.join(",")}`,
  "",
  "判据：把某一层关掉再渲染同一时刻，像素差必须非零（fx 层另须在动）。差 0 = 该层对画面的贡献是零 = 失败。",
  "这一条不是形式主义 —— 本项目连踩三次「代码路径存在、测试全绿、画面里没有」：fx 的 lighter 撞亮底、fx 被 SVG 之下盖住、照片被 WashLayer 满幅 rect 盖住，全靠像素差抓到。",
  "",
  "| 层 | 关法 | 静态均差门槛 | 运动量门槛 |",
  "|---|---|---|---|",
  `| 特效层 fx | layout.fx = "none" | > ${FX_MEAN} | > ${FX_MOTION} |`,
  `| 照片层 photo | 抹掉 slot.photo 与 shot.photo（走素色块降级） | > ${PHOTO_MEAN} | — |`,
  `| 连续性层 continuity | shot.continuity = []（ghost 消失，自标记仍在） | > ${CONT_MEAN} | — |`,
  `| 后期层 post | __noPost 钩子跳过 applyPost | > ${POST_MEAN} | — |`,
  "",
  "运动量算法（仅 fx）：`|(开(t1) − 关(t1)) − (开(t2) − 关(t2))|` —— 先减掉内容只留 fx 层，再看两时刻之差，机位推近与入场动画全部抵消。",
  "",
  "## 覆盖",
  "",
  "| 层 | 语料内可测拍数 | 拍号 |",
  "|---|---|---|",
  ...coverage.map((c) => `| ${LAYER_ZH[c.layer]}（${c.layer}） | ${c.n} | ${c.beats.slice(0, 12).join(", ")}${c.beats.length > 12 ? " …" : ""} |`),
  "",
  "## 逐拍逐层",
  "",
  "| 拍 | 层 | 静态均差 | 峰值 | 运动量 | 运动样本% | 判定 |",
  "|---|---|---|---|---|---|---|",
  ...rows.map((r) =>
    `| ${r.beat} | ${LAYER_ZH[r.layer] ?? r.layer} | ${Number(r.mean ?? 0).toFixed(3)} | ${r.max ?? 0} | ${r.motion !== undefined ? Number(r.motion).toFixed(3) : "—"} | ${r.movedPct !== undefined ? Number(r.movedPct).toFixed(1) : "—"} | ${r.ok ? "过" : `⚠ 不过${r.why ? `（${r.why}）` : ""}`} |`),
  "",
  bad.length === 0 && noCover.length === 0
    ? `**全部通过**：${rows.length} 项测量都非零，${coverage.filter((c) => c.n > 0).length}/${coverage.length} 层在语料内有覆盖。`
    : [
        bad.length > 0 ? `**${bad.length}/${rows.length} 项不过**：${bad.map((r) => `拍 ${r.beat} ${LAYER_ZH[r.layer] ?? r.layer}`).join("、")}` : "",
        noCover.length > 0 ? `**覆盖缺口**：${noCover.map((c) => LAYER_ZH[c.layer]).join("、")} 在本语料里没有可测拍 —— 换语料或补内容` : "",
      ]
        .filter(Boolean)
        .join("<br>"),
];
writeFileSync(join(outDir, "report.md"), md.join("\n"), "utf8");
console.log(`\n报告 ${join(outDir, "report.md")}`);
if (bad.length > 0 || noCover.length > 0) {
  console.error(`✗ ${bad.length} 项不过、${noCover.length} 层无覆盖`);
  process.exit(1);
}
console.log("✓ 全部通过");
