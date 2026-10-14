// 一次性诊断：打印 02 语料每拍的风格与版式选择
import { readFileSync } from "node:fs";
import { plan } from "../src/core/plan";

const srt = readFileSync("examples/02-narrative-emotion.srt", "utf-8");
const { shots } = plan(srt, "");
shots.forEach((s, i) => {
  const l = s.layout;
  console.log(String(i + 1).padStart(2), (l.style ?? "editorial").padEnd(9), l.id.padEnd(20), l.group.padEnd(10), (l.flagship ? "FLAG" : "----"), s.content.headline.slice(0, 12));
});
