// 每个动效到底往哪些可动画属性上写 —— 由实现推导，不手写表。
//
// 为什么不用手写属性表：手写表会和 apply.ts 悄悄漂移。改了某个动效的实现
// （比如从 scale 改成 scaleX）却不改表，门禁就会漏判，而这种漏判没有任何
// 报错信号。所以这里喂给 applyMotion 一套假 timeline + 假元素，跑真实实现，
// 把 GSAP 的 vars 录下来。

import { applyMotion } from "./apply";
import { MOTION_BY_ID } from "./catalog";

export type MotionProp =
  | "opacity"
  | "x"
  | "y"
  | "scaleX"
  | "scaleY"
  | "rotate"
  | "skewX"
  | "skewY"
  | "fill"
  | "fontWeight"
  | "strokeDash";

/** GSAP vars key → 属性。scale 会同时写 scaleX/scaleY（GSAP 内部就是这么展开的），
 *  autoAlpha 写的是 opacity + visibility —— 只取 opacity，可见性由所在的 tween 决定。 */
const VAR_PROPS: Record<string, MotionProp[]> = {
  autoAlpha: ["opacity"],
  opacity: ["opacity"],
  x: ["x"],
  y: ["y"],
  scale: ["scaleX", "scaleY"],
  scaleX: ["scaleX"],
  scaleY: ["scaleY"],
  rotate: ["rotate"],
  rotation: ["rotate"],
  skewX: ["skewX"],
  skewY: ["skewY"],
};

/** attr:{} 里的 SVG 属性名 → 属性。 */
const ATTR_PROPS: Record<string, MotionProp> = {
  fill: "fill",
  "font-weight": "fontWeight",
  "stroke-dashoffset": "strokeDash",
  "stroke-dasharray": "strokeDash",
};

/**
 * 假元素：所有选择器一律查不到东西。
 * 后果是「按子元素下手」的动效（m-bar-sweep 找 rect、m-underline-draw 找 rule）
 * 全部回落到元素自身 —— 这正是门禁要的保守口径：宁可把同一个槽看成一个整体
 * 而多报一次，也不因为「它可能作用在子元素上」而漏报。
 */
function fakeElement(): Element {
  const attrs = new Map<string, string>();
  // nodeType: 1 + 一个 attr 字段，是为了让 GSAP 的 gsap.set(target, {attr:{…}})
  // 肯在这个假对象上跑：少了 nodeType 或 attr，它会打印「Missing plugin?」刷屏
  // —— 那是噪音，看着像门禁自己坏了，会掩盖真正的问题。
  return {
    nodeType: 1,
    tagName: "rect",
    attr: {},
    matches: () => false,
    querySelectorAll: () => [],
    hasAttribute: (k: string) => attrs.has(k),
    getAttribute: (k: string) => attrs.get(k) ?? null,
    setAttribute: (k: string, v: string) => void attrs.set(k, v),
    removeAttribute: (k: string) => void attrs.delete(k),
  } as unknown as Element;
}

interface Recorded {
  /** 这个动效真正动手写的属性。 */
  props: MotionProp[];
  /** 在给定 dur 下，把这个属性写完的那一刻（相对起点的秒）。
   *  逐条 tween 取最大：有些动效是同时起两条（m-rise-lines）。 */
  total: number;
}

export type TweenVars = Record<string, unknown>;

const cache = new Map<string, MotionProp[]>();

/**
 * 跑一次真实实现，把 GSAP 的 vars 全部录下来。
 * dur 必须传实际排期时长：有些实现写死了绝对时长（m-cursor-blink 的 0.35s），
 * 喂 1 秒算出来的总长是错的。
 */
function record(id: string, dur: number): Recorded {
  const props = new Set<MotionProp>();
  let total = 0;
  const collect = (vars: TweenVars): void => {
    for (const [k, v] of Object.entries(vars)) {
      if (k === "attr" && v && typeof v === "object") {
        for (const a of Object.keys(v as TweenVars)) {
          const p = ATTR_PROPS[a];
          if (p) props.add(p);
        }
        continue;
      }
      const ps = VAR_PROPS[k];
      if (ps) for (const p of ps) props.add(p);
    }
    // GSAP 的 repeat 是「再播 N 次」：全程 = duration × (N+1)（yoyo 只是往返方向）。
    const repeat = typeof vars.repeat === "number" ? vars.repeat : 0;
    const d = typeof vars.duration === "number" ? vars.duration : dur;
    total = Math.max(total, d * (repeat + 1));
  };
  const tl = {
    fromTo: (_t: unknown, from: TweenVars, to: TweenVars) => {
      collect(from);
      collect(to);
    },
    to: (_t: unknown, to: TweenVars) => collect(to),
  };
  applyMotion(id, { tl: tl as never, el: fakeElement(), at: 0, dur });
  return { props: [...props].sort(), total };
}

/** 录制某个动效实际写入的属性；未知/无副作用（如只改文字内容）返回空数组。 */
export function propsOf(id: string): MotionProp[] {
  if (!MOTION_BY_ID.has(id)) return [];
  let hit = cache.get(id);
  if (!hit) {
    hit = record(id, 1).props;
    cache.set(id, hit);
  }
  return hit;
}

/**
 * 单个目标上，给定排期时长的**真实**结束时刻（秒）。
 * 为什么不能用目录里的 dur：repeat/yoyo 会写成 N+1 倍（拍级 emphasis 大多是这种），
 * 入场里也有把时长乘出去的（m-type-on 单目标时是 1.6×dur）。只盯目录 dur 的话，
 * 「入场其实还没写完」的这段时间会被当成早已结束，冲突从这条缝里漏走。
 */
export function tweenTotal(id: string, dur: number): number {
  if (!MOTION_BY_ID.has(id)) return dur;
  return record(id, dur).total;
}

/** 两个动效的属性交集（同元素上重写同一属性的部分）。 */
export function sharedProps(a: string, b: string): MotionProp[] {
  const s = new Set(propsOf(a));
  return propsOf(b).filter((p) => s.has(p));
}
