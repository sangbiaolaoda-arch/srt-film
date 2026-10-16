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
import { resolveProfile } from "../src/styles/style-system";

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

describe("v2-steps · 左下大字折行不越界（Phase 10 QA 实测回归）", () => {
  // 实测：05 语料拍17/22 的两行标题在 y=648 基线、60px 字号下
  // 出下边 5~33px。SVG <text> 不自动折行，必须显式分行并按行数反推字号。
  //
  // 包围盒高是量出来的：浏览器里 CJK 46px 字号的 getBoundingClientRect 高 82px
  // （≈1.78em，含下伸部），不是常以为的 1.0~1.3em。
  const DESC = 1.78;
  it("长标题折行后底缘 ≤ 720、右缘 ≤ 1170", () => {
    for (const headline of [
      "你把一辈子活成了一场不下注的赌局",
      "结果她守住了纯粹也守住了孤独",
      "价格可以付亏损必须停",
      "短",
    ]) {
      const html = render(byId("steps"), demo({ headline }));
      const ts = [...html.matchAll(/<text([^>]*)>([\s\S]*?)<\/text>/g)]
        .map((m) => ({
          x: Number(/x="([\d.-]+)"/.exec(m[1]!)?.[1]),
          y: Number(/y="([\d.-]+)"/.exec(m[1]!)?.[1]),
          fs: Number(/font-size="([\d.]+)"/.exec(m[1]!)?.[1]),
          t: m[2]!.replace(/<[^>]+>/g, ""),
        }))
        .filter((t) => t.t && t.y > 400);
      expect(ts.length, headline).toBeGreaterThan(0);
      // CJK ≈ 1em，拉丁/数字 ≈ 0.55em
      const w = (t: string, fs: number) =>
        Array.from(t).reduce((n, ch) => n + (ch.codePointAt(0)! > 0xff ? 1 : 0.55), 0) * fs;
      for (const t of ts) {
        expect(t.y + t.fs * DESC, `${headline} 底缘越界`).toBeLessThanOrEqual(720);
        expect(t.x + w(t.t, t.fs), `${headline} 右缘越界`).toBeLessThanOrEqual(1170);
      }
    }
  });
});

describe("巨号数字 · 数字带单位整体不出版心（Phase 10 QA 实测回归）", () => {
  // 实测：03 语料拍4「0.06 美元」—— 字号只按 shown 算（1000px 满宽），
  // 单位被放到 shown 右缘再 +40，落在 x=1180、宽 94 → 出右 72px。
  // 单位 x 还要和 shown 的右缘对齐，别重复计一遍 shown 的半宽。
  /** 取板式里所有 <text>，返回 {x, fs, anchor, text}。用结构而不是颜色定位，
   *  accent 是 profile token，三系各不相同，写死颜色会漏判。 */
  function textsOf(html: string): { x: number; fs: number; anchor: string; t: string }[] {
    return [...html.matchAll(/<text([^>]*)>([\s\S]*?)<\/text>/g)].map((m) => ({
      x: Number(/x="([\d.-]+)"/.exec(m[1]!)?.[1]),
      fs: Number(/font-size="([\d.]+)"/.exec(m[1]!)?.[1]),
      anchor: /text-anchor="(\w+)"/.exec(m[1]!)?.[1] ?? "start",
      t: m[2]!.replace(/<[^>]+>/g, ""),
    }));
  }

  for (const id of ["num-giant", "data-giant"]) {
    it(`${id}：数字 + 单位右缘 ≤ 1170（版心）`, () => {
      for (const [bignum, unit] of [
        ["0.06 美元", "美元"],
        ["120毫秒", "毫秒"],
        ["1200万", "万"],
      ] as [string, string][]) {
        const ts = textsOf(render(byId(id), demo({ bignum, unit, numbers: [120], numberTokens: [] })));
        // 单位是最后一条 anchor=start 的短文本（主数字居中，图号带 NO. 前缀）
        const unitEl = ts.filter((t) => t.anchor === "start" && t.t && !t.t.startsWith("NO.")).pop();
        expect(unitEl, `${id}「${bignum}」未拆出单位`).toBeTruthy();
        const right = unitEl!.x + unitEl!.fs * 0.62 * Array.from(unitEl!.t).length;
        expect(right, `${id}「${bignum}」单位右缘 ${Math.round(right)} 越出版心 1170`).toBeLessThanOrEqual(1170);
      }
    });
  }
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

describe("三系前景可读性 · cream 语义反转门禁（Phase 10 抽帧目视回归）", () => {
  // 实测：02 语料拍1（v2-balance / flat-vector）整幅接近全白 —— 文字与横梁都用
  // cream，而 cream 在编辑风是深墨（#161410）、在扁平/图表风是纯白（#ffffff）。
  // 同一个 token 在三系里语义相反，被当成「墨」用就等于白字画白底。
  //
  // 这道门禁按实际渲染出的颜色算 WCAG 相对亮度差，任何 profile 下
  // 「文字压在纸白底上」低于阈值即失败。不逐板点名，靠数据说话。
  const lum = (hex: string): number => {
    const m = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(hex.trim());
    if (!m) return 1;
    const [r, g, b] = [1, 2, 3].map((i) => {
      const c = parseInt(m[i]!, 16) / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
  };
  const ratio = (a: string, b: string): number => {
    const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x) as [number, number];
    return (hi + 0.05) / (lo + 0.05);
  };

  for (const style of ["editorial", "flat-vector", "chart-motion"] as const) {
    it(`${style}：满版板压纸白底的文字对比度 ≥ 3.0`, () => {
      const prof = resolveProfile(style);
      for (const id of ["balance", "strata", "steps", "chapter", "quote-card", "list-marks"]) {
        const layout = V2_LAYOUTS.find((x) => x.id === `v2-${id}`)!;
        const html = render({ ...layout, style }, demo({ headline: "他犹豫了一下还是说了出来", left: "左边更重", right: "右边更轻" }));
        // 纸白底：板内最大的那个浅色 rect / 缺省底色
        const bg = prof.paper;
        // 前景：所有正文 <text> 的 fill（排除反白用的 paper/cream 压色块者）
        const fills = [...html.matchAll(/<text[^>]*fill="([^"]+)"/g)].map((m) => m[1]!);
        expect(fills.length, `${id} 无文字`).toBeGreaterThan(0);
        for (const f of fills) {
          // 反白只在「压在深色块上」时成立。这几块板（balance/strata/steps/…）的
          // 文字压的是纸白底或浅色带，cream/paper 在这里是错的用法，必须判失败。
          const r = ratio(f, bg);
          expect(r, `${id}/${style} 文字 ${f} 压纸白 ${bg} 对比度 ${r.toFixed(2)} 不足（cream/paper 是反白专用，压浅底即不可读）`).toBeGreaterThanOrEqual(3);
        }
      }
    });
  }

  it("cream 三系都是浅色（反白专用）；ink 才是画在纸上的前景", () => {
    for (const style of ["editorial", "flat-vector", "chart-motion"] as const) {
      const p = resolveProfile(style);
      expect(lum(p.cream), `${style} cream 应为浅色`).toBeGreaterThan(0.6);
      expect(lum(p.ink), `${style} ink 应为深色`).toBeLessThan(0.3);
    }
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
