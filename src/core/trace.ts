// 数字溯源：从旁白文本中提取数字。画面里出现的每个数字都必须来自这里（或导演覆写并标注出处）。
// 诚实约束的第一层：不编造。

export interface NumToken {
  raw: string; // 原文中的字面量，如 "85%"、"3.2"、"120毫秒"
  value: number;
  unit?: string; // %, 毫秒, 倍, 元 ...
}

// 百分数 / 带单位数字 / 普通数字，按优先级
const PATTERNS: RegExp[] = [
  /(\d+(?:\.\d+)?)\s*%/g,
  /(\d+(?:\.\d+)?)(毫秒|秒|分钟|倍|元|块|度|克|℃)/g,
  /(\d+(?:\.\d+)?)/g,
];

export function extractNumbers(text: string): NumToken[] {
  const seen = new Set<string>();
  const out: NumToken[] = [];
  for (const pat of PATTERNS) {
    pat.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = pat.exec(text))) {
      if (seen.has(m[0])) continue;
      seen.add(m[0]);
      out.push({ raw: m[0].trim(), value: Number(m[1]), unit: m[2] });
    }
    if (out.length > 0) break; // 命中更高优先级层后不再下沉
  }
  return out;
}

// 门禁：画面数字必须可溯源到拍文本（或覆写时标注的原文）
export function isTraceable(token: string, beatText: string, overrideSource?: string): boolean {
  if (beatText.includes(token)) return true;
  if (overrideSource && overrideSource.includes(token)) return true;
  return false;
}
