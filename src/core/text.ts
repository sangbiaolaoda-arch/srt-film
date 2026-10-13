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
