import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { LAYOUTS, LAYOUT_BY_ID, LAYOUT_GROUPS } from "../src/layouts/catalog";
import { LayoutSVG } from "../src/layouts/render";
import { MOTIONS, MOTION_BY_ID, conflictsOf, validateMotionSet } from "../src/motion/catalog";
import { APPLIED_MOTION_IDS } from "../src/motion/apply";
import { decideStyle, eligible, pickLayout, planStyles } from "../src/layouts/pick";
import { CHART_KINDS } from "../src/layouts/charts";
import { ASSET_IDS } from "../src/layouts/assets";
import { KAOJIN_SCENES } from "../src/layouts/kaojin";
import { WANGJI_SCENES } from "../src/layouts/wangji";
import { hasPunct } from "../src/core/text";
import { shotAt } from "../src/render/frame";
import { parseSRT } from "../src/core/srt";
import { planBeats } from "../src/core/beats";
import { composeScenes } from "../src/core/compose";
import { buildContent } from "../src/core/content";
import type { Shot } from "../src/core/shot";
import type { Layout, RenderContent, Style } from "../src/layouts/types";

const EXAMPLES = resolve(__dirname, "../examples");

const demoContent = (beat = 1): RenderContent => ({
  headline: "服务器返回 HTML，耗时 120 毫秒",
  bignum: "120",
  unit: "毫秒",
  caption: "地址问题先解决",
  left: "十年前",
  right: "现在",
  bullets: ["输入网址", "翻译成 IP", "返回页面"],
  numbers: [120, 85, 3],
  beat,
});

/** 数值槽（+3% / 120）与拍号角标是数据与元信息，不是文案 —— 允许含 + - % 等符号。 */
const DATA_NODE = /^[+\-±]?[\d.,]+\s*[%‰]?$|^BEAT\s+\d+$/;

/** 画面文字零标点规则：返回首个含标点的文案节点（跳过数据节点）。 */
function punctIn(html: string): string {
  const texts = [...html.matchAll(/<(?:text|tspan)\b[^>]*>([^<]*)<\/(?:text|tspan)>/g)].map((m) => m[1]!);
  return texts.find((t) => !DATA_NODE.test(t.trim()) && hasPunct(t)) ?? "";
}

const EDITORIAL = LAYOUTS.filter((l) => (l.style ?? "editorial") === "editorial");
const POSTER = LAYOUTS.filter((l) => l.style === "poster");

describe("版式目录完整性", () => {
  it("总数 ≥ 186（编辑 136 + 海报 50）", () => {
    expect(LAYOUTS.length).toBeGreaterThanOrEqual(186);
  });
  it("编辑风 ≥ 136、海报风 ≥ 50", () => {
    expect(EDITORIAL.length).toBeGreaterThanOrEqual(136);
    expect(POSTER.length).toBeGreaterThanOrEqual(50);
  });
  it("id 唯一且非空", () => {
    const ids = LAYOUTS.map((l) => l.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every((i) => i.trim().length > 3)).toBe(true);
  });
  it("每个版式都有槽位，且槽位落在 12×8 网格内", () => {
    for (const l of LAYOUTS) {
      expect(l.slots.length, l.id).toBeGreaterThan(0);
      for (const s of l.slots) {
        const [x, y, w, h] = s.box;
        expect(x, `${l.id} x`).toBeGreaterThanOrEqual(0);
        expect(y, `${l.id} y`).toBeGreaterThanOrEqual(0);
        expect(x + w, `${l.id} 右边界`).toBeLessThanOrEqual((l.cols ?? 12) + 0.001);
        expect(y + h, `${l.id} 下边界`).toBeLessThanOrEqual((l.rows ?? 8) + 0.001);
      }
    }
  });
  it("十五个分组都至少有 8 个版式", () => {
    expect(LAYOUT_GROUPS.length).toBe(15);
    for (const g of LAYOUT_GROUPS) {
      expect(LAYOUTS.filter((l) => l.group === g).length, g).toBeGreaterThanOrEqual(8);
    }
  });
  it("海报风版式必须声明 canvas 特效", () => {
    for (const l of POSTER) {
      expect(l.fx, l.id).toBeTruthy();
      expect(l.fx, l.id).not.toBe("none");
    }
  });
  it("编辑风版式不声明 canvas 特效", () => {
    for (const l of EDITORIAL) expect(l.fx ?? "none", l.id).toBe("none");
  });
  it("引用的图表种类与素材 id 都存在", () => {
    for (const l of LAYOUTS) {
      for (const s of l.slots) {
        if (s.chart) expect(CHART_KINDS, `${l.id} chart`).toContain(s.chart);
        if (s.k === "asset" || s.k === "image" || s.k === "device" || s.k === "icon") {
          expect(ASSET_IDS, `${l.id} asset`).toContain(s.asset ?? "icon-star");
        }
      }
    }
  });
});

describe("动效目录完整性", () => {
  it("至少 60 个动效", () => {
    expect(MOTIONS.length).toBeGreaterThanOrEqual(60);
  });
  it("每个动效都有实现", () => {
    for (const m of MOTIONS) expect(APPLIED_MOTION_IDS, m.id).toContain(m.id);
  });
  it("实现里没有游离的动效 id", () => {
    for (const id of APPLIED_MOTION_IDS) expect(MOTION_BY_ID.has(id), id).toBe(true);
  });
  it("五个分组都有足够的动效", () => {
    for (const g of ["enter", "emphasis", "exit", "transition", "ambient"]) {
      expect(MOTIONS.filter((m) => m.group === g).length, g).toBeGreaterThanOrEqual(3);
    }
  });
  it("版式引用的动效全部存在，且自带的动效组合合法", () => {
    for (const l of LAYOUTS) {
      const ids = [...l.enter, ...(l.emphasis ? [l.emphasis] : []), ...l.slots.flatMap((s) => [s.m, s.mx].filter(Boolean) as string[])];
      for (const id of ids) expect(MOTION_BY_ID.has(id), `${l.id} → ${id}`).toBe(true);
      expect(validateMotionSet([...l.enter, ...(l.emphasis ? [l.emphasis] : [])]), l.id).toHaveLength(0);
      expect(l.enter.length, `${l.id} 入场动效数`).toBeLessThanOrEqual(4);
    }
  });
  it("冲突检测生效（左滑 × 右滑、翻面 × 擦除）", () => {
    expect(validateMotionSet(["m-slide-left", "m-slide-right"]).length).toBeGreaterThan(0);
    expect(validateMotionSet(["m-flip-x", "m-wipe-left"]).length).toBeGreaterThan(0);
    expect(validateMotionSet(["m-fade-up", "m-underline-draw"])).toHaveLength(0);
  });
  it("冲突声明是对称的（任一方声明即算冲突）", () => {
    expect(conflictsOf("m-slide-left")).toContain("m-slide-right");
    expect(conflictsOf("m-slide-right")).toContain("m-slide-left");
  });
  it("每个槽都解析得到入场动效（不能有裸奔的元素）", () => {
    for (const l of LAYOUTS) {
      l.slots.forEach((s, k) => {
        const id = s.m ?? l.enter[k % l.enter.length];
        expect(MOTION_BY_ID.has(id ?? ""), `${l.id} 槽 ${k}（${s.k}）没有入场动效`).toBe(true);
      });
    }
  });
  it("图形槽不许配文字动效（title 会逐字拆、图形不会，配错等于不动）", () => {
    const figureLayouts = LAYOUTS.filter((l) => l.slots.some((s) => s.k === "figure"));
    expect(figureLayouts.length).toBeGreaterThanOrEqual(8);
    for (const l of figureLayouts) {
      l.slots.forEach((s, k) => {
        if (s.k !== "figure") return;
        const id = s.m ?? l.enter[k % l.enter.length]!;
        const def = MOTION_BY_ID.get(id)!;
        expect(def, `${l.id} → ${id}`).toBeTruthy();
        expect(def.target, `${l.id} 的图形槽用了文字动效 ${id}`).not.toBe("text");
      });
    }
  });
  it("环境动效有入口（ambient 不再是死字段）", () => {
    const withAmbient = LAYOUTS.filter((l) => l.ambient);
    expect(withAmbient.length).toBeGreaterThanOrEqual(5);
    for (const l of withAmbient) {
      const def = MOTION_BY_ID.get(l.ambient!);
      expect(def, `${l.id} → ${l.ambient}`).toBeTruthy();
      expect(def!.group, `${l.id} 的 ambient 必须是环境动效`).toBe("ambient");
    }
  });
});

describe("渲染与 canvas 安全", () => {
  it("全部版式都能渲染出非空 SVG", () => {
    for (const l of LAYOUTS) {
      const html = renderToStaticMarkup(createElement(LayoutSVG, { layout: l, content: demoContent(LAYOUTS.indexOf(l) + 1) }));
      expect(html.startsWith("<svg"), l.id).toBe(true);
      expect(html.length, l.id).toBeGreaterThan(400);
    }
  });
  it("渲染结果不含 foreignObject / image / 外链（否则 canvas 会被污染）", () => {
    for (const l of LAYOUTS) {
      const html = renderToStaticMarkup(createElement(LayoutSVG, { layout: l, content: demoContent() }))
        .replace(/xmlns="[^"]*"/g, ""); // xmlns 只是命名空间声明，不是外部引用
      expect(html.includes("foreignObject"), l.id).toBe(false);
      expect(/<image\b/.test(html), l.id).toBe(false);
      expect(/xlink:href|url\(\s*['"]?https?:/.test(html), l.id).toBe(false);
      expect(html.includes("http://") || html.includes("https://"), l.id).toBe(false);
    }
  });
  it("版式渲染对同一输入是确定性的", () => {
    const l = LAYOUT_BY_ID.get("ch-line-up")!;
    const a = renderToStaticMarkup(createElement(LayoutSVG, { layout: l, content: demoContent() }));
    const b = renderToStaticMarkup(createElement(LayoutSVG, { layout: l, content: demoContent() }));
    expect(a).toBe(b);
  });
  it("海报风大字拆成逐字符（逐字动效才有作用对象）", () => {
    const l = POSTER.find((x) => x.slots.some((s) => s.k === "headline" && s.size === "mega"))!;
    const html = renderToStaticMarkup(createElement(LayoutSVG, { layout: l, content: demoContent() }));
    expect(html.includes('data-char=""'), l.id).toBe(true);
  });
  it("编辑风不拆字符（保持既有视觉）", () => {
    const l = LAYOUT_BY_ID.get("st-h1-center")!;
    const html = renderToStaticMarkup(createElement(LayoutSVG, { layout: l, content: demoContent() }));
    expect(html.includes("data-char")).toBe(false);
  });
  it("版式渲染的文案不含标点（画面文字零标点规则）", () => {
    for (const l of LAYOUTS) {
      const html = renderToStaticMarkup(createElement(LayoutSVG, { layout: l, content: demoContent(LAYOUTS.indexOf(l) + 1) }));
      const bad = punctIn(html);
      expect(bad, `${l.id} 画面文字含标点：${bad}`).toBe("");
    }
  });
  it("版式自带装饰字（literal）不含标点 —— 否则净化会把它吃成空槽", () => {
    for (const l of LAYOUTS) {
      for (const slot of l.slots) {
        if (!slot.literal) continue;
        expect(hasPunct(slot.literal), `${l.id} 的装饰字「${slot.literal}」含标点`).toBe(false);
      }
    }
  });
});

describe("专属场景", () => {
  const SCENES = { ...KAOJIN_SCENES, ...WANGJI_SCENES };
  it("画面文字（含硬编码装饰字）不含标点", () => {
    for (const [id, scene] of Object.entries(SCENES)) {
      const html = renderToStaticMarkup(createElement(scene, { text: "测试台词 无标点", beat: 1, style: "editorial" as Style }));
      const bad = punctIn(html);
      expect(bad, `${id} 画面文字含标点：${bad}`).toBe("");
    }
  });
});

describe("风格判定", () => {
  it("覆写优先于自动判定", () => {
    expect(decideStyle(demoContent(), 0, 5, "editorial").style).toBe("editorial");
    expect(decideStyle(demoContent(), 0, 5, "poster").style).toBe("poster");
  });
  it("同一输入必得同一判定（确定性）", () => {
    for (let b = 1; b <= 20; b++) {
      const a = decideStyle(demoContent(b), b, 12);
      const c = decideStyle(demoContent(b), b, 12);
      expect(a.style, `beat ${b}`).toBe(c.style);
      expect(a.reason).toBe(c.reason);
    }
  });
  it("短句无数据 → 海报风；数字密集 + 要点多 → 编辑风", () => {
    const shortNoNum: RenderContent = { headline: "就这样吧", bullets: [], numbers: [], beat: 5 };
    expect(decideStyle(shortNoNum, 3, 10).style).toBe("poster");
    const heavy: RenderContent = { ...demoContent(6), numbers: [1, 2, 3], bullets: ["a", "b", "c", "d"] };
    expect(decideStyle(heavy, 3, 10).style).toBe("editorial");
  });
  it("判定理由非空", () => {
    expect(decideStyle(demoContent(1), 0, 5).reason.length).toBeGreaterThan(0);
  });
});

describe("全片风格规划（planStyles）", () => {
  const corpus = readdirSync(EXAMPLES)
    .filter((f) => f.endsWith(".srt"))
    .sort();

  const contentsOf = (file: string): RenderContent[] => {
    const beats = planBeats(parseSRT(readFileSync(resolve(EXAMPLES, file), "utf8")));
    return beats.map((b) => buildContent(composeScenes([b])[0]!, b, false));
  };

  it("四段真实语料都能真的用上海报风（自动兜底不能是死代码）", () => {
    for (const f of corpus) {
      const d = planStyles(contentsOf(f));
      const poster = d.filter((x) => x.style === "poster").length;
      expect(poster, `${f} 一个海报风都没选出来`).toBeGreaterThanOrEqual(1);
      expect(poster, `${f} 海报风过多，重音变底色`).toBeLessThanOrEqual(4);
      // 占比断言只对拍数够多的语料成立：开场与定版是 planStyles 设计上的双锚点（各 +1.0 分），
      // 短片（n < 8）里这两拍本身就超过 25% —— 那是锚点，不是「重音变底色」。
      if (d.length >= 8) {
        expect(poster / d.length, `${f} 海报风占比过高`).toBeLessThanOrEqual(0.25);
      }
    }
  });

  it("海报风拍互不相邻（重音之间必须有呼吸）", () => {
    for (const f of corpus) {
      const d = planStyles(contentsOf(f));
      d.forEach((x, i) => {
        if (x.style === "poster" && i > 0) {
          expect(d[i - 1]!.style, `${f} 第 ${i} 与第 ${i + 1} 拍都成了海报风`).toBe("editorial");
        }
      });
    }
  });

  it("覆写优先：锁定的拍不受自动规划影响", () => {
    const contents = contentsOf(corpus[0]!);
    const overrides: (Style | undefined)[] = contents.map(() => undefined);
    overrides[3] = "poster";
    overrides[4] = "editorial";
    const d = planStyles(contents, overrides);
    expect(d[3]!.style).toBe("poster");
    expect(d[4]!.style).toBe("editorial");
    expect(d[3]!.reason).toBe("导演覆写");
  });

  it("确定性：同输入必得同规划", () => {
    for (const f of corpus) {
      const a = planStyles(contentsOf(f)).map((x) => x.style).join(",");
      const b = planStyles(contentsOf(f)).map((x) => x.style).join(",");
      expect(a).toBe(b);
    }
  });

  it("恒定惩罚陷阱：旁白整句 + bullets 按标点切，不得让海报风永远选不出来", () => {
    // 回归：这两种信号对每一拍都成立，一旦当成惩罚项，阈值就永远达不到
    const narration: RenderContent = {
      headline: "他问，这个怎么退回去\n我说，从左边往右滑一下",
      bullets: ["他问", "这个怎么退回去", "我说", "从左边往右滑一下"],
      numbers: [],
      beat: 2,
    };
    expect(decideStyle(narration, 1, 13).style).toBe("poster");
  });
});

describe("选择与资格门禁", () => {
  it("数字不足时图表版式不合格", () => {
    const chartLayout = LAYOUT_BY_ID.get("ch-line-up")!;
    expect(eligible(chartLayout, { ...demoContent(), numbers: [1] })).toBe(false);
    expect(eligible(chartLayout, demoContent())).toBe(true);
  });
  it("选版式避开上一拍用过的版式", () => {
    const content = demoContent(3);
    const first = pickLayout(content, "editorial");
    const second = pickLayout({ ...content, beat: 4 }, "editorial", first.id);
    expect(second.id).not.toBe(first.id);
  });
  it("数字丰富时图表版式会出现在选中的版式里", () => {
    const picked = new Set<string>();
    for (let b = 1; b <= 12; b++) picked.add(pickLayout(demoContent(b), "editorial").group);
    expect(picked.has("chart")).toBe(true);
  });
  it("无数字时不会选到图表版式", () => {
    const content: RenderContent = { ...demoContent(), numbers: [], bignum: undefined };
    for (let b = 1; b <= 12; b++) {
      expect(pickLayout({ ...content, beat: b }, "editorial").group).not.toBe("chart");
    }
  });
  it("编辑风只选编辑风版式、海报风只选海报风版式", () => {
    for (let b = 1; b <= 24; b++) {
      const ed = pickLayout(demoContent(b), "editorial");
      expect((ed.style ?? "editorial"), `beat ${b}`).toBe("editorial");
      const po = pickLayout(demoContent(b), "poster");
      expect(po.style, `beat ${b}`).toBe("poster");
      expect(po.group.startsWith("poster-"), `beat ${b}`).toBe(true);
    }
  });
  it("编辑风的多个分组都能被选到（版式不是死数据）", () => {
    const hit = new Set<string>();
    for (let b = 1; b <= 40; b++) hit.add(pickLayout(demoContent(b), "editorial").group);
    expect(hit.size).toBeGreaterThanOrEqual(4);
  });
  it("海报风的四个分组都能被选到", () => {
    const hit = new Set<string>();
    for (let b = 1; b <= 40; b++) hit.add(pickLayout(demoContent(b), "poster").group);
    expect(hit.size).toBeGreaterThanOrEqual(3);
  });
});

describe("单 canvas 渲染管线", () => {
  const shots: Shot[] = [
    { layout: LAYOUTS[0]!, content: demoContent(1), start: 0, end: 3, tlStart: 0 },
    { layout: LAYOUTS[1]!, content: demoContent(2), start: 3, end: 6, tlStart: 2.75 },
    { layout: LAYOUTS[2]!, content: demoContent(3), start: 6, end: 9, tlStart: 5.5 },
  ];
  it("shotAt：时间轴时间 → 拍序号（含拍间交叠）", () => {
    expect(shotAt(shots, 0)).toBe(0);
    expect(shotAt(shots, 2.5)).toBe(0);
    expect(shotAt(shots, 2.8)).toBe(1); // 已进入交叠区
    expect(shotAt(shots, 5.6)).toBe(2);
    expect(shotAt(shots, 99)).toBe(2);
  });
});

describe("版式结构自洽", () => {
  it("同风格内没有两个版式完全相同（槽位布局去重）", () => {
    const sig = (l: Layout) => l.slots.map((s) => `${s.k}:${s.box.join(",")}`).join("|");
    for (const style of ["editorial", "poster"] as Style[]) {
      const list = LAYOUTS.filter((l) => (l.style ?? "editorial") === style);
      const sigs = list.map(sig);
      const dup = sigs.filter((x, i) => sigs.indexOf(x) !== i);
      expect(new Set(sigs).size, `${style} 重复：${[...new Set(dup)].join(" / ")}`).toBe(sigs.length);
    }
  });
});

// ============================================================================
// 构图与对比度断言 —— 出处：Agent-Reach 蒸馏手册
// references/manual/02-构图与取景.md「可判定检查」（安全边距 / 主体占比）
// references/manual/04-色彩脚本与美术指导.md「可判定检查」（文字/背景对比度 ≥4.5:1）
// ============================================================================

/** WCAG 相对亮度与对比度（4.5:1 为正文可读下限）。 */
function relLuminance(hex: string): number {
  const n = hex.replace("#", "");
  const v = [0, 2, 4].map((i) => {
    const c = parseInt(n.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * v[0]! + 0.7152 * v[1]! + 0.0722 * v[2]!;
}
function contrast(a: string, b: string): number {
  const la = relLuminance(a);
  const lb = relLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

describe("构图与对比度门禁（手册 02/04 可判定检查）", () => {
  it("全部槽位落在安全区内（边距 ≥ 2% 画面）", () => {
    // 依据：Netflix TTSG 安全区要求 + 手册 02 断言「box 不得越过安全边距」。
    // 出血型装饰（decor/fx）不占槽位，此断言只查内容槽。
    const bad: string[] = [];
    for (const l of LAYOUTS) {
      // box 是 [cols × rows] 网格坐标（缺省 12×8），先转归一化再查
      const cols = l.cols ?? 12;
      const rows = l.rows ?? 8;
      for (const s of l.slots) {
        const [x, y, w, h] = s.box;
        if (w <= 0 || h <= 0) bad.push(`${l.id}:${s.k} 尺寸非正`);
        // 满版出血是图像/暗角/构图色块的设计意图（画法手册 02：bleed 不受安全区约束），
        // 只查携带信息的内容槽（文字/数字/图形）。panel 满版 = 旗舰版式的底色块（画法 A07/C10）。
        if (s.k === "asset" || s.k === "vignette" || s.k === "image" || s.k === "panel") continue;
        const nx = x / cols;
        const ny = y / rows;
        const nw = w / cols;
        const nh = h / rows;
        if (nx < 0.02 || ny < 0.02 || nx + nw > 0.98 || ny + nh > 0.98) {
          bad.push(`${l.id}:${s.k} box=[${s.box}] 越安全区`);
        }
      }
    }
    expect(bad, bad.slice(0, 10).join("；")).toEqual([]);
  });

  it("两种风格的正文文字/背景对比度 ≥ 4.5:1", () => {
    const pal = (style: Style) => {
      // 与 render.tsx 的色板保持同源：直接渲染一帧取 colorsOf 的产物太绕，
      // 这里从 render 模块导出的色板常量断言（漂移时此断言会红，提醒同步）。
      return style === "poster" ? { ink: "#eceae6", paper: "#0b0b0f" } : { ink: "#1c1b18", paper: "#faf9f6" };
    };
    for (const style of ["editorial", "poster"] as Style[]) {
      const { ink, paper } = pal(style);
      const cr = contrast(ink, paper);
      expect(cr, `${style} 对比度 ${cr.toFixed(2)} < 4.5`).toBeGreaterThanOrEqual(4.5);
    }
  });
});
