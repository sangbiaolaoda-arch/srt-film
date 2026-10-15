// 缺陷 5：槽级 m×mx 自动门禁。
// 「成品库现在是干净的」和「门禁能抓到」是两件事 —— 前者靠全库断言守着，
// 后者靠下面这几个人为构造的病例证明（否则门禁是个永远绿的摆设）。
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { LAYOUTS } from "../src/layouts/catalog";
import { V2_LAYOUTS } from "../src/layouts/v2";
import { plan } from "../src/core/plan";
import { buildMotionSchedule, slotTweens, staggerAt, MX_GAP, type MotionPlan } from "../src/motion/schedule";
import { slotConflicts } from "../src/motion/conflict";
import { tweenTotal } from "../src/motion/props";
import { MOTION_BY_ID } from "../src/motion/catalog";
import type { Layout, RenderContent, Slot } from "../src/layouts/types";
import type { Shot } from "../src/core/shot";

const root = resolve(import.meta.dirname, "..");

function content(beat: number): RenderContent {
  return { headline: "测试标题", subhead: "", caption: "", bullets: [], numbers: [], numberTokens: [], bignum: undefined, unit: "", beat };
}
function shot(layout: Layout, beat: number, dur: number): Shot {
  return { layout, content: content(beat), start: beat * dur, end: beat * dur + dur, cueIds: [] };
}
function first(layout: Layout, dur = 3): MotionPlan {
  return buildMotionSchedule([shot(layout, 0, dur)]).plans[0]!;
}
function b(id: string, slots: Partial<Slot>[], over: Partial<Layout> = {}): Layout {
  return {
    id, name: id, group: "statement", enter: ["m-fade-up"],
    slots: slots.map((s, i) => ({ k: "text", box: [1, i * 2, 8, 1.5], ...s }) as Slot),
    ...over,
  };
}

describe("slotTweens：槽级排期的唯一权威", () => {
  it("入场落在错峰点上，mx 在入场收尾 +0.12s 之后", () => {
    const mp = first(b("t-1", [{}, {}]));
    const t0 = slotTweens(mp, 0, {});
    expect(t0[0]!.at).toBeCloseTo(staggerAt(mp, 0), 5);
    const t1 = slotTweens(mp, 1, {});
    expect(t1[0]!.at).toBeCloseTo(staggerAt(mp, 1), 5);

    const withMx = slotTweens(mp, 0, { mx: "m-pulse" });
    expect(withMx).toHaveLength(2);
    expect(withMx[1]!.role).toBe("mx");
    expect(withMx[1]!.at).toBeCloseTo(withMx[0]!.at + withMx[0]!.dur + MX_GAP, 5);
  });

  it("槽上声明的 m 覆盖入池轮转", () => {
    const mp = first(b("t-2", [{ m: "m-zoom-in" }]));
    expect(slotTweens(mp, 0, { m: "m-zoom-in" })[0]!.motion).toBe("m-zoom-in");
    expect(slotTweens(mp, 0, {})[0]!.motion).toBe("m-fade-up");
  });

  it("拍级 emphasis 只落在首槽", () => {
    const mp = first(b("t-3", [{}, {}], { emphasis: "m-pulse" }));
    expect(slotTweens(mp, 0, {}).some((t) => t.role === "emphasis")).toBe(true);
    expect(slotTweens(mp, 1, {}).some((t) => t.role === "emphasis")).toBe(false);
  });
});

describe("tweenTotal：真实写完的时刻 ≠ 目录 dur", () => {
  it("yoyo/repeat 是 N+1 倍", () => {
    // m-pulse：duration = dur/2，yoyo + repeat 1 → 全程仍是 dur
    expect(tweenTotal("m-pulse", 0.6)).toBeCloseTo(0.6, 5);
    // m-flicker：写死 0.06s × (repeat+1)
    expect(tweenTotal("m-flicker", 2.4)).toBeCloseTo(0.06 * (Math.floor(2.4 / 0.9) + 1), 5);
  });

  it("逐字打出在单目标上是 1.6×dur —— 入场会比目录 dur 多写半拍多", () => {
    expect(tweenTotal("m-type-on", 0.9)).toBeCloseTo(0.9 * 1.6, 5);
    expect(MOTION_BY_ID.get("m-type-on")!.dur).toBe(0.9);
  });
});

describe("槽级冲突门禁", () => {
  it("[病例 1] 入场还没写完就被 mx 抢同一个属性 → 抓到", () => {
    // m-type-on 真实时长 1.44s，mx m-glow 从 1.02s 起，两者都写 opacity
    const layout = b("t-c1", [{ m: "m-type-on", mx: "m-glow" }]);
    const cs = slotConflicts(layout, first(layout));
    expect(cs).toHaveLength(1);
    expect(cs[0]!.props).toContain("opacity");
    expect(cs[0]!.roles).toBe("enter/mx");
    expect(cs[0]!.overlap).toBeGreaterThan(0.3);
  });

  it("[病例 2] 拍级 emphasis 与槽级 mx 都在写 scale → 抓到", () => {
    const layout = b("t-c2", [{ mx: "m-pulse" }], { emphasis: "m-count-pop" });
    const cs = slotConflicts(layout, first(layout, 8));
    expect(cs).toHaveLength(1);
    expect(cs[0]!.roles).toBe("mx/emphasis");
    expect(cs[0]!.props.sort()).toEqual(["scaleX", "scaleY"]);
  });

  it("[反例] 时间不重叠 → 不报（入场 + mx 的正常排期）", () => {
    const layout = b("t-n1", [{ m: "m-scale-soft", mx: "m-pulse" }]);
    expect(slotConflicts(layout, first(layout, 8))).toEqual([]);
  });

  it("[反例] 属性不相交 → 不报（进-opacity / mx-scale）", () => {
    const layout = b("t-n2", [{ mx: "m-color-shift" }], { emphasis: "m-pulse" });
    expect(slotConflicts(layout, first(layout, 8))).toEqual([]);
  });

  it("[口径] 只盯目录 dur 会漏判病例 1 —— 这就是要用真实时长的原因", () => {
    const layout = b("t-c1b", [{ m: "m-type-on", mx: "m-glow" }]);
    const mp = first(layout);
    const tws = slotTweens(mp, 0, layout.slots[0]);
    const declared = Math.min(tws[0]!.at + tws[0]!.dur, tws[1]!.at + tws[1]!.dur) - Math.max(tws[0]!.at, tws[1]!.at);
    expect(declared).toBeLessThan(0); // 目录 dur 口径下两者根本不重叠
  });
});

describe("全库与全语料：现在应当零冲突（回归护栏）", () => {
  it("231 个版式 × 三种拍长都不冲突", () => {
    const bad: string[] = [];
    for (const layout of [...LAYOUTS, ...V2_LAYOUTS]) {
      for (const dur of [1.5, 3, 8]) {
        for (const c of slotConflicts(layout, first(layout, dur))) {
          bad.push(`${layout.id} dur=${dur} 槽${c.slot} ${c.a}×${c.b}`);
        }
      }
    }
    expect(bad).toEqual([]);
  });

  it("6 条语料规划出来的片子零冲突", () => {
    const files = readdirSync(resolve(root, "examples")).filter((f) => f.endsWith(".srt")).sort();
    const bad: string[] = [];
    for (const f of files) {
      let ov = "";
      try { ov = readFileSync(resolve(root, "examples", f.replace(/\.srt$/, ".json")), "utf-8"); } catch { /* 无覆写 */ }
      const { shots, problems } = plan(readFileSync(resolve(root, "examples", f), "utf-8"), ov);
      expect(problems, `${f} 的既有门禁应当干净`).toEqual([]);
      const { plans } = buildMotionSchedule(shots);
      plans.forEach((mp, i) => {
        for (const c of slotConflicts(shots[i]!.layout, mp)) bad.push(`${f} 拍${shots[i]!.content.beat} ${c.a}×${c.b}`);
      });
    }
    expect(files.length).toBeGreaterThanOrEqual(6);
    expect(bad).toEqual([]);
  });
});
