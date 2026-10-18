import { describe, it, expect } from "vitest";
import { cameraScale } from "../src/render/frame";
import { EASES } from "../src/motion/elements";
import type { Shot } from "../src/core/shot";

/**
 * 预览↔导出 机位曲线一致性（层 A 反向夹具会误报的 bug 类型）。
 * stage.tsx 用 GSAP power2.inOut；frame.ts 导出补偿必须逐帧同值。
 * 曾实现成 2p²（二次），与 power2.inOut 最大差 0.074，
 * 换算到缓推 1.05 的最远端约 2.2px —— 是漂移，不是精度差。
 */
const ease = EASES["power2.inOut"]!;

function shotWith(scaleFrom: number, scaleTo: number): Shot {
  return {
    start: 3.75,
    end: 7.75,
    tlStart: 3.75,
    camera: { scaleFrom, scaleTo },
  } as unknown as Shot;
}

describe("机位缓动：导出与预览逐帧同源", () => {
  const cases = [
    { from: 1.0, to: 1.05 },
    { from: 1.04, to: 1.0 },
  ];

  for (const c of cases) {
    it(`scale ${c.from}→${c.to} 与 power2.inOut 逐帧一致`, () => {
      const shot = shotWith(c.from, c.to);
      const start = shot.start!;
      const dur = shot.end! - shot.start!;
      // 全程均匀采样 200 点
      for (let i = 0; i <= 200; i++) {
        const t = start + (dur * i) / 200;
        const p = (t - start) / dur;
        const expected = c.from + (c.to - c.from) * ease(p);
        expect(cameraScale(shot, t)).toBeCloseTo(expected, 6);
      }
    });
  }

  it("无相机时恒为 1", () => {
    expect(cameraScale(undefined as unknown as Shot, 5.0)).toBe(1);
    expect(cameraScale({ start: 0, end: 4 } as unknown as Shot, 5.0)).toBe(1);
  });

  it("曲线端点是 power2.inOut 的端值（中点 0.5）", () => {
    // power2.inOut(1/3) = 4·(1/3)³ = 4/27（二次版给 2·(1/3)²=2/9，是 6/27，差 2/27）；
    // power2.inOut(2/3) = 1 − (2/3)³/2 = 1 − 4/27 = 23/27（二次版给 23/32·… 不同）。
    expect(ease(1 / 3)).toBeCloseTo(4 / 27, 6);
    expect(ease(2 / 3)).toBeCloseTo(1 - 4 / 27, 6);
  });
});