// 逐拍接触印相：CDP 驱动真实 app 加载指定语料，对每一拍中点 seek + 只截 #stage，
// ffmpeg 拼成带版式名标签的 contact-sheet。给人眼验收用（模型看不到图，只能保证像素真实）。
//
// 用法：node tools/shot-sheet.mjs <file.srt> [每排格数]
//   例：node tools/shot-sheet.mjs 11-visual-density.srt 5
//
// 与 morph-contact-sheet.mjs 的分工：那个抽「一条承接边的转场窗口内多帧」，
// 这个抽「一部片子的每一拍一帧」—— 验收版式多样性与构图用后者。
import { spawn } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { run } from "./cdp.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FILE = process.argv[2] ?? "11-visual-density.srt";
const COLS = Number(process.argv[3] ?? 5);
const SRT = readFileSync(resolve(ROOT, "examples", FILE), "utf-8");
const SLUG = FILE.replace(/\.srt$/, "");
const OUT = resolve(ROOT, ".tmp", `sheet-${SLUG}`);
const DEV_PORT = 5221;
const DEV_URL = `http://127.0.0.1:${DEV_PORT}/`;

async function waitHttp(u, ms = 90000) {
  const d = Date.now() + ms;
  while (Date.now() < d) { try { if ((await fetch(u)).ok) return; } catch {} await new Promise((r) => setTimeout(r, 400)); }
  throw new Error("no server " + u);
}

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

const dev = spawn(process.execPath,
  [resolve(ROOT, "node_modules/vite/bin/vite.js"), "--host", "127.0.0.1", "--port", String(DEV_PORT), "--strictPort"],
  { cwd: ROOT, stdio: "ignore" });
let exitCode = 0;
try {
  await waitHttp(DEV_URL);
  await run(async (b) => {
    await b.open(DEV_URL);
    await b.send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 940, deviceScaleFactor: 1, mobile: false });
    const dl = Date.now() + 20000;
    while (Date.now() < dl) { if (await b.eval("return !!document.getElementById('srt-input');")) break; await new Promise((r) => setTimeout(r, 300)); }
    await b.eval(`(function(){var ta=document.getElementById('srt-input');ta.value=${JSON.stringify(SRT)};document.getElementById('btn-load').click();})()`);
    const dl2 = Date.now() + 30000;
    while (Date.now() < dl2) { if (await b.eval("return !!window.__stage && window.__stage.duration>0;")) break; await new Promise((r) => setTimeout(r, 400)); }

    const info = await b.eval(`return (function(){
      var svg = window.__stage.svg, out = [];
      window.__stage.shots.forEach(function(s, i){
        out.push({ i: i, mid: +(((s.tlStart ?? s.start) + s.end)/2).toFixed(2),
          id: s.layout.id, group: s.layout.group, style: s.layout.style || 'editorial',
          role: s.narrative ? s.narrative.role : '?' });
      });
      return JSON.stringify(out);
    })()`);
    const shots = JSON.parse(info);
    const rect = await b.eval(`return (function(){ var r=document.getElementById('stage').getBoundingClientRect(); return {x:r.x,y:r.y,width:r.width,height:r.height}; })()`);
    console.log(`${FILE}: ${shots.length} 拍，stage=${Math.round(rect.width)}x${Math.round(rect.height)}`);

    const files = [];
    for (const s of shots) {
      await b.eval("window.__stage.seek(" + s.mid + ");");
      await new Promise((r) => setTimeout(r, 260));
      const png = await b.shot({ ...rect, scale: 1 });
      const name = `s${String(s.i + 1).padStart(2, "0")}.png`;
      writeFileSync(resolve(OUT, name), Buffer.from(png, "base64"));
      files.push({ name, ...s });
      console.log(`  ✓ ${name}  ${s.id} [${s.group}/${s.style}] ${s.role}`);
    }
    // 标签写纯 ASCII：Windows 下 Node 写 CJK 到文件 + ffmpeg drawtext 中文字体路径
    // 都不可靠（本轮实测：index.txt 的「拍」变乱码、drawtext 直接静默失败不出图）。
    // 版式名/组本身就是 ASCII，够用；格子顺序就是拍序（s01=shot1 …）。
    writeFileSync(resolve(OUT, "index.txt"),
      files.map((f) => `shot${String(f.i + 1).padStart(2, "0")}  ${f.id}  group=${f.group}  style=${f.style}  role=${f.role}  t=${f.mid}`).join("\n"));

    // 拼图交给 tile-sheet.mjs：纯 tile（drawtext 烧字在本机不可靠，已实测）
    const ff = spawn(process.execPath, [resolve(ROOT, "tools/tile-sheet.mjs"), OUT, String(COLS)], { stdio: "inherit" });
    await new Promise((res) => ff.on("close", res));
    console.log(`\ncontact-sheet -> ${resolve(OUT, "contact-sheet.png")}`);
    console.log(readFileSync(resolve(OUT, "index.txt"), "utf-8"));
  }, { port: 9362 });
} catch (e) {
  console.error("抽帧失败：", e.message);
  exitCode = 1;
} finally {
  dev.kill("SIGTERM");
}
process.exit(exitCode);
