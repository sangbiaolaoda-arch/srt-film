// 数字溯源：从旁白文本中提取数字。画面里出现的每个数字都必须来自这里（或导演覆写并标注出处）。
// 诚实约束的第一层：不编造。

export interface NumToken {
  raw: string; // 原文中的字面量，如 "85%"、"3.2"、"120毫秒"
  value: number;
  unit?: string; // %, 毫秒, 倍, 元 ...
  /** 数字的性质，决定它能进哪种画面：
   *  measure 度量值（85% / 0.09美元 / 120毫秒）—— 可进满版数据条做对比
   *  span 时段短语（十年 / 四十秒 / 半个小时）—— 只配做数字主角，
   *    跟百分比画同一张对比条是量纲崩坏（03 拍 5 实测：「85%」vs「十年」同条对比）
   *  ordinal 序数（第一次 / 第七次）—— 同上，只配数字主角 */
  kind: "measure" | "span" | "ordinal";
}

// 有量纲的数字分两层：百分数 → 带单位数字。
// 两层都要扫全 —— 只取一层会让「增长85%，耗时120毫秒」丢掉后半句（下游拿它算数据密度，
// 漏数字会让本该选图表版式的拍被误判成「无数据」）。
// 百分数层先跑，所以 nums[0] 天然是冲击力最强的那个，主视觉取它。
// 阿拉伯数字 + 单位 = 数据语料的写法，一律算度量值。
const PATTERNS: RegExp[] = [
  /(\d+(?:\.\d+)?)\s*%/g,
  // \s*：旁白排版会在数字与单位间插空格（「每度大约 0.09 美元」），不放行就漏抽
  /(\d+(?:\.\d+)?)\s*(毫秒|秒|分钟|倍|美元|万元|元|块|度|克|℃|千瓦|公里|米|人|次|届|轮|成|折)/g,
];
// 兜底层：两层都空时才用，避免把「2024年」「第3步」里的数字当成数据
const BARE = /(\d+(?:\.\d+)?)/g;

// 中文数字层：对白语料（如 02 号）的数字全是「六十七」「第七次」「四十秒」，
// 只认阿拉伯数字时整支语料零命中 —— 数字主角板式（num-giant）永远不出场。
// 序数层（第一次/第七次/第二天）先跑，unit 不收量词（「第」字已表达次序）。
const CN_DIGITS = "零一二两三四五六七八九十百千万半";
const CN_ORD = new RegExp(`第([${CN_DIGITS}]+)(次|遍|回|趟|天|年|个|步)`, "g");
// 时段层：中文数字 + 时间单位 = 时段短语（「十年」「四十秒」「半个小时」）——
// 是叙述里的时间感，不是数据点。跟阿拉伯的「120毫秒」区分：数据语料写阿拉伯带单位。
// 「次/遍/条/句」整个不收 ——「念一遍」「一条语音」是语气 filler 不是数据。
const CN_SPAN = new RegExp(`([${CN_DIGITS}]+)(世纪|年|个月|月|周|天|日|秒钟|秒|分钟|个小时|小时)`, "g");
// 量纲层只收真测量词（岁/步/楼/层/块/元/倍/个字）—— 中文写法的度量值。
const CN_QTY = new RegExp(`([${CN_DIGITS}]+)(岁|步|楼|层|块|元|倍|个字)`, "g");

/** 中文数字 → 数值（覆盖到万；「半」= 0.5）。 */
export function cn2num(s: string): number {
  if (s === "半") return 0.5;
  const digits: Record<string, number> = { 零: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
  const units: Record<string, number> = { 十: 10, 百: 100, 千: 1000, 万: 10000 };
  let total = 0;
  let section = 0;
  let number = 0;
  for (const ch of s) {
    if (ch in digits) number = digits[ch]!;
    else if (ch in units) {
      const u = units[ch]!;
      section += (number || 1) * u;
      number = 0;
      if (u >= 10000) { total += section; section = 0; }
    }
  }
  return total + section + number;
}

export function extractNumbers(text: string): NumToken[] {
  const seen = new Set<string>();
  const spans: Array<[number, number]> = [];
  const out: NumToken[] = [];
  for (const pat of PATTERNS) scan(text, pat, "measure", seen, out, spans);
  scanCn(text, CN_ORD, "ordinal", seen, out, spans);
  scanCn(text, CN_SPAN, "span", seen, out, spans);
  scanCn(text, CN_QTY, "measure", seen, out, spans);
  if (out.length === 0) scan(text, BARE, "measure", seen, out, spans);
  return out;
}

function overlaps(spans: Array<[number, number]>, s: number, e: number): boolean {
  return spans.some(([a, b]) => s < b && e > a);
}

function scan(text: string, pat: RegExp, kind: NumToken["kind"], seen: Set<string>, out: NumToken[], spans: Array<[number, number]>): void {
  pat.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = pat.exec(text))) {
    if (seen.has(m[0])) continue;
    const s = m.index;
    const e = s + m[0].length;
    if (overlaps(spans, s, e)) continue;
    seen.add(m[0]);
    spans.push([s, e]);
    out.push({ raw: m[0].trim(), value: Number(m[1]), unit: m[2], kind });
  }
}

/** 中文数字扫描：value 走 cn2num；ordinal 的 unit 不收（「第」字已表达次序）。 */
function scanCn(text: string, pat: RegExp, kind: NumToken["kind"], seen: Set<string>, out: NumToken[], spans: Array<[number, number]>): void {
  const withUnit = pat === CN_SPAN || pat === CN_QTY;
  pat.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = pat.exec(text))) {
    if (seen.has(m[0])) continue;
    const s = m.index;
    const e = s + m[0].length;
    if (overlaps(spans, s, e)) continue;
    seen.add(m[0]);
    spans.push([s, e]);
    out.push({ raw: m[0].trim(), value: cn2num(m[1]!), unit: withUnit ? m[2] : undefined, kind });
  }
}

// 门禁：画面数字必须可溯源到拍文本（或覆写时标注的原文）
export function isTraceable(token: string, beatText: string, overrideSource?: string): boolean {
  if (beatText.includes(token)) return true;
  if (overrideSource && overrideSource.includes(token)) return true;
  return false;
}
