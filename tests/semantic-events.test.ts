// 语义事件层（Phase 1）测试：正例 / 否定例 / 歧义例 / 长句例 + 降级。
// 断言的重点是「不确定时声明不确定」，不是「识别得越多越好」。

import { describe, it, expect } from "vitest";
import { extractComparisonEvent, extractEvents, entitiesOf, CONFIDENCE_MIN } from "../src/semantics/events";

describe("比较事件抽取", () => {
  it("正例：A 比 B 好 —— 实体、维度、方向、证据齐全", () => {
    const ev = extractComparisonEvent("精装书比平装书好，字大行疏。", 4)!;
    expect(ev.type).toBe("compare");
    expect(ev.dimension).toBe("好");
    expect(ev.dimensionKind).toBe("evaluative");
    expect(ev.polarity).toBe("positive");
    expect(ev.negated).toBe(false);
    const { subject, reference } = entitiesOf(ev)!;
    expect(subject.name).toBe("精装书");
    expect(reference.name).toBe("平装书");
    // 证据必须能回到原文字符区间
    expect(subject.evidence.cueId).toBe(4);
    expect("精装书比平装书好，字大行疏。".slice(subject.evidence.startChar, subject.evidence.endChar)).toBe("精装书");
  });

  it("否定例：A 并不比 B 好 —— 不得误判 A 为赢家", () => {
    const ev = extractComparisonEvent("精装书并不比平装书好。", 5)!;
    expect(ev.negated).toBe(true);
    expect(ev.polarity).toBe("unknown");
    expect(ev.dimensionKind).toBe("evaluative");
    const ents = entitiesOf(ev)!;
    expect(ents.subject.name).toBe("精装书");
  });

  it("可测量维度：A 比 B 贵 —— 不擅自制造优胜者", () => {
    const ev = extractComparisonEvent("精装书比平装书贵。", 6)!;
    expect(ev.dimensionKind).toBe("measurable");
    expect(ev.polarity).toBe("unknown");
    expect(ev.dimension).toBe("贵");
  });

  it("不如：方向明确指向参照方", () => {
    const ev = extractComparisonEvent("这本不如那本。", 7)!;
    expect(ev.polarity).toBe("negative");
    expect(ev.rule).toBe("compare-not-as-good");
  });

  it("歧义：含传闻语气降级为 statement", () => {
    const evs = extractEvents("据说精装书比平装书好。", 8);
    expect(evs[0]!.type).toBe("statement");
    expect(evs[0]!.degraded).toContain("不确定语气");
    expect(evs[0]!.degraded).toContain("降级为陈述");
  });

  it("疑问句不当作断言", () => {
    const evs = extractEvents("精装书真的比平装书好吗？", 9);
    expect(evs[0]!.type).toBe("statement");
    expect(evs[0]!.degraded).toContain("疑问");
  });

  it("无比较句：显式 statement 而不是没有事件", () => {
    const evs = extractEvents("我很喜欢一本书。", 1);
    expect(evs).toHaveLength(1);
    expect(evs[0]!.type).toBe("statement");
    // Phase 3 起抽取顺序是 比较 → 因果 → 否定 → 转折 → 变化 → 显式 statement，
    // 降级信息会列出全族均未命中（方便逐族排查漏抽）。
    expect(evs[0]!.degraded).toContain("未命中比较族规则");
    expect(evs[0]!.degraded).toContain("也未命中因果族规则");
    expect(evs[0]!.degraded).toContain("也未命中否定族规则");
    expect(evs[0]!.degraded).toContain("也未命中转折族规则");
    expect(evs[0]!.degraded).toContain("也未命中变化族规则");
  });

  it("长句例：比较在句中也抽得出（前导上下文在 12 字宽以内）", () => {
    const ev = extractComparisonEvent("这本厚实的精装书比轻飘飘的平装书更有分量，装帧也讲究。", 11)!;
    expect(ev.dimension).toBe("有分量");
    const ents = entitiesOf(ev)!;
    expect(ents.subject.name).toContain("精装书");
    expect(ents.reference.name).toContain("平装书");
  });

  it("长句带逗号前导：SEG 不含句读，实体不会被拉进整个长句", () => {
    // 「翻开一看，」是状语分句，SEG 排除逗号 → A 实体只抓逗号之后的「这本厚实的精装书」，
    // 不会把「翻开一看」吞进实体名。
    const ev = extractComparisonEvent("翻开一看，这本厚实的精装书比轻飘飘的平装书更有分量。", 12)!;
    const ents = entitiesOf(ev)!;
    expect(ents.subject.name).not.toContain("翻开");
    expect(ents.subject.name).toContain("精装书");
    expect(ents.reference.name).toContain("平装书");
    expect(ents.subject.evidence.text).toBe(ents.subject.name);
  });

  it("跨分句的音译「比」不产生假比较：实体必须落在同一分句内", () => {
    // 「常见两个品种，阿拉比卡和罗布斯塔」：SEG 不含逗号，「阿拉」与「卡和罗布斯塔」
    // 无法成为一对实体；即使形态吻合，WORD_TRAPS（阿拉比卡）也会拦下。
    expect(extractComparisonEvent("常见两个品种，阿拉比卡和罗布斯塔", 3)).toBeNull();
  });

  it("逗号容忍正例：A，比B，概率+维度 —— 真实语料 81 拍补的规则", () => {
    // 「慢慢死，比一把死，概率高得多」：维度词「高」前有「概率」修饰，compare-bi
    // 要求维度紧跟 B 段而漏抓；compare-bi-comma 在逗号后容忍最多 6 字前缀。
    const ev = extractComparisonEvent("慢慢死，比一把死，概率高得多", 4)!;
    expect(ev.type).toBe("compare");
    expect(ev.entities.map((e) => e.name).sort()).toEqual(["一把死", "慢慢死"]);
    expect(ev.dimension).toBe("高");
  });

  it("置信度阈值常量：降级线是可读的常量", () => {
    expect(CONFIDENCE_MIN).toBeGreaterThan(0.5);
    expect(CONFIDENCE_MIN).toBeLessThan(1);
  });
});

describe("Phase 3 剩余三族（否定/转折/变化）冒烟", () => {
  it("否定族：A 并不是 B → negation 事件，两实体角色齐全", () => {
    const evs = extractEvents("鲸鱼并不是鱼。", 21);
    const ev = evs.find((e) => e.type === "negation")!;
    expect(ev.rule).toBe("negation-bingbushi");
    expect(ev.negated).toBe(true);
    expect(ev.entities.map((e) => e.role).sort()).toEqual(["affirm", "negated"]);
  });

  it("转折族：虽然 A 但是 B → contrast 事件", () => {
    const evs = extractEvents("虽然天很冷，但是大家都来了。", 22);
    const ev = evs.find((e) => e.type === "contrast")!;
    expect(ev.rule).toBe("contrast-suiran");
    expect(ev.entities.map((e) => e.role).sort()).toEqual(["concession", "turn"]);
  });

  it("变化族：A 变成 B → change 事件", () => {
    const evs = extractEvents("毛毛虫变成了蝴蝶。", 23);
    const ev = evs.find((e) => e.type === "change")!;
    expect(ev.rule).toBe("change-biancheng");
    expect(ev.entities.map((e) => e.role).sort()).toEqual(["after", "before"]);
  });
});

describe("药方 §11 基准语料回归（否定两缺陷）", () => {
  it("正例：不是A，而是B → negation-not-but，A 是被否定方、B 是确证方", () => {
    const evs = extractEvents("不是速度，而是方向。", 30);
    const ev = evs.find((e) => e.type === "negation")!;
    expect(ev.rule).toBe("negation-not-but");
    const negated = ev.entities.find((e) => e.role === "negated")!;
    const affirm = ev.entities.find((e) => e.role === "affirm")!;
    expect(negated.name).toBe("速度");
    expect(affirm.name).toBe("方向");
  });

  it("反例：双重否定「也不是不值得」不得当 X不是Y 拆，affirm 不得是垃圾「或者说也」", () => {
    const s = "不是便宜的，而是值得的，或者说也不是不值得";
    const evs = extractEvents(s, 31);
    const ev = evs.find((e) => e.type === "negation")!;
    // 应命中 negation-not-but（而不是被 negation-bushi 拆到「也不是不值得」上）
    expect(ev.rule).toBe("negation-not-but");
    expect(ev.entities.find((e) => e.role === "affirm")!.name).toBe("值得的");
    expect(ev.entities.find((e) => e.role === "negated")!.name).toBe("便宜的");
  });
});
