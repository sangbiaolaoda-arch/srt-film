// 浏览器一致性核对（方案 §4.2 层 B）：在关键时点读**真实 SVG 几何**，与 IR 预测比对。
//
// 为什么必须有这一层：IR 是纯函数推演，证明「计划自洽」；只有真实渲染能证明
// 「计划就是画面」。两层互补，谁都不能替代谁（方案 §0 原则 C）。
//
// 分工（为什么拆成两个文件）：浏览器启动必须走 node 直接跑（经 vite SSR 的
// run-ts.mjs 跑时，子进程 spawn 拿不到句柄，Chrome 起不来 —— 实测）。
// 所以：
//   · 本文件（.mjs）负责 dev server + CDP + 采集真实几何 → 写 browser-frames.json；
//   · tools/motion-ir-predict.ts 读那份 JSON，用 plan()+buildMotionSchedule 重建
//     同一份 IR 预测并比对（时基与 qa:motion 门禁严格同源）。
//
// 采集对象不写死：载入 SRT 后找**第一个带 semantic 的拍**，量它图层里的全部
// [data-group]（compare 量两组、causal 量三组 —— 探针按 DOM 属性走，与事件类型无关）。
//
// 测量口径：getBoundingClientRect 相对离屏 svg 换算回 1280×720 逻辑坐标。
// 不用 getBBox —— 它不含祖先 transform（而 GSAP 恰好只改祖先 transform）。
// 不用隐藏 svg 的视口绝对坐标 —— 舞台在 left:-20000px，绝对坐标没有意义。

import { spawn, execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { run } from "./cdp.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = resolve(ROOT, ".tmp/motion-audit");
mkdirSync(OUT, { recursive: true });
// 两个端口必须分开（初版踩的坑）：dev server 与 Chrome 的 --remote-debugging-port
// 共用一个端口时，vite 先占了口，Chrome 绑不上 → waitPort 永远超时，
// 报错却是「CDP 端口未就绪」—— 误导排查方向。phase10-qa 一直是 5199/9333 分开的。
const DEV_PORT = 5198;
const PORT = Number(process.env.MGB_CDP_PORT ?? 9338);

/** 被采集的语料（argv[2]，缺省 = 比较基准切片）。 */
const SRT_FILE = process.argv[2] ?? "examples/13-compare-book.srt";
const SRT = readFileSync(resolve(ROOT, SRT_FILE), "utf8");

/** 采样时点：覆盖 compare（落位 1.9）与 causal（落位 1.55）两套模板的
 *  move 开始/结束/中段 + 保持尾。比对侧只用到 holds 起点之后的帧做参照。 */
const TIMES = [0.02, 0.08, 0.24, 0.4, 0.66, 0.98, 1.25, 1.53, 1.55, 1.9, 2.6, 3.0, 3.99];
/** 存关键帧 PNG 的时点（入场中 / 让位中 / 主体入场中 / 落位 / 保持尾）。 */
const SHOT_TIMES = new Set([0.24, 0.66, 1.25, 1.9, 3.99]);

/** 与 phase10-qa 同一套 dev server 启法（--host 127.0.0.1 是必须的，见那边注释）。 */
function startServer(port) {
  return spawn(
    process.execPath,
    [join(ROOT, "node_modules/vite/bin/vite.js"), "--port", String(port), "--strictPort", "--host", "127.0.0.1"],
    { cwd: ROOT, stdio: ["ignore", "pipe", "pipe"] },
  );
}

async function waitServer(port, timeoutMs = 60000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/`);
      if (r.ok) return true;
    } catch {
      /* 未就绪 */
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  return false;
}

/** 端口被上次跑挂的进程占着时 vite 会 strictPort 退出 —— 先清掉（只认本机该端口）。 */
async function freePort(port) {
  if (process.platform !== "win32") return;
  try {
    const out = execFileSync("netstat", ["-ano", "-p", "TCP"], { encoding: "utf8" });
    const pids = new Set(
      out
        .split("\n")
        .filter((l) => l.includes(`127.0.0.1:${port}`) && l.includes("LISTENING"))
        .map((l) => l.trim().split(/\s+/).pop())
        .filter((p) => /^\d+$/.test(p)),
    );
    for (const pid of pids) {
      if (Number(pid) === process.pid) continue;
      try {
        execFileSync("taskkill", ["/F", "/T", "/PID", pid], { stdio: "ignore" });
      } catch {
        /* 已退出 */
      }
    }
    if (pids.size > 0) await new Promise((r) => setTimeout(r, 1200));
  } catch {
    /* netstat 不可用就跳过 */
  }
}

async function warm(port) {
  for (const p of ["/", "/src/ui/main.ts", "/node_modules/.vite/deps/mp4-muxer.js"]) {
    try {
      await fetch(`http://127.0.0.1:${port}${p}`, { signal: AbortSignal.timeout(90000) });
    } catch {
      /* 预热失败不算致命 */
    }
  }
}

/** 页面内探针：量语义拍图层里所有 [data-group] 的世界包围盒（逻辑坐标）。 */
const PROBE = `
window.__mgb = {
  /** 找到第一个带 semantic 的拍号；没有返回 -1 */
  semanticIndex: () => window.__stage.shots.findIndex((s) => s.semantic),
  /** 该拍图层内全部组的包围盒，按 data-group id 归键 */
  groups: (idx) => {
    const layer = window.__stage.svg.querySelector('[data-layer="' + idx + '"]');
    if (!layer) return null;
    const svg = window.__stage.svg;
    const r = svg.getBoundingClientRect();
    const sx = 1280 / r.width, sy = 720 / r.height;
    const out = {};
    for (const el of layer.querySelectorAll('[data-group]')) {
      const b = el.getBoundingClientRect();
      if (b.width === 0 && b.height === 0) continue;
      out[el.getAttribute('data-group')] = { x: (b.left - r.left) * sx, y: (b.top - r.top) * sy, w: b.width * sx, h: b.height * sy };
    }
    return out;
  },
};
"ok";
`;

let exitCode = 0;
let server;
try {
  await freePort(DEV_PORT);
  server = startServer(DEV_PORT);
  if (!(await waitServer(DEV_PORT))) throw new Error(`dev server 未就绪（http://127.0.0.1:${DEV_PORT}/）`);
  console.log(`dev server 就绪 http://127.0.0.1:${DEV_PORT}/`);
  await warm(DEV_PORT);

  await run(async (b) => {
    await b.open(`http://127.0.0.1:${DEV_PORT}/`);
    await b.eval(`
      for (let i = 0; i < 100; i++) {
        if (document.getElementById('btn-load')) break;
        await new Promise(r => setTimeout(r, 100));
      }
      return true;
    `);
    const gate = await b.eval(`
      const ta = document.getElementById('srt-input');
      ta.value = ${JSON.stringify(SRT)};
      document.getElementById('btn-load').click();
      for (let i = 0; i < 300 && !window.__stage; i++) {
        await new Promise(r => setTimeout(r, 200));
        if (i % 25 === 24) document.getElementById('btn-load').click();
      }
      const rep = document.getElementById('gate-report');
      const items = rep && !rep.hidden ? Array.from(rep.querySelectorAll('li')) : [];
      return {
        stage: !!window.__stage,
        errs: items.filter(li => !li.classList.contains('ok') && !li.classList.contains('warn')).map(li => li.textContent),
        shots: window.__stage ? window.__stage.shots.length : 0,
      };
    `);
    if (!gate.stage) {
      console.error("✗ 规划没建起舞台：", gate.errs.slice(0, 3).join(" | "));
      throw new Error("无舞台");
    }
    await b.eval(PROBE);
    const semIdx = await b.eval(`return window.__mgb.semanticIndex();`);
    if (semIdx < 0) {
      console.error(`✗ ${SRT_FILE} 里没有语义接管拍（plan 没产 semantic 切片）—— 层 B 无从比对`);
      throw new Error("无语义拍");
    }
    const meta = await b.eval(`
      return (() => {
        const s = window.__stage.shots[${semIdx}];
        return JSON.stringify({ layoutId: s.layout.id, kind: s.semantic.kind, template: s.semantic.plan.templateId, at: s.tlStart ?? s.start, end: s.end });
      })()
    `);
    const m = JSON.parse(meta);
    console.log(`✓ 语义拍 #${semIdx}：${m.layoutId}（${m.kind}/${m.template}）· ${gate.shots} 拍`);

    const shotDir = resolve(OUT, "frames");
    mkdirSync(shotDir, { recursive: true });
    const rows = [];
    for (const t of TIMES) {
      const boxes = await b.eval(`
        return (() => {
          const s = window.__stage;
          s.pause();
          s.seek(${t});
          return JSON.stringify(window.__mgb.groups(${semIdx}));
        })()
      `);
      const parsed = JSON.parse(boxes);
      rows.push({ t, boxes: parsed });
      const ids = Object.keys(parsed);
      console.log(
        `  t=${String(t).padStart(5)}s  ` + ids.map((id) => `${id} x=${parsed[id].x.toFixed(1)}`).join("  "),
      );
      if (SHOT_TIMES.has(t)) {
        // 等舞台的 rAF 循环把 seek 后的画面画进可见 canvas（seek 只置 dirty）
        await b.eval(`return new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 120))));`);
        const rectJson = await b.eval(`
          return (() => { const r = window.__stage.canvas.getBoundingClientRect(); return JSON.stringify({x: r.x, y: r.y, width: r.width, height: r.height}); })();
        `);
        const rect = JSON.parse(rectJson);
        const png = await b.shot({ x: rect.x, y: rect.y, width: rect.width, height: rect.height, scale: 1 });
        writeFileSync(resolve(shotDir, `${m.kind}-t-${String(t).replace(".", "_")}.png`), Buffer.from(png, "base64"));
      }
    }

    writeFileSync(
      resolve(OUT, "browser-frames.json"),
      JSON.stringify({ srtFile: SRT_FILE, srt: SRT, shotIndex: semIdx, fps: 30, times: TIMES, rows }, null, 2),
    );
    console.log(`\n  采集完成 → .tmp/motion-audit/browser-frames.json（下一步由 motion-ir-predict.ts 比对）`);
  }, { port: PORT });
} catch (e) {
  console.error("浏览器核对失败：", e instanceof Error ? e.message : e);
  exitCode = 1;
} finally {
  server?.kill();
}

process.exit(exitCode);
