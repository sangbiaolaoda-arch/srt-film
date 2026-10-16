// 兼容入口：特效深挖已并入统一门禁 tools/visual-ab.mjs。
// 保留这个文件名是因为 docs/project/progress.md 与 baseline-audit.md 把它记为
// Phase 9 的验收工具（证据在 .tmp/fx-ab-final/report.md）—— 直接删掉会让那些
// 记录指向一个不存在的命令。所有逻辑（页面 helper、判据、报告格式）以 visual-ab 为准，
// 这里只做参数转发，不再复制一份实现。
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const r = spawnSync(process.execPath, [join(here, "visual-ab.mjs"), "--layers", "fx", ...process.argv.slice(2)], {
  stdio: "inherit",
});
process.exit(r.status ?? 1);
