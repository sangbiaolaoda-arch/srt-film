// Phase 10 · 端到端视觉质量保证与返修闭环（计划 §5 Phase 10）。
//
// 它回答的不是「能不能导出」，而是「这段片子有没有质量问题」——按题材跑固定测试集，
// 每条检查都给出证据与定位（第几拍 / 第几秒），缺陷可回流到具体模块。
//
// 检查项（对应计划 §5 Phase 10「自动检查」）：
//   A 规划门禁：problems 为空、SRT 时间覆盖一致
//   B 文字呈现：关键文字缺失 / 出安全区
//   C 画面健康：空白帧（全黑/爆白）
//   D 运动质量：镜内 Δ（主运动是否存在）
//   E 确定性：同一 t 渲染两次像素一致
//   F 成片：MP4 分辨率/fps/时长/帧数/无音轨/可解码
//
// 用法：
//   node tools/phase10-qa.mjs [--only 01,03] [--port 9333] [--no-export]
// 退出码：有 FAIL → 1；全 PASS（WARN 允许）→ 0。

import { spawn, execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { run } from "./cdp.mjs";

// import.meta.url 在 Windows 上是 file:///E:/... —— 直接取 .pathname 会得到 "/E:/..."，
// 再 resolve 出 "E:\E:\..."。必须用 fileURLToPath。
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = resolve(ROOT, ".tmp/phase10");
const PORT = 9333;

/* ---------------------------- 固定测试集（五类题材） ---------------------------- */
// 对应计划 §5 Phase 12 要求的五类；每类挑一条现有语料，题材与文件名对应。
const CORPUS = [
  { id: "01", file: "examples/01-explanatory-tech.srt", topic: "科普 / 机制解释" },
  { id: "02", file: "examples/02-narrative-emotion.srt", topic: "情绪 / 关系叙事" },
  { id: "03", file: "examples/03-data-comparison.srt", topic: "数据 / 趋势 / 比例" },
  { id: "04", file: "examples/04-longform-3min.srt", topic: "科普 / 流程（长片）" },
  { id: "05", file: "examples/05-kaojin-60s.srt", topic: "抽象概念 / 哲学观点" },
  // Phase 12 §固定测试集第 2 项「历史 / 事件叙述」。此前五类里缺这一类 ——
  // 04 是咖啡供应链「科普」，机制解释的写法；历史叙述是另一套镜头语言：
  // 有年份、有事件因果链、有人名地点，但不是「因为…所以」的机制推导。
  { id: "06", file: "examples/06-history-events.srt", topic: "历史 / 事件叙述" },
];

const argv = process.argv.slice(2);
const onlyArg = (() => {
  const i = argv.indexOf("--only");
  return i >= 0 && argv[i + 1] ? argv[i + 1].split(",").map((s) => s.trim()) : null;
})();
const doExport = !argv.includes("--no-export");
const cases = onlyArg ? CORPUS.filter((c) => onlyArg.includes(c.id)) : CORPUS;

const F = []; // 失败项（阻断）
const W = []; // 告警项（不阻断，必须列出）
const fail = (caseId, name, detail) => {
  F.push({ caseId, name, detail });
  console.log(`  ✗ ${name} —— ${detail}`);
};
const warn = (caseId, name, detail) => {
  W.push({ caseId, name, detail });
  console.log(`  ⚠ ${name} —— ${detail}`);
};
const pass = (name, detail = "") => console.log(`  ✓ ${name}${detail ? ` —— ${detail}` : ""}`);

/** 浏览器打开前先自己把首页和主模块拉一遍 —— vite 首次要建模块图、预打包依赖，
 *  冷启动不做这步的话 Page.load 会等到超时（实测 >30s）。
 *  mp4-muxer 是 export 里的动态 import，只有导出时才首次解析；这里预先拉一次，
 *  否则导出阶段会拿到 "Failed to fetch dynamically imported module"。 */
async function warm(port) {
  for (const p of ["/", "/src/ui/main.ts", "/node_modules/.vite/deps/mp4-muxer.js"]) {
    try {
      await fetch(`http://127.0.0.1:${port}${p}`, { signal: AbortSignal.timeout(90000) });
    } catch {
      /* 预热失败不算致命，open() 与导出各自还有兜底 */
    }
  }
}

/* ------------------------------- dev server -------------------------------- */
// 必须显式 --host 127.0.0.1。默认 vite 只听 localhost（这台机器上解析成 IPv6 ::1），
// Chrome 连 HMR 的 websocket 走 IPv4，连不上就卡在 "[vite] failed to connect to
// websocket"，模块图建不起来 → main.ts 的监听永远不挂 → 每个题材都「门禁未通过」。
function startServer(port) {
  const p = spawn(
    process.execPath,
    [join(ROOT, "node_modules/vite/bin/vite.js"), "--port", String(port), "--strictPort", "--host", "127.0.0.1"],
    { cwd: ROOT, stdio: ["ignore", "pipe", "pipe"] },
  );
  p.stdout.on("data", (d) => process.env.QA_VERBOSE && process.stdout.write(`[vite] ${d}`));
  p.stderr.on("data", (d) => {
    const s = String(d);
    if (/error|Error|EADDR/i.test(s)) process.stderr.write(`[vite!] ${s}`);
  });
  return p;
}

async function waitServer(port, timeoutMs = 60000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/`);
      if (r.ok) return true;
    } catch {
      /* 未就绪 */
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  return false;
}

/** 端口被上一次跑挂的进程占着时，vite 会 strictPort 直接退出 —— 先清掉占端口的进程。
 *  只认 127.0.0.1:<port> 的 LISTENING 连接，不动别的。 */
async function freePort(port) {
  if (process.platform !== "win32") return;
  try {
    const out = execFileSync("netstat", ["-ano", "-p", "TCP"], { encoding: "utf8" });
    const pids = new Set(
      out
        .split("\n")
        .filter((l) => l.includes(`127.0.0.1:${port}`) && l.includes("LISTENING"))
        .map((l) => l.trim().split(/\s+/).pop())
        .filter((p) => /^\d+$/.test(p)),
    );
    for (const pid of pids) {
      if (Number(pid) === process.pid) continue;
      try {
        execFileSync("taskkill", ["/F", "/T", "/PID", pid], { stdio: "ignore" });
        console.log(`  清理占用 ${port} 的残留进程 PID ${pid}`);
      } catch {
        /* 已退出 */
      }
    }
    if (pids.size > 0) await new Promise((r) => setTimeout(r, 1200));
  } catch {
    /* netstat 不可用就跳过，让 vite 自己报错 */
  }
}

/* ------------------------------ ffprobe ----------------------------------- */
const FFPROBE = "E:\\WorkBuddy\\tools\\ffprobe.exe";
function probe(file) {
  const out = execFileSync(
    FFPROBE,
    ["-v", "error", "-show_entries", "stream=codec_type,codec_name,width,height,r_frame_rate",
      "-show_entries", "format=duration,nb_streams", "-of", "json", file],
    { encoding: "utf8" },
  );
  return JSON.parse(out);
}

/* ================================ 主流程 ================================== */
mkdirSync(OUT, { recursive: true });
mkdirSync(join(OUT, "frames"), { recursive: true });

const server = startServer(5199);
let exitCode = 0;
try {
  await freePort(5199);
  if (!(await waitServer(5199))) throw new Error("dev server 未就绪");
  console.log("dev server 就绪 http://127.0.0.1:5199/\n");
  await warm(5199);

  await run(async (b) => {
    await b.open("http://127.0.0.1:5199/");
    // main.ts 是 ES module：Page.load 之后还要建依赖图 + 跑初始化。
    // #btn-load 只在 index.html 里就有，DOM 存在不等于监听已挂 —— 所以这里等
    // btn-load 旁边那个「无 SRT 时点一下也不报错」的信号：直接探测 __stage 探测不到，
    // 改用「按钮是否已 enable + 探测点击是否产生状态变化」过于绕。
    // 最稳的做法是把就绪判断交给下面每个题材自己的轮询（它们都等 __stage）。
    // 这里只做一个下限保证：按钮存在。
    await b.eval(`
      for (let i = 0; i < 100; i++) {
        if (document.getElementById('btn-load')) break;
        await new Promise(r => setTimeout(r, 100));
      }
      return true;
    `);

    for (const c of cases) {
      console.log(`\n═══ ${c.id} · ${c.topic} ═══`);
      const srtText = readFileSync(resolve(ROOT, c.file), "utf8");

      // ① 载入并规划
      const gate = await b.eval(`
        const ta = document.getElementById('srt-input');
        ta.value = ${JSON.stringify(srtText)};
        document.getElementById('btn-load').click();
        // 冷启动首次 plan() 要现编译全部版式模块，60s 上限；顺带覆盖 app 尚未初始化的情况。
        let clicks = 1;
        for (let i = 0; i < 300 && !window.__stage; i++) {
          await new Promise(r => setTimeout(r, 200));
          // main.ts 还没挂上监听时，click 是空操作 —— 补几次，别把「未就绪」误判成「门禁拦下了」
          if (i % 25 === 24) { document.getElementById('btn-load').click(); clicks++; }
        }
        const rep = document.getElementById('gate-report');
        // report() 混排 ok / warn / err 三类：只有无 class 的条目才是错误。
        // 把「门禁通过：11 拍…」当成 problem 是判读错误。
        const items = rep && !rep.hidden ? Array.from(rep.querySelectorAll('li')) : [];
        return {
          errs: items.filter(li => !li.classList.contains('ok') && !li.classList.contains('warn')).map(li => li.textContent),
          warns: items.filter(li => li.classList.contains('warn')).map(li => li.textContent),
          stage: !!window.__stage,
          clicks,
          shots: window.__stage ? window.__stage.shots.length : 0,
          duration: window.__stage ? window.__stage.duration : 0,
        };
      `);

      if (!gate.stage) {
        const tail = b.logs.slice(-12).join("\n      ");
        fail(c.id, "A1 规划建起舞台", gate.errs.length ? gate.errs.slice(0, 3).join(" | ") : `点了 ${gate.clicks} 次仍无舞台（app 未就绪或门禁拦截）${tail ? `\n      页面日志: ${tail}` : ""}`);
        continue;
      }
      pass("A1 规划建起舞台", `${gate.shots} 拍 / ${gate.duration.toFixed(2)}s`);
      if (gate.errs.length > 0) fail(c.id, "A2 门禁无问题", gate.errs.slice(0, 3).join(" | "));
      else pass("A2 门禁无问题", gate.warns.length ? `${gate.warns.length} 条告警（不阻断）` : "");

      // ② SRT 时间覆盖：末拍结束 vs 片长
      const cover = await b.eval(`
        const s = window.__stage;
        return { last: s.shots[s.shots.length-1].end, duration: s.duration };
      `);
      // 拍间 0.25s 交叠是设计（OVERLAP），末拍落在时间轴上时会比 SRT end 早 0.25s。
      // 真正要卡的是「漂移」：时间轴不能比 SRT 短一个 OVERLAP 以上（曾实测 3.70s）。
      const OVERLAP = 0.25;
      const gap = cover.duration - cover.last;
      if (gap < -0.05 || gap > OVERLAP + 1e-3) {
        fail(c.id, "A3 时间轴覆盖 SRT", `片长 ${cover.duration.toFixed(2)}s vs 末拍 end ${cover.last.toFixed(2)}s（差 ${gap.toFixed(2)}s，交叠上限 ${OVERLAP}）`);
      } else pass("A3 时间轴覆盖 SRT", `片长 ${cover.duration.toFixed(2)}s / 末拍 end ${cover.last.toFixed(2)}s`);

      // ③ 逐拍取样：空白 / 静止 / 确定性
      //
      // 关键：走 __renderFrame 显式重画，不能只靠 setAutoRender(false) 后读 canvas。
      // seek() 只推 GSAP 时间轴并置脏，真正的重画在 rAF 循环里；关掉循环就没有画面，
      // 读到的会是上一帧甚至空白 —— 那样 D1 会恒为 0（误判「每拍都静止」）。
      // 这里复刻导出器那条路径：seek → renderFrame → 缩略采样。
      const sample = await b.eval(`
        const s = window.__stage;
        const rf = window.__renderFrame;
        s.setAutoRender(false);
        const cv = s.canvas;
        const ctx = cv.getContext('2d', { alpha: false });
        const probe = document.createElement('canvas');
        probe.width = 240; probe.height = 135;
        const pg = probe.getContext('2d', { willReadFrequently: true });
        // frame 必须是 t 的函数（后期层的颗粒偏移按帧号取，见 post.ts 的
        // applyPost 注释「frame 必须是整数帧号，保证确定性」）。用调用计数器
        // 会让同一 t 的两次取样拿到不同帧号 → E1 误判「不确定」。
        const grab = async (t) => {
          s.seek(t);
          await rf({ ctx, svg: s.svg, shots: s.shots, t, frame: Math.round(t * 30) });
          pg.drawImage(cv, 0, 0, 240, 135);
          return Array.from(pg.getImageData(0,0,240,135).data);
        };
        const mean = (a) => { let s=0; for(let i=0;i<a.length;i+=4) s += (a[i]+a[i+1]+a[i+2])/3; return s/(a.length/4); };
        const diff = (a,b) => { let s=0; for(let i=0;i<a.length;i+=4) s += Math.abs(a[i]-b[i])+Math.abs(a[i+1]-b[i+1])+Math.abs(a[i+2]-b[i+2]); return s/(a.length/4)/3; };
        const out = [];
        for (const sh of s.shots) {
          const mid = (sh.start + sh.end)/2;
          const a = await grab(mid);
          const b2 = await grab(mid);
          const t2 = Math.min(mid + Math.max(0.5,(sh.end-sh.start)*0.35), sh.end - 0.05);
          const cc = await grab(t2);
          out.push({ beat: sh.content.beat, layout: sh.layout.id, mean: mean(a), det: diff(a,b2), motion: diff(a,cc) });
        }
        return out;
      `);

      const blank = sample.filter((s) => s.mean < 12 || s.mean > 248);
      if (blank.length > 0) {
        fail(c.id, "C1 无空白/爆白帧", blank.map((s) => `拍${s.beat}(mean=${s.mean.toFixed(0)})`).join("、"));
      } else pass("C1 无空白/爆白帧", `${sample.length} 拍`);

      const still = sample.filter((s) => s.motion < 0.8);
      if (still.length > 0) {
        warn(c.id, "D1 镜内 Δ 偏低（疑似静止）", still.map((s) => `拍${s.beat}(Δ=${s.motion.toFixed(2)})`).join("、"));
      } else pass("D1 每拍都有镜内运动", `最小 Δ=${Math.min(...sample.map((s) => s.motion)).toFixed(2)}`);

      const nonDet = sample.filter((s) => s.det > 0.5);
      if (nonDet.length > 0) {
        fail(c.id, "E1 确定性（同 t 两次一致）", nonDet.map((s) => `拍${s.beat}(Δ=${s.det.toFixed(2)})`).join("、"));
      } else pass("E1 确定性", `最大 Δ=${Math.max(...sample.map((s) => s.det)).toFixed(3)}`);

      // ④ 文字出安全区：真实渲染后的包围盒，不是估宽
      // ④ 文字出安全区：真实渲染后的包围盒，不是估宽。
      //
      // 两个要点：
      //  a) 用 getBoundingClientRect 相对 svg 换算，而不是 getBBox —— getBBox 不含
      //     祖先 transform，但含自身 transform；GSAP 的入场 y 位移会被算进去，
      //     测到的是动画中途的位置。rect 是屏幕上真正画出来的位置。
      //  b) 测在「本拍入场已收尾」的时刻：入场 tween 期间元素还在移动，
      //     那时的位置不代表稳定构图。取 start + 2.0s（多数入场 <1.5s）。
      //  b) 只测**当前可见的那一层**。舞台把所有拍的图层一次性挂在同一个 svg 里，
      //     靠 opacity 切换；对整个 svg querySelectorAll 会把每一拍都量一遍，
      //     于是报出来的「越界」其实来自别的拍（实测拍1 报的问题出在层 #1）。
      //     判据：可见拍 = shot.start <= t 的最后一拍（交叠期取后者）。
      const textOut = await b.eval(`
        const s = window.__stage;
        const rf = window.__renderFrame;
        s.setAutoRender(false);
        const svgRect = s.svg.getBoundingClientRect();
        const sx = svgRect.width / 1280, sy = svgRect.height / 720;
        const bad = [];
        for (let idx = 0; idx < s.shots.length; idx++) {
          const sh = s.shots[idx];
          const t = Math.min(sh.start + 2.0, sh.end - 0.1);
          s.seek(t);
          await rf({ ctx: s.canvas.getContext('2d', {alpha:false}), svg: s.svg, shots: s.shots, t, frame: Math.round(t*30) });
          const layer = s.svg.querySelector('[data-layer="' + idx + '"]');
          if (!layer) continue;
          for (const el of layer.querySelectorAll('text')) {
            const r = el.getBoundingClientRect();
            if (r.width === 0 || r.height === 0) continue;
            const x = (r.left - svgRect.left) / sx, y = (r.top - svgRect.top) / sy;
            const w = r.width / sx, h = r.height / sy;
            const edges = [];
            if (x < -2) edges.push('左');
            if (y < -2) edges.push('上');
            if (x + w > 1282) edges.push('右');
            if (y + h > 722) edges.push('下');
            if (edges.length > 0) {
              const txt = (el.textContent || '').slice(0, 20);
              const chain = [];
              for (let n = el; n && n !== s.svg; n = n.parentElement) {
                chain.push(n.tagName + (n.getAttribute('data-shot') ? '[' + n.getAttribute('data-shot') + ']' : '')
                  + (n.getAttribute('data-layer') !== null ? '#' + n.getAttribute('data-layer') : '')
                  + (n.getAttribute('data-motion') ? '{' + n.getAttribute('data-motion') + '}' : ''));
              }
              bad.push({
                beat: sh.content.beat,
                layout: sh.layout.id,
                txt,
                chain: chain.join('<'),
                edge: edges.join('/'),
                x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h),
                fs: el.getAttribute('font-size'),
                over: Math.round(Math.max(-x, -y, x + w - 1280, y + h - 720)),
              });
            }
          }
        }
        return bad;
      `);
      if (textOut.length > 0) {
        fail(c.id, "B1 文字不出安全区", textOut.slice(0, 4).map((t) => `拍${t.beat}/${t.layout}「${t.txt}」出${t.edge}越${t.over}px box=(${t.x},${t.y}) ${t.w}×${t.h} @fs${t.fs}`).join("；"));
      } else pass("B1 文字不出安全区");

      // ⑤ G1 数字守恒：画面上的数字必须与 SRT 原文里的数字逐个对得上。
      //
      // 为什么不用抽帧 OCR：OCR 对 0.06 / 0 06 的区分既不可靠也不必要 ——
      // 项目契约是「HTML 是视频画面的权威来源」，canvas 只是 HTML 的光栅化结果。
      // 所以直接比对**渲染后 DOM 里真实存在的文本节点**。
      //
      // 抓的是什么：画面文案净化层把标点全换成空格，`.` 和 `,` 也在表里 ——
      // 「0.06 美元」上画面就成了「0 06 美元」，数字被改了值。这是数据错误，
      // 而 A/B/C/D/E/F 六组全测几何，一个都抓不到（Phase 10 实测：全绿后
      // 抽帧才发现）。这类「几何没毛病但内容错了」的缺陷只能靠内容比对兜住。
      //
      // 口径（第一版太严，此处收敛）：**不要求 SRT 的每个数字都上画面**
      // —— 年份、序号这类旁白里的数字常常故意不画（实测 03 拍2 的「2010」
      // 就是只做背景交代），强求会把这类正常省略判成错。真正的守恒律是：
      // 画面上出现的**每个数字**，都必须能在该拍 SRT 原文里找到同值形态。
      // 「0.06」上画面变成「0 06」→ 归一后画面出现「006」，SRT 里没有「006」
      // → 报错；而「2010」没画 → 画面不出现「2010」→ 不报。
      //
      // 归一规则：数值形态 = 只留数字与小数点，其余（空白/标点/换行）全去掉。
      // 「0.06」→「0.06」合法；「0 06」→「006」与 SRT 的「0.06」对不上 → 判错。
      const numOut = await b.eval(`
        const s = window.__stage;
        const norm = (t) => (t.match(/[\\d.]/g) || []).join('').replace(/\\.+$/, '');
        const layerTexts = (idx) => {
          const layer = s.svg.querySelector('[data-layer="' + idx + '"]');
          // 按 <text> 元素逐个取，不合并整层：坐标轴刻度是相邻的独立文本节点
          // （0 / 20 / 30 / 40），合并成一段后正则会把「20」和「0.10」黏成
          // 「200.10」这种现实中不存在的假数字，制造噪声。
          return layer ? Array.from(layer.querySelectorAll('text')).map((e) => e.textContent || '') : [];
        };
        const bad = [];
        for (let idx = 0; idx < s.shots.length; idx++) {
          const sh = s.shots[idx];
          const t = Math.min(sh.start + 2.0, sh.end - 0.1);
          s.seek(t);
          await window.__renderFrame({ ctx: s.canvas.getContext('2d', {alpha:false}), svg: s.svg, shots: s.shots, t, frame: Math.round(t*30) });
          // 本拍 SRT 原文里所有数字（claim 恒为原文，不编造）
          const claim = [sh.content.headline, sh.content.subhead, sh.content.caption,
            sh.content.left, sh.content.right, sh.content.bignum, sh.content.bullets?.join(' ')]
            .filter(Boolean).join(' ');
          const srtNums = new Set([...claim.matchAll(/\\d+(?:\\.\\d+)?/g)].map((m) => norm(m[0])).filter(Boolean));
          const texts = layerTexts(idx);
          for (const txt of texts) {
            // 排除两类**设计内的非 SRT 数字**（都是元信息/派生刻度，不是数据）：
            //  1) 拍号角标：BEAT 04 / FIG.07 / NO.05 —— 纯元信息，与旁白无关。
            //     判据是前缀，不是数字形状（02 拍5 的章节卡正文就恰好是「05」）。
            //  2) 坐标轴刻度：v2-axis-columns 的 Y 轴四档由 max 值现算
            //     （0 / 0.1 / 0.2 …、0 / 12 / 36 …），本来就不在旁白里。
            //     判据：这个 <text> 整串就是一个纯数字，且没有任何其他数字节点
            //     与之构成同拍数据 —— 实测刻度节点的父链是刻度组，刻度组里全是刻度。
            const isMeta = /^(BEAT|FIG|NO)\\s*\\d+$/i.test(txt.trim());
            const isTick = /^\\d+(\\.\\d+)?$/.test(txt.trim())
              && !srtNums.has(norm(txt));
            if (isMeta || isTick) continue;
            for (const m of txt.matchAll(/\\d+(?:\\.\\d+)?/g)) {
              const key = norm(m[0]);
              if (!key || key.length < 2) continue;         // 单个数字（如拍号）不校验
              if (!srtNums.has(key)) {
                bad.push({ beat: sh.content.beat, layout: sh.layout.id, shown: m[0],
                  srt: [...srtNums].join('/') || '(空)', raw: txt.slice(0, 40) });
              }
            }
          }
        }
        return bad;
      `);
      if (numOut.length > 0) {
        fail(c.id, "G1 画面数字均来自 SRT", numOut.slice(0, 4).map((t) => `拍${t.beat}/${t.layout} 画面出现「${t.shown}」不在本拍 SRT 数字集（${t.srt}）；该层文本=${t.raw}`).join("；"));
      } else pass("G1 画面数字均来自 SRT");

      // ⑥ 导出 + 媒体探测
      if (doExport) {
        const mp4 = join(OUT, `${c.id}.mp4`).replace(/\\/g, "/");
        // 超时按片长放宽：实测 208s 片子在默认 120s 上限处被掐断。
        // 粗算 40×片长 + 120s 兜底（编码比实时快，但光栅化每帧不便宜）。
        const exportTimeout = Math.max(300000, Math.ceil(cover.duration * 40000) + 120000);
        let exp;
        try {
          exp = await b.eval(`
          const s = window.__stage;
          // 签名是 exportMp4(stage, duration, opts) —— opts 是第三个参数。
          // 把配置当第一个参数传会让 stage.time 变成 undefined。
          const blob = await window.__exportMp4(s, s.duration, { width: 1280, height: 720, fps: 24 });
          const u8 = new Uint8Array(await blob.arrayBuffer());
          let s2 = '';
          const CH = 0x8000;
          for (let i = 0; i < u8.length; i += CH) s2 += String.fromCharCode.apply(null, u8.subarray(i, i + CH));
          return { b64: btoa(s2), bytes: u8.length };
        `, exportTimeout);
        } catch (e) {
          fail(c.id, "F 导出", `导出 ${cover.duration.toFixed(0)}s 片子失败/超时：${e?.message ?? e}`);
          continue;
        }
        writeFileSync(mp4, Buffer.from(exp.b64, "base64"));
        const info = probe(mp4);
        const vs = (info.streams ?? []).find((s) => s.codec_type === "video");
        const as = (info.streams ?? []).find((s) => s.codec_type === "audio");
        const dur = Number(info.format?.duration ?? 0);

        if (!vs) fail(c.id, "F1 有视频流", "ffprobe 未找到 video 流");
        else if (vs.width !== 1280 || vs.height !== 720) fail(c.id, "F2 分辨率", `${vs.width}×${vs.height}`);
        else if (as) fail(c.id, "F3 无音轨", `存在 audio 流：${as.codec_name}`);
        else if (Math.abs(dur - cover.duration) > 1.0) {
          fail(c.id, "F4 时长一致", `MP4 ${dur.toFixed(2)}s vs 规划 ${cover.duration.toFixed(2)}s`);
        } else {
          pass("F 成片验收", `${vs.width}×${vs.height} / ${vs.r_frame_rate} / ${dur.toFixed(2)}s / 无音轨`);
        }
      }
    }
  }, { port: PORT });
} catch (e) {
  console.error("\n✗ QA 执行异常:", e?.message ?? e);
  exitCode = 1;
} finally {
  try {
    server.kill();
  } catch {
    /* ignore */
  }
}

/* -------------------------------- 汇总 ------------------------------------ */
console.log("\n" + "═".repeat(60));
console.log(`题材 ${cases.length} 个 · 失败 ${F.length} · 告警 ${W.length}`);
if (F.length > 0) {
  console.log("\n失败项（阻断）：");
  for (const f of F) console.log(`  [${f.caseId}] ${f.name} —— ${f.detail}`);
}
if (W.length > 0) {
  console.log("\n告警项（需人工判断，不阻断）：");
  for (const w of W) console.log(`  [${w.caseId}] ${w.name} —— ${w.detail}`);
}
writeFileSync(
  join(OUT, "report.json"),
  JSON.stringify({ generatedAt: new Date().toISOString(), cases: cases.map((c) => c.id), failures: F, warnings: W }, null, 2),
);
console.log(`\n报告 → ${join(OUT, "report.json")}`);
process.exit(F.length > 0 ? 1 : exitCode);
