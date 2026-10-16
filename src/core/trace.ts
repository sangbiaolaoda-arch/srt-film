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
//
// 中国数量级层（MAG）为什么要单独一条、还必须排在 PLAIN_UNITS 之前：
// 「30 万公里」「88 万倍」「312 万吨」是中文数据 narration 最常见的写法，
// 而「万」同时是**数量级**（×10000）和**单位前缀**（万元）。旧表把「万元」当单位、
// 没有万/亿层：`88 万倍` 匹配不到单位 → BARE 兜底只捞到 88，而「万倍」被 CN_QTY
// 当成中文数字独吞（raw="万倍" value=10000），88 这个量整个消失；
// `30 万公里` 同理只剩 30。后果是这类拍 measureCount 恒 < 2，
// **图表版式（bars / axis-columns 门槛就是 2 个度量值）永远选不上** ——
// 观众看不到任何图表，根因在这里。所以：先按「数字 + 万/亿 + 单位」整段吃下，
// value 乘上数量级，raw 保留原文全串（isTraceable 要求 raw 是拍文本的子串）。
//
// 单位表按**长名优先**排（公里每小时 必须在 公里 前、平方公里 在 米 前），
// 否则正则的交替会短先命中、把「公里每小时」截成「公里」。
const MAG_UNITS =
  "毫秒|秒钟|分钟|个小时|小时|公里每小时|米每秒|平方公里|立方米|厘米|毫米|千米|公里|万元|美元|港元|人民币|毫安|安培|伏特|赫兹|帕斯卡|焦耳|卡路里|摄氏度|℃|千瓦|千瓦时|万吨|吨|升|毫升|美元|元|块|度|克|千克|米|人|次|届|轮|成|折|倍|%";
const MAG = new RegExp(`(\\d+(?:\\.\\d+)?)\\s*(万|亿)?\\s*(${MAG_UNITS})`, "g");
// 纯单位层（无数量级）：与 MAG 同表，但 MAG 已先扫过一遍，这里只兜
// 「没有数量级」的普通写法（「340 米」「120 毫秒」）。两层的单位表共享同一份常量。
const PLAIN_UNITS =
  "毫秒|秒钟|分钟|个小时|小时|公里每小时|米每秒|平方公里|立方米|厘米|毫米|千米|公里|万元|美元|港元|人民币|毫安|安培|伏特|赫兹|帕斯卡|焦耳|卡路里|摄氏度|℃|千瓦|千瓦时|万吨|吨|升|毫升|元|块|度|克|千克|米|人|次|届|轮|成|折|倍";
const PATTERNS: RegExp[] = [
  /(\d+(?:\.\d+)?)\s*%/g,
  // 数量级层必须在前：见 MAG 注释里的量纲崩坏说明。
  MAG,
  // \s*：旁白排版会在数字与单位间插空格（「每度大约 0.09 美元」），不放行就漏抽
  new RegExp(`(\\d+(?:\\.\\d+)?)\\s*(${PLAIN_UNITS})`, "g"),
];
/** PATTERNS 里哪些条目带「万/亿」第三分组（用于 scan 决定 value 怎么算）。 */
const MAG_PATTERNS = new Set<RegExp>([MAG]);
// 兜底层：两层都空时才用，避免把「2024年」「第3步」里的数字当成数据。
// 否定后视挡标识符上下文：「TLS 1.3」「iOS 17」「HTML5」是版本/型号，不是度量值
// （01 语料拍 08 实测：版本号 1.3 进图表，坐标柱画出 1.3 vs 1 的量纲崩坏）。
// 两道闸：① 「ASCII 字母 + 至多两个空格」前缀（TLS 1.3 / iOS 17）；
//         ② 数字或小数点前缀（同一个数的内部断点：1.3 的 3、17 的 7 从断点漏过）。
// 第三道闸（本轮加）：年份是**历法坐标**，不是度量值。
// 「1915 年 5 月」里的 1915 落到 BARE 兜底被判成 measure，于是该拍被路由到
// 坐标柱版式，把年份画成柱高 —— 历史叙述语料拍1 实测，纯叙事开场用了
// v2-axis-columns，语义与版式不匹配（错误隐喻）。
// 判据是「四位数 + 年」，只挡 1000–2999（人类有记载的年份全在这个区间内，
// 不误伤「3000 吨」这类真度量）。中文「1915年」「1923 年底」都覆盖。
const BARE = /(?<![A-Za-z]\s{0,2}|[\d.])(?!\d{3,}\s*年)(\d+(?:\.\d+)?)/g;

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
// 否定后视排除序列指代前缀：「下一步 / 这一步 / 每一步 / 同一层」里的「一步」
// 不是测量值（01 语料拍 03「第一步…这一步叫 DNS 查询」实测：不排除时
// 「这一步」漏进度量层，图表风把该拍选成数字巨号板，bignum 渲染成「第一步」）。
// CN_ORD 只认「第X步」，覆盖不到下/上/这/同/每 开头的指代 —— 在后视层统一挡。
const CN_QTY = new RegExp(`(?<![第下上这同每另])([${CN_DIGITS}]+)(岁|步|楼|层|块|元|倍|个字)`, "g");

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

/** 中国数量级 → 乘数。「88 万倍」的 88 必须乘 10000 才是旁白说的那个量。 */
const MAGNITUDE: Record<string, number> = { 万: 1e4, 亿: 1e8 };

function scan(text: string, pat: RegExp, kind: NumToken["kind"], seen: Set<string>, out: NumToken[], spans: Array<[number, number]>): void {
  pat.lastIndex = 0;
  let m: RegExpExecArray | null;
  // MAG 层是三分组（数字 / 数量级 / 单位），PLAIN 与 BARE 是二分组（数字 / 单位）。
  const hasMag = MAG_PATTERNS.has(pat);
  while ((m = pat.exec(text))) {
    if (seen.has(m[0])) continue;
    const s = m.index;
    const e = s + m[0].length;
    if (overlaps(spans, s, e)) continue;
    seen.add(m[0]);
    spans.push([s, e]);
    const mag = hasMag ? (MAGNITUDE[m[2] ?? ""] ?? 1) : 1;
    const unit = hasMag ? m[3] : m[2];
    out.push({ raw: m[0].trim(), value: Number(m[1]) * mag, unit, kind });
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
