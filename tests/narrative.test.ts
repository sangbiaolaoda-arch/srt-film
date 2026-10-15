import { describe, it, expect } from "vitest";
import { parseSRT } from "../src/core/srt";
import { planBeats, type Beat } from "../src/core/beats";
import { composeScenes, enrichNarrative, classifyRole } from "../src/core/compose";
import type { NarrativeRole } from "../src/core/compose";

const beat = (index: number, text: string): Beat => ({ index, start: 0, end: 1, cues: [], text });

const ROLES: NarrativeRole[] = ["hook", "definition", "evidence", "comparison", "explanation", "consequence", "conclusion"];

describe("classifyRole（确定性叙事角色）", () => {
  it("首拍即 hook", () => expect(classifyRole(beat(1, "今天我们来聊聊光"))).toBe("hook"));
  it("问句 → hook", () => expect(classifyRole(beat(3, "为什么天空是蓝的？"))).toBe("hook"));
  it("结论词 → conclusion", () => expect(classifyRole(beat(5, "总之，时间是相对的"))).toBe("conclusion"));
  it("定义词 → definition", () => expect(classifyRole(beat(2, "光速是指每秒约30万公里"))).toBe("definition"));
  it("因果词 → consequence", () => expect(classifyRole(beat(4, "因此温度上升导致冰川融化"))).toBe("consequence"));
  it("含数字且有对照词 → comparison", () => expect(classifyRole(beat(3, "A 比 B 高 85%"))).toBe("comparison"));
  it("含数字无对照词 → evidence", () => expect(classifyRole(beat(3, "增长了 85%"))).toBe("evidence"));
  it("普通陈述 → explanation", () => expect(classifyRole(beat(3, "风把云吹过山谷"))).toBe("explanation"));
});

describe("enrichNarrative（镜头承接）", () => {
  it("相邻拍共享数字 → 互相标注承接", () => {
    const scenes = enrichNarrative(composeScenes(planBeats(parseSRT(`1
00:00:00,000 --> 00:00:02,000
转化率提升了85%。

2
00:00:02,000 --> 00:00:04,000
85% 意味着每百人里有八十五人。
`))));
    expect(scenes).toHaveLength(2);
    expect(scenes[0]!.continuityOut?.some((c) => c.includes("85%"))).toBe(true);
    expect(scenes[1]!.continuityIn?.some((c) => c.includes("85%"))).toBe(true);
  });
});

describe("五类题材：每拍都有明确目的且不编造", () => {
  const cases: [string, string][] = [
    ["科普", `1
00:00:00,000 --> 00:00:02,000
光从太阳到地球需要8分20秒。

2
00:00:02,000 --> 00:00:04,000
所以我们看到的太阳是8分钟前的太阳。
`],
    ["历史", `1
00:00:00,000 --> 00:00:02,000
1492年哥伦布抵达美洲。

2
00:00:02,000 --> 00:00:04,000
这改变了世界贸易的格局。
`],
    ["抽象", `1
00:00:00,000 --> 00:00:02,000
遗忘不是记忆的故障。

2
00:00:02,000 --> 00:00:04,000
它是大脑每天的筛选。
`],
    ["数据", `1
00:00:00,000 --> 00:00:02,000
去年增长85%。

2
00:00:02,000 --> 00:00:04,000
转化率提升了120毫秒。
`],
    ["情绪", `1
00:00:00,000 --> 00:00:02,000
他等了很久。

2
00:00:02,000 --> 00:00:04,000
门终于开了。
`],
  ];

  for (const [name, srt] of cases) {
    it(`${name}：每拍都分到角色且有设计目的，claim 等于原文（不编造）`, () => {
      const scenes = enrichNarrative(composeScenes(planBeats(parseSRT(srt))));
      expect(scenes.length).toBeGreaterThan(0);
      for (const s of scenes) {
        expect(ROLES).toContain(s.narrativeRole);
        expect(s.purpose.length).toBeGreaterThan(0);
        expect(s.claim).toBe(s.beat.text);
        // 不臆造：claim 必须落在原始旁白文本内
        expect(s.beat.text).toContain(s.claim);
      }
    });
  }
});
