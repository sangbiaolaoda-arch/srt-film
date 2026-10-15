// SRT 校验层：在 parseSRT（只负责解析）之上，做产品级输入卫生检查。
// 区分「硬错误」（阻塞规划）与「软警告」（可继续，但提示用户）。
// parseSRT 仍保持「解析不了就抛」的诚实契约（plan() 与 e2e 工具依赖它），
// 本模块只在外面加重叠 / 乱序 / 极端时长 / 超长文本等检查，不改动解析本身。

import { parseSRT, type Cue } from "./srt";

export interface SrtValidation {
  /** 没有硬错误，可以进入规划 */
  ok: boolean;
  cues: Cue[];
  /** 硬错误：阻塞规划 */
  errors: string[];
  /** 软警告：不阻塞，但应提示用户 */
  warnings: string[];
}

/** 阈值（秒 / 字符） */
const SHORT_CUE_SEC = 0.3; // 极短字幕一闪而过
const LONG_TEXT_CHARS = 80; // 单条字幕过长建议拆分
const MAX_CUE_SEC = 120; // 单条字幕时长异常

/** BOM 感知解码：文件上传时字节流先走这里，再交给 parseSRT。 */
export function decodeSrtBytes(bytes: Uint8Array): string {
  // UTF-8 BOM (EF BB BF)
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return new TextDecoder("utf-8").decode(bytes.subarray(3));
  }
  // UTF-16 LE BOM (FF FE)
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return new TextDecoder("utf-16le").decode(bytes);
  }
  // UTF-16 BE BOM (FE FF)
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return new TextDecoder("utf-16be").decode(bytes);
  }
  // 默认按 UTF-8 解析；出现替换符说明多半不是 UTF-8/16，给出明确错误
  const text = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  if (text.includes("�")) {
    throw new Error("不支持的编码：请将 .srt 保存为 UTF-8 或 UTF-16 后重试");
  }
  return text;
}

/** 对 SRT 文本做完整校验，返回结构化结果。 */
export function validateSRT(source: string): SrtValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  let cues: Cue[] = [];

  try {
    cues = parseSRT(source);
  } catch (e) {
    return { ok: false, cues: [], errors: [(e as Error).message], warnings };
  }

  for (let i = 0; i < cues.length; i++) {
    const c = cues[i]!;
    const dur = c.end - c.start;

    if (dur > MAX_CUE_SEC) {
      errors.push(`第 ${i + 1} 条字幕时长异常（${dur.toFixed(1)} 秒），单条字幕不应这么长`);
    }
    if (dur < SHORT_CUE_SEC) {
      warnings.push(`第 ${i + 1} 条字幕极短（${Math.round(dur * 1000)}ms），可能一闪而过`);
    }
    if (c.text.length > LONG_TEXT_CHARS) {
      warnings.push(`第 ${i + 1} 条字幕过长（${c.text.length} 字），建议拆成多条`);
    }
    if (i > 0) {
      const prev = cues[i - 1]!;
      if (c.start < prev.start) {
        errors.push(`字幕乱序：第 ${i + 1} 条开始时间（${c.start.toFixed(2)}s）早于上一条（${prev.start.toFixed(2)}s）`);
      } else if (c.start < prev.end) {
        errors.push(`字幕重叠：第 ${i + 1} 条（${c.start.toFixed(2)}s）与第 ${i} 条（${prev.start.toFixed(2)}–${prev.end.toFixed(2)}s）时间重叠`);
      }
    }
  }

  return { ok: errors.length === 0, cues, errors, warnings };
}
