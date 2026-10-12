#!/usr/bin/env node
// 内联 <script> 语法门禁 —— 把 HTML 里的每段内联脚本抓出来做一次真正的语法解析。
//
// 为什么需要它
// ------------
// 单文件 HTML 片子没有构建步骤：改坏一个花括号，浏览器只会白屏，控制台一句
// "Unexpected end of input"。而在逐帧验收里，白屏表现为「所有截图长得一样」，
// 极容易被误判成「这一拍本来就该是空的」。
// 这个门禁把语法错误挡在人眼验收之前 —— light-lag 制作时正是靠它抓到一次
// 「读数 if/else 链重排后漏了闭合花括号」。
//
// 怎么实现的（为什么不用 node --check）
// ------------------------------------
// 本机沙箱里从 node 内部 spawn 同一个 node.exe 会 EBUSY；而且 `node --check` 只认
// 「脚本」不认 ESM（模块里的 import 会被误报成语法错误）。所以：
//   · 经典 <script>        → node:vm 的 new vm.Script(code, {filename})
//                            V8 原生解析，零子进程、**不求值**、行号精确
//   · <script type=module> → vm.SourceTextModule（纯解析，需 --experimental-vm-modules）
//                            或退路：唯一命名临时文件 + import()
//                            （见 checkModule 的注释与 npm run lint:html）
//
// 用法
// ----
//   npm run lint:html                                 # 推荐入口（带 --experimental-vm-modules）
//   node tools/check-html-syntax.mjs                  # 扫 *.html + examples/**/*.html
//   node tools/check-html-syntax.mjs a.html b.html    # 只查指定文件
//   node tools/check-html-syntax.mjs --skip-module x.html   # 跳过 module 块
//
// 退出码：有语法错 → 1；全过 → 0；显式指定文件却抓不到脚本 → 1（避免门禁空转）。

import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import vm from "node:vm";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const TMP = join(ROOT, ".tmp", "htmllint");

/** 匹配内联脚本：<script ...> ... </script>（非贪婪；带 src 的跳过） */
const SCRIPT_RE = /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi;

/** 待检查的 HTML 文件 */
function collect(targets) {
  if (targets.length > 0) return targets.map((p) => resolve(ROOT, p));
  const found = [];
  const walk = (dir, recurse) => {
    for (const name of readdirSync(dir)) {
      if (name === "node_modules" || name === "dist" || name === ".tmp" || name === ".git") continue;
      const abs = join(dir, name);
      if (statSync(abs).isDirectory()) {
        if (recurse) walk(abs, true);
      } else if (name.endsWith(".html")) {
        found.push(abs);
      }
    }
  };
  walk(ROOT, false); // 仓库根的 *.html
  const ex = join(ROOT, "examples");
  try {
    if (statSync(ex).isDirectory()) walk(ex, true);
  } catch {
    /* 没有 examples 目录就跳过 */
  }
  return found.sort();
}

/** "第几行开始"，把脚本内部行号映射回 HTML 行号 */
const lineOf = (text, index) => text.slice(0, index).split("\n").length;

/** 从错误堆栈首行取行号： "x.0.cjs:3" / "file:///E:/a/b.mjs:7" */
function parseLoc(stack) {
  const first = String(stack ?? "").split("\n")[0] ?? "";
  const m = first.match(/:(\d+)(?::\d+)?\s*$/);
  return m ? Number(m[1]) : null;
}

/**
 * 定位到真正该给人看的源码行。
 * "Unexpected end of input" 这类错误，V8 报的位置在输入末尾之后（常常是空行），
 * 直接照搬只会得到一句空引用；所以命中空行时往前找最近的非空行。
 */
function locateSource(code, line) {
  const lines = code.split("\n");
  if (line === null) return null;
  for (let i = Math.min(line, lines.length) - 1; i >= 0; i--) {
    const text = (lines[i] ?? "").replace(/\t/g, "  ").trim();
    if (text) return { line: i + 1, text };
  }
  return null;
}

/** 经典脚本：V8 解析，不求值 */
function checkClassic(code, filename) {
  try {
    new vm.Script(code, { filename, displayErrors: true });
    return null;
  } catch (e) {
    if (e.name !== "SyntaxError") throw e;
    return { reason: e.message, line: parseLoc(e.stack) };
  }
}

/**
 * 降级行号推断：模块解析器在本版 Node 上不返回位置信息（SyntaxError 只有消息、
 * 没有 lineNumber），所以把模块专有语法逐行改写成经典脚本能解析的形式，再借
 * vm.Script 拿行号。改写**逐行替换、不增删换行**，所以行号一一对应，可以直接用。
 * 它只用来定位，不参与判定 —— 判定永远由真正的模块解析器负责。
 */
function toClassicHint(code) {
  return code
    .split("\n")
    .map((ln) =>
      ln
        .replace(/^(\s*)export\s+default\s+/, "$1")
        .replace(/^(\s*)export\s+(?=(const|let|var|function|class|async|\{|\*))/, "$1")
        .replace(/^(\s*)export\s*\{[^}]*\}(?:\s*from\s*['"][^'"]*['"])?\s*;?\s*$/, "$1;")
        .replace(/^(\s*)import\s[^;]*?from\s*['"][^'"]*['"]\s*;?/, "$1;")
        .replace(/^(\s*)import\s*['"][^'"]*['"]\s*;?/, "$1;")
        .replace(/\bimport\.meta\b/g, "({})"),
    )
    .join("\n");
}

function moduleLineHint(code) {
  try {
    new vm.Script(toClassicHint(code), { filename: "module-hint" });
    return null;
  } catch (e) {
    if (e.name !== "SyntaxError") return null;
    const at = locateSource(code, parseLoc(e.stack));
    return at === null ? null : at.line;
  }
}

/**
 * 模块脚本的语法检查。
 * 优先用 vm.SourceTextModule（开 --experimental-vm-modules 时存在）：纯解析、不求值。
 * 没开这个 flag 的退路是把代码落到一个**唯一命名**的临时文件后 import() —— 解析发生在
 * 链接期，所以 SyntaxError 一定会先抛；代价是模块顶层会被真实求值一次，因此除
 * SyntaxError 以外的异常（如 document is not defined）一律忽略。
 * 文件名带 pid + 时间戳：本机沙箱禁止改写已存在的文件，只能每次新建。
 */
async function checkModule(code, tag) {
  let reason = null;

  if (typeof vm.SourceTextModule === "function") {
    try {
      new vm.SourceTextModule(code, { identifier: `${tag}.mjs` });
      return null;
    } catch (e) {
      if (e.name !== "SyntaxError") return null;
      reason = e.message;
    }
  } else {
    mkdirSync(TMP, { recursive: true });
    const file = join(TMP, `${tag}.${process.pid}.${Date.now()}.mjs`);
    writeFileSync(file, code, "utf8");
    try {
      await import(pathToFileURL(file).href);
      return null;
    } catch (e) {
      if (e.name !== "SyntaxError") return null;
      reason = e.message;
    }
  }

  return { reason, line: moduleLineHint(code) };
}

async function checkFile(abs, opts) {
  const html = readFileSync(abs, "utf8");
  const rel = relative(ROOT, abs).replace(/\\/g, "/");
  const blocks = [];

  SCRIPT_RE.lastIndex = 0;
  let m;
  while ((m = SCRIPT_RE.exec(html)) !== null) {
    const attrs = m[1] ?? "";
    const code = m[2] ?? "";
    if (/\bsrc\s*=/i.test(attrs)) continue; // 外链脚本不归我们管
    if (code.trim() === "") continue; // 空块跳过
    const openTagEnd = m.index + m[0].indexOf(">") + 1;
    const module = /\btype\s*=\s*["']?module["']?/i.test(attrs);
    if (module && opts.skipModule) continue;
    blocks.push({ code, module, startLine: lineOf(html, openTagEnd) });
  }

  const errors = [];
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    const tag = `${basename(abs).replace(/\.html$/i, "")}.${i}`;
    const bad = b.module ? await checkModule(b.code, tag) : checkClassic(b.code, tag);
    if (!bad) continue;
    const at = locateSource(b.code, bad.line);
    errors.push({
      index: i,
      module: b.module,
      htmlLine: at === null ? null : b.startLine + at.line - 1,
      inScriptLine: at === null ? bad.line : at.line,
      // 模块的行号是「降级推断」出来的（见 moduleLineHint），措辞上标出来
      lineHint: b.module && at !== null,
      reason: bad.reason,
      srcLine: at === null ? "" : at.text,
    });
  }

  return { rel, blocks: blocks.length, errors };
}

/* ------------------------------- 主流程 ------------------------------- */

const argv = process.argv.slice(2);
const opts = { skipModule: argv.includes("--skip-module") };
const explicit = argv.filter((a) => !a.startsWith("--"));

const files = collect(explicit);
if (files.length === 0) {
  console.error("没有找到任何 .html 文件");
  process.exit(1);
}

let totalBlocks = 0;
let failed = 0;

for (const f of files) {
  const r = await checkFile(f, opts);
  totalBlocks += r.blocks;
  if (r.errors.length === 0) {
    console.log(`✓ ${r.rel}  (${r.blocks} 段内联脚本)`);
    continue;
  }
  failed += r.errors.length;
  console.error(`✗ ${r.rel}  (${r.blocks} 段内联脚本，${r.errors.length} 段语法不过)`);
  for (const e of r.errors) {
    const where = e.htmlLine === null
      ? "行号未知"
      : `${e.lineHint ? "疑似 " : ""}HTML 第 ${e.htmlLine} 行（脚本内第 ${e.inScriptLine} 行）`;
    console.error(`   · 第 ${e.index + 1} 段${e.module ? "（module）" : ""}  ${where}`);
    console.error(`     ${e.reason}`);
    if (e.srcLine) console.error(`     > ${e.srcLine}`);
  }
}

console.log("");
if (totalBlocks === 0) {
  // 默认扫描下「一个内联脚本都没有」是合法的（本仓库的 HTML 全是外链 module）；
  // 但显式传了文件却查不到脚本，说明路径写错了 —— 这种情况必须报错，否则门禁空转。
  if (explicit.length > 0) {
    console.error(`✗ 指定的 ${files.length} 个文件里没有内联脚本 —— 检查路径，避免门禁空转`);
    process.exit(1);
  }
  console.log(`· ${files.length} 个 HTML 均无内联脚本，无需检查`);
  process.exit(0);
}
if (failed > 0) {
  console.error(`✗ ${failed} 段内联脚本语法不过（共 ${totalBlocks} 段 / ${files.length} 个文件）`);
  process.exit(1);
}
console.log(`✓ ${totalBlocks} 段内联脚本语法全过（${files.length} 个文件）`);
