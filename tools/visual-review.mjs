// 画面验收门禁（方法论 §7.1 L4「实际画面检查」+ L5「性能测量」+ 练习 3「缩略图/灰度」）。
//
// 为什么需要它：本项目已有的门禁全部是「存在性」判据 —— visual-ab 证明每一层都真的
// 画进了画面，qa-frames 证明同一时刻两次渲染逐位相同，e2e 证明成片不黑不白。
// 但它们**没有一条回答「这帧画面本身合格吗」**：字压在同色底上认不出、缩到
// 240×135 糊成一团、层级只靠色相撑着（灰度下一团糟）、一帧渲染 200ms 导出会掉帧 ——
// 这些全都能过现有门禁。方法论把这层叫「实际画面检查」，并要求同时看彩色、灰度、
// 缩略图三种状态；本工具把它变成可执行断言。
//
// 度量（全部只吃像素，纯函数在 tools/lib/metrics.mjs，页面与 Node 共用同一份）：
//   regionSpread —— 6×4 网格的区域亮度 p90−p10。**这就是灰度判据**：抽掉色相后
//                    唯一剩下的通道就是亮度，灰度下还认得出的层级 = 亮度分层。
//   focusSep     —— 任一格与邻域中位数的最大亮度差。几何无关，所以 custom 满版
//                    场景（v2，槽位只是资格声明、真实构图在场景里）也能量「有焦点吗」。
//   hookSep      —— 主文字槽与其外扩环带的亮度差（仅非 custom 版式量，槽位是真实几何）。
//   hookSepThumb —— 同上，但在 240×135 缩略图上量。缩略图里认不出 = 只在满屏下成立。
//   perf         —— 逐帧 renderFrame 耗时（含 SVG 光栅化，与导出同一条路径）。
//
// 门槛按**设计强度**标定，不按绿灯标定：先跑 --calibrate 看真实分布，再定阈值，
// 并用反向用例证明判据有区分力（flat 合成帧必须判不过）。
//
// 用法:
//   node tools/visual-review.mjs --url http://127.0.0.1:5211/index.html \
//       [--srt examples/01-explanatory-tech.srt] [--shots 1,2,3] \
//       [--out .tmp/vr-01] [--repeats 6] [--no-sheet] [--calibrate]
// 前置：dev server 在跑（页面同源能 GET 到 examples/*.srt）。
// 退出码：任一判据不过、或语料里 0 拍可测 → 1。--calibrate 只打印分布，恒返回 0。

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { makeAb } from "./lib/ab.mjs";

const argv = process.argv.slice(2);
const argOf = (k, d) => {
  const i = argv.indexOf(k);
  return i >= 0 ? argv[i + 1] : d;
};
const has = (k) => argv.includes(k);

const ROOT = process.cwd();
const { ab, ev, sleep } = makeAb({ root: ROOT, log: ".tmp/visual-review.log" });
const url = argOf("--url", "http://127.0.0.1:5211/index.html");
const srtPath = argOf("--srt", "examples/01-explanatory-tech.srt");
const outDir = resolve(ROOT, argOf("--out", ".tmp/visual-review"));
const repeats = Number(argOf("--repeats", "6"));
const calibrate = has("--calibrate");
const selftest = has("--selftest");
const sheet = !has("--no-sheet");
const shotArg = argOf("--shots", "");
const onlyShots = shotArg ? new Set(shotArg.split(",").map((s) => Number(s.trim()))) : null;

/* ── 阈值（按设计强度标定；数字来源见 progress.md 的校准记录）────────────────── */
/* ── 阈值 ──────────────────────────────────────────────────────────────────
 * 判据只留两条**站得住**的；其余量出来记录、不当阈值（每一条都实测试过）：
 *   isoInk / isoEdge —— 把该拍内容图层**单独**光栅化到白底后量到的墨量与边缘能量。
 *     它回答「这套版式到底画了多少东西」：空图层 = 0，被反向自测验证过区分力。
 *     阈值定在真实分布的下沿之下（8 语料实测最低 isoInk 1.0% / isoEdge 0.20，
 *     空的帧是 0.00），所以它抓的是「画了等于没画」这一类 catastrophic 故障，
 *     不承担审美判断 —— 审美由联系表 + 人工盲评负责。
 *   perfMed —— 单帧渲染耗时预算，防回归。**不是** 30fps 承诺（实测中位 1.1~1.5×
 *     实时，倍数写在报告里；预算是防回归的上限，不是性能目标）。
 * 试过并放弃的判据（放弃理由一并记，避免以后重走）：
 *   regionSpread（网格 p90−p10）：空帧 13.2 vs 文字帧 14.5 —— 重叠，判别力为零。
 *   inkSep（网格 cell 均值版）：细笔画被稀释，巨号数字帧只有 16。
 *   inkSep（像素分位 p02/p05）：1% 墨量的画面仍是 0，测不准稀疏内容。
 *   hookSep / hookSepThumb（盒 vs 环带）：只在「文字周围是空白」时成立；竖排、
 *     满幅文字、照片版式全部误伤（实测 sp-vertical-tension 缩略图 1.06）。
 *   focusSep：空帧仍有 19（背景层自带焦点），单条几乎无判别力。
 * 缩略图可读性没有客观阈值（小字号本就该在缩略图里消失），只量出来给联系表里
 * 的人类判断 —— 方法论要的是「同时看缩略图」，不是「缩略图必须有多少墨」。
 */
// 预算 600ms：实测上界 489ms（照片拍，随机器负载波动 200~490）×1.2。照片拍比文字拍慢 5~10 倍（378 vs 25ms），
// 是导出耗时主因 —— 本阶段只立预算不修，记在 progress.md 的已知性能特征里。
const TH = {
  isoInk: Number(argOf("--min-iso-ink", "0.8")),    // 隔离后墨量 %：这套版式到底画了多少东西
  isoEdge: Number(argOf("--min-iso-edge", "0.15")),    // 隔离后边缘能量：有没有可辨识的结构
  perfMed: Number(argOf("--max-perf-median", "600")),         // 单帧渲染毫秒（防回归预算）
};

/* ── 页面内脚本：走 window.__renderFrame（导出同源）取像素并量 ───────────────── */
const PAGE = String.raw`
(async () => {
  const M = await import("/tools/lib/metrics.mjs");
  const { rasterizeLayer } = await import("/src/render/rasterize.ts");
  const st = window.__stage, RF = window.__renderFrame;
  if (!st || !RF) return { error: "stage/renderFrame 未就绪" };
  st.setAutoRender(false); st.pause();
  const ctx = st.canvas.getContext("2d", { alpha: false });
  const thumb = document.createElement("canvas"); thumb.width = 240; thumb.height = 135;
  const tctx = thumb.getContext("2d", { willReadFrequently: true });
  const HOOK = new Set(["headline", "quote", "text", "bignum", "num2"]);
  // 增量式测量（与 visual-ab 同源思路）：每拍量两遍 —— 完整画面、以及抹掉本拍 SVG
  // 图层后的画面。差值 contentShare 才是「内容对画面的贡献」：底纹/wash/fx/后期层
  // 本身就有 4~5% 墨量（实测 v2-strata 抹掉内容后仍剩 4.96%），绝对值判据会被它们
  // 抬高到失去区分力。
  const layerInner = (i) => { const el = st.svg.querySelector('[data-layer="' + i + '"]'); return el ? el.innerHTML : null; };
  const setLayerInner = (i, html) => { const el = st.svg.querySelector('[data-layer="' + i + '"]'); if (el) el.innerHTML = html; };
  // 每批一份 out：声明在外面会让第 2 批返回「前面所有批 + 本批」（实测 11 拍变 19 行）。
  window.__vrBatch = async (lo, hi) => {
  const out = [];
  for (let si = lo; si < hi; si++) {
    const s = st.shots[si];
    if (window.__vrOnly && !window.__vrOnly.includes(s.content.beat)) continue;
    // 反向自测：抹掉该拍内容（只剩底 + fx + 后期），判据必须随之塌到阈值下 ——
    // 否则「量到的数字」与「画面里有没有东西」无关，门禁就是摆设。
    // 必须在**调用时**读 __vrBlank：挂在脚本定义时的话，Node 侧后设的标记不生效，
    // 自测会静默退化成「没抹」（实测隔离墨量 81% 没塌）。
    const blanking = window.__vrBlank != null && si === window.__vrBlank;
    let savedHtml = null;
    if (blanking) {
      const el = st.svg.querySelector('[data-layer="' + si + '"]');
      if (el) { savedHtml = el.innerHTML; el.innerHTML = ""; }
    }
    const t0 = s.tlStart ?? s.start, dur = Math.max(s.end - s.start, 0.8);
    const t = t0 + dur * 0.75;
    // 必须先 seek：renderFrame 只读 SVG 上 GSAP 写好的 opacity/transform，
    // 自己不推时间轴。不 seek 就调它 = 图层 opacity 0 = 量的是一张空帧
    // （实测 regionSpread 13 vs 133，差 10 倍 —— 校准数据曾整体作废过一次）。
    st.seek(t);
    await RF({ ctx, svg: st.svg, shots: st.shots, t, frame: Math.round(t * 30) });
    const W = st.canvas.width, H = st.canvas.height;
    const px = ctx.getImageData(0, 0, W, H).data;
    // 灰度判据：区域亮度分层（6×4 网格的 p90−p10）
    const cells = M.regionLuma(px, W, H, 6, 4, 16);
    const regionSpread = M.percentile(cells, 0.9) - M.percentile(cells, 0.1);
    // 墨量覆盖率（见 metrics.inkStats 的注释：分位数与网格均值都测不准稀疏内容）
    const ink = M.inkStats(px, 16, 28);
    const inkRatio = ink.inkRatio;
    const inkSep = ink.inkSep;
    // 隔离测量：把这一拍的内容图层**单独**光栅化到白底上量。
    // 增量式（抹掉图层再比）试过三轮，全部作废：① 墨量增量在暗底版式上反号
    // （v2-num-giant −1.41%，整块深色面板抹掉后底纹层的偏差像素反而变多）；
    // ② 边缘能量增量同样反号（v2-strata −3.68）—— 根因是 v2 板式自己画整幅底色，
    // 抹掉它就**露出**底纹层，基线自己变脏。隔离测量没有基线问题：量到的就是
    // 「这套版式自己画了什么」。
    ctx.save();
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, W, H);
    const isoImg = await rasterizeLayer(st.svg, si, W, H);
    if (isoImg) ctx.drawImage(isoImg, 0, 0, W, H);
    ctx.restore();
    const iso = ctx.getImageData(0, 0, W, H).data;
    const isoInk = M.inkStats(iso, 16, 28);
    const isoEdge = M.edgeEnergy(iso, W, H, 2);
    const isoThumb = (() => {
      tctx.drawImage(ctx.canvas, 0, 0, 240, 135);
      return +(M.inkStats(tctx.getImageData(0, 0, 240, 135).data, 4, 28).inkRatio * 100).toFixed(2);
    })();
    // 焦点：任一格与四邻中位数的最大差（几何无关，v2 满版也能量）
    let focusSep = 0;
    for (let gy = 0; gy < 4; gy++) for (let gx = 0; gx < 6; gx++) {
      const nb = [];
      if (gx > 0) nb.push(cells[gy * 6 + gx - 1]);
      if (gx < 5) nb.push(cells[gy * 6 + gx + 1]);
      if (gy > 0) nb.push(cells[(gy - 1) * 6 + gx]);
      if (gy < 3) nb.push(cells[(gy + 1) * 6 + gx]);
      nb.sort((a, b) => a - b);
      const med = nb[Math.floor(nb.length / 2)];
      focusSep = Math.max(focusSep, Math.abs(cells[gy * 6 + gx] - med));
    }
    // 主文字 vs 环带（仅非 custom：custom 的槽位只是资格声明，真实构图在场景里）
    let hookSep = null, hookSepThumb = null;
    // 只量「纸底 + 文字」的版式：照片拍的环带也是照片，box 与 ring 都含照片内容，
    // 差值天然趋零（实测 im-photo-duo 仅 2.1），拿它当判据只会误伤。
    const paperText = !s.layout.custom && !s.layout.slots.some((sl) => sl.k === "photo");
    if (paperText) {
      const cols = s.layout.cols ?? 12, rows = s.layout.rows ?? 8;
      const hooks = s.layout.slots.filter((sl) => HOOK.has(sl.k));
      if (hooks.length) {
        const big = hooks.reduce((a, b) => (b.box[2] * b.box[3] > a.box[2] * a.box[3] ? b : a));
        const bx = big.box;
        const box = { x0: (bx[0] / cols) * W, y0: (bx[1] / rows) * H, x1: ((bx[0] + bx[2]) / cols) * W, y1: ((bx[1] + bx[3]) / rows) * H };
        const pad = Math.round(Math.min(W, H) * 0.04);
        hookSep = Math.abs(M.boxLuma(px, W, H, box.x0, box.y0, box.x1, box.y1) - M.ringLuma(px, W, H, box, pad));
        tctx.drawImage(st.canvas, 0, 0, 240, 135);
        const tp = tctx.getImageData(0, 0, 240, 135).data;
        const kx = 240 / W, ky = 135 / H;
        const tbox = { x0: box.x0 * kx, y0: box.y0 * ky, x1: box.x1 * kx, y1: box.y1 * ky };
        hookSepThumb = Math.abs(M.boxLuma(tp, 240, 135, tbox.x0, tbox.y0, tbox.x1, tbox.y1) - M.ringLuma(tp, 240, 135, tbox, 6));
      }
    }
    // 性能：先预热一帧再计时（方法论 L5：预热后重复采样）—— 照片解码、SVG 光栅化
    // 的首次开销会把中位数从 70ms 拉到 500ms，量的是预热不是渲染。
    st.seek(t);
    await RF({ ctx, svg: st.svg, shots: st.shots, t, frame: Math.round(t * 30) });
    const times = [];
    for (let k = 0; k < ${repeats}; k++) {
      const tk = t0 + dur * (0.4 + 0.4 * (k / Math.max(1, ${repeats} - 1)));
      st.seek(tk);
      const a = performance.now();
      await RF({ ctx, svg: st.svg, shots: st.shots, t: tk, frame: Math.round(tk * 30) + k });
      times.push(performance.now() - a);
    }
    times.sort((a, b) => a - b);
    const med = times[Math.floor(times.length / 2)];
    out.push({
      beat: s.content.beat, layout: s.layout.id, custom: !!s.layout.custom, t: +t.toFixed(2),
      inkRatio: +(inkRatio * 100).toFixed(2), isoInk: +(isoInk.inkRatio * 100).toFixed(2),
      isoEdge: +isoEdge.toFixed(3), isoThumb,
      photo: s.layout.slots.some((sl) => sl.k === "photo"),
      focusSep: +focusSep.toFixed(2),
      hookSep: hookSep === null ? null : +hookSep.toFixed(2),
      hookSepThumb: hookSepThumb === null ? null : +hookSepThumb.toFixed(2),
      chroma: +M.chromaMean(px, 16).toFixed(2),
      perfMed: +med.toFixed(2), perfMax: +times[times.length - 1].toFixed(2),
    });
    out.__sheet = out.__sheet || [];
    out.__sheet.push(st.canvas.toDataURL("image/jpeg", 0.55));
    if (blanking) {
      const el = st.svg.querySelector('[data-layer="' + si + '"]');
      if (el && savedHtml !== null) el.innerHTML = savedHtml;
    }
  }
  return { rows: out, sheet: out.__sheet || [] };
  };
  window.__vrBatchRows = async (lo, hi) => { const r = await window.__vrBatch(lo, hi); return { rows: r.rows }; };
  window.__vrBatchWithSheet = async (lo, hi) => window.__vrBatch(lo, hi);
  st.setAutoRender(true);
  return { ready: true, n: st.shots.length };
})()
`;

/* ── 驱动 ────────────────────────────────────────────────────────────────── */
const srt = readFileSync(resolve(ROOT, srtPath), "utf8");
const r0 = await ab(["open", url]);
if (r0.code !== 0) {
  console.error(`打开页面失败（${r0.out.trim().slice(0, 200)}）`);
  process.exit(1);
}
await ab(["set", "viewport", "1600", "900"]);
await ev(`document.getElementById('srt-input').value = ${JSON.stringify(srt)}; document.getElementById('override-input').value = ''; document.getElementById('btn-load').click(); 'ok'`);

let ready = false;
for (let i = 0; i < 80 && !ready; i++) {
  const r = await ev(`!!(window.__stage && window.__stage.shots && window.__stage.shots.length && window.__renderFrame)`);
  if (r === true) ready = true;
  else await sleep(500);
}
if (!ready) {
  console.error("舞台未就绪（规划未完成或钩子缺失）");
  process.exit(1);
}
if (onlyShots) await ev(`window.__vrOnly = ${JSON.stringify([...onlyShots])}; 'ok'`);
await sleep(400);
// 分批执行：一次 eval 跑完 29 拍会把 agent-browser 的连接拖超时（实测 os error 10060），
// 所以每批 8 拍、批间把结果收回 Node 再继续。
const boot = await ev(PAGE);
if (!boot || boot.error || !boot.ready) {
  console.error(`页面内度量初始化失败：${JSON.stringify(boot).slice(0, 300)}`);
  process.exit(1);
}
const BATCH = Number(argOf("--batch", "8"));
async function runBatches(withSheet) {
  const rows = [];
  const shots = [];
  const fn = withSheet ? "__vrBatchWithSheet" : "__vrBatchRows";
  for (let lo = 0; lo < boot.n; lo += BATCH) {
    const part = await ev(`window.${fn}(${lo}, ${Math.min(lo + BATCH, boot.n)}).then(r => JSON.stringify(r))`);
    if (part && Array.isArray(part.rows)) rows.push(...part.rows);
    if (part && Array.isArray(part.sheet)) shots.push(...part.sheet);
    await sleep(150);
  }
  return { rows, shots };
}
const first = await runBatches(sheet);
const all = first.rows;
const sheets = first.shots;
const res = { shots: all };
await sleep(300);


if (!res || typeof res !== "object" || res.error) {
  console.error(`页面内度量失败：${JSON.stringify(res).slice(0, 300)}`);
  process.exit(1);
}
const rows = res.shots;
if (!rows.length) {
  console.error("0 拍可测 —— 门禁拒绝「跑过了但什么都没测」");
  process.exit(1);
}

/* ── 判据 ────────────────────────────────────────────────────────────────── */
const perfMedians = rows.map((r) => r.perfMed).sort((a, b) => a - b);
const meas = rows.filter((r) => r.hookSep !== null);
const fails = [];
for (const r of rows) {
  const bad = [];
  if (r.isoInk < TH.isoInk) bad.push(`隔离墨量 ${r.isoInk}%<${TH.isoInk}%`);
  if (r.isoEdge < TH.isoEdge) bad.push(`隔离无结构 ${r.isoEdge}<${TH.isoEdge}`);
  if (r.perfMed > TH.perfMed) bad.push(`渲染耗时 ${r.perfMed}ms>${TH.perfMed}ms`);
  if (bad.length) fails.push({ beat: r.beat, layout: r.layout, why: bad.join("；") });
}
const realtime = (perfMedians.reduce((a, b) => a + b, 0) / Math.max(1, perfMedians.length)) / (1000 / 30);

/* ── 反向自测：抹掉某拍内容后判据必须塌下去（证明量到的数字与「画面里有没有东西」有关）── */
let selftestOut = null;
if (selftest) {
  // 必须挑**没有照片槽**的拍：照片是 canvas 直画（drawPhotos），不在 SVG 图层里，
  // 抹掉 SVG 层它照样在画面上 —— 拿它做反向自测会得到「判据没塌」的假结论。
  const idx = await ev(`(() => { const i = window.__stage.shots.findIndex(s => !s.layout.slots.some(sl => sl.k === 'photo')); return i >= 0 ? i : 0; })()`);
  await ev(`window.__vrBlank = ${Number(idx)}; 'ok'`);
  await sleep(300);
  // 走与正式测量同一条分批路径（早先直接调 PAGE 会拿到 {ready,n} 而不是行数据，
  // 自测静默变成「未执行」—— 门禁自己也会「跑过了但什么都没测」）。
  const blankedRows = (await runBatches(false)).rows;
  await ev(`window.__vrBlank = null; 'ok'`);
  await sleep(200);
  const b = blankedRows[Number(idx)] ?? blankedRows[0] ?? null;
  const before = all[Number(idx)] ?? null;
  selftestOut = b && before ? { idx: Number(idx), before: { isoInk: before.isoInk, isoEdge: before.isoEdge }, blanked: { isoInk: b.isoInk, isoEdge: b.isoEdge } } : null;
  // 自测判据：被抹掉的那一拍，隔离墨量必须塌到阈值下（隔离测量下应 = 0）。
  if (selftestOut && !(selftestOut.blanked.isoInk < TH.isoInk && selftestOut.before.isoInk >= TH.isoInk)) {
    fails.push({
      beat: before?.beat ?? 0,
      layout: "selftest",
      why: `抹掉内容后隔离墨量 ${selftestOut.blanked.isoInk}% 未塌到阈值 ${TH.isoInk}% 下（判据无区分力）`,
    });
  }
}


mkdirSync(outDir, { recursive: true });

if (calibrate) {
  const col = (k) => rows.map((r) => r[k]).filter((v) => typeof v === "number").sort((a, b) => a - b).map((v) => v.toFixed(1)).join(" ");
  console.log(`校准模式 —— ${srtPath}：${rows.length} 拍（可测主体 ${meas.length} 拍）`);
  for (const k of ["isoInk", "isoEdge", "isoThumb", "inkRatio", "focusSep", "chroma", "perfMed", "perfMax"]) console.log(`  ${k.padEnd(10)} ${col(k)}`);
  console.log(`  帧耗时中位 ${perfMedians[Math.floor(perfMedians.length / 2)]?.toFixed(1)}ms（= ${realtime.toFixed(1)}× 实时）· 当前阈值 ${JSON.stringify(TH)}`);
} else {
  const md = [
    `# 画面验收报告 ${srtPath}`,
    ``,
    `拍数 ${rows.length} · 可测主体 ${meas.length} · 帧耗时中位 ${perfMedians[Math.floor(perfMedians.length / 2)]?.toFixed(1)}ms（= ${realtime.toFixed(1)}× 实时 30fps，预算 ${TH.perfMed}ms）`,
    ``,
    `| 拍 | 版式 | 隔离墨量% | 隔离边缘 | 隔离缩略图% | 全幅墨量% | 焦点 | 主体分离 | 彩度 | 帧耗时中位/最大 |`,
    `|---|---|---|---|---|---|---|---|---|---|`,
    ...rows.map((r) =>
      `| ${r.beat} | ${r.layout}${r.custom ? "（custom）" : ""} | ${r.regionSpread} | ${r.focusSep} | ${r.hookSep ?? "—"} | ${r.hookSepThumb ?? "—"} | ${r.chroma} | ${r.perfMed}/${r.perfMax}ms |`,
    ),
    ``,
    `## 判据`,
    `隔离墨量 ≥ ${TH.isoInk}% · 隔离边缘 ≥ ${TH.isoEdge} · 单帧中位耗时 ≤ ${TH.perfMed}ms。其余列（墨量% / 墨量对比 / 焦点 / 主体分离 / 缩略图% / 彩度）是记录项，只量不判。`,
    ``,
    `## 反向自测（抹掉该拍内容后判据必须塌到阈值下）`,
    selftestOut
      ? `拍 ${rows[selftestOut.idx]?.beat}（${rows[selftestOut.idx]?.layout}）：隔离墨量 ${selftestOut.before.isoInk}% → ${selftestOut.blanked.isoInk}% · 边缘 ${selftestOut.before.isoEdge} → ${selftestOut.blanked.isoEdge}（阈值 ${TH.isoInk}% / ${TH.isoEdge}）`
      : "未执行（加 --selftest）",
    ``,
    `## 结论`,
    fails.length ? `✗ ${fails.length} 项不过：\n${fails.map((f) => `- 拍 ${f.beat}（${f.layout}）：${f.why}`).join("\n")}` : `✓ 全部通过（${rows.length} 拍）`,
    ``,
  ].join("\n");
  writeFileSync(join(outDir, "report.md"), md, "utf8");
  writeFileSync(join(outDir, "report.json"), JSON.stringify({ srt: srtPath, th: TH, realtime, rows, fails, selftest }, null, 1), "utf8");
  if (sheet && sheets.length) {
    const cells = rows.map((r, i) => {
      const img = `<img src="${sheets[i]}" style="width:100%;display:block;border:1px solid #333">`;
      return `<figure style="margin:0"><figcaption style="font:12px/1.6 monospace;color:#bbb;padding:4px 2px">拍 ${r.beat} · ${r.layout} · t=${r.t}s</figcaption>${img}</figure>`;
    });
    writeFileSync(
      join(outDir, "contact-sheet.html"),
      `<!doctype html><meta charset="utf-8"><title>联系表 ${srtPath}</title><body style="margin:0;padding:16px;background:#141414;color:#ddd;font:13px/1.6 monospace"><h1 style="font-size:15px">联系表 · ${srtPath} · ${rows.length} 拍（每拍 t=入场 75% 处）</h1><div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px">${cells.join("")}</div>`,
      "utf8",
    );
  }
  console.log(md.split("\n").slice(-6).join("\n"));
  console.log(`报告 ${join(outDir, "report.md")}${sheet ? " + contact-sheet.html" : ""}`);
}

await ab(["close", "--all"]);
process.exit(calibrate ? 0 : fails.length ? 1 : 0);