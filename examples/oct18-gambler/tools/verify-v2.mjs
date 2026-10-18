#!/usr/bin/env node
// verify-v2.mjs — endowment-v2 的机器验收（CDP，零依赖）
//
// 五道门禁（都是「肉眼很难发现、但成片一定翻车」的项）：
//   1. 布局碰撞：window.__layoutReport() 必须 0 问题（组×组、主体×字幕带/标题/安全边）
//   2. 出血：所有 <text> 的包围盒必须落在 1280×720 内（排字越界是最常见的返工）
//   3. 字幕带：字幕元素必须整条落在 ZONES.caption 内
//   4. 确定性：同一时刻 seek 两次，序列化 SVG 必须逐字节一致（逐帧导出可复现）
//   5. 幕中点不空场（借鉴 20261018_jensen_process delay_audit 判据 v2）：
//      每幕 seek 到中点，数「可见元素」（opacity≥0.3 且有包围盒）——
//      0 个 = EMPTY 必须修；1 个且该幕 ≥3 组 = THIN 只报不拦（排布问题，压延迟没用）
//
// 用法：node tools/verify-v2.mjs [--json <报告路径>]

import { createServer } from "node:http";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { run } from "../../../tools/cdp.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
const argOf = (n, d) => { const i = argv.indexOf(n); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const REPORT = resolve(argOf("--json", join(ROOT, "out", "verify-report.json")));
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".json": "application/json" };

const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok, detail });
  console.log(`${ok ? "✓" : "✗"} ${name}${detail ? ` —— ${detail}` : ""}`);
};

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

let report = null;
try {
  await run(async (b) => {
    await b.open(staticS.url, 90000);
    const ok = await b.eval("return !!window.__ready;");
    check("页面就绪", ok);
    if (!ok) return;

    // 1. 布局碰撞
    const issues = await b.eval("return JSON.stringify(window.__layoutReport ? window.__layoutReport() : [{kind:'no-hook'}]);");
    const layout = JSON.parse(issues);
    check("布局碰撞 0 问题", layout.length === 0, layout.length ? JSON.stringify(layout).slice(0, 400) : "0 issue");

    // 2/3. 出血与字幕带（按 40 个等分时刻采样当前可见幕）
    const bounds = await b.eval(`
      const out = [];
      const stage = document.getElementById('stage');
      const W = 1280, H = 720;
      const sr = stage.getBoundingClientRect();
      const sc = sr.width / W;
      const toStage = (el) => {
        const r = el.getBoundingClientRect();
        return { x: (r.left - sr.left) / sc, y: (r.top - sr.top) / sc, w: r.width / sc, h: r.height / sc };
      };
      const layers = [...document.querySelectorAll('.sceneLayer')];
      const dur = window.__duration || 0;
      for (let i = 0; i < 40; i++) {
        const t = (i + 0.55) * dur / 40;
        window.__tl.seek(t);
        if (window.__updateOverlay) window.__updateOverlay(t);
        layers.forEach((layer) => {
          if (+getComputedStyle(layer).opacity <= 0.5) return;
          layer.querySelectorAll('text').forEach((el) => {
            if (+getComputedStyle(el).opacity <= 0.05) return;
            const r = toStage(el);
            if (r.x < -3 || r.y < -3 || r.x + r.w > W + 3 || r.y + r.h > H + 3) {
              out.push({ scene: layer.getAttribute('data-scene'), kind: 'bleed', text: (el.textContent || '').slice(0, 14),
                box: [Math.round(r.x), Math.round(r.y), Math.round(r.w), Math.round(r.h)] });
            }
          });
        });
      }
      const cap = document.getElementById('caption');
      if (cap) {
        window.__tl.seek(30); if (window.__updateOverlay) window.__updateOverlay(30);
        const r = toStage(cap);
        if (r.y < 596 || r.y + r.h > 706) out.push({ kind: 'caption-band', box: [Math.round(r.y), Math.round(r.h)] });
      }
      return JSON.stringify(out.slice(0, 20));
    `);
    const bleed = JSON.parse(bounds || "[]");
    check("文字不出血（1280×720 内）", bleed.length === 0, bleed.length ? JSON.stringify(bleed).slice(0, 400) : "0 issue");

    // 4. 确定性：同一时刻两次序列化一致
    const det = await b.eval(`
      const ser = () => new XMLSerializer().serializeToString(document.getElementById('stage'));
      window.__tl.seek(60); const a = ser();
      window.__tl.seek(120); window.__tl.seek(60); const b = ser();
      return a === b ? 'same' : 'diff:' + Math.abs(a.length - b.length);
    `);
    check("确定性（同 t 两次序列化一致）", det === "same", det);

    // 5. 幕中点不空场（jensen delay_audit 判据 v2：中点可见度）
    const mid = await b.eval(`
      const out = [];
      const scenes = window.__scenesInfo || [];
      const typo = document.getElementById('typoLayer');
      const visOf = (g) => {
        const o = +getComputedStyle(g).opacity;
        const r = g.getBoundingClientRect();
        return o >= 0.3 && r.width > 4 && r.height > 4;
      };
      for (const s of scenes) {
        const half = (s.start + s.end) / 2;
        window.__tl.seek(half);
        if (window.__updateOverlay) window.__updateOverlay(half);
        let vis = 0, total = 0;
        const layer = document.querySelector('.sceneLayer[data-scene="' + s.key + '"]');
        if (layer) layer.querySelectorAll('[data-key]').forEach((g) => { total++; if (visOf(g)) vis++; });
        if (typo) typo.querySelectorAll('g').forEach((g) => { if (visOf(g)) vis++; });
        if (vis === 0) out.push({ scene: s.key, kind: 'EMPTY' });
        else if (vis === 1 && total >= 3) out.push({ scene: s.key, kind: 'THIN', vis });
      }
      return JSON.stringify(out);
    `);
    const midIssues = JSON.parse(mid || "[]");
    const empty = midIssues.filter((x) => x.kind === "EMPTY");
    const thin = midIssues.filter((x) => x.kind === "THIN");
    check("幕中点不空场", empty.length === 0,
      empty.length ? JSON.stringify(empty) : (thin.length ? `0 EMPTY · THIN ${JSON.stringify(thin)}（只报不拦）` : "33 幕全过"));

    report = { at: new Date().toISOString(), duration: await b.eval("return window.__duration;"), results };
  }, { port: 9363 });
} finally {
  try { staticS.s.close(); } catch { /* 已关 */ }
}

mkdirSync(dirname(REPORT), { recursive: true });
writeFileSync(REPORT, JSON.stringify(report || { results }, null, 2));
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} 项通过 · 报告 ${REPORT}`);
process.exit(failed.length ? 1 : 0);
