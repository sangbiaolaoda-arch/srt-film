// 校验 SKILL.md 里引用的关键事实与源码一致 —— Skill 里的数字错了就是负资产。
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { stripPunct } from "../src/core/text";
import { extractNumbers } from "../src/core/trace";
import { lines } from "../src/layouts/kaojin";

const fails: string[] = [];
const ok = (cond: boolean, msg: string) => { if (!cond) fails.push(msg); };

// 1. Skill 说「0.06 不被净化层改值」
ok(stripPunct("每度大约 0.06 美元").includes("0.06"), "净化层：0.06 应保留小数点");
ok(stripPunct("占比 12.75%").includes("12.75%"), "净化层：百分号应保留");
ok(stripPunct("总量 1,200 次").includes("1,200"), "净化层：千分位应保留");

// 2. Skill 说「四位数+年不算度量值」
ok(!extractNumbers("1915 年 5 月").some((n) => n.raw === "1915"), "抽取：1915 年不该是度量值");
ok(extractNumbers("3000 吨").some((n) => n.value === 3000), "抽取：3000 吨仍应是度量值");

// 3. Skill 说「断行不切开数字/拉丁词 + 守恒」
ok(lines("1922 年", 2)[0] === "1922", "断行：1922 不该被拆");
ok(lines("增长 12.75% 后", 6)[0] === "增长 12.75", "断行：12.75 不该被拆");
for (const t of ["1922 年", "增长 12.75% 后", "TLS 1.3 只需要 1 个往返", "普通的句子"]) {
  for (const n of [2, 3, 4, 6, 8, 20]) {
    ok(lines(t, n).join("") === Array.from(t).join(""), `断行守恒：n=${n} "${t}"`);
  }
}

// 4. Skill 说「时间轴锚 shot.start - OVERLAP」
const sched = readFileSync(resolve(process.cwd(), "src/motion/schedule.ts"), "utf8");
ok(/shot\.start\s*-\s*OVERLAP/.test(sched), "时间轴：应锚 shot.start - OVERLAP");
ok(!/running\s*=\s*Math\.max/.test(sched), "时间轴：不应再有累积游标 running");

// 5. Skill 说「frame 必须是 t 的纯函数，颗粒用 Math.imul(frame, 37)」
const post = readFileSync(resolve(process.cwd(), "src/render/post.ts"), "utf8");
ok(/Math\.imul\(frame,\s*37\)/.test(post), "后期层：颗粒应按 Math.imul(frame,37) 取偏移");

// 6. Skill 说「cream 是反白专用，ink 才是画在纸上」
const sty = readFileSync(resolve(process.cwd(), "src/styles/style-system.ts"), "utf8");
// 6. Skill 说「cream 是反白专用，ink 才是画在纸上」—— 直接用模块导出，别正则啃源码
const { STYLE_PROFILES } = await import("../src/styles/style-system");
for (const s of ["editorial", "flat-vector", "chart-motion"] as const) {
  const prof = STYLE_PROFILES[s];
  const cream = prof.cream;
  const ink = prof.ink;
  const lum = (hex: string) => {
    const m = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(hex);
    if (!m) return 0;
    const [r, g, b] = [1, 2, 3].map((i) => {
      const c = parseInt(m[i]!, 16) / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
  };
  ok(lum(cream) > 0.6, `${s}：cream 应是浅色（实测 ${cream}）`);
  ok(lum(ink) < 0.3, `${s}：ink 应是深色（实测 ${ink}）`);
}

// 7. Skill 说「v2-balance / v2-strata 用 ink 不是 cream」
const v2 = readFileSync(resolve(process.cwd(), "src/layouts/v2.tsx"), "utf8");
for (const name of ["v2Balance", "v2Strata"]) {
  const i = v2.indexOf(`const ${name}`);
  const body = v2.slice(i, v2.indexOf("\n};", i));
  ok(!/fill=\{p\.cream\}/.test(body), `${name}：不应再用 p.cream 当前景`);
}

if (fails.length) {
  console.log(`✗ ${fails.length} 处与 Skill 文档不符：`);
  for (const f of fails) console.log("  · " + f);
  process.exit(1);
}
console.log("✓ Skill 文档引用的 7 组事实全部与源码一致");