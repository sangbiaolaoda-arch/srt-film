#!/usr/bin/env node
// 逐帧验收 —— 契约驱动的无头浏览器截图流水线
// ============================================================================
// 它做的事：打开一个页面 → 识别它的时间轴契约 → 按时点逐帧 seek + 截图
//          → 用 ffmpeg 量每帧的平均亮度（YAVG）抓「黑屏 / 爆白」
//          → 收页面运行时报错 → 拼一张接触印相 → 出 report.json / report.md
//
// 为什么需要它
// ------------
// 片子的 bug 大部分是「静默」的：某个元素漏了定位跑到角落、某个标签叠在一起、
// 某一拍根本没渲染（全黑）、文案被挤出画面。这类问题上不了单元测试，肉眼又不可能
// 把每一帧都盯着看。light-lag 那次就是靠这条流水线抓到 6 个真问题，其中最大一个
// （6 处文字漏 position:absolute，最后一整场的文案全在画面外）靠读代码是不可能发现的。
//
// 三条契约（页面侧要满足，详见 docs/流程-确定性动画与逐帧验收.md）
// ---------------------------------------------------------------------------
//   1. 时间轴可寻址：window.__tl.seek(t) 或 window.__stage.seek(t)，且 render(t) 是纯函数
//   2. 时长可读：    时间轴对象上有 dur（__tl）或 duration（__stage）
//   3. 报错可收：    页面把运行时错误推进 window.__err 数组
//
// 用法
// ----
//   npm run qa:frames -- --url http://localhost:5201/
//   node tools/qa-frames.mjs --url <url> [--shots 0.7,4.35,13] [--n 12] [--out <dir>]
//        [--width 1600] [--height 900] [--selector "#stage"] [--settle 350]
//        [--seek "<表达式>"] [--prepare "<表达式>"] [--cleanup "<表达式>"]
//        [--sheet] [--allow-err] [--fail-on-blank] [--dry-run]
//
// 退出码：页面报错（除非 --allow-err）→ 1；--fail-on-blank 且检出黑屏/爆白 → 1。

import { spawn } from "node:child_process";
import { appendFileSync, closeSync, existsSync, mkdirSync, openSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/* ------------------------------ agent-browser ------------------------------ */
// `agent-browser` 是 npm 装出来的 shim（Windows 上是 .cmd / 无扩展名的 sh 脚本），
// Node 的 spawn 没法直接执行它 —— 得绕过 shim 找到真正要跑的 JS 入口。
function resolveAgentBrowser() {
  if (process.env.AGENT_BROWSER_BIN) return { cmd: process.env.AGENT_BROWSER_BIN, pre: [], label: process.env.AGENT_BROWSER_BIN };
  const sep = process.platform === "win32" ? ";" : ":";
  const dirs = (process.env.PATH || "").split(sep).filter(Boolean);
  for (const d of dirs) {
    for (const ext of ["", ".cmd", ".exe"]) {
      const shim = join(d, `agent-browser${ext}`);
      if (!existsSync(shim)) continue;
      // npm shim 真正执行的是同级的 node_modules/agent-browser/bin/agent-browser.js
      const js = join(d, "node_modules", "agent-browser", "bin", "agent-browser.js");
      if (existsSync(js)) return { cmd: process.execPath, pre: [js], label: js };
      if (ext === ".cmd") return { cmd: process.env.ComSpec || "cmd.exe", pre: ["/c", shim], label: shim };
      return { cmd: shim, pre: [], label: shim };
    }
  }
  return { cmd: "agent-browser", pre: [], label: "agent-browser（直接取自 PATH）" };
}

const AB = resolveAgentBrowser();

/* ---------------------------------- 参数 ---------------------------------- */

const argv = process.argv.slice(2);
const opt = {};
const flags = new Set();
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (!a.startsWith("--")) continue;
  const key = a.slice(2);
  const next = argv[i + 1];
  if (next === undefined || next.startsWith("--")) flags.add(key);
  else { opt[key] = next; i++; }
}

const URL = opt.url;
if (!URL) {
  console.error("缺少 --url。示例：node tools/qa-frames.mjs --url http://localhost:5201/");
  process.exit(2);
}

const stamp = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);
const OUT = resolve(ROOT, opt.out || join(".tmp", "qa-frames", stamp));
const SHOTS_DIR = join(OUT, "shots");
const LOG = join(OUT, "agent-browser.log");
const W = Number(opt.width || 1600);
const H = Number(opt.height || 900);
const SETTLE = Number(opt.settle ?? 350);
const N = Number(opt.n || 12);
const FAIL_ON_BLANK = flags.has("fail-on-blank");
const ALLOW_ERR = flags.has("allow-err");
const DRY = flags.has("dry-run");

/* ------------------------------- 跑子进程 ------------------------------- */
// 两条本机硬约束（都不是设计选择，是踩出来的）：
//   1. 只能用异步 spawn —— 同步版（spawnSync/execSync/execFileSync）一律 EBUSY
//   2. 子进程的 stdout/stderr 必须**重定向到文件**，走管道会被 SIGTERM 掉
//      （连带这个父进程一起杀），所以统一 stdio: ["pipe", fd, fd]，跑完再读文件
function run(cmd, args, { input, logFile } = {}) {
  return new Promise((res) => {
    const logPath = logFile || LOG;
    appendFileSync(logPath, `$ ${cmd} ${args.join(" ")}\n`);
    const from = statSync(logPath).size;
    let fd;
    try {
      fd = openSync(logPath, "a");
    } catch (e) {
      return res({ code: -1, out: "", err: `无法打开日志文件：${e.message}`, spawnError: e });
    }
    const finish = (code, extra = {}) => {
      try { closeSync(fd); } catch { /* 已关就忽略 */ }
      let out = "";
      try {
        // 注意：from 是**字节**偏移，而日志里有中文 —— 必须按字节切再解码，
        // 直接对字符串 slice 会切在半个字符上，整段输出变成乱码。
        out = readFileSync(logPath).subarray(from).toString("utf8");
      } catch { /* 读不到就给空 */ }
      res({ code, out, err: "", ...extra });
    };
    let p;
    try {
      p = spawn(cmd, args, { stdio: ["pipe", fd, fd] });
    } catch (e) {
      return finish(-1, { err: String((e && e.message) || e), spawnError: e });
    }
    p.on("error", (e) => finish(-1, { err: String((e && e.message) || e), spawnError: e }));
    p.on("close", (code) => finish(code));
    if (input !== undefined && p.stdin.writable) p.stdin.write(input);
    p.stdin.end();
  });
}

/** 调 agent-browser */
const ab = (args, opts = {}) => run(AB.cmd, [...AB.pre, ...args], opts);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * 从 agent-browser 的输出里把 JSON 捞出来。
 * 注意它会**再包一层**：返回的字符串被当成 JSON 字面量打印（外面带引号、里面转义），
 * 所以要反复解，直到解出来的不是字符串为止。
 */
function parseJson(text) {
  const parseOnce = (t) => {
    const tryParse = (s) => { try { return JSON.parse(s); } catch { return undefined; } };
    const s0 = String(t ?? "").trim();
    if (!s0) return undefined;
    let v = tryParse(s0);
    if (v !== undefined) return v;
    const lines = s0.split("\n").map((l) => l.trim()).filter(Boolean);
    for (let i = lines.length - 1; i >= 0; i--) {
      v = tryParse(lines[i]);
      if (v !== undefined) return v;
    }
    const m = s0.match(/[[{][\s\S]*[\]}]/);
    return m ? tryParse(m[0]) : undefined;
  };
  let v = parseOnce(text);
  for (let i = 0; i < 3 && typeof v === "string"; i++) v = parseOnce(v);
  return v === undefined ? null : v;
}

/* ------------------------------ 页面侧契约 ------------------------------ */

/** 安装错误收集 + 探测时间轴契约 */
const PROBE = `(() => {
  if (!window.__err) {
    window.__err = [];
    addEventListener("error", (e) => window.__err.push("error: " + e.message));
    addEventListener("unhandledrejection", (e) => window.__err.push("reject: " + ((e.reason && e.reason.message) || String(e.reason))));
  }
  const S = window.__tl || window.__stage;
  const which = window.__tl ? "__tl" : (window.__stage ? "__stage" : null);
  let dur = 0, scenes = [];
  if (S) {
    dur = Number(S.dur || S.duration || 0);
    if (Array.isArray(S.scenes)) scenes = S.scenes.map((s) => ({ a: s.a, label: s.label || "" }));
    else if (Array.isArray(S.shots)) scenes = S.shots.map((s, i) => ({ a: s.tlStart ?? s.start ?? 0, label: "拍 " + (i + 1) }));
  }
  return JSON.stringify({ ok: !!S, which, dur, scenes, err: window.__err.slice() });
})()`;

/** seek 表达式：未指定 --seek 时按契约自适应。
 *  ⚠ 两种契约的重绘时机不同，不能想当然地统一关掉自动渲染：
 *    · __tl     seek() 内部同步 render，关不关都行
 *    · __stage  seek() 只把 dirty 置真，真正的重绘在 rAF 循环里，
 *               关掉 autoRender 就再也不画了 —— 十帧截图会长得一模一样 */
function defaultSeek(t) {
  return `(() => {
  const S = window.__tl || window.__stage;
  if (!S) return JSON.stringify({ ok: false, why: "页面里既没有 window.__tl 也没有 window.__stage" });
  if (typeof S.seek !== "function") return JSON.stringify({ ok: false, why: "时间轴对象没有 seek(t)" });
  if (typeof S.pause === "function") S.pause();
  S.seek(${t});
  return JSON.stringify({ ok: true });
})()`;
}

/** 截图前让页面稳定下来；清理时把自动渲染还回去 */
const CLEANUP = `(() => {
  const S = window.__tl || window.__stage;
  return JSON.stringify({ ok: true, err: (window.__err || []).slice() });
})()`;

/* --------------------------------- 亮度 --------------------------------- */

/** ffmpeg 的位置：环境变量 → 本机常用路径 → PATH */
const FF_CANDIDATES = [process.env.FFMPEG, "E:/WorkBuddy/tools/ffmpeg.exe", "ffmpeg"].filter(Boolean);

async function findFfmpeg() {
  for (const c of FF_CANDIDATES) {
    const r = await run(c, ["-version"]);
    if (r.code === 0) return c;
  }
  return null;
}

/** 平均亮度 YAVG（限制范围 16–235；纯黑 = 16，纯白 = 235） */
async function yavg(ff, png) {
  const r = await run(ff, [
    "-hide_banner", "-i", png, "-frames:v", "1",
    "-vf", "signalstats,metadata=print:key=lavfi.signalstats.YAVG",
    "-f", "null", "-",
  ]);
  const m = (r.out + r.err).match(/YAVG=([0-9.]+)/);
  return m ? Number(m[1]) : null;
}

/* --------------------------------- 主流程 --------------------------------- */

const shots = [];

function shotList(dur, scenes) {
  if (opt.shots) {
    const raw = existsSync(resolve(ROOT, opt.shots)) ? readFileSync(resolve(ROOT, opt.shots), "utf8") : opt.shots;
    const trimmed = raw.trim();
    if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) return parsed.map((v, i) => (typeof v === "number" ? { t: v, name: "" } : { t: v.t, name: v.name || "" }));
      return Object.entries(parsed).map(([t, name]) => ({ t: Number(t), name: String(name) }));
    }
    return trimmed.split(",").map((s) => ({ t: Number(s.trim()), name: "" })).filter((s) => Number.isFinite(s.t));
  }
  // 没给时点：按场景边界各取一个代表帧（有场景表时），否则按时长均匀取
  if (scenes.length >= 2) {
    return scenes.map((s, i) => {
      const next = scenes[i + 1];
      const b = next ? next.a : (dur > 0 ? dur : s.a + 3);
      return { t: Number(((s.a + b) / 2).toFixed(2)), name: s.label };
    });
  }
  if (dur > 0) {
    return Array.from({ length: N }, (_, i) => ({ t: Number((((i + 0.5) / N) * dur).toFixed(2)), name: "" }));
  }
  return [];
}

/** 文件名用纯序号：ffmpeg 的 image2 序列输入（%0Nd）需要它，中文/空格会打断序列。
 *  人类可读的名字放进 report.md 和 shots/manifest.json。 */
const padOf = (n) => String(Math.max(2, String(n).length));
const fileOf = (i, n) => `${String(i + 1).padStart(Number(padOf(n)), "0")}.png`;

async function main() {
  mkdirSync(SHOTS_DIR, { recursive: true });
  writeFileSync(LOG, "");

  console.log(`逐帧验收  ${URL}`);
  console.log(`输出目录  ${OUT}`);
  console.log(`驱动器    ${AB.label}\n`);

  /* 1) 打开 + 视口 */
  let r = await ab(["open", URL], { logFile: LOG });
  if (r.code !== 0) {
    console.error("✗ 打开页面失败。确认 agent-browser 可用、本地服务已启动。");
    console.error((r.err || r.out || "").split("\n").slice(-6).join("\n"));
    process.exit(1);
  }
  await sleep(2500);
  await ab(["set", "viewport", String(W), String(H)], { logFile: LOG });
  await sleep(600);

  /* 2) 一次性准备：必须在探测契约**之前** —— 比如 srt-film 要填了字幕、点了
        「载入并规划」之后，window.__stage 才会出现 */
  if (opt.prepare) {
    const pr = await ab(["eval", "--stdin"], { input: String(opt.prepare), logFile: LOG });
    const last = String(pr.out || "").trim().split("\n").filter(Boolean).pop();
    console.log(`准备  ${last || "(无返回)"}`);
    await sleep(Number(opt.prepareWait || 2000));
  }

  /* 3) 探测契约 */
  r = await ab(["eval", "--stdin"], { input: PROBE, logFile: LOG });
  const probe = parseJson(r.out);
  if (!probe || !probe.ok) {
    console.error(`✗ 没找到时间轴契约：${probe ? JSON.stringify(probe) : "eval 无有效返回"}`);
    console.error("  页面需要暴露 window.__tl = { dur, seek(t), ... } 或 window.__stage = { duration, seek(t) }；");
    console.error("  详见 docs/流程-确定性动画与逐帧验收.md 的「三条契约」。");
    process.exit(1);
  }
  const dur = Number(probe.dur || 0);
  const scenes = Array.isArray(probe.scenes) ? probe.scenes : [];
  console.log(`契约  window.${probe.which}   时长 ${dur ? dur.toFixed(2) + "s" : "未知"}   场景 ${scenes.length}`);

  const list = shotList(dur, scenes);
  if (list.length === 0) {
    console.error("✗ 没有可验收的时点：页面没给 dur/scenes，也没传 --shots。");
    process.exit(2);
  }
  console.log(`时点  ${list.length} 个\n`);

  if (DRY) {
    list.forEach((s, i) => console.log(`  ${fileOf(i, list.length)}  t=${s.t}  ${s.name || ""}`));
    console.log("\n（--dry-run：只列出计划，不截图）");
    return { dur, scenes, list, rows: [] };
  }

  /* 3) 逐帧 seek + 截图 */
  const ff = await findFfmpeg();
  if (!ff) console.log("· 没找到 ffmpeg，跳过亮度分析（截图与报错照常）\n");

  const rows = [];
  for (let i = 0; i < list.length; i++) {
    const s = list[i];
    const seekJs = opt.seek ? String(opt.seek).replace(/\bT\b/g, String(s.t)) : defaultSeek(s.t);
    const sr = await ab(["eval", "--stdin"], { input: seekJs, logFile: LOG });
    const sj = parseJson(sr.out);
    if (sj && sj.ok === false) {
      console.error(`✗ seek(${s.t}) 失败：${sj.why}`);
      process.exit(1);
    }
    await sleep(SETTLE);
    const name = fileOf(i, list.length);
    const file = join(SHOTS_DIR, name);
    const args = opt.selector ? ["screenshot", opt.selector, file] : ["screenshot", file];
    await ab(args, { logFile: LOG });

    const lum = ff && existsSync(file) ? await yavg(ff, file) : null;
    const blank = lum !== null && lum <= 18; // 纯黑（限制范围）= 16
    const blown = lum !== null && lum >= 235;
    rows.push({ i, t: s.t, name: s.name || "", file, lum, blank, blown, ok: existsSync(file) });
    const tag = !existsSync(file) ? "⚠ 截图缺失" : blank ? "⚠ 全黑" : blown ? "⚠ 爆白" : "";
    console.log(`  ${name}  t=${String(s.t).padStart(6)}s  ${lum === null ? "  -  " : `YAVG ${lum.toFixed(1).padStart(5)}`}  ${s.name || ""}  ${tag}`);
  }

  /* 4) 收尾：还原自动渲染 + 读报错 */
  r = await ab(["eval", "--stdin"], { input: CLEANUP, logFile: LOG });
  const cleanup = parseJson(r.out) || {};
  const errs = Array.isArray(cleanup.err) ? cleanup.err : (Array.isArray(probe.err) ? probe.err : []);

  /* 5) 接触印相 */
  // 这台 ffmpeg 的 libavformat 没编进 glob，所以用 image2 序列输入（%0Nd + start_number）。
  // 文件名因此必须是纯序号 —— 见 fileOf 的注释。
  let sheet = null;
  if (flags.has("sheet") && ff) {
    const cols = Math.min(4, rows.length);
    const lines = Math.max(1, Math.ceil(rows.length / cols));
    sheet = join(OUT, "contact-sheet.png");
    const fr = await run(ff, [
      "-hide_banner", "-loglevel", "error",
      "-start_number", "1", "-i", join(SHOTS_DIR, `%0${padOf(rows.length)}d.png`),
      "-vf", `scale=420:-1,tile=${cols}x${lines}:padding=8:color=0x0b0b0f`,
      "-frames:v", "1", "-y", sheet,
    ], { logFile: LOG });
    if (fr.code !== 0 || !existsSync(sheet)) {
      const why = (fr.out || "").split("\n").filter(Boolean).slice(-2).join(" / ") || "未知原因";
      console.log(`· 接触印相生成失败：${why}`);
      sheet = null;
    }
  }

  /* 6) 报告 */
  const blanks = rows.filter((x) => x.blank);
  const blown = rows.filter((x) => x.blown);
  const missing = rows.filter((x) => !x.ok);

  const report = {
    url: URL,
    contract: `window.${probe.which}`,
    duration: dur,
    viewport: [W, H],
    generatedAt: new Date().toISOString(),
    shots: rows.map((x) => ({ t: x.t, name: x.name, file: basename(x.file), lum: x.lum, blank: x.blank, blown: x.blown })),
    pageErrors: errs,
    contactSheet: sheet ? basename(sheet) : null,
  };
  writeFileSync(join(OUT, "report.json"), JSON.stringify(report, null, 2));
  // 截图文件名是纯序号（ffmpeg 序列输入的要求），人类可读的名字在这里对上号
  writeFileSync(
    join(SHOTS_DIR, "manifest.json"),
    JSON.stringify(rows.map((x) => ({ file: basename(x.file), t: x.t, name: x.name })), null, 2),
  );

  const md = [
    `# 逐帧验收报告`,
    ``,
    `- 页面：\`${URL}\``,
    `- 契约：\`${report.contract}\``,
    `- 时长：${dur ? dur.toFixed(2) + "s" : "未知"}　视口：${W}×${H}`,
    `- 时点：${rows.length} 个　全黑：${blanks.length}　爆白：${blown.length}　截图缺失：${missing.length}`,
    `- 页面报错：${errs.length}`,
    ``,
    `## 逐帧`,
    ``,
    `| # | t (s) | 平均亮度 | 判定 | 名称 |`,
    `|---|---|---|---|---|`,
    ...rows.map((x, i) => `| ${i + 1} | ${x.t} | ${x.lum === null ? "—" : x.lum.toFixed(1)} | ${!x.ok ? "截图缺失" : x.blank ? "⚠ 全黑" : x.blown ? "⚠ 爆白" : "ok"} | ${x.name || ""} |`),
    ``,
    `> 平均亮度 = ffmpeg \`signalstats\` 的 YAVG（限制范围 16–235，纯黑 16、纯白 235）。`,
    `> 判据：≤18 视为全黑，≥235 视为爆白 —— 这两类通常是「这一拍没渲染」或「叠了白蒙版」。`,
    ``,
    `## 页面报错`,
    ``,
    errs.length ? errs.map((e) => `- ${e}`).join("\n") : "（无）",
    ``,
  ].join("\n");
  writeFileSync(join(OUT, "report.md"), md);

  /* 7) 结论 */
  console.log("");
  if (errs.length) console.error(`✗ 页面报错 ${errs.length} 条`); else console.log("✓ 页面零报错");
  if (missing.length) console.error(`✗ ${missing.length} 帧没截到`);
  if (blanks.length) console.error(`⚠ ${blanks.length} 帧近乎全黑：${blanks.map((b) => `t=${b.t}`).join(", ")}`);
  if (blown.length) console.error(`⚠ ${blown.length} 帧近乎爆白：${blown.map((b) => `t=${b.t}`).join(", ")}`);
  console.log(`报告  ${join(OUT, "report.md")}`);
  console.log(`截图  ${SHOTS_DIR}`);
  if (sheet) console.log(`印相  ${sheet}`);

  if (errs.length && !ALLOW_ERR) process.exit(1);
  if (FAIL_ON_BLANK && (blanks.length || blown.length)) process.exit(1);
}

main().catch((e) => {
  console.error("意外失败：", e);
  process.exit(1);
});
