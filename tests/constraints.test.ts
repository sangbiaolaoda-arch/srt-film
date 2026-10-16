// Phase 6 布局约束引擎测试：边界 / 重叠 / 文字装载量。
// 门禁级断言：全部 catalog 槽位版式（跳过 custom 满版画面）在常规内容下零硬错误、
// 零告警 —— 这是「随机更换文字长度不会轻易导致重叠和越界」的可执行版本。

import { describe, it, expect } from "vitest";
import { LAYOUTS } from "../src/layouts/catalog";
import { checkLayout, slotBox, STAGE_W, STAGE_H } from "../src/layouts/constraints";
import type { Layout, RenderContent, Slot } from "../src/layouts/types";

const demo: RenderContent = {
  headline: "系统自动规划视觉内容",
  bullets: ["第一要点", "第二要点", "第三要点"],
  numbers: [85, 120, 3.2],
  bignum: "85",
  beat: 1,
};

const slot = (k: Slot["k"], box: [number, number, number, number], extra: Partial<Slot> = {}): Slot => ({ k, box, ...extra });

const layoutOf = (slots: Slot[]): Layout => ({
  id: "test-layout",
  name: "测试版式",
  group: "statement",
  enter: ["m-fade-up"],
  slots,
});

describe("slotBox 网格数学", () => {
  it("归一化网格 → 画面坐标（12×8 → 1280×720）", () => {
    expect(slotBox(slot("panel", [0, 0, 12, 8]))).toEqual({ x: 0, y: 0, w: STAGE_W, h: STAGE_H });
    expect(slotBox(slot("panel", [0, 0, 6, 4]))).toEqual({ x: 0, y: 0, w: 640, h: 360 });
    expect(slotBox(slot("panel", [6, 4, 6, 4]))).toEqual({ x: 640, y: 360, w: 640, h: 360 });
  });

  it("cols/rows 覆写被尊重", () => {
    const b = slotBox(slot("panel", [0, 0, 24, 16]), 24, 16);
    expect(b).toEqual({ x: 0, y: 0, w: STAGE_W, h: STAGE_H });
  });
});

describe("画布边界（硬错误）", () => {
  it("槽位超出画布 → 硬错误", () => {
    const r = checkLayout(layoutOf([slot("panel", [11, 7, 2, 2])]), demo);
    expect(r.errors.length).toBeGreaterThan(0);
    expect(r.errors[0]).toContain("超出画布");
  });

  it("贴边满版不误报（panel 齐画布是常见构图）", () => {
    const r = checkLayout(layoutOf([slot("panel", [0, 0, 12, 8])]), demo);
    expect(r.errors).toEqual([]);
  });

  it("退化尺寸（w=0）→ 硬错误", () => {
    const r = checkLayout(layoutOf([slot("panel", [0, 0, 0, 4])]), demo);
    expect(r.errors.some((e) => e.includes("退化"))).toBe(true);
  });
});

describe("实体重叠（告警）", () => {
  it("两个实体槽相压 → 告警", () => {
    const r = checkLayout(layoutOf([slot("chart", [2, 1, 6, 6]), slot("figure", [4, 3, 6, 6])]), demo);
    expect(r.warnings.some((w) => w.includes("重叠"))).toBe(true);
  });

  it("文字浮在 panel 上不是碰撞（卡片设计）", () => {
    const r = checkLayout(layoutOf([slot("panel", [1, 1, 10, 6]), slot("headline", [2, 2, 8, 2])]), demo);
    expect(r.warnings).toEqual([]);
    expect(r.errors).toEqual([]);
  });

  it("bignum 是数字文字，浮在 panel 上不报", () => {
    const r = checkLayout(layoutOf([slot("panel", [1, 1, 10, 6]), slot("bignum", [2, 2, 8, 4])]), demo);
    expect(r.warnings).toEqual([]);
  });
});

describe("文字装载量", () => {
  const small = layoutOf([slot("headline", [0, 0, 2, 1])]);

  it("极端长文 → 硬错误（缩字号触底也放不下）", () => {
    const long: RenderContent = { ...demo, headline: "这是一段专门用来测试溢出检测的极端长文案".repeat(3) };
    const r = checkLayout(small, long);
    expect(r.errors.some((e) => e.includes("文字溢出"))).toBe(true);
  });

  it("常规长度 → 不报（换行放得下）", () => {
    const r = checkLayout(small, { ...demo, headline: "十个字的常规标题" });
    expect(r.errors).toEqual([]);
    expect(r.warnings).toEqual([]);
  });

  it("贴边 → 告警但不拦截", () => {
    // 18 字：3 行 × 24px × 1.32 ≈ 95px > 槽高 90px，但 ≤ 1.25 倍 → 告警区间
    const r = checkLayout(small, { ...demo, headline: "比常规再长一点点的中等长度文案再加长一点" });
    expect(r.errors).toEqual([]);
    expect(r.warnings.some((w) => w.includes("贴边") || w.includes("超宽"))).toBe(true);
  });

  it("结构槽（rule/divider）不渲染文字，不被文字检查误伤", () => {
    const r = checkLayout(layoutOf([slot("rule", [0, 0, 12, 1]), slot("divider", [0, 7, 1, 1])]), demo);
    expect(r.errors).toEqual([]);
    expect(r.warnings).toEqual([]);
  });

  it("列表行数超槽高 → 硬错误", () => {
    const r = checkLayout(layoutOf([slot("bullets", [0, 0, 6, 1], { size: "xl" })]), demo);
    expect(r.errors.some((e) => e.includes("列表溢出"))).toBe(true);
  });
});

describe("无 content 时只查几何", () => {
  it("缺 content 不崩、不查文字", () => {
    const r = checkLayout(layoutOf([slot("headline", [0, 0, 2, 1])]));
    expect(r).toEqual({ errors: [], warnings: [] });
  });
});

describe("全 catalog 门禁扫描（Phase 6 通过标准）", () => {
  const slotLayouts = LAYOUTS.filter((l) => !l.custom);

  it("全部槽位版式在常规内容下零硬错误、零告警", () => {
    const bad: string[] = [];
    for (const l of slotLayouts) {
      const r = checkLayout(l, demo);
      for (const e of r.errors) bad.push(`${l.id}: ${e}`);
      for (const w of r.warnings) bad.push(`${l.id}: ${w}`);
    }
    expect(bad, bad.join("\n")).toEqual([]);
    expect(slotLayouts.length).toBeGreaterThan(100); // 防过滤条件写空导致假绿灯
  });
});

describe("尾句装载门禁（无音轨成片：caption 是尾句唯一的画面载体）", () => {
  const tail = { ...demo, caption: "就去问运营商的递归服务器" };

  it("有尾句但版式无 caption 槽 → 硬错误", () => {
    const r = checkLayout(layoutOf([slot("headline", [1, 1, 10, 6])]), tail);
    expect(r.errors.some((e) => e.includes("尾句"))).toBe(true);
  });

  it("无尾句 → 不查（caption 为空时版式没有可丢的东西）", () => {
    const r = checkLayout(layoutOf([slot("headline", [1, 1, 10, 6])]), demo);
    expect(r.errors.some((e) => e.includes("尾句"))).toBe(false);
  });

  it("custom 满版场景豁免 —— 它自己渲染全文（v2 19 套实测全部显示尾句）", () => {
    const custom: Layout = { ...layoutOf([slot("headline", [1, 1, 10, 6])]), custom: "v2:x" };
    expect(checkLayout(custom, tail).errors.some((e) => e.includes("尾句"))).toBe(false);
  });
});
