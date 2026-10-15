import { describe, it, expect } from "vitest";
import { validateSRT, decodeSrtBytes } from "../src/core/srt-validate";

const OK = `1
00:00:00,000 --> 00:00:02,000
第一句话。

2
00:00:02,000 --> 00:00:04,500
第二句话，带点内容。

3
00:00:04,500 --> 00:00:06,000
第三句话。
`;

describe("validateSRT", () => {
  it("合法 SRT：无错误、无警告", () => {
    const v = validateSRT(OK);
    expect(v.ok).toBe(true);
    expect(v.errors).toHaveLength(0);
    expect(v.warnings).toHaveLength(0);
    expect(v.cues).toHaveLength(3);
  });

  it("空内容：硬错误并阻塞", () => {
    const v = validateSRT("   ");
    expect(v.ok).toBe(false);
    expect(v.errors.some((e) => e.includes("为空"))).toBe(true);
  });

  it("坏时间戳带行号：硬错误", () => {
    const v = validateSRT("1\nbad line\n文本");
    expect(v.ok).toBe(false);
    expect(v.errors.some((e) => e.includes("第 2 行"))).toBe(true);
  });

  it("重叠字幕：硬错误", () => {
    const v = validateSRT(`1
00:00:00,000 --> 00:00:03,000
A。

2
00:00:02,000 --> 00:00:05,000
B 与 A 重叠。
`);
    expect(v.ok).toBe(false);
    expect(v.errors.some((e) => e.includes("重叠"))).toBe(true);
  });

  it("乱序字幕：硬错误", () => {
    const v = validateSRT(`1
00:00:05,000 --> 00:00:07,000
先出现。

2
00:00:01,000 --> 00:00:03,000
却更早。
`);
    expect(v.ok).toBe(false);
    expect(v.errors.some((e) => e.includes("乱序"))).toBe(true);
  });

  it("极短字幕：仅警告，不阻塞", () => {
    const v = validateSRT(`1
00:00:00,000 --> 00:00:00,150
一闪。
`);
    expect(v.ok).toBe(true);
    expect(v.warnings.some((w) => w.includes("极短"))).toBe(true);
  });

  it("超长字幕文本：仅警告，不阻塞", () => {
    const long = "字".repeat(100);
    const v = validateSRT(`1
00:00:00,000 --> 00:00:02,000
${long}
`);
    expect(v.ok).toBe(true);
    expect(v.warnings.some((w) => w.includes("过长"))).toBe(true);
  });
});

describe("decodeSrtBytes", () => {
  it("去掉 UTF-8 BOM", () => {
    const bytes = new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode("1\n00:00:00,000 --> 00:00:01,000\nHi\n")]);
    expect(decodeSrtBytes(bytes)).toContain("Hi");
  });

  it("解码 UTF-16 LE", () => {
    const bytes = new TextEncoder().encode("\uFFFE1\n");
    expect(decodeSrtBytes(bytes)).toContain("1");
  });

  it("非 UTF-8 字节流：抛不支持编码", () => {
    // 一段高位字节，TextDecoder(utf-8) 会产出替换符
    const bytes = new Uint8Array([0x80, 0x81, 0x82, 0x83]);
    expect(() => decodeSrtBytes(bytes)).toThrow("不支持");
  });
});
