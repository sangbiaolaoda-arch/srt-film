import { describe, it, expect } from "vitest";
import { normalizeSeries, toBaseValue, familyOf, tickLabel } from "../src/core/units";

describe("图表量纲归一", () => {
  it("同族换算：公里与米归一到同一基准（比值保留）", () => {
    const s = normalizeSeries([
      { raw: "30 万公里", value: 300000, unit: "公里" },
      { raw: "340 米", value: 340, unit: "米" },
    ]);
    expect(s.family).toBe("length");
    // 30 万公里 = 3e8 米；340 米 → frac 约 1.13e-6
    expect(s.max).toBe(3e8);
    expect(s.points[0]!.frac).toBe(1);
    expect(s.points[1]!.frac).toBeCloseTo(340 / 3e8, 12);
    // 原文必须保留（画面数字仍可溯源到旁白）
    expect(s.points.map((p) => p.raw)).toEqual(["30 万公里", "340 米"]);
  });

  it("量级差过大不硬画：882 倍差退回文字板（线性轴会吞掉小值）", () => {
    // 归一后 3e8 vs 340：柱高 300px : 6px，小柱在轴前等于不存在，
    // 观众眼里仍是没有图表。对数轴普通观众不读、且会把 882 倍压成 2 格（另一种不诚实）。
    // 所以超过 MAX_RATIO 就不画图，文字板照样显示两个原文数字，信息不丢。
    const s = normalizeSeries([
      { raw: "30 万公里", value: 300000, unit: "公里" },
      { raw: "340 米", value: 340, unit: "米" },
    ]);
    expect(s.chartable).toBe(false);
    expect(s.reason).toContain("量级差过大");
  });

  it("量级差在阈值内才可作图（3 秒 / 6 秒 / 9 秒）", () => {
    const s = normalizeSeries([
      { raw: "3 秒", value: 3, unit: "秒" },
      { raw: "6 秒", value: 6, unit: "秒" },
      { raw: "9 秒", value: 9, unit: "秒" },
    ]);
    expect(s.chartable).toBe(true);
    expect(s.family).toBe("time");
    expect(s.points.map((p) => +p.frac.toFixed(4))).toEqual([0.3333, 0.6667, 1]);
  });

  it("跨族不可同轴：长度 vs 时间一律判不可作图", () => {
    const s = normalizeSeries([
      { raw: "340 米", value: 340, unit: "米" },
      { raw: "120 毫秒", value: 120, unit: "毫秒" },
    ]);
    expect(s.chartable).toBe(false);
    expect(s.reason).toContain("跨单位族");
    expect(s.points).toHaveLength(0);
  });

  it("百分比与倍数同属 ratio 族，可比", () => {
    const s = normalizeSeries([
      { raw: "85%", value: 85, unit: "%" },
      { raw: "3 倍", value: 3, unit: "倍" },
    ]);
    expect(s.chartable).toBe(true);
    expect(s.family).toBe("ratio");
  });

  it("时间族：毫秒与秒/分钟换算", () => {
    expect(toBaseValue("毫秒", 120)).toBe(120);
    expect(toBaseValue("秒", 2)).toBe(2000);
    expect(toBaseValue("分钟", 1)).toBe(60000);
    expect(toBaseValue("小时", 1)).toBe(3.6e6);
  });

  it("质量族：吨与克换算", () => {
    expect(toBaseValue("克", 1)).toBe(1);
    expect(toBaseValue("千克", 1)).toBe(1000);
    expect(toBaseValue("吨", 1)).toBe(1e6);
  });

  it("单点 / 全零 / 未知单位一律不可作图", () => {
    expect(normalizeSeries([{ raw: "340 米", value: 340, unit: "米" }]).chartable).toBe(false);
    expect(normalizeSeries([]).chartable).toBe(false);
    const unknown = normalizeSeries([
      { raw: "3 次", value: 3, unit: "次" },
      { raw: "5 届", value: 5, unit: "届" },
    ]);
    expect(unknown.chartable).toBe(false);
    expect(unknown.reason).toBe("单位不在可比表内");
  });

  it("刻度缩写：万/亿，避免刻度文字比图宽", () => {
    expect(tickLabel(0)).toBe("0");
    expect(tickLabel(300000)).toBe("30万");
    expect(tickLabel(3e8)).toBe("3亿");
    expect(tickLabel(850)).toBe("850");
    expect(tickLabel(0.5)).toBe("0.5");
  });

  it("未知单位归 other 族", () => {
    expect(familyOf(undefined)).toBe("other");
    expect(familyOf("次")).toBe("other");
    expect(familyOf("米")).toBe("length");
  });
});
