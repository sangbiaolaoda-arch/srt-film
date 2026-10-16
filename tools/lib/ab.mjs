// agent-browser 驱动（visual-ab / visual-review / qa-frames / e2e-export 同一套）。
//
// 抽出来的理由不是"整洁"，是**漂移**：本项目已经吃过两次"同一逻辑两份复制品"的亏
// ——plan-dry 里过期的 ⚠超宽 标记、门禁删了它还在打勾。harness 复制一份就会重演。
//
// 发现逻辑：先找 PATH 里的 agent-browser shim；shim 同级有 node_modules/agent-browser
// 就直接用 node 跑它的 bin（Windows 的 .cmd shim 会吞 stdin，QA 脚本要往 stdin 送
// 表达式，所以优先走 node 路径）。可用 AGENT_BROWSER_BIN 覆盖。

import { spawn } from "node:child_process";
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

export function resolveAB() {
  if (process.env.AGENT_BROWSER_BIN) return { cmd: process.env.AGENT_BROWSER_BIN, pre: [] };
  for (const d of (process.env.PATH || "").split(";").filter(Boolean)) {
    for (const ext of ["", ".cmd", ".exe"]) {
      const shim = join(d, `agent-browser${ext}`);
      if (!existsSync(shim)) continue;
      const js = join(d, "node_modules", "agent-browser", "bin", "agent-browser.js");
      if (existsSync(js)) return { cmd: process.execPath, pre: [js] };
      if (ext === ".cmd") return { cmd: process.env.ComSpec || "cmd.exe", pre: ["/c", shim] };
      return { cmd: shim, pre: [] };
    }
  }
  return { cmd: "agent-browser", pre: [] };
}

export function makeAb({ root = process.cwd(), log = ".tmp/ab.log" } = {}) {
  const AB = resolveAB();
  const LOG = resolve(root, log);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const run = (cmd, args, { input } = {}) =>
    new Promise((res) => {
      mkdirSync(dirname(LOG), { recursive: true });
      const fd = openSync(LOG, "a");
      const from = statSync(LOG).size;
      const finish = (code, extra = {}) => {
        try { closeSync(fd); } catch {}
        let out = "";
        try { out = readFileSync(LOG).subarray(from).toString("utf8"); } catch {}
        res({ code, out, ...extra });
      };
      const p = spawn(cmd, args, { stdio: ["pipe", fd, fd] });
      p.on("error", (e) => finish(-1, { err: String(e?.message || e) }));
      p.on("close", (c) => finish(c));
      if (input !== undefined) p.stdin.write(input);
      p.stdin.end();
    });
  const ab = (args, opts = {}) => run(AB.cmd, [...AB.pre, ...args], opts);
  /** agent-browser 会把结果 JSON 化并可能再包一层引号，剥到真正的值为止。 */
  const unwrap = (s) => {
    let v = s;
    for (let i = 0; i < 8 && typeof v === "string"; i++) {
      try { v = JSON.parse(v.trim()); } catch { break; }
    }
    return v;
  };
  const ev = async (js) => unwrap((await ab(["eval", "--stdin"], { input: js })).out);
  return { ab, ev, sleep, run, logPath: LOG };
}