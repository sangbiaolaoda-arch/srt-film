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

/** 半角标点与符号：0x21-0x2F / 0x3A-0x40 / 0x5B-0x60 / 0x7B-0x7E（数字与字母除外）。 */
const ASCII_PUNCT = /[!-/:-@[-`{-~]/g;
/** 拉丁补充 + 通用标点 + CJK 标点 + CJK 兼容符号 + 全角标点。 */
const CJK_PUNCT = /[\u00A1-\u00BF\u2000-\u206F\u3000-\u303F\uFE30-\uFE4F\uFF01-\uFF0F\uFF1A-\uFF20\uFF3B-\uFF40\uFF5B-\uFF65]/g;

/** 检测用（测试与门禁）：是否含标点。空白先剥掉 —— 全角空格 U+3000 是空白不是标点。 */
export const HAS_PUNCT = new RegExp(`[${ASCII_PUNCT.source.slice(1, -1)}${CJK_PUNCT.source.slice(1, -1)}]`);

export function hasPunct(text: string): boolean {
  return HAS_PUNCT.test(text.replace(/\s+/g, ""));
}

/** 标点 → 空格；压连续空格；去首尾。 */
export function stripPunct(text: string): string {
  return text.replace(ASCII_PUNCT, " ").replace(CJK_PUNCT, " ").replace(/\s+/g, " ").trim();
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
