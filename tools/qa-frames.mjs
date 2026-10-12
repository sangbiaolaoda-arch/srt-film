#!/usr/bin/env node
// 逐帧验收 —— 契约驱动的无头浏览器截图流水线
// ============================================================================
// 它做的事：打开一个页面 → 识别它的时间轴契约 → 按「每镜起始/25%/50%/75%/结束前」
//          逐点 seek + 截图 → 用 ffmpeg 量每帧的平均亮度（YAVG）抓「黑屏 / 爆白」
//          → 与同场上一个采样点比「结构差」抓「这一拍根本没动」
//          → 收页面运行时报错 → 拼一张接触印相 → 出 report.json / report.md
//
// 两类失效，两种量法
// ------------------
//   亮度（YAVG）抓的是「画面在不在」：全黑 = 没渲染，爆白 = 蒙版叠错。
//   结构差（Δ）抓的是「画面有没有变」：两帧各缩到 32×18 再比平均像素差，
//   局部细节（粒子、扫描线）被平均掉，只剩结构性变化。某个镜头内 Δ 一直很小，
//   说明它的主图从头到尾没变过 —— 手册 §13.1 的最后追问
//  （「拿掉全部动画，信息一点没损失吗」）在这里落成了一个可计算的数。
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
//   另可识别第三方契约 window.__VIDEO_TEST__.renderAt(t)（外部项目通用写法，
//   见 docs/流程-叙事与信息设计.md 附录），此时场景表从 DOM 的 section.scene 读。
//
// 用法
// ----
//   npm run qa:frames -- --url http://localhost:5201/
//   node tools/qa-frames.mjs --url <url> [--shots 0.7,4.35,13] [--n 12] [--out <dir>]
//        [--width 1600] [--height 900] [--selector "#stage"] [--settle 350]
//        [--per-scene 5] [--motion-min 3] [--no-motion]
//        [--roi 0.48,0.2,0.48,0.63]     只在主图这块画面里算 Δ（治「主图只占一角」的低估）
//        [--determinism] [--determinism-tol 0.5]   同一 t 渲染两次比像素，抓非确定性
//        [--seek "<表达式>"] [--prepare "<表达式>"] [--cleanup "<表达式>"]
//        [--sheet] [--allow-err] [--fail-on-blank] [--fail-on-still]
//        [--fail-on-nondeterministic] [--dry-run]
//
// 退出码：页面报错（除非 --allow-err）→ 1；--fail-on-blank 且检出黑屏/爆白 → 1；
//        --fail-on-still 且存在无主运动的镜头 → 1；
//        --fail-on-nondeterministic 且同一时刻两次渲染不一致 → 1。

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
// 重复渲染的第二张单独放一个目录：shots/ 里必须是纯序号文件名（ffmpeg 的
// image2 序列输入要求），混进 repeat-*.png 虽然不会被 %0Nd 匹配到，但没必要冒险。
const REPEAT_DIR = join(OUT, "repeat");
const LOG = join(OUT, "agent-browser.log");
const W = Number(opt.width || 1600);
const H = Number(opt.height || 900);
const SETTLE = Number(opt.settle ?? 350);
const N = Number(opt.n || 12);
const FAIL_ON_BLANK = flags.has("fail-on-blank");
const ALLOW_ERR = flags.has("allow-err");
const DRY = flags.has("dry-run");
// 每镜采样点数（起始 / 25% / 50% / 75% / 结束前）；1 表示每镜只取首帧
const PER_SCENE = Math.max(1, Number(opt["per-scene"] ?? 5));
// 「这一拍有没有主运动」的判据：镜头内部（去掉入场段）相邻采样点的最大结构差
// 低于它就视为没动。1.2 是实测校准值（见 docs/流程-确定性动画与逐帧验收.md §4）：
// 每场都有真实主运动的样片落在 2.18~24.4，而镜内只有循环动效的样片落在 0.16~0.77，
// 两组不重叠，门槛取在中间偏保守的位置。
const MOTION_MIN = Number(opt["motion-min"] ?? 1.2);
const NO_MOTION = flags.has("no-motion");
const FAIL_ON_STILL = flags.has("fail-on-still");

// 主图 ROI：--roi x,y,w,h（0–1 归一化，相对画面）。给了它，Δ 就只在主图范围内算。
// 为什么需要这个：整帧 Δ 对「主图在动、但主图只占画面一角」的场景会低估 ——
// 大面积静止背景把局部运动平均掉了。只测主图所在区域，信噪比立刻上来
// （在外部样本上实测：ROI 内幅值是整帧的 1.5~3.1 倍）。
const ROI = (() => {
  const raw = opt.roi;
  if (!raw) return null;
  const v = String(raw).split(",").map((x) => Number(x.trim()));
  if (v.length !== 4 || v.some((x) => !Number.isFinite(x))) {
    console.error(`✗ --roi 需要 4 个 0–1 归一化数字：x,y,w,h（收到 ${raw}）`);
    process.exit(2);
  }
  const [x, y, w, h] = v;
  if (w <= 0 || h <= 0 || x < 0 || y < 0 || x + w > 1.0001 || y + h > 1.0001) {
    console.error(`✗ --roi 区域越界：${raw}（要求 x,y≥0、w,h>0、x+w≤1、y+h≤1）`);
    process.exit(2);
  }
  return { x, y, w, h };
})();

// 同时刻重复渲染一致性：同一 t 渲染两次，两帧像素必须一致。
// 抓的是「看起来能播、实际不能逐帧导出」—— Math.random()、Date.now()、
// x += v 累加、未固定相位的无限动画。这类问题只有重复渲染才暴露得出来。
const DETERMINISM = flags.has("determinism");
// 允许的差异（0–255 尺度）。JPEG/PNG 编码本身是确定的，所以真确定就是 0；
// 留一点余量给字体抗锯齿。
const DET_TOL = Number(opt["determinism-tol"] ?? 0.5);

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
  const T = window.__VIDEO_TEST__;
  const vt = T && typeof T.renderAt === "function" ? { time: (T.getState && T.getState().time) || 0, dur: (T.getState && T.getState().duration) || 0 } : null;
  const S = window.__tl || window.__stage;
  const which = window.__tl ? "__tl" : (window.__stage ? "__stage" : (vt ? "__VIDEO_TEST__" : null));
  let dur = 0, scenes = [];
  if (S) {
    dur = Number(S.dur || S.duration || 0);
    if (Array.isArray(S.scenes)) scenes = S.scenes.map((s) => ({ a: s.a, label: s.label || "" }));
    else if (Array.isArray(S.shots)) scenes = S.shots.map((s, i) => ({ a: s.tlStart ?? s.start ?? 0, label: "拍 " + (i + 1) }));
  }
  // __VIDEO_TEST__ 契约不暴露场景数组，场景表从 DOM 上读（section.scene 的 data-start/end）。
  // 这也是 srt-film 之外的 HTML 视频项目通用的写法 —— 场景边界本来就是 DOM 事实。
  if (!scenes.length) {
    const secs = [...document.querySelectorAll("section.scene, .scene[data-start]")];
    if (secs.length) {
      scenes = secs.map((el, i) => ({
        a: Number(el.dataset.start ?? 0),
        b: Number(el.dataset.end ?? NaN),
        label: el.dataset.scene || el.getAttribute("aria-label") || ("场 " + (i + 1)),
      }));
      if (!dur) dur = Number(scenes[scenes.length - 1].b || 0);
    }
  }
  if (!dur && vt) dur = vt.dur;
  return JSON.stringify({ ok: !!which, which, dur, scenes, err: window.__err.slice() });
})()`;

/** seek 表达式：未指定 --seek 时按契约自适应。
 *  ⚠ 两种契约的重绘时机不同，不能想当然地统一关掉自动渲染：
 *    · __tl     seek() 内部同步 render，关不关都行
 *    · __stage  seek() 只把 dirty 置真，真正的重绘在 rAF 循环里，
 *               关掉 autoRender 就再也不画了 —— 十帧截图会长得一模一样 */
function defaultSeek(t) {
  return `(() => {
  const S = window.__tl || window.__stage;
  if (S) {
    if (typeof S.seek !== "function") return JSON.stringify({ ok: false, why: "时间轴对象没有 seek(t)" });
    if (typeof S.pause === "function") S.pause();
    S.seek(${t});
    return JSON.stringify({ ok: true, via: "seek" });
  }
  // 第三方契约：__VIDEO_TEST__.renderAt(t) —— 同步渲染，不依赖播放到那一秒
  const T = window.__VIDEO_TEST__;
  if (T && typeof T.renderAt === "function") { const r = T.renderAt(${t}); return JSON.stringify({ ok: true, via: "renderAt", sceneId: r && r.sceneId }); }
  return JSON.stringify({ ok: false, why: "页面里没有 window.__tl / __stage / __VIDEO_TEST__.renderAt" });
})()`;
}

/** 截图前让页面稳定下来；清理时把自动渲染还回去 */
const CLEANUP = `(() => {
  const S = window.__tl || window.__stage;
  return JSON.stringify({ ok: true, err: (window.__err || []).slice() });
})()`;

/* --------------------------------- 亮度 --------------------------------- */

/**
 * 解析 ffmpeg `signalstats` 打印的 YAVG。
 *
 * ⚠ 必须吃**科学计数法**。完全静止（或差异极易忽略）的一对帧，ffmpeg 输出的是
 * `YAVG=7.07334e-06` 这种值；只匹配 `[0-9.]` 的正则会把它截成 `7.07334` ——
 * 于是「两帧一模一样」被读成「差异 7.07」，而且是**假阳性**，
 * 恰好发生在最该判成「静止」的场景上（把该报警的镜头放过去）。
 * 这个坑是 2026-10-12 加重复渲染检查时才暴露出来的。
 */
function parseYavg(text) {
  const m = String(text).match(/YAVG=(-?[0-9]+(?:\.[0-9]+)?(?:e[-+]?[0-9]+)?)/i);
  if (!m) return null;
  const v = Number(m[1]);
  return Number.isFinite(v) ? v : null;
}

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
  return parseYavg(r.out + r.err);
}

/**
 * 结构差 —— 「这一拍到底有没有动」的判据。
 *
 * 为什么不能直接比原图：画面里永远有东西在动（循环粒子、扫描线、呼吸光晕），
 * 原图逐像素比出来的差异永远很大，什么也判不出来。真正的失效模式是
 * **细节在动、主结构不动**（地平线不位移、主图不缩放、文案不更换）——
 * 这样的镜头看着"有生气"，其实观众什么新信息都没拿到。
 *
 * 所以先缩到 32×18 再比：局部运动被平均掉，只剩结构性变化。返回值是两个缩小帧
 * 的平均像素差（0 = 完全一致，255 = 全变），比阈值小就是"没动"。
 *
 * 实测校准（light-lag 的两张不同场次截图）：缝内不同场 ≈ 1.56，
 * 同场只有粒子在飘 ≈ 0.1–0.6。默认阈值 3。
 *
 * roi 非空时先裁出主图区域再缩 —— 解决整帧 Δ 的另一个失效模式：**主图在动，
 * 但主图只占画面一角**，大面积静止背景把变化平均掉了，Δ 被低估。裁切用
 * 归一化坐标（相对被截图的那个元素），所以配合 --selector 用时 ROI 才等价于
 * 「那块画面里的区域」。
 */
const SDW = 32;
const SDH = 18;
async function structDiff(ff, a, b, roi = null) {
  const pre = roi
    ? `crop=iw*${roi.w}:ih*${roi.h}:iw*${roi.x}:ih*${roi.y},format=rgb24,`
    : "";
  const r = await run(ff, [
    "-hide_banner",
    "-i", a, "-i", b,
    "-lavfi",
    `[0]${pre}scale=${SDW}:${SDH}[x];[1]${pre}scale=${SDW}:${SDH}[y];[x][y]blend=all_mode=difference,signalstats,metadata=print:key=lavfi.signalstats.YAVG`,
    "-f", "null", "-",
  ]);
  return parseYavg(r.out + r.err);
}

/**
 * 原始分辨率的平均像素差 —— 只用于「同一时刻重复渲染是否一致」。
 *
 * 故意不缩小：非确定性常常只落在少数像素上（发射顺序不定的粒子、只闪一帧的
 * 光晕、第二次绘制才回来的异步数据）。缩到 32×18 会被平均掉，查不出来。
 * 真确定的实现两次渲染像素完全一样，这个值是 0。
 */
async function pixelDiff(ff, a, b) {
  const r = await run(ff, [
    "-hide_banner", "-i", a, "-i", b,
    "-lavfi", "[0][1]blend=all_mode=difference,signalstats,metadata=print:key=lavfi.signalstats.YAVG",
    "-f", "null", "-",
  ]);
  return parseYavg(r.out + r.err);
}

/* --------------------------------- 主流程 --------------------------------- */

const shots = [];

/** t 落在哪个场景区间（0 基）；不在任何区间返回 -1 */
function sceneIndexOf(t, scenes) {
  for (let i = 0; i < scenes.length; i++) {
    const a = scenes[i].a;
    // 场景自带 b（data-end）时用它；否则用下一场的起点（老契约只有 a）
    const b = Number.isFinite(scenes[i].b) ? scenes[i].b : (i + 1 < scenes.length ? scenes[i + 1].a : Infinity);
    if (t >= a && t < b) return i;
  }
  return -1;
}

function shotList(dur, scenes) {
  const withScene = (arr) => arr.map((s) => ({ ...s, scene: scenes.length ? sceneIndexOf(s.t, scenes) : -1 }));

  if (opt.shots) {
    const raw = existsSync(resolve(ROOT, opt.shots)) ? readFileSync(resolve(ROOT, opt.shots), "utf8") : opt.shots;
    const trimmed = raw.trim();
    if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) return withScene(parsed.map((v) => (typeof v === "number" ? { t: v, name: "" } : { t: v.t, name: v.name || "" })));
      return withScene(Object.entries(parsed).map(([t, name]) => ({ t: Number(t), name: String(name) })));
    }
    return withScene(trimmed.split(",").map((s) => ({ t: Number(s.trim()), name: "" })).filter((s) => Number.isFinite(s.t)));
  }

  // 每镜取 PER_SCENE 个采样点（起始 / 25% / 50% / 75% / 结束前），而不是只取中点。
  // 取多点的意义不只是多看几眼 —— 同场内的相邻采样点两两作差，就是「这一拍有没有
  // 主运动」的判据；只取中点的话根本无从比较。
  if (scenes.length >= 2) {
    const out = [];
    scenes.forEach((s, i) => {
      const a = s.a;
      const next = scenes[i + 1];
      const b = next ? next.a : (dur > 0 ? dur : a + 3);
      const span = b - a;
      const label = s.label || `场 ${i + 1}`;
      if (span < 0.5) { // 太短的镜头塞不下多点，只取中点
        out.push({ t: Number((a + span / 2).toFixed(2)), name: label, scene: i });
        return;
      }
      for (let k = 0; k < PER_SCENE; k++) {
        const frac = PER_SCENE === 1 ? 0 : k / (PER_SCENE - 1);
        let t = frac >= 1 ? b - 0.05 : a + span * frac;
        if (k === 0) t = a + 0.02; // 避开场切换那一帧
        t = Math.max(a, Math.min(b - 0.02, t));
        out.push({ t: Number(t.toFixed(2)), name: PER_SCENE > 1 ? `${label} · ${k + 1}/${PER_SCENE}` : label, scene: i });
      }
    });
    return out;
  }

  if (dur > 0) {
    return Array.from({ length: N }, (_, i) => ({ t: Number((((i + 0.5) / N) * dur).toFixed(2)), name: "", scene: -1 }));
  }
  return [];
}

/** 文件名用纯序号：ffmpeg 的 image2 序列输入（%0Nd）需要它，中文/空格会打断序列。
 *  人类可读的名字放进 report.md 和 shots/manifest.json。 */
const padOf = (n) => String(Math.max(2, String(n).length));
const fileOf = (i, n) => `${String(i + 1).padStart(Number(padOf(n)), "0")}.png`;

async function main() {
  mkdirSync(SHOTS_DIR, { recursive: true });
  mkdirSync(REPEAT_DIR, { recursive: true });
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
    const shotArgs = (out) => (opt.selector ? ["screenshot", opt.selector, out] : ["screenshot", out]);
    await ab(shotArgs(file), { logFile: LOG });

    const lum = ff && existsSync(file) ? await yavg(ff, file) : null;
    const blank = lum !== null && lum <= 18; // 纯黑（限制范围）= 16
    const blown = lum !== null && lum >= 235;

    // 与「同一场景里的上一个采样点」比结构差 —— 只在同场景内比，跨场景比较没有意义
    const scene = s.scene ?? -1;
    const prevRow = rows.length ? rows[rows.length - 1] : null;
    let sd = null;
    let sdRoi = null;
    if (!NO_MOTION && ff && existsSync(file) && prevRow && scene >= 0 && prevRow.scene === scene && prevRow.ok) {
      sd = await structDiff(ff, prevRow.file, file);
      if (ROI) sdRoi = await structDiff(ff, prevRow.file, file, ROI);
    }

    // 重复渲染一致性：同一个 t 再渲染一次，与上一帧逐像素比。不缩小 ——
    // 非确定性常常只体现在少数像素上（乱序粒子、闪一帧的光晕），缩小会被平均掉。
    let det = null;
    if (DETERMINISM && ff && existsSync(file)) {
      await ab(["eval", "--stdin"], { input: seekJs, logFile: LOG });
      await sleep(SETTLE);
      const rep = join(REPEAT_DIR, name);
      await ab(shotArgs(rep), { logFile: LOG });
      if (existsSync(rep)) det = await pixelDiff(ff, file, rep);
    }

    // 判定值：给了 ROI 就只看主图那块（整帧 Δ 会在「主图只占一角」的场景上低估）
    const judge = sdRoi !== null ? sdRoi : sd;
    rows.push({ i, t: s.t, name: s.name || "", file, lum, blank, blown, sd, sdRoi, judge, det, scene, ok: existsSync(file) });
    const tag = !existsSync(file) ? "⚠ 截图缺失" : blank ? "⚠ 全黑" : blown ? "⚠ 爆白" : "";
    const sdTag = judge === null ? "    -  " : `Δ ${judge.toFixed(2).padStart(5)}${judge < MOTION_MIN ? " ·" : " "}`;
    const roiTag = ROI && sd !== null && sdRoi !== null ? ` (整帧 ${sd.toFixed(2)})` : "";
    const detTag = det === null ? "" : `  重复 ${det > DET_TOL ? "⚠ " : ""}${det.toFixed(3)}`;
    console.log(`  ${name}  t=${String(s.t).padStart(6)}s  ${lum === null ? "  -  " : `YAVG ${lum.toFixed(1).padStart(5)}`}  ${sdTag}${roiTag}  ${s.name || ""}  ${tag}${detTag}`);
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

  // 场景级判定：场内相邻采样点的**最大**结构差低于阈值，说明这一镜从头到尾
  // 主结构没变过 —— 只有粒子/扫描线这类细节在动。手册 §13.1 最后一问
  //（「这一镜能否被直接替换成普通标题页而不损失任何信息」）在这里变成可计算的量。
  const byScene = new Map();
  const bySceneWhole = new Map();
  rows.forEach((x) => {
    if (x.scene < 0) return;
    if (x.judge !== null) {
      if (!byScene.has(x.scene)) byScene.set(x.scene, []);
      byScene.get(x.scene).push(x.judge);
    }
    if (x.sd !== null) {
      if (!bySceneWhole.has(x.scene)) bySceneWhole.set(x.scene, []);
      bySceneWhole.get(x.scene).push(x.sd);
    }
  });
  // 每个场景的第一个 Δ 量的是「入场段」—— 标题与主图从无到有，它几乎必然很大
  // （实测 4~7，而镜内段只有 0.1~0.8）。把它算进取值，所有场景都会判成"有运动"，
  // 判据直接失效。所以取镜内段（其余采样点）的最大值；只采到两点的短镜头没有
  // 镜内段，退回全部。
  const sceneRows = [...byScene.entries()].map(([idx, all]) => {
    const s0 = scenes[idx] || {};
    const interior = all.slice(1);
    const use = interior.length ? interior : all;
    const maxDiff = Math.max(...use);
    const whole = bySceneWhole.get(idx);
    const wholeInterior = whole ? whole.slice(1) : [];
    return {
      scene: idx,
      label: s0.label || `场 ${idx + 1}`,
      from: Number(s0.a ?? 0),
      to: Number((Number.isFinite(s0.b) ? s0.b : (scenes[idx + 1] ? scenes[idx + 1].a : dur)) ?? 0),
      samples: all.length + 1,
      entryDiff: Number(all[0].toFixed(3)),
      maxDiff: Number(maxDiff.toFixed(3)),
      maxDiffWhole: whole ? Number(Math.max(...(wholeInterior.length ? wholeInterior : whole)).toFixed(3)) : null,
      still: maxDiff < MOTION_MIN,
    };
  });
  const stills = sceneRows.filter((x) => x.still);
  // 按镜内 Δ 降序排一份：让人一眼看到"哪个镜头最静"，而不只是通过/不通过
  const ranked = [...sceneRows].sort((a, b) => b.maxDiff - a.maxDiff);
  const detBad = rows.filter((x) => x.det !== null && x.det > DET_TOL);

  const report = {
    url: URL,
    contract: `window.${probe.which}`,
    duration: dur,
    viewport: [W, H],
    motionThreshold: MOTION_MIN,
    roi: ROI,
    determinism: DETERMINISM ? { tolerance: DET_TOL, violations: detBad.map((x) => ({ t: x.t, name: x.name, diff: x.det })) } : null,
    generatedAt: new Date().toISOString(),
    shots: rows.map((x) => ({ t: x.t, name: x.name, scene: x.scene, file: basename(x.file), lum: x.lum, structDiff: x.sd, roiDiff: x.sdRoi, determinismDiff: x.det, blank: x.blank, blown: x.blown })),
    scenes: sceneRows,
    pageErrors: errs,
    contactSheet: sheet ? basename(sheet) : null,
  };
  writeFileSync(join(OUT, "report.json"), JSON.stringify(report, null, 2));
  // 截图文件名是纯序号（ffmpeg 序列输入的要求），人类可读的名字在这里对上号
  writeFileSync(
    join(SHOTS_DIR, "manifest.json"),
    JSON.stringify(rows.map((x) => ({ file: basename(x.file), t: x.t, name: x.name })), null, 2),
  );

  const fmtLum = (x) => (x.lum === null ? "—" : x.lum.toFixed(1));
  const fmtD = (v) => (v === null || v === undefined ? "—" : v.toFixed(2));
  const fmtDet = (v) => (v === null || v === undefined ? "—" : (v > DET_TOL ? "⚠ " : "") + v.toFixed(3));
  const frameCells = (x, i) => {
    const cells = [`${i + 1}`, `${x.t}`, fmtLum(x)];
    if (ROI) cells.push(fmtD(x.sd), fmtD(x.sdRoi));
    else cells.push(fmtD(x.sd));
    if (DETERMINISM) cells.push(fmtDet(x.det));
    cells.push(!x.ok ? "截图缺失" : x.blank ? "⚠ 全黑" : x.blown ? "⚠ 爆白" : "ok", x.name || "");
    return `| ${cells.join(" | ")} |`;
  };
  const frameHeader = [`#`, `t (s)`, `平均亮度`];
  if (ROI) frameHeader.push(`整帧 Δ`, `主图 ROI Δ`);
  else frameHeader.push(`结构差 Δ`);
  if (DETERMINISM) frameHeader.push(`重复渲染差`);
  frameHeader.push(`判定`, `名称`);

  const md = [
    `# 逐帧验收报告`,
    ``,
    `- 页面：\`${URL}\``,
    `- 契约：\`${report.contract}\``,
    `- 时长：${dur ? dur.toFixed(2) + "s" : "未知"}　视口：${W}×${H}`,
    `- 时点：${rows.length} 个（每镜 ${PER_SCENE} 点）　全黑：${blanks.length}　爆白：${blown.length}　截图缺失：${missing.length}`,
    `- 页面报错：${errs.length}　无主运动的镜头：${stills.length}${DETERMINISM ? `　重复渲染不一致：${detBad.length}` : ""}`,
    ROI ? `- 主图 ROI：x ${ROI.x} · y ${ROI.y} · w ${ROI.w} · h ${ROI.h}（归一化）　判定采用 **ROI Δ**` : null,
    ``,
    `## 逐帧`,
    ``,
    `| ${frameHeader.join(" | ")} |`,
    `|${frameHeader.map(() => "---").join("|")}|`,
    ...rows.map((x, i) => frameCells(x, i)),
    ``,
    `> **平均亮度** = ffmpeg \`signalstats\` 的 YAVG（限制范围 16–235，纯黑 16、纯白 235）。`,
    `> 判据：≤18 视为全黑，≥235 视为爆白 —— 这两类通常是「这一拍没渲染」或「叠了白蒙版」。`,
    ``,
    `> **结构差 Δ** = 与同场景上一个采样点比较：两帧各缩到 ${SDW}×${SDH} 后求平均像素差。`,
    `> 先缩小是为了把「局部细节在动」（粒子、扫描线、光晕呼吸）平均掉，只留下`,
    `> 「结构性变化」（地平线位移、主图缩放、整块文案更换）。Δ < ${MOTION_MIN} 说明这一段画面`,
    `> 主结构没变 —— 看着有生气，但观众没拿到新信息。`,
    ``,
    ROI
      ? [
          `> **主图 ROI Δ** = 同样的算法，但先把「主图所在的那块画面」裁出来再算。`,
          `> 起因是整帧 Δ 的第二个失效模式：**主图在动，但主图只占画面一角**，`,
          `> 大面积静止背景把变化平均掉了。实测（一名外部样片）ROI 内幅值是整帧的 1.5~3.1 倍，`,
          `> 足以把「整帧看着没动」的场翻成「其实一直在动」。给了 --roi 时**判定以 ROI Δ 为准**。`,
          `> ⚠ ROI 会改变量纲：${MOTION_MIN} 这个门槛是按整帧校准的，ROI 模式下必须重新标定。`,
          ``,
        ].join("\n")
      : null,
    DETERMINISM
      ? [
          `> **重复渲染差** = 同一个 t 连渲染两次，两帧在**原始分辨率**下求平均像素差（不缩小）。`,
          `> 缩到 ${SDW}×${SDH} 会把「少数像素不一致」平均掉，而那正是非确定性的常见形态：`,
          `> \`Math.random()\`、\`Date.now()\`、\`x += v\` 累加、相不受控的无限动画、`,
          `> 第二次绘制才回来的异步数据。真确定的实现这个值是 0；> ${DET_TOL} 即判定不一致。`,
          ``,
        ].join("\n")
      : null,
  ];
  if (sceneRows.length) {
    const head = ROI ? `| 镜头 | 区间 (s) | 采样 | 入场段 Δ | 镜内最大 ROI Δ | 镜内最大整帧 Δ | 放大倍数 | 判定 |`
                     : `| 镜头 | 区间 (s) | 采样 | 入场段 Δ | 镜内最大 Δ | 判定 |`;
    const cols = ROI ? 8 : 6;
    md.push(
      `## 镜头运动`,
      ``,
      head,
      `|${Array.from({ length: cols }, () => "---").join("|")}|`,
      ...ranked.map((x) => {
        if (!ROI) return `| ${x.label} | ${x.from}–${x.to} | ${x.samples} | ${x.entryDiff} | **${x.maxDiff}** | ${x.still ? "⚠ 无主运动" : "ok"} |`;
        const ratio = x.maxDiffWhole && x.maxDiffWhole > 1e-9 ? (x.maxDiff / x.maxDiffWhole).toFixed(2) + "×" : "—";
        return `| ${x.label} | ${x.from}–${x.to} | ${x.samples} | ${x.entryDiff} | **${x.maxDiff}** | ${x.maxDiffWhole} | ${ratio} | ${x.still ? "⚠ 无主运动" : "ok"} |`;
      }),
      ``,
      `> **入场段 Δ** 量的是场景开头「标题与主图从无到有」的变化，**不参与判定** ——`,
      `> 它几乎必然很大（实测 4~7），算进去会让判据整个失效。**镜内最大 Δ** 才是`,
      `> 「这一拍有没有主运动」的依据（同组合下镜内段只有 0.1~0.8）。`,
      `> 表按镜内 Δ 降序排列，最静的排在最前。`,
      ROI ? `> **放大倍数** = 镜内最大 ROI Δ ÷ 镜内最大整帧 Δ。小于 1 说明 ROI 选得比整帧还静，要换个区域。` : null,
      ``,
    );
  }
  md.push(
    `## 页面报错`,
    ``,
    errs.length ? errs.map((e) => `- ${e}`).join("\n") : "（无）",
    ``,
  );
  const mdText = md.filter((x) => x !== null && x !== undefined).join("\n");
  writeFileSync(join(OUT, "report.md"), mdText);

  /* 7) 结论 */
  console.log("");
  if (errs.length) console.error(`✗ 页面报错 ${errs.length} 条`); else console.log("✓ 页面零报错");
  if (missing.length) console.error(`✗ ${missing.length} 帧没截到`);
  if (blanks.length) console.error(`⚠ ${blanks.length} 帧近乎全黑：${blanks.map((b) => `t=${b.t}`).join(", ")}`);
  if (blown.length) console.error(`⚠ ${blown.length} 帧近乎爆白：${blown.map((b) => `t=${b.t}`).join(", ")}`);
  if (ranked.length) {
    console.log(`镜头运动（镜内最大 ${ROI ? "ROI " : ""}Δ，门槛 ${MOTION_MIN}）：${ranked.map((s) => `${s.still ? "⚠ " : ""}${s.label} ${s.maxDiff}${ROI && s.maxDiffWhole ? `(整帧 ${s.maxDiffWhole})` : ""}`).join(" · ")}`);
  }
  if (stills.length) console.error(`⚠ ${stills.length} 个镜头镜内结构几乎不变（Δ < ${MOTION_MIN}）：${stills.map((s) => s.label).join("、")}`);
  if (DETERMINISM) {
    if (detBad.length) console.error(`✗ ${detBad.length} 帧重复渲染不一致（> ${DET_TOL}）：${detBad.map((x) => `t=${x.t} 差 ${x.det.toFixed(3)}`).join(" · ")}`);
    else console.log(`✓ 重复渲染一致（${rows.filter((x) => x.det !== null).length} 帧，同一时刻两次渲染像素相同）`);
  }
  if (ROI) console.error(`· ROI 模式：判定用 ROI Δ，但门槛 ${MOTION_MIN} 是按整帧校准的 —— 请按 ROI 分布重新标定`);
  console.log(`报告  ${join(OUT, "report.md")}`);
  console.log(`截图  ${SHOTS_DIR}`);
  if (sheet) console.log(`印相  ${sheet}`);

  if (errs.length && !ALLOW_ERR) process.exit(1);
  if (FAIL_ON_BLANK && (blanks.length || blown.length)) process.exit(1);
  if (FAIL_ON_STILL && stills.length) process.exit(1);
  if (flags.has("fail-on-nondeterministic") && detBad.length) process.exit(1);
}

main().catch((e) => {
  console.error("意外失败：", e);
  process.exit(1);
});
