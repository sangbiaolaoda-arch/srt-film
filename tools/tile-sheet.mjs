// 纯 tile 拼图（绕开 PowerShell 对 ffmpeg filter_complex 的引号地狱）：
// 读 .tmp/sheet-<slug>/ 下的 s01..sNN.png，拼成 contact-sheet.png。
import { readdirSync } from "node:fs";
import { spawn } from "node:child_process";
import { resolve } from "node:path";

const dir = process.argv[2];
const cols = Number(process.argv[3] ?? 5);
const files = readdirSync(dir).filter((f) => /^s\d+\.png$/.test(f)).sort();
if (files.length === 0) { console.error("没有 sNN.png"); process.exit(1); }
const rows = Math.ceil(files.length / cols);
const inputs = files.flatMap((f) => ["-i", f]);
const sheet = resolve(dir, "contact-sheet.png");
const ff = spawn("ffmpeg", ["-y", ...inputs, "-filter_complex", `tile=${cols}x${rows}`, sheet], { stdio: "inherit", cwd: dir });
ff.on("close", (c) => process.exit(c ?? 1));
