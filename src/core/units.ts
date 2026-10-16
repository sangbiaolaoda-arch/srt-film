// 图表量纲归一：把同一「单位族」的度量值换算到同一基准单位，再进图表。
//
// 为什么必须有这一层（本轮实测，用户看片反馈「看不到图表」）：
// 修好中国数量级层后，「光速每秒 30 万公里，声速每秒 340 米」能抽出 2 个度量值，
// 于是该拍正确路由到 v2-axis-columns。但 300000 vs 340 差 882 倍：
//   柱高 = value/max * 300 → 300px 与 0.34px（被 Math.max(6,…) 兜底成 6px）
// 画出来是「一根通天柱 + 一根牙签 + 大片空白」—— 观众眼里就是没有图表。
// v2-bars 同病：Math.max(140,…) 把 6px 粉饰成 140px，比例照样错（340 显示成 19%
// 而真实比例是 0.1%）。
//
// 原则（图表基本功，也是诚实约束）：
//   ① 只有**同单位族**才可比。公里与米同族（长度），换算到同一基准后可同轴；
//   ② 不同族（长度 vs 时间 vs 质量 vs 百分比）**绝不可同轴** —— 那不是对比，是错误隐喻。
//      调用方遇到跨族必须退回「不做图」或只用文字板，不能硬画。
//   ③ 标签一律显示原文 raw（旁白说的话），轴刻度显示换算后的基准值 ——
//      画面上的数仍可溯源到旁白，不编造。
//
// 确定性：纯函数、无随机，同 tokens 进同结果出（导出契约硬要求）。

/** 单位 → (族, 相对基准单位的倍数)。基准单位取该族最小常用单位。 */
const FAMILY: Record<string, { family: UnitFamily; toBase: number }> = {
  // 长度（基准：米）
  公里: { family: "length", toBase: 1000 },
  千米: { family: "length", toBase: 1000 },
  米: { family: "length", toBase: 1 },
  厘米: { family: "length", toBase: 0.01 },
  毫米: { family: "length", toBase: 0.001 },
  // 时间（基准：毫秒）
  小时: { family: "time", toBase: 3.6e6 },
  个小时: { family: "time", toBase: 3.6e6 },
  分钟: { family: "time", toBase: 60000 },
  秒钟: { family: "time", toBase: 1000 },
  秒: { family: "time", toBase: 1000 },
  毫秒: { family: "time", toBase: 1 },
  // 质量（基准：克）
  吨: { family: "mass", toBase: 1e6 },
  万吨: { family: "mass", toBase: 1e10 },
  千克: { family: "mass", toBase: 1000 },
  公斤: { family: "mass", toBase: 1000 },
  克: { family: "mass", toBase: 1 },
  // 计数/比率（无量纲，自成一家，彼此间可比）
  "%": { family: "ratio", toBase: 1 },
  倍: { family: "ratio", toBase: 1 },
  成: { family: "ratio", toBase: 1 },
  折: { family: "ratio", toBase: 1 },
};

export type UnitFamily = "length" | "time" | "mass" | "ratio" | "other";

/** 单位所属族；未知单位归 "other"（调用方按不可比处理）。 */
export function familyOf(unit: string | undefined): UnitFamily {
  if (!unit) return "other";
  return FAMILY[unit]?.family ?? "other";
}

/** token 没带 unit 时，从 raw 尾部反推单位（「120 毫秒」→「毫秒」）。
 *  管线的 numberTokens 一定带 unit（trace.ts 填的），但测试夹具/手工构造的
 *  content 常省略 —— 不反推就会把所有这类拍误判成「不可比」而退回文字板，
 *  图表能力在夹具上全灭。反推只认表内单位，认不出就返回 undefined（保持不可比）。 */
export function unitOf(raw: string, unit?: string): string | undefined {
  if (unit) return unit;
  // 长名优先，与 FAMILY 的建表顺序一致（公里每小时 必须先于 公里）
  const names = Object.keys(FAMILY).sort((a, b) => b.length - a.length);
  for (const n of names) if (raw.endsWith(n)) return n;
  return undefined;
}

/** 一个 token 换算到基准单位后的值；单位不在表内返回 null（调用方应视作不可比）。 */
export function toBaseValue(unit: string | undefined, value: number): number | null {
  if (!unit) return null;
  const e = FAMILY[unit];
  if (!e) return null;
  return value * e.toBase;
}

export interface ChartPoint {
  /** 原文（含单位），画在标签上 —— 观众看到的就是旁白说的那个数 */
  raw: string;
  /** 换算到基准单位后的值，用于算比例 */
  base: number;
  /** 该点原单位 */
  unit: string;
  /** 在可比集合中的占比 0..1（最大值 = 1） */
  frac: number;
}

export interface ChartSeries {
  /** 是否真的可作图：全部点同族、至少 2 点、最大值 > 0、且量级差不过分 */
  chartable: boolean;
  /** 不可作图的理由（给调用方决定退回文字板；空串 = 可作图） */
  reason: string;
  points: ChartPoint[];
  family: UnitFamily;
  /** 基准单位下的最大值（轴刻度用） */
  max: number;
}

/**
 * 量级差上限：max/min 超过它就判不可作图。
 *
 * 为什么（本轮实测，用户看片反馈「看不到图表」）：「30 万公里 vs 340 米」归一同族后
 * frac = 1 : 0.0000011 → 柱高 300px : 6px。图是「诚实」的，但小柱在 300px 轴前等于
 * 不存在，观众眼里仍然是没有图表。
 * 两种解法都试过并否决/采纳：
 *   · 对数轴能让 882 倍可读，但**普通观众不读对数轴**，且对数轴会把「差 882 倍」
 *     视觉上压成「差 2 格」—— 那是另一种不诚实。否决。
 *   · 超过阈值就不画图、退回文字板。文字板照样显示两个原文数字，信息不丢，
 *     只是不假装能用一根轴表达它们。采纳。
 * 阈值 50：低于它小柱仍有 ≥6% 轴高（线性轴上看得见）；高于它就开始退化成牙签。
 */
export const MAX_RATIO = 50;

/** 把一批度量 token 变成可作图系列。跨族 / 单点 / 全零 一律判不可作图。 */
export function normalizeSeries(
  tokens: { raw: string; value: number; unit?: string }[],
): ChartSeries {
  // unit 缺省时从 raw 尾部反推（夹具/老数据没填 unit，反推不出才真判不可比）
  const usable = tokens
    .map((t) => ({ ...t, unit: unitOf(t.raw, t.unit) }))
    .filter((t) => Number.isFinite(t.value) && t.value > 0);
  if (usable.length < 2) {
    return { chartable: false, reason: `可比点不足（${usable.length}/2）`, points: [], family: "other", max: 0 };
  }
  const fams = new Set(usable.map((t) => familyOf(t.unit)));
  if (fams.size > 1) {
    return { chartable: false, reason: `跨单位族不可同轴：${[...fams].join(" vs ")}`, points: [], family: "other", max: 0 };
  }
  const family = [...fams][0]!;
  if (family === "other") {
    return { chartable: false, reason: "单位不在可比表内", points: [], family, max: 0 };
  }
  const pts = usable.map((t) => ({ raw: t.raw, base: toBaseValue(t.unit, t.value)!, unit: t.unit ?? "" }));
  const max = pts.reduce((m, p) => Math.max(m, p.base), 0);
  const min = pts.reduce((m, p) => Math.min(m, p.base), max);
  if (!(max > 0)) {
    return { chartable: false, reason: "最大值非正", points: [], family, max: 0 };
  }
  const withFrac: ChartPoint[] = pts.map((p) => ({ ...p, frac: p.base / max }));
  // 量级差守卫：points 照常返回（调用方/测试要能看见真实比值），只是 chartable=false
  if (min > 0 && max / min > MAX_RATIO) {
    return {
      chartable: false,
      reason: `量级差过大（${Math.round(max / min)} 倍 > ${MAX_RATIO}），线性轴会吞掉小值`,
      points: withFrac,
      family,
      max,
    };
  }
  return { chartable: true, reason: "", points: withFrac, family, max };
}

/** 轴刻度标签：基准值太大时用万/亿缩写，避免刻度文字比图还宽。 */
export function tickLabel(v: number): string {
  const a = Math.abs(v);
  if (a >= 1e8) return `${trim(v / 1e8)}亿`;
  if (a >= 1e4) return `${trim(v / 1e4)}万`;
  return trim(v);
}
const trim = (n: number): string => {
  const r = Math.round(n * 100) / 100;
  return Number.isInteger(r) ? String(r) : r.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
};
