#!/usr/bin/env node
// render-mp4.mjs — v2 自包含静态站的出片驱动（复用 srt-film 已验证的帧序列通路）
//
// 链路：本机静态服务（index.html + ES modules）→ agent-browser 无头打开
//   → 页面内 __exportMp4Post 逐帧 seek/序列化/光栅/JPEG POST → 本机接收端直落盘
//   → ffmpeg 逐段编码（libx264/yuv420p/crf20）→ concat 拼接 → ffprobe 验证
//   → 生成接触印相（contact sheet）供视觉验收。
//
// 用法：node tools/render-mp4.mjs [--fps 24] [--seg 40] [--out <mp4>] [--keep]

import { spawn } from "node:child_process";
import { appendFileSync, closeSync, existsSync, mkdirSync, openSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");          // .../endowment-v2
// 输出与 ffmpeg 路径均可用环境变量覆盖（FFMPEG_BIN / OUT_MP4 / OUT_SHEET）
const FFMPEG = process.env.FFMPEG_BIN || "ffmpeg";
const OUT_MP4 = process.env.OUT_MP4 || join(ROOT, "out", "endowment_effect_v2.mp4");
const SHEET = process.env.OUT_SHEET || join(ROOT, "out", "contact_sheet_v2.jpg");
const LOG = join(ROOT, "render.log");

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
    try { fd = openSync(LOG, "a"); } catch { return res({ code: -1, out: "", err: "无法打开日志" }); }
    const from = statSync(LOG).size;
    const finish = (code, extra = {}) => {
      try { closeSync(fd); } catch { /* 已关 */ }
      let out = "";
      try { out = readFileSync(LOG).subarray(from).toString("utf8"); } catch { /* 读不到 */ }
      res({ code, out, err: "", ...extra });
    };
    let p;
    try { p = spawn(cmd, args, { stdio: ["pipe", fd, fd] }); }
    catch (e) { return finish(-1, { err: String(e?.message || e) }); }
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
  for (let i = lines.length - 1; i >= 0; i--) { const t = tryParse(lines[i]); if (t !== undefined) return t; }
  return undefined;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ------------------------------- 两个本机服务 ------------------------------ */
// 1) 静态服务：供给页面（ES modules 必须正确的 JS MIME）
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".json": "application/json", ".min.js": "text/javascript; charset=utf-8" };
function startStatic() {
  return new Promise((res, rej) => {
    const server = createServer((req, res) => {
      const urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
      let fp = resolve(ROOT, "." + (urlPath === "/" ? "/index.html" : urlPath));
      if (!fp.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
      try {
        const data = readFileSync(fp);
        const ext = extname(fp).toLowerCase();
        res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
        res.end(data);
      } catch { res.writeHead(404); res.end("not found"); }
    });
    server.on("error", rej);
    server.listen(0, "127.0.0.1", () => res({ server, url: `http://127.0.0.1:${server.address().port}/` }));
  });
}
// 2) 接收端：页面 POST JPEG 帧直落盘（?to= 绝对路径）
function startReceiver() {
  return new Promise((res, rej) => {
    const server = createServer((req, res) => {
      if (req.method === "OPTIONS") {
        res.writeHead(204, { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "content-type" });
        res.end(); return;
      }
      if (req.method === "POST") {
        const target = req.url && req.url.includes("?") ? new URL(req.url, "http://x").searchParams.get("to") : null;
        const chunks = [];
        req.on("data", (c) => chunks.push(c));
        req.on("end", () => {
          if (target) { try { mkdirSync(dirname(target), { recursive: true }); writeFileSync(target, Buffer.concat(chunks)); } catch { /* 忽略 */ } }
          res.writeHead(200, { "Access-Control-Allow-Origin": "*" }); res.end();
        });
        req.on("error", () => { try { res.writeHead(200); } catch { /* 已写 */ } res.end(); });
        return;
      }
      res.writeHead(405); res.end();
    });
    server.on("error", rej);
    server.listen(0, "127.0.0.1", () => res({ server, url: `http://127.0.0.1:${server.address().port}/upload` }));
  });
}

/* --------------------------------- 参数 ---------------------------------- */
const argv = process.argv.slice(2);
const argOf = (name, dft) => { const i = argv.indexOf(name); return i >= 0 && argv[i + 1] ? argv[i + 1] : dft; };
const FPS = Number(argOf("--fps", "24"));
const SEG = Number(argOf("--seg", "40"));
const OUT = resolve(argOf("--out", OUT_MP4));
const KEEP = argv.includes("--keep");

const results = [];
const check = (name, ok, detail = "") => { results.push({ name, ok }); console.log(`${ok ? "✓" : "✗"} ${name}${detail ? ` —— ${detail}` : ""}`); };

appendFileSync(LOG, `\n===== render ${new Date().toISOString()} fps=${FPS} seg=${SEG} =====\n`);

let staticS = null, recvS = null;
try {
  // 1. 两个服务
  const s = await startStatic(); staticS = s.server;
  const r = await startReceiver(); recvS = r.server;
  check("本机服务就绪", true, `static=${s.url} recv=${r.url}`);

  // 2. 打开页面
  const or = await ab(["open", s.url]);
  check("页面打开", or.code === 0, or.code === 0 ? "" : (or.err || or.out).slice(-300));
  if (or.code !== 0) process.exit(1);
  await ab(["set", "viewport", "1600", "900"]);

  // 3. 等 app 就绪
  let ready = null;
  for (let i = 0; i < 20; i++) {
    await sleep(500);
    ready = parseJson((await ab(["eval", "--stdin"], { input: `JSON.stringify({ready: !!window.__ready, dur: window.__duration || 0})` })).out);
    if (ready?.ready && ready.dur > 0) break;
  }
  check("app 就绪（时间轴构建完成）", !!ready?.ready && ready.dur > 0, `duration=${ready?.dur ?? "?"}s`);
  if (!ready?.ready) process.exit(1);
  const fullDur = ready.dur;

  // 4. 分段导出（帧序列 POST）→ ffmpeg 逐段编码
  // 每轮用独立时间戳目录，node 内不做任何删除（沙箱 safe-delete shim 会拦截 rmSync）
  mkdirSync(join(ROOT, "frames"), { recursive: true });
  mkdirSync(dirname(OUT), { recursive: true });
  const RUN = join(ROOT, "frames", `run-${Date.now()}`);
  mkdirSync(RUN, { recursive: true });
  const segs = [];
  for (let st = 0; st < fullDur - 1e-6; st += SEG) segs.push({ start: st, dur: Math.min(SEG, fullDur - st) });
  console.log(`· 分段导出：${segs.length} 段 × ≤${SEG}s @ ${FPS}fps → ${RUN}`);

  const segPaths = [];
  for (let i = 0; i < segs.length; i++) {
    const seg = segs[i];
    const segPath = join(RUN, `seg-${i}.mp4`);
    const framesDir = join(RUN, `seg-${i}`).replace(/\\/g, "/");
    const tag = `（段 ${i + 1}/${segs.length}，t=${seg.start.toFixed(1)}~${(seg.start + seg.dur).toFixed(1)}s）`;

    const startJs = `
      window.__exportMp4Post({
        fps: ${FPS},
        fromMs: ${Math.round(seg.start * 1000)},
        toMs: ${Math.round((seg.start + seg.dur) * 1000)},
        quality: 0.92,
        framesDir: ${JSON.stringify(framesDir)},
        recv: ${JSON.stringify(r.url)}
      }).then((st) => { window.__exportStatus = st; })
        .catch((e) => { window.__exportErr = String((e && e.message) || e); window.__exportDone = true; });
      'started';
    `;
    const sr = await ab(["eval", "--stdin"], { input: startJs });
    check(`导出已发起${tag}`, sr.code === 0);
    if (sr.code !== 0) process.exit(1);

    const deadline = Date.now() + 900_000;
    let exp = null, lastF = -1;
    while (Date.now() < deadline) {
      await sleep(5000);
      const st = parseJson((await ab(["eval", "--stdin"], {
        input: `JSON.stringify({ done: !!window.__exportDone, err: window.__exportErr, f: window.__exportProgress ? window.__exportProgress.frame : -1, total: window.__exportProgress ? window.__exportProgress.total : -1 })`,
      })).out);
      if (st && st.f !== lastF) { console.log(`  ·${tag} 帧 ${st.f}/${st.total}`); lastF = st.f; }
      if (st?.done) { exp = st.err ? { err: st.err } : { ok: true }; break; }
    }
    check(`帧序列 POST 完成${tag}`, !!exp && !exp.err, exp ? (exp.err || "OK") : "轮询超时（15 分钟）");
    if (!exp || exp.err) process.exit(1);

    let nFrames = 0;
    try { nFrames = readdirSync(framesDir).filter((n) => n.endsWith(".jpg")).length; } catch { nFrames = 0; }
    check(`段 ${i + 1} 帧落盘`, nFrames > 1, `${nFrames} 张 JPEG`);
    if (nFrames < 1) process.exit(1);

    const er = await run(FFMPEG, [
      "-y", "-framerate", String(FPS), "-start_number", "0",
      "-i", join(framesDir, "frame-%06d.jpg"),
      "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "20", "-r", String(FPS),
      "-movflags", "+faststart", segPath,
    ]);
    let sz = 0; try { sz = statSync(segPath).size; } catch { sz = 0; }
    check(`ffmpeg 编码段 ${i + 1}`, er.code === 0 && sz > 1000, er.code === 0 ? `${(sz / 1e6).toFixed(2)}MB` : (er.err || er.out).slice(-200));
    if (er.code !== 0 || sz < 1000) process.exit(1);

    if (!KEEP) console.log(`  · 帧目录保留在 ${framesDir}（如需清理请用脚本外部工具）`);
    segPaths.push(segPath);
  }

  // 5. 拼接
  if (segPaths.length === 1) writeFileSync(OUT, readFileSync(segPaths[0]));
  else {
    const listPath = join(RUN, "seglist.txt");
    writeFileSync(listPath, segPaths.map((p) => `file '${p.replace(/\\/g, "/")}'`).join("\n") + "\n");
    const cr = await run(FFMPEG, ["-y", "-f", "concat", "-safe", "0", "-i", listPath, "-c", "copy", OUT]);
    check("分段拼接", cr.code === 0 && existsSync(OUT), cr.code === 0 ? `${segPaths.length} 段` : (cr.err || cr.out).slice(-200));
    if (cr.code !== 0) process.exit(1);
  }
  const stat = statSync(OUT);
  check("MP4 落盘", stat.size > 1000, `${OUT}（${(stat.size / 1e6).toFixed(2)}MB）`);

  // 6. 验证：时长 / 分辨率 / 无全黑帧
  const pr = await run(FFMPEG, ["-hide_banner", "-i", OUT, "-vf", "signalstats,metadata=print:key=lavfi.signalstats.YAVG", "-f", "null", "-"]);
  const txt = pr.out + pr.err;
  const dur = txt.match(/Duration:\s*(\d+):(\d+):([\d.]+)/);
  const res = txt.match(/, (\d+x\d+)[,\s]/);
  const yavgs = [...txt.matchAll(/YAVG=([\d.]+)/g)].map((m) => Number(m[1]));
  const black = yavgs.filter((y) => y <= 16.5).length;
  check("ffprobe 容器可读", pr.code === 0 && !!dur, dur ? `${dur[1]}h${dur[2]}m${dur[3]}s ${res?.[1] ?? "?"}` : txt.slice(-200));
  check("分辨率 1280x720", res?.[1] === "1280x720", res?.[1] ?? "?");
  check("时长 ≈ 253s", !!dur && Math.abs((+dur[1]) * 3600 + (+dur[2]) * 60 + (+dur[3]) - 253.5) < 3, dur ? dur[3] : "?");
  check("无全黑帧", black === 0, `YAVG≤16.5 帧 ${black}/${yavgs.length}`);

  // 7. 接触印相（12 帧拼图，供视觉验收）
  const cr2 = await run(FFMPEG, ["-y", "-i", OUT, "-vf", "fps=12/253,scale=426:-1,tile=4x3", "-frames:v", "1", "-q:v", "3", SHEET]);
  check("接触印相生成", cr2.code === 0 && existsSync(SHEET), SHEET);

} catch (e) {
  check("执行", false, (e?.stack || String(e)).slice(-400));
} finally {
  if (staticS) { try { staticS.close(); } catch { /* 已关 */ } }
  if (recvS) { try { recvS.close(); } catch { /* 已关 */ } }
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} 项通过`);
process.exit(failed.length > 0 ? 1 : 0);
