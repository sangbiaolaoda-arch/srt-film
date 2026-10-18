#!/usr/bin/env node
// shoot-scenes.mjs — 逐幕截图目检工具（oct18-gambler，CDP 零依赖）
//
// 对每一幕 seek 到「编排完成」时刻（end-1.0s），整页截图落盘 out/shots/sNN.png。
// 长幕（>8s）额外截中段一帧（start + 55%），检查级联中段的让位/交接。
//
// 用法：node tools/shoot-scenes.mjs [--out out/shots]

import { createServer } from "node:http";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { run } from "../../../tools/cdp.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
const argOf = (n, d) => { const i = argv.indexOf(n); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const OUT = resolve(argOf("--out", join(ROOT, "out", "shots")));
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8" };

mkdirSync(OUT, { recursive: true });

const staticS = await new Promise((res, rej) => {
  const s = createServer((req, rq) => {
    const p = decodeURIComponent((req.url || "/").split("?")[0]);
    const fp = resolve(ROOT, "." + (p === "/" ? "/index.html" : p));
    if (!fp.startsWith(ROOT)) { rq.writeHead(403); rq.end(); return; }
    try {
      const data = readFileSync(fp);
      rq.writeHead(200, { "Content-Type": MIME[extname(fp).toLowerCase()] || "application/octet-stream" });
      rq.end(data);
    } catch { rq.writeHead(404); rq.end("nf"); }
  });
  s.on("error", rej);
  s.listen(0, "127.0.0.1", () => res({ s, url: `http://127.0.0.1:${s.address().port}/` }));
});

try {
  await run(async (b) => {
    await b.open(staticS.url, 90000);
    const ready = await b.eval("return !!window.__ready;");
    if (!ready) throw new Error("页面未就绪");
    const info = JSON.parse(await b.eval(`
      return JSON.stringify((window.__scenesInfo || []).map((s) => ({ key: s.key, start: s.start, end: s.end })));
    `));
    if (!info.length) throw new Error("window.__scenesInfo 为空 —— app.js 需要暴露场景表");

    // 截图 clip 对齐 #stage 的实际 CSS 矩形（视口缩放不影响取景；scale 为 CDP 必填）
    const rect = JSON.parse(await b.eval(`
      const r = document.getElementById('stage').getBoundingClientRect();
      return JSON.stringify({ x: r.left, y: r.top, width: r.width, height: r.height, scale: 1 });
    `));

    for (const sc of info) {
      const jobs = [{ t: Math.max(sc.start + 0.2, sc.end - 1.0), tag: "" }];
      if (sc.end - sc.start > 8) jobs.push({ t: sc.start + (sc.end - sc.start) * 0.55, tag: "-mid" });
      for (const j of jobs) {
        await b.eval(`window.__tl.seek(${j.t.toFixed(3)}); if (window.__updateOverlay) window.__updateOverlay(${j.t.toFixed(3)}); return true;`);
        await new Promise((r) => setTimeout(r, 120));
        const png = await b.shot(rect);
        writeFileSync(join(OUT, `${sc.key}${j.tag}.png`), Buffer.from(png, "base64"));
        console.log(`${sc.key}${j.tag} @${j.t.toFixed(1)}s`);
      }
    }
  }, { port: 9374 });
} finally {
  try { staticS.s.close(); } catch { /* 已关 */ }
}
console.log(`完成 → ${OUT}`);
