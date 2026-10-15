// 动效目录：36 个原语，分五类。动效是函数，可自由组合成年动效。
// 组合规则（机器校验）：单拍 ≤4 个；同元素同轴冲突禁止；入场必须先于强调。

export type MotionGroup = "enter" | "emphasis" | "exit" | "transition" | "ambient";

export interface MotionDef {
  id: string;
  name: string;
  group: MotionGroup;
  /** 作用对象偏好：any / text / shape */
  target: "any" | "text" | "shape";
  /** 时长（秒），组合时取实际值 */
  dur: number;
  /** 与之冲突的动效 id（同元素同轴，不允许共存） */
  conflicts?: string[];
  /** 与其他动效搭配的推荐组合，供画廊展示 */
  pairs?: string[];
  note?: string;
}

const M = (
  id: string, name: string, group: MotionGroup, target: "any" | "text" | "shape",
  dur: number, conflicts: string[] = [], pairs: string[] = [], note?: string,
): MotionDef => ({ id, name, group, target, dur, conflicts, pairs, note });

export const MOTIONS: MotionDef[] = [
  // —— 入场 (12) ——
  M("m-fade-up", "淡入上浮", "enter", "any", 0.5, [], ["m-stagger-words", "m-underline-draw"]),
  M("m-fade-down", "淡入下沉", "enter", "any", 0.5, [], ["m-glow"]),
  M("m-slide-left", "左侧滑入", "enter", "any", 0.55, ["m-slide-right"], ["m-fade-up"]),
  M("m-slide-right", "右侧滑入", "enter", "any", 0.55, ["m-slide-left"], ["m-fade-up"]),
  M("m-wipe-left", "左向擦除", "enter", "shape", 0.6, ["m-wipe-right"], ["m-highlight-sweep"]),
  M("m-wipe-right", "右向擦除", "enter", "shape", 0.6, ["m-wipe-left"], ["m-highlight-sweep"]),
  M("m-scale-soft", "轻缩放浮现", "enter", "any", 0.45, [], ["m-focus-ring"]),
  M("m-blur-in", "虚化转清晰", "enter", "any", 0.6, [], ["m-fade-up"]),
  M("m-type-on", "逐字打出", "enter", "text", 0.9, [], ["m-cursor-blink"]),
  M("m-stagger-words", "逐词升起", "enter", "text", 0.7, [], ["m-underline-draw"]),
  M("m-clip-reveal", "裁切揭示", "enter", "shape", 0.55, ["m-wipe-left", "m-wipe-right"], ["m-fade-up"]),
  M("m-rise-lines", "线稿生长", "enter", "shape", 0.7, [], ["m-dot-bounce"]),
  // —— 强调 (10) ——
  M("m-pulse", "轻呼吸", "emphasis", "any", 0.6, [], ["m-focus-ring"]),
  M("m-underline-draw", "下划线扫出", "emphasis", "text", 0.5, [], ["m-stagger-words"]),
  M("m-highlight-sweep", "高亮扫过", "emphasis", "text", 0.55, [], ["m-wipe-left"]),
  M("m-number-tick", "数字滚动", "emphasis", "text", 0.8, [], ["m-pulse"]),
  M("m-glow", "柔光呼吸", "emphasis", "any", 0.9, [], ["m-fade-down"]),
  M("m-shake", "轻微抖动", "emphasis", "any", 0.35, ["m-float"], ["m-focus-ring"]),
  M("m-color-shift", "变色强调", "emphasis", "any", 0.5, [], ["m-pulse"]),
  M("m-weight-morph", "字重变化", "emphasis", "text", 0.45, [], ["m-highlight-sweep"]),
  M("m-focus-ring", "聚焦环", "emphasis", "shape", 0.5, [], ["m-scale-soft"]),
  M("m-dot-bounce", "圆点跳动", "emphasis", "shape", 0.4, [], ["m-rise-lines"]),
  // —— 出场 (6) ——
  M("m-fade-out", "淡出", "exit", "any", 0.35),
  M("m-slide-out-down", "下滑离场", "exit", "any", 0.4),
  M("m-mask-close", "遮罩合拢", "exit", "shape", 0.4),
  M("m-scale-out", "收缩消失", "exit", "any", 0.35),
  M("m-blur-out", "虚化淡出", "exit", "any", 0.4),
  M("m-sink", "下沉隐没", "exit", "any", 0.45),
  // —— 转场 (5) ——
  M("m-cross-dissolve", "交叉溶解", "transition", "any", 0.5),
  M("m-push-left", "左推", "transition", "any", 0.5),
  M("m-wipe-panel", "板擦转场", "transition", "shape", 0.55),
  M("m-zoom-through", "穿越推近", "transition", "any", 0.6),
  M("m-split-open", "中缝开启", "transition", "shape", 0.5),
  // —— 环境 (3) ——
  M("m-grain-drift", "颗粒漂移", "ambient", "shape", 3.0),
  M("m-cursor-blink", "光标闪烁", "ambient", "shape", 1.0),
  M("m-float", "缓慢浮动", "ambient", "any", 3.0, ["m-shake"]),

  // ══════════ v3 新增 24（36 → 60） ══════════
  // —— 入场 +6 ——
  M("m-stroke-draw", "描边生长", "enter", "shape", 0.85, [], ["m-fade-up"], "线稿逐笔画出，真 stroke-dashoffset"),
  M("m-char-rise", "逐字上浮", "enter", "text", 0.7, [], ["m-glow"], "海报风大字逐字升起"),
  M("m-char-type", "逐字打出", "enter", "text", 0.8, [], ["m-cursor-blink"], "硬切打字机"),
  M("m-skew-in", "斜切入场", "enter", "any", 0.55, ["m-rotate-in"], ["m-fade-up"]),
  M("m-rotate-in", "旋转入场", "enter", "any", 0.6, ["m-skew-in"], ["m-fade-up"]),
  M("m-zoom-in", "拉近聚焦", "enter", "any", 0.55, ["m-scale-soft", "m-blur-in"], ["m-glow"]),
  // —— 强调 +8 ——
  M("m-morph-blob", "形变呼吸", "emphasis", "shape", 1.0, [], ["m-glow"], "不等比缩放，像活物"),
  M("m-jitter", "高频微抖", "emphasis", "any", 0.3, ["m-shake"], ["m-focus-ring"]),
  M("m-count-pop", "数字弹出", "emphasis", "text", 0.5, ["m-pulse"], ["m-glow"]),
  M("m-bar-sweep", "条状扫出", "emphasis", "shape", 0.6, ["m-wipe-left", "m-wipe-right"], ["m-fade-up"]),
  M("m-tick-pulse", "刻度脉冲", "emphasis", "shape", 0.5, [], ["m-focus-ring"]),
  M("m-breathe", "缓慢呼吸", "emphasis", "any", 1.2, ["m-pulse"], ["m-glow"]),
  M("m-flip-x", "水平翻面", "emphasis", "any", 0.45, ["m-wipe-left", "m-wipe-right", "m-scale-soft"], ["m-glow"]),
  M("m-underline-slide", "下划线滑入", "emphasis", "text", 0.55, ["m-underline-draw"], ["m-char-rise"]),
  // —— 出场 +4 ——
  M("m-shrink-away", "收缩消失", "exit", "any", 0.4, ["m-scale-out"]),
  M("m-slide-out-left", "左滑离场", "exit", "any", 0.4, ["m-slide-out-down"]),
  M("m-flip-out", "翻面收起", "exit", "any", 0.4, []),
  M("m-dissolve-up", "上浮溶解", "exit", "any", 0.42, ["m-sink"]),
  // —— 转场 +3 ——
  M("m-wipe-diagonal", "斜切擦除", "transition", "shape", 0.6, ["m-wipe-panel"]),
  M("m-sweep-light", "扫光转入", "transition", "any", 0.5, ["m-push-left"]),
  M("m-mask-circle", "圆形遮罩", "transition", "shape", 0.55, ["m-split-open"]),
  // —— 转场 +2（Phase 7 第三刀：连续性感知，形状匹配/对位剪辑）——
  M("m-shape-match", "形状匹配", "transition", "shape", 0.55, ["m-mask-circle"], ["m-cross-dissolve"], "新拍从上一拍连续性标记角放大展开——继承关系从内容层延伸到运动层"),
  M("m-match-cut", "对位剪辑", "transition", "any", 0.35, ["m-cross-dissolve"], ["m-push-left"], "近瞬时落位的低位移转场；上拍水平滑出时带对位方向（硬切感的可导出近似）"),
  // —— 环境 +3 ——
  M("m-drift-slow", "缓慢漂移", "ambient", "any", 3.2, ["m-float"]),
  M("m-breathe-bg", "背景呼吸", "ambient", "shape", 3.2, []),
  M("m-flicker", "偶发闪帧", "ambient", "any", 2.4, ["m-glow"]),
];

export const MOTION_BY_ID = new Map(MOTIONS.map((m) => [m.id, m]));

export const MAX_MOTIONS_PER_BEAT = 4;

/** 某动效的全部冲突项（声明是对称的：任一方写了即算冲突）。 */
export function conflictsOf(id: string): string[] {
  const direct = MOTION_BY_ID.get(id)?.conflicts ?? [];
  const mirror = MOTIONS.filter((m) => m.conflicts?.includes(id)).map((m) => m.id);
  return [...new Set([...direct, ...mirror])];
}

/**
 * 组合校验：返回问题列表（空 = 合法）。
 * groups 按元素分组——同一子数组内的动效作用在**同一个元素**上，冲突只查组内。
 * 不同元素各滑一边（如双圆对滑）是合法设计，组间不查。
 * 依据：render.tsx 槽位入场动效取 `enter[index % enter.length]`，池内各项分给不同槽。
 */
export function validateMotionSet(groups: string[][]): string[] {
  const errs: string[] = [];
  const ids = groups.flat();
  if (ids.length > MAX_MOTIONS_PER_BEAT) {
    errs.push(`单拍动效 ${ids.length} 个，超出上限 ${MAX_MOTIONS_PER_BEAT}`);
  }
  for (const id of ids) {
    if (!MOTION_BY_ID.has(id)) errs.push(`未知动效 ${id}`);
  }
  for (const group of groups) {
    for (let i = 0; i < group.length; i++) {
      const a = group[i]!;
      const conflicts = conflictsOf(a);
      if (conflicts.length === 0) continue;
      for (let j = i + 1; j < group.length; j++) {
        if (conflicts.includes(group[j]!)) errs.push(`动效冲突：${a} × ${group[j]}`);
      }
    }
  }
  return errs;
}
