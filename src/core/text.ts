// 画面文案净化（项目规则 2026-10-14）：**上画面的一切文字不带标点符号**。
//
// 为什么在管线里做、而不是要求作者改 SRT：标点是「书写」的语言，不是「上画面」的语言 ——
// 画面靠断行、字号、留白表达停顿。但 SRT 是字幕格式，作者按字幕习惯写标点很正常；
// 强制作者手工去标点是把渲染层的约束推给人。所以标点在这里统一换成空格：
// 空格照样是断行点（见 layouts/*.tsx 的 wrap 与 render.tsx 的 wrapText），
// 但不会出现在画面上。
//
// 顺序很重要：**先按标点截断，再净化**。displayHeadline 靠标点找句读边界，
// 若先净化，截断就失效（整句当成一句，槽位会溢出）。渲染与门禁都走这个顺序。
//
// 范围：只处理来自 SRT 文案的字符串。系统生成的数值（bignum / delta 的 +% ）与
// 拍号角标（BEAT 01）不在此列 —— 它们是数据与元信息，不是文案。
//
// 数字里的分隔符不是标点（2026-10-16 修）：小数点、千分位属于**数值本身**。
// 早先把 `.` 和 `,` 一律换成空格，「0.06 美元」上画面变成「0 06 美元」——
// 数字被改了值，这是数据错误不是排版问题（03 语料拍4 实测）。

/** 半角标点与符号：0x21-0x2F / 0x3A-0x40 / 0x5B-0x60 / 0x7B-0x7E（数字与字母除外）。 */
const ASCII_PUNCT = /[!-/:-@[-`{-~]/g;
/** 拉丁补充 + 通用标点 + CJK 标点 + CJK 兼容符号 + 全角标点。 */
const CJK_PUNCT = /[\u00A1-\u00BF\u2000-\u206F\u3000-\u303F\uFE30-\uFE4F\uFF01-\uFF0F\uFF1A-\uFF20\uFF3B-\uFF40\uFF5B-\uFF65]/g;

/** 数字语境：小数点、千分位、以及它们两侧的空白（`0.06` / `1, 200`）。 */
const NUMERIC = /(\d)\s*[.,]\s*(?=\d)/g;

/** 数值后缀：紧跟数字的百分号。它是数值的单位（12.75% = 0.1275），不是标点。 */
const PCT = /(\d)\s*%/g;

// 占位符：私用区码位 U+E000 起。ASCII_PUNCT 覆盖 0x21-0x7E、CJK_PUNCT 覆盖
// 0xA1-0xFF65，两段都盖不住这里，所以放进去不会被净化误删，也不会撞上真实标点。
const MARK = "\uE000";
const HOLE = /\uE000(\d+)\uE000/g;

/** 检测用（测试与门禁）：是否含标点。空白先剥掉 —— 全角空格 U+3000 是空白不是标点。 */
export const HAS_PUNCT = new RegExp(`[${ASCII_PUNCT.source.slice(1, -1)}${CJK_PUNCT.source.slice(1, -1)}]`);

export function hasPunct(text: string): boolean {
  // 数字内的 . , % 不是标点 —— 与 stripPunct 同口径，否则门禁会把 0.06 判成含标点。
  // 用占位符而不是替换回 "." / "%"：HAS_PUNCT 里就含这两个字符，留着照样被判成标点。
  const shielded = text
    .replace(/\s+/g, "")
    .replace(NUMERIC, (_m, d: string) => `${d}${MARK}`)
    .replace(PCT, (_m, d: string) => `${d}${MARK}`);
  return HAS_PUNCT.test(shielded);
}

/** 标点 → 空格；压连续空格；去首尾。**数字内的小数点/千分位原样保留。**
 *
 *  实现：先把 `0.06` 里的分隔符（含它周围的空白 —— 旁白常写「0. 06」）换成私用区
 *  占位，净化完再还原。直接改 ASCII_PUNCT 会连带误伤句末句号、顿号 —— 那些必须
 *  去掉，否则画面上就是一片标点。占位落在 U+E000 起的私用区：ASCII_PUNCT 覆盖
 *  0x21-0x7E、CJK_PUNCT 覆盖 0xA1-0xFF65，两段都盖不住那里。 */
export function stripPunct(text: string): string {
  const holes: string[] = [];
  const shielded = text
    .replace(NUMERIC, (m, d: string) => {
      // 记下原分隔符（. 还是 ,），不能一律还原成 "."
      const sep = /\s*[.,]\s*/.exec(m)?.[0] ?? ".";
      holes.push(sep.trim());
      return `${d}${MARK}${holes.length - 1}${MARK}`;
    })
    .replace(PCT, (_m, d: string) => `${d}${MARK}${holes.push("%") - 1}${MARK}`);
  const cleaned = shielded
    .replace(ASCII_PUNCT, " ")
    .replace(CJK_PUNCT, " ")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.replace(HOLE, (_m, i: string) => holes[Number(i)] ?? "");
}

// —— 文字测量原语（2026-10-15 从 layouts/render.tsx 下沉）——
// render.tsx 的槽位渲染与 layouts/constraints.ts 的装载量估算必须用同一把尺子，
// 否则「门禁说放得下、渲染器放不下」会悄悄漂移。这里是唯一事实来源。

/** 字号阶梯（px）。与 render.tsx SlotNode 的 size 码同表。 */
export const FONT_SIZE = { xs: 14, s: 18, m: 24, l: 34, xl: 48, xxl: 72, huge: 104, mega: 168 } as const;

/** 英文/数字按 0.55 字宽计，其余按 1 字宽计 —— 决定一行能放多少字。 */
export function charWidth(ch: string): number {
  return ch.codePointAt(0)! > 0xff ? 1 : 0.55;
}

/** 按 maxWidth 贪心换行；末行孤字（≤2 字符）时均匀重排一次，重排失败退回贪心。 */
export function wrapText(text: string, sizePx: number, maxWidth: number): string[] {
  const maxUnits = maxWidth / sizePx;
  const chars = Array.from(text);
  const widths = chars.map(charWidth);

  // 贪心：能塞就塞，得到最少行数
  const greedy: string[] = [];
  let line = "";
  let used = 0;
  for (let i = 0; i < chars.length; i++) {
    const w = widths[i]!;
    if (used + w > maxUnits && line) {
      greedy.push(line);
      line = chars[i]!;
      used = w;
    } else {
      line += chars[i]!;
      used += w;
    }
  }
  if (line) greedy.push(line);

  // 中文标题的孤字行很难看：15 个字会被贪心切成 14+1，最后一行只剩一个「恶」。
  // 只在这种情况（不止一行、且最后一行 ≤ 2 个字符）重排一次 —— 把字符尽量均匀摊到
  // 同样多的行数里；摊完只要有任何一行放不下，就退回贪心结果，绝不比原来更差。
  const lastLen = Array.from(greedy[greedy.length - 1] ?? "").length;
  if (greedy.length < 2 || lastLen > 2) return greedy;

  const n = greedy.length;
  const balanced: string[] = [];
  let at = 0;
  for (let ln = 0; ln < n; ln++) {
    const charsLeft = chars.length - at;
    const rowsLeft = n - ln;
    const want = Math.max(1, Math.round(charsLeft / rowsLeft));
    let u = 0;
    let k = 0;
    while (k < want && at + k < chars.length && u + widths[at + k]! <= maxUnits + 1e-9) {
      u += widths[at + k]!;
      k++;
    }
    if (k === 0) return greedy; // 一个都放不下：退回贪心
    balanced.push(chars.slice(at, at + k).join(""));
    at += k;
  }
  if (at < chars.length) return greedy; // 没摊完：退回贪心
  return balanced;
}
