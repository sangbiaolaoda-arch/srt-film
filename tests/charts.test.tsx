// Phase 6 数据图表模块测试：风格 token 接入 + 数值归一化 + 图表风轴标签。
// 关键回归：原始 content 数字（85 / 120 / 3.2 这种量级）曾直接乘槽高把柱子画出
// 画布；归一化后所有几何必须留在画布内。

import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Chart, CHART_KINDS } from "../src/layouts/charts";
import { STYLE_PROFILES, PROFILE_ORDER } from "../src/styles/style-system";

const render = (kind: (typeof CHART_KINDS)[number], values?: number[]) =>
  renderToStaticMarkup(
    createElement(Chart, {
      kind,
      w: 400,
      h: 300,
      seed: 7,
      values,
      profile: STYLE_PROFILES["chart-motion"],
    }),
  );

const renderWith = (kind: (typeof CHART_KINDS)[number], profile: keyof typeof STYLE_PROFILES, values?: number[]) =>
  renderToStaticMarkup(
    createElement(Chart, {
      kind,
      w: 400,
      h: 300,
      seed: 7,
      values,
      profile: STYLE_PROFILES[profile],
    }),
  );

describe("风格 token 接入", () => {
  it("三系 bar-v 用各自的 ink（不是同一套硬编码色）", () => {
    expect(renderWith("bar-v", "editorial")).toContain(STYLE_PROFILES.editorial.ink);
    expect(renderWith("bar-v", "flat-vector")).toContain(STYLE_PROFILES["flat-vector"].ink);
    expect(renderWith("bar-v", "chart-motion")).toContain(STYLE_PROFILES["chart-motion"].ink);
  });

  it("强调色走 profile accent（tone=accent）", () => {
    const html = renderToStaticMarkup(
      createElement(Chart, { kind: "line-up", w: 400, h: 300, tone: "accent", profile: STYLE_PROFILES["flat-vector"] }),
    );
    expect(html).toContain(STYLE_PROFILES["flat-vector"].accent);
  });

  it("18 种图表 × 3 系全部可渲染且确定（同参同输出）", () => {
    for (const kind of CHART_KINDS) {
      for (const p of PROFILE_ORDER) {
        const a = renderWith(kind, p, [3.2, 85, 120]);
        const b = renderWith(kind, p, [3.2, 85, 120]);
        expect(a, `${kind}/${p} 不确定性`).toBe(b);
        expect(a.length, `${kind}/${p} 空输出`).toBeGreaterThan(50);
      }
    }
  });
});

describe("数值归一化（防出界回归）", () => {
  it("原始大数值（120/240/360）不画出画布", () => {
    const html = render("bar-v", [120, 240, 360]);
    const heights = [...html.matchAll(/<rect[^>]*height="([\d.]+)"/g)].map((m) => Number(m[1]));
    expect(heights.length).toBeGreaterThan(0);
    // 绘图区高 = 0.84 × 300 = 252；柱高不得超过它
    expect(Math.max(...heights)).toBeLessThanOrEqual(252.01);
  });

  it("折线图所有点落在绘图区内", () => {
    const html = render("line-up", [85, 120, 3.2, 47, 66]);
    const cys = [...html.matchAll(/<circle[^>]*cy="([\d.]+)"/g)].map((m) => Number(m[1]));
    expect(cys.length).toBeGreaterThan(0);
    for (const cy of cys) {
      expect(cy).toBeGreaterThanOrEqual(24 - 0.01); // 绘图区顶 y0 = 0.08 × 300
      expect(cy).toBeLessThanOrEqual(276 + 0.01); // 绘图区底 y0 + ih
    }
  });

  it("散点不飞出绘图区", () => {
    const html = render("scatter", Array.from({ length: 20 }, (_, i) => i * 13.7));
    const cxs = [...html.matchAll(/<circle[^>]*cx="([\d.]+)"/g)].map((m) => Number(m[1]));
    for (const cx of cxs) {
      expect(cx).toBeGreaterThanOrEqual(32 - 0.01);
      expect(cx).toBeLessThanOrEqual(368 + 0.01);
    }
  });
});

describe("图表风轴标签（等宽签名）", () => {
  it("chart-motion 的 bar-v 带等宽字体刻度/柱值标签", () => {
    const html = renderWith("bar-v", "chart-motion", [3.2, 85, 120]);
    expect(html).toContain("JetBrains Mono"); // fontNum（HTML 属性里引号被转义，取片段断言）
    expect(html).toContain("<text"); // 有标签节点
  });

  it("editorial / flat-vector 不加轴标签（保持各自干净图形）", () => {
    for (const p of ["editorial", "flat-vector"] as const) {
      const html = renderWith("bar-v", p, [3.2, 85, 120]);
      expect(html, p).not.toContain("<text");
    }
  });

  it("刻度标签显示真实值域（不是 0..100% 假刻度）", () => {
    const html = renderWith("bar-v", "chart-motion", [10, 20, 30, 40, 50, 60, 70]);
    // lo=10 / mid=40 / hi=70 都应出现在刻度里
    expect(html).toContain(">10<");
    expect(html).toContain(">40<");
    expect(html).toContain(">70<");
  });

  it("极坐标图（pie/donut/radar/gauge）不加直角坐标轴", () => {
    for (const kind of ["pie", "donut", "radar", "gauge"] as const) {
      const html = renderWith(kind, "chart-motion");
      expect(html, kind).not.toContain("<text");
    }
  });
});
