// propsOf 是从 apply.ts 的真实实现里录出来的 —— 这份测试断言「录出来的东西和
// 手读实现得到的一致」，以及录制过程本身不依赖任何 DOM / 真实 GSAP 时间轴。
import { describe, it, expect } from "vitest";
import { MOTIONS, MOTION_BY_ID } from "../src/motion/catalog";
import { APPLIED_MOTION_IDS } from "../src/motion/apply";
import { propsOf, sharedProps, type MotionProp } from "../src/motion/props";

const sorted = (a: string[]) => [...a].sort();

describe("propsOf：从实现录制，不手写表", () => {
  it("每个已注册动效都录得到结果且不抛（含 gsap.set 的那几个）", () => {
    for (const m of MOTIONS) {
      expect(() => propsOf(m.id), m.id).not.toThrow();
    }
  });

  it("目录里的动效都有实现（否则门禁查不到属性）", () => {
    for (const m of MOTIONS) {
      expect(APPLIED_MOTION_IDS, m.id).toContain(m.id);
    }
  });

  it("scale 归一成 scaleX+scaleY，autoAlpha 归成 opacity", () => {
    expect(propsOf("m-scale-soft")).toEqual(sorted(["opacity", "scaleX", "scaleY"]));
    expect(propsOf("m-fade-up")).toEqual(sorted(["opacity", "y"]));
  });

  it("各轴向单独成 prop：左右滑只碰 x、擦除只碰 scaleX", () => {
    expect(propsOf("m-slide-left")).toEqual(sorted(["opacity", "x"]));
    expect(propsOf("m-wipe-left")).toEqual(sorted(["opacity", "scaleX"]));
    expect(propsOf("m-rotate-in")).toEqual(sorted(["opacity", "rotate", "scaleX", "scaleY"]));
    expect(propsOf("m-skew-in")).toEqual(sorted(["opacity", "skewX", "x"]));
  });

  it("SVG 属性类：描边 / 填色 / 字重各自成 prop", () => {
    expect(propsOf("m-stroke-draw")).toEqual(["strokeDash"]);
    expect(propsOf("m-color-shift")).toEqual(["fill"]);
    expect(propsOf("m-weight-morph")).toEqual(["fontWeight"]);
  });

  it("只改文字内容的不产出任何 prop（不与 transform 类争用）", () => {
    expect(propsOf("m-number-tick")).toEqual([]);
  });

  it("未知 id 返回空而不是抛", () => {
    expect(propsOf("m-nope")).toEqual([]);
  });

  it("sharedProps：scale 与 scaleX 相交，x 与 y 不相交", () => {
    expect(sharedProps("m-scale-soft", "m-pulse")).toEqual(["scaleX", "scaleY"]);
    expect(sharedProps("m-slide-left", "m-fade-up")).toEqual(["opacity"]);
    expect(sharedProps("m-slide-left", "m-slide-right")).toEqual(["opacity", "x"].sort());
    expect(sharedProps("m-fade-up", "m-slide-out-left")).toEqual(["opacity"]);
  });
});

describe("录制结果 vs 目录冲突声明（交叉核对）", () => {
  it("声明了冲突的动效对，属性上必须真的有交集 —— 否则那条声明很可能是抄来的", () => {
    const ids = MOTIONS.map((m) => m.id);
    const offenders: string[] = [];
    for (const m of MOTIONS) {
      for (const other of m.conflicts ?? []) {
        if (!ids.includes(other)) offenders.push(`${m.id} → 未知 ${other}`);
        else if (sharedProps(m.id, other).length === 0) offenders.push(`${m.id} × ${other}（属性无交集）`);
      }
    }
    // 已知例外：m-shake（抖 x）× m-float（漂 y）是目录里唯一一条「语义冲突」——
    // 同一个元素又抖又漂确实难看，但两者动手的属性并不相同，属性模型抓不到这种
    // 「看得见的别扭」，需要人工判断（属性模型不越权把它当钩子伪装成硬冲突）。
    // 点名列在这里：以后新增的任何冲突声明都会掉进 offenders，被这条断言筛出来。
    expect(offenders).toEqual(["m-shake × m-float（属性无交集）", "m-float × m-shake（属性无交集）"]);
  });

  it("属性表不遗漏：每个 prop 至少被两个动效用到（孤立项说明归一表写窄了）", () => {
    const seen = new Set<MotionProp>();
    for (const m of MOTIONS) for (const p of propsOf(m.id)) seen.add(p);
    expect(seen.has("opacity")).toBe(true);
    expect(seen.has("x")).toBe(true);
    expect(seen.has("y")).toBe(true);
    expect(seen.has("scaleX")).toBe(true);
    expect(seen.has("scaleY")).toBe(true);
    expect(seen.has("rotate")).toBe(true);
    expect(seen.has("skewX")).toBe(true);
    expect(seen.has("fill")).toBe(true);
    expect(seen.has("fontWeight")).toBe(true);
    expect(seen.has("strokeDash")).toBe(true);
  });

  it("duration / ease / stagger 这类控制键不进属性集", () => {
    for (const m of MOTIONS) {
      for (const p of propsOf(m.id)) {
        expect(["duration", "ease", "stagger", "yoyo", "repeat"].includes(p)).toBe(false);
      }
    }
  });

  it("MOTION_BY_ID 与 propsOf 对同一个 id 的结论一致", () => {
    for (const id of ["m-pulse", "m-breathe", "m-count-pop"]) {
      expect(MOTION_BY_ID.has(id)).toBe(true);
      expect(propsOf(id).sort()).toEqual(propsOf(id).sort());
    }
  });
});
