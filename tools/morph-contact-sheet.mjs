// 真实浏览器像素取证：用零依赖 CDP（tools/cdp.mjs）驱动本地 vite dev server 上的 app，
// 载入 10-reasoning-chain.srt，在三条新承接边（evidence→consequence /
// comparison→consequence / consequence→conclusion）的转场窗口内逐点 seek + 截图，
// 拼成 contact-sheet。这是方法论 §0「代码能跑≠画面合格」的落地：verify-morph 探针
// 只验了渲染函数的数学轨迹，这里验「真实浏览器里观众真的看到继承标记迁移」。
//
// 依赖：本地 Chrome（cdp.mjs 自动找）/ ffmpeg（拼图）。不依赖 agent-browser。
// 用法：node tools/morph-contact-sheet.mjs
import { spawn } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { run } from "./cdp.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SRT = readFileSync(resolve(ROOT, "examples/10-reasoning-chain.srt"), "utf-8");
// 三条承接边的转场窗口（来自 plan 的 tlStart 推导）
const WINDOWS = [
  { label: "evidence→consequence", start: 11.16 },
  { label: "comparison→consequence", start: 18.60 },
  { label: "consequence→conclusion", start: 22.32 },
];
const SAMPLES = [0, 0.18, 0.36, 0.55]; // 窗口内 4 个点
const OUT = resolve(ROOT, ".tmp/morph-sheet");
const DEV_PORT = 5201;
const DEV_URL = `http://127.0.0.1:${DEV_PORT}/`;

async function waitHttp(url, timeoutMs = 90000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try { const r = await fetch(url); if (r.ok) return; } catch {}
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error(`dev server 未就绪: ${url}`);
}

// 1) 起 vite dev server（用本地 node 直跑 vite 的 bin，绕开 npx/shell 转义问题）
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
const viteBin = resolve(ROOT, "node_modules/vite/bin/vite.js");
const dev = spawn(process.execPath, [viteBin, "--host", "127.0.0.1", "--port", String(DEV_PORT), "--strictPort"], {
  cwd: ROOT, stdio: "ignore",
});
let exitCode = 0;
try {
  await waitHttp(DEV_URL);
  // 2) 驱动浏览器
  await run(async (b) => {
    await b.open(DEV_URL);
    // 视口加大：stage 是 16:9，1440 宽下舞台约 1280×720 全部可见
    await b.send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 940, deviceScaleFactor: 1, mobile: false });
    // 载入语料 + 等 __stage
    await b.eval(`(function(){
      const ta = document.getElementById('srt-input');
      ta.value = ${JSON.stringify(SRT)};
      document.getElementById('btn-load').click();
    })()`);
    const deadline = Date.now() + 30000;
    while (Date.now() < deadline) {
      const ok = await b.eval(`return !!window.__stage && window.__stage.duration > 0;`);
      if (ok) break;
      await new Promise((r) => setTimeout(r, 400));
    }
    const dur = await b.eval(`return window.__stage.duration;`);
    // stage 元素的视口矩形（截它而不是整页 —— 角落标记在舞台里，整页截图连门牌都看得见但标记看不清）
    const rect = await b.eval(`return (function(){
      const el = document.getElementById('stage');
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    })()`);
    console.log(`片长 duration=${dur}s，stage=${Math.round(rect.width)}×${Math.round(rect.height)}，开始抽转场帧…`);

    const shots = [];
    for (const w of WINDOWS) {
      for (const o of SAMPLES) {
        const t = +(w.start + o).toFixed(3);
        await b.eval(`window.__stage.seek(${t});`);
        await new Promise((r) => setTimeout(r, 240)); // 等 rAF 重画一帧
        const png = await b.shot({ ...rect, scale: 1 });
        const name = `m_${w.label.replace(/→/g, "_")}_${o.toFixed(2)}.png`;
        const p = resolve(OUT, name);
        writeFileSync(p, Buffer.from(png, "base64"));
        shots.push({ p, label: `${w.label} @${o.toFixed(2)} (t=${t})` });
        console.log(`  ✓ ${name}`);
      }
    }
    // 拼 contact sheet（3 行 × 4 列，每行一个承接边）
    const inputs = shots.flatMap((s) => ["-i", s.p]);
    const ff = spawn("ffmpeg", [
      "-y", ...inputs,
      "-filter_complex", "tile=4x3",
      resolve(OUT, "contact-sheet.png"),
    ], { stdio: "ignore" });
    await new Promise((res) => ff.on("close", res));
    writeFileSync(resolve(OUT, "index.txt"), shots.map((s) => s.label).join("\n"));
    const sheet = resolve(OUT, "contact-sheet.png");
    console.log(existsSync(sheet) ? `\ncontact-sheet → ${sheet}` : "\n⚠ ffmpeg 拼图失败（单独帧已在 .tmp/morph-sheet/）");
  }, { port: 9341 });
} catch (e) {
  console.error("morph 取证失败：", e.message);
  exitCode = 1;
} finally {
  dev.kill("SIGTERM");
}
process.exit(exitCode);
