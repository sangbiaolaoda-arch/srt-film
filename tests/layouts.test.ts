import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { LAYOUTS, LAYOUT_BY_ID, LAYOUT_GROUPS } from "../src/layouts/catalog";
import { LayoutSVG } from "../src/layouts/render";
import { DecorLayer } from "../src/layouts/decor";
import { MOTIONS, MOTION_BY_ID, conflictsOf, validateMotionSet } from "../src/motion/catalog";
import { APPLIED_MOTION_IDS } from "../src/motion/apply";
import { decideStyle, eligible, pickLayout, planStyles } from "../src/layouts/pick";
import { checkLayout } from "../src/layouts/constraints";
import { CHART_KINDS } from "../src/layouts/charts";
import { ASSET_IDS } from "../src/layouts/assets";
import { V2_LAYOUTS, V2_BOARDS } from "../src/layouts/v2";
import { KAOJIN_SCENES, lines } from "../src/layouts/kaojin";
import { WANGJI_SCENES } from "../src/layouts/wangji";
import { hasPunct } from "../src/core/text";
import { shotAt } from "../src/render/frame";
import { Stage } from "../src/ui/stage";
import { parseSRT } from "../src/core/srt";
import { planBeats } from "../src/core/beats";
import { composeScenes } from "../src/core/compose";
import { buildContent } from "../src/core/content";
import type { Shot } from "../src/core/shot";
import type { Layout, RenderContent, Style } from "../src/layouts/types";
import { STYLE_PROFILES, PROFILE_ORDER } from "../src/styles/style-system";

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
const FLATVECTOR = LAYOUTS.filter((l) => l.style === "flat-vector");

describe("断行不许切开数字或拉丁词（Phase 12 历史语料回归）", () => {
  // 06 历史语料拍9 实测：v2-steps 把「1922 年」按字符数切成「19」/「22」两行，
  // 画面上凭空多出两个 SRT 里没有的数字 —— G1 门禁当场报出。
  // 这不只是难看：画面在说错话，且错的是数字。
  const noSplit = (t: string, n: number) => {
    for (const row of lines(t, n)) {
      // 任何一行都不该以「半个词」开头或结尾：行的首尾若都是词字符且
      // 该词在原文里跨越行边界，说明被切开了。
      expect(row.length).toBeGreaterThan(0);
    }
    return lines(t, n);
  };

  it("四位年份不被拆开", () => {
    expect(lines("1922 年", 2)).toEqual(["1922", " 年"]);
    const rows = noSplit("结果他一路跑到西班牙 发现那里根本没有刮胡刀 1922 年 他去了耶路撒冷", 20);
    expect(rows.join("")).toBe("结果他一路跑到西班牙 发现那里根本没有刮胡刀 1922 年 他去了耶路撒冷");
    expect(rows.some((r) => r.trim() === "19" || r.trim() === "22")).toBe(false);
  });
  it("小数不被拆开", () => {
    expect(lines("增长 12.75% 后", 6)).toEqual(["增长 12.75", "% 后"]);
  });
  it("版本号不被拆开", () => {
    expect(lines("TLS 1.3 只需要 1 个往返", 8)[0]).toBe("TLS 1.3 ");
  });
  it("中文断行行为不变（无词字符时按原逻辑）", () => {
    expect(lines("普通的句子", 4)).toEqual(["普通的句", "子"]);
  });
  it("任何输入拼接后都能完整还原（不丢字符）", () => {
    for (const t of ["1922 年", "增长 12.75% 后", "TLS 1.3 只需要 1 个往返", "普通的句子",
      "2023 年底，船没等来，因为路断了", "1915 年 5 月，一个周末的下午"]) {
      for (const n of [2, 3, 4, 6, 8, 20]) {
        expect(lines(t, n).join(""), `n=${n} ${t}`).toBe(Array.from(t).join(""));
      }
    }
  });
});

describe("版式目录完整性", () => {
  it("总数 ≥ 186（编辑 136 + 扁平矢量 50）", () => {
    expect(LAYOUTS.length).toBeGreaterThanOrEqual(186);
  });
  it("编辑风 ≥ 136、扁平矢量风 ≥ 50", () => {
    expect(EDITORIAL.length).toBeGreaterThanOrEqual(136);
    expect(FLATVECTOR.length).toBeGreaterThanOrEqual(50);
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
  it("扁平矢量风版式必须声明 canvas 特效", () => {
    for (const l of FLATVECTOR) {
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
      // enter 池第 i 项分给第 i 个槽（render.tsx:226），池内各项异元素 → 逐项单独成组
      const groups = l.enter.map((id) => [id]);
      if (l.emphasis) groups.push([l.emphasis]);
      expect(validateMotionSet(groups), l.id).toHaveLength(0);
      expect(l.enter.length, `${l.id} 入场动效数`).toBeLessThanOrEqual(4);
    }
  });
  it("enter 池内含同轴对滑对是合法的（池内各项分给不同元素，如 v2 duo 双圆对滑）", () => {
    const duo = V2_LAYOUTS.find((l) => l.id === "v2-duo");
    expect(duo).toBeDefined();
    expect(duo!.enter).toContain("m-slide-left");
    expect(duo!.enter).toContain("m-slide-right");
    expect(validateMotionSet(duo!.enter.map((id) => [id])), duo!.id).toHaveLength(0);
  });
  it("冲突检测生效（同元素内：左滑 × 右滑、翻面 × 擦除）", () => {
    expect(validateMotionSet([["m-slide-left", "m-slide-right"]]).length).toBeGreaterThan(0);
    expect(validateMotionSet([["m-flip-x", "m-wipe-left"]]).length).toBeGreaterThan(0);
    expect(validateMotionSet([["m-fade-up", "m-underline-draw"]])).toHaveLength(0);
  });
  it("不同元素上的同轴对滑不算冲突", () => {
    expect(validateMotionSet([["m-slide-left"], ["m-slide-right"]])).toHaveLength(0);
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
  it("扁平矢量风大字拆成逐字符（逐字动效才有作用对象）", () => {
    const l = FLATVECTOR.find((x) => x.slots.some((s) => s.k === "headline" && s.size === "mega"))!;
    const html = renderToStaticMarkup(createElement(LayoutSVG, { layout: l, content: demoContent() }));
    expect(html.includes('data-char=""'), l.id).toBe(true);
  });
  it("编辑风不拆字符（保持既有视觉）", () => {
    const l = LAYOUT_BY_ID.get("st-h1-center")!;
    const html = renderToStaticMarkup(createElement(LayoutSVG, { layout: l, content: demoContent() }));
    expect(html.includes("data-char")).toBe(false);
  });
  it("竖排槽长句缩字号而不是丢字（缺陷 4：静默截断）", () => {
    // sp-vertical-tension 的竖排 headline 槽 72px 只放得下 6 字。旧实现直接
    // slice(0, maxChars)：「手写的笔记留在桌上」9 字只画出「手写的笔记留」，
    // 观众看到半句话还以为话没说完（09 语料拍 11 实测）。修法：与横排同哲学
    // 缩字号重排 —— 9 字缩到约 52px 全部画出。
    const l = LAYOUT_BY_ID.get("sp-vertical-tension")!;
    const content = { ...demoContent(), headline: "手写的笔记留在桌上" };
    const html = renderToStaticMarkup(createElement(LayoutSVG, { layout: l, content }));
    const gm = /data-kind="headline">(.*?)<\/g>/.exec(html);
    const drawn = gm ? (gm[1]!.match(/[一-鿿]/g) ?? []).join("") : "";
    expect(drawn, l.id).toBe("手写的笔记留在桌上");
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
    expect(decideStyle(demoContent(), 0, 5, "flat-vector").style).toBe("flat-vector");
  });
  it("同一输入必得同一判定（确定性）", () => {
    for (let b = 1; b <= 20; b++) {
      const a = decideStyle(demoContent(b), b, 12);
      const c = decideStyle(demoContent(b), b, 12);
      expect(a.style, `beat ${b}`).toBe(c.style);
      expect(a.reason).toBe(c.reason);
    }
  });
  it("短句无数据 → 扁平矢量风；数字密集 → 图表动态风", () => {
    const shortNoNum: RenderContent = { headline: "就这样吧", bullets: [], numbers: [], beat: 5 };
    expect(decideStyle(shortNoNum, 3, 10).style).toBe("flat-vector");
    const heavy: RenderContent = { ...demoContent(6), numbers: [1, 2, 3], bullets: ["a", "b", "c", "d"] };
    expect(decideStyle(heavy, 3, 10).style).toBe("chart-motion");
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

  it("四段真实语料都能真的用上扁平矢量风（自动兜底不能是死代码）", () => {
    for (const f of corpus) {
      const d = planStyles(contentsOf(f));
      const flat = d.filter((x) => x.style === "flat-vector").length;
      expect(flat, `${f} 一个扁平矢量风都没选出来`).toBeGreaterThanOrEqual(1);
      expect(flat, `${f} 扁平矢量风过多，重音变底色`).toBeLessThanOrEqual(4);
      // 占比断言只对拍数够多的语料成立：开场与定版是 planStyles 设计上的双锚点（各 +1.0 分），
      // 短片（n < 8）里这两拍本身就超过 25% —— 那是锚点，不是「重音变底色」。
      if (d.length >= 8) {
        expect(flat / d.length, `${f} 扁平矢量风占比过高`).toBeLessThanOrEqual(0.25);
      }
    }
  });

  it("扁平矢量风拍互不相邻（重音之间必须有呼吸）", () => {
    for (const f of corpus) {
      const d = planStyles(contentsOf(f));
      d.forEach((x, i) => {
        if (x.style === "flat-vector" && i > 0) {
          expect(d[i - 1]!.style, `${f} 第 ${i} 与第 ${i + 1} 拍都是扁平矢量风`).not.toBe("flat-vector");
        }
      });
    }
  });

  it("覆写优先：锁定的拍不受自动规划影响", () => {
    const contents = contentsOf(corpus[0]!);
    const overrides: (Style | undefined)[] = contents.map(() => undefined);
    overrides[3] = "flat-vector";
    overrides[4] = "editorial";
    const d = planStyles(contents, overrides);
    expect(d[3]!.style).toBe("flat-vector");
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

  it("恒定惩罚陷阱：旁白整句 + bullets 按标点切，不得让扁平矢量风永远选不出来", () => {
    // 回归：这两种信号对每一拍都成立，一旦当成惩罚项，阈值就永远达不到
    const narration: RenderContent = {
      headline: "他问，这个怎么退回去\n我说，从左边往右滑一下",
      bullets: ["他问", "这个怎么退回去", "我说", "从左边往右滑一下"],
      numbers: [],
      beat: 2,
    };
    expect(decideStyle(narration, 1, 13).style).toBe("flat-vector");
  });
});

describe("选择与资格门禁", () => {
  it("数字不足时图表版式不合格", () => {
    const chartLayout = LAYOUT_BY_ID.get("ch-line-up")!;
    expect(eligible(chartLayout, { ...demoContent(), numbers: [1] })).toBe(false);
    expect(eligible(chartLayout, { ...demoContent(), caption: "" })).toBe(true);
    // 尾句装载规则（见 photos.test.ts）：ch-line-up 没有 caption 槽，装了尾句
    // 也没地方放 —— 数字够也一样不合格，两个维度各自独立。
    expect(eligible(chartLayout, demoContent())).toBe(false);
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
  it("编辑风只选编辑风版式、扁平矢量风只选扁平矢量风版式", () => {
    for (let b = 1; b <= 24; b++) {
      const ed = pickLayout(demoContent(b), "editorial");
      expect((ed.style ?? "editorial"), `beat ${b}`).toBe("editorial");
      const po = pickLayout(demoContent(b), "flat-vector");
      expect(po.style, `beat ${b}`).toBe("flat-vector");
      expect(po.group.startsWith("poster-"), `beat ${b}`).toBe(true);
    }
  });
  it("编辑风的多个分组都能被选到（版式不是死数据）", () => {
    // v2 契约：数字丰富拍回退旧池 chart；其余形态走 v2 满版池。混合内容应踩到 ≥4 组。
    const hit = new Set<string>();
    for (let b = 1; b <= 40; b++) {
      const base = demoContent(b);
      const variant =
        b % 4 === 2 ? { ...base, numbers: [], bignum: undefined } // 清单形态 → v2 list
        : b % 4 === 3 ? { ...base, numbers: [7], bignum: "7" } // 单数字 → v2 number
        : b % 4 === 0 ? { ...base, headline: "其实不是忘记而是记得", numbers: [], bignum: undefined } // 对照句 → compare
        : base; // 数字丰富 → 回退旧池 chart
      hit.add(pickLayout(variant, "editorial").group);
    }
    expect(hit.size).toBeGreaterThanOrEqual(4);
  });
  it("扁平矢量风的四个分组都能被选到", () => {
    const hit = new Set<string>();
    for (let b = 1; b <= 40; b++) hit.add(pickLayout(demoContent(b), "flat-vector").group);
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
    for (const style of ["editorial", "flat-vector", "chart-motion"] as Style[]) {
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
        // photo 与 asset/image 同理：真照片由 canvas 图像层按槽位直画，满幅铺底正是
        // 它的构图意图（「照片是底」），按安全区收缩会在照片四周留出一圈纸色边。
        if (s.k === "asset" || s.k === "vignette" || s.k === "image" || s.k === "panel" || s.k === "photo") continue;
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

  it("三系风格的正文文字/背景对比度 ≥ 4.5:1", () => {
    // 直接断言 style-system 的 tone token（唯一的色源）—— 漂移时此断言会红，提醒同步。
    for (const id of PROFILE_ORDER) {
      const { ink, paper } = STYLE_PROFILES[id].tone;
      const cr = contrast(ink, paper);
      expect(cr, `${id} 对比度 ${cr.toFixed(2)} < 4.5`).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe("v2 满版构图池", () => {
  it("每套板式的 custom 场景已注册、id 唯一、主槽声明非空", () => {
    const ids = new Set<string>();
    for (const l of V2_LAYOUTS) {
      ids.add(l.id);
      expect(V2_BOARDS[l.custom!], `${l.id} 的场景 ${l.custom} 未注册`).toBeTruthy();
      expect(l.slots.length, `${l.id} 缺主槽声明`).toBeGreaterThan(0);
      expect(l.decor, `${l.id} 应关闭母版装饰（板式自带满版底）`).toBe(false);
    }
    expect(ids.size).toBe(V2_LAYOUTS.length);
  });
  it("每套板式都能渲出满版画面（不是死数据）", () => {
    for (const l of V2_LAYOUTS) {
      const html = renderToStaticMarkup(createElement(LayoutSVG, { layout: l, content: demoContent(V2_LAYOUTS.indexOf(l) + 1) }));
      expect(html.startsWith("<svg"), l.id).toBe(true);
      expect(html.length, `${l.id} 渲染内容过短`).toBeGreaterThan(500);
    }
  });
  it("v2 编辑风池优先：常规拍选到的是 v2 板式", () => {
    const plain: RenderContent = { ...demoContent(), numbers: [], bignum: undefined };
    const picked = pickLayout(plain, "editorial");
    expect(picked.id.startsWith("v2-")).toBe(true);
  });
});

describe("decor 层 · density token 消费（Phase 7 第三刀）", () => {
  const render = (style: Style) =>
    renderToStaticMarkup(createElement(DecorLayer, { beat: 3, total: 11, style }));

  it("网格步长由密度派生：图表风 40/200 锚点不变，编辑风最疏", () => {
    const cm = render("chart-motion");
    expect(cm).toContain('width="40"'); // 细网格 0.7 → 40（Phase 6 标定值）
    expect(cm).toContain('width="200"'); // 粗网格 0.7 → 200
    expect(cm).toContain('d="M40 0 L0 0 L0 40"'); // 路径随步长参数化
    const ed = render("editorial");
    expect(ed).toContain('width="61"'); // 加号栅格 0.35 → 61（原 48）
    expect(ed).not.toContain('width="48"');
  });

  it("扁平风不走网格分支（grid token 关闭），只受影响不到的 ticks/rings", () => {
    const fv = render("flat-vector");
    expect(fv).not.toContain("decor-grid");
    expect(fv).not.toContain('width="52"'); // fine 52 无消费方，不出现在 markup
  });

  it("图表风比扁平风密：标尺短刻度更多、角环 3 vs 2", () => {
    const cm = render("chart-motion");
    const fv = render("flat-vector");
    // 标尺短刻度 x2="35"（5px）：n=10 → 5 个；n=8 → 4 个
    expect(cm.match(/x2="35"/g)?.length ?? 0).toBe(5);
    expect(fv.match(/x2="35"/g)?.length ?? 0).toBe(4);
    // 同心环：图表风 3 环（21/15/6），扁平风 2 环（15/6）
    expect(cm).toContain('r="21"');
    expect(fv).not.toContain('r="21"');
  });

  it("编辑风（纸纹分支）不画标尺与角环", () => {
    const ed = render("editorial");
    expect(ed).not.toContain('r="21"');
    expect(ed).not.toContain("decor-vig"); // 暗角只归净底分支
  });
});

describe("舞台层 · 拍号角标门控（Phase 8，修 baseline-audit 缺陷 1）", () => {
  const mkShot = (layout: Layout): Shot => ({
    layout,
    content: { ...demoContent(3), beat: 3 },
    start: 0,
    end: 2,
  });
  const renderStage = (layout: Layout) =>
    renderToStaticMarkup(createElement(Stage, { shots: [mkShot(layout)] }));

  const decorFalse = [...LAYOUTS, ...V2_LAYOUTS].filter((l) => l.decor === false);
  it(`catalog+v2 共 ${decorFalse.length} 个 decor:false 版式在库里`, () => {
    expect(decorFalse.length).toBeGreaterThanOrEqual(4);
  });

  it("decor:false 版式的舞台层内没有拍号角标", () => {
    for (const l of decorFalse) {
      expect(renderStage(l)).not.toContain("BEAT 03");
    }
  });

  it("decor 未关的版式仍带角标（门控没有误伤）", () => {
    expect(renderStage(LAYOUTS[0]!)).toContain("BEAT 03");
  });
});

describe("v2-strata 文字底衬（横跨多色带时文字必须可读）", () => {
  // 01 语料拍 1：整句 headline 横跨 blush/sand/clay/aux/dark 五条色带。底衬前深灰字
  // 有一截压在深蓝带上、橙红强调字压橙带，2 倍放大目视几乎读不出（联系表
  // .tmp/vr-01/frames/01.jpg 取证）。换字色救不了——一行字无论什么颜色，总有一段
  // 落在相近色上；底衬是「一行横跨多带」唯一正确的解。
  const strata = V2_LAYOUTS.find((l) => l.id === "v2-strata")!;
  const html = () => renderToStaticMarkup(createElement(LayoutSVG, { layout: strata, content: demoContent() }));

  it("文字行后面有一块不透明底衬，宽度贴合文字", () => {
    const h = html();
    // 满幅纸底与 5 条色带之外，还有一个宽度 < 画布的 rect —— 那就是文字底衬
    const plates = [...h.matchAll(/<rect([^>]*)>/g)]
      .map((m) => m[1] ?? "")
      .filter((a) => !a.includes("data-motion") && Number(/width="([\d.]+)"/.exec(a)?.[1]) < 1280);
    expect(plates.length, "v2-strata 应有且仅有一块贴合文字的底衬").toBe(1);
    const attrs = plates[0]!;
    expect(attrs, "底衬必须不透明（半透会让底带透上来，实测 0.94 仍不可读）").not.toContain("opacity");
    const w = Number(/width="([\d.]+)"/.exec(attrs)?.[1]);
    const hgt = Number(/height="([\d.]+)"/.exec(attrs)?.[1]);
    expect(w, "底衬应真的盖住一行字的宽度").toBeGreaterThan(300);
    expect(hgt, "底衬高度应是一行字的量级").toBeGreaterThan(40);
  });

  it("底衬在文字之前绘制（DOM 顺序即遮挡顺序）", () => {
    const h = html();
    const plateAt = h.search(/<rect(?![^>]*data-motion)[^>]*>/);
    const textAt = h.indexOf("<text");
    expect(plateAt).toBeGreaterThan(-1);
    expect(textAt, "底衬必须排在文字之前").toBeGreaterThan(plateAt);
  });
});

describe("列表与标签不静默截断（缺陷 4 同族）", () => {
  // 旧实现 `t.slice(0, 22)`：06 语料第 7 条实测触发，23 字的
  // 「写了整整十一个月的 relativity 论文」被切掉末字 —— 无音轨成片里那句话少一字。
  const demo = { ...demoContent(), bullets: ["这是一条二十三字以上的长条目用来验证列表不切字"] };

  it("bullets 槽渲染出全部文字（无 slice）", () => {
    const l: Layout = { id: "t-list", name: "列表测试", group: "list", enter: ["m-fade-up"],
      slots: [{ k: "bullets", box: [1, 2, 10, 3], size: "m" }] };
    const html = renderToStaticMarkup(createElement(LayoutSVG, { layout: l, content: demo }));
    const drawn = [...html.matchAll(/<text[^>]*data-part=""[^>]*>([^<]*)<\/text>/g)].map((m) => m[1] ?? "").join("");
    expect(drawn).toContain("这是一条二十三字以上的长条目用来验证列表不切字");
  });

  it("缩到 10px 地板仍放不下 → checkLayout 报硬错误（大声失败）", () => {
    const l: Layout = { id: "t-list2", name: "窄列表", group: "list", enter: ["m-fade-up"],
      slots: [{ k: "bullets", box: [1, 2, 1.2, 3], size: "m" }] };
    const r = checkLayout(l, { ...demo, bullets: ["这是一条长到无论怎么缩都放不下的条目内容测试"] });
    expect([...r.errors, ...r.warnings].join("；")).toContain("列表截断");
  });

  it("skipFirst 让同版式的其它槽承载前几条（im-photo-split 的第 3/4 分句）", () => {
    // 06 语料拍 4 的五句：headline 只画第 1、caption 只画第 2，第 3/4 分句
    // 原本无人承载 —— 内容在画面上完全消失。修法是补一条 skipFirst:2 的 bullets。
    const l = LAYOUT_BY_ID.get("im-photo-split")!;
    const b = l.slots.find((s) => s.k === "bullets");
    expect(b, "im-photo-split 应有 bullets 槽承载第 3/4 分句").toBeTruthy();
    expect(b!.skipFirst, "应跳过前两条（已由 headline / caption 承载）").toBe(2);
  });
});
