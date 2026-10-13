// 规划干跑：不开浏览器，把 SRT + 导演覆写跑完整条规划链，逐拍打印版式／风格／门禁问题。
// 用途是**快速迭代配时与覆写** —— 浏览器里每次载入要等人手点，这里一条命令出结果。
//
// 用法:
//   node tools/run-ts.mjs tools/plan-dry.ts examples/05-kaojin-60s.srt [examples/05-kaojin-60s.overrides.json]
// 门禁有问题时退出码 1（可直接当检查用）。

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { plan } from "../src/core/plan";
import { displayHeadline, displayWidth } from "../src/core/compose";
import { STAGE_FPS } from "../src/render/frame";

const root = resolve(import.meta.dirname, "..");
const srtPath = resolve(root, process.argv[2] ?? "examples/01-explanatory-tech.srt");
const ovPath = process.argv[3] ? resolve(root, process.argv[3]) : null;

if (!existsSync(srtPath)) {
  console.error(`✗ 找不到 SRT：${srtPath}`);
  process.exit(2);
}
const srt = readFileSync(srtPath, "utf8");
const ov = ovPath ? readFileSync(ovPath, "utf8") : "";

let result;
try {
  result = plan(srt, ov);
} catch (e) {
  console.error(`✗ 规划失败：${(e as Error).message}`);
  process.exit(2);
}

const { shots, problems, styles } = result;

// 时间轴起点：与 ui/stage.tsx 同一套累加（拍间交叠 0.25s），唯一区别是不计退出动效的尾巴。
// 所以这里给的是**估算**，成片真实时长以导出为准。
let tlEnd = 0;
const rows = shots.map((shot, i) => {
  const dur = Math.max(shot.end - shot.start, 1.2);
  const at = i === 0 ? 0 : Math.max(tlEnd - 0.25, 0);
  tlEnd = Math.max(tlEnd, at + dur);
  return { i, at, dur, shot };
});

for (const { i, at, dur, shot } of rows) {
  const h = displayHeadline(shot.content.headline);
  const w = displayWidth(h);
  const over = w > 16 ? " ⚠超宽" : "";
  console.log(
    `${String(i + 1).padStart(2, "0")}  ` +
      `${at.toFixed(2).padStart(6)}–${(at + dur).toFixed(2).padStart(6)}s  ` +
      `${dur.toFixed(2).padStart(5)}s  ` +
      `${(shot.layout.style === "poster" ? "海报" : "编辑")}  ` +
      `${shot.layout.id.padEnd(20)} w=${w.toFixed(1).padStart(4)}${over}  ${h}`,
  );
}

const poster = shots.filter((s) => s.layout.style === "poster").length;
console.log(
  `\n${shots.length} 拍 · ${new Set(shots.map((s) => s.layout.id)).size} 个版式` +
    ` · 海报风 ${poster} 拍 / 编辑风 ${shots.length - poster} 拍` +
    ` · 估算时长 ${tlEnd.toFixed(2)}s（${Math.round(tlEnd * STAGE_FPS)} 帧 @ ${STAGE_FPS}fps）`,
);
console.log(`风格判定：${styles.join("　")}`);

if (problems.length > 0) {
  console.error(`\n✗ 门禁未通过 ${problems.length} 条：`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log("\n✓ 门禁通过");
