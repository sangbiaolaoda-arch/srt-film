// 逐文件跑 vitest：合并跑时 WorkBuddy 的 fs 代理 shim 会随机 EPERM 掉某个测试文件的
// 模块缓存写入，导致「3 个文件只跑 2 个却显示全绿」。单文件运行不受影响，
// 且每个文件独立退出码 —— 任何文件失败都必然非零退出，门禁不可能静默少跑。
import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const files = readdirSync(resolve(root, "../tests"))
  .filter((f) => f.endsWith(".test.ts") || f.endsWith(".test.tsx"))
  .sort();

let failed = 0;
for (const f of files) {
  const r = spawnSync(
    process.execPath,
    [resolve(root, "../node_modules/vitest/vitest.mjs"), "run", `tests/${f}`],
    { stdio: "inherit", cwd: resolve(root, "..") },
  );
  if (r.status !== 0) {
    console.error(`\n✗ ${f} 失败（exit ${r.status}）`);
    failed++;
  }
}

if (files.length === 0) {
  console.error("没有找到任何测试文件");
  process.exit(1);
}
if (failed > 0) {
  console.error(`\n${failed}/${files.length} 个测试文件失败`);
  process.exit(1);
}
console.log(`\n${files.length} 个测试文件全部通过`);
