// 动效实现：36 个原语，每个都是「往 timeline 上加一段 tween」的小函数。
// 组合方式：入场在拍首、强调在拍中、出场在拍末、转场跨拍、环境贯穿整拍。
// 所有动效只碰 transform / opacity / 少量 SVG 属性 —— 保证序列化进 canvas 时不丢效果。

import gsap from "gsap";

export interface MotionArgs {
  tl: gsap.core.Timeline;
  el: Element;
  at: number;
  dur: number;
}

type Applier = (a: MotionArgs) => void;

const partsOf = (el: Element): Element[] => {
  const parts = el.querySelectorAll("[data-part],[data-line]");
  return parts.length > 0 ? Array.from(parts) : [el];
};
const shapesOf = (el: Element): Element[] => {
  const shapes = el.querySelectorAll("path,rect,circle,line,polyline,polygon");
  return shapes.length > 0 ? Array.from(shapes) : [el];
};
/** 逐字符动效的作用对象（海报风大字才会拆出 [data-char]）。 */
const charsOf = (el: Element): Element[] => {
  const chars = el.querySelectorAll("[data-char]");
  return chars.length > 0 ? Array.from(chars) : [el];
};
const ease = "power2.out";

const APPLIERS: Record<string, Applier> = {
  // ── 入场 12 ──
  "m-fade-up": ({ tl, el, at, dur }) =>
    tl.fromTo(el, { autoAlpha: 0, y: 14 }, { autoAlpha: 1, y: 0, duration: dur, ease, immediateRender: false }, at),
  "m-fade-down": ({ tl, el, at, dur }) =>
    tl.fromTo(el, { autoAlpha: 0, y: -14 }, { autoAlpha: 1, y: 0, duration: dur, ease, immediateRender: false }, at),
  "m-slide-left": ({ tl, el, at, dur }) =>
    tl.fromTo(el, { autoAlpha: 0, x: -28 }, { autoAlpha: 1, x: 0, duration: dur, ease, immediateRender: false }, at),
  "m-slide-right": ({ tl, el, at, dur }) =>
    tl.fromTo(el, { autoAlpha: 0, x: 28 }, { autoAlpha: 1, x: 0, duration: dur, ease, immediateRender: false }, at),
  "m-wipe-left": ({ tl, el, at, dur }) =>
    tl.fromTo(el, { autoAlpha: 0, scaleX: 0, transformOrigin: "left center" },
      { autoAlpha: 1, scaleX: 1, duration: dur, ease, immediateRender: false }, at),
  "m-wipe-right": ({ tl, el, at, dur }) =>
    tl.fromTo(el, { autoAlpha: 0, scaleX: 0, transformOrigin: "right center" },
      { autoAlpha: 1, scaleX: 1, duration: dur, ease, immediateRender: false }, at),
  "m-scale-soft": ({ tl, el, at, dur }) =>
    tl.fromTo(el, { autoAlpha: 0, scale: 0.94, transformOrigin: "center center" },
      { autoAlpha: 1, scale: 1, duration: dur, ease, immediateRender: false }, at),
  // 虚化以「缩放 + 透明度」近似：SVG 滤镜在导出链路上不可靠
  "m-blur-in": ({ tl, el, at, dur }) =>
    tl.fromTo(el, { autoAlpha: 0, scale: 1.03, transformOrigin: "center center" },
      { autoAlpha: 1, scale: 1, duration: dur, ease, immediateRender: false }, at),
  "m-type-on": ({ tl, el, at, dur }) => {
    const parts = partsOf(el);
    tl.fromTo(parts, { autoAlpha: 0 }, { autoAlpha: 1, duration: dur / Math.max(parts.length, 1) * 1.6, stagger: dur / Math.max(parts.length, 1), ease: "none", immediateRender: false }, at);
  },
  "m-stagger-words": ({ tl, el, at, dur }) => {
    const parts = partsOf(el);
    tl.fromTo(parts, { autoAlpha: 0, y: 10 }, { autoAlpha: 1, y: 0, duration: dur, stagger: Math.min(0.12, dur / (parts.length + 1)), ease, immediateRender: false }, at);
  },
  "m-clip-reveal": ({ tl, el, at, dur }) =>
    tl.fromTo(el, { autoAlpha: 0, scaleY: 0, transformOrigin: "center top" },
      { autoAlpha: 1, scaleY: 1, duration: dur, ease, immediateRender: false }, at),
  "m-rise-lines": ({ tl, el, at, dur }) => {
    const shapes = shapesOf(el);
    tl.fromTo(shapes, { autoAlpha: 0 }, { autoAlpha: 1, duration: dur, stagger: Math.min(0.06, dur / (shapes.length + 1)), ease, immediateRender: false }, at);
    tl.fromTo(shapes, { scaleX: 0, transformOrigin: "left center" }, { scaleX: 1, duration: dur, stagger: Math.min(0.05, dur / (shapes.length + 1)), ease, immediateRender: false }, at);
  },

  // ── 强调 10 ──
  "m-pulse": ({ tl, el, at, dur }) =>
    tl.to(el, { scale: 1.04, transformOrigin: "center center", duration: dur / 2, yoyo: true, repeat: 1, ease: "sine.inOut" }, at),
  "m-underline-draw": ({ tl, el, at, dur }) => {
    const rules = el.matches("[data-kind='rule']") ? [el] : Array.from(el.querySelectorAll("[data-kind='rule']"));
    const targets: Element[] = rules.length > 0 ? rules : [el];
    tl.fromTo(targets, { scaleX: 0, transformOrigin: "left center" }, { scaleX: 1, duration: dur, ease, immediateRender: false }, at);
  },
  "m-highlight-sweep": ({ tl, el, at, dur }) =>
    tl.to(el, { duration: dur, ease: "power1.inOut", yoyo: true, repeat: 1, opacity: 0.72 }, at),
  "m-number-tick": ({ tl, el, at, dur }) => {
    const nodes = (el.matches("[data-numeric]") ? [el] : Array.from(el.querySelectorAll("[data-numeric]"))) as SVGTextElement[];
    for (const node of nodes) {
      const final = node.textContent ?? "";
      const num = Number(final.replace(/[^\d.-]/g, ""));
      if (!Number.isFinite(num) || num === 0) continue;
      const suffix = final.replace(/[\d.-]/g, "");
      const proxy = { v: 0 };
      tl.to(proxy, {
        v: num, duration: dur, ease: "power1.out",
        onUpdate: () => { node.textContent = `${Number(proxy.v.toFixed(2))}${suffix}`; },
        onComplete: () => { node.textContent = final; },
      }, at);
    }
  },
  "m-glow": ({ tl, el, at, dur }) =>
    tl.to(el, { opacity: 0.78, duration: dur / 2, yoyo: true, repeat: 1, ease: "sine.inOut" }, at),
  "m-shake": ({ tl, el, at, dur }) =>
    tl.to(el, { x: 4, duration: dur / 4, repeat: 5, yoyo: true, ease: "none", onComplete: () => { gsap.set(el, { x: 0 }); } }, at),
  "m-color-shift": ({ tl, el, at, dur }) => {
    const nodes = (el.matches("[data-numeric]") ? [el] : Array.from(el.querySelectorAll("[data-numeric]")));
    const targets = nodes.length > 0 ? nodes : [el];
    tl.fromTo(targets, { attr: { fill: "#8a867c" } }, { attr: { fill: "#c8401f" }, duration: dur, ease }, at);
  },
  "m-weight-morph": ({ tl, el, at, dur }) =>
    tl.fromTo(el, { attr: { "font-weight": 400 } }, { attr: { "font-weight": 700 }, duration: dur, ease }, at),
  "m-focus-ring": ({ tl, el, at, dur }) =>
    tl.fromTo(el, { opacity: 0.6, scale: 1.02, transformOrigin: "center center" },
      { opacity: 1, scale: 1, duration: dur, ease, immediateRender: false }, at),
  "m-dot-bounce": ({ tl, el, at, dur }) => {
    const dots = shapesOf(el);
    tl.fromTo(dots, { y: -6 }, { y: 0, duration: dur, stagger: Math.min(0.04, dur / (dots.length + 1)), ease: "bounce.out", immediateRender: false }, at);
  },

  // ── 出场 6 ──
  "m-fade-out": ({ tl, el, at, dur }) => tl.to(el, { autoAlpha: 0, duration: dur, ease: "power1.in" }, at),
  "m-slide-out-down": ({ tl, el, at, dur }) => tl.to(el, { autoAlpha: 0, y: 18, duration: dur, ease: "power1.in" }, at),
  "m-mask-close": ({ tl, el, at, dur }) =>
    tl.to(el, { scaleY: 0, transformOrigin: "center bottom", duration: dur, ease: "power1.in" }, at),
  "m-scale-out": ({ tl, el, at, dur }) => tl.to(el, { autoAlpha: 0, scale: 0.96, transformOrigin: "center center", duration: dur, ease: "power1.in" }, at),
  "m-blur-out": ({ tl, el, at, dur }) => tl.to(el, { autoAlpha: 0, scale: 1.02, duration: dur, ease: "power1.in" }, at),
  "m-sink": ({ tl, el, at, dur }) => tl.to(el, { autoAlpha: 0, y: 22, duration: dur, ease: "power1.in" }, at),

  // ── 转场 5（作用于整拍容器） ──
  "m-cross-dissolve": ({ tl, el, at, dur }) => tl.fromTo(el, { autoAlpha: 0 }, { autoAlpha: 1, duration: dur, ease, immediateRender: false }, at),
  "m-push-left": ({ tl, el, at, dur }) =>
    tl.fromTo(el, { autoAlpha: 0, x: -70 }, { autoAlpha: 1, x: 0, duration: dur, ease, immediateRender: false }, at),
  "m-wipe-panel": ({ tl, el, at, dur }) =>
    tl.fromTo(el, { autoAlpha: 0, scaleX: 0.2, transformOrigin: "left center" },
      { autoAlpha: 1, scaleX: 1, duration: dur, ease, immediateRender: false }, at),
  "m-zoom-through": ({ tl, el, at, dur }) =>
    tl.fromTo(el, { autoAlpha: 0, scale: 1.08, transformOrigin: "center center" },
      { autoAlpha: 1, scale: 1, duration: dur, ease, immediateRender: false }, at),
  "m-split-open": ({ tl, el, at, dur }) =>
    tl.fromTo(el, { autoAlpha: 0, scaleX: 0.94, transformOrigin: "center center" },
      { autoAlpha: 1, scaleX: 1, duration: dur, ease, immediateRender: false }, at),

  // ── 环境 3 ──
  "m-grain-drift": ({ tl, el, at, dur }) =>
    // yoyo+repeat1 的往返总长 = 2×duration → 传 dur/2 才正好占满调用方给的时长。
    // 此前 duration: dur 会让 tween 实际长 2×dur：环境动效作用在整拍图层上，
    // 超出拍末的部分把 timeline 一路撑长，后续每一拍的 tlStart 全部被推迟。
    tl.fromTo(el, { x: -6, y: 4 }, { x: 6, y: -4, duration: dur / 2, yoyo: true, repeat: 1, ease: "sine.inOut", immediateRender: false }, at),
  "m-cursor-blink": ({ tl, el, at, dur }) =>
    tl.to(el, { opacity: 0.25, duration: 0.35, repeat: Math.max(1, Math.floor(dur / 0.7)), yoyo: true, ease: "none" }, at),
  "m-float": ({ tl, el, at, dur }) =>
    tl.to(el, { y: -6, duration: dur / 2, yoyo: true, repeat: 1, ease: "sine.inOut" }, at),

  // ═══════════ v3 新增 24 个 ═══════════

  // ── 入场 +6 ──
  /** 真描边生长：按实测路径长度设 dasharray，再把 dashoffset 收到 0。 */
  "m-stroke-draw": ({ tl, el, at, dur }) => {
    const nodes = Array.from(el.querySelectorAll("path,line,polyline,circle,rect,polygon")) as SVGElement[];
    const targets = nodes.length > 0 ? nodes : shapesOf(el);
    for (const t of targets) {
      let len = 0;
      const geo = t as SVGGeometryElement;
      if (typeof geo.getTotalLength === "function") {
        try { len = geo.getTotalLength(); } catch { len = 0; }
      }
      if (!len) {
        if (t.tagName === "circle") len = 2 * Math.PI * Number(t.getAttribute("r") ?? 0);
        else if (t.tagName === "rect") len = 2 * (Number(t.getAttribute("width") ?? 0) + Number(t.getAttribute("height") ?? 0));
        else len = 120;
      }
      if (!Number.isFinite(len) || len <= 0) len = 120;
      gsap.set(t, { attr: { "stroke-dasharray": len, "stroke-dashoffset": len } });
    }
    tl.to(targets, {
      attr: { "stroke-dashoffset": 0 },
      duration: dur,
      stagger: Math.min(0.06, dur / (targets.length + 1)),
      ease,
      immediateRender: false,
    }, at);
  },
  /** 逐字上浮（海报风大字才有字符对象，否则整块上浮）。 */
  "m-char-rise": ({ tl, el, at, dur }) => {
    const chars = charsOf(el);
    tl.fromTo(chars, { autoAlpha: 0, y: 26 },
      { autoAlpha: 1, y: 0, duration: dur * 0.62, stagger: Math.min(0.045, dur / (chars.length + 2)), ease: "power3.out", immediateRender: false }, at);
  },
  /** 逐字打出（硬切，光标感）。 */
  "m-char-type": ({ tl, el, at, dur }) => {
    const chars = charsOf(el);
    tl.fromTo(chars, { autoAlpha: 0 },
      { autoAlpha: 1, duration: 0.012, stagger: Math.min(0.038, dur / (chars.length + 2)), ease: "none", immediateRender: false }, at);
  },
  "m-skew-in": ({ tl, el, at, dur }) =>
    tl.fromTo(el, { autoAlpha: 0, skewX: 12, x: -20 },
      { autoAlpha: 1, skewX: 0, x: 0, duration: dur, ease, immediateRender: false }, at),
  "m-rotate-in": ({ tl, el, at, dur }) =>
    tl.fromTo(el, { autoAlpha: 0, rotate: -8, scale: 0.94, transformOrigin: "center center" },
      { autoAlpha: 1, rotate: 0, scale: 1, duration: dur, ease, immediateRender: false }, at),
  "m-zoom-in": ({ tl, el, at, dur }) =>
    tl.fromTo(el, { autoAlpha: 0, scale: 1.22, transformOrigin: "center center" },
      { autoAlpha: 1, scale: 1, duration: dur, ease: "power3.out", immediateRender: false }, at),

  // ── 强调 +8 ──
  /** 形变呼吸：不等比缩放，像活物。 */
  "m-morph-blob": ({ tl, el, at, dur }) =>
    tl.to(el, { scaleX: 1.07, scaleY: 0.94, transformOrigin: "center center", duration: dur / 2, yoyo: true, repeat: 1, ease: "sine.inOut" }, at),
  "m-jitter": ({ tl, el, at, dur }) =>
    tl.to(el, { x: 2.5, duration: dur / 6, repeat: 5, yoyo: true, ease: "none", onComplete: () => { gsap.set(el, { x: 0 }); } }, at),
  "m-count-pop": ({ tl, el, at, dur }) => {
    const nums = Array.from(el.querySelectorAll("[data-numeric]"));
    const targets = nums.length > 0 ? nums : [el];
    tl.fromTo(targets, { scale: 1.3, transformOrigin: "center center" },
      { scale: 1, duration: dur, ease: "back.out(2.4)", immediateRender: false }, at);
  },
  "m-bar-sweep": ({ tl, el, at, dur }) => {
    const bars = Array.from(el.querySelectorAll("rect"));
    const targets = bars.length > 0 ? bars : [el];
    tl.fromTo(targets, { scaleX: 0, transformOrigin: "left center" },
      { scaleX: 1, duration: dur, stagger: Math.min(0.09, dur / (targets.length + 1)), ease: "power3.out", immediateRender: false }, at);
  },
  "m-tick-pulse": ({ tl, el, at, dur }) => {
    const dots = Array.from(el.querySelectorAll("circle,rect"));
    const targets = dots.length > 0 ? dots : [el];
    tl.fromTo(targets, { scale: 0.6, transformOrigin: "center center" },
      { scale: 1, duration: dur * 0.6, stagger: Math.min(0.035, dur / (targets.length + 1)), ease: "back.out(2)", immediateRender: false }, at);
  },
  "m-breathe": ({ tl, el, at, dur }) =>
    tl.to(el, { scale: 1.025, transformOrigin: "center center", duration: dur / 2, yoyo: true, repeat: 1, ease: "sine.inOut" }, at),
  "m-flip-x": ({ tl, el, at, dur }) =>
    tl.fromTo(el, { scaleX: 0.86, transformOrigin: "center center" }, { scaleX: 1, duration: dur, ease: "back.out(1.6)", immediateRender: false }, at),
  "m-underline-slide": ({ tl, el, at, dur }) => {
    const rules = el.matches("[data-kind='rule']") ? [el] : Array.from(el.querySelectorAll("[data-kind='rule'],rect"));
    const targets = rules.length > 0 ? rules : [el];
    tl.fromTo(targets, { scaleX: 0, x: 0, transformOrigin: "left center" },
      { scaleX: 1, duration: dur, ease: "power3.inOut", immediateRender: false }, at);
  },

  // ── 出场 +4 ──
  "m-shrink-away": ({ tl, el, at, dur }) =>
    tl.to(el, { autoAlpha: 0, scale: 0.88, transformOrigin: "center center", duration: dur, ease: "power2.in" }, at),
  "m-slide-out-left": ({ tl, el, at, dur }) =>
    tl.to(el, { autoAlpha: 0, x: -26, duration: dur, ease: "power1.in" }, at),
  "m-flip-out": ({ tl, el, at, dur }) =>
    tl.to(el, { scaleX: 0.1, autoAlpha: 0, transformOrigin: "center center", duration: dur, ease: "power2.in" }, at),
  "m-dissolve-up": ({ tl, el, at, dur }) =>
    tl.to(el, { autoAlpha: 0, y: -14, scale: 0.99, duration: dur, ease: "power1.in" }, at),

  // ── 转场 +3（作用于整拍容器） ──
  "m-wipe-diagonal": ({ tl, el, at, dur }) =>
    tl.fromTo(el, { autoAlpha: 0, skewX: -9, scaleX: 0.86, transformOrigin: "left center" },
      { autoAlpha: 1, skewX: 0, scaleX: 1, duration: dur, ease: "power3.out", immediateRender: false }, at),
  "m-sweep-light": ({ tl, el, at, dur }) =>
    tl.fromTo(el, { autoAlpha: 0, x: 34 }, { autoAlpha: 1, x: 0, duration: dur * 0.7, ease: "power2.out", immediateRender: false }, at),
  "m-mask-circle": ({ tl, el, at, dur }) =>
    tl.fromTo(el, { autoAlpha: 0, scale: 0.82, transformOrigin: "center center" },
      { autoAlpha: 1, scale: 1, duration: dur, ease: "power3.out", immediateRender: false }, at),

  // ── 环境 +3 ──
  "m-drift-slow": ({ tl, el, at, dur }) =>
    // 同 m-grain-drift：yoyo 往返总长 = 2×duration，传 dur/2。
    tl.fromTo(el, { x: -5, y: 3 }, { x: 5, y: -3, duration: dur / 2, yoyo: true, repeat: 1, ease: "sine.inOut", immediateRender: false }, at),
  "m-breathe-bg": ({ tl, el, at, dur }) =>
    tl.fromTo(el, { scale: 0.985, transformOrigin: "center center" },
      { scale: 1.015, duration: dur / 2, yoyo: true, repeat: 1, ease: "sine.inOut", immediateRender: false }, at),
  "m-flicker": ({ tl, el, at, dur }) =>
    tl.to(el, { opacity: 0.86, duration: 0.06, repeat: Math.max(1, Math.floor(dur / 0.9)), yoyo: true, ease: "none" }, at),
};

/** 应用一个动效；未知 id 抛错（由门禁在构建期拦截，运行期不该出现）。 */
export function applyMotion(id: string, a: MotionArgs): void {
  const fn = APPLIERS[id];
  if (!fn) throw new Error(`未知动效：${id}`);
  fn(a);
}

export const APPLIED_MOTION_IDS = Object.keys(APPLIERS);
