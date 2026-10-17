// 真正的 MP4 导出：CDP 驱动本机 Chrome，加载指定 SRT，点击「导出 MP4」，
// 把 Chrome 下载目录定向到临时目录，抓下载好的 MP4 文件路径。
//
// 用法：node tools/export-mp4.cdp.mjs <file.srt>
//   例：node tools/export-mp4.cdp.mjs examples/11-visual-density.srt
import { spawn } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync, readdirSync, statSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { run } from "./cdp.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FILE = process.argv[2] ?? "examples/11-visual-density.srt";
const SRT = readFileSync(resolve(ROOT, FILE), "utf-8");
const DEV_PORT = 5230;
const DEV_URL = `http://127.0.0.1:${DEV_PORT}/`;
const CDP_PORT = 9364;
const DOWNLOAD_DIR = resolve(ROOT, ".tmp", "export-downloads");
const DEV = "DEV";

async function waitHttp(u, ms = 90000) {
  const d = Date.now() + ms;
  while (Date.now() < d) { try { if ((await fetch(u)).ok) return; } catch {} await new Promise((r) => setTimeout(r, 400)); }
  throw new Error("no server " + u);
}

rmSync(DOWNLOAD_DIR, { recursive: true, force: true });
mkdirSync(DOWNLOAD_DIR, { recursive: true });

const dev = spawn(process.execPath,
  [resolve(ROOT, "node_modules/vite/bin/vite.js"), "--host", "127.0.0.1", "--port", String(DEV_PORT), "--strictPort"],
  { cwd: ROOT, stdio: "ignore" });
let exitCode = 0;
try {
  await waitHttp(DEV_URL);
  await run(async (b) => {
    await b.open(DEV_URL);
    // 等 SRT 输入框，灌入语料，点「载入并规划」
    const dl = Date.now() + 20000;
    while (Date.now() < dl) { if (await b.eval("return !!document.getElementById('srt-input');")) break; await new Promise((r) => setTimeout(r, 300)); }
    await b.eval(`(function(){var ta=document.getElementById('srt-input');ta.value=${JSON.stringify(SRT)};document.getElementById('btn-load').click();})()`);
    const dl2 = Date.now() + 30000;
    while (Date.now() < dl2) { if (await b.eval("return !!window.__stage && window.__stage.duration>0;")) break; await new Promise((r) => setTimeout(r, 400)); }
    const dur = await b.eval("return window.__stage.duration;");
    console.log(`片长 ${dur.toFixed(1)}s，点击「导出 MP4」…`);
    await b.eval("document.getElementById('btn-export').click();");
    // 等导出完成：按钮文案恢复，或出现导出完成日志
    const dl3 = Date.now() + 180000;
    let done = false;
    while (Date.now() < dl3) {
      const txt = await b.eval("return document.getElementById('btn-export')?.textContent;");
      if (txt === "导出 MP4") { done = true; break; }
      if (txt.includes("失败")) { throw new Error("导出按钮显示失败状态"); }
      await new Promise((r) => setTimeout(r, 1000));
    }
    if (!done) throw new Error("导出未在 3min 内完成");
    // 等 Chrome 把下载写完（.crdownload 消失，出现 .mp4）
    const dl4 = Date.now() + 60000;
    let mp4;
    while (Date.now() < dl4) {
      const files = readdirSync(DOWNLOAD_DIR);
      const mp4s = files.filter((f) => f.endsWith(".mp4") && !f.endsWith(".crdownload"));
      const crdownloads = files.filter((f) => f.endsWith(".crdownload"));
      if (mp4s.length > 0 && crdownloads.length === 0) { mp4 = mp4s[0]; break; }
      await new Promise((r) => setTimeout(r, 500));
    }
    if (!mp4) throw new Error("下载目录未出现 .mp4 文件");
    const p = resolve(DOWNLOAD_DIR, mp4);
    const st = existsSync(p) ? statSync(p) : null;
    console.log(`导出完成：${p} （${(st?.size / 1e6).toFixed(1)}MB）`);
    writeFileSync(resolve(ROOT, ".tmp", "last-export.txt"), p);
  }, { port: CDP_PORT, downloadDir: DOWNLOAD_DIR });
} catch (e) {
  console.error("导出失败：", e.message);
  exitCode = 1;
} finally {
  dev.kill("SIGTERM");
}
process.exit(exitCode);
