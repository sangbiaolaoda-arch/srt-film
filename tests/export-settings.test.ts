// Phase 8 导出档位测试：H.264 level 按分辨率派生 + 码率按像素缩放 + RenderPlan 记录一致性。
// 关键回归点：1080p 的 codec 串必须还是 avc1.420028（既有导出产物不变）；
// 720p/1440p 各落到 3.1/5.0 —— 报低了 1080p 会被编码器直接拒绝配置（不是降质）。

import { describe, it, expect } from "vitest";
import {
  DEFAULT_EXPORT,
  EXPORT_RESOLUTIONS,
  avcCodecFor,
  avcLevelFor,
  avcLevelLabel,
  defaultBitrate,
  resolveExport,
} from "../src/export/settings";
import { toRenderPlan } from "../src/core/render-plan";
import { plan } from "../src/core/plan";

const SRT = `1
00:00:00,000 --> 00:00:02,000
打开浏览器，输入网址。
`;

describe("H.264 level 按分辨率派生", () => {
  it("1080p = Level 4.0（8160 宏块/帧超 Level 3.1 的 3600 上限）", () => {
    expect(avcLevelFor(1920, 1080, 30)).toBe(40);
    expect(avcCodecFor(1920, 1080, 30)).toBe("avc1.420028");
  });

  it("720p = Level 3.1，1440p = Level 5.0", () => {
    expect(avcLevelFor(1280, 720, 30)).toBe(31);
    expect(avcLevelFor(2560, 1440, 30)).toBe(50);
  });

  it("同分辨率下帧率抬高档位（1080p60 需 4.2）", () => {
    expect(avcLevelFor(1920, 1080, 60)).toBe(42);
    expect(avcLevelFor(1920, 1080, 24)).toBe(40);
  });

  it("超 Level 5.1 上限抛错（面板档位不会触发，公开 API 会）", () => {
    expect(() => avcLevelFor(3840, 2160, 60)).toThrow(/Level 5.1/);
  });

  it("面板可读标签不是 level_idc 原值（40 → “4.0”，不能被读成「40 级」）", () => {
    expect(avcLevelLabel(1920, 1080, 30)).toBe("4.0");
    expect(avcLevelLabel(1280, 720, 30)).toBe("3.1");
    expect(avcLevelLabel(2560, 1440, 30)).toBe("5.0");
  });
});

describe("码率派生", () => {
  it("1080p 恰好落回 8Mbps（既有产物不变）", () => {
    expect(defaultBitrate(1920, 1080)).toBe(8_000_000);
  });

  it("1440p 抬到 14Mbps、720p 压到 4Mbps", () => {
    expect(defaultBitrate(2560, 1440)).toBe(14_000_000);
    expect(defaultBitrate(1280, 720)).toBe(4_000_000);
  });
});

describe("resolveExport 缺省补全", () => {
  it("全空 → 默认 1080p30/8Mbps", () => {
    expect(resolveExport({})).toEqual(DEFAULT_EXPORT);
  });

  it("给分辨率不给码率 → 码率按新分辨率派生（不是沿用 8Mbps）", () => {
    const cfg = resolveExport({ width: 2560, height: 1440, fps: 30 });
    expect(cfg.bitrate).toBe(14_000_000);
  });

  it("显式给的码率优先于派生", () => {
    expect(resolveExport({ width: 2560, height: 1440, bitrate: 20_000_000 }).bitrate).toBe(20_000_000);
  });

  it("面板三档分辨率都能编出合法 level", () => {
    for (const r of EXPORT_RESOLUTIONS) {
      expect(() => avcCodecFor(r.width, r.height, 30)).not.toThrow();
    }
  });
});

describe("RenderPlan 记录导出档位", () => {
  const result = plan(SRT, "");

  it("缺省导出档仍是 1080p30，导出块带码率", () => {
    const rp = toRenderPlan(result, { srt: SRT });
    expect(rp.canvas).toEqual({ width: 1920, height: 1080, fps: 30 });
    expect(rp.export.bitrate).toBe(8_000_000);
  });

  it("面板档位写进 canvas + export（工程 JSON 与实际 MP4 同参数）", () => {
    const rp = toRenderPlan(result, { srt: SRT, export: { width: 1280, height: 720, fps: 24 } });
    expect(rp.canvas).toEqual({ width: 1280, height: 720, fps: 24 });
    expect(rp.export.bitrate).toBe(4_000_000);
  });
});
