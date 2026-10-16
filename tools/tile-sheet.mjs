// 纯 tile 拼图：把 <dir>/s01.png .. sNN.png 拼成 <dir>/contact-sheet.png。
//
// ⚠ 为什么必须用「单输入 + image2 序列」而不是多个 -i（本轮踩坑实测）：
// `ffmpeg -i s01.png -i s02.png ... -filter_complex tile=5x2` 会让 image2 demuxer
// 把 10 个输入当成「同一条流的 10 次覆盖」，只解出 **1 帧**；tile 要 10 帧却只有 1 帧，
// 剩下 9 格被填成**纯黑**。症状极阴：文件大小正常（596KB）、第一格完全正常，
// 用户看到的就是「sheet 里只有一张看得见，其他全黑」。
// 正确写法：`-framerate 1 -i s%02d.png`（一条输入、按序号序列解码出 10 帧）。
import { spawn } from "node:child_process";
import { readdirSync, renameSync } from "node:fs";
import { resolve } from "node:path";

const dir = process.argv[2];
const cols = Number(process.argv[3] ?? 5);
const files = readdirSync(dir).filter((f) => /^s\d+\.png$/.test(f)).sort();
if (files.length === 0) { console.error("没有 sNN.png"); process.exit(1); }
// 序号必须从 01 连续无跳号，image2 序列靠 %02d 才能数齐
files.forEach((f, i) => {
  const want = `s${String(i + 1).padStart(2, "0")}.png`;
  if (f !== want) { console.error(`序号不连续：${f} != ${want}（序列输入要求 01..N 连续）`); process.exit(1); }
});
const rows = Math.ceil(files.length / cols);
// 输出必须与输入序列**不同名**：image2 muxer 会拿输出名也去匹配 %02d 模式，
// 同名（甚至同目录下可被误解析的名字）时报「does not contain an image sequence pattern」
// 并只吐出 1 帧 —— 症状就是 sheet 只有一格有图、其余纯黑。
const sheet = resolve(dir, "contact-sheet.png");
const tmp = resolve(dir, `_tiled_${cols}x${rows}.png`);
const ff = spawn("ffmpeg", [
  "-y",
  "-framerate", "1",
  "-i", "s%02d.png",
  "-frames:v", String(files.length),
  "-filter_complex", `tile=${cols}x${rows}`,
  tmp,
], { stdio: "inherit", cwd: dir });
ff.on("close", (c) => {
  if (c !== 0) { console.error(`ffmpeg 退出 ${c}`); process.exit(c ?? 1); }
  // 校验帧数：黑格根因就是只出 1 帧，这里必须挡住
  const probe = spawn("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0", tmp], { stdio: ["ignore", "pipe", "ignore"] });
  let dim = "";
  probe.stdout.on("data", (d) => { dim += d; });
  probe.on("close", () => {
    const [w, h] = dim.trim().split(",").map(Number);
    const wantW = 756 * cols, wantH = 425 * rows;
    if (w !== wantW || h !== wantH) {
      console.error(`尺寸不符：${w}x${h}，期望 ${wantW}x${wantH} —— tile 帧数不足，已拒绝`);
      process.exit(1);
    }
    renameSync(tmp, sheet);
    console.log(`contact-sheet: ${sheet}  (${files.length} 帧 / ${cols}x${rows})`);
  });
});
