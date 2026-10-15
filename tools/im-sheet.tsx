// 接触印相：把 6 套 image 满版板 × 3 系拼成一页 HTML，供无头浏览器截图目视。
// 用法: node tools/run-ts.mjs tools/im-sheet.tsx [输出 html]
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { IM_LAYOUTS } from "../src/layouts/im-board";
import type { RenderContent } from "../src/layouts/types";
import type { StyleProfileId } from "../src/styles/style-system";

const out = process.argv[2] ?? ".tmp/im-board/sheet.html";
mkdirSync(dirname(resolve(process.cwd(), out)), { recursive: true });

const demo: RenderContent = {
  headline: "服务器返回 HTML，耗时 120 毫秒",
  subhead: "这一步叫 DNS 查询",
  bignum: "120",
  unit: "毫秒",
  caption: "浏览器先要解决地址问题",
  left: "十年前",
  right: "现在",
  bullets: ["输入网址按下回车", "翻译成 IP 地址", "服务器返回页面"],
  numbers: [120, 85, 3],
  numberTokens: [
    { raw: "120 毫秒", value: 120, kind: "measure" },
    { raw: "85%", value: 85, kind: "measure" },
    { raw: "3 步", value: 3, kind: "measure" },
  ],
  beat: 3,
};

const STYLES: StyleProfileId[] = ["editorial", "flat-vector", "chart-motion"];
const dir = dirname(resolve(process.cwd(), ".tmp/im-board/boards/x.svg"));

const cells = IM_LAYOUTS.map((l) =>
  STYLES.map((sid) => {
    const f = resolve(dir, `${l.id}-${sid}.svg`);
    let inner = "";
    try {
      const svg = readFileSync(f, "utf8");
      inner = svg.replace(/^<svg[^>]*>/, "").replace(/<\/svg>$/, "");
    } catch {
      inner = `<text x="20" y="40" fill="red">missing</text>`;
    }
    return `<figure><div class="frame"><svg viewBox="0 0 1280 720" width="100%">${inner}</svg></div><figcaption>${l.id} · ${sid}</figcaption></figure>`;
  }).join(""),
).join("");

writeFileSync(
  out,
  `<!doctype html><meta charset="utf-8"><style>
body{background:#222;color:#eee;font:13px system-ui;margin:0;padding:16px}
.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}
figure{margin:0}
.frame{background:#fff;aspect-ratio:16/9;overflow:hidden}
figcaption{padding:4px 2px;opacity:.8;font-size:12px}
</style><div class="grid">${cells}</div>`,
  "utf8",
);
console.log(`sheet → ${out}`);
