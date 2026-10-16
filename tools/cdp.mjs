// Phase 10 · 极简 CDP 驱动（零新增依赖：node 24 自带 WebSocket）。
//
// 为什么自己写而不是装 playwright：QA 工具必须在离线环境可跑，且不能往仓库塞
// 几百 MB 浏览器下载。本机 Chrome 已存在，CDP 是它公开的调试协议 —— 走这条路
// 只为「真实浏览器渲染 + 真实导出」取证，其余逻辑仍复用项目既有工具。
//
// 用法：const { run } = import("./cdp.mjs");
//   await run(async (b) => { await b.open(url); ... }, { port: 9333 });

import { spawn, execFileSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { tmpdir } from "node:os";

const CHROME_CANDIDATES = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
];

function findChrome() {
  if (process.env.CHROME_BIN) return process.env.CHROME_BIN;
  for (const p of CHROME_CANDIDATES) if (existsSync(p)) return p;
  return null;
}

/** 等待 TCP 端口就绪（CDP HTTP 端点 /json/version）。 */
async function waitPort(port, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (r.ok) return await r.json();
    } catch {
      /* 还没起来 */
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`CDP 端口 ${port} 在 ${timeoutMs}ms 内未就绪`);
}

/** 一个极薄 CDP 客户端：只实现本 QA 需要的三个域（Page / Runtime / 截图）。 */
class Cdp {
  constructor(ws, id) {
    this.ws = ws;
    this.id = id;
    this.seq = 0;
    this.pending = new Map();
    this.logs = [];
    ws.addEventListener("message", (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id !== undefined) {
        const p = this.pending.get(msg.id);
        if (p) {
          this.pending.delete(msg.id);
          msg.error ? p.reject(new Error(JSON.stringify(msg.error))) : p.resolve(msg.result);
        }
        return;
      }
      if (msg.method === "Runtime.consoleAPICalled") {
        this.logs.push(
          msg.params.args.map((a) => a.value ?? a.description ?? "").join(" "),
        );
      }
      if (msg.method === "Runtime.exceptionThrown") {
        const d = msg.params.exceptionDetails;
        this.logs.push(`EXCEPTION ${d.text} ${d.exception?.description ?? ""}`);
      }
    });
  }

  send(method, params = {}, sessionId, timeoutMs = 0) {
    const id = ++this.seq;
    const payload = { id, method, params };
    if (sessionId) payload.sessionId = sessionId;
    this.ws.send(JSON.stringify(payload));
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      // 单次求值的上限按需放大：导出整片是一次阻塞调用，
      // 208s 的片子（4998 帧 @24fps）远超默认 120s。
      const limit = timeoutMs || (this.defaultTimeout ?? 120000);
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`CDP 超时(${limit / 1000}s): ${method}`));
        }
      }, limit);
    });
  }

  /** 在当前页面上下文求值；返回 JSON 可序列化的值。
   *  timeoutMs：长任务（导出整片）要显式放宽。 */
  async eval(expr, timeoutMs = 0) {
    const r = await this.send(
      "Runtime.evaluate",
      {
        expression: `(async () => { ${expr} })()`,
        awaitPromise: true,
        returnByValue: true,
      },
      undefined,
      timeoutMs,
    );
    if (r.exceptionDetails) {
      throw new Error(
        `页面求值异常: ${r.exceptionDetails.text} ${r.exceptionDetails.exception?.description ?? ""}`,
      );
    }
    return r.result.value;
  }

  async open(url, timeoutMs = 60000) {
    await this.send("Page.enable");
    await this.send("Runtime.enable");
    await this.send("Page.navigate", { url });
    // 等 load：轮询 document.readyState，比固定 sleep 稳。
    // 冷启动的 vite 首次拉模块图 + 预打包依赖可能几十秒，默认给到 60s。
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 250));
      try {
        const st = await this.eval(`return document.readyState;`);
        if (st === "complete") return;
      } catch {
        /* 导航中，忽略 */
      }
    }
    throw new Error(`页面 ${timeoutMs / 1000}s 内未 load: ${url}`);
  }

  /** 截图（base64 PNG）。可传 clip={x,y,width,height,scale}（CSS 像素）只截一块。 */
  async shot(clip) {
    const r = await this.send("Page.captureScreenshot", clip ? { format: "png", clip } : { format: "png" });
    return r.data;
  }
}

/**
 * 起浏览器 → 连第一个 page target → 跑 fn → 关浏览器。
 * fn 收到一个 Cdp 实例。抛错会向上传播。
 */
export async function run(fn, { port = 9333, headless = true } = {}) {
  const bin = findChrome();
  if (!bin) throw new Error("找不到 Chrome/Edge，设置 CHROME_BIN 指定路径");
  // profile 必须放项目外：放项目里 vite 的 watcher 会去 watch Chrome 正在写的
// Cookies/History，Windows 上这些文件锁死 → vite 自己 EBUSY 崩掉 →
// 页面断连 → QA 报「点了 N 次仍无舞台」。系统临时目录没有 watcher。
const profile = resolve(tmpdir(), `srt-film-cdp-${port}`);
  // 上次异常退出留下的 profile 可能还锁着（EBUSY）；删不掉就换一个带戳的新目录，
  // 千万别让清理失败把整轮 QA 打断。
  let usable = profile;
  for (let i = 0; i < 5; i++) {
    try {
      rmSync(usable, { recursive: true, force: true });
      mkdirSync(usable, { recursive: true });
      break;
    } catch {
      usable = `${profile}-${process.pid}-${i}`;
    }
  }
  mkdirSync(usable, { recursive: true });

  const args = [
    headless ? "--headless=new" : "",
    "--disable-gpu",
    "--no-sandbox",
    "--hide-scrollbars",
    "--mute-audio",
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${usable}`,
    "about:blank",
  ].filter(Boolean);

  const proc = spawn(bin, args, { stdio: "ignore" });
  let cdp;
  try {
    const ver = await waitPort(port);
    const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    const page = list.find((t) => t.type === "page");
    if (!page) throw new Error("没有 page target");
    const ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((res, rej) => {
      ws.addEventListener("open", res);
      ws.addEventListener("error", rej);
    });
    cdp = new Cdp(ws, page.id);
    cdp.browserVersion = ver.Browser;
    return await fn(cdp);
  } finally {
    try {
      cdp?.ws?.close();
    } catch {
      /* ignore */
    }
    // 先关连接再杀浏览器，等 browser 真正 gone 再删 profile。
    proc.kill();
    if (process.platform === "win32") {
      // 必须同步等待：taskkill 返回前 Chrome 子进程仍握着 profile 的句柄，
      // 直接 rmSync 会 EBUSY/EPERM（Cookies、History 这些文件锁最紧）。
      try {
        execFileSync("taskkill", ["/F", "/T", "/PID", String(proc.pid)], { stdio: "ignore", timeout: 15000 });
      } catch {
        /* 进程已退出 */
      }
    }
    // 句柄释放有延迟，重试几次；删不掉也只是留个临时目录，不影响 QA 结论。
    for (let i = 0; i < 6; i++) {
      try {
        rmSync(usable, { recursive: true, force: true });
        break;
      } catch {
        await new Promise((r) => setTimeout(r, 700));
      }
    }
  }
}

export { Cdp };
