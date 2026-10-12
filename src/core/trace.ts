// 数字溯源：从旁白文本中提取数字。画面里出现的每个数字都必须来自这里（或导演覆写并标注出处）。
// 诚实约束的第一层：不编造。

export interface NumToken {
  raw: string; // 原文中的字面量，如 "85%"、"3.2"、"120毫秒"
  value: number;
  unit?: string; // %, 毫秒, 倍, 元 ...
}

// 有量纲的数字分两层：百分数 → 带单位数字。
// 两层都要扫全 —— 只取一层会让「增长85%，耗时120毫秒」丢掉后半句（下游拿它算数据密度，
// 漏数字会让本该选图表版式的拍被误判成「无数据」）。
// 百分数层先跑，所以 nums[0] 天然是冲击力最强的那个，主视觉取它。
const PATTERNS: RegExp[] = [
  /(\d+(?:\.\d+)?)\s*%/g,
  /(\d+(?:\.\d+)?)(毫秒|秒|分钟|倍|元|块|度|克|℃)/g,
];
// 兜底层：两层都空时才用，避免把「2024年」「第3步」里的数字当成数据
const BARE = /(\d+(?:\.\d+)?)/g;

function scan(text: string, pat: RegExp, seen: Set<string>, out: NumToken[]): void {
  pat.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = pat.exec(text))) {
    if (seen.has(m[0])) continue;
    seen.add(m[0]);
    out.push({ raw: m[0].trim(), value: Number(m[1]), unit: m[2] });
  }
}

export function extractNumbers(text: string): NumToken[] {
  const seen = new Set<string>();
  const out: NumToken[] = [];
  for (const pat of PATTERNS) scan(text, pat, seen, out);
  if (out.length === 0) scan(text, BARE, seen, out);
  return out;
}

// 门禁：画面数字必须可溯源到拍文本（或覆写时标注的原文）
export function isTraceable(token: string, beatText: string, overrideSource?: string): boolean {
  if (beatText.includes(token)) return true;
  if (overrideSource && overrideSource.includes(token)) return true;
  return false;
}
