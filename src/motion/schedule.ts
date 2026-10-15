// Phase 7 · 统一时间轴与运动关系模型（纯函数，无 DOM / 无 GSAP）
//
// 这个模块是运动决策的唯一权威：stage.tsx 只负责把 MotionPlan 翻译成 GSAP
// 调用，不持有任何编排判断。由此得到三样东西：
//   ① 确定性 —— 同 shots 进，同 plan 出（任意 seek 同一时刻的上游保证）；
//   ② 可说明性 —— 每拍强制选出一个主运动，并回答「五问」；
//   ③ 风格联动 —— 转场池由 profile.transitionBias 决定、节奏由 motionPace 缩放。
//
// 时间轴口径与 stage.tsx 原实现逐分逐秒对齐：拍间 0.25s 交叠（无黑场），
// running 时刻精确复刻 GSAP tl.duration() 会达到的长度（所有 tween 的
// 最远结束点都纳入计算），所以接线后播放行为不变。

import { MOTION_BY_ID } from "./catalog";
import type { Shot } from "../core/shot";
import { resolveProfile } from "../styles/style-system";
import type { StyleProfile } from "../styles/style-system";

/** 拍间交叠：交叉溶解窗口，无黑场。 */
export const OVERLAP = 0.25;
/** 槽序错峰的步长（与 stage 原实现一致）。 */
export const STAGGER_STEP = 0.08;
/** pace 缩放的钳制范围（秒）。 */
const PACE_CLAMP: [number, number] = [0.3, 2.5];

/** 动效时长按风格节奏缩放：motionPace 是「速度倍率」——扁平风 1.18 更快
 *  （时长 ÷1.18），图表风 0.9 更稳（时长 ÷0.9），编辑风 1.0 原样。 */
export function clampPace(dur: number, pace: number): number {
  return Math.min(Math.max(dur / pace, PACE_CLAMP[0]), PACE_CLAMP[1]);
}

/** 一个槽的入场分配（stage 查询 DOM 后按 index 取）。 */
export interface EnterAssign {
  pool: string[];
  /** 第 k 个槽的错峰偏移 = STAGGER_STEP × min(k, 4) */
  staggerStep: number;
}

export interface TweenPlan {
  motion: string;
  at: number;
  dur: number;
}

/** 主运动的五问（计划 Phase 7 通过标准：「每镜存在可说明的主运动」）。 */
export interface PrimaryRationale {
  /** 传达什么信息 / 完成什么叙事任务 */
  task: string;
  /** 哪个对象是运动主体 */
  subject: string;
  /** 为什么在这个时间点开始 */
  timing: string;
  /** 运动方向和速度曲线 */
  path: string;
  /** 结束后画面新增了什么状态 */
  result: string;
}

export interface PrimaryMotion {
  kind: "camera" | "enter" | "emphasis" | "still";
  motion: string;
  rationale: PrimaryRationale;
}

export interface MotionPlan {
  /** 本拍在 GSAP 时间轴上的起点（精确复刻原 tl.duration() - 0.25 口径） */
  at: number;
  /** 拍长（SRT 区间，下限 1.2s） */
  dur: number;
  /** 本拍节奏缩放（profile.motionPace；转场与机位不缩放） */
  pace: number;
  /** 入场转场：导演指定优先，否则按 transitionBias 池轮转 */
  transition: TweenPlan;
  /** 入场池 + 错峰规则（具体槽分配在 stage 查完 DOM 后进行） */
  enters: EnterAssign;
  emphasis?: TweenPlan;
  ambient?: TweenPlan;
  exit: TweenPlan;
  camera?: { at: number; dur: number; spec: string };
  /** 本拍唯一的主运动（其余全部从属于它） */
  primary: PrimaryMotion;
  /** 有意静止：无任何运动时的显式声明（通过标准要求「或有意静止」） */
  still?: string;
}

export interface ScheduleWarning {
  beat: number;
  text: string;
}

export interface MotionSchedule {
  plans: MotionPlan[];
  warnings: ScheduleWarning[];
}

/* ── 方向与曲线：数值全部抄自 motion/apply.ts 的真实实现 ───────────────── */

const MOTION_PATH: Record<string, string> = {
  // 入场
  "m-fade-up": "上浮 14px · power2.out",
  "m-fade-down": "下沉 14px · power2.out",
  "m-slide-left": "左滑 28px · power2.out",
  "m-slide-right": "右滑 28px · power2.out",
  "m-wipe-left": "自左向右擦除展开",
  "m-wipe-right": "自右向左擦除展开",
  "m-scale-soft": "0.94→1 轻缩放浮现",
  "m-blur-in": "1.03→1（虚化以缩放近似）",
  "m-type-on": "逐字显影（stagger）",
  "m-stagger-words": "逐词上浮 10px",
  "m-clip-reveal": "自上而下裁切揭示",
  "m-rise-lines": "线稿逐条自左生长",
  "m-stroke-draw": "描边 dashoffset 收至 0",
  "m-char-rise": "逐字上浮 26px · power3.out",
  "m-char-type": "逐字硬切显影（0.012s/字）",
  "m-skew-in": "斜切 12° 左滑入场",
  "m-rotate-in": "旋转 -8° 回正",
  "m-zoom-in": "1.22→1 拉近聚焦 · power3.out",
  // 强调
  "m-pulse": "1.00→1.04→1.00 呼吸一次",
  "m-underline-draw": "下划线自左扫出",
  "m-highlight-sweep": "透明度降至 0.72 往返",
  "m-number-tick": "数字滚动至真值 · power1.out",
  "m-glow": "亮度呼吸往返",
  "m-shake": "±4px 抖动",
  "m-color-shift": "数字变为强调色",
  "m-weight-morph": "字重 400→700",
  "m-focus-ring": "1.02→1 聚焦环收拢",
  "m-dot-bounce": "圆点弹跳落位 · bounce.out",
  "m-morph-blob": "不等比缩放呼吸（1.07/0.94）",
  "m-jitter": "±2.5px 高频微抖",
  "m-count-pop": "1.3→1 数字弹出 · back.out(2.4)",
  "m-bar-sweep": "条状自左扫出（stagger）",
  "m-tick-pulse": "刻度 0.6→1 弹入 · back.out(2)",
  "m-breathe": "1.00→1.025→1.00 缓慢呼吸",
  "m-flip-x": "水平 0.86→1 回弹 · back.out(1.6)",
  "m-underline-slide": "下划线滑入",
  // 出场
  "m-fade-out": "淡出 · power1.in",
  "m-slide-out-down": "下沉 18px 淡出",
  "m-mask-close": "自下遮罩合拢",
  "m-scale-out": "0.96 收缩淡出",
  "m-blur-out": "1.02 虚化淡出",
  "m-sink": "下沉 22px 隐没",
  "m-shrink-away": "0.88 收缩消失",
  "m-slide-out-left": "左滑 26px 离场",
  "m-flip-out": "水平翻面收起",
  "m-dissolve-up": "上浮 14px 溶解",
  // 转场
  "m-cross-dissolve": "交叉溶解（0.25s 交叠窗口）",
  "m-push-left": "左推 70px 入场",
  "m-wipe-panel": "板擦自左展开",
  "m-zoom-through": "1.08→1 穿越推近",
  "m-split-open": "中缝开启",
  "m-wipe-diagonal": "斜切擦除入场",
  "m-sweep-light": "右移 34px 扫光入场",
  "m-mask-circle": "圆形遮罩展开",
  // 环境
  "m-grain-drift": "±6px 颗粒漂移往返",
  "m-cursor-blink": "光标闪烁",
  "m-float": "±6px 缓慢浮动往返",
  "m-drift-slow": "±5px 缓慢漂移往返",
  "m-breathe-bg": "背景 0.985↔1.015 呼吸",
  "m-flicker": "偶发闪帧",
};

/** 动效的方向与速度曲线一句话（未知 id 走保守兜底，不编造）。 */
export function motionPath(id: string): string {
  return MOTION_PATH[id] ?? "标准缓动（见 motion/apply.ts）";
}

/* ── 转场池：transitionBias 的三个消费方向 ─────────────────────────────── */

const TRANSITION_POOL: Record<StyleProfile["transitionBias"], string[]> = {
  // 编辑排版风：滑移/溶解 —— 排版画面经不起大位移，转场要「轻」
  slide: ["m-cross-dissolve", "m-push-left", "m-sweep-light"],
  // 扁平矢量风：擦除 —— 色块画面配板擦/斜切，图形感一致
  wipe: ["m-wipe-diagonal", "m-wipe-panel", "m-cross-dissolve"],
  // 图表动态图形风：遮罩 —— 测量画面用遮罩揭示，像翻开图纸
  mask: ["m-mask-circle", "m-split-open", "m-cross-dissolve"],
  // 硬切：只有导演显式指定 transition 才会出现
  cut: ["m-cross-dissolve"],
};

/* ── 主运动选择与五问 ──────────────────────────────────────────────────── */

function cameraSpec(cam: NonNullable<Shot["layout"]["camera"]>): string {
  const parts: string[] = [];
  const s0 = cam.scaleFrom ?? 1;
  const s1 = cam.scaleTo ?? s0;
  if (s1 > s0) parts.push(`缓推 ${s0.toFixed(2)}→${s1.toFixed(2)}`);
  else if (s1 < s0) parts.push(`缓拉 ${s0.toFixed(2)}→${s1.toFixed(2)}`);
  const dx = (cam.xTo ?? 0) - (cam.xFrom ?? 0);
  const dy = (cam.yTo ?? 0) - (cam.yFrom ?? 0);
  if (dx || dy) parts.push(`平移 (${dx}, ${dy})px`);
  if (parts.length === 0) parts.push("固定机位（有意静止的镜头）");
  parts.push("线性（ease:none）");
  return parts.join(" · ");
}

function pickPrimary(shot: Shot, plan: Omit<MotionPlan, "primary" | "still">): PrimaryMotion | { still: string } {
  const { layout, narrative } = shot;
  const task = narrative?.purpose?.trim() || "本拍内容进入画面，建立可读的视觉关系";
  const at = plan.at;
  const dur = plan.dur;

  // ① 机位运动优先：镜头语言是主运动，入场/强调/环境全部从属于它。
  //    有位移（缩放变化或平移）才算；scaleFrom==scaleTo 且无平移的「假相机」不占位。
  const cam = layout.camera;
  const camMoves =
    !!cam &&
    ((cam.scaleTo ?? cam.scaleFrom ?? 1) !== (cam.scaleFrom ?? 1) ||
      (cam.xTo ?? 0) !== (cam.xFrom ?? 0) ||
      (cam.yTo ?? 0) !== (cam.yFrom ?? 0));
  if (plan.camera && cam && camMoves) {
    return {
      kind: "camera",
      motion: "camera",
      rationale: {
        task,
        subject: "整幅画面（机位运动，作用于独立内层容器）",
        timing: `第 ${at.toFixed(2)}s 起贯穿整拍（${dur.toFixed(2)}s）—— 与旁白同步，内容静止时机位持续制造镜内 Δ`,
        path: cameraSpec(cam),
        result: "画面完成一次镜头运动，构图关系随位移被读完后停在终值",
      },
    };
  }

  // ② 入场：没有机位时，拍首的内容入场就是这一拍视觉上的主导变化。
  const enterId = layout.enter[0];
  if (enterId) {
    const def = MOTION_BY_ID.get(enterId);
    return {
      kind: "enter",
      motion: enterId,
      rationale: {
        task,
        subject: def?.target === "text" ? "文字主体（拍首主槽）" : def?.target === "shape" ? "图形主体（拍首主槽）" : "拍首主槽对象",
        timing: `第 ${at.toFixed(2)}s 起（拍首 + 0.08s 错峰）—— 旁白开口时内容就应到位`,
        path: motionPath(enterId),
        result: "主对象完全可见并停在终值，后续强调/环境动效只在其上做局部变化",
      },
    };
  }

  // ③ 强调：版式把全部表达交给一次焦点切换。
  if (plan.emphasis) {
    return {
      kind: "emphasis",
      motion: plan.emphasis.motion,
      rationale: {
        task,
        subject: "首个主槽（被强调对象）",
        timing: `第 ${plan.emphasis.at.toFixed(2)}s 起 —— 入场收尾、旁白点到关键处时触发`,
        path: motionPath(plan.emphasis.motion),
        result: "视觉焦点完成一次切换，被强调对象成为画面兴趣中心",
      },
    };
  }

  // ④ 有意静止：显式声明，而不是留空让「无运动」变成疏漏。
  return {
    still:
      narrative?.role === "hook" || narrative?.role === "conclusion"
        ? "首尾拍（开场/收束）：静止构图承担定调与呼号，运动留给中间叙事拍"
        : "本拍无意设置运动：静态构图 + 一次入场即完成表达，不用全局动效掩盖静止",
  };
}

/* ── 主构建 ────────────────────────────────────────────────────────────── */

/**
 * 全片运动规划。确定性：同 shots → 同 MotionSchedule（深相等）。
 * stage.tsx 消费 plans；warnings 进调试面板（不拦截 —— 运动问题是品味问题，
 * 拦截会误杀有意设计；硬错误由布局约束引擎负责）。
 */
export function buildMotionSchedule(shots: Shot[]): MotionSchedule {
  const plans: MotionPlan[] = [];
  const warnings: ScheduleWarning[] = [];
  let running = 0;

  shots.forEach((shot, i) => {
    const layout = shot.layout;
    const profile: StyleProfile = resolveProfile(layout.style);
    const pace = profile.motionPace;
    const dur = Math.max(shot.end - shot.start, 1.2);
    // 与上一拍的所有 tween 交叠 0.25s（原 stage 口径：tl.duration() - 0.25）
    const at = i === 0 ? 0 : Math.max(running - OVERLAP, 0);

    // 转场：导演指定优先 → transitionBias 池轮转（每系内部按拍序轮换，不雷同）
    const transId = layout.transition ?? TRANSITION_POOL[profile.transitionBias][i % TRANSITION_POOL[profile.transitionBias].length]!;
    const transDef = MOTION_BY_ID.get(transId);
    const transition: TweenPlan = {
      motion: transDef?.id ?? "m-cross-dissolve",
      at,
      dur: transDef?.dur ?? 0.5,
    };

    // 入场池：原样继承版式声明（槽级 data-motion 优先的规则不变）
    const enters: EnterAssign = { pool: layout.enter, staggerStep: STAGGER_STEP };

    // 强调：入场收尾后 0.12s（原 stage 口径：at + min(0.75, dur/3)）
    let emphasis: TweenPlan | undefined;
    if (layout.emphasis) {
      const def = MOTION_BY_ID.get(layout.emphasis);
      if (def) emphasis = { motion: def.id, at: at + Math.min(0.75, dur / 3), dur: clampPace(def.dur, pace) };
    }

    // 环境：贯穿整拍（不乘 pace —— 它是氛围底噪，不是节奏）
    let ambient: TweenPlan | undefined;
    if (layout.ambient) {
      const def = MOTION_BY_ID.get(layout.ambient);
      if (def) ambient = { motion: def.id, at, dur };
    }

    // 机位：贯穿整拍，线性
    let camera: MotionPlan["camera"];
    if (layout.camera) camera = { at, dur, spec: cameraSpec(layout.camera) };

    // 出场：拍末（原口径 at + max(dur - exitDur, 0.6)）
    const exitId = layout.exit ?? EXIT_FALLBACK[i % EXIT_FALLBACK.length]!;
    const exitDef = MOTION_BY_ID.get(exitId) ?? MOTION_BY_ID.get("m-fade-out")!;
    const exit: TweenPlan = {
      motion: exitDef.id,
      at: at + Math.max(dur - clampPace(exitDef.dur, pace), 0.6),
      dur: clampPace(exitDef.dur, pace),
    };

    const base = { at, dur, pace, transition, enters, emphasis, ambient, exit, camera };
    const primaryOrStill = pickPrimary(shot, base);
    const plan: MotionPlan =
      "still" in primaryOrStill
        ? { ...base, primary: { kind: "still", motion: "—", rationale: emptyRationale() }, still: primaryOrStill.still }
        : { ...base, primary: primaryOrStill };

    // 无意义全局动效检查（通过标准：「没有无意义的全局粒子运动用来掩盖静止」）：
    // 整拍图层上的氛围位移 + 没有任何主运动 = 用动效掩盖静止。
    const ambDef = layout.ambient ? MOTION_BY_ID.get(layout.ambient) : undefined;
    if (ambDef && ambDef.group === "ambient" && ambDef.target === "any" && "still" in primaryOrStill) {
      warnings.push({
        beat: shot.content.beat,
        text: `拍 ${shot.content.beat} 无主运动却挂了全局氛围动效 ${ambDef.id} —— 疑似用动效掩盖静止，建议改为局部强调或显式静止`,
      });
    }

    plans.push(plan);

    // running：精确复刻 GSAP tl.duration() 会达到的最远结束点。
    const enterDurMax = layout.enter.reduce((m, id) => Math.max(m, clampPace(MOTION_BY_ID.get(id)?.dur ?? 0.5, pace)), 0);
    const slotCount = layout.slots?.length ?? 0;
    const staggerMax = STAGGER_STEP * Math.min(Math.max(slotCount - 1, 0), 4);
    const ends: number[] = [
      at + dur,
      transition.at + transition.dur,
      at + staggerMax + enterDurMax,
      exit.at + exit.dur,
    ];
    if (emphasis) ends.push(emphasis.at + emphasis.dur);
    if (ambient) ends.push(ambient.at + ambient.dur);
    running = Math.max(...ends);
  });

  return { plans, warnings };
}

/** 出场兜底序列（无导演指定时按拍序轮换；三系通用 —— 出场是拍的收尾，不承担风格口音）。 */
const EXIT_FALLBACK = ["m-fade-out", "m-slide-out-down", "m-mask-close", "m-scale-out", "m-sink", "m-blur-out", "m-shrink-away", "m-slide-out-left", "m-flip-out", "m-dissolve-up"];

function emptyRationale(): PrimaryRationale {
  return { task: "", subject: "", timing: "", path: "", result: "" };
}

/** 槽序 → 入场动效（stage 查完 DOM 后调用；与计划「入场必须先于强调」一致）。 */
export function enterForSlot(plan: MotionPlan, k: number, declared?: string | null): string {
  if (declared) {
    const def = MOTION_BY_ID.get(declared);
    if (def) return def.id;
  }
  const pool = plan.enters.pool;
  if (pool.length === 0) return "m-fade-up";
  return pool[k % pool.length]!;
}

/** 槽错峰偏移（与 stage 原实现一致：0.08 × min(k, 4)）。 */
export function staggerAt(plan: MotionPlan, k: number): number {
  return plan.at + plan.enters.staggerStep * Math.min(k, 4);
}

/** 出场/转场兜底校验：未知 id 一律回落安全值（构建期门禁另在 tests 里全覆盖）。 */
export function safeMotion(id: string | undefined, fallback: string): string {
  return id && MOTION_BY_ID.has(id) ? id : fallback;
}
