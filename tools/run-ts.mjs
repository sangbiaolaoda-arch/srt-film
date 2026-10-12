// 用 vite 的 ssrLoadModule 跑 tools/ 下的 TS 脚本（node 无法直接跑无扩展名的相对 import）
// 用法: node tools/run-ts.mjs tools/style-sweep.ts
import { createServer } from "vite";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const entry = "/" + (process.argv[2] ?? "tools/dupes.ts").replace(/^\/+/, "");

const server = await createServer({
  root,
  server: { middlewareMode: true },
  appType: "custom",
  logLevel: "silent",
});
try {
  await server.ssrLoadModule(entry);
} finally {
  await server.close();
}
