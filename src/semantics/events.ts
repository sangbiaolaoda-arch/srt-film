// 语义事件层（方案 §5 P1-1 / Phase 1）：把「拍级角色」细化到「事件 + 实体 + 证据」。
//
// 设计边界（照抄方案，不是可选项）：
//   ① 先规则、后模型。第一版只做**比较**一族；识别不了就 `statement` 降级，绝不编造优胜者。
//   ② 每个事件必须能回到 SRT 原文的字符区间（EvidenceSpan）—— 溯源门禁的下游。
//   ③ 维度词要分类：只有**评价性**维度（好/强/差/弱）才允许判定谁占优；
//      可测量维度（贵/快/大/多…）的好坏依赖语境（贵可能是更好也可能是更差），
//      一律 polarity = "unknown" —— 这是「不擅自制造优胜者」的代码化。
//   ④ 否定作用域单独记账（negated）："A 并不比 B 好" 不是 "A 比 B 好" 的字符串相似物。
//   ⑤ 置信度不足、实体过长、实体是代词、整句是疑问 → 降级并记录原因（degraded）。
//
// 纯函数、无 DOM、无随机 —— 同一段文本永远得到同一个事件（可测、可断言）。

/** 事件类型。Phase 1 实现 compare；Phase 3 逐步加 cause_effect / negation / contrast / change。 */
export type EventType = "compare" | "cause_effect" | "statement";

/** 证据片段：cue 内的字符区间。startChar/endChar 是**半开区间** [start, end)。 */
export interface EvidenceSpan {
  cueId: number;
  startChar: number;
  endChar: number;
  text: string;
}

/** 实体引用：画面上的一个「可被指称的东西」，不是一段任意文字。 */
export interface EntityRef {
  /** 拍内唯一 id（`ent-a` / `ent-b` / `ent-cause` / `ent-effect` …），供 ElementGraph 绑定 */
  id: string;
  /** 原文表面串，未改写、未润色（画面上要能与旁白对上） */
  name: string;
  /** 实体在事件里的角色：比较用 subject/reference，因果用 cause/effect，其余事件自定 */
  role: "subject" | "reference" | "cause" | "effect";
  evidence: EvidenceSpan;
}

/** 谁在比较维度上占优。unknown = 不判定（可测量维度、否定、歧义都落这里）。 */
export type Polarity = "positive" | "negative" | "neutral" | "unknown";

/** 维度词的语义类别 —— 决定「能不能说谁赢了」。 */
export type DimensionKind =
  | "evaluative" // 好 / 强 / 差 / 弱：评价性，方向明确
  | "measurable" // 贵 / 快 / 大 / 多：可测量，但好坏取决于语境
  | "unknown";

export interface SemanticEvent {
  id: string;
  type: EventType;
  entities: EntityRef[];
  /** participants 是「实体在事件里的角色」，与 entities 分开：同一实体可在两个角色里出现 */
  participants: Array<{ entityId: string; role: string }>;
  dimension?: string;
  dimensionKind?: DimensionKind;
  polarity: Polarity;
  negated: boolean;
  confidence: number;
  evidence: EvidenceSpan[];
  /** 命中的规则 id（可回溯到下面 COMPARE_RULES 的某一条） */
  rule: string;
  /** 非空 = 被降级，值是降级原因（必须是可读的原因，不是「失败」两个字） */
  degraded?: string;
}

/** 降级阈值：低于它一律当 statement（宁可不画对照，也不画错对照）。 */
export const CONFIDENCE_MIN = 0.7;

/** 评价性维度：占优方向明确。good 类 = 越大越好；bad 类 = 越大越差。
 *  词表按**最长优先**匹配（"更有分量" 先于 "有"），并且允许「更/还 + 维度」的组合。 */
const EVAL_GOOD = ["好", "强", "优秀", "划算", "值", "有分量", "扎实", "细致", "讲究", "方便", "清晰", "流畅", "耐用", "划算"];
const EVAL_BAD = ["差", "弱", "糟", "烂", "敷衍", "粗糙", "含糊", "费劲"];
/** 可测量维度：方向存在，但「好坏」取决于语境 —— 不判优胜者。 */
const MEASURABLE = ["贵", "便宜", "快", "慢", "大", "小", "高", "低", "多", "少", "长", "短", "重", "轻", "厚", "薄", "宽", "窄", "深", "浅"];

/** 维度串（如「更有分量」）→ 规范化维度词。最长匹配，剥掉「更/还/蛮/比较」这类程度前缀。 */
function normalizeDimension(dim: string): string {
  return dim.replace(/^(?:更|还要|还要更|蛮|比较|相当|特别)+/, "");
}

function classifyDimension(dim: string): DimensionKind {
  const d = normalizeDimension(dim);
  if (EVAL_GOOD.includes(d) || EVAL_BAD.includes(d)) return "evaluative";
  if (MEASURABLE.includes(d)) return "measurable";
  return "unknown";
}

/** 代词/指示词：指代不明，配不上画面实体。 */
const PRONOUNS = ["它", "他", "她", "这个", "那个", "这", "那", "其", "此"];
/** 传闻/不确定语气：出现了就不该当成事实断言。 */
const HEDGES = ["也许", "可能", "据说", "听说", "好像", "似乎", "大概"];

function units(s: string): number {
  let n = 0;
  for (const ch of s) n += ch.codePointAt(0)! > 0xff ? 1 : 0.5;
  return n;
}

/** 比较族规则。顺序 = 特异度从高到低（"并不比" 必须先于 "比" 命中）。
 *
 *  三条硬约束（2026-10-18 语料实测后补的，初版在 04 语料上把「阿拉比卡」的音译「比」
 *  当成比较句、画出一张假对照 —— 正是方案「原则 B」禁止的擅自制造优胜者）：
 *    ① A/B 段内不得含句读分隔符（用 [^，。；！？、\n…] 而不是 `.`），
 *       否则「常见两个品种，阿拉／比／卡和罗布斯塔」这种跨分句的碎片会被当成实体；
 *    ② **必须有维度词**：lookahead 里没有 `$` 兜底。光有「A 比 B」而没有可比维度，
 *       说明这个「比」多半是词内部字符（比拼/对比/阿拉比卡），宁可不抽；
 *    ③ 维度由 B 之后的词表扫描决定（findDimension），不在正则里枚举维度 ——
 *       枚举不全会让整条规则静默不命中（初版就是这么漏掉「更有分量」的）。
 *
 *  A 段允许 0 个前导字符（不锚 `^`）：分拍后的旁白常带时间状语，实体在逗号之后。 */
const SEG = "[^，。；！？、\\n…\\s]{1,12}?";
/** 维度种子：从词表派生（唯一事实来源），正则门禁与分类器共用同一撮词。
 *  枚举不全 = 漏抽（安全，走 statement），绝不代表「抽到的都判得准」。 */
const DIM_SEED = [...EVAL_GOOD, ...EVAL_BAD, ...MEASURABLE].sort((a, b) => b.length - a.length).join("|");
const COMPARE_RULES: Array<{ id: string; re: RegExp; negated: boolean; verdict?: "subject" | "reference"; dimGroup?: number; swapped?: boolean }> = [
  // A 并不比 B —— 否定作用域覆盖整个比较结论
  { id: "compare-negated", re: new RegExp(`(${SEG})并不比(${SEG})(?:更|还|比较|有点|要)?(${DIM_SEED})`), negated: true, dimGroup: 3 },
  // 相比 A，B 更 DIM —— 参照在前、主体在后（11 语料「相比光，声音慢了 88 万倍」）
  { id: "compare-xiangbi", re: new RegExp(`相比(${SEG})[，,]?(${SEG})(?:更|还|比较|有点|要)?(${DIM_SEED})`), negated: false, dimGroup: 3, swapped: true },
  // A 不如 B —— 主体落败，方向明确（"不如" 本身就是比较标记，不需要额外维度）
  { id: "compare-not-as-good", re: new RegExp(`(${SEG})不如(${SEG})`), negated: false, verdict: "reference" },
  // A 比/比起 B + 维度 —— 方向由维度类别决定（比起 在前：交替按顺序匹配，否则
  // 「比起」会被拆成「比」+「起」，"起" 就成了 B 实体的首字）
  { id: "compare-bi", re: new RegExp(`(${SEG})(?:比起|比)较?(${SEG})(?:更|还|比较|有点|要)?(${DIM_SEED})`), negated: false, dimGroup: 3 },
];

/** 音译词/复合词陷阱：「比」是词内字符而不是比较标记。实测定格的三类：
 *  阿拉（比）卡、埃塞俄（比亚）、（比）拼的是均匀。判据 = 本候选匹配的「比」token
 *  整体落在陷阱词内部 → 跳过这个候选，继续找下一个。 */
const WORD_TRAPS = ["阿拉比卡", "埃塞俄比亚", "对比", "比拼", "比如", "比方", "比特", "比拟", "比萨"];
function markerInTrap(src: string, tokenStart: number, tokenLen: number): boolean {
  return WORD_TRAPS.some((w) => {
    let i = src.indexOf(w);
    while (i >= 0) {
      if (i <= tokenStart && tokenStart + tokenLen <= i + w.length) return true;
      i = src.indexOf(w, i + 1);
    }
    return false;
  });
}

/** 在 B 之后扫维度词：最长优先，剥掉程度前缀后归类。
 *  找不到维度词也允许（"A 比 B 更好" 命中"更好"里的"好"；"A 比 B 更耐看"命中"耐"族）——
 *  但完全扫不到就返回 null，调用方按「比较结构成立、维度未知」处理（不判优劣）。 */
function findDimension(text: string, from: number): { word: string; at: number } | null {
  const all = [...EVAL_GOOD, ...EVAL_BAD, ...MEASURABLE].sort((a, b) => b.length - a.length);
  const hay = text.slice(from);
  for (const w of all) {
    const i = hay.indexOf(w);
    if (i >= 0 && i <= 6) return { word: w, at: from + i };
  }
  return null;
}

function clampName(s: string): string {
  // 去掉首尾空白与残留的连接词，不做任何改写（画面上必须和旁白对得上）
  return s.trim().replace(/^[，。、；：,;:\s]+|[，。、；：,;:\s]+$/g, "");
}

/** 比较标记前后的状语：「光伏第一次比煤电更便宜」里的「第一次」修饰比较本身，
 *  不是 A 实体的一部分（抓成「光伏第一次」会让画面标签读不通）。只剥**尾部**这些词，
 *  实体名其余部分原样保留 —— 不改写原文仍是溯源底线。 */
const ADVERBS = ["第一次", "第二次", "第三次", "首次", "更加", "更为", "比较", "有点", "完全", "根本", "其实", "当然", "反而", "甚至", "简直", "一直", "已经", "曾经", "从来", "从未", "向来", "本来", "原来", "同样", "略微", "稍微", "远远", "真正", "绝对", "往往", "常常", "通常", "大多", "一般"];
function stripAdverbs(s: string): string {
  let out = s;
  let changed = true;
  while (changed) {
    changed = false;
    for (const a of ADVERBS) {
      if (out.length > a.length && out.endsWith(a)) {
        out = out.slice(0, out.length - a.length);
        changed = true;
      }
    }
  }
  return out;
}

/**
 * 比较事件抽取。
 * @param text 本拍旁白（未净化标点也行 —— 定位按原文进行）
 * @param cueId 该拍的主 cue id（证据区间挂在这条 cue 上）
 */
export function extractComparisonEvent(text: string, cueId: number): SemanticEvent | null {
  const src = text.trim();
  if (!src) return null;

  for (const rule of COMPARE_RULES) {
    const re = new RegExp(rule.re.source, "g");
    let m: RegExpExecArray | null;
    while ((m = re.exec(src)) !== null) {
      const ms = m[0];
      const msi = m.index;
      const g1Raw = m[1] ?? "";
      const g2Raw = m[2] ?? "";
      const g1 = clampName(g1Raw);
      const g2 = clampName(g2Raw);
      // 「比」是词内字符而不是比较标记 → 跳过这个候选，继续找下一个
      // （阿拉比卡 / 埃塞俄比亚）。相比 是整体标记，不做陷阱检查。
      // 标记位置按**原捕获**算（clampName 会吃掉首尾标点，按净化后的长度算会偏）。
      const markerAt = msi + g1Raw.length;
      if (rule.id !== "compare-xiangbi" && !rule.verdict && markerInTrap(src, markerAt, 1)) continue;
      // 主体/参照：普通规则 group1=主体；「相比 A，B…」是参照在前（swapped）
      const subjRaw = rule.swapped ? g2 : g1;
      const refRaw = rule.swapped ? g1 : g2;
      const subjRawClean = stripAdverbs(subjRaw);
      // 剥完状语实体就没了（「往往比咖啡机贵」的 A 段整个是状语）→ 主体在更早的分句里，
      // 本规则抓不到正确所指，弃掉这个候选（宁缺毋滥，别把「往往」画上画面）。
      if (!subjRawClean || !refRaw || subjRawClean !== subjRaw && subjRawClean.length < 2) continue;
      if (ADVERBS.includes(subjRawClean) || ADVERBS.includes(refRaw)) continue;

      // 证据区间按**匹配位置**算，不能拿 indexOf 在全句里再找一遍：
      // 「比」字在实体里也出现时（阿拉比卡），indexOf 会把起点定位到错误的那一次。
      // 状语与标点剥的是尾部/首尾 → 净化串是原捕获的连续子串，起点跟着挪。
      // 「相比」是整体规则的前缀，ms.indexOf(g1Raw) 天然跳过它（=2）。
      const g1At = msi + ms.indexOf(g1Raw);
      const g2At = msi + ms.indexOf(g2Raw, ms.indexOf(g1Raw) + g1Raw.length) + (g2Raw.indexOf(g2));
      const subjAt = rule.swapped ? g2At : g1At;
      const refAt = rule.swapped ? g1At : g2At;

      // 维度：规则捕获到就用捕获的；"不如" 这类规则没有维度捕获组，退回词表扫描
      const captured = rule.dimGroup ? m[rule.dimGroup] : undefined;
      let dimRaw = clampName(captured ?? "");
      let dimStart = -1;
      if (captured && dimRaw) {
        const g2End = ms.indexOf(g2Raw) + g2Raw.length;
        const dRel = ms.indexOf(captured, g2End);
        dimStart = dRel >= 0 ? msi + dRel : -1;
      } else if (!captured) {
        const d = findDimension(src, Math.max(0, refAt + refRaw.length));
        dimRaw = d?.word ?? "";
        dimStart = d?.at ?? -1;
      }

      const dimKind = dimRaw ? classifyDimension(dimRaw) : "unknown";
      const dimGood = dimRaw ? EVAL_GOOD.includes(normalizeDimension(dimRaw)) : false;
      // 占优方向：规则显式给了 verdict 就用它（"不如"），否则只有评价性维度可判
      let polarity: Polarity = "unknown";
      if (rule.negated) {
        polarity = "unknown"; // 否定不掉头猜方向
      } else if (rule.verdict === "subject") {
        polarity = "positive";
      } else if (rule.verdict === "reference") {
        polarity = "negative";
      } else if (dimKind === "evaluative") {
        polarity = dimGood ? "positive" : "negative";
      }

      const entities: EntityRef[] = [
        {
          id: "ent-a",
          name: subjRawClean,
          role: "subject",
          evidence: { cueId, startChar: Math.max(0, subjAt), endChar: Math.max(0, subjAt) + subjRawClean.length, text: subjRawClean },
        },
        {
          id: "ent-b",
          name: refRaw,
          role: "reference",
          evidence: { cueId, startChar: Math.max(0, refAt), endChar: Math.max(0, refAt) + refRaw.length, text: refRaw },
        },
      ];

      const evidence: EvidenceSpan[] = [
        ...entities.map((e) => e.evidence),
        ...(dimStart >= 0 ? [{ cueId, startChar: dimStart, endChar: dimStart + dimRaw.length, text: dimRaw }] : []),
      ];

      // ── 置信度与降级（方案 §5.2：不确定就声明不确定，不编造） ──
      let confidence = 0.9;
      const degrade: string[] = [];
      if (HEDGES.some((h) => src.includes(h))) {
        confidence -= 0.35;
        degrade.push(`含不确定语气（${HEDGES.filter((h) => src.includes(h)).join("/")}）`);
      }
      if (PRONOUNS.some((p) => subjRawClean === p || refRaw === p)) {
        confidence -= 0.4;
        degrade.push("实体是指代词，画面上没有确定所指");
      }
      if (units(subjRawClean) > 8 || units(refRaw) > 8) {
        confidence -= 0.25;
        degrade.push("实体过长（>8 字宽），无法稳定绑定到单个画面对象");
      }
      if (/[？?]/.test(src)) {
        confidence -= 0.5;
        degrade.push("整句是疑问，不能当作断言");
      }

      return {
        id: `ev-${cueId}-${rule.id}`,
        type: "compare",
        entities,
        participants: [
          { entityId: "ent-a", role: "subject" },
          { entityId: "ent-b", role: "reference" },
        ],
      dimension: dimRaw || undefined,
      dimensionKind: dimKind,
      polarity,
      negated: rule.negated,
      confidence: Math.max(0.05, Math.min(0.99, Number(confidence.toFixed(2)))),
      evidence,
      rule: rule.id,
      degraded: degrade.length ? degrade.join("；") : undefined,
      };
    }
  }
  return null;
}

/** 本拍的全部事件。识别不出比较 → 显式 statement（带原因），而不是「没有事件」。 */
export function extractEvents(text: string, cueId: number): SemanticEvent[] {
  const cmp = extractComparisonEvent(text, cueId);
  if (cmp) return [{ ...cmp, type: cmp.confidence < CONFIDENCE_MIN ? "statement" : "compare", degraded: cmp.confidence < CONFIDENCE_MIN ? `${cmp.degraded ? `${cmp.degraded}；` : ""}置信度 ${cmp.confidence} < ${CONFIDENCE_MIN}，降级为陈述` : cmp.degraded }];
  const cau = extractCausalEvent(text, cueId);
  if (cau) return [{ ...cau, type: cau.confidence < CONFIDENCE_MIN ? "statement" : "cause_effect", degraded: cau.confidence < CONFIDENCE_MIN ? `${cau.degraded ? `${cau.degraded}；` : ""}置信度 ${cau.confidence} < ${CONFIDENCE_MIN}，降级为陈述` : cau.degraded }];
  return [
    {
      id: `ev-${cueId}-statement`,
      type: "statement",
      entities: [],
      participants: [],
      polarity: "unknown",
      negated: false,
      confidence: 1,
      evidence: [{ cueId, startChar: 0, endChar: text.length, text }],
      rule: "fallback-statement",
      degraded: "未命中比较族规则，也未命中因果族规则",
    },
  ];
}

/** 因果族规则。必须带**显式因果标记**（因为/所以/导致/使得/由于/因此/因而/故）——
 *  只有时间先后（「先 A 后 B」「A 发生后 B 也发生」）不算因果，落到 statement，
 *  由调用方决定是否做中性序列呈现 —— 这是方案 §5.3 / §11 case 5 明确禁止的
 *  「只有时间先后、没有因果证据就画成因果」。
 *  cause 组在标记之前用非贪婪（截到标记为止）；effect 组在标记之后用贪心
 *  （吃到句末/句读为止，否则非贪婪只抓 1 字）。 */
const SEG_G = "[^，。；！？、\\n…\\s]{1,12}"; // 贪心版（effect 组用）
const CAUSAL_RULES: Array<{ id: string; re: RegExp; causeGroup: number; effectGroup: number }> = [
  { id: "causal-yinwei", re: new RegExp(`因为(${SEG})[，,]?(?:所以|因此|因而|故)(${SEG_G})`), causeGroup: 1, effectGroup: 2 },
  { id: "causal-daozhi", re: new RegExp(`(${SEG})导致(${SEG_G})`), causeGroup: 1, effectGroup: 2 },
  { id: "causal-shide", re: new RegExp(`(${SEG})使得(${SEG_G})`), causeGroup: 1, effectGroup: 2 },
  { id: "causal-youyu", re: new RegExp(`由于(${SEG})[，,]?(${SEG_G})`), causeGroup: 1, effectGroup: 2 },
];

/**
 * 因果事件抽取：原因 → 结果，二者之间有方向连线。
 * 与 compare 同样的降级纪律：实体过长/代词/疑问 → 降级；识别不出因果标记 → 返回 null。
 */
export function extractCausalEvent(text: string, cueId: number): SemanticEvent | null {
  const src = text.trim();
  if (!src) return null;

  for (const rule of CAUSAL_RULES) {
    const m = rule.re.exec(src);
    if (!m) continue;
    const causeRaw = clampName(m[rule.causeGroup] ?? "");
    const effectRaw = clampName(m[rule.effectGroup] ?? "");
    if (!causeRaw || !effectRaw) continue;
    const causeClean = stripAdverbs(causeRaw);
    const effectClean = stripAdverbs(effectRaw);
    if (!causeClean || !effectClean) continue;
    if (ADVERBS.includes(causeClean) || ADVERBS.includes(effectClean)) continue;

    // 证据区间按匹配位置算（与 compare 同一纪律：不靠 indexOf 全句再找）
    const cAt = m.index + m[0].indexOf(m[rule.causeGroup]!);
    const eAt = m.index + m[0].indexOf(m[rule.effectGroup]!, m[0].indexOf(m[rule.causeGroup]!) + m[rule.causeGroup]!.length);

    const entities: EntityRef[] = [
      { id: "ent-cause", name: causeClean, role: "cause", evidence: { cueId, startChar: Math.max(0, cAt), endChar: Math.max(0, cAt) + causeClean.length, text: causeClean } },
      { id: "ent-effect", name: effectClean, role: "effect", evidence: { cueId, startChar: Math.max(0, eAt), endChar: Math.max(0, eAt) + effectClean.length, text: effectClean } },
    ];
    const evidence: EvidenceSpan[] = entities.map((e) => e.evidence);

    let confidence = 0.9;
    const degrade: string[] = [];
    if (HEDGES.some((h) => src.includes(h))) {
      confidence -= 0.35;
      degrade.push(`含不确定语气（${HEDGES.filter((h) => src.includes(h)).join("/")}）`);
    }
    if (PRONOUNS.some((p) => causeClean === p || effectClean === p)) {
      confidence -= 0.4;
      degrade.push("实体是指代词，画面上没有确定所指");
    }
    if (units(causeClean) > 8 || units(effectClean) > 8) {
      confidence -= 0.25;
      degrade.push("实体过长（>8 字宽），无法稳定绑定到单个画面对象");
    }
    if (/[？?]/.test(src)) {
      confidence -= 0.5;
      degrade.push("整句是疑问，不能当作断言");
    }

    return {
      id: `ev-${cueId}-${rule.id}`,
      type: "cause_effect",
      entities,
      participants: [
        { entityId: "ent-cause", role: "cause" },
        { entityId: "ent-effect", role: "effect" },
      ],
      dimension: undefined,
      dimensionKind: "unknown",
      polarity: "unknown",
      negated: false,
      confidence: Math.max(0.05, Math.min(0.99, Number(confidence.toFixed(2)))),
      evidence,
      rule: rule.id,
      degraded: degrade.length ? degrade.join("；") : undefined,
    };
  }
  return null;
}

/** 取事件的两个实体（顺序：subject, reference）。缺失返回 null —— 调用方必须降级。 */
export function entitiesOf(ev: SemanticEvent): { subject: EntityRef; reference: EntityRef } | null {
  const subject = ev.entities.find((e) => e.role === "subject");
  const reference = ev.entities.find((e) => e.role === "reference");
  return subject && reference ? { subject, reference } : null;
}
