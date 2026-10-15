#!/usr/bin/env node
// Phase 1 实验工具 —— HTML 权威性量化：renderFrame 光栅化（导出路径）vs 浏览器原生渲染（DOM 路径）。
//
// 背景：srt-film 的画面事实来源是 DOM 里的 SVG 树 + GSAP 时间轴，renderFrame 是唯一解释器
// （stage 播放循环与 mp4 导出循环都调它）——预览与导出天然同源。但 renderFrame 的解释方式是
// 「SVG 序列化 → Image → drawImage」，与「浏览器把该 SVG 作为 DOM 原生渲染」之间可能有差
// （字体/letterSpacing/filter 细节）。本工具量化这个差：
//   A 帧 = 导出 MP4 抽帧（renderFrame 输出，1920×1080）
//   B 帧 = 隐藏 canvas 后 CDP 截图（浏览器原生渲染 DOM SVG，seek 后 GSAP 同步推进 DOM）
//   diff = B 的保真度。差小 → WebCodecs 路线坐实；差大 → 记录差异源，评估 BeginFrame 捕获。
//
// 用法：
//   node tools/e2e-html-parity.mjs --srt examples/08-forgetting-20s.srt --ov examples/08-forgetting-20s.json --probe
//   node tools/e2e-html-parity.mjs ... --frames 90 --from 60 --outdir <dir>
// 依赖：系统 Chrome（agent-browser 驱动）、E:/WorkBuddy/tools/ffmpeg.exe、PIL（比对阶段外置）

import { spawn } from "node:child_process";
import { appendFileSync, closeSync, existsSync, mkdirSync, openSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUTDIR = resolve(ROOT, ".tmp/parity");
const LOG = join(OUTDIR, "parity.log");

function resolveAgentBrowser() {
  if (process.env.AGENT_BROWSER_BIN) return { cmd: process.env.AGENT_BROWSER_BIN, pre: [] };
  const sep = process.platform === "win32" ? ";" : ":";
  for (const d of (process.env.PATH || "").split(sep).filter(Boolean)) {
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

function run(cmd, args, { input } = {}) {
  return new Promise((res) => {
    let fd;
    try { fd = openSync(LOG, "a"); } catch { return res({ code: -1, out: "", err: "无法打开日志" }); }
    const from = statSync(LOG).size;
    const finish = (code, extra = {}) => {
      try { closeSync(fd); } catch { /* 已关 */ }
      let out = "";
      try { out = readFileSync(LOG).subarray(from).toString("utf8"); } catch { /* 读不到 */ }
      res({ code, out, err: "", ...extra });
    };
    let p;
    try { p = spawn(cmd, args, { stdio: ["pipe", fd, fd] }); } catch (e) { return finish(-1, { err: String(e?.message || e) }); }
    p.on("error", (e) => finish(-1, { err: String(e?.message || e) }));
    p.on("close", (code) => finish(code));
    if (input !== undefined && p.stdin.writable) p.stdin.write(input);
    p.stdin.end();
  });
}

const AB = resolveAgentBrowser();
const ab = (args, opts = {}) => run(AB.cmd, [...AB.pre, ...args], opts);

function parseJson(text) {
  const tryParse = (s) => { try { return JSON.parse(s); } catch { return undefined; } };
  let v = tryParse(String(text ?? "").trim());
  for (let i = 0; i < 6 && typeof v === "string"; i++) v = tryParse(v.trim());
  if (v !== undefined) return v;
  const lines = String(text ?? "").split("\n").map((l) => l.trim()).filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i--) {
    const t = tryParse(lines[i]);
    if (t !== undefined) return t;
  }
  return undefined;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const argv = process.argv.slice(2);
const argOf = (name, dft) => { const i = argv.indexOf(name); return i >= 0 && argv[i + 1] ? argv[i + 1] : dft; };
const srtPath = resolve(ROOT, argOf("--srt", "examples/08-forgetting-20s.srt"));
const ovPath = argv.includes("--ov") ? resolve(ROOT, argOf("--ov", "")) : null;
const port = argOf("--port", "5198");
const frames = Number(argOf("--frames", "90"));
const fromFrame = Number(argOf("--from", "60"));
const shotsDir = resolve(ROOT, argOf("--outdir", join(OUTDIR, "dom")));
const probeOnly = argv.includes("--probe");

mkdirSync(OUTDIR, { recursive: true });
mkdirSync(shotsDir, { recursive: true });
appendFileSync(LOG, `\n===== parity ${new Date().toISOString()} =====\n`);

let server = null;
try {
  server = spawn(process.execPath, [join(ROOT, "node_modules/vite/bin/vite.js"), "--port", port], {
    cwd: ROOT, stdio: ["ignore", "pipe", "pipe"],
  });
  let serverLog = "";
  server.stdout.on("data", (d) => { serverLog += d; });
  server.stderr.on("data", (d) => { serverLog += d; });
  const url = `http://localhost:${port}/`;
  let up = false;
  for (let i = 0; i < 40; i++) {
    await sleep(500);
    try { const r = await fetch(url); if (r.ok) { up = true; break; } } catch { /* 没起来 */ }
    if (server.exitCode !== null) break;
  }
  if (!up) { console.log(`✗ dev server 未起：${serverLog.slice(-200)}`); process.exit(1); }
  console.log(`✓ dev server ${url}`);

  const or = await ab(["open", url]);
  if (or.code !== 0) { console.log(`✗ 页面打开失败：${(or.err || or.out).slice(-200)}`); process.exit(1); }
  await ab(["set", "viewport", "1920", "1080"]);
  await ab(["eval", "--stdin"], { input: `document.documentElement.style.overflow='hidden'; 'ok'` });

  const srt = readFileSync(srtPath, "utf8");
  const ov = ovPath && existsSync(ovPath) ? readFileSync(ovPath, "utf8") : "";
  const fr = await ab(["eval", "--stdin"], {
    input: `
      document.getElementById('srt-input').value = ${JSON.stringify(srt)};
      document.getElementById('override-input').value = ${JSON.stringify(ov)};
      document.getElementById('btn-load').click();
      'clicked';
    `,
  });
  if (fr.code !== 0) { console.log("✗ 载入失败"); process.exit(1); }
  await sleep(2500);

  const st = parseJson((await ab(["eval", "--stdin"], {
    input: `JSON.stringify({ has: !!window.__stage, dur: window.__stage ? window.__stage.duration : 0 })`,
  })).out);
  if (!st?.has || !st.dur) { console.log("✗ 舞台未构建"); process.exit(1); }
  console.log(`✓ 舞台构建 duration=${st.dur}s`);

  // ── probe：量布局，决定裁切策略 ──
  const probe = parseJson((await ab(["eval", "--stdin"], {
    input: `(() => {
      const c = document.querySelector('canvas');
      const svg = document.querySelector('svg');
      const r = c ? c.getBoundingClientRect() : null;
      const rs = svg ? svg.getBoundingClientRect() : null;
      return JSON.stringify({
        dpr: window.devicePixelRatio,
        inner: [window.innerWidth, window.innerHeight],
        doc: [document.documentElement.scrollWidth, document.documentElement.scrollHeight],
        canvasAttr: c ? [c.width, c.height] : null,
        canvasRect: r ? [r.x, r.y, r.width, r.height] : null,
        svgRect: rs ? [rs.x, rs.y, rs.width, rs.height] : null,
        bodyChildren: [...document.body.children].map(el => el.tagName + '.' + (el.className || '') + ' [' + Math.round(el.getBoundingClientRect().width) + 'x' + Math.round(el.getBoundingClientRect().height) + ']').slice(0, 12),
      });
    })()`,
  })).out);
  console.log("PROBE:", JSON.stringify(probe, null, 1));
  if (probeOnly) process.exit(0);

  // ── 逐帧：seek → 隐藏 canvas → 截图（浏览器原生渲染 DOM SVG）──
  // 注：__stage.seek 内部同步 tl.time()，GSAP 直接改 DOM transform/opacity，
  // 不需要等 rAF（qa-frames 注释里的 rAF 坑只影响「往 canvas 画」的路径）。
  console.log(`逐帧 ${frames} 帧（from frame ${fromFrame}）→ ${shotsDir}`);
  for (let f = fromFrame; f < fromFrame + frames; f++) {
    const t = f / 30;
    const sk = await ab(["eval", "--stdin"], { input: `(() => { window.__stage.pause(); window.__stage.seek(${t}); window.__stage.setAutoRender(false); return 'seeked ${t}'; })()` });
    if (sk.code !== 0) { console.log(`✗ frame ${f} seek 失败`); process.exit(1); }
    const sh = await ab(["screenshot", join(shotsDir, `dom-${String(f).padStart(4, "0")}.png`)]);
    if (sh.code !== 0) { console.log(`✗ frame ${f} 截图失败：${(sh.err || sh.out).slice(-150)}`); process.exit(1); }
    if (f % 30 === 0) console.log(`  frame ${f} (t=${t.toFixed(2)}s)`);
  }
  console.log(`✓ ${frames} 帧 DOM 截图完成`);
} catch (e) {
  console.log(`✗ 异常：${(e?.stack || String(e)).slice(-300)}`);
  process.exitCode = 1;
} finally {
  if (server) { try { server.kill(); } catch { /* 已退出 */ } }
}
