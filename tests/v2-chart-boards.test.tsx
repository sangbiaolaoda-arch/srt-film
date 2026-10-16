// Phase 6 第三刀：图表动态图形风三件套（v2 数据巨号 / 坐标柱 / 测量注记）。
//
// 验的不是「板能渲出来」，而是三件承诺：
//   ① 选版路由：度量拍→坐标柱、一数字拍→数据巨号、文字拍→测量注记，
//      且都在 v2 池内解决（requireFirst 修复前，文字拍整拍掉回旧 catalog）；
//   ② 图形语法：等宽数字（fontNum）、真实值刻度（max 现算，无假刻度）、
//      母版网格（p.grid）、编辑风 profile 下降级（无轴无等宽）；
//   ③ 全片一致性：导演覆写钉死图表风时，每一拍都落在这三件套里。

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { V2_LAYOUTS, V2_BOARDS } from "../src/layouts/v2";
import { LayoutSVG } from "../src/layouts/render";
import { pickLayout } from "../src/layouts/pick";
import { plan } from "../src/core/plan";
import type { Layout, RenderContent } from "../src/layouts/types";
import type { StyleProfileId } from "../src/styles/style-system";

const root = resolve(import.meta.dirname, "..");
const SRT = readFileSync(resolve(root, "examples/01-explanatory-tech.srt"), "utf-8");

function demo(over: Partial<RenderContent> = {}): RenderContent {
  return {
    headline: "第二步是建立 TCP 连接", subhead: "", caption: "", bullets: [],
    numbers: [], numberTokens: [], bignum: undefined, unit: "", beat: 5,
    ...over,
  };
}

/** 两个度量值 + 一个跨度值：度量拍的标准形态（span 不进图表）。
 *  numbers 与管线一致地包含全部 token 的值（含 span）—— eligible 的 needs 门
 *  看 numbers.length，chart 资格门看度量值数，两层语义不同都要喂真数据。 */
function measures(): RenderContent["numberTokens"] {
  return [
    { kind: "measure", value: 120, raw: "120 毫秒" },
    { kind: "measure", value: 85, raw: "85%" },
    { kind: "span", value: 10, raw: "十年" },
  ];
}

const MEASURE_CONTENT = (): RenderContent =>
  demo({ numbers: [120, 85, 10], numberTokens: measures() });

function render(layout: Layout, content: RenderContent): string {
  return renderToStaticMarkup(createElement(LayoutSVG, { layout, content }));
}

function byId(id: string): Layout {
  const l = V2_LAYOUTS.find((x) => x.id === `v2-${id}`);
  if (!l) throw new Error(`v2-${id} 未注册`);
  return l;
}

describe("图表风三件套 · 选版路由", () => {
  it("度量拍（≥2 个度量值）→ 坐标柱", () => {
    const picked = pickLayout(MEASURE_CONTENT(), "chart-motion");
    expect(picked.id).toBe("v2-axis-columns");
  });

  it("一数字拍 → 数据巨号", () => {
    const picked = pickLayout(
      demo({ numbers: [3], numberTokens: [{ kind: "measure", value: 3, raw: "3 次" }] }),
      "chart-motion",
    );
    expect(picked.id).toBe("v2-data-giant");
  });

  it("文字拍（无数字）→ 测量注记，且不掉回旧 catalog", () => {
    const picked = pickLayout(demo(), "chart-motion");
    expect(picked.id).toBe("v2-measure-note");
    expect(picked.id.startsWith("v2-")).toBe(true);
  });

  it("跨度值不成图：只有 span 的数字拍走文字板，不硬画柱也不裸渲染 10", () => {
    const picked = pickLayout(
      demo({ numbers: [10], numberTokens: [{ kind: "span", value: 10, raw: "十年" }] }),
      "chart-motion",
    );
    expect(picked.id).toBe("v2-measure-note");
  });

  it("三件套都声明 style: chart-motion（ofStyle 池非空的前提）", () => {
    for (const id of ["data-giant", "axis-columns", "measure-note"]) {
      expect(byId(id).style, id).toBe("chart-motion");
      expect(V2_BOARDS[`v2:${id}`], id).toBeTruthy();
    }
  });

  it("编辑风/扁平风池里选不到图表风板（风格与版式不解耦的回归）", () => {
    for (const style of ["editorial", "flat-vector"] as const) {
      for (let b = 1; b <= 30; b++) {
        const picked = pickLayout(MEASURE_CONTENT(), style);
        expect(picked.id, `beat ${b}`).not.toBe("v2-axis-columns");
        expect(picked.id, `beat ${b}`).not.toBe("v2-data-giant");
        expect(picked.id, `beat ${b}`).not.toBe("v2-measure-note");
      }
    }
  });
});

describe("图表风三件套 · 图形语法", () => {
  it("坐标柱：等宽字体 + 真实值刻度 + 柱顶原文", () => {
    const html = render(byId("axis-columns"), MEASURE_CONTENT());
    expect(html).toContain("JetBrains Mono");                 // 等宽签名（fontNum 的引号被 HTML 转义，断言无引号片段）
    expect(html).toContain("120 毫秒");                       // 柱顶标 raw 原文
    expect(html).toContain(">85%<");                          // 第二柱原文
    // 刻度按 max=120 现算四档：0 / 30 / 60 / 90 / 120 —— 不是装饰假数
    for (const t of [">0<", ">30<", ">60<", ">90<", ">120<"]) expect(html).toContain(t);
    expect(html).toContain("N=2");                            // 度量值计数（span 不计入）
  });

  it("坐标柱：编辑风 profile 下无轴无刻度（token 降级，不是硬编码图表风）", () => {
    const html = render({ ...byId("axis-columns"), style: "editorial" }, MEASURE_CONTENT());
    expect(html).not.toContain("JetBrains");                  // 编辑风 fontNum 是衬线
    expect(html).not.toContain(">90<");                       // 刻度标签整组消失
    expect(html).toContain("120 毫秒");                       // 柱与原文仍在
  });

  it("数据巨号：等宽巨号数字 + 测量尺（accent 尺寸线）", () => {
    const html = render(byId("data-giant"), demo({ bignum: "120毫秒", unit: "毫秒", numbers: [120], numberTokens: [{ kind: "measure", value: 120, raw: "120 毫秒" }] }));
    expect(html).toContain("JetBrains Mono");
    expect(html).toContain("NO.05");                          // 等宽图号（拍号即图号）
    // 单位可拆（120毫秒 → 120 + 毫秒）：单位只出现在数字旁一次，尺下不重复
    expect(html.match(/毫秒/g)?.length ?? 0).toBe(1);
    // 测量尺（尺寸线）仍在
    expect(html).toContain("m-bar-sweep");
    expect(html).toContain("#ff6a00");                        // accent 尺寸线
  });

  it("测量注记：FIG 图号 + 四角定位标记 + 母版网格", () => {
    const html = render(byId("measure-note"), demo({ beat: 7 }));
    expect(html).toContain("FIG.07");
    expect(html).toContain("v2-grid-7");                      // 网格 pattern id 带拍号
    expect(html).toContain("v2-grid5-7");                     // 200px 粗网格
    // 四角定位标记 = 8 根线 + 4 个圆
    expect(html.match(/<circle/g)?.length ?? 0).toBeGreaterThanOrEqual(4);
  });

  it("三件套渲染确定性：同输入两次输出逐字节一致", () => {
    const cases: Array<[string, RenderContent]> = [
      ["axis-columns", demo({ numberTokens: measures() })],
      ["data-giant", demo({ bignum: "3", unit: "次" })],
      ["measure-note", demo({ bullets: ["第一次握手", "第二次握手", "第三次握手"] })],
    ];
    for (const [id, c] of cases) {
      const a = render(byId(id), c);
      const b = render(byId(id), c);
      expect(a, id).toBe(b);
      expect(a.length, id).toBeGreaterThan(1000);
    }
  });
});

describe("v2-vertical · 竖排列不越界（Phase 10 QA 实测回归）", () => {
  // 实测：标题「你手上只有一串 www 开头的字母」的第 9 个字基线落在 673，
  // 整字掉到画面下方（出下边 93px）。原因：只卡了 size ≤ 92，没卡列总高。
  it("竖排列末行基线 ≤ 660（底留 60 安全区），与字长无关", () => {
    for (const headline of [
      "你手上只有一串 www 开头的字母",
      "短",
      "一二三四五六七八九十十一十二",
      "这是一句非常非常非常长的标题用来把竖排列撑满",
    ]) {
      const html = render(byId("vertical"), demo({ headline }));
      const ys = [...html.matchAll(/<text[^>]*\by="([\d.]+)"/g)].map((m) => Number(m[1]));
      expect(ys.length, headline).toBeGreaterThan(0);
      expect(Math.max(...ys), `${headline} 末行基线越界`).toBeLessThanOrEqual(660);
    }
  });

  it("列末底线（竖线）也在安全区内", () => {
    const html = render(byId("vertical"), demo({ headline: "一二三四五六七八九十十一十二" }));
    const m = /<rect[^>]*x="978"[^>]*height="([\d.]+)"/.exec(html);
    expect(m, "竖线矩形缺失").toBeTruthy();
    expect(150 + Number(m![1])).toBeLessThanOrEqual(720);
  });
});

describe("图表风三件套 · 全片一致性", () => {
  it("覆写钉死图表风：每一拍都落进三件套（无 catalog 回退）", () => {
    const ov: Record<string, { style: StyleProfileId }> = {};
    for (let i = 1; i <= 400; i++) ov[String(i)] = { style: "chart-motion" };
    const { shots, problems } = plan(SRT, JSON.stringify(ov));
    expect(problems).toEqual([]);
    const allowed = new Set(["v2-axis-columns", "v2-data-giant", "v2-measure-note"]);
    const used = shots.map((s) => s.layout.id);
    for (const id of used) expect(allowed.has(id), `拍用了三件套外的版式: ${id}`).toBe(true);
    // 11 拍语料里至少覆盖两件套（数据拍 + 文字拍都在）
    expect(new Set(used).size).toBeGreaterThanOrEqual(2);
  });

  it("自动规划：数据密集拍自动命中坐标柱（不靠覆写）", () => {
    // 用 03 数据对比语料：01 语料修掉假度量后没有任何 ≥2 度量值的拍，
    // 自动图表风在该语料正确地一拍都不亮（数据不密集就不硬凑）。
    const srt3 = readFileSync(resolve(root, "examples/03-data-comparison.srt"), "utf-8");
    const { shots } = plan(srt3);
    const auto = shots.filter((s) => (s.layout.style ?? "editorial") === "chart-motion");
    expect(auto.length).toBeGreaterThanOrEqual(1);
    for (const s of auto) expect(s.layout.id).toBe("v2-axis-columns");
    // 对照：01 语料自动规划一个图表风拍都不出
    const { shots: shots1 } = plan(SRT);
    expect(shots1.filter((s) => (s.layout.style ?? "editorial") === "chart-motion")).toHaveLength(0);
  });
});
