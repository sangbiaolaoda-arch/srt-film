import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  cacheDir: "node_modules/.vite",
  test: {
    environment: "node",
    // 沙箱环境下 threads 池写不了模块缓存，会导致测试文件被静默跳过；forks 稳定
    pool: "forks",
    // WorkBuddy 的 fs 代理 shim 对 vite-node 的模块缓存写入（<tmp>/<id>/ssr/<sha1>）
    // 会随机 EPERM，表现为整个测试文件被静默丢掉。npm test 用 tools/test-all.mjs
    // 逐文件运行兜底；这里再关掉 ssr 依赖预构建减少一条写缓存的路径。
    deps: { optimizer: { ssr: { enabled: false } } },
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
  },
});
