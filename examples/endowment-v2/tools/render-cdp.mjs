#!/usr/bin/env node
// render-cdp.mjs — endowment-v2 出片驱动（不依赖 agent-browser：直接走本机 Chrome CDP）
//
// 链路：本机静态服务（index.html + ES modules）→ CDP 打开页面 → 逐段调用页面内
//   __exportMp4Post（seek → 序列化 SVG → 光栅 → JPEG POST）→ 本机接收端落盘
//   → ffmpeg 逐段编码（libx264/yuv420p/crf 20）→ concat → ffprobe 验证 → 接触印相。
//
// 为什么不再用 agent-browser：本机没装它，出片通路会断在第一步；
// CDP 是 Chrome 自带协议，零新增依赖（node 24 自带 WebSocket）。
//
// 用法：
//   node tools/render-cdp.mjs [--fps 24] [--seg 40] [--out <mp4>] [--sheet <jpg>] [--from 0] [--to 253.466]
//
// 约定（docs/conventions.md #3）：本脚本内不做删除；每轮渲染用时间戳帧目录。

import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync, openSync, closeSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { run } from "../../../tools/cdp.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FFMPEG = process.env.FFMPEG_BIN || "ffmpeg";
const FFPROBE = process.env.FFPROBE_BIN || "ffprobe";
const OUT_MP4 = process.env.OUT_MP4 || join(ROOT, "out", "endowment_effect_v3.mp4");
const SHEET = process.env.OUT_SHEET || join(ROOT, "out", "contact_sheet_v3.jpg");
const LOG = join(ROOT, "render.log");

const argv = process.argv.slice(2);
const argOf = (n, d) => { const i = argv.indexOf(n); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const FPS = Number(argOf("--fps", "24"));
const SEG = Number(argOf("--seg", "40"));
const OUT = resolve(argOf("--out", OUT_MP4));
const SHEET_OUT = resolve(argOf("--sheet", SHEET));
const FROM = Number(argOf("--from", "0"));
const TO = Number(argOf("--to", "0")); // 0 = 全片

const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".json": "application/json" };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok });
  console.log(`${ok ? "✓" : "✗"} ${name}${detail ? ` —— ${detail}` : ""}`);
};

/** 跑子进程并把 stdout+stderr 收进日志文件（Windows 上管道更容易被沙箱拦）。 */
function runProc(cmd, args) {
  return new Promise((res) => {
    let fd;
    try { fd = openSync(LOG, "a"); } catch { return res({ code: -1, out: "", err: "无法打开日志" }); }
    const from = statSync(LOG).size;
    const finish = (code) => {
      try { closeSync(fd); } catch { /* 已关 */ }
      let out = "";
      try { out = readFileSync(LOG).subarray(from).toString("utf8"); } catch { /* 读不到 */ }
      res({ code, out });
    };
    let p;
    try { p = spawn(cmd, args, { stdio: ["ignore", fd, fd] }); }
    catch (e) { return finish(-1); }
    p.on("error", () => finish(-1));
    p.on("close", (code) => finish(code));
  });
}

function startStatic() {
  return new Promise((res, rej) => {
    const s = createServer((req, rq) => {
      const p = decodeURIComponent((req.url || "/").split("?")[0]);
      const fp = resolve(ROOT, "." + (p === "/" ? "/index.html" : p));
      if (!fp.startsWith(ROOT)) { rq.writeHead(403); rq.end(); return; }
      try {
        const data = readFileSync(fp);
        rq.writeHead(200, { "Content-Type": MIME[extname(fp).toLowerCase()] || "application/octet-stream" });
        rq.end(data);
      } catch { rq.writeHead(404); rq.end("not found"); }
    });
    s.on("error", rej);
    s.listen(0, "127.0.0.1", () => res({ s, url: `http://127.0.0.1:${s.address().port}/` }));
  });
}

function startReceiver() {
  return new Promise((res, rej) => {
    const s = createServer((req, rq) => {
      if (req.method === "OPTIONS") {
        rq.writeHead(204, { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "content-type" });
        rq.end(); return;
      }
      if (req.method !== "POST") { rq.writeHead(405); rq.end(); return; }
      const target = new URL(req.url || "/", "http://x").searchParams.get("to");
      const chunks = [];
      req.on("data", (c) => chunks.push(c));
      req.on("end", () => {
        if (target) { try { mkdirSync(dirname(target), { recursive: true }); writeFileSync(target, Buffer.concat(chunks)); } catch { /* 忽略 */ } }
        rq.writeHead(200, { "Access-Control-Allow-Origin": "*" }); rq.end();
      });
      req.on("error", () => { try { rq.writeHead(200); } catch { /* 已写 */ } rq.end(); });
    });
    s.on("error", rej);
    s.listen(0, "127.0.0.1", () => res({ s, url: `http://127.0.0.1:${s.address().port}/upload` }));
  });
}

let staticS = null, recvS = null;
try {
  mkdirSync(join(ROOT, "out"), { recursive: true });

  const st = await startStatic(); staticS = st.s;
  const rc = await startReceiver(); recvS = rc.s;
  check("本机服务就绪", true, `static=${st.url} recv=${rc.url}`);

  const RUN = join(ROOT, "frames", `run-${Date.now()}`);
  mkdirSync(RUN, { recursive: true });
  console.log(`· 帧目录：${RUN}`);

  let fullDur = 0;
  const segPaths = [];

  await run(async (b) => {
    await b.open(st.url, 90000);
    const ok = await b.eval("return !!window.__ready;");
    fullDur = await b.eval("return window.__duration || 0;");
    check("页面就绪（时间轴构建完成）", ok && fullDur > 0, `duration=${fullDur}s`);
    if (!ok || !(fullDur > 0)) throw new Error("页面未就绪");

    const from = Math.max(0, FROM);
    const to = TO > 0 ? Math.min(TO, fullDur) : fullDur;
    const segs = [];
    for (let s0 = from; s0 < to - 1e-6; s0 += SEG) segs.push({ start: s0, dur: Math.min(SEG, to - s0) });
    console.log(`· 分段导出：${segs.length} 段 × ≤${SEG}s @ ${FPS}fps`);

    for (let i = 0; i < segs.length; i++) {
      const seg = segs[i];
      const framesDir = join(RUN, `seg-${i}`).replace(/\\/g, "/");
      const tag = `（段 ${i + 1}/${segs.length}，t=${seg.start.toFixed(1)}~${(seg.start + seg.dur).toFixed(1)}s）`;
      const startJs = `
        window.__exportDone = false; window.__exportErr = null; window.__exportProgress = null;
        window.__exportMp4Post({
          fps: ${FPS},
          fromMs: ${Math.round(seg.start * 1000)},
          toMs: ${Math.round((seg.start + seg.dur) * 1000)},
          quality: 0.93,
          framesDir: ${JSON.stringify(framesDir)},
          recv: ${JSON.stringify(rc.url)}
        });
        'started';
      `;
      await b.eval(startJs);
      check(`导出已发起${tag}`, true);

      const deadline = Date.now() + 20 * 60 * 1000;
      let lastF = -1, done = false, err = null;
      while (Date.now() < deadline) {
        await sleep(2500);
        const s = await b.eval("return JSON.stringify({done:!!window.__exportDone,err:window.__exportErr,f:window.__exportProgress?window.__exportProgress.frame:-1,total:window.__exportProgress?window.__exportProgress.total:-1});");
        const o = JSON.parse(s);
        if (o.f !== lastF) { if (o.f % 60 === 0 || o.f === o.total) console.log(`  ·${tag} 帧 ${o.f}/${o.total}`); lastF = o.f; }
        if (o.done) { done = true; err = o.err; break; }
      }
      check(`帧序列 POST 完成${tag}`, done && !err, err || (done ? "OK" : "轮询超时"));
      if (!done || err) throw new Error(err || "导出超时");

      let n = 0;
      try { n = readdirSync(framesDir).filter((f) => f.endsWith(".jpg")).length; } catch { n = 0; }
      check(`段 ${i + 1} 帧落盘`, n > 1, `${n} 张 JPEG`);
      if (n < 1) throw new Error("没有帧落盘");

      const segPath = join(RUN, `seg-${i}.mp4`);
      const er = await runProc(FFMPEG, [
        "-y", "-framerate", String(FPS), "-start_number", "0",
        "-i", join(framesDir, "frame-%06d.jpg"),
        "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "20", "-r", String(FPS),
        "-movflags", "+faststart", segPath,
      ]);
      const sz = (() => { try { return statSync(segPath).size; } catch { return 0; } })();
      check(`ffmpeg 编码段 ${i + 1}`, er.code === 0 && sz > 1000, er.code === 0 ? `${(sz / 1e6).toFixed(2)}MB` : er.out.slice(-200));
      if (er.code !== 0 || sz < 1000) throw new Error("段编码失败");
      segPaths.push(segPath);
    }
  }, { port: 9362 });

  // 拼接
  if (segPaths.length === 1) writeFileSync(OUT, readFileSync(segPaths[0]));
  else {
    const list = join(RUN, "seglist.txt");
    writeFileSync(list, segPaths.map((p) => `file '${p.replace(/\\/g, "/")}'`).join("\n") + "\n");
    const cr = await runProc(FFMPEG, ["-y", "-f", "concat", "-safe", "0", "-i", list, "-c", "copy", OUT]);
    check("分段拼接", cr.code === 0 && existsSync(OUT), cr.code === 0 ? `${segPaths.length} 段` : cr.out.slice(-200));
    if (cr.code !== 0) throw new Error("拼接失败");
  }
  check("MP4 落盘", existsSync(OUT), `${OUT}（${(statSync(OUT).size / 1e6).toFixed(2)}MB）`);

  // 验证：容器 / 分辨率 / 时长 / 全黑帧
  const pr = await runProc(FFMPEG, ["-hide_banner", "-i", OUT, "-vf", "signalstats,metadata=print:key=lavfi.signalstats.YAVG", "-f", "null", "-"]);
  const txt = pr.out;
  const dur = txt.match(/Duration:\s*(\d+):(\d+):([\d.]+)/);
  const res = txt.match(/, (\d+x\d+)[,\s]/);
  const yavgs = [...txt.matchAll(/YAVG=([\d.]+)/g)].map((m) => Number(m[1]));
  const black = yavgs.filter((y) => y <= 16.5).length;
  const expect = (TO > 0 ? Math.min(TO, fullDur) : fullDur) - FROM;
  check("ffprobe 容器可读", pr.code === 0 && !!dur, dur ? `${dur[1]}h${dur[2]}m${dur[3]}s ${res?.[1] ?? "?"}` : txt.slice(-200));
  check("分辨率 1280x720", res?.[1] === "1280x720", res?.[1] ?? "?");
  check(`时长 ≈ ${expect.toFixed(1)}s`, !!dur && Math.abs((+dur[1]) * 3600 + (+dur[2]) * 60 + (+dur[3]) - expect) < 3, dur ? dur[3] : "?");
  check("无全黑帧", black === 0, `YAVG≤16.5 帧 ${black}/${yavgs.length}`);

  // 接触印相：8×5 = 40 幕
  const cr2 = await runProc(FFMPEG, ["-y", "-i", OUT, "-vf", "fps=40/253,scale=320:-1,tile=8x5", "-frames:v", "1", "-q:v", "3", SHEET_OUT]);
  check("接触印相生成", cr2.code === 0 && existsSync(SHEET_OUT), SHEET_OUT);
} catch (e) {
  check("执行", false, (e?.stack || String(e)).slice(-400));
} finally {
  if (staticS) { try { staticS.close(); } catch { /* 已关 */ } }
  if (recvS) { try { recvS.close(); } catch { /* 已关 */ } }
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} 项通过`);
process.exit(failed.length > 0 ? 1 : 0);
