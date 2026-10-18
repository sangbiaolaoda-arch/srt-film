// 浏览器一致性核对（方案 §4.2 层 B）：在关键时点读**真实 SVG 几何**，与 IR 预测比对。
//
// 为什么必须有这一层：IR 是纯函数推演，证明「计划自洽」；只有真实渲染能证明
// 「计划就是画面」。两层互补，谁都不能替代谁（方案 §0 原则 C）。
//
// 分工（为什么拆成两个文件）：浏览器启动必须走 node 直接跑（经 vite SSR 的
// run-ts.mjs 跑时，子进程 spawn 拿不到句柄，Chrome 起不来 —— 实测）。
// 所以：
//   · 本文件（.mjs）负责 dev server + CDP + 采集真实几何 → 写 raw JSON；
//   · tools/motion-ir-predict.ts 读那份 JSON，用同一份 IR 算出预测值并比对。
//
// 测量口径：getBoundingClientRect 相对离屏 svg 换算回 1280×720 逻辑坐标。
// 不用 getBBox —— 它不含祖先 transform（而 GSAP 恰好只改祖先 transform）。
// 不用隐藏 svg 的视口绝对坐标 —— 舞台在 left:-20000px，绝对坐标没有意义。

import { spawn, execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
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

/** 与 IR 夹具同一条旁白（基准语料 13）：保证两边验算的是同一个东西。 */
import { readFileSync } from "node:fs";
const SRT = readFileSync(resolve(ROOT, "examples", "13-compare-book.srt"), "utf8");

const NODE = { grpPrimary: "grp-primary", grpSecondary: "grp-secondary", figPrimary: "fig-primary", figSecondary: "fig-secondary", labelPrimary: "label-primary", labelSecondary: "label-secondary" };

/** 页面内探针：读某个元素的世界包围盒，换算回 1280×720 逻辑坐标。 */
const PROBE = `
window.__mgb = {
  box: (sel) => {
    const el = window.__stage.svg.querySelector(sel);
    if (!el) return null;
    const svg = window.__stage.svg;
    const r = svg.getBoundingClientRect();
    const b = el.getBoundingClientRect();
    if (b.width === 0 && b.height === 0) return null;
    const sx = 1280 / r.width, sy = 720 / r.height;
    return { x: (b.left - r.left) * sx, y: (b.top - r.top) * sy, w: b.width * sx, h: b.height * sy };
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
        layoutId: window.__stage && window.__stage.shots[0] ? window.__stage.shots[0].layout.id : null,
      };
    `);
    if (!gate.stage) {
      console.error("✗ 规划没建起舞台：", gate.errs.slice(0, 3).join(" | "));
      throw new Error("无舞台");
    }
    console.log(`✓ 舞台就绪（${gate.shots} 拍，版式 ${gate.layoutId}）${gate.errs.length ? `；门禁问题：${gate.errs.slice(0, 2).join(" | ")}` : ""}`);

    await b.eval(PROBE);

    // 关键时点：各 move 的开始/结束/中段（与 IR 夹具同一时基 at=0, dur=4.0）。
    // 取样从 0.02 起而不是 0 —— GSAP 的零时长 set 在 playhead 恰好停在 0 时不渲染，
    // 第一帧组还停在终位；但此刻整层 autoAlpha=0，画面无差别。把这一渲染边界
    // 排除在样点外，免得校准把「seek(0) 的渲染时机」误读成「计划与画面漂移」。
    const times = [0.02, 0.08, 0.24, 0.4, 0.66, 0.98, 1.25, 1.53, 1.9, 2.6, 3.0, 3.99];
    // 关键时点截图：入场中段 / 让位中 / 主体入场中 / 落位 / 保持尾，各存一张 PNG。
    // 机器指标不能替代视觉判断（方案 §0 原则 D），这些帧就是给人看的那一份。
    const SHOT_TIMES = new Set([0.24, 0.66, 1.25, 1.9, 3.99]);
    const shotDir = resolve(OUT, "frames");
    mkdirSync(shotDir, { recursive: true });
    const rows = [];
    for (const t of times) {
      const r = await b.eval(`
        return (() => {
          const s = window.__stage;
          s.pause();
          s.seek(${t});
          const pick = (id) => window.__mgb.box('[data-group="' + id + '"]');
          return {
            t: ${t},
            ${JSON.stringify(NODE.grpPrimary)}: pick(${JSON.stringify(NODE.grpPrimary)}),
            ${JSON.stringify(NODE.grpSecondary)}: pick(${JSON.stringify(NODE.grpSecondary)}),
          };
        })()
      `);
      rows.push(r);
      console.log(
        `  t=${String(t).padStart(5)}s  主体 x=${r[NODE.grpPrimary] ? r[NODE.grpPrimary].x.toFixed(1) : "—"}  参照 x=${r[NODE.grpSecondary] ? r[NODE.grpSecondary].x.toFixed(1) : "—"}`,
      );
      if (SHOT_TIMES.has(t)) {
        // 等舞台的 rAF 循环把 seek 后的画面画进可见 canvas（seek 只置 dirty）
        await b.eval(`return new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 120))));`);
        // 只截可见画布（画面本体），不带页面其他 chrome
        const rectJson = await b.eval(`
          return (() => { const r = window.__stage.canvas.getBoundingClientRect(); return JSON.stringify({x: r.x, y: r.y, width: r.width, height: r.height}); })();
        `);
        const rect = JSON.parse(rectJson);
        const png = await b.shot({ x: rect.x, y: rect.y, width: rect.width, height: rect.height, scale: 1 });
        writeFileSync(resolve(shotDir, `t-${String(t).replace(".", "_")}.png`), Buffer.from(png, "base64"));
      }
    }

    writeFileSync(
      resolve(OUT, "browser-frames.json"),
      JSON.stringify({ srt: SRT, shotIndex: 0, fps: 30, times, rows }, null, 2),
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
