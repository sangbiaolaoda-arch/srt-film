import { describe, it, expect } from "vitest";
import { plan } from "../src/core/plan";
import { STYLE_PROFILES } from "../src/styles/style-system";

const SRT = `1
00:00:00,000 --> 00:00:04,000
打开浏览器输入网址

2
00:00:04,000 --> 00:00:08,000
服务器返回耗时120毫秒

3
00:00:08,000 --> 00:00:12,000
转化率提升85%

4
00:00:12,000 --> 00:00:16,000
成本降了一半

5
00:00:16,000 --> 00:00:20,000
光伏靠天吃饭

6
00:00:20,000 --> 00:00:24,000
一句话总结
`;

/** 拿一个六拍语料，把每两拍的风格钉死，好让「派生」这件事可断言。 */
const OV = JSON.stringify({
  1: { style: "editorial" },
  2: { style: "editorial" },
  3: { style: "chart-motion" },
  4: { style: "chart-motion" },
  5: { style: "flat-vector" },
  6: { style: "flat-vector" },
});

describe("动效按风格派生", () => {
  it("三系 profile 各带一种签名动效 + 强度（编辑风最克制）", () => {
    expect(STYLE_PROFILES.editorial.fxBias).toBe("paper-sheen");
    expect(STYLE_PROFILES["chart-motion"].fxBias).toBe("grid-pulse");
    expect(STYLE_PROFILES["flat-vector"].fxBias).toBe("drift-motes");
    expect(STYLE_PROFILES.editorial.fxStrength).toBeLessThan(STYLE_PROFILES["chart-motion"].fxStrength);
    expect(STYLE_PROFILES["chart-motion"].fxStrength).toBeLessThan(STYLE_PROFILES["flat-vector"].fxStrength);
  });

  it("规划后没有任何一拍缺动效（此前编辑风 11 个板一帧都没有）", () => {
    const { shots } = plan(SRT, OV);
    expect(shots).toHaveLength(6);
    for (const s of shots) {
      expect(s.layout.fx, `拍 ${s.content.beat}（${s.layout.id}）没有动效`).toBeTruthy();
      expect(s.layout.fx).not.toBe("none");
      expect(s.layout.fxStrength).toBeGreaterThan(0);
    }
  });

  it("编辑风板式（自身没声明 fx）拿到纸面掠光 + 0.45", () => {
    const { shots } = plan(SRT, OV);
    const ed = shots.filter((s) => s.layout.style === "editorial");
    expect(ed.length).toBe(2);
    for (const s of ed) {
      expect(s.layout.fx).toBe("paper-sheen");
      expect(s.layout.fxStrength).toBe(0.45);
    }
  });

  it("图表风板式拿到网格脉冲 + 0.5", () => {
    const { shots } = plan(SRT, OV);
    const cm = shots.filter((s) => s.layout.style === "chart-motion");
    expect(cm.length).toBe(2);
    for (const s of cm) {
      expect(s.layout.fx).toBe("grid-pulse");
      expect(s.layout.fxStrength).toBe(0.5);
    }
  });

  it("扁平风拍也一定有动效（显式粒子板保留自己的，其余落回浮尘）", () => {
    const { shots } = plan(SRT, OV);
    const fv = shots.filter((s) => s.layout.style === "flat-vector");
    expect(fv.length).toBe(2);
    for (const s of fv) {
      expect(s.layout.fx).toBeTruthy();
      expect(s.layout.fxStrength).toBeGreaterThan(0);
    }
  });

  it("板式自己声明了 fx 就不被派生覆盖（扁平风粒子板保留粒子）", () => {
    // 04 长语料的扁平风拍里混着 pf-*/po-* 这类自带 fx 的板式；用 one-shot 覆写强行点到它们。
    const ov = JSON.stringify({ 1: { style: "flat-vector", layoutId: "pf-vortex-center" } });
    const { shots } = plan(SRT, ov);
    expect(shots[0]!.layout.id).toBe("pf-vortex-center");
    expect(shots[0]!.layout.fx).toBe("particles-vortex");
  });

  it("显式 none 是显式关闭，派生不能把它打开", () => {
    const ov = JSON.stringify({
      1: {
        style: "editorial",
        layout: {
          id: "inline-no-fx", name: "内联·无特效", group: "statement",
          enter: ["m-fade-up"], slots: [{ k: "headline", box: [1, 1, 10, 6] }],
          fx: "none",
        },
      },
    });
    const { shots } = plan(SRT, ov);
    expect(shots[0]!.layout.id).toBe("inline-no-fx");
    expect(shots[0]!.layout.fx).toBe("none");
  });

  it("派生不会污染 catalog 里的共享版式定义", () => {
    plan(SRT, OV);
    plan(SRT, JSON.stringify({ 1: { style: "chart-motion" }, 2: { style: "chart-motion" } }));
    // 再跑一次编辑风：如果上一轮把 fx 写进了共享对象，这里会拿到 grid-pulse
    const { shots } = plan(SRT, OV);
    const ed = shots.filter((s) => s.layout.style === "editorial");
    for (const s of ed) expect(s.layout.fx).toBe("paper-sheen");
  });
});
