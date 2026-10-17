// choreography.js — 编排层（幕内叙事运动）+ 场景内二次运动（anim 键）
//
// 从 illustrations.js 拆出（v2.5）：illustrations.js 只管构图，本文件只管运动。
// 研究依据：CHI 2021《Communicating with Motion》——
//   对比 = move aside（让位）+ 迟入场 + emphasize（放大主方/缩小弱方）
//   悬疑 = unveil / count / track；节奏 = 前一拍给后一拍让路
//
// ⚠ 防坑约定（docs/conventions.md #1/#2）：
//   1. GSAP 对 SVG 的 transformOrigin 像素值相对元素自身 bbox 左上角——
//      一律用 '50% 50%' 等百分比，禁用舞台坐标。
//   2. tl.seek() 默认抑制 onUpdate/onStart 回调——逐帧导出环境里
//      禁止用回调改文字/数字，一律用双文本交叉淡化或 attr 补间。

import { sweepDonut, growBars, drawLine } from './charts.js';

const E = 'power2.inOut';

function mv(tl, el, at, vars, d = 0.9) {
  if (el) tl.to(el, Object.assign({ duration: d, ease: E, transformOrigin: '50% 50%' }, vars), at);
}

// 幕时长 → 拍点缩放系数（6.3s 为标称幕长；短幕最低压到 0.55）
export function choreoScale(dur) {
  return Math.max(0.55, Math.min(1, dur / 6.3));
}

// 统一入口：构造 T(off) 后调用具体编排
export function runChoreo(key, tl, layer, t0, dur) {
  const fn = CHOREO[key];
  if (!fn) return;
  const K = choreoScale(dur);
  const T = (off) => t0 + off * K;
  fn(tl, layer, T, dur, t0);
}

export const CHOREO = {
  // s01 人让位，问号登场
  s01(tl, layer, T) {
    mv(tl, layer.querySelector('[data-key="A"]'), T(1.6), { x: 150 });
    mv(tl, layer.querySelector('[data-key="B"]'), T(2.4), { scale: 1.12, yoyo: true, repeat: 1, duration: 0.55 }, 0.55);
  },
  // s02 东西让位左，钱后到右，箭头压轴
  s02(tl, layer, T) {
    mv(tl, layer.querySelector('[data-key="A"]'), T(1.5), { x: -290 });
  },
  // s05 杯子让位左，价签后到
  s05(tl, layer, T, dur, t0) {
    mv(tl, layer.querySelector('[data-key="A"]'), T(1.6), { x: -250, scale: 0.94 });
    mv(tl, layer.querySelector('[data-key="B"] text'), T(3.2), { y: -10, yoyo: true, repeat: 3, duration: 0.4 }, 0.4);
  },
  // s07 东西让位，金币依次落下
  s07(tl, layer, T) {
    mv(tl, layer.querySelector('[data-key="A"]'), T(1.4), { x: -260 });
    mv(tl, layer.querySelector('[data-key="B"]'), T(2.1), { y: -26 }, 0.5);
    mv(tl, layer.querySelector('[data-key="C"]'), T(2.6), { y: -20 }, 0.5);
  },
  // s10 杯子揭幕式放大
  s10(tl, layer, T) {
    mv(tl, layer.querySelector('[data-key="A"]'), T(1.8), { scale: 1.1, yoyo: true, repeat: 1, duration: 0.7 }, 0.7);
  },
  // s11 杯子滑向卖家手里
  s11(tl, layer, T) {
    mv(tl, layer.querySelector('[data-key="B"]'), T(1.2), { x: -180, y: 8, scale: 0.96 });
  },
  // s13 大数字砸场 + 卖家放大 / 买家缩小（A 比 B 好 → A 主导画面）
  s13(tl, layer, T) {
    const c = layer.querySelector('[data-key="C"]');
    mv(tl, c, T(1.5), { scale: 1.18, duration: 0.45 }, 0.45);
    mv(tl, c, T(2.05), { scale: 1, duration: 0.6, ease: 'back.out(2)' }, 0.6);
    mv(tl, layer.querySelector('[data-key="A"]'), T(3.4), { scale: 1.12, x: 20 }, 0.8);
    mv(tl, layer.querySelector('[data-key="B"]'), T(3.4), { scale: 0.9, x: -20 }, 0.8);
  },
  // s14 杯子从左手交到右手
  s14(tl, layer, T, dur, t0) {
    const m = layer.querySelector('[data-key="M"]');
    mv(tl, m, T(1.6), { x: 190, y: 6, rotation: 8, duration: 1.4 }, 1.4);
    mv(tl, m, Math.min(T(4.4), t0 + dur - 0.8), { rotation: 0, y: 0 }, 0.6);
  },
  // s16 两卡对进让位，问号放大
  s16(tl, layer, T) {
    mv(tl, layer.querySelector('[data-key="C"]'), T(2.6), { scale: 1.15, yoyo: true, repeat: 1, duration: 0.6 }, 0.6);
  },
  // s18 沙漏翻转感 + ×1 → ×2 交叉淡化（seek 安全，禁回调）
  s18(tl, layer, T) {
    mv(tl, layer.querySelector('[data-key="A"]'), T(1.1), { scaleY: -1, duration: 0.55 }, 0.55);
    mv(tl, layer.querySelector('[data-key="A"]'), T(1.7), { scaleY: 1, duration: 0.55 }, 0.55);
    const texts = layer.querySelectorAll('[data-key="B"] text');
    if (texts.length >= 2) {
      tl.to(texts[0], { opacity: 0, duration: 0.35, ease: 'power1.inOut' }, T(2.6));
      tl.to(texts[1], { opacity: 1, duration: 0.35, ease: 'power1.inOut' }, T(2.6));
    }
  },
  // s19 两面板滑入对齐
  s19(tl, layer, T) {
    const p = layer.querySelector('[data-key="A"]');
    if (!p) return;
    mv(tl, p, T(1.2), { x: -18, duration: 0.5 }, 0.5);
    mv(tl, p, T(1.75), { x: 18, duration: 0.5 }, 0.5);
    mv(tl, p, T(2.3), { x: 0, duration: 0.5 }, 0.5);
  },
  // s20 杯子想走被弹回（放手代价的橡皮筋）
  s20(tl, layer, T) {
    const a = layer.querySelector('[data-key="A"]');
    mv(tl, a, T(1.0), { x: 80, duration: 0.55, ease: 'power2.out' }, 0.55);
    mv(tl, a, T(1.55), { x: 0, duration: 1.0, ease: 'elastic.out(1, 0.4)' }, 1.0);
  },
  // s24 齿轮慢转
  s24(tl, layer, T, dur, t0) {
    mv(tl, layer.querySelector('[data-key="A"]'), T(0.8), { rotation: 360, repeat: 2, duration: (dur - 2) / 3, ease: 'none' });
  },
  // s25 杯子居中 → 让位左 → 墙升起（unveil）→ 巧克力后到
  s25(tl, layer, T) {
    mv(tl, layer.querySelector('[data-key="A"]'), T(0.9), { x: -340 });
    const wallG = layer.querySelector('[data-key="W"]');
    const inner = wallG ? wallG.querySelector('g') : null;
    if (inner) tl.from(inner, { scaleY: 0.05, transformOrigin: '50% 100%', duration: 0.9, ease: 'power3.out' }, T(1.2));
  },
  // s26 巧克力居中 → 让位左 → 墙升起 → 杯子后到
  s26(tl, layer, T) {
    mv(tl, layer.querySelector('[data-key="A"]'), T(0.9), { x: -320 });
    const wallG = layer.querySelector('[data-key="W"]');
    const inner = wallG ? wallG.querySelector('g') : null;
    if (inner) tl.from(inner, { scaleY: 0.05, transformOrigin: '50% 100%', duration: 0.9, ease: 'power3.out' }, T(1.0));
  },
  // s27 五五开环形：两片自 12 点钟顺时针依次扫掠（大片先），中心与侧标签随后
  s27(tl, layer, T) {
    const g = layer.querySelector('[data-key="A"]');
    if (g) sweepDonut(tl, g, T(1.3), { each: 0.9 });
  },
  // s29 斜杠劈下
  s29(tl, layer, T) {
    const line = layer.querySelector('[data-key="A"] line');
    if (line) tl.from(line, { rotation: 46, transformOrigin: '50% 50%', duration: 0.4, ease: 'power4.in' }, T(1.4));
  },
  // s31 出价标签反复浮动（市场骚扰感）
  s31(tl, layer, T) {
    const b = layer.querySelector('[data-key="B"]');
    if (b) mv(tl, b, T(1.4), { y: -8, yoyo: true, repeat: 3, duration: 0.7 }, 0.7);
  },
  // s32 双柱生长 + 感情柱 pulse
  s32(tl, layer, T) {
    const g = layer.querySelector('[data-key="A"]');
    if (!g) return;
    const rects = g.querySelectorAll('rect');
    const texts = g.querySelectorAll('text');
    [rects[0], rects[1]].forEach((r, i) => {
      if (!r) return;
      const h0 = +r.getAttribute('height'), y0 = +r.getAttribute('y');
      tl.from(r, { attr: { height: 6, y: y0 + h0 - 6 }, duration: 1.1, ease: 'power2.out' }, T(1.0) + i * 0.5);
    });
    if (texts[0]) mv(tl, texts[0], T(2.6), { scale: 1.25, yoyo: true, repeat: 1, duration: 0.4, transformOrigin: '50% 80%' }, 0.4);
  },
  // s33 便宜票让位左，贵票后到右并放大压过便宜票（用户示例 verbatim）
  s33(tl, layer, T) {
    mv(tl, layer.querySelector('[data-key="A"]'), T(1.5), { x: -320, scale: 0.88 }, 1.0);
    mv(tl, layer.querySelector('[data-key="B"]'), T(3.2), { scale: 1.14 }, 0.8);
  },
  // s34 溢价柱状系列：零基线左→右错峰生长（back.out 过冲），标签随后落定（chart-method 规范）
  s34(tl, layer, T) {
    const g = layer.querySelector('[data-key="A"]');
    if (g) growBars(tl, g, T(1.2), { stagger: 0.18, dur: 0.9 });
  },
  // s37 走势图：坐标轴已在（框架先于数据），折线左→右描线 + 终点圆点压轴
  s37(tl, layer, T) {
    drawLine(tl, layer.querySelector('#refLine'), T(1.4), { dur: 2.4, endDot: layer.querySelector('#refEnd') });
  },
  // s36 舍不得放大、值得缩小（错误等式）
  s36(tl, layer, T) {
    mv(tl, layer.querySelector('[data-key="A"]'), T(2.4), { scale: 1.16 }, 0.8);
    mv(tl, layer.querySelector('[data-key="B"]'), T(2.4), { scale: 0.84 }, 0.8);
  },
  // s38 心从箱子里浮起，反复摇曳
  s38(tl, layer, T) {
    mv(tl, layer.querySelector('[data-key="H"]'), T(1.5), { y: -22, yoyo: true, repeat: 3, duration: 0.8 }, 0.8);
  },
  // s40 巨问号呼吸
  s40(tl, layer, T) {
    mv(tl, layer.querySelector('[data-key="A"]'), T(1.2), { scale: 1.07, yoyo: true, repeat: 3, duration: 1.1 }, 1.1);
  },
};

// 场景内二次运动（按 anim 键注册，storyboard 引用）
export const ILLU_ANIM = {
  tilt(tl, el, t) {
    const beam = el.querySelector('#lossBeam');
    if (beam) tl.to(beam, { rotation: 9, transformOrigin: '50% 8px', duration: 1.2, ease: 'power2.inOut' }, t + 0.4);
  },
  loop(tl, el, t) {
    const loop = el.querySelector('#refundLoop');
    if (loop) tl.to(loop, { rotation: 360, transformOrigin: '50% 50%', repeat: -1, duration: 6, ease: 'none' }, t);
  },
  draw(tl, el, t) {
    const line = el.querySelector('#refLine');
    if (line) {
      const len = line.getTotalLength ? line.getTotalLength() : 600;
      tl.fromTo(line, { strokeDasharray: len, strokeDashoffset: len }, { strokeDashoffset: 0, duration: 2.4, ease: 'power1.inOut' }, t + 0.3);
    }
  },
  fill(tl, el, t) {
    const f = el.querySelector('#expFill');
    if (f) tl.to(f, { attr: { width: 200 }, duration: 2.0, ease: 'power2.out' }, t + 0.5);
  },
};
