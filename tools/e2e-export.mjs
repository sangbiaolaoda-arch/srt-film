#!/usr/bin/env node
// 端到端验收 —— 贴入 SRT 到拿到 MP4 的完整链路，全程走真实 UI 与页面调试钩子。
//
// 它验证的是单元测试与印相都覆盖不到的那一段：
//   vite dev server → 无头浏览器打开页面 → 填 SRT/覆写 → 点「载入并规划」
//   → 门禁通过 → 舞台建起 → 播放推进 → 导出 MP4 → 落盘 → ffprobe 验帧数/时长/分辨率。
//
// 长片稳定性（关键）：无头 tab 在单段长导出中会失联崩溃，所以把整条时间线切成
// 若干 ≤seg 秒的小段，每段短到不会崩；每段导出后由页面用 fetch 把 MP4 Blob 流式
// POST 给本工具自起的本机接收端（直落盘，不走 agent-browser 的 base64 桥——25MB+
// 会在回传时撑爆桥接或让 tab 失联），最后 ffmpeg concat 拼接。
//
// 用法：
//   node tools/e2e-export.mjs [--srt <路径>] [--ov <路径>] [--port 5199] [--out <mp4>]
//                              [--w 1280 --h 720] [--fps 24]     // 导出档位
//                              [--seg <秒>]                       // 长片分段（默认 45）
// 退出码：任一环节失败 → 1；全部通过 → 0。

import { spawn } from "node:child_process";
import { appendFileSync, closeSync, existsSync, mkdirSync, openSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUTDIR = resolve(ROOT, ".tmp/e2e");
const LOG = join(OUTDIR, "e2e.log");
const FFMPEG = "E:/WorkBuddy/tools/ffmpeg.exe";

/* ------------------------------ agent-browser ------------------------------ */
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
    try {
      fd = openSync(LOG, "a");
    } catch {
      return res({ code: -1, out: "", err: "无法打开日志" });
    }
    const from = statSync(LOG).size;
    const finish = (code, extra = {}) => {
      try { closeSync(fd); } catch { /* 已关 */ }
      let out = "";
      try {
        out = readFileSync(LOG).subarray(from).toString("utf8");
      } catch { /* 读不到 */ }
      res({ code, out, err: "", ...extra });
    };
    let p;
    try {
      p = spawn(cmd, args, { stdio: ["pipe", fd, fd] });
    } catch (e) {
      return finish(-1, { err: String(e?.message || e) });
    }
    p.on("error", (e) => finish(-1, { err: String(e?.message || e) }));
    p.on("close", (code) => finish(code));
    if (input !== undefined && p.stdin.writable) p.stdin.write(input);
    p.stdin.end();
  });
}

const AB = resolveAgentBrowser();
const ab = (args, opts = {}) => run(AB.cmd, [...AB.pre, ...args], opts);

/** agent-browser 的输出会被再包一层 JSON 字面量，反复解到不是字符串为止。 */
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

/* ----------------------- 本地接收端：页面 POST MP4 直落盘 ----------------------- */
// 接收端在空闲端口起一个 HTTP 服务：OPTIONS 预检放行、POST 把请求体整段写盘、返回 200。
// 这样 25MB+ 的 MP4 由页面流式推过来，不经过 agent-browser 的 base64 桥（那才是崩溃源）。
function startReceiver() {
  return new Promise((resolveRes, reject) => {
    const server = createServer((req, res) => {
      if (req.method === "OPTIONS") {
        res.writeHead(204, {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "content-type",
        });
        res.end();
        return;
      }
      if (req.method === "POST") {
        const target = req.url && req.url.includes("?")
          ? new URL(req.url, "http://x").searchParams.get("to")
          : null;
        // 接收端只对我们自己起的 127.0.0.1 服务负责，?to= 是工具自己拼的 segPath，
        // 直接写，不要先验 existsSync —— 否则「干净首跑」时文件还不存在，整段字节被丢弃变 0 字节。
        const dest = target || null;
        const chunks = [];
        req.on("data", (c) => chunks.push(c));
        req.on("end", () => {
          if (dest) { try { mkdirSync(dirname(dest), { recursive: true }); writeFileSync(dest, Buffer.concat(chunks)); } catch { /* 忽略 */ } }
          res.writeHead(200, { "Access-Control-Allow-Origin": "*" });
          res.end();
        });
        req.on("error", () => { try { res.writeHead(200); } catch { /* 已写 */ } res.end(); });
        return;
      }
      res.writeHead(405);
      res.end();
    });
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const port = server.address().port;
      resolveRes({ server, url: `http://127.0.0.1:${port}/upload` });
    });
  });
}

/* -------------------------------- 参数 ---------------------------------- */
const argv = process.argv.slice(2);
const argOf = (name, dft) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : dft;
};
const srtPath = resolve(ROOT, argOf("--srt", "examples/08-forgetting-20s.srt"));
const ovPath = argv.includes("--ov") ? resolve(ROOT, argOf("--ov", "")) : null;
const port = argOf("--port", "5199");
const outMp4 = resolve(ROOT, argOf("--out", join(OUTDIR, "e2e.mp4")));
const expW = Number(argOf("--w", "0")) || null;
const expH = Number(argOf("--h", "0")) || null;
const expFps = Number(argOf("--fps", "0")) || null;
const expSettings = JSON.stringify(
  Object.fromEntries(
    Object.entries({ width: expW, height: expH, fps: expFps }).filter(([, v]) => v !== null),
  ),
);
const segSec = Number(argOf("--seg", "45")) || 45;

const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok, detail });
  console.log(`${ok ? "✓" : "✗"} ${name}${detail ? ` —— ${detail}` : ""}`);
};

/* --------------------------------- 主流程 -------------------------------- */
mkdirSync(OUTDIR, { recursive: true });
mkdirSync(dirname(outMp4), { recursive: true });
appendFileSync(LOG, `\n===== e2e ${new Date().toISOString()} srt=${srtPath} seg=${segSec} =====\n`);

let server = null;
let receiver = null;
try {
  // 0. 本机接收端（页面 POST 落盘用）
  receiver = await startReceiver();
  const recvUrl = receiver.url;

  // 1. 起 dev server（与用户 npm run dev 同一条通路，不碰 dist）
  server = spawn(process.execPath, [join(ROOT, "node_modules/vite/bin/vite.js"), "--port", port], {
    cwd: ROOT,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let serverLog = "";
  server.stdout.on("data", (d) => { serverLog += d; });
  server.stderr.on("data", (d) => { serverLog += d; });

  const url = `http://localhost:${port}/`;
  let up = false;
  for (let i = 0; i < 40; i++) {
    await sleep(500);
    try {
      const r = await fetch(url);
      if (r.ok) { up = true; break; }
    } catch { /* 还没起来 */ }
    if (server.exitCode !== null) break;
  }
  check("dev server 起来", up, up ? url : serverLog.slice(-300));
  if (!up) process.exit(1);

  // 2. 无头浏览器打开页面
  const or = await ab(["open", url]);
  check("页面打开", or.code === 0, or.code === 0 ? "" : (or.err || or.out).slice(-300));
  if (or.code !== 0) process.exit(1);
  await ab(["set", "viewport", "1600", "900"]);

  // 3. 填 SRT + 覆写，点「载入并规划」
  const srt = readFileSync(srtPath, "utf8");
  const ov = ovPath && existsSync(ovPath) ? readFileSync(ovPath, "utf8") : "";
  const fillJs = `
    document.getElementById('srt-input').value = ${JSON.stringify(srt)};
    document.getElementById('override-input').value = ${JSON.stringify(ov)};
    document.getElementById('btn-load').click();
    'clicked';
  `;
  const fr = await ab(["eval", "--stdin"], { input: fillJs });
  check("载入并规划已点击", fr.code === 0);
  await sleep(2500);

  // 4. 门禁报告 + 舞台钩子
  const gateJs = `
    (() => {
      const items = [...document.querySelectorAll('#gate-report li')].map(li => li.textContent);
      const st = window.__stage;
      return JSON.stringify({
        gate: items,
        gateHidden: document.getElementById('gate-report').hidden,
        hasStage: !!st,
        shots: st ? st.shots ? st.shots.length : -1 : -1,
        duration: st ? st.duration : 0,
      });
    })()
  `;
  const gr = parseJson((await ab(["eval", "--stdin"], { input: gateJs })).out);
  const gateText = gr?.gate?.join(" | ") ?? "(无)";
  const gateOk = !!gr?.gate?.some((t) => t.includes("门禁通过"));
  check("门禁通过（页面报告）", gateOk, gateText.slice(0, 160));
  check("舞台已构建", !!gr?.hasStage && gr.duration > 0, `duration=${gr?.duration ?? "?"}`);
  if (!gateOk || !gr?.hasStage) process.exit(1);

  // 5. 播放推进
  await ab(["eval", "--stdin"], { input: `document.getElementById('btn-play').click(); 'play'` });
  await sleep(2000);
  const t1 = parseJson((await ab(["eval", "--stdin"], {
    input: `JSON.stringify({ t: window.__stage.time(), playing: !!window.__stage.tl && !window.__stage.tl.paused() })`,
  })).out);
  check("播放推进", (t1?.t ?? 0) > 0.5, `t=${t1?.t?.toFixed?.(2) ?? t1?.t}s`);
  await ab(["eval", "--stdin"], { input: `document.getElementById('btn-play').click(); 'pause'` });

  // 6. 分段导出（帧序列模式，绕开 WebCodecs 的 headless 崩溃）→ ffmpeg 逐段编码 → concat
  const fullDur = gr.duration;
  const segs = [];
  for (let s = 0; s < fullDur - 1e-6; s += segSec) {
    segs.push({ start: s, dur: Math.min(segSec, fullDur - s) });
  }
  if (segs.length > 1) console.log(`· 长片分段导出（帧序列模式）：${segs.length} 段 × ≤${segSec}s —— 逐帧 POST 成 JPEG，ffmpeg 后编码，避开无头 WebCodecs 崩溃`);

  const segPaths = [];
  for (let i = 0; i < segs.length; i++) {
    const seg = segs[i];
    const segPath = join(OUTDIR, `seg-${i}.mp4`);
    const framesDir = join(OUTDIR, `seg-${i}`);
    if (existsSync(segPath)) { try { writeFileSync(segPath, ""); } catch { /* 清空 */ } }
    if (existsSync(framesDir)) { try { require("node:fs").rmSync(framesDir, { recursive: true, force: true }); } catch { /* 已清 */ } }
    const tag = segs.length > 1 ? `（段 ${i + 1}/${segs.length}，t=${seg.start.toFixed(1)}~${(seg.start + seg.dur).toFixed(1)}s）` : "";
    // 页面内导出走「帧序列模式」：exportMp4 逐帧把画布 POST 成 JPEG 给接收端（framesDir 下），
    // 最后再 ffmpeg 把该段 JPEG 序列编码成 MP4。渲染路径与播放完全一致。
    const startJs = `
      window.__exportDone = false;
      window.__exportErr = null;
      window.__exportProgress = null;
      window.__exportMp4Post(window.__stage, ${JSON.stringify(recvUrl)}, ${seg.dur}, Object.assign(${expSettings}, {
        startTime: ${seg.start},
        framesPostUrl: ${JSON.stringify(recvUrl)},
        framesDir: ${JSON.stringify(framesDir.replace(/\\\\/g, "/"))},
        frameQuality: 0.92,
        onProgress: (p) => { window.__exportProgress = p; },
      })).then((status) => {
        window.__exportStatus = status;
        window.__exportDone = true;
      }).catch((e) => {
        window.__exportErr = (window.__exportMp4Err ? window.__exportMp4Err(e) : String((e && e.message) || e));
        window.__exportDone = true;
      });
      'started';
    `;
    const sr = await ab(["eval", "--stdin"], { input: startJs });
    check(`导出已发起${tag}`, sr.code === 0);

    // 导出期进度观测（只在页面内读标量，不回拉任何字节）
    const deadline = Date.now() + 600_000;
    let exp = null;
    let lastFrame = -1;
    while (Date.now() < deadline) {
      await sleep(5000);
      const st = parseJson((await ab(["eval", "--stdin"], {
        input: `JSON.stringify({ done: !!window.__exportDone, err: window.__exportErr, status: window.__exportStatus, f: window.__exportProgress ? window.__exportProgress.frame : -1, total: window.__exportProgress ? window.__exportProgress.total : -1, heap: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : -1 })`,
      })).out);
      if (st && st.f !== lastFrame) { console.log(`  ·${tag} 帧 POST 中 f=${st.f}/${st.total} heap=${st.heap}MB`); lastFrame = st.f; }
      if (st?.done) { exp = st.err ? { err: st.err } : { status: st.status }; break; }
    }
    check(`帧序列 POST 完成${tag}`, !!exp && !exp.err,
      exp ? (exp.err ? exp.err : "OK") : "轮询超时（10 分钟）");
    if (!exp || exp.err) process.exit(1);

    // 帧落盘核验：framesDir 下应有若干张 jpg
    let dirFrames = 0;
    try { dirFrames = readdirSync(framesDir).filter((n) => n.endsWith(".jpg")).length; } catch { dirFrames = 0; }
    check(`段 ${i + 1} 帧落盘`, dirFrames > 1, `${dirFrames} 张 JPEG`);
    if (dirFrames < 1) process.exit(1);

    // ffmpeg 把该段 JPEG 序列编码成 H.264/MP4
    if (!existsSync(FFMPEG)) {
      check(`ffmpeg 编码段 ${i + 1}`, false, `找不到 ffmpeg：${FFMPEG}`);
      process.exit(1);
    }
    const er = await run(FFMPEG, [
      "-y", "-framerate", String(expFps || 24), "-start_number", "0",
      "-i", join(framesDir, "frame-%06d.jpg"),
      "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "20", "-r", String(expFps || 24),
      "-movflags", "+faststart", segPath,
    ]);
    let sz = 0;
    try { sz = statSync(segPath).size; } catch { sz = 0; }
    check(`ffmpeg 编码段 ${i + 1}`, er.code === 0 && sz > 1000,
      er.code === 0 ? `${(sz / 1e6).toFixed(2)}MB` : (er.err || er.out).slice(-200));
    if (er.code !== 0 || sz < 1000) process.exit(1);

    // 帧序列是临时产物，编码完即清，省磁盘
    try { rmSync(framesDir, { recursive: true, force: true }); } catch { /* 已清 */ }
    segPaths.push(segPath);
  }

  // 拼接（单段则直接作为成品）
  if (segPaths.length === 1) {
    writeFileSync(outMp4, readFileSync(segPaths[0]));
  } else {
    const listPath = join(OUTDIR, "seglist.txt");
    writeFileSync(listPath, segPaths.map((p) => `file '${p.replace(/\\/g, "/")}'`).join("\n") + "\n");
    const cr = await run(FFMPEG, ["-y", "-f", "concat", "-safe", "0", "-i", listPath, "-c", "copy", outMp4]);
    check("分段拼接（concat copy）", cr.code === 0 && existsSync(outMp4),
      cr.code === 0 ? `${segPaths.length} 段拼接完成` : (cr.err || cr.out).slice(-200));
    if (cr.code !== 0) process.exit(1);
  }
  const stat = statSync(outMp4);
  check("MP4 落盘", stat.size > 1000, `${outMp4}（${(stat.size / 1e6).toFixed(2)}MB）`);

  // 7. ffprobe 验证容器/帧数/时长/分辨率
  if (!existsSync(FFMPEG)) {
    check("ffprobe 验证", false, "找不到 ffmpeg：E:/WorkBuddy/tools/ffmpeg.exe");
  } else {
    const pr = await run(FFMPEG, [
      "-hide_banner", "-i", outMp4,
      "-vf", "signalstats,metadata=print:key=lavfi.signalstats.YAVG",
      "-f", "null", "-",
    ]);
    const txt = pr.out + pr.err;
    const dur = txt.match(/Duration:\s*(\d+):(\d+):([\d.]+)/);
    const frames = (txt.match(/frame=\s*(\d+)/g) || []).pop();
    const res = txt.match(/, (\d+x\d+)[,\s]/);
    const yavgs = [...txt.matchAll(/YAVG=([\d.]+)/g)].map((m) => Number(m[1]));
    const black = yavgs.filter((y) => y <= 16.5).length;
    const white = yavgs.filter((y) => y >= 234).length;
    check("ffprobe 容器可读", pr.code === 0 && !!dur, dur ? `${dur[1]}h${dur[2]}m${dur[3]}s ${res?.[1] ?? "?"} ${frames ?? "?"}` : txt.slice(-200));
    check("帧数符合预期（≈时长×fps）", !!frames && Number(frames.replace("frame=", "")) > 100, frames ?? "?");
    if (expW && expH) {
      check("ffprobe 分辨率 = 请求档位", res?.[1] === `${expW}x${expH}`, `${res?.[1] ?? "?"}（请求 ${expW}x${expH}）`);
    }
    check("无全黑帧", black === 0, `YAVG≤16.5 的帧 ${black}/${yavgs.length}`);
    check("无爆白帧", white === 0, `YAVG≥234 的帧 ${white}/${yavgs.length}`);
  }
} catch (e) {
  check("端到端执行", false, (e?.stack || String(e)).slice(-400));
} finally {
  if (server) { try { server.kill(); } catch { /* 已退出 */ } }
  if (receiver?.server) { try { receiver.server.close(); } catch { /* 已关 */ } }
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} 项通过`);
process.exit(failed.length > 0 ? 1 : 0);
