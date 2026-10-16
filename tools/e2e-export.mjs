#!/usr/bin/env node
// 端到端验收 —— 贴入 SRT 到拿到 MP4 的完整链路，全程走真实 UI 与页面调试钩子。
//
// 它验证的是单元测试与印相都覆盖不到的那一段：
//   vite dev server → 无头浏览器打开页面 → 填 SRT/覆写 → 点「载入并规划」
//   → 门禁通过 → 舞台建起 → 播放推进 → 导出 MP4 → 落盘 → ffprobe 验帧数/时长/分辨率。
//
// 用法：
//   node tools/e2e-export.mjs [--srt <路径>] [--ov <路径>] [--port 5199] [--out <mp4>]
//                              [--w 1280 --h 720] [--fps 24]     // 导出档位，不给=页面默认 1080p30
// 退出码：任一环节失败 → 1；全部通过 → 0。

import { spawn } from "node:child_process";
import { appendFileSync, closeSync, existsSync, mkdirSync, openSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUTDIR = resolve(ROOT, ".tmp/e2e");
const LOG = join(OUTDIR, "e2e.log");

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
// 导出档位（Phase 8）：不给就走页面默认值（1080p30），给了就覆盖面板后走真实导出路径，
// 用于验收「非默认分辨率/帧率能不能真编出来」。
const expW = Number(argOf("--w", "0")) || null;
const expH = Number(argOf("--h", "0")) || null;
const expFps = Number(argOf("--fps", "0")) || null;
const expSettings = JSON.stringify(
  Object.fromEntries(
    Object.entries({ width: expW, height: expH, fps: expFps }).filter(([, v]) => v !== null),
  ),
);

const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok, detail });
  console.log(`${ok ? "✓" : "✗"} ${name}${detail ? ` —— ${detail}` : ""}`);
};

/* --------------------------------- 主流程 -------------------------------- */
mkdirSync(OUTDIR, { recursive: true });
appendFileSync(LOG, `\n===== e2e ${new Date().toISOString()} srt=${srtPath} =====\n`);

let server = null;
try {
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

  // 3. 填 SRT + 覆写，点「载入并规划」—— 与用户操作逐字一致
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
  await sleep(2500); // 等规划 + 舞台构建

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

  // 5. 播放推进：点播放按钮，两秒后时间轴应前进
  await ab(["eval", "--stdin"], { input: `document.getElementById('btn-play').click(); 'play'` });
  await sleep(2000);
  const t1 = parseJson((await ab(["eval", "--stdin"], {
    input: `JSON.stringify({ t: window.__stage.time(), playing: !!window.__stage.tl && !window.__stage.tl.paused() })`,
  })).out);
  check("播放推进", (t1?.t ?? 0) > 0.5, `t=${t1?.t?.toFixed?.(2) ?? t1?.t}s`);
  await ab(["eval", "--stdin"], { input: `document.getElementById('btn-play').click(); 'pause'` });

  // 6. 导出 MP4（页面调试钩子 __exportMp4 —— main.ts 注释给无头链路的契约）。
  // 长片一次 eval 等不到结果（agent-browser 有读取超时），拆成「发起 + 轮询」：
  // 发起只存 promise 立即返回，轮询单次都是快返。
  const startJs = `
    window.__exportDone = false;
    window.__exportErr = null;
    window.__exportProgress = null;
    window.__exportMp4(window.__stage, window.__stage.duration, Object.assign(${expSettings}, {
      onProgress: (p) => { window.__exportProgress = p; },
    })).then((blob) => {
      window.__lastMp4 = blob;
      window.__exportDone = true;
    }).catch((e) => {
      window.__exportErr = String((e && e.message) || e);
      window.__exportDone = true;
    });
    'started';
  `;
  const sr = await ab(["eval", "--stdin"], { input: startJs });
  check("导出已发起", sr.code === 0);

  // 导出期的内存/进度观测：长片导出会跑好几分钟，崩在哪一帧、内存曲线长什么样，
  // 只有边跑边记才拿得到（进程一崩页面状态全丢）。
  const memLog = join(OUTDIR, `export-mem-${Date.now()}.csv`);
  writeFileSync(memLog, "ms,frame,total,heapMB\n");
  const t0 = Date.now();
  let exp = null;
  const deadline = Date.now() + 600_000; // 长片导出上限 10 分钟
  while (Date.now() < deadline) {
    await sleep(5000);
    const st = parseJson((await ab(["eval", "--stdin"], {
      input: `JSON.stringify({ done: !!window.__exportDone, err: window.__exportErr, size: window.__lastMp4 ? window.__lastMp4.size : 0, f: window.__exportProgress ? window.__exportProgress.frame : -1, total: window.__exportProgress ? window.__exportProgress.total : -1, heap: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : -1 })`,
    })).out);
    if (st) {
      appendFileSync(memLog, `${Date.now() - t0},${st.f},${st.total},${st.heap}\n`);
      console.log(`  · 导出中 f=${st.f}/${st.total} heap=${st.heap}MB`);
    }
    if (st?.done) {
      exp = st.err ? { err: st.err } : { size: st.size };
      break;
    }
  }
  check("MP4 导出完成（页面内）", !!exp && !exp.err && exp.size > 1000,
    exp ? (exp.err ? exp.err : `${(exp.size / 1e6).toFixed(2)}MB`) : "轮询超时（10 分钟）");
  if (!exp || exp.err) process.exit(1);

  // 分片取回：一次性 base64 会把上百 MB 的字符串塞进 agent-browser 的 node 堆
  // （06 语料 103s 片曾在这一步前后 OOM），改成每片 4MB、边收边写盘。
  const CHUNK = 4 << 20;
  const sizeJ = parseJson((await ab(["eval", "--stdin"], {
    input: `JSON.stringify({ size: window.__lastMp4 ? window.__lastMp4.size : 0 })`,
  })).out);
  const totalBytes = Number(sizeJ?.size || 0);
  writeFileSync(outMp4, "");
  let got = 0;
  let allOk = totalBytes > 1000;
  for (let off = 0; allOk && off < totalBytes; off += CHUNK) {
    const r = await ab(["eval", "--stdin"], {
      input: `
        (async () => {
          const b = window.__lastMp4;
          const end = Math.min(b.size, ${off} + ${CHUNK});
          const buf = new Uint8Array(await b.slice(${off}, end).arrayBuffer());
          let bin = '';
          for (let i = 0; i < buf.length; i += 0x8000) {
            bin += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
          }
          return JSON.stringify({ n: buf.length, b64: btoa(bin) });
        })()
      `,
    });
    const j = parseJson(r.out);
    if (typeof j?.b64 !== "string") { allOk = false; break; }
    const piece = Buffer.from(j.b64, "base64");
    appendFileSync(outMp4, piece);
    got += piece.length;
  }
  check("MP4 数据取回（分片）", allOk && got > 1000, `${(got / 1e6).toFixed(2)}/${(totalBytes / 1e6).toFixed(2)}MB，共 ${Math.ceil(totalBytes / CHUNK)} 片`);
  if (!allOk || got < 1000) process.exit(1);

  const stat = statSync(outMp4);
  check("MP4 落盘", stat.size > 1000, `${outMp4}（${(stat.size / 1e6).toFixed(2)}MB）`);

  // 7. ffprobe 验证容器/帧数/时长/分辨率
  const ff = "E:/WorkBuddy/tools/ffmpeg.exe";
  if (!existsSync(ff)) {
    check("ffprobe 验证", false, "找不到 ffmpeg：E:/WorkBuddy/tools/ffmpeg.exe");
  } else {
    const pr = await run(ff, [
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
    // 分辨率必须等于本次请求的档位：面板选 720p 却导出 1080p 是「设置没接上」的典型症状。
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
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} 项通过`);
process.exit(failed.length > 0 ? 1 : 0);
