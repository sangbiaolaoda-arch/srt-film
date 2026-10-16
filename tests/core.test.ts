import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseSRT } from "../src/core/srt";
import { planBeats } from "../src/core/beats";
import { extractNumbers, isTraceable } from "../src/core/trace";
import { composeScene, validateScene } from "../src/core/compose";
import { applyOverride } from "../src/core/overrides";
import { plan } from "../src/core/plan";
import { stripPunct, hasPunct } from "../src/core/text";

const SRT = `1
00:00:00,000 --> 00:00:02,000
打开浏览器，输入网址。

2
00:00:02,000 --> 00:00:04,500
服务器返回HTML，<b>耗时</b>120毫秒

3
00:00:04,500 --> 00:00:06,000
转化率提升了85%！
`;

describe("parseSRT", () => {
  it("解析标准 SRT", () => {
    const cues = parseSRT(SRT);
    expect(cues).toHaveLength(3);
    expect(cues[1]!.start).toBe(2);
    expect(cues[1]!.end).toBeCloseTo(4.5);
    expect(cues[1]!.text).toBe("服务器返回HTML，耗时120毫秒");
  });
  it("去掉 HTML 标签", () => {
    expect(parseSRT(SRT)[1]!.text).not.toContain("<b>");
  });
  it("空内容抛错", () => {
    expect(() => parseSRT("   ")).toThrow("为空");
  });
  it("坏时间戳带行号抛错", () => {
    expect(() => parseSRT("1\nbad line\n文本")).toThrow("第 2 行");
  });
});

const NO_PUNCT_SRT = `1
00:00:00,000 --> 00:00:02,000
遗忘 不是记忆的故障

2
00:00:02,000 --> 00:00:04,000
它是筛选 大脑每天都在做
`;

describe("planBeats", () => {
  it("按句末标点收拍", () => {
    const beats = planBeats(parseSRT(SRT));
    expect(beats).toHaveLength(2); // 前2条合并为一拍（无句末标点），第3条一拍
    expect(beats[0]!.cues.map((c) => c.id)).toEqual([1]);
    expect(beats[1]!.text).toContain("85%");
  });
  it("无标点 SRT：一条 cue 即一拍（标点全换空格后，cue 边界就是拍边界）", () => {
    const beats = planBeats(parseSRT(NO_PUNCT_SRT));
    expect(beats).toHaveLength(2);
    expect(beats[0]!.text).toContain("遗忘");
    expect(beats[1]!.text).toContain("筛选");
  });
});

describe("stripPunct（画面文字零标点规则）", () => {
  it("半角标点换空格", () => {
    expect(stripPunct("Forgotten, not broken.")).toBe("Forgotten not broken");
  });
  it("全角与 CJK 标点换空格", () => {
    expect(stripPunct("遗忘，不是记忆的故障。")).toBe("遗忘 不是记忆的故障");
  });
  it("引号、书名号、破折号、省略号都在净化范围", () => {
    expect(stripPunct("「靠近」——还是…远离？")).toBe("靠近 还是 远离");
  });
  it("保留字母与数字，压连续空格并去首尾", () => {
    expect(stripPunct("  耗时 120 毫秒 ，  提升 85 倍  ")).toBe("耗时 120 毫秒 提升 85 倍");
  });
  // 小数点属于数值本身，不是标点。早先一律换成空格，「0.06 美元」上画面变成
  // 「0 06 美元」—— 数字被改了值（03 语料拍4 成片实测）。
  it("数字里的小数点保留（值不能被净化改掉）", () => {
    expect(stripPunct("每度大约 0.06 美元")).toBe("每度大约 0.06 美元");
    expect(stripPunct("响应 120.5 毫秒。")).toBe("响应 120.5 毫秒");
    expect(stripPunct("占比 12.75%。")).toBe("占比 12.75%");
  });
  it("千分位逗号保留，句末逗号照常去掉", () => {
    expect(stripPunct("总量 1,200 次。")).toBe("总量 1,200 次");
    expect(stripPunct("前段, 后段")).toBe("前段 后段");
  });
  it("小数点紧贴/带空格都还原成同一个值", () => {
    expect(stripPunct("0. 06 美元")).toBe("0.06 美元");
  });
  it("hasPunct 与 stripPunct 同口径：小数不算标点", () => {
    expect(hasPunct("0.06 美元")).toBe(false);
    expect(hasPunct("耗时 120.5 毫秒")).toBe(false);
    expect(hasPunct("你好，世界")).toBe(true);
  });
});

describe("trace", () => {
  it("提取百分数", () => {
    expect(extractNumbers("转化率提升了85%")[0]!.raw).toBe("85%");
  });
  it("提取带单位数字", () => {
    expect(extractNumbers("耗时120毫秒")[0]!.raw).toBe("120毫秒");
  });
  it("同一句里的量纲数字要全部提取到（只取一层会让后半句消失）", () => {
    expect(extractNumbers("转化率提升了85%，耗时120毫秒").map((n) => n.raw)).toEqual(["85%", "120毫秒"]);
  });
  it("百分数排首位（主视觉取它），与出现顺序无关", () => {
    expect(extractNumbers("耗时120毫秒，转化率提升了85%")[0]!.raw).toBe("85%");
  });
  it("数字密度信号准确（下游据此决定能不能上图表版式）", () => {
    expect(extractNumbers("增长85%，耗时120毫秒，成本降了3倍")).toHaveLength(3);
  });
  it("没有量纲数字时才回退到裸数字", () => {
    expect(extractNumbers("第3步").map((n) => n.raw)).toEqual(["3"]);
  });
  it("中文数字：序数（第一次/第七次/第二天）", () => {
    expect(extractNumbers("我爸今年六十七，第一次主动说想学用手机").map((n) => n.raw)).toEqual(["第一次"]);
    expect(extractNumbers("第七次，他自己退回去了")[0]!.value).toBe(7);
  });
  it("中文数字：量纲（四十秒/半个小时），值走 cn2num", () => {
    expect(extractNumbers("一条能说四十秒")[0]).toEqual({ raw: "四十秒", value: 40, unit: "秒", kind: "span" });
    expect(extractNumbers("我教了你半个小时")[0]!.value).toBe(0.5);
  });
  it("kind 分层：时段/序数 ≠ 度量值（图表门禁只认 measure）", () => {
    // 「十年」是时段短语，「85%」是度量值 —— 同池会让数据条量纲崩坏（03 拍 5 实测）。
    // 顺序即扫描层序：阿拉伯度量层先，中文 span 层后。
    expect(extractNumbers("十年，光伏从 4 倍贵变成更便宜").map((t) => `${t.raw}/${t.kind}`))
      .toEqual(["4 倍/measure", "十年/span"]);
    expect(extractNumbers("第七次，他自己退回去了")[0]!.kind).toBe("ordinal");
    expect(extractNumbers("增长85%，耗时120毫秒").every((t) => t.kind === "measure")).toBe(true);
    // 数字与单位间的排版空格不放行就会漏抽（「每度大约 0.09 美元」）；raw 保留原文
    expect(extractNumbers("每度大约 0.09 美元")[0]).toEqual({ raw: "0.09 美元", value: 0.09, unit: "美元", kind: "measure" });
  });
  it("语气 filler 不当数字（念一遍/一条语音/那年）", () => {
    expect(extractNumbers("错一次，他就自己念一遍")).toHaveLength(0);
    expect(extractNumbers("一条能说四十秒").map((n) => n.raw)).toEqual(["四十秒"]);
  });
  it("序列指代不成度量（下一步/这一步/每层不是测量值）", () => {
    // 01 语料拍 03「第一步…这一步叫 DNS 查询」实测：「这一步」曾漏进度量层，
    // 图表风把该拍选成数字巨号板 —— 序列指代必须挡在量纲层之外。
    expect(extractNumbers("第一步，把这串字母翻译成 IP 地址，这一步叫 DNS 查询").map((t) => `${t.raw}/${t.kind}`))
      .toEqual(["第一步/ordinal"]);
    expect(extractNumbers("走到下一步")).toHaveLength(0);
    expect(extractNumbers("每层楼都有标记")).toHaveLength(0);
    expect(extractNumbers("同一层楼")).toHaveLength(0);
    // 真测量词不受影响：「六十七岁」照旧是度量值
    expect(extractNumbers("我爸今年六十七岁")[0]!.kind).toBe("measure");
  });
  it("版本/型号不是度量值（TLS 1.3 / iOS 17 / HTML5）", () => {
    // 01 语料拍 08「TLS 1.3 只需要 1 个往返」实测：版本号 1.3 曾进兜底层，
    // 坐标柱画出 1.3 vs 1 的量纲崩坏。标识符上下文的数字整块挡掉。
    expect(extractNumbers("TLS 1.3 只需要 1 个往返").map((n) => n.raw)).toEqual(["1"]);
    expect(extractNumbers("iOS 17 也能跑")).toHaveLength(0);
    expect(extractNumbers("HTML5 早就普及了")).toHaveLength(0);
    // 中文语境里的裸数字与「第3步」不受影响
    expect(extractNumbers("有 3 种办法").map((n) => n.raw)).toEqual(["3"]);
    expect(extractNumbers("第3步").map((n) => n.raw)).toEqual(["3"]);
  });
  it("年份是历法坐标不是度量值（历史叙述语料回归）", () => {
    // 06 历史叙述语料拍1「1915 年 5 月，一个周末的下午…」实测：1915 落到兜底层
    // 被判成 measure，于是该拍被路由到坐标柱版式，把年份画成柱高 ——
    // 纯叙事开场配数据图，属错误隐喻。四位数 + 年一律不算度量。
    expect(extractNumbers("1915 年 5 月，一个周末的下午").map((n) => n.raw)).not.toContain("1915");
    expect(extractNumbers("2023 年底，船没等来").map((n) => n.raw)).not.toContain("2023");
    expect(extractNumbers("1999年").map((n) => n.raw)).not.toContain("1999");
    // 不误伤：带真单位的四位数仍是度量值
    expect(extractNumbers("3000 吨").map((n) => n.raw)).toEqual(["3000"]);
    expect(extractNumbers("耗时 1200 毫秒").map((n) => n.raw)).toEqual(["1200 毫秒"]);
    expect(extractNumbers("产量 312 万吨").map((n) => n.raw)).toEqual(["312"]);
  });
  it("序数与量纲不重叠计数（第七次 ≠ 七次）", () => {
    expect(extractNumbers("第七次，他自己退回去了")).toHaveLength(1);
  });
  it("溯源判定", () => {
    expect(isTraceable("85%", "转化率提升了85%！")).toBe(true);
    expect(isTraceable("90%", "转化率提升了85%！")).toBe(false);
    expect(isTraceable("90%", "旁白", "历史峰值90%")).toBe(true);
  });
});

describe("compose + gate", () => {
  it("有数字→number 版式", () => {
    const beats = planBeats(parseSRT(SRT));
    expect(composeScene(beats[1]!).layout).toBe("number");
  });
  it("无数字→statement 版式", () => {
    const beat = planBeats(parseSRT("1\n00:00:00,000 --> 00:00:01,000\n打开浏览器输入网址\n"))[0]!;
    expect(composeScene(beat).layout).toBe("statement");
  });
  it("门禁拦截不可溯源数字", () => {
    const beats = planBeats(parseSRT(SRT));
    const scene = composeScene(beats[1]!); // 120毫秒
    const bad = applyOverride(scene, { bigNumber: "300毫秒" });
    expect(validateScene(bad).length).toBeGreaterThan(0);
    const good = applyOverride(scene, { bigNumber: "120毫秒", source: "耗时120毫秒" });
    expect(validateScene(good).some((e) => e.includes("溯源"))).toBe(false);
  });
  it("超长 headline 触发安全区警告", () => {
    const beats = planBeats(parseSRT(SRT));
    const scene = applyOverride(composeScene(beats[0]!), {
      headline: "这句话非常长已经超过了十六个字的安全区限制",
    });
    expect(validateScene(scene).some((e) => e.includes("安全区"))).toBe(true);
  });
  it("专属场景（custom）跳过安全区 —— 它自己断行与自适应字号", () => {
    const beats = planBeats(parseSRT(SRT));
    const scene = applyOverride(composeScene(beats[0]!), {
      headline: "这句话非常长已经超过了十六个字的安全区限制",
      layout: { id: "wj-01", name: "wj-01", group: "statement", custom: "wj-01", enter: ["m-fade-up"], slots: [] },
    });
    expect(validateScene(scene, undefined, false).some((e) => e.includes("安全区"))).toBe(true);
    expect(validateScene(scene, undefined, true).some((e) => e.includes("安全区"))).toBe(false);
  });
});

describe("plan 宽度门禁的版式分流", () => {
  const srt01 = readFileSync(resolve(import.meta.dirname, "../examples/01-explanatory-tech.srt"), "utf8");

  it("custom 满版版式（v2）不受安全区约束 —— 它自管断行与字号自适应", () => {
    // 拍 5 原句「这一步通常在 20 到 120 毫秒之间结束」17.5 宽，被自动选为 v2-bars（custom）。
    // 旧实现第一遍版式未定就查宽度，误报；修复后版式确定时按 custom 豁免。
    const { problems } = plan(srt01, "");
    expect(problems.filter((p) => p.includes("安全区"))).toHaveLength(0);
  });

  it("槽位版式的宽句由布局引擎按真实槽位几何裁定 —— 放得下就不拦", () => {
    // 缺陷 4 修法：blanket「显示宽度 > 16 即失败」删除后，唯一权威是 checkLayout 的
    // textFit（镜像渲染器的缩字号钳制）。拍 5 覆写成 st-h1-left（headline 槽
    // 10×3 格 = 1067×270px）：17.75 宽在 72px 下 2 行放得下 → 无问题。
    // 旧行为： blanket 门禁判「超出安全区」，逼着人工覆写缩句。
    const ov = JSON.stringify({
      "5": { "layoutId": "st-h1-left", "headline": "这一步通常在 20 到 120 毫秒之间结束" },
    });
    const { problems } = plan(srt01, ov);
    expect(problems.some((p) => p.includes("拍 5"))).toBe(false);
  });

  it("竖排槽放不下的宽句仍被拦 —— 钳制的兜底是丢字，丢字必须大声失败", () => {
    // sp-vertical-tension 的竖排 headline 槽 576px 高：字号缩到地板 36px 也只放得下
    // 13 字，25 字台词必丢 12 字。textFit 的竖排检查把它拦成硬错误 ——
    // 渲染器触底才 slice（render.tsx），门禁必须先开口。
    const ov = JSON.stringify({
      "5": { "layoutId": "sp-vertical-tension", "headline": "我们记录下这些数字不是为了记住结果而是为了看清过程究竟如何发生" },
    });
    const { problems } = plan(srt01, ov);
    expect(problems.some((p) => p.includes("拍 5") && p.includes("竖排截断"))).toBe(true);
  });

  it("照片拍长句过门禁 —— 窄槽靠缩字号放得下（缺陷 4 的照片延伸）", () => {
    // 21 字 headline 覆写成 im-photo-split 的 4.2 格窄槽（448×234px）： clamp 到
    // 3 行放得下。旧 blanket 门禁判「超出安全区」失败 —— 触发语料实测这两拍正是
    // 它逼出的人工缩句覆写（baseline-audit 缺陷 4「需人工覆写缩句」）。
    const srt = "1\n00:00:00,000 --> 00:00:03,200\n城市街道的灯光在夜晚一盏盏亮起照亮回家的人\n";
    const ov = JSON.stringify({ "1": { layoutId: "im-photo-split" } });
    const { problems } = plan(srt, ov);
    expect(problems.some((p) => p.includes("拍 1"))).toBe(false);
  });

  it("覆写强钉无 caption 槽版式接逗号句 → 尾句丢失必须大声失败", () => {
    // 选版器已按 eligible 避开这类版式；覆写是人工强钉，pickFrom 的 usable 回落
    // 未过滤池会绕开 eligible —— 必须由 checkLayout 兜底喊出来，不静默丢尾句。
    // 01 拍4 原句「本机缓存里没有，就去问运营商的递归服务器」。
    const ov = JSON.stringify({ "4": { "layoutId": "im-photo-duo" } });
    const { problems } = plan(srt01, ov);
    expect(problems.some((p) => p.includes("拍 4") && p.includes("尾句"))).toBe(true);
  });
});
