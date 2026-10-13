// 语义映射：词 → 语义角色 → 视觉参数（颜色 / 字重 / 字号）。
//
// 此前 headline 是纯字符串、单一 fill、单一 fontWeight ——「危险」和「的」长得一模一样。
// 这一层补的是**行内富文本**：把旁白里的语义强词切成独立片段，渲染成 <tspan> 换色放大加粗。
//
// ── 依据（2026-10 联网核对，出处见 docs/语义色彩映射.md）────────────────
// 1. 语义色是全行业约定值，不是随手挑的：
//      danger  #dc2626 · warning #d97706 · success #16a34a · info #2563eb
//    （Material / Ant Design / Tailwind / Dell DS / Semiotic 的交集）
//    各家一致强调：语义 token 跨风格恒定，只有 primary/secondary 随品牌变 ——
//    所以「危险是红、安全是绿」可以照搬，不必重新发明。
// 2. 色彩心理学有跨文化基线（约半数色-情关联跨人种一致）：
//      红 = 血与火 → 危险 / 紧迫 / 强度
//      绿 = 植被     → 安全 / 生长 / 恢复（生理唤起最低）
//      黄 = 阳光     → 注意力 / 警示（高饱和易致视觉疲劳）
//      暗色          → 严肃 / 负向
//    另一半由文化编程 —— 红在中文语境是吉庆色，所以这里**不**用鲜红表危险，
//    而是压暗一档（#a5170a），把「红 = 危险」的西式惯例与中式的「红 = 吉」错开。
// 3. 饱和度与明度才是情绪强度的旋钮：高饱和 = 强情绪、低饱和 = 克制、
//    明度压暗 = 负向 / 严肃。同一色相靠明度就能分出正向与负向。
// 4. 可访问性：语义色必须与底色保持对比；且**不能只靠颜色**传达信息 ——
//    所以强调同时放大 1.14 倍、加粗到 800，色盲用户靠字号与字重也能读出色别。
//
// ── 本片的核心设计：danger 与 warm 同为红系 ────────────────────────────
// 稿子的中心论点就是「痛苦和幸福其实是同一个源头」。把「疼 / 代价」与「在乎 / 心动」
// 放进同一色系、只靠明度拉开（暗红 vs 亮朱红），画面本身就复述了这句话。

import type { Style } from "./types";

/** 语义角色。cost 在国内产品语境里比 warning 更贴（价格 / 代价 / 保费）。 */
export type SemTone = "danger" | "cost" | "safe" | "warm";

export interface SemRoleDef {
  tone: SemTone;
  /** 这个角色在画面里代表什么 */
  means: string;
  /** 业界语义色锚点（设计系统交集值） */
  anchor: string;
  /** 心理学依据，一句话 */
  why: string;
  /** 编辑风取值：低饱和老派印刷色，适配纸白 */
  editorial: string;
  /** 海报风取值：电光高饱和，适配暗底 */
  poster: string;
  /** 触发词白名单（只收旁白真实用词，不引入稿子没说过的话） */
  terms: string[];
}

export const SEM_ROLES: SemRoleDef[] = [
  {
    tone: "danger",
    means: "威胁、疼痛、已经发生的失去",
    anchor: "#dc2626",
    why: "红 = 血与火，跨文化最强的「停下 / 注意」信号；明度压暗一档，表达「已经发生的负向」而不是紧急警报",
    editorial: "#a5170a",
    poster: "#ff4d2e",
    terms: ["痛苦", "危险", "伤害", "失恋", "亏损", "可怕", "风险", "疼", "痛", "损失", "失去", "孤独", "失败"],
  },
  {
    tone: "cost",
    means: "需要支付的代价（中性偏负：不是威胁，是账单）",
    anchor: "#d97706",
    why: "琥珀 = 警示而非灾祸，暖而不刺，保留「交易 / 代价」的意味，不与危险的红抢",
    editorial: "#9a6b1c",
    poster: "#ffd166",
    terms: ["价格", "代价", "付出", "保费", "成本", "止损"],
  },
  {
    tone: "safe",
    means: "边界、保障、不被伤害的状态",
    anchor: "#16a34a",
    why: "绿 = 植被与安全，生理唤起最低；用来标注「不让它发生」的底线，与 danger 构成对冲",
    editorial: "#1a6b52",
    poster: "#38e8c6",
    terms: ["底线", "安全", "通透", "不怕", "保险", "止损线"],
  },
  {
    tone: "warm",
    means: "正向情感投入本身",
    anchor: "—（品牌色，无业界锚点）",
    why: "品牌朱红承载全片主轴「在乎」；与 danger 同色系但更亮更饱和 —— 明度差即语义差，画面自我复述「同源」",
    editorial: "#c8401f",
    poster: "#ff9ecd",
    terms: ["在乎", "心动", "幸福", "爱", "喜欢", "珍重"],
  },
];

interface Rule {
  t: string;
  tone: SemTone;
}

/** 词表（从角色定义派生）：长词在前，匹配时先命中「痛苦」再轮到「疼」。 */
export const SEM_RULES: Rule[] = SEM_ROLES.flatMap((r) => r.terms.map((t) => ({ t, tone: r.tone })));

/** 语义色板：从角色定义派生，避免两处各写一份色值。 */
export const SEM_COLORS: Record<Style, Record<SemTone, string>> = {
  editorial: Object.fromEntries(SEM_ROLES.map((r) => [r.tone, r.editorial])) as Record<SemTone, string>,
  poster: Object.fromEntries(SEM_ROLES.map((r) => [r.tone, r.poster])) as Record<SemTone, string>,
};

/** 强调片段的放大倍数（换行也按它算宽，避免放大后溢出槽位）。 */
export const SEM_SCALE = 1.14;
export const SEM_WEIGHT = 800;

export interface Seg {
  text: string;
  tone?: SemTone;
}

/** 扫描文本，按最长优先切出带语义标记的片段。 */
export function emphasize(text: string): Seg[] {
  const sorted = [...SEM_RULES].sort((a, b) => b.t.length - a.t.length);
  const segs: Seg[] = [];
  let buf = "";
  let i = 0;
  while (i < text.length) {
    const hit = sorted.find((r) => text.startsWith(r.t, i));
    if (hit) {
      if (buf) {
        segs.push({ text: buf });
        buf = "";
      }
      segs.push({ text: hit.t, tone: hit.tone });
      i += hit.t.length;
    } else {
      buf += text[i]!;
      i += 1;
    }
  }
  if (buf) segs.push({ text: buf });
  return segs;
}
