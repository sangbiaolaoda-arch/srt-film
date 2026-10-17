// 全语料端到端出片验收：一份语料跑一次 tools/e2e-export.mjs（起 dev server →
// 无头浏览器 → 真实导出 MP4 → 逐帧查全黑/爆白），串行跑完所有语料，最后打汇总表。
//
// 为什么要串行而不是并发：导出吃满 CPU 和内存，两个一起跑会互相拖成假失败
// （补记四那个 OOM 就是资源撑爆的信号），而「假失败」比慢更贵 —— 它会把真缺陷
// 淹掉。e2e 自己会起停 dev server，所以串行还能避开端口争用。
//
// 用法：node tools/e2e-all.mjs [--only 01,03] [--port 5199] [--keep]
//   --only 只跑编号匹配的语料；--keep 保留每份的 mp4（默认跑完删掉，只留汇总）
import { spawn } from "node:child_process";
import { readdirSync, rmSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, ".tmp/e2e-all");
mkdirSync(OUT, { recursive: true });

const argv = process.argv.slice(2);
const argOf = (n, d) => {
  const i = argv.indexOf(n);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : d;
};
const only = argOf("--only", "");
const port = argOf("--port", "5199");
const keep = argv.includes("--keep");

const files = readdirSync(join(ROOT, "examples"))
  .filter((f) => f.endsWith(".srt"))
  .filter((f) => (only ? only.split(",").some((k) => f.startsWith(k.trim())) : true))
  .sort();

console.log(`全语料 e2e：${files.length} 份 · 端口 ${port}${keep ? " · 保留 mp4" : ""}\n`);

const rows = [];
let failed = 0;
for (const f of files) {
  const name = basename(f, ".srt");
  const mp4 = join(OUT, `${name}.mp4`);
  if (existsSync(mp4)) rmSync(mp4, { force: true });
  const t0 = Date.now();
  const p = spawn(process.execPath, [join(ROOT, "tools/e2e-export.mjs"), "--srt", `examples/${f}`, "--out", mp4, "--port", port], {
    cwd: ROOT,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let out = "";
  p.stdout.on("data", (d) => { out += d; });
  p.stderr.on("data", (d) => { out += d; });
  const code = await new Promise((r) => p.on("exit", r));
  const secs = ((Date.now() - t0) / 1000).toFixed(0);

  // e2e-export 每行 [✓|✗] 名称 —— 明细
  const lines = out.split("\n").filter((l) => l.startsWith("✓") || l.startsWith("✗"));
  const bad = lines.filter((l) => l.startsWith("✗"));
  let size = 0;
  if (existsSync(mp4)) size = (await import("node:fs")).statSync(mp4).size / 1e6;
  const ok = code === 0 && bad.length === 0;
  if (!ok) failed++;
  rows.push({ name, ok, code, secs: +secs, total: lines.length, bad: bad.length, size, badLines: bad });
  console.log(`${ok ? "✓" : "✗"} ${name.padEnd(24)} ${String(secs).padStart(4)}s · ${lines.length - bad.length}/${lines.length} 项${size ? ` · ${size.toFixed(1)}MB` : ""}`);
  for (const b of bad) console.log(`    ${b.slice(0, 160)}`);
  if (!keep && existsSync(mp4)) rmSync(mp4, { force: true });
  writeFileSync(join(OUT, "report.json"), JSON.stringify(rows, null, 2));
}

console.log(`\n===== 汇总 =====`);
console.log(`语料 ${rows.length} 份 · 通过 ${rows.length - failed} · 失败 ${failed}`);
const slowest = [...rows].sort((a, b) => b.secs - a.secs).slice(0, 3);
console.log(`最慢三份：${slowest.map((r) => `${r.name} ${r.secs}s`).join(" · ")}`);
console.log(`报告：${join(OUT, "report.json")}`);
process.exit(failed ? 1 : 0);
