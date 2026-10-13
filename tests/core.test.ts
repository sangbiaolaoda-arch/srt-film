import { describe, it, expect } from "vitest";
import { parseSRT } from "../src/core/srt";
import { planBeats } from "../src/core/beats";
import { extractNumbers, isTraceable } from "../src/core/trace";
import { composeScene, validateScene } from "../src/core/compose";
import { applyOverride } from "../src/core/overrides";
import { stripPunct } from "../src/core/text";

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
