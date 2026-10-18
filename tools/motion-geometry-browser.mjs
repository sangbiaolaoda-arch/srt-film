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

/** 被采集的语料（argv[2]，缺省 = 比较基准切片）；--shot N 选第 N 个语义拍（缺省 0）。 */
const SRT_FILE = process.argv[2] ?? "examples/13-compare-book.srt";
const SHOT_ARG = (() => {
  const i = process.argv.indexOf("--shot");
  return i >= 0 && process.argv[i + 1] ? Number(process.argv[i + 1]) : 0;
})();
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
  /** 全部带 semantic 的拍号（升序）；--shot N 选其中第 N 个 */
  semanticIndices: () => window.__stage.shots.map((s, i) => (s.semantic ? i : -1)).filter((i) => i >= 0),
  /** 组的世界包围盒，按 data-group id 归键；同时给出该拍图层的实际缩放（退相机用）。 */
  groups: (idx) => {
    const layer = window.__stage.svg.querySelector('[data-layer="' + idx + '"]');
    if (!layer) return null;
    const svg = window.__stage.svg;
    const r = svg.getBoundingClientRect();
    const sx = 1280 / r.width, sy = 720 / r.height;
    const lr = layer.getBoundingClientRect();
    // 图层自身宽度 ÷ 1280 = 机位缩放（相机作用于整层，逐帧一致）—— 用它把世界坐标
    // 还原成图层本地坐标，比对才不受机位影响（相机是独立的第二层变换，不该算编排漂移）。
    const camScale = Math.min(2, Math.max(0.1, (lr.width * sx) / 1280));
    const out = {};
    for (const el of layer.querySelectorAll('[data-group]')) {
      const b = el.getBoundingClientRect();
      if (b.width === 0 && b.height === 0) continue;
      const x = (b.left - r.left) * sx, y = (b.top - r.top) * sy;
      const w = b.width * sx, h = b.height * sy;
      // 逆相机：绕 (640,360) 缩放。锚点偏移在本地坐标里是常数，位移增量比对自动抵消。
      out[el.getAttribute('data-group')] = {
        x: 640 + (x - 640) / camScale,
        y: 360 + (y - 360) / camScale,
        w: w / camScale,
        h: h / camScale,
      };
    }
    return { camScale, groups: out };
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
    // 180s：本机可能同时有渲染类重任务（remotion/ffmpeg）抢 CPU，vite 冷启动
    // 建模块图 + 浏览器拉依赖会远超 60s（实测挂起过）。load 慢不等于坏。
    await b.open(`http://127.0.0.1:${DEV_PORT}/`, 180000);
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
    const semList = await b.eval(`return window.__mgb.semanticIndices();`);
    if (!semList || semList.length === 0) {
      console.error(`✗ ${SRT_FILE} 里没有语义接管拍（plan 没产 semantic 切片）—— 层 B 无从比对`);
      throw new Error("无语义拍");
    }
    if (SHOT_ARG >= semList.length) {
      console.error(`✗ --shot ${SHOT_ARG} 越界：本语料只有 ${semList.length} 个语义拍（索引 0..${semList.length - 1}）`);
      throw new Error("shot 参数越界");
    }
    const semIdx = semList[SHOT_ARG];
    const meta = await b.eval(`
      return (() => {
        const s = window.__stage.shots[${semIdx}];
        const mp = { at: s.tlStart ?? s.start, dur: Math.max(s.end - s.start, 1.2) };
        // 图层级退场起点：IR 只建模语义编排（moves），不含 enter/exit 图层 tween ——
        // 采样必须停在 exit 之前，否则把「图层滑出」当成编排漂移。
        const exitAt = s.plan?.exit?.at ?? mp.at + mp.dur;
        return JSON.stringify({ layoutId: s.layout.id, kind: s.semantic.kind, template: s.semantic.plan.templateId, settle: s.semantic.settleOffset, exitRel: Number((exitAt - mp.at).toFixed(4)), ...mp });
      })()
    `);
    const m = JSON.parse(meta);
    console.log(`✓ 语义拍 #${semIdx}（第 ${SHOT_ARG + 1}/${semList.length} 个）：${m.layoutId}（${m.kind}/${m.template}）· at=${m.at.toFixed(2)}s dur=${m.dur.toFixed(2)}s · ${gate.shots} 拍`);

    const shotDir = resolve(OUT, "frames");
    mkdirSync(shotDir, { recursive: true });
    // 采样点 = 编排相对时点 × compress 系数（与各切片 compress(dur, base) 同一公式；
    // base 从计划读 settleOffset）。线性缩放会把样点错开编排节点，短拍尤其明显。
    const k = Math.min(1, Math.max(0.8, Math.min(m.dur - 0.3, 2.2)) / m.settle);
    const maxRel = Math.max(0.02, m.exitRel - 0.05); // 退场前停采，留 0.05s 缓冲
    const rows = [];
    for (const rt of TIMES) {
      const rel = rt * k;
      if (rel >= maxRel) break;
      const t = Number((m.at + rel).toFixed(4));
      const boxes = await b.eval(`
        return (() => {
          const s = window.__stage;
          s.pause();
          s.seek(${t});
          return JSON.stringify(window.__mgb.groups(${semIdx}));
        })()
      `);
      const parsed = JSON.parse(boxes);
      rows.push({ t, boxes: parsed.groups, camScale: parsed.camScale });
      const ids = Object.keys(parsed.groups);
      console.log(
        `  t=${String(t).padStart(6)}s cam=${parsed.camScale.toFixed(4)}  ` + ids.map((id) => `${id} x=${parsed.groups[id].x.toFixed(1)}`).join("  "),
      );
      if (SHOT_TIMES.has(rt)) {
        // 等舞台的 rAF 循环把 seek 后的画面画进可见 canvas（seek 只置 dirty）
        await b.eval(`return new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 120))));`);
        const rectJson = await b.eval(`
          return (() => { const r = window.__stage.canvas.getBoundingClientRect(); return JSON.stringify({x: r.x, y: r.y, width: r.width, height: r.height}); })();
        `);
        const rect = JSON.parse(rectJson);
        const png = await b.shot({ x: rect.x, y: rect.y, width: rect.width, height: rect.height, scale: 1 });
        writeFileSync(resolve(shotDir, `${m.kind}-t-${String(rt).replace(".", "_")}.png`), Buffer.from(png, "base64"));
      }
    }

    writeFileSync(
      resolve(OUT, "browser-frames.json"),
      JSON.stringify({ srtFile: SRT_FILE, srt: SRT, shotIndex: semIdx, fps: 30, times: rows.map((r) => r.t), rows }, null, 2),
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
