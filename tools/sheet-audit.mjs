// 直接量化 contact-sheet.png 本身：按网格切格，逐格报内容密度 / 颜色数 / 均值色。
// 用途：用户说「sheet 里只有一张看得见」——先证明图没坏、格子确实在，只是空格子
// 视觉上等于不存在。用 ffmpeg 出 raw RGB，node 解析，零新增依赖。
import { spawn } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";

const PNG = process.argv[2];
const COLS = Number(process.argv[3] ?? 5);
const ROWS = Number(process.argv[4] ?? 2);

// 1) 拿尺寸
const probe = spawn("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0", PNG], { stdio: ["ignore", "pipe", "ignore"] });
let dim = "";
probe.stdout.on("data", (d) => { dim += d; });
await new Promise((r) => probe.on("close", r));
const [W, H] = dim.trim().split(",").map(Number);
console.log(`sheet = ${W}x${H}, ${COLS}x${ROWS} = ${COLS * ROWS} 格`);

// 2) 出 raw rgb24
const RAW = PNG + ".raw";
const ff = spawn("ffmpeg", ["-y", "-i", PNG, "-f", "rawvideo", "-pix_fmt", "rgb24", RAW], { stdio: "ignore" });
await new Promise((r) => ff.on("close", r));
const buf = readFileSync(RAW);
const cw = Math.floor(W / COLS), ch = Math.floor(H / ROWS);
console.log(`每格 ${cw}x${ch}\n`);

function cell(cx, cy) {
  const x0 = cx * cw, y0 = cy * ch;
  let n = 0, dark = 0, sum = 0;
  const colors = new Set();
  // 每 2 像素采样一次，够统计且快
  for (let y = y0; y < y0 + ch; y += 2) {
    for (let x = x0; x < x0 + cw; x += 2) {
      const i = (y * W + x) * 3;
      const r = buf[i], g = buf[i + 1], b = buf[i + 2];
      const lum = (r * 299 + g * 587 + b * 114) / 1000;
      sum += lum;
      colors.add(`${r >> 5},${g >> 5},${b >> 5}`);
      // 「有内容」= 明显偏离白/极浅（阈值 235），也就是肉眼能看出不是空白的像素
      if (lum < 235) n++;
    }
  }
  const tot = Math.ceil(ch / 2) * Math.ceil(cw / 2);
  return { pct: (n / tot) * 100, lum: sum / tot, colors: colors.size };
}

console.log("格 | 可见内容占比 | 平均亮度 | 颜色数 | 判定");
for (let cy = 0; cy < ROWS; cy++) {
  for (let cx = 0; cx < COLS; cx++) {
    const c = cell(cx, cy);
    const idx = cy * COLS + cx + 1;
    const verdict = c.pct > 25 ? "有画面" : c.pct > 8 ? "稀疏" : "≈空白";
    console.log(`${String(idx).padStart(2)} | ${c.pct.toFixed(1).padStart(11)}% | ${c.lum.toFixed(0).padStart(8)} | ${String(c.colors).padStart(6)} | ${verdict}`);
  }
}
spawn("cmd", ["/c", "del", `"${RAW}"`], { stdio: "ignore" });
