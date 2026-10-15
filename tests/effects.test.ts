import { describe, it, expect } from "vitest";
import { driftMotes, glowPulse, gridPulse, paperSheen, particleField, type FxOpts } from "../src/render/effects";

/**
 * 无 canvas 环境下的指令记录器：把每次绘制调用按顺序记成字符串。
 * 这样「同一 (t, seed) 两次调用得到同一串指令」就是可断言的事实，
 * 而不是靠肉眼看印相。导出可复现的契约就落在这一串上。
 */
function recorder() {
  const calls: string[] = [];
  const num = (v: number) => v.toFixed(4);
  const grad = { addColorStop: (o: number, c: string) => calls.push(`stop:${num(o)}:${c}`) };
  const ctx = {
    save: () => calls.push("save"),
    restore: () => calls.push("restore"),
    beginPath: () => calls.push("begin"),
    fill: () => calls.push("fill"),
    stroke: () => calls.push("stroke"),
    arc: (x: number, y: number, r: number) => calls.push(`arc:${num(x)}:${num(y)}:${num(r)}`),
    moveTo: (x: number, y: number) => calls.push(`move:${num(x)}:${num(y)}`),
    lineTo: (x: number, y: number) => calls.push(`line:${num(x)}:${num(y)}`),
    strokeRect: (x: number, y: number, w: number, h: number) => calls.push(`srect:${num(x)}:${num(y)}`),
    fillRect: (x: number, y: number, w: number, h: number) => calls.push(`rect:${num(x)}:${num(y)}`),
    translate: (x: number, y: number) => calls.push(`t:${num(x)}:${num(y)}`),
    rotate: (a: number) => calls.push(`rot:${num(a)}`),
    createRadialGradient: () => grad,
    createLinearGradient: () => grad,
    set globalAlpha(v: number) { calls.push(`alpha:${num(v)}`); },
    set fillStyle(v: string) { calls.push(`fillStyle:${v}`); },
    set strokeStyle(v: string) { calls.push(`strokeStyle:${v}`); },
    set lineWidth(v: number) { calls.push(`lw:${num(v)}`); },
    set globalCompositeOperation(v: string) { calls.push(`blend:${v}`); },
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls };
}

/** 从记录的 "stop:<offset>:rgba(r,g,b,a)" 里取 alpha。 */
const alphaOf = (call: string): number => Number(call.match(/,([\d.]+)\)$/)![1]);

const opts = (over: Partial<FxOpts> = {}): FxOpts => ({
  w: 1280, h: 720, t: 1.2, dur: 4, seed: 12345,
  accent: "#c8401f", ink: "#8a867c", dim: "#8a867c",
  onLight: true,
  ...over,
});

describe("浮尘漂移 driftMotes", () => {
  it("同 t 同 seed 两次调用逐指令相同（导出可复现）", () => {
    const a = recorder();
    const b = recorder();
    driftMotes(a.ctx, opts());
    driftMotes(b.ctx, opts());
    expect(a.calls).toEqual(b.calls);
    expect(a.calls.length).toBeGreaterThan(100);
  });

  it("同一拍内不同 t 得到不同画面（确实在动，不是静帧）", () => {
    const a = recorder();
    const b = recorder();
    driftMotes(a.ctx, opts({ t: 0.6 }));
    driftMotes(b.ctx, opts({ t: 3.4 }));
    expect(a.calls).not.toEqual(b.calls);
  });

  it("换 seed 换布局（每拍不同，不会全片同一张浮尘图）", () => {
    const a = recorder();
    const b = recorder();
    driftMotes(a.ctx, opts({ seed: 1 }));
    driftMotes(b.ctx, opts({ seed: 2 }));
    expect(a.calls).not.toEqual(b.calls);
  });

  it("拍首尾收边：t=0 与 t=dur 不落笔（跨拍不硬边）", () => {
    for (const t of [0, 4]) {
      const r = recorder();
      driftMotes(r.ctx, opts({ t }));
      expect(r.calls.filter((c) => c.startsWith("arc:"))).toHaveLength(0);
    }
  });

  it("走向正常混合：亮底上不用 lighter（后者叠深色=零增量）", () => {
    const r = recorder();
    driftMotes(r.ctx, opts());
    expect(r.calls).toContain("blend:source-over");
    expect(r.calls).not.toContain("blend:lighter");
  });

  it("强度直接压 alpha：编辑风 0.35 比扁平风 0.7 淡一档", () => {
    const alphaOf = (strength: number) => {
      const r = recorder();
      driftMotes(r.ctx, opts(), 96, strength);
      const first = r.calls.find((c) => c.startsWith("alpha:"));
      return Number(first!.slice(6));
    };
    expect(alphaOf(0.35)).toBeLessThan(alphaOf(0.7));
  });

  it("数量随参数走，且是有限的小数（不让导出被粒子拖慢）", () => {
    const r = recorder();
    driftMotes(r.ctx, opts(), 96, 1);
    expect(r.calls.filter((c) => c.startsWith("arc:"))).toHaveLength(96);
  });
});

describe("网格脉冲 gridPulse", () => {
  it("同 t 同 seed 两次调用逐指令相同", () => {
    const a = recorder();
    const b = recorder();
    gridPulse(a.ctx, opts());
    gridPulse(b.ctx, opts());
    expect(a.calls).toEqual(b.calls);
  });

  it("点亮的是网格线本身而不是交点（线覆盖够大才看得见）", () => {
    const r = recorder();
    gridPulse(r.ctx, opts({ t: 2 }));
    expect(r.calls.filter((c) => c.startsWith("arc:"))).toHaveLength(0);
    const strokes = r.calls.filter((c) => c === "stroke").length;
    expect(strokes).toBeGreaterThan(2); // 带内若干条 + 扫描头
    expect(strokes).toBeLessThan(14); // 全画布 18 条横线，只亮带内的那几条
  });

  it("扫描头随 t 推进：不同 t 亮起的线不同", () => {
    const at = (t: number) => {
      const r = recorder();
      gridPulse(r.ctx, opts({ t }));
      return r.calls.filter((c) => c.startsWith("move:"));
    };
    expect(at(1)).not.toEqual(at(3));
  });

  it("拍首尾收边", () => {
    const r = recorder();
    gridPulse(r.ctx, opts({ t: 0 }));
    expect(r.calls.filter((c) => c === "stroke")).toHaveLength(0);
  });

  it("高分辨率下网格随之放大（1440p 的步长不是 40px）", () => {
    const firstY = (w: number) => {
      const r = recorder();
      gridPulse(r.ctx, opts({ w, h: (w / 16) * 9, t: 2 }));
      const m = r.calls.find((c) => c.startsWith("move:"));
      return Number(m!.split(":")[2]);
    };
    expect(firstY(2560)).toBeGreaterThan(firstY(1280));
  });
});

describe("纸面掠光 paperSheen", () => {
  it("同 t 两次调用逐指令相同", () => {
    const a = recorder();
    const b = recorder();
    paperSheen(a.ctx, opts());
    paperSheen(b.ctx, opts());
    expect(a.calls).toEqual(b.calls);
  });

  it("大面积低对比：一次全画布渐变填充，而不是逐点落笔", () => {
    const r = recorder();
    paperSheen(r.ctx, opts());
    // 只有一次 fillRect（整幅），没有 arc/stroke 这类逐元素绘制
    expect(r.calls.filter((c) => c.startsWith("rect:"))).toHaveLength(1);
    expect(r.calls.filter((c) => c.startsWith("arc:"))).toHaveLength(0);
    // 两端全透明、中间一档 accent —— 带内色差只有几级
    const stops = r.calls.filter((c) => c.startsWith("stop:"));
    expect(stops).toHaveLength(3);
    expect(stops[0]).toContain("rgba(200,64,31,0)");
    expect(stops[2]).toContain("rgba(200,64,31,0)");
    expect(alphaOf(stops[1]!)).toBeGreaterThan(0);
    expect(alphaOf(stops[1]!)).toBeLessThan(0.09);
  });

  it("掠光位置随拍内进度推进（不是静止的一片色）", () => {
    const early = recorder();
    const late = recorder();
    paperSheen(early.ctx, opts({ t: 0.5, dur: 8 }));
    paperSheen(late.ctx, opts({ t: 7.5, dur: 8 }));
    expect(early.calls).not.toEqual(late.calls);
  });

  it("拍首尾收边", () => {
    const r = recorder();
    paperSheen(r.ctx, opts({ t: 0 }), 1);
    expect(r.calls.filter((c) => c.startsWith("rect:"))).toHaveLength(0);
  });

  it("强度直接压带内 alpha", () => {
    const peak = (strength: number) => {
      const r = recorder();
      paperSheen(r.ctx, opts(), strength);
      return alphaOf(r.calls.filter((c) => c.startsWith("stop:"))[1]!);
    };
    expect(peak(0.45)).toBeLessThan(peak(1));
  });
});

describe("亮底自适应（本轮修复的核心）", () => {
  it("粒子场在亮底走正常混合、暗底走 lighter", () => {
    const onLight = recorder();
    particleField(onLight.ctx, opts({ onLight: true }), "vortex", 12);
    expect(onLight.calls).toContain("blend:source-over");

    const onDark = recorder();
    particleField(onDark.ctx, opts({ onLight: false }), "vortex", 12);
    expect(onDark.calls).toContain("blend:lighter");
  });

  it("粒子场在亮底把 alpha 压到一半（深点在亮底的视觉重量更大）", () => {
    const pick = (onLight: boolean) => {
      const r = recorder();
      particleField(r.ctx, opts({ onLight }), "vortex", 12);
      const vals = r.calls.filter((c) => c.startsWith("alpha:")).map((c) => Number(c.slice(6)));
      return Math.max(...vals);
    };
    expect(pick(true)).toBeLessThan(pick(false));
  });

  it("光晕在亮底改为正常混合 + accent 色（不再叠近白）", () => {
    const r = recorder();
    glowPulse(r.ctx, opts({ onLight: true }), 1);
    expect(r.calls).toContain("blend:source-over");
    expect(r.calls.some((c) => c.startsWith("stop:") && c.includes("200,64,31"))).toBe(true);
    expect(r.calls.some((c) => c.includes("255,250,235"))).toBe(false);
  });

  it("光晕在暗底保持原行为（近白 + lighter）", () => {
    const r = recorder();
    glowPulse(r.ctx, opts({ onLight: false }), 1);
    expect(r.calls).toContain("blend:lighter");
    expect(r.calls.some((c) => c.includes("255,250,235"))).toBe(true);
  });
});
