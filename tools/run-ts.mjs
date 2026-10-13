// 用 vite 的 ssrLoadModule 跑 tools/ 下的 TS 脚本（node 无法直接跑无扩展名的相对 import）
// 用法: node tools/run-ts.mjs tools/style-sweep.ts
import { createServer } from "vite";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const entry = "/" + (process.argv[2] ?? "tools/dupes.ts").replace(/^\/+/, "");

// 本文件是进程入口，被加载的脚本从 process.argv[2] 起读到的其实是本文件的路径。
// 把它摘掉，让下游脚本按正常 CLI 习惯用 argv[2]、argv[3]…… 取自己的参数。
process.argv.splice(2, 1);

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
