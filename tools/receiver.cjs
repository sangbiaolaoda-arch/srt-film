// 样片接收服务器：把浏览器导出的 MP4 POST 过来存盘（仅本机调试用）。
// 用法: node tools/receiver.cjs
// POST /?name=xxx.mp4  → 存到 WORK/xxx.mp4（名字经过白名单清洗，防路径穿越）
const http = require("http");
const fs = require("fs");
const path = require("path");
const WORK = "E:\\WorkBuddy\\outputs\\05_code\\20261011_srt-film-v3-poster\\work";
fs.mkdirSync(WORK, { recursive: true });

http
  .createServer((req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "*");
    if (req.method === "OPTIONS") { res.end(); return; }
    if (req.method !== "POST") { res.statusCode = 405; res.end(); return; }
    const q = new URL(req.url, "http://x").searchParams;
    const raw = q.get("name") || `sample-${Date.now()}.mp4`;
    const name = path.basename(raw).replace(/[^A-Za-z0-9._-]/g, "_");
    const out = path.join(WORK, name);
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      fs.writeFileSync(out, Buffer.concat(chunks));
      console.log("SAVED", out, Buffer.concat(chunks).length, "bytes");
      res.end("ok");
    });
  })
  .listen(5198, () => console.log("receiver on 5198 ->", WORK));
