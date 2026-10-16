// 构图规划器：为一拍选择版式（编辑风）。策略保持小集合，每个都有明确的视觉含义。
// 导演覆写是一等公民：覆写存在时，覆写优先于自动推断。

import type { Beat } from "./beats";
import { extractNumbers, isTraceable } from "./trace";
import { stripPunct } from "./text";

export type Layout =
  | "statement" // 大字陈述：整拍只有一句话
  | "number"    // 数字焦点：一个可溯源数字放大为主视觉
  | "contrast"; // 对照：两个短语左右并置

export interface BeatScene {
  beat: Beat;
  layout: Layout;
  headline: string; // 画面主文案（默认取拍文本，截断到安全长度）
  bigNumber?: { raw: string; unit?: string }; // layout=number 时
  left?: string;  // layout=contrast 时
  right?: string;
  // —— Phase 4 叙事层：每拍表达什么、为什么这样表达、禁止出现什么 ——
  /** 叙事角色（hook/definition/evidence/comparison/explanation/consequence/conclusion） */
  narrativeRole: NarrativeRole;
  /** 本拍要表达的客观事实/观点（取自旁白，不编造） */
  claim: string;
  /** 本拍不应出现的内容或表现（保守派生，绝不臆造） */
  forbidden: string[];
  /** 设计目的：这一拍在片子里承担什么叙事任务 */
  purpose: string;
  /** 与上一拍的承接关系（共享数字/概念） */
  continuityIn?: string[];
  /** 与下一拍的承接关系 */
  continuityOut?: string[];
}

/** 叙事角色：决定这一拍在片子里承担的任务。 */
export type NarrativeRole =
  | "hook" | "definition" | "evidence" | "comparison"
  | "explanation" | "consequence" | "conclusion";

const ROLE_PURPOSE: Record<NarrativeRole, string> = {
  hook: "开场抛问题或设悬念，吸引注意",
  definition: "给出关键概念的定义或所指",
  evidence: "用可溯源的数据/事实支撑论点",
  comparison: "并置两方做对照，凸显差异",
  explanation: "解释机制或因果关系",
  consequence: "点明结果、影响或推论",
  conclusion: "收束全片，给出结论",
};

const ROLE_FORBIDDEN: Record<NarrativeRole, string[]> = {
  hook: ["不得在开场画面编造旁白未给出的答案"],
  definition: ["不得将定义扩写成旁白未给出的例子"],
  evidence: ["不得把旁白之外的数字画上画面"],
  comparison: ["不得凭空捏造第三方的对照数据"],
  explanation: ["不得添加旁白没有的因果链"],
  consequence: ["不得夸大推论、不得臆造未给出的后果"],
  conclusion: ["结论必须可由前文推导，不得引入新事实"],
};

/** 确定性地把一拍分到叙事角色（不调用任何模型，纯规则）。 */
export function classifyRole(beat: Beat): NarrativeRole {
  const t = beat.text;
  if (beat.index === 1) return "hook";
  if (/[？?]/.test(t) && /(为什么|怎么|什么|如何|是否|哪)/.test(t)) return "hook";
  if (/(总之|综上|最后|归根结底|结论|一言以蔽之)/.test(t)) return "conclusion";
  if (/(是|指|即|称为|叫做|定义|所谓|就是)/.test(t)) return "definition";
  if (/(因此|所以|导致|结果|从而|意味着|使得|造成)/.test(t)) return "consequence";
  const nums = extractNumbers(t);
  if (nums.length > 0 && /(比|对比|versus|vs|倍|高于|低于|超过|相差|差距)/i.test(t)) return "comparison";
  if (nums.length > 0) return "evidence";
  return "explanation";
}

/** 叙事承接（角色链）：上一拍的任务直接孕育本拍的任务。
 *  表小且可解释：问→答、概念→数据、数据→推论/结论、机制→数据、结果→总结。
 *  同角色相邻不算承接（两拍各讲各的）—— 这不只是语义判断，也是**几何硬约束**：
 *  continuity.ts 的 ROLE_CORNER 是固定表（7 角色 4 角落），同角色必同角，
 *  ghost 与自标记重叠、连接线零长度，「继承」退化成「一个标记换形状」。
 *  因此本表里**不允许出现同角色边**；补表时每个新增对都必须跨角（测试守着）。
 *  纯角色表判定、不读文本 —— 确定性。
 *  导出供测试断言不变量：每个承接对在 continuity.ts 的角落表里都必须跨角。
 *
 * definition→consequence 是关键补边：03「便宜也不是没代价(定义)→靠天吃饭(推论)」、
 * 04「太热长不好(定义)→太冷会冻伤(推论)」都是「下定义/讲机制 → 推出结果」的
 * 自然论证链，原表没它，推论拍接不上前拍，连续性在论证段断链。解锁它需要把
 * definition 从 tr 改到 br（见 continuity.ts 的 ROLE_CORNER）。 */
export const HANDOFF: Record<NarrativeRole, NarrativeRole[]> = {
  hook: ["definition", "explanation"],
  // comparison 新增：定义完概念直接摆对比（数据类语料常见走法）
  // consequence 新增：下定义/讲机制 → 推出结果（自然论证链，原表缺失）
  definition: ["evidence", "comparison", "consequence"],
  evidence: ["consequence", "conclusion", "comparison"],
  // comparison→conclusion 跨不了角（comparison/conclusion 同占 tr），且语料未见直接边；
  // 对比到结论走 comparison→evidence→conclusion 即可，不强加同角边。
  comparison: ["consequence", "evidence", "definition"],
  // consequence 新增：机制讲完直接给结果
  explanation: ["evidence", "consequence"],
  consequence: ["conclusion"],
  conclusion: [],
};

/** 相邻拍的数字承接：按**值**匹配（原文可能带不同单位：「120 毫秒」↔「120」），
 *  标签取本拍原文。实测原文级匹配在真实语料几乎为 0（每片最多 1 对），值级才活的。
 *  只认度量值（measure）：序号（第三步）与跨度（十年）不参与 —— 它们和测量值
 *  同数值时会造出假承接（01 语料实测：拍 6「3 次」↔ 拍 7「第三步」值同级误判）。 */
function sharedNums(prevText: string, curText: string): string[] {
  const prevVals = new Set(extractNumbers(prevText).filter((n) => n.kind === "measure").map((n) => n.value));
  const raws = extractNumbers(curText)
    .filter((n) => n.kind === "measure" && prevVals.has(n.value))
    .map((n) => n.raw);
  return [...new Set(raws)];
}

/**
 * 在已分好版式的拍序列上补叙事承接关系（continuityIn/Out）。
 * 必须在全部拍就绪后统一跑，因为它要向前/后看邻居。
 * 承接 = 数字承接（同值）或角色承接（任务孕育）；两者可同时成立。
 */
export function enrichNarrative(scenes: BeatScene[]): BeatScene[] {
  return scenes.map((scene, i) => {
    const continuityIn: string[] = [];
    const continuityOut: string[] = [];
    const prev = scenes[i - 1];
    const next = scenes[i + 1];
    if (prev) {
      const shared = sharedNums(prev.beat.text, scene.beat.text);
      if (shared.length) continuityIn.push(`沿用上拍数字 ${shared.join("、")}`);
      if (HANDOFF[prev.narrativeRole]?.includes(scene.narrativeRole)) {
        continuityIn.push(`承接上拍${prev.narrativeRole}→${scene.narrativeRole}`);
      }
    }
    if (next) {
      const shared = sharedNums(scene.beat.text, next.beat.text);
      if (shared.length) continuityOut.push(`下拍沿用本拍数字 ${shared.join("、")}`);
    }
    return { ...scene, continuityIn, continuityOut };
  });
}

// 安全长度：编辑风大字下的显示宽度上限（全角=1，半角=0.5）
export const HEADLINE_MAX = 16;

export function displayWidth(text: string): number {
  let w = 0;
  for (const ch of text) w += ch.codePointAt(0)! > 0xff ? 1 : 0.5;
  return w;
}

// 画面 headline 截取：显示到第一个句读（句末或停顿标点）为止，去掉尾标点
const READS = "。！？!?…，、；：,;:\n";
export function displayHeadline(text: string): string {
  const t = text.trim();
  for (let i = 0; i < t.length; i++) {
    if (READS.includes(t[i]!)) return t.slice(0, i);
  }
  return t;
}

export function composeScenes(beats: Beat[]): BeatScene[] {
  return beats.map((beat) => composeScene(beat));
}

export function composeScene(beat: Beat): BeatScene {
  const role = classifyRole(beat);
  const nums = extractNumbers(beat.text);
  if (nums.length > 0) {
    const n = nums[0]!;
    return {
      beat,
      layout: "number",
      headline: beat.text,
      bigNumber: { raw: n.raw, unit: n.unit },
      narrativeRole: role,
      claim: beat.text,
      forbidden: ROLE_FORBIDDEN[role],
      purpose: ROLE_PURPOSE[role],
    };
  }
  return {
    beat,
    layout: "statement",
    headline: beat.text,
    narrativeRole: role,
    claim: beat.text,
    forbidden: ROLE_FORBIDDEN[role],
    purpose: ROLE_PURPOSE[role],
  };
}

/**
 * 门禁：场景数字必须可溯源；headline 超长给出警告。
 * `skipHeadlineWidth`：专属场景（layouts/*.tsx 的 custom）自己做断行与字号自适应，
 * 不受槽位安全区约束 —— 否则「SRT 标点全换空格」后的整句台词会被误判超宽。
 */
export function validateScene(scene: BeatScene, overrideSource?: string, skipHeadlineWidth = false): string[] {
  const errors: string[] = [];
  if (scene.bigNumber && !isTraceable(scene.bigNumber.raw, scene.beat.text, overrideSource)) {
    errors.push(`拍 ${scene.beat.index}：画面数字「${scene.bigNumber.raw}」在旁白中不存在（不可溯源）`);
  }
  if (skipHeadlineWidth) return errors;
  // 与渲染同序：先按标点截断，再净化 —— 门禁检查的必须是「实际会上画面的那串字」
  const h = stripPunct(displayHeadline(scene.headline));
  if (displayWidth(h) > HEADLINE_MAX) {
    errors.push(`拍 ${scene.beat.index}：headline「${h}」显示宽度 ${displayWidth(h)} 超出安全区（${HEADLINE_MAX}），需缩短或分拍`);
  }
  return errors;
}
