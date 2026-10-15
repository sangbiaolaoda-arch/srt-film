import { describe, it, expect } from "vitest";
import { plan } from "../src/core/plan";
import {
  toRenderPlan,
  parseRenderPlan,
  validateRenderPlan,
  serializeRenderPlan,
  RENDER_PLAN_VERSION,
  RENDER_PLAN_SCHEMA,
} from "../src/core/render-plan";

const SRT = `1
00:00:00,000 --> 00:00:02,000
打开浏览器，输入网址。

2
00:00:02,000 --> 00:00:04,500
服务器返回HTML，耗时120毫秒

3
00:00:04,500 --> 00:00:06,000
转化率提升了85%！
`;

describe("RenderPlan 契约", () => {
  const result = plan(SRT, "");

  it("从规划结果生成带版本与画布的 RenderPlan", () => {
    const rp = toRenderPlan(result, { srt: SRT });
    expect(rp.schema).toBe(RENDER_PLAN_SCHEMA);
    expect(rp.version).toBe(RENDER_PLAN_VERSION);
    expect(rp.canvas).toEqual({ width: 1920, height: 1080, fps: 30 });
    expect(rp.export).toEqual({ codec: "avc", container: "mp4", audio: false });
    expect(rp.scenes).toHaveLength(result.shots.length);
  });

  it("每拍保留溯源（sourceCueIds）与版式/风格/标题", () => {
    const rp = toRenderPlan(result, { srt: SRT });
    const s0 = rp.scenes[0]!;
    expect(s0.sourceCueIds.length).toBeGreaterThan(0);
    expect(s0.layoutId).toBe(result.shots[0]!.layout.id);
    expect(s0.headline).toBe(result.shots[0]!.content.headline);
  });

  it("序列化 → 解析 往返一致", () => {
    const rp = toRenderPlan(result, { srt: SRT, projectId: "demo" });
    const back = parseRenderPlan(serializeRenderPlan(rp));
    expect(back.version).toBe(rp.version);
    expect(back.scenes).toEqual(rp.scenes);
    expect(back.sourceSrt).toBe(SRT);
  });

  it("合法 RenderPlan 通过校验（无错误）", () => {
    const rp = toRenderPlan(result, { srt: SRT });
    expect(validateRenderPlan(rp)).toHaveLength(0);
  });

  it("缺 schema / 版本不符 / 空 scenes 都被校验拦下", () => {
    const rp = toRenderPlan(result, { srt: SRT });
    expect(validateRenderPlan({ ...rp, schema: "wrong" }).length).toBeGreaterThan(0);
    expect(validateRenderPlan({ ...rp, version: 999 }).length).toBeGreaterThan(0);
    expect(validateRenderPlan({ ...rp, scenes: [] }).length).toBeGreaterThan(0);
    expect(validateRenderPlan({ ...rp, canvas: { width: 0, height: 0, fps: 0 } }).length).toBeGreaterThan(0);
  });

  it("非法输入解析时抛错并列出全部问题", () => {
    const bad = { ...toRenderPlan(result, { srt: SRT }), version: 2, scenes: [] };
    expect(() => parseRenderPlan(bad)).toThrow(/version|scenes/);
  });
});
