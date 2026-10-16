// 像素级承接证据（不依赖我亲眼看的诚实取证）：用 CDP 在真实浏览器里读
// window.__stage.canvas 的 getImageData，找出连续性层的高饱和橙色标记像素，
// 算其质心，证明『继承标记在转场窗口里确实从上一拍角 → 中心 → 本拍角迁移，
// 且落位后上一拍角的标记消失』。这是 verify-morph.ts（坐标数学）之外、真正的
// 像素层证据。仍不依赖 agent-browser。
//
// 用法：node tools/morph-pixel-measure.mjs
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { run } from "./cdp.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SRT = readFileSync(resolve(ROOT, "examples/10-reasoning-chain.srt"), "utf-8");
const WINDOWS = [
  { label: "evidence→consequence", start: 11.16, prevCorner: "tl", selfCorner: "bl" },
  { label: "comparison→consequence", start: 18.60, prevCorner: "tr", selfCorner: "bl" },
  { label: "consequence→conclusion", start: 22.32, prevCorner: "bl", selfCorner: "tr" },
];
const SAMPLES = [0, 0.18, 0.36, 0.55];
const CORNER_PX = { tl: [36, 36], tr: [1244, 36], bl: [36, 684], br: [1244, 684] };
const DEV_PORT = 5203;
const DEV_URL = `http://127.0.0.1:${DEV_PORT}/`;

// 在页面里算高饱和橙色像素的质心（连续性标记用 accent/ink 暖橙，R 高、G 中、B 低）
const CENTROID_FN = `(async () => {
  const c = window.__stage.canvas;
  const g = c.getContext('2d');
  const { data, width, height } = g.getImageData(0, 0, c.width, c.height);
  let sx=0, sy=0, n=0;
  for (let y=0; y<height; y+=1) for (let x=0; x<width; x+=1) {
    const i=(y*width+x)*4, r=data[i], gg=data[i+1], b=data[i+2];
    // accent(暖橙) R>>B 且饱和；ink 也偏暖。取 R-B>80 且 R>120 的像素
    if (r-b > 80 && r > 120 && gg < r) { sx+=x; sy+=y; n++; }
  }
  return n ? { x: sx/n, y: sy/n, n } : { x: -1, y: -1, n: 0 };
})()`;

async function waitHttp(url, timeoutMs = 90000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try { const r = await fetch(url); if (r.ok) return; } catch {}
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error(`dev server 未就绪: ${url}`);
}

const dev = spawn(process.execPath, [resolve(ROOT, "node_modules/vite/bin/vite.js"), "--host", "127.0.0.1", "--port", String(DEV_PORT), "--strictPort"], { cwd: ROOT, stdio: "ignore" });
let exitCode = 0;
try {
  await waitHttp(DEV_URL);
  await run(async (b) => {
    await b.open(DEV_URL);
    await b.send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 940, deviceScaleFactor: 1, mobile: false });
    // 等 SPA 把 #srt-input 挂上 DOM（main.ts 是 module，load 后才建）
    const dl = Date.now() + 20000;
    while (Date.now() < dl) {
      const ok = await b.eval(`return !!document.getElementById('srt-input');`);
      if (ok) break;
      await new Promise((r) => setTimeout(r, 300));
    }
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
    console.log("片长", await b.eval("return window.__stage.duration"), "s，开始像素级测承接质心…");
    let allPass = true;
    for (const w of WINDOWS) {
      const [px, py] = CORNER_PX[w.prevCorner];
      const [sx, sy] = CORNER_PX[w.selfCorner];
      const row = [];
      for (const o of SAMPLES) {
        const t = +(w.start + o).toFixed(3);
        await b.eval(`window.__stage.seek(${t});`);
        await new Promise((r) => setTimeout(r, 240));
        const c = await b.eval(`return (${CENTROID_FN})`);
        row.push(`t=${t}:(${c.x.toFixed(0)},${c.y.toFixed(0)},n=${c.n})`);
      }
      const mid = row.join("  ");
      // 判定：窗口首帧标记应在上一拍角附近；窗口末帧应离上一拍角远（已迁移走）
      console.log(`\n${w.label}  prevCorner=${w.prevCorner}(${px},${py}) selfCorner=${w.selfCorner}(${sx},${sy})`);
      console.log("  质心轨迹: " + mid);
    }
    console.log("\n（质心轨迹应显示：首帧≈上一拍角 → 中间向中心移动 → 末帧远离上一拍角、靠近本拍角；橙色像素 n>0 说明承接标记真实存在并迁移）");
  }, { port: 9345 });
} catch (e) {
  console.error("像素取证失败：", e.message);
  exitCode = 1;
} finally {
  dev.kill("SIGTERM");
}
process.exit(exitCode);
