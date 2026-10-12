// 版式选择：为一拍挑一个版式。规则可解释、确定性、不重复上一拍。
// v3 新增两级：先决定风格（覆写优先），再在风格内挑版式。

import { LAYOUTS } from "./catalog";
import type { Group, Layout, RenderContent, Style } from "./types";
import { displayWidth } from "../core/compose";

/** 资格门禁：图表版式必须有足够多可溯源数字；否则该版式对本拍不合格。 */
export function eligible(layout: Layout, content: RenderContent): boolean {
  if (layout.needs !== undefined && content.numbers.length < layout.needs) return false;
  for (const slot of layout.slots) {
    if (slot.k !== "chart") continue;
    const need = slot.needs ?? layout.needs ?? 3;
    if (content.numbers.length < need) return false;
  }
  return true;
}

export interface StyleDecision {
  style: Style;
  /** 人类可读的判定理由（进调试面板） */
  reason: string;
  /** 海报风倾向分（越高越像动态海报） */
  score: number;
}

/** 金句/情绪信号：这类句子适合超大字号定住一拍。 */
const QUOTE_RE = /其实|终于|原来|才知道|记住|没有人|第一次|最后一次|一句话|说到底|不是.{0,6}而是|刚好相反/;
/** 设问信号。 */
const ASK_RE = /[?？]$|怎么|为什么|如何|什么是|有没有/;

/**
 * 海报风倾向打分（确定性，同输入必同输出）。
 *
 * 注意：这里**不能**用「长句」「要点多」这类恒定惩罚——旁白的 headline 天然是整句，
 * bullets 又是按标点切出来的，两者对每一拍都成立，恒定惩罚会让阈值永远达不到。
 * 所以只保留真正有区分度的信号，并且把「是不是真清单」按结构判断。
 */
export function styleScore(content: RenderContent, beatIndex: number, totalBeats: number): { score: number; notes: string[] } {
  let score = 0;
  const notes: string[] = [];

  // 字号潜力：按**最长一行**算，不按整段——headline 天然是多行，按整段算会恒定「长句」。
  const lines = content.headline.split(/\n+/).map((s) => s.trim()).filter(Boolean);
  const maxLen = lines.reduce((m, l) => Math.max(m, displayWidth(l)), 0);
  if (maxLen > 0 && maxLen <= 10) { score += 2.2; notes.push("极短句"); }
  else if (maxLen <= 16) { score += 1.4; notes.push("短句"); }
  else if (maxLen <= 24) { score += 0.4; notes.push("中句"); }
  else { score -= 0.9; notes.push("长句"); }

  // 数据取向：有数字的拍更适合图表/数字焦点版式（编辑风的主场）
  if (content.numbers.length === 0) { score += 0.6; notes.push("无数据"); }
  if (content.numbers.length >= 2) { score -= 0.9; notes.push("数字密集"); }

  // 真正的清单式旁白（并列短名词堆叠）才降权——不是「有 bullets」就算
  const listy = content.bullets.length >= 4 && content.bullets.every((b) => displayWidth(b) <= 8);
  if (listy) { score -= 0.8; notes.push("清单式"); }

  if (ASK_RE.test(content.headline)) { score += 0.9; notes.push("设问"); }
  if (QUOTE_RE.test(content.headline)) { score += 0.7; notes.push("金句"); }
  if (beatIndex === 0) { score += 1.0; notes.push("开场"); }
  if (totalBeats > 2 && beatIndex === totalBeats - 1) { score += 1.0; notes.push("定版"); }

  return { score: +score.toFixed(2), notes };
}

/** 单拍判定（阈值法，供测试与逐拍推导使用）。 */
export function decideStyle(
  content: RenderContent,
  beatIndex: number,
  totalBeats: number,
  override?: Style,
): StyleDecision {
  if (override) return { style: override, reason: "导演覆写", score: 0 };
  const { score, notes } = styleScore(content, beatIndex, totalBeats);
  return { style: score >= POSTER_MIN ? "poster" : "editorial", reason: notes.join("／") || "常规", score };
}

/** 自动升级为海报风的最低倾向分。低于它说明这一拍更适合编辑风，不硬凑。 */
export const POSTER_MIN = 1.2;

/** 海报风拍的配额：约每 6 拍一次（海报是重音，不是底色）。 */
function posterQuota(n: number): number {
  return Math.max(1, Math.min(4, Math.round(n * 0.16)));
}

/**
 * 全片风格规划：逐拍打分 → 锁定开场/定版锚点 → 按配额与「不相邻」补选。
 * 覆写优先；自动兜底只在分数真的够高时才升级（不够就诚实留编辑风，不硬凑）。
 */
export function planStyles(
  contents: RenderContent[],
  overrides: (Style | undefined)[] = [],
): StyleDecision[] {
  const n = contents.length;
  const scored = contents.map((c, i) => {
    const ovr = overrides[i];
    if (ovr) return { style: ovr, reason: "导演覆写", score: 0 } as StyleDecision;
    const { score, notes } = styleScore(c, i, n);
    return { style: "editorial" as Style, reason: notes.join("／") || "常规", score };
  });

  const poster = new Set<number>();
  scored.forEach((d, i) => { if (d.style === "poster") poster.add(i); }); // 覆写锁定

  // 锚点：开场与定版是结构位，分数够就锁定为海报风（冷开场 + 尾版）
  const anchors = n > 2 ? [0, n - 1] : [0];
  for (const i of anchors) {
    if (!overrides[i] && scored[i]!.score >= POSTER_MIN) poster.add(i);
  }

  const adjacent = (i: number) => poster.has(i - 1) || poster.has(i + 1);
  const candidates = scored
    .map((d, i) => ({ i, score: d.score }))
    .filter(({ i, score }) => !poster.has(i) && score >= POSTER_MIN)
    .sort((a, b) => b.score - a.score || a.i - b.i);

  const quota = Math.max(posterQuota(n), poster.size);
  for (const { i } of candidates) {
    if (poster.size >= quota) break;
    if (adjacent(i)) continue;
    poster.add(i);
  }

  scored.forEach((d, i) => {
    if (overrides[i]) return;
    if (poster.has(i)) d.style = "poster";
    else if (d.reason === "常规") d.reason = "常规（编辑风兜底）";
  });
  return scored;
}

/** 内容信号 → 优先版式组（按序尝试）。 */
function preferredGroups(content: RenderContent, style: Style): Group[] {
  const text = content.headline;
  const out: Group[] = [];
  if (style === "poster") {
    if (content.numbers.length >= 1) out.push("poster-geo", "poster-focus");
    if (/[?？]$|怎么|为什么|如何/.test(text)) out.push("poster-field");
    out.push("poster-focus", "poster-nest", "poster-field", "poster-geo");
    return out;
  }
  if (/[?？]$|怎么|为什么|如何/.test(text)) out.push("quote", "statement");
  if (/因为|所以|于是|导致|结果/.test(text)) out.push("process");
  if (/不是|而是|相比|比起|反之|却/.test(text)) out.push("compare");
  if (content.numbers.length >= 3) out.push("chart");
  else if (content.numbers.length >= 1) out.push("number");
  if (content.bullets.length >= 3) out.push("list");
  out.push("statement", "timeline", "image", "bookend");
  return out;
}

/** 确定性挑选：在指定风格内、按拍序轮转优先组，组内避开上一拍用过的版式。 */
export function pickLayout(content: RenderContent, style: Style, prevId?: string): Layout {
  const ofStyle = LAYOUTS.filter((l) => (l.style ?? "editorial") === style);
  const pool0 = ofStyle.length > 0 ? ofStyle : LAYOUTS;
  const usable = pool0.filter((l) => eligible(l, content));
  const base = usable.length > 0 ? usable : pool0;
  const groups = preferredGroups(content, style).filter((g) => base.some((l) => l.group === g));
  if (groups.length === 0) return base[0] ?? LAYOUTS[0]!;
  const group = groups[(content.beat - 1) % groups.length]!;
  const pool = base.filter((l) => l.group === group && l.id !== prevId);
  const fallback = base.filter((l) => l.group === group);
  const finalPool = pool.length > 0 ? pool : fallback;
  return finalPool[(content.beat - 1) % finalPool.length]!;
}
