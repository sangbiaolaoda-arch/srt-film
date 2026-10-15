// baseline-audit 缺陷 6：image 组满版插画板式（程序化 SVG）。
//
// 验的不是「板能渲出来」，而是四条承诺：
//   ① 图像层真的是画出来的：无 <image> / foreignObject / 外链 —— 这三个会让
//      rasterize.ts 的 SVG→canvas 序列化失败或被浏览器拒载，导出即丢图；
//   ② 构图随内容变，不是同一张图换字：要点数/字数比/数字量级真的改变画面几何；
//   ③ 三系换皮不换构图：同内容在三套 profile 下拓扑一致、色值不同；
//   ④ 确定性：同输入两次渲染逐字节一致（逐帧 seek 导出的前提）。

import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { IM_BOARDS, IM_LAYOUTS } from "../src/layouts/im-board";
import { LayoutSVG } from "../src/layouts/render";
import { resolveProfile } from "../src/styles/style-system";
import type { Layout, RenderContent } from "../src/layouts/types";
import type { StyleProfileId } from "../src/styles/style-system";

const IDS = Object.keys(IM_BOARDS);

function demo(over: Partial<RenderContent> = {}): RenderContent {
  return {
    headline: "服务器返回 HTML，耗时 120 毫秒",
    subhead: "",
    caption: "浏览器先要解决地址问题",
    bullets: ["输入网址按下回车", "翻译成 IP 地址", "服务器返回页面"],
    numbers: [],
    numberTokens: [],
    bignum: undefined,
    unit: "",
    beat: 5,
    left: "十年前",
    right: "现在",
    ...over,
  };
}

function render(layout: Layout, content: RenderContent): string {
  return renderToStaticMarkup(createElement(LayoutSVG, { layout, content }));
}

/** 只渲板本体（不带 decor/bg/wash 母版层）—— 色板归属这条断言查的是「板有没有
 *  绕过风格系统自己硬编码色」，母版层用的是 tone 调色板，混进来会误报。 */
function renderBoard(layout: Layout, content: RenderContent): string {
  const board = IM_BOARDS[layout.custom!];
  if (!board) throw new Error(`${layout.id} 无 board`);
  return renderToStaticMarkup(
    createElement(board, { content, beat: content.beat, profile: resolveProfile(layout.style) }),
  );
}

function boardOf(id: string): Layout {
  const l = IM_LAYOUTS.find((x) => x.id === id);
  if (!l) throw new Error(`${id} 未注册`);
  return l;
}

describe("image 组满版插画 · 渲染安全（导出同源的前提）", () => {
  it("六套板全部注册且 custom 通路可用", () => {
    expect(IDS.length).toBe(6);
    for (const l of IM_LAYOUTS) {
      expect(l.custom, l.id).toBeTruthy();
      expect(IM_BOARDS[l.custom!], l.custom).toBeTypeOf("function");
      expect(l.group, l.id).toBe("image");
    }
  });

  it("全部板不产生 <image> / foreignObject / 外链 url()", () => {
    // 依据：SVG 以 blob 方式被 new Image() 加载时禁止引用外部资源，
    // rasterize.ts 走的正是这条路 —— 出现即导出丢图。
    for (const l of IM_LAYOUTS) {
      const html = render(l, demo({ beat: IM_LAYOUTS.indexOf(l) + 1 }));
      expect(html, l.id).not.toMatch(/<image[\s>]/i);
      expect(html, l.id).not.toMatch(/foreignObject/i);
      expect(html, l.id).not.toMatch(/url\(\s*["']?https?:/i);
      // 反面证据：确实画出了矢量图元（不是空板）
      expect(html.length, l.id).toBeGreaterThan(800);
      expect(/<(circle|rect|path|polygon|line)\b/.test(html), l.id).toBe(true);
    }
  });

  it("三系 profile 下都能渲染且带 data-anim 动效钩子", () => {
    for (const l of IM_LAYOUTS) {
      for (const sid of ["editorial", "flat-vector", "chart-motion"] as StyleProfileId[]) {
        const html = render({ ...l, style: sid }, demo());
        expect(html.length, `${l.id}/${sid}`).toBeGreaterThan(800);
        expect(html, `${l.id}/${sid}`).toMatch(/data-anim/);
      }
    }
  });
});

describe("image 组满版插画 · 构图随内容变（不是换字的同一张图）", () => {
  it("管道回路：节点数 = 要点数（3 点 vs 4 点几何不同）", () => {
    const l = boardOf("imb-flow-circuit");
    const three = render(l, demo({ bullets: ["一", "二", "三"] }));
    const four = render(l, demo({ bullets: ["一", "二", "三", "四"] }));
    const count = (h: string) => (h.match(/<circle/g) ?? []).length;
    // 每节点 2 个圆（外环 + 芯），4 点应比 3 点多 2 个
    expect(count(four) - count(three)).toBe(2);
  });

  it("分层堆栈：层数 = 要点数", () => {
    const l = boardOf("imb-layer-stack");
    const three = render(l, demo({ bullets: ["一", "二", "三"] }));
    const four = render(l, demo({ bullets: ["一", "二", "三", "四"] }));
    const rects = (h: string) => (h.match(/<rect/g) ?? []).length;
    expect(rects(four)).toBeGreaterThan(rects(three));
  });

  it("两极对照：体量比取自左右字数比（字数悬殊时半径悬殊）", () => {
    const l = boardOf("imb-polarity");
    const even = render(l, demo({ left: "四个字的左边", right: "四个字的右边" }));
    const skew = render(l, demo({ left: "这是一个相当长的左侧叙述句", right: "短" }));
    // 半径出现在 circle 的 r 属性上；取最大半径比较两版
    const maxR = (h: string) =>
      Math.max(...[...h.matchAll(/<circle[^>]*\sr="([\d.]+)"/g)].map((m) => Number(m[1])));
    expect(maxR(skew)).toBeGreaterThan(maxR(even));
  });

  it("生长阶梯：级数 = 要点数", () => {
    const l = boardOf("imb-growth");
    const three = render(l, demo({ bullets: ["一", "二", "三"] }));
    const four = render(l, demo({ bullets: ["一", "二", "三", "四"] }));
    const rects = (h: string) => (h.match(/<rect/g) ?? []).length;
    expect(rects(four) - rects(three)).toBe(1);
  });

  it("颗粒场：颗粒密度由旁白数字量级驱动", () => {
    const l = boardOf("imb-field");
    const few = render(l, demo({ numbers: [12], headline: "少量" }));
    const many = render(l, demo({ numbers: [240], headline: "大量" }));
    const dots = (h: string) => (h.match(/<circle/g) ?? []).length;
    expect(dots(many)).toBeGreaterThan(dots(few));
  });
});

describe("image 组满版插画 · 三系换皮与确定性", () => {
  it("同内容三系渲染：图元数一致（换皮不换构图）", () => {
    const l = boardOf("imb-growth");
    const n = (sid: StyleProfileId) =>
      (render({ ...l, style: sid }, demo()).match(/<rect/g) ?? []).length;
    expect(n("flat-vector")).toBe(n("editorial"));
    expect(n("chart-motion")).toBe(n("editorial"));
  });

  it("三系色值确实不同（不是同一套色）", () => {
    const l = boardOf("imb-polarity");
    const fillOf = (sid: StyleProfileId) => {
      const h = render({ ...l, style: sid }, demo());
      return [...h.matchAll(/fill="(#[0-9a-fA-F]{3,8})"/g)].map((m) => m[1]);
    };
    const a = new Set(fillOf("editorial"));
    const b = new Set(fillOf("flat-vector"));
    expect([...a].some((c) => !b.has(c))).toBe(true);
  });

  it("确定性：同输入两次渲染逐字节一致", () => {
    for (const l of IM_LAYOUTS) {
      const c = demo({ beat: IM_LAYOUTS.indexOf(l) + 1 });
      expect(render(l, c), l.id).toBe(render(l, c));
    }
  });

  it("板只读 profile token：画面里只出现该系色板内的色值", () => {
    // 硬编码色是风格系统被绕过的信号 —— 三系换皮会失效。
    for (const l of IM_LAYOUTS) {
      for (const sid of ["editorial", "flat-vector", "chart-motion"] as StyleProfileId[]) {
        const p = resolveProfile(sid);
        const allowed = new Set<string>(
          [p.paper, p.ink, p.accent, p.aux, p.dark, p.cream, p.ember, p.steel, p.blush, p.sand, p.clay]
            .map((c) => c.toLowerCase()),
        );
        const html = renderBoard({ ...l, style: sid }, demo());
        const used = [...html.matchAll(/(?:fill|stroke)="(#[0-9a-fA-F]{3,8})"/g)].map((m) =>
          m[1]!.toLowerCase(),
        );
        const stray = used.filter((c) => !allowed.has(c));
        expect(stray, `${l.id}/${sid} 出现色板外色值`).toEqual([]);
      }
    }
  });
});
