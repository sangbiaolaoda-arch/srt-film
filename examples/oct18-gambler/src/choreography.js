// choreography.js — 编排层（幕内叙事运动）+ 场景内二次运动（anim 键）
//
// 从 illustrations.js 拆出（v2.5，endowment-v2 → oct18-gambler 沿用同一纪律）：
// illustrations.js 只管构图，本文件只管运动。
// 研究依据：CHI 2021《Communicating with Motion》——
//   对比 = move aside（让位）+ 迟入场 + emphasize（放大主方/缩小弱方）
//   悬疑 = unveil / count / track；节奏 = 前一拍给后一拍让路
//
// ⚠ 防坑约定（docs/conventions.md #1/#2）：
//   1. GSAP 对 SVG 的 transformOrigin 像素值相对元素自身 bbox 左上角——
//      一律用 '50% 50%' 等百分比，禁用舞台坐标。
//   2. tl.seek() 默认抑制 onUpdate/onStart 回调——逐帧导出环境里
//      禁止用回调改文字/数字，一律用双文本交叉淡化或 attr 补间。

import { growBars } from './charts.js';

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

// 大数字砸场（s12/s14/s15/s26 共用：先放大压场，再 back.out 回稳）
function slam(tl, layer, T, key, at) {
  const el = layer.querySelector(`[data-key="${key}"]`);
  if (!el) return;
  mv(tl, el, T(at), { scale: 1.18, duration: 0.45 }, 0.45);
  mv(tl, el, T(at + 0.55), { scale: 1, duration: 0.6, ease: 'back.out(2)' }, 0.6);
}

export const CHOREO = {
  // s01 输光的人：主体落定后轻微呼吸
  s01(tl, layer, T) {
    mv(tl, layer.querySelector('[data-key="A"]'), T(1.6), { scale: 1.03, yoyo: true, repeat: 1, duration: 0.7 }, 0.7);
  },
  // s02 问号呼吸（分叉 + 手工文字）
  s02(tl, layer, T) {
    mv(tl, layer.querySelector('[data-key="B"]'), T(1.4), { scale: 1.1, yoyo: true, repeat: 1, duration: 0.6 }, 0.6);
  },
  // s03 面板先到，赌场戳压轴
  s03(tl, layer, T) {
    mv(tl, layer.querySelector('[data-key="A"]'), T(1.2), { scale: 1.06, duration: 0.5 }, 0.5);
  },
  // s05 亏卡让位左，金币与"拿回本"后到
  s05(tl, layer, T) {
    mv(tl, layer.querySelector('[data-key="A"]'), T(1.4), { x: -230, scale: 0.92 });
  },
  // s06/s17 轮盘缓转（章节卡的环境运动，球随盘走不穿帮）
  s06(tl, layer, T, dur) {
    mv(tl, layer.querySelector('g'), T(0.8), { rotation: 360, repeat: Math.max(1, Math.floor((dur - 2) / 6)), duration: 6, ease: 'none' });
  },
  // s07 轮盘缓转（局部）
  s07(tl, layer, T, dur) {
    mv(tl, layer.querySelector('[data-key="A"] g'), T(0.8), { rotation: 360, repeat: Math.max(1, Math.floor((dur - 2) / 6)), duration: 6, ease: 'none' });
  },
  // s09 骰子定住后大数字砸场
  s09(tl, layer, T) {
    slam(tl, layer, T, 'B', 1.6);
    mv(tl, layer.querySelector('[data-key="T"]'), T(2.4), { scale: 1.1, yoyo: true, repeat: 1, duration: 0.5 }, 0.5);
  },
  // s10 漏钱的人：金币下漏节拍（呼吸感）
  s10(tl, layer, T, dur) {
    mv(tl, layer.querySelector('[data-key="A"]'), T(1.2), { y: 6, yoyo: true, repeat: Math.max(1, 2 * Math.floor((dur - 2) / 2)), duration: 0.9, ease: 'sine.inOut' });
  },
  // s11 墙升起（unveil）→ 大筹码堆压轴
  s11(tl, layer, T) {
    const wallG = layer.querySelector('[data-key="C"]');
    const inner = wallG ? wallG.querySelector('g') : null;
    if (inner) tl.from(inner, { scaleY: 0.05, transformOrigin: '50% 100%', duration: 0.9, ease: 'power3.out' }, T(1.2));
    mv(tl, layer.querySelector('[data-key="D"]'), T(1.9), { scale: 1.12, duration: 0.5 }, 0.5);
  },
  // s12 大数字砸场
  s12(tl, layer, T) { slam(tl, layer, T, 'A', 1.3); },
  // s14 大数字砸场 + 金币 pulse
  s14(tl, layer, T) {
    slam(tl, layer, T, 'B', 1.5);
    mv(tl, layer.querySelector('[data-key="A"]'), T(2.4), { y: -12, yoyo: true, repeat: 1, duration: 0.5 }, 0.5);
  },
  // s15 大数字砸场
  s15(tl, layer, T) { slam(tl, layer, T, 'B', 1.5); },
  // s08 亏损双柱：零基线左→右错峰生长 + 标签落定（barSeries 文字初始 opacity=0，必须挂 growBars）
  s08(tl, layer, T) {
    const g = layer.querySelector('[data-key="A"]');
    if (g) growBars(tl, g, T(1.0), { stagger: 0.2, dur: 0.9 });
  },
  // s16 双柱零基线左→右错峰生长（chart-method 规范）
  s16(tl, layer, T) {
    const g = layer.querySelector('[data-key="A"]');
    if (g) growBars(tl, g, T(1.0), { stagger: 0.2, dur: 0.9 });
  },
  // s17 轮盘缓转（章节卡）
  s17(tl, layer, T, dur) {
    mv(tl, layer.querySelector('g'), T(0.8), { rotation: 360, repeat: Math.max(1, Math.floor((dur - 2) / 6)), duration: 6, ease: 'none' });
  },
  // s18 筹码堆先后立起（左边 3 层 → 右边 8 层，越押越大）
  s18(tl, layer, T) {
    mv(tl, layer.querySelector('[data-key="B"]'), T(1.6), { scale: 1.05, duration: 0.45 }, 0.45);
    mv(tl, layer.querySelector('[data-key="C"]'), T(2.3), { scale: 1.1, duration: 0.55 }, 0.55);
  },
  // s19 轮盘缓转 + 揭示句随后
  s19(tl, layer, T, dur) {
    mv(tl, layer.querySelector('[data-key="A"] g'), T(0.8), { rotation: 360, repeat: Math.max(1, Math.floor((dur - 2) / 6)), duration: 6, ease: 'none' });
  },
  // s20 手掌下压循环（按住感）
  s20(tl, layer, T, dur) {
    mv(tl, layer.querySelector('[data-key="B"]'), T(1.2), { y: 10, yoyo: true, repeat: Math.max(1, 2 * Math.floor((dur - 2) / 1.6)), duration: 0.8, ease: 'sine.inOut' });
  },
  // s21 脑亮区呼吸（章节卡）
  s21(tl, layer, T, dur) {
    mv(tl, layer.querySelector('[data-key="A"]'), T(1.0), { scale: 1.03, yoyo: true, repeat: Math.max(1, 2 * Math.floor((dur - 2) / 2.4)), duration: 1.2, ease: 'sine.inOut' });
  },
  // s22 老虎机卡住的第三格：整机轻晃（卡壳感）
  s22(tl, layer, T) {
    mv(tl, layer.querySelector('[data-key="A"]'), T(1.0), { rotation: 1.6, yoyo: true, repeat: 3, duration: 0.28 }, 0.28);
  },
  // s23 脑亮区呼吸 + ≈ 徽章 pulse
  s23(tl, layer, T) {
    mv(tl, layer.querySelector('[data-key="A"]'), T(1.0), { scale: 1.04, yoyo: true, repeat: 3, duration: 1.0, ease: 'sine.inOut' });
    slam(tl, layer, T, 'B', 1.6);
  },
  // s24 卡壳轻晃（差一点的手感）
  s24(tl, layer, T) {
    mv(tl, layer.querySelector('[data-key="A"]'), T(1.2), { rotation: 1.4, yoyo: true, repeat: 5, duration: 0.3 }, 0.3);
  },
  // s26 大数字砸场
  s26(tl, layer, T) { slam(tl, layer, T, 'B', 1.6); },
  // s27 回本 pill 放大压过"赢"（emphasize 主方）
  s27(tl, layer, T) {
    mv(tl, layer.querySelector('[data-key="B"]'), T(2.2), { scale: 1.16, duration: 0.6 }, 0.6);
    mv(tl, layer.querySelector('[data-key="C"]'), T(2.2), { scale: 0.9, duration: 0.6 }, 0.6);
  },
  // s28 无头轨道箭头往复（回本没有尽头）
  s28(tl, layer, T, dur) {
    mv(tl, layer.querySelector('[data-key="A"]'), T(1.4), { x: 14, yoyo: true, repeat: Math.max(1, 2 * Math.floor((dur - 2) / 1.8)), duration: 0.9, ease: 'sine.inOut' });
  },
  // s29 锁箱定住后揭示句
  s29(tl, layer, T) {
    mv(tl, layer.querySelector('[data-key="A"]'), T(1.0), { scale: 1.05, yoyo: true, repeat: 1, duration: 0.5 }, 0.5);
  },
  // s30 气泡轻浮
  s30(tl, layer, T) {
    mv(tl, layer.querySelector('[data-key="B"]'), T(1.8), { y: -8, yoyo: true, repeat: 3, duration: 0.8 }, 0.8);
  },
  // s33 巨问号呼吸（收场）
  s33(tl, layer, T) {
    mv(tl, layer.querySelector('[data-key="A"]'), T(1.2), { scale: 1.07, yoyo: true, repeat: 3, duration: 1.1 }, 1.1);
  },
};

// 场景内二次运动（按 anim 键注册，storyboard 引用；oct18 暂未用 anim 键，保留扩展位）
export const ILLU_ANIM = {};
