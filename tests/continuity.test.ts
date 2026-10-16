// Phase 7 第二刀：跨镜头连续性。
//
// 验四层：
//   ① 规则层（compose.enrichNarrative）：数字承接按值匹配（原文级在真实语料
//      几乎为 0，值级才活的）+ 角色承接表（问→答、概念→数据、数据→推论）；
//   ② 字段层（plan → Shot.continuity）：第一遍算出的承接真的落进 shot
//      （修复前 prepared 不带 scene，字段死在半路）；
//   ③ 决策层（continuityAt）：纯函数、seek 确定、ghost 全量继承上拍 motif；
//   ④ 绘制层（drawContinuity）：ghost 用上一拍风格档取色（跨风格继承的字面
//      含义）、连接线存在性、缩放正确 —— 用记录型 ctx 桩断言，不依赖浏览器。

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { enrichNarrative, HANDOFF } from "../src/core/compose";
import { plan } from "../src/core/plan";
import { continuityAt, drawContinuity, motifOf } from "../src/render/continuity";
import { STYLE_PROFILES } from "../src/styles/style-system";
import type { Shot } from "../src/core/shot";
import type { Layout, RenderContent } from "../src/layouts/types";
import type { BeatScene, NarrativeRole } from "../src/core/compose";

const root = resolve(import.meta.dirname, "..");
const SRT = readFileSync(resolve(root, "examples/01-explanatory-tech.srt"), "utf-8");

function demo(over: Partial<RenderContent> = {}): RenderContent {
  return {
    headline: "第二步是建立 TCP 连接", subhead: "", caption: "", bullets: [],
    numbers: [], numberTokens: [], bignum: undefined, unit: "", beat: 5,
    ...over,
  };
}

function shotOf(over: Partial<Shot> = {}): Shot {
  const layout: Layout = { id: "t-x", name: "测试", group: "statement", enter: ["m-fade-up"], slots: [], ...over.layout };
  return { layout, content: demo(), start: 0, end: 2, ...over };
}

function scene(text: string, role: NarrativeRole): BeatScene {
  return { narrativeRole: role, beat: { index: 1, text, start: 0, end: 2, cues: [] } } as unknown as BeatScene;
}

// —— 记录型 canvas 桩：只记调用与当时的样式状态 ——
interface Rec { m: string; a: unknown[] }
class CtxRec {
  calls: Rec[] = [];
  globalAlpha = 1;
  fillStyle = "";
  strokeStyle = "";
  lineWidth = 1;
  private log(m: string, ...a: unknown[]): void { this.calls.push({ m, a }); }
  save(): void { this.log("save"); }
  restore(): void { this.log("restore"); }
  beginPath(): void { this.log("beginPath"); }
  arc(...a: number[]): void { this.log("arc", ...a); }
  rect(...a: number[]): void { this.log("rect", ...a); }
  moveTo(...a: number[]): void { this.log("moveTo", ...a); }
  lineTo(...a: number[]): void { this.log("lineTo", ...a); }
  closePath(): void { this.log("closePath"); }
  fill(): void { this.log("fill", this.fillStyle, this.globalAlpha); }
  stroke(): void { this.log("stroke", this.strokeStyle, this.globalAlpha); }
  setLineDash(...a: number[]): void { this.log("setLineDash", ...a); }
  has(m: string): boolean { return this.calls.some((c) => c.m === m); }
}

const asCtx = (r: CtxRec): CanvasRenderingContext2D => r as unknown as CanvasRenderingContext2D;

describe("① 承接规则（enrichNarrative）", () => {
  it("数字承接按值匹配：原文不同单位也算（120 毫秒 → 120）", () => {
    const scenes = enrichNarrative([
      scene("整个过程耗时 120 毫秒", "evidence"),
      scene("120 已经足够快了", "consequence"),
    ]);
    expect(scenes[1]!.continuityIn?.some((c) => c.includes("沿用上拍数字 120"))).toBe(true);
  });

  it("同原文共享仍然成立（旧行为不回归）", () => {
    const scenes = enrichNarrative([
      scene("转化率提升了85%。", "evidence"),
      scene("85% 意味着每百人里有八十五人。", "explanation"),
    ]);
    expect(scenes[1]!.continuityIn?.some((c) => c.includes("85%"))).toBe(true);
  });

  it("数字无重叠 → 不标数字承接", () => {
    const scenes = enrichNarrative([
      scene("转化率提升了85%。", "evidence"),
      scene("他第二天就忘了这事。", "explanation"),
    ]);
    expect(scenes[1]!.continuityIn?.some((c) => c.startsWith("沿用上拍数字"))).toBe(false);
  });

  it("角色承接：hook→explanation 命中（每支片子的开场都必然连续）", () => {
    const scenes = enrichNarrative([
      scene("浏览器到底怎么找到一台服务器？", "hook"),
      scene("它先把域名翻译成 IP 地址。", "explanation"),
    ]);
    expect(scenes[1]!.continuityIn?.some((c) => c === "承接上拍hook→explanation")).toBe(true);
  });

  it("角色承接：同角色相邻不算（两拍各讲各的）", () => {
    const scenes = enrichNarrative([
      scene("第一组数据是 120。", "evidence"),
      scene("第二组数据是 85。", "evidence"),
    ]);
    expect(scenes[1]!.continuityIn?.some((c) => c.startsWith("承接上拍"))).toBe(false);
  });

  it("角色承接：结论拍是终点，表里没有出手", () => {
    const scenes = enrichNarrative([
      scene("总之，链路是这样的。", "conclusion"),
      scene("它先把域名翻译成 IP 地址。", "explanation"),
    ]);
    expect(scenes[1]!.continuityIn?.some((c) => c.startsWith("承接上拍"))).toBe(false);
  });

  it("数字承接与角色承接可同时成立（两条都标）", () => {
    const scenes = enrichNarrative([
      scene("整个查询只要 120 毫秒。", "evidence"),
      scene("120 毫秒意味着用户几乎无感。", "consequence"),
    ]);
    const ci = scenes[1]!.continuityIn!;
    expect(ci.some((c) => c.startsWith("沿用上拍数字"))).toBe(true);
    expect(ci.some((c) => c === "承接上拍evidence→consequence")).toBe(true);
  });

  it("序号不成数字承接：第三步（ordinal）不与上拍测量值误配", () => {
    // 01 语料实测：拍 6「3 次」与拍 7「第三步」值同级 3，值级匹配曾造出假承接。
    const scenes = enrichNarrative([
      scene("他要试 3 次才能连上。", "evidence"),
      scene("第三步是建立 TCP 连接。", "explanation"),
    ]);
    expect(scenes[1]!.continuityIn?.some((c) => c.startsWith("沿用上拍数字"))).toBe(false);
  });
});

describe("② motifOf：每拍的母版标记", () => {
  it("确定性：同 shot 进同 motif 出（seek 一致的第一来源）", () => {
    const s = shotOf({ narrative: { role: "evidence", purpose: "p", forbidden: [] } });
    expect(motifOf(s)).toEqual(motifOf(s));
  });

  it("七个角色七种形状，互异（相邻拍角色不同 → 标记必然不同）", () => {
    const roles: NarrativeRole[] = ["hook", "definition", "evidence", "comparison", "explanation", "consequence", "conclusion"];
    const shapes = roles.map((r) => motifOf(shotOf({ narrative: { role: r, purpose: "p", forbidden: [] } })).shape);
    expect(new Set(shapes).size).toBe(7);
  });

  it("色调：带主数字的拍用强调色（数字是跨拍继承最常见的载体）", () => {
    const withNum = motifOf(shotOf({ content: demo({ bignum: "120" }) }));
    const noNum = motifOf(shotOf());
    expect(withNum.tone).toBe("accent");
    expect(noNum.tone).toBe("ink");
  });

  it("每个承接对都跨角（ghost 与自标记不同角，连接线必然可见）", () => {
    for (const [prev, nexts] of Object.entries(HANDOFF)) {
      for (const cur of nexts) {
        const a = motifOf(shotOf({ narrative: { role: prev as NarrativeRole, purpose: "p", forbidden: [] } }));
        const b = motifOf(shotOf({ narrative: { role: cur, purpose: "p", forbidden: [] } }));
        expect(a.corner, `${prev}→${cur} 同角 ${a.corner}：连接线会零长度`).not.toBe(b.corner);
      }
    }
  });
});

describe("③ continuityAt：继承决策（纯函数）", () => {
  const prev = shotOf({ narrative: { role: "evidence", purpose: "p", forbidden: [] }, content: demo({ bignum: "120" }) });
  const cur = shotOf({ narrative: { role: "consequence", purpose: "p", forbidden: [] } });

  it("无 continuity → 只有本拍标记，不继承", () => {
    expect(continuityAt([prev, cur], 1)).toEqual({ self: motifOf(cur) });
  });

  it("有 continuity → ghost 全量等于上拍 motif（形状/位置/色调都继承）", () => {
    const c = shotOf({ ...cur, continuity: ["承接上拍evidence→consequence"] });
    const f = continuityAt([prev, c], 1)!;
    expect(f.ghost).toBeDefined();
    expect(f.ghost!.motif).toEqual(motifOf(prev));
    expect(f.ghost!.shared).toEqual(["承接上拍evidence→consequence"]);
  });

  it("ghost 用上拍色调而非本拍（上拍有数字 → ghost 是强调色，即使本拍没有）", () => {
    const c = shotOf({ continuity: ["x"] });
    const f = continuityAt([prev, c], 1)!;
    expect(f.ghost!.motif.tone).toBe("accent"); // 上拍有 bignum
    expect(f.self.tone).toBe("ink");            // 本拍没有
  });

  it("开场拍防御：active=0 即使带了 continuity 也不 ghost（没有上拍）", () => {
    const c = shotOf({ continuity: ["x"] });
    expect(continuityAt([c], 0)).toEqual({ self: motifOf(c) });
  });

  it("空 shots / 越界 active → undefined（不炸）", () => {
    expect(continuityAt([], 0)).toBeUndefined();
    expect(continuityAt([cur], 5)).toBeUndefined();
  });

  it("seek 确定性：重复求值深相等", () => {
    const shots = [prev, shotOf({ ...cur, continuity: ["x"] })];
    expect(continuityAt(shots, 1)).toEqual(continuityAt(shots, 1));
  });
});

describe("④ drawContinuity：canvas 绘制", () => {
  const ED = STYLE_PROFILES.editorial;   // accent #c8401f
  const CM = STYLE_PROFILES["chart-motion"]; // accent #ff6a00

  it("ghost 用上一拍风格档取色 —— 跨风格继承的字面含义", () => {
    const prevEd = shotOf({
      layout: { id: "a", name: "a", group: "statement", enter: [], slots: [], style: "editorial" },
      narrative: { role: "definition", purpose: "p", forbidden: [] }, // definition → tr 角
      content: demo({ bignum: "120" }),
    });
    const curCm = shotOf({
      layout: { id: "b", name: "b", group: "statement", enter: [], slots: [], style: "chart-motion" },
      narrative: { role: "hook", purpose: "p", forbidden: [] }, // hook → tl 角
      continuity: ["承接上拍definition→hook"],
    });
    const r = new CtxRec();
    drawContinuity(asCtx(r), [prevEd, curCm], 1, 1280, 720);
    // ghost（空心→stroke）必须刷上编辑风的强调色，而不是图表风的
    expect(r.calls.some((c) => c.m === "stroke" && c.a[0] === ED.tone.accent)).toBe(true);
    // 本拍标记用图表风的取色（括号显式：fill/stroke 且颜色对上，不靠优先级蒙混）
    expect(r.calls.some((c) => (c.m === "fill" || c.m === "stroke") && c.a[0] === CM.tone.ink)).toBe(true);
    // 连接线：虚线 + 从 definition(br→1244,684) 角到 hook(tl→36,36) 角
    expect(r.has("setLineDash")).toBe(true);
    const mv = r.calls.find((c) => c.m === "moveTo")!;
    const ln = r.calls.find((c) => c.m === "lineTo")!;
    expect(mv.a).toEqual([1244, 684]);
    expect(ln.a).toEqual([36, 36]);
  });

  it("无 continuity → 不画 ghost、不画连接线", () => {
    const prevEd = shotOf({ narrative: { role: "definition", purpose: "p", forbidden: [] }, content: demo({ bignum: "120" }) });
    const curCm = shotOf({ narrative: { role: "hook", purpose: "p", forbidden: [] } });
    const r = new CtxRec();
    drawContinuity(asCtx(r), [prevEd, curCm], 1, 1280, 720);
    expect(r.has("setLineDash")).toBe(false);
    expect(r.calls.filter((c) => c.m === "moveTo")).toHaveLength(0); // 连接线是唯一的 moveTo 来源
    // 仍然画了本拍标记（circle → arc）
    expect(r.has("arc")).toBe(true);
  });

  it("分辨率缩放：W=2560 时坐标与线宽按 2× 走（导出 1920 不小）", () => {
    const prevEd = shotOf({ narrative: { role: "definition", purpose: "p", forbidden: [] }, content: demo({ bignum: "120" }) });
    const curCm = shotOf({ narrative: { role: "hook", purpose: "p", forbidden: [] }, continuity: ["x"] });
    const r = new CtxRec();
    drawContinuity(asCtx(r), [prevEd, curCm], 1, 2560, 1440);
    const mv = r.calls.find((c) => c.m === "moveTo")!;
    expect(mv.a).toEqual([2488, 1368]);
    const ln = r.calls.find((c) => c.m === "lineTo")!;
    expect(ln.a).toEqual([72, 72]);
  });

  it("ghost 透明度低于本拍（继承物是背景，不是抢戏的主体）", () => {
    const prevEd = shotOf({
      layout: { id: "a", name: "a", group: "statement", enter: [], slots: [], style: "editorial" },
      narrative: { role: "definition", purpose: "p", forbidden: [] },
      content: demo({ bignum: "120" }),
    });
    const curCm = shotOf({
      layout: { id: "b", name: "b", group: "statement", enter: [], slots: [], style: "chart-motion" },
      narrative: { role: "hook", purpose: "p", forbidden: [] },
      continuity: ["x"],
    });
    const r = new CtxRec();
    drawContinuity(asCtx(r), [prevEd, curCm], 1, 1280, 720);
    const ghost = r.calls.find((c) => c.m === "stroke" && c.a[0] === ED.tone.accent)!;
    const self = r.calls.find((c) => (c.m === "fill" || c.m === "stroke") && c.a[0] === CM.tone.ink)!;
    expect(ghost.a[1] as number).toBeLessThan(self.a[1] as number);
  });

  it("形态继承 morph：转场窗口内 ghost 从上一拍角迁移到本拍角（方法论 §6）", () => {
    const prev = shotOf({
      layout: { id: "a", name: "a", group: "statement", enter: [], slots: [], style: "editorial" },
      narrative: { role: "definition", purpose: "p", forbidden: [] }, content: demo({ bignum: "120" }),
    });
    const cur = shotOf({
      layout: { id: "b", name: "b", group: "statement", enter: [], slots: [], style: "chart-motion" },
      narrative: { role: "hook", purpose: "p", forbidden: [] }, continuity: ["x"],
      start: 10, end: 12, tlStart: 10,
    });
    // 窗口中点（m-shape-match dur 0.55 → t=10.275 即 mt=0.5）：ghost 应落在两角正中间
    const r = new CtxRec();
    drawContinuity(asCtx(r), [prev, cur], 1, 1280, 720, 10.275);
    const mv = r.calls.find((c) => c.m === "moveTo")!; // 连接线起点 = ghost 当前位置
    // definition=br(1244,684) → hook=tl(36,36)，中点 (640,360)
    expect(mv.a[0]).toBeCloseTo(640, 0);
    expect(mv.a[1]).toBeCloseTo(360, 0);
    // mt=0（窗口前）与 mt=1（窗口后）应回落到静态角，不再在中点
    const before = new CtxRec(); drawContinuity(asCtx(before), [prev, cur], 1, 1280, 720, 10);
    const bMv = before.calls.find((c) => c.m === "moveTo")!;
    expect(bMv.a).toEqual([1244, 684]);
    const after = new CtxRec(); drawContinuity(asCtx(after), [prev, cur], 1, 1280, 720, 11);
    const aMv = after.calls.find((c) => c.m === "moveTo")!;
    expect(aMv.a).toEqual([1244, 684]);
  });
});

describe("⑤ plan 集成：真实语料上字段是活的", () => {
  const { shots, problems } = plan(SRT);
  const withC = shots.filter((s) => s.continuity && s.continuity.length > 0);

  it("门禁干净", () => {
    expect(problems).toEqual([]);
  });

  it("01 语料有 continuity 拍（修复前是 0 —— 字段死在半路）", () => {
    expect(withC.length).toBeGreaterThanOrEqual(1);
  });

  it("每个 continuity 拍的 ghost 与上拍 motif 一致，且标签格式正确", () => {
    for (const s of withC) {
      const i = shots.indexOf(s);
      expect(i).toBeGreaterThan(0);
      const f = continuityAt(shots, i)!;
      expect(f.ghost).toBeDefined();
      expect(f.ghost!.motif).toEqual(motifOf(shots[i - 1]!));
      for (const c of s.continuity!) {
        expect(c.startsWith("沿用上拍数字") || c.startsWith("承接上拍")).toBe(true);
      }
    }
  });

  it("无 continuity 的拍不 ghost（继承是特例，不是底色）", () => {
    const noC = shots.filter((s) => !s.continuity || s.continuity.length === 0);
    expect(noC.length).toBeGreaterThan(0);
    for (const s of noC) {
      const f = continuityAt(shots, shots.indexOf(s))!;
      expect(f.ghost).toBeUndefined();
    }
  });
});

describe("⑥ 承接覆盖：每个题材都不能是死字段（Phase 11 镜头连续性回归）", () => {
  // 记分卡里镜头连续性拿 2 分的直接原因：03 语料 12 拍**一拍承接都没有**
  // （visual-ab 覆盖率 = 0，按 rubric 的映射规则「覆盖 0 → 2」是门禁失败态）。
  // 根因是 HANDOFF 表缺边：03 的角色序列是 evidence→comparison→definition→…
  // 的数据类走法，表里一条都没覆盖 —— 表不是「漏了几条」，是压根没考虑过
  // 数据类语料的走法。
  //
  // 补表后 03 从 0 拍涨到 6 拍、01 从 3 涨到 5。这条断言防的是「将来改角色分类
  // 或改表，又把某个题材打成 0」—— 那是极其安静的一种回归：门禁不会红，
  // 画面也不会丑，只是连续性层悄悄不画了。
  const cases = [
    { file: "examples/01-explanatory-tech.srt", min: 4, why: "科普/机制解释" },
    { file: "examples/02-narrative-emotion.srt", min: 2, why: "情绪/关系叙事" },
    { file: "examples/03-data-comparison.srt", min: 4, why: "数据/趋势/比例（修复前是 0）" },
    { file: "examples/06-history-events.srt", min: 2, why: "历史/事件叙述" },
  ];
  for (const c of cases) {
    it(`${c.file}（${c.why}）有承接拍 ≥ ${c.min}`, () => {
      const srt = readFileSync(resolve(root, c.file), "utf-8");
      const { shots } = plan(srt);
      const withC = shots.filter((s) => s.continuity && s.continuity.length > 0);
      expect(withC.length, `${c.file} 只有 ${withC.length} 拍有承接`).toBeGreaterThanOrEqual(c.min);
    });
  }

  it("补表没有引入同角色边（几何硬约束）", () => {
    // ROLE_CORNER 是固定表（7 角色 4 角落），同角色必同角 → ghost 与自标记重叠、
    // 连接线零长度，「继承」退化成「一个标记换形状」。这是几何约束不是审美偏好。
    for (const [from, tos] of Object.entries(HANDOFF)) {
      for (const to of tos) {
        expect(to, `${from}→${to} 是同角色边`).not.toBe(from);
      }
    }
  });
});
