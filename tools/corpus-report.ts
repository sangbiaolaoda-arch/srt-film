// 语料→版式→像素指标 三联报告（诊断「一部片子视觉饱不饱满」用）：
// 加载指定语料，打印每拍命中的版式/组/风格/角色，再逐拍量
// contentPct（非底色像素占比）/ ink（深色实块）/ accent / colors / 四象限分布。
//
// 用法：npm run corpus:report -- 11-visual-density.srt
//
// 为什么要有这个：用户看片反馈「画面素、看不到图表、没层次」，而肉眼说不出的
// 量化差异（10 拍全落轻量文字板 vs 命中 strata/split-blocks/axis-columns）必须
// 有数字才能定位。用 cdp.mjs 驱动真实 Chrome 读 window.__stage.canvas 像素，
// 客观、可复现、不依赖「我觉得」。
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { run } from "./cdp.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FILE = process.argv[2] ?? "11-visual-density.srt";
const SRT = readFileSync(resolve(ROOT, "examples", FILE), "utf-8");
const DEV_PORT = 5217;
const DEV_URL = `http://127.0.0.1:${DEV_PORT}/`;

async function waitHttp(u, ms = 90000) {
  const d = Date.now() + ms;
  while (Date.now() < d) { try { if ((await fetch(u)).ok) return; } catch {} await new Promise((r) => setTimeout(r, 400)); }
  throw new Error("no server " + u);
}

const METRICS = `return (function(){
  var c = window.__stage.canvas, g = c.getContext('2d'), W = c.width, H = c.height;
  var d = g.getImageData(0,0,W,H).data;
  var samples = [[2,2],[W-3,2],[2,H-3],[W-3,H-3],[W>>1,2],[2,H>>1],[W-3,H>>1],[W>>1,H-3]];
  function px(x,y){var i=(y*W+x)*4;return [d[i],d[i+1],d[i+2]];}
  var bgs = samples.map(function(p){return px(p[0],p[1]);});
  var bR=0,bG=0,bB=0; bgs.forEach(function(b){bR+=b[0];bG+=b[1];bB+=b[2];});
  bR/=bgs.length; bG/=bgs.length; bB/=bgs.length;
  var n=0, dark=0, warm=0, q=[0,0,0,0], colors={};
  for(var y=0;y<H;y++)for(var x=0;x<W;x++){
    var i=(y*W+x)*4, r=d[i],gg=d[i+1],b=d[i+2];
    if(Math.abs(r-bR)<26&&Math.abs(gg-bG)<26&&Math.abs(b-bB)<26)continue;
    n++; colors[(r>>5)+'_'+(gg>>5)+'_'+(b>>5)]=1;
    q[(y<H/2?0:2)+(x<W/2?0:1)]++;
    if(r<120&&gg<120&&b<120) dark++;
    if(r>b+25&&r>150) warm++;
  }
  return { content:(n/(W*H)*100).toFixed(1), ink:(dark/(W*H)*100).toFixed(2),
    accent:(warm/(W*H)*100).toFixed(2), colors:Object.keys(colors).length,
    quad:q.map(function(v){return (v/(W*H/4)*100).toFixed(0);}).join('/') };
})()`;

const dev = spawn(process.execPath,
  [resolve(ROOT, "node_modules/vite/bin/vite.js"), "--host", "127.0.0.1", "--port", String(DEV_PORT), "--strictPort"],
  { cwd: ROOT, stdio: "ignore" });
try {
  await waitHttp(DEV_URL);
  await run(async (b) => {
    await b.open(DEV_URL);
    await b.send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
    const dl = Date.now() + 20000;
    while (Date.now() < dl) { if (await b.eval("return !!document.getElementById('srt-input');")) break; await new Promise((r) => setTimeout(r, 300)); }
    await b.eval(`(function(){var ta=document.getElementById('srt-input');ta.value=${JSON.stringify(SRT)};document.getElementById('btn-load').click();})()`);
    const dl2 = Date.now() + 30000;
    while (Date.now() < dl2) { if (await b.eval("return !!window.__stage && window.__stage.duration>0;")) break; await new Promise((r) => setTimeout(r, 400)); }

    const rows = await b.eval(`return (function(){
      return window.__stage.shots.map(function(s,i){
        return i + ' [' + (s.layout.style||'editorial') + '] ' + s.layout.id + ' / ' + s.layout.group
          + ' / role=' + (s.narrative?s.narrative.role:'?')
          + ' / t=' + (s.tlStart ?? s.start).toFixed(1) + '-' + s.end.toFixed(1)
          + ' / "' + (s.content.headline||'').slice(0,18) + '"';
      }).join('\\n');
    })()`);
    console.log("=== " + FILE + " 每拍版式 ===\n" + rows);

    const mids = await b.eval(`return (function(){
      return window.__stage.shots.map(function(s){ return +(((s.tlStart ?? s.start) + s.end)/2).toFixed(2); });
    })()`);
    console.log("\n=== 逐拍像素指标（取每拍中点）===");
    let sumC = 0, sumI = 0, sumK = 0;
    for (let i = 0; i < mids.length; i++) {
      await b.eval("window.__stage.seek(" + mids[i] + ");");
      await new Promise((r) => setTimeout(r, 300));
      const m = await b.eval(METRICS);
      sumC += parseFloat(m.content); sumI += parseFloat(m.ink); sumK += m.colors;
      console.log("  拍" + (i + 1) + "  " + JSON.stringify(m));
    }
    const n = mids.length;
    console.log(`\n均值：content=${(sumC / n).toFixed(1)}%  ink=${(sumI / n).toFixed(2)}%  colors=${Math.round(sumK / n)}`);
  }, { port: 9361 });
} finally { dev.kill("SIGTERM"); }
